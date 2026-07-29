---
name: create-standalone-tool
description: Add a standalone MCP tool to a chosen plugin using baked-in template best practices and current repository conventions.
allowed-tools: Read, Bash, Edit, Write
---

# Create Standalone Tool

Use this skill for an MCP tool that is not tied to a skill. Do not assume the repository is identical to the template; inspect the chosen plugin and adapt while preserving these best practices.

## Inputs

- `plugin`: target plugin under `plugins/`.
- `tool`: MCP tool id in kebab-case.
- Tool title, description, input schema, and behavior.

## Best-practice placement

```text
plugins/<plugin>/tools/<tool-kebab>/<toolCamel>.ts
```

The tool must be registered in the plugin MCP server entrypoint, usually `plugins/<plugin>/mcp-server/index.ts` or the current repo's equivalent tool-registration file.

## Steps

1. Inspect `plugins/<plugin>/package.json`, `tsconfig.json`, and MCP entrypoint/registration files. Confirm the plugin exists.
2. Create the tool file under `tools/<tool-kebab>/`.
3. Implement using `@variant/mcp-server` imports:
   ```ts
   import type { McpServer } from '@variant/mcp-server';
   import { log } from '@variant/mcp-server';
   import { z } from 'zod';

   export function registerToolCamel(server: McpServer): void {
     server.registerTool(
       '<tool-kebab>',
       {
         title: '<Tool Title>',
         description: '<Tool description>',
         inputSchema: {
           param: z.string().describe('Input parameter'),
         },
       },
       async ({ param }) => {
         log('info', '<tool-kebab>: called', { param });
         return { content: [{ type: 'text', text: param }] };
       },
     );
   }
   ```
4. Register the tool in the plugin's MCP tool registration location. For an entrypoint using `definePluginTools`, add:
   ```ts
   import { registerToolCamel } from '../tools/<tool-kebab>/<toolCamel>.js';
   ```
   and include `registerToolCamel` in the tools array.
5. Return expected tool errors as:
   ```ts
   return { content: [{ type: 'text', text: 'Error: explanation' }], isError: true };
   ```
6. Typecheck the plugin using the current package name or filter convention. If package names follow the template:
   ```bash
   pnpm --filter @variant/plugin-<plugin> run typecheck
   ```

## Rules

- Standalone tools belong under `tools/`, not under a skill.
- Shared infrastructure imports come from `@variant/mcp-server`, never relative shared paths.
- Adapt file paths if the repo has intentionally moved registration, but preserve the standalone-tool concept.
