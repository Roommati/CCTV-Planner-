**NoNinjaTV - CCTV Planner \& AI Optimizer**

**Profesjonalne, lekkie narzędzie webowe do projektowania systemów monitoringu wizyjnego, oparte na standardzie DORI i autorskich algorytmach optymalizacji rozstawienia kamer.**



**O Projekcie**

**NoNinjaTV zostało stworzone, aby wypełnić lukę między prostymi programami graficznymi a skomplikowanymi kombajnami CAD. Narzędzie pozwala w kilka minut przygotować profesjonalny projekt rozmieszczenia kamer, obliczyć realne pokrycie terenu i wygenerować ofertę dla klienta.**





**Kluczowe cechy:** 

**-Silnik Fizyczny 2D: Realistyczne renderowanie pola widzenia z uwzględnieniem przeszkód (ściany, okna, drzwi).**

**-Standard DORI: Wizualizacja stref (Identyfikacja, Rozpoznanie, Obserwacja, Detekcja) zgodnie z normą EN 62676-4.**

**-AI Optimizer: Algorytmy Brute Force oraz Heurystyka (Rój), które automatycznie sugerują najlepsze kąty i pozycje kamer.**

**-Profesjonalny Workflow: Interfejs podzielony na logiczne etapy: Architektura -> Logika stref -> Monitoring -> Oferta.**

**-Smart Selection: System zaznaczania prostokątem (Marquee) z obsługą skrótów klawiszowych (Ctrl, Delete).**



**Stack Techniczny:**



**-Frontend: Vanilla JavaScript (ES6+), HTML5 Canvas API.**

**-Stylizacja: CSS3 (Custom Properties, Flexbox, Grid).**

**-Algorytmy: Implementacja własna (Heurystyka inspirowana Simulated Annealing).**

**-Infrastruktura (Planowana): Azure Static Web Apps, GitHub Actions (CI/CD).**





**Sterowanie i Skróty Klawiszowe**



**Klawisz,Akcja**

**Spacja,Szybkie włączenie/wyłączenie głównego narzędzia w danym kroku**

**LPM (klik w obiekt),Zaznaczenie pojedynczego obiektu**

**LPM (przeciągnięcie),Zaznaczanie wielu obiektów prostokątem (Marquee)**

**CTRL + LPM,Dodawanie/usuwanie obiektów z grupy zaznaczenia**

**DELETE / Backspace,Usunięcie zaznaczonych obiektów**

**SHIFT (podczas rysowania),Wymuszenie równych kątów (snapping co 15°)**

**Kółko myszy,Zoom In / Zoom Out**

**Prawy Przycisk Myszy,Anulowanie aktualnej akcji**

**CTRL + Z,Cofnij (Undo)**





**Klawisz,Akcja**

**Spacja,Szybkie włączenie/wyłączenie głównego narzędzia w danym kroku**

**LPM (klik w obiekt),Zaznaczenie pojedynczego obiektu**

**LPM (przeciągnięcie),Zaznaczanie wielu obiektów prostokątem (Marquee)**

**CTRL + LPM,Dodawanie/usuwanie obiektów z grupy zaznaczenia**

**DELETE / Backspace,Usunięcie zaznaczonych obiektów**

**SHIFT (podczas rysowania),Wymuszenie równych kątów (snapping co 15°)**

**Kółko myszy,Zoom In / Zoom Out**

**Prawy Przycisk Myszy,Anulowanie aktualnej akcji**

**CTRL + Z,Cofnij (Undo)**



**Roadmapa Rozwoju**

**Faza 1: Fundament i UX (W TOKU)**

**\[x] Silnik Canvas i fizyka światła.**



**\[x] System DORI i modele kamer.**



**\[x] Przebudowa UI na system zakładek (Workflow).**



**\[x] System masowego zaznaczania i usuwania.**



**\[x] (Następny krok) Tryb Przeszkód i Stref Priorytetowych (PoI).**



**Faza 2: Narzędzia Sprzedażowe (Ready to Sell)**

**\[ ] Wgrywanie podkładów (Google Maps / JPG).**



**\[ ] Moduł okablowania (Pseudo 2.5D - obliczanie metrów bieżących).**



**\[ ] Koszyk ofertowy (edycja zestawienia przed eksportem).**



**\[ ] Generator raportów PDF i eksport do Excel (BOM).**



**Faza 3: Przewaga Technologiczna (AI 2.0)**

**\[ ] Trening sieci neuronowej (TensorFlow.js) na danych syntetycznych.**



**\[ ] Lekki podgląd 3D (Three.js) – spacer po obiekcie i widok z oka kamery.**







**Logika DORI (Skala projektu)**

**W aplikacji przyjęto przelicznik 1 metr = 100 pikseli.**



**Identyfikacja (Red): > 250 px/m (Pewność co do tożsamości).**



**Rozpoznanie (Yellow): > 125 px/m (Rozpoznanie znajomej osoby).**



**Obserwacja (Green): > 62 px/m (Widoczne szczegóły ubioru).**



**Detekcja (Blue): > 25 px/m (Wykrycie obecności człowieka).**



**Autor: \[Mateusz Strojek/InforMatik]**

**Wersja: 0.4.2 (Development)**







