"use strict";

/**
 * Desktop Menu Integration for ProdDraw Electron App
 *
 * This script wires native menu commands (sent via IPC from electron/main.js)
 * to corresponding app functions. All calls are guarded with type/existence checks.
 * In a plain browser (no Electron), this file does nothing.
 */

/**
 * Dispatch a menu command to the appropriate app function
 */
function dispatch(cmd) {
  switch (cmd) {
    case 'new':
      // Try to open new project via Tabs_new or openTemplatePicker
      if (typeof Tabs_new === 'function') {
        Tabs_new();
      } else if (typeof openTemplatePicker === 'function') {
        openTemplatePicker();
      }
      break;

    case 'open':
      if (typeof openProjectNative === 'function') {
        openProjectNative();
      }
      break;

    case 'save':
      if (typeof saveProject === 'function') {
        saveProject();
      }
      break;

    case 'saveAs':
      if (typeof saveProjectAs === 'function') {
        saveProjectAs();
      }
      break;

    case 'importXlsx':
      var el = document.getElementById('fXlsx');
      if (el) el.click();
      break;

    case 'insertImage':
      var el = document.getElementById('fImg');
      if (el) el.click();
      break;

    case 'exportPng':
      if (typeof exportImage === 'function') {
        exportImage('png');
      }
      break;

    case 'exportPngAs':
      if (typeof exportImage === 'function') {
        exportImage('png', true);
      }
      break;

    case 'exportJpg':
      if (typeof exportImage === 'function') {
        exportImage('jpg');
      }
      break;

    case 'exportJpgAs':
      if (typeof exportImage === 'function') {
        exportImage('jpg', true);
      }
      break;

    case 'undo':
      if (typeof undo === 'function') {
        undo();
      }
      break;

    case 'redo':
      if (typeof redo === 'function') {
        redo();
      }
      break;

    case 'copy':
      if (typeof copySel === 'function') {
        copySel();
      }
      break;

    case 'duplicate':
      if (typeof duplicateSel === 'function') {
        duplicateSel();
      }
      break;

    case 'delete':
      if (typeof deleteSel === 'function') {
        deleteSel();
      }
      break;

    case 'group':
      if (typeof groupSel === 'function') {
        groupSel();
      }
      break;

    case 'ungroup':
      if (typeof ungroupSel === 'function') {
        ungroupSel();
      }
      break;

    case 'zoomIn':
      var el = document.getElementById('bZoomIn');
      if (el) el.click();
      break;

    case 'zoomOut':
      var el = document.getElementById('bZoomOut');
      if (el) el.click();
      break;

    case 'fit':
      if (typeof fitPage === 'function') {
        fitPage();
        if (typeof render === 'function') {
          render();
        }
      }
      break;

    case 'shapes':
      if (typeof openShapeModal === 'function') {
        openShapeModal();
      }
      break;

    default:
      console.warn('Unknown desktop menu command:', cmd);
  }
}

/**
 * Register the IPC listener if running in Electron
 */
if (window.prodrawDesktop && typeof window.prodrawDesktop.onMenu === 'function') {
  window.prodrawDesktop.onMenu(dispatch);
  // Hide in-page menu buttons when running in Electron (native menu replaces them)
  document.body.classList.add('desktop-mode');
}
