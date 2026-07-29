---
name: create-skill-with-colocated-tool
description: Add a skill with a colocated MCP tool, README documentation, and registration using template best practices.
allowed-tools: Read, Bash, Edit, Write
---

# Create Skill With Colocated Tool

Use this skill when a skill needs a server-side MCP tool but no UI widget. Inspect the current repo and plugin first; adapt to current registration conventions while preserving the template best-practice structure.

## Inputs

- `plugin`: target plugin under `plugins/`.
- `skill`: skill name/directory in kebab-case.
- `tool`: MCP tool id in kebab-case.
- Tool inputs and behavior.

## Best-practice placement

```text
plugins/<plugin>/skills/<skill>/SKILL.md
plugins/<plugin>/skills/<skill>/README.md
plugins/<plugin>/skills/<skill>/tools/<toolCamel>.ts
```

## Steps

1. Inspect the target plugin's skill folder, `tsconfig.json`, and MCP tool registration location.
2. Create `SKILL.md` that instructs Claude to call the colocated tool:
   ```md
   ---
   name: <skill>
   description: <one-line trigger description>
   ---

   # <Human Title>

   ## When to use

   Use this skill when ...

   ## Steps

   1. Gather required inputs.
   2. Call the `<tool>` MCP tool with those inputs.
   3. Summarize the result for the user.
   ```
3. Create `README.md` documenting the relationship:
   ```md
   # <Human Title>

   This skill uses the colocated MCP tool `<tool>` located at `tools/<toolCamel>.ts`.
   The tool is registered in the plugin MCP tool registration entrypoint.
   ```
4. Implement the flat colocated tool:
   ```ts
   import type { McpServer } from '@variant/mcp-server';
   import { log } from '@variant/mcp-server';
   import { z } from 'zod';

   export function registerToolCamel(server: McpServer): void {
     server.registerTool(
       '<tool>',
       {
         title: '<Tool Title>',
         description: '<Tool description>',
         inputSchema: {
           param: z.string().describe('Input parameter'),
         },
       },
       async ({ param }) => {
         log('info', '<tool>: called', { param });
         return { content: [{ type: 'text', text: param }] };
       },
     );
   }
   ```
5. Register it in the plugin's MCP registration file. With the template entrypoint pattern:
   ```ts
   import { registerToolCamel } from '../skills/<skill>/tools/<toolCamel>.js';
   ```
   Add `registerToolCamel` to `definePluginTools([...])`.
6. Validate and typecheck using current repo commands. Template-family commands:
   ```bash
   cd scripts && pnpm exec tsx validate.ts ../plugins/<plugin>/skills/<skill>
   cd .. && pnpm --filter @variant/plugin-<plugin> run typecheck
   ```

## Rules

- Use `@variant/mcp-server` for shared infrastructure.
- Expected tool errors should return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }`.
- This is the flat-file pattern for non-widget colocated tools. Widget tools use a directory containing `index.html`.
