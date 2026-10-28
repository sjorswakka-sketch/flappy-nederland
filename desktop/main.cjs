const { app, BrowserWindow, Menu, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_NAME = 'Drunken Joyride';
const smokeMode = process.argv.includes('--smoke-test');
const smokeReportArgument = process.argv.find(argument => argument.startsWith('--smoke-report='));
const smokeReportPath = smokeReportArgument?.slice('--smoke-report='.length);
const smokeProfile = smokeMode ? fs.mkdtempSync(path.join(os.tmpdir(), 'drunken-joyride-smoke-')) : null;
const checks = [];
let mainWindow;
let finished = false;

app.setName(APP_NAME);
app.setAppUserModelId('nl.sjorswakka.drunkenjoyride');
if (smokeMode) app.disableHardwareAcceleration();
// Portable builds keep progress across updates; the extracted build folder can move.
app.setPath('userData', smokeProfile || path.join(app.getPath('appData'), APP_NAME));

function finishSmoke(error) {
  if (!smokeMode || finished) return;
  finished = true;
  const report = {
    ok: !error,
    app: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    checks,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };
  try {
    if (smokeReportPath) fs.writeFileSync(path.resolve(smokeReportPath), JSON.stringify(report, null, 2) + '\n');
  } catch (writeError) {
    console.error('Could not write desktop smoke report:', writeError.message);
    app.exit(1);
    return;
  }
  console.log(JSON.stringify(report));
  app.exit(error ? 1 : 0);
}

function requireCheck(condition, name) {
  if (!condition) throw new Error(`Desktop smoke check failed: ${name}`);
  checks.push(name);
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function reloadForSmoke(contents) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The bundled game did not reload.')), 8000);
    contents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    contents.reload();
  });
}

async function smokeTest(window) {
  const contents = window.webContents;
  const initial = await contents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#game');
    return {
      title: document.title,
      game: !!canvas && canvas.width > 0 && canvas.height > 0,
      start: !!document.querySelector('#start'),
      banner: !!document.querySelector('#banner'),
      wallet: document.querySelector('#wallet-balance')?.textContent.trim(),
      workshop: !!document.querySelector('#workshop'),
      upgradeButtons: document.querySelectorAll('[data-upgrade]').length,
      nodeBridge: typeof window.require !== 'undefined' || typeof window.process !== 'undefined'
    };
  })()`);
  requireCheck(initial.title.includes(APP_NAME), 'bundled page loads');
  requireCheck(initial.game && initial.start && initial.banner, 'canvas and game screens render');
  requireCheck(initial.wallet === '0', 'new desktop profile starts with an empty points wallet');
  requireCheck(initial.workshop && initial.upgradeButtons === 4, 'the four permanent upgrade controls render');
  requireCheck(await contents.executeJavaScript(`Array.from(document.querySelectorAll('[data-upgrade]')).every(button => button.disabled)`), 'upgrades cannot be bought without earned points');
  requireCheck(!initial.nodeBridge, 'renderer has no Node.js bridge');
  const preferences = contents.getLastWebPreferences();
  requireCheck(preferences.contextIsolation && preferences.sandbox && !preferences.nodeIntegration, 'renderer isolation is enabled');

  // This fixture is written only to smokeProfile, an isolated temporary folder.
  // It exercises a real purchase through the bundled UI without altering player data.
  await contents.executeJavaScript(`(() => {
    const key = 'drunken-joyride:profile:v1';
    const saved = JSON.parse(localStorage.getItem(key) || '{"version":1,"profile":{}}');
    saved.profile = saved.profile || {};
    Object.assign(saved.profile, {
      best: 0, wallet: 100, lifetimeEarned: 100,
      upgrades: { engine: 0, handling: 0, nitro: 0, magnet: 0 }, runCredits: []
    });
    localStorage.setItem(key, JSON.stringify(saved));
  })()`);
  await reloadForSmoke(contents);
  await contents.executeJavaScript(`(() => {
    document.querySelector('#nav-garage').click();
    document.querySelector('[data-upgrade="handling"]').click();
  })()`);
  const purchase = await contents.executeJavaScript(`(() => {
    const saved = JSON.parse(localStorage.getItem('drunken-joyride:profile:v1'));
    return { wallet: document.querySelector('#wallet-balance').textContent.trim(), profile: saved.profile };
  })()`);
  requireCheck(purchase.wallet === '80' && purchase.profile.wallet === 80 && purchase.profile.upgrades.handling === 1, 'a garage purchase spends twenty earned points and saves the upgrade');
  requireCheck(purchase.profile.best === 0 && purchase.profile.lifetimeEarned === 100, 'spending preserves the highscore and total earned points');
  await reloadForSmoke(contents);
  const restored = await contents.executeJavaScript(`(() => {
    const saved = JSON.parse(localStorage.getItem('drunken-joyride:profile:v1'));
    return { wallet: document.querySelector('#wallet-balance').textContent.trim(), level: saved.profile.upgrades.handling };
  })()`);
  requireCheck(restored.wallet === '80' && restored.level === 1, 'wallet and permanent tuning survive a restart');

  await contents.executeJavaScript(`document.querySelector('#start').click()`);
  await wait(120);
  const running = await contents.executeJavaScript(`(() => ({
    hud: !document.querySelector('#hud').hidden,
    ready: document.querySelector('#ready').hidden,
    score: document.querySelector('#live-score').textContent.trim()
  }))()`);
  requireCheck(running.hud && running.ready && /^\d+$/.test(running.score), 'a drive starts in the packaged app');

  // A hidden CI window cannot rely on Windows foreground focus. These events go
  // through the same bundled keyboard handlers as real keys, without a test API.
  await contents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#game');
    canvas.focus();
    for (const code of ['ArrowLeft', 'ArrowRight']) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      canvas.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    }
  })()`);
  await wait(260);
  await contents.executeJavaScript(`(() => {
    const canvas = document.querySelector('#game');
    canvas.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
    canvas.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP', key: 'p', bubbles: true }));
  })()`);
  requireCheck(await contents.executeJavaScript(`!document.querySelector('#paused').hidden`), 'keyboard handling can pause a drive');
  await contents.executeJavaScript(`document.querySelector('#resume').click()`);
  requireCheck(await contents.executeJavaScript(`document.querySelector('#paused').hidden`), 'a paused drive resumes');
  finishSmoke();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 920,
    minWidth: 760,
    minHeight: 640,
    title: `${APP_NAME} v${app.getVersion()}`,
    backgroundColor: '#101815',
    show: !smokeMode,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      // Hidden packaged smoke tests still need animation and keyboard processing.
      backgroundThrottling: !smokeMode,
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('page-title-updated', event => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => finishSmoke(new Error(`Renderer stopped: ${details.reason}`)));
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) finishSmoke(new Error(`Game page failed to load (${code}): ${description}`));
  });
  window.on('closed', () => { mainWindow = undefined; });
  void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    .then(() => smokeMode ? smokeTest(window) : undefined)
    .catch(error => {
      if (smokeMode) finishSmoke(error);
      else console.error('Unable to load the bundled game:', error);
    });
  return window;
}

app.whenReady().then(() => {
  // The desktop version uses bundled files only. Real website-ad integrations
  // stay on the hosted website rather than loading third-party code into the app.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: 'Game',
    submenu: [
      { label: 'Reload game', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
      { label: 'Fullscreen', accelerator: 'F11', click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }]));
  createWindow();
}).catch(error => {
  if (smokeMode) finishSmoke(error);
  else { console.error(error); app.exit(1); }
});

if (smokeMode) {
  setTimeout(() => finishSmoke(new Error('Desktop smoke test exceeded 30 seconds.')), 30_000).unref();
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
process.on('uncaughtException', error => { if (smokeMode) finishSmoke(error); else { console.error(error); app.exit(1); } });
