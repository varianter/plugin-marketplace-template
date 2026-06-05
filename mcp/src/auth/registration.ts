import { z } from 'zod';

// Trusted origins for OAuth redirect URIs.
// Both localhost and 127.0.0.1 are loopback — MCP SDK uses 127.0.0.1 for its callback.
const ALLOWED_ORIGINS = [
  /^http:\/\/localhost(:\d+)?\//,
  /^http:\/\/127\.0\.0\.1(:\d+)?\//,
  /^https:\/\/claude\.ai\//,
];

const RegistrationRequestSchema = z.object({
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string()),
  response_types: z.array(z.string()).optional(),
  grant_types: z.array(z.string()).optional(),
});

export class RegistrationError extends Error {
  constructor(
    public readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'RegistrationError';
  }
}

/**
 * RFC 7591 dynamic client registration stub.
 * Entra ID doesn't support dynamic registration, so we return the pre-configured
 * AZURE_CLIENT_ID as the client_id for every registration request.
 * Claude.ai uses this fixed client_id when starting the Entra OAuth flow.
 */
export function handleRegistration(body: unknown, clientId: string): Record<string, unknown> {
  const req = RegistrationRequestSchema.parse(body);

  for (const uri of req.redirect_uris) {
    if (!ALLOWED_ORIGINS.some((re) => re.test(uri))) {
      throw new RegistrationError('invalid_redirect_uri', `redirect_uri not allowed: ${uri}`);
    }
  }

  return {
    client_id: clientId,
    client_name: req.client_name ?? 'Claude.ai',
    redirect_uris: req.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}
