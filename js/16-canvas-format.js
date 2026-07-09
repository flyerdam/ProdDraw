"use strict";
/* ---------- format kanwy + szablon ---------- */
function pageRegion() {
  const P = state.page;
  return P && P.mode !== 'off' ? { x: 0, y: 0, w: P.w, h: P.h } : null;
}
function fitPage() {
  const r = cv.getBoundingClientRect();
  const P = state.page;
  if (!P || P.mode === 'off') { view = { x: 60, y: 60, z: 1 }; return; }
  const z = clamp(Math.min((r.width - 80) / P.w, (r.height - 80) / P.h), 0.08, 2);
  view = { x: (r.width - P.w * z) / 2, y: (r.height - P.h * z) / 2, z };
}
function syncPageUI() {
  const P = state.page || { mode: 'off' };
  $('#pageSel').value = P.mode;
  $('#pageWH').style.display = P.mode === 'custom' ? '' : 'none';
  if (P.w) { $('#pageW').value = P.w; $('#pageH').value = P.h; }
}
function templateShapes(W, H) {
  const g = 'Gorient';
  return [
    { id: uid(), type: 'rect', x: 24, y: 20, w: 340, h: 52, fill: '#ffffff', noFill: false, noStroke: false,
      stroke: '#111827', sw: 2, dash: 'solid', text: 'NR CZĘŚCI:', fs: 16, tc: '#111827', bold: true },
    { id: uid(), type: 'rect', x: 372, y: 20, w: Math.max(200, W - 396), h: 52, fill: '#ffffff', noFill: false, noStroke: false,
      stroke: '#111827', sw: 2, dash: 'solid', text: 'NAZWA:', fs: 16, tc: '#111827', bold: true },
    { id: uid(), g, type: 'line', x1: 40, y1: H - 42, x2: 160, y2: H - 42,
      stroke: '#111827', sw: 3, dash: 'solid', as: false, ae: true },
    { id: uid(), g, type: 'text', x: 62, y: H - 74, text: 'PRZÓD', fs: 15, tc: '#111827', bold: true }
  ];
}
/* utwórz nowy projekt z wybranego szablonu (null=pusty, 'builtin'=wbudowany) */
function projectFromTemplate(tmpl) {
  currentProjectHandle = null;   /* nowy projekt = brak powiązanego pliku */
  state = { name: 'Instrukcja_01', shapes: [], vars: { cols: [], rows: [] },
    page: { mode: 'a4l', w: PAGES.a4l.w, h: PAGES.a4l.h } };
  if (tmpl === 'builtin') {
    state.shapes = templateShapes(state.page.w, state.page.h);
  } else if (tmpl && Array.isArray(tmpl.shapes)) {
    state.shapes = JSON.parse(JSON.stringify(tmpl.shapes)).map(normalizeShape);
    state.vars = tmpl.vars && tmpl.vars.cols ? JSON.parse(JSON.stringify(tmpl.vars)) : { cols: [], rows: [] };
    state.page = tmpl.page && tmpl.page.mode ? JSON.parse(JSON.stringify(tmpl.page)) : { mode: 'a4l', w: PAGES.a4l.w, h: PAGES.a4l.h };
    state.shapes.forEach(s => { s.id = uid(); });   /* świeże ID = niezależny projekt */
  }
  $('#projName').value = state.name;
  sel.clear(); previewRow = -1;
  clearHistory();
  syncPageUI(); fitPage();
  render(); renderProps(); renderVars(); autosave();
}
/* modal wyboru szablonu (jak przy imporcie obrazów) */
function openTemplatePicker() {
  const body = $('#tmplBody'); body.innerHTML = '';
  const cards = [{ label: t('tmpl.blank'), tmpl: null, blank: true }];
  templates.forEach((tm, i) => cards.push({ label: tm.name, tmpl: tm, idx: i }));
  if (!templates.length) cards.push({ label: t('tmpl.default'), tmpl: 'builtin' });   /* awaryjny wbudowany */
  for (const card of cards) {
    const d = document.createElement('div');
    d.className = 'tmplCard' + (card.blank ? ' blank' : '');
    let thumb = '';
    const shapes = card.tmpl === 'builtin' ? templateShapes(1123, 794)
      : (card.tmpl && card.tmpl.shapes) ? card.tmpl.shapes : null;
    if (shapes) { const b = buildSVG(shapes, null, 20); thumb = b ? b.svg : ''; }
    d.innerHTML = (thumb || '<svg viewBox="0 0 100 60"></svg>') + `<div class="cap">${escXml(card.label)}</div>`;
    if (card.idx !== undefined) {
      const del = document.createElement('button');
      del.className = 'tdel'; del.textContent = '✕';
      del.addEventListener('click', ev => {
        ev.stopPropagation();
        if (!confirm(t('c.delTmpl', { n: card.label }))) return;
        templates.splice(card.idx, 1); saveTemplatesLS(); openTemplatePicker();
      });
      d.appendChild(del);
    }
    d.addEventListener('click', () => { $('#tmplModal').classList.remove('on'); PS_openNewTabFromTemplate(card.tmpl); });
    body.appendChild(d);
  }
  $('#tmplModal').classList.add('on');
}
async function saveAsTemplate() {
  const name = ((await promptDialog(t('p.tmplName'), $('#projName').value || 'Szablon')) || '').trim();
  if (!name) return;
  const tmpl = { name,
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    vars: JSON.parse(JSON.stringify(state.vars)),
    page: JSON.parse(JSON.stringify(state.page)) };
  const i = templates.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) {
    if (!confirm(t('c.tmplOverwrite', { n: templates[i].name }))) return;
    templates[i] = tmpl;
  } else templates.push(tmpl);
  saveTemplatesLS();
  toast(t('t.tmplSaved') + name);
}
