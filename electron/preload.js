/**
 * Preload script for ProdDraw Electron app
 *
 * This script runs in the isolated context between the main process and the renderer.
 * Due to contextIsolation: true, the web app code cannot access Node.js APIs.
 * The preload establishes the security boundary.
 */

const { contextBridge } = require('electron');

/**
 * Expose a minimal API to the renderer process to indicate desktop mode
 */
contextBridge.exposeInMainWorld('prodrawDesktop', {
  isDesktop: true
});
