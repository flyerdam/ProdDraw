"use strict";
/* =====================================================================
   Projekty — rejestr wielu projektów + gniazda autozapisu (multi-tab).
   Każdy projekt = gniazdo (slot) o unikalnym, rosnącym id (id wewnętrzne,
   nigdzie nie pokazywane użytkownikowi — nazwy widoczne w kartach bierze
   się z rejestru).

   Dane projektu : localStorage['prodrys_auto:<slot>']  (JSON jak projectJSON())
   Rejestr WSZYSTKICH projektów (otwartych i zamkniętych):
                   localStorage['prodrys_projects'] = [{slot,name}, ...]
   Otwarte karty  : localStorage['prodrys_session'] = {open:[slot,...], active:slot}
                   (trwałe — przetrwa pełne zamknięcie i ponowne otwarcie apki/okna)
   Żywe gniazda   : localStorage['prodrys_live'] = {slot: ts}  (ten sam projekt
                   otwarty *teraz* w innym oknie — zabezpieczenie przed
                   nadpisaniem się dwóch okien edytujących to samo gniazdo)

   Zamknięcie karty (×) NIE usuwa projektu — tylko chowa go z paska kart.
   Każdy zamknięty projekt można później otworzyć z panelu „Otwórz zapisany
   projekt" albo trwale usunąć (js/tabs.js).

   Autozapis można wyłączyć w Ustawieniach (settings.autosave) — wtedy
   zmiany w bieżącej karcie nie są zapisywane (przełączenie/zamknięcie
   karty lub programu je odrzuca). Sam fakt, które karty są otwarte, i tak
   jest zapisywany trwale, niezależnie od tego przełącznika.

   Funkcje logiki są tylko DEFINIOWANE tutaj; PS_init() woła 21-init.js po
   załadowaniu wszystkich modułów (render/state/itd. muszą już istnieć).
   Warstwa UI paska kart (Tabs_render / Tabs_new) jest w js/tabs.js.
   ===================================================================== */

const PS_REG_KEY  = 'prodrys_projects';
const PS_LIVE_KEY = 'prodrys_live';
const PS_SESS_KEY = 'prodrys_session';   // localStorage — trwałe, przetrwa restart apki
const PS_STALE_MS = 6000;
const PS_HEARTBEAT_MS = 2000;

let PS_active = 0;                          // aktywny slot tego okna

/* ---------- rejestr WSZYSTKICH projektów ---------- */
function PS_registry() {
  try { const r = JSON.parse(localStorage.getItem(PS_REG_KEY)); return Array.isArray(r) ? r : []; }
  catch (e) { return []; }
}
function PS_saveRegistry(list) { try { localStorage.setItem(PS_REG_KEY, JSON.stringify(list)); } catch (e) {} }
function PS_keyFor(slot) { return 'prodrys_auto:' + slot; }
function PS_projectName(slot) { const p = PS_registry().find(x => x.slot === slot); return p ? p.name : ('Projekt ' + slot); }
function PS_nextSlot() { let m = 0; for (const p of PS_registry()) if (p.slot > m) m = p.slot; return m + 1; }
/* numer w domyślnej nazwie ("Instrukcja_03") liczony z liczby projektów w
   rejestrze — nie z wewnętrznego id gniazda, żeby nie pokazywać rosnącego
   w nieskończoność licznika po usunięciu starych projektów */
function PS_nextDisplayNumber() { return PS_registry().length + 1; }

/* ---------- dane projektu ---------- */
function PS_readData(slot) { try { return localStorage.getItem(PS_keyFor(slot)); } catch (e) { return null; } }
function PS_writeData(slot, json) { try { localStorage.setItem(PS_keyFor(slot), json); } catch (e) {} }
function PS_autosaveOn() { return settings.autosave !== false; }

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

/* ---------- karty tego okna — trwała sesja (localStorage) ---------- */
function PS_session() {
  try {
    const s = JSON.parse(localStorage.getItem(PS_SESS_KEY));
    return (s && Array.isArray(s.open)) ? s : { open: [], active: 0 };
  } catch (e) { return { open: [], active: 0 }; }
}
function PS_openSlots() { return PS_session().open; }
function PS_setOpen(list, active) {
  try { localStorage.setItem(PS_SESS_KEY, JSON.stringify({ open: list, active: (active !== undefined ? active : PS_active) })); }
  catch (e) {}
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
/* utworzenie projektu zawsze zapisuje jego początkową treść — to jest
   jednorazowe "stworzenie", nie "autozapis", więc nie podlega przełącznikowi */
function PS_newProject(name) {
  const slot = PS_nextSlot();
  name = name || ('Instrukcja_' + String(PS_nextDisplayNumber()).padStart(2, '0'));
  const reg = PS_registry(); reg.push({ slot: slot, name: name }); PS_saveRegistry(reg);
  PS_writeData(slot, PS_defaultProjectJSON(name));
  return { slot: slot, name: name };
}
function PS_commitActive() { if (PS_active && PS_autosaveOn()) PS_writeData(PS_active, PS_currentJSON()); }

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
  const name = 'Instrukcja_' + String(PS_nextDisplayNumber()).padStart(2, '0');
  const reg = PS_registry(); reg.push({ slot: slot, name: name }); PS_saveRegistry(reg);
  const open = PS_openSlots(); open.push(slot);
  PS_active = slot; PS_setOpen(open, slot);
  projectFromTemplate(tmpl);                 // ustawia świeży state + autosave() -> PS_autoKey()=slot
  state.name = name; if ($('#projName')) $('#projName').value = name;
  PS_writeData(slot, PS_currentJSON());       // pierwszy zapis — jak przy tworzeniu, nie podlega przełącznikowi
  PS_heartbeat();
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* otwórz jako nową kartę projekt, który już istnieje w rejestrze, ale nie
   jest otwarty w tym oknie (np. wcześniej zamknięty) */
function PS_reopenProject(slot) {
  if (PS_openSlots().includes(slot)) { PS_switchTo(slot); return; }
  if (PS_isLiveElsewhere(slot)) {
    if (typeof toast === 'function') toast(t('t.projLiveElsewhere'));
    return;
  }
  PS_commitActive();
  const open = PS_openSlots(); open.push(slot);
  PS_active = slot; PS_setOpen(open, PS_active);
  PS_loadInto(slot);
  PS_heartbeat();
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* projekty w rejestrze, które NIE są otwarte jako karta w tym oknie —
   lista do panelu "otwórz zapisany projekt" */
function PS_closedProjects() {
  const open = PS_openSlots();
  return PS_registry().filter(p => !open.includes(p.slot));
}

/* zmiana nazwy aktywnego projektu (spięte z polem #projName) */
function PS_renameActive(name) {
  if (!PS_active) return;
  const reg = PS_registry(); const p = reg.find(x => x.slot === PS_active);
  if (p) { p.name = name; PS_saveRegistry(reg); }
  if (typeof Tabs_render === 'function') Tabs_render();
}

/* zamknij kartę — projekt ZOSTAJE w rejestrze i w danych, tylko chowa się
   z paska; można go później otworzyć z panelu "otwórz zapisany projekt" */
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

/* usuń projekt NA ZAWSZE — z rejestru, z danych, z karty (jeśli otwarty).
   Nieodwracalne; wywołujący (UI) powinien wcześniej potwierdzić z użytkownikiem. */
function PS_deleteProject(slot) {
  let open = PS_openSlots();
  if (open.includes(slot)) {
    open = open.filter(s => s !== slot);
    if (!open.length) { const np = PS_newProject(); open = [np.slot]; }
    const newActive = (slot === PS_active) ? open[open.length - 1] : PS_active;
    PS_setOpen(open, newActive);
    if (slot === PS_active) { PS_active = newActive; PS_loadInto(newActive); }
  }
  PS_saveRegistry(PS_registry().filter(p => p.slot !== slot));
  try { localStorage.removeItem(PS_keyFor(slot)); } catch (e) {}
  const l = PS_readLive(); delete l[slot]; PS_writeLive(l);
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

/* ---------- start (woła 21-init.js) ----------
   Karty otwarte przy poprzednim zamknięciu okna są trwale zapamiętane
   (localStorage), więc po ponownym otwarciu apki/okna wracają WSZYSTKIE —
   nie tylko jedna. Gniazdo aktualnie "żywe" w innym oknie jest pomijane,
   żeby dwa okna nie edytowały tego samego projektu naraz. */
function PS_init() {
  PS_migrateLegacy();
  const regSlots = PS_registry().map(p => p.slot);
  const sess = PS_session();
  let open = sess.open.filter(s => regSlots.includes(s) && !PS_isLiveElsewhere(s));
  if (open.length) {
    PS_active = (sess.active && open.includes(sess.active)) ? sess.active : open[0];
  } else {
    /* brak zapamiętanej sesji (pierwszy start) albo wszystko żywe gdzie indziej:
       otwórz projekt NIE otwarty w innym oknie, albo utwórz nowy */
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
