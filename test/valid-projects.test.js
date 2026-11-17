'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { scan } = require('../index.js');
const { createTestProject } = require('./helpers.js');
test('Section A: Valid projects - standard valid sample', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'valid-pkg',
      version: '1.0.0',
      description: 'A valid package',
      main: 'index.js',
      license: 'MIT',
      scripts: {
        test: 'node --test',
        start: 'node index.js'
      }

      
    }),
    'index.js': "console.log('hello');",
    'README.md': '# Valid',
    'LICENSE': 'MIT License',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/test.js': '// test'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.status, 'HEALTHY');
  assert.strictEqual(res.project.name, 'valid-pkg');
  assert.strictEqual(res.project.version, '1.0.0');
  assert.strictEqual(res.project.scripts.test, 'node --test');
  assert.strictEqual(res.project.scripts.start, 'node index.js');
  assert.strictEqual(res.jsFiles.total, 2); // index.js + test/test.js
  assert.strictEqual(res.summary.failed, 0);
});

test('Section A: Valid projects - default target = cwd', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'cwd-pkg',
      version: '2.0.0',
      description: 'Testing cwd',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': 'module.exports = {};',
    'README.md': '# CWD',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const prevCwd = process.cwd();
  try {
    process.chdir(proj.dir);
    const res = scan(); // default to cwd
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.project.name, 'cwd-pkg');
  } finally {
    process.chdir(prevCwd);
  }
});

test('Section A: Valid projects - relative path and path with trailing slash', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'rel-pkg',
      version: '1.0.0',
      description: 'Relative path',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Rel',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const relPath = path.relative(process.cwd(), proj.dir) + path.sep;
  const res = scan(relPath);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'rel-pkg');
});

test('Section A: Valid projects - absolute path', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'abs-pkg',
      version: '1.0.0',
      description: 'Absolute path',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Abs',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const absPath = path.resolve(proj.dir);
  const res = scan(absPath);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'abs-pkg');
});

test('Section A: Valid projects - path with spaces', (t) => {
  const proj = createTestProject();
  t.after(proj.cleanup);

  const spacedDir = path.join(proj.dir, 'folder with spaces');
  fs.mkdirSync(spacedDir, { recursive: true });
  fs.mkdirSync(path.join(spacedDir, 'test'), { recursive: true });
  fs.writeFileSync(
    path.join(spacedDir, 'package.json'),
    JSON.stringify({
      name: 'spaced-pkg',
      version: '1.0.0',
      description: 'Path with spaces',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    })
  );
  fs.writeFileSync(path.join(spacedDir, 'index.js'), '//');
  fs.writeFileSync(path.join(spacedDir, 'README.md'), '# Spaced');
  fs.writeFileSync(path.join(spacedDir, 'LICENSE'), 'MIT');
  fs.writeFileSync(path.join(spacedDir, '.gitignore'), 'node_modules');
  fs.writeFileSync(path.join(spacedDir, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(spacedDir, 'test', 't.js'), '//');

  const res = scan(spacedDir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'spaced-pkg');
});

test('Section A: Valid projects - path containing ".."', (t) => {
  const proj = createTestProject();
  t.after(proj.cleanup);

  const subDir = path.join(proj.dir, 'sub', 'inner');
  fs.mkdirSync(subDir, { recursive: true });
  fs.mkdirSync(path.join(proj.dir, 'target-app', 'test'), { recursive: true });

  const targetDir = path.join(proj.dir, 'target-app');
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify({
      name: 'dotdot-pkg',
      version: '1.0.0',
      description: 'Testing .. path',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    })
  );
  fs.writeFileSync(path.join(targetDir, 'index.js'), '//');
  fs.writeFileSync(path.join(targetDir, 'README.md'), '# DotDot');
  fs.writeFileSync(path.join(targetDir, 'LICENSE'), 'MIT');
  fs.writeFileSync(path.join(targetDir, '.gitignore'), 'node_modules');
  fs.writeFileSync(path.join(targetDir, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(targetDir, 'test', 't.js'), '//');

  const dotDotPath = path.join(subDir, '..', '..', 'target-app');
  const res = scan(dotDotPath);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'dotdot-pkg');
});

test('Section A: Valid projects - path with unicode characters', (t) => {
  const proj = createTestProject();
  t.after(proj.cleanup);

  const unicodeDir = path.join(proj.dir, 'projëct_ø_日本語');
  fs.mkdirSync(unicodeDir, { recursive: true });
  fs.mkdirSync(path.join(unicodeDir, 'test'), { recursive: true });
  fs.writeFileSync(
    path.join(unicodeDir, 'package.json'),
    JSON.stringify({
      name: 'unicode-pkg',
      version: '1.0.0',
      description: 'Unicode path',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    })
  );
  fs.writeFileSync(path.join(unicodeDir, 'index.js'), '//');
  fs.writeFileSync(path.join(unicodeDir, 'README.md'), '# Unicode');
  fs.writeFileSync(path.join(unicodeDir, 'LICENSE'), 'MIT');
  fs.writeFileSync(path.join(unicodeDir, '.gitignore'), 'node_modules');
  fs.writeFileSync(path.join(unicodeDir, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(unicodeDir, 'test', 't.js'), '//');

  const res = scan(unicodeDir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'unicode-pkg');
});

test('Section A: Valid projects - scoped name', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: '@my-org/cool-tool',
      version: '1.0.0',
      description: 'Scoped package',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Scoped',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, '@my-org/cool-tool');
});

test('Section A: Valid projects - prerelease and build-metadata semver', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'prerelease-pkg',
      version: '2.1.0-alpha.1+sha.exp123',
      description: 'Prerelease version',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Prerelease',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.version, '2.1.0-alpha.1+sha.exp123');
});
