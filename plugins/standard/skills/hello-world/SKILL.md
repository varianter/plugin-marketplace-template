---
name: hello-world-widget
description: >
  Demonstrates how to combine a Claude skill with a colocated MCP tool and
  interactive widget in this template repository. Use when the user asks for a
  hello world demo, widget demo, skill + MCP example, or template example.
---

# Hello World Widget Demo

This skill demonstrates the template repository pattern for a skill with a colocated MCP tool and widget.

## When to use

Use this skill when the user asks for:

- A Hello World demo
- An example of a skill that opens a widget
- A demonstration of skill-colocated MCP tools
- A reference for how to build widgets in this template repository

## Steps

1. Ask for an optional name or message if the user has not provided one.
2. Call the `hello-world-widget` MCP tool with the provided values.
3. Explain that the widget is intentionally simple and exists to show the technical wiring:
   - skill instructions in `SKILL.md`
   - tool registration in `mcp/src/registerTools.ts`
   - colocated tool and widget files under this skill's `mcp/` directory

```ts
hello-world-widget({
  name: '<optional name>',
  message: '<optional message>'
})
```
