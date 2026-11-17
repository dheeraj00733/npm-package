'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { scan } = require('../index.js');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Section I: Package quality - package.json specifications', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.strictEqual(pkg.name, 'devcheck-dj');
  assert.strictEqual(pkg.version, '1.1.0');
  assert.deepStrictEqual(pkg.bin, { devcheck: 'index.js' });
  assert.strictEqual(pkg.license, 'MIT');
  assert.strictEqual(pkg.dependencies, undefined, 'Zero dependencies required');
  assert.strictEqual(pkg.devDependencies, undefined, 'Zero devDependencies required');
  assert.deepStrictEqual(pkg.files, ['index.js', 'bin', 'lib', 'README.md', 'LICENSE']);
  assert.strictEqual(pkg.author, 'Dheeraj Jadhav <dheeraj62844@gmail.com>');
  assert.deepStrictEqual(pkg.publishConfig, { access: 'public' });
  assert.deepStrictEqual(pkg.engines, { node: '>=18' });
});

test('Section I: Package quality - index.js shebang and LF line endings', () => {
  const indexPath = path.join(ROOT_DIR, 'index.js');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Exact first line shebang
  const firstLine = content.split('\n')[0];
  assert.strictEqual(firstLine, '#!/usr/bin/env node');

  // LF line endings only (no \r)
  assert.ok(!content.includes('\r'), 'index.js must have LF line endings (no CR/\\r)');
});

test('Section I: Package quality - DevCheck scanning its own project exits 0', () => {
  const res = scan(ROOT_DIR);
  assert.strictEqual(res.exitCode, 0, `Self-scan exitCode must be 0, got ${res.exitCode}`);
  assert.strictEqual(res.project.name, 'devcheck-dj');
  assert.strictEqual(res.project.version, '1.1.0');
  assert.strictEqual(res.summary.failed, 0);
});
