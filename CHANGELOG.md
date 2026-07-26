# Changelog

## 0.3.0 - unreleased

- `enabled` config key: set `false` in `.stale-docs.json` to mute the hook in one repo; the `/stale-docs` audit still runs
- test suite in `tests/` with a committed fixture, runnable with `node tests/run.js`
- CI workflow that syntax-checks the scanner, runs the suite, and audits this repo's own docs with `--ci`
- this changelog

## 0.2.0 - 2026-07-26

- orphan detection in audit mode: doc references to files that do not exist and symbols defined nowhere in the codebase are reported as proven stale and ranked first
- edit diff mining: the hook reads the replaced text from Edit and MultiEdit input and reports doc mentions of symbols the edit removed or renamed
- hook flags identifiers a doc pairs with the changed file that no longer appear in it
- `--json` audit flag: every finding as an uncapped JSON array
- `--ci` audit flag: exit 1 when a doc references a file that does not exist
- the skill skips verification for findings the scanner already proved

## 0.1.0 - 2026-07-21

- PostToolUse hook that scans markdown for references to the changed source file and its exported symbols
- confidence ranking: path and symbol hits in fenced code blocks outrank prose mentions
- `/stale-docs` command: full-repo audit, ten most confident findings
- repair skill with tiered scale: patch wrong details, delete claims about removed code, rewrite files that are mostly stale
- optional `.stale-docs.json` config for source globs, doc globs, and ignore list
- zero dependencies, single script, silent exit on any internal error
