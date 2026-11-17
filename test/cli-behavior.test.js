'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const child_process = require('child_process');
const { createTestProject } = require('./helpers.js');

const CLI_PATH = path.resolve(__dirname, '..', 'index.js');

test('Section G: --json produces valid JSON in success case', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'json-success-pkg',
      version: '1.0.0',
      description: 'Test JSON success',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': '//',
    'README.md': '# JSON',
    'LICENSE': 'MIT',
    '.gitignore': 'node_modules',
    'package-lock.json': '{}',
    'test/t.js': '//'
  });
  t.after(proj.cleanup);

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--json'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);

  const parsed = JSON.parse(cp.stdout);
  assert.strictEqual(parsed.status, 'HEALTHY');
  assert.strictEqual(parsed.exitCode, 0);
  assert.strictEqual(parsed.project.name, 'json-success-pkg');
  assert.strictEqual(parsed.project.version, '1.0.0');
  assert.ok(Array.isArray(parsed.checks));
  assert.strictEqual(typeof parsed.jsFiles.total, 'number');
  assert.strictEqual(parsed.summary.failed, 0);
});

test('Section G: --json produces valid JSON in failure case', (t) => {
  const proj = createTestProject({
    'package.json': '{ "broken": json \n'
  });
  t.after(proj.cleanup);

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--json'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 1);

  const parsed = JSON.parse(cp.stdout);
  assert.strictEqual(parsed.status, 'UNHEALTHY');
  assert.strictEqual(parsed.exitCode, 1);
  assert.ok(parsed.summary.failed > 0);
});

test('Section G: Argument position flexibility (devcheck . --json and devcheck --json .)', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'arg-pos-pkg',
      version: '1.0.0'
    })
  });
  t.after(proj.cleanup);

  // Form 1: directory first, option second
  const cp1 = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--json'], { encoding: 'utf8' });
  const parsed1 = JSON.parse(cp1.stdout);
  assert.strictEqual(parsed1.project.name, 'arg-pos-pkg');

  // Form 2: option first, directory second
  const cp2 = child_process.spawnSync(process.execPath, [CLI_PATH, '--json', proj.dir], { encoding: 'utf8' });
  const parsed2 = JSON.parse(cp2.stdout);
  assert.strictEqual(parsed2.project.name, 'arg-pos-pkg');
});

test('Section G: --help, -h, --version, -v all exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const cp = child_process.spawnSync(process.execPath, [CLI_PATH, flag], { encoding: 'utf8' });
    assert.strictEqual(cp.status, 0);
    assert.ok(cp.stdout.includes('DevCheck CLI'));
    assert.ok(cp.stdout.includes('Usage:'));
    assert.ok(cp.stdout.includes('--self-test'));
  }

  for (const flag of ['--version', '-v']) {
    const cp = child_process.spawnSync(process.execPath, [CLI_PATH, flag], { encoding: 'utf8' });
    assert.strictEqual(cp.status, 0);
    assert.strictEqual(cp.stdout.trim(), '1.1.0');
  }
});

test('Section G: Unknown option and extra directory exit 2 with message on stderr', () => {
  // Unknown option
  const cp1 = child_process.spawnSync(process.execPath, [CLI_PATH, '--unknown-flag'], { encoding: 'utf8' });
  assert.strictEqual(cp1.status, 2);
  assert.ok(cp1.stderr.includes('Unknown option'));

  // Extra directory argument
  const cp2 = child_process.spawnSync(process.execPath, [CLI_PATH, 'dir1', 'dir2'], { encoding: 'utf8' });
  assert.strictEqual(cp2.status, 2);
  assert.ok(cp2.stderr.includes('Only one target directory is accepted'));
});

test('Section G: "--" delimiter allows scanning folder named "-weird"', (t) => {
  const proj = createTestProject();
  t.after(proj.cleanup);

  const weirdDir = path.join(proj.dir, '-weird');
  fs.mkdirSync(weirdDir, { recursive: true });
  fs.writeFileSync(
    path.join(weirdDir, 'package.json'),
    JSON.stringify({ name: 'weird-pkg', version: '1.0.0' })
  );

  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, '--json', '--', weirdDir], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);
  const parsed = JSON.parse(cp.stdout);
  assert.strictEqual(parsed.project.name, 'weird-pkg');
});

test('Section G: Color controls (--no-color, piped output, NO_COLOR)', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({ name: 'color-pkg', version: '1.0.0' })
  });
  t.after(proj.cleanup);

  // When piped (child_process without pty), stdout is not a TTY -> no ANSI codes
  const cpPiped = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir], { encoding: 'utf8' });
  assert.strictEqual(cpPiped.status, 0);
  assert.ok(!cpPiped.stdout.includes('\x1b['), 'Piped output should contain no ANSI codes');

  // With --no-color flag explicitly
  const cpNoColor = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--no-color'], { encoding: 'utf8' });
  assert.strictEqual(cpNoColor.status, 0);
  assert.ok(!cpNoColor.stdout.includes('\x1b['), '--no-color should contain no ANSI codes');

  // With NO_COLOR environment variable set
  const cpEnv = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  assert.strictEqual(cpEnv.status, 0);
  assert.ok(!cpEnv.stdout.includes('\x1b['), 'NO_COLOR should disable ANSI codes');
});

test('Section G: Closed output pipe (EPIPE) does not crash', () => {
  if (process.platform === 'win32') {
    return; // Piped head not standard in Windows cmd without bash
  }
  // Run command piped to head -n 1
  const cmd = `"${process.execPath}" "${CLI_PATH}" . | head -n 1`;
  const res = child_process.spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `EPIPE closed pipe should exit cleanly with 0, got ${res.status}`);
});

test('Section G: No stack traces in stdout or stderr for failure cases', () => {
  const failureArgs = [
    ['./no-such-folder-xyz'],
    ['--invalid-flag'],
    ['dirA', 'dirB'],
    ['--json', './nonexistent']
  ];

  for (const args of failureArgs) {
    const cp = child_process.spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
    assert.ok(!cp.stdout.includes('    at '), `Stdout should not have stack trace for args: ${args.join(' ')}`);
    assert.ok(!cp.stderr.includes('    at '), `Stderr should not have stack trace for args: ${args.join(' ')}`);
  }
});

test('Section G: BAD PATH demo prints [FAIL] line and exits 2', () => {
  const badPath = './no-such-folder';
  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, badPath], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 2);
  assert.ok(cp.stdout.includes('[FAIL]'));
  assert.ok(cp.stdout.includes('Target directory does not exist: "./no-such-folder"'));
  assert.ok(!cp.stdout.includes('    at '));
  assert.ok(!cp.stderr.includes('    at '));
});

test('Section H: --self-test exits 0, reports checks, leaves no temp folders, appears in --help', () => {
  // 1. Run --self-test
  const cp = child_process.spawnSync(process.execPath, [CLI_PATH, '--self-test'], { encoding: 'utf8' });
  assert.strictEqual(cp.status, 0);
  assert.ok(cp.stdout.includes('Self-test summary:'));
  assert.ok(cp.stdout.includes('passed, 0 failed'));
  assert.ok(cp.stdout.includes('DevCheck is working correctly on this computer.'));

  // 2. Check temp directory for any leaked devcheck-selftest-* folders
  const tmpEntries = fs.readdirSync(os.tmpdir());
  const leaked = tmpEntries.filter((e) => e.startsWith('devcheck-selftest-'));
  assert.strictEqual(leaked.length, 0, `Leaked temp folders found: ${leaked.join(', ')}`);

  // 3. Appears in --help
  const helpCp = child_process.spawnSync(process.execPath, [CLI_PATH, '--help'], { encoding: 'utf8' });
  assert.ok(helpCp.stdout.includes('--self-test'));
});
