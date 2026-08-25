"use strict";

// Le dipendenze runtime sono già installate e dichiarate esplicitamente nei
// file del pacchetto. Restituire false evita che electron-builder richieda un
// npm globale soltanto per ricostruire/risolvere lo stesso albero.
module.exports = async function beforeBuild() {
  return false;
};
