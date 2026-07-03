# ProdDraw

Jednoplikowy edytor wektorowy do instrukcji produkcyjnych — działa w całości w przeglądarce, bez serwera.

---

## Gdzie przechowywane są dane?

Wszystko jest trzymane **lokalnie w przeglądarce** (localStorage), czyli oddzielnie w Chrome, Firefox, Edge itd.

| Klucz localStorage | Zawartość |
|--------------------|-----------|
| `prodrys_auto` | Autozapis bieżącego projektu (kształty + warianty + format strony); odtwarzany przy następnym otwarciu |
| `prodrys_lib` | Biblioteka grup — elementy zapisane przyciskiem „Do biblioteki" |
| `prodrys_template` | Domyślny szablon nowego projektu (zapisany przyciskiem **Szablon ↓**); jeśli brak, używany jest wbudowany szablon A4 |

### Wbudowane elementy biblioteki
Domyślne elementy biblioteki (`Linia wymiarowa`, `Balon nr części`) są zdefiniowane w funkcji `defaultLibItems()` w kodzie źródłowym i odświeżane przy każdym uruchomieniu.

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

## Układ macierzowy — odstęp i zmiana rozmiaru

W panelu Właściwości (przy zaznaczeniu ≥ 2 kształtów):

- **Odstęp siatki** — odstęp między komórkami układu macierzowego (domyślnie 0). Niezależny od przyciągania do siatki.
- **Macierz** — układa kształty w tabelę bez zmiany rozmiarów.
- **Macierz + rozmiar** — jak wyżej, dodatkowo wyrównuje rozmiary:
  - każdy **wiersz** dostaje jednolitą wysokość (= max wysokość w tym wierszu),
  - każda **kolumna** dostaje jednolitą szerokość (= max szerokość w tej kolumnie).
  
  Kształty nie są przycinane — tylko powiększane do wymaganego wymiaru.

---

## Wdrożenie (Netlify i inne)

Aplikacja to jeden plik HTML — wdrożenie jest trywialne.

### Netlify (zalecane)

1. Utwórz konto na [netlify.com](https://netlify.com).
2. Przeciągnij i upuść folder projektu na stronę [app.netlify.com/drop](https://app.netlify.com/drop).
3. Gotowe — plik `netlify.toml` w repozytorium skieruje ruch z `/` na `ProdDraw.html`.

Alternatywnie: połącz repozytorium GitHub z Netlify (Sites → Add new site → Import from Git).

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
