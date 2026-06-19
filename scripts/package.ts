#!/usr/bin/env tsx
/**
 * Skill Packager - Creates a distributable .skill file from a skill folder
 *
 * Usage:
 *   pnpm exec tsx scripts/package.ts <path/to/skill-folder> [output-directory]
 *
 * Example:
 *   pnpm exec tsx scripts/package.ts skills/my-skill
 *   pnpm exec tsx scripts/package.ts skills/my-skill ./dist
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { validateSkill } from './validate';

// Script file extensions to scan for configuration sections
const SCRIPT_EXTENSIONS = new Set(['.sh', '.bash', '.zsh', '']);

// Files excluded from packaging (documentation-only files for Git/GitHub)
const EXCLUDE_FILES = new Set(['README.md']);

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_FILES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

// Matches the opening line of a configuration section in shell scripts
const CONFIG_SECTION_START = /^#\s*─+\s*Configuration\s*─+/;
// Matches the closing line of a configuration section (a comment of only dashes/spaces)
const CONFIG_SECTION_END = /^#\s*─{10,}\s*$/;
// Captures the env var name from the RHS of an assignment.
// Handles: VAR="${ENVVAR}" and VAR="${ENVVAR:-default}" → captures ENVVAR
// Falls back to LHS name when RHS has no $-reference (e.g. VAR="literal")
const CONFIG_LINE_RHS = /=["']?\$\{([A-Z_][A-Z0-9_]*)[^}]*\}/;
const CONFIG_LINE_LHS = /^([A-Z_][A-Z0-9_]*)=/;

function detectEnvVars(skillPath: string): string[] {
  const files = collectFiles(skillPath);
  const vars = new Set<string>();

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SCRIPT_EXTENSIONS.has(ext)) continue;

    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    let inConfigSection = false;
    for (const line of content.split('\n')) {
      if (!inConfigSection) {
        if (CONFIG_SECTION_START.test(line)) inConfigSection = true;
        continue;
      }
      if (CONFIG_SECTION_END.test(line)) {
        inConfigSection = false;
        continue;
      }
      // Prefer the RHS env var name; fall back to LHS if RHS has no $-reference
      const rhs = CONFIG_LINE_RHS.exec(line);
      if (rhs) {
        vars.add(rhs[1]);
      } else if (CONFIG_LINE_LHS.test(line)) {
        const lhs = CONFIG_LINE_LHS.exec(line);
        if (lhs) vars.add(lhs[1]);
      }
    }
  }

  return [...vars].sort();
}

async function promptForEnvVars(vars: string[]): Promise<Record<string, string>> {
  if (vars.length === 0) return {};

  console.log('🔑 The following environment variables are required by this skill:');
  console.log('   Press Enter to use the current environment value (shown in brackets).\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

  const values: Record<string, string> = {};

  for (const varName of vars) {
    const current = process.env[varName];
    const hint = current
      ? ` [${current.slice(0, 4)}${'*'.repeat(Math.min(current.length - 4, 8))}]`
      : ' [not set]';
    const answer = await ask(`  ${varName}${hint}: `);
    values[varName] = answer.trim() || current || '';
  }

  rl.close();
  return values;
}

async function packageSkill(skillPath: string, outputDir?: string): Promise<string | null> {
  const absSkillPath = resolve(skillPath);

  if (!existsSync(absSkillPath)) {
    console.error(`❌ Error: Skill folder not found: ${absSkillPath}`);
    return null;
  }

  if (!statSync(absSkillPath).isDirectory()) {
    console.error(`❌ Error: Path is not a directory: ${absSkillPath}`);
    return null;
  }

  if (!existsSync(join(absSkillPath, 'SKILL.md'))) {
    console.error(`❌ Error: SKILL.md not found in ${absSkillPath}`);
    return null;
  }

  console.log('🔍 Validating skill...');
  const result = validateSkill(absSkillPath);
  if (!result.valid) {
    console.error(`❌ Validation failed: ${result.message}`);
    console.error('   Please fix the validation errors before packaging.');
    return null;
  }
  console.log(`✅ ${result.message}\n`);

  // Detect required env vars and prompt the user to fill them in
  const envVars = detectEnvVars(absSkillPath);
  let envFilePath: string | null = null;

  if (envVars.length > 0) {
    const envValues = await promptForEnvVars(envVars);
    const missing = envVars.filter((v) => !envValues[v]);
    if (missing.length > 0) {
      console.warn(`\n⚠️  No value provided for: ${missing.join(', ')}`);
      console.warn('   These will be empty in the bundled .env file.\n');
    }

    const envFileContent = `${envVars.map((v) => `${v}=${envValues[v] ?? ''}`).join('\n')}\n`;

    envFilePath = join(absSkillPath, '.env');
    writeFileSync(envFilePath, envFileContent, { mode: 0o600 });
    console.log('\n📦 Bundling .env into skill archive...');
  } else {
    console.log('ℹ️  No environment variables detected in skill scripts.\n');
  }

  const skillName = basename(absSkillPath);
  const absOutputDir = outputDir ? resolve(outputDir) : resolve('.');

  mkdirSync(absOutputDir, { recursive: true });

  const skillFile = join(absOutputDir, `${skillName}.skill`);
  const files = collectFiles(absSkillPath);
  const skillParent = resolve(absSkillPath, '..');

  // Shell out to the system zip tool.
  const relFiles = files.map((f) => relative(skillParent, f));
  const { exitCode, stderr } = await new Promise<{ exitCode: number | null; stderr: string }>(
    (resolveProcess, reject) => {
      const child = spawn('zip', ['-r', skillFile, ...relFiles], { cwd: skillParent });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (exitCode) => resolveProcess({ exitCode, stderr }));
    },
  );

  // Remove the temporary .env file from the source tree immediately after zipping
  if (envFilePath && existsSync(envFilePath)) {
    unlinkSync(envFilePath);
  }

  if (exitCode !== 0) {
    console.error(`❌ Error creating .skill file: ${stderr}`);
    return null;
  }

  for (const f of relFiles) {
    console.log(`  Added: ${f}`);
  }

  console.log(`\n✅ Successfully packaged skill to: ${skillFile}`);
  return skillFile;
}

const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  console.error(
    'Usage: pnpm exec tsx scripts/package.ts <path/to/skill-folder> [output-directory]',
  );
  console.error('\nExample:');
  console.error('  pnpm exec tsx scripts/package.ts skills/my-skill');
  console.error('  pnpm exec tsx scripts/package.ts skills/my-skill ./dist');
  process.exit(1);
}

const result = await packageSkill(args[0], args[1]);
process.exit(result ? 0 : 1);
