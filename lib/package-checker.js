'use strict';

const fs = require('fs');
const path = require('path');
const { createDiagnostic, SEVERITY } = require('./diagnostics');
const { NODE_CORE_MODULES, STRICT_SEMVER_REGEX } = require('./config');

function findKeyLocationInJson(rawText, key) {
  if (typeof rawText !== 'string' || !key) return { line: null, column: null };
  const lines = rawText.split('\n');
  const regex = new RegExp(`["']${key}["']\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    const match = regex.exec(lines[i]);
    if (match) {
      return { line: i + 1, column: match.index + 1 };
    }
  }
  return { line: null, column: null };
}

function extractJsonErrorLocation(rawText, err) {
  if (!err || typeof err.message !== 'string') {
    return { line: null, column: null };
  }
  const lineColMatch = err.message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1], 10),
      column: parseInt(lineColMatch[2], 10)
    };
  }
  const posMatch = err.message.match(/at position\s+(\d+)/i);
  if (posMatch && typeof rawText === 'string') {
    const pos = parseInt(posMatch[1], 10);
    const before = rawText.slice(0, pos);
    const lines = before.split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }
  // Fallback: check for snippet in error message
  const snippetMatch = err.message.match(/\.\.\."([^"]+)"/);
  if (snippetMatch && typeof rawText === 'string') {
    const snippet = snippetMatch[1];
    const idx = rawText.indexOf(snippet);
    if (idx !== -1) {
      const before = rawText.slice(0, idx);
      const lines = before.split('\n');
      return {
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      };
    }
  }
  return { line: null, column: null };
}

function validatePackageName(name) {
  if (typeof name !== 'string') {
    return { valid: false, reason: 'package name must be a string' };
  }
  if (name.length === 0) {
    return { valid: false, reason: 'package name cannot be empty' };
  }
  if (name.trim() !== name) {
    return { valid: false, reason: 'package name cannot contain leading or trailing whitespace' };
  }
  if (name.length > 214) {
    return { valid: false, reason: `package name exceeds 214 characters (length: ${name.length})` };
  }
  if (name !== name.toLowerCase()) {
    return { valid: false, reason: 'package name must be all lowercase' };
  }
  if (/\s/.test(name)) {
    return { valid: false, reason: 'package name cannot contain spaces' };
  }

  // Scoped package
  if (name.startsWith('@')) {
    const slashIdx = name.indexOf('/');
    if (slashIdx === -1 || name.indexOf('/', slashIdx + 1) !== -1) {
      return { valid: false, reason: 'scoped package name must have format @scope/package with exactly one "/"' };
    }
    const scope = name.slice(1, slashIdx);
    const pkg = name.slice(slashIdx + 1);
    if (!scope || !pkg) {
      return { valid: false, reason: 'scoped package name must include non-empty scope and package names' };
    }
    if (scope.startsWith('.') || scope.startsWith('_')) {
      return { valid: false, reason: 'scope cannot start with "." or "_"' };
    }
    if (pkg.startsWith('.') || pkg.startsWith('_')) {
      return { valid: false, reason: 'package name cannot start with "." or "_"' };
    }
    if (!/^[a-z0-9_.-]+$/.test(scope)) {
      return { valid: false, reason: 'scope contains non-URL-safe characters' };
    }
    if (!/^[a-z0-9_.-]+$/.test(pkg)) {
      return { valid: false, reason: 'package name contains non-URL-safe characters' };
    }
    if (/[~')('!*]/.test(name)) {
      return { valid: false, reason: 'package name cannot contain special characters (~, \', ), (, !, *)' };
    }
    return { valid: true };
  }

  // Unscoped package
  if (name.startsWith('.') || name.startsWith('_')) {
    return { valid: false, reason: 'package name cannot start with "." or "_"' };
  }
  if (NODE_CORE_MODULES.has(name)) {
    return { valid: false, reason: `package name "${name}" is a reserved Node.js core module name` };
  }
  if (name === 'node_modules' || name === 'favicon.ico') {
    return { valid: false, reason: `package name "${name}" is a reserved name` };
  }
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(name)) {
    return { valid: false, reason: 'package name contains invalid characters or does not start with alphanumeric character' };
  }
  if (/[~')('!*]/.test(name)) {
    return { valid: false, reason: 'package name cannot contain special characters (~, \', ), (, !, *)' };
  }

  return { valid: true };
}

function validateVersion(version) {
  if (typeof version !== 'string') {
    return { valid: false, reason: 'version must be a string' };
  }
  if (!version.trim()) {
    return { valid: false, reason: 'version cannot be empty' };
  }
  if (!STRICT_SEMVER_REGEX.test(version)) {
    return {
      valid: false,
      reason: `"${version}" is not a valid strict semver (expected MAJOR.MINOR.PATCH per semver.org without leading zeros or "v" prefix)`
    };
  }
  return { valid: true };
}

function checkPackage(targetDir) {
  const diagnostics = [];
  const checks = [];
  const pkgPath = path.join(targetDir, 'package.json');

  let pkgStat;
  try {
    pkgStat = fs.statSync(pkgPath);
  } catch (err) {
    checks.push({ type: 'FAIL', message: 'package.json is missing in project root' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.ERROR,
      code: 'PKG_MISSING',
      message: 'package.json is missing in project root',
      suggestion: 'Run "npm init" to create a package.json file.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  if (pkgStat.isDirectory()) {
    checks.push({ type: 'FAIL', message: 'package.json is a directory, expected a JSON file' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.ERROR,
      code: 'PKG_IS_DIRECTORY',
      message: 'package.json is a directory, expected a JSON file',
      suggestion: 'Replace the package.json directory with a valid JSON file.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  let rawContent;
  try {
    rawContent = fs.readFileSync(pkgPath, 'utf8');
  } catch (err) {
    checks.push({ type: 'FAIL', message: `package.json could not be read: ${err.message}` });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.ERROR,
      code: 'PKG_READ_ERROR',
      message: `package.json could not be read: ${err.message}`,
      suggestion: 'Check file read permissions for package.json.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  // Handle UTF-8 BOM
  let hasBom = false;
  if (rawContent.charCodeAt(0) === 0xFEFF) {
    hasBom = true;
    rawContent = rawContent.slice(1);
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: 1,
      column: 1,
      severity: SEVERITY.INFO,
      code: 'PKG_UTF8_BOM',
      message: 'package.json contains a UTF-8 BOM (Byte Order Mark)',
      suggestion: 'Remove the BOM character to maximize cross-platform compatibility.',
      scanner: 'package'
    }));
  }

  if (rawContent.trim().length === 0) {
    checks.push({ type: 'FAIL', message: 'package.json is empty' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: 1,
      column: 1,
      severity: SEVERITY.ERROR,
      code: 'PKG_EMPTY',
      message: 'package.json is empty',
      suggestion: 'Populate package.json with a valid JSON object.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  let pkg;
  try {
    pkg = JSON.parse(rawContent);
  } catch (err) {
    const loc = extractJsonErrorLocation(rawContent, err);
    checks.push({ type: 'FAIL', message: `package.json contains malformed JSON: ${err.message}` });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: loc.line,
      column: loc.column,
      severity: SEVERITY.ERROR,
      code: 'PKG_MALFORMED_JSON',
      message: `package.json contains malformed JSON: ${err.message}`,
      suggestion: 'Correct the syntax error in package.json.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) {
    const foundType = pkg === null ? 'null' : Array.isArray(pkg) ? 'array' : typeof pkg;
    checks.push({ type: 'FAIL', message: `package.json top-level must be an object (found ${foundType})` });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: 1,
      column: 1,
      severity: SEVERITY.ERROR,
      code: 'PKG_TOPLEVEL_NON_OBJECT',
      message: `package.json top-level must be an object (found ${foundType})`,
      suggestion: 'Ensure package.json root is a JSON object with curly braces {}.',
      scanner: 'package'
    }));
    return {
      diagnostics,
      checks,
      projectInfo: null,
      hasPackageJson: false,
      pkg: null
    };
  }

  checks.push({ type: 'PASS', message: 'package.json is valid JSON' });

  // Name check
  if (!('name' in pkg)) {
    checks.push({ type: 'FAIL', message: 'package.json "name" field is missing' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.ERROR,
      code: 'PKG_NAME_MISSING',
      message: 'package.json "name" field is missing',
      suggestion: 'Add a "name" field to package.json.',
      scanner: 'package'
    }));
  } else {
    const nameResult = validatePackageName(pkg.name);
    const loc = findKeyLocationInJson(rawContent, 'name');
    if (!nameResult.valid) {
      checks.push({ type: 'FAIL', message: `package.json "name": ${nameResult.reason}` });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.ERROR,
        code: 'PKG_NAME_INVALID',
        message: `package.json "name": ${nameResult.reason}`,
        suggestion: 'Ensure package name is lowercase, URL-safe, and under 214 characters.',
        scanner: 'package'
      }));
    } else {
      checks.push({ type: 'PASS', message: `Valid package name: "${pkg.name}"` });
    }
  }

  // Version check
  if (!('version' in pkg)) {
    checks.push({ type: 'FAIL', message: 'package.json "version" field is missing' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.ERROR,
      code: 'PKG_VERSION_MISSING',
      message: 'package.json "version" field is missing',
      suggestion: 'Add a "version" field to package.json (e.g., "1.0.0").',
      scanner: 'package'
    }));
  } else {
    const versionResult = validateVersion(pkg.version);
    const loc = findKeyLocationInJson(rawContent, 'version');
    if (!versionResult.valid) {
      checks.push({ type: 'FAIL', message: `package.json "version": ${versionResult.reason}` });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.ERROR,
        code: 'PKG_VERSION_INVALID',
        message: `package.json "version": ${versionResult.reason}`,
        suggestion: 'Use strict semantic versioning format MAJOR.MINOR.PATCH (e.g. "1.0.0").',
        scanner: 'package'
      }));
    } else {
      checks.push({ type: 'PASS', message: `Valid semver version: "${pkg.version}"` });
    }
  }

  // Description
  if (typeof pkg.description === 'string' && pkg.description.trim().length > 0) {
    checks.push({ type: 'PASS', message: 'package.json "description" provided' });
  } else {
    const loc = findKeyLocationInJson(rawContent, 'description');
    checks.push({ type: 'WARN', message: 'package.json "description" is missing or empty' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: loc.line,
      column: loc.column,
      severity: SEVERITY.WARNING,
      code: 'PKG_MISSING_DESCRIPTION',
      message: 'package.json "description" is missing or empty',
      suggestion: 'Add a descriptive "description" field to package.json.',
      scanner: 'package'
    }));
  }

  // License
  if (typeof pkg.license === 'string' && pkg.license.trim().length > 0) {
    checks.push({ type: 'PASS', message: `package.json "license": "${pkg.license}"` });
  } else {
    const loc = findKeyLocationInJson(rawContent, 'license');
    checks.push({ type: 'WARN', message: 'package.json "license" is missing or empty' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: loc.line,
      column: loc.column,
      severity: SEVERITY.WARNING,
      code: 'PKG_MISSING_LICENSE',
      message: 'package.json "license" is missing or empty',
      suggestion: 'Add a valid SPDX license identifier (e.g., "MIT", "Apache-2.0") to package.json.',
      scanner: 'package'
    }));
  }

  // Main
  if (pkg.main !== undefined) {
    const loc = findKeyLocationInJson(rawContent, 'main');
    if (typeof pkg.main !== 'string' || pkg.main.trim().length === 0) {
      checks.push({ type: 'WARN', message: 'package.json "main" is not a valid string' });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.WARNING,
        code: 'PKG_MAIN_INVALID',
        message: 'package.json "main" is not a valid string',
        suggestion: 'Specify a valid string path for the entry point in package.json.',
        scanner: 'package'
      }));
    } else {
      const resolvedMain = path.resolve(targetDir, pkg.main);
      try {
        const mainStat = fs.statSync(resolvedMain);
        if (mainStat.isDirectory()) {
          checks.push({ type: 'WARN', message: `package.json "main" points to a directory: "${pkg.main}"` });
          diagnostics.push(createDiagnostic({
            file: 'package.json',
            line: loc.line,
            column: loc.column,
            severity: SEVERITY.WARNING,
            code: 'PKG_MAIN_IS_DIR',
            message: `package.json "main" points to a directory: "${pkg.main}"`,
            suggestion: 'Point "main" to a specific entry file, e.g., "index.js".',
            scanner: 'package'
          }));
        } else {
          checks.push({ type: 'PASS', message: `package.json "main" entry file exists: "${pkg.main}"` });
        }
      } catch (err) {
        checks.push({ type: 'WARN', message: `package.json "main" points to a non-existent file: "${pkg.main}"` });
        diagnostics.push(createDiagnostic({
          file: 'package.json',
          line: loc.line,
          column: loc.column,
          severity: SEVERITY.WARNING,
          code: 'PKG_MAIN_NOT_FOUND',
          message: `package.json "main" points to a non-existent file: "${pkg.main}"`,
          suggestion: `Create the missing entry file "${pkg.main}" or update "main" in package.json.`,
          scanner: 'package'
        }));
      }
    }
  } else {
    checks.push({ type: 'WARN', message: 'package.json "main" is not specified' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'PKG_MISSING_MAIN',
      message: 'package.json "main" is not specified',
      suggestion: 'Define a "main" entry point file in package.json (e.g. "index.js").',
      scanner: 'package'
    }));
  }

  // Scripts
  if (pkg.scripts === undefined) {
    checks.push({ type: 'WARN', message: 'package.json "scripts" is missing' });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'PKG_MISSING_SCRIPTS',
      message: 'package.json "scripts" is missing',
      suggestion: 'Add a "scripts" object to package.json containing at least a "test" script.',
      scanner: 'package'
    }));
  } else if (typeof pkg.scripts !== 'object' || pkg.scripts === null || Array.isArray(pkg.scripts)) {
    const scriptsType = pkg.scripts === null ? 'null' : Array.isArray(pkg.scripts) ? 'array' : typeof pkg.scripts;
    checks.push({ type: 'WARN', message: `package.json "scripts" must be an object (found ${scriptsType})` });
    diagnostics.push(createDiagnostic({
      file: 'package.json',
      line: null,
      column: null,
      severity: SEVERITY.WARNING,
      code: 'PKG_SCRIPTS_INVALID',
      message: `package.json "scripts" must be an object (found ${scriptsType})`,
      suggestion: 'Define "scripts" as a key-value object in package.json.',
      scanner: 'package'
    }));
  } else {
    const loc = findKeyLocationInJson(rawContent, 'test');
    if (!('test' in pkg.scripts)) {
      checks.push({ type: 'WARN', message: 'No "test" script defined in package.json' });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.WARNING,
        code: 'PKG_MISSING_TEST_SCRIPT',
        message: 'No "test" script defined in package.json',
        suggestion: 'Define a "test" command in package.json scripts (e.g., "node --test").',
        scanner: 'package'
      }));
    } else if (typeof pkg.scripts.test !== 'string' || pkg.scripts.test.trim().length === 0) {
      checks.push({ type: 'WARN', message: 'package.json "test" script is empty or not a string' });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.WARNING,
        code: 'PKG_EMPTY_TEST_SCRIPT',
        message: 'package.json "test" script is empty or not a string',
        suggestion: 'Set a non-empty test command for the "test" script in package.json.',
        scanner: 'package'
      }));
    } else if (pkg.scripts.test.includes('no test specified')) {
      checks.push({ type: 'WARN', message: 'package.json "test" script contains default npm placeholder ("no test specified")' });
      diagnostics.push(createDiagnostic({
        file: 'package.json',
        line: loc.line,
        column: loc.column,
        severity: SEVERITY.WARNING,
        code: 'PKG_PLACEHOLDER_TEST_SCRIPT',
        message: 'package.json "test" script contains default npm placeholder ("no test specified")',
        suggestion: 'Replace default npm test placeholder with an active test command (e.g., "node --test").',
        scanner: 'package'
      }));
    } else {
      checks.push({ type: 'PASS', message: `"test" script configured: "${pkg.scripts.test}"` });
    }
  }

  const safeScripts = {};
  if (pkg.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)) {
    for (const [k, v] of Object.entries(pkg.scripts)) {
      safeScripts[k] = typeof v === 'string' ? v : String(v);
    }
  }

  const projectInfo = {
    name: typeof pkg.name === 'string' ? pkg.name : null,
    version: typeof pkg.version === 'string' ? pkg.version : null,
    scripts: safeScripts
  };

  return {
    diagnostics,
    checks,
    projectInfo,
    hasPackageJson: true,
    pkg
  };
}

module.exports = {
  checkPackage,
  validatePackageName,
  validateVersion,
  extractJsonErrorLocation,
  findKeyLocationInJson
};
