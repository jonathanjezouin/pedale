/* Coquille Electron (Windows) : charge le build Vite (dist/index.html).
   L'intégration Steam (steamworks.js : succès, cloud saves, overlay) est volontairement optionnelle
   et NON testée en v0.0.1 : elle ne s'active que si le module est installé et STEAM_APP_ID défini. */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

function initSteam() {
  const appId = process.env.STEAM_APP_ID;
  if (!appId) return null;
  try {
    const steamworks = require('steamworks.js');     // npm i steamworks.js (module natif, nécessite le client Steam)
    const client = steamworks.init(Number(appId));
    steamworks.electronEnableSteamOverlay();
    return client;
  } catch (e) {
    console.warn('[steam] indisponible :', e.message);
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#94ae63', autoHideMenuBar: true, title: 'Pédale',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  const dev = process.env.PEDALE_DEV_URL;
  if (dev) win.loadURL(dev); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  initSteam();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
