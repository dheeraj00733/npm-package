'use strict';

const fs = require('fs');
const path = require('path');
const { createDiagnostic, SEVERITY } = require('./diagnostics');
const { DEFAULT_IGNORED_DIRS, shouldIgnore, parseIgnoreFile } = require('./config');

function scanDirectory(rootDir, options = {}) {
  const counts = { js: 0, cjs: 0, mjs: 0, jsx: 0, total: 0 };
  const totalCounts = { files: 0, folders: 0 };
  const warnings = [];
  const diagnostics = [];
  const scannableFiles = [];
  const visitedRealPaths = new Set();

  let ignoreRules = [];
  const ignoreFilePath = path.join(rootDir, '.devcheckignore');
  try {
    if (fs.existsSync(ignoreFilePath)) {
      const ignoreContent = fs.readFileSync(ignoreFilePath, 'utf8');
      ignoreRules = parseIgnoreFile(ignoreContent);
    }
  } catch {}

  // Resolve root real path to prevent cycles
  try {
    const rootReal = fs.realpathSync(rootDir);
    visitedRealPaths.add(rootReal);
  } catch {}

  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      const rel = path.relative(rootDir, currentDir) || '.';
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        warnings.push(`Unreadable directory skipped: "${rel}" (permission denied)`);
        diagnostics.push(createDiagnostic({
          file: rel,
          line: null,
          column: null,
          severity: SEVERITY.WARNING,
          code: 'DIRECTORY_UNREADABLE',
          message: `Unreadable directory skipped: "${rel}" (permission denied)`,
          suggestion: 'Ensure proper read permissions are granted for this directory.',
          scanner: 'file'
        }));
        continue;
      }
      warnings.push(`Directory skipped: "${currentDir}" (${err.message})`);
      diagnostics.push(createDiagnostic({
        file: rel,
        line: null,
        column: null,
        severity: SEVERITY.WARNING,
        code: 'DIRECTORY_READ_ERROR',
        message: `Directory skipped: "${currentDir}" (${err.message})`,
        suggestion: 'Check directory access permissions and path validity.',
        scanner: 'file'
      }));
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      // Skip internal symlinks strictly to prevent infinite loops and escaping project root
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        totalCounts.folders++;

        // Check if directory should be ignored
        if (shouldIgnore(relPath, true, ignoreRules)) {
          continue;
        }

        // Cycle check
        try {
          const real = fs.realpathSync(fullPath);
          if (visitedRealPaths.has(real)) {
            continue;
          }
          visitedRealPaths.add(real);
        } catch {
          // If realpath fails, skip to be safe
          continue;
        }

        stack.push(fullPath);
      } else if (entry.isFile()) {
        totalCounts.files++;

        if (shouldIgnore(relPath, false, ignoreRules)) {
          continue;
        }

        scannableFiles.push(relPath);

        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.js') {
          counts.js++;
          counts.total++;
        } else if (ext === '.cjs') {
          counts.cjs++;
          counts.total++;
        } else if (ext === '.mjs') {
          counts.mjs++;
          counts.total++;
        } else if (ext === '.jsx') {
          counts.jsx++;
          counts.total++;
        }
      }
    }
  }

  return {
    counts,
    totalCounts,
    warnings,
    diagnostics,
    scannableFiles,
    ignoreRules
  };
}

module.exports = {
  scanDirectory
};
