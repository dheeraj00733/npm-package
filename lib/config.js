'use strict';

const path = require('path');

const VERSION = '1.1.0';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next'
]);

const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.jsx']);

const NODE_CORE_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'test', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

const STRICT_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svgz',
  '.pdf', '.zip', '.gz', '.tgz', '.tar', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.wasm', '.bin',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flac',
  '.lockb'
]);

function parseIgnoreFile(content) {
  if (typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/);
  const rules = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const isDirOnly = line.endsWith('/');
    if (isDirOnly) {
      line = line.slice(0, -1);
    }

    const isRootOnly = line.startsWith('/');
    if (isRootOnly) {
      line = line.slice(1);
    }

    // Convert gitignore-like glob to regex
    // Escape regex special chars except * and ?
    let regexStr = line
      .replace(/\\/g, '/')
      .replace(/[.+^${}()|[\]]/g, '\\$&')
      .replace(/\?/g, '[^/]')
      .replace(/\*\*/g, '.*')
      .replace(/(?<!\.)\*/g, '[^/]*');

    if (isRootOnly) {
      regexStr = '^' + regexStr + (isDirOnly ? '($|/)' : '($|/.*)');
    } else {
      regexStr = '(^|/)' + regexStr + (isDirOnly ? '($|/)' : '($|/.*)');
    }

    rules.push({
      raw: line,
      isDirOnly,
      isRootOnly,
      regex: new RegExp(regexStr)
    });
  }

  return rules;
}

function shouldIgnore(relPath, isDir, customRules = []) {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/').filter(Boolean);

  // Check default ignored dirs
  for (const seg of segments) {
    if (DEFAULT_IGNORED_DIRS.has(seg)) {
      return true;
    }
  }

  // Check custom ignore rules
  for (const rule of customRules) {
    if (rule.isDirOnly && !isDir) {
      continue;
    }
    if (rule.regex.test(normalized)) {
      return true;
    }
  }

  return false;
}

function isBinaryBuffer(buf) {
  if (!Buffer.isBuffer(buf)) return false;
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

module.exports = {
  VERSION,
  DEFAULT_IGNORED_DIRS,
  JS_EXTENSIONS,
  NODE_CORE_MODULES,
  STRICT_SEMVER_REGEX,
  MAX_FILE_SIZE_BYTES,
  BINARY_EXTENSIONS,
  parseIgnoreFile,
  shouldIgnore,
  isBinaryBuffer
};
