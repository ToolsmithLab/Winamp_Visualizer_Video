"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.argv[2] || 9391);
const mode = process.argv[3] || "import";
const manifestPath = path.resolve(process.argv[4]);
const projectPath = path.resolve(process.argv[5]);
const exportPath = path.resolve(process.argv[6]);
const reportPath = path.resolve(process.argv[7]);
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class Client {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text
      );
    }
    return response.result.value;
  }
  close() {
    this.socket.close();
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function findTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" && candidate.url.includes("runtimeTest=1")
      );
      if (target) return target;
    } catch {}
    await delay(200);
  }
  throw new Error("Renderer Electron runtime non trovato.");
}

async function waitFor(client, expression, label, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(150);
  }
  throw new Error(`Timeout: ${label}`);
}

async function key(client, keyValue) {
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: keyValue,
    code: keyValue
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: keyValue,
    code: keyValue
  });
}

async function importAt(client, kind, importMode, paths) {
  return client.evaluate(
    `window.__avsRuntimeTest.importSimplePresetsAt(` +
      `${JSON.stringify(kind)},${JSON.stringify(importMode)},${JSON.stringify(paths)})`
  );
}

async function verifyCommonState(client, manifest, checks) {
  await client.evaluate("window.__avsRuntimeTest.selectSimpleEffect('projectM')");
  await client.evaluate("window.__avsRuntimeTest.refreshSimplePresetLibrary()");
  await waitFor(
    client,
    "window.__avsRuntimeTest.snapshot().projectMStatus?.available === true",
    "Motore projectM disponibile"
  );
  checks.simpleControls = await client.evaluate(`(() => {
    const ids = [
      "simple-preset-button",
      "simple-preset-search",
      "simple-preset-filter",
      "simple-preset-favorite",
      "simple-preset-delete",
      "simple-preset-add",
      "simple-preset-import-folder",
      "simple-preset-import-zip",
      "simple-preset-link-folder"
    ];
    const connected = ids.every((id) => {
      const element = document.getElementById(id);
      return element && element.dataset.handler === "connected" &&
        getComputedStyle(element).display !== "none" &&
        !element.closest(".hidden");
    });
    const count = document.getElementById("simple-preset-count");
    return connected && Boolean(count) &&
      getComputedStyle(count).display !== "none" && !count.closest(".hidden");
  })()`);
  assert(checks.simpleControls, "Controlli della Libreria preset non visibili o non collegati.");
  const state = await client.evaluate(
    "window.__avsRuntimeTest.simplePresetLibraryState()"
  );
  checks.catalog = {
    total: state.total,
    valid: state.valid,
    displayed: state.displayed,
    countText: state.countText
  };
  assert(
    state.valid >= manifest.expectedValidMinimum,
    `Catalogo incompleto: ${state.valid}/${manifest.expectedValidMinimum}.`
  );
  assert(
    state.countText.startsWith(`Preset disponibili: ${state.valid}`),
    "Contatore Preset disponibili non coerente."
  );
  const sortedNames = [...state.names].sort((left, right) =>
    left.localeCompare(right, "it", { sensitivity: "base" })
  );
  assert(
    JSON.stringify(sortedNames) === JSON.stringify(state.names),
    "Preset non ordinati alfabeticamente."
  );
  assert(
    state.records.some(
      (record) =>
        record.originKind === "external-folder" &&
        path.resolve(record.sourcePath) === path.resolve(manifest.linkedFolder)
    ),
    "Cartella esterna collegata non persistita."
  );
  assert(
    state.records.some(
      (record) => record.status === "warning" && record.missingTextureCount > 0
    ),
    "Preset con texture mancante non segnalato."
  );
  assert(
    state.records.some(
      (record) => record.originKind === "zip" && record.textureCount > 0
    ),
    "Preset ZIP con texture non catalogato."
  );
  return state;
}

async function runImport(client, manifest, checks) {
  await client.evaluate("window.__avsRuntimeTest.selectSimpleEffect('projectM')");
  const single = await importAt(client, "files", "copy", [manifest.single]);
  checks.single = {
    imported: single.imported.length,
    quarantined: single.quarantined.length,
    duplicates: single.duplicates.length
  };
  assert(single.imported.length === 1, "Import singolo non riuscito.");

  const multiple = await importAt(client, "files", "copy", manifest.multiple);
  checks.multiple = {
    requested: manifest.multiple.length,
    imported: multiple.imported.length
  };
  assert(multiple.imported.length === 10, "Import multiplo di 10 preset non riuscito.");

  const folder = await importAt(
    client,
    "folder",
    "copy",
    [manifest.recursiveFolder]
  );
  checks.folder = {
    imported: folder.imported.length,
    quarantined: folder.quarantined.length,
    issues: folder.issues.length
  };
  assert(folder.imported.length >= 6, "Import cartella ricorsiva incompleto.");
  assert(
    folder.issues.some((entry) => entry.code === "INVALID_MILK_TYPE"),
    "Preset corrotto non ignorato e segnalato."
  );

  const zip = await importAt(client, "zip", "copy", [manifest.zip]);
  checks.zip = {
    imported: zip.imported.length,
    issues: zip.issues.length
  };
  assert(zip.imported.length === 1, "Import ZIP con texture non riuscito.");

  const linked = await importAt(
    client,
    "folder",
    "link",
    [manifest.linkedFolder]
  );
  checks.linked = {
    requested: manifest.linked.length,
    imported: linked.imported.length,
    externalFolder: linked.externalFolder?.path || null
  };
  assert(linked.imported.length === 100, "Collegamento cartella da 100 preset incompleto.");
  assert(
    path.resolve(linked.externalFolder?.path || "") === path.resolve(manifest.linkedFolder),
    "Percorso della cartella collegata errato."
  );

  const duplicate = await importAt(client, "files", "copy", [manifest.single]);
  checks.duplicate = duplicate.duplicates.length;
  assert(duplicate.duplicates.length === 1, "Duplicato SHA-256 non rilevato.");

  const state = await verifyCommonState(client, manifest, checks);
  checks.minimum37 = state.valid >= 37;
  checks.minimum100 = state.valid >= 100;

  const favoritePreset = state.records.find(
    (record) =>
      record.name.includes("Runtime-018") &&
      record.originKind === "external-folder"
  );
  const deletedPreset = state.records.find(
    (record) =>
      record.name.includes("Runtime-020") &&
      record.originKind === "external-folder"
  );
  assert(favoritePreset, "Preset runtime per il test preferiti non trovato.");
  assert(deletedPreset, "Preset runtime per il test eliminazione non trovato.");

  await client.evaluate(
    `window.__avsRuntimeTest.selectPreset(${JSON.stringify(favoritePreset.id)}, true)`
  );
  await client.evaluate(
    `document.querySelector("#simple-preset-favorite").click()`
  );
  await waitFor(
    client,
    `window.__avsRuntimeTest.simplePresetLibraryState().records.some(
      (record) => record.id === ${JSON.stringify(favoritePreset.id)} && record.favorite
    )`,
    "aggiunta ai preferiti"
  );
  await client.evaluate(`(() => {
    const filter = document.querySelector("#simple-preset-filter");
    filter.value = "favorites";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  const favoritesOnly = await client.evaluate(
    "window.__avsRuntimeTest.simplePresetLibraryState()"
  );
  checks.favorite = {
    presetId: favoritePreset.id,
    persistedInCatalog: favoritesOnly.records.some(
      (record) => record.id === favoritePreset.id && record.favorite
    ),
    displayed: favoritesOnly.displayed,
    filter: favoritesOnly.filter
  };
  assert(
    favoritesOnly.filter === "favorites" &&
      favoritesOnly.names.includes(favoritePreset.name) &&
      favoritesOnly.names.every((name) =>
        favoritesOnly.records.some(
          (record) => record.name === name && record.favorite
        )
      ),
    "Filtro Preferiti o aggiornamento immediato non riuscito."
  );
  await client.evaluate(
    `document.querySelector("#simple-preset-favorite").click()`
  );
  await waitFor(
    client,
    `window.__avsRuntimeTest.simplePresetLibraryState().records.some(
      (record) => record.id === ${JSON.stringify(favoritePreset.id)} && !record.favorite
    )`,
    "rimozione dai preferiti"
  );
  checks.favorite.removedImmediately =
    (await client.evaluate(
      "window.__avsRuntimeTest.simplePresetLibraryState().displayed"
    )) === 0;
  assert(
    checks.favorite.removedImmediately,
    "Il preset tolto dai preferiti è rimasto nel filtro Preferiti."
  );
  await client.evaluate(
    `document.querySelector("#simple-preset-favorite").click()`
  );
  await waitFor(
    client,
    `window.__avsRuntimeTest.simplePresetLibraryState().records.some(
      (record) => record.id === ${JSON.stringify(favoritePreset.id)} && record.favorite
    )`,
    "ripristino del preferito per la persistenza"
  );
  checks.favorite.restoredForRestart = true;
  await client.evaluate(`(() => {
    const filter = document.querySelector("#simple-preset-filter");
    filter.value = "all";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);

  await client.evaluate(
    `window.__avsRuntimeTest.selectPreset(${JSON.stringify(deletedPreset.id)}, true)`
  );
  await client.evaluate(`(() => {
    window.__simplePresetDeleteConfirmation = "";
    const originalConfirm = window.confirm;
    window.confirm = (message) => {
      window.__simplePresetDeleteConfirmation = String(message);
      return true;
    };
    document.querySelector("#simple-preset-delete").click();
    window.confirm = originalConfirm;
  })()`);
  await waitFor(
    client,
    `!window.__avsRuntimeTest.simplePresetLibraryState().records.some(
      (record) => record.id === ${JSON.stringify(deletedPreset.id)}
    )`,
    "rimozione preset dalla libreria"
  );
  await waitFor(
    client,
    `window.__avsRuntimeTest.snapshot().project.projectM.presetId !== ${JSON.stringify(deletedPreset.id)}`,
    "selezione del preset successivo dopo la rimozione"
  );
  checks.delete = await client.evaluate(`({
    deletedId: ${JSON.stringify(deletedPreset.id)},
    confirmation: window.__simplePresetDeleteConfirmation,
    sourceStillPresent: true,
    selectedId: window.__avsRuntimeTest.snapshot().project.projectM.presetId
  })`);
  checks.delete.sourceStillPresent = await fs
    .access(deletedPreset.sourcePath)
    .then(() => true)
    .catch(() => false);
  assert(
    checks.delete.confirmation.includes("Il file esterno") &&
      checks.delete.confirmation.includes("sul disco"),
    "Conferma distinta per cartella esterna assente."
  );
  assert(
    checks.delete.sourceStillPresent,
    "La rimozione dalla libreria ha cancellato il file della cartella esterna."
  );
  assert(
    checks.delete.selectedId !== deletedPreset.id,
    "Il preset eliminato è rimasto selezionato."
  );

  await client.evaluate(`(() => {
    const search = document.querySelector("#simple-preset-search");
    search.value = "Runtime-050";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  const searched = await client.evaluate(
    "window.__avsRuntimeTest.simplePresetLibraryState()"
  );
  checks.search = {
    displayed: searched.displayed,
    names: searched.names
  };
  assert(
    searched.names.some((name) => name.includes("Runtime-050")),
    "Ricerca preset non trova il risultato."
  );
  await client.evaluate(`(() => {
    const search = document.querySelector("#simple-preset-search");
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.querySelector("#simple-preset-button");
    button.focus();
    button.click();
  })()`);
  await key(client, "End");
  await delay(200);
  const combo = await client.evaluate(
    "window.__avsRuntimeTest.presetComboboxState()"
  );
  checks.scroll = combo;
  assert(
    combo.open && combo.count >= 100 && combo.activeIndex === combo.count - 1,
    "Tendina numerosa o navigazione End non funzionante."
  );
  assert(combo.scrollTop > 0, "Scroll della tendina non avanzato.");
  await key(client, "Escape");

  await client.evaluate(
    `window.__avsRuntimeTest.loadAudio(${JSON.stringify(manifest.audio)})`
  );
  await client.evaluate("window.__avsRuntimeTest.togglePlayback()");
  await waitFor(
    client,
    "window.__avsRuntimeTest.snapshot().playing && " +
      "window.__avsRuntimeTest.snapshot().currentTime > 0.15 && " +
      "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
    "Play e framebuffer projectM",
    120_000
  );
  const selectable = state.records.find(
    (record) => !record.quarantined && record.originKind === "external-folder"
  );
  assert(selectable, "Nessun preset collegato selezionabile.");
  const before = await client.evaluate(
    "window.__avsRuntimeTest.snapshot().currentTime"
  );
  const changed = await client.evaluate(
    `window.__avsRuntimeTest.selectPreset(${JSON.stringify(selectable.id)}, true)`
  );
  assert(changed, "Cambio preset durante Play fallito.");
  await waitFor(
    client,
    `window.__avsRuntimeTest.snapshot().playing && ` +
      `window.__avsRuntimeTest.snapshot().currentTime > ${before} && ` +
      `window.__avsRuntimeTest.snapshot().project.projectM.presetId === ${JSON.stringify(selectable.id)}`,
    "reazione audio e cambio preset durante Play"
  );
  checks.play = await client.evaluate(`(() => {
    const snapshot = window.__avsRuntimeTest.snapshot();
    return {
      playing: snapshot.playing,
      currentTime: snapshot.currentTime,
      frame: snapshot.projectMFrame,
      presetId: snapshot.project.projectM.presetId
    };
  })()`);

  await client.evaluate(
    `window.__avsRuntimeTest.saveProjectAt(${JSON.stringify(projectPath)})`
  );
  await client.evaluate(
    `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
  );
  checks.saveReopen =
    (await client.evaluate(
      `window.__avsRuntimeTest.snapshot().project.projectM.presetId === ${JSON.stringify(selectable.id)}`
    )) === true;
  assert(checks.saveReopen, "Save/reopen non conserva il preset selezionato.");

  await client.evaluate("window.__avsRuntimeTest.setExportProfile(180,320,30)");
  const exported = await client.evaluate(
    `window.__avsRuntimeTest.exportAt(${JSON.stringify(exportPath)})`
  );
  checks.export = exported;
  assert(exported.done && exported.percent === 100, "Export con projectM fallito.");
}

async function runVerify(client, manifest, checks) {
  const state = await verifyCommonState(client, manifest, checks);
  const favoritePreset = state.records.find((record) =>
    record.name.includes("Runtime-018")
  );
  const deletedPreset = state.records.find((record) =>
    record.name.includes("Runtime-020")
  );
  checks.favoritePersistence = Boolean(favoritePreset?.favorite);
  checks.deletePersistence = !deletedPreset;
  assert(
    checks.favoritePersistence,
    "Preferito perso dopo il riavvio dell'app."
  );
  assert(
    checks.deletePersistence,
    "Preset rimosso ricomparso dopo il riavvio dell'app."
  );
  await client.evaluate(
    `window.__avsRuntimeTest.openProjectAt(${JSON.stringify(projectPath)})`
  );
  await waitFor(
    client,
    "Boolean(window.__avsRuntimeTest.snapshot().projectMFrame)",
    "frame projectM dopo riapertura",
    120_000
  );
  const snapshot = await client.evaluate(
    "window.__avsRuntimeTest.snapshot()"
  );
  checks.restart = {
    valid: state.valid,
    selectedId: snapshot.project.projectM.presetId,
    projectMAvailable: snapshot.projectMStatus?.available === true,
    framePresent: Boolean(snapshot.projectMFrame)
  };
  assert(checks.restart.selectedId, "Preset selezionato perso dopo riavvio.");
  assert(checks.restart.projectMAvailable, "projectM non disponibile dopo riavvio.");
  assert(checks.restart.framePresent, "Framebuffer assente dopo riavvio.");
  const record = state.records.find(
    (candidate) => candidate.id === checks.restart.selectedId
  );
  assert(record && !record.quarantined, "Preset riaperto non presente nella libreria.");
}

async function main() {
  const startedAt = Date.now();
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const checks = {};
  let client;
  try {
    const target = await findTarget();
    client = new Client(target.webSocketDebuggerUrl);
    await client.open();
    await client.send("Runtime.enable");
    await waitFor(
      client,
      "Boolean(window.avs && window.__avsRuntimeTest)",
      "preload e runtime test"
    );
    if (mode === "import") await runImport(client, manifest, checks);
    else await runVerify(client, manifest, checks);
    const report = {
      passed: true,
      mode,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      checks,
      manifestPath,
      projectPath,
      exportPath
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    await client.evaluate("window.close()");
  } catch (error) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          passed: false,
          mode,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          error: String(error?.stack || error),
          checks
        },
        null,
        2
      ),
      "utf8"
    );
    try {
      await client?.evaluate("window.close()");
    } catch {}
    throw error;
  } finally {
    client?.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
