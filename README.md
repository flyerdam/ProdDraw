# ProdDraw

Edytor wektorowy do instrukcji produkcyjnych — działa w całości w przeglądarce (lub na desktopie via Electron), bez serwera.

---

## Struktura projektu i architektura

Projekt został refaktoryzowany z jednoplikowego HTML na modularną strukturę:

- **`index.html`** — główny punkt wejścia; otwórz ten plik podczas tworzenia.
- **`css/styles.css`** — wszystkie style aplikacji.
- **`js/*.js`** — logika aplikacji podzielona na moduły (01-state.js, projects.js, 02-i18n.js, ... 21-init.js). Są to zwykłe skrypty (classic scripts) ładowane w określonej kolejności; współdzielą globalny scope. Brak kroku budowania — wystarczy otworzyć `index.html` lub serwować folder.
- **`ProdDraw.html`** — WYGENEROWANY plik jednoplikowy (bundle) stworzony z powyższych źródeł. Utrzymywany dla łatwego wdrożenia na Netlify. **NIE edytuj tego ręcznie** — zamiast tego przebuduj go za pomocą `node build-single.js`.

---

## Gdzie przechowywane są dane?

Wszystko jest trzymane **lokalnie w przeglądarce** (localStorage), czyli oddzielnie w Chrome, Firefox, Edge itd.

| Klucz localStorage | Zawartość |
|--------------------|-----------|
| `prodrys_auto:<n>` | Autozapis projektu w danej karcie (kształty + warianty + format strony); każda karta ma własny slot (n = 1, 2, 3, ...). Odtwarzany przy następnym otwarciu. |
| `prodrys_live` | Rejestr aktywnych kart (heartbeat); śledzi które sloty są w użyciu. |
| `prodrys_lib` | Biblioteka grup — elementy zapisane przyciskiem „Do biblioteki" |
| `prodrys_template` | Domyślny szablon nowego projektu (zapisany przyciskiem **Szablon ↓**); jeśli brak, używany jest wbudowany szablon A4 |

### Wbudowane elementy biblioteki
Domyślne elementy biblioteki (`Linia wymiarowa`, `Balon nr części`) są zdefiniowane w funkcji `defaultLibItems()` w kodzie źródłowym i odświeżane przy każdym uruchomieniu.

---

## Wiele projektów — autosave z wieloma kartami

Wcześniej wszystkie karty przeglądarki dzieliły jedno pole autosave (`prodrys_auto`), co powodowało, że otwieranie aplikacji w kilka kartach unieważniało dane z poprzednich kart. 

**Teraz każda karta otrzymuje własny slot autosave** (`prodrys_auto:1`, `prodrys_auto:2`, ...), dzięki czemu możesz pracować nad różnymi projektami jednocześnie w kilka kartach/okienach — nie będą się już nawzajem zmieniać. Sloty są śledzone poprzez rejestr `prodrys_live` w localStorage; zamknięcie karty powoduje zwolnienie slotu do ponownego wykorzystania.

**Migracja**: stare dane `prodrys_auto` są automatycznie przenoszone do slotu 1 przy pierwszym uruchomieniu.

---

## Przenoszenie danych między przeglądarkami

Dane są oddzielne w każdej przeglądarce. Rozwiązanie „jaskiniowca":

1. **Projekt + biblioteka** — użyj przycisku **Zapisz projekt** → `.json`. Plik zawiera kształty *i* bibliotekę. Po otwarciu w innej przeglądarce (**Otwórz**) biblioteka zostanie scalona.

2. **Tylko ustawienia (biblioteka + szablon)** — użyj przycisków w pasku:
   - **Ustaw. ↓** — eksportuje bibliotekę i domyślny szablon do pliku `prodrys_ustawienia.json`
   - **Ustaw. ↑** — importuje ten plik w innej przeglądarce

---

## Domyślny wygląd nowego projektu

1. Ustaw kanwę tak, jak powinna wyglądać każdy nowy projekt (format strony, elementy tła itp.).
2. Kliknij **Szablon ↓** na pasku narzędzi.
3. Od tej pory **Nowy** będzie otwierał projekt z tym szablonem.

Szablon jest przechowywany w `prodrys_template` w localStorage. Przeniesiesz go razem z biblioteką używając **Ustaw. ↓ / Ustaw. ↑**.

---

## Aplikacja desktopowa (Electron)

Projekt zawiera konfigurację Electron do uruchamiania na pulpicie:

### Uruchomienie

1. **Jedna jedyna instalacja**:
   ```bash
   npm install
   ```

2. **Uruchom aplikację desktopową**:
   ```bash
   npm start
   ```
   Spowoduje otwarcie okna Electron z aplikacją.

### Budowanie instalatora

- **Windows**:
  ```bash
  npm run dist:win
  ```
  Generuje instalator w folderze `dist-electron/`.

### Pliki Electrona

- **`electron/main.js`** — proces główny Electrona.
- **`electron/preload.js`** — skrypt preload do komunikacji między contextami.

---

## Układ macierzowy — odstęp i zmiana rozmiaru

W panelu Właściwości (przy zaznaczeniu ≥ 2 kształtów):

- **Odstęp siatki** — odstęp między komórkami układu macierzowego (domyślnie 0). Niezależny od przyciągania do siatki.
- **Macierz** — układa kształty w tabelę bez zmiany rozmiarów.
- **Macierz + rozmiar** — jak wyżej, dodatkowo wyrównuje rozmiary:
  - każdy **wiersz** dostaje jednolitą wysokość (= max wysokość w tym wierszu),
  - każda **kolumna** dostaje jednolitą szerokość (= max szerokość w tej kolumnie).
  
  Kształty nie są przycinane — tylko powiększane do wymaganego wymiaru.

---

## Budowanie bundla jednoplikowego

Aby przebudować `ProdDraw.html` z modularnych źródeł:

```bash
node build-single.js
```

lub

```bash
npm run build:single
```

Spowoduje wygenerowanie `ProdDraw.html` z zawartością `index.html`, `css/` i `js/`. Skrypt łączy wszystkie moduły w jeden plik gotowy do wdrożenia.

---

## Wdrożenie (Netlify i inne)

Aplikacja może być wdrażana jako modułowa struktura folderów lub jako jednoplikowy bundle (`ProdDraw.html`).

### Netlify (zalecane)

1. Utwórz konto na [netlify.com](https://netlify.com).
2. Najpierw przebuduj bundle jednoplikowy: `node build-single.js`
3. Przeciągnij i upuść folder projektu na stronę [app.netlify.com/drop](https://app.netlify.com/drop).
4. Gotowe — plik `netlify.toml` w repozytorium skieruje ruch z `/` na `ProdDraw.html`.

Alternatywnie: połącz repozytorium GitHub z Netlify (Sites → Add new site → Import from Git). GitHub Actions mogą automatycznie budować bundle przy każdym push'u.

### GitHub Pages

1. W ustawieniach repozytorium → Pages → Source: Deploy from branch → `main`, folder `/`.
2. Utwórz plik `index.html` z przekierowaniem:
   ```html
   <!doctype html><meta http-equiv="refresh" content="0;url=ProdDraw.html">
   ```

### Dowolny serwer statyczny / CDN

Wystarczy serwować plik `ProdDraw.html` jako `text/html`. Nie są potrzebne żadne frameworki ani zależności zewnętrzne.

---

## Skróty klawiszowe

| Klawisz | Akcja |
|---------|-------|
| V | Zaznaczanie |
| R | Prostokąt |
| C | Elipsa |
| L | Linia |
| A | Strzałka |
| T | Tekst |
| I | Wstaw obraz |
| 2× klik | Edycja tekstu w kształcie |
| Del / Backspace | Usuń zaznaczone |
| Ctrl+Z / Ctrl+Y | Cofnij / Ponów |
| Ctrl+C / Ctrl+D | Kopiuj / Duplikuj |
| Ctrl+A | Zaznacz wszystko |
| Ctrl+G / Ctrl+Shift+G | Grupuj / Rozgrupuj |
| Ctrl+S | Zapisz projekt |
| Spacja / środkowy przycisk | Panoramowanie |
| Kółko myszy | Zoom |
