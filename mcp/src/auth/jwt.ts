import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';

export interface EntraClaims extends JWTPayload {
  email?: string;
  preferred_username?: string;
  name?: string;
}

// Cached JWKS fetcher — lazily created per tenant, reused across requests.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(tenantId: string): ReturnType<typeof createRemoteJWKSet> {
  let jwks = jwksCache.get(tenantId);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
    jwksCache.set(tenantId, jwks);
  }
  return jwks;
}

// Accepts both v1.0 (sts.windows.net) and v2.0 (login.microsoftonline.com) tokens.
export async function verifyEntraToken(
  token: string,
  tenantId: string,
  clientId: string,
): Promise<EntraClaims> {
  // Entra issues aud=<clientId> when resource=<clientId> is used (v1-style),
  // and aud=api://<clientId> when fully-qualified scopes are used (v2-style).
  // Accept both so either flow works.
  const { payload } = await jwtVerify(token, getJwks(tenantId), {
    audience: [clientId, `api://${clientId}`],
    issuer: [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ],
  });
  return payload as EntraClaims;
}
