// searchFromFile.js
const fs = require("fs");
const SpotifyWebApi = require("spotify-web-api-node");
const { clientId, clientSecret, redirectUri } = require("./config.json");

// wczytaj tokeny
let { access_token, refresh_token, expires_at } = JSON.parse(
  fs.readFileSync("tokens.json", "utf8")
);
const spotify = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
spotify.setAccessToken(access_token);
spotify.setRefreshToken(refresh_token);

async function ensureToken() {
  if (Date.now() > expires_at - 60000) {
    const data = await spotify.refreshAccessToken();
    access_token = data.body.access_token;
    expires_at = Date.now() + data.body.expires_in * 1000;
    spotify.setAccessToken(access_token);
    fs.writeFileSync(
      "tokens.json",
      JSON.stringify({ access_token, refresh_token, expires_at }, null, 2)
    );
  }
}

async function searchQuery(q, limit = 10) {
  await ensureToken();
  const res = await spotify.searchTracks(q, { limit });
  return res.body.tracks.items.map((t) => ({
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    popularity: t.popularity,
  }));
}

(async () => {
  const lines = fs
    .readFileSync("search.txt", "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l);
  const out = {};
  for (const q of lines) {
    console.log(`🔍 Szukam “${q}”…`);
    try {
      out[q] = await searchQuery(q, 50);
      console.log(`  → ${out[q].length} wyników`);
    } catch (e) {
      console.error(`  ❌ Błąd dla “${q}”:`, e.body || e);
      out[q] = [];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fs.writeFileSync("searchResults.json", JSON.stringify(out, null, 2));
  console.log("✅ Zapisano searchResults.json");
})();
