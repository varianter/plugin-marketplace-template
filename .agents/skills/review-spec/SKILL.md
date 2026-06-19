---
name: review-spec
description: Spec pull requests are not part of this repository's normal workflow because checked-in specs are disabled. Use only when an explicit workflow still asks for machine-readable feedback on a spec-only diff.
---

# Review Spec Skill

`varianter/plugin-template` does not use checked-in product or technical specs. Normal pull requests should be reviewed with `review-pr` and, for security-sensitive code changes, `security-review-pr`.

## If invoked

If a workflow explicitly invokes this skill for a spec-only pull request:

1. Read the provided diff and PR description.
2. Apply `.agents/skills/review-spec-local/SKILL.md` if referenced by the prompt.
3. Treat newly added checked-in `specs/` artifacts as a repository-workflow concern unless the PR explicitly documents maintainer approval for changing the repository policy.
4. If machine-readable output is required, write `review.json` using the schema requested by the invoking workflow.
5. Do not post comments or reviews to GitHub directly.

## Review focus

- Whether the PR is trying to introduce repo-persisted specs despite the repository policy.
- Whether planning context would be better placed in the issue, PR description, conversation, or another explicitly requested destination.
- Whether any proposed design text contains security, feasibility, or ambiguity risks that would mislead implementation.
- Whether links are repo-root-relative and avoid absolute local filesystem paths.
