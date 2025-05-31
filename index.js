#!/usr/bin/env node
const inquirer = require("inquirer");
const chalk = require("chalk");

// importowanie podzadań w menu
const searchTracks = require("./commands/searchTracks");
const searchArtists = require("./commands/searchArtists");
const removeDuplicates = require("./commands/removeDuplicates");
const sortPlaylist = require("./commands/sortPlaylist");
const removeTracks = require("./commands/removeTracks");
const selectPlaylist = require("./commands/selectPlaylist");

// Kolorowanie logów
function log(icon, msg) {
  console.log(chalk.magenta(`${icon.padEnd(2)}  ${msg}`));
}

// header-box
function header(title) {
  console.clear();
  const line = "─".repeat(title.length + 4);
  console.log(chalk.white(`\n┌${line}┐`));
  console.log(chalk.white(`│  ${title}  │`));
  console.log(chalk.white(`└${line}┘`));
}

async function main() {
  // 1) wybór / utworzenie playlisty
  let { id: playlistId, name: playlistName } = await selectPlaylist();

  while (true) {
    // 2) wyświetl header i aktywną playlistę
    header("MENU GŁÓWNE");
    console.log(chalk.yellow(`● Aktywna playlista: ${playlistName}`));
    console.log("");
    console.log("");

    // 3) menu główne
    const { action } = await inquirer.prompt({
      type: "list",
      name: "action",
      message: "Co chcesz zrobić?",
      choices: [
        { name: "1. Wyszukaj piosenek", value: "searchTracks" },
        { name: "2. Szukaj artystów / zespołów", value: "searchArtists" },
        { name: "3. Usuń duplikaty", value: "removeDuplicates" },
        { name: "4. Sortuj utwory", value: "sortPlaylist" },
        { name: "5. Usuń utwory", value: "removeTracks" },
        new inquirer.Separator(),
        { name: "6. Zmień / zarządzaj playlistami", value: "changePlaylist" },
        { name: "7. Zakończ", value: "exit" },
      ],
      pageSize: 8,
    });

    switch (action) {
      case "searchTracks":
        await searchTracks(playlistId);
        break;
      case "searchArtists":
        await searchArtists(playlistId);
        break;
      case "removeDuplicates":
        // 4) Wywołaj removeDuplicates i poczekaj na potwierdzenie Enter przed powrotem do menu
        await removeDuplicates(playlistId);
        await inquirer.prompt({
          type: "input",
          name: "continue",
          message: "Naciśnij Enter, aby wrócić do menu głównego...",
        });
        break;
      case "sortPlaylist":
        await sortPlaylist(playlistId);
        break;
      case "removeTracks":
        await removeTracks(playlistId);
        break;
      case "changePlaylist":
        // wybierz ponownie
        ({ id: playlistId, name: playlistName } = await selectPlaylist());
        log(
          "✔",
          `Przełączono na playlistę: ${playlistName} (ID=${playlistId})`
        );
        // Po zmianie playlisty, poczekaj, by użytkownik zobaczył komunikat, potem kontynuuj
        await new Promise((r) => setTimeout(r, 1500));
        break;
      case "exit":
        console.log(chalk.green("✅ Do widzenia!"));
        process.exit(0);
    }
  }
}

main().catch((err) => {
  console.error(chalk.red("❌ Błąd główny aplikacji:"), err);
});
