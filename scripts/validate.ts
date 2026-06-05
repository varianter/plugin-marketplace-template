#!/usr/bin/env bun
/**
 * Quick validation script for skills - minimal version
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YAML } from 'bun';

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

  let frontmatter: unknown;
  try {
    frontmatter = YAML.parse(frontmatterText);
  } catch (e) {
    return {
      valid: false,
      message: `Invalid YAML in frontmatter: ${e instanceof Error ? e.message : e}`,
    };
  }

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

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: bun run validate.ts <skill_directory>');
    process.exit(1);
  }
  const result = validateSkill(args[0]);
  console.log(result.message);
  process.exit(result.valid ? 0 : 1);
}
