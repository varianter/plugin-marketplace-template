---
name: create-plugin-skill
description: Add a plain skill-only SKILL.md under a plugin using template best practices and current repository conventions.
allowed-tools: Read, Bash, Edit, Write
---

# Create Plugin Skill

Use this skill when the user wants a simple Claude Code skill with no MCP tool and no widget. Inspect the current repository before editing; do not assume it is identical to the original template.

## Inputs

- `plugin`: target plugin under `plugins/`.
- `skill`: skill name/directory in kebab-case.
- `description`: concise frontmatter description.
- Skill instructions: trigger conditions and steps.

## Best-practice placement

```text
plugins/<plugin>/skills/<skill>/SKILL.md
```

Plugin manifests should expose skills with a path such as `"skills": ["./skills"]`; if the current repo uses another valid convention, follow it.

## Steps

1. Inspect the target plugin's `.claude-plugin/plugin.json` and existing `skills/` folder if present.
2. Verify `plugins/<plugin>/` exists and `skill` is kebab-case.
3. Create `plugins/<plugin>/skills/<skill>/SKILL.md`:
   ```md
   ---
   name: <skill>
   description: <one-line description>
   ---

   # <Human Title>

   ## When to use

   Use this skill when ...

   ## Steps

   1. ...
   2. ...
   3. ...
   ```
4. Do not create a `tools/` directory for a skill-only request.
5. Validate the skill using the repository validator if present. In this template family:
   ```bash
   cd scripts && pnpm exec tsx validate.ts ../plugins/<plugin>/skills/<skill>
   ```

## Rules

- Keep frontmatter keys supported by the current validator.
- The `name` should be kebab-case and match the skill directory unless current repo conventions say otherwise.
