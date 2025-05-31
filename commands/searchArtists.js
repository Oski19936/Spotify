const inquirer = require("inquirer");
const { spotifyApi, ensureToken } = require("../spotifyClient");

module.exports = async function searchArtists() {
  await ensureToken();
  const ansGenre = await inquirer.prompt({
    type: "input",
    name: "genre",
    message: "Podaj gatunek (np. rock):",
    filter: (input) => input.trim(),
  });
  const ansYear = await inquirer.prompt({
    type: "input",
    name: "year",
    message: "Podaj rok lub zakres lat (np. 1990 lub 1990-2000):",
    filter: (input) => input.trim(),
  });
  const genre = ansGenre.genre;
  const yearInput = ansYear.year;
  if (!genre && !yearInput) {
    console.log("❌ Musisz podać przynajmniej rok lub gatunek.");
    return;
  }
  let query = "";
  if (genre) {
    query += `genre:"${genre}" `;
  }
  if (yearInput) {
    if (/^\d{4}-\d{4}$/.test(yearInput)) {
      query += `year:${yearInput} `;
    } else if (/^\d{4}$/.test(yearInput)) {
      query += `year:${yearInput} `;
    } else {
      console.log(
        "❌ Nieprawidłowy format roku. Użyj formatu YYYY lub YYYY-YYYY."
      );
      return;
    }
  }
  query = query.trim();
  let res;
  try {
    res = await spotifyApi.searchArtists(query, { limit: 20 });
  } catch (err) {
    console.error("❌ Błąd wyszukiwania artystów:", err.message || err);
    return;
  }
  const artists = res.body.artists.items;
  if (artists.length === 0) {
    console.log("❌ Nie znaleziono artystów dla podanych filtrów.");
    return;
  }
  const count = artists.length;
  const artistWord = count === 1 ? "artystę" : "artystów";
  console.log(`ℹ Znaleziono ${count} ${artistWord}:`);
  artists.forEach((artist, idx) => {
    const genresList = artist.genres.slice(0, 2);
    const genres = genresList.length ? genresList.join(", ") : "brak gatunku";
    const popularity = artist.popularity;
    console.log(
      `${idx + 1}. ${
        artist.name
      } – Popularność: ${popularity} – Gatunki: ${genres}`
    );
  });
  await inquirer.prompt({
    type: "input",
    name: "continue",
    message: "Naciśnij Enter, aby wrócić do menu.",
  });
};
