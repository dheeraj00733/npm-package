# DevCheck CLI - Faculty Demo Script

This script provides the exact 3-step evaluation walk-through for faculty grading the **DevCheck CLI** (`devcheck-dj`) npm package.

---

## Pre-Demo Checklist

Before presenting to the faculty, ensure:
1. **Node.js Version:** Run `node --version` and confirm it is v18 or newer (e.g., v20.x, v22.x, v25.x).
2. **Internet Connection:** Ensure internet access is active for `npx` to fetch from the npm registry.
3. **Warm-Up Runs:** Run each of the three commands below once before the evaluation to warm up any local npm/npx cache.
4. **Registry Propagation:** If just published, wait approximately 1 minute for global npm CDN nodes to sync.

---

## 3-Step Demo Script

### Step 1: MAIN (Live Project Health Scan)
- **Command:**
  ```bash
  npx --yes devcheck-dj .
  ```
- **What to say:**
  > *"It scans a project and reports problems."*
- **Expected Output Summary:**
  - Displays project header (`devcheck-dj v1.0.0`).
  - Displays registered npm scripts (`test`, `selftest`, `start`, `prepublishOnly`).
  - Lists individual `[PASS]` and `[WARN]` checks.
  - Reports breakdown of JavaScript files (`.js`, `.cjs`, `.mjs`, `.jsx`).
  - Prints final summary and status `HEALTHY` or `HEALTHY WITH WARNINGS`.
- **Expected Exit Code:** `0`

---

### Step 2: TESTER (Built-In Self-Test Verification)
- **Command:**
  ```bash
  npx --yes devcheck-dj --self-test
  ```
- **What to say:**
  > *"It tests itself, so you can see it works on this computer."*
- **Expected Output Summary:**
  - Creates a temporary test sandbox in `os.tmpdir()`.
  - Runs 12 automated checks (valid project, JS counting, folder skipping, missing package.json, malformed JSON, bad path, child process spawns, JSON mode, read-only hash integrity).
  - Prints 12 `[PASS]` lines.
  - Cleans up all temporary files.
  - Prints:
    ```
    Self-test summary: 12 passed, 0 failed.
    DevCheck is working correctly on this computer.
    ```
- **Expected Exit Code:** `0`

---

### Step 3: BAD PATH (Graceful Error Handling)
- **Command:**
  ```bash
  npx --yes devcheck-dj ./no-such-folder
  ```
- **What to say:**
  > *"It shows a clear error instead of crashing."*
- **Expected Output Summary:**
  - Displays clean report with header.
  - Displays: `[FAIL] Target directory does not exist: "./no-such-folder"`.
  - Prints summary: `0 passed, 0 warnings, 1 failed` and `Result: UNHEALTHY`.
  - **Zero stack trace** shown; clean and graceful.
- **Expected Exit Code:** `2`

---

## Fallback / Alternative Commands

If `npx` has an environment issue resolving the primary binary name:

- **Explicit Package Fallback:**
  ```bash
  npx --yes --package=devcheck-dj devcheck .
  ```
- **Machine-Readable JSON Output:**
  ```bash
  npx --yes devcheck-dj . --json
  ```

---

## Registry Verification Link

- **Public Package Page:** [https://www.npmjs.com/package/devcheck-dj](https://www.npmjs.com/package/devcheck-dj)
