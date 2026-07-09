"use strict";
/* ---------- start ---------- */
(function init() {
  /* ustawienia aplikacji */
  try { const st = localStorage.getItem('prodrys_settings');
    if (st) settings = Object.assign(settings, JSON.parse(st)); } catch (e) {}
  if (!I18N[settings.lang]) settings.lang = 'pl';
  document.documentElement.style.setProperty('--sideW', settings.sideW + 'px');
  applyI18n();
  /* biblioteka */
  try { const l = localStorage.getItem('prodrys_lib');
    lib = l ? JSON.parse(l) : null; } catch (e) { lib = null; }
  if (!Array.isArray(lib) || !lib.length) seedLib();
  /* odśwież wbudowane elementy biblioteki do aktualnej wersji */
  for (const d of defaultLibItems()) {
    const i = lib.findIndex(l => l.name === d.name);
    if (i >= 0) lib[i] = Object.assign(d, { folder: lib[i].folder || '' }); else lib.unshift(d);
  }
  saveLib();
  try { const lf = localStorage.getItem('prodrys_libfolders'); libFolders = lf ? JSON.parse(lf) : []; } catch (e) { libFolders = []; }
  if (!Array.isArray(libFolders)) libFolders = [];
  /* szablony (z migracją starego pojedynczego szablonu) */
  try { const tp = localStorage.getItem('prodrys_templates');
    templates = tp ? JSON.parse(tp) : []; } catch (e) { templates = []; }
  if (!Array.isArray(templates)) templates = [];
  try {
    const oldT = localStorage.getItem('prodrys_template');
    if (oldT && !templates.length) {
      const o = JSON.parse(oldT);
      if (o && Array.isArray(o.shapes))
        templates.push({ name: t('tmpl.default'), shapes: o.shapes,
          vars: o.vars || { cols: [], rows: [] }, page: o.page || { mode: 'a4l', w: 1123, h: 794 } });
      saveTemplatesLS();
    }
  } catch (e) {}
  /* zasil edytowalnym domyślnym szablonem (można go nadpisać/usunąć) */
  if (!templates.length) {
    templates.push({ name: t('tmpl.default'), shapes: templateShapes(PAGES.a4l.w, PAGES.a4l.h),
      vars: { cols: [], rows: [] }, page: { mode: 'a4l', w: PAGES.a4l.w, h: PAGES.a4l.h } });
    saveTemplatesLS();
  }
  /* projekty + karty (rejestr wielu projektów, gniazda autozapisu per karta) */
  PS_init();
  renderLib();
  renderSettings();
  renderHelp();
})();
