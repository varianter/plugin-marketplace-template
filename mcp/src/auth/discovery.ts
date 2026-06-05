export interface WellKnownParams {
  tenantId: string;
  clientId: string;
  baseUrl: string;
}

function buildScopes(clientId: string): string[] {
  return ['openid', `${clientId}/.default`, 'offline_access'];
}

// RFC 8414 OAuth Authorization Server Metadata.
// authorization_endpoint and token_endpoint point at our own proxy routes (/authorize,
// /token) rather than Entra directly. The proxy strips the `resource` parameter (RFC 8707)
// and normalizes all scope variants to <clientId>/.default — the GUID-based form that Entra
// requires for self-referencing apps (AADSTS90009 rejects the api:// URI form; AADSTS65005
// rejects named scopes that aren't provisioned). Tokens are still issued and validated by
// Entra; the proxy is transparent to the client.
function buildAuthServerMetadata({ tenantId, clientId, baseUrl }: WellKnownParams) {
  const entra = `https://login.microsoftonline.com/${tenantId}`;
  return {
    // Use our own baseUrl as issuer so clients that do OIDC issuer-discovery
    // (fetching ${issuer}/.well-known/openid-configuration) hit our proxy endpoints
    // instead of Entra's real authorization_endpoint, which would bypass scope rewriting.
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    jwks_uri: `${entra}/discovery/v2.0/keys`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: buildScopes(clientId),
  };
}

// RFC 9728 OAuth Protected Resource Metadata.
// resource matches the MCP server's origin so the SDK's cross-origin check passes.
// The SDK then adds resource=<baseUrl> to OAuth requests — our /authorize proxy strips it.
function buildProtectedResourceMetadata({ clientId, baseUrl }: WellKnownParams) {
  return {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: buildScopes(clientId),
  };
}

const HANDLERS: Record<string, (p: WellKnownParams) => Record<string, unknown>> = {
  '/.well-known/oauth-authorization-server': buildAuthServerMetadata,
  '/.well-known/openid-configuration': buildAuthServerMetadata,
  '/.well-known/oauth-protected-resource': buildProtectedResourceMetadata,
};

/** Returns metadata for the given well-known path, or null if the path is not recognised. */
export function getWellKnownMetadata(
  path: string,
  params: WellKnownParams,
): Record<string, unknown> | null {
  // RFC 9728 §3: metadata URL may have a resource path appended after the well-known segment,
  // e.g. /.well-known/oauth-protected-resource/mcp — strip it before lookup.
  const base = path.replace(/^(\/.well-known\/[^/?]+).*/, '$1');
  return HANDLERS[base]?.(params) ?? null;
}
