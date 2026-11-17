'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { checkPackage, extractJsonErrorLocation, findKeyLocationInJson } = require('../lib/package-checker');
const { createTestProject } = require('./helpers');

test('Package Checker: detects missing package.json with line=null, column=null', (t) => {
  const proj = createTestProject({});
  t.after(proj.cleanup);

  const res = checkPackage(proj.dir);
  assert.strictEqual(res.hasPackageJson, false);
  const diag = res.diagnostics.find((d) => d.code === 'PKG_MISSING');
  assert.ok(diag);
  assert.strictEqual(diag.severity, 'ERROR');
  assert.strictEqual(diag.line, null);
  assert.strictEqual(diag.column, null);
  assert.strictEqual(diag.scanner, 'package');
});

test('Package Checker: detects invalid JSON with line and column', (t) => {
  const proj = createTestProject({
    'package.json': '{\n  "name": "test",\n  "broken": \n}'
  });
  t.after(proj.cleanup);

  const res = checkPackage(proj.dir);
  const diag = res.diagnostics.find((d) => d.code === 'PKG_MALFORMED_JSON');
  assert.ok(diag);
  assert.strictEqual(diag.severity, 'ERROR');
  assert.strictEqual(diag.file, 'package.json');
  assert.strictEqual(typeof diag.line, 'number');
  assert.ok(diag.line > 0);
});

test('Package Checker: identifies line and column of invalid name and version', (t) => {
  const proj = createTestProject({
    'package.json': '{\n  "name": "INVALID_NAME",\n  "version": "not-semver"\n}'
  });
  t.after(proj.cleanup);

  const res = checkPackage(proj.dir);
  const nameDiag = res.diagnostics.find((d) => d.code === 'PKG_NAME_INVALID');
  assert.ok(nameDiag);
  assert.strictEqual(nameDiag.line, 2);
  assert.strictEqual(nameDiag.column, 3);

  const verDiag = res.diagnostics.find((d) => d.code === 'PKG_VERSION_INVALID');
  assert.ok(verDiag);
  assert.strictEqual(verDiag.line, 3);
  assert.strictEqual(verDiag.column, 3);
});

test('Package Checker: warns on missing recommended fields and missing main file', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'good-name',
      version: '1.0.0',
      main: 'nonexistent.js'
    })
  });
  t.after(proj.cleanup);

  const res = checkPackage(proj.dir);
  assert.ok(res.diagnostics.some((d) => d.code === 'PKG_MISSING_DESCRIPTION'));
  assert.ok(res.diagnostics.some((d) => d.code === 'PKG_MISSING_LICENSE'));
  assert.ok(res.diagnostics.some((d) => d.code === 'PKG_MAIN_NOT_FOUND'));
  assert.ok(res.diagnostics.some((d) => d.code === 'PKG_MISSING_SCRIPTS'));
});

test('Package Checker: warns on placeholder test script', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'placeholder-pkg',
      version: '1.0.0',
      scripts: { test: 'echo "Error: no test specified" && exit 1' }
    })
  });
  t.after(proj.cleanup);

  const res = checkPackage(proj.dir);
  assert.ok(res.diagnostics.some((d) => d.code === 'PKG_PLACEHOLDER_TEST_SCRIPT'));
});
