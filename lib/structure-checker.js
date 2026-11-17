'use strict';

const fs = require('fs');
const path = require('path');
const { createDiagnostic, SEVERITY } = require('./diagnostics');

function checkStructure(targetDir, dirEntries = []) {
  const diagnostics = [];
  const checks = [];

  // 1. README.md
  if (dirEntries.includes('README.md')) {
    checks.push({ type: 'PASS', message: 'README.md found' });
  } else {
    const readmeAlt = dirEntries.find(
      (f) => f.toLowerCase() === 'readme.md' || f.toLowerCase().startsWith('readme')
    );
    if (readmeAlt) {
      checks.push({ type: 'WARN', message: `README file found but not named exactly "README.md" (found "${readmeAlt}")` });
      diagnostics.push(createDiagnostic({
        file: readmeAlt,
        line: null,
        column: null,
        severity: SEVERITY.WARNING,
        code: 'README_NAMING',
        message: `README file found but not named exactly "README.md" (found "${readmeAlt}")`,
        suggestion: 'Rename the file to "README.md" to follow standard convention.',
        scanner: 'structure'
      }));
    } else {
      checks.push({ type: 'WARN', message: 'README.md is missing' });
      diagnostics.push(createDiagnostic({
        file: 'README.md',
        line: null,
        column: null,
        severity: SEVERITY.WARNING,
        code: 'MISSING_README',
        message: 'README.md is missing from project root',
        suggestion: 'Create a README.md file documenting project usage and installation.',
        scanner: 'structure'
      }));
    }
  }

  // 2. .gitignore
  if (dirEntries.includes('.gitignore')) {
    checks.push({ type: 'PASS', message: '.gitignore found' });
  } else {
    checks.push({ type: 'WARN', message: '.gitignore is missing' });
    diagnostics.push(createDiagnostic({
      file: '.gitignore',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'MISSING_GITIGNORE',
      message: '.gitignore is missing from project root',
      suggestion: 'Add a .gitignore file to prevent checking in node_modules and secrets.',
      scanner: 'structure'
    }));
  }

  // 3. LICENSE
  const licenseCandidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt'];
  const foundLicense = licenseCandidates.find((cand) => dirEntries.includes(cand));
  if (foundLicense) {
    checks.push({ type: 'PASS', message: `LICENSE file found (${foundLicense})` });
  } else {
    checks.push({ type: 'WARN', message: 'LICENSE file is missing' });
    diagnostics.push(createDiagnostic({
      file: 'LICENSE',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'MISSING_LICENSE',
      message: 'LICENSE file is missing from project root',
      suggestion: 'Include an open-source or proprietary LICENSE file in your repository.',
      scanner: 'structure'
    }));
  }

  // 4. Lock file
  const lockCandidates = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'];
  const foundLock = lockCandidates.find((cand) => dirEntries.includes(cand));
  if (foundLock) {
    checks.push({ type: 'PASS', message: `Lock file found (${foundLock})` });
  } else {
    checks.push({ type: 'WARN', message: 'No package lock file found (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock)' });
    diagnostics.push(createDiagnostic({
      file: 'package-lock.json',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'MISSING_LOCKFILE',
      message: 'No package lock file found (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock)',
      suggestion: 'Commit a lockfile to ensure reproducible dependency installs.',
      scanner: 'structure'
    }));
  }

  // 5. Test directory
  const testDirCandidates = ['test', 'tests', '__tests__', 'spec'];
  let foundTestDir = null;
  for (const tDir of testDirCandidates) {
    const candidatePath = path.join(targetDir, tDir);
    try {
      const s = fs.statSync(candidatePath);
      if (s.isDirectory()) {
        foundTestDir = tDir;
        break;
      }
    } catch {}
  }
  if (foundTestDir) {
    checks.push({ type: 'PASS', message: `Test directory found (${foundTestDir})` });
  } else {
    checks.push({ type: 'WARN', message: 'No test directory found (test, tests, __tests__, spec)' });
    diagnostics.push(createDiagnostic({
      file: 'test',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'MISSING_TEST_DIR',
      message: 'No test directory found (test, tests, __tests__, spec)',
      suggestion: 'Create a "test/" directory containing automated tests for your project.',
      scanner: 'structure'
    }));
  }

  // 6. Check for empty source directories (e.g. src/ or lib/)
  for (const srcDirName of ['src', 'lib']) {
    if (dirEntries.includes(srcDirName)) {
      const p = path.join(targetDir, srcDirName);
      try {
        const s = fs.statSync(p);
        if (s.isDirectory()) {
          const contents = fs.readdirSync(p);
          if (contents.length === 0) {
            diagnostics.push(createDiagnostic({
              file: srcDirName,
              line: null,
              column: null,
              severity: SEVERITY.INFO,
              code: 'EMPTY_SOURCE_DIR',
              message: `Source directory "${srcDirName}/" is empty`,
              suggestion: `Add source files or remove the unused "${srcDirName}/" directory.`,
              scanner: 'structure'
            }));
          }
        }
      } catch {}
    }
  }

  return {
    diagnostics,
    checks
  };
}

module.exports = {
  checkStructure
};
