import path from "node:path";
import { app, BrowserWindow, Menu } from "electron";
import { registerIpc } from "./ipc";
import { projectMRuntime } from "./projectm/projectMRuntime";
import { initializePresetLibrary } from "./presets/presetRuntime";

let mainWindow: BrowserWindow | null = null;

// Electron/Chromium può terminare l'intera applicazione quando il processo GPU
// non riesce a caricare il runtime DirectX (STATUS_DLL_NOT_FOUND). Il rendering
// projectM vive già nel relativo host nativo separato; la UI e il compositor
// Electron possono quindi usare in sicurezza il backend software.
app.disableHardwareAcceleration();
if (process.platform === "win32") {
  // Alcune installazioni Windows non riescono ad avviare il processo GPU
  // separato di Chromium (STATUS_DLL_NOT_FOUND). Con il backend software già
  // selezionato, mantenerlo nel processo browser evita il crash nativo senza
  // coinvolgere l'host projectM, che resta isolato nel proprio processo.
  app.commandLine.appendSwitch("in-process-gpu");
}

function createWindow(): void {
  const runtimeTest = process.argv.includes("--avs-runtime-test");
  mainWindow = new BrowserWindow({
    x: runtimeTest ? -32_000 : undefined,
    y: runtimeTest ? -32_000 : undefined,
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#090b10",
    show: runtimeTest,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);
  registerIpc(mainWindow);
  mainWindow.loadFile(
    path.join(__dirname, "../renderer/index.html"),
    runtimeTest ? { query: { runtimeTest: "1" } } : undefined
  );
  if (!runtimeTest) {
    mainWindow.once("ready-to-show", () => mainWindow?.show());
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (process.argv.includes("--avs-runtime-test")) {
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
}

app.whenReady().then(async () => {
  try {
    await initializePresetLibrary();
  } catch (error) {
    console.error("Libreria preset non inizializzata:", error);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void projectMRuntime.shutdown();
});
