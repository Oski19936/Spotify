// commands/removeDuplicates.js

const inquirer = require("inquirer");
const chalk = require("chalk");
const {
  spotifyApi,
  ensureToken,
  fetchAllExisting,
} = require("../spotifyClient");

module.exports = async function removeDuplicates(playlistId) {
<<<<<<< HEAD
  // 1) Pobierz wszystkie utwory z playlisty + snapshot_id
  await ensureToken();
  const { playlistTracks } = await fetchAllExisting(playlistId);
  
  // Pobierz snapshot_id playlisty
  const playlistInfo = await spotifyApi.getPlaylist(playlistId);
  const snapshot_id = playlistInfo.body.snapshot_id;
  console.log(chalk.blue(`🔍 DEBUG: Playlist snapshot_id: ${snapshot_id}`));
=======
  try {
    // 0) Informacja, na jakiej playliście działamy:
    console.log(
      chalk.blue(`🔎 Sprawdzam duplikaty na playliście: ${playlistId}`)
    );
>>>>>>> 78c5757 (Remove duplicated songs function repair)

    // 1) Upewnij się, że token jest ważny
    await ensureToken();

    // 2) Pobierz wszystkie utwory z playlisty
    const { playlistTracks } = await fetchAllExisting(playlistId);

    // 3) Grupuj po nazwie + posortowanych artystach
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

<<<<<<< HEAD
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

  // 6) Zbieramy duplikaty do usunięcia, zachowując pierwszy
  let removedCount = 0;
  const allDuplicatesToRemove = [];
  
  for (const group of dupeGroups) {
    // Sortuj według pozycji - pierwszy zostaje, reszta do usunięcia
    group.sort((a, b) => a.pos - b.pos);
    const toKeep = group[0];
    const toRemove = group.slice(1);
    
    console.log(chalk.cyan(`📍 Zachowuję: "${toKeep.name}" (poz:${toKeep.pos})`));
    console.log(chalk.yellow(`🗑  Do usunięcia: ${toRemove.map(t => `poz:${t.pos}`).join(', ')}`));
    
    allDuplicatesToRemove.push(...toRemove);
  }
  
  // Sortuj wszystkie duplikaty od najwyższej pozycji do najniższej
  allDuplicatesToRemove.sort((a, b) => b.pos - a.pos);
  
  console.log(chalk.blue(`🔍 DEBUG: Kolejność usuwania pozycji: ${allDuplicatesToRemove.map(d => d.pos).join(', ')}`));
  console.log(chalk.gray("\n⏳ Poczekaj 5 sekund na przeczytanie debug logów..."));
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Usuń duplikaty jeden po drugim używając pozycji + snapshot_id
  for (const duplicate of allDuplicatesToRemove) {
    let done = false;
    console.log(chalk.blue(`🔍 DEBUG: Próba usunięcia pozycji ${duplicate.pos} dla URI:${duplicate.uri.slice(-10)}`));
    
    while (!done) {
      await ensureToken();
      try {
        // Usuń konkretną pozycję z snapshot_id
        const trackToRemove = { 
          uri: duplicate.uri, 
          positions: [duplicate.pos] 
        };
        const options = { snapshot_id: snapshot_id };
        
        await spotifyApi.removeTracksFromPlaylist(playlistId, [trackToRemove], options);
        removedCount++;
        done = true;
        console.log(chalk.magenta(`🗑  Usunięto duplikat "${duplicate.name}" (poz:${duplicate.pos})`));
        
        // Dodaj opóźnienie między usunięciami
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        if (err.statusCode === 429) {
          const retry = parseInt(err.headers["retry-after"], 10) || 1;
          console.warn(
            chalk.yellow(
              `⏱  Rate limit, czekam ${retry}s przed ponowną próbą...`
=======
    // 4) Znajdź tylko te grupy, w których jest duplikat (>1)
    const dupeGroups = Object.values(groups).filter((g) => g.length > 1);
    if (dupeGroups.length === 0) {
      console.log(chalk.green("ℹ️  Brak duplikatów na playliście."));
      return;
    }

    // 5) Wyświetl, co znalazłeś
    console.log(chalk.yellow("⚠️  Znalezione duplikaty:"));
    dupeGroups.forEach((g) => {
      // sortujemy po pozycji rosnąco
      g.sort((a, b) => a.pos - b.pos);
      const lines = g.map((t) => `"${t.name}" [poz:${t.pos}]`).join(", ");
      console.log(` • ${lines}`);
    });

    // 6) Potwierdzenie
    const { confirm } = await inquirer.prompt({
      type: "confirm",
      name: "confirm",
      message:
        "Czy usunąć wszystkie duplikaty (zostawić tylko pierwsze wystąpienie każdego utworu), a następnie dodać jeden egzemplarz z powrotem?",
      default: false,
    });
    if (!confirm) {
      console.log(chalk.cyan("ℹ️  Anulowano usuwanie duplikatów."));
      return;
    }

    // 7) Kolejno usuwamy każdą nadmiarową instancję, a po usunięciu wszystkich w grupie dodajemy jedną kopię
    let removedCount = 0;
    let addedCount = 0;

    for (const group of dupeGroups) {
      // sortowane, więc group[0] to pierwszy (zostawiany), pozostałe to duplikaty
      group.sort((a, b) => a.pos - b.pos);
      const original = group[0];
      const duplicates = group.slice(1);

      // 7a) Usuń każdą nadmiarową instancję
      for (const d of duplicates) {
        const trackObj = [{ uri: d.uri, positions: [d.pos] }];
        let done = false;
        while (!done) {
          await ensureToken();
          try {
            await spotifyApi.removeTracksFromPlaylist(playlistId, trackObj);
            removedCount++;
            done = true;
            console.log(
              chalk.magenta(
                `🗑  Usunięto duplikat "${d.name}" (URI: ${d.uri}, poz:${d.pos})`
              )
            );
          } catch (err) {
            if (err.statusCode === 429) {
              const retry = parseInt(err.headers["retry-after"], 10) || 1;
              console.warn(
                chalk.yellow(
                  `⏱  Rate limit, czekam ${retry}s przed ponowną próbą usunięcia "${d.name}"...`
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

      // 7b) Dodaj z powrotem jeden egzemplarz (URI oryginału)
      let doneAdd = false;
      while (!doneAdd) {
        await ensureToken();
        try {
          const addRes = await spotifyApi.addTracksToPlaylist(playlistId, [
            original.uri,
          ]);
          addedCount++;
          doneAdd = true;
          const snapshotId = addRes.body?.snapshot_id || "(brak snapshot_id)";
          console.log(
            chalk.green(
              `➕  Dodano z powrotem utwór "${original.name}" (URI: ${original.uri}). Nowy snapshot: ${snapshotId}`
>>>>>>> 78c5757 (Remove duplicated songs function repair)
            )
          );
        } catch (addErr) {
          if (addErr.statusCode === 429) {
            const retry = parseInt(addErr.headers["retry-after"], 10) || 1;
            console.warn(
              chalk.yellow(
                `⏱  Rate limit, czekam ${retry}s przed ponowną próbą dodania "${original.name}"...`
              )
            );
            await new Promise((r) => setTimeout(r, retry * 1000));
          } else {
            console.error(
              chalk.red("❌ Błąd przy dodawaniu pojedynczej kopii:"),
              addErr.body || addErr.message || addErr
            );
            doneAdd = true;
          }
        }
      }
    }

    console.log(
      chalk.green(
        `✔ Usunięto ${removedCount} duplikat${
          removedCount === 1 ? "" : "ów"
        } i dodano ${addedCount} pojedynczych egzemplarzy.`
      )
    );
  } catch (err) {
    console.error(
      chalk.red("❌ Nieoczekiwany błąd w removeDuplicates:"),
      err.body || err.message || err
    );
  }
};
