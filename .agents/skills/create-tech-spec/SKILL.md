---
name: create-tech-spec
description: Technical-spec file creation is disabled for this repository. Use only when a workflow explicitly asks why repo-persisted tech specs are not supported.
---

# create-tech-spec

This repository does not use repo-persisted technical spec files or file-based spec-driven development.

## Repository policy

For `varianter/plugin-template`:

- Do not create `specs/` directories or `tech.md` files for GitHub issues.
- Do not prepare technical-spec pull requests.
- Do not treat checked-in spec files as the implementation source of truth.
- If technical planning is needed, keep it in the conversation, issue discussion, or PR description unless the user explicitly names another destination outside this repository.

## If invoked

1. Explain that this repository intentionally avoids checked-in technical specs.
2. Ask where the user wants technical planning captured if they need a durable artifact.
3. Do not write files unless the user explicitly provides a non-spec repository path or an external handoff format.
