'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const { scan } = require('../index.js');
const { createTestProject } = require('./helpers.js');

const CLI_PATH = path.resolve(__dirname, '..', 'index.js');

test('Section B: Missing package.json', (t) => {
  const proj = createTestProject({
    'index.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('missing')));
});

test('Section B: Malformed package.json produces no crash, no stack trace', (t) => {
  const proj = createTestProject({
    'package.json': '{ "name": "foo", "broken": \n'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('malformed')));

  // Test child process stderr has no stack trace
  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 1);
  assert.ok(!cp.stdout.includes('    at '));
  assert.ok(!cp.stderr.includes('    at '));
});

test('Section B: Empty package.json file', (t) => {
  const proj = createTestProject({
    'package.json': ''
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('empty')));
});

test('Section B: Whitespace-only package.json', (t) => {
  const proj = createTestProject({
    'package.json': '   \n  \t  \n'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('empty')));
});

test('Section B: Top-level non-object JSON (array, null, string, number)', (t) => {
  const cases = [
    { name: 'array', content: '["item1", "item2"]' },
    { name: 'null', content: 'null' },
    { name: 'string', content: '"hello world"' },
    { name: 'number', content: '42' }
  ];

  for (const c of cases) {
    const proj = createTestProject({
      'package.json': c.content
    });
    const res = scan(proj.dir);
    assert.strictEqual(res.exitCode, 1, `Failed for ${c.name}`);
    assert.strictEqual(res.status, 'UNHEALTHY');
    assert.ok(
      res.checks.some((chk) => chk.type === 'FAIL' && chk.message.includes('top-level must be an object')),
      `Expected top-level object check for ${c.name}`
    );
    proj.cleanup();
  }
});

test('Section B: package.json is a directory', (t) => {
  const proj = createTestProject();
  t.after(proj.cleanup);

  fs.mkdirSync(path.join(proj.dir, 'package.json'));
  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('is a directory')));
});

test('Section B: UTF-8 BOM tolerated in package.json', (t) => {
  const bom = '\uFEFF';
  const proj = createTestProject({
    'package.json': bom + JSON.stringify({
      name: 'bom-pkg',
      version: '1.0.0',
      description: 'BOM pkg',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# BOM',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.status, 'HEALTHY');
  assert.strictEqual(res.project.name, 'bom-pkg');
});

test('Section B: Trailing comma, comments, single quotes in JSON fail cleanly', (t) => {
  const badJsons = [
    { name: 'trailing comma', content: '{\n  "name": "pkg",\n  "version": "1.0.0",\n}' },
    { name: 'comments', content: '{\n  // comment\n  "name": "pkg",\n  "version": "1.0.0"\n}' },
    { name: 'single quotes', content: "{\n  'name': 'pkg',\n  'version': '1.0.0'\n}" }
  ];

  for (const item of badJsons) {
    const proj = createTestProject({
      'package.json': item.content
    });
    const res = scan(proj.dir);
    assert.strictEqual(res.exitCode, 1, `Failed for ${item.name}`);
    assert.strictEqual(res.status, 'UNHEALTHY');
    assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('malformed')));
    proj.cleanup();
  }
});

test('Section B: Huge (~5 MB) valid package.json file', (t) => {
  const largeObject = {
    name: 'huge-pkg',
    version: '1.0.0',
    description: 'A large package.json',
    main: 'index.js',
    license: 'MIT',
    scripts: { test: 'node --test' },
    extraData: 'x'.repeat(5 * 1024 * 1024) // 5MB string
  };

  const proj = createTestProject({
    'package.json': JSON.stringify(largeObject),
    'index.js': '//',
    'README.md': '# Huge',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.status, 'HEALTHY');
  assert.strictEqual(res.project.name, 'huge-pkg');
});

test('Section B: "name" validation edge cases', (t) => {
  const invalidNames = [
    { desc: 'missing', val: undefined },
    { desc: 'wrong type (number)', val: 123 },
    { desc: 'wrong type (null)', val: null },
    { desc: 'uppercase', val: 'MyPackage' },
    { desc: 'with spaces', val: 'my package' },
    { desc: '215+ chars', val: 'a'.repeat(215) },
    { desc: 'starts with dot', val: '.my-pkg' },
    { desc: 'starts with underscore', val: '_my-pkg' }
  ];

  for (const item of invalidNames) {
    const pkgObj = {
      version: '1.0.0',
      description: 'test',
      license: 'MIT',
      scripts: { test: 'node --test' }
    };
    if (item.val !== undefined) {
      pkgObj.name = item.val;
    }

    const proj = createTestProject({
      'package.json': JSON.stringify(pkgObj)
    });
    const res = scan(proj.dir);
    assert.strictEqual(res.exitCode, 1, `Failed for ${item.desc}`);
    assert.strictEqual(res.status, 'UNHEALTHY');
    assert.ok(
      res.checks.some((c) => c.type === 'FAIL' && c.message.includes('"name"')),
      `Expected FAIL check on "name" for ${item.desc}`
    );
    proj.cleanup();
  }
});

test('Section B: "version" validation edge cases', (t) => {
  const invalidVersions = [
    { desc: 'missing', val: undefined },
    { desc: 'wrong type (number)', val: 1.0 },
    { desc: 'wrong type (null)', val: null },
    { desc: 'empty string', val: '' },
    { desc: 'two parts ("1.0")', val: '1.0' },
    { desc: 'leading v ("v1.0.0")', val: 'v1.0.0' },
    { desc: 'leading zeros ("01.0.0")', val: '01.0.0' }
  ];

  for (const item of invalidVersions) {
    const pkgObj = {
      name: 'version-test-pkg',
      description: 'test',
      license: 'MIT',
      scripts: { test: 'node --test' }
    };
    if (item.val !== undefined) {
      pkgObj.version = item.val;
    }

    const proj = createTestProject({
      'package.json': JSON.stringify(pkgObj)
    });
    const res = scan(proj.dir);
    assert.strictEqual(res.exitCode, 1, `Failed for ${item.desc}`);
    assert.strictEqual(res.status, 'UNHEALTHY');
    assert.ok(
      res.checks.some((c) => c.type === 'FAIL' && c.message.includes('"version"')),
      `Expected FAIL check on "version" for ${item.desc}`
    );
    proj.cleanup();
  }
});

test('Section B: scripts as array / string / null and non-string script values do not crash', (t) => {
  const invalidScripts = [
    { desc: 'scripts as array', scripts: ['npm test'] },
    { desc: 'scripts as string', scripts: 'node test' },
    { desc: 'scripts as null', scripts: null },
    { desc: 'scripts containing non-string value', scripts: { test: 123, build: true, lint: null } }
  ];

  for (const item of invalidScripts) {
    const proj = createTestProject({
      'package.json': JSON.stringify({
        name: 'scripts-edge-pkg',
        version: '1.0.0',
        description: 'Testing scripts edge cases',
        license: 'MIT',
        scripts: item.scripts
      }),
      'README.md': '# Scripts Edge',
      'LICENSE': 'MIT',
      '.gitignore': 'node_modules',
      'package-lock.json': '{}',
      'test/t.js': '//'
    });
    const res = scan(proj.dir);
    // scripts errors are WARN only, so exitCode should be 0 (no FAILs)
    assert.strictEqual(res.exitCode, 0, `Failed for ${item.desc}`);
    assert.ok(res.checks.some((c) => c.type === 'WARN'), `Expected warning for ${item.desc}`);
    proj.cleanup();
  }
});

test('Section B: main pointing to missing file and to directory give WARN', (t) => {
  // 1. Missing file
  const proj1 = createTestProject({
    'package.json': JSON.stringify({
      name: 'main-missing-pkg',
      version: '1.0.0',
      description: 'Main missing file',
      main: 'non-existent-file.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'README.md': '# Main',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj1.cleanup);

  const res1 = scan(proj1.dir);
  assert.strictEqual(res1.exitCode, 0);
  assert.ok(res1.checks.some((c) => c.type === 'WARN' && c.message.includes('non-existent file')));

  // 2. Directory instead of file
  const proj2 = createTestProject({
    'package.json': JSON.stringify({
      name: 'main-dir-pkg',
      version: '1.0.0',
      description: 'Main pointing to dir',
      main: 'some-dir',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'some-dir/dummy.js': '//',
    'README.md': '# Main Dir',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj2.cleanup);

  const res2 = scan(proj2.dir);
  assert.strictEqual(res2.exitCode, 0);
  assert.ok(res2.checks.some((c) => c.type === 'WARN' && c.message.includes('points to a directory')));
});

test('Section C: Recommended items missing give WARN, never FAIL, and exit 0', (t) => {
  // Missing: description, license, main, scripts, test directory, lockfile, .gitignore, README.md
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'bare-bones-pkg',
      version: '1.0.0'
    })
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0); // No FAILs!
  assert.strictEqual(res.status, 'HEALTHY WITH WARNINGS');
  assert.strictEqual(res.summary.failed, 0);
  assert.ok(res.summary.warnings >= 6);
});

test('Section C: Lowercase readme.md gives WARN, not FAIL', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'readme-case-pkg',
      version: '1.0.0',
      description: 'Readme case test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'readme.md': '# Lowercase readme',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.ok(
    res.checks.some((c) => c.type === 'WARN' && c.message.includes('README file found but not named exactly "README.md"'))
  );
});

test('Section C: Default npm "no test specified" placeholder gives WARN', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'npm-placeholder-pkg',
      version: '1.0.0',
      description: 'Default placeholder test',
      main: 'index.js',
      license: 'MIT',
      scripts: {
        test: 'echo "Error: no test specified" && exit 1'
      }
    }),
    'index.js': '//',
    'README.md': '# Placeholder',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.ok(res.checks.some((c) => c.type === 'WARN' && c.message.includes('placeholder')));
});
