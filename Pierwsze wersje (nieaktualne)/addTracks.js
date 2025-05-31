#!/usr/bin/env node
/**
 * addTracks.js
 *
 * 1. Czyta „Artist – Title” z songs.txt
 * 2. Wyszukuje URI (logi 🌐 Szukam…, → URI / ❌ Nie znaleziono)
 * 3. Pomija URI już na playlistcie oraz te w added.json
 * 4. Dodaje batchami (logi 🚀 Batch…, ✔ Dodano…, ⏱ pauza)
 * 5. Po każdej partii:
 *    • dopisuje URI do added.json
 *    • usuwa odpowiednie linie z songs.txt (log 🗑)
 * 6. Loguje postępy na każdym kroku
 */

const fs = require("fs");
const path = require("path");
const SpotifyWebApi = require("spotify-web-api-node");
const {
  clientId,
  clientSecret,
  redirectUri,
  playlistId,
} = require("./config.json");

const SONGS_FILE = path.join(__dirname, "songs.txt");
const TOKENS_FILE = path.join(__dirname, "tokens.json");
const ADDED_FILE = path.join(__dirname, "added.json");

let { access_token, refresh_token, expires_at } = JSON.parse(
  fs.readFileSync(TOKENS_FILE, "utf8")
);

const spotifyApi = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
spotifyApi.setAccessToken(access_token);
spotifyApi.setRefreshToken(refresh_token);

async function ensureToken() {
  if (Date.now() > expires_at - 60_000) {
    process.stdout.write("🔄 Odświeżam token… ");
    const data = await spotifyApi.refreshAccessToken();
    access_token = data.body.access_token;
    expires_at = Date.now() + data.body.expires_in * 1000;
    spotifyApi.setAccessToken(access_token);
    fs.writeFileSync(
      TOKENS_FILE,
      JSON.stringify({ access_token, refresh_token, expires_at }, null, 2)
    );
    console.log("✔ Token odświeżony do", new Date(expires_at).toISOString());
  } else {
    console.log("🔒 Token ważny do", new Date(expires_at).toISOString());
  }
}

async function fetchAllExisting() {
  console.log("🚩 Używam playlistId =", playlistId);
  const set = new Set();
  let offset = 0;
  while (true) {
    await ensureToken();
    let res;
    try {
      res = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit: 100,
      });
    } catch (err) {
      console.error("❌ Błąd getPlaylistTracks:", err.body || err);
      process.exit(1);
    }
    if (!res.body || !Array.isArray(res.body.items)) {
      console.error(
        "❌ Nieoczekiwany format odpowiedzi przy fetchAllExisting:",
        res.body
      );
      break;
    }
    res.body.items.forEach((item) => {
      if (item.track && item.track.uri) set.add(item.track.uri);
    });
    offset += res.body.items.length;
    if (res.body.items.length < 100) break;
  }
  console.log(`ℹ Istniejące URI na playlist (${set.size})`);
  return set;
}

async function searchTrackUri(artist, title) {
  await ensureToken();
  const q = `artist:"${artist}" track:"${title}"`;
  process.stdout.write(`🌐 Szukam: ${artist} – ${title} … `);
  while (true) {
    try {
      const res = await spotifyApi.searchTracks(q, { limit: 1 });
      const uri = res.body.tracks.items[0]?.uri || null;
      if (uri) console.log(`→ ${uri}`);
      else console.log("❌ Nie znaleziono");
      return uri;
    } catch (err) {
      if (err.statusCode === 429) {
        const retry = parseInt(err.headers["retry-after"], 10) || 1;
        console.warn(`429 przy searchTracks, czekam ${retry}s…`);
        await new Promise((r) => setTimeout(r, retry * 1000));
      } else {
        console.error(`❌ Błąd searchTracks(${q}):`, err.body || err);
        return null;
      }
    }
  }
}

async function addBatch(uris) {
  await ensureToken();
  while (true) {
    try {
      const res = await spotifyApi.addTracksToPlaylist(playlistId, uris);
      console.log(
        `✔ Dodano ${uris.length} utworów (snapshot=${res.body.snapshot_id})`
      );
      return;
    } catch (err) {
      if (err.statusCode === 429) {
        const retry = parseInt(err.headers["retry-after"], 10) || 1;
        console.warn(`429 przy addTracks, czekam ${retry}s…`);
        await new Promise((r) => setTimeout(r, retry * 1000));
      } else {
        console.error("❌ Błąd addTracksToPlaylist:", err.body || err);
        throw err;
      }
    }
  }
}

(async () => {
  if (!fs.existsSync(SONGS_FILE)) {
    console.error("❌ Brak pliku songs.txt");
    process.exit(1);
  }

  const lines = fs
    .readFileSync(SONGS_FILE, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("–"));

  console.log(`🔍 Znaleziono ${lines.length} pozycji w songs.txt`);
  if (!lines.length) return console.log("ℹ️ Brak pozycji do przetworzenia.");

  // Wyszukiwanie URI
  const entries = [];
  for (const line of lines) {
    const [artist, title] = line.split("–").map((s) => s.trim());
    const uri = await searchTrackUri(artist, title);
    if (uri) entries.push({ line, uri });
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`ℹ Zebrano ${entries.length} URI`);

  // Wczytaj added.json
  let addedUris = [];
  if (fs.existsSync(ADDED_FILE)) {
    try {
      addedUris = JSON.parse(fs.readFileSync(ADDED_FILE, "utf8"));
    } catch {}
  }
  const addedSet = new Set(addedUris);

  // Wczytaj istniejące z playlisty
  const existing = await fetchAllExisting();

  // Filtracja
  const toAdd = entries
    .filter((e) => !existing.has(e.uri) && !addedSet.has(e.uri))
    .map((e) => e.uri);

  console.log(`ℹ Do dodania po filtracji: ${toAdd.length}`);
  if (!toAdd.length)
    return console.log("🎉 Wszystko już na playliście lub w added.json!");

  // Dodawanie batchami
  const BATCH = 100;
  for (let i = 0; i < toAdd.length; i += BATCH) {
    const chunk = toAdd.slice(i, i + BATCH);
    console.log(
      `🚀 Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(
        toAdd.length / BATCH
      )} – ${chunk.length} utworów`
    );
    await addBatch(chunk);

    // Aktualizacja added.json
    chunk.forEach((uri) => addedSet.add(uri));
    addedUris.push(...chunk);
    fs.writeFileSync(ADDED_FILE, JSON.stringify(addedUris, null, 2));

    // Usuwanie linii z songs.txt
    const remaining = lines.filter(
      (l) => !chunk.includes(entries.find((e) => e.line === l)?.uri)
    );
    fs.writeFileSync(SONGS_FILE, remaining.join("\n") + "\n");
    console.log(`🗑 Usunięto ${chunk.length} linii z songs.txt`);

    // Krótka pauza
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("🎉 Wszystko gotowe!");
})();
