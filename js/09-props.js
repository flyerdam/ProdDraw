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
/* zastosuj do kształtów, które nie mają danej blokady (pred = test blokady).
   Działa na PODANEJ (zamrożonej) liście kształtów, NIE na bieżącym (live)
   zaznaczeniu — patrz komentarz przy "ss" w renderProps(): pole formularza
   commitowane na 'change' (blur) potrafi odpalić się PO tym, jak klik na
   inny kształt na kanwie już przestawił zaznaczenie — bez zamrożenia
   własnego zestawu kształtów z TEGO renderu zmiana trafiłaby w nowo
   kliknięty kształt zamiast w ten, który był edytowany. */
function applyOnShapes(shapes, pred, fn) {
  const u = shapes.filter(s => !pred(s));
  if (!u.length) return lockToast();
  pushUndo(); u.forEach(fn); render(); autosave();
}
/* ---------- warstwy (zakładka "Warstwy") ----------
   Każda warstwa to kontener kształtów z własną widocznością/blokadą
   (state.layers, patrz js/01-state.js). Sekcje warstw od wierzchu (ostatnia
   w state.layers) do spodu; w środku każdej — jej kształty, też od wierzchu
   do spodu. Klik na kształt zaznacza (grupę w całości, jak klik na kanwie).
   Przeciąganie uchwytem: w obrębie warstwy zmienia kolejność, upuszczone na
   INNĄ warstwę — przenosi tam kształt. */
const OBJ_TYPE_LABEL = { rect: 'obj.tRect', roundRect: 'obj.tRoundRect', ellipse: 'obj.tEllipse',
  poly: 'obj.tPoly', line: 'obj.tLine', text: 'obj.tText', image: 'obj.tImage' };
const OBJ_EYE_ON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const OBJ_EYE_OFF = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 10.6a2.8 2.8 0 0 0 3.9 3.9M6.6 6.7C4 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.4-1M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-2.3 3.3"/></svg>';
const OBJ_LOCK_ON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const OBJ_LOCK_OFF = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 7.4-2"/></svg>';
function objEsc(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function objRowLabel(s) {
  if (s.name) return s.name;
  const txt = (s.text || '').replace(/\n+/g, ' ').trim();
  if (txt) return txt.length > 34 ? txt.slice(0, 34) + '…' : txt;
  return t(OBJ_TYPE_LABEL[s.type] || 'obj.tRect');
}
function newLayerId() { return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function objRowHTML(s) {
  const swatch = s.type === 'line' ? (s.stroke || '#000') : (s.noFill ? 'transparent' : (s.fill || '#fff'));
  const locked = isMoveLocked(s) || isSizeLocked(s) || isStyleLocked(s) || isTextLocked(s);
  return `<div class="objRow${sel.has(s.id) ? ' on' : ''}${s.hidden ? ' objHidden' : ''}" data-id="${s.id}">
    <span class="objHandle" title="${t('obj.drag')}">&#8942;&#8942;</span>
    <button class="objEye" data-eye="${s.id}" title="${t('obj.toggleVis')}">${s.hidden ? OBJ_EYE_OFF : OBJ_EYE_ON}</button>
    <span class="objSwatch" style="background:${swatch}"></span>
    <span class="objLbl" data-lbl="${s.id}">${objEsc(objRowLabel(s))}</span>
    ${s.g ? `<span class="objTag">${t('obj.group')}</span>` : ''}
    ${locked ? `<span class="objLockIcon" title="${t('obj.locked')}">&#128274;</span>` : ''}
  </div>`;
}
function renderLayers() {
  const el = $('#tab-objects'); if (!el) return;
  ensureLayers();
  const byLayer = new Map(state.layers.map(l => [l.id, []]));
  for (const s of state.shapes) (byLayer.get(s.layer) || byLayer.get(state.layers[0].id)).push(s);
  const sections = [...state.layers].reverse().map(l => {
    const shapes = (byLayer.get(l.id) || []).slice().reverse();   // wierzch warstwy pierwszy
    return `<div class="layerSection" data-layer="${l.id}">
      <div class="layerHead">
        <button class="objEye" data-layer-eye="${l.id}" title="${t('layers.visToggle')}">${l.visible === false ? OBJ_EYE_OFF : OBJ_EYE_ON}</button>
        <button class="objEye" data-layer-lock="${l.id}" title="${t('layers.lockToggle')}">${l.locked ? OBJ_LOCK_ON : OBJ_LOCK_OFF}</button>
        <span class="layerName" data-layer-name="${l.id}" title="${t('layers.rename')}">${objEsc(l.name)}</span>
        <button class="miniBtn layerArrow" data-layer-up="${l.id}" title="${t('layers.moveUp')}">&#9650;</button>
        <button class="miniBtn layerArrow" data-layer-down="${l.id}" title="${t('layers.moveDown')}">&#9660;</button>
        <button class="miniBtn" data-layer-del="${l.id}" title="${t('layers.delete')}">&times;</button>
      </div>
      <div class="layerBody" data-layer-body="${l.id}">${shapes.length ? shapes.map(objRowHTML).join('') : `<div class="layerEmpty">${t('layers.empty')}</div>`}</div>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="row" style="margin-bottom:8px"><button class="btn" id="layerAddBtn">${t('layers.add')}</button></div>` + sections;
  $$('#tab-objects .objRow').forEach(r => {
    r.addEventListener('click', e => { if (!e.target.closest('[data-eye]')) setSelection(expandGroup(r.dataset.id)); });
    r.addEventListener('dblclick', e => { if (!e.target.closest('[data-eye]')) objStartRename(r.dataset.id); });
  });
  $$('#tab-objects [data-eye]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const shp = state.shapes.find(x => x.id === b.dataset.eye);
    if (!shp) return;
    pushUndo(); shp.hidden = !shp.hidden; render(); autosave(); renderLayers();
  }));
  $('#layerAddBtn').addEventListener('click', layerAdd);
  $$('#tab-objects [data-layer-eye]').forEach(b => b.addEventListener('click', () => layerToggleVis(b.dataset.layerEye)));
  $$('#tab-objects [data-layer-lock]').forEach(b => b.addEventListener('click', () => layerToggleLock(b.dataset.layerLock)));
  $$('#tab-objects [data-layer-up]').forEach(b => b.addEventListener('click', () => layerMove(b.dataset.layerUp, 1)));
  $$('#tab-objects [data-layer-down]').forEach(b => b.addEventListener('click', () => layerMove(b.dataset.layerDown, -1)));
  $$('#tab-objects [data-layer-del]').forEach(b => b.addEventListener('click', () => layerDelete(b.dataset.layerDel)));
  $$('#tab-objects [data-layer-name]').forEach(n => n.addEventListener('dblclick', () => layerStartRename(n.dataset.layerName)));
  objInitDrag();
}
/* zmiana nazwy kształtu wprost na liście (2×klik etykiety) */
function objStartRename(id) {
  const shp = state.shapes.find(s => s.id === id);
  const lbl = document.querySelector('#tab-objects [data-lbl="' + id + '"]');
  if (!shp || !lbl) return;
  const cur = shp.name || '';
  const inp = document.createElement('input');
  inp.className = 'objRenameInput'; inp.value = cur;
  lbl.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => { pushUndo(); shp.name = inp.value.trim() || undefined; autosave(); renderLayers(); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); inp.value = cur; inp.blur(); }
  });
}
/* ---------- CRUD warstw ---------- */
function layerAdd() {
  pushUndo();
  state.layers.push({ id: newLayerId(), name: t('layers.new', { n: state.layers.length + 1 }), visible: true, locked: false });
  autosave(); renderLayers();
}
function layerDelete(id) {
  if (state.layers.length <= 1) return toast(t('layers.cantDeleteLast'));
  const l = state.layers.find(x => x.id === id); if (!l) return;
  if (!confirm(t('layers.deleteConfirm', { n: l.name }))) return;
  pushUndo();
  const idx = state.layers.findIndex(x => x.id === id);
  state.layers.splice(idx, 1);
  const fallback = state.layers[Math.max(0, idx - 1)].id;
  state.shapes.forEach(s => { if (s.layer === id) s.layer = fallback; });
  render(); autosave(); renderLayers();
}
function layerMove(id, dir) {
  const idx = state.layers.findIndex(x => x.id === id);
  const j = idx + dir;
  if (j < 0 || j >= state.layers.length) return;
  pushUndo();
  [state.layers[idx], state.layers[j]] = [state.layers[j], state.layers[idx]];
  render(); autosave(); renderLayers();
}
function layerToggleVis(id) {
  const l = state.layers.find(x => x.id === id); if (!l) return;
  pushUndo(); l.visible = l.visible === false ? true : false; render(); autosave(); renderLayers();
}
function layerToggleLock(id) {
  const l = state.layers.find(x => x.id === id); if (!l) return;
  pushUndo(); l.locked = !l.locked; autosave(); renderLayers();
}
function layerStartRename(id) {
  const l = state.layers.find(x => x.id === id);
  const lbl = document.querySelector('#tab-objects [data-layer-name="' + id + '"]');
  if (!l || !lbl) return;
  const cur = l.name;
  const inp = document.createElement('input');
  inp.className = 'objRenameInput'; inp.value = cur;
  lbl.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => { pushUndo(); l.name = inp.value.trim() || cur; autosave(); renderLayers(); };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); inp.value = cur; inp.blur(); }
  });
}
/* przeciągnij za uchwyt: w obrębie tej samej warstwy zmienia kolejność,
   upuszczone nad INNĄ warstwą — przenosi tam kształt (na jej wierzch) */
function objInitDrag() {
  $$('#tab-objects .objHandle').forEach(handle => {
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const row = handle.closest('.objRow');
      row.classList.add('objDragging');
      const onMove = me => {
        const bodies = $$('#tab-objects .layerBody');
        const body = bodies.find(b => { const r = b.getBoundingClientRect(); return me.clientY >= r.top - 6 && me.clientY <= r.bottom + 6; });
        if (!body) return;
        const after = [...body.children].filter(c => c !== row).find(r2 => {
          const rect = r2.getBoundingClientRect();
          return me.clientY < rect.top + rect.height / 2;
        });
        if (after) body.insertBefore(row, after); else body.appendChild(row);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        row.classList.remove('objDragging');
        objCommitReorder();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}
function objCommitReorder() {
  const byId = new Map(state.shapes.map(s => [s.id, s]));
  const assignments = [];
  const sections = [...document.querySelectorAll('#tab-objects .layerSection')].reverse();   // z powrotem do kolejności state.layers (spód -> wierzch)
  for (const sec of sections) {
    const layerId = sec.dataset.layer;
    const body = sec.querySelector('.layerBody');
    const rowsInLayer = [...body.querySelectorAll(':scope > .objRow')].reverse();   // z powrotem: wierzch warstwy na końcu
    for (const r of rowsInLayer) { const shp = byId.get(r.dataset.id); if (shp) assignments.push({ shp, layerId }); }
  }
  if (assignments.length !== state.shapes.length) return renderLayers();   // coś nie pasuje — bez ryzyka, po prostu odśwież
  pushUndo();
  assignments.forEach(({ shp, layerId }) => { shp.layer = layerId; });
  state.shapes = assignments.map(a => a.shp);
  render(); autosave(); renderLayers();
}
function renderProps() {
  if (typeof renderLayers === 'function') renderLayers();
  const el = $('#tab-props');
  const ss = selShapes();
  if (!ss.length) {
    el.innerHTML = `<div class="empty">${t('props.none')}<br><br>${helpLink('draw')}</div>`;
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
  /* obramowanie obrazu (wszystkie zaznaczone to obrazy) — respektuje kadrowanie */
  if (types.size === 1 && types.has('image')) {
    const hasB = !s.noStroke && s.stroke;
    h += `<div class="grp"><h4>${t('props.imgBorder')}</h4>
      <div class="row"><label style="min-width:0"><input type="checkbox" id="pImgBorder" ${hasB ? 'checked' : ''}> ${t('props.imgBorderOn')}</label></div>
      <div class="row"><label>${t('props.color')}</label><input class="in" type="color" id="pImgStroke" value="${s.stroke || '#c00000'}"></div>
      <div class="row"><label>${t('props.width')}</label><input class="in" type="number" id="pImgSw" min="0.5" step="0.5" value="${s.sw ?? 3}"></div>
      <div class="row"><label>${t('props.style')}</label><select class="in" id="pImgDash">` +
      DASH_OPTS.map(([v, n]) => `<option value="${v}" ${s.dash === v ? 'selected' : ''}>${n}</option>`).join('') +
      `</select></div></div>`;
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
    h += `<div class="grp"><h4>${t('props.text')} <span style="text-transform:none;font-weight:400">${helpLink('text')}</span></h4>
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
    ${grouped ? `<div class="hint" style="margin-top:6px">${helpLink('groups')}</div>` : ''}</div>`;
  h += `<div class="grp"><div class="row">
    <button class="btn" id="pDup">${t('props.dup')}</button>
    <button class="btn" id="pDel" style="color:#ff7070">${t('props.del')}</button></div></div>`;
  el.innerHTML = h;
  refreshXYWH();

  /* zdarzenia panelu */
  const on = (id, ev, fn) => { const n = $('#' + id); if (n) n.addEventListener(ev, fn); };
  /* WAŻNE: wartości i cele bierzemy z ZAMROŻONEGO stanu tego renderu (e.target,
     ss/s), NIE z live $('#id')/selShapes() — pole commitowane na 'change'
     potrafi odpalić się już PO tym, jak klik na inny kształt na kanwie
     przestawił zaznaczenie (a bywa, że nawet PODCZAS obsługi tego kliku: samo
     ustawienie innerHTML w renderProps() przy przełączaniu zaznaczenia
     natywnie commituje jeszcze skupione, zmienione pole). Bez zamrożenia
     zmiana trafiała w nowo klikany kształt zamiast w ten edytowany. */
  const numE = e => parseFloat(e.target.value);
  const applyStyleNow = fn => applyOnShapes(ss, isStyleLocked, fn);
  const applyMoveNow = fn => applyOnShapes(ss, isMoveLocked, fn);
  const applySizeNow = fn => applyOnShapes(ss, isSizeLocked, fn);
  /* blokady granularne */
  on('pLockAll', 'change', e => { const v = e.target.checked; pushUndo(); ss.forEach(a => { a.lockMove = a.lockSize = a.lockStyle = a.lockText = v; a.locked = false; }); render(); autosave(); renderProps(); });
  on('pLockMove', 'change', e => { const v = e.target.checked; pushUndo(); ss.forEach(a => { materializeLock(a); a.lockMove = v; }); render(); autosave(); renderProps(); });
  on('pLockSize', 'change', e => { const v = e.target.checked; pushUndo(); ss.forEach(a => { materializeLock(a); a.lockSize = v; }); render(); autosave(); renderProps(); });
  on('pLockStyle', 'change', e => { const v = e.target.checked; pushUndo(); ss.forEach(a => { materializeLock(a); a.lockStyle = v; }); render(); autosave(); renderProps(); });
  on('pLockText', 'change', e => { const v = e.target.checked; pushUndo(); ss.forEach(a => { materializeLock(a); a.lockText = v; }); render(); autosave(); renderProps(); });
  on('pX', 'change', e => { const v = numE(e); applyMoveNow(a => { if (a.x !== undefined) a.x = v; }); });
  on('pY', 'change', e => { const v = numE(e); applyMoveNow(a => { if (a.y !== undefined) a.y = v; }); });
  on('pW', 'change', e => { const v = Math.max(1, numE(e)); applySizeNow(a => { if (a.w !== undefined) a.w = v; }); });
  on('pH', 'change', e => { const v = Math.max(1, numE(e)); applySizeNow(a => { if (a.h !== undefined) a.h = v; }); });
  on('pRot', 'change', e => { const v = ((numE(e) % 360) + 360) % 360; applySizeNow(a => { if (a.type !== 'line') a.rot = v; }); });
  ['pX1', 'pY1', 'pX2', 'pY2'].forEach(id =>
    on(id, 'change', e => { const v = numE(e), key = id[1].toLowerCase() + id[2]; applySizeNow(a => { if (a.type === 'line') a[key] = v; }); }));
  /* kolory: cofnij łapie CAŁĄ zmianę — pushUndo raz przy focusie, potem live bez undo (pomija zablok. wygląd) */
  /* kolory: TYLKO 'change' (raz, po zamknięciu okna koloru/pipety) — brak re-renderu
     w trakcie otwartego natywnego dialogu = brak zawieszki na Edge */
  const bindColor = (id, fn) => on(id, 'change', e => { const v = e.target.value; applyStyleNow(a => fn(a, v)); });
  bindColor('pStroke', (a, v) => { if (a.stroke !== undefined) { a.stroke = v; a.noStroke = false; } });
  on('pNoStroke', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if ('noStroke' in a || a.type === 'rect' || a.type === 'ellipse') a.noStroke = v; }); });
  on('pSw', 'change', e => { const v = Math.max(0.5, numE(e)); applyStyleNow(a => { if (a.sw !== undefined) a.sw = v; }); });
  on('pDash', 'change', e => { const v = e.target.value; applyStyleNow(a => { if (a.dash !== undefined) a.dash = v; }); });
  bindColor('pFill', (a, v) => { if (a.fill !== undefined) { a.fill = v; a.noFill = false; } });
  on('pNoFill', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if (a.fill !== undefined) a.noFill = v; }); });
  on('pFont', 'change', e => { const v = e.target.value; applyStyleNow(a => { if ('font' in a || a.fs !== undefined) a.font = v; }); });
  on('pFs', 'change', e => { const v = Math.max(4, numE(e)); applyStyleNow(a => { if (a.fs !== undefined) a.fs = v; }); });
  bindColor('pTc', (a, v) => { if (a.tc !== undefined) a.tc = v; });
  on('pBold', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if ('fs' in a) a.bold = v; }); });
  on('pItalic', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if ('fs' in a) a.italic = v; }); });
  on('pRotStep', 'change', e => { rotStepOn = e.target.checked; });
  on('pFlipH', 'click', () => applySizeNow(a => { if (a.type !== 'line') a.flipH = !a.flipH; }));
  on('pFlipV', 'click', () => applySizeNow(a => { if (a.type !== 'line') a.flipV = !a.flipV; }));
  on('pCropStart', 'click', () => { if (isSizeLocked(s)) return lockToast(); cropMode = s.id; setTool('select'); render(); renderProps(); });
  on('pCropDone', 'click', () => { cropMode = null; render(); renderProps(); autosave(); });
  on('pCropReset', 'click', () => applySizeNow(a => { if (a.type === 'image' && a.crop) { const F = fullRect(a); a.x = F.x; a.y = F.y; a.w = F.w; a.h = F.h; a.crop = null; } }));
  on('pImgBorder', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if (a.type === 'image') { a.noStroke = !v; if (!a.noStroke) { if (!a.stroke) a.stroke = '#c00000'; if (a.sw == null) a.sw = 3; if (!a.dash) a.dash = 'solid'; } } }); renderProps(); });
  bindColor('pImgStroke', (a, v) => { if (a.type === 'image') { a.stroke = v; a.noStroke = false; } });
  on('pImgSw', 'change', e => { const v = Math.max(0.5, numE(e)); applyStyleNow(a => { if (a.type === 'image') a.sw = v; }); });
  on('pImgDash', 'change', e => { const v = e.target.value; applyStyleNow(a => { if (a.type === 'image') a.dash = v; }); });
  on('pText', 'focus', () => pushUndo());
  on('pText', 'input', e => {
    const v = e.target.value;
    ss.forEach(a => { if (a.text !== undefined && !isTextLocked(a)) a.text = v; });
    render(); autosave();
  });
  on('pAs', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if (a.type === 'line') a.as = v; }); });
  on('pAe', 'change', e => { const v = e.target.checked; applyStyleNow(a => { if (a.type === 'line') a.ae = v; }); });
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
  if (kind === 'top' || kind === 'bot') {
    /* przenieś na sam skrót surowej tablicy — po sortowaniu wg warstwy
       (patrz layeredShapes()) i tak wyląduje na wierzchu/spodzie WŁASNEJ
       warstwy, niezależnie od pozostałych warstw */
    const selected = state.shapes.filter(s => sel.has(s.id));
    const rest = state.shapes.filter(s => !sel.has(s.id));
    state.shapes = kind === 'top' ? [...rest, ...selected] : [...selected, ...rest];
  } else {
    /* "wyżej/niżej" zamienia miejscami z najbliższym sąsiadem z TEJ SAMEJ
       warstwy, pomijając po drodze kształty z innych warstw — inaczej
       sąsiad z innej warstwy w surowej tablicy dawałby martwy klik (zamiana
       nic by wizualnie nie zmieniała, bo kolejność międzywarstwowa i tak
       zależy tylko od state.layers, nie od surowej pozycji). */
    const arr = state.shapes;
    const idxs = arr.map((s, i) => sel.has(s.id) ? i : -1).filter(i => i >= 0);
    if (kind === 'up') {
      for (let k = idxs.length - 1; k >= 0; k--) {
        const i = idxs[k];
        let j = i + 1;
        while (j < arr.length && arr[j].layer !== arr[i].layer) j++;
        if (j < arr.length && !sel.has(arr[j].id)) [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } else {
      for (const i of idxs) {
        let j = i - 1;
        while (j >= 0 && arr[j].layer !== arr[i].layer) j--;
        if (j >= 0 && !sel.has(arr[j].id)) [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
  }
  render(); autosave();
}
