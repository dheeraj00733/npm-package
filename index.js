#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { VERSION, JS_EXTENSIONS, DEFAULT_IGNORED_DIRS } = require('./lib/config');
const { scan } = require('./lib/scanner');
const { formatTerminalReport } = require('./lib/formatter');
const { validatePackageName, validateVersion } = require('./lib/package-checker');
const { runSelfTest } = require('./lib/selftest-runner');

function countJavaScriptFiles(rootDir) {
  const counts = { js: 0, cjs: 0, mjs: 0, jsx: 0, total: 0 };
  const warnings = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        const rel = path.relative(rootDir, currentDir) || '.';
        warnings.push(`Unreadable directory skipped: "${rel}" (permission denied)`);
        continue;
      }
      warnings.push(`Directory skipped: "${currentDir}" (${err.message})`);
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        stack.push(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
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

  return { counts, warnings };
}

function parseArgs(args) {
  let json = false;
  let noColor = false;
  let selfTest = false;
  let showVersion = false;
  let showHelp = false;
  let summary = false;
  let strict = false;
  let verbose = false;
  let targetDir = null;
  let endOfOptions = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!endOfOptions && arg === '--') {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && arg.startsWith('-')) {
      if (arg === '--json') {
        json = true;
      } else if (arg === '--format') {
        i++;
        if (i >= args.length) {
          return {
            error: 'Option --format requires an argument (json or text)\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.',
            exitCode: 2
          };
        }
        const fmt = args[i].toLowerCase();
        if (fmt === 'json') {
          json = true;
        } else if (fmt === 'text') {
          json = false;
        } else {
          return {
            error: `Invalid format: "${args[i]}". Expected json or text.\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.`,
            exitCode: 2
          };
        }
      } else if (arg.startsWith('--format=')) {
        const fmt = arg.slice('--format='.length).toLowerCase();
        if (fmt === 'json') {
          json = true;
        } else if (fmt === 'text') {
          json = false;
        } else {
          return {
            error: `Invalid format: "${fmt}". Expected json or text.\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.`,
            exitCode: 2
          };
        }
      } else if (arg === '--path') {
        i++;
        if (i >= args.length) {
          return {
            error: 'Option --path requires an argument\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.',
            exitCode: 2
          };
        }
        if (targetDir !== null && targetDir !== args[i]) {
          return {
            error: 'Target directory specified multiple times.\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.',
            exitCode: 2
          };
        }
        targetDir = args[i];
      } else if (arg.startsWith('--path=')) {
        const p = arg.slice('--path='.length);
        if (!p) {
          return {
            error: 'Option --path requires an argument\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.',
            exitCode: 2
          };
        }
        if (targetDir !== null && targetDir !== p) {
          return {
            error: 'Target directory specified multiple times.\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.',
            exitCode: 2
          };
        }
        targetDir = p;
      } else if (arg === '--summary') {
        summary = true;
      } else if (arg === '--strict') {
        strict = true;
      } else if (arg === '--verbose') {
        verbose = true;
      } else if (arg === '--no-color') {
        noColor = true;
      } else if (arg === '--self-test') {
        selfTest = true;
      } else if (arg === '-v' || arg === '--version') {
        showVersion = true;
      } else if (arg === '-h' || arg === '--help') {
        showHelp = true;
      } else {
        return {
          error: `Unknown option: ${arg}\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.`,
          exitCode: 2
        };
      }
    } else {
      if (targetDir !== null) {
        return {
          error: `Unexpected argument: "${arg}". Only one target directory is accepted.\nUsage: devcheck [target-directory] [options]\nTry "devcheck --help" for more information.`,
          exitCode: 2
        };
      }
      targetDir = arg;
    }
  }

  return {
    json,
    noColor,
    selfTest,
    showVersion,
    showHelp,
    summary,
    strict,
    verbose,
    targetDir: targetDir !== null ? targetDir : '.'
  };
}

function getHelpText() {
  return [
    'DevCheck CLI - Project Health Scanner',
    '',
    'Usage:',
    '  devcheck [target-directory] [options]',
    '',
    'Arguments:',
    '  target-directory        Directory to scan (default: current directory)',
    '',
    'Options:',
    '  --path <path>           Explicit target directory path to scan',
    '  --format <json|text>    Output format (json or text)',
    '  --json                  Output report in structured JSON format',
    '  --summary               Output condensed project health summary',
    '  --strict                Treat warnings as errors (exit code 1 on warnings)',
    '  --verbose               Show informational messages and detailed scripts',
    '  --self-test             Run internal verification suite',
    '  --no-color              Disable ANSI color output',
    '  -v, --version           Show version number',
    '  -h, --help              Show this help message',
    '  --                      End of options delimiter',
    '',
    'Exit codes:',
    '  0                       All required checks passed (warnings allowed)',
    '  1                       Project has diagnostic errors (or warnings in strict mode)',
    '  2                       Invalid target directory or command usage error'
  ].join('\n');
}

function formatReport(result, options = {}) {
  return formatTerminalReport(result, options);
}

function main(args) {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err.code === 'EPIPE') process.exit(0);
    });
  }
  if (process.stderr && typeof process.stderr.on === 'function') {
    process.stderr.on('error', (err) => {
      if (err.code === 'EPIPE') process.exit(0);
    });
  }

  try {
    const parsed = parseArgs(args);
    if (parsed.error) {
      process.stderr.write(parsed.error + '\n');
      process.exitCode = parsed.exitCode || 2;
      return parsed.exitCode || 2;
    }

    if (parsed.showHelp) {
      process.stdout.write(getHelpText() + '\n');
      process.exitCode = 0;
      return 0;
    }

    if (parsed.showVersion) {
      process.stdout.write(VERSION + '\n');
      process.exitCode = 0;
      return 0;
    }

    const colorEnabled =
      !parsed.noColor &&
      Boolean(process.stdout.isTTY) &&
      !process.env.NO_COLOR &&
      process.env.TERM !== 'dumb';

    if (parsed.selfTest) {
      const code = runSelfTest({ color: colorEnabled, cliPath: __filename });
      process.exitCode = code;
      return code;
    }

    const result = scan(parsed.targetDir, {
      strict: parsed.strict,
      verbose: parsed.verbose
    });

    if (parsed.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(
        formatTerminalReport(result, {
          color: colorEnabled,
          summary: parsed.summary,
          verbose: parsed.verbose
        }) + '\n'
      );
    }

    process.exitCode = result.exitCode;
    return result.exitCode;
  } catch (err) {
    process.stderr.write(`[FAIL] Unexpected error: ${err.message}\n`);
    process.exitCode = 1;
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  scan,
  main,
  parseArgs,
  formatReport,
  formatTerminalReport,
  countJavaScriptFiles,
  validatePackageName,
  validateVersion,
  runSelfTest,
  VERSION
};
