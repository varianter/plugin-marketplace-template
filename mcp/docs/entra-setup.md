# Microsoft Entra ID — OAuth Setup

This guide explains how to configure an Entra ID app registration for MCP server authentication
via the compatibility proxy (`AUTH_COMPATIBILITY_PROXY=true`, the default for `AUTH_PROVIDER=entra`).

## App registration

1. Go to **Azure Portal → Microsoft Entra ID → App registrations → New registration**.
2. Name it (e.g. `my-mcp-server`), select **Single tenant** (or multi-tenant if needed).
3. Under **Authentication**, add a platform — select **Web** and add the redirect URIs for your MCP clients:
   - Local dev: `http://localhost:3000/oauth/callback` (or whichever port your MCP client uses)
   - Claude.ai: `https://claude.ai/api/mcp/auth_callback`
4. Enable **Allow public client flows** if your MCP client uses PKCE without a client secret.

## Configure an OAuth scope

1. Go to **Expose an API → Add a scope**.
2. Set **Application ID URI** to `api://<client-id>` (Entra will suggest this).
3. Add a scope — e.g. `claudeai`. Note this value for `AUTH_SCOPE_ALIASES` below.

## Key values

After registration, record:

| Setting | Where to find it |
|---------|-----------------|
| **Client ID** | App registration → Overview → Application (client) ID |
| **Tenant ID** | App registration → Overview → Directory (tenant) ID |
| **Client secret** | App registration → Certificates & secrets → New client secret (leave blank for public client) |

## Environment variables

```env
AUTH_PROVIDER=entra
AUTH_ISSUER_URL=https://login.microsoftonline.com/<tenant-id>/v2.0
AUTH_CLIENT_ID=<client-id>
# AUTH_CLIENT_SECRET=<secret>   # omit for public client / PKCE
AUTH_SCOPES=openid <client-id>/.default offline_access
AUTH_COMPATIBILITY_PROXY=true

# If you created a custom scope (e.g. "claudeai"), add it here so the proxy rewrites it:
AUTH_SCOPE_ALIASES=claudeai
```

## How the auth flow works

```
MCP client              MCP server              Entra ID
    |                       |                      |
    |-- GET /.well-known/ ->|                      |
    |<-- { authorization_endpoint, scopes } -------|
    |                       |                      |
    |-- POST /register ---->|                      |
    |<-- { client_id } -----|                      |
    |                       |                      |
    | (open browser)        |                      |
    |-- GET /authorize? --->|                      |
    |   (scope normalised)  |-- redirect --------->|
    |<-- auth code ---------|<-- redirect ----------|
    |                       |                      |
    |-- POST /token ------->|                      |
    |   (params proxied)    |-- POST /token ------->|
    |<-- { access_token } --|<-- { access_token } --|
    |                       |                      |
    |-- POST /mcp Bearer -->|                      |
    |                       |-- verifyToken ------->|
    |<-- MCP response ------|                      |
```

When using the compatibility proxy, the MCP server acts as a transparent OAuth relay:
`/authorize` normalises scopes and redirects to Entra, `/token` proxies the exchange,
and `/register` returns the pre-configured `AUTH_CLIENT_ID`.

The access token is verified locally via JWKS — no additional Entra round-trip per request.

## Scope normalisation

Entra rejects certain scope forms that MCP clients may send. The compatibility proxy automatically
rewrites these before forwarding:

| Incoming scope | Rewritten to |
|---------------|-------------|
| `<client-id>/.default` | `<client-id>/.default` (unchanged) |
| `api://<client-id>/.default` | `<client-id>/.default` |
| Any value in `AUTH_SCOPE_ALIASES` (e.g. `claudeai`) | `<client-id>/.default` |
| `api://<client-id>/<alias>` (e.g. `api://.../claudeai`) | `<client-id>/.default` |
