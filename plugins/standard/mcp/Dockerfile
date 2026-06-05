# Stage 1: Build
FROM node:24-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /build
ARG PLUGIN_NAME=standard
# Copy workspace configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Copy workspace packages needed by this plugin
COPY packages/ ./packages/
# Copy plugin files (mcp server + features and tools that compile into it)
COPY plugins/${PLUGIN_NAME}/mcp/ ./plugins/${PLUGIN_NAME}/mcp/
COPY plugins/${PLUGIN_NAME}/features/ ./plugins/${PLUGIN_NAME}/features/
COPY plugins/${PLUGIN_NAME}/tools/ ./plugins/${PLUGIN_NAME}/tools/
RUN pnpm install --frozen-lockfile
# Build @variant/mcp-server first, then the plugin MCP server
RUN pnpm --filter @variant/mcp-server run build
RUN pnpm --filter "@variant/plugin-${PLUGIN_NAME}-mcp" run build
# Create a standalone deployment bundle with all production deps resolved (no workspace symlinks)
RUN pnpm deploy --filter "@variant/plugin-${PLUGIN_NAME}-mcp" --prod /build/deploy

# Stage 2: Runtime
FROM node:24-alpine AS runtime
RUN addgroup -S mcp && adduser -S mcp -G mcp
WORKDIR /app
ARG PLUGIN_NAME=standard
# Copy standalone node_modules from deploy bundle (workspace symlinks resolved)
COPY --from=builder /build/deploy/node_modules/ ./node_modules/
# Flatten dist output into /app/ so paths match local dev depth (mcp/src/index.js)
COPY --from=builder /build/plugins/${PLUGIN_NAME}/mcp/dist/ ./
# Copy plugin manifest (read by the server at /app/.claude-plugin/plugin.json)
COPY plugins/${PLUGIN_NAME}/.claude-plugin/ ./.claude-plugin/
USER mcp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
CMD ["node", "mcp/src/index.js"]
