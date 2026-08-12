import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

const children = [
  start('api', ['run', 'dev']),
  start('worker', ['run', 'worker:dev']),
];

let shuttingDown = false;

function start(label, args) {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${label}] exited with ${signal || code}`);
      shutdown(code || 1);
    }
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(isWindows ? undefined : 'SIGTERM');
    }
  }

  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
