---
name: stale-docs
description: Use when a stale-docs hook or /stale-docs audit reports documentation referencing code that was just changed. Patches the affected docs with minimal diffs so they match the new code, staged in the same commit as the code change.
---

# Patching stale documentation

You have a list of doc locations (`file:line`) that reference a changed source file or its symbols. Your job is to make those docs true again, and nothing else.

## Process

1. Read each reported doc location with enough surrounding context to understand what it claims.
2. Compare the claim against the change you just made: new names, signatures, parameters, CLI flags, defaults, return values, behavior.
3. If the claim is still accurate, leave it untouched and report it as verified.
4. If the claim is stale, patch it following the rules below.
5. If the code change is staged or about to be committed, stage the doc edits too, so code and docs land in the same commit.

## Rules

Change only the words, identifiers, or lines that are now wrong. If one flag was renamed, exactly one flag changes in the doc.

Keep the author's voice. Do not rephrase sentences, fix unrelated typos, or reformat anything. The diff should read as if the original author made it.

Never rewrite a whole section. If a section looks broadly outdated beyond the reported lines, patch what was reported and tell the user the rest may need a human pass.

Fenced code examples must match the new code exactly: parameter names, order, defaults, flag spelling, return shape. The goal is a code block that runs against the current code. If the change altered expected output shown in the doc and you can determine the new output, update that too.

In API tables, fix only the cells that are wrong. Keep the column layout and row order.

If a symbol was renamed, update every occurrence of it in the affected docs. A half-renamed doc is worse than a stale one.

Changelogs are history. Never edit past entries; if the repo keeps an unreleased or pending section, note the change there instead.

If you cannot tell whether a reference is stale (ambiguous symbol, or the doc describes behavior you did not touch), leave it alone and flag it in your summary rather than guessing.

## Output

After patching, summarize in one short list: each doc `file:line`, and whether it was patched, verified accurate, or flagged for a human.
