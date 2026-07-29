"use strict";
function renderHelp() {
  const el = $('#tab-help'); if (!el) return;
  el.innerHTML = HELP_HTML[settings.lang] || HELP_HTML.pl;
}
/* ---------- motyw (kolory UI aplikacji) ----------
   Zmienne CSS w :root (patrz css/styles.css) — jeden punkt prawdy dla
   wszystkich kolorów chromu aplikacji. Zestaw (preset) daje bazę, custom
   nadpisuje pojedyncze zmienne — trzymane w settings.theme, więc podróżuje
   przez export/import konfiguracji (js/17-config.js) razem z resztą. */
const THEME_VARS = [
  { k: 'bg', css: '--bg', label: 'theme.bg' }, { k: 'panel', css: '--panel', label: 'theme.panel' },
  { k: 'panel2', css: '--panel2', label: 'theme.panel2' }, { k: 'line', css: '--line', label: 'theme.line' },
  { k: 'txt', css: '--txt', label: 'theme.txt' }, { k: 'txt2', css: '--txt2', label: 'theme.txt2' },
  { k: 'acc', css: '--acc', label: 'theme.acc' }, { k: 'acc2', css: '--acc2', label: 'theme.acc2' },
  { k: 'canvas', css: '--canvas', label: 'theme.canvas' }, { k: 'grid', css: '--grid', label: 'theme.grid' },
  { k: 'sel', css: '--sel', label: 'theme.sel' }, { k: 'guide', css: '--guide', label: 'theme.guide' }
];
const THEME_PRESETS = {
  dark: { bg: '#1b1e23', panel: '#22262c', panel2: '#282d34', line: '#343a43', txt: '#d8dce2', txt2: '#8b93a0',
    acc: '#ffb020', acc2: '#e09000', canvas: '#eef0f3', grid: '#dde1e7', sel: '#1d7fd4', guide: '#e6007e' },
  light: { bg: '#eef0f3', panel: '#ffffff', panel2: '#f4f5f7', line: '#d7dbe1', txt: '#20242b', txt2: '#6b7280',
    acc: '#c97a00', acc2: '#a86400', canvas: '#ffffff', grid: '#e2e5ea', sel: '#1d7fd4', guide: '#c4006a' },
  midnight: { bg: '#12151d', panel: '#191d28', panel2: '#1f2432', line: '#2c3345', txt: '#dbe2ee', txt2: '#7c8aa3',
    acc: '#4c9dff', acc2: '#2f7fe0', canvas: '#eef0f3', grid: '#dde1e7', sel: '#4c9dff', guide: '#e6007e' },
  forest: { bg: '#161d18', panel: '#1c251e', panel2: '#212c22', line: '#31402f', txt: '#dbe6dc', txt2: '#84a086',
    acc: '#4fcf7a', acc2: '#2fa85a', canvas: '#eef0f3', grid: '#dde1e7', sel: '#2fa85a', guide: '#e6007e' }
};
function themeState() { return settings.theme || (settings.theme = { preset: 'dark', custom: {} }); }
function themeEffective() {
  const th = themeState();
  return Object.assign({}, THEME_PRESETS[th.preset] || THEME_PRESETS.dark, th.custom || {});
}
function applyTheme() {
  const eff = themeEffective();
  for (const v of THEME_VARS) document.documentElement.style.setProperty(v.css, eff[v.k]);
}
let _setSubtab = 'general';   // która pod-zakładka Ustawień jest widoczna (nie zapisywane — wraca do "Ogólne" po przeładowaniu)
function renderSettings() {
  const el = $('#tab-settings');
  const D = settings.defaults || (settings.defaults = { font: 'Calibri', fs: 14, sw: 2, stroke: '#000000', fill: '#ffffff', tc: '#000000' });
  const fonts = ['Calibri', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Trebuchet MS', 'Impact'];
  const th = themeState(), eff = themeEffective();
  const onGen = _setSubtab !== 'theme';
  el.innerHTML = `
    <div class="subtabbar">
      <button class="subtab ${onGen ? 'on' : ''}" data-sub="general">${t('set.general')}</button>
      <button class="subtab ${!onGen ? 'on' : ''}" data-sub="theme">${t('set.theme')}</button>
    </div>
    <div class="subtabBody" id="setSubGeneral" style="display:${onGen ? '' : 'none'}">
    <div class="grp"><h4>${t('set.language')}</h4>
      <div class="setRow"><select class="in wide" id="setLang">
        <option value="pl" ${settings.lang === 'pl' ? 'selected' : ''}>Polski</option>
        <option value="en" ${settings.lang === 'en' ? 'selected' : ''}>English</option>
        <option value="de" ${settings.lang === 'de' ? 'selected' : ''}>Deutsch</option>
      </select></div></div>
    <div class="grp"><h4>${t('set.zoom')}</h4>
      <div class="setRow"><label style="min-width:0"><input type="checkbox" id="setMx" ${settings.mxMaster ? 'checked' : ''}> ${t('set.mxMaster')}</label></div>
      <div class="hint" style="margin-bottom:8px">${t('set.mxMasterHint')}</div>
      <div class="row"><label>${t('set.zoomDiv')}</label><input class="in" type="number" id="setZoomDiv" min="1" max="20" step="1" value="${settings.zoomDiv}"></div>
    </div>
    <div class="grp"><h4>${t('set.panel')}</h4>
      <div class="row"><label>${t('set.panelWidth')}</label><input class="in" type="number" id="setSideW" min="200" max="640" step="10" value="${settings.sideW}"></div>
    </div>
    <div class="grp"><h4>${t('set.autosave')}</h4>
      <div class="setRow"><label style="min-width:0"><input type="checkbox" id="setAutosave" ${settings.autosave !== false ? 'checked' : ''}> ${t('set.autosave')}</label></div>
      <div class="hint">${t('set.autosaveHint')}</div>
    </div>
    <div class="grp"><h4>${t('set.canvas')}</h4>
      <div class="row"><label>${t('set.infMargin')}</label><input class="in" type="number" id="setInfMargin" min="0" max="500" step="1" value="${settings.infiniteCanvasMargin ?? 16}"></div>
      <div class="hint">${t('set.infMarginHint')}</div>
    </div>
    <div class="grp"><h4>${t('set.xlsxImport')}</h4>
      <div class="setRow"><label style="min-width:0"><input type="checkbox" id="setXlsxAutoCrop" ${settings.xlsxAutoCrop !== false ? 'checked' : ''}> ${t('set.xlsxAutoCrop')}</label></div>
      <div class="hint">${t('set.xlsxAutoCropHint')}</div>
    </div>
    <div class="grp"><h4>${t('set.defaults')}</h4>
      <div class="row"><label>${t('props.font')}</label><select class="in" id="dFont" style="width:130px">
        ${fonts.map(f => `<option value="${f}" ${D.font === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="row"><label>${t('props.size')}</label><input class="in" type="number" id="dFs" min="4" value="${D.fs}"></div>
      <div class="row"><label>${t('props.width')}</label><input class="in" type="number" id="dSw" min="0.5" step="0.5" value="${D.sw}"></div>
      <div class="row"><label>${t('set.colStroke')}</label><input class="in" type="color" id="dStroke" value="${D.stroke}"></div>
      <div class="row"><label>${t('set.colText')}</label><input class="in" type="color" id="dTc" value="${D.tc}"></div>
      <div class="row"><label>${t('set.colFill')}</label><input class="in" type="color" id="dFill" value="${D.fill}"></div></div>
    <div class="grp"><h4>${t('set.config')}</h4>
      <div class="row"><button class="btn" id="setTmpl">${t('config.saveTmpl')}</button></div>
      <div class="row"><button class="btn" id="setExpCfg">${t('config.save')}</button>
        <button class="btn" id="setImpCfg">${t('config.load')}</button></div></div>
    <div class="grp"><div class="hint">${t('set.about')}</div></div>
    </div>
    <div class="subtabBody" id="setSubTheme" style="display:${onGen ? 'none' : ''}">
    <div class="grp"><h4>${t('set.themePreset')}</h4>
      <div class="row" id="themePresetRow">${Object.keys(THEME_PRESETS).map(id =>
        `<button class="btn themePresetBtn ${th.preset === id ? 'primary' : ''}" data-preset="${id}">${t('theme.preset_' + id)}</button>`).join('')}</div>
    </div>
    <div class="grp"><h4>${t('set.themeCustom')}</h4>
      ${THEME_VARS.map(v => `<div class="row"><label>${t(v.label)}</label><input class="in" type="color" id="thm_${v.k}" value="${eff[v.k]}"></div>`).join('')}
      <div class="row"><button class="btn" id="themeResetBtn">${t('set.themeReset')}</button></div>
    </div>
    </div>`;
  /* 'input' ORAZ 'change' — pole tekstowe/liczbowe/kolor stosuje się dopiero
     na 'change' (blur/zamknięcie pickera); jeśli coś w międzyczasie odśwież
     DOM zakładki (np. puszczenie chwytaka szerokości panelu — patrz
     js/20-menus-dnd.js — albo zmiana języka), edycja bez 'change' ginie bez
     śladu. Z 'input' zmiana jest w stanie natychmiast, zanim cokolwiek
     zdąży przerysować zakładkę — więc kliknięcie gdziekolwiek indziej
     (kanwa, inna zakładka) już niczego nie gubi. */
  const on2 = (id, fn) => { const elx = $('#' + id); ['input', 'change'].forEach(ev => elx.addEventListener(ev, fn)); };
  $('#setLang').addEventListener('change', e => { settings.lang = e.target.value; saveSettingsLS(); applySettings(); });
  $('#setMx').addEventListener('change', e => { settings.mxMaster = e.target.checked; saveSettingsLS(); });
  $('#setAutosave').addEventListener('change', e => { settings.autosave = e.target.checked; saveSettingsLS(); if (settings.autosave) autosave(); });
  on2('setInfMargin', e => { settings.infiniteCanvasMargin = clamp(parseInt(e.target.value) || 0, 0, 500); saveSettingsLS(); });
  $('#setXlsxAutoCrop').addEventListener('change', e => { settings.xlsxAutoCrop = e.target.checked; saveSettingsLS(); });
  on2('setZoomDiv', e => { settings.zoomDiv = clamp(parseFloat(e.target.value) || 4, 1, 20); saveSettingsLS(); });
  on2('setSideW', e => {
    settings.sideW = clamp(parseInt(e.target.value) || 272, 200, 640); saveSettingsLS();
    document.documentElement.style.setProperty('--sideW', settings.sideW + 'px'); render();
  });
  const dSave = () => saveSettingsLS();
  $('#dFont').addEventListener('change', e => { D.font = e.target.value; dSave(); });
  on2('dFs', e => { D.fs = Math.max(4, parseFloat(e.target.value) || 14); dSave(); });
  on2('dSw', e => { D.sw = Math.max(0.5, parseFloat(e.target.value) || 2); dSave(); });
  on2('dStroke', e => { D.stroke = e.target.value; dSave(); });
  on2('dTc', e => { D.tc = e.target.value; dSave(); });
  on2('dFill', e => { D.fill = e.target.value; dSave(); });
  $('#setTmpl').addEventListener('click', saveAsTemplate);
  $('#setExpCfg').addEventListener('click', exportConfig);
  $('#setImpCfg').addEventListener('click', () => $('#fSettings').click());
  $$('#tab-settings .subtab').forEach(b => b.addEventListener('click', () => { _setSubtab = b.dataset.sub; renderSettings(); }));
  $$('#tab-settings .themePresetBtn').forEach(b => b.addEventListener('click', () => {
    th.preset = b.dataset.preset; th.custom = {}; saveSettingsLS(); applyTheme(); renderSettings();
  }));
  THEME_VARS.forEach(v => {
    const inp = $('#thm_' + v.k);
    ['input', 'change'].forEach(ev => inp.addEventListener(ev, e => { th.custom[v.k] = e.target.value; saveSettingsLS(); applyTheme(); }));
  });
  $('#themeResetBtn').addEventListener('click', () => { th.custom = {}; saveSettingsLS(); applyTheme(); renderSettings(); });
}
$('#pageSel').addEventListener('change', () => {
  const m = $('#pageSel').value;
  if (m === 'off') state.page = { mode: 'off' };
  else if (m === 'custom') state.page = { mode: 'custom',
    w: +$('#pageW').value || 1123, h: +$('#pageH').value || 794 };
  else state.page = { mode: m, w: PAGES[m].w, h: PAGES[m].h };
  syncPageUI();
  if (m !== 'off') fitPage();
  render(); autosave();
});
['pageW', 'pageH'].forEach(id => $('#' + id).addEventListener('change', () => {
  if (state.page.mode !== 'custom') return;
  state.page.w = Math.max(50, +$('#pageW').value || 1123);
  state.page.h = Math.max(50, +$('#pageH').value || 794);
  fitPage(); render(); autosave();
}));
