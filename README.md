# stale-docs

Your docs can never lie again.

When a code change makes documentation outdated, stale-docs detects it and gets the docs patched **in the same commit**. No CI job, no follow-up PR, no "docs cleanup" ticket that dies in the backlog.

## Before / after

**Without stale-docs:** you rename `--output` to `--out-dir`. The README still shows `--output`. Three weeks later a user copies the example, it fails, and they file an issue. You fix the README in a commit titled "docs: oops". Everyone involved has had a worse day than necessary.

**With stale-docs:** you rename the flag. A hook notices the README references it, tells the agent exactly which lines are affected, and the README is patched before the task ends. Code and docs land in one commit. Nobody files anything.

## Install (30 seconds)

```
/plugin marketplace add SectionTN/stale-docs
/plugin install stale-docs@stale-docs
```

That's it. No config required. See [INSTALL.md](INSTALL.md) for the manual route and configuration.

## How it works

```
stale-docs/
├── hooks/
│   ├── hooks.json          fires after every Edit/Write on source files
│   └── check-stale.js      the scanner — deterministic, zero deps, ~35ms
├── skills/stale-docs/
│   └── SKILL.md            patching rules: minimal diffs, exact signatures
├── commands/
│   └── stale-docs.md       /stale-docs — audit the whole repo on demand
└── .stale-docs.json        optional config (globs, ignore list)
```

1. A PostToolUse hook fires after every `Edit`/`Write` on a source file (js, ts, py, go, rs, and friends — configurable).
2. `check-stale.js` extracts the file's exported symbols (functions, classes, CLI flags) and scans README.md, root markdown, and `docs/**` for references — by file path, by symbol name, inside fenced code blocks and API tables.
3. If anything references the changed code, the hook injects context listing each affected `file:line`, ranked by confidence. The agent verifies each reference against the edit it just made and patches the ones that went stale — minimally, staged with the code.
4. If nothing references the changed code, the hook says nothing. Zero noise.

There's also `/stale-docs`, which audits the entire repo and reports the 10 most confident stale references, ranked.

## Configuration

Optional. Drop a `.stale-docs.json` in your repo root to override the defaults:

```json
{
  "sourceGlobs": ["**/*.{js,jsx,ts,tsx,mjs,cjs,py,go,rs,java,rb,c,h,cpp,hpp}"],
  "docGlobs": ["README.md", "*.md", "docs/**/*.md"],
  "ignore": ["**/node_modules/**", "**/dist/**", "**/build/**", "**/vendor/**", "**/target/**"]
}
```

## FAQ

**Does this slow down my edits?**
The scanner runs in about 35ms on a medium repo. It skips ignored directories, caps at 500 doc files, and refuses to read anything over 1MB. You will not notice it.

**What if the scanner crashes?**
It doesn't, and if it somehow did, it fails silently and exits 0. A doc check is never allowed to break your edit.

**Won't I get false positives?**
The scanner reports *references*, not verdicts. If a doc mentions `parseArgs` and you just edited the file that exports it, that's worth a look — the agent does the actual judgment with the edit in context, and leaves accurate docs alone. Generic identifiers (`main`, `init`, `run`...) are filtered out so they don't trigger anything.

**Can it detect the old signature specifically?**
No, and I won't pretend otherwise. The hook fires after the edit, so the scanner only sees the new state of the file. It finds every doc that references the changed file or its symbols; the agent — which just made the edit and knows exactly what changed — decides what's stale. Deterministic scanner, semantic judgment where the context lives.

**Does it rewrite my docs?**
It patches the lines that are wrong and nothing else. The skill forbids rephrasing, reformatting, and section rewrites. If one flag changed, one flag changes in your README.

**What about docstrings and JSDoc in other files?**
Symbol references in any scanned markdown are covered. In-code docstrings in *other* source files aren't scanned by the hook — that's what `/stale-docs` audits are for.

## License

MIT
