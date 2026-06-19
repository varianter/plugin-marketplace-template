<!-- biome-ignore-all lint/correctness/noUnusedVariables: Biome does not detect Svelte template references. -->
<script lang="ts">
import type { McpWidgetApp } from '@variant/mcp-server/widget';

type HostContext = { theme?: string } | null | undefined;
type ToolInput = { arguments?: Record<string, unknown> };

const { app }: { app: McpWidgetApp } = $props();

// biome-ignore lint/correctness/noUnusedVariables: Referenced by Svelte markup.
let name = $state('World');
// biome-ignore lint/correctness/noUnusedVariables: Referenced by Svelte markup.
let message = $state('Hello from a skill-colocated MCP widget!');
// biome-ignore lint/correctness/noUnusedVariables: Referenced by Svelte markup.
let dark = $state(false);
let clicks = $state(0);

$effect(() => {
  const ctx = app.getHostContext() as HostContext;
  dark = ctx?.theme === 'dark';
  app.onhostcontextchanged = (ctx) => {
    const hostContext = ctx as HostContext;
    dark = hostContext?.theme === 'dark';
  };

  app.ontoolinput = (params) => {
    const toolInput = params as ToolInput;
    const args = toolInput.arguments ?? {};
    if (typeof args.name === 'string' && args.name.trim()) name = args.name;
    if (typeof args.message === 'string' && args.message.trim()) message = args.message;
  };
});

// biome-ignore lint/correctness/noUnusedVariables: Referenced by Svelte markup.
function celebrate() {
  clicks += 1;
  app.sendMessage({
    role: 'user',
    content: [
      { type: 'text', text: `The Hello World widget button has been clicked ${clicks} time(s).` },
    ],
  });
}
</script>

<div class="widget" class:dark>
  <p class="eyebrow">Template demo</p>
  <h1>Hello, {name}!</h1>
  <p class="message">{message}</p>

  <button type="button" onclick={celebrate}>Click me</button>

  {#if clicks > 0}
    <p class="counter">Widget interaction count: {clicks}</p>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
  }

  .widget {
    box-sizing: border-box;
    min-height: 100vh;
    padding: 28px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #172033;
    background: linear-gradient(135deg, #f8fbff, #eef4ff);
  }

  .widget.dark {
    color: #f8fbff;
    background: linear-gradient(135deg, #172033, #27364f);
  }

  .eyebrow {
    margin: 0 0 8px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.7;
  }

  h1 {
    margin: 0 0 12px;
    font-size: 2rem;
    line-height: 1.1;
  }

  .message {
    max-width: 34rem;
    margin: 0 0 20px;
    font-size: 1rem;
    line-height: 1.5;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    color: white;
    background: #456cff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:hover {
    background: #3156d8;
  }

  .counter {
    margin: 16px 0 0;
    font-size: 0.875rem;
    opacity: 0.75;
  }
</style>
