#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  sourceGlobs: ['**/*.{js,jsx,ts,tsx,mjs,cjs,py,go,rs,java,rb,c,h,cpp,hpp}'],
  docGlobs: ['README.md', '*.md', 'docs/**/*.md'],
  ignore: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/vendor/**',
    '**/target/**',
  ],
};

const MAX_DOC_FILES = 500;
const MAX_SOURCE_FILES = 2000;
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_SYMBOLS_PER_FILE = 50;
const MAX_HOOK_FINDINGS = 20;
const AUDIT_LIMIT = 10;
const MIN_SYMBOL_LENGTH = 3;

// identifiers too generic to prove a doc refers to *this* file
const STOP_WORDS = new Set([
  'main', 'init', 'new', 'get', 'set', 'run', 'test', 'index', 'data',
  'name', 'type', 'value', 'error', 'result', 'args', 'options', 'config',
  'default', 'start', 'stop', 'update', 'create', 'delete', 'read', 'write',
  'app', 'use', 'add', 'remove', 'list', 'item', 'key', 'state', 'props',
]);

const SYMBOL_PATTERNS = [
  /\bexport\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
  /\bexport\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /\bexport\s+(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  /\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g,
  /^def\s+([A-Za-z_]\w*)/gm,
  /^(?:export\s+)?class\s+([A-Za-z_]\w*)/gm,
  /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm,
  /\bpub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)/g,
  /\bpub\s+(?:struct|enum|trait)\s+([A-Za-z_]\w*)/g,
];

const FLAG_PATTERN = /["'`](--[a-z][a-z0-9-]{2,})["'`]/g;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        i += 1;
      } else {
        const parts = glob.slice(i + 1, end).split(',').map(escapeRegExp);
        re += '(?:' + parts.join('|') + ')';
        i = end + 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else {
      re += escapeRegExp(c);
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

function compileGlobs(globs) {
  return globs.map(globToRegExp);
}

function matchesAny(relPath, regexps) {
  return regexps.some((re) => re.test(relPath));
}

function loadConfig(root) {
  try {
    const raw = fs.readFileSync(path.join(root, '.stale-docs.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      sourceGlobs: Array.isArray(parsed.sourceGlobs) ? parsed.sourceGlobs : DEFAULTS.sourceGlobs,
      docGlobs: Array.isArray(parsed.docGlobs) ? parsed.docGlobs : DEFAULTS.docGlobs,
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : DEFAULTS.ignore,
    };
  } catch {
    return DEFAULTS;
  }
}

function walk(root, ignoreRes, limit) {
  const out = [];
  const stack = ['.'];
  while (stack.length && out.length < limit) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel === '.' ? entry.name : rel + '/' + entry.name;
      if (matchesAny(childRel + (entry.isDirectory() ? '/' : ''), ignoreRes)) continue;
      if (matchesAny(childRel, ignoreRes)) continue;
      if (entry.isDirectory()) {
        stack.push(childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

function readSmallFile(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function extractSymbols(content) {
  const symbols = new Set();
  for (const pattern of SYMBOL_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const name = m[1];
      if (name.length >= MIN_SYMBOL_LENGTH && !STOP_WORDS.has(name.toLowerCase())) {
        symbols.add(name);
      }
      if (symbols.size >= MAX_SYMBOLS_PER_FILE) return [...symbols];
    }
  }
  FLAG_PATTERN.lastIndex = 0;
  let m;
  while ((m = FLAG_PATTERN.exec(content)) !== null) {
    symbols.add(m[1]);
    if (symbols.size >= MAX_SYMBOLS_PER_FILE) break;
  }
  return [...symbols];
}

function buildSymbolRegExp(symbols) {
  if (!symbols.length) return null;
  const alternatives = symbols
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp('(?<![\\w$-])(' + alternatives + ')(?![\\w$])');
}

// confidence: how likely a hit means the doc shows this code
function score(kind, inCode) {
  if (kind === 'path') return inCode ? 4 : 2;
  return inCode ? 3 : 1;
}

function scanDoc(docRel, content, sourceRel, symbolRe) {
  const findings = [];
  const basename = path.basename(sourceRel);
  const lines = content.split('\n');
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    let matched = null;
    let kind = null;
    if (line.includes(sourceRel) || line.includes(basename)) {
      matched = line.includes(sourceRel) ? sourceRel : basename;
      kind = 'path';
    } else if (symbolRe) {
      const m = symbolRe.exec(line);
      if (m) {
        matched = m[1];
        kind = 'symbol';
      }
    }
    if (matched) {
      findings.push({
        doc: docRel,
        line: i + 1,
        matched,
        kind,
        inCode,
        confidence: score(kind, inCode),
        source: sourceRel,
      });
    }
  }
  return findings;
}

function collectDocs(root, config, excludeRel) {
  const docRes = compileGlobs(config.docGlobs);
  const ignoreRes = compileGlobs(config.ignore);
  const files = walk(root, ignoreRes, MAX_DOC_FILES * 10);
  const docs = [];
  for (const rel of files) {
    if (docs.length >= MAX_DOC_FILES) break;
    if (rel === excludeRel) continue;
    if (!matchesAny(rel, docRes)) continue;
    const content = readSmallFile(path.join(root, rel));
    if (content !== null) docs.push({ rel, content });
  }
  return docs;
}

function checkFile(root, sourceRel, docs) {
  const content = readSmallFile(path.join(root, sourceRel));
  if (content === null) return [];
  const symbolRe = buildSymbolRegExp(extractSymbols(content));
  const findings = [];
  for (const doc of docs) {
    findings.push(...scanDoc(doc.rel, doc.content, sourceRel, symbolRe));
  }
  return findings;
}

function describe(f) {
  const where = f.inCode ? 'fenced code block' : 'prose';
  const what = f.kind === 'path' ? 'references' : 'mentions';
  return `${f.doc}:${f.line} ${what} \`${f.matched}\` (${where})`;
}

function runHook() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const filePath = input && input.tool_input && input.tool_input.file_path;
  if (!filePath) return;
  const root = input.cwd || process.cwd();
  const sourceRel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  if (sourceRel.startsWith('..')) return;

  const config = loadConfig(root);
  if (matchesAny(sourceRel, compileGlobs(config.ignore))) return;
  if (!matchesAny(sourceRel, compileGlobs(config.sourceGlobs))) return;

  const docs = collectDocs(root, config, sourceRel);
  if (!docs.length) return;

  const findings = checkFile(root, sourceRel, docs)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_HOOK_FINDINGS);
  if (!findings.length) return;

  const list = findings.map((f) => '- ' + describe(f)).join('\n');
  const context = [
    `stale-docs: documentation references \`${sourceRel}\`, which was just modified.`,
    '',
    list,
    '',
    'Before finishing this task, verify each reference against the edit you just made.',
    'If the change altered names, signatures, CLI flags, defaults, or behavior shown in',
    'these docs, patch them minimally: update code blocks to match the new code exactly,',
    'keep the surrounding wording as-is, and stage the doc fixes together with the code',
    'change so they land in the same commit. If a reference is still accurate, leave it',
    'alone. The stale-docs skill has patching guidelines.',
  ].join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
}

function runAudit() {
  const root = process.cwd();
  const config = loadConfig(root);
  const sourceRes = compileGlobs(config.sourceGlobs);
  const ignoreRes = compileGlobs(config.ignore);
  const docs = collectDocs(root, config, null);
  if (!docs.length) {
    process.stdout.write('no doc files found\n');
    return;
  }

  const sources = walk(root, ignoreRes, MAX_SOURCE_FILES * 5)
    .filter((rel) => matchesAny(rel, sourceRes))
    .slice(0, MAX_SOURCE_FILES);

  const all = [];
  for (const sourceRel of sources) {
    all.push(...checkFile(root, sourceRel, docs));
  }

  const best = new Map();
  for (const f of all) {
    const key = f.doc + ':' + f.line;
    const prev = best.get(key);
    if (!prev || f.confidence > prev.confidence) best.set(key, f);
  }

  const ranked = [...best.values()]
    .sort((a, b) => b.confidence - a.confidence || a.doc.localeCompare(b.doc) || a.line - b.line)
    .slice(0, AUDIT_LIMIT);

  if (!ranked.length) {
    process.stdout.write('no stale doc references found\n');
    return;
  }
  const out = ranked
    .map((f, i) => `${i + 1}. ${describe(f)}, from ${f.source}`)
    .join('\n');
  process.stdout.write(out + '\n');
}

try {
  if (process.argv.includes('--audit')) {
    runAudit();
  } else {
    runHook();
  }
} catch {
  // a doc-staleness check must never break the user's edit
}
process.exit(0);
