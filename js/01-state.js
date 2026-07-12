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
  shapes: [],                    // kolejność = z-order (0 = spód)
  vars: { cols: [], rows: [] },  // warianty
  page: { mode: 'a4l', w: 1123, h: 794 }, // format kanwy; mode 'off' = nieskończona
};
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
let settings = { lang: 'pl', mxMaster: false, zoomDiv: 4, sideW: 272, autosave: true, infiniteCanvasMargin: 16, xlsxAutoCrop: true,
  defaults: { font: 'Calibri', fs: 14, sw: 2, stroke: '#000000', fill: '#ffffff', tc: '#000000' } };
let templates = [];         // [{name, shapes, vars, page}]
let imgCascade = 0;         // przesunięcie kolejnych wstawianych obrazów

