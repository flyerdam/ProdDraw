const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
 * MIME type lookup for insert-image dialog (file extension -> data URL mime)
 */
const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};

/**
 * Open a native "Import XLSX" dialog and send the picked file's contents to
 * the renderer. Using dialog.showOpenDialog here (instead of asking the
 * renderer to click a hidden <input type=file>) avoids a Chromium quirk:
 * input.click() requires transient user activation, which does not survive
 * the main->renderer IPC hop from a native menu click, so the file picker
 * silently never opened.
 */
async function importXlsxDialog() {
  if (!mainWindow) return;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import XLSX/XLSM',
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return;
  const filePath = res.filePaths[0];
  try {
    const buf = fs.readFileSync(filePath);
    mainWindow.webContents.send('import-xlsx-data', {
      name: path.basename(filePath),
      data: buf.toString('base64')
    });
  } catch (err) {
    dialog.showErrorBox('Import XLSX', `Failed to read file: ${err.message}`);
  }
}

/**
 * Open a native "Insert Image" dialog and send a data URL of the picked
 * image to the renderer. See importXlsxDialog() for why this is done from
 * the main process rather than triggering a hidden file input.
 */
async function insertImageDialog() {
  if (!mainWindow) return;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Insert Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return;
  const filePath = res.filePaths[0];
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = IMAGE_MIME[ext] || 'application/octet-stream';
    mainWindow.webContents.send('insert-image-data', {
      dataURL: `data:${mime};base64,${buf.toString('base64')}`
    });
  } catch (err) {
    dialog.showErrorBox('Insert Image', `Failed to read file: ${err.message}`);
  }
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setTitle('ProdDraw');
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  /**
   * Block navigation away from the app. Without this, dropping a file (XLSX,
   * image, etc.) onto the window can make Chromium navigate the BrowserWindow
   * to `file://<dropped path>` at the browser-process level -- this happens
   * "above" the renderer, so the page's own dragover/drop preventDefault()
   * calls don't reliably stop it. That's what broke drag-and-drop import:
   * the window would silently try to navigate instead of handing the file to
   * our drop handler. See Electron's security guide, "Disable or limit
   * navigation".
   */
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

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
          click: importXlsxDialog
        },
        {
          label: 'Insert Image',
          click: insertImageDialog
        },
        { type: 'separator' },
        {
          label: 'Export PNG',
          click: send('exportPng')
        },
        {
          label: 'Export PNG As…',
          click: send('exportPngAs')
        },
        {
          label: 'Export JPG',
          click: send('exportJpg')
        },
        {
          label: 'Export JPG As…',
          click: send('exportJpgAs')
        },
        {
          label: 'Export XLSX',
          click: send('exportXlsx')
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
