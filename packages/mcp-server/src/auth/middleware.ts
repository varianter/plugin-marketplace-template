import type { NextFunction, Request, Response } from 'express';
import { type RequestContext, runWithContext } from './context.js';
import type { VerifiedToken } from './provider.js';

export function attachRequestContext(req: Request, _res: Response, next: NextFunction): void {
  // req.auth is typed as AuthInfo by the MCP SDK — cast to VerifiedToken since our verifier
  // (OAuthProvider.verifyAccessToken) always returns this richer type.
  const auth = req.auth as VerifiedToken | undefined;
  if (!auth) {
    next();
    return;
  }

  const ctx: RequestContext = {
    userId: auth.identity.id,
    email: auth.identity.email,
    name: auth.identity.name,
    scopes: auth.scopes,
    claims: auth.claims,
    token: auth.token,
  };

  runWithContext(ctx, next);
}
