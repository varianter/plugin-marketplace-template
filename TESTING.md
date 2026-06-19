# Testing

This template includes a small CI-oriented test suite that proves the template is buildable, runnable, and deployable without making assumptions about future plugin business logic.

## Local verification

Run the same checks expected in CI:

```bash
pnpm verify
```

For a faster test-only cycle:

```bash
pnpm test
pnpm test:watch
```

`pnpm test` assumes the template has already been built when running build-output smoke tests. Use `pnpm verify` before opening a PR.

## What the template tests

- MCP server HTTP smoke behavior, including `/healthz`, `/icon.png`, and the configured MCP path.
- Example MCP tool registration for `whoami`.
- Example widget-backed tool registration for `hello-world-widget`.
- Standard plugin build output paths used by deployment.
- Docker image startup and `/healthz` in GitHub Actions.

## How to evolve tests

When adding a new MCP tool:

1. Add a colocated `*.test.ts` next to the tool.
2. Test that the tool registers with the expected MCP tool name and metadata.
3. Test important handler success and error cases.
4. Mock external services instead of calling real APIs.
5. Return expected tool-level errors in tests for recoverable failures.

When adding a widget:

1. Test the server-side tool registration and structured content.
2. Keep widget logic small and test pure helpers separately where practical.
3. Add or update smoke assertions only for template-level output conventions.

When changing server infrastructure:

1. Prefer testing the Express app factory instead of binding a real port.
2. Add Docker smoke coverage if the change affects runtime packaging, startup, or deployment paths.
