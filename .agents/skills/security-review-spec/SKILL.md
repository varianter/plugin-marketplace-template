---
name: security-review-spec
description: Spec-security review is not part of this repository's normal workflow because checked-in product and technical specs are not used. Use only if an explicit external workflow still invokes review-spec.
---

# Security Review Spec

`varianter/plugin-template` does not normally use checked-in product or technical specs. Prefer reviewing code, workflow, skill, MCP, and documentation changes through `security-review-pr`.

If a spec-only review is explicitly requested anyway:

- Flag new checked-in `specs/` artifacts as a repository-workflow concern unless maintainers explicitly approved introducing them.
- Review the proposed design for authentication and authorization assumptions, trust boundaries, sensitive data handling, secrets management, dependency posture, and abuse cases.
- Fold any findings into the same `review.json` produced by the base spec review.
