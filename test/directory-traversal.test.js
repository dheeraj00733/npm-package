'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scan } = require('../index.js');
const { createTestProject, createTempDir, removeDir } = require('./helpers.js');

test('Section D: Non-existent path returns exit code 2 and FAIL', (t) => {
  const badPath = path.join(os.tmpdir(), 'non-existent-' + Date.now());
  const res = scan(badPath);
  assert.strictEqual(res.exitCode, 2);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('does not exist')));
});

test('Section D: File passed instead of directory returns exit code 2', (t) => {
  const proj = createTestProject({
    'file.txt': 'hello'
  });
  t.after(proj.cleanup);

  const filePath = path.join(proj.dir, 'file.txt');
  const res = scan(filePath);
  assert.strictEqual(res.exitCode, 2);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('not a directory')));
});

test('Section D: Empty directory returns exit code 1 (missing package.json, no crash)', (t) => {
  const dir = createTempDir('empty-dir-');
  t.after(() => removeDir(dir));

  const res = scan(dir);
  assert.strictEqual(res.exitCode, 1);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('package.json is missing')));
});

test('Section D: Directory containing only package.json', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'only-pkg-json',
      version: '1.0.0'
    })
  });
  t.after(proj.cleanup);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0); // No FAIL, only WARNs for missing optional files
  assert.strictEqual(res.status, 'HEALTHY WITH WARNINGS');
  assert.strictEqual(res.project.name, 'only-pkg-json');
  assert.strictEqual(res.jsFiles.total, 0);
});

test('Section D: Broken symlink inside project is skipped without crashing', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'broken-symlink-pkg',
      version: '1.0.0',
      description: 'Broken symlink test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Broken symlink',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  // Create a broken symlink pointing to a nonexistent destination
  const linkPath = path.join(proj.dir, 'broken-link.js');
  try {
    fs.symlinkSync(path.join(proj.dir, 'nowhere.js'), linkPath);
  } catch (err) {
    t.skip('Symlinks not supported in this environment: ' + err.message);
    return;
  }

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.status, 'HEALTHY');
  assert.strictEqual(res.jsFiles.total, 2); // index.js + test/t.js, broken-link skipped!
});

test('Section D: Target that is a symlink pointing to a directory works', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'symlink-target-pkg',
      version: '1.0.0',
      description: 'Symlink target test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Symlink target',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const symlinkTarget = path.join(os.tmpdir(), 'symlink-to-proj-' + Date.now());
  try {
    fs.symlinkSync(proj.dir, symlinkTarget, 'dir');
  } catch (err) {
    t.skip('Symlink creation not supported: ' + err.message);
    return;
  }
  t.after(() => {
    try {
      fs.unlinkSync(symlinkTarget);
    } catch {}
  });

  const res = scan(symlinkTarget);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.project.name, 'symlink-target-pkg');
});

test('Section D: Symlink loop does not hang scan', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'symlink-loop-pkg',
      version: '1.0.0',
      description: 'Symlink loop test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Symlink loop',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const loopLink = path.join(proj.dir, 'recursive-loop');
  try {
    fs.symlinkSync(proj.dir, loopLink, 'dir');
  } catch (err) {
    t.skip('Symlink creation not supported: ' + err.message);
    return;
  }

  const startTime = Date.now();
  const res = scan(proj.dir);
  const elapsed = Date.now() - startTime;

  assert.strictEqual(res.exitCode, 0);
  assert.ok(elapsed < 2000, `Scan took too long (${elapsed}ms), possible loop hang`);
  assert.strictEqual(res.jsFiles.total, 2);
});

test('Section D: Very deep nesting (200+ levels) does not crash', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'deep-nesting-pkg',
      version: '1.0.0',
      description: 'Deep nesting test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Deep',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  // Create 205 nested subdirectories (using 1-char name to stay within OS PATH_MAX)
  let current = proj.dir;
  for (let i = 0; i < 205; i++) {
    current = path.join(current, 'a');
    fs.mkdirSync(current);
  }
  fs.writeFileSync(path.join(current, 'deep.js'), "console.log('deep');\n");

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.jsFiles.total, 3); // index.js + test/t.js + deep.js
});

test('Section D: Many files (2000+) completes quickly', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'many-files-pkg',
      version: '1.0.0',
      description: 'Many files test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Many',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const filesDir = path.join(proj.dir, 'src');
  fs.mkdirSync(filesDir, { recursive: true });

  // Create 2000 small JS files
  for (let i = 0; i < 2000; i++) {
    fs.writeFileSync(path.join(filesDir, `file_${i}.js`), '//');
  }

  const start = Date.now();
  const res = scan(proj.dir);
  const elapsed = Date.now() - start;

  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.jsFiles.total, 2002); // 2000 in src + index.js + test/t.js
  assert.ok(elapsed < 3000, `Expected scan of 2000 files to complete quickly (took ${elapsed}ms)`);
});

test('Section D: Permission-denied target directory returns exit code 2', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    t.skip('Skipping permission test on Windows or root user');
    return;
  }

  const restrictedDir = createTempDir('perm-target-');
  t.after(() => {
    try {
      fs.chmodSync(restrictedDir, 0o755);
    } catch {}
    removeDir(restrictedDir);
  });

  fs.chmodSync(restrictedDir, 0o000);

  const res = scan(restrictedDir);
  assert.strictEqual(res.exitCode, 2);
  assert.strictEqual(res.status, 'UNHEALTHY');
  assert.ok(res.checks.some((c) => c.type === 'FAIL' && c.message.includes('permission denied')));
});

test('Section D: Unreadable subfolder is skipped and reported as WARN', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    t.skip('Skipping permission test on Windows or root user');
    return;
  }

  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'unreadable-subfolder-pkg',
      version: '1.0.0',
      description: 'Unreadable subfolder test',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# Subfolder test',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });

  const secretDir = path.join(proj.dir, 'secret');
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(path.join(secretDir, 'secret.js'), '//');

  t.after(() => {
    try {
      fs.chmodSync(secretDir, 0o755);
    } catch {}
    proj.cleanup();
  });

  fs.chmodSync(secretDir, 0o000);

  const res = scan(proj.dir);
  assert.strictEqual(res.exitCode, 0); // No FAIL, unreadable subfolder is skipped with WARN
  assert.ok(res.checks.some((c) => c.type === 'WARN' && c.message.includes('Unreadable directory skipped')));
  assert.strictEqual(res.jsFiles.total, 2); // index.js + test/t.js; secret.js was not read
});
