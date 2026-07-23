---
description: Audit the whole repo for stale documentation references
allowed-tools: Bash(node:*), Read, Grep, Glob
---

Run a full-repo staleness audit and report the results.

1. Run the scanner in audit mode from the repository root:

```
node "${CLAUDE_PLUGIN_ROOT}/hooks/check-stale.js" --audit
```

2. The output is a ranked list capped at the 10 most confident findings, in the form
   `N. doc.md:line mentions \`x\` (fenced code block), from src/file.js`.
   Findings in fenced code blocks or referencing file paths rank above prose mentions.

3. For each finding, read the doc location and the referenced source file, then judge whether the doc still matches the code (signature, parameters, flags, defaults, behavior). Judge against the source only. Never mark a claim accurate because it agrees with another doc or sounds right; the scanner reports references, not verdicts, and a reference can be perfectly accurate.

4. Present the results as a table with three columns: `file:line`, what it references, and a verdict. Use **stale** when the doc contradicts current code (say what differs), **accurate** when you verified it against source, and **unclear** when it needs a human.

5. If any findings are stale, offer to repair them with the stale-docs skill: patch wrong details, delete claims about code that no longer exists, rewrite a file from the source when most of it is stale.

If the scanner prints `no stale doc references found` or `no doc files found`, say so and stop.
