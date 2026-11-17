# devcheck-dj (DevCheck CLI)

> Fast, zero-dependency project health, structure, and file-level diagnostic engine for Node.js projects.

DevCheck CLI is a lightweight, read-only diagnostic tool that audits any Node.js project directory and produces instant **file-level diagnostics** with exact file paths, line numbers, column numbers, severity levels, unique diagnostic codes, and actionable fix suggestions.

Built strictly with Node.js built-in modules only, DevCheck requires **zero external dependencies** and makes **no network calls**.

---

## Quick Start

Run instantly without installing anything:

```bash
# 1. MAIN: Scan the current directory
npx --yes devcheck-dj .

# 2. FILE-LEVEL DIAGNOSTICS: Run with verbose info diagnostics
npx --yes devcheck-dj . --verbose

# 3. SUMMARY: Condensed health status report
npx --yes devcheck-dj . --summary

# 4. STRICT: Treat warnings as build failures (CI/CD)
npx --yes devcheck-dj . --strict

# 5. TESTER: Run the built-in 28-check self-test suite
npx --yes devcheck-dj --self-test

# 6. SPECIFIC PATH: Scan a specific folder
npx --yes devcheck-dj --path ./my-project

# 7. JSON: Machine-readable output for pipelines
npx --yes devcheck-dj . --json
```

---

## Installation (Optional)

If you prefer to install DevCheck rather than using `npx`:

### Global Installation
```bash
npm install -g devcheck-dj
devcheck .
```

### Local Dev Dependency
```bash
npm install --save-dev devcheck-dj
npx devcheck .
```

---

## CLI Command Reference

```bash
devcheck [target-directory] [options]
```

| Option | Shorthand | Description |
|---|---|---|
| `[target-directory]` | (positional) | Path to directory to scan (defaults to `.`) |
| `--path <path>` | | Explicit path to directory to scan |
| `--format <json\|text>` | | Select output format (`json` or `text`) |
| `--json` | | Output report as structured JSON (machine-readable) |
| `--summary` | | Display concise health summary block without verbose lists |
| `--strict` | | Treat warnings as failures (exits with code `1` on warnings) |
| `--verbose` | | Display informational diagnostics, scripts, and details |
| `--self-test` | | Run the internal 28-check self-test suite in a temporary sandbox |
| `--no-color` | | Disable ANSI terminal colors |
| `--version` | `-v` | Display package version number |
| `--help` | `-h` | Display help and usage information |
| `--` | | Delimiter signaling the end of options (supports paths starting with `-`) |

---

## File-Level Diagnostic Engine

DevCheck inspects every supported project file and emits structured diagnostics whenever issues are detected:

```json
{
  "file": "src/config.js",
  "line": 12,
  "column": 5,
  "severity": "ERROR",
  "code": "SECRET_EXPOSURE",
  "message": "Potential hardcoded API key detected",
  "suggestion": "Move the secret into an environment variable.",
  "scanner": "security"
}
```

- **File Path**: Exact path relative to the scanned project root.
- **Line & Column**: 1-based coordinates pointing to the exact location of the issue. When line or column is not applicable, `null` is returned.
- **Severity Levels**:
  - `ERROR`: Critical issues that cause the project to fail audit (`UNHEALTHY`).
  - `WARNING`: Recommended best practices that are missing or suboptimal (`HEALTHY WITH WARNINGS`).
  - `INFO`: Informational messages (e.g. empty directories, unsupported JSX notice, UTF-8 BOM).
- **Scanner**: The engine scanner responsible for the diagnostic (`package`, `security`, `syntax`, `structure`, `file`).

---

## Diagnostic Scanners

### 1. Package Configuration Scanner (`package`)
Audits `package.json` for structural validity and npm registry compliance:
- **Missing or unreadable `package.json`** (`PKG_MISSING`, `PKG_READ_ERROR`)
- **JSON syntax errors with line and column reporting** (`PKG_MALFORMED_JSON`)
- **UTF-8 Byte Order Mark (BOM) detection** (`PKG_UTF8_BOM`)
- **Invalid npm package name validation** (`PKG_NAME_INVALID`, `PKG_NAME_MISSING`)
- **Strict SemVer version compliance** (`PKG_VERSION_INVALID`, `PKG_VERSION_MISSING`)
- **Missing description and license** (`PKG_MISSING_DESCRIPTION`, `PKG_MISSING_LICENSE`)
- **Main entry point resolution and file existence** (`PKG_MISSING_MAIN`, `PKG_MAIN_NOT_FOUND`, `PKG_MAIN_IS_DIR`)
- **Scripts and test runner configuration** (`PKG_MISSING_SCRIPTS`, `PKG_MISSING_TEST_SCRIPT`, `PKG_PLACEHOLDER_TEST_SCRIPT`)

### 2. Security Scanner (`security`)
Scans source files using safe heuristics to detect exposed credentials:
- **Exposed environment files** (`.env`, `.env.local`, `.env.production`, etc.) (`ENV_FILE_EXPOSURE`)
- **AWS Access Key IDs** (`AKIA...`) (`SECRET_EXPOSURE`)
- **Slack, GitHub, Stripe, and Google API keys and tokens** (`SECRET_EXPOSURE`)
- **Hardcoded password assignments** (`PASSWORD_EXPOSURE`)
- **Unencrypted private key material** (`PRIVATE_KEY_EXPOSURE`)
- **Safe credential masking**: Never logs, prints, or outputs actual secret values.
- **Binary and size safety**: Automatically skips binary files and files larger than 1MB.

### 3. JavaScript Syntax Scanner (`syntax`)
Validates JavaScript source code using Node.js built-in `node:vm` compiler:
- Safely parses `.js`, `.cjs`, and `.mjs` source files without executing them.
- Pinpoints syntax errors with exact line and column locations (`JS_SYNTAX_ERROR`).
- **ES Module Support**: Gracefully handles static `import` and `export` statements.
- **Read-Only / No Execution**: Code is compiled for syntax verification only; code is never run, required, or imported.

### 4. Project Structure Scanner (`structure`)
Validates standard repository infrastructure:
- `README.md` presence (`MISSING_README`, `README_NAMING`)
- `.gitignore` presence (`MISSING_GITIGNORE`)
- `LICENSE` file presence (`MISSING_LICENSE`)
- Package lockfile presence (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`) (`MISSING_LOCKFILE`)
- Automated test directory presence (`test`, `tests`, `__tests__`, `spec`) (`MISSING_TEST_DIR`)
- Unexpected empty source folders (`src/`, `lib/`) (`EMPTY_SOURCE_DIR`)

### 5. File and Directory Scanner (`file`)
- **Iterative Traversal**: Uses an explicit stack to prevent recursion stack overflow on 200+ directory depths.
- **Loop-Safe Symlink Handling**: Never traverses into internal symlinks to prevent infinite cycles.
- **Permission Safe**: Gracefully skips unreadable directories and reports actionable warnings.
- **File Metrics**: Accurately counts and categorizes `.js`, `.cjs`, `.mjs`, and `.jsx` files.

---

## Ignore Configuration (`.devcheckignore`)

You can exclude files and directories from diagnostics by creating a `.devcheckignore` file in your project root:

```gitignore
# Exclude build artifacts
dist/
build/
coverage/

# Exclude log files
*.log

# Exclude sample environments
.env.example

# Exclude fixtures
test/fixtures/
```

### Supported Pattern Rules:
- `#` begins a comment line.
- Trailing `/` restricts matching to directories only.
- Leading `/` anchors matching to the project root.
- `*` matches characters within a directory level; `**` matches across directories.
- Default ignored directories (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`) are always ignored.

---

## Health Statuses & Exit Codes

### Overall Health Statuses
- **`HEALTHY`**: 0 errors and 0 warnings.
- **`HEALTHY WITH WARNINGS`**: 0 errors and at least 1 warning.
- **`UNHEALTHY`**: At least 1 error.

### Exit Codes
| Exit Code | Meaning |
|---|---|
| `0` | Project is `HEALTHY` or `HEALTHY WITH WARNINGS` (normal mode). |
| `1` | Project is `UNHEALTHY` (diagnostic errors found), or `--strict` mode was specified with warnings. |
| `2` | Fatal error, invalid command options, or non-existent target path. |

---

## Terminal Output Example

```
============================================================
DEV CHECK
Node.js Project Diagnostic Engine

Scanning: /my-project
============================================================

Project: my-app v1.0.0

[PASS] Target directory exists and is readable
[PASS] package.json is valid JSON
[PASS] Valid package name: "my-app"
[PASS] Valid semver version: "1.0.0"
[PASS] package.json "description" provided
[PASS] package.json "license": "MIT"
[PASS] package.json "main" entry file exists: "index.js"
[PASS] "test" script configured: "node --test"
[PASS] README.md found
[PASS] .gitignore found
[PASS] LICENSE file found (LICENSE)
[PASS] Test directory found (test)

[ERROR] src/config.js:12:5
        Potential hardcoded API key or secret detected (heuristic)
        Code: SECRET_EXPOSURE
        Fix: Move the secret into an environment variable.

[ERROR] src/app.js:28:1
        JavaScript syntax error: Unexpected token ')'
        Code: JS_SYNTAX_ERROR
        Fix: Check the syntax near line 28.

[WARNING] package-lock.json
        No package lock file found (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock)
        Code: MISSING_LOCKFILE
        Fix: Commit a lockfile to ensure reproducible dependency installs.

JavaScript Files:
  .js:    12
  .cjs:   0
  .mjs:   2
  .jsx:   0
  Total:  14

------------------------------------------------------------
PROJECT HEALTH: UNHEALTHY

Files scanned: 18
Files with issues: 3
Errors: 2
Warnings: 1
Info: 0
------------------------------------------------------------
```

---

## JSON Output Format

When running with `--json` or `--format json`, DevCheck outputs pure JSON:

```json
{
  "tool": "DevCheck",
  "version": "1.1.0",
  "target": "/Users/user/my-project",
  "project": {
    "name": "my-app",
    "version": "1.0.0",
    "scripts": {
      "test": "node --test"
    }
  },
  "status": "UNHEALTHY",
  "summary": {
    "filesScanned": 18,
    "filesWithIssues": 3,
    "errors": 2,
    "warnings": 1,
    "info": 0,
    "passed": 12,
    "failed": 2
  },
  "diagnostics": [
    {
      "file": "src/config.js",
      "line": 12,
      "column": 5,
      "severity": "ERROR",
      "code": "SECRET_EXPOSURE",
      "message": "Potential hardcoded API key or secret detected (heuristic)",
      "suggestion": "Move the secret into an environment variable.",
      "scanner": "security"
    },
    {
      "file": "src/app.js",
      "line": 28,
      "column": 1,
      "severity": "ERROR",
      "code": "JS_SYNTAX_ERROR",
      "message": "JavaScript syntax error: Unexpected token ')'",
      "suggestion": "Check the syntax near line 28.",
      "scanner": "syntax"
    }
  ]
}
```

---

## Built-In Self-Test Suite

DevCheck includes an automated 28-check self-test suite verifying the diagnostic engine in an isolated sandbox:

```bash
devcheck --self-test
```

### 28 Automated Self-Test Scenarios:
1. Valid Node.js project.
2. Missing `package.json`.
3. Malformed JSON parsing with line and column reporting.
4. UTF-8 Byte Order Mark (BOM) handling.
5. Invalid package name rules.
6. Invalid strict SemVer versions.
7. Missing `README.md`.
8. Missing `.gitignore`.
9. Missing `LICENSE`.
10. Missing `main` entry file.
11. Missing `test` script.
12. Default placeholder `test` script.
13. Hardcoded API key detection with line and column reporting.
14. Hardcoded password detection.
15. Exposed `.env` file detection.
16. Clean security baseline with environment variables.
17. JavaScript syntax error detection with line and column.
18. Valid JavaScript syntax baseline.
19. Nested directory traversal.
20. Deep directory traversal (30+ levels) without stack overflow.
21. Empty project handling.
22. Non-existent target path with exit code 2.
23. Configured directory exclusion (`node_modules`, `dist`, `.git`).
24. Symlink loop safety.
25. Structured JSON report generation.
26. Strict mode exit code behavior.
27. Multi-diagnostic aggregation.
28. Accurate 1-based line and column coordinates.

---

## Limitations & False-Positive Disclaimers

- **Heuristic Secret Detection**: The security scanner utilizes regular expression patterns and heuristics. It is designed to assist developers and catch accidental commitments, but it does **not** guarantee 100% secret detection or replacement for dedicated secret vaults.
- **JSX / TypeScript Syntax**: Native Node.js `node:vm` supports ECMAScript and CommonJS syntax. JSX and TypeScript files require transpilation (Babel/tsc) and are flagged as unsupported rather than failing builds.

---

## System Requirements

- **Node.js**: `>=18.0.0`
- **Dependencies**: 0 external runtime dependencies, 0 devDependencies.
- **Platforms**: macOS, Linux, Windows (PowerShell / Command Prompt).

---

## License

MIT License &copy; 2026 Dheeraj Jadhav
