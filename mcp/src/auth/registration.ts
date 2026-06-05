import { z } from 'zod';

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
 * Returns the pre-configured clientId for every registration request (used when the upstream
 * OAuth provider, e.g. Entra ID, does not support dynamic registration itself).
 */
export function handleRegistration(
  body: unknown,
  clientId: string,
  allowedOrigins: string[],
): Record<string, unknown> {
  const req = RegistrationRequestSchema.parse(body);

  for (const uri of req.redirect_uris) {
    if (!allowedOrigins.some((origin) => uri.startsWith(origin))) {
      throw new RegistrationError('invalid_redirect_uri', `redirect_uri not allowed: ${uri}`);
    }
  }

  return {
    client_id: clientId,
    client_name: req.client_name ?? 'MCP Client',
    redirect_uris: req.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}
