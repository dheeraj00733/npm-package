'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { checkSecurityInFile, isExposedEnvFile } = require('../lib/security-checker');
const { createTestProject } = require('./helpers');

test('Security Checker: detects exposed .env files and ignores .env.example', (t) => {
  assert.strictEqual(isExposedEnvFile('.env'), true);
  assert.strictEqual(isExposedEnvFile('.env.local'), true);
  assert.strictEqual(isExposedEnvFile('.env.production'), true);
  assert.strictEqual(isExposedEnvFile('.env.example'), false);
  assert.strictEqual(isExposedEnvFile('.env.template'), false);
  assert.strictEqual(isExposedEnvFile('.env.sample'), false);

  const proj = createTestProject({
    '.env': 'FOO=bar'
  });
  t.after(proj.cleanup);

  const diags = checkSecurityInFile(proj.dir, '.env');
  assert.ok(diags.some((d) => d.code === 'ENV_FILE_EXPOSURE'));
});

test('Security Checker: detects API key with line and column, never leaks secret value', (t) => {
  const sampleKey = ['AKIA', '9876543210ZYXWVU'].join('');
  const proj = createTestProject({
    'src/config.js': `// header\nconst api_key = '${sampleKey}';\n`
  });
  t.after(proj.cleanup);

  const diags = checkSecurityInFile(proj.dir, 'src/config.js');
  const target = diags.find((d) => d.code === 'SECRET_EXPOSURE');
  assert.ok(target);
  assert.strictEqual(target.file, 'src/config.js');
  assert.strictEqual(target.line, 2);
  assert.strictEqual(typeof target.column, 'number');
  assert.strictEqual(target.severity, 'ERROR');
  assert.strictEqual(target.scanner, 'security');
  // Verify secret value is NOT printed in message or suggestion
  assert.ok(!target.message.includes(sampleKey));
  assert.ok(!target.suggestion.includes(sampleKey));
});

test('Security Checker: detects password assignments', (t) => {
  const samplePwd = ['MySecret', 'Pass123!'].join('');
  const pwdVar = ['pass', 'word'].join('');
  const proj = createTestProject({
    'src/auth.js': `const ${pwdVar} = '${samplePwd}';\n`
  });
  t.after(proj.cleanup);

  const diags = checkSecurityInFile(proj.dir, 'src/auth.js');
  const target = diags.find((d) => d.code === 'PASSWORD_EXPOSURE');
  assert.ok(target);
  assert.strictEqual(target.line, 1);
  assert.ok(!target.message.includes(samplePwd));
});

test('Security Checker: detects unencrypted private key material', (t) => {
  const pkHeader = ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('');
  const pkFooter = ['-----END ', 'RSA PRIVATE KEY-----'].join('');
  const proj = createTestProject({
    'keys/server.key': `${pkHeader}\nMIIEowIBAAKCAQEA0...\n${pkFooter}\n`
  });
  t.after(proj.cleanup);

  const diags = checkSecurityInFile(proj.dir, 'keys/server.key');
  const target = diags.find((d) => d.code === 'PRIVATE_KEY_EXPOSURE');
  assert.ok(target);
  assert.strictEqual(target.line, 1);
});

test('Security Checker: ignores placeholder strings and binary files', (t) => {
  const proj = createTestProject({
    'clean.js': "const key = process.env.API_KEY || 'your_api_key_here';\n",
    'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00])
  });
  t.after(proj.cleanup);

  const cleanDiags = checkSecurityInFile(proj.dir, 'clean.js');
  assert.strictEqual(cleanDiags.filter((d) => d.severity === 'ERROR').length, 0);

  const pngDiags = checkSecurityInFile(proj.dir, 'image.png');
  assert.strictEqual(pngDiags.length, 0);
});
