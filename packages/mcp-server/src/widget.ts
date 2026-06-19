import { type Component, mount } from 'svelte';

export interface WidgetAppConfig {
  name: string;
  version: string;
}

export interface McpWidgetApp {
  connect: () => Promise<void>;
  getHostContext: () => unknown;
  onhostcontextchanged: ((ctx: unknown) => void) | null;
  ontoolinput: ((params: unknown) => void) | null;
  sendMessage: (message: unknown) => void;
}

interface ExtAppsGlobal {
  App: new (config: WidgetAppConfig, options: Record<string, never>) => McpWidgetApp;
}

export interface MountWidgetOptions<Props extends Record<string, unknown>> {
  app: WidgetAppConfig;
  target: HTMLElement;
  props?: Props;
}

function readExtApps(globalScope: typeof globalThis): ExtAppsGlobal {
  const maybeExtApps = (globalScope as { ExtApps?: ExtAppsGlobal }).ExtApps;
  if (!maybeExtApps) {
    throw new Error('ExtApps is not available. Make sure the widget HTML is loaded through MCP.');
  }
  return maybeExtApps;
}

export function createWidgetApp(config: WidgetAppConfig): McpWidgetApp {
  const { App } = readExtApps(globalThis);
  return new App(config, {});
}

export function mountWidget<Props extends Record<string, unknown>>(
  component: Component<Props & { app: McpWidgetApp }>,
  options: MountWidgetOptions<Props>,
): McpWidgetApp {
  const app = createWidgetApp(options.app);

  mount(component, {
    target: options.target,
    props: { ...(options.props ?? ({} as Props)), app },
  });

  app.connect().catch((err: unknown) => {
    console.error(`[${options.app.name}] Failed to connect to host:`, err);
  });

  return app;
}
