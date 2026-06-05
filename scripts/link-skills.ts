#!/usr/bin/env bun
/**
 * Copies all skills into ~/.mcpjam/skills/ so MCPJam can discover them.
 * Run automatically via `predev` / `predev:server` in mcp/package.json, or manually:
 *   bun scripts/link-skills.ts
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname;
const targetDir = join(process.env.HOME ?? '~', '.mcpjam', 'skills');

mkdirSync(targetDir, { recursive: true });

const skillDirs: { name: string; src: string }[] = [];

for (const base of ['skills']) {
  const dir = join(repoRoot, base);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(dir, entry.name, 'SKILL.md');
    if (existsSync(skillMd)) {
      skillDirs.push({ name: entry.name, src: join(dir, entry.name) });
    }
  }
}

let copied = 0;
for (const { name, src } of skillDirs) {
  const dest = join(targetDir, name);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true });
  }
  cpSync(src, dest, { recursive: true });
  console.log(`  copied ${name}`);
  copied++;
}

console.log(`\n✓ ${copied} skill(s) copied to ~/.mcpjam/skills/`);
