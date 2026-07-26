---
name: stale-docs
description: Use when a stale-docs hook or /stale-docs audit reports documentation referencing code that was just changed. Repairs the affected docs against the current source, from a one-word patch up to a full rewrite, staged in the same commit as the code change.
---

# Repairing stale documentation

You have a list of doc locations (`file:line`) that reference a changed source file or its symbols. Your job is to make those docs true again.

The source code is the only authority. Never accept a doc claim because it sounds plausible, and never copy a fact from one doc into another. Every statement you keep or write must be reproducible from the current code. A doc is a cache of the codebase, and this skill is the invalidation step.

## Process

1. Read the current source file. Repair against what the code says now, not your memory of the edit.
2. Read each reported doc location with enough context to know what it claims.
3. Check every claim against the source: names, signatures, parameters, CLI flags, defaults, return values, behavior.
4. Repair at the smallest scale that makes the doc true (see below).
5. If the code change is staged or about to be committed, stage the doc edits too, so code and docs land in the same commit.

## Repair scale

Patch when the claim is right about the wrong details: a renamed flag, a changed default, an outdated signature. Change only the words that are wrong. If one flag was renamed, exactly one flag changes in the doc.

Delete when the claim describes something the code no longer has: a removed function, a dropped option, behavior that no longer exists. Remove the whole sentence, list item, or section cleanly, and fix anything that referred to it. A doc that says nothing beats a doc that lies.

Rewrite when most of the file is stale. If patching would touch more lines than it leaves alone, or the hook flagged the doc as mostly about the changed file, rebuild the file from the source code. Keep the original headings and structure where they still fit, but derive every fact in the new version from the code, never from the old doc. Write the new version in the original author's voice, not your default one; the diff should read like the maintainer finally sat down and did it. Sections the code cannot speak to at all, like licenses, badges, credits, and external links, get carried over verbatim rather than rederived or dropped, and flagged if they look suspect.

## Rules

Keep the author's voice when patching. Do not rephrase sentences, fix unrelated typos, or reformat anything. A patch diff should read as if the original author made it.

Fenced code examples must match the new code exactly: parameter names, order, defaults, flag spelling, return shape. The goal is a code block that runs against the current code. If the change altered expected output shown in the doc and you can determine the new output, update that too.

In API tables, fix only the cells that are wrong, and drop rows for things the code no longer has. Keep the column layout.

If a symbol was renamed, update every occurrence of it in the affected docs. A half-renamed doc is worse than a stale one.

Changelogs are history. Never edit past entries; if the repo keeps an unreleased or pending section, note the change there instead.

Some findings arrive already proven. When the scanner says a reference does not exist, is not defined anywhere in the codebase, no longer appears in the file, or was removed or renamed by the edit, it has checked the code itself. Skip verification for those: delete the claim, or repoint it to the replacement if the edit shows one.

If you cannot verify a claim from the code at all (it describes deployment, people, or history the code cannot show), leave it alone and flag it in your summary rather than guessing.

## Output

After repairing, summarize in one short list: each doc `file:line`, and whether it was patched, deleted, rewritten, verified accurate, or flagged for a human.
