---
name: update-pr-review
description: Update the repo-local review-pr-local and review-spec-local companion skills using human feedback left on pull request conversations. Use when aggregating replies to agent-authored PR review comments, incorporating broader human review comments, extracting repeated reviewer feedback, and refining .agents/skills/review-pr-local/SKILL.md and .agents/skills/review-spec-local/SKILL.md with evidence-backed adjustments.
---

# Update PR Review

Use this skill to improve the repo-local review companions `.agents/skills/review-pr-local/SKILL.md` and `.agents/skills/review-spec-local/SKILL.md` from real reviewer feedback. The shared `review-pr` skill and the repo-local core `.agents/skills/review-spec/SKILL.md` are the cross-repo contracts and are read-only from this loop.

This repository primarily uses `review-pr` for code, documentation, workflow, skill, and MCP changes. Checked-in spec files are not part of the normal workflow; feedback from an unexpected spec-only PR should generally reinforce `.agents/skills/review-spec-local/SKILL.md`'s guidance that repo-persisted specs are not used here.

## Write surface

This self-improvement loop may only write to:

- `.agents/skills/review-pr-local/` (and `SKILL.md` inside it)
- `.agents/skills/review-spec-local/` (and `SKILL.md` inside it)

It must NOT touch:

- the shared `review-pr` skill
- `.agents/skills/review-spec/SKILL.md` (the core contract)
- any file under `.github/issue-triage/` (that taxonomy is owned by the `update-triage` loop)
- any other core skill

The self-improvement runner enforces this via a `git diff` check against allowed prefixes before pushing. A violation aborts the run.

## Inputs

- Optional repository override if you are not running from the target checkout.
- Optional time window override when you need something other than the default seven-day lookback.
- Required `--agent-login` value unless the repository has configured a default agent bot identity in the aggregation script.

## Workflow

1. Verify GitHub CLI auth:

```bash
gh auth status
```

2. Aggregate the feedback for pull requests updated over the last week with the bundled script:

```bash
python3 .agents/skills/update-pr-review/scripts/aggregate_review_feedback.py --agent-login <bot-login>
```

By default this targets the current repo and looks back 7 days. Pass the GitHub login that actually authored the agent review comments with `--agent-login <login>`; this must match a real GitHub App, bot, or user account used by the review workflow. The script also collects broader human review comments from those PRs so the skill can learn from reviewer norms even when they were not replying directly to the bot. The script writes structured JSON to a temporary file and prints the temp-file path. Treat that file as scratch state for this skill, not as a user-facing deliverable or final output. If you need a repository other than the current checkout, pass `--repo owner/name`.

Each pull request in the output includes a `review_type` field. For this repository, most PRs should be `"code"`; `"spec"` is only for unexpected PRs where every changed file is under `specs/`.

3. Read the generated JSON and look for repeated reviewer signals, especially:

- replies that say the agent's feedback was wrong, invalid, not applicable, or based on a bad assumption
- signals that the agent had the right instinct but the wrong severity, scope, line targeting, or proposed fix
- feedback that the comment was not actionable enough, including requests for clearer concrete changes
- recurring cases where humans override the bot because repository or product context changes the right call
- review patterns from human-only threads that show what experienced reviewers in this repo consistently care about
- explicit reviewer guidance about what belongs inline, what belongs in the summary, and when the bot should stay uncertain

4. Partition the feedback by `review_type`:

- Feedback from `"code"` PRs applies to `.agents/skills/review-pr-local/SKILL.md`.
- Feedback from `"spec"` PRs applies to `.agents/skills/review-spec-local/SKILL.md`, usually to clarify that checked-in specs are not expected here.
- Update each companion skill independently with the smallest rule change that explains the feedback for that category.
- If feedback for one category is empty, skip that companion.

5. Keep the core review contract stable — never edit the shared `review-pr` skill or `.agents/skills/review-spec/SKILL.md`. Only the `-local` companions evolve from feedback.

## Evidence Rules

- Prefer patterns backed by multiple threads or a strong explicit maintainer statement.
- Do not weaken correctness, security, or data-loss checks because of a single disagreement.
- Separate feedback about review quality from feedback about repository-specific preferences.
- Avoid encoding one-off reviewer preferences as universal rules.
- If the feedback points to missing repository context, add that context only if it improves review precision.
- Do not mix code-review feedback into the spec skill, or spec-review feedback into the code skill.

## Intermediary State

The script builds structured JSON that captures:

- pull request metadata for the recent PR window, including `review_type` classification
- agent-authored review comments that received human replies
- human-authored review comments from the same PRs, even when they were not replying to the bot
- thread metadata like file path, line, resolution, and outdated state
- normalized agent-comment fields such as severity label and whether a suggestion block was present
- the full set of human replies for each agent comment
- top-level PR issue comments for broader review context

Use that temporary data as evidence when refining the skills, then remove it before finishing if you wrote it to disk explicitly.

## Final Checks

- Re-read the updated `review-pr-local` and/or `review-spec-local` companion skills and confirm any new rules are explicit.
- Keep each companion concise; do not turn them into long style guides.
- Commit any changes on a local branch named `agent/update-pr-review`. Do NOT push the branch unless the surrounding workflow explicitly asks for it.
- If the updates warrant a PR, it should be opened by the surrounding workflow or maintainer, not by the skill itself.
- Validate any temporary JSON with `jq` before relying on it.
