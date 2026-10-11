/**
 * npm run worker:supervised -w backend
 *
 * Runs the worker and restarts it (as a new process with a new worker id) whenever
 * it exits with a non-zero code, like systemd/Kubernetes would. Used for the crash
 * demo: the crashed worker's lease must expire before the new one can claim the task.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let stopping = false;
let restarts = 0;

function start() {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], { cwd: backendDir, stdio: 'inherit', env: process.env });
  const forward = (sig: NodeJS.Signals) => () => {
    stopping = true;
    child.kill(sig);
  };
  process.once('SIGINT', forward('SIGINT'));
  process.once('SIGTERM', forward('SIGTERM'));
  child.on('exit', (code, signal) => {
    if (stopping || code === 0) process.exit(code ?? 0);
    restarts += 1;
    console.log(`[supervisor] worker exited (${signal ?? `code ${code}`}); starting a new worker process (restart #${restarts})`);
    setTimeout(start, 1000);
  });
}

start();
