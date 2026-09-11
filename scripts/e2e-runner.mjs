#!/usr/bin/env node
// Orchestrates the Playwright e2e suite: boots a disposable SQLite database,
// starts the API server (port 4000) and the Vite client dev server
// (port 5173), waits for both to be ready, runs `playwright test`, and then
// always tears everything down (including the temporary database) so the
// repository is left clean regardless of whether the tests passed.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER_PORT = 4000;
const CLIENT_PORT = 5173;
const READY_TIMEOUT_MS = 30_000;

function bin(name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(ROOT, 'node_modules', '.bin', `${name}${suffix}`);
}

/** Polls `url` until it responds successfully or `timeoutMs` elapses. */
async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet; keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url} to become ready.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Spawns a background process, streaming its output to this process. */
function spawnProcess(command, args, options) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    ...options,
  });
  return child;
}

/** Sends SIGTERM (then SIGKILL if needed) to `child` and waits for exit. */
async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already exited.
      }
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-e2e-'));
  const dbPath = path.join(tmpDir, 'ledger.db');

  let serverProcess;
  let clientProcess;
  let exitCode = 1;

  try {
    serverProcess = spawnProcess(bin('tsx'), ['src/index.ts'], {
      cwd: path.join(ROOT, 'server'),
      env: { ...process.env, PORT: String(SERVER_PORT), LEDGER_DB_PATH: dbPath },
    });

    clientProcess = spawnProcess(
      bin('vite'),
      ['--port', String(CLIENT_PORT), '--strictPort'],
      { cwd: path.join(ROOT, 'client'), env: { ...process.env } },
    );

    await Promise.all([
      waitForUrl(`http://localhost:${SERVER_PORT}/api/health`, READY_TIMEOUT_MS),
      waitForUrl(`http://localhost:${CLIENT_PORT}/`, READY_TIMEOUT_MS),
    ]);

    exitCode = await new Promise((resolve) => {
      const playwright = spawnProcess(bin('playwright'), ['test', '--project=chromium'], {
        cwd: ROOT,
      });
      playwright.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    await Promise.all([stopProcess(serverProcess), stopProcess(clientProcess)]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
