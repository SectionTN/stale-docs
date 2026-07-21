---
name: stale-docs
description: Use when a stale-docs hook or /stale-docs audit reports documentation referencing code that was just changed. Patches the affected docs with minimal diffs so they match the new code, staged in the same commit as the code change.
---

# Patching stale documentation

You have a list of doc locations (`file:line`) that reference a changed source file or its symbols. Your job is to make those docs true again — nothing more.

## Process

1. Read each reported doc location with enough surrounding context to understand what it claims.
2. Compare the claim against the change you just made (new names, signatures, parameters, CLI flags, defaults, return values, behavior).
3. If the claim is still accurate, leave it untouched. Report it as verified, not patched.
4. If the claim is stale, patch it following the rules below.
5. If the code change is staged or about to be committed, stage the doc edits too, so code and docs land in the same commit.

## Rules

**Minimal diffs.** Change only the words, identifiers, or lines that are now wrong. If one flag was renamed, one flag changes in the doc.

**Keep the author's voice.** Do not rephrase sentences, "improve" wording, fix unrelated typos, or reformat. The diff should read as if the original author updated it.

**Never rewrite whole sections.** If a section seems broadly outdated beyond the reported references, patch the reported lines and tell the user the section may need a human pass — do not redesign it.

**Code blocks must match the code exactly.** Update fenced examples to the new signature verbatim: parameter names, order, defaults, flag spelling, return shape. A code block that runs against the new code is the goal. Update expected-output lines if the change altered them and you can determine the new output.

**API tables cell by cell.** Fix only the cells that are wrong (name, signature, default, description of changed behavior). Keep column layout and row order.

**Renames propagate fully within a reported doc.** If `parseArgs` became `parseArguments`, update every occurrence in the affected docs — a half-renamed doc is worse than a stale one.

**Changelogs are history — do not edit past entries.** If the repo keeps an unreleased/pending section, note the change there instead.

**When unsure, say so.** If you cannot tell whether a reference is stale (ambiguous symbol, doc describes behavior you did not touch), leave it and flag it in your summary rather than guessing.

## Output

After patching, summarize in one short list: each doc `file:line`, whether it was patched, verified accurate, or flagged for a human.
