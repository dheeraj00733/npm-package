'use strict';

function formatTerminalReport(result, options = {}) {
  const useColor = Boolean(options.color);
  const verbose = Boolean(options.verbose);
  const summaryOnly = Boolean(options.summary);

  const c = {
    green: (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
    yellow: (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
    red: (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
    cyan: (s) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
    bold: (s) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
    dim: (s) => (useColor ? `\x1b[2m${s}\x1b[0m` : s)
  };

  const lines = [];
  lines.push('============================================================');
  lines.push(c.bold('DEV CHECK'));
  lines.push('Node.js Project Diagnostic Engine');
  lines.push('');
  lines.push(`Scanning: ${result.target}`);
  lines.push('============================================================');

  if (summaryOnly) {
    lines.push('');
    lines.push(formatSummaryBlock(result, c));
    return lines.join('\n');
  }

  if (result.project && result.project.name) {
    const ver = result.project.version ? `v${result.project.version}` : '(no version)';
    lines.push('');
    lines.push(`Project: ${c.bold(result.project.name)} ${ver}`);
  }

  if (verbose && result.project && result.project.scripts) {
    const scriptKeys = Object.keys(result.project.scripts);
    if (scriptKeys.length > 0) {
      lines.push('');
      lines.push(`Scripts (${scriptKeys.length}):`);
      for (const key of scriptKeys) {
        lines.push(`  - ${key}: ${result.project.scripts[key]}`);
      }
    }
  }

  // 1. Output PASS checks
  const passChecks = (result.checks || []).filter((ch) => ch.type === 'PASS');
  if (passChecks.length > 0) {
    lines.push('');
    for (const chk of passChecks) {
      lines.push(`${c.green('[PASS]')} ${chk.message}`);
    }
  }

  // Output FAIL checks
  const failChecks = (result.checks || []).filter((ch) => ch.type === 'FAIL');
  if (failChecks.length > 0) {
    lines.push('');
    for (const f of failChecks) {
      lines.push(`${c.red('[FAIL]')} ${f.message}`);
    }
  }

  // 2. Output Diagnostics
  const diags = result.diagnostics || [];
  if (diags.length > 0) {
    lines.push('');
    for (const d of diags) {
      if (d.severity === 'INFO' && !verbose) {
        continue;
      }

      let tag;
      if (d.severity === 'ERROR') {
        tag = c.red('[ERROR]');
      } else if (d.severity === 'WARNING') {
        tag = c.yellow('[WARNING]');
      } else {
        tag = c.cyan('[INFO]');
      }

      let locStr = d.file || '(project)';
      if (d.line !== null) {
        locStr += `:${d.line}`;
        if (d.column !== null) {
          locStr += `:${d.column}`;
        }
      }

      lines.push(`${tag} ${locStr}`);
      lines.push(`        ${d.message}`);
      if (d.code) {
        lines.push(`        ${c.dim('Code:')} ${d.code}`);
      }
      if (d.suggestion) {
        lines.push(`        ${c.dim('Fix:')} ${d.suggestion}`);
      }
      lines.push('');
    }
  }


  // File breakdown
  if (result.jsFiles) {
    lines.push('JavaScript Files:');
    lines.push(`  .js:    ${result.jsFiles.js}`);
    lines.push(`  .cjs:   ${result.jsFiles.cjs}`);
    lines.push(`  .mjs:   ${result.jsFiles.mjs}`);
    lines.push(`  .jsx:   ${result.jsFiles.jsx}`);
    lines.push(`  Total:  ${result.jsFiles.total}`);
  }

  lines.push('');
  lines.push(formatSummaryBlock(result, c));

  return lines.join('\n');
}

function formatSummaryBlock(result, c) {
  let statusStr = result.status;
  if (result.status === 'HEALTHY') {
    statusStr = c.green(result.status);
  } else if (result.status === 'HEALTHY WITH WARNINGS') {
    statusStr = c.yellow(result.status);
  } else {
    statusStr = c.red(result.status);
  }

  const s = result.summary || {
    filesScanned: 0,
    filesWithIssues: 0,
    errors: 0,
    warnings: 0,
    info: 0
  };

  const lines = [];
  lines.push('------------------------------------------------------------');
  lines.push(`PROJECT HEALTH: ${c.bold(statusStr)}`);
  lines.push('');
  lines.push(`Files scanned: ${s.filesScanned}`);
  lines.push(`Files with issues: ${s.filesWithIssues}`);
  lines.push(`Errors: ${s.errors}`);
  lines.push(`Warnings: ${s.warnings}`);
  lines.push(`Info: ${s.info}`);
  lines.push('------------------------------------------------------------');

  return lines.join('\n');
}

module.exports = {
  formatTerminalReport
};
