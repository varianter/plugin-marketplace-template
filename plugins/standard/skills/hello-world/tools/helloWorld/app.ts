import { mountWidget } from '@variant/mcp-server/widget';
import HelloWorld from './helloWorld.svelte';

mountWidget(HelloWorld, {
  app: { name: 'HelloWorldWidget', version: '1.0.0' },
  target: document.getElementById('app') as HTMLElement,
});
