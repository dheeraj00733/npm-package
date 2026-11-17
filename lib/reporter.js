'use strict';

const path = require('path');
const { VERSION } = require('./config');

function buildReport({
  targetDir,
  projectInfo,
  checks = [],
  diagnostics = [],
  jsFiles = { js: 0, cjs: 0, mjs: 0, jsx: 0, total: 0 },
  filesScannedCount = 0,
  forceExitCode,
  strict = false
}) {
  const errors = diagnostics.filter((d) => d.severity === 'ERROR').length;
  const warnings = diagnostics.filter((d) => d.severity === 'WARNING').length;
  const info = diagnostics.filter((d) => d.severity === 'INFO').length;

  // Distinct files with issues
  const distinctFiles = new Set();
  for (const d of diagnostics) {
    if (d.file) {
      distinctFiles.add(d.file);
    }
  }
  const filesWithIssues = distinctFiles.size;

  const passedChecks = checks.filter((c) => c.type === 'PASS').length;
  const failedChecks = checks.filter((c) => c.type === 'FAIL').length;

  let status;
  if (errors > 0 || failedChecks > 0) {
    status = 'UNHEALTHY';
  } else if (warnings > 0 || checks.some((c) => c.type === 'WARN')) {
    status = 'HEALTHY WITH WARNINGS';
  } else {
    status = 'HEALTHY';
  }

  let exitCode = 0;
  if (forceExitCode !== undefined && forceExitCode !== null) {
    exitCode = forceExitCode;
  } else if (status === 'UNHEALTHY') {
    exitCode = 1;
  } else if (strict && (warnings > 0 || checks.some((c) => c.type === 'WARN'))) {
    exitCode = 1;
  }

  const projName = projectInfo && projectInfo.name ? projectInfo.name : path.basename(targetDir);

  return {
    tool: 'DevCheck',
    version: VERSION,
    target: targetDir,
    project: projectInfo || {
      name: projName,
      version: null,
      scripts: {}
    },
    status,
    summary: {
      filesScanned: filesScannedCount,
      filesWithIssues,
      errors,
      warnings,
      info,
      passed: passedChecks,
      failed: errors + failedChecks
    },
    diagnostics,
    checks,
    jsFiles,
    exitCode
  };
}

module.exports = {
  buildReport
};
