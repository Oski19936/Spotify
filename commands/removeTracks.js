// commands/removeTracks.js

const inquirer = require("inquirer");
const { spotifyApi, ensureToken } = require("../spotifyClient");

module.exports = async function removeTracks(playlistId) {
  // 1) pobierz wszystkie utwory playlisty
  await ensureToken();
  let allTracks = [];
  try {
    let offset = 0;
    let fetched;
    do {
      fetched = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit: 100,
      });
      const items = fetched.body.items;
      for (const it of items) {
        if (it.track) allTracks.push(it.track);
      }
      offset += items.length;
    } while (fetched.body.items.length === 100);
  } catch (err) {
    console.error("❌ Błąd pobierania utworów playlisty:", err.message || err);
    return;
  }

  if (allTracks.length === 0) {
    console.log("ℹ️  Playlista jest pusta.");
    return;
  }

  // przygotuj wyrównanie kolumn
  const MAX_T = 30; // max długość tytułu
  const MAX_A = 20; // max długość artysty
  const W_NUM = String(allTracks.length).length; // szerokość pola numeru
  const W_POP = 3; // szerokość pola popularity (jeśli potrzebne)

  // budujemy choices
  const choices = allTracks.map((track, idx) => {
    const num = String(idx + 1).padStart(W_NUM, " ");
    // title
    let title = track.name;
    if (title.length > MAX_T) title = title.slice(0, MAX_T - 3) + "...";
    title = title.padEnd(MAX_T, " ");

    // artist
    let artist = track.artists[0]?.name || "Unknown";
    if (artist.length > MAX_A) artist = artist.slice(0, MAX_A - 3) + "...";
    artist = artist.padEnd(MAX_A, " ");

    // explicit label
    const explicitLabel = track.explicit ? " (explicit)" : "";

    return {
      name: `  ${num}  ${title} - ${artist}${explicitLabel}`,
      value: idx,
    };
  });

  // prompt
  const { indexes } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "indexes",
      message: "Wybierz utwory do usunięcia:",
      choices,
      pageSize: Math.min(choices.length, process.stdout.rows - 6),
      loop: true,
    },
  ]);

  if (!indexes || indexes.length === 0) {
    console.log("⏮️  Anulowano usuwanie utworów.");
    return;
  }

  // potwierdzenie
  console.log(`ℹ️  Wybrano ${indexes.length} utwór(ów) do usunięcia:`);
  for (const idx of indexes) {
    const tr = allTracks[idx];
    console.log(` - ${tr.name} — ${tr.artists[0]?.name || "Unknown"}`);
  }
  const { confirm } = await inquirer.prompt({
    type: "confirm",
    name: "confirm",
    message: "Czy na pewno usunąć wybrane utwory?",
    default: false,
  });
  if (!confirm) {
    console.log("⏮️  Anulowano usuwanie utworów.");
    return;
  }

  // grupowanie wg URI + pozycji
  const tracksMap = {};
  indexes.sort((a, b) => a - b);
  for (const idx of indexes) {
    const uri = allTracks[idx].uri;
    tracksMap[uri] = tracksMap[uri] || [];
    tracksMap[uri].push(idx);
  }

  // formatuj do usunięcia
  const toRemove = Object.entries(tracksMap).map(([uri, positions]) => ({
    uri,
    positions,
  }));

  // wykonaj usunięcie
  try {
    await ensureToken();
    await spotifyApi.removeTracksFromPlaylist(playlistId, toRemove);
    console.log(`🗑️  Usunięto ${indexes.length} utwór(ów) z playlisty.`);
  } catch (err) {
    console.error("❌ Błąd usuwania utworów:", err.message || err);
  }
};
