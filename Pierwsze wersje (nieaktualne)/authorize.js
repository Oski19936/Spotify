#!/usr/bin/env node

const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const SpotifyWebApi = require("spotify-web-api-node");
const { clientId, clientSecret, redirectUri } = require("./config.json");

const app = express();
const spotifyApi = new SpotifyWebApi({ clientId, clientSecret, redirectUri });
const port = new URL(redirectUri).port || 8888;

// Autoryzacja w przeglądarce
function openUrl(url) {
  const plat = process.platform;
  if (plat === "win32") exec(`start "" "${url}"`);
  else if (plat === "darwin") exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

(async () => {
  // Zakresy dostępu
  const scopes = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
  ];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, "state123");
  console.log("🔑 Otwieram przeglądarkę…");
  console.log("➡ URL:", authorizeURL);
  openUrl(authorizeURL);

  // Endpoint callback
  app.get("/callback", async (req, res) => {
    const code = req.query.code || null;
    if (!code) {
      res.status(400).send("Brak parametru code");
      process.exit(1);
    }
    try {
      const data = await spotifyApi.authorizationCodeGrant(code);
      const { access_token, refresh_token, expires_in } = data.body;
      const tokens = {
        access_token,
        refresh_token,
        expires_at: Date.now() + expires_in * 1000,
      };
      fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
      console.log("✔ Tokeny zapisane w tokens.json");
      res.send("<h2>Tokeny zapisane – możesz zamknąć to okno.</h2>");
      process.exit(0);
    } catch (err) {
      console.error("✖ Błąd authorizationCodeGrant:", err);
      res.send("<h2>Błąd, sprawdź konsolę.</h2>");
      process.exit(1);
    }
  });

  app.listen(port, () => {
    console.log(`🌐 Serwer nasłuchuje callback pod ${redirectUri}`);
  });
})();
