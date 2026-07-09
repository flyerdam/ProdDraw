"use strict";
/* ---------- menu rozwijane ---------- */
function closeMenus() { $$('.menu.open').forEach(m => m.classList.remove('open')); }
$$('.menu > [data-menu]').forEach(btn => btn.addEventListener('click', e => {
  e.stopPropagation();
  const m = btn.parentElement, wasOpen = m.classList.contains('open');
  closeMenus();
  if (!wasOpen) m.classList.add('open');
}));
$$('.menuItem').forEach(it => it.addEventListener('click', closeMenus));
document.addEventListener('click', closeMenus);

$('#bNew').addEventListener('click', openTemplatePicker);
/* przyciski konfiguracji przeniesione do zakładki Ustawienia (renderSettings) */
$('#fSettings').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { importConfig(JSON.parse(await f.text())); }
  catch (err) { toast(t('t.cfgBad')); }
});
$('#bSave').addEventListener('click', () => saveProject());
$('#bSaveAs').addEventListener('click', saveProjectAs);
$('#bOpen').addEventListener('click', openProjectNative);
$('#fOpen').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  currentProjectHandle = null;   /* z pobranego pliku nie ma uchwytu do zapisu */
  try { loadProject(JSON.parse(await f.text()), f.name); }
  catch (err) { toast(t('t.badFile')); }
});
$('#bXlsx').addEventListener('click', () => $('#fXlsx').click());
$('#bImg').addEventListener('click', () => $('#fImg').click());
$('#fXlsx').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) importXlsx(f);
});
$('#fImg').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) insertImageURL(await fileToDataURL(f));
});
$('#xlClose').addEventListener('click', closeXlsxModal);
$('#shapeClose').addEventListener('click', () => $('#shapeModal').classList.remove('on'));
$('#bZoomOut').addEventListener('click', () => zoomAtCenter(1 / 1.25));
$('#bZoomIn').addEventListener('click', () => zoomAtCenter(1.25));
$('#tmplClose').addEventListener('click', () => $('#tmplModal').classList.remove('on'));
$('#bPng').addEventListener('click', () => exportImage('png'));
$('#bPngAs').addEventListener('click', () => exportImage('png', true));
$('#bJpg').addEventListener('click', () => exportImage('jpg'));
$('#bJpgAs').addEventListener('click', () => exportImage('jpg', true));
$('#bJpgQuick').addEventListener('click', () => exportImage('jpg'));
$('#bUndo').addEventListener('click', undo);
$('#bRedo').addEventListener('click', redo);
$('#projName').addEventListener('change', () => { state.name = $('#projName').value; if (typeof PS_renameActive === 'function') PS_renameActive(state.name); autosave(); });
$('#gridSize').addEventListener('change', render);

/* ---------- przeciągnij i upuść pliki na okno ---------- */
window.addEventListener('dragover', e => { e.preventDefault(); });
window.addEventListener('drop', async e => {
  e.preventDefault();
  /* spróbuj pobrać uchwyt pliku (zapis w miejscu dla przeciągniętego projektu) */
  let handle = null;
  const it0 = e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
  if (it0 && it0.getAsFileSystemHandle) { try { handle = await it0.getAsFileSystemHandle(); } catch (er) {} }
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  if (/\.(pdraw|json|prodrys)$/i.test(f.name)) {
    try {
      const obj = JSON.parse(await f.text());
      if (obj.app === 'prodrys-config' || obj.app === 'prodrys-settings') importConfig(obj);
      else { loadProject(obj, f.name); currentProjectHandle = (handle && handle.kind === 'file') ? handle : null; }
    } catch (err) { toast(t('t.badFile')); }
  } else if (/\.(xlsx|xlsm)$/i.test(f.name)) {
    importXlsx(f);
  } else if (f.type.startsWith('image/')) {
    insertImageURL(await fileToDataURL(f));
  }
});

/* ---------- suwak szerokości panelu bocznego ---------- */
(function () {
  const rz = $('#sideResizer'); if (!rz) return;
  let dragging = false;
  rz.addEventListener('pointerdown', e => { dragging = true; rz.setPointerCapture(e.pointerId); e.preventDefault(); });
  rz.addEventListener('pointermove', e => {
    if (!dragging) return;
    const w = clamp(window.innerWidth - e.clientX, 200, 640);
    settings.sideW = Math.round(w);
    document.documentElement.style.setProperty('--sideW', settings.sideW + 'px');
    render();
  });
  rz.addEventListener('pointerup', () => { if (dragging) { dragging = false; saveSettingsLS(); renderSettings(); } });
})();

document.addEventListener('keydown', e => {
  const inField = document.activeElement &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if (e.code === 'Space' && !inField) { spaceDown = true; cv.classList.add('t-pan'); e.preventDefault(); }
  if (inField) return;
  const K = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (K === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (K === 'y') { e.preventDefault(); redo(); }
    else if (K === 's') { e.preventDefault(); saveProject(); }
    else if (K === 'o') { e.preventDefault(); $('#fOpen').click(); }
    else if (K === 'c') { e.preventDefault(); copySel(); }
    else if (K === 'd') { e.preventDefault(); duplicateSel(); }
    else if (K === 'a') { e.preventDefault(); setSelection(state.shapes.map(s => s.id)); }
    else if (K === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    return;
  }
  if (K === 'delete' || K === 'backspace') { e.preventDefault(); deleteSel(); }
  else if (K === 'escape') { if (cropMode) { cropMode = null; } sel.clear(); setTool('select'); render(); renderProps(); }
  else if (K === 'v') setTool('select');
  else if (K === 'r') setTool('rect');
  else if (K === 'c') setTool('ellipse');
  else if (K === 'l') setTool('line');
  else if (K === 'a') setTool('arrow');
  else if (K === 't') setTool('text');
  else if (K === 's') openShapeModal();
  else if (K === 'i') $('#fImg').click();
  else if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomAtCenter(1.25); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAtCenter(1 / 1.25); }
  else if (e.key.startsWith('Arrow') && sel.size) {
    if (hasMoveLock()) { e.preventDefault(); return lockToast(); }
    e.preventDefault(); pushUndo();
    const d = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    selShapes().forEach(s => {
      if (s.type === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
      else { s.x += dx; s.y += dy; }
    });
    render(); refreshXYWH(); autosave();
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space') { spaceDown = false; cv.setAttribute('class', 't-' + tool); }
});
/* zapis przy zamknięciu okna — patrz PS_init() w js/projects.js (respektuje
   przełącznik Autozapis i zwalnia gniazda w rejestrze "żywych" projektów) */

