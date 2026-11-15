// Copies app/ to dist/ and stamps the git sha into it (R6). Refuses a dirty tree, so the sha names exactly what ships.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const dirty = execSync('git status --porcelain -- app').toString().trim();
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error('app/ has uncommitted changes; commit first so the build sha is honest:\n' + dirty);
  process.exit(1);
}
const sha = execSync('git rev-parse HEAD').toString().trim();
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const html = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', html);
console.log(`dist/ built at ${sha}${dirty ? ' (DIRTY)' : ''}`);
