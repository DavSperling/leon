#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(
  process.execPath,
  [
    '--env-file-if-exists=.env.local',
    '--import',
    fileURLToPath(import.meta.resolve('tsx')),
    resolve(root, 'src/cli/leon.ts'),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
