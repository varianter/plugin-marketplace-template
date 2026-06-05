import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';
import * as client from 'openid-client';
import { type AuthProviderKind, createProviderAdapter, type ProviderAdapter } from './adapters.js';

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
  acceptedAudiences: string[];
  acceptedIssuers: string[];
  scopes: string[];
  /** Extra scope names to rewrite to `{clientId}/.default` (Entra compatibility proxy only). */
  scopeAliases: string[];
  publicUrl: string;
  mcpPath: string;
  providerKind: AuthProviderKind;
  /** Last-resort local /authorize and /token adapter for clients/providers that are not directly compatible. */
  compatibilityProxy: boolean;
  /** How to advertise client registration. `static` exposes local /register returning AUTH_CLIENT_ID. */
  clientRegistration: 'none' | 'provider' | 'static';
}

export class OAuthProvider {
  private readonly adapter: ProviderAdapter;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly metadata: client.ServerMetadata;

  private constructor(
    private readonly cfg: OAuthProviderConfig,
    discovered: client.Configuration,
  ) {
    this.adapter = createProviderAdapter(cfg.providerKind);
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

  /** Metadata advertised to MCP clients. Direct mode points at the real provider; compatibility mode points at local adapter endpoints. */
  oauthMetadata(): OAuthMetadata {
    const registrationEndpoint = this.registrationEndpoint();

    if (!this.cfg.compatibilityProxy) {
      return {
        issuer: this.metadata.issuer,
        authorization_endpoint: this.authorizationEndpoint,
        token_endpoint: this.tokenEndpoint,
        registration_endpoint: registrationEndpoint,
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
      registration_endpoint: registrationEndpoint,
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

      this.adapter.assertAccessToken(payload);

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
    const params = new URLSearchParams(incoming.searchParams);
    this.adapter.normalizeAuthorizeParams(params, this.adapterConfig());
    for (const [k, v] of params) upstream.searchParams.set(k, v);
    return upstream;
  }

  normalizeTokenParams(params: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(params);
    if (!next.has('client_id')) next.set('client_id', this.cfg.clientId);
    if (this.cfg.clientSecret && !next.has('client_secret'))
      next.set('client_secret', this.cfg.clientSecret);
    this.adapter.normalizeTokenParams(next, this.adapterConfig());
    return next;
  }

  private registrationEndpoint(): string | undefined {
    if (this.cfg.clientRegistration === 'static') return `${this.cfg.publicUrl}/register`;
    if (this.cfg.clientRegistration === 'provider') return this.metadata.registration_endpoint;
    return undefined;
  }

  private adapterConfig() {
    return {
      clientId: this.cfg.clientId,
      audience: this.cfg.audience,
      scopeAliases: this.cfg.scopeAliases,
    };
  }

  private acceptedAudiences(): string[] {
    return [
      ...new Set([
        ...this.adapter.acceptedAudiences(this.adapterConfig()),
        ...this.cfg.acceptedAudiences,
      ]),
    ];
  }

  private acceptedIssuers(): string[] {
    return [
      ...new Set([...this.adapter.acceptedIssuers(this.issuer), ...this.cfg.acceptedIssuers]),
    ];
  }
}

function extractIdentity(claims: JWTPayload): UserIdentity {
  if (!claims.iss || !claims.sub) throw new Error('token missing iss or sub');
  return {
    id: `${claims.iss}#${claims.sub}`,
    email:
      stringClaim(claims.email) ??
      stringClaim(claims.preferred_username) ??
      stringClaim(claims.upn) ??
      stringClaim(claims.username),
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
