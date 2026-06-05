import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';
import * as client from 'openid-client';

export interface UserIdentity {
  /** Stable provider-scoped user id. Prefer this over email for authorization decisions. */
  id: string;
  /** Display/contact email or UPN when present. */
  email?: string;
  name?: string;
}

export interface VerifiedToken extends AuthInfo {
  identity: UserIdentity;
  claims: JWTPayload;
}

export interface OAuthProviderConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  audience?: string;
  scopes: string[];
  /**
   * Extra scope names that should be rewritten to `{clientId}/.default` in the Entra
   * compatibility proxy. For example, `['claudeai']` rewrites both `claudeai` and
   * `api://{clientId}/claudeai` → `{clientId}/.default`.
   * Only used when `providerKind === 'entra'`.
   */
  scopeAliases: string[];
  publicUrl: string;
  mcpPath: string;
  providerKind: 'oidc' | 'entra';
  compatibilityProxy: boolean;
}

export class OAuthProvider {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly metadata: client.ServerMetadata;

  private constructor(
    private readonly cfg: OAuthProviderConfig,
    discovered: client.Configuration,
  ) {
    this.metadata = discovered.serverMetadata();
    this.issuer = this.metadata.issuer;
    if (!this.metadata.jwks_uri) throw new Error('OAuth provider metadata is missing jwks_uri');
    this.jwks = createRemoteJWKSet(new URL(this.metadata.jwks_uri));
  }

  static async create(cfg: OAuthProviderConfig): Promise<OAuthProvider> {
    const discovered = await client.discovery(
      new URL(cfg.issuerUrl),
      cfg.clientId,
      cfg.clientSecret ? { client_secret: cfg.clientSecret } : undefined,
    );
    return new OAuthProvider(cfg, discovered);
  }

  get clientId(): string {
    return this.cfg.clientId;
  }

  get clientSecret(): string | undefined {
    return this.cfg.clientSecret;
  }

  get issuerUrl(): string {
    return this.issuer;
  }

  get authorizationEndpoint(): string {
    if (!this.metadata.authorization_endpoint) {
      throw new Error('OAuth provider metadata is missing authorization_endpoint');
    }
    return this.metadata.authorization_endpoint;
  }

  get tokenEndpoint(): string {
    if (!this.metadata.token_endpoint)
      throw new Error('OAuth provider metadata is missing token_endpoint');
    return this.metadata.token_endpoint;
  }

  get scopes(): string[] {
    return this.cfg.scopes;
  }

  get resourceServerUrl(): URL {
    return new URL(this.cfg.mcpPath, this.cfg.publicUrl);
  }

  /** Metadata advertised to MCP clients. Uses the real provider by default; Entra can use local compatibility endpoints for Claude. */
  oauthMetadata(): OAuthMetadata {
    if (!this.cfg.compatibilityProxy) {
      return {
        issuer: this.metadata.issuer,
        authorization_endpoint: this.authorizationEndpoint,
        token_endpoint: this.tokenEndpoint,
        registration_endpoint: this.metadata.registration_endpoint,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
        code_challenge_methods_supported: this.metadata.code_challenge_methods_supported ?? [
          'S256',
        ],
        scopes_supported: this.cfg.scopes,
      };
    }

    return {
      issuer: this.cfg.publicUrl,
      authorization_endpoint: `${this.cfg.publicUrl}/authorize`,
      token_endpoint: `${this.cfg.publicUrl}/token`,
      registration_endpoint: `${this.cfg.publicUrl}/register`,
      jwks_uri: this.metadata.jwks_uri,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: this.cfg.scopes,
    };
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.acceptedIssuers(),
        audience: this.acceptedAudiences(),
      });

      this.assertAccessToken(payload);

      const scopes = extractScopes(payload);
      return {
        token,
        clientId: typeof payload.client_id === 'string' ? payload.client_id : this.cfg.clientId,
        scopes,
        expiresAt: payload.exp,
        identity: extractIdentity(payload),
        claims: payload,
      };
    } catch (err) {
      throw new InvalidTokenError(err instanceof Error ? err.message : 'invalid access token');
    }
  }

  normalizeAuthorizeUrl(incoming: URL): URL {
    const upstream = new URL(this.authorizationEndpoint);
    incoming.searchParams.delete('resource');
    this.normalizeScopes(incoming.searchParams);
    for (const [k, v] of incoming.searchParams) upstream.searchParams.set(k, v);
    return upstream;
  }

  normalizeTokenParams(params: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(params);
    next.delete('resource');
    if (!next.has('client_id')) next.set('client_id', this.cfg.clientId);
    if (this.cfg.clientSecret && !next.has('client_secret'))
      next.set('client_secret', this.cfg.clientSecret);
    this.normalizeScopes(next);
    return next;
  }

  private normalizeScopes(params: URLSearchParams): void {
    if (this.cfg.providerKind !== 'entra') return;
    const rawScope = params.get('scope');
    if (!rawScope) return;

    // Entra rejects resource indicators and some api:// scope forms.
    // Standard patterns ({clientId}/.default, api://{clientId}/.default) are always normalised.
    // Additional aliases (e.g. 'claudeai') are configured via AUTH_SCOPE_ALIASES.
    const defaultScope = `${this.cfg.clientId}/.default`;
    const aliasSet = new Set(this.cfg.scopeAliases);
    const apiPrefix = `api://${this.cfg.clientId}/`;

    params.set(
      'scope',
      rawScope
        .split(' ')
        .map((scope) => {
          if (scope === defaultScope || scope === `api://${this.cfg.clientId}/.default`)
            return defaultScope;
          if (aliasSet.has(scope) || (scope.startsWith(apiPrefix) && aliasSet.has(scope.slice(apiPrefix.length))))
            return defaultScope;
          return scope;
        })
        .join(' '),
    );
  }

  private acceptedAudiences(): string[] {
    const audience = this.cfg.audience || this.cfg.clientId;
    const audiences = new Set([audience]);
    if (this.cfg.providerKind === 'entra') {
      audiences.add(this.cfg.clientId);
      audiences.add(`api://${this.cfg.clientId}`);
    }
    return [...audiences];
  }

  private acceptedIssuers(): string[] {
    if (this.cfg.providerKind !== 'entra') return [this.issuer];
    const issuerUrl = new URL(this.issuer);
    const tenantId = issuerUrl.pathname.split('/').filter(Boolean)[0];
    return tenantId ? [this.issuer, `https://sts.windows.net/${tenantId}/`] : [this.issuer];
  }

  private assertAccessToken(claims: JWTPayload): void {
    if (this.cfg.providerKind === 'entra' && !claims.scp && !claims.roles) {
      throw new Error('token is missing Entra access-token claims (scp or roles)');
    }
    if (claims.nonce && !claims.scope && !claims.scp && !claims.roles) {
      throw new Error('token looks like an ID token, not an access token');
    }
  }
}

function extractIdentity(claims: JWTPayload): UserIdentity {
  if (!claims.iss || !claims.sub) throw new Error('token missing iss or sub');
  return {
    id: `${claims.iss}#${claims.sub}`,
    email:
      stringClaim(claims.email) ??
      stringClaim(claims.preferred_username) ??
      stringClaim(claims.upn),
    name: stringClaim(claims.name),
  };
}

function extractScopes(claims: JWTPayload): string[] {
  const scopes = new Set<string>();
  for (const value of [claims.scope, claims.scp]) {
    if (typeof value === 'string') for (const scope of value.split(' ')) scopes.add(scope);
  }
  if (Array.isArray(claims.roles)) {
    for (const role of claims.roles) if (typeof role === 'string') scopes.add(role);
  }
  return [...scopes].filter(Boolean);
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
