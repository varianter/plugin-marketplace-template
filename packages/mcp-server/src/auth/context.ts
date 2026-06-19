import { AsyncLocalStorage } from 'node:async_hooks';
import type { JWTPayload } from 'jose';

export interface RequestContext {
  /** Stable provider-scoped user id: `${issuer}#${subject}`. */
  userId: string;
  email?: string;
  name?: string;
  scopes: string[];
  claims: JWTPayload;
  /** Raw Bearer token — use only for APIs that accept this exact audience. */
  token: string;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

/** Returns the authenticated user context for the current HTTP request, or undefined if auth is disabled. */
export function getRequestContext(): RequestContext | undefined {
  return store.getStore();
}
