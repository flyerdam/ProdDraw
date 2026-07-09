"use strict";
/* ---------- zakładka Pomoc: instrukcje + skróty ---------- */
const HELP_HTML = {
  pl: `<div class="grp"><h4>Do czego to jest</h4><div class="hint">
    ProdRys — edytor rysunków/instrukcji produkcyjnych. Rysujesz kształty, dodajesz teksty i obrazy,
    układasz w macierz, robisz warianty tego samego rysunku i eksportujesz do PNG/JPG.</div></div>
    <div class="grp"><h4>Narzędzia (pasek z lewej)</h4><div class="hint">
    V zaznaczanie · R prostokąt · C elipsa · L linia · A strzałka · T tekst · S kształty (trójkąt, gwiazda,
    strzałki, zaokrąglony prostokąt…) · I obraz. Kolor pobierzesz pipetą wbudowaną w okno wyboru koloru.</div></div>
    <div class="grp"><h4>Skróty klawiszowe</h4><div class="hint">
    Ctrl+Z / Ctrl+Y — cofnij / ponów<br>Ctrl+C / Ctrl+V — kopiuj / wklej · Ctrl+D — duplikuj<br>
    Ctrl+A — zaznacz wszystko · Ctrl+G / Ctrl+Shift+G — grupuj / rozgrupuj<br>
    Ctrl+S — zapisz · Ctrl+O — otwórz · Delete — usuń<br>
    strzałki — przesuń o 1 px (Shift = 10 px)<br>+ / − — zoom · Spacja lub środkowy przycisk — przesuń płótno · kółko — zoom<br>
    Shift przy rysowaniu = kwadrat/koło; przy linii = co 45°.</div></div>
    <div class="grp"><h4>Rysowanie i rozmiar</h4><div class="hint">
    Wybierz narzędzie i przeciągnij po płótnie. Zaznaczony kształt ma uchwyty do skalowania.
    Przeciąganie ze snapem: „Przyciągaj do siatki" i „do obiektów" (dół ekranu). Podwójny klik = edycja tekstu.</div></div>
    <div class="grp"><h4>Tekst i czcionki</h4><div class="hint">
    2×klik na kształcie (prostokąt/elipsa/tekst/wielokąt) wpisuje tekst w środku. We Właściwościach: czcionka,
    rozmiar, kolor, <b>pogrubienie</b> i <i>kursywa</i>, pole „Treść".</div></div>
    <div class="grp"><h4>Obracanie i odbicie</h4><div class="hint">
    Złap pomarańczowy uchwyt nad kształtem. „skok 10°" (domyślnie wł.) obraca skokowo, Shift = co 15°.
    Kąt wpiszesz też ręcznie. Odbicie lustrzane: guziki ↔ / ↕ w sekcji Pozycja.</div></div>
    <div class="grp"><h4>Przycinanie zdjęć</h4><div class="hint">
    Zaznacz obraz → „Przytnij" → przeciągnij uchwyty ramki. Proporcje obrazu NIE zmieniają się.
    Esc lub „Gotowe" kończy, „Resetuj" przywraca cały obraz.</div></div>
    <div class="grp"><h4>Grupy</h4><div class="hint">
    Zwykły klik zaznacza całą grupę (przesuwanie/blokada). <b>Alt+klik</b> = pojedynczy obiekt w grupie,
    by zmienić jego kolor/tekst. Ctrl+G grupuje, Ctrl+Shift+G rozgrupowuje.</div></div>
    <div class="grp"><h4>Blokady (Właściwości)</h4><div class="hint">
    Osobno: Przesuwanie, Rozmiar+obrót, Wygląd (kolory), Edycja tekstu, oraz „Zablokuj wszystko".
    Przykład: zablokuj ruch+rozmiar+wygląd, zostaw tekst — obiekt stoi, ale treść dalej edytujesz.</div></div>
    <div class="grp"><h4>Wyrównanie i macierz</h4><div class="hint">
    Zaznacz 2+ kształty → guziki wyrównania (do lewej/środka/…). 3+ → rozłożenie równomierne.
    „Macierz" układa w tabelę; „Macierz + rozmiar" dodatkowo ujednolica komórki. „Odstęp siatki" ustawia luz.</div></div>
    <div class="grp"><h4>Warianty (zakładka Warianty)</h4><div class="hint">
    W tekstach użyj <b>{A}</b>, <b>{B}</b>… Dodaj zmienne i wiersze. Każdy wiersz = jeden rysunek z podstawionymi
    wartościami. „Podgląd" pokazuje wybrany wariant na płótnie. „Generuj" tworzy ZIP z PNG.<br>
    <b>Nazwa pliku:</b> puste = wartości złączone „_" (np. <i>10_20</i>). Wzór np. <b>{A}x{B}</b> → <i>10x20</i>.</div></div>
    <div class="grp"><h4>Biblioteka i foldery</h4><div class="hint">
    Zaznacz kształty → „Do biblioteki". Kliknij kafelek, aby wstawić. „+ Folder" tworzy folder, kafelek
    <b>przeciągnij</b> do folderu, klik nagłówka zwija folder.</div></div>
    <div class="grp"><h4>Szablony</h4><div class="hint">
    „Nowy" otwiera wybór szablonu (miniatury). Ustawienia → „Zapisz jako szablon" zapisuje bieżący rysunek;
    ta sama nazwa = pytanie o nadpisanie. Domyślny szablon też można nadpisać/usunąć.</div></div>
    <div class="grp"><h4>Ustawienia</h4><div class="hint">
    Język (PL/EN/DE), wolniejszy zoom (dla myszy z szybkim kółkiem), szerokość panelu, domyślne nowych
    kształtów (czcionka, rozmiar, grubość, kolory) oraz zapis/wczytanie konfiguracji.</div></div>
    <div class="grp"><h4>Import XLSX/XLSM</h4><div class="hint">
    Wczytuje kształty i obrazy z Excela (pozycje zachowane). Wybierasz co wstawić. Formaty EMF/WMF są
    pomijane — w Excelu wklejaj zrzuty jako bitmapę.</div></div>
    <div class="grp"><h4>Zapis i eksport</h4><div class="hint">
    „Zapisz" pisze do tego samego pliku (Chrome/Edge), „Zapisz jako" wybiera nowy. Eksport PNG/JPG działa tak
    samo (pamięta plik), szybki guzik = JPG. Pliki .pdraw/.json/.xlsx/.xlsm oraz obrazy przeciągniesz na okno.</div></div>`,
  en: `<div class="grp"><h4>What it is</h4><div class="hint">
    ProdRys — an editor for production drawings/instructions. Draw shapes, add text and images, arrange in a
    matrix, build variants of the same drawing and export to PNG/JPG.</div></div>
    <div class="grp"><h4>Tools (left rail)</h4><div class="hint">
    V select · R rectangle · C ellipse · L line · A arrow · T text · S shapes (triangle, star, arrows, rounded
    rectangle…) · I image. Pick colors with the eyedropper built into the color dialog.</div></div>
    <div class="grp"><h4>Keyboard shortcuts</h4><div class="hint">
    Ctrl+Z / Ctrl+Y — undo / redo<br>Ctrl+C / Ctrl+V — copy / paste · Ctrl+D — duplicate<br>
    Ctrl+A — select all · Ctrl+G / Ctrl+Shift+G — group / ungroup<br>
    Ctrl+S — save · Ctrl+O — open · Delete — delete<br>
    arrows — nudge 1 px (Shift = 10 px)<br>+ / − — zoom · Space or middle button — pan · wheel — zoom<br>
    Shift while drawing = square/circle; on a line = 45° steps.</div></div>
    <div class="grp"><h4>Drawing & sizing</h4><div class="hint">
    Pick a tool and drag on the canvas. A selected shape has resize handles. Snapping: “Snap to grid" and
    “to objects" (bottom bar). Double-click = edit text.</div></div>
    <div class="grp"><h4>Text & fonts</h4><div class="hint">
    Double-click a shape (rect/ellipse/text/polygon) to type text inside. In Properties: font, size, color,
    <b>bold</b> and <i>italic</i>, plus a “Content" field.</div></div>
    <div class="grp"><h4>Rotate & flip</h4><div class="hint">
    Grab the orange handle above a shape. “step 10°" (on by default) rotates in steps, Shift = 15°.
    You can type the angle too. Mirror: ↔ / ↕ buttons in the Position section.</div></div>
    <div class="grp"><h4>Cropping images</h4><div class="hint">
    Select an image → “Crop" → drag the frame handles. Image proportions do NOT change.
    Esc or “Done" finishes, “Reset" restores the full image.</div></div>
    <div class="grp"><h4>Groups</h4><div class="hint">
    A normal click selects the whole group (move/lock). <b>Alt+click</b> = a single object inside the group,
    to change its color/text. Ctrl+G groups, Ctrl+Shift+G ungroups.</div></div>
    <div class="grp"><h4>Locks (Properties)</h4><div class="hint">
    Separate: Moving, Size+rotation, Appearance (colors), Text editing, plus “Lock everything".
    Example: lock move+size+appearance, leave text — the object stays put but text stays editable.</div></div>
    <div class="grp"><h4>Align & matrix</h4><div class="hint">
    Select 2+ shapes → align buttons (left/center/…). 3+ → even distribution. “Matrix" lays out a table;
    “Matrix + resize" also equalizes cells. “Grid gap" sets the spacing.</div></div>
    <div class="grp"><h4>Variants (Variants tab)</h4><div class="hint">
    In texts use <b>{A}</b>, <b>{B}</b>… Add variables and rows. Each row = one drawing with values substituted.
    “Preview" shows the chosen variant. “Generate" builds a ZIP of PNGs.<br>
    <b>File name:</b> empty = values joined with “_" (e.g. <i>10_20</i>). Pattern like <b>{A}x{B}</b> → <i>10x20</i>.</div></div>
    <div class="grp"><h4>Library & folders</h4><div class="hint">
    Select shapes → “To library". Click a tile to insert. “+ Folder" creates a folder, <b>drag</b> a tile into
    a folder, click a header to collapse.</div></div>
    <div class="grp"><h4>Templates</h4><div class="hint">
    “New" opens a template picker (thumbnails). Settings → “Save as template" stores the current drawing;
    same name = overwrite prompt. The default template can be overwritten/deleted too.</div></div>
    <div class="grp"><h4>Settings</h4><div class="hint">
    Language (PL/EN/DE), slower zoom (for fast wheels), panel width, defaults for new shapes (font, size,
    line width, colors), and save/load configuration.</div></div>
    <div class="grp"><h4>XLSX/XLSM import</h4><div class="hint">
    Imports shapes and images from Excel (positions kept). You pick what to insert. EMF/WMF are skipped —
    in Excel paste screenshots as bitmaps.</div></div>
    <div class="grp"><h4>Save & export</h4><div class="hint">
    “Save" writes the same file (Chrome/Edge), “Save as" picks a new one. PNG/JPG export works the same
    (remembers the file), quick button = JPG. Drop .pdraw/.json/.xlsx/.xlsm or images onto the window.</div></div>`,
  de: `<div class="grp"><h4>Wozu</h4><div class="hint">
    ProdRys — Editor für Produktionszeichnungen/-anweisungen. Formen zeichnen, Text und Bilder hinzufügen,
    in Matrix anordnen, Varianten derselben Zeichnung erstellen und als PNG/JPG exportieren.</div></div>
    <div class="grp"><h4>Werkzeuge (linke Leiste)</h4><div class="hint">
    V Auswahl · R Rechteck · C Ellipse · L Linie · A Pfeil · T Text · S Formen (Dreieck, Stern, Pfeile,
    abgerundetes Rechteck…) · I Bild. Farben mit der Pipette im Farbdialog wählen.</div></div>
    <div class="grp"><h4>Tastenkürzel</h4><div class="hint">
    Strg+Z / Strg+Y — rückgängig / wiederholen<br>Strg+C / Strg+V — kopieren / einfügen · Strg+D — duplizieren<br>
    Strg+A — alles wählen · Strg+G / Strg+Umschalt+G — gruppieren / aufheben<br>
    Strg+S — speichern · Strg+O — öffnen · Entf — löschen<br>
    Pfeile — 1 px (Umschalt = 10 px)<br>+ / − — Zoom · Leertaste/Mitteltaste — schieben · Rad — Zoom<br>
    Umschalt beim Zeichnen = Quadrat/Kreis; bei Linie = 45°-Schritte.</div></div>
    <div class="grp"><h4>Zeichnen & Größe</h4><div class="hint">
    Werkzeug wählen und auf der Fläche ziehen. Gewählte Form hat Griffe. Einrasten: „Am Raster" und
    „An Objekten" (untere Leiste). Doppelklick = Text bearbeiten.</div></div>
    <div class="grp"><h4>Text & Schriften</h4><div class="hint">
    Form doppelklicken (Rechteck/Ellipse/Text/Polygon) für Text in der Mitte. In Eigenschaften: Schrift,
    Größe, Farbe, <b>fett</b> und <i>kursiv</i>, Feld „Inhalt".</div></div>
    <div class="grp"><h4>Drehen & Spiegeln</h4><div class="hint">
    Orangefarbenen Griff über der Form fassen. „Schritt 10°" (standard an), Umschalt = 15°. Winkel auch
    eintippbar. Spiegeln: ↔ / ↕ im Bereich Position.</div></div>
    <div class="grp"><h4>Bilder zuschneiden</h4><div class="hint">
    Bild wählen → „Zuschneiden" → Rahmengriffe ziehen. Proportionen ändern sich NICHT.
    Esc oder „Fertig" beendet, „Zurücksetzen" stellt das ganze Bild wieder her.</div></div>
    <div class="grp"><h4>Gruppen</h4><div class="hint">
    Normaler Klick wählt die ganze Gruppe (Verschieben/Sperren). <b>Alt+Klick</b> = einzelnes Objekt in der
    Gruppe, um Farbe/Text zu ändern. Strg+G gruppiert, Strg+Umschalt+G hebt auf.</div></div>
    <div class="grp"><h4>Sperren (Eigenschaften)</h4><div class="hint">
    Getrennt: Verschieben, Größe+Drehung, Aussehen (Farben), Textbearbeitung, plus „Alles sperren".
    Beispiel: Verschieben+Größe+Aussehen sperren, Text lassen — Objekt bleibt, Text bleibt bearbeitbar.</div></div>
    <div class="grp"><h4>Ausrichten & Matrix</h4><div class="hint">
    2+ Formen wählen → Ausrichtbuttons. 3+ → gleichmäßig verteilen. „Matrix" ordnet als Tabelle;
    „Matrix + Größe" vereinheitlicht Zellen. „Rasterabstand" setzt den Abstand.</div></div>
    <div class="grp"><h4>Varianten (Reiter Varianten)</h4><div class="hint">
    In Texten <b>{A}</b>, <b>{B}</b>… verwenden. Variablen und Zeilen hinzufügen. Jede Zeile = eine Zeichnung mit
    eingesetzten Werten. „Vorschau" zeigt die Variante. „Generieren" baut ein ZIP mit PNGs.<br>
    <b>Dateiname:</b> leer = Werte mit „_" (z. B. <i>10_20</i>). Muster wie <b>{A}x{B}</b> → <i>10x20</i>.</div></div>
    <div class="grp"><h4>Bibliothek & Ordner</h4><div class="hint">
    Formen wählen → „In Bibliothek". Kachel klicken zum Einfügen. „+ Ordner" erstellt einen Ordner, Kachel in
    einen Ordner <b>ziehen</b>, Kopf klicken zum Einklappen.</div></div>
    <div class="grp"><h4>Vorlagen</h4><div class="hint">
    „Neu" öffnet die Vorlagenauswahl (Miniaturen). Einstellungen → „Als Vorlage speichern"; gleicher Name =
    Überschreiben-Abfrage. Standardvorlage ist ebenfalls überschreib-/löschbar.</div></div>
    <div class="grp"><h4>Einstellungen</h4><div class="hint">
    Sprache (PL/EN/DE), langsamerer Zoom, Panelbreite, Vorgaben für neue Formen (Schrift, Größe, Stärke,
    Farben) und Konfiguration speichern/laden.</div></div>
    <div class="grp"><h4>XLSX/XLSM-Import</h4><div class="hint">
    Importiert Formen und Bilder aus Excel (Positionen erhalten). Auswahl, was eingefügt wird. EMF/WMF werden
    übersprungen — in Excel Screenshots als Bitmap einfügen.</div></div>
    <div class="grp"><h4>Speichern & Export</h4><div class="hint">
    „Speichern" schreibt dieselbe Datei (Chrome/Edge), „Speichern unter" wählt eine neue. PNG/JPG-Export
    ebenso (merkt sich die Datei), Schnell-Button = JPG. .pdraw/.json/.xlsx/.xlsm oder Bilder aufs Fenster ziehen.</div></div>`
};
