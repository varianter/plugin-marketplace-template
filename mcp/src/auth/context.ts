import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  email: string;
  name?: string;
  /** Raw Bearer token — use for on-behalf-of API calls to Entra-protected services. */
  token: string;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/** Returns the authenticated user context for the current HTTP request, or undefined if auth is disabled. */
export function getRequestContext(): RequestContext | undefined {
  return store.getStore();
}
