'use strict';

const fs = require('fs');
const path = require('path');
const { createDiagnostic, SEVERITY } = require('./diagnostics');
const { checkPackage } = require('./package-checker');
const { checkStructure } = require('./structure-checker');
const { scanDirectory } = require('./file-scanner');
const { checkSecurityInFile } = require('./security-checker');
const { checkSyntaxInFile } = require('./syntax-checker');
const { buildReport } = require('./reporter');

function scan(targetDir, options = {}) {
  const checks = [];
  const diagnostics = [];
  const emptyCounts = { js: 0, cjs: 0, mjs: 0, jsx: 0, total: 0 };

  const inputDir = typeof targetDir === 'string' && targetDir.length > 0 ? targetDir : '.';
  const resolvedTarget = path.resolve(inputDir);

  // 1. Verify target directory
  let targetStat;
  try {
    targetStat = fs.statSync(resolvedTarget);
  } catch (err) {
    if (err.code === 'ENOENT') {
      checks.push({ type: 'FAIL', message: `Target directory does not exist: "${inputDir}"` });
      diagnostics.push(createDiagnostic({
        file: null,
        severity: SEVERITY.ERROR,
        code: 'TARGET_NOT_FOUND',
        message: `Target directory does not exist: "${inputDir}"`,
        suggestion: 'Provide a valid directory path to scan.',
        scanner: 'file'
      }));
      return buildReport({
        targetDir: resolvedTarget,
        projectInfo: null,
        checks,
        diagnostics,
        jsFiles: emptyCounts,
        filesScannedCount: 0,
        forceExitCode: 2
      });
    }
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      checks.push({ type: 'FAIL', message: `Target directory is not accessible (permission denied): "${inputDir}"` });
      diagnostics.push(createDiagnostic({
        file: null,
        severity: SEVERITY.ERROR,
        code: 'TARGET_PERMISSION_DENIED',
        message: `Target directory is not accessible (permission denied): "${inputDir}"`,
        suggestion: 'Grant read and execute permissions for the target directory.',
        scanner: 'file'
      }));
      return buildReport({
        targetDir: resolvedTarget,
        projectInfo: null,
        checks,
        diagnostics,
        jsFiles: emptyCounts,
        filesScannedCount: 0,
        forceExitCode: 2
      });
    }
    checks.push({ type: 'FAIL', message: `Cannot access target path "${inputDir}": ${err.message}` });
    diagnostics.push(createDiagnostic({
      file: null,
      severity: SEVERITY.ERROR,
      code: 'TARGET_ACCESS_ERROR',
      message: `Cannot access target path "${inputDir}": ${err.message}`,
      suggestion: 'Verify the path and filesystem permissions.',
      scanner: 'file'
    }));
    return buildReport({
      targetDir: resolvedTarget,
      projectInfo: null,
      checks,
      diagnostics,
      jsFiles: emptyCounts,
      filesScannedCount: 0,
      forceExitCode: 2
    });
  }

  if (!targetStat.isDirectory()) {
    checks.push({ type: 'FAIL', message: `Target path is not a directory: "${inputDir}"` });
    diagnostics.push(createDiagnostic({
      file: null,
      severity: SEVERITY.ERROR,
      code: 'TARGET_NOT_A_DIRECTORY',
      message: `Target path is not a directory: "${inputDir}"`,
      suggestion: 'Provide a directory path rather than a file.',
      scanner: 'file'
    }));
    return buildReport({
      targetDir: resolvedTarget,
      projectInfo: null,
      checks,
      diagnostics,
      jsFiles: emptyCounts,
      filesScannedCount: 0,
      forceExitCode: 2
    });
  }

  // Verify target directory is readable
  let rootEntries;
  try {
    rootEntries = fs.readdirSync(resolvedTarget);
  } catch (err) {
    checks.push({ type: 'FAIL', message: `Target directory is not readable (permission denied): "${inputDir}"` });
    diagnostics.push(createDiagnostic({
      file: null,
      severity: SEVERITY.ERROR,
      code: 'TARGET_NOT_READABLE',
      message: `Target directory is not readable (permission denied): "${inputDir}"`,
      suggestion: 'Check directory permissions.',
      scanner: 'file'
    }));
    return buildReport({
      targetDir: resolvedTarget,
      projectInfo: null,
      checks,
      diagnostics,
      jsFiles: emptyCounts,
      filesScannedCount: 0,
      forceExitCode: 2
    });
  }

  checks.push({ type: 'PASS', message: 'Target directory exists and is readable' });

  // 2. Scan Directory files
  const dirScan = scanDirectory(resolvedTarget, options);
  for (const w of dirScan.warnings) {
    checks.push({ type: 'WARN', message: w });
  }
  diagnostics.push(...dirScan.diagnostics);

  // 3. Package Checker
  const pkgRes = checkPackage(resolvedTarget);
  checks.push(...pkgRes.checks);
  diagnostics.push(...pkgRes.diagnostics);

  // 4. Structure Checker
  const structRes = checkStructure(resolvedTarget, rootEntries);
  checks.push(...structRes.checks);
  diagnostics.push(...structRes.diagnostics);

  // 5. File-Level Scanners: Security & Syntax
  for (const relFile of dirScan.scannableFiles) {
    // Security scan
    const secDiags = checkSecurityInFile(resolvedTarget, relFile);
    diagnostics.push(...secDiags);

    // Syntax scan for JS files
    const synDiags = checkSyntaxInFile(resolvedTarget, relFile);
    diagnostics.push(...synDiags);
  }

  const filesScannedCount = dirScan.scannableFiles.length;

  return buildReport({
    targetDir: resolvedTarget,
    projectInfo: pkgRes.projectInfo,
    checks,
    diagnostics,
    jsFiles: dirScan.counts,
    filesScannedCount,
    strict: Boolean(options.strict)
  });
}

module.exports = {
  scan
};
