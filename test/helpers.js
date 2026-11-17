'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function createTempDir(prefix = 'devcheck-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {}
}

function createTestProject(files = {}) {
  const dir = createTempDir();
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (typeof content === 'string' || Buffer.isBuffer(content)) {
      fs.writeFileSync(fullPath, content);
    } else if (content === null) {
      // Create empty folder
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
  return {
    dir,
    cleanup: () => removeDir(dir)
  };
}

function getDirectoryFingerprint(dirPath) {
  const records = [];
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        records.push({ path: path.relative(dirPath, full), type: 'symlink' });
      } else if (entry.isDirectory()) {
        records.push({ path: path.relative(dirPath, full), type: 'dir' });
        walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          const buf = fs.readFileSync(full);
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          records.push({
            path: path.relative(dirPath, full),
            type: 'file',
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            hash
          });
        } catch {
          // ignore
        }
      }
    }
  }
  walk(dirPath);
  return records;
}

module.exports = {
  createTempDir,
  removeDir,
  createTestProject,
  getDirectoryFingerprint
};
