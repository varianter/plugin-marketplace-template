---
name: triage-issue-local
specializes: triage-issue
description: Repo-specific triage guidance for varianter/plugin-template. Only the categories declared overridable by the core triage-issue skill may be specialized here.
---

# Repo-specific triage guidance for `varianter/plugin-template`

This file is a companion to the core `triage-issue` skill. It does not
redefine the triage output schema, safety rules, or follow-up-question
contract. It only specializes the override categories the core skill
marks as overridable.

## Heuristics

- Distinguish observed symptoms from reporter hypotheses and proposed fixes.
- Before asking any follow-up question, first try to answer it yourself through code inspection, documentation lookup, or web search. Only ask questions that you cannot resolve on your own and that only the reporter would know.
- Ask targeted follow-up questions only for details the agent cannot derive itself and that materially improve triage confidence.
- Prefer issue-specific questions over generic "please share more info" requests.
- Classify issues against this repository's main areas: shared MCP server infrastructure, plugin templates, skill validation, MCP tool/widget patterns, package/build configuration, authentication/configuration, and deployment workflows.
- Do not ask for terminal, GPU, shell-integration, window-manager, or desktop-runtime diagnostics unless the issue is explicitly about a local development command where that information is directly relevant.

## Label taxonomy

The label taxonomy for this repository is managed in `.github/issue-triage/config.json` when present. Prefer labels from that configuration, and avoid inventing new labels unless the prompt explicitly allows it.

## Recurring follow-up patterns

No repo-specific follow-up patterns have been captured for this repository yet. For this plugin-template repository, useful follow-up questions are most likely to concern:

- the plugin name and file path being changed
- the exact MCP tool or skill involved
- the local command that failed and its output
- relevant environment variables with secrets redacted
- whether the issue occurs in local development, skill packaging, MCP inspection, or deployment

The weekly `update-triage` loop will propose additions as maintainer overrides reveal recurring patterns.

## Owner-inference hints

No repo-specific owner-inference hints beyond `.github/STAKEHOLDERS` have been captured yet.
