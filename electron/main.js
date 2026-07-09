const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

/**
 * Helper to send a menu command to the renderer process
 */
const send = (cmd) => () => {
  if (mainWindow) {
    mainWindow.webContents.send('menu-action', cmd);
  }
};

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

  // Build and set the application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: send('new')
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: send('open')
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: send('save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: send('saveAs')
        },
        { type: 'separator' },
        {
          label: 'Import XLSX',
          click: send('importXlsx')
        },
        {
          label: 'Insert Image',
          click: send('insertImage')
        },
        { type: 'separator' },
        {
          label: 'Export PNG',
          click: send('exportPng')
        },
        {
          label: 'Export JPG',
          click: send('exportJpg')
        },
        { type: 'separator' },
        {
          label: 'Quit',
          role: 'quit'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: send('undo')
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          click: send('redo')
        },
        { type: 'separator' },
        {
          label: 'Copy',
          click: send('copy')
        },
        {
          label: 'Duplicate',
          accelerator: 'CmdOrCtrl+D',
          click: send('duplicate')
        },
        {
          label: 'Delete',
          click: send('delete')
        },
        { type: 'separator' },
        {
          label: 'Group',
          click: send('group')
        },
        {
          label: 'Ungroup',
          click: send('ungroup')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          click: send('zoomIn')
        },
        {
          label: 'Zoom Out',
          click: send('zoomOut')
        },
        {
          label: 'Fit Page',
          click: send('fit')
        },
        { type: 'separator' },
        {
          label: 'More Shapes',
          click: send('shapes')
        },
        { type: 'separator' },
        {
          label: 'Reload',
          role: 'reload'
        },
        {
          label: 'Toggle DevTools',
          role: 'toggleDevTools'
        },
        {
          label: 'Toggle Fullscreen',
          role: 'togglefullscreen'
        }
      ]
    }
  ]);

  Menu.setApplicationMenu(menu);
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
