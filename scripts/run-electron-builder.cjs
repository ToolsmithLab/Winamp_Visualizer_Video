"use strict";

// Electron usato come runtime Node intercetta per default ogni segmento
// ".asar" come archivio. electron-builder deve invece poter creare e copiare
// default_app.asar come un normale file durante il packaging.
process.noAsar = true;

// yargs tratta electron.exe come un eseguibile generico e conserva il nome
// dello script fra gli argomenti. Rimuoverlo replica process.argv del binario
// electron-builder quando Electron viene usato come runtime Node.
process.argv.splice(1, 1);
require("../node_modules/electron-builder/out/cli/cli");
