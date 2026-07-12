"use strict";
/* ---------- narzędzia pomocnicze ---------- */
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('on'), ms);
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* obrót punktu (px,py) wokół (cx,cy) o deg stopni */
function rotatePt(px, py, cx, cy, deg) {
  const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
const escXml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sanitizeFile = s => (s || 'projekt').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'projekt';
/* usuń ewentualne "resztki" rozszerzenia z końca nazwy przed doklejeniem właściwego
   (np. nazwa projektu wpisana ręcznie jako "Rysunek.pdraw" -> eksport dawałby
   "Rysunek.pdraw.jpg"); stosowane tylko przy budowaniu nazwy pliku, nie zmienia
   widocznej nazwy projektu */
const stripExt = s => (s || '').replace(/\.[a-z0-9]{1,6}$/i, '');

function worldPt(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.x) / view.z,
           y: (e.clientY - r.top - view.y) / view.z };
}
function bboxOf(s) {
  if (s.type === 'line') {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
    return { x, y, w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }
  if (s.type === 'text') {
    const lines = String(s.text || '').split('\n');
    const w = Math.max(...lines.map(l => l.length), 1) * s.fs * 0.6;
    return { x: s.x, y: s.y, w, h: lines.length * s.fs * 1.25 };
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}
/* prostokąt otaczający uwzględniający OBRÓT (do przyciągania/wyrównania/macierzy) */
function aabbOf(s) {
  const b = bboxOf(s);
  if (!s.rot || s.type === 'line') return b;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const [px, py] of corners) {
    const r = rotatePt(px, py, cx, cy, s.rot);
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x); y2 = Math.max(y2, r.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function unionBBox(shapes) {
  if (!shapes.length) return null;
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const s of shapes) {
    const b = aabbOf(s);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
const selShapes = () => state.shapes.filter(s => sel.has(s.id));

/* zaznaczenie rozszerza się na całą grupę */
function expandGroup(id) {
  const s = state.shapes.find(a => a.id === id);
  if (!s) return [id];
  if (!s.g) return [id];
  return state.shapes.filter(a => a.g === s.g).map(a => a.id);
}

