"use strict";
/* ---------- grupy ---------- */
function groupSel() {
  if (sel.size < 2) return;
  pushUndo();
  const g = 'G' + Date.now().toString(36);
  selShapes().forEach(s => s.g = g);
  render(); renderProps(); autosave();
  toast(t('t.grouped'));
}
function ungroupSel() {
  pushUndo();
  selShapes().forEach(s => delete s.g);
  render(); renderProps(); autosave();
  toast(t('t.ungrouped'));
}
function duplicateSel() {
  const ss = selShapes(); if (!ss.length) return;
  pushUndo();
  const gmap = {};
  const copies = ss.map(s => {
    const c = JSON.parse(JSON.stringify(s));
    c.id = uid();
    if (c.g) { gmap[c.g] = gmap[c.g] || ('G' + uid()); c.g = gmap[c.g]; }
    if (c.type === 'line') { c.x1 += 14; c.y1 += 14; c.x2 += 14; c.y2 += 14; }
    else { c.x += 14; c.y += 14; }
    return c;
  });
  state.shapes.push(...copies);
  setSelection(copies.map(c => c.id)); autosave();
}
function deleteSel() {
  if (!sel.size) return;
  pushUndo();
  state.shapes = state.shapes.filter(s => !sel.has(s.id));
  sel.clear(); render(); renderProps(); autosave();
}

/* =====================================================================
   BIBLIOTEKA GRUP
   ===================================================================== */
