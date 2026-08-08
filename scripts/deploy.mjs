/**
 * Build for GitHub Pages and force-push dist/ to the gh-pages branch.
 * Usage: npm run deploy
 */
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';

const REPO = 'https://github.com/sambenne/guitar-trainer.git';
const BASE = '/guitar-trainer/';

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

run('npm run build', { env: { ...process.env, DEPLOY_BASE: BASE } });

// dist/ is gitignored, so give it its own throwaway repo and force-push
if (existsSync('dist/.git')) rmSync('dist/.git', { recursive: true, force: true });
run('git init -b gh-pages', { cwd: 'dist' });
run('git add -A', { cwd: 'dist' });
run('git commit -m "deploy"', { cwd: 'dist' });
run(`git push -f ${REPO} gh-pages`, { cwd: 'dist' });
rmSync('dist/.git', { recursive: true, force: true });

console.log('\nDeployed. Live at: https://sambenne.github.io/guitar-trainer/');
