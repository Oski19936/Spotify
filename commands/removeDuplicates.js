// commands/removeDuplicates.js

const inquirer = require("inquirer");
const chalk = require("chalk");
const {
  spotifyApi,
  ensureToken,
  fetchAllExisting,
} = require("../spotifyClient");

module.exports = async function removeDuplicates(playlistId) {
  // 1) Pobierz wszystkie utwory z playlisty
  await ensureToken();
  const { playlistTracks } = await fetchAllExisting(playlistId);

  // 2) Grupuj po nazwie + posortowanych artystach
  const groups = {};
  for (const t of playlistTracks) {
    const key =
      t.name.toLowerCase() +
      "|" +
      t.artists
        .map((a) => a.toLowerCase())
        .sort()
        .join(",");
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  // 3) Znajdź tylko te grupy, gdzie jest duplikat (>1)
  const dupeGroups = Object.values(groups).filter((g) => g.length > 1);
  if (dupeGroups.length === 0) {
    console.log(chalk.green("ℹ️  Brak duplikatów na playliście."));
    return;
  }

  // 4) Wyświetl, co znalazłeś
  console.log(chalk.yellow("⚠️  Znalezione duplikaty:"));
  dupeGroups.forEach((g) => {
    // sortujemy po pozycji rosnąco
    g.sort((a, b) => a.pos - b.pos);
    const lines = g.map((t) => `"${t.name}" [poz:${t.pos}]`).join(", ");
    console.log(` • ${lines}`);
  });

  // 5) Potwierdzenie
  const { confirm } = await inquirer.prompt({
    type: "confirm",
    name: "confirm",
    message:
      "Czy usunąć wszystkie duplikaty (zostawić tylko pierwsze wystąpienie każdego utworu)?",
    default: false,
  });
  if (!confirm) {
    console.log(chalk.cyan("ℹ️  Anulowano usuwanie duplikatów."));
    return;
  }

  // 6) Zbieramy wszystkie duplikaty do usunięcia i sortujemy od końca
  let removedCount = 0;
  const allDuplicatesToRemove = [];
  
  for (const group of dupeGroups) {
    // sortowane, więc group[0] to pierwszy (zostaje), pozostałe do usunięcia
    group.sort((a, b) => a.pos - b.pos);
    const duplicates = group.slice(1);
    allDuplicatesToRemove.push(...duplicates);
  }
  
  // Sortuj duplikaty od najwyższej pozycji do najniższej
  // aby usuwanie nie wpływało na pozycje wcześniejszych utworów
  allDuplicatesToRemove.sort((a, b) => b.pos - a.pos);
  
  // Usuwaj każdy duplikat
  for (const d of allDuplicatesToRemove) {
    // próbujemy usunąć tylko tę jedną pozycję
    const trackObj = [{ uri: d.uri, positions: [d.pos] }];
    let done = false;
    while (!done) {
      await ensureToken();
      try {
        await spotifyApi.removeTracksFromPlaylist(playlistId, trackObj);
        removedCount++;
        done = true;
        console.log(
          chalk.magenta(`🗑  Usunięto duplikat "${d.name}" (poz:${d.pos})`)
        );
      } catch (err) {
        if (err.statusCode === 429) {
          const retry = parseInt(err.headers["retry-after"], 10) || 1;
          console.warn(
            chalk.yellow(
              `⏱  Rate limit, czekam ${retry}s przed ponowną próbą...`
            )
          );
          await new Promise((r) => setTimeout(r, retry * 1000));
        } else {
          console.error(
            chalk.red("❌ Błąd przy usuwaniu duplikatu:"),
            err.body || err.message || err
          );
          done = true; // porzucamy dalsze próby tego tracka
        }
      }
    }
  }

  console.log(
    chalk.green(
      `✔ Usunięto ${removedCount} duplikat${removedCount === 1 ? "" : "ów"}.`
    )
  );
};
