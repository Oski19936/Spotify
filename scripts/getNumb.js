// scripts/getNumb.js

const fs = require("fs");
const path = require("path");
const SpotifyWebApi = require("spotify-web-api-node");

async function main() {
  // 1. Wczytaj dane klienta z config.json
  const cfgPath = path.join(__dirname, "..", "config.json");
  if (!fs.existsSync(cfgPath)) {
    console.error("❌ Nie znaleziono config.json");
    process.exit(1);
  }
  const { clientId, clientSecret } = JSON.parse(
    fs.readFileSync(cfgPath, "utf8")
  );
  if (!clientId || !clientSecret) {
    console.error("❌ Brak clientId lub clientSecret w config.json");
    process.exit(1);
  }

  // 2. Zainicjalizuj klienta Spotify i pobierz token
  const spotify = new SpotifyWebApi({ clientId, clientSecret });
  let tokenData;
  try {
    tokenData = await spotify.clientCredentialsGrant();
  } catch (err) {
    console.error("❌ Błąd przy clientCredentialsGrant:", err.message || err);
    process.exit(1);
  }
  spotify.setAccessToken(tokenData.body.access_token);

  // 3. Wyszukaj „Numb” Linkin Park
  const q = 'track:"Numb" artist:"Linkin Park"';
  let searchRes;
  try {
    searchRes = await spotify.searchTracks(q, { limit: 1 });
  } catch (err) {
    console.error("❌ Błąd wyszukiwania track:", err.message || err);
    process.exit(1);
  }
  if (!searchRes.body.tracks.items.length) {
    console.error('❌ Nie znaleziono utworu "Numb" Linkin Park');
    process.exit(1);
  }
  const track = searchRes.body.tracks.items[0];

  // 4. Pobierz pełne metadane utworu
  let full;
  try {
    full = await spotify.getTrack(track.id);
  } catch (err) {
    console.error("❌ Błąd przy getTrack:", err.message || err);
    process.exit(1);
  }

  // 5. Zapisz JSON do pliku
  const outPath = path.join(__dirname, "Numb_LinkinPark.json");
  fs.writeFileSync(outPath, JSON.stringify(full.body, null, 2), "utf8");
  console.log(`✔ Zapisano szczegóły do ${outPath}`);
}

main();
