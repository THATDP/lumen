'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright-core');
const chromiumPkg = require('@sparticuz/chromium');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', chunk => {
      if (chunk.toString().includes('Lumen on port')) resolve(proc);
    });
    proc.on('error', reject);
  });
}

test('Lumen 2.0 E2E: zero-signup, invite link, chat, layouts, chess', async () => {
  const port = 3456;
  const serverProc = await startServer(port);
  const executablePath = await (chromiumPkg.default || chromiumPkg).executablePath();
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  try {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await p1.goto(`http://127.0.0.1:${port}/`);
    await p1.waitForSelector('#btn-create-room');
    await p1.click('#btn-create-room');
    await p1.waitForSelector('.room-view');

    const codeText = await p1.textContent('.room-topbar .font-mono');
    const code = codeText.replace('Código:', '').trim();
    assert.ok(code.length >= 4, 'Room code generated');

    await p2.goto(`http://127.0.0.1:${port}/?room=${code}`);
    await p2.waitForSelector('.room-view');

    // Chat bidirecional
    await p1.fill('#chat-input', 'Olá do Lumen 2.0!');
    await p1.press('#chat-input', 'Enter');
    await p2.waitForFunction(() => document.body.innerText.includes('Olá do Lumen 2.0!'));

    // Troca de layout para Jogos e abertura do Xadrez
    await p1.selectOption('#layout-preset-select', 'games');
    await p1.waitForSelector('[data-launch="chess"]');
    await p1.click('[data-launch="chess"]');
    await p1.waitForSelector('#chess-board');

    await ctx1.close();
    await ctx2.close();
  } finally {
    await browser.close();
    serverProc.kill();
  }
});
