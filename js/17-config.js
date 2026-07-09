"use strict";
function saveSettingsLS() { try { localStorage.setItem('prodrys_settings', JSON.stringify(settings)); } catch (e) {} }
function saveTemplatesLS() { try { localStorage.setItem('prodrys_templates', JSON.stringify(templates)); } catch (e) {} }
/* konfiguracja = ustawienia + biblioteka + szablony (jeden plik) */
function buildConfig() {
  return { app: 'prodrys-config', version: 1,
    settings: JSON.parse(JSON.stringify(settings)),
    lib: JSON.parse(JSON.stringify(lib)),
    libFolders: JSON.parse(JSON.stringify(libFolders)),
    templates: JSON.parse(JSON.stringify(templates)) };
}
function exportConfig() {
  downloadBlob(new Blob([JSON.stringify(buildConfig(), null, 1)], { type: 'application/json' }), 'prodrys_konfig.json');
  toast(t('t.cfgSaved'));
}
function importConfig(obj) {
  if (!obj || (obj.app !== 'prodrys-config' && obj.app !== 'prodrys-settings'))
    return toast(t('t.cfgBad'));
  if (obj.settings) { settings = Object.assign(settings, obj.settings); saveSettingsLS(); }
  if (Array.isArray(obj.lib)) {
    for (const it of obj.lib) if (!lib.some(l => l.name === it.name)) lib.push(it);
    saveLib();
  }
  if (Array.isArray(obj.libFolders)) {
    for (const f of obj.libFolders) if (!libFolders.includes(f)) libFolders.push(f);
    saveLibFolders();
  }
  if (Array.isArray(obj.templates)) {
    for (const it of obj.templates) {
      const i = templates.findIndex(x => x.name === it.name);
      if (i >= 0) templates[i] = it; else templates.push(it);
    }
    saveTemplatesLS();
  } else if (obj.template) {          /* zgodność ze starym plikiem ustawień */
    templates.push({ name: t('tmpl.default'), shapes: obj.template.shapes || [],
      vars: obj.template.vars || { cols: [], rows: [] }, page: obj.template.page || { mode: 'a4l', w: 1123, h: 794 } });
    saveTemplatesLS();
  }
  applySettings();
  toast(t('t.cfgLoaded'));
}
/* zastosuj ustawienia do UI (język, szerokość panelu) i odśwież */
function applySettings() {
  document.documentElement.style.setProperty('--sideW', settings.sideW + 'px');
  applyI18n();
  render(); renderProps(); renderVars(); renderLib(); renderSettings(); renderHelp();
}
