# Tools

CLI scripts for validating and packaging skills. Requires [Bun](https://bun.sh) and the system `zip` utility.

---

## validate.ts

```bash
bun run tools/validate.ts <path/to/skill-folder>
```

**Checks:**

| Check | Details |
|---|---|
| `SKILL.md` exists | Required file must be present |
| YAML frontmatter | Must open with `---` and be valid YAML |
| Required fields | `name` and `description` must be present |
| `name` format | kebab-case, max 64 chars, no leading/trailing/double hyphens |
| `description` format | No angle brackets (`<>`), max 1024 chars |
| `compatibility` | String, max 500 chars (optional) |
| No unknown keys | Only allowed properties may appear in frontmatter |

Allowed frontmatter properties: `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`

Exit `0` on success, `1` on failure.

---

## package.ts

```bash
bun run tools/package.ts <path/to/skill-folder> [output-directory]
```

Validates the skill, then creates a `<skill-name>.skill` zip archive. Output defaults to the current directory.

Exit `0` on success, `1` on validation failure or packaging error.
