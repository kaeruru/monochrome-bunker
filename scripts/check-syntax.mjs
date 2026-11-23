import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const targets = [
  path.join(rootDir, 'server.js'),
  path.join(rootDir, 'vite.config.js')
];

for (const dir of ['src', 'tests', 'scripts']) {
  const fullDir = path.join(rootDir, dir);
  if (!fs.existsSync(fullDir)) continue;
  for (const entry of fs.readdirSync(fullDir)) {
    if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      targets.push(path.join(fullDir, entry));
    }
  }
}

for (const file of targets) {
  const res = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

console.log(`SYNTAX_OK (${targets.length} files checked)`);
