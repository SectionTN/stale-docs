# stale-docs

Your docs can never lie again.

You change code and the README quietly stops being true. Nobody notices until a stranger does. stale-docs catches the drift the moment it happens and gets the docs patched in the same commit as the code, so there is nothing to clean up later.

## Before / after

Without stale-docs: you rename `--output` to `--out-dir`. The README still shows `--output`. Three weeks later a user copies the example, it fails, and they file an issue. You fix the README in a commit titled "docs: oops" and apologize in the thread.

With stale-docs: you rename the flag, a hook notices the README references it, and the line is fixed before the task ends. Code and docs land in one commit. Nobody files anything.

## Install (30 seconds)

```
/plugin marketplace add SectionTN/stale-docs
/plugin install stale-docs@stale-docs
```

That's it. It works with zero config. [INSTALL.md](INSTALL.md) covers the manual route and the config file.

## How it works

```
stale-docs/
├── hooks/
│   ├── hooks.json          fires after every Edit/Write on source files
│   └── check-stale.js      the scanner: deterministic, zero dependencies, ~35ms
├── skills/stale-docs/
│   └── SKILL.md            patching rules the agent follows
├── commands/
│   └── stale-docs.md       /stale-docs audits the whole repo on demand
└── .stale-docs.json        optional config (globs, ignore list)
```

1. A PostToolUse hook fires whenever a source file gets edited. The extension list is configurable; the default covers js, ts, py, go, rs, and the other usual suspects.
2. `check-stale.js` pulls the exported names out of the changed file (functions, classes, CLI flags) and looks for them in your markdown, along with the file's path. A hit inside a fenced code block counts for more than a mention in prose.
3. If anything references the changed code, the hook hands the agent a list of `file:line` locations and tells it to check each one against the edit it just made. Lines that went stale get patched and staged with the code.
4. If nothing references the changed code, the hook prints nothing. You will forget it's installed until the day it saves you.

There is also `/stale-docs`, which audits the entire repo and reports the ten most confident findings, ranked.

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

The scanner takes about 35ms on a medium repo. It skips ignored directories, stops at 500 doc files, and refuses to read anything over 1MB. You won't feel it.

**What if the scanner crashes?**

It exits 0 and stays quiet. The whole program runs inside one try/catch, which is inelegant and exactly right: a doc check is never allowed to break your edit.

**Won't I get false positives?**

The scanner reports references, and a reference is not a verdict. The agent that just made the edit decides whether each doc is actually wrong, and it leaves accurate docs alone. Generic names like `main` and `init` are filtered out so they never trigger anything.

**Can it detect the old signature specifically?**

No. The hook runs after the edit, so the scanner only ever sees the new version of the file. I could have snapshotted old state and diffed signatures, but that's a cache with opinions, and it would be wrong often. Instead the scanner finds every doc that mentions the changed file, and the agent, which knows exactly what it changed, judges what's stale. The dumb part stays deterministic and the judgment happens where the context lives.

**Does it rewrite my docs?**

It fixes the lines that are wrong and stops. The skill forbids rephrasing, reformatting, and section rewrites. If one flag changed, one flag changes in your README.

**What about docstrings and JSDoc in other files?**

The hook only scans markdown. When you want a wider sweep, run `/stale-docs`.

## License

MIT
