"use strict";
/* =====================================================================
   ProdRys — jednoplikowy edytor wektorowy do instrukcji produkcyjnych
   ===================================================================== */
const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];
const cv = $('#cv'), cwrap = $('#cwrap'), txtEd = $('#txtEd');

/* ---------- stan ---------- */
let state = {
  name: 'Instrukcja_01',
  shapes: [],                    // wewnątrz warstwy: kolejność = z-order (0 = spód); między warstwami decyduje state.layers
  vars: { cols: [], rows: [] },  // warianty
  page: { mode: 'a4l', w: 1123, h: 794 }, // format kanwy; mode 'off' = nieskończona
  layers: [{ id: 'L1', name: 'Warstwa 1', visible: true, locked: false }],   // patrz ensureLayers()
};
/* ---------- warstwy ----------
   Warstwa = kontener obiektów z własną widocznością/blokadą, do którego
   należy każdy kształt (shape.layer = id warstwy). Kolejność state.layers
   to z-order MIĘDZY warstwami (indeks 0 = najniżej); w obrębie jednej
   warstwy o kolejności nadal decyduje względna pozycja w state.shapes
   (patrz layeredShapes() w js/06-svg.js). Domyślnie wszystko ląduje w
   jednej warstwie — stare projekty (bez pola layers) i tak przez to
   przechodzą bez zauważalnej zmiany.
   Wywoływane po KAŻDYM wczytaniu/utworzeniu state (patrz PS_loadInto,
   loadProject, projectFromTemplate, applySelectedSheets) — jeden punkt
   prawdy dla migracji, żeby nie duplikować tej logiki w każdym miejscu. */
function ensureLayers(st) {
  st = st || state;
  if (!Array.isArray(st.layers) || !st.layers.length) {
    st.layers = [{ id: 'L1', name: (typeof t === 'function' ? t('layers.default') : 'Warstwa 1'), visible: true, locked: false }];
  }
  const validIds = new Set(st.layers.map(l => l.id));
  const fallback = st.layers[0].id;
  for (const s of st.shapes) if (!s.layer || !validIds.has(s.layer)) s.layer = fallback;
  return st;
}
/* kształty w kolejności RYSOWANIA (spód -> wierzch): grupowane wg pozycji
   ich warstwy w state.layers, a w obrębie tej samej warstwy — wg względnej
   pozycji w state.shapes (sort stabilny, więc to tylko przegrupowanie
   między warstwami, nie zmienia kolejności wewnątrz jednej warstwy) */
function sortByLayer(shapes) {
  const order = new Map(state.layers.map((l, i) => [l.id, i]));
  return shapes.map((s, i) => ({ s, i }))
    .sort((a, b) => (order.get(a.s.layer) ?? 0) - (order.get(b.s.layer) ?? 0) || a.i - b.i)
    .map(x => x.s);
}
function layeredShapes() { return sortByLayer(state.shapes); }
function layerOf(s) { return state.layers.find(l => l.id === s.layer) || state.layers[0]; }
function isShapeEffectivelyHidden(s) { const l = layerOf(s); return !!s.hidden || !l || l.visible === false; }
function isShapeLayerLocked(s) { const l = layerOf(s); return !!(l && l.locked); }
const PAGES = {
  a4l: { w: 1123, h: 794 }, a4p: { w: 794, h: 1123 },
  hd: { w: 1600, h: 900 }, custom: {}, off: {}
};
let view = { x: 60, y: 60, z: 1 };
let sel = new Set();
let tool = 'select';
let lib = [];                    // biblioteka grup
let guides = [];                 // linie pomocnicze przyciągania
let previewRow = -1;             // -1 = brak podglądu wariantu
let clip = null;                 // wewnętrzny schowek kształtów
let spaceDown = false;
let matrixGap = 0;          // odstęp w układzie macierzowym
let rotStepOn = true;       // skokowe obracanie (co ROT_STEP°) — domyślnie włączone
let libFolders = [];        // nazwy folderów biblioteki (do segregacji)
let cropMode = null;        // id obrazka w trybie przycinania
let xlsxCropActive = false; // kreator kadru roboczego po imporcie XLSX (patrz js/15-xlsx.js)
let xlsxCropBox = null;     // {x,y,w,h} aktualnie rysowany/dostosowywany obszar kadru
let libCollapsed = {};      // zwinięte foldery biblioteki {nazwa:true}
const ROT_STEP = 10;        // krok skokowego obrotu
let currentProjectHandle = null;  // uchwyt pliku (zapis w miejscu, File System Access API)

/* ---------- ustawienia aplikacji + szablony ---------- */
let settings = { lang: 'pl', mxMaster: false, zoomDiv: 4, autosave: true, infiniteCanvasMargin: 16, xlsxAutoCrop: true,
  defaults: { font: 'Calibri', fs: 14, sw: 2, stroke: '#000000', fill: '#ffffff', tc: '#000000' },
  theme: { preset: 'dark', custom: {} } };   // preset = jedno z THEME_PRESETS (js/19-settings.js); custom = nadpisania per-zmienna CSS
let templates = [];         // [{name, shapes, vars, page}]
let imgCascade = 0;         // przesunięcie kolejnych wstawianych obrazów

