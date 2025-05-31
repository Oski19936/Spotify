const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const chalk = require("chalk");
inquirer.registerPrompt(
  "autocomplete",
  require("inquirer-autocomplete-prompt")
);

const {
  spotifyApi,
  ensureToken,
  fetchAllExisting,
  getAudioFeatures,
  addTracksInBatches,
} = require("../spotifyClient");

const GENRES_FILE = path.join(__dirname, "..", "genre-seeds.json");
let genreSeeds = [];
try {
  if (fs.existsSync(GENRES_FILE)) {
    const raw = JSON.parse(fs.readFileSync(GENRES_FILE, "utf8"));
    genreSeeds = Array.isArray(raw.genres)
      ? raw.genres
      : Array.isArray(raw)
      ? raw
      : [];
  }
} catch {
  console.warn(
    chalk.hex("#a020f0")("ℹ️  Nie udało się wczytać genre-seeds.json")
  );
}
const genreSeedsLower = genreSeeds.map((g) => g.toLowerCase());

const { playlistId } = require(path.join(__dirname, "..", "config.json"));

function printGenres(genres) {
  const perLine = 5;
  let lines = [];
  for (let i = 0; i < genres.length; i += perLine) {
    lines.push(
      genres
        .slice(i, i + perLine)
        .map((g) => chalk.cyan(g))
        .join("   ")
    );
  }
  return lines.join("\n");
}

async function reviewAndConfirm(
  selectedUris,
  results,
  showYear,
  showGenres,
  userGenre
) {
  while (true) {
    console.clear();
    console.log(chalk.bold("🔎   Twoja lista wybranych utworów:"));
    selectedUris.forEach((uri, idx) => {
      const t = results.find((r) => r.uri === uri);
      const title = t.name;
      const artist = t.artists.map((a) => a.name).join(", ");
      let row = `${String(idx + 1).padStart(2)}. ${title} — ${artist}`;
      if (showYear) {
        const year =
          t.album && t.album.release_date
            ? t.album.release_date.slice(0, 4)
            : "----";
        row += ` | Rok: ${year}`;
      }
      if (showGenres) {
        const foundGenre = t._filtered_genre || "-";
        row += ` | Gatunek: ${foundGenre}`;
        if (t._all_genres && t._all_genres.length > 1) {
          row += " (...)";
        }
      }
      row += ` | Popularność: ${t.popularity ?? "--"}`;
      console.log(row);
    });

    let extraChoices = [];
    if (
      showGenres &&
      results.some((r) => r._all_genres && r._all_genres.length > 1)
    ) {
      extraChoices = [
        new inquirer.Separator(),
        {
          name: "🔍 Zobacz wszystkie gatunki dla wybranego utworu",
          value: "view_genres",
        },
      ];
    }

    const { action } = await inquirer.prompt({
      type: "list",
      name: "action",
      message: "Co dalej?",
      choices: [
        { name: "1) Dodaj WSZYSTKIE te utwory na playlistę", value: "add" },
        { name: "2) Zmodyfikuj wybór (odznacz niechciane)", value: "modify" },
        { name: "3) Powrót do menu głównego (porzuć listę)", value: "cancel" },
        ...extraChoices,
      ],
      pageSize: 4 + extraChoices.length,
      loop: false,
    });

    if (action === "add") {
      console.log(
        chalk.hex("#a020f0")(`ℹ Dodaję ${selectedUris.length} utworów…`)
      );
      await addTracksInBatches(playlistId, selectedUris);
      console.log(chalk.hex("#a020f0")("✔ Dodano, wracam do menu."));
      return;
    }

    if (action === "cancel") {
      console.log(
        chalk.hex("#a020f0")("ℹ Anulowano operację, wracam do menu.")
      );
      return;
    }

    if (action === "view_genres") {
      const { whichTrack } = await inquirer.prompt({
        type: "list",
        name: "whichTrack",
        message: "Wybierz utwór:",
        choices: selectedUris.map((uri, idx) => {
          const t = results.find((r) => r.uri === uri);
          return {
            name: `${String(idx + 1).padStart(2)}. ${t.name} — ${t.artists
              .map((a) => a.name)
              .join(", ")}`,
            value: t.uri,
          };
        }),
        pageSize: Math.min(selectedUris.length, 20),
      });
      const t = results.find((r) => r.uri === whichTrack);
      if (t && t._all_genres && t._all_genres.length) {
        console.log(
          chalk.bold("\nWszystkie gatunki:") + "\n" + printGenres(t._all_genres)
        );
      } else {
        console.log(chalk.gray("\nBrak dodatkowych gatunków."));
      }
      await inquirer.prompt({
        type: "input",
        name: "_",
        message: chalk.gray("Naciśnij ENTER by wrócić"),
      });
      continue;
    }

    const modifyChoices = selectedUris.map((uri, i) => {
      const t = results.find((r) => r.uri === uri);
      let name = `${String(i + 1).padStart(2)}. ${t.name} — ${
        t.artists[0].name
      }`;
      if (showYear) {
        const year =
          t.album && t.album.release_date
            ? t.album.release_date.slice(0, 4)
            : "----";
        name += ` | Rok: ${year}`;
      }
      if (showGenres) {
        const foundGenre = t._filtered_genre || "-";
        name += ` | Gatunek: ${foundGenre}`;
        if (t._all_genres && t._all_genres.length > 1) {
          name += " (...)";
        }
      }
      name += ` | Popularność: ${t.popularity ?? "--"}`;
      return {
        name,
        value: uri,
        checked: true,
      };
    });
    modifyChoices.unshift(
      new inquirer.Separator(),
      {
        name: "↩  Powrót bez zmian",
        value: "__BACK__",
      },
      new inquirer.Separator()
    );

    const { newSelection } = await inquirer.prompt({
      type: "checkbox",
      name: "newSelection",
      message: "Odznacz utwory, których NIE chcesz dodawać:",
      choices: modifyChoices,
      pageSize: Math.min(modifyChoices.length, 20),
      loop: false,
    });

    if (newSelection.includes("__BACK__")) {
      return await reviewAndConfirm(
        selectedUris,
        results,
        showYear,
        showGenres,
        userGenre
      );
    }

    selectedUris = newSelection;
    if (selectedUris.length === 0) {
      console.log(chalk.hex("#a020f0")("ℹ Lista jest pusta, wracam do menu."));
      return;
    }
  }
}

module.exports = async function searchTracks() {
  const { desiredCount } = await inquirer.prompt({
    type: "input",
    name: "desiredCount",
    message:
      chalk.cyan("Ile wyników chcesz pobrać?") +
      chalk.gray(" (max 200, domyślnie 100):"),
    validate: (i) => {
      if (!i) return true;
      const n = Number(i);
      return n > 0 && n <= 200 ? true : "Podaj liczbę 1–200";
    },
  });
  const MAX = desiredCount ? Math.min(200, Number(desiredCount)) : 100;
  const PAGE = 50;

  const baseQ = [
    {
      type: "input",
      name: "artist",
      message: chalk.cyan("Artysta") + chalk.gray(" (ENTER=pomiń):"),
      filter: (i) => i.trim(),
    },
    {
      type: "input",
      name: "track",
      message: chalk.cyan("Tytuł") + chalk.gray(" (ENTER=pomiń):"),
      filter: (i) => i.trim(),
    },
    {
      type: "input",
      name: "year",
      message:
        chalk.cyan("Rok lub zakres YYYY lub YYYY-YYYY") +
        chalk.gray(" (ENTER=pomiń):"),
      filter: (i) => i.trim(),
      validate: (i) =>
        !i || /^\d{4}(-\d{4})?$/.test(i) || "Format YYYY lub YYYY-YYYY",
    },
    {
      type: "autocomplete",
      name: "genres",
      message:
        chalk.cyan("Gatunki") + chalk.gray(" (TAB=podpowiedzi, ENTER=pomiń):"),
      when: () => genreSeeds.length > 0,
      suggestOnly: true,
      source: (_, input) => {
        const q = (input || "").toLowerCase();
        return Promise.resolve(
          q
            ? genreSeeds.filter((g) => g.toLowerCase().includes(q)).slice(0, 10)
            : genreSeeds.slice(0, 10)
        );
      },
      validate: (i) => {
        if (!i) return true;
        const bad = i
          .split(",")
          .map((s) => s.trim())
          .filter((g) => !genreSeedsLower.includes(g.toLowerCase()));
        return bad.length ? `Nieznane gatunki: ${bad.join(",")}` : true;
      },
    },
    {
      type: "input",
      name: "genres",
      message: chalk.cyan("Gatunki") + chalk.gray(" (ENTER=pomiń):"),
      when: () => genreSeeds.length === 0,
      filter: (i) => i.trim(),
    },
    {
      type: "input",
      name: "popularity",
      message:
        chalk.cyan("Min. popularność 0–100") + chalk.gray(" (ENTER=pomiń):"),
      filter: (i) => i.trim(),
      validate: (i) =>
        !i || (!isNaN(i) && +i >= 0 && +i <= 100) || "Liczba 0–100",
    },
  ];

  let criteria;
  do {
    criteria = await inquirer.prompt(baseQ);
    if (
      criteria.artist ||
      criteria.track ||
      criteria.year ||
      criteria.genres ||
      criteria.popularity
    ) {
      break;
    }
    console.log(
      chalk.hex("#a020f0")("❗ Musisz podać przynajmniej jedno kryterium.")
    );
  } while (true);

  const showYear = Boolean(criteria.year);
  const showGenres = Boolean(criteria.genres);
  const userGenre = criteria.genres
    ? criteria.genres.split(",")[0].trim().toLowerCase()
    : null;

  const { useAdvanced } = await inquirer.prompt({
    type: "confirm",
    name: "useAdvanced",
    message:
      chalk.cyan("Dodatkowe filtry?") +
      chalk.gray(" (explicit/valence/energy/tempo/długość)"),
    default: false,
  });
  let adv = {};
  if (useAdvanced) {
    adv = await inquirer.prompt([
      {
        type: "confirm",
        name: "allowExplicit",
        message: "Dozwól utwory explicit?",
        default: true,
      },
      {
        type: "input",
        name: "valence",
        message: "Min. valence 0.0–1.0 (ENTER=pomiń):",
        filter: (i) => i.trim(),
        validate: (i) => !i || (!isNaN(i) && +i >= 0 && +i <= 1) || "0.0–1.0",
      },
      {
        type: "input",
        name: "energy",
        message: "Min. energy 0.0–1.0 (ENTER=pomiń):",
        filter: (i) => i.trim(),
        validate: (i) => !i || (!isNaN(i) && +i >= 0 && +i <= 1) || "0.0–1.0",
      },
      {
        type: "input",
        name: "tempoMin",
        message: "Min. tempo [BPM] (ENTER=pomiń):",
        filter: (i) => i.trim(),
        validate: (i) => !i || !isNaN(i) || "liczba BPM",
      },
      {
        type: "input",
        name: "tempoMax",
        message: "Max. tempo [BPM] (ENTER=pomiń):",
        filter: (i) => i.trim(),
        validate: (i) => !i || !isNaN(i) || "liczba BPM",
      },
      {
        type: "input",
        name: "maxDuration",
        message: "Max długość (mm:ss lub sek., ENTER=pomiń):",
        filter: (i) => i.trim(),
        validate: (i) =>
          !i || /^\d+:\d{2}$/.test(i) || !isNaN(i) || "mm:ss lub liczba sek.",
      },
    ]);
  } else {
    adv = {
      allowExplicit: true,
      valence: "",
      energy: "",
      tempoMin: "",
      tempoMax: "",
      maxDuration: "",
    };
  }

  // ---- SEARCH LOGIC ----

  let results = [];
  let total = 0;

  // 1) Szukaj po roku, dopiero potem filtruj po gatunku (jeśli oba podano)
  let q = [];
  if (criteria.track) q.push(`track:"${criteria.track}"`);
  if (criteria.artist) q.push(`artist:"${criteria.artist}"`);
  if (criteria.year) q.push(`year:${criteria.year}`);
  let searchQuery = q.join(" ");
  if (!searchQuery) searchQuery = "*";

  await ensureToken();
  console.log(
    chalk.hex("#a020f0")(`🔍 Wysyłam searchTracks: "${searchQuery}"`)
  );

  try {
    let first = await spotifyApi.searchTracks(searchQuery, {
      limit: PAGE,
      offset: 0,
    });
    total = first.body.tracks.total;
    results = first.body.tracks.items || [];
    for (let off = PAGE; off < Math.min(total, 1000); off += PAGE) {
      if (results.length >= MAX) break;
      await ensureToken();
      const page = await spotifyApi.searchTracks(searchQuery, {
        limit: PAGE,
        offset: off,
      });
      results.push(...(page.body.tracks.items || []));
    }
  } catch (e) {
    console.error(chalk.hex("#a020f0")("❌ Błąd fetchowania:"), e.message || e);
    return;
  }

  // FILTR PO GATUNKU (po pobraniu!)
  if (criteria.genres) {
    const genreToMatch = userGenre;
    // Pobierz artystów w batchach
    const artistIds = [
      ...new Set(
        results.flatMap((track) =>
          (track.artists || []).map((a) => a.id).filter(Boolean)
        )
      ),
    ].slice(0, 500); // limit Spotify API

    let artistGenresMap = {};
    for (let i = 0; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      await ensureToken();
      let arts;
      try {
        arts = await spotifyApi.getArtists(batch);
      } catch (e) {
        arts = { body: { artists: [] } };
      }
      (arts.body.artists || []).forEach((a) => {
        if (a && a.id) artistGenresMap[a.id] = a.genres || [];
      });
    }

    // Oznacz filtr i wyświetl tylko utwory, których przynajmniej jeden artysta ma wybrany gatunek
    results = results.filter((track) => {
      const genres = (track.artists || []).flatMap(
        (a) => artistGenresMap[a.id] || []
      );
      track._all_genres = [...new Set(genres)];
      // Jeśli user wybrał konkretny gatunek, szukamy go wśród wszystkich
      track._filtered_genre = track._all_genres.find(
        (g) => g.toLowerCase() === genreToMatch
      );
      return track._filtered_genre;
    });
  }

  // FILTR PO POPULARNOŚCI (opcjonalnie)
  if (criteria.popularity) {
    results = results.filter((t) => t.popularity >= +criteria.popularity);
  }

  // Sortuj po popularności
  results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (results.length > MAX) {
    results = results.slice(0, MAX);
  }

  if (!results.length) {
    console.log(
      chalk.hex("#a020f0")("🔎 Brak utworów spełniających kryteria.")
    );
    return;
  } else if (results.length < MAX) {
    console.log(
      chalk.yellow(
        `⚠️  Znaleziono tylko ${results.length} utworów spełniających kryteria.`
      )
    );
  }

  // 6) Pobranie istniejących
  const { existingSet } = await fetchAllExisting(playlistId);

  // 7) Dynamiczne kolumny
  const MAX_T = 30,
    MAX_A = 20,
    W = 3;
  const trackChoices = results.map((it, i) => {
    const on = existingSet.has(it.uri);
    const prefix = on ? "✔" : " ";
    const num = String(i + 1).padStart(2, " ");
    let title =
      it.name.length > MAX_T ? it.name.slice(0, MAX_T - 3) + "…" : it.name;
    title = title.padEnd(MAX_T, " ");
    let art = it.artists.map((a) => a.name).join(", ");
    art = art.length > MAX_A ? art.slice(0, MAX_A - 3) + "…" : art;
    art = art.padEnd(MAX_A, " ");
    const pop = String(it.popularity).padStart(W, " ");
    let extra = "";
    if (showYear) {
      const year =
        it.album && it.album.release_date
          ? it.album.release_date.slice(0, 4)
          : "----";
      extra += ` Rok: ${year}`;
    }
    if (showGenres) {
      const g = it._filtered_genre || "-";
      extra += ` Gatunek: ${g}`;
      if (it._all_genres && it._all_genres.length > 1) {
        extra += " (...)";
      }
    }
    return {
      name: `${prefix} ${num} ${title} - ${art}${extra}   Popularność: ${pop}`,
      value: it.uri,
    };
  });

  const SELECT_ALL_NEW = "__SELECT_ALL_NEW__";
  const choices = [
    new inquirer.Separator("\u200B"),
    {
      name: "🗹  Zaznacz wszystkie nowe utwory",
      value: SELECT_ALL_NEW,
    },
    new inquirer.Separator(
      chalk.gray(
        "Legenda: " +
          chalk.bold("✔") +
          " = już na playliście, Popularność = score Spotify, Rok/Gatunek = kolumna jeśli użyty filtr, (...) = podgląd innych gatunków"
      )
    ),
    new inquirer.Separator("\u200B"),
    ...trackChoices,
  ];

  console.log("");
  const { toAdd } = await inquirer.prompt({
    type: "checkbox",
    name: "toAdd",
    message: "Wybierz utwory do dodania:",
    choices,
    pageSize: Math.min(choices.length, 20),
    loop: false,
  });

  let selectedUris = toAdd.includes(SELECT_ALL_NEW)
    ? results.map((it) => it.uri).filter((uri) => !existingSet.has(uri))
    : toAdd.filter((uri) => !existingSet.has(uri));

  await reviewAndConfirm(
    selectedUris,
    results,
    showYear,
    showGenres,
    userGenre
  );
};
