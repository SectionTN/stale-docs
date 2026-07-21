# Installing stale-docs

## From the marketplace (recommended)

Inside Claude Code:

```
/plugin marketplace add SectionTN/stale-docs
/plugin install stale-docs@stale-docs
```

Restart Claude Code if prompted. Done — the hook is active for every session in every repo.

## Manual install

```
git clone https://github.com/SectionTN/stale-docs.git ~/.claude-plugins/stale-docs
```

Then add it as a local marketplace:

```
/plugin marketplace add ~/.claude-plugins/stale-docs
/plugin install stale-docs@stale-docs
```

## Requirements

- Claude Code with plugin support
- Node.js 18+ on your PATH (the scanner is a single zero-dependency script)

## Verify it works

1. Open any repo with a README that mentions one of its source files.
2. Ask Claude to edit that source file.
3. After the edit, the agent should mention checking doc references before finishing.

Or run `/stale-docs` for a full-repo audit at any time.

## Configuration

Everything works with zero config. To customize, create `.stale-docs.json` in the repo root:

| Key | Default | Meaning |
|-----|---------|---------|
| `sourceGlobs` | `**/*.{js,jsx,ts,tsx,mjs,cjs,py,go,rs,java,rb,c,h,cpp,hpp}` | files whose edits trigger the check |
| `docGlobs` | `README.md`, `*.md`, `docs/**/*.md` | docs that get scanned |
| `ignore` | `node_modules`, `.git`, `dist`, `build`, `vendor`, `target` | never walked or scanned |

Missing or invalid config falls back to defaults silently.

## Uninstall

```
/plugin uninstall stale-docs@stale-docs
```
