---
name: review-spec-local
specializes: review-spec
description: Repo-specific spec-review guidance for varianter/plugin-template. Spec-file PRs are not part of this repository's normal workflow.
---

# Repo-specific spec-review guidance for `varianter/plugin-template`

This repository does not use checked-in product or technical specs and should not normally receive spec-only PRs.

If `review-spec` is invoked anyway:

- Flag new files under `specs/` as inconsistent with this repository's workflow unless the PR explicitly documents a policy change approved by maintainers.
- Prefer asking the author to move planning context into the issue, PR description, or another explicitly requested non-repository destination.
- Continue to use repo-root-relative links when reviewing any documentation-like artifact.
