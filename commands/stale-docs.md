---
description: Audit the whole repo for stale documentation references
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run a full-repo staleness audit and report the results.

1. Run the scanner in audit mode from the repository root:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/check-stale.js" --audit
```

2. The output is a ranked list, capped at the 10 most confident findings, in the form
   `N. doc.md:line — mentions symbol \`x\` (fenced code block) — from src/file.js`.
   Findings in fenced code blocks or referencing file paths rank higher than prose mentions.

3. For each finding, read the doc location and the referenced source file, and judge whether the doc still matches the code (signature, parameters, flags, defaults, behavior). The scanner reports references, not verdicts — a reference can be perfectly accurate.

4. Present the results as a table: `file:line`, what it references, and a verdict — **stale** (doc contradicts current code, say what differs), **accurate** (verified against source), or **unclear** (needs a human).

5. If any findings are stale, offer to patch them using the stale-docs skill: minimal diffs, code blocks updated to match current signatures exactly, author's voice preserved.

If the scanner prints `no stale doc references found` or `no doc files found`, say so and stop.
