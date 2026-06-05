import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Config } from '../config/config.js';
import type { ServerMetadata } from '../config/metadata.js';
import { log } from '../log.js';
import type { OAuthProvider } from './provider.js';
import { handleRegistration, RegistrationError } from './registration.js';

const MAX_TOKEN_BODY_BYTES = '64kb';

export function createAuthRouter(
  cfg: Config,
  provider: OAuthProvider,
  metadata: ServerMetadata,
): express.Router {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: cfg.rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const oauthMetadata = provider.oauthMetadata();

  router.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl: provider.resourceServerUrl,
      scopesSupported: provider.scopes,
      resourceName: metadata.title,
    }),
  );

  // Lenient alias for older/less strict clients; the SDK route serves the path-specific URL.
  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: provider.resourceServerUrl.href,
      authorization_servers: [oauthMetadata.issuer],
      scopes_supported: provider.scopes,
      bearer_methods_supported: ['header'],
      resource_name: metadata.title,
    });
  });

  // Some MCP/OIDC clients also look for OpenID Provider Configuration on the advertised issuer.
  router.get('/.well-known/openid-configuration', (_req, res) => {
    res.json({
      ...oauthMetadata,
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  });

  if (cfg.auth.clientRegistration === 'static') {
    router.post('/register', limiter, express.json({ limit: MAX_TOKEN_BODY_BYTES }), (req, res) => {
      try {
        res
          .status(201)
          .json(handleRegistration(req.body, provider.clientId, cfg.allowedRedirectOrigins));
      } catch (err) {
        if (err instanceof RegistrationError) {
          res.status(400).json({ error: err.code, error_description: err.message });
        } else {
          res.status(400).json({ error: 'invalid_client_metadata' });
        }
      }
    });
  }

  if (!cfg.auth.compatibilityProxy) return router;

  router.get('/authorize', limiter, (req, res) => {
    const incoming = new URL(req.originalUrl, cfg.publicUrl);
    const upstream = provider.normalizeAuthorizeUrl(incoming);
    log('info', 'authorize redirect', {
      provider: cfg.auth.provider,
      redirect_uri: upstream.searchParams.get('redirect_uri'),
      scope: upstream.searchParams.get('scope'),
    });
    res.redirect(302, upstream.toString());
  });

  router.post(
    '/token',
    limiter,
    express.urlencoded({ extended: false, limit: MAX_TOKEN_BODY_BYTES }),
    async (req, res) => {
      const params = provider.normalizeTokenParams(
        new URLSearchParams(req.body as Record<string, string>),
      );
      let upstream = await postToken(provider.tokenEndpoint, params);
      let body = await upstream.text();

      if (shouldRetryEntraPublicClient(cfg, upstream.status, params, body)) {
        params.delete('client_secret');
        upstream = await postToken(provider.tokenEndpoint, params);
        body = await upstream.text();
      }

      res
        .status(upstream.status)
        .type(upstream.headers.get('content-type') ?? 'application/json')
        .send(body);
    },
  );

  return router;
}

export function bearerResourceMetadataUrl(provider: OAuthProvider): string {
  return getOAuthProtectedResourceMetadataUrl(provider.resourceServerUrl);
}

function postToken(tokenEndpoint: string, params: URLSearchParams): Promise<Response> {
  return fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

function shouldRetryEntraPublicClient(
  cfg: Config,
  status: number,
  params: URLSearchParams,
  body: string,
): boolean {
  if (cfg.auth.provider !== 'entra' || status !== 401 || !params.has('client_secret')) return false;
  try {
    const error = JSON.parse(body) as { error_description?: string };
    return error.error_description?.includes('AADSTS700025') ?? false;
  } catch {
    return false;
  }
}
