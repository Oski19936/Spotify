// scripts/getArtistLinkinPark.js

const fs = require("fs");
const path = require("path");
const SpotifyWebApi = require("spotify-web-api-node");

async function main() {
  // 1. Wczytaj clientId/clientSecret z config.json
  const cfgPath = path.join(__dirname, "..", "config.json");
  if (!fs.existsSync(cfgPath)) {
    console.error("❌ Nie znaleziono config.json");
    process.exit(1);
  }
  const { clientId, clientSecret } = JSON.parse(
    fs.readFileSync(cfgPath, "utf8")
  );
  if (!clientId || !clientSecret) {
    console.error("❌ Brakuje clientId lub clientSecret w config.json");
    process.exit(1);
  }

  // 2. Zainicjalizuj Spotify API i pobierz token (Client Credentials Flow)
  const spotify = new SpotifyWebApi({ clientId, clientSecret });
  try {
    const tokenData = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(tokenData.body.access_token);
  } catch (err) {
    console.error("❌ Błąd przy clientCredentialsGrant:", err.message || err);
    process.exit(1);
  }

  // 3. Wyszukaj artystę "Linkin Park"
  let artistItem;
  try {
    const searchRes = await spotify.searchArtists("Linkin Park", { limit: 1 });
    artistItem = searchRes.body.artists.items[0];
    if (!artistItem) throw new Error("Nie znaleziono");
  } catch (err) {
    console.error("❌ Błąd wyszukiwania artysty:", err.message || err);
    process.exit(1);
  }
  const artistId = artistItem.id;

  // 4. Pobierz metadane artysty i usuń available_markets
  let artistData;
  try {
    const res = await spotify.getArtist(artistId);
    artistData = res.body;
    delete artistData.available_markets;
  } catch (err) {
    console.error("❌ Błąd pobierania metadanych artysty:", err.message || err);
    process.exit(1);
  }

  // 5. Pobierz wszystkie albumy artysty i usuń available_markets z każdego
  let albums = [];
  try {
    let offset = 0;
    const limit = 50;
    do {
      const res = await spotify.getArtistAlbums(artistId, {
        limit,
        offset,
        include_groups: "album,single,appears_on,compilation",
      });
      const chunk = res.body.items.map((album) => {
        delete album.available_markets;
        return album;
      });
      albums.push(...chunk);
      offset += chunk.length;
    } while (offset < albums.length);
  } catch (err) {
    console.error("❌ Błąd pobierania albumów artysty:", err.message || err);
    process.exit(1);
  }

  // 6. Pobierz top tracks artysty i usuń available_markets
  let topTracks = [];
  try {
    const res = await spotify.getArtistTopTracks(artistId, "US");
    topTracks = res.body.tracks.map((track) => {
      delete track.available_markets;
      return track;
    });
  } catch (err) {
    console.error("❌ Błąd pobierania top tracks:", err.message || err);
    process.exit(1);
  }

  // 7. Pobierz powiązanych artystów (jeśli błąd 404 — pomiń)
  let related = [];
  try {
    const res = await spotify.getArtistRelatedArtists(artistId);
    related = res.body.artists;
    // tutaj nie ma pola available_markets
  } catch (err) {
    if (err.statusCode === 404) {
      console.warn("⚠️  related-artists zwróciło 404 — pomijam.");
    } else {
      console.error("❌ Błąd pobierania related artists:", err.message || err);
    }
  }

  // 8. Skompiluj finalny obiekt
  const fullInfo = {
    fetched_at: new Date().toISOString(),
    artist: artistData,
    albums,
    top_tracks: topTracks,
    related_artists: related,
  };

  // 9. Zapisz do pliku JSON
  const outPath = path.join(__dirname, "LinkinPark.json");
  fs.writeFileSync(outPath, JSON.stringify(fullInfo, null, 2), "utf8");
  console.log(`✔ Zapisano pełne informacje do ${outPath}`);
}

main();
