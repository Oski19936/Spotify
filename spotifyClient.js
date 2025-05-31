const fs = require("fs");
const path = require("path");
const SpotifyWebApi = require("spotify-web-api-node");
const chalk = require("chalk");

// Ścieżki do plików
const CONFIG_FILE = path.join(__dirname, "config.json");
const TOKENS_FILE = path.join(__dirname, "tokens.json");

if (!fs.existsSync(CONFIG_FILE)) {
  console.error("❌ Brak pliku config.json");
  process.exit(1);
}
if (!fs.existsSync(TOKENS_FILE)) {
  console.error("❌ Brak pliku tokens.json");
  process.exit(1);
}

// Wczytywanie config.json
function getConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

// Nadpisywanie config.json
function setConfig(newConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
}

// Rozpakowywanie config.json
const {
  clientId,
  clientSecret,
  redirectUri,
  playlistId: defaultPlaylistId,
} = getConfig();

// Wczytywanie tokenów
let { access_token, refresh_token, expires_at } = JSON.parse(
  fs.readFileSync(TOKENS_FILE, "utf8")
);

// SpotifyWebApi
const spotifyApi = new SpotifyWebApi({
  clientId,
  clientSecret,
  redirectUri,
});
spotifyApi.setAccessToken(access_token);
spotifyApi.setRefreshToken(refresh_token);

/**
 * Odświeża access_token jeśli brakuje mu <60 sekund do wygaśnięcia.
 */
async function ensureToken() {
  if (Date.now() > (expires_at || 0) - 60_000) {
    process.stdout.write("🔄 Odświeżam token dostępu... ");
    const data = await spotifyApi.refreshAccessToken();
    access_token = data.body.access_token;
    expires_at = Date.now() + data.body.expires_in * 1000;
    spotifyApi.setAccessToken(access_token);
    fs.writeFileSync(
      TOKENS_FILE,
      JSON.stringify({ access_token, refresh_token, expires_at }, null, 2)
    );
    console.log(`✔ Token ważny do ${new Date(expires_at).toISOString()}`);
  }
}

/**
 * Pobiera wszystkie utwory z danej playlisty (domyślnie z config.json).
 * Zwraca { existingSet, playlistTracks }.
 */
async function fetchAllExisting(plId = defaultPlaylistId) {
  await ensureToken();
  console.log(`🚩  Pobieram utwory z playlisty ID=${plId}…`);
  const existingSet = new Set();
  const playlistTracks = [];
  let offset = 0,
    idx = 0;
  while (true) {
    const res = await spotifyApi.getPlaylistTracks(plId, {
      offset,
      limit: 100,
    });
    const items = res.body.items;
    if (!items.length) break;
    for (const it of items) {
      const t = it.track;
      if (t && t.uri) {
        existingSet.add(t.uri);
        playlistTracks.push({
          uri: t.uri,
          name: t.name,
          artists: t.artists.map((a) => a.name),
          pos: idx++,
        });
      }
    }
    offset += items.length;
    if (items.length < 100) break;
  }
  console.log(
    chalk.green(
      `ℹ   Pobrano ${playlistTracks.length} utwor${
        playlistTracks.length === 1 ? "" : "ów"
      }.`
    )
  );
  return { existingSet, playlistTracks };
}

/**
 * Batchowe pobranie audio-features (max 100 na raz).
 */
async function getAudioFeatures(trackIds) {
  const out = [];
  for (let i = 0; i < trackIds.length; i += 100) {
    await ensureToken();
    const chunk = trackIds.slice(i, i + 100);
    const res = await spotifyApi.getAudioFeaturesForTracks(chunk);
    out.push(...(res.body.audio_features || []));
  }
  return out;
}

/**
 * Batchowe dodawanie utworów do playlisty (max 100 naraz, obsługa rate-limit).
 */
async function addTracksInBatches(plId = defaultPlaylistId, uris = []) {
  const B = 100;
  for (let i = 0; i < uris.length; i += B) {
    const chunk = uris.slice(i, i + B);
    console.log(
      `🚀 Dodaję utwory (${Math.floor(i / B) + 1}/${Math.ceil(
        uris.length / B
      )}) – ${chunk.length}`
    );
    await ensureToken();
    while (true) {
      try {
        const r = await spotifyApi.addTracksToPlaylist(plId, chunk);
        console.log(
          `✔ Dodano ${chunk.length} utworów (snapshot=${r.body.snapshot_id})`
        );
        break;
      } catch (err) {
        if (err.statusCode === 429) {
          const wait = parseInt(err.headers["retry-after"], 10) || 1;
          console.warn(`⏱ Rate limit, czekam ${wait}s…`);
          await new Promise((r) => setTimeout(r, wait * 1000));
        } else {
          console.error("❌ Błąd dodawania utworów:", err.message || err);
          throw err;
        }
      }
    }
  }
}

module.exports = {
  spotifyApi,
  ensureToken,
  fetchAllExisting,
  getAudioFeatures,
  addTracksInBatches,
  getConfig,
  setConfig,
};
