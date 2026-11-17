'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { checkSyntaxInFile, parseSyntaxError } = require('../lib/syntax-checker');
const { createTestProject } = require('./helpers');

test('Syntax Checker: detects syntax errors with line and column numbers', (t) => {
  const proj = createTestProject({
    'src/bad.js': 'const x = 1;\nif (x == ) {\n  console.log(1);\n}\n'
  });
  t.after(proj.cleanup);

  const diags = checkSyntaxInFile(proj.dir, 'src/bad.js');
  const target = diags.find((d) => d.code === 'JS_SYNTAX_ERROR');
  assert.ok(target);
  assert.strictEqual(target.severity, 'ERROR');
  assert.strictEqual(target.file, 'src/bad.js');
  assert.strictEqual(target.line, 2);
  assert.strictEqual(typeof target.column, 'number');
  assert.ok(target.column > 0);
  assert.strictEqual(target.scanner, 'syntax');
});

test('Syntax Checker: does NOT execute code during inspection', (t) => {
  let sideEffectHappened = false;
  // If code executed, this process would terminate or write
  const proj = createTestProject({
    'dangerous.js': 'throw new Error("This code should never execute!");\n'
  });
  t.after(proj.cleanup);

  const diags = checkSyntaxInFile(proj.dir, 'dangerous.js');
  assert.strictEqual(diags.length, 0); // Valid syntax, zero errors!
});

test('Syntax Checker: handles valid ES module syntax without false positive errors', (t) => {
  const proj = createTestProject({
    'esm.mjs': 'import { readFile } from "fs";\nexport function read() { return readFile; }\nexport default read;\n'
  });
  t.after(proj.cleanup);

  const diags = checkSyntaxInFile(proj.dir, 'esm.mjs');
  assert.strictEqual(diags.filter((d) => d.severity === 'ERROR').length, 0);
});

test('Syntax Checker: catches syntax errors in ES module files', (t) => {
  const proj = createTestProject({
    'broken-esm.mjs': 'import { readFile } from "fs";\nconst a = ;\nexport default a;\n'
  });
  t.after(proj.cleanup);

  const diags = checkSyntaxInFile(proj.dir, 'broken-esm.mjs');
  const target = diags.find((d) => d.code === 'JS_SYNTAX_ERROR');
  assert.ok(target);
  assert.strictEqual(target.line, 2);
});

test('Syntax Checker: marks JSX as unsupported without false error', (t) => {
  const proj = createTestProject({
    'Comp.jsx': 'export default function() { return <div>hello</div>; }\n'
  });
  t.after(proj.cleanup);

  const diags = checkSyntaxInFile(proj.dir, 'Comp.jsx');
  assert.strictEqual(diags.filter((d) => d.severity === 'ERROR').length, 0);
  assert.ok(diags.some((d) => d.code === 'JSX_SYNTAX_UNSUPPORTED' && d.severity === 'INFO'));
});
