# Spotify CLI

**Interfejs wiersza poleceń do zarządzania playlistami Spotify**

---

## Spis treści

1. [Opis projektu](#opis-projektu)  
2. [Funkcjonalności](#funkcjonalności)  
3. [Struktura katalogów](#struktura-katalogów)  
4. [Wymagania wstępne](#wymagania-wstępne)  
5. [Konfiguracja](#konfiguracja)  
   - [1. Utworzenie pliku `config.json`](#1-utworzenie-plikaconfigjson)  
   - [2. Uzyskanie i wstawienie tokenów OAuth](#2-uzyskanie-i-wstawienie-tokenów-oauth)  
   - [3. (Opcjonalnie) Ustawienie zmiennych środowiskowych `.env`](#3-opcjonalnie-ustawienie-zmiennych-środowiskowych-env)  
6. [Instalacja i uruchomienie](#instalacja-i-uruchomienie)  
7. [Przykłady użycia](#przykłady-użycia)  
8. [Zabezpieczenia i dobre praktyki](#zabezpieczenia-i-dobre-praktyki)  
9. [Testy jednostkowe (opcjonalnie)](#testy-jednostkowe-opcjonalnie)  
10. [Kontakt](#kontakt)  

---

## Opis projektu

Ten projekt to **Spotify CLI** – prosty, modułowy interfejs wiersza poleceń (Node.js) do:

- Wybierania / tworzenia / usuwania playlist  
- Wyszukiwania piosenek według różnych kryteriów (artysta, tytuł, rok, gatunek itp.)  
- Filtrowania rezultatów (popularność, explicit, audio features)  
- Dodawania znalezionych utworów do wybranej playlisty  
- Usuwania utworów z playlisty  
- Usuwania duplikatów w playlistach  
- Sortowania utworów w playlistach  

Całość jest zbudowana modułowo – każdy blok funkcjonalności znajduje się w osobnym pliku w folderze `commands/`.  

---

## Funkcjonalności

1. **Wyszukiwanie utworów**  
   - Użytkownik podaje co najmniej jeden warunek (artysta, tytuł, rok, gatunek, min. popularność).  
   - Możliwość wybrania liczby wyników (max do 200).  
   - Filtrowanie explict/valence/energy/tempo/długość (opcjonalne).  
   - Rezultaty sortowane malejąco według popularności.  
   - Usuwanie duplikatów wyników (tylko najpopularniejsza wersja tytułu).  
   - Oznaczenie w prompt’cie utworów już znajdujących się w playliście.  
   - Możliwość „zaznaczenia wszystkich nowych utworów” (pomijając te z ✔).  
   - Podsumowanie wybranych utworów przed faktycznym dodaniem.  

2. **Wyszukiwanie artystów / zespołów**  
   - Wyszukiwanie artystów na podstawie nazwy lub gatunku.  
   - Pobranie dostępnych informacji o artyście (dane profilu, top tracki, powiązani wykonawcy).  

3. **Usuwanie duplikatów z playlisty**  
   - Pobiera całą playlistę i grupuje utwory po kombinacji nazwa + lista wykonawców.  
   - W każdej grupie duplikatów pozostawia ten o mniejszej pozycji (`pos`) i usuwa resztę.  

4. **Sortowanie utworów w playliście**  
   - Możliwość posortowania playlisty według nazwy utworu, nazwy wykonawcy lub popularności.  
   - Zapisanie kolejności (modyfikuje playlistę na Spotify).  

5. **Usuwanie wybranych utworów z playlisty**  
   - Interaktywny prompt z checkboxami, listą utworów (tytuł – wykonawca).  
   - Potwierdzenie przed usunięciem.  

6. **Zarządzanie playlistami (tworzenie / usuwanie / zmiana)**  
   - Wyświetlenie listy wszystkich playlist użytkownika Google OAuth (z podziałem na sekcje).  
   - Utworzenie nowej playlisty (podanie nazwy, opcjonalny opis).  
   - Usunięcie (unfollow) istniejącej playlisty (z potwierdzeniem).  
   - Zmiana aktywnej playlisty (zapisywana do `config.json`, aby kolejne komendy wiedziały, na której pracować).  

---

## Struktura katalogów

/.
├── README.md
├── package.json
├── package-lock.json
├── .gitignore
├── config.example.json # Przykładowy plik konfiguracyjny (bez sekretów)
├── tokens.example.json # Przykładowy plik tokenów (bez prawdziwych tokenów)
├── .env.example # Przykład pliku .env (jeśli wykorzystujesz zmienne środowiskowe)
├── spotifyClient.js # Moduł do obsługi API Spotify (tokeny, fetchAllExisting, addTracksBatch itp.)
├── index.js # Punkt wejścia – główne menu i pętla aplikacji
├── genre-seeds.json # Lista gatunków do autouzupełniania w wyszukiwarkach
└── commands/
├── selectPlaylist.js # Wybór / utworzenie / usunięcie playlisty
├── searchTracks.js # Wyszukiwanie i dodawanie utworów
├── searchArtists.js # Wyszukiwanie i pobieranie informacji o artystach
├── removeDuplicates.js # Usuwanie duplikatów w aktywnej playliście
├── sortPlaylist.js # Sortowanie utworów w playliście
├── removeTracks.js # Usuwanie wybranych utworów z playlisty
└── … (ew. inne moduły)



> **Uwaga**:  
> - Pliki `config.json` oraz `tokens.json` NIE znajdują się w repozytorium (znajdują się w `.gitignore`).  
> - W repozytorium umieszczone są tylko pliki przykładowe: `config.example.json`, `tokens.example.json`, `.env.example`.  

---

## Wymagania wstępne

- **Node.js** w wersji ≥ 14.x (zalecane 16+).  
- **npm** (zwykle instaluje się razem z Node.js).  
- Konto deweloperskie Spotify (zakładka [Dashboard](https://developer.spotify.com/dashboard/))  
  - Ustawione aplikacje OAuth (Redirect URI, clientId, clientSecret).  
- Podstawowa wiedza o Git/GitHub, terminalu/wierszu poleceń.  

---

## Konfiguracja

### 1. Utworzenie pliku `config.json`

1. Sklonuj repozytorium lokalnie (lub pobierz z GitHuba):

   ```bash
   git clone git@github.com:TwojeKonto/spotify-cli.git
   cd spotify-cli


Sklonuj przykładowy plik config.example.json do nowego config.json:
cp config.example.json config.json

Otwórz config.json i wypełnij pola swoimi wartościami:
{
  "clientId": "<TWÓJ_SPOTIFY_CLIENT_ID>",
  "clientSecret": "<TWÓJ_SPOTIFY_CLIENT_SECRET>",
  "redirectUri": "<TWÓJ_REDIRECT_URI>",               // np. "http://localhost:8888/callback"
  "playlistId": "<DOMYŚLNA_PLAYLISTA_DO_OPERACJI>"    // np. "9d3QZF1DaXcBWIG42soYBM5"
}


Uzyskanie tokenów OAuth i wstawienie do tokens.json
Spotify (OAuth 2.0) wymaga utworzenia access_token i refresh_token. W repo dostępny jest przykładowy skrypt authorize.js (lub analogiczny), który pozwala:


Skopiuj tokens.example.json → tokens.json:
cp tokens.example.json tokens.json

Upewnij się, że w config.json są poprawnie wpisane:

clientId
clientSecret
redirectUri

Uruchom odpowiedni skrypt autoryzacyjny (zależnie od implementacji – przykład poniżej zakłada, że masz scripts/authorize.js
node scripts/authorize.js

Instalacja i uruchomienie

Zainstaluj zależności:
npm install


Upewnij się, że masz w katalogu:

config.json (z wypełnionymi danymi z kroku 1)
tokens.json (z wypełnionymi tokenami z kroku 2)


Uruchom główną aplikację:

node index.js


