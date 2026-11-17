'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');
const { scan } = require('./scanner');

function runSelfTest(options = {}) {
  const useColor = Boolean(options.color);
  const cliPath = options.cliPath || path.resolve(__dirname, '..', 'index.js');

  const c = {
    green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
    red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
    bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s)
  };

  const checks = [];
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devcheck-selftest-'));

  try {
    // 1. Valid project
    const validDir = path.join(sandboxDir, 'valid-app');
    fs.mkdirSync(path.join(validDir, 'test'), { recursive: true });
    fs.mkdirSync(path.join(validDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(validDir, 'index.js'), "module.exports = 'valid';\n");
    fs.writeFileSync(path.join(validDir, 'src', 'helper.js'), "function help() { return true; }\nmodule.exports = { help };\n");
    fs.writeFileSync(
      path.join(validDir, 'package.json'),
      JSON.stringify({
        name: 'valid-app',
        version: '1.0.0',
        description: 'A valid project',
        main: 'index.js',
        license: 'MIT',
        scripts: { test: 'node --test' }
      })
    );
    fs.writeFileSync(path.join(validDir, 'README.md'), '# Valid App\n');
    fs.writeFileSync(path.join(validDir, 'LICENSE'), 'MIT License\n');
    fs.writeFileSync(path.join(validDir, '.gitignore'), 'node_modules\n');
    fs.writeFileSync(path.join(validDir, 'package-lock.json'), '{}\n');
    fs.writeFileSync(path.join(validDir, 'test', 'index.test.js'), '// test\n');

    const resValid = scan(validDir);
    checks.push({
      num: 1,
      name: 'Valid Node.js project passes with HEALTHY status and exit code 0',
      pass: resValid.status === 'HEALTHY' && resValid.exitCode === 0 && resValid.summary.errors === 0
    });

    // 2. Missing package.json
    const missingPkgDir = path.join(sandboxDir, 'missing-pkg');
    fs.mkdirSync(missingPkgDir, { recursive: true });
    fs.writeFileSync(path.join(missingPkgDir, 'index.js'), "console.log('no pkg');\n");
    const resMissingPkg = scan(missingPkgDir);
    checks.push({
      num: 2,
      name: 'Missing package.json detected with PKG_MISSING code and exit code 1',
      pass: resMissingPkg.exitCode === 1 && resMissingPkg.diagnostics.some((d) => d.code === 'PKG_MISSING')
    });

    // 3. Invalid JSON in package.json
    const invalidJsonDir = path.join(sandboxDir, 'invalid-json');
    fs.mkdirSync(invalidJsonDir, { recursive: true });
    fs.writeFileSync(path.join(invalidJsonDir, 'package.json'), '{\n  "name": "bad",\n  broken json\n');
    const resInvalidJson = scan(invalidJsonDir);
    checks.push({
      num: 3,
      name: 'Invalid JSON in package.json detected with PKG_MALFORMED_JSON',
      pass: resInvalidJson.diagnostics.some((d) => d.code === 'PKG_MALFORMED_JSON')
    });

    // 4. UTF-8 BOM handling
    const bomDir = path.join(sandboxDir, 'bom-app');
    fs.mkdirSync(bomDir, { recursive: true });
    fs.writeFileSync(
      path.join(bomDir, 'package.json'),
      '\uFEFF' + JSON.stringify({ name: 'bom-pkg', version: '1.0.0' })
    );
    const resBom = scan(bomDir);
    checks.push({
      num: 4,
      name: 'UTF-8 BOM handled and detected with PKG_UTF8_BOM',
      pass: resBom.project.name === 'bom-pkg' && resBom.diagnostics.some((d) => d.code === 'PKG_UTF8_BOM')
    });

    // 5. Invalid package name
    const badNameDir = path.join(sandboxDir, 'bad-name-app');
    fs.mkdirSync(badNameDir, { recursive: true });
    fs.writeFileSync(
      path.join(badNameDir, 'package.json'),
      JSON.stringify({ name: 'Bad_Name!', version: '1.0.0' })
    );
    const resBadName = scan(badNameDir);
    checks.push({
      num: 5,
      name: 'Invalid package name detected with PKG_NAME_INVALID',
      pass: resBadName.diagnostics.some((d) => d.code === 'PKG_NAME_INVALID')
    });

    // 6. Invalid SemVer
    const badVerDir = path.join(sandboxDir, 'bad-ver-app');
    fs.mkdirSync(badVerDir, { recursive: true });
    fs.writeFileSync(
      path.join(badVerDir, 'package.json'),
      JSON.stringify({ name: 'bad-ver', version: 'v1.0' })
    );
    const resBadVer = scan(badVerDir);
    checks.push({
      num: 6,
      name: 'Invalid SemVer detected with PKG_VERSION_INVALID',
      pass: resBadVer.diagnostics.some((d) => d.code === 'PKG_VERSION_INVALID')
    });

    // 7. Missing README
    const noReadmeDir = path.join(sandboxDir, 'no-readme-app');
    fs.mkdirSync(noReadmeDir, { recursive: true });
    fs.writeFileSync(path.join(noReadmeDir, 'package.json'), JSON.stringify({ name: 'no-readme', version: '1.0.0' }));
    const resNoReadme = scan(noReadmeDir);
    checks.push({
      num: 7,
      name: 'Missing README detected with MISSING_README warning',
      pass: resNoReadme.diagnostics.some((d) => d.code === 'MISSING_README' && d.severity === 'WARNING')
    });

    // 8. Missing .gitignore
    const noGitignoreDir = path.join(sandboxDir, 'no-gitignore-app');
    fs.mkdirSync(noGitignoreDir, { recursive: true });
    fs.writeFileSync(path.join(noGitignoreDir, 'package.json'), JSON.stringify({ name: 'no-gitignore', version: '1.0.0' }));
    const resNoGitignore = scan(noGitignoreDir);
    checks.push({
      num: 8,
      name: 'Missing .gitignore detected with MISSING_GITIGNORE warning',
      pass: resNoGitignore.diagnostics.some((d) => d.code === 'MISSING_GITIGNORE' && d.severity === 'WARNING')
    });

    // 9. Missing LICENSE
    const noLicenseDir = path.join(sandboxDir, 'no-license-app');
    fs.mkdirSync(noLicenseDir, { recursive: true });
    fs.writeFileSync(path.join(noLicenseDir, 'package.json'), JSON.stringify({ name: 'no-license', version: '1.0.0' }));
    const resNoLicense = scan(noLicenseDir);
    checks.push({
      num: 9,
      name: 'Missing LICENSE detected with MISSING_LICENSE warning',
      pass: resNoLicense.diagnostics.some((d) => d.code === 'MISSING_LICENSE' && d.severity === 'WARNING')
    });

    // 10. Missing main entry file
    const missingMainDir = path.join(sandboxDir, 'missing-main-app');
    fs.mkdirSync(missingMainDir, { recursive: true });
    fs.writeFileSync(
      path.join(missingMainDir, 'package.json'),
      JSON.stringify({ name: 'missing-main', version: '1.0.0', main: 'not-found.js' })
    );
    const resMissingMain = scan(missingMainDir);
    checks.push({
      num: 10,
      name: 'Missing main entry file detected with PKG_MAIN_NOT_FOUND warning',
      pass: resMissingMain.diagnostics.some((d) => d.code === 'PKG_MAIN_NOT_FOUND')
    });

    // 11. Missing test script
    const noTestScriptDir = path.join(sandboxDir, 'no-test-script-app');
    fs.mkdirSync(noTestScriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(noTestScriptDir, 'package.json'),
      JSON.stringify({ name: 'no-test-script', version: '1.0.0', scripts: {} })
    );
    const resNoTest = scan(noTestScriptDir);
    checks.push({
      num: 11,
      name: 'Missing test script detected with PKG_MISSING_TEST_SCRIPT warning',
      pass: resNoTest.diagnostics.some((d) => d.code === 'PKG_MISSING_TEST_SCRIPT')
    });

    // 12. Default placeholder test script
    const placeholderTestDir = path.join(sandboxDir, 'placeholder-test-app');
    fs.mkdirSync(placeholderTestDir, { recursive: true });
    fs.writeFileSync(
      path.join(placeholderTestDir, 'package.json'),
      JSON.stringify({
        name: 'placeholder-test',
        version: '1.0.0',
        scripts: { test: 'echo "Error: no test specified" && exit 1' }
      })
    );
    const resPlaceholder = scan(placeholderTestDir);
    checks.push({
      num: 12,
      name: 'Default placeholder test script detected with PKG_PLACEHOLDER_TEST_SCRIPT warning',
      pass: resPlaceholder.diagnostics.some((d) => d.code === 'PKG_PLACEHOLDER_TEST_SCRIPT')
    });

    // 13. Hardcoded API key
    const apiKeyDir = path.join(sandboxDir, 'api-key-app');
    fs.mkdirSync(apiKeyDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiKeyDir, 'package.json'),
      JSON.stringify({ name: 'api-key-app', version: '1.0.0' })
    );
    // Assemble test secret dynamically so self-scan won't match this file
    const sampleAwsKey = ['AKIA', '1234567890ABCDEF'].join('');
    fs.writeFileSync(path.join(apiKeyDir, 'config.js'), `const apiKey = '${sampleAwsKey}';\n`);
    const resApiKey = scan(apiKeyDir);
    checks.push({
      num: 13,
      name: 'Hardcoded API key detected with SECRET_EXPOSURE and line/column numbers',
      pass: resApiKey.diagnostics.some(
        (d) => d.code === 'SECRET_EXPOSURE' && d.file === 'config.js' && d.line === 1 && typeof d.column === 'number'
      )
    });

    // 14. Hardcoded password
    const pwdDir = path.join(sandboxDir, 'pwd-app');
    fs.mkdirSync(pwdDir, { recursive: true });
    fs.writeFileSync(
      path.join(pwdDir, 'package.json'),
      JSON.stringify({ name: 'pwd-app', version: '1.0.0' })
    );
    const samplePwd = ['SuperSecret', 'Password2026!'].join('');
    const pwdVar = ['pass', 'word'].join('');
    fs.writeFileSync(path.join(pwdDir, 'db.js'), `const ${pwdVar} = '${samplePwd}';\n`);
    const resPwd = scan(pwdDir);
    checks.push({
      num: 14,
      name: 'Hardcoded password detected with PASSWORD_EXPOSURE',
      pass: resPwd.diagnostics.some((d) => d.code === 'PASSWORD_EXPOSURE' && d.file === 'db.js' && d.line === 1)
    });

    // 15. Exposed .env file
    const envDir = path.join(sandboxDir, 'env-app');
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, 'package.json'),
      JSON.stringify({ name: 'env-app', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(envDir, '.env'), 'SECRET_TOKEN=xyz123\n');
    const resEnv = scan(envDir);
    checks.push({
      num: 15,
      name: 'Exposed .env file detected with ENV_FILE_EXPOSURE',
      pass: resEnv.diagnostics.some((d) => d.code === 'ENV_FILE_EXPOSURE' && d.file === '.env')
    });

    // 16. No security issues
    const cleanSecDir = path.join(sandboxDir, 'clean-sec-app');
    fs.mkdirSync(cleanSecDir, { recursive: true });
    fs.writeFileSync(
      path.join(cleanSecDir, 'package.json'),
      JSON.stringify({ name: 'clean-sec', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(cleanSecDir, 'service.js'), "const key = process.env.API_KEY;\nmodule.exports = key;\n");
    const resCleanSec = scan(cleanSecDir);
    checks.push({
      num: 16,
      name: 'No security issues reported on clean environment variable usage',
      pass: resCleanSec.diagnostics.filter((d) => d.scanner === 'security').length === 0
    });

    // 17. JavaScript syntax error
    const syntaxErrDir = path.join(sandboxDir, 'syntax-err-app');
    fs.mkdirSync(syntaxErrDir, { recursive: true });
    fs.writeFileSync(
      path.join(syntaxErrDir, 'package.json'),
      JSON.stringify({ name: 'syntax-err', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(syntaxErrDir, 'broken.js'), 'const a = 1;\nconst b = ;\n');
    const resSyntaxErr = scan(syntaxErrDir);
    checks.push({
      num: 17,
      name: 'JavaScript syntax error detected with JS_SYNTAX_ERROR and exact line/column',
      pass: resSyntaxErr.diagnostics.some(
        (d) => d.code === 'JS_SYNTAX_ERROR' && d.file === 'broken.js' && d.line === 2 && d.column > 0
      )
    });

    // 18. Valid JavaScript syntax
    const validJsDir = path.join(sandboxDir, 'valid-js-app');
    fs.mkdirSync(validJsDir, { recursive: true });
    fs.writeFileSync(
      path.join(validJsDir, 'package.json'),
      JSON.stringify({ name: 'valid-js', version: '1.0.0' })
    );
    fs.writeFileSync(
      path.join(validJsDir, 'math.js'),
      'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n'
    );
    const resValidJs = scan(validJsDir);
    checks.push({
      num: 18,
      name: 'Valid JavaScript syntax reports 0 syntax diagnostics',
      pass: resValidJs.diagnostics.filter((d) => d.scanner === 'syntax').length === 0
    });

    // 19. Nested directory scanning
    const nestedDir = path.join(sandboxDir, 'nested-app');
    fs.mkdirSync(path.join(nestedDir, 'a', 'b', 'c'), { recursive: true });
    fs.writeFileSync(
      path.join(nestedDir, 'package.json'),
      JSON.stringify({ name: 'nested-app', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(nestedDir, 'a', 'b', 'c', 'deep.js'), "module.exports = 'deep';\n");
    const resNested = scan(nestedDir);
    checks.push({
      num: 19,
      name: 'Nested directory scanning counts deep JavaScript files',
      pass: resNested.jsFiles.js >= 1 && resNested.summary.filesScanned >= 2
    });

    // 20. Deep directory structure (30 levels deep)
    const deepDir = path.join(sandboxDir, 'deep-app');
    let currDeep = deepDir;
    for (let i = 0; i < 30; i++) {
      currDeep = path.join(currDeep, `level_${i}`);
    }
    fs.mkdirSync(currDeep, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'package.json'), JSON.stringify({ name: 'deep-app', version: '1.0.0' }));
    fs.writeFileSync(path.join(currDeep, 'leaf.js'), 'console.log(30);\n');
    const resDeep = scan(deepDir);
    checks.push({
      num: 20,
      name: 'Deep directory structure (30 levels) traversed safely without stack overflow',
      pass: resDeep.jsFiles.js === 1
    });

    // 21. Empty project
    const emptyDir = path.join(sandboxDir, 'empty-app');
    fs.mkdirSync(emptyDir, { recursive: true });
    const resEmpty = scan(emptyDir);
    checks.push({
      num: 21,
      name: 'Empty project scanned gracefully with exit code 1',
      pass: resEmpty.exitCode === 1 && resEmpty.diagnostics.some((d) => d.code === 'PKG_MISSING')
    });

    // 22. Invalid target path
    const nonExistentPath = path.join(sandboxDir, 'non-existent-folder-12345');
    const resNonExistent = scan(nonExistentPath);
    checks.push({
      num: 22,
      name: 'Invalid target path results in TARGET_NOT_FOUND and exit code 2',
      pass: resNonExistent.exitCode === 2 && resNonExistent.diagnostics.some((d) => d.code === 'TARGET_NOT_FOUND')
    });

    // 23. Ignored directories
    const ignoredDir = path.join(sandboxDir, 'ignored-app');
    fs.mkdirSync(path.join(ignoredDir, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(ignoredDir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(ignoredDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(ignoredDir, 'package.json'), JSON.stringify({ name: 'ignored-app', version: '1.0.0' }));
    fs.writeFileSync(path.join(ignoredDir, 'node_modules', 'foo.js'), 'console.log("bad");\n');
    fs.writeFileSync(path.join(ignoredDir, 'dist', 'bundle.js'), 'console.log("dist");\n');
    fs.writeFileSync(path.join(ignoredDir, 'app.js'), 'console.log("app");\n');
    const resIgnored = scan(ignoredDir);
    checks.push({
      num: 23,
      name: 'Ignored directories (node_modules, dist, .git) correctly excluded from scan',
      pass: resIgnored.jsFiles.total === 1
    });

    // 24. Symbolic-link safety
    const symlinkDir = path.join(sandboxDir, 'symlink-app');
    fs.mkdirSync(path.join(symlinkDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(symlinkDir, 'package.json'), JSON.stringify({ name: 'symlink-app', version: '1.0.0' }));
    try {
      fs.symlinkSync(symlinkDir, path.join(symlinkDir, 'sub', 'loop'), 'dir');
    } catch {}
    const resSymlink = scan(symlinkDir);
    checks.push({
      num: 24,
      name: 'Symbolic-link loop handled safely without infinite iteration',
      pass: resSymlink.exitCode === 0 || resSymlink.exitCode === 1
    });

    // 25. JSON report generation
    const cpJson = child_process.spawnSync(process.execPath, [cliPath, validDir, '--json'], { encoding: 'utf8' });
    let parsedJsonOk = false;
    try {
      const parsed = JSON.parse(cpJson.stdout);
      parsedJsonOk =
        parsed.status === 'HEALTHY' &&
        Array.isArray(parsed.diagnostics) &&
        typeof parsed.summary.filesScanned === 'number';
    } catch {}
    checks.push({
      num: 25,
      name: 'JSON report generation produces valid structured machine-readable output',
      pass: cpJson.status === 0 && parsedJsonOk
    });

    // 26. Strict mode exit codes
    const warnOnlyDir = path.join(sandboxDir, 'warn-only-app');
    fs.mkdirSync(warnOnlyDir, { recursive: true });
    fs.writeFileSync(
      path.join(warnOnlyDir, 'package.json'),
      JSON.stringify({ name: 'warn-only', version: '1.0.0' })
    );
    const resNormal = scan(warnOnlyDir, { strict: false });
    const resStrict = scan(warnOnlyDir, { strict: true });
    checks.push({
      num: 26,
      name: 'Strict mode elevates warnings to exit code 1',
      pass: resNormal.exitCode === 0 && resStrict.exitCode === 1
    });

    // 27. Multiple diagnostic aggregation
    const multiDir = path.join(sandboxDir, 'multi-app');
    fs.mkdirSync(multiDir, { recursive: true });
    fs.writeFileSync(
      path.join(multiDir, 'package.json'),
      JSON.stringify({ name: 'multi-app', version: '1.0.0' })
    );
    fs.writeFileSync(path.join(multiDir, 'bad1.js'), 'const a = ;\n');
    const sampleAwsKey2 = ['AKIA', '0000111122223333'].join('');
    fs.writeFileSync(path.join(multiDir, 'bad2.js'), `const apiKey = '${sampleAwsKey2}';\n`);
    const resMulti = scan(multiDir);
    checks.push({
      num: 27,
      name: 'Multiple diagnostic aggregation correctly aggregates syntax and security issues',
      pass: resMulti.summary.errors >= 2 && resMulti.summary.filesWithIssues >= 2
    });

    // 28. File-level line and column reporting
    const lineColDir = path.join(sandboxDir, 'line-col-app');
    fs.mkdirSync(lineColDir, { recursive: true });
    fs.writeFileSync(
      path.join(lineColDir, 'package.json'),
      JSON.stringify({ name: 'line-col-app', version: '1.0.0' })
    );
    const sampleGhToken = ['ghp', '123456789012345678901234567890123456'].join('_');
    fs.writeFileSync(path.join(lineColDir, 'file.js'), `\n\nconst token = '${sampleGhToken}';\n`);
    const resLineCol = scan(lineColDir);
    const targetDiag = resLineCol.diagnostics.find((d) => d.code === 'SECRET_EXPOSURE');
    checks.push({
      num: 28,
      name: 'File-level line and column reporting provides accurate 1-based coordinates',
      pass: Boolean(targetDiag && targetDiag.line === 3 && targetDiag.column > 0)
    });

    // Print summary
    let passedCount = 0;
    let failedCount = 0;
    for (const chk of checks) {
      if (chk.pass) {
        passedCount++;
        process.stdout.write(`${c.green('[PASS]')} Check ${chk.num}: ${chk.name}\n`);
      } else {
        failedCount++;
        process.stdout.write(`${c.red('[FAIL]')} Check ${chk.num}: ${chk.name}\n`);
      }
    }

    process.stdout.write('\n');
    process.stdout.write(`Self-test summary: ${passedCount} passed, ${failedCount} failed.\n`);

    if (failedCount === 0) {
      process.stdout.write(`${c.bold('DevCheck is working correctly on this computer.')}\n`);
      return 0;
    } else {
      process.stdout.write(`${c.red('Self-test failed.')}\n`);
      return 1;
    }
  } finally {
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch {}
  }
}

module.exports = {
  runSelfTest
};
