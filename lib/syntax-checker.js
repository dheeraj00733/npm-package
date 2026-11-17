'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDiagnostic, SEVERITY } = require('./diagnostics');
const { MAX_FILE_SIZE_BYTES } = require('./config');

function parseSyntaxError(err, filename) {
  if (!err) return { line: null, column: null, message: 'Syntax error' };
  const lines = (err.stack || '').split('\n');
  let line = null;
  let column = null;

  const escapedName = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fileRegex = new RegExp(`(?:^|[^a-zA-Z0-9_-])${escapedName}:(\\d+)`);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const match = l.match(fileRegex) || l.match(/^[a-zA-Z0-9_\-./\\]+:(\d+)/);
    if (match) {
      line = parseInt(match[1], 10);
      if (lines[i + 2] && lines[i + 2].includes('^')) {
        column = lines[i + 2].indexOf('^') + 1;
      }
      break;
    }
  }

  // Fallback: check for line and column in error message
  if (line === null) {
    const msgMatch = err.message.match(/line\s+(\d+)(?:,\s*column\s+(\d+))?/i);
    if (msgMatch) {
      line = parseInt(msgMatch[1], 10);
      if (msgMatch[2]) {
        column = parseInt(msgMatch[2], 10);
      }
    }
  }

  return { line, column, message: err.message };
}

function maskEsmKeywords(source) {
  // 1. Replace "export default " with spaces
  let s = source.replace(/\bexport\s+default\s+/g, (m) => ' '.repeat(m.length));
  // 2. Replace "export " before declarations (const, let, var, function, class, async) with spaces
  s = s.replace(/\bexport\s+(?=(?:const|let|var|function|class|async\s+function)\b)/g, (m) => ' '.repeat(m.length));
  // 3. Replace "export { ... } [from ...];" with spaces
  s = s.replace(/\bexport\s*\{[^}]*\}\s*(?:from\s*["'][^"']+["'])?\s*;?/g, (m) => ' '.repeat(m.length));
  // 4. Replace "export * from ...;" with spaces
  s = s.replace(/\bexport\s*\*\s*(?:as\s+\w+\s+)?from\s*["'][^"']+["']\s*;?/g, (m) => ' '.repeat(m.length));
  // 5. Replace "import ... from ...;" or "import '...';" with spaces
  s = s.replace(/\bimport\s+(?:(?:\*\s+as\s+\w+|[\w\s{},]+)\s+from\s+)?["'][^"']+["']\s*;?/g, (m) => ' '.repeat(m.length));
  return s;
}

function checkSyntaxInFile(targetDir, relPath) {
  const diagnostics = [];
  const ext = path.extname(relPath).toLowerCase();

  if (!['.js', '.cjs', '.mjs', '.jsx'].includes(ext)) {
    return diagnostics;
  }

  // JSX is marked unsupported natively per Section 3.C
  if (ext === '.jsx') {
    diagnostics.push(createDiagnostic({
      file: relPath,
      line: null,
      column: null,
      severity: SEVERITY.INFO,
      code: 'JSX_SYNTAX_UNSUPPORTED',
      message: 'JSX syntax validation is not supported natively by Node.js vm; syntax check skipped',
      suggestion: 'Use a Babel or TypeScript parser pipeline for JSX syntax verification.',
      scanner: 'syntax'
    }));
    return diagnostics;
  }

  const fullPath = path.resolve(targetDir, relPath);

  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return diagnostics;
  }

  if (!stat.isFile() || stat.size > MAX_FILE_SIZE_BYTES) {
    return diagnostics;
  }

  let code;
  try {
    code = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return diagnostics;
  }

  // Handle shebang lines
  let testCode = code;
  if (testCode.startsWith('#!')) {
    const firstNewline = testCode.indexOf('\n');
    if (firstNewline !== -1) {
      testCode = '//' + testCode.slice(2, firstNewline) + testCode.slice(firstNewline);
    } else {
      testCode = '//' + testCode.slice(2);
    }
  }

  try {
    new vm.Script(testCode, { filename: relPath, produceCachedData: false });
  } catch (err) {
    if (err instanceof SyntaxError) {
      const isEsmError =
        err.message.includes('Cannot use import statement outside a module') ||
        err.message.includes("Unexpected token 'export'") ||
        err.message.includes("Cannot use 'import.meta' outside a module");

      if (isEsmError) {
        // Mask static import/export declarations while preserving character and line offsets
        const sanitizedCode = maskEsmKeywords(testCode);

        try {
          new vm.Script(sanitizedCode, { filename: relPath, produceCachedData: false });
          // If masked code compiles without error, it is valid ES module syntax
          return diagnostics;
        } catch (subErr) {
          if (subErr instanceof SyntaxError) {
            // Check if subErr is still just an ESM unsupported construct
            const stillEsm =
              subErr.message.includes('Cannot use import statement outside a module') ||
              subErr.message.includes("Unexpected token 'export'") ||
              subErr.message.includes("Cannot use 'import.meta' outside a module");

            if (stillEsm) {
              // Valid ESM construct that could not be masked, do not report as error
              return diagnostics;
            }

            const parsed = parseSyntaxError(subErr, relPath);
            diagnostics.push(createDiagnostic({
              file: relPath,
              line: parsed.line,
              column: parsed.column,
              severity: SEVERITY.ERROR,
              code: 'JS_SYNTAX_ERROR',
              message: `JavaScript syntax error: ${parsed.message}`,
              suggestion: parsed.line ? `Check the syntax near line ${parsed.line}.` : 'Correct JavaScript syntax error.',
              scanner: 'syntax'
            }));
            return diagnostics;
          }
        }
      }

      const parsed = parseSyntaxError(err, relPath);
      diagnostics.push(createDiagnostic({
        file: relPath,
        line: parsed.line,
        column: parsed.column,
        severity: SEVERITY.ERROR,
        code: 'JS_SYNTAX_ERROR',
        message: `JavaScript syntax error: ${parsed.message}`,
        suggestion: parsed.line ? `Check the syntax near line ${parsed.line}.` : 'Correct JavaScript syntax error.',
        scanner: 'syntax'
      }));
    }
  }

  return diagnostics;
}

module.exports = {
  checkSyntaxInFile,
  parseSyntaxError,
  maskEsmKeywords
};
