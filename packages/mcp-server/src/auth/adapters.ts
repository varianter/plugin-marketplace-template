import type { JWTPayload } from 'jose';

export type AuthProviderKind =
  | 'generic-oidc'
  | 'oidc'
  | 'entra'
  | 'auth0'
  | 'okta'
  | 'keycloak'
  | 'cognito'
  | 'zitadel';

export interface ProviderAdapterConfig {
  clientId: string;
  audience?: string;
  scopeAliases: string[];
}

export interface ProviderAdapter {
  readonly kind: AuthProviderKind;
  acceptedIssuers(discoveredIssuer: string): string[];
  acceptedAudiences(cfg: ProviderAdapterConfig): string[];
  normalizeAuthorizeParams(params: URLSearchParams, cfg: ProviderAdapterConfig): void;
  normalizeTokenParams(params: URLSearchParams, cfg: ProviderAdapterConfig): void;
  assertAccessToken(claims: JWTPayload): void;
}

export function createProviderAdapter(kind: AuthProviderKind): ProviderAdapter {
  return kind === 'entra' ? new EntraAdapter() : new GenericOidcAdapter(kind);
}

class GenericOidcAdapter implements ProviderAdapter {
  constructor(readonly kind: AuthProviderKind) {}

  acceptedIssuers(discoveredIssuer: string): string[] {
    return [discoveredIssuer];
  }

  acceptedAudiences(cfg: ProviderAdapterConfig): string[] {
    return [cfg.audience || cfg.clientId];
  }

  normalizeAuthorizeParams(_params: URLSearchParams, _cfg: ProviderAdapterConfig): void {}

  normalizeTokenParams(_params: URLSearchParams, _cfg: ProviderAdapterConfig): void {}

  assertAccessToken(claims: JWTPayload): void {
    if (claims.nonce && !claims.scope && !claims.scp && !claims.roles) {
      throw new Error('token looks like an ID token, not an access token');
    }
  }
}

class EntraAdapter implements ProviderAdapter {
  readonly kind = 'entra' as const;

  acceptedIssuers(discoveredIssuer: string): string[] {
    const issuerUrl = new URL(discoveredIssuer);
    const tenantId = issuerUrl.pathname.split('/').filter(Boolean)[0];
    return tenantId
      ? [discoveredIssuer, `https://sts.windows.net/${tenantId}/`]
      : [discoveredIssuer];
  }

  acceptedAudiences(cfg: ProviderAdapterConfig): string[] {
    const audience = cfg.audience || cfg.clientId;
    return [...new Set([audience, cfg.clientId, `api://${cfg.clientId}`])];
  }

  normalizeAuthorizeParams(params: URLSearchParams, cfg: ProviderAdapterConfig): void {
    this.normalizeEntraParams(params, cfg);
  }

  normalizeTokenParams(params: URLSearchParams, cfg: ProviderAdapterConfig): void {
    this.normalizeEntraParams(params, cfg);
  }

  assertAccessToken(claims: JWTPayload): void {
    if (!claims.scp && !claims.roles) {
      throw new Error('token is missing Entra access-token claims (scp or roles)');
    }
    if (claims.nonce && !claims.scope && !claims.scp && !claims.roles) {
      throw new Error('token looks like an ID token, not an access token');
    }
  }

  private normalizeEntraParams(params: URLSearchParams, cfg: ProviderAdapterConfig): void {
    params.delete('resource');
    const rawScope = params.get('scope');
    if (!rawScope) return;

    const defaultScope = `${cfg.clientId}/.default`;
    const aliasSet = new Set(cfg.scopeAliases);
    const apiPrefix = `api://${cfg.clientId}/`;

    params.set(
      'scope',
      rawScope
        .split(' ')
        .map((scope) => {
          if (scope === defaultScope || scope === `api://${cfg.clientId}/.default`)
            return defaultScope;
          if (
            aliasSet.has(scope) ||
            (scope.startsWith(apiPrefix) && aliasSet.has(scope.slice(apiPrefix.length)))
          )
            return defaultScope;
          return scope;
        })
        .join(' '),
    );
  }
}
