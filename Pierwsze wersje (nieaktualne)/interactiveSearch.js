#!/usr/bin/env node
/**
 * interactiveSearch.js
 *
 * Skrypt interaktywnego wyszukiwania utworów na Spotify i dodawania ich do playlisty.
 *
 * Funkcje:
 * 1. Pozwala wyszukiwać utwory według kryteriów: artysta, tytuł, rok (lub zakres lat), gatunek, kod kraju, minimalna popularność.
 * 2. Opcjonalnie umożliwia zastosowanie dodatkowych filtrów (za zgodą użytkownika): explicit (czy utwory z wulgaryzmami), valence (pozytywność emocjonalna), energy (intensywność), tempo (BPM), długość utworu.
 * 3. Wyniki wyszukiwania są posortowane malejąco według popularności i ponumerowane, przy czym duplikaty tytułów są zredukowane (pozostawiona najpopularniejsza wersja).
 * 4. Użytkownik może wybrać utwory z listy wyników do dodania na playlistę (ID playlisty pobierane z pliku config.json).
 * 5. Przy dodawaniu pomijane są utwory, które już znajdują się na playliście (unikane są duplikaty).
 * 6. Po dodaniu skrypt sprawdza, czy na playliście występują duplikaty (utwory o tej samej nazwie i tym samym artyście) i oferuje ich usunięcie.
 *
 * Wszystkie komunikaty i interakcje z użytkownikiem są w języku polskim.
 */
const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const SpotifyWebApi = require("spotify-web-api-node");
inquirer.registerPrompt(
  "autocomplete",
  require("inquirer-autocomplete-prompt")
);

// Wczytaj konfigurację i tokeny
const CONFIG_FILE = path.join(__dirname, "config.json");
const TOKENS_FILE = path.join(__dirname, "tokens.json");
const GENRES_FILE = path.join(__dirname, "genre-seeds.json");
if (!fs.existsSync(CONFIG_FILE) || !fs.existsSync(TOKENS_FILE)) {
  console.error("❌ Brak pliku config.json lub tokens.json");
  process.exit(1);
}
const { clientId, clientSecret, redirectUri, playlistId } = JSON.parse(
  fs.readFileSync(CONFIG_FILE, "utf8")
);
let { access_token, refresh_token, expires_at } = JSON.parse(
  fs.readFileSync(TOKENS_FILE, "utf8")
);

// Wczytaj listę gatunków dla podpowiedzi (jeśli dostępna)
let genreSeeds = [];
if (fs.existsSync(GENRES_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(GENRES_FILE, "utf8"));
    if (Array.isArray(data.genres)) {
      genreSeeds = data.genres;
    } else if (Array.isArray(data)) {
      genreSeeds = data;
    }
  } catch (err) {
    console.warn("⚠️ Nie udało się wczytać listy gatunków z genre-seeds.json");
  }
}
// Zamiana listy gatunków na małe litery dla łatwiejszego dopasowania (wyświetlanie oryginalne)
const genreSeedsLower = genreSeeds.map((g) => g.toLowerCase());

// Inicjalizacja Spotify API
const spotifyApi = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
spotifyApi.setAccessToken(access_token);
spotifyApi.setRefreshToken(refresh_token);

// Funkcja odświeżająca token dostępu jeśli wygasł
async function ensureToken() {
  if (Date.now() > (expires_at || 0) - 60_000) {
    // odśwież na minutę przed wygaśnięciem
    process.stdout.write("🔄 Odświeżam token dostępu... ");
    try {
      const data = await spotifyApi.refreshAccessToken();
      access_token = data.body.access_token;
      expires_at = Date.now() + data.body.expires_in * 1000;
      spotifyApi.setAccessToken(access_token);
      // Zapisz nowy token i czas wygaśnięcia do pliku
      fs.writeFileSync(
        TOKENS_FILE,
        JSON.stringify({ access_token, refresh_token, expires_at }, null, 2)
      );
      console.log(
        `✔ Token odświeżony (ważny do ${new Date(expires_at).toISOString()})`
      );
    } catch (err) {
      console.error("❌ Błąd odświeżania tokena:", err.body || err);
      process.exit(1);
    }
  } else {
    console.log(`🔒 Token ważny do ${new Date(expires_at).toISOString()}`);
  }
}

// Funkcja pobierająca wszystkie utwory z playlisty
async function fetchAllExisting() {
  console.log(`🚩 Używam playlisty ID = ${playlistId}`);
  const existingSet = new Set();
  const playlistTracks = [];
  let offset = 0;
  let index = 0;
  while (true) {
    await ensureToken();
    let res;
    try {
      res = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit: 100,
      });
    } catch (err) {
      console.error("❌ Błąd pobierania utworów z playlisty:", err.body || err);
      process.exit(1);
    }
    const items = res.body.items;
    if (!items || !Array.isArray(items)) {
      console.error(
        "❌ Nieoczekiwany format odpowiedzi przy pobieraniu playlisty:",
        res.body
      );
      break;
    }
    if (items.length === 0) {
      break;
    }
    // Dodaj utwory do listy i zbioru
    for (let i = 0; i < items.length; i++) {
      const trackObj = items[i].track;
      if (trackObj && trackObj.uri) {
        existingSet.add(trackObj.uri);
        // Zachowaj podstawowe informacje o utworze do wykrycia duplikatów (nazwa, artyści, uri, pozycja)
        playlistTracks.push({
          name: trackObj.name,
          artists: trackObj.artists.map((a) => a.name),
          uri: trackObj.uri,
          pos: index,
        });
        index++;
      }
    }
    offset += items.length;
    if (items.length < 100) {
      break;
    }
  }
  console.log(
    `ℹ Pobrano utwory z playlisty (łącznie ${playlistTracks.length})`
  );
  return { existingSet, playlistTracks };
}

// Funkcja pomocnicza do pobrania cech audio wielu utworów (valence, energy, tempo)
async function getAudioFeatures(trackIds) {
  let features = [];
  // Spotify API pozwala na max 100 ID w jednym wywołaniu
  for (let i = 0; i < trackIds.length; i += 100) {
    await ensureToken();
    const chunk = trackIds.slice(i, i + 100);
    let res;
    try {
      res = await spotifyApi.getAudioFeaturesForTracks(chunk);
    } catch (err) {
      console.error("❌ Błąd pobierania audio features:", err.body || err);
      return null;
    }
    if (res.body && res.body.audio_features) {
      features = features.concat(res.body.audio_features);
    }
  }
  return features;
}

// Funkcja do dodawania utworów do playlisty (w partiach, obsługa limitu 100 i ewentualnego 429)
async function addTracksInBatches(uris) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < uris.length; i += BATCH_SIZE) {
    const chunk = uris.slice(i, i + BATCH_SIZE);
    console.log(
      `🚀 Dodawanie utworów (${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        uris.length / BATCH_SIZE
      )}) – ${chunk.length} utworów`
    );
    await ensureToken();
    while (true) {
      try {
        const res = await spotifyApi.addTracksToPlaylist(playlistId, chunk);
        console.log(
          `✔ Dodano ${chunk.length} utwór(ów) (snapshot=${res.body.snapshot_id})`
        );
        break;
      } catch (err) {
        if (err.statusCode === 429) {
          const retry = parseInt(err.headers["retry-after"], 10) || 1;
          console.warn(
            `⏱ Otrzymano 429 (Rate Limit), czekam ${retry} sekund...`
          );
          await new Promise((r) => setTimeout(r, retry * 1000));
          // po pauzie spróbuj ponownie (while loop)
        } else {
          console.error(
            "❌ Błąd dodawania utworów do playlisty:",
            err.body || err
          );
          process.exit(1);
        }
      }
    }
  }
}

// Główna funkcja programu
(async () => {
  // Najpierw pobierz kryteria wyszukiwania od użytkownika
  const searchQuestions = [
    {
      type: "input",
      name: "artist",
      message: "Podaj nazwę artysty (lub Enter aby pominąć):",
      filter: (input) => input.trim(),
    },
    {
      type: "input",
      name: "track",
      message: "Podaj tytuł utworu (lub Enter aby pominąć):",
      filter: (input) => input.trim(),
    },
    {
      type: "input",
      name: "year",
      message:
        "Podaj rok lub zakres lat (YYYY lub YYYY-YYYY, Enter aby pominąć):",
      filter: (input) => input.trim(),
      validate: (input) => {
        if (!input) return true;
        const valid = /^\d{4}(-\d{4})?$/.test(input);
        return valid
          ? true
          : "Wprowadź rok w formacie YYYY lub zakres lat YYYY-YYYY";
      },
    },
    {
      type: "autocomplete",
      name: "genres",
      message:
        "Podaj gatunek muzyczny (możesz wpisać kilka oddzielonych przecinkami, Tab dla podpowiedzi, Enter aby pominąć):",
      when: () => genreSeeds.length > 0,
      suggestOnly: true,
      // Funkcja źródłowa dla podpowiedzi gatunków
      source: (answersSoFar, input) => {
        if (!input || input.trim() === "") {
          // jeśli nic nie wpisano, pokaż kilka przykładowych
          return Promise.resolve(genreSeeds.slice(0, 10));
        }
        const query = input.toLowerCase();
        // jeżeli wpisano kilka gatunków rozdzielonych przecinkiem, podpowiadaj dla ostatniego fragmentu
        const parts = query.split(",").map((p) => p.trim());
        const lastPart = parts[parts.length - 1];
        const suggestions = genreSeeds.filter((g) =>
          g.toLowerCase().includes(lastPart)
        );
        return Promise.resolve(suggestions.slice(0, 10));
      },
      validate: (input) => {
        if (!input) return true;
        // Waliduj każdy podany gatunek
        const genres = input
          .split(",")
          .map((g) => g.trim())
          .filter((g) => g);
        for (const g of genres) {
          if (!genreSeedsLower.includes(g.toLowerCase())) {
            return `Nieznany gatunek: ${g}`;
          }
        }
        return true;
      },
    },
    {
      type: "input",
      name: "genres", // w przypadku braku pliku gatunków lub wpisu bez podpowiedzi
      message:
        "Podaj gatunek muzyczny (lub kilka po przecinku, Enter aby pominąć):",
      when: () => genreSeeds.length === 0,
      filter: (input) => input.trim(),
    },
    {
      type: "input",
      name: "country",
      message: "Podaj kod kraju (2-literowy, np. PL, Enter aby pominąć):",
      filter: (input) => input.trim(),
      validate: (input) => {
        if (!input) return true;
        return /^[A-Za-z]{2}$/.test(input)
          ? true
          : "Wprowadź dwuliterowy kod kraju (ISO 3166-1)";
      },
    },
    {
      type: "input",
      name: "popularity",
      message: "Podaj minimalną popularność (0-100, Enter aby pominąć):",
      filter: (input) => input.trim(),
      validate: (input) => {
        if (!input) return true;
        const num = Number(input);
        return !isNaN(num) && num >= 0 && num <= 100
          ? true
          : "Wprowadź liczbę 0-100";
      },
    },
  ];

  // Pętla pytań aż do podania przynajmniej jednego kryterium
  let criteria;
  while (true) {
    criteria = await inquirer.prompt(searchQuestions);
    const { artist, track, year, genres, country, popularity } = criteria;
    if (
      artist ||
      track ||
      year ||
      (genres && genres !== "") ||
      country ||
      popularity
    ) {
      break;
    }
    console.log(
      "Musisz podać przynajmniej jedno kryterium wyszukiwania (np. artysta, tytuł, rok, gatunek itp.)"
    );
  }

  // Zapytaj o dodatkowe filtry audio (explicit, valence, energy, tempo, długość)
  const advAnswers = await inquirer.prompt([
    {
      type: "confirm",
      name: "useAdvanced",
      message:
        "Czy chcesz zastosować dodatkowe filtry (explicit/valence/energy/tempo/długość)?",
      default: false,
    },
  ]);
  let advanced = {};
  if (advAnswers.useAdvanced) {
    advanced = await inquirer.prompt([
      {
        type: "confirm",
        name: "allowExplicit",
        message: "Czy dozwolić utwory z wulgaryzmami (explicit lyrics)?",
        default: true,
      },
      {
        type: "input",
        name: "valence",
        message:
          "Minimalna pozytywność utworu (valence 0.0-1.0, Enter aby pominąć):",
        filter: (input) => input.trim(),
        validate: (input) => {
          if (!input) return true;
          const num = Number(input);
          return !isNaN(num) && num >= 0 && num <= 1
            ? true
            : "Wprowadź wartość 0.0 - 1.0 lub pozostaw puste.";
        },
      },
      {
        type: "input",
        name: "energy",
        message: "Minimalna energia utworu (0.0-1.0, Enter aby pominąć):",
        filter: (input) => input.trim(),
        validate: (input) => {
          if (!input) return true;
          const num = Number(input);
          return !isNaN(num) && num >= 0 && num <= 1
            ? true
            : "Wprowadź wartość 0.0 - 1.0 lub pozostaw puste.";
        },
      },
      {
        type: "input",
        name: "tempoMin",
        message: "Minimalne tempo utworu (BPM, Enter aby pominąć):",
        filter: (input) => input.trim(),
        validate: (input) => {
          if (!input) return true;
          return !isNaN(Number(input))
            ? true
            : "Wprowadź liczbę całkowitą BPM lub pozostaw puste.";
        },
      },
      {
        type: "input",
        name: "tempoMax",
        message: "Maksymalne tempo utworu (BPM, Enter aby pominąć):",
        filter: (input) => input.trim(),
        validate: (input) => {
          if (!input) return true;
          return !isNaN(Number(input))
            ? true
            : "Wprowadź liczbę całkowitą BPM lub pozostaw puste.";
        },
      },
      {
        type: "input",
        name: "maxDuration",
        message:
          "Maksymalna długość utworu (mm:ss lub sekundy, Enter aby pominąć):",
        filter: (input) => input.trim(),
        validate: (input) => {
          if (!input) return true;
          const str = input.trim();
          if (/^\d+:\d{2}$/.test(str)) {
            return true;
          }
          if (!isNaN(Number(str))) {
            return true;
          }
          return "Podaj czas w formacie mm:ss lub jako liczbę sekund.";
        },
      },
    ]);
  } else {
    // Ustaw domyślne wartości gdy filtry zaawansowane nie są używane
    advanced = {
      allowExplicit: true,
      valence: "",
      energy: "",
      tempoMin: "",
      tempoMax: "",
      maxDuration: "",
    };
  }

  // Budowanie zapytania wyszukiwania do Spotify
  let queryParts = [];
  if (criteria.track) {
    // Ujęcie tytułu w cudzysłów dla dokładniejszego dopasowania
    queryParts.push(`track:"${criteria.track}"`);
  }
  if (criteria.artist) {
    queryParts.push(`artist:"${criteria.artist}"`);
  }
  if (criteria.year) {
    queryParts.push(`year:${criteria.year}`);
  }
  if (criteria.genres) {
    const genreInput = criteria.genres;
    if (genreInput) {
      const genreList = genreInput
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g);
      if (genreList.length === 1) {
        queryParts.push(`genre:"${genreList[0]}"`);
      } else if (genreList.length > 1) {
        // Połącz wiele gatunków za pomocą OR w zapytaniu
        const orQuery = genreList.map((g) => `genre:"${g}"`).join(" OR ");
        queryParts.push(`(${orQuery})`);
      }
    }
  }
  // Zbuduj końcowe zapytanie
  let query = queryParts.join(" ");
  if (!query) {
    query = "*";
  }

  // Wykonaj wyszukiwanie utworów na Spotify
  await ensureToken();
  let searchRes;
  try {
    searchRes = await spotifyApi.searchTracks(query, {
      market: criteria.country || undefined,
      limit: 50,
    });
  } catch (err) {
    console.error("❌ Błąd wyszukiwania utworów:", err.body || err);
    return;
  }
  const tracks = searchRes.body.tracks;
  let results = tracks.items || [];
  const totalFound = tracks.total || results.length;
  console.log(
    `🔎 Pobrano ${results.length} wyników ${
      totalFound > results.length ? `(z ~${totalFound} znalezionych)` : ""
    } dla zapytania: ${query}`
  );

  // Jeśli podano nazwę artysty, odfiltruj utwory, które nie są dokładnie tego wykonawcy
  if (criteria.artist) {
    const artistLower = criteria.artist.toLowerCase();
    const beforeCount = results.length;
    results = results.filter((item) =>
      item.artists.some((a) => a.name.toLowerCase() === artistLower)
    );
    const afterCount = results.length;
    const removedByArtist = beforeCount - afterCount;
    if (removedByArtist > 0) {
      console.log(
        `ℹ Odjęto ${removedByArtist} utworów innych wykonawców (pozostało ${afterCount} utworów dokładnie wykonawcy "${criteria.artist}")`
      );
    }
  }

  // Usuń duplikaty wyników o tej samej nazwie utworu (zostaw tylko najbardziej popularny)
  const uniqueByName = [];
  const seenNames = new Set();
  for (const item of results) {
    const nameKey = item.name.toLowerCase();
    if (!seenNames.has(nameKey)) {
      seenNames.add(nameKey);
      uniqueByName.push(item);
    } else {
      // Jeśli kolejny wynik ma ten sam tytuł – sprawdź popularność i ewentualnie zamień
      const existingIndex = uniqueByName.findIndex(
        (x) => x.name.toLowerCase() === nameKey
      );
      if (
        existingIndex !== -1 &&
        item.popularity > uniqueByName[existingIndex].popularity
      ) {
        uniqueByName[existingIndex] = item;
      }
    }
  }
  const removedDupTitles = results.length - uniqueByName.length;
  results = uniqueByName;
  if (removedDupTitles > 0) {
    console.log(
      `ℹ Usunięto ${removedDupTitles} duplikatów tytułów (pozostało ${results.length} unikalnych utworów)`
    );
  }

  // Filtrowanie po minimalnej popularności
  if (criteria.popularity) {
    const minPop = Number(criteria.popularity);
    const beforeCount = results.length;
    results = results.filter((item) => item.popularity >= minPop);
    const afterCount = results.length;
    const removedPop = beforeCount - afterCount;
    if (removedPop > 0) {
      console.log(
        `ℹ Odjęto ${removedPop} utworów o popularności mniejszej niż ${minPop} (pozostało ${afterCount} utworów)`
      );
    }
  }

  // Filtrowanie utworów explicit (jeśli nie dozwolone)
  if (!advanced.allowExplicit) {
    const beforeCount = results.length;
    results = results.filter((item) => !item.explicit);
    const afterCount = results.length;
    const removedExplicit = beforeCount - afterCount;
    if (removedExplicit > 0) {
      console.log(
        `ℹ Odjęto ${removedExplicit} utworów oznaczonych jako explicit (pozostało ${afterCount} utworów)`
      );
    }
  }

  // Filtrowanie po długości utworu (maksymalna długość)
  let maxDurationSeconds = null;
  if (advanced.maxDuration) {
    const durInput = advanced.maxDuration.trim();
    if (durInput) {
      if (/^\d+:\d{2}$/.test(durInput)) {
        const [mm, ss] = durInput.split(":").map(Number);
        maxDurationSeconds = mm * 60 + ss;
      } else if (!isNaN(Number(durInput))) {
        maxDurationSeconds = Number(durInput);
      }
    }
    if (maxDurationSeconds != null) {
      const beforeCount = results.length;
      results = results.filter((item) => {
        const durSec = Math.floor((item.duration_ms || 0) / 1000);
        return durSec <= maxDurationSeconds;
      });
      const afterCount = results.length;
      const removedLength = beforeCount - afterCount;
      if (removedLength > 0) {
        console.log(
          `ℹ Odjęto ${removedLength} utworów dłuższych niż ${maxDurationSeconds} sekund (pozostało ${afterCount} utworów)`
        );
      }
    }
  }

  // Filtrowanie po valence, energy, tempo – wymaga pobrania cech audio utworów
  const needAudioFeatures =
    (advanced.valence && advanced.valence !== "") ||
    (advanced.energy && advanced.energy !== "") ||
    (advanced.tempoMin && advanced.tempoMin !== "") ||
    (advanced.tempoMax && advanced.tempoMax !== "");
  let audioFeaturesMap = {};
  if (needAudioFeatures && results.length > 0) {
    const ids = results.map((item) => item.id);
    const featuresArr = await getAudioFeatures(ids);
    if (featuresArr) {
      for (const feat of featuresArr) {
        if (feat && feat.id) {
          audioFeaturesMap[feat.id] = feat;
        }
      }
    }
    // Usuń utwory, dla których nie uzyskaliśmy cech audio
    results = results.filter((item) => audioFeaturesMap[item.id]);
    // Filtruj wg valence
    if (advanced.valence) {
      const minVal = parseFloat(advanced.valence);
      if (!isNaN(minVal)) {
        const beforeCount = results.length;
        results = results.filter((item) => {
          const feat = audioFeaturesMap[item.id];
          return feat && feat.valence >= minVal;
        });
        const afterCount = results.length;
        const removedVal = beforeCount - afterCount;
        if (removedVal > 0) {
          console.log(
            `ℹ Odjęto ${removedVal} utworów o valence poniżej ${minVal} (pozostało ${afterCount} utworów)`
          );
        }
      }
    }
    // Filtruj wg energy
    if (advanced.energy) {
      const minEnergy = parseFloat(advanced.energy);
      if (!isNaN(minEnergy)) {
        const beforeCount = results.length;
        results = results.filter((item) => {
          const feat = audioFeaturesMap[item.id];
          return feat && feat.energy >= minEnergy;
        });
        const afterCount = results.length;
        const removedEnergy = beforeCount - afterCount;
        if (removedEnergy > 0) {
          console.log(
            `ℹ Odjęto ${removedEnergy} utworów o energii poniżej ${minEnergy} (pozostało ${afterCount} utworów)`
          );
        }
      }
    }
    // Filtruj wg tempo
    const tempoMin = advanced.tempoMin ? Number(advanced.tempoMin) : null;
    const tempoMax = advanced.tempoMax ? Number(advanced.tempoMax) : null;
    if (tempoMin || tempoMax) {
      const beforeCount = results.length;
      results = results.filter((item) => {
        const feat = audioFeaturesMap[item.id];
        if (!feat) return false;
        const tempo = feat.tempo;
        if (tempoMin && tempo < tempoMin) return false;
        if (tempoMax && tempo > tempoMax) return false;
        return true;
      });
      const afterCount = results.length;
      const removedTempo = beforeCount - afterCount;
      if (removedTempo > 0) {
        if (tempoMin != null && tempoMax != null) {
          console.log(
            `ℹ Odjęto ${removedTempo} utworów poza zakresem tempa ${tempoMin}-${tempoMax} BPM (pozostało ${afterCount} utworów)`
          );
        } else if (tempoMin != null) {
          console.log(
            `ℹ Odjęto ${removedTempo} utworów o tempie poniżej ${tempoMin} BPM (pozostało ${afterCount} utworów)`
          );
        } else if (tempoMax != null) {
          console.log(
            `ℹ Odjęto ${removedTempo} utworów o tempie powyżej ${tempoMax} BPM (pozostało ${afterCount} utworów)`
          );
        }
      }
    }
  }

  // Po wszystkich filtracjach:
  if (results.length === 0) {
    console.log("🔎 Brak utworów spełniających podane kryteria.");
  }

  // Posortuj wyniki malejąco wg popularności
  results.sort((a, b) => b.popularity - a.popularity);

  // ——————————————————————————————————————————————————————————————
  //  Pobierz istniejące utwory z playlisty, żeby oznaczyć je prefixem
  const { existingSet, playlistTracks } = await fetchAllExisting();

  // ——————————————————————————————————————————————————————————————
  //  Przygotuj wypoziomowane kolumny dla checkbox:
  const MAX_TITLE = 30;
  const MAX_ARTIST = 20;
  const POP_WIDTH = 3;

  const choices = results.map((item, index) => {
    const isOn = existingSet.has(item.uri); // czy już na playliście
    const prefix = isOn ? "✔" : " "; // własny prefix
    const num = String(index + 1).padStart(2, " "); // numer  2 znaki
    // tytuł
    let title = item.name;
    if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE - 3) + "...";
    title = title.padEnd(MAX_TITLE, " ");
    // wykonawca
    let artists = item.artists.map((a) => a.name).join(", ");
    if (artists.length > MAX_ARTIST)
      artists = artists.slice(0, MAX_ARTIST - 3) + "...";
    artists = artists.padEnd(MAX_ARTIST, " ");
    // popularność
    const pop = String(item.popularity).padStart(POP_WIDTH, " ");
    // dopisek „już na playliście”
    const suffix = isOn ? " (już na playliście)" : "";

    return {
      name: `${prefix} ${num} ${title} - ${artists} Popularność: ${pop}${suffix}`,
      value: item.uri,
      // -> usunęliśmy całkowicie `disabled`, by nie pojawiał się „–” przed prefixem
    };
  });

  // ——————————————————————————————————————————————————————————————
  //  Checkbox z przewijaniem w obie strony
  const { toAdd } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "toAdd",
      message:
        "Wybierz utwory do dodania na playlistę (spacja = zaznacz, Enter = zatwierdź):",
      choices,
      pageSize: Math.min(choices.length, 20),
      loop: true,
    },
  ]);

  // ——————————————————————————————————————————————————————————————
  //  Zachowaj tylko nowe URI (te spoza existingSet)
  const toAddUris = toAdd.filter((uri) => !existingSet.has(uri));

  // Pomijaj URI, które już są na playliście (na wypadek niepoprawnego wyboru)
  toAddUris = toAddUris.filter((uri) => !existingSet.has(uri));

  if (toAddUris.length === 0) {
    if (results.length > 0) {
      console.log("ℹ Nie wybrano żadnych nowych utworów do dodania.");
    }
  } else {
    console.log(`ℹ Do dodania wybrano ${toAddUris.length} utwór(ów).`);
    // Dodaj utwory do playlisty
    await addTracksInBatches(toAddUris);
    // Zaktualizuj listę utworów na playliście (dodaj nowe do lokalnej listy)
    const startPos = playlistTracks.length;
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (toAddUris.includes(item.uri)) {
        playlistTracks.push({
          name: item.name,
          artists: item.artists.map((a) => a.name),
          uri: item.uri,
          pos:
            startPos + playlistTracks.filter((x) => x.pos >= startPos).length,
        });
      }
    }
  }

  // Wykrywanie duplikatów na playliście (ta sama nazwa + ci sami artyści)
  const dupGroups = {};
  for (const track of playlistTracks) {
    const nameArtistKey =
      track.name.toLowerCase() +
      "|" +
      track.artists
        .map((a) => a.toLowerCase())
        .sort()
        .join(",");
    if (!dupGroups[nameArtistKey]) {
      dupGroups[nameArtistKey] = [];
    }
    dupGroups[nameArtistKey].push(track);
  }
  const duplicates = [];
  for (const key in dupGroups) {
    if (dupGroups[key].length > 1) {
      // Posortuj według pozycji (rosnąco)
      dupGroups[key].sort((a, b) => a.pos - b.pos);
      duplicates.push(dupGroups[key]);
    }
  }
  if (duplicates.length === 0) {
    console.log(
      "ℹ Brak duplikatów utworów (o tej samej nazwie i artyście) na playliście."
    );
  } else {
    console.log("⚠️ Wykryto duplikaty na playliście:");
    for (const group of duplicates) {
      const track = group[0];
      const artistsStr = track.artists.join(", ");
      console.log(
        ` - "${track.name}" — ${artistsStr} (na playliście ${group.length}x)`
      );
    }
    const dupAnswer = await inquirer.prompt([
      {
        type: "confirm",
        name: "removeDups",
        message:
          "Czy chcesz usunąć z playlisty zduplikowane utwory? (Pozostanie po 1 z każdej grupy)",
        default: true,
      },
    ]);
    if (dupAnswer.removeDups) {
      // Przygotuj listę utworów do usunięcia
      let tracksToRemove = [];
      for (const group of duplicates) {
        // Zostaw pierwszy utwór w grupie, resztę usuń
        const keep = group[0];
        const keepUri = keep.uri;
        // Zbierz wystąpienia do usunięcia wg URI
        const occurrencesByUri = {};
        for (let j = 1; j < group.length; j++) {
          const tr = group[j];
          if (!occurrencesByUri[tr.uri]) {
            occurrencesByUri[tr.uri] = [];
          }
          occurrencesByUri[tr.uri].push(tr.pos);
        }
        // Usuń dodatkowe wystąpienia tego samego utworu (zachowanego) podając pozycje
        if (occurrencesByUri[keepUri]) {
          const positions = occurrencesByUri[keepUri];
          tracksToRemove.push({ uri: keepUri, positions: positions });
          delete occurrencesByUri[keepUri];
        }
        // Usuń wszystkie wystąpienia pozostałych utworów (innych wydań)
        for (const uri in occurrencesByUri) {
          tracksToRemove.push({ uri: uri });
        }
      }
      // Usuń utwory w jednej lub kilku partiach (jeśli >100)
      const BATCH_SIZE = 100;
      let removedCount = 0;
      for (let i = 0; i < tracksToRemove.length; i += BATCH_SIZE) {
        const chunk = tracksToRemove.slice(i, i + BATCH_SIZE);
        await ensureToken();
        while (true) {
          try {
            await spotifyApi.removeTracksFromPlaylist(playlistId, chunk);
            removedCount += chunk.length;
            break;
          } catch (err) {
            if (err.statusCode === 429) {
              const retry = parseInt(err.headers["retry-after"], 10) || 1;
              console.warn(
                `⏱ Otrzymano 429 przy usuwaniu, czekam ${retry} sekund...`
              );
              await new Promise((r) => setTimeout(r, retry * 1000));
            } else {
              console.error(
                "❌ Błąd usuwania duplikatów z playlisty:",
                err.body || err
              );
              break;
            }
          }
        }
      }
      console.log(
        `✔ Usunięto ${removedCount} zduplikowanych utworów z playlisty.`
      );
    }
  }

  console.log("✅ Zakończono.");
})();
