// fetchTopTracksByGenre.js
const fs = require("fs");
const SpotifyWebApi = require("spotify-web-api-node");
const {
  clientId,
  clientSecret,
  redirectUri,
  genres,
} = require("./config.json");

// Wczytaj tokeny
let { access_token, refresh_token, expires_at } = JSON.parse(
  fs.readFileSync("tokens.json", "utf8")
);

// Konfiguracja API
const spotifyApi = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
spotifyApi.setAccessToken(access_token);
spotifyApi.setRefreshToken(refresh_token);

// Odświeżaj token (1 min przed wygaśnięciem)
async function ensureToken() {
  if (Date.now() > expires_at - 60000) {
    console.log("🔄 Odświeżam token…");
    const data = await spotifyApi.refreshAccessToken();
    access_token = data.body.access_token;
    expires_at = Date.now() + data.body.expires_in * 1000;
    spotifyApi.setAccessToken(access_token);
    fs.writeFileSync(
      "tokens.json",
      JSON.stringify({ access_token, refresh_token, expires_at }, null, 2)
    );
    console.log("✔ Token odświeżony");
  }
}

// Pobierz rekomendacje (max 50) po pojedynczym seed genre
async function fetchRecommendationsForGenre(genre, limit = 50) {
  await ensureToken();
  try {
    const res = await spotifyApi.getRecommendations({
      seed_genres: [genre],
      limit,
    });
    return res.body.tracks.map((t) => ({
      uri: t.uri,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(", "),
      popularity: t.popularity,
    }));
  } catch (err) {
    console.error(`❌ Błąd recommendations dla "${genre}":`, err.body || err);
    return [];
  }
}

// Główna pętla
(async () => {
  if (!Array.isArray(genres) || genres.length === 0) {
    console.error('❌ config.json musi mieć tablicę "genres".');
    process.exit(1);
  }

  const output = {};

  for (const genre of genres) {
    console.log(`🌐 Fetch recommendations for genre: ${genre}`);
    const tracks = await fetchRecommendationsForGenre(genre, 50);
    console.log(`ℹ Pobrano ${tracks.length} utworów dla "${genre}"`);
    output[genre] = tracks;
    // krótka pauza, by nie burstować
    await new Promise((r) => setTimeout(r, 500));
  }

  fs.writeFileSync("topTracksByGenre.json", JSON.stringify(output, null, 2));
  console.log("🎉 Zapisano topTracksByGenre.json");
})();
