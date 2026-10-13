const { app, BrowserWindow, dialog, Menu, nativeTheme } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const receivers = require('./receivers');
const modules = require('./modules');

// Preserve the existing profile (cookies, receiver settings, and local storage).
app.setPath('userData', path.join(app.getPath('appData'), 'websdr-terminal'));
app.setName('Radio Hub');
nativeTheme.themeSource = 'dark';

function createWindow() {
  let selectedReceiver = 'twente';
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Radio Hub - Radio Terminal',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const hf = require('./hf-host')(window);
  try {
    const catches = require('./catch-host')(window, hf);
    hf.onCatchSourceChanged = () => catches.sourceChanged();
  } catch (error) { console.error('Log Catch initialization:', error.message); }

  window.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://tile.openstreetmap.org/*'] },
    (details, callback) => {
      details.requestHeaders['User-Agent'] = `Radio-Hub/${app.getVersion()} (Electron desktop weather map)`;
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  window.webContents.on('did-finish-load', () => {
    const url = window.webContents.getURL();
    const localModule = modules.find(module => url === pathToFileURL(path.join(__dirname, module.file)).href);
    const remoteReceiver = receivers.find(receiver => new URL(receiver.url).hostname === new URL(url).hostname);
    if (localModule) selectedReceiver = localModule.id;
    else if (remoteReceiver) selectedReceiver = remoteReceiver.id;
    const menu = Menu.getApplicationMenu();
    for (const id of [...receivers.map(receiver => receiver.id), ...modules.map(module => module.id)]) {
      menu.getMenuItemById(`receiver-${id}`).checked = id === selectedReceiver;
    }
  });

  async function openReceiver(receiver) {
    try {
      const source = receivers.find(item => item.id === receiver);
      const module = modules.find(item => item.id === receiver);
      if (!source && !module) throw new Error('Unknown receiver');
      selectedReceiver = receiver;
      // Navigation unloads the previous receiver and stops its audio connection.
      if (module) await window.loadFile(path.join(__dirname, module.file));
      else await hf.open(source.id);
    } catch (error) {
      if (error.code === 'ERR_ABORTED') return;
      console.error('Receiver failed to load:', error);
      if (!window.isDestroyed()) {
        dialog.showMessageBox(window, {
          type: 'error',
          title: 'Radio Hub',
          message: 'The receiver page could not be loaded.',
          detail: `${error.message}\n\nPress Ctrl+Shift+R to try again.`,
        });
      }
    }
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Receiver', submenu: [
      { label: 'Shortwave / SDR Receivers', submenu: receivers.map(receiver => ({
        id: `receiver-${receiver.id}`, label: receiver.label, type: 'checkbox',
        checked: receiver.id === 'twente',
        click: () => openReceiver(receiver.id),
      })) },
      ...modules.map(module => ({ id: `receiver-${module.id}`, label: module.label, type: 'checkbox',
        accelerator: module.accelerator, click: () => openReceiver(module.id) })),
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Reload receiver', accelerator: 'Ctrl+R', click: () => hf.reload() },
      { label: 'Hard reload receiver', accelerator: 'Ctrl+Shift+R', click: () => hf.reload() },
      { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen', accelerator: 'F11' },
    ] },
    { role: 'windowMenu' },
  ]));

  openReceiver(modules.find(module => process.argv.includes(`--${module.id}`))?.id || 'twente');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
