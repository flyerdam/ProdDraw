"use strict";
function renderVars() {
  const el = $('#tab-vars');
  const V = state.vars;
  let h = `<div class="hint" style="margin-bottom:10px">${t('vars.hint')}</div>`;
  h += `<div class="row"><button class="btn" id="vAddCol">${t('vars.addCol')}</button>
    <button class="btn" id="vAddRow">${t('vars.addRow')}</button></div>`;
  if (V.cols.length || V.rows.length) {
    h += `<table id="varTbl"><tr><th>${t('vars.variant')}</th>`;
    V.cols.forEach((c, ci) => h += `<th>{${escXml(c)}}<button class="delX" data-vdc="${ci}" title="Usuń zmienną">✕</button></th>`);
    h += `<th></th></tr>`;
    V.rows.forEach((r, ri) => {
      h += `<tr><td><input data-vn="${ri}" value="${escXml(r.name)}"></td>`;
      V.cols.forEach(c =>
        h += `<td><input data-vv="${ri}" data-vc="${escXml(c)}" value="${escXml(r.vals[c] ?? '')}"></td>`);
      h += `<td style="width:24px;text-align:center"><button class="delX" style="position:static" data-vdr="${ri}">✕</button></td></tr>`;
    });
    h += `</table>`;
  }
  h += `<div class="grp" style="margin-top:12px"><h4>${t('vars.preview')}</h4>
    <select class="in wide" id="vPrev"><option value="-1">${t('vars.rawVals')}</option>` +
    V.rows.map((r, i) => `<option value="${i}" ${previewRow === i ? 'selected' : ''}>${escXml(r.name)}</option>`).join('') +
    `</select></div>`;
  h += `<div class="grp"><h4>${t('vars.nameGrp')}</h4>
    <input class="in wide" id="vNamePat" placeholder="${escXml(t('vars.namePh'))}" value="${escXml(V.namePattern || '')}">
    <div class="hint" style="margin-top:4px">${t('vars.nameHint')}</div></div>`;
  h += `<button class="btn primary" id="vGen" style="width:100%" ${!V.rows.length ? 'disabled' : ''}>${t('vars.gen')}</button>`;
  el.innerHTML = h;

  $('#vAddCol').addEventListener('click', () => {
    const n = prompt(t('p.varName'));
    if (!n) return;
    const k = n.trim().replace(/[{}]/g, '');
    if (!k || V.cols.includes(k)) return toast(t('t.badVar'));
    V.cols.push(k); renderVars(); autosave();
  });
  $('#vAddRow').addEventListener('click', () => {
    V.rows.push({ name: 'Wariant_' + (V.rows.length + 1), vals: {} });
    renderVars(); autosave();
  });
  $$('#tab-vars [data-vdc]').forEach(b => b.addEventListener('click', () => {
    const c = V.cols[+b.dataset.vdc];
    V.cols.splice(+b.dataset.vdc, 1);
    V.rows.forEach(r => delete r.vals[c]);
    renderVars(); autosave(); render();
  }));
  $$('#tab-vars [data-vdr]').forEach(b => b.addEventListener('click', () => {
    V.rows.splice(+b.dataset.vdr, 1);
    if (previewRow >= V.rows.length) previewRow = -1;
    renderVars(); autosave(); render();
  }));
  $$('#tab-vars [data-vn]').forEach(i => i.addEventListener('change', () => {
    V.rows[+i.dataset.vn].name = i.value; autosave();
  }));
  $$('#tab-vars [data-vv]').forEach(i => i.addEventListener('input', () => {
    V.rows[+i.dataset.vv].vals[i.dataset.vc] = i.value;
    autosave(); if (previewRow === +i.dataset.vv) render();
  }));
  $('#vPrev').addEventListener('change', e => {
    previewRow = +e.target.value; render();
  });
  const np = $('#vNamePat'); if (np) np.addEventListener('input', () => { V.namePattern = np.value; autosave(); });
  $('#vGen').addEventListener('click', generateVariants);
}
/* nazwa wariantu: wzór {A}_{B} albo wartości zmiennych złączone "_" */
function variantName(row) {
  const V = state.vars;
  const pat = (V.namePattern || '').trim();
  if (pat) return sanitizeFile(subst(pat, row.vals)) || sanitizeFile(row.name);
  const vals = V.cols.map(c => row.vals[c] ?? '').filter(x => String(x).trim() !== '');
  return sanitizeFile(vals.length ? vals.join('_') : row.name);
}
async function generateVariants() {
  if (!state.shapes.length) return toast(t('t.emptyCanvas'));
  const proj = sanitizeFile($('#projName').value);
  const files = [];
  const used = {};
  const region = pageRegion();
  toast(t('t.genVariants'));
  for (const row of state.vars.rows) {
    const b = buildSVG(state.shapes, row.vals, 16, region);
    if (!b) continue;
    const png = await svgToPngBlob(b.svg, b.w, b.h, 2);
    let nm = variantName(row);
    if (used[nm]) nm += '_' + (++used[nm]); else used[nm] = 1;   /* unikaj kolizji nazw */
    files.push({ name: proj + '_' + nm + '.png', data: new Uint8Array(await png.arrayBuffer()) });
  }
  if (!files.length) return toast(t('t.noVariants'));
  downloadBlob(makeZip(files), proj + '_warianty.zip');
  toast(t('t.genDone', { n: files.length }));
}

/* =====================================================================
   PROJEKT: zapis / odczyt / autozapis / eksport PNG
   ===================================================================== */
