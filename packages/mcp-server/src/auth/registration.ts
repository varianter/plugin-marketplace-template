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

  const allowed = allowedOrigins.map(parseAllowedOrigin);
  for (const uri of req.redirect_uris) {
    if (!isAllowedRedirectUri(uri, allowed)) {
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

interface AllowedOrigin {
  protocol: string;
  hostname: string;
  port: string;
  origin: string;
  allowAnyLoopbackPort: boolean;
}

function isAllowedRedirectUri(uri: string, allowed: AllowedOrigin[]): boolean {
  let redirect: URL;
  try {
    redirect = new URL(uri);
  } catch {
    throw new RegistrationError('invalid_redirect_uri', `redirect_uri is not a valid URL: ${uri}`);
  }

  return allowed.some((origin) => {
    if (redirect.origin === origin.origin) return true;
    return (
      origin.allowAnyLoopbackPort &&
      redirect.protocol === origin.protocol &&
      redirect.hostname === origin.hostname
    );
  });
}

function parseAllowedOrigin(origin: string): AllowedOrigin {
  try {
    const url = new URL(origin);
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      origin: url.origin,
      allowAnyLoopbackPort: !url.port && isLoopbackHost(url.hostname),
    };
  } catch {
    throw new RegistrationError(
      'invalid_redirect_uri',
      `allowed origin is not a valid URL: ${origin}`,
    );
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
