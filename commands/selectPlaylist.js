const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const chalk = require("chalk");
const { spotifyApi, ensureToken } = require("../spotifyClient");

module.exports = async function selectPlaylist() {
  console.clear();
  console.log(chalk.hex("#a020f0")("🔄  Pobieram listę Twoich playlist…"));
  await ensureToken();

  // 1) Pobieranie wszystkich playlist
  let all = [],
    offset = 0;
  do {
    const res = await spotifyApi.getUserPlaylists({ limit: 50, offset });
    all = all.concat(res.body.items);
    offset += res.body.items.length;
  } while (offset < all.length);

  if (all.length === 0) {
    console.log(chalk.hex("#a020f0")("ℹ️  Nie masz żadnych playlist."));
    process.exit(0);
  }

  // pageSize ~75% wysokości terminala
  const totalRows = process.stdout.rows || 20;
  const pageSize = Math.max(5, Math.floor(totalRows * 0.75));

  // wylicz maks. długość nazwy dla wyrównania kolumn
  const maxNameLen = Math.max(...all.map((pl) => pl.name.length));

  // 2) opcje: CREATE / DELETE / header / lista
  const choices = [
    new inquirer.Separator("\u200B"),

    {
      name: `${chalk.greenBright("➕")}  Utwórz nową playlistę`,
      value: "__CREATE__",
    },
    {
      name: `${chalk.redBright("🗑")}   Usuń istniejącą playlistę`,
      value: "__DELETE__",
    },

    new inquirer.Separator("\u200B"),
    new inquirer.Separator(chalk.bold.underline("Dostępne playlisty")),

    ...all.map((pl) => {
      const namePadded = pl.name.padEnd(maxNameLen, " ");
      const countLabel = `(${pl.tracks.total} utworów)`;
      return {
        name: `  ${namePadded}   ${countLabel}`,
        value: pl.id,
      };
    }),
  ];

  // 3) Wybór playlisty / tworzenie / usunięcie (MAIN)
  const { playlistId } = await inquirer.prompt({
    type: "list",
    name: "playlistId",
    message: "  Wybierz playlistę lub akcję:",
    choices,
    pageSize,
    loop: false,
  });

  // 4) Tworzenie nowej playlisty
  if (playlistId === "__CREATE__") {
    const { name } = await inquirer.prompt({
      type: "input",
      name: "name",
      message: "Podaj nazwę nowej playlisty (ENTER = powrót):",
    });
    if (!name.trim()) {
      return module.exports();
    }

    console.log(
      chalk.hex("#a020f0")(`🔄 Tworzę nową playlistę „${name.trim()}”…`)
    );
    await ensureToken();

    let res2;
    try {
      res2 = await spotifyApi.createPlaylist(name.trim(), {
        public: false,
        description: "",
      });
    } catch (err) {
      console.error(
        chalk.red("❌ Błąd tworzenia playlisty:"),
        err.message || err
      );
      return module.exports();
    }

    const newId = res2.body.id;
    console.log(
      chalk.greenBright(`✔ Utworzono playlistę „${name.trim()}” (ID=${newId})`)
    );

    // zapis do config.json
    const cfgPath = path.join(__dirname, "..", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.playlistId = newId;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");

    // Zatwierdzanie "enterem" przed powrotem do menu
    await inquirer.prompt({
      type: "input",
      name: "_continue",
      message: "Naciśnij ENTER, aby przejść do MENU GŁÓWNE…",
    });

    return { id: newId, name: name.trim() };
  }

  // 5) Usuwanie playlisty
  if (playlistId === "__DELETE__") {
    console.clear();

    const deleteChoices = [
      { name: chalk.yellow("◀  Wróć do menu"), value: "__BACK__" },
      ...all.map((pl) => ({ name: pl.name, value: pl.id })),
    ];

    const { toDelete } = await inquirer.prompt({
      type: "list",
      name: "toDelete",
      message: "Wybierz playlistę do usunięcia:",
      choices: deleteChoices,
      pageSize: Math.min(deleteChoices.length, pageSize),
      loop: false,
    });
    if (toDelete === "__BACK__") {
      return module.exports();
    }

    const plName = all.find((p) => p.id === toDelete).name;
    const { confirm } = await inquirer.prompt({
      type: "confirm",
      name: "confirm",
      message: `Na pewno chcesz usunąć playlistę „${plName}”?`,
      default: false,
    });
    if (!confirm) {
      console.log(chalk.hex("#a020f0")("ℹ️  Anulowano usuwanie."));
      await inquirer.prompt({
        type: "input",
        name: "_continue",
        message: "Naciśnij ENTER, aby wrócić do menu…",
      });
      return module.exports();
    }

    console.log(chalk.hex("#a020f0")("🔄 Usuwam playlistę…"));
    await ensureToken();
    try {
      await spotifyApi.unfollowPlaylist(toDelete);
      console.log(chalk.greenBright(`✔ Usunięto playlistę „${plName}”.`));
    } catch (err) {
      console.error(
        chalk.red("❌ Błąd usuwania playlisty:"),
        err.message || err
      );
    }

    // Zatwierdzanie "enterem" przed powrotem do menu
    await inquirer.prompt({
      type: "input",
      name: "_continue",
      message: "Naciśnij ENTER, aby wrócić do menu…",
    });

    return module.exports();
  }

  // 6) Wybór istniejącej playlisty
  console.clear();
  const chosen = all.find((p) => p.id === playlistId);
  console.log(
    chalk.greenBright("✔   Wybrano playlistę"),
    chalk.bold(`„${chosen.name}”`),
    `(ID=${chosen.id})`
  );

  // zapisywanie nowego ID do config.json
  const cfgPath = path.join(__dirname, "..", "config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  cfg.playlistId = chosen.id;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");

  return { id: chosen.id, name: chosen.name };
};
