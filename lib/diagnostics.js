'use strict';

const SEVERITY = Object.freeze({
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO'
});

function createDiagnostic({
  file,
  line = null,
  column = null,
  severity,
  code,
  message,
  suggestion,
  scanner
}) {
  const normSeverity = String(severity || SEVERITY.ERROR).toUpperCase();
  if (![SEVERITY.ERROR, SEVERITY.WARNING, SEVERITY.INFO].includes(normSeverity)) {
    throw new Error(`Invalid diagnostic severity: ${severity}`);
  }

  const normLine = typeof line === 'number' && Number.isFinite(line) && line > 0 ? Math.floor(line) : null;
  const normColumn = typeof column === 'number' && Number.isFinite(column) && column > 0 ? Math.floor(column) : null;

  return {
    file: file !== undefined && file !== null ? String(file) : null,
    line: normLine,
    column: normColumn,
    severity: normSeverity,
    code: String(code || 'DEVCHECK_DIAGNOSTIC'),
    message: String(message || ''),
    suggestion: String(suggestion || ''),
    scanner: String(scanner || 'general')
  };
}

module.exports = {
  SEVERITY,
  createDiagnostic
};
