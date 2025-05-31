const inquirer = require("inquirer");
const { spotifyApi, ensureToken } = require("../spotifyClient");

module.exports = async function sortPlaylist(playlistId) {
  await ensureToken();
  const ans = await inquirer.prompt({
    type: "list",
    name: "criterion",
    message: "Wybierz kryterium sortowania:",
    choices: [
      { name: "Tytuł utworu (A–Z)", value: "name" },
      { name: "Popularność (malejąco)", value: "popularity" },
    ],
  });
  const criterion = ans.criterion;
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
      items.forEach((item) => {
        if (item.track) allTracks.push(item.track);
      });
      offset += items.length;
    } while (fetched.body.items.length === 100);
  } catch (err) {
    console.error("❌ Błąd pobierania utworów playlisty:", err.message || err);
    return;
  }
  if (allTracks.length === 0) {
    console.log("ℹ Playlista jest pusta.");
    return;
  }
  if (criterion === "name") {
    allTracks.sort((a, b) => a.name.localeCompare(b.name));
  } else if (criterion === "popularity") {
    allTracks.sort((a, b) => b.popularity - a.popularity);
  }
  const sortedUris = allTracks.map((t) => t.uri);
  try {
    if (sortedUris.length <= 100) {
      await spotifyApi.replaceTracksInPlaylist(playlistId, sortedUris);
    } else {
      await spotifyApi.replaceTracksInPlaylist(
        playlistId,
        sortedUris.slice(0, 100)
      );
      for (let i = 100; i < sortedUris.length; i += 100) {
        const batch = sortedUris.slice(i, i + 100);
        await spotifyApi.addTracksToPlaylist(playlistId, batch);
      }
    }
    const total = allTracks.length;
    let trackWord;
    if (total === 1) trackWord = "utwór";
    else if (total >= 2 && total <= 4) trackWord = "utwory";
    else trackWord = "utworów";
    console.log(
      `✔ Posortowano playlistę (${total} ${trackWord}) wg kryterium: ${
        criterion === "name" ? "tytuł" : "popularność"
      }.`
    );
  } catch (err) {
    console.error("❌ Błąd sortowania playlisty:", err.message || err);
  }
};
