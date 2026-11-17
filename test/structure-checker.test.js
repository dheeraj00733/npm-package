'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { checkStructure } = require('../lib/structure-checker');
const { createTestProject } = require('./helpers');

test('Structure Checker: warns on missing project files with appropriate codes', (t) => {
  const proj = createTestProject({});
  t.after(proj.cleanup);

  const res = checkStructure(proj.dir, []);
  assert.ok(res.diagnostics.some((d) => d.code === 'MISSING_README' && d.severity === 'WARNING'));
  assert.ok(res.diagnostics.some((d) => d.code === 'MISSING_GITIGNORE' && d.severity === 'WARNING'));
  assert.ok(res.diagnostics.some((d) => d.code === 'MISSING_LICENSE' && d.severity === 'WARNING'));
  assert.ok(res.diagnostics.some((d) => d.code === 'MISSING_LOCKFILE' && d.severity === 'WARNING'));
  assert.ok(res.diagnostics.some((d) => d.code === 'MISSING_TEST_DIR' && d.severity === 'WARNING'));
});

test('Structure Checker: detects empty source directories', (t) => {
  const proj = createTestProject({
    'src': null // empty dir
  });
  t.after(proj.cleanup);

  const res = checkStructure(proj.dir, ['src']);
  const emptyDiag = res.diagnostics.find((d) => d.code === 'EMPTY_SOURCE_DIR');
  assert.ok(emptyDiag);
  assert.strictEqual(emptyDiag.severity, 'INFO');
  assert.strictEqual(emptyDiag.file, 'src');
});

test('Structure Checker: passes when all required files are present', (t) => {
  const proj = createTestProject({
    'README.md': '# Doc',
    '.gitignore': 'node_modules',
    'LICENSE': 'MIT',
    'package-lock.json': '{}',
    'test/test.js': '// test'
  });
  t.after(proj.cleanup);

  const entries = ['README.md', '.gitignore', 'LICENSE', 'package-lock.json', 'test'];
  const res = checkStructure(proj.dir, entries);
  assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'WARNING').length, 0);
  assert.strictEqual(res.checks.filter((c) => c.type === 'PASS').length, 5);
});
