---
name: create-product-spec
description: Product-spec file creation is disabled for this repository. Use only when a workflow explicitly asks why repo-persisted product specs are not supported.
---

# create-product-spec

This repository does not use repo-persisted product spec files or file-based spec-driven development.

## Repository policy

For `varianter/plugin-template`:

- Do not create `specs/` directories or `product.md` files for GitHub issues.
- Do not prepare product-spec pull requests.
- If product planning is needed, keep it in the conversation, issue discussion, or PR description unless the user explicitly names another destination outside this repository.

## If invoked

1. Explain that this repository intentionally avoids checked-in product specs.
2. Ask where the user wants planning captured if they need a durable artifact.
3. Do not write files unless the user explicitly provides a non-spec repository path or an external handoff format.
