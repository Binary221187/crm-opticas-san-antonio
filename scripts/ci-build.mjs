#!/usr/bin/env node
// Minimal build script for GitHub Actions - bypasses run-framework.mjs complexity
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('Building CRM...');
console.log('Project root:', projectRoot);

// Set environment
process.env.SITES_ENV_READY = '1';
process.env.SITES_PROJECT_ROOT = projectRoot;
process.env.HOME = path.join(projectRoot, '.sites-runtime', 'home');
process.env.XDG_CONFIG_HOME = path.join(projectRoot, '.sites-runtime', 'xdg-config');
process.env.TMPDIR = path.join(projectRoot, '.sites-runtime', 'tmp');

// Create required dirs
const fs = await import('node:fs');
const dirs = [
  '.sites-runtime/home',
  '.sites-runtime/npm-cache',
  '.sites-runtime/xdg-config',
  '.sites-runtime/tmp',
  '.sites-runtime/wrangler/logs',
];
for (const d of dirs) {
  const full = path.join(projectRoot, d);
  fs.mkdirSync(full, { recursive: true });
  console.log('Created:', d);
}

process.env.WRANGLER_WRITE_LOGS = 'false';
process.env.WRANGLER_LOG_PATH = path.join(projectRoot, '.sites-runtime', 'wrangler', 'logs');
process.env.MINIFLARE_REGISTRY_PATH = path.join(projectRoot, '.sites-runtime', 'wrangler', 'registry');
process.env.npm_config_cache = path.join(projectRoot, '.sites-runtime', 'npm-cache');
process.env.npm_config_audit = 'false';
process.env.npm_config_fund = 'false';
process.env.npm_config_update_notifier = 'false';

// Run vinext build directly
try {
  const result = execSync(
    `node node_modules/vinext/dist/cli.js build`,
    { cwd: projectRoot, stdio: 'inherit', timeout: 180000 }
  );
  console.log('Build succeeded!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
