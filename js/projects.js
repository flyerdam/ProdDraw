"use strict";
/* =====================================================================
   Projekty — rejestr wielu projektów + gniazda autozapisu (multi-tab).
   Każdy projekt = gniazdo (slot) o unikalnym, rosnącym id.
   Dane projektu : localStorage['prodrys_auto:<slot>']  (JSON jak projectJSON())
   Rejestr       : localStorage['prodrys_projects'] = [{slot,name}, ...]
   Karty okna    : sessionStorage['prodrys_open'] = [slot,...], ['prodrys_active']=slot
   Żywe gniazda  : localStorage['prodrys_live'] = {slot: ts}  (ten sam projekt w innym oknie)

   Funkcje logiki są tylko DEFINIOWANE tutaj; PS_init() woła 21-init.js po
   załadowaniu wszystkich modułów (render/state/itd. muszą już istnieć).
   Warstwa UI paska kart (Tabs_render / Tabs_new) jest w js/tabs.js.
   ===================================================================== */

const PS_REG_KEY    = 'prodrys_projects';
const PS_LIVE_KEY   = 'prodrys_live';
const PS_OPEN_KEY   = 'prodrys_open';      // sessionStorage
const PS_ACTIVE_KEY = 'prodrys_active';    // sessionStorage
const PS_STALE_MS   = 6000;
const PS_HEARTBEAT_MS = 2000;

let PS_active = 0;                          // aktywny slot tego okna

/* ---------- rejestr projektów ---------- */
function PS_registry() {
  try { const r = JSON.parse(localStorage.getItem(PS_REG_KEY)); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
function PS_saveRegistry(list) { try { localStorage.setItem(PS_REG_KEY, JSON.stringify(list)); } catch (e) {} }
function PS_keyFor(slot) { return 'prodrys_auto:' + slot; }
function PS_projectName(slot) { const p = PS_registry().find(x => x.slot === slot); return p ? p.name : ('Projekt ' + slot); }
function PS_nextSlot() { let m = 0; for (const p of PS_registry()) if (p.slot > m) m = p.slot; return m + 1; }

/* ---------- dane projektu ---------- */
function PS_readData(slot) { try { return localStorage.getItem(PS_keyFor(slot)); } catch (e) { return null; } }
function PS_writeData(slot, json) { try { localStorage.setItem(PS_keyFor(slot), json); } catch (e) {} }

/* ---------- „żywe" gniazda (ten sam projekt otwarty w innym oknie) ---------- */
function PS_readLive() {
  try { const l = JSON.parse(localStorage.getItem(PS_LIVE_KEY)); return (l && typeof l === 'object') ? l : {}; }
  catch (e) { return {}; }
}
function PS_writeLive(o) { try { localStorage.setItem(PS_LIVE_KEY, JSON.stringify(o)); } catch (e) {} }
function PS_isLiveElsewhere(slot) {
  const ts = PS_readLive()[slot];
  return ts !== undefined && (Date.now() - ts) < PS_STALE_MS && !PS_openSlots().includes(slot);
}

/* ---------- karty tego okna (sessionStorage) ---------- */
function PS_openSlots() {
  try { const o = JSON.parse(sessionStorage.getItem(PS_OPEN_KEY)); return Array.isArray(o) ? o : []; }
  catch (e) { return []; }
}
function PS_setOpen(list, active) {
  try {
    sessionStorage.setItem(PS_OPEN_KEY, JSON.stringify(list));
    if (active !== undefined) sessionStorage.setItem(PS_ACTIVE_KEY, String(active));
  } catch (e) {}
}
function PS_activeSlot() { return PS_active; }
function PS_autoKey() { return PS_keyFor(PS_active); }   // używane przez autosave()

/* ---------- serializacja ---------- */
function PS_currentJSON() { return (typeof projectJSON === 'function') ? projectJSON() : JSON.stringify(state); }
function PS_defaultProjectJSON(name) {
  const W = PAGES.a4l.w, H = PAGES.a4l.h;
  const shapes = (typeof templateShapes === 'function') ? templateShapes(W, H) : [];
  return JSON.stringify({ app: 'prodrys', version: 2, name: name,
    shapes: shapes, vars: { cols: [], rows: [] }, page: { mode: 'a4l', w: W, h: H },
    lib: (typeof lib !== 'undefined' ? lib : []) }, null, 1);
}

/* ---------- tworzenie / zapis / wczytanie ---------- */
function PS_newProject(name) {
  const slot = PS_nextSlot();
  name = name || ('Instrukcja_' + String(slot).padStart(2, '0'));
  const reg = PS_registry(); reg.push({ slot: slot, name: name }); PS_saveRegistry(reg);
  PS_writeData(slot, PS_defaultProjectJSON(name));
  return { slot: slot, name: name };
}
function PS_commitActive() { if (PS_active) PS_writeData(PS_active, PS_currentJSON()); }

/* wczytaj dane gniazda do żywego stanu (state) i przerysuj */
function PS_loadInto(slot) {
  let obj = null;
  try { const raw = PS_readData(slot); obj = raw ? JSON.parse(raw) : null; } catch (e) { obj = null; }
  if (!obj || !Array.isArray(obj.shapes)) obj = JSON.parse(PS_defaultProjectJSON(PS_projectName(slot)));
  currentProjectHandle = null;
  state = {
    name: obj.name || PS_projectName(slot),
    shapes: obj.shapes.map(normalizeShape),
    vars: (obj.vars && obj.vars.cols) ? obj.vars : { cols: [], rows: [] },
    page: (obj.page && obj.page.mode) ? obj.page : { mode: 'off' }
  };
  if ($('#projName')) $('#projName').value = state.name;
  sel.clear(); previewRow = -1; clearHistory();
  syncPageUI(); fitPage(); render(); renderProps(); renderVars();
}

/* przełącz aktywną kartę na istniejące, otwarte gniazdo */
function PS_switchTo(slot) {
  if (slot === PS_active) return;
  PS_commitActive();
  PS_active = slot;
  const open = PS_openSlots(); if (!open.includes(slot)) open.push(slot);
  PS_setOpen(open, slot);
  PS_loadInto(slot);
  PS_heartbeat();
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* nowa karta z szablonu (null=pusty, 'builtin'=wbudowany, obj=szablon) */
function PS_openNewTabFromTemplate(tmpl) {
  PS_commitActive();
  const slot = PS_nextSlot();
  const name = 'Instrukcja_' + String(slot).padStart(2, '0');
  const reg = PS_registry(); reg.push({ slot: slot, name: name }); PS_saveRegistry(reg);
  const open = PS_openSlots(); open.push(slot);
  PS_active = slot; PS_setOpen(open, slot);
  projectFromTemplate(tmpl);                 // ustawia świeży state + autosave() -> PS_autoKey()=slot
  state.name = name; if ($('#projName')) $('#projName').value = name;
  PS_commitActive();
  PS_heartbeat();
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* zmiana nazwy aktywnego projektu (spięte z polem #projName) */
function PS_renameActive(name) {
  if (!PS_active) return;
  const reg = PS_registry(); const p = reg.find(x => x.slot === PS_active);
  if (p) { p.name = name; PS_saveRegistry(reg); }
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* zamknij kartę (projekt zostaje zapisany w rejestrze i danych) */
function PS_closeTab(slot) {
  PS_commitActive();
  let open = PS_openSlots().filter(s => s !== slot);
  if (!open.length) { const np = PS_newProject(); open = [np.slot]; }   // okno nigdy bez karty
  const l = PS_readLive(); delete l[slot]; PS_writeLive(l);
  const newActive = (slot === PS_active) ? open[open.length - 1] : PS_active;
  PS_setOpen(open, newActive);
  if (slot === PS_active) { PS_active = newActive; PS_loadInto(newActive); }
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* ---------- heartbeat wszystkich otwartych gniazd tego okna ---------- */
function PS_heartbeat() { const l = PS_readLive(), now = Date.now(); for (const s of PS_openSlots()) l[s] = now; PS_writeLive(l); }
function PS_releaseAll() { const l = PS_readLive(); for (const s of PS_openSlots()) delete l[s]; PS_writeLive(l); }

/* ---------- migracja starego pojedynczego autozapisu ---------- */
function PS_migrateLegacy() {
  try {
    const legacy = localStorage.getItem('prodrys_auto');
    if (legacy && !PS_registry().length && !localStorage.getItem(PS_keyFor(1))) {
      let name = 'Instrukcja_01';
      try { const o = JSON.parse(legacy); if (o && o.name) name = o.name; } catch (e) {}
      PS_writeData(1, legacy);
      PS_saveRegistry([{ slot: 1, name: name }]);
    }
  } catch (e) {}
}

/* ---------- start (woła 21-init.js) ---------- */
function PS_init() {
  PS_migrateLegacy();
  const regSlots = PS_registry().map(p => p.slot);
  let open = PS_openSlots().filter(s => regSlots.includes(s));
  let active0 = 0; try { active0 = parseInt(sessionStorage.getItem(PS_ACTIVE_KEY), 10) || 0; } catch (e) {}
  if (open.length) {
    /* przeładowanie okna: odtwórz te same karty */
    PS_active = (active0 && open.includes(active0)) ? active0 : open[0];
  } else {
    /* świeże okno: otwórz projekt NIE otwarty w innym oknie, albo utwórz nowy */
    let pick = null;
    for (const p of PS_registry()) { if (!PS_isLiveElsewhere(p.slot)) { pick = p.slot; break; } }
    if (pick === null) pick = PS_newProject().slot;
    open = [pick]; PS_active = pick;
  }
  PS_setOpen(open, PS_active);
  PS_loadInto(PS_active);
  PS_heartbeat();
  setInterval(PS_heartbeat, PS_HEARTBEAT_MS);
  window.addEventListener('beforeunload', function () { PS_commitActive(); PS_releaseAll(); });
  if (typeof Tabs_render === 'function') Tabs_render();
}
