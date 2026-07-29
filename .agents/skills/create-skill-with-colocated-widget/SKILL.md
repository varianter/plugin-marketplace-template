---
name: create-skill-with-colocated-widget
description: Add a skill with a colocated Svelte widget MCP tool, README documentation, path-safe widget metadata, and registration.
allowed-tools: Read, Bash, Edit, Write
---

# Create Skill With Colocated Widget

Use this skill when a skill needs to open an interactive widget. Do not assume any example skill exists. Inspect the current plugin first, then apply the best-practice widget layout below.

## Inputs

- `plugin`: target plugin under `plugins/`.
- `skill`: skill name/directory in kebab-case.
- `widget`: widget source directory name, preferably camelCase.
- `tool`: MCP tool id in kebab-case, often ending in `-widget`.

## Best-practice placement

```text
plugins/<plugin>/skills/<skill>/SKILL.md
plugins/<plugin>/skills/<skill>/README.md
plugins/<plugin>/skills/<skill>/tools/<widget>/<widget>.ts
plugins/<plugin>/skills/<skill>/tools/<widget>/index.html
plugins/<plugin>/skills/<skill>/tools/<widget>/app.ts
plugins/<plugin>/skills/<skill>/tools/<widget>/<widget>.svelte
```

Best-practice widget builders discover `skills/*/tools/*/index.html` and output `mcp-server/dist/widgets/<widget-kebab>/index.html`. If the current repo's widget builder differs, adapt paths while preserving that source-to-built-widget relationship.

## Steps

1. Inspect the plugin's MCP entrypoint, widget build config, and existing widget conventions if any.
2. Create `SKILL.md` that tells Claude to call the widget tool:
   ```md
   ---
   name: <skill>
   description: Opens the <widget-kebab> widget when the user asks for ...
   ---

   # <Human Title>

   ## Steps

   1. Gather optional widget inputs from the user.
   2. Call the `<tool>` MCP tool.
   3. Explain that the interactive widget has opened.
   ```
3. Create `README.md`:
   ```md
   # <Human Title>

   This skill uses the colocated widget in `tools/<widget>/`.
   The widget tool is `<tool>`, implemented by `tools/<widget>/<widget>.ts` and registered in the plugin MCP tool registration entrypoint.
   The browser bundle is built as widget `<widget-kebab>`.
   ```
4. Implement `<widget>.ts` with `registerWidgetTool`:
   ```ts
   import { getRequestContext, type McpServer, registerWidgetTool } from '@variant/mcp-server';
   import { z } from 'zod';

   const WIDGET_RESOURCE = {
     title: '<Widget Title>',
     uri: 'ui://widgets/<widget-kebab>',
     widgetName: '<widget-kebab>',
   };

   export function registerWidgetCamel(server: McpServer): void {
     registerWidgetTool(
       server,
       '<tool>',
       {
         title: '<Widget Title>',
         description: 'Opens the <Widget Title> widget.',
         resource: WIDGET_RESOURCE,
         inputSchema: {
           message: z.string().optional().describe('Optional message to show in the widget'),
         },
       },
       async ({ message }) => {
         const ctx = getRequestContext();
         return {
           content: [{ type: 'text', text: 'Opening <Widget Title>.' }],
           structuredContent: { message: message ?? 'Hello from the widget', userName: ctx?.name },
         };
       },
     );
   }
   ```
5. Implement `index.html` with `<script type="module" src="./app.ts"></script>` and a root `<div id="app"></div>`.
6. Implement `app.ts`:
   ```ts
   import { mountWidget } from '@variant/mcp-server/widget';
   import Widget from './<widget>.svelte';

   mountWidget(Widget, {
     app: { name: '<WidgetCamel>Widget', version: '1.0.0' },
     target: document.getElementById('app') as HTMLElement,
   });
   ```
7. Implement `<widget>.svelte` with `McpWidgetApp` and `ontoolinput`:
   ```svelte
   <script lang="ts">
   import type { McpWidgetApp } from '@variant/mcp-server/widget';

   type ToolInput = { arguments?: Record<string, unknown> };
   const { app }: { app: McpWidgetApp } = $props();
   let message = $state('Hello from the widget');

   $effect(() => {
     app.ontoolinput = (params) => {
       const args = (params as ToolInput).arguments ?? {};
       if (typeof args.message === 'string') message = args.message;
     };
   });
   </script>

   <main>
     <h1>{message}</h1>
   </main>
   ```
8. Register the widget tool in the plugin's MCP registration file. With the template entrypoint pattern:
   ```ts
   import { registerWidgetCamel } from '../skills/<skill>/tools/<widget>/<widget>.js';
   ```
   Add `registerWidgetCamel` to `definePluginTools([...])`.
9. Validate and build using current repo commands. Template-family commands:
   ```bash
   cd scripts && pnpm exec tsx validate.ts ../plugins/<plugin>/skills/<skill>
   cd .. && pnpm --filter @variant/plugin-<plugin> run build
   ```

## Critical pathing rules

- `widgetName` must equal the built widget name, normally kebab-case of the widget directory.
- `uri` should be `ui://widgets/<widget-kebab>`.
- Do not hardcode `mcp-server/dist` in the TypeScript registrar; use widget resource metadata.
- The widget source directory must contain `index.html`, otherwise best-practice widget discovery will skip it.
