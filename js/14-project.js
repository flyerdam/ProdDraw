"use strict";
function projectJSON() {
  return JSON.stringify({ app: 'prodrys', version: 2,
    name: $('#projName').value, shapes: state.shapes, vars: state.vars,
    page: state.page, lib }, null, 1);
}
/* File System Access API — zapis w miejscu (do tego samego pliku), bez pobierania */
function hasNativeFS() {
  return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
}
function projectFileTypes() {
  return [{ description: 'ProdDraw Project', accept: { 'application/json': ['.pdraw', '.json', '.prodrys'] } }];
}
async function writeToHandle(handle) {
  const w = await handle.createWritable();
  await w.write(projectJSON());
  await w.close();
}
function setNameFromFilename(fn) {
  const base = (fn || '').replace(/\.[^.]+$/, '');
  if (base) { state.name = base; $('#projName').value = base; }
}
async function saveProject(forcePicker = false) {
  state.name = $('#projName').value;
  const name = sanitizeFile($('#projName').value);
  if (hasNativeFS()) {
    try {
      if (!currentProjectHandle || forcePicker) {
        currentProjectHandle = await window.showSaveFilePicker({ suggestedName: name + '.pdraw', types: projectFileTypes() });
      }
      await writeToHandle(currentProjectHandle);
      const fn = currentProjectHandle.name || (name + '.pdraw');
      setNameFromFilename(fn);
      toast(t('t.nativeSaved') + fn, 6000); autosave();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   /* użytkownik anulował */
      toast(t('t.saveErr'));
    }
  }
  /* fallback: pobranie pliku */
  downloadBlob(new Blob([projectJSON()], { type: 'application/json' }), name + '.json');
  toast(t('t.saved') + name + '.json', 6000);
}
async function saveProjectAs() {
  if (!hasNativeFS()) {
    const n = ((await promptDialog(t('p.saveAs'), $('#projName').value)) || '').trim();
    if (!n) return;
    $('#projName').value = n; state.name = n;
    return saveProject();
  }
  return saveProject(true);   /* natywnie: „zapisz jako" = wybór nowego pliku */
}
async function openProjectNative() {
  if (!hasNativeFS()) { $('#fOpen').click(); return; }
  try {
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: projectFileTypes() });
    if (!handle) return;
    const file = await handle.getFile();
    const obj = JSON.parse(await file.text());
    if (obj.app === 'prodrys-config' || obj.app === 'prodrys-settings') { importConfig(obj); return; }
    loadProject(obj, file.name);
    currentProjectHandle = handle;   /* kolejny zapis pójdzie do tego pliku */
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    toast(t('t.openErr'));
  }
}
function loadProject(obj, fileName) {
  if (!obj || !isProjectApp(obj.app) || !Array.isArray(obj.shapes))
    return toast(t('t.badProj'));
  pushUndo();
  /* nazwa projektu = nazwa pliku (bez rozszerzenia), z fallbackiem na pole name */
  const fromFile = fileName ? fileName.replace(/\.[^.]+$/, '') : '';
  state.name = fromFile || obj.name || 'Projekt';
  $('#projName').value = state.name;
  state.shapes = obj.shapes.map(normalizeShape);
  state.vars = obj.vars && obj.vars.cols ? obj.vars : { cols: [], rows: [] };
  state.page = obj.page && obj.page.mode ? obj.page : { mode: 'off' };
  syncPageUI(); fitPage();
  /* scal bibliotekę z projektu (bez duplikatów nazw) */
  if (Array.isArray(obj.lib)) {
    for (const it of obj.lib)
      if (!lib.some(l => l.name === it.name)) lib.push(it);
    saveLib(); renderLib();
  }
  sel.clear(); previewRow = -1;
  render(); renderProps(); renderVars();
  if (typeof PS_renameActive === 'function') PS_renameActive(state.name);
  autosave();
  toast(t('t.loaded') + state.name);
}
let autosaveTm = null;
function autosave() {
  clearTimeout(autosaveTm);
  if (settings.autosave === false) return;   /* wyłączony w Ustawieniach — nic nie zapisuj */
  autosaveTm = setTimeout(() => {
    try { localStorage.setItem(PS_autoKey(), projectJSON()); } catch (e) {}
  }, 400);
}
const exportHandles = { png: null, jpg: null };   /* zapamiętane pliki eksportu (jak zapis) */
async function exportImage(fmt, forcePicker = false) {
  const region = pageRegion();
  if (!state.shapes.length && !region) return toast(t('t.emptyCanvas'));
  const b = buildSVG(state.shapes, currentVals(), 16, region);
  const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext = fmt === 'jpg' ? '.jpg' : '.png';
  const blob = await svgToPngBlob(b.svg, b.w, b.h, 2, mime);
  let name = sanitizeFile($('#projName').value);
  if (previewRow >= 0 && state.vars.rows[previewRow])
    name += '_' + sanitizeFile(state.vars.rows[previewRow].name);
  if (hasNativeFS()) {
    try {
      if (!exportHandles[fmt] || forcePicker) {
        exportHandles[fmt] = await window.showSaveFilePicker({
          suggestedName: name + ext, types: [{ description: fmt.toUpperCase(), accept: { [mime]: [ext] } }] });
      }
      const w = await exportHandles[fmt].createWritable();
      await w.write(blob); await w.close();
      toast(t('t.exported') + (exportHandles[fmt].name || name + ext), 6000);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      toast(t('t.saveErr'));
    }
  }
  downloadBlob(blob, name + ext);
  toast(t('t.exported') + name + ext, 6000);
}

/* =====================================================================
   OBRAZY: wstawianie, wklejanie, import XLSX
   ===================================================================== */
