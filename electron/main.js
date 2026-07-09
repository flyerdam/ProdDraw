const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setTitle('ProdDraw');
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // Open DevTools in development (optional, comment out for production)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * App lifecycle: create window on ready
 */
app.on('ready', createWindow);

/**
 * On macOS, re-create window when app is activated if no windows are open
 */
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Quit app when all windows are closed, except on macOS
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
