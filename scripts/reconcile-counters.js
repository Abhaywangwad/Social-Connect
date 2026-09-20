#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetScript = path.resolve(__dirname, '../server/scripts/reconcile-counters.js');
const serverDir = path.resolve(__dirname, '../server');

const child = spawn(process.execPath, [targetScript, ...process.argv.slice(2)], {
  cwd: serverDir,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
