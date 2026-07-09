"use strict";
let uidN = 1;
const uid = () => 'S' + (uidN++) + '_' + Date.now().toString(36);
const isProjectApp = app => app === 'prodrys' || app === 'proddraw';
/* uzupełnij brakujące pola (locked, font) na wczytanych kształtach */
function normalizeShape(s) {
  if (!s || typeof s !== 'object') return s;
  const n = { ...s };
  if (n.locked === undefined) n.locked = false;
  if (['rect', 'ellipse', 'text', 'poly', 'roundRect'].includes(n.type) && !n.font) n.font = 'Calibri';
  return n;
}

/* ---------- undo / redo ----------
   Migawki dzielą duże dane obrazów (data:) przez pulę — 100 kroków historii
   z 5 zdjęciami NIE trzyma 500 kopii base64, tylko 5 (jedna na unikat) + tokeny. */
const undoStack = [], redoStack = [];
const imgPool = new Map();      // token -> data:URL
const imgRev = new Map();       // data:URL -> token
let imgPoolN = 1;
function poolToken(url) {
  let tk = imgRev.get(url);
  if (!tk) { tk = 'P' + (imgPoolN++); imgPool.set(tk, url); imgRev.set(url, tk); }
  return tk;
}
function snapReplacer(k, v) {
  return (k === 'href' && typeof v === 'string' && v.startsWith('data:')) ? '@@' + poolToken(v) : v;
}
function snap_() { return JSON.stringify(state.shapes, snapReplacer); }
function unsnap(json) {
  const arr = JSON.parse(json);
  for (const s of arr)
    if (s && typeof s.href === 'string' && s.href.startsWith('@@')) {
      const u = imgPool.get(s.href.slice(2)); if (u) s.href = u;
    }
  return arr;
}
function clearHistory() { undoStack.length = 0; redoStack.length = 0; imgPool.clear(); imgRev.clear(); imgPoolN = 1; }
function pushUndo() {
  undoStack.push(snap_());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snap_());
  state.shapes = unsnap(undoStack.pop());
  sel.clear(); render(); renderProps(); autosave();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap_());
  state.shapes = unsnap(redoStack.pop());
  sel.clear(); render(); renderProps(); autosave();
}

