"use strict";
const DASH_OPTS = [['solid', 'ciągła'], ['dash', 'kreskowa'], ['longdash', 'długa kreska'],
  ['dot', 'kropkowa'], ['dashdot', 'kreska-kropka']];
function refreshXYWH() {
  const ss = selShapes(); if (ss.length !== 1) return;
  const s = ss[0];
  const set = (id, v) => { const el = $('#' + id); if (el && document.activeElement !== el) el.value = Math.round(v * 10) / 10; };
  if (s.type === 'line') { set('pX1', s.x1); set('pY1', s.y1); set('pX2', s.x2); set('pY2', s.y2); }
  else { set('pX', s.x); set('pY', s.y); if (s.w !== undefined) { set('pW', s.w); set('pH', s.h); } }
}
function refreshRot() {
  const ss = selShapes(); if (ss.length !== 1) return;
  const el = $('#pRot'); if (el && document.activeElement !== el) el.value = Math.round((ss[0].rot || 0) * 10) / 10;
}
function applyAll(fn) { pushUndo(); selShapes().forEach(fn); render(); autosave(); }
/* zastosuj do kształtów, które nie mają danej blokady (pred = test blokady) */
function applyFiltered(pred, fn) {
  const u = selShapes().filter(s => !pred(s));
  if (!u.length) return lockToast();
  pushUndo(); u.forEach(fn); render(); autosave();
}
const applyMoveAll = fn => applyFiltered(isMoveLocked, fn);   /* pozycja */
const applySizeAll = fn => applyFiltered(isSizeLocked, fn);   /* rozmiar / obrót / geometria */
const applyStyleAll = fn => applyFiltered(isStyleLocked, fn); /* kolory / obrys / czcionka */
const applyUnlockedAll = applyMoveAll;                        /* zgodność wstecz */
function renderProps() {
  const el = $('#tab-props');
  const ss = selShapes();
  if (!ss.length) {
    el.innerHTML = `<div class="empty">${t('props.none')}<br><br>${t('props.noneHint')}</div>`;
    return;
  }
  const s = ss[0];
  const one = ss.length === 1;
  const types = new Set(ss.map(a => a.type));
  const hasStroke = [...types].some(t => t !== 'text' && t !== 'image');
  const hasFill = ['rect', 'ellipse', 'poly', 'roundRect'].some(t => types.has(t));
  const hasText = ['rect', 'ellipse', 'text', 'poly', 'roundRect'].some(t => types.has(t));
  const hasLine = types.has('line');
  let h = `<div class="grp"><h4>${t('props.selected')}: ${ss.length}</h4></div>`;
  const allLocked = ss.every(a => isMoveLocked(a) && isSizeLocked(a) && isStyleLocked(a) && isTextLocked(a));
  h += `<div class="grp"><h4>${t('props.lockGrp')}</h4>
    <div class="row"><label style="min-width:0"><input type="checkbox" id="pLockAll" ${allLocked ? 'checked' : ''}> <b>${t('lock.all')}</b></label></div>
    <div class="row"><label style="min-width:0"><input type="checkbox" id="pLockMove" ${ss.every(isMoveLocked) ? 'checked' : ''}> ${t('lock.move')}</label>
      <label style="min-width:0"><input type="checkbox" id="pLockSize" ${ss.every(isSizeLocked) ? 'checked' : ''}> ${t('lock.size')}</label></div>
    <div class="row"><label style="min-width:0"><input type="checkbox" id="pLockStyle" ${ss.every(isStyleLocked) ? 'checked' : ''}> ${t('lock.style')}</label>
      <label style="min-width:0"><input type="checkbox" id="pLockText" ${ss.every(isTextLocked) ? 'checked' : ''}> ${t('lock.text')}</label></div></div>`;

  if (one && s.type !== 'line') {
    h += `<div class="grp"><h4>${t('props.posSize')}</h4>
      <div class="row"><label>X / Y</label><input class="in" type="number" id="pX" step="1"><input class="in" type="number" id="pY" step="1"></div>`;
    if (s.w !== undefined)
      h += `<div class="row"><label>${t('props.size')}</label><input class="in" type="number" id="pW" step="1"><input class="in" type="number" id="pH" step="1"></div>`;
    h += `<div class="row"><label>${t('props.rotDeg')}</label><input class="in" type="number" id="pRot" step="1" value="${Math.round((s.rot || 0) * 10) / 10}">
      <label style="min-width:0"><input type="checkbox" id="pRotStep" ${rotStepOn ? 'checked' : ''}> ${t('props.rotStep', { n: ROT_STEP })}</label></div>`;
    h += `<div class="row"><label>${t('props.flip')}</label>
      <button class="btn" id="pFlipH" title="${t('props.flipH')}">↔</button>
      <button class="btn" id="pFlipV" title="${t('props.flipV')}">↕</button></div>`;
    h += `</div>`;
  }
  if (one && s.type === 'image') {
    const cropping = cropMode === s.id;
    h += `<div class="grp"><h4>${t('props.crop')}</h4>
      <div class="row">${cropping
        ? `<button class="btn primary" id="pCropDone">${t('props.cropDone')}</button>`
        : `<button class="btn" id="pCropStart">${t('props.cropStart')}</button>`}
        <button class="btn" id="pCropReset">${t('props.cropReset')}</button></div>
      ${cropping ? `<div class="hint" style="margin-top:4px">${t('props.cropHint')}</div>` : ''}</div>`;
  }
  if (one && s.type === 'line') {
    h += `<div class="grp"><h4>${t('props.linePts')}</h4>
      <div class="row"><label>P1</label><input class="in" type="number" id="pX1"><input class="in" type="number" id="pY1"></div>
      <div class="row"><label>P2</label><input class="in" type="number" id="pX2"><input class="in" type="number" id="pY2"></div></div>`;
  }
  if (hasStroke) {
    h += `<div class="grp"><h4>${t('props.stroke')}</h4>
      <div class="row"><label>${t('props.color')}</label><input class="in" type="color" id="pStroke" value="${s.stroke || '#111827'}">
        <label style="min-width:0"><input type="checkbox" id="pNoStroke" ${s.noStroke ? 'checked' : ''}> ${t('props.none2')}</label></div>
      <div class="row"><label>${t('props.width')}</label><input class="in" type="number" id="pSw" min="0.5" step="0.5" value="${s.sw ?? 2}"></div>
      <div class="row"><label>${t('props.style')}</label><select class="in" id="pDash">` +
      DASH_OPTS.map(([v, n]) => `<option value="${v}" ${s.dash === v ? 'selected' : ''}>${n}</option>`).join('') +
      `</select></div></div>`;
  }
  if (hasFill) {
    h += `<div class="grp"><h4>${t('props.fill')}</h4>
      <div class="row"><label>${t('props.color')}</label><input class="in" type="color" id="pFill" value="${s.fill || '#ffffff'}">
        <label style="min-width:0"><input type="checkbox" id="pNoFill" ${s.noFill ? 'checked' : ''}> ${t('props.none2')}</label></div></div>`;
  }
  if (hasText) {
    h += `<div class="grp"><h4>${t('props.text')} <span style="text-transform:none;font-weight:400">${t('props.textHint')}</span></h4>
      <div class="row"><label>${t('props.font')}</label><select class="in" id="pFont" style="width:130px">
        ${['Calibri','Arial','Helvetica','Times New Roman','Georgia','Verdana','Courier New','Trebuchet MS','Impact'].map(f => `<option value="${f}" ${(s.font || 'Calibri') === f ? 'selected' : ''}>${f}</option>`).join('')}
      </select></div>
      <div class="row"><label>${t('props.size')}</label><input class="in" type="number" id="pFs" min="4" value="${s.fs ?? 14}">
        <input class="in" type="color" id="pTc" value="${s.tc || '#111827'}">
        <label style="min-width:0"><input type="checkbox" id="pBold" ${s.bold ? 'checked' : ''}> ${t('props.bold')}</label>
        <label style="min-width:0"><input type="checkbox" id="pItalic" ${s.italic ? 'checked' : ''}> ${t('props.italic')}</label></div>`;
    if (one && isTextShapeType(s.type)) {
      h += `<div class="row"><label style="align-self:flex-start;padding-top:4px">${t('props.content')}</label>
        <textarea class="in wide" id="pText" rows="4" style="width:100%;min-height:78px;resize:vertical;font-family:${escXml(s.font || 'Calibri')},Arial,sans-serif">${escXml(s.text || '')}</textarea></div>`;
    }
    h += `</div>`;
  }
  if (hasLine) {
    h += `<div class="grp"><h4>${t('props.arrows')}</h4>
      <div class="row"><label style="min-width:0"><input type="checkbox" id="pAs" ${s.as ? 'checked' : ''}> ${t('props.start')}</label>
      <label style="min-width:0"><input type="checkbox" id="pAe" ${s.ae ? 'checked' : ''}> ${t('props.end')}</label></div></div>`;
  }
  /* wyrównanie */
  const I = (k, p) => `<button class="miniBtn" data-al="${k}" title="${p}"><svg viewBox="0 0 24 24">${ALICON[k]}</svg></button>`;
  h += `<div class="grp"><h4>${t('props.align')}</h4>
    <div class="row">${I('l', '')}${I('cx', '')}${I('r', '')}${I('t', '')}${I('cy', '')}${I('b', '')}</div>
    <div class="row">${I('dh', '')}${I('dv', '')}</div>
    <div class="row"><label>${t('props.gridGap')}</label><input class="in" type="number" id="matrixGap" min="0" step="1" value="${matrixGap}" style="width:52px"> px</div>
    <div class="row"><button class="btn" data-mx="fit">${t('props.matrixFit')}</button>
    <button class="btn" data-mx="keep">${t('props.matrix')}</button></div></div>`;
  /* kolejność */
  h += `<div class="grp"><h4>${t('props.order')}</h4><div class="row">
    <button class="btn" data-z="top">${t('props.top')}</button><button class="btn" data-z="up">${t('props.up')}</button>
    <button class="btn" data-z="down">${t('props.down')}</button><button class="btn" data-z="bot">${t('props.bot')}</button></div></div>`;
  /* grupy */
  const grouped = ss.some(a => a.g);
  h += `<div class="grp"><h4>${t('props.group')}</h4><div class="row">
    <button class="btn" id="pGroup" ${ss.length < 2 ? 'disabled' : ''}>${t('props.doGroup')}</button>
    <button class="btn" id="pUngroup" ${!grouped ? 'disabled' : ''}>${t('props.ungroup')}</button>
    <button class="btn" id="pToLib">${t('props.toLib')}</button></div>
    ${grouped ? `<div class="hint" style="margin-top:6px">${t('props.altHint')}</div>` : ''}</div>`;
  h += `<div class="grp"><div class="row">
    <button class="btn" id="pDup">${t('props.dup')}</button>
    <button class="btn" id="pDel" style="color:#ff7070">${t('props.del')}</button></div></div>`;
  el.innerHTML = h;
  refreshXYWH();

  /* zdarzenia panelu */
  const on = (id, ev, fn) => { const n = $('#' + id); if (n) n.addEventListener(ev, fn); };
  const num = id => parseFloat($('#' + id).value);
  /* blokady granularne */
  on('pLockAll', 'change', () => { const v = $('#pLockAll').checked; applyAll(a => { a.lockMove = a.lockSize = a.lockStyle = a.lockText = v; a.locked = false; }); renderProps(); });
  on('pLockMove', 'change', () => { applyAll(a => { materializeLock(a); a.lockMove = $('#pLockMove').checked; }); renderProps(); });
  on('pLockSize', 'change', () => { applyAll(a => { materializeLock(a); a.lockSize = $('#pLockSize').checked; }); renderProps(); });
  on('pLockStyle', 'change', () => { applyAll(a => { materializeLock(a); a.lockStyle = $('#pLockStyle').checked; }); renderProps(); });
  on('pLockText', 'change', () => { applyAll(a => { materializeLock(a); a.lockText = $('#pLockText').checked; }); renderProps(); });
  on('pX', 'change', () => applyMoveAll(a => { if (a.x !== undefined) a.x = num('pX'); }));
  on('pY', 'change', () => applyMoveAll(a => { if (a.y !== undefined) a.y = num('pY'); }));
  on('pW', 'change', () => applySizeAll(a => { if (a.w !== undefined) a.w = Math.max(1, num('pW')); }));
  on('pH', 'change', () => applySizeAll(a => { if (a.h !== undefined) a.h = Math.max(1, num('pH')); }));
  on('pRot', 'change', () => applySizeAll(a => { if (a.type !== 'line') a.rot = ((num('pRot') % 360) + 360) % 360; }));
  ['pX1', 'pY1', 'pX2', 'pY2'].forEach(id =>
    on(id, 'change', () => applySizeAll(a => { if (a.type === 'line') a[id[1].toLowerCase() + id[2]] = num(id); })));
  /* kolory: cofnij łapie CAŁĄ zmianę — pushUndo raz przy focusie, potem live bez undo (pomija zablok. wygląd) */
  /* kolory: TYLKO 'change' (raz, po zamknięciu okna koloru/pipety) — brak re-renderu
     w trakcie otwartego natywnego dialogu = brak zawieszki na Edge */
  const bindColor = (id, fn) => on(id, 'change', () => applyStyleAll(fn));
  bindColor('pStroke', a => { if (a.stroke !== undefined) { a.stroke = $('#pStroke').value; a.noStroke = false; } });
  on('pNoStroke', 'change', () => applyStyleAll(a => { if ('noStroke' in a || a.type === 'rect' || a.type === 'ellipse') a.noStroke = $('#pNoStroke').checked; }));
  on('pSw', 'change', () => applyStyleAll(a => { if (a.sw !== undefined) a.sw = Math.max(0.5, num('pSw')); }));
  on('pDash', 'change', () => applyStyleAll(a => { if (a.dash !== undefined) a.dash = $('#pDash').value; }));
  bindColor('pFill', a => { if (a.fill !== undefined) { a.fill = $('#pFill').value; a.noFill = false; } });
  on('pNoFill', 'change', () => applyStyleAll(a => { if (a.fill !== undefined) a.noFill = $('#pNoFill').checked; }));
  on('pFont', 'change', () => applyStyleAll(a => { if ('font' in a || a.fs !== undefined) a.font = $('#pFont').value; }));
  on('pFs', 'change', () => applyStyleAll(a => { if (a.fs !== undefined) a.fs = Math.max(4, num('pFs')); }));
  bindColor('pTc', a => { if (a.tc !== undefined) a.tc = $('#pTc').value; });
  on('pBold', 'change', () => applyStyleAll(a => { if ('fs' in a) a.bold = $('#pBold').checked; }));
  on('pItalic', 'change', () => applyStyleAll(a => { if ('fs' in a) a.italic = $('#pItalic').checked; }));
  on('pRotStep', 'change', () => { rotStepOn = $('#pRotStep').checked; });
  on('pFlipH', 'click', () => applySizeAll(a => { if (a.type !== 'line') a.flipH = !a.flipH; }));
  on('pFlipV', 'click', () => applySizeAll(a => { if (a.type !== 'line') a.flipV = !a.flipV; }));
  on('pCropStart', 'click', () => { if (isSizeLocked(s)) return lockToast(); cropMode = s.id; setTool('select'); render(); renderProps(); });
  on('pCropDone', 'click', () => { cropMode = null; render(); renderProps(); autosave(); });
  on('pCropReset', 'click', () => { applySizeAll(a => { if (a.type === 'image' && a.crop) { const F = fullRect(a); a.x = F.x; a.y = F.y; a.w = F.w; a.h = F.h; a.crop = null; } }); renderProps(); });
  on('pText', 'focus', () => pushUndo());
  on('pText', 'input', () => {
    const v = $('#pText').value;
    selShapes().forEach(a => { if (a.text !== undefined && !isTextLocked(a)) a.text = v; });
    render(); autosave();
  });
  on('pAs', 'change', () => applyStyleAll(a => { if (a.type === 'line') a.as = $('#pAs').checked; }));
  on('pAe', 'change', () => applyStyleAll(a => { if (a.type === 'line') a.ae = $('#pAe').checked; }));
  $$('#tab-props [data-al]').forEach(b => b.addEventListener('click', () => alignSel(b.dataset.al)));
  on('matrixGap', 'change', () => { matrixGap = Math.max(0, parseFloat($('#matrixGap').value) || 0); });
  $$('#tab-props [data-mx]').forEach(b => b.addEventListener('click', () => gridArrange(b.dataset.mx === 'fit')));
  $$('#tab-props [data-z]').forEach(b => b.addEventListener('click', () => zOrder(b.dataset.z)));
  on('pGroup', 'click', groupSel);
  on('pUngroup', 'click', ungroupSel);
  on('pToLib', 'click', saveToLib);
  on('pDup', 'click', duplicateSel);
  on('pDel', 'click', deleteSel);
}
const ALICON = {
  l: '<path d="M5 4v16M9 8h10M9 16h6"/>', r: '<path d="M19 4v16M5 8h10M9 16h6"/>',
  cx: '<path d="M12 4v16M7 8h10M9 16h6"/>', t: '<path d="M4 5h16M8 9v10M16 9v6"/>',
  b: '<path d="M4 19h16M8 5v10M16 9v6"/>', cy: '<path d="M4 12h16M8 7v10M16 9v6"/>',
  dh: '<path d="M4 4v16M20 4v16M9 12h6"/>', dv: '<path d="M4 4h16M4 20h16M12 9v6"/>'
};

/* ---------- wyrównanie / rozkład ---------- */
function moveShapeTo(s, nx, ny) {
  const b = aabbOf(s);
  const dx = nx - b.x, dy = ny - b.y;
  if (s.type === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else { s.x += dx; s.y += dy; }
}
function alignSel(kind) {
  const ss = selShapes();
  if (kind === 'dh' || kind === 'dv') return distribute(kind);
  if (ss.length < 2) return toast(t('t.min2'));
  if (hasMoveLock(ss)) return lockToast();
  pushUndo();
  const U = unionBBox(ss);
  for (const s of ss) {
    const b = aabbOf(s);
    if (kind === 'l') moveShapeTo(s, U.x, b.y);
    if (kind === 'r') moveShapeTo(s, U.x + U.w - b.w, b.y);
    if (kind === 'cx') moveShapeTo(s, U.x + (U.w - b.w) / 2, b.y);
    if (kind === 't') moveShapeTo(s, b.x, U.y);
    if (kind === 'b') moveShapeTo(s, b.x, U.y + U.h - b.h);
    if (kind === 'cy') moveShapeTo(s, b.x, U.y + (U.h - b.h) / 2);
  }
  render(); autosave();
}
function distribute(kind) {
  const ss = selShapes();
  if (ss.length < 3) return toast(t('t.min3'));
  if (hasMoveLock(ss)) return lockToast();
  pushUndo();
  const hor = kind === 'dh';
  const items = ss.map(s => ({ s, b: aabbOf(s) }))
    .sort((a, b) => hor ? a.b.x - b.b.x : a.b.y - b.b.y);
  const first = items[0].b, last = items[items.length - 1].b;
  const span = hor ? (last.x + last.w) - first.x : (last.y + last.h) - first.y;
  const sum = items.reduce((t, i) => t + (hor ? i.b.w : i.b.h), 0);
  const gap = (span - sum) / (items.length - 1);
  let pos = hor ? first.x : first.y;
  for (const it of items) {
    if (hor) { moveShapeTo(it.s, pos, it.b.y); pos += it.b.w + gap; }
    else { moveShapeTo(it.s, it.b.x, pos); pos += it.b.h + gap; }
  }
  render(); autosave();
}
/* ---------- macierz: ułóż zaznaczone kształty w tabelę ---------- */
function gridArrange(resize) {
  const ss = selShapes().filter(s => s.type !== 'line');
  if (ss.length < 2) return toast(t('t.min2mx'));
  if (hasMoveLock(ss)) return lockToast();
  pushUndo();
  const items = ss.map(s => ({ s, b: aabbOf(s) }));
  const hs = items.map(i => i.b.h).sort((a, b) => a - b);
  const medH = hs[hs.length >> 1] || 20;
  /* wiersze wg środka Y (klaster), kolumny wg X */
  items.sort((a, b) => (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2));
  const rows = [];
  for (const it of items) {
    const cy = it.b.y + it.b.h / 2;
    const row = rows[rows.length - 1];
    if (!row || cy - row.cy > medH * 0.7) rows.push({ cy, items: [it] });
    else row.items.push(it);
  }
  rows.forEach(r => r.items.sort((a, b) => a.b.x - b.b.x));
  const U = unionBBox(ss);
  const gap = matrixGap;
  if (resize) {
    /* Per-row: uniform height = max height in that row (obrócone pomijamy) */
    for (const row of rows) {
      const rowH = Math.max(...row.items.map(i => i.b.h));
      for (const it of row.items)
        if (it.s.h !== undefined && !it.s.rot) { it.s.h = rowH; it.b = aabbOf(it.s); }
    }
    /* Per-column: uniform width = max width in that column */
    const numColumns = Math.max(...rows.map(r => r.items.length));
    for (let j = 0; j < numColumns; j++) {
      const cw = Math.max(...rows.map(r => r.items[j] ? r.items[j].b.w : 0));
      for (const row of rows)
        if (row.items[j] && row.items[j].s.w !== undefined && !row.items[j].s.rot) {
          row.items[j].s.w = cw; row.items[j].b = aabbOf(row.items[j].s);
        }
    }
  }
  const nCols = Math.max(...rows.map(r => r.items.length));
  const colW = [];
  for (let j = 0; j < nCols; j++)
    colW[j] = Math.max(...rows.map(r => r.items[j] ? r.items[j].b.w : 0));
  let y = U.y;
  for (const r of rows) {
    const rh = Math.max(...r.items.map(i => i.b.h));
    let x = U.x;
    r.items.forEach((it, j) => {
      moveShapeTo(it.s, x, y + (rh - it.b.h) / 2);
      x += colW[j] + gap;
    });
    y += rh + gap;
  }
  render(); renderProps(); autosave();
}
/* ---------- kolejność (z-order) ---------- */
function zOrder(kind) {
  pushUndo();
  const selected = state.shapes.filter(s => sel.has(s.id));
  const rest = state.shapes.filter(s => !sel.has(s.id));
  if (kind === 'top') state.shapes = [...rest, ...selected];
  else if (kind === 'bot') state.shapes = [...selected, ...rest];
  else {
    const arr = state.shapes;
    const idxs = arr.map((s, i) => sel.has(s.id) ? i : -1).filter(i => i >= 0);
    if (kind === 'up') {
      for (let k = idxs.length - 1; k >= 0; k--) {
        const i = idxs[k];
        if (i < arr.length - 1 && !sel.has(arr[i + 1].id))
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    } else {
      for (const i of idxs)
        if (i > 0 && !sel.has(arr[i - 1].id))
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
  }
  render(); autosave();
}
