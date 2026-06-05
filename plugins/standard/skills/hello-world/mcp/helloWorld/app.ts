import { mount } from 'svelte';
import HelloWorld from './helloWorld.svelte';

// globalThis.ExtApps is injected by the MCP server before this script runs.
// biome-ignore lint/suspicious/noExplicitAny: ExtApps is injected server-side, no type available.
const { App } = (globalThis as any).ExtApps;

const mcpApp = new App({ name: 'HelloWorldWidget', version: '1.0.0' }, {});

mount(HelloWorld, {
  target: document.getElementById('app') as HTMLElement,
  props: { app: mcpApp },
});

mcpApp.connect().catch((err: unknown) => {
  console.error('[HelloWorldWidget] Failed to connect to host:', err);
});
