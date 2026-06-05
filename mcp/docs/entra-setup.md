# Azure Entra ID — OAuth Setup

The Entra ID app registration (`mcp-gateway-prod`) is managed as code in the
[infrastructure-as-code](https://github.com/varianter/infrastructure-as-code) repo at
`environments/prod/cluster/mcp-oauth.tf`. **Do not create a new app registration.**

## Key values

| Property | Value |
|----------|-------|
| App name | `mcp-gateway-prod` |
| Client ID | `7e6a0973-ab32-4912-a497-965fc4544f89` |
| Tenant ID | `0f16d077-bd82-4a6c-b498-52741239205f` |
| OAuth scope | `claudeai` |
| Redirect URI | `https://claude.ai/api/mcp/auth_callback` |
| Auth method | Public client (PKCE, no client secret) |
| Email claim | Optional claim on access token — already configured |

## How auth works

```
Claude.ai                MCP server              Entra ID
    |                        |                       |
    |-- GET /.well-known/ -> |                       |
    |<-- { authorization_endpoint, registration_endpoint, scope: claudeai } --
    |                        |                       |
    |-- POST /register ----> |                       |
    |<-- { client_id: 7e6a0973-... } ---------------
    |                        |                       |
    | (open browser)         |                       |
    |-- GET /oauth2/v2.0/authorize?scope=claudeai offline_access&code_challenge=... -->
    |<-- redirect with auth code -------------------|
    |                        |                       |
    |-- POST /oauth2/v2.0/token (code + code_verifier) --->
    |<-- { access_token, refresh_token } -----------|
    |                        |                       |
    |-- POST /mcp Bearer <token> -> |               |
    |                        |-- verifyEntraToken -->|
    |                        |<-- { email, name } ---|
    |<-- MCP response -------|                       |
```

When the access token expires (~1 hour), Claude.ai silently exchanges the `refresh_token`
for a new one and retries — the `mcp-session-id` stays valid, no re-login needed.

## Key Vault secrets

The Key Vault `kv-workloads-prod-ne` already holds these secrets (created by Terraform):

| Secret name | Content | Used by |
|-------------|---------|---------|
| `mcp-gateway-client-id` | `7e6a0973-ab32-4912-a497-965fc4544f89` | oauth2-proxy, mcp-internal |
| `mcp-gateway-client-secret` | app password | oauth2-proxy only |
| `mcp-oauth2proxy-cookie-secret` | session cookie key | oauth2-proxy only |

All four secrets are managed by `mcp-oauth.tf` and are already in Key Vault.

## Local development

With `KEYVAULT_URL` set and `az login` done, the server reads both IDs from Key Vault automatically:

```
# .env — only these three are needed locally; client/tenant IDs come from Key Vault
HOST=127.0.0.1
PORT=8080
KEYVAULT_URL=https://kv-workloads-prod-ne.vault.azure.net/
```

In k8s, `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` are injected as env vars from `values.yaml`
and take precedence over Key Vault.
