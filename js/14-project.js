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
  const name = stripExt(sanitizeFile($('#projName').value));
  if (hasNativeFS()) {
    try {
      if (!currentProjectHandle || forcePicker) {
        currentProjectHandle = await window.showSaveFilePicker({ suggestedName: name + '.pdraw', types: projectFileTypes() });
      }
      await writeToHandle(currentProjectHandle);
      const fn = currentProjectHandle.name || (name + '.pdraw');
      setNameFromFilename(fn);
      toast(t('t.nativeSaved') + fn, 6000); autosave();
      PS_setDirty(PS_activeSlot(), false);   /* zapisane do pliku — nadpisz mark dirty=true z autosave() powyżej */
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   /* użytkownik anulował */
      toast(t('t.saveErr'));
    }
  }
  /* fallback: pobranie pliku */
  downloadBlob(new Blob([projectJSON()], { type: 'application/json' }), name + '.json');
  toast(t('t.saved') + name + '.json', 6000);
  PS_setDirty(PS_activeSlot(), false);
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
  PS_setDirty(PS_activeSlot(), false);   /* świeżo otwarty z pliku = zgodny z plikiem, nie "niezapisany" */
  toast(t('t.loaded') + state.name);
}
let autosaveTm = null;
function autosave() {
  clearTimeout(autosaveTm);
  PS_setDirty(PS_activeSlot(), true);   /* niezapisane zmiany do pliku — niezależnie od przełącznika Autozapis */
  if (settings.autosave === false) return;   /* wyłączony w Ustawieniach — nic nie zapisuj */
  /* przechwyć KLUCZ gniazda i TREŚĆ od razu, synchronicznie — nie w momencie
     odpalenia timera 400ms. Gdyby czytać PS_autoKey()/projectJSON() dopiero
     w callbacku, przełączenie karty w tym oknie w międzyczasie (PS_active
     wskazuje już na inne gniazdo, state to już inny projekt) nadpisałoby złe
     gniazdo złą, nieaktualną zawartością. Zamrożenie obu wartości TERAZ usuwa
     ten wyścig całkowicie — timer tylko opóźnia zapis, nie odczyt. */
  const key = PS_autoKey();
  const json = projectJSON();
  autosaveTm = setTimeout(() => {
    try { localStorage.setItem(key, json); } catch (e) {}
  }, 400);
}
/* zapamiętane pliki eksportu (jak zapis w miejscu) — PER PROJEKT (slot), nie
   globalnie. Wcześniej to był jeden wspólny obiekt {png,jpg}, więc eksport w
   projekcie B po przełączeniu karty cicho nadpisywał plik zapamiętany jeszcze
   z projektu A. Klucz gniazda wraca do stanu "brak zapamiętanego pliku" tylko
   przy pełnym przeładowaniu apki (uchwyty i tak nie da się zserializować). */
const exportHandlesBySlot = new Map();
function exportHandlesFor(slot) {
  let h = exportHandlesBySlot.get(slot);
  if (!h) { h = { png: null, jpg: null }; exportHandlesBySlot.set(slot, h); }
  return h;
}
async function exportImage(fmt, forcePicker = false) {
  const region = pageRegion();
  if (!state.shapes.length && !region) return toast(t('t.emptyCanvas'));
  /* margines dla kanwy nieskończonej (bez strony) — konfigurowalny w Ustawieniach;
     gdy jest region (strona ma format), pad jest przez buildSVG i tak ignorowany */
  const pad = (settings.infiniteCanvasMargin != null) ? settings.infiniteCanvasMargin : 16;
  const b = buildSVG(state.shapes, currentVals(), pad, region);
  const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext = fmt === 'jpg' ? '.jpg' : '.png';
  const blob = await svgToPngBlob(b.svg, b.w, b.h, 2, mime);
  let name = stripExt(sanitizeFile($('#projName').value));
  if (previewRow >= 0 && state.vars.rows[previewRow])
    name += '_' + stripExt(sanitizeFile(state.vars.rows[previewRow].name));
  const handles = exportHandlesFor(PS_activeSlot());
  if (hasNativeFS()) {
    try {
      if (!handles[fmt] || forcePicker) {
        handles[fmt] = await window.showSaveFilePicker({
          suggestedName: name + ext, types: [{ description: fmt.toUpperCase(), accept: { [mime]: [ext] } }] });
      }
      const w = await handles[fmt].createWritable();
      await w.write(blob); await w.close();
      toast(t('t.exported') + (handles[fmt].name || name + ext), 6000);
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
