#!/usr/bin/env node
'use strict';

// zero-dependency test runner for the scanner; exercises hook mode, audit
// mode, the ci gate, and every silence path against the committed fixture

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCANNER = path.join(__dirname, '..', 'hooks', 'check-stale.js');
const FIXTURE = path.join(__dirname, 'fixture');

let failures = 0;

function run(args, opts) {
  try {
    const stdout = execFileSync('node', [SCANNER, ...args], {
      encoding: 'utf8',
      input: (opts && opts.input) || '',
      cwd: (opts && opts.cwd) || FIXTURE,
    });
    return { stdout, code: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', code: err.status };
  }
}

function hookInput(cwd, toolInput) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: toolInput, cwd });
}

function check(name, ok, detail) {
  if (ok) {
    process.stdout.write(`ok   ${name}\n`);
  } else {
    failures++;
    process.stdout.write(`FAIL ${name}\n     ${detail}\n`);
  }
}

// temp copy of the fixture that tests can mutate
function tempFixture(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-docs-test-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  if (mutate) mutate(dir);
  return dir;
}

// hook: references to the changed file are reported
{
  const r = run([], { input: hookInput(FIXTURE, { file_path: 'src/cli.js' }) });
  check('hook reports references', r.code === 0 && r.stdout.includes('parseArgs') && r.stdout.includes('src/cli.js'), r.stdout.slice(0, 200));
}

// hook: silence paths
{
  const r = run([], { input: hookInput(FIXTURE, { file_path: 'src/internal.js' }) });
  check('hook silent on unreferenced file', r.code === 0 && r.stdout === '', r.stdout.slice(0, 200));
}
{
  const r = run([], { input: hookInput(FIXTURE, { file_path: 'style.css' }) });
  check('hook silent on non-source file', r.code === 0 && r.stdout === '', r.stdout.slice(0, 200));
}
{
  const r = run([], { input: 'not json at all' });
  check('hook silent on garbage stdin', r.code === 0 && r.stdout === '', r.stdout.slice(0, 200));
}

// hook: enabled=false mutes it
{
  const dir = tempFixture((d) => {
    fs.writeFileSync(path.join(d, '.stale-docs.json'), '{"enabled": false}');
  });
  const r = run([], { input: hookInput(dir, { file_path: 'src/cli.js' }), cwd: dir });
  check('hook muted by enabled=false', r.code === 0 && r.stdout === '', r.stdout.slice(0, 200));
  fs.rmSync(dir, { recursive: true, force: true });
}

// hook: edit diff mining reports symbols the edit removed
{
  const dir = tempFixture((d) => {
    const cli = path.join(d, 'src', 'cli.js');
    fs.writeFileSync(cli, fs.readFileSync(cli, 'utf8').replace(/parseArgs/g, 'readArgs'));
  });
  const input = hookInput(dir, {
    file_path: 'src/cli.js',
    old_string: 'export function parseArgs(argv) {',
    new_string: 'export function readArgs(argv) {',
  });
  const r = run([], { input, cwd: dir });
  check('edit diff reports removed symbol', r.stdout.includes('removed or renamed'), r.stdout.slice(0, 300));
  fs.rmSync(dir, { recursive: true, force: true });
}

// hook: no removal finding when the symbol still exists in the file
{
  const input = hookInput(FIXTURE, {
    file_path: 'src/cli.js',
    old_string: 'export function parseArgs(argv) {',
    new_string: 'export function readArgs(argv) {',
  });
  const r = run([], { input });
  check('no removal finding for moved code', !r.stdout.includes('removed or renamed'), r.stdout.slice(0, 300));
}

// audit: orphans rank first
{
  const r = run(['--audit']);
  const lines = r.stdout.trim().split('\n');
  check('audit ranks path orphan first', lines[0].includes('src/legacy.js') && lines[0].includes('does not exist'), lines[0]);
  check('audit reports symbol orphan', r.stdout.includes('removedHelper') && r.stdout.includes('not defined anywhere'), r.stdout.slice(0, 300));
}

// audit: backticked url fragments and extension-less tokens are not path orphans
{
  const r = run(['--audit']);
  check('url fragment is not a path orphan', !r.stdout.includes('latest/download'), r.stdout.slice(0, 300));
  check('version suffix is not a path orphan', !r.stdout.includes('download/v1.0.0'), r.stdout.slice(0, 300));
}

// audit: --ci gates on dead paths only
{
  const r = run(['--audit', '--ci']);
  check('ci exits 1 on dead path', r.code === 1, `exit ${r.code}`);
}
{
  const dir = tempFixture((d) => {
    fs.rmSync(path.join(d, 'docs', 'ghosts.md'));
  });
  const r = run(['--audit', '--ci'], { cwd: dir });
  check('ci exits 0 without dead path', r.code === 0, `exit ${r.code}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// audit: --json parses and carries orphans
{
  const r = run(['--audit', '--json']);
  let rows = null;
  try {
    rows = JSON.parse(r.stdout);
  } catch {}
  check('json output parses', Array.isArray(rows), r.stdout.slice(0, 200));
  check('json includes orphans', rows && rows.some((x) => x.kind === 'orphan'), JSON.stringify(rows && rows.slice(0, 3)));
}

process.stdout.write(failures ? `\n${failures} failing\n` : '\nall passing\n');
process.exit(failures ? 1 : 0);
