"use strict";
let drag = null;
function newShapeDefaults(type, p) {
  const D = settings.defaults || { font: 'Calibri', fs: 14, sw: 2, stroke: '#000000', fill: '#ffffff', tc: '#000000' };
  const base = { id: uid(), stroke: D.stroke, sw: D.sw, dash: 'solid' };
  if (type === 'rect') return { ...base, type, x: p.x, y: p.y, w: 0, h: 0,
    fill: D.fill, noFill: false, noStroke: false, text: '', fs: D.fs, tc: D.tc, bold: false, font: D.font, locked: false };
  if (type === 'ellipse') return { ...base, type, x: p.x, y: p.y, w: 0, h: 0,
    fill: D.fill, noFill: true, noStroke: false, text: '', fs: D.fs, tc: D.tc, bold: false, font: D.font, locked: false };
  if (type === 'line' || type === 'arrow') return { ...base, type: 'line',
    x1: p.x, y1: p.y, x2: p.x, y2: p.y, as: false, ae: type === 'arrow', locked: false };
  if (type === 'text') return { id: uid(), type: 'text', x: p.x, y: p.y,
    text: 'Tekst', fs: Math.max(D.fs, 16), tc: D.tc, bold: false, font: D.font, locked: false };
  return null;
}
function setSelection(ids) {
  sel = new Set(ids); render(); renderProps();
}
/* ---------- blokada kształtów ---------- */
/* granularna blokada: ruch / rozmiar+obrót / wygląd / tekst (legacy locked = wszystko) */
function isMoveLocked(s) { return !!(s && (s.locked || s.lockMove)); }
function isSizeLocked(s) { return !!(s && (s.locked || s.lockSize)); }
function isStyleLocked(s) { return !!(s && (s.locked || s.lockStyle)); }
function isTextLocked(s) { return !!(s && (s.locked || s.lockText)); }
function isLockedShape(s) { return isMoveLocked(s) || isSizeLocked(s) || isStyleLocked(s) || isTextLocked(s); }
function hasLockedSelection(shapes = selShapes()) { return shapes.some(isLockedShape); }
function hasMoveLock(shapes = selShapes()) { return shapes.some(isMoveLocked); }
function hasSizeLock(shapes = selShapes()) { return shapes.some(isSizeLocked); }
function materializeLock(a) { if (a.locked) { a.lockMove = a.lockSize = a.lockStyle = a.lockText = true; a.locked = false; } }
function lockToast() { toast(t('t.locked')); }
cv.addEventListener('pointerdown', e => {
  if (txtEd.style.display === 'block') commitEdit();
  closeMenus();                                  /* klik na płótnie zamyka menu */
  if (window.getSelection) { const g = window.getSelection(); if (g && g.removeAllRanges) g.removeAllRanges(); }
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  drag = null;                                   /* nigdy nie zaczynaj z zawieszonym dragiem */
  const p = worldPt(e);
  /* pan */
  if (e.button === 1 || spaceDown || tool === 'pan') {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    cv.classList.add('panning'); return;
  }
  if (e.button !== 0) return;

  /* tryb przycinania obrazka */
  if (cropMode) {
    const s = state.shapes.find(a => a.id === cropMode);
    const hEl = e.target.closest('[data-crop]');
    if (hEl && s) { pushUndo(); drag = { mode: 'crop', h: hEl.dataset.handle, s, F: fullRect(s) }; return; }
    cropMode = null; render(); renderProps(); return;   /* klik poza ramką = koniec */
  }

  if (tool === 'select') {
    const hEl = e.target.closest('[data-handle]');
    if (hEl && sel.size >= 1) {
      const ss = selShapes();
      if (hasSizeLock(ss)) { lockToast(); return; }   /* uchwyty = zmiana rozmiaru/obrotu */
      pushUndo();
      const h = hEl.dataset.handle;
      if (h === 'rot') {
        const s0 = ss[0], c = shapeCenter(s0);
        drag = { mode: 'rotate', s: s0, cx: c.x, cy: c.y, startRot: s0.rot || 0,
          startAng: Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI };
      }
      else if (h === 'p1' || h === 'p2') drag = { mode: 'lineend', h, s: ss[0] };
      else if (ss.length === 1) {
        const s0 = ss[0], b0 = bboxOf(s0);
        const d = { mode: 'resize', h, s: s0, b0, o: JSON.parse(JSON.stringify(s0)) };
        if (s0.rot) { /* zapamiętaj świat. pozycję kotwicy (przeciwległej krawędzi) */
          const c0 = { x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 };
          const ax = h.includes('w') ? b0.x + b0.w : h.includes('e') ? b0.x : b0.x + b0.w / 2;
          const ay = h.includes('n') ? b0.y + b0.h : h.includes('s') ? b0.y : b0.y + b0.h / 2;
          d.anchorW = rotatePt(ax, ay, c0.x, c0.y, s0.rot);
        }
        drag = d;
      }
      else drag = { mode: 'scale', h, b0: unionBBox(ss),
        orig: ss.map(s => [s.id, JSON.parse(JSON.stringify(s))]) };
      return;
    }
    const el = e.target.closest('[data-id]');
    if (el) {
      /* Alt+klik = wybierz pojedynczy obiekt w grupie (edycja koloru itp.) */
      const ids = e.altKey ? [el.dataset.id] : expandGroup(el.dataset.id);
      if (e.altKey) { sel = new Set(ids); }
      else if (e.shiftKey) {
        const has = ids.every(i => sel.has(i));
        ids.forEach(i => has ? sel.delete(i) : sel.add(i));
      } else if (!sel.has(ids[0])) {
        sel = new Set(ids);
      }
      renderProps();
      if (hasMoveLock(selShapes())) {   /* ruch zablokowany — brak przeciągania, ale tekst nadal edytowalny */
        render();
        if (sel.size === 1) maybeClickEdit([...sel][0]);
        return;
      }
      pushUndo();
      drag = { mode: 'move', sx: p.x, sy: p.y, moved: false,
        b0: unionBBox(selShapes()),
        orig: selShapes().map(s => [s.id, JSON.parse(JSON.stringify(s))]) };
      render();
      return;
    }
    if (!e.shiftKey) sel.clear();
    drag = { mode: 'marquee', sx: p.x, sy: p.y };
    render(); renderProps();
    return;
  }
  if (tool === 'text') {
    pushUndo();
    const sp = snapPt(p); guides = [];
    const s = newShapeDefaults('text', sp);
    state.shapes.push(s);
    setSelection([s.id]); setTool('select');
    startEdit(s);
    return;
  }
  if (tool === 'image') return; /* obsługa przez przycisk */
  /* rysowanie nowego kształtu */
  pushUndo();
  const sp = snapPt(p); guides = [];
  const s = newShapeDefaults(tool, sp);
  state.shapes.push(s);
  drag = { mode: s.type === 'line' ? 'newline' : 'new', s, sx: sp.x, sy: sp.y };
  sel = new Set([s.id]);
  render();
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = worldPt(e);
  if (drag.mode === 'crop') {
    const s = drag.s, F = drag.F, h = drag.h, min = 8 / view.z;
    let L = s.x, T = s.y, R = s.x + s.w, B = s.y + s.h;
    let pt = p;
    if (s.rot) pt = rotatePt(p.x, p.y, F.x + F.w / 2, F.y + F.h / 2, -s.rot);   /* do układu lokalnego */
    if ($('#snapG').checked) {   /* przyciąganie krawędzi kadru do siatki */
      const gs = +$('#gridSize').value || 10;
      pt = { x: Math.round(pt.x / gs) * gs, y: Math.round(pt.y / gs) * gs };
    }
    if (h.includes('w')) L = clamp(pt.x, F.x, R - min);
    if (h.includes('e')) R = clamp(pt.x, L + min, F.x + F.w);
    if (h.includes('n')) T = clamp(pt.y, F.y, B - min);
    if (h.includes('s')) B = clamp(pt.y, T + min, F.y + F.h);
    s.x = L; s.y = T; s.w = R - L; s.h = B - T;
    s.crop = { l: (L - F.x) / F.w, t: (T - F.y) / F.h, r: (F.x + F.w - R) / F.w, b: (F.y + F.h - B) / F.h };
    render(); return;
  }
  if (drag.mode === 'pan') {
    view.x = drag.ox + e.clientX - drag.sx;
    view.y = drag.oy + e.clientY - drag.sy;
    render(); return;
  }
  if (drag.mode === 'marquee') {
    drag.cx = p.x; drag.cy = p.y; render(); return;
  }
  if (drag.mode === 'move') {
    drag.moved = true;
    let dx = p.x - drag.sx, dy = p.y - drag.sy;
    const excl = new Set(sel);
    ({ dx, dy } = snapMove(dx, dy, drag.b0, excl));
    for (const [id, o] of drag.orig) {
      const s = state.shapes.find(a => a.id === id);
      if (!s) continue;
      if (s.type === 'line') { s.x1 = o.x1 + dx; s.y1 = o.y1 + dy; s.x2 = o.x2 + dx; s.y2 = o.y2 + dy; }
      else { s.x = o.x + dx; s.y = o.y + dy; }
    }
    render(); refreshXYWH(); return;
  }
  if (drag.mode === 'new') {
    const sp = snapPt(p, new Set([drag.s.id]));
    let x1 = drag.sx, y1 = drag.sy, x2 = sp.x, y2 = sp.y;
    if (e.shiftKey) { /* kwadrat / koło */
      const d = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      x2 = x1 + Math.sign(x2 - x1 || 1) * d;
      y2 = y1 + Math.sign(y2 - y1 || 1) * d;
    }
    drag.s.x = Math.min(x1, x2); drag.s.y = Math.min(y1, y2);
    drag.s.w = Math.abs(x2 - x1); drag.s.h = Math.abs(y2 - y1);
    render(); return;
  }
  if (drag.mode === 'newline') {
    let sp = snapPt(p, new Set([drag.s.id]));
    if (e.shiftKey) { /* przyciąganie do 45 stopni */
      const dx = sp.x - drag.s.x1, dy = sp.y - drag.s.y1;
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      sp = { x: drag.s.x1 + Math.cos(ang) * len, y: drag.s.y1 + Math.sin(ang) * len };
      guides = [];
    }
    drag.s.x2 = sp.x; drag.s.y2 = sp.y;
    render(); return;
  }
  if (drag.mode === 'lineend') {
    let sp = snapPt(p, new Set([drag.s.id]));
    if (e.shiftKey) {
      const ox = drag.h === 'p1' ? drag.s.x2 : drag.s.x1;
      const oy = drag.h === 'p1' ? drag.s.y2 : drag.s.y1;
      const dx = sp.x - ox, dy = sp.y - oy;
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      sp = { x: ox + Math.cos(ang) * len, y: oy + Math.sin(ang) * len };
      guides = [];
    }
    if (drag.h === 'p1') { drag.s.x1 = sp.x; drag.s.y1 = sp.y; }
    else { drag.s.x2 = sp.x; drag.s.y2 = sp.y; }
    render(); refreshXYWH(); return;
  }
  if (drag.mode === 'scale') {
    const b0 = drag.b0, h = drag.h;
    const sp = snapPt(p, new Set(sel));
    let x1 = b0.x, y1 = b0.y, x2 = b0.x + b0.w, y2 = b0.y + b0.h;
    if (h.includes('w')) x1 = Math.min(sp.x, x2 - 4);
    if (h.includes('e')) x2 = Math.max(sp.x, x1 + 4);
    if (h.includes('n')) y1 = Math.min(sp.y, y2 - 4);
    if (h.includes('s')) y2 = Math.max(sp.y, y1 + 4);
    const kx = (x2 - x1) / (b0.w || 1), ky = (y2 - y1) / (b0.h || 1);
    const fx = v => x1 + (v - b0.x) * kx, fy = v => y1 + (v - b0.y) * ky;
    for (const [id, o] of drag.orig) {
      const s = state.shapes.find(a => a.id === id); if (!s) continue;
      if (s.type === 'line') { s.x1 = fx(o.x1); s.y1 = fy(o.y1); s.x2 = fx(o.x2); s.y2 = fy(o.y2); }
      else {
        s.x = fx(o.x); s.y = fy(o.y);
        if (o.w !== undefined) { s.w = Math.max(2, o.w * kx); s.h = Math.max(2, o.h * ky); }
      }
      if (o.fs !== undefined) s.fs = Math.max(4, Math.round(o.fs * ky * 10) / 10);
    }
    render(); return;
  }
  if (drag.mode === 'rotate') {
    const ang = Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180 / Math.PI;
    let rot = drag.startRot + (ang - drag.startAng);
    /* skok: checkbox (ROT_STEP°) lub Shift (15°) */
    if (rotStepOn || e.shiftKey) { const st = rotStepOn ? ROT_STEP : 15; rot = Math.round(rot / st) * st; }
    rot = ((rot % 360) + 360) % 360;
    drag.s.rot = Math.round(rot * 10) / 10;
    render(); refreshRot(); return;
  }
  if (drag.mode === 'resize') {
    const s = drag.s, o = drag.o, h = drag.h;
    let sp;
    if (o.rot) { /* przenieś kursor do lokalnego (nieobróconego) układu kształtu */
      const c0 = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
      sp = rotatePt(p.x, p.y, c0.x, c0.y, -o.rot);
      if ($('#snapG').checked) {   /* przyciąganie do siatki w układzie lokalnym */
        const gs = +$('#gridSize').value || 10;
        sp = { x: Math.round(sp.x / gs) * gs, y: Math.round(sp.y / gs) * gs };
      }
    } else {
      sp = snapPt(p, new Set([s.id]));
    }
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (h.includes('w')) x1 = sp.x; if (h.includes('e')) x2 = sp.x;
    if (h.includes('n')) y1 = sp.y; if (h.includes('s')) y2 = sp.y;
    /* obrazy: narożniki trzymają proporcje (Alt wyłącza) */
    if (s.type === 'image' && h.length === 2 && !e.altKey && o.w > 0 && o.h > 0) {
      const r = o.w / o.h;
      const w = Math.abs(x2 - x1), hh = Math.abs(y2 - y1);
      if (w / r > hh) { const nh = w / r;
        if (h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
      } else { const nw = hh * r;
        if (h.includes('w')) x1 = x2 - nw; else x2 = x1 + nw; }
    }
    s.x = Math.min(x1, x2); s.y = Math.min(y1, y2);
    s.w = Math.max(2, Math.abs(x2 - x1)); s.h = Math.max(2, Math.abs(y2 - y1));
    if (o.rot && drag.anchorW) { /* utrzymaj przeciwległą krawędź w miejscu (świat) */
      const cN = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      const ax = h.includes('w') ? s.x + s.w : h.includes('e') ? s.x : s.x + s.w / 2;
      const ay = h.includes('n') ? s.y + s.h : h.includes('s') ? s.y : s.y + s.h / 2;
      const aw = rotatePt(ax, ay, cN.x, cN.y, o.rot);
      s.x += drag.anchorW.x - aw.x;
      s.y += drag.anchorW.y - aw.y;
    }
    render(); refreshXYWH(); return;
  }
});
cv.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null; guides = [];
  cv.classList.remove('panning');
  if (d.mode === 'pan') { render(); return; }
  if (d.mode === 'marquee') {
    const x = Math.min(d.sx, d.cx ?? d.sx), y = Math.min(d.sy, d.cy ?? d.sy);
    const w = Math.abs((d.cx ?? d.sx) - d.sx), h = Math.abs((d.cy ?? d.sy) - d.sy);
    if (w > 2 || h > 2) {
      const ids = new Set(e.shiftKey ? sel : []);
      for (const s of state.shapes) {
        const b = aabbOf(s);
        if (b.x < x + w && b.x + b.w > x && b.y < y + h && b.y + b.h > y)
          expandGroup(s.id).forEach(i => ids.add(i));
      }
      sel = ids;
    }
    render(); renderProps(); return;
  }
  if (d.mode === 'new') {
    if (d.s.w < 3 && d.s.h < 3) { /* anuluj degenerat */
      state.shapes = state.shapes.filter(a => a !== d.s);
      undoStack.pop(); sel.clear();
    } else setTool('select');
    render(); renderProps(); autosave(); return;
  }
  if (d.mode === 'newline') {
    if (Math.hypot(d.s.x2 - d.s.x1, d.s.y2 - d.s.y1) < 3) {
      state.shapes = state.shapes.filter(a => a !== d.s);
      undoStack.pop(); sel.clear();
    } else setTool('select');
    render(); renderProps(); autosave(); return;
  }
  if (d.mode === 'move' && !d.moved) {
    undoStack.pop(); /* klik bez ruchu */
    /* dwuklik wykrywany po czasie — niezależny od DOM (Edge gubi natywny dblclick) */
    if (sel.size === 1) maybeClickEdit([...sel][0]);
  }
  render(); renderProps(); autosave();
});
/* awaryjne zakończenie dragu, gdy pointerup zaginie (Edge: „samo się przesuwa") */
function abortDrag() {
  if (!drag) return;
  const wasNew = drag.mode === 'new' || drag.mode === 'newline';
  const s = drag.s;
  drag = null; guides = []; cv.classList.remove('panning');
  if (wasNew && s && ((s.w < 3 && s.h < 3) || (s.type === 'line' && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3))) {
    state.shapes = state.shapes.filter(a => a !== s); undoStack.pop(); sel.clear();
  }
  render(); renderProps(); autosave();
}
cv.addEventListener('pointercancel', abortDrag);
cv.addEventListener('lostpointercapture', () => { if (drag && drag.mode !== 'pan') abortDrag(); });
window.addEventListener('blur', abortDrag);
/* zoom wokół środka płótna (przyciski +/- i klawisze) */
function zoomAtCenter(k) {
  const r = cv.getBoundingClientRect();
  const mx = r.width / 2, my = r.height / 2;
  const z2 = clamp(view.z * k, 0.08, 12);
  view.x = mx - (mx - view.x) * (z2 / view.z);
  view.y = my - (my - view.y) * (z2 / view.z);
  view.z = z2; render();
}
/* zoom kółkiem — wokół kursora */
cwrap.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  /* tryb MX Master — mniejszy krok zoomu (kółko przewija zbyt szybko) */
  let step = 1.12;
  if (settings.mxMaster) step = Math.pow(1.12, 1 / Math.max(1, settings.zoomDiv));
  const k = e.deltaY < 0 ? step : 1 / step;
  const z2 = clamp(view.z * k, 0.08, 12);
  view.x = mx - (mx - view.x) * (z2 / view.z);
  view.y = my - (my - view.y) * (z2 / view.z);
  view.z = z2; render();
}, { passive: false });

/* =====================================================================
   EDYCJA TEKSTU (2x klik)
   ===================================================================== */
let editShape = null;
let lastClick = { id: null, t: 0 };
const isTextShapeType = t => ['rect', 'ellipse', 'text', 'poly', 'roundRect'].includes(t);
/* drugi klik na tym samym kształcie w <400ms = edycja tekstu (działa też w Edge) */
function maybeClickEdit(id) {
  const now = (window.performance && performance.now) ? performance.now() : Date.now();
  const s = state.shapes.find(a => a.id === id);
  if (lastClick.id === id && now - lastClick.t < 400 && s && isTextShapeType(s.type) && !isTextLocked(s)) {
    lastClick = { id: null, t: 0 };
    setSelection([id]); startEdit(s);
    return;
  }
  lastClick = { id, t: now };
}
cv.addEventListener('dblclick', e => {
  if (editShape) return;
  const el = e.target.closest('[data-id]');
  let s = el ? state.shapes.find(a => a.id === el.dataset.id) : null;
  /* Fallback: render() in pointerdown can detach DOM nodes before dblclick fires.
     In that case, look for a selected shape that supports text editing. */
  if (!s) {
    for (const id of sel) {
      const c = state.shapes.find(a => a.id === id);
      if (c && isTextShapeType(c.type)) { s = c; break; }
    }
  }
  if (s && isTextShapeType(s.type) && !isTextLocked(s)) {
    setSelection([s.id]);
    startEdit(s);
  }
});
function startEdit(s) {
  editShape = s;
  pushUndo();
  const b = bboxOf(s);
  const z = view.z;
  const left = view.x + b.x * z, top = view.y + b.y * z;
  txtEd.style.display = 'block';
  txtEd.style.left = left + 'px';
  txtEd.style.top = top + 'px';
  txtEd.style.width = Math.max(90, b.w * z) + 'px';
  txtEd.style.height = Math.max(30, b.h * z) + 'px';
  txtEd.style.fontSize = (s.fs * z) + 'px';
  txtEd.style.fontWeight = s.bold ? 'bold' : 'normal';
  txtEd.style.fontStyle = s.italic ? 'italic' : 'normal';
  txtEd.style.fontFamily = (s.font || 'Calibri') + ',Arial,sans-serif';
  txtEd.style.textAlign = s.type === 'text' ? 'left' : 'center';
  txtEd.value = s.text || '';
  txtEd.focus(); txtEd.select();
}
function commitEdit() {
  if (!editShape) return;
  editShape.text = txtEd.value;
  txtEd.style.display = 'none';
  editShape = null;
  render(); autosave();
}
txtEd.addEventListener('blur', commitEdit);
txtEd.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) { e.preventDefault(); commitEdit(); }
});

/* =====================================================================
   PANEL WŁAŚCIWOŚCI
   ===================================================================== */
