import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standard plugin template build output', () => {
  it('contains the deployable server, assets, and widget bundle after pnpm build', () => {
    expect(existsSync('plugins/standard/mcp/dist/mcp/index.js')).toBe(true);
    expect(existsSync('plugins/standard/mcp/dist/mcp/assets/icon.png')).toBe(true);
    expect(existsSync('plugins/standard/mcp/dist/widgets/hello-world/index.html')).toBe(true);
  });
});
