'use strict';

const fs = require('fs');
const path = require('path');
const { createDiagnostic, SEVERITY } = require('./diagnostics');
const { MAX_FILE_SIZE_BYTES, BINARY_EXTENSIONS, isBinaryBuffer } = require('./config');

const PLACEHOLDER_STRINGS = new Set([
  'your_api_key', 'your_key', 'your_secret', 'your_password', 'your-api-key',
  'api_key', 'apikey', 'secret', 'password', 'passwd', 'token', 'access_token',
  'dummy', 'example', 'placeholder', 'changeme', 'test', 'fake', 'admin', 'root',
  'true', 'false', 'null', 'undefined', 'process.env', 'sample', 'demo'
]);

function isPlaceholder(value) {
  if (!value || typeof value !== 'string') return true;
  const clean = value.trim().toLowerCase().replace(/[<>{}[\]"']/g, '');
  if (clean.length < 4) return true;
  if (PLACEHOLDER_STRINGS.has(clean)) return true;
  if (clean.startsWith('your_') || clean.startsWith('your-') || clean.startsWith('my_')) return true;
  if (clean.includes('example') || clean.includes('placeholder') || clean.includes('changeme')) return true;
  return false;
}

const ENV_EXPOSED_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.staging',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.secret'
]);

function isExposedEnvFile(fileName) {
  const base = path.basename(fileName).toLowerCase();
  if (base.endsWith('.example') || base.endsWith('.template') || base.endsWith('.sample') || base.endsWith('.defaults')) {
    return false;
  }
  return ENV_EXPOSED_BASENAMES.has(base);
}

function checkSecurityInFile(targetDir, relPath) {
  const diagnostics = [];
  const fullPath = path.resolve(targetDir, relPath);

  // Check 1: Exposed .env file
  if (isExposedEnvFile(relPath)) {
    diagnostics.push(createDiagnostic({
      file: relPath,
      line: 1,
      column: 1,
      severity: SEVERITY.ERROR,
      code: 'ENV_FILE_EXPOSURE',
      message: 'Exposed environment file detected in project directory',
      suggestion: 'Add .env files to .gitignore to avoid committing sensitive environment variables.',
      scanner: 'security'
    }));
  }

  // Skip binary file extensions
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return diagnostics;
  }

  // Check file stat
  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return diagnostics;
  }

  if (!stat.isFile()) {
    return diagnostics;
  }

  // File size limit
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    diagnostics.push(createDiagnostic({
      file: relPath,
      line: null,
      column: null,
      severity: SEVERITY.INFO,
      code: 'FILE_SIZE_LIMIT_EXCEEDED',
      message: `File size (${stat.size} bytes) exceeds limit (1MB); skipped security content scan`,
      suggestion: 'Inspect large files manually for sensitive credentials.',
      scanner: 'security'
    }));
    return diagnostics;
  }

  // Read content
  let buffer;
  try {
    buffer = fs.readFileSync(fullPath);
  } catch {
    return diagnostics;
  }

  // Check for binary null bytes
  if (isBinaryBuffer(buffer)) {
    return diagnostics;
  }

  const content = buffer.toString('utf8');
  const lines = content.split(/\r?\n/);
  const reportedKeys = new Set();

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const lineNum = i + 1;
    let matchedSpecificToken = null;

    // Check Private Keys
    const privateKeyMatch = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/.exec(lineText);
    if (privateKeyMatch) {
      const key = `${lineNum}:PRIVATE_KEY`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = privateKeyMatch[0];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: privateKeyMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'PRIVATE_KEY_EXPOSURE',
          message: 'Unencrypted private key material detected (heuristic)',
          suggestion: 'Move private keys out of source code into a secure secret manager or environment variable.',
          scanner: 'security'
        }));
      }
    }

    // Check AWS Access Key
    const awsMatch = /\b(AKIA[0-9A-Z]{16})\b/.exec(lineText);
    if (awsMatch && !isPlaceholder(awsMatch[1])) {
      const key = `${lineNum}:AWS_KEY`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = awsMatch[1];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: awsMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential AWS Access Key ID detected (heuristic)',
          suggestion: 'Revoke this key and load credentials from environment variables or AWS IAM roles.',
          scanner: 'security'
        }));
      }
    }

    // Check Slack Token
    const slackMatch = /\b(xox[p|b|o|a]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*)\b/.exec(lineText);
    if (slackMatch && !isPlaceholder(slackMatch[1])) {
      const key = `${lineNum}:SLACK_TOKEN`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = slackMatch[1];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: slackMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential Slack token detected (heuristic)',
          suggestion: 'Revoke this token and store it in an environment variable.',
          scanner: 'security'
        }));
      }
    }

    // Check GitHub Token
    const ghMatch = /\b(gh[pousr]_[A-Za-z0-9_]{36,})\b/.exec(lineText);
    if (ghMatch && !isPlaceholder(ghMatch[1])) {
      const key = `${lineNum}:GITHUB_TOKEN`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = ghMatch[1];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: ghMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential GitHub token detected (heuristic)',
          suggestion: 'Revoke this token and use environment variables or GitHub Secrets.',
          scanner: 'security'
        }));
      }
    }

    // Check Google API Key
    const googleMatch = /\b(AIza[0-9A-Za-z\\-_]{35})\b/.exec(lineText);
    if (googleMatch && !isPlaceholder(googleMatch[1])) {
      const key = `${lineNum}:GOOGLE_KEY`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = googleMatch[1];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: googleMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential Google API key detected (heuristic)',
          suggestion: 'Restrict this key in the Google Cloud Console and load it via an environment variable.',
          scanner: 'security'
        }));
      }
    }

    // Check Stripe live secret key
    const stripeMatch = /\b(sk_live_[0-9a-zA-Z]{24,})\b/.exec(lineText);
    if (stripeMatch && !isPlaceholder(stripeMatch[1])) {
      const key = `${lineNum}:STRIPE_KEY`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        matchedSpecificToken = stripeMatch[1];
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: stripeMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential Stripe live secret key detected (heuristic)',
          suggestion: 'Rotate this secret key immediately and store it in an environment variable.',
          scanner: 'security'
        }));
      }
    }

    // Check Password assignments
    const passwordMatch = /(?:password|passwd|pwd|db_pass|db_password)\s*[:=]\s*['"`]([^'"`\r\n]{4,})['"`]/i.exec(lineText);
    if (passwordMatch && !isPlaceholder(passwordMatch[1])) {
      const key = `${lineNum}:PASSWORD`;
      if (!reportedKeys.has(key)) {
        reportedKeys.add(key);
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: passwordMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'PASSWORD_EXPOSURE',
          message: 'Potential hardcoded password assignment detected (heuristic)',
          suggestion: 'Move password credentials into an environment variable or secrets manager.',
          scanner: 'security'
        }));
      }
    }

    // Check API Key / Secret assignments
    const secretMatch = /(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token|auth[_-]?secret)\s*[:=]\s*['"`]([A-Za-z0-9_\-.~+/=]{8,})['"`]/i.exec(lineText);
    if (secretMatch && !isPlaceholder(secretMatch[1])) {
      // Avoid duplicate diagnostic if a specific provider token was already detected for this assignment on the same line
      const matchedVal = secretMatch[1];
      const isDuplicateOfSpecific = Boolean(
        matchedSpecificToken && (matchedVal.includes(matchedSpecificToken) || matchedSpecificToken.includes(matchedVal))
      );

      const key = `${lineNum}:SECRET`;
      if (!reportedKeys.has(key) && !isDuplicateOfSpecific) {
        reportedKeys.add(key);
        diagnostics.push(createDiagnostic({
          file: relPath,
          line: lineNum,
          column: secretMatch.index + 1,
          severity: SEVERITY.ERROR,
          code: 'SECRET_EXPOSURE',
          message: 'Potential hardcoded API key or secret detected (heuristic)',
          suggestion: 'Move the secret into an environment variable.',
          scanner: 'security'
        }));
      }
    }
  }

  return diagnostics;
}

module.exports = {
  checkSecurityInFile,
  isExposedEnvFile,
  isPlaceholder
};
