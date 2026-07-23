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

// orphans outrank every reference tier: the scanner proved the target is gone
const ORPHAN_CONFIDENCE = 5;

const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|rb|c|h|cpp|hpp)$/;
const BACKTICK_TOKEN = /`([^`\n]+)`/g;
const IDENT_TOKEN = /[A-Za-z_$][\w$]*/g;

// a doc this saturated with references is probably *about* the changed file
const REWRITE_MIN_LINES = 3;
const REWRITE_DENSITY = 0.3;

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
      if (matchesAny(entry.isDirectory() ? childRel + '/' : childRel, ignoreRes)) continue;
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

function collectBacktickTokens(line) {
  BACKTICK_TOKEN.lastIndex = 0;
  const tokens = [];
  let m;
  while ((m = BACKTICK_TOKEN.exec(line)) !== null) tokens.push(m[1]);
  return tokens;
}

// path-like means a concrete repo-relative file name: not a glob, not a
// phrase, not an absolute path or slash command
function looksLikePath(token) {
  if (/[\s*?{}]/.test(token) || token.startsWith('/')) return false;
  return token.includes('/') || SOURCE_EXT.test(token);
}

function symbolToken(token) {
  const bare = token.replace(/\(\)$/, '');
  if (/^--[a-z][a-z0-9-]{2,}$/.test(bare)) return bare;
  if (
    /^[A-Za-z_$][\w$]*$/.test(bare) &&
    bare.length >= MIN_SYMBOL_LENGTH &&
    !STOP_WORDS.has(bare.toLowerCase())
  ) {
    return bare;
  }
  return null;
}

function tokenizeIdentifiers(content, into) {
  IDENT_TOKEN.lastIndex = 0;
  let m;
  while ((m = IDENT_TOKEN.exec(content)) !== null) into.add(m[0]);
  FLAG_PATTERN.lastIndex = 0;
  while ((m = FLAG_PATTERN.exec(content)) !== null) into.add(m[1]);
}

function findOrphans(root, docs, filePaths, identifiers) {
  const paths = new Set(filePaths);
  const basenames = new Set(filePaths.map((rel) => path.basename(rel)));
  const findings = [];
  for (const doc of docs) {
    const lines = doc.content.split('\n');
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(```|~~~)/.test(line)) {
        inCode = !inCode;
        continue;
      }
      // fenced blocks quote example code and output; backticks inside them
      // are content, not references
      if (inCode) continue;
      for (const token of collectBacktickTokens(line)) {
        if (looksLikePath(token)) {
          const clean = token.replace(/^\.\//, '');
          if (paths.has(clean) || basenames.has(path.basename(clean))) continue;
          if (fs.existsSync(path.join(root, clean))) continue;
          findings.push({
            doc: doc.rel, line: i + 1, matched: token, kind: 'orphan-path',
            inCode, confidence: ORPHAN_CONFIDENCE, source: null,
          });
        } else {
          const sym = symbolToken(token);
          if (sym && !identifiers.has(sym)) {
            findings.push({
              doc: doc.rel, line: i + 1, matched: token, kind: 'orphan-symbol',
              inCode, confidence: ORPHAN_CONFIDENCE, source: null,
            });
          }
        }
      }
    }
  }
  return findings;
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

function checkContent(sourceRel, content, docs) {
  const symbolRe = buildSymbolRegExp(extractSymbols(content));
  const findings = [];
  for (const doc of docs) {
    findings.push(...scanDoc(doc.rel, doc.content, sourceRel, symbolRe));
  }
  return findings;
}

// only lines that name the changed file get this check; the identifier may
// exist elsewhere in the repo, so the phrasing stays scoped to this file
function findDeadMentions(referenceFindings, docs, sourceContent) {
  const docLines = new Map(docs.map((d) => [d.rel, d.content.split('\n')]));
  const findings = [];
  const seen = new Set();
  for (const f of referenceFindings) {
    if (f.kind !== 'path') continue;
    const line = docLines.get(f.doc)[f.line - 1];
    for (const token of collectBacktickTokens(line)) {
      const sym = symbolToken(token);
      if (!sym || sourceContent.includes(sym)) continue;
      const key = f.doc + ':' + f.line + ':' + sym;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        doc: f.doc, line: f.line, matched: sym, kind: 'dead-mention',
        inCode: f.inCode, confidence: ORPHAN_CONFIDENCE, source: f.source,
      });
    }
  }
  return findings;
}

function describe(f) {
  const where = f.inCode ? 'fenced code block' : 'prose';
  switch (f.kind) {
    case 'orphan-path':
      return `${f.doc}:${f.line} references \`${f.matched}\`, which does not exist (${where})`;
    case 'orphan-symbol':
      return `${f.doc}:${f.line} mentions \`${f.matched}\`, which is not defined anywhere in the codebase (${where})`;
    case 'dead-mention':
      return `${f.doc}:${f.line} mentions \`${f.matched}\`, which no longer appears in this file (${where})`;
    case 'removed':
      return `${f.doc}:${f.line} mentions \`${f.matched}\`, which this edit removed or renamed (${where})`;
    default: {
      const what = f.kind === 'path' ? 'references' : 'mentions';
      return `${f.doc}:${f.line} ${what} \`${f.matched}\` (${where})`;
    }
  }
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

  const content = readSmallFile(path.join(root, sourceRel));
  if (content === null) return;

  const references = checkContent(sourceRel, content, docs);
  const dead = findDeadMentions(references, docs, content);
  const seen = new Set();
  const merged = [];
  for (const f of [...dead, ...references]) {
    const key = f.doc + ':' + f.line + ':' + f.matched;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(f);
  }
  if (!merged.length) return;

  const findings = merged
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_HOOK_FINDINGS);

  const lineCount = new Map(docs.map((d) => [d.rel, d.content.split('\n').length]));
  const hitLines = new Map();
  for (const f of merged) {
    if (!hitLines.has(f.doc)) hitLines.set(f.doc, new Set());
    hitLines.get(f.doc).add(f.line);
  }
  const rewriteCandidates = [];
  for (const [doc, hits] of hitLines) {
    const total = lineCount.get(doc);
    if (hits.size >= REWRITE_MIN_LINES && hits.size / total >= REWRITE_DENSITY) {
      rewriteCandidates.push(`${doc} (${hits.size} of ${total} lines reference it)`);
    }
  }

  const list = findings.map((f) => '- ' + describe(f)).join('\n');
  const parts = [
    `stale-docs: documentation references \`${sourceRel}\`, which was just modified.`,
    '',
    list,
    '',
    'Check every reference against the current source code, not against what the',
    'doc claims. The code is the only authority; keep a doc statement only if you',
    'can reproduce it from the source. Repair at the smallest scale that makes the',
    'doc true: patch names, signatures, flags, and defaults that changed; delete',
    'sentences or sections describing code that no longer exists; rewrite the whole',
    'file from the source when most of it is stale.',
  ];
  if (rewriteCandidates.length) {
    parts.push('', 'These docs are mostly about the changed file, so consider a full rewrite:');
    for (const c of rewriteCandidates) parts.push('- ' + c);
  }
  parts.push(
    '',
    'Leave accurate lines untouched. Stage the doc fixes with the code change so',
    'they land in the same commit. The stale-docs skill has the full rules.'
  );
  const context = parts.join('\n');

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
    return 0;
  }

  const files = walk(root, ignoreRes, MAX_SOURCE_FILES * 5);
  const sources = files.filter((rel) => matchesAny(rel, sourceRes)).slice(0, MAX_SOURCE_FILES);

  const identifiers = new Set();
  const all = [];
  for (const sourceRel of sources) {
    const content = readSmallFile(path.join(root, sourceRel));
    if (content === null) continue;
    tokenizeIdentifiers(content, identifiers);
    all.push(...checkContent(sourceRel, content, docs));
  }
  all.push(...findOrphans(root, docs, files, identifiers));

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
    return 0;
  }
  const out = ranked
    .map((f, i) => `${i + 1}. ${describe(f)}` + (f.source ? `, from ${f.source}` : ''))
    .join('\n');
  process.stdout.write(out + '\n');
  return 0;
}

let exitCode = 0;
try {
  if (process.argv.includes('--audit')) {
    exitCode = runAudit();
  } else {
    runHook();
  }
} catch {
  // a doc-staleness check must never break the user's edit or block a merge
  exitCode = 0;
}
process.exit(exitCode);
