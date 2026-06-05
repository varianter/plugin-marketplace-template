import type { EntraClaims } from './jwt.js';

export interface UserIdentity {
  /** Primary email/UPN — use this as the stable user identifier */
  email: string;
  name?: string;
}

export function extractIdentity(claims: EntraClaims): UserIdentity {
  // Entra ID access tokens include `email` when the optional claim is configured,
  // and always include `preferred_username` (UPN). Fall back through both.
  const email = claims.email ?? claims.preferred_username;
  if (!email) {
    throw new Error('token missing email and preferred_username claims');
  }
  return { email, name: claims.name };
}
