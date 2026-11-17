'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { scan, countJavaScriptFiles } = require('../index.js');
const { createTestProject } = require('./helpers.js');

test('Section E: All four JS extensions (.js, .cjs, .mjs, .jsx) counted with breakdown', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'ext-pkg', version: '1.0.0' }),
    'a.js': '//',
    'b.cjs': '//',
    'c.mjs': '//',
    'd.jsx': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.js, 1);
  assert.strictEqual(res.jsFiles.cjs, 1);
  assert.strictEqual(res.jsFiles.mjs, 1);
  assert.strictEqual(res.jsFiles.jsx, 1);
  assert.strictEqual(res.jsFiles.total, 4);
});

test('Section E: Upper-case extensions (.JS, .CJS, .MJS, .JSX) counted case-insensitively', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'upper-pkg', version: '1.0.0' }),
    'one.JS': '//',
    'two.CJS': '//',
    'three.MJS': '//',
    'four.JSX': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.js, 1);
  assert.strictEqual(res.jsFiles.cjs, 1);
  assert.strictEqual(res.jsFiles.mjs, 1);
  assert.strictEqual(res.jsFiles.jsx, 1);
  assert.strictEqual(res.jsFiles.total, 4);
});

test('Section E: Files with no extension and non-JS files (.ts, .tsx, .json, .txt) ignored', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'nonjs-pkg', version: '1.0.0' }),
    'noextension': '//',
    'script': '//',
    'types.ts': '//',
    'Component.tsx': '//',
    'data.json': '{}',
    'readme.txt': 'hello',
    'valid.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.total, 1);
  assert.strictEqual(res.jsFiles.js, 1);
});

test('Section E: Hidden folders other than the ignored list ARE scanned', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'hidden-pkg', version: '1.0.0' }),
    '.agents/agent.js': '//',
    '.github/workflows/script.cjs': '//',
    '.vscode/settings.mjs': '//',
    'normal.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.total, 4);
  assert.strictEqual(res.jsFiles.js, 2);
  assert.strictEqual(res.jsFiles.cjs, 1);
  assert.strictEqual(res.jsFiles.mjs, 1);
});

test('Section E: All six ignored folders ignored at root AND at nested depth', (t) => {
  const ignoredList = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next'];
  const files = {
    'package.json': JSON.stringify({ name: 'ignored-folders-pkg', version: '1.0.0' }),
    'root.js': '//'
  };

  // Add files inside root ignored folders
  for (const folder of ignoredList) {
    files[`${folder}/ignored_root.js`] = '//';
  }

  // Add files inside nested ignored folders
  for (const folder of ignoredList) {
    files[`src/nested/${folder}/ignored_nested.js`] = '//';
  }

  const proj = createTestProject(files);
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.total, 1);
  assert.strictEqual(res.jsFiles.js, 1);
});

test('Section E: Lookalike directory names are NOT ignored', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'lookalike-pkg', version: '1.0.0' }),
    'builds/script1.js': '//',
    'distribution/script2.js': '//',
    'my-node_modules/script3.js': '//',
    'my-coverage/script4.js': '//',
    'next-app/script5.js': '//',
    'git-hooks/script6.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.jsFiles.total, 6);
  assert.strictEqual(res.jsFiles.js, 6);
});
