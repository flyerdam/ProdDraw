"use strict";
function renderHelp() {
  const el = $('#tab-help'); if (!el) return;
  el.innerHTML = HELP_HTML[settings.lang] || HELP_HTML.pl;
}
function renderSettings() {
  const el = $('#tab-settings');
  const D = settings.defaults || (settings.defaults = { font: 'Calibri', fs: 14, sw: 2, stroke: '#000000', fill: '#ffffff', tc: '#000000' });
  const fonts = ['Calibri', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Trebuchet MS', 'Impact'];
  el.innerHTML = `
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
    <div class="grp"><div class="hint">${t('set.about')}</div></div>`;
  $('#setLang').addEventListener('change', e => { settings.lang = e.target.value; saveSettingsLS(); applySettings(); });
  $('#setMx').addEventListener('change', e => { settings.mxMaster = e.target.checked; saveSettingsLS(); });
  $('#setAutosave').addEventListener('change', e => { settings.autosave = e.target.checked; saveSettingsLS(); if (settings.autosave) autosave(); });
  $('#setZoomDiv').addEventListener('change', e => { settings.zoomDiv = clamp(parseFloat(e.target.value) || 4, 1, 20); saveSettingsLS(); });
  $('#setSideW').addEventListener('change', e => {
    settings.sideW = clamp(parseInt(e.target.value) || 272, 200, 640); saveSettingsLS();
    document.documentElement.style.setProperty('--sideW', settings.sideW + 'px'); render();
  });
  const dSave = () => saveSettingsLS();
  $('#dFont').addEventListener('change', e => { D.font = e.target.value; dSave(); });
  $('#dFs').addEventListener('change', e => { D.fs = Math.max(4, parseFloat(e.target.value) || 14); dSave(); });
  $('#dSw').addEventListener('change', e => { D.sw = Math.max(0.5, parseFloat(e.target.value) || 2); dSave(); });
  $('#dStroke').addEventListener('change', e => { D.stroke = e.target.value; dSave(); });
  $('#dTc').addEventListener('change', e => { D.tc = e.target.value; dSave(); });
  $('#dFill').addEventListener('change', e => { D.fill = e.target.value; dSave(); });
  $('#setTmpl').addEventListener('click', saveAsTemplate);
  $('#setExpCfg').addEventListener('click', exportConfig);
  $('#setImpCfg').addEventListener('click', () => $('#fSettings').click());
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
