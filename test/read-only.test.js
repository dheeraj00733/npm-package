'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const child_process = require('child_process');
const { scan } = require('../index.js');
const { createTestProject, getDirectoryFingerprint } = require('./helpers.js');

const CLI_PATH = path.resolve(__dirname, '..', 'index.js');

test('Section F: Read-only guarantee across scan(), CLI, --json, and failure cases', (t) => {
  const proj = createTestProject({
    'package.json': JSON.stringify({
      name: 'readonly-test-pkg',
      version: '1.0.0',
      description: 'Testing read only guarantee',
      main: 'index.js',
      license: 'MIT',
      scripts: { test: 'node --test' }
    }),
    'index.js': "console.log('original content');\n",
    'README.md': '# Original Readme\n',
    'LICENSE': 'MIT License\n',
    '.gitignore': 'node_modules\n',
    'package-lock.json': '{"name":"readonly-test-pkg"}\n',
    'src/module.cjs': 'module.exports = 42;\n',
    'src/helper.mjs': 'export default 10;\n',
    'test/suite.test.js': '// test\n'
  });
  t.after(proj.cleanup);

  // Baseline fingerprint before anything runs
  const baseline = getDirectoryFingerprint(proj.dir);

  // 1. Run programmatic scan()
  scan(proj.dir);
  const afterScan = getDirectoryFingerprint(proj.dir);
  assert.deepStrictEqual(afterScan, baseline, 'scan() must not modify any file, dir, or mtime');

  // 2. Run CLI in standard mode
  const cp1 = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir], { encoding: 'utf8' });
  assert.strictEqual(cp1.status, 0);
  const afterCli = getDirectoryFingerprint(proj.dir);
  assert.deepStrictEqual(afterCli, baseline, 'CLI standard run must not modify anything');

  // 3. Run CLI with --json
  const cpJson = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--json'], { encoding: 'utf8' });
  assert.strictEqual(cpJson.status, 0);
  const afterJson = getDirectoryFingerprint(proj.dir);
  assert.deepStrictEqual(afterJson, baseline, 'CLI --json run must not modify anything');

  // 4. Run CLI failure case (unknown option)
  const cpErr = child_process.spawnSync(process.execPath, [CLI_PATH, proj.dir, '--bad-arg'], { encoding: 'utf8' });
  assert.strictEqual(cpErr.status, 2);
  const afterErr = getDirectoryFingerprint(proj.dir);
  assert.deepStrictEqual(afterErr, baseline, 'CLI error case must not modify anything');
});
