'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const child_process = require('child_process');
const { createTestProject } = require('./helpers');

const CLI_PATH = path.resolve(__dirname, '..', 'index.js');

test('CLI: --path flag specifies target directory', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'path-pkg', version: '1.0.0' })
  });
  t.after(proj.cleanup);

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, '--path', proj.dir, '--json'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);
  const parsed = JSON.parse(cp.stdout);
  assert.strictEqual(parsed.project.name, 'path-pkg');
});

test('CLI: --format json and --format text', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'format-pkg', version: '1.0.0' })
  });
  t.after(proj.cleanup);

  const cpJson = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--format', 'json'], { encoding: 'utf8' });
  assert.strictEqual(cpJson.status, 0);
  const parsed = JSON.parse(cpJson.stdout);
  assert.strictEqual(parsed.project.name, 'format-pkg');

  const cpText = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--format', 'text'], { encoding: 'utf8' });
  assert.strictEqual(cpText.status, 0);
  assert.ok(cpText.stdout.includes('DEV CHECK'));
});

test('CLI: --summary produces condensed summary block', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'summary-pkg', version: '1.0.0' })
  });
  t.after(proj.cleanup);

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--summary'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);
  assert.ok(cp.stdout.includes('PROJECT HEALTH:'));
  assert.ok(cp.stdout.includes('Files scanned:'));
});

test('CLI: --strict turns warnings into exit code 1', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'strict-pkg', version: '1.0.0' })
    // Missing README, LICENSE, etc. will produce warnings
  });
  t.after(proj.cleanup);

  const cpNormal = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir], { encoding: 'utf8' });
  assert.strictEqual(cpNormal.status, 0);

  const cpStrict = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--strict'], { encoding: 'utf8' });
  assert.strictEqual(cpStrict.status, 1);
});

test('CLI: --verbose outputs informational diagnostics', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'verbose-pkg', version: '1.0.0' }),
    'src': null // empty folder produces INFO
  });
  t.after(proj.cleanup);

  const cpVerbose = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--verbose'], { encoding: 'utf8' });
  assert.strictEqual(cpVerbose.status, 0);
  assert.ok(cpVerbose.stdout.includes('[INFO]') || cpVerbose.stdout.includes('Info:'));
});

test('CLI: respects .devcheckignore patterns', (t) => {
  const sampleKey = ['AKIA', '1111222233334444'].join('');
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'ignore-pkg', version: '1.0.0' }),
    '.devcheckignore': 'ignored-dir/\n*.secret.js\n',
    'ignored-dir/leak.js': `const key = '${sampleKey}';\n`,
    'test.secret.js': `const key = '${sampleKey}';\n`,
    'normal.js': 'console.log("hello");\n'
  });
  t.after(proj.cleanup);

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--json'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);
  const parsed = JSON.parse(cp.stdout);
  assert.strictEqual(parsed.summary.errors, 0);
});

test('CLI: handles missing argument for --path and --format with exit code 2', () => {
  const cpPath = child_process.spawnSync(process.execPath, [CLI_PATH, '--path'], { encoding: 'utf8' });
  assert.strictEqual(cpPath.status, 2);
  assert.ok(cpPath.stderr.includes('Option --path requires an argument'));

  const cpFmt = child_process.spawnSync(process.execPath, [CLI_PATH, '--format'], { encoding: 'utf8' });
  assert.strictEqual(cpFmt.status, 2);
  assert.ok(cpFmt.stderr.includes('Option --format requires an argument'));

  const cpFmtBad = child_process.spawnSync(process.execPath, [CLI_PATH, '--format', 'yaml'], { encoding: 'utf8' });
  assert.strictEqual(cpFmtBad.status, 2);
  assert.ok(cpFmtBad.stderr.includes('Invalid format'));
});
