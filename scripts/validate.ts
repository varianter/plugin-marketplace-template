#!/usr/bin/env tsx
/**
 * Quick validation script for skills - minimal version
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_PROPERTIES = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
  'compatibility',
]);

const KEBAB_REGEX = /^[a-z0-9-]+$/;

type Result = { valid: true; message: string } | { valid: false; message: string };

type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  return trimmed;
}

function parseFrontmatter(frontmatterText: string): ParseResult {
  const lines = frontmatterText.replace(/\r\n/g, '\n').split('\n');
  const result: Record<string, unknown> = {};

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    if (/^\s/.test(line)) {
      // Nested YAML belongs to the previous top-level key. The validator only
      // needs top-level keys plus scalar values for fields it validates.
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (!match) {
      return { ok: false, message: `Unsupported YAML frontmatter line: ${line}` };
    }

    const [, key, rawValue = ''] = match;
    const value = rawValue.trim();

    if (/^[>|][+-]?$/.test(value)) {
      const blockLines: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        if (next.trim() !== '' && !/^\s/.test(next)) break;
        index++;
        blockLines.push(next.replace(/^\s{2,}/, ''));
      }
      result[key] = value.startsWith('>')
        ? blockLines.join(' ').trim()
        : blockLines.join('\n').trim();
      continue;
    }

    if (value === '') {
      const next = lines[index + 1];
      result[key] = next && /^\s+-\s+/.test(next) ? [] : {};
      continue;
    }

    result[key] = parseScalar(value);
  }

  return { ok: true, value: result };
}

export function validateSkill(skillPath: string): Result {
  const skillMdPath = join(skillPath, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    return { valid: false, message: 'SKILL.md not found' };
  }

  const content = readFileSync(skillMdPath, 'utf-8');

  if (!content.startsWith('---')) {
    return { valid: false, message: 'No YAML frontmatter found' };
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { valid: false, message: 'Invalid frontmatter format' };
  }

  const frontmatterText = match[1];

  const parsed = parseFrontmatter(frontmatterText);
  if (!parsed.ok) {
    return {
      valid: false,
      message: `Invalid YAML in frontmatter: ${parsed.message}`,
    };
  }

  const frontmatter: unknown = parsed.value;

  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    return { valid: false, message: 'Frontmatter must be a YAML dictionary' };
  }

  const fm = frontmatter as Record<string, unknown>;
  const unexpectedKeys = Object.keys(fm).filter((k) => !ALLOWED_PROPERTIES.has(k));
  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys.sort().join(', ')}. Allowed properties are: ${[...ALLOWED_PROPERTIES].sort().join(', ')}`,
    };
  }

  if (!('name' in fm)) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!('description' in fm)) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  const name = fm.name;
  if (typeof name !== 'string') {
    return {
      valid: false,
      message: `Name must be a string, got ${typeof name}`,
    };
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed) {
    if (!KEBAB_REGEX.test(nameTrimmed)) {
      return {
        valid: false,
        message: `Name '${nameTrimmed}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (nameTrimmed.startsWith('-') || nameTrimmed.endsWith('-') || nameTrimmed.includes('--')) {
      return {
        valid: false,
        message: `Name '${nameTrimmed}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    if (nameTrimmed.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${nameTrimmed.length} characters). Maximum is 64 characters.`,
      };
    }
  }

  const description = fm.description;
  if (typeof description !== 'string') {
    return {
      valid: false,
      message: `Description must be a string, got ${typeof description}`,
    };
  }
  const descTrimmed = description.trim();
  if (descTrimmed) {
    if (descTrimmed.includes('<') || descTrimmed.includes('>')) {
      return {
        valid: false,
        message: 'Description cannot contain angle brackets (< or >)',
      };
    }
    if (descTrimmed.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${descTrimmed.length} characters). Maximum is 1024 characters.`,
      };
    }
  }

  const compatibility = fm.compatibility;
  if (compatibility !== undefined && compatibility !== null && compatibility !== '') {
    if (typeof compatibility !== 'string') {
      return {
        valid: false,
        message: `Compatibility must be a string, got ${typeof compatibility}`,
      };
    }
    if (compatibility.length > 500) {
      return {
        valid: false,
        message: `Compatibility is too long (${compatibility.length} characters). Maximum is 500 characters.`,
      };
    }
  }

  return { valid: true, message: 'Skill is valid!' };
}

function findAllPluginSkills(): string[] {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..');
  const pluginsDir = join(repoRoot, 'plugins');

  if (!existsSync(pluginsDir)) return [];

  const skillPaths: string[] = [];
  for (const pluginEntry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!pluginEntry.isDirectory()) continue;

    const skillsDir = join(pluginsDir, pluginEntry.name, 'skills');
    if (!existsSync(skillsDir)) continue;

    for (const skillEntry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skillEntry.isDirectory()) continue;
      skillPaths.push(join(skillsDir, skillEntry.name));
    }
  }

  return skillPaths.sort();
}

const isMain = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    console.error('Usage: pnpm validate-skill [skill_directory]');
    process.exit(1);
  }

  const skillPaths = args.length === 1 ? [args[0]] : findAllPluginSkills();
  if (skillPaths.length === 0) {
    console.error('No plugin skills found.');
    process.exit(1);
  }

  let valid = true;
  for (const skillPath of skillPaths) {
    const result = validateSkill(skillPath);
    const displayPath = relative(process.cwd(), resolve(skillPath)) || '.';
    console.log(`${displayPath}: ${result.message}`);
    valid &&= result.valid;
  }

  process.exit(valid ? 0 : 1);
}
