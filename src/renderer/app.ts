import "./styles.css";
import { AudioEngine } from "./audioEngine";
import {
  PreviewRenderer,
  type ClipPreviewInfo,
  type CoverPreviewInfo
} from "./previewRenderer";
import { projectState } from "./state";
import { PresetLibraryView } from "./presets/presetLibraryView";
import { PresetCatalogViewController } from "./presets/presetCatalogView";
import { bindHistoryController } from "./commands/historyController";
import { PluginParameterInspector } from "./inspector/parameterControls";
import { ProjectPresetView } from "./projectPresets/projectPresetView";
import { AssetRelinkView } from "./projectAssets/assetRelinkView";
import { pluginRegistry } from "../engine/plugins/registry";
import { normalizePluginParameter } from "../engine/plugins/validation";
import type {
  ClipMetadata,
  ExportProgress,
  MediaPayload,
  ProjectFileResult,
  ProjectMFrame,
  ProjectMStatus
} from "../shared/ipc";
import type { PresetRecord } from "../shared/presets";
import type { ProjectPresetPreview } from "../shared/projectPreset";
import {
  createDefaultProject,
  synchronizeSelectedAudio,
  type AudioSourceMode,
  type ClipEndMode,
  type LayerTransform,
  type PluginSettingValue,
  type PresetChangeSource,
  type ProjectLayer,
  type ReactiveSettings,
  type VisualizerPluginId,
  type VisualizerProject
} from "../shared/project";
import {
  buildPresetSequence,
  manualPresetChoice,
  presetEventAt,
  type PresetSequenceEvent
} from "../shared/presetSequencer";
import {
  ANIMATABLE_PROPERTIES,
  adjacentKeyframe,
  basePropertyValue,
  buildKeyframeIndex,
  evaluateProperty,
  isAnimatableProperty,
  removeKeyframe,
  upsertKeyframe,
  type AnimatableProperty
} from "../engine/keyframes/keyframeEngine";
import {
  clampClip,
  frameTime,
  normalizeViewport,
  pixelToTime,
  snapTimelineTime,
  timeToPixel,
  type TimelineViewport
} from "../engine/timeline/geometry";
import { updateProjectAssets } from "../engine/project/assetResolver";
import {
  centerCover,
  fitCoverToCanvas,
  loadCoverIntoProject,
  removeCoverFromProject,
  resetCoverPresentation,
  setCoverVisible
} from "../engine/composition/coverCommands";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Contenitore applicazione non trovato.");
}

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <strong>Audio Visualizer Studio</strong>
          <span id="project-status">Progetto senza titolo</span>
        </div>
      </div>
      <div class="top-actions legacy-ui" aria-hidden="true">
        <button id="new-project" class="button button-ghost">Nuovo</button>
        <button id="open-project" class="button button-ghost">Apri</button>
        <button id="save-project" class="button button-ghost">Salva</button>
        <button id="undo-command" class="button button-ghost" disabled>Annulla</button>
        <button id="redo-command" class="button button-ghost" disabled>Ripeti</button>
        <button id="export-video" class="button button-primary">Esporta MP4</button>
      </div>
    </header>

    <section class="workspace">
      <aside class="simple-sidebar" aria-label="Crea il video">
        <section class="simple-section" aria-labelledby="simple-image-heading">
          <div class="simple-section-heading">
            <span>1</span>
            <h2 id="simple-image-heading">Sfondo</h2>
          </div>
          <button id="simple-choose-cover" class="simple-pick-button">
            <span aria-hidden="true">＋</span>
            Carica cover immagine
          </button>
          <div id="simple-cover-file" class="simple-media-file hidden">
            <img id="simple-cover-thumbnail" alt="Anteprima immagine" />
            <div>
              <strong id="simple-cover-name"></strong>
              <small>Selezionata nell'anteprima</small>
            </div>
          </div>
          <label class="simple-label">Adattamento sfondo
            <select id="simple-cover-fit">
              <option value="contain">Adatta</option>
              <option value="fill">Riempi</option>
              <option value="original">Dimensione originale</option>
            </select>
          </label>
          <label class="simple-effect-range">Opacità sfondo
            <span>
              <input id="simple-background-opacity" type="range"
                min="0" max="100" step="1" value="100" />
              <output id="simple-background-opacity-value">100%</output>
            </span>
          </label>
          <button id="simple-remove-cover" class="simple-remove-button" disabled>Rimuovi sfondo</button>
          <div class="simple-media-alternative" aria-hidden="true">
            <span></span><strong>oppure</strong><span></span>
          </div>
          <button id="simple-choose-clip"
            class="simple-pick-button simple-clip-pick-button">
            <span aria-hidden="true">▶</span>
            <span>
              <strong>Carica clip video</strong>
              <small>MP4, MOV, M4V o WEBM (codec compatibile)</small>
            </span>
          </button>
          <div id="simple-clip-file" class="simple-audio-file hidden">
            <strong id="simple-clip-name"></strong>
            <small id="simple-clip-details"></small>
          </div>
        </section>

        <section class="simple-section" aria-labelledby="simple-audio-heading">
          <div class="simple-section-heading">
            <span>2</span>
            <h2 id="simple-audio-heading">Audio</h2>
          </div>
          <fieldset class="simple-audio-source">
            <legend>Sorgente audio</legend>
            <div class="simple-segmented-control">
              <label>
                <input id="simple-audio-source-clip" name="simple-audio-source"
                  type="radio" value="clip" />
                <span>Usa audio della clip</span>
              </label>
              <label>
                <input id="simple-audio-source-external" name="simple-audio-source"
                  type="radio" value="external" checked />
                <span>Usa audio esterno</span>
              </label>
            </div>
          </fieldset>
          <p id="simple-audio-source-status" class="simple-audio-source-status">
            Sorgente attiva: audio esterno
          </p>
          <button id="simple-choose-audio" class="simple-pick-button">
            <span aria-hidden="true">♫</span>
            Scegli audio
          </button>
          <div id="simple-audio-file" class="simple-audio-file hidden">
            <strong id="simple-audio-name"></strong>
            <small id="simple-audio-duration"></small>
          </div>
          <p id="simple-audio-error" class="simple-inline-error hidden"></p>
          <label id="simple-clip-end-mode-row" class="simple-label hidden">
            Se la clip è più corta
            <select id="simple-clip-end-mode">
              <option value="freeze">Mantieni ultimo frame</option>
              <option value="loop">Ripeti clip</option>
              <option value="black">Sfondo nero</option>
            </select>
          </label>
        </section>

        <section class="simple-section" aria-labelledby="simple-title-heading">
          <div class="simple-section-heading">
            <span>3</span>
            <h2 id="simple-title-heading">Titolo</h2>
          </div>
          <input id="simple-title" class="simple-text-field" type="text"
            maxlength="120" placeholder="Scrivi il titolo" />
          <div class="simple-control-grid">
            <label>Dimensione
              <input id="simple-title-size" type="range" min="16" max="120" step="1" />
              <output id="simple-title-size-value">34 px</output>
            </label>
            <label>Colore
              <input id="simple-title-color" type="color" aria-label="Colore titolo" />
            </label>
            <label>Opacità
              <input id="simple-title-opacity" type="range" min="0" max="100" step="1" />
              <output id="simple-title-opacity-value">100%</output>
            </label>
          </div>
        </section>

        <section class="simple-section" aria-labelledby="simple-artist-heading">
          <div class="simple-section-heading">
            <span>4</span>
            <h2 id="simple-artist-heading">Artista</h2>
          </div>
          <input id="simple-artist" class="simple-text-field" type="text"
            maxlength="80" placeholder="Scrivi il nome artista" />
          <div class="simple-control-grid">
            <label>Dimensione
              <input id="simple-artist-size" type="range" min="12" max="80" step="1" />
              <output id="simple-artist-size-value">17 px</output>
            </label>
            <label>Colore
              <input id="simple-artist-color" type="color" aria-label="Colore artista" />
            </label>
            <label>Opacità
              <input id="simple-artist-opacity" type="range" min="0" max="100" step="1" />
              <output id="simple-artist-opacity-value">72%</output>
            </label>
          </div>
        </section>

        <section class="simple-section" aria-labelledby="simple-effect-heading">
          <div class="simple-section-heading">
            <span>5</span>
            <h2 id="simple-effect-heading">Effetto</h2>
          </div>
          <label class="simple-label">Scegli effetto
            <select id="simple-effect">
              <option value="none">Nessun effetto</option>
              <option value="spectrumBars">Spectrum Bars</option>
              <option value="circularSpectrum">Circular Spectrum</option>
              <option value="waveformLine">Waveform Line</option>
              <option value="particleBurst">Particle Burst</option>
              <option value="pulseShapes">Pulse Shapes</option>
              <option value="dynamicVignette">Dynamic Vignette</option>
              <option value="radialRays">Radial Rays</option>
              <option value="mirroredWaveform">Mirrored Waveform</option>
              <option value="audioGrid">Audio Grid</option>
              <option value="orbitingParticles">Orbiting Particles</option>
              <option value="projectM">projectM / MilkDrop</option>
            </select>
          </label>
          <div id="simple-preset-row" class="simple-preset-panel hidden">
            <label class="simple-label" for="simple-preset-button">Preset MilkDrop</label>
            <input id="simple-preset-search" class="simple-preset-search"
              type="search" placeholder="Cerca preset" autocomplete="off"
              aria-label="Cerca Preset MilkDrop" />
            <label class="simple-label">Filtro preset
              <select id="simple-preset-filter">
                <option value="all">Tutti</option>
                <option value="favorites">Preferiti</option>
                <option value="current-folder">Cartella corrente</option>
              </select>
            </label>
            <button id="simple-preset-button" class="simple-combobox-button"
              type="button" role="combobox" aria-haspopup="listbox"
              aria-expanded="false" aria-controls="simple-preset-listbox">
              <span id="simple-preset-value">Nessun preset disponibile</span>
              <span aria-hidden="true">▾</span>
            </button>
            <select id="simple-preset" class="simple-native-state"
              tabindex="-1" aria-hidden="true"></select>
            <p id="simple-preset-selected" class="simple-preset-selected">
              Selezionato: nessuno
            </p>
            <div class="simple-preset-manage-actions">
              <button id="simple-preset-favorite" type="button"
                aria-pressed="false">☆ Preferito</button>
              <button id="simple-preset-delete" type="button"
                class="danger">Elimina preset</button>
            </div>
            <p id="simple-preset-count" class="simple-preset-count"
              aria-live="polite">Preset disponibili: 0</p>
            <div class="simple-preset-import-actions">
              <button id="simple-preset-add" type="button">Aggiungi preset</button>
              <button id="simple-preset-import-folder" type="button">Importa cartella</button>
              <button id="simple-preset-import-zip" type="button">Importa ZIP</button>
              <button id="simple-preset-link-folder" type="button">Collega cartella</button>
            </div>
          </div>
          <label class="simple-effect-range">Intensità
            <span>
              <input id="simple-intensity" type="range" min="0" max="200"
                step="1" value="100" />
              <output id="simple-intensity-value">100%</output>
            </span>
          </label>
          <label class="simple-effect-range">Opacità
            <span>
              <input id="simple-effect-opacity" type="range" min="0" max="100"
                step="1" value="100" />
              <output id="simple-effect-opacity-value">100%</output>
            </span>
          </label>
          <div class="simple-effect-actions">
            <button id="simple-effect-center" type="button">Centra</button>
            <button id="simple-effect-fit" type="button">Adatta</button>
            <button id="simple-effect-reset" type="button">Ripristina</button>
            <button id="simple-effect-remove" type="button"
              class="danger">Rimuovi effetto</button>
          </div>
          <p id="simple-effect-error" class="simple-error hidden" role="alert"></p>
        </section>
      </aside>
      <div id="simple-preset-listbox" class="simple-preset-listbox hidden"
        role="listbox" tabindex="-1" aria-label="Preset MilkDrop"></div>

      <aside class="panel left-panel legacy-ui" aria-hidden="true">
        <nav class="rail" aria-label="Sezioni">
          <button class="rail-item active"><span>◇</span>Media</button>
          <button class="rail-item"><span>▥</span>Visualizzatore</button>
          <button class="rail-item"><span>✦</span>Effetti</button>
          <button class="rail-item"><span>T</span>Testo</button>
          <button class="rail-item"><span>▤</span>Livelli</button>
        </nav>
        <div class="panel-content">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">SORGENTI</p>
              <h2>Media</h2>
            </div>
          </div>

          <button id="choose-audio" class="drop-card">
            <span class="drop-icon">♫</span>
            <strong>Carica audio</strong>
            <small>MP3 o WAV</small>
          </button>
          <div id="audio-file" class="file-card hidden">
            <span class="file-icon">♫</span>
            <div>
              <strong id="audio-name"></strong>
              <small id="audio-duration">Analisi…</small>
            </div>
          </div>

          <section class="cover-primary" aria-labelledby="cover-primary-heading">
            <div class="cover-primary-heading">
              <div>
                <p class="eyebrow">IMMAGINE DEL BRANO</p>
                <h3 id="cover-primary-heading">Cover</h3>
              </div>
            </div>
            <button id="choose-cover" class="drop-card compact">
              <span class="drop-icon">▧</span>
              <strong>Carica cover</strong>
              <small>PNG, JPG o WEBP</small>
            </button>
            <div id="cover-file" class="cover-file-card hidden">
              <img id="cover-thumbnail" alt="Anteprima cover" />
              <div class="cover-file-info">
                <strong id="cover-name"></strong>
                <small>Selezionata nel canvas</small>
              </div>
            </div>
            <label class="cover-visible-row">
              <input id="cover-visible-primary" type="checkbox" />
              Mostra cover
            </label>
            <label>Adattamento cover
              <select id="cover-fit-primary">
                <option value="contain">Contieni</option>
                <option value="fill">Riempi</option>
                <option value="stretch">Stira</option>
                <option value="original">Originale</option>
              </select>
            </label>
            <div class="cover-actions">
              <button id="cover-adapt-primary" class="mini-button">Adatta</button>
              <button id="cover-center-primary" class="mini-button">Centra</button>
              <button id="cover-reset-primary" class="mini-button">Ripristina</button>
              <button id="cover-remove-primary" class="mini-button danger">Rimuovi</button>
            </div>
          </section>

          <div class="phase-note">
            <span>FASE 2</span>
            <p>projectM reale, overlay Canvas, livelli e timeline.</p>
          </div>

          <section id="project-preset-library" class="preset-library" aria-labelledby="project-preset-heading">
            <div class="preset-library-heading">
              <div>
                <p class="eyebrow">CONFIGURAZIONI VISUALI</p>
                <h3 id="project-preset-heading">Preset di progetto</h3>
              </div>
            </div>
            <p class="preset-rights-note">
              Formato dati .avspreset, separato dai Preset MilkDrop. Per impostazione
              predefinita non incorpora file binari.
            </p>
            <div class="project-preset-form">
              <label>Nome<input data-role="name" type="text" maxlength="120" /></label>
              <label>Autore dichiarato<input data-role="author" type="text" maxlength="160" /></label>
              <label>Descrizione<textarea data-role="description" maxlength="1000"></textarea></label>
              <fieldset>
                <legend>Riferimenti asset opzionali</legend>
                <label><input data-asset="audio" type="checkbox" /> Audio</label>
                <label><input data-asset="cover" type="checkbox" /> Copertina</label>
                <label><input data-asset="milkdrop" type="checkbox" /> Preset MilkDrop</label>
                <label><input data-asset="textures" type="checkbox" /> Texture</label>
              </fieldset>
            </div>
            <div class="preset-import-actions">
              <button data-action="create">Crea Preset di progetto</button>
              <button data-action="import">Importa .avspreset</button>
            </div>
            <input data-role="search" class="preset-search" type="search" placeholder="Cerca Preset di progetto…" />
            <select data-role="sort" class="preset-search" aria-label="Ordina Preset di progetto">
              <option value="name">Ordina per nome</option>
              <option value="createdAt">Data creazione</option>
              <option value="modifiedAt">Ultima modifica</option>
            </select>
            <div data-role="list" class="preset-list" aria-live="polite"></div>
            <div data-role="details" class="project-preset-preview hidden" aria-live="polite"></div>
          </section>

          <section id="project-assets" class="preset-library" aria-labelledby="project-assets-heading">
            <div class="preset-library-heading">
              <div>
                <p class="eyebrow">RISOLUZIONE MEDIA</p>
                <h3 id="project-assets-heading">Asset del progetto</h3>
              </div>
            </div>
            <p class="preset-rights-note">
              I riferimenti mancanti restano nel progetto. Il ricollegamento verifica
              tipo reale e SHA-256 prima dell'applicazione.
            </p>
            <div class="preset-import-actions">
              <button data-asset-action="search">Cerca nella cartella</button>
              <button data-asset-action="search-recursive">Cerca anche sottocartelle</button>
            </div>
            <div data-role="asset-list" class="preset-list" aria-live="polite"></div>
          </section>

          <section class="projectm-card" aria-labelledby="projectm-heading">
            <div class="projectm-card-heading">
              <div>
                <p class="eyebrow">MOTORE NATIVO</p>
                <h3 id="projectm-heading">Motore projectM</h3>
              </div>
              <span id="projectm-state" class="runtime-state">Verifica…</span>
            </div>
            <dl class="runtime-details">
              <div><dt>Versione</dt><dd id="projectm-version">—</dd></div>
              <div><dt>Preset</dt><dd id="projectm-preset">—</dd></div>
            </dl>
            <label class="projectm-toggle">
              <input id="projectm-enabled" type="checkbox" checked />
              Attiva motore e livello
            </label>
            <p id="projectm-error" class="runtime-error hidden"></p>
          </section>

          <section class="preset-control-card" aria-labelledby="preset-control-heading">
            <div class="preset-library-heading">
              <div>
                <p class="eyebrow">RIPRODUZIONE PRESET</p>
                <h3 id="preset-control-heading">Controllo preset</h3>
              </div>
              <span id="preset-playlist-count" class="runtime-state">1 in playlist</span>
            </div>
            <div class="preset-transport">
              <button id="preset-previous" title="Preset precedente">◀</button>
              <button id="preset-restart" title="Riavvia preset">↻</button>
              <button id="preset-random" title="Preset casuale">Casuale</button>
              <button id="preset-next" title="Preset successivo">▶</button>
              <button id="preset-favorite-current" title="Aggiungi ai preferiti">☆</button>
            </div>
            <label class="projectm-toggle">
              <input id="preset-locked" type="checkbox" />
              Blocco preset
            </label>
            <div class="preset-setting-grid">
              <label><span>Cambio automatico</span><input id="preset-auto-enabled" type="checkbox" /></label>
              <label>Modalità
                <select id="preset-auto-mode">
                  <option value="interval">Intervallo</option>
                  <option value="timeline-markers">Marcatori timeline</option>
                  <option value="music-events">Eventi musicali analizzati</option>
                </select>
              </label>
              <label>Ordine
                <select id="preset-auto-order">
                  <option value="sequential">Sequenziale</option>
                  <option value="random">Casuale</option>
                </select>
              </label>
              <label>Intervallo (s)<input id="preset-interval" type="number" min="1" max="3600" step="1" /></label>
              <label>Minimo (s)<input id="preset-minimum" type="number" min="1" max="3600" step="1" /></label>
              <label>Massimo (s)<input id="preset-maximum" type="number" min="1" max="3600" step="1" /></label>
              <label><span>No ripetizioni</span><input id="preset-no-repeat" type="checkbox" /></label>
              <label><span>Transizione</span><input id="preset-transition-enabled" type="checkbox" /></label>
              <label>Durata (s)<input id="preset-transition-duration" type="number" min="0" max="30" step="0.1" /></label>
              <label>Seed sequenza<input id="preset-random-seed" type="number" min="0" max="4294967295" step="1" /></label>
              <label>Seed particelle<input id="particle-random-seed" type="number" min="0" max="4294967295" step="1" /></label>
            </div>
            <div class="preset-marker-actions">
              <button id="preset-add-marker">Aggiungi marcatore</button>
              <button id="preset-analyze-music">Analizza eventi</button>
              <span id="preset-marker-count">0 marcatori</span>
            </div>
          </section>

          <section id="preset-library" class="preset-library" aria-labelledby="preset-library-heading">
            <div class="preset-library-heading">
              <div>
                <p class="eyebrow">PRESET MILKDROP</p>
                <h3 id="preset-library-heading">Libreria preset</h3>
              </div>
            </div>
            <div class="preset-import-actions">
              <button data-import-kind="files" data-import-mode="copy">Importa preset</button>
              <button data-import-kind="folder" data-import-mode="copy">Importa cartella</button>
              <button data-import-kind="zip" data-import-mode="copy">Importa ZIP</button>
              <button data-import-kind="folder" data-import-mode="link">Collega cartella</button>
            </div>
            <p class="preset-rights-note">
              Libreria personale: i preset senza licenza verificabile restano utilizzabili
              localmente. Non vengono redistribuiti; l'utente è responsabile dei diritti
              necessari per l'uso e per i video esportati.
            </p>
            <input id="preset-search" class="preset-search" type="search" placeholder="Cerca nome, autore, hash…" />
            <div class="preset-filter-grid">
              <select id="preset-status-filter" aria-label="Filtra stato">
                <option value="all">Tutti gli stati</option>
                <option value="valid">Compatibili</option>
                <option value="warning">Con avvisi</option>
                <option value="quarantined">Quarantena</option>
                <option value="missing">Mancanti</option>
                <option value="incompatible">Incompatibili</option>
              </select>
              <select id="preset-sort" aria-label="Ordina preset">
                <option value="name">Ordina per nome</option>
                <option value="importedAt">Data importazione</option>
                <option value="author">Autore</option>
                <option value="status">Stato</option>
              </select>
              <select id="preset-license-filter" aria-label="Filtra licenza">
                <option value="all">Tutte le licenze</option>
                <option value="verified">Licenza verificata</option>
                <option value="unverified">Licenza non verificata</option>
              </select>
              <label><input id="preset-favorites-only" type="checkbox" /> Preferiti</label>
            </div>
            <div id="preset-list" class="preset-list" aria-live="polite"></div>
          </section>

          <section id="preset-catalog" class="preset-library" aria-labelledby="preset-catalog-heading">
            <div class="preset-library-heading">
              <div>
                <p class="eyebrow">PACCHETTI VERIFICATI</p>
                <h3 id="preset-catalog-heading">Catalogo ufficiale</h3>
              </div>
              <span id="preset-catalog-version" class="runtime-state">—</span>
            </div>
            <p class="preset-rights-note">
              Solo pacchetti con fonte, licenza e SHA-256 verificati. Nessun download
              o aggiornamento viene eseguito senza conferma.
            </p>
            <div id="preset-catalog-list" class="preset-list" aria-live="polite"></div>
          </section>

          <dialog id="preset-license-dialog" class="license-dialog">
            <h3>Licenza del pacchetto</h3>
            <pre id="preset-license-text"></pre>
            <button id="preset-license-close">Chiudi</button>
          </dialog>

          <div class="layers-heading">
            <div>
              <p class="eyebrow">COMPOSIZIONE</p>
              <h3>Livelli</h3>
            </div>
            <span id="layer-count">0</span>
          </div>
          <div id="layers-list" class="layers-list"></div>
        </div>
      </aside>

      <section class="stage">
        <div class="simple-stage-toolbar">
          <span id="preview-metrics" class="quality-pill legacy-ui"
            aria-hidden="true">PREVIEW</span>
          <div class="project-format-controls" role="group"
            aria-label="Formato progetto">
            <strong>Formato progetto</strong>
            <button id="project-format-9-16" type="button"
              data-project-format="9:16">9:16</button>
            <button id="project-format-1-1" type="button"
              data-project-format="1:1">1:1</button>
            <button id="project-format-4-3" type="button"
              data-project-format="4:3">4:3</button>
            <button id="project-format-16-9" type="button"
              data-project-format="16:9">16:9</button>
          </div>
          <div class="preview-zoom-controls" role="group"
            aria-label="Zoom anteprima">
            <strong>Zoom anteprima</strong>
            <button id="preview-zoom-fit" type="button">Adatta allo schermo</button>
            <button id="preview-zoom-100" type="button">100%</button>
            <button id="preview-zoom-out" type="button"
              aria-label="Riduci zoom">Zoom −</button>
            <button id="preview-zoom-in" type="button"
              aria-label="Aumenta zoom">Zoom +</button>
            <output id="preview-zoom-value">Adatta</output>
          </div>
        </div>
        <div class="stage-workspace">
          <div id="stage-viewport" class="stage-viewport">
            <div id="video-stage-frame" class="video-stage-frame"
              data-project-format="9:16">
              <canvas id="preview" width="540" height="960"
                aria-label="Stage video: anteprima dell'area esportata"></canvas>
              <div id="canvas-empty-state" class="canvas-empty-state">
                <strong>1. Carica una cover o una clip video</strong>
                <span>2. Carica il brano</span>
                <span>3. Scrivi titolo e artista</span>
                <span>4. Scegli un effetto</span>
                <span>5. Premi Play</span>
              </div>
            </div>
          </div>
          <aside class="simple-layer-selector" aria-labelledby="simple-layer-heading">
            <div class="simple-layer-selector-heading">
              <strong id="simple-layer-heading">Layer</strong>
              <span id="simple-selected-layer-name">Nessun elemento</span>
            </div>
            <div class="simple-layer-buttons" role="group" aria-label="Layer attivo">
              <button id="simple-layer-background" type="button"
                data-simple-layer-kind="background">
                <span aria-hidden="true">▧</span>
                <strong id="simple-layer-background-label">Sfondo</strong>
                <small data-layer-state>ASSENTE</small>
              </button>
              <button id="simple-layer-effect" type="button"
                data-simple-layer-kind="effect">
                <span aria-hidden="true">✦</span><strong>Effetto</strong>
                <small data-layer-state>ASSENTE</small>
              </button>
              <button id="simple-layer-title" type="button"
                data-simple-layer-kind="titleText">
                <span aria-hidden="true">T</span><strong>Titolo</strong>
                <small data-layer-state>ASSENTE</small>
              </button>
              <button id="simple-layer-artist" type="button"
                data-simple-layer-kind="artistText">
                <span aria-hidden="true">A</span><strong>Artista</strong>
                <small data-layer-state>ASSENTE</small>
              </button>
            </div>
            <label class="simple-layer-lock">
              <input id="simple-layer-selection-lock" type="checkbox" checked />
              Blocca selezione sul layer attivo
            </label>
            <div class="simple-layer-actions">
              <button id="simple-layer-center" type="button">Centra</button>
              <button id="simple-layer-fit" type="button">Adatta</button>
              <button id="simple-layer-reset" type="button">Ripristina</button>
            </div>
            <label class="simple-stage-guides">
              <input id="simple-stage-guides" type="checkbox" checked />
              Mostra guide
            </label>
          </aside>
        </div>
        <div class="simple-waveform" aria-label="Forma d'onda del brano">
          <canvas id="waveform" width="1200" height="76"></canvas>
        </div>
        <div class="transport">
          <button id="to-start" class="legacy-ui" aria-hidden="true">Inizio</button>
          <button id="play-pause" class="play-button" aria-label="Riproduci" disabled>Play</button>
          <button id="stop" class="icon-button" aria-label="Stop" disabled>Stop</button>
          <span id="current-time" class="timecode">00:00.000</span>
          <span class="time-divider">/</span>
          <span id="total-time" class="timecode muted">00:00.000</span>
          <input id="simple-seek" class="simple-seek" type="range"
            min="0" max="0" value="0" step="0.001" aria-label="Posizione temporale" disabled />
          <button id="simple-export-video" class="button button-primary" disabled>Esporta video</button>
        </div>
        <p id="simple-play-hint" class="simple-play-hint">Carica prima un brano</p>
      </section>

      <aside class="panel inspector legacy-ui" aria-hidden="true">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">PROPRIETÀ</p>
            <h2 id="inspector-title">Cover</h2>
          </div>
        </div>

        <section id="layer-section" class="control-section">
          <h3>Livello</h3>
          <label>Nome<input id="layer-name" type="text" maxlength="80" /></label>
          <div class="toggle-grid">
            <label><input id="layer-visible" type="checkbox" /> Visibile</label>
            <label><input id="layer-locked" type="checkbox" /> Bloccato</label>
          </div>
          <label>Opacità <output id="layer-opacity-value">100%</output>
            <input id="layer-opacity" type="range" min="0" max="100" step="1" />
          </label>
          <label>Fusione
            <select id="layer-blend">
              <option value="source-over">Normale</option>
              <option value="screen">Screen</option>
              <option value="lighter">Add</option>
              <option value="multiply">Multiply</option>
              <option value="overlay">Overlay</option>
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
            </select>
          </label>
          <div class="time-range-grid">
            <label>Inizio (s)<input id="layer-start" type="number" min="0" step="0.1" /></label>
            <label>Fine (s)<input id="layer-end" type="number" min="0" step="0.1" placeholder="Durata" /></label>
          </div>
          <div class="layer-actions">
            <button id="layer-down" class="mini-button">Sotto</button>
            <button id="layer-up" class="mini-button">Sopra</button>
            <select id="plugin-add-select" aria-label="Plugin Canvas da aggiungere"></select>
            <button id="layer-add" class="mini-button">Aggiungi plugin Canvas</button>
            <button id="layer-duplicate" class="mini-button">Duplica</button>
            <button id="layer-delete" class="mini-button">Elimina</button>
          </div>
        </section>

        <section id="text-section" class="control-section">
          <h3>Testo</h3>
          <label>Artista<input id="artist" type="text" maxlength="80" /></label>
          <label>Titolo<input id="title" type="text" maxlength="120" /></label>
          <label class="color-row">Colore testo<input id="text-color" type="color" /></label>
          <label>Dimensione <output id="text-size-value">32px</output>
            <input id="text-size" type="range" min="2" max="14" step="0.2" />
          </label>
        </section>

        <section id="scene-section" class="control-section">
          <h3>Scena</h3>
          <label class="color-row">Colore accento<input id="accent-color" type="color" /></label>
          <label class="color-row">Sfondo<input id="background-color" type="color" /></label>
        </section>

        <section id="cover-section" class="control-section">
          <h3>Cover</h3>
          <label>Adattamento cover
            <select id="cover-fit">
              <option value="contain">Contieni</option>
              <option value="fill">Riempi</option>
              <option value="stretch">Stira</option>
              <option value="original">Originale</option>
            </select>
          </label>
          <label>Larghezza <output id="cover-width-value">62%</output>
            <input id="cover-width" type="range" min="5" max="95" step="1" />
          </label>
          <label>Altezza <output id="cover-height-value">35%</output>
            <input id="cover-height" type="range" min="5" max="95" step="1" />
          </label>
          <label>Opacità <output id="cover-opacity-value">100%</output>
            <input id="cover-opacity" type="range" min="10" max="100" step="1" />
          </label>
          <div class="cover-actions">
            <button id="cover-adapt" class="mini-button">Adatta</button>
            <button id="cover-center" class="mini-button">Centra</button>
            <button id="cover-reset" class="mini-button">Ripristina</button>
            <button id="cover-remove" class="mini-button danger">Rimuovi</button>
          </div>
        </section>

        <section id="plugin-inspector" class="control-section hidden" aria-live="polite"></section>

        <section id="transform-section" class="control-section">
          <h3>Trasformazione</h3>
          <div class="transform-grid">
            <label>X<input id="transform-x" type="number" step="0.001" /></label>
            <label>Y<input id="transform-y" type="number" step="0.001" /></label>
            <label>Scala X<input id="transform-scale-x" type="number" min="0.01" max="20" step="0.01" /></label>
            <label>Scala Y<input id="transform-scale-y" type="number" min="0.01" max="20" step="0.01" /></label>
            <label>Rotazione<input id="transform-rotation" type="number" min="-36000" max="36000" step="0.1" /></label>
          </div>
          <div class="toggle-grid">
            <label><input id="canvas-snapping" type="checkbox" checked /> Snapping canvas</label>
            <button id="transform-reset" class="mini-button">Reset trasformazione</button>
          </div>
          <p class="setting-hint">Alt disattiva temporaneamente lo snap; Maiusc mantiene la scala uniforme.</p>
        </section>

        <section id="animation-section" class="control-section">
          <h3>Animazione</h3>
          <label>Proprietà
            <select id="keyframe-property">
              <option value="x">Posizione X</option>
              <option value="y">Posizione Y</option>
              <option value="scale">Scala uniforme</option>
              <option value="rotation">Rotazione</option>
              <option value="opacity">Opacità</option>
              <option value="intensity">Intensità visualizzatore</option>
            </select>
          </label>
          <label>Valore effettivo<input id="keyframe-value" type="number" step="0.001" /></label>
          <label>Interpolazione
            <select id="keyframe-interpolation">
              <option value="linear">Lineare</option>
              <option value="ease-in">Ease in</option>
              <option value="ease-out">Ease out</option>
              <option value="ease-in-out">Ease in/out</option>
              <option value="hold">Mantieni</option>
            </select>
          </label>
          <p id="keyframe-source" class="setting-hint">Valore base</p>
          <div class="layer-actions">
            <button id="keyframe-toggle" class="mini-button">Aggiungi keyframe</button>
            <button id="keyframe-previous" class="mini-button" aria-label="Keyframe precedente">◀</button>
            <button id="keyframe-next" class="mini-button" aria-label="Keyframe successivo">▶</button>
            <button id="keyframe-duplicate" class="mini-button">Duplica</button>
          </div>
        </section>

        <section class="control-section">
          <h3>Esportazione</h3>
          <label>Frame rate
            <select id="export-fps">
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </label>
          <p class="setting-hint">MP4 H.264 · 1080 × 1920 · AAC</p>
        </section>
      </aside>
    </section>

    <section class="timeline-panel legacy-ui" aria-hidden="true">
      <div class="timeline-labels">
        <span>Timeline</span>
        <span id="timeline-hint">Carica un audio per generare la forma d'onda</span>
        <label>Zoom <input id="timeline-zoom" type="range" min="1" max="100" step="0.25" value="1" aria-label="Zoom timeline" /></label>
        <label>Scroll <input id="timeline-scroll" type="range" min="0" max="0" step="0.01" value="0" aria-label="Scorrimento timeline" /></label>
        <label><input id="timeline-snapping" type="checkbox" checked /> Snap</label>
      </div>
      <div class="timeline-track">
        <div class="track-name"><span>♫</span>Audio</div>
        <div class="legacy-waveform-placeholder"></div>
      </div>
      <div id="layer-tracks" class="layer-tracks"></div>
    </section>
  </main>

  <div id="toast" class="toast" role="status"></div>
  <div id="simple-export-config" class="modal-backdrop hidden">
    <section class="simple-export-dialog" role="dialog" aria-modal="true"
      aria-labelledby="simple-export-title">
      <h2 id="simple-export-title">Esporta video</h2>
      <label>Formato
        <select id="simple-export-ratio">
          <option value="9:16">Verticale 9:16</option>
          <option value="1:1">Quadrato 1:1</option>
          <option value="4:3">Orizzontale 4:3</option>
          <option value="16:9">Orizzontale 16:9</option>
        </select>
      </label>
      <label>Risoluzione
        <select id="simple-export-resolution">
          <option value="1080">Full HD</option>
          <option value="720">HD</option>
        </select>
      </label>
      <p id="simple-export-choice" class="simple-export-choice">
        Output: 1080 × 1920
      </p>
      <div class="simple-export-summary">
        <span>Frame rate</span><strong>30 FPS</strong>
      </div>
      <div class="simple-export-summary">
        <span>Cartella destinazione</span>
        <strong>Scelta nel passaggio successivo</strong>
      </div>
      <div class="simple-export-actions">
        <button id="simple-export-cancel" class="button button-ghost">Annulla</button>
        <button id="simple-export-confirm" class="button button-primary">Esporta</button>
      </div>
    </section>
  </div>
  <div id="export-modal" class="modal-backdrop hidden">
    <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <span class="render-orbit"></span>
      <h2 id="export-title">Esportazione video</h2>
      <p id="export-phase">Preparazione progetto</p>
      <p id="export-message">Preparazione…</p>
      <div class="progress-track"><span id="export-progress"></span></div>
      <strong id="export-percent">0%</strong>
      <div class="export-live-metrics" aria-live="polite">
        <span>Frame</span><strong id="export-frame-count">0 / —</strong>
        <span>Trascorso</span><strong id="export-elapsed">00:00</strong>
        <span>Velocità</span><strong id="export-speed">— frame/s</strong>
        <span>Rimanente</span><strong id="export-eta">Calcolo…</strong>
      </div>
      <details class="export-technical-details" open>
        <summary>Dettagli codifica</summary>
        <dl>
          <dt>Formato</dt><dd id="export-codecs">H.264 OpenH264 + AAC</dd>
          <dt>Video</dt><dd id="export-video-details">In preparazione</dd>
          <dt>Output</dt><dd id="export-output-path">In attesa della destinazione</dd>
          <dt>Runtime</dt><dd id="export-runtime-paths">Verifica FFmpeg…</dd>
          <dt>Log</dt><dd id="export-log-path">Creazione log…</dd>
        </dl>
      </details>
      <button id="cancel-export" class="button button-ghost">Annulla</button>
    </section>
  </div>
`;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Elemento non trovato: ${selector}`);
  }
  return element;
}

const audioEngine = new AudioEngine();
const previewCanvas = requiredElement<HTMLCanvasElement>("#preview");
const waveformCanvas = requiredElement<HTMLCanvasElement>("#waveform");
const waveformContextValue = waveformCanvas.getContext("2d");
if (!waveformContextValue) {
  throw new Error("Canvas waveform non disponibile.");
}
const waveformContext: CanvasRenderingContext2D = waveformContextValue;

let projectPath: string | undefined;
let playing = false;
let toastTimer = 0;
let exportStartedAt = 0;
let exportElapsedTimer = 0;
const exportProgressHistory: ExportProgress[] = [];
let selectedLayerId = "";
let metricFrames = 0;
let metricWindowStart = performance.now();
let minimumMeasuredFps = Number.POSITIVE_INFINITY;
let projectMStatus: ProjectMStatus | null = null;
let projectMRenderInFlight = false;
let projectMLastTargetFrame = -1;
let projectMLastAudioTime = 0;
let projectMLatestFrame: ProjectMFrame | null = null;
let projectMResetRequested = false;
let presetSequence: PresetSequenceEvent[] = [];
let appliedPresetSequenceIndex = 0;
let presetAutomaticChangeInFlight = false;
let isRestoringProject = false;
let selectedKeyframeId: string | null = null;
let timelineZoom = 1;
let timelineScrollTime = 0;
let timelineSnappingEnabled = true;
let coverPreviewInfo: CoverPreviewInfo | null = null;
let clipPreviewInfo: ClipPreviewInfo | null = null;
let loadedCoverPath: string | null = null;
let coverLoadToken = 0;
let loadedClipPath: string | null = null;
let clipLoadToken = 0;
type ProjectFormat = "9:16" | "1:1" | "4:3" | "16:9";
interface ProjectFormatDefinition {
  ratio: number;
  fullHd: { width: number; height: number };
  hd: { width: number; height: number };
  preview: { width: number; height: number };
}
const PROJECT_FORMATS: Record<ProjectFormat, ProjectFormatDefinition> = {
  "9:16": {
    ratio: 9 / 16,
    fullHd: { width: 1080, height: 1920 },
    hd: { width: 720, height: 1280 },
    preview: { width: 540, height: 960 }
  },
  "1:1": {
    ratio: 1,
    fullHd: { width: 1080, height: 1080 },
    hd: { width: 720, height: 720 },
    preview: { width: 720, height: 720 }
  },
  "4:3": {
    ratio: 4 / 3,
    fullHd: { width: 1440, height: 1080 },
    hd: { width: 960, height: 720 },
    preview: { width: 720, height: 540 }
  },
  "16:9": {
    ratio: 16 / 9,
    fullHd: { width: 1920, height: 1080 },
    hd: { width: 1280, height: 720 },
    preview: { width: 960, height: 540 }
  }
};
const PREVIEW_FIT_ZOOM = 0.85;
let previewZoom = PREVIEW_FIT_ZOOM;
let previewZoomMode: "fit" | "manual" = "fit";

function inferProjectFormat(project: VisualizerProject): ProjectFormat {
  const ratio = project.canvas.width / Math.max(1, project.canvas.height);
  let best: ProjectFormat = "9:16";
  for (const [format, definition] of Object.entries(PROJECT_FORMATS) as Array<
    [ProjectFormat, ProjectFormatDefinition]
  >) {
    if (
      Math.abs(definition.ratio - ratio) <
      Math.abs(PROJECT_FORMATS[best].ratio - ratio)
    ) {
      best = format;
    }
  }
  return best;
}

function projectFormatButtons(): Array<[ProjectFormat, HTMLButtonElement]> {
  return [
    ["9:16", controls.projectFormat916],
    ["1:1", controls.projectFormat11],
    ["4:3", controls.projectFormat43],
    ["16:9", controls.projectFormat169]
  ];
}

function syncStageLayout(): void {
  const format = inferProjectFormat(projectState.project);
  const definition = PROJECT_FORMATS[format];
  const viewport = controls.stageViewport.getBoundingClientRect();
  const horizontalMargin = 44;
  const verticalMargin = 36;
  const availableWidth = Math.max(1, viewport.width - horizontalMargin);
  const availableHeight = Math.max(1, viewport.height - verticalMargin);
  const fitWidth = Math.min(
    availableWidth,
    availableHeight * definition.ratio
  );
  const fitHeight = fitWidth / definition.ratio;
  const factor = Math.max(0.4, Math.min(1, previewZoom));
  controls.videoStageFrame.style.width = `${Math.round(fitWidth * factor)}px`;
  controls.videoStageFrame.style.height = `${Math.round(fitHeight * factor)}px`;
  controls.videoStageFrame.dataset.projectFormat = format;
  controls.previewZoomValue.value =
    previewZoomMode === "fit"
      ? "Adatta"
      : `${Math.round(factor * 100)}%`;
  controls.previewZoomOut.disabled = factor <= 0.4;
  controls.previewZoomIn.disabled = factor >= 1;
}

function syncProjectFormatControls(project: VisualizerProject): void {
  const format = inferProjectFormat(project);
  const definition = PROJECT_FORMATS[format];
  for (const [candidate, button] of projectFormatButtons()) {
    const active = candidate === format;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  }
  controls.simpleExportRatio.value = format;
  if (
    previewCanvas.width !== definition.preview.width ||
    previewCanvas.height !== definition.preview.height
  ) {
    previewCanvas.width = definition.preview.width;
    previewCanvas.height = definition.preview.height;
  }
  requestAnimationFrame(syncStageLayout);
}

function applyProjectFormat(format: ProjectFormat): void {
  const definition = PROJECT_FORMATS[format];
  const resolution =
    controls.simpleExportResolution.value === "720"
      ? definition.hd
      : definition.fullHd;
  projectState.update((project) => {
    project.canvas.width = resolution.width;
    project.canvas.height = resolution.height;
    project.exportSettings.width = resolution.width;
    project.exportSettings.height = resolution.height;
    project.projectM.previewWidth = definition.preview.width;
    project.projectM.previewHeight = definition.preview.height;
    if (coverPreviewInfo && project.cover.filePath) {
      fitCoverToCanvas(project, coverPreviewInfo);
      centerCover(project);
    } else if (project.clip.filePath) {
      project.cover.width = 1;
      project.cover.height = 1;
      centerCover(project);
    }
  }, `Formato progetto ${format}`);
  controls.simpleExportRatio.value = format;
  projectMResetRequested = true;
  projectMLastTargetFrame = -1;
  projectMLastAudioTime = 0;
  previewZoom = PREVIEW_FIT_ZOOM;
  previewZoomMode = "fit";
  syncSimpleExportChoice();
  syncStageLayout();
}

function setPreviewZoom(value: number, mode: "fit" | "manual"): void {
  previewZoom = Math.max(0.4, Math.min(1, value));
  previewZoomMode = mode;
  syncStageLayout();
}

function createSimpleProject(): VisualizerProject {
  const project = createDefaultProject();
  project.text.artist = "";
  project.text.title = "";
  project.projectM.enabled = false;
  for (const layer of project.layers) {
    if (
      layer.kind === "projectM" ||
      layer.kind === "visualizer" ||
      layer.kind === "cover" ||
      layer.kind === "artistText" ||
      layer.kind === "titleText"
    ) {
      layer.visible = false;
    }
  }
  applySimpleLayerOrder(project);
  return project;
}

function applySimpleLayerOrder(project: VisualizerProject): void {
  const rank = (layer: ProjectLayer): number => {
    if (layer.kind === "cover") return 0;
    if (layer.kind === "visualizer" || layer.kind === "projectM") return 1;
    if (layer.kind === "titleText") return 2;
    return 3;
  };
  project.layers = project.layers
    .map((layer, index) => ({ layer, index }))
    .sort((left, right) => rank(left.layer) - rank(right.layer) || left.index - right.index)
    .map(({ layer }) => layer);
}

function normalizeProjectForSimpleUi(project: VisualizerProject): void {
  if (project.clip.filePath && project.cover.filePath) {
    project.cover.filePath = null;
    project.assets = project.assets.filter((asset) => asset.type !== "cover");
  }
  const currentBackgroundLayer = backgroundLayer(project);
  if (currentBackgroundLayer) {
    currentBackgroundLayer.name = backgroundMediaLabel(project);
  }
  const visibleEffects = project.layers.filter(
    (layer) =>
      layer.visible &&
      (layer.kind === "visualizer" ||
        (layer.kind === "projectM" && project.projectM.enabled))
  );
  const chosen = visibleEffects.at(-1);
  for (const layer of project.layers) {
    if (layer.kind === "visualizer" || layer.kind === "projectM") {
      layer.visible = layer.id === chosen?.id;
    } else if (layer.kind === "titleText" && !project.text.title.trim()) {
      layer.visible = false;
    } else if (layer.kind === "artistText" && !project.text.artist.trim()) {
      layer.visible = false;
    } else if (layer.kind === "cover" && !hasBackgroundMedia(project)) {
      layer.visible = false;
    }
  }
  project.projectM.enabled = chosen?.kind === "projectM";
  for (const layer of project.layers) {
    if (layer.kind === "projectM") layer.blendMode = "screen";
  }
  applySimpleLayerOrder(project);
}

projectState.reset(createSimpleProject());

function stableKeyframeId(layer: ProjectLayer): string {
  const used = new Set(layer.keyframes.map((keyframe) => keyframe.id));
  let index = 1;
  while (used.has(`kf-${String(index).padStart(6, "0")}`)) index += 1;
  return `kf-${String(index).padStart(6, "0")}`;
}

function keyframeAt(
  layer: ProjectLayer,
  property: AnimatableProperty,
  time: number
) {
  return layer.keyframes.find(
    (keyframe) =>
      keyframe.property === property && Math.abs(keyframe.time - time) <= 1e-7
  );
}

function writeAnimatedValue(
  layer: ProjectLayer,
  property: AnimatableProperty,
  value: number,
  time: number,
  forceKeyframe = false
): void {
  const animated = layer.keyframes.some((item) => item.property === property);
  if (animated || forceKeyframe) {
    const current = keyframeAt(layer, property, time);
    const interpolation =
      current?.interpolation ??
      (controls?.keyframeInterpolation?.value as
        | "linear"
        | "ease-in"
        | "ease-out"
        | "ease-in-out"
        | "hold") ??
      "linear";
    const next = {
      id: current?.id ?? stableKeyframeId(layer),
      property,
      time,
      value,
      interpolation
    };
    layer.keyframes = upsertKeyframe(layer.keyframes, next);
    selectedKeyframeId = next.id;
    return;
  }
  if (property === "x" || property === "y" || property === "rotation") {
    layer.transform[property] = value;
  } else if (property === "scale") {
    layer.transform.scaleX = value;
    layer.transform.scaleY = value;
  } else if (property === "opacity") {
    layer.opacity = Math.min(1, Math.max(0, value));
  } else {
    layer.reactive ??= {
      band: "volume",
      sensitivity: 1,
      smoothing: 0.72,
      intensity: 1,
      color: "#8b5cf6"
    };
    layer.reactive.intensity = value;
  }
}

const preview = new PreviewRenderer(
  previewCanvas,
  projectState.project,
  (layerId) => selectLayer(layerId),
  (layerId, transform) => {
    projectState.update((project) => {
      const layer = project.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.locked) return;
      const time = audioEngine.currentTime;
      if (transform.x !== undefined) writeAnimatedValue(layer, "x", transform.x, time);
      if (transform.y !== undefined) writeAnimatedValue(layer, "y", transform.y, time);
      if (transform.rotation !== undefined) {
        writeAnimatedValue(layer, "rotation", transform.rotation, time);
      }
      if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
        const scale =
          ((transform.scaleX ?? layer.transform.scaleX) +
            (transform.scaleY ?? layer.transform.scaleY)) /
          2;
        const animated = layer.keyframes.some((item) => item.property === "scale");
        if (animated) writeAnimatedValue(layer, "scale", scale, time);
        else {
          if (transform.scaleX !== undefined) layer.transform.scaleX = transform.scaleX;
          if (transform.scaleY !== undefined) layer.transform.scaleY = transform.scaleY;
        }
      }
    }, "Trasforma livello");
  },
  () => projectState.beginTransaction("Trasforma livello"),
  (commit) => {
    if (commit) projectState.commitTransaction();
    else projectState.cancelTransaction();
  }
);

const controls = {
  status: requiredElement<HTMLElement>("#project-status"),
  undo: requiredElement<HTMLButtonElement>("#undo-command"),
  redo: requiredElement<HTMLButtonElement>("#redo-command"),
  previewMetrics: requiredElement<HTMLElement>("#preview-metrics"),
  projectMState: requiredElement<HTMLElement>("#projectm-state"),
  projectMVersion: requiredElement<HTMLElement>("#projectm-version"),
  projectMPreset: requiredElement<HTMLElement>("#projectm-preset"),
  projectMEnabled: requiredElement<HTMLInputElement>("#projectm-enabled"),
  projectMError: requiredElement<HTMLElement>("#projectm-error"),
  presetPrevious: requiredElement<HTMLButtonElement>("#preset-previous"),
  presetNext: requiredElement<HTMLButtonElement>("#preset-next"),
  presetRandom: requiredElement<HTMLButtonElement>("#preset-random"),
  presetRestart: requiredElement<HTMLButtonElement>("#preset-restart"),
  presetFavoriteCurrent: requiredElement<HTMLButtonElement>("#preset-favorite-current"),
  presetLocked: requiredElement<HTMLInputElement>("#preset-locked"),
  presetAutoEnabled: requiredElement<HTMLInputElement>("#preset-auto-enabled"),
  presetAutoMode: requiredElement<HTMLSelectElement>("#preset-auto-mode"),
  presetAutoOrder: requiredElement<HTMLSelectElement>("#preset-auto-order"),
  presetInterval: requiredElement<HTMLInputElement>("#preset-interval"),
  presetMinimum: requiredElement<HTMLInputElement>("#preset-minimum"),
  presetMaximum: requiredElement<HTMLInputElement>("#preset-maximum"),
  presetNoRepeat: requiredElement<HTMLInputElement>("#preset-no-repeat"),
  presetTransitionEnabled: requiredElement<HTMLInputElement>("#preset-transition-enabled"),
  presetTransitionDuration: requiredElement<HTMLInputElement>("#preset-transition-duration"),
  presetRandomSeed: requiredElement<HTMLInputElement>("#preset-random-seed"),
  particleRandomSeed: requiredElement<HTMLInputElement>("#particle-random-seed"),
  presetPlaylistCount: requiredElement<HTMLElement>("#preset-playlist-count"),
  presetAddMarker: requiredElement<HTMLButtonElement>("#preset-add-marker"),
  presetAnalyzeMusic: requiredElement<HTMLButtonElement>("#preset-analyze-music"),
  presetMarkerCount: requiredElement<HTMLElement>("#preset-marker-count"),
  inspectorTitle: requiredElement<HTMLElement>("#inspector-title"),
  layersList: requiredElement<HTMLElement>("#layers-list"),
  layerCount: requiredElement<HTMLElement>("#layer-count"),
  layerName: requiredElement<HTMLInputElement>("#layer-name"),
  layerVisible: requiredElement<HTMLInputElement>("#layer-visible"),
  layerLocked: requiredElement<HTMLInputElement>("#layer-locked"),
  layerOpacity: requiredElement<HTMLInputElement>("#layer-opacity"),
  layerOpacityValue: requiredElement<HTMLOutputElement>("#layer-opacity-value"),
  layerBlend: requiredElement<HTMLSelectElement>("#layer-blend"),
  layerStart: requiredElement<HTMLInputElement>("#layer-start"),
  layerEnd: requiredElement<HTMLInputElement>("#layer-end"),
  layerUp: requiredElement<HTMLButtonElement>("#layer-up"),
  layerDown: requiredElement<HTMLButtonElement>("#layer-down"),
  pluginAddSelect: requiredElement<HTMLSelectElement>("#plugin-add-select"),
  layerAdd: requiredElement<HTMLButtonElement>("#layer-add"),
  layerDuplicate: requiredElement<HTMLButtonElement>("#layer-duplicate"),
  layerDelete: requiredElement<HTMLButtonElement>("#layer-delete"),
  artist: requiredElement<HTMLInputElement>("#artist"),
  title: requiredElement<HTMLInputElement>("#title"),
  textColor: requiredElement<HTMLInputElement>("#text-color"),
  textSize: requiredElement<HTMLInputElement>("#text-size"),
  textSizeValue: requiredElement<HTMLOutputElement>("#text-size-value"),
  accentColor: requiredElement<HTMLInputElement>("#accent-color"),
  backgroundColor: requiredElement<HTMLInputElement>("#background-color"),
  coverWidth: requiredElement<HTMLInputElement>("#cover-width"),
  coverHeight: requiredElement<HTMLInputElement>("#cover-height"),
  coverOpacity: requiredElement<HTMLInputElement>("#cover-opacity"),
  coverFit: requiredElement<HTMLSelectElement>("#cover-fit"),
  coverFitPrimary: requiredElement<HTMLSelectElement>("#cover-fit-primary"),
  coverVisiblePrimary: requiredElement<HTMLInputElement>("#cover-visible-primary"),
  coverAdapt: requiredElement<HTMLButtonElement>("#cover-adapt"),
  coverAdaptPrimary: requiredElement<HTMLButtonElement>("#cover-adapt-primary"),
  coverCenter: requiredElement<HTMLButtonElement>("#cover-center"),
  coverCenterPrimary: requiredElement<HTMLButtonElement>("#cover-center-primary"),
  coverReset: requiredElement<HTMLButtonElement>("#cover-reset"),
  coverResetPrimary: requiredElement<HTMLButtonElement>("#cover-reset-primary"),
  coverRemove: requiredElement<HTMLButtonElement>("#cover-remove"),
  coverRemovePrimary: requiredElement<HTMLButtonElement>("#cover-remove-primary"),
  coverWidthValue: requiredElement<HTMLOutputElement>("#cover-width-value"),
  coverHeightValue: requiredElement<HTMLOutputElement>("#cover-height-value"),
  coverOpacityValue: requiredElement<HTMLOutputElement>("#cover-opacity-value"),
  textSection: requiredElement<HTMLElement>("#text-section"),
  coverSection: requiredElement<HTMLElement>("#cover-section"),
  pluginInspector: requiredElement<HTMLElement>("#plugin-inspector"),
  transformSection: requiredElement<HTMLElement>("#transform-section"),
  transformX: requiredElement<HTMLInputElement>("#transform-x"),
  transformY: requiredElement<HTMLInputElement>("#transform-y"),
  transformScaleX: requiredElement<HTMLInputElement>("#transform-scale-x"),
  transformScaleY: requiredElement<HTMLInputElement>("#transform-scale-y"),
  transformRotation: requiredElement<HTMLInputElement>("#transform-rotation"),
  transformReset: requiredElement<HTMLButtonElement>("#transform-reset"),
  canvasSnapping: requiredElement<HTMLInputElement>("#canvas-snapping"),
  animationSection: requiredElement<HTMLElement>("#animation-section"),
  keyframeProperty: requiredElement<HTMLSelectElement>("#keyframe-property"),
  keyframeValue: requiredElement<HTMLInputElement>("#keyframe-value"),
  keyframeInterpolation: requiredElement<HTMLSelectElement>("#keyframe-interpolation"),
  keyframeSource: requiredElement<HTMLElement>("#keyframe-source"),
  keyframeToggle: requiredElement<HTMLButtonElement>("#keyframe-toggle"),
  keyframePrevious: requiredElement<HTMLButtonElement>("#keyframe-previous"),
  keyframeNext: requiredElement<HTMLButtonElement>("#keyframe-next"),
  keyframeDuplicate: requiredElement<HTMLButtonElement>("#keyframe-duplicate"),
  exportFps: requiredElement<HTMLSelectElement>("#export-fps"),
  audioFile: requiredElement<HTMLElement>("#audio-file"),
  audioName: requiredElement<HTMLElement>("#audio-name"),
  audioDuration: requiredElement<HTMLElement>("#audio-duration"),
  coverFile: requiredElement<HTMLElement>("#cover-file"),
  coverName: requiredElement<HTMLElement>("#cover-name"),
  coverThumbnail: requiredElement<HTMLImageElement>("#cover-thumbnail"),
  canvasEmptyState: requiredElement<HTMLElement>("#canvas-empty-state"),
  playPause: requiredElement<HTMLButtonElement>("#play-pause"),
  currentTime: requiredElement<HTMLElement>("#current-time"),
  totalTime: requiredElement<HTMLElement>("#total-time"),
  timelineHint: requiredElement<HTMLElement>("#timeline-hint"),
  layerTracks: requiredElement<HTMLElement>("#layer-tracks"),
  timelineZoom: requiredElement<HTMLInputElement>("#timeline-zoom"),
  timelineScroll: requiredElement<HTMLInputElement>("#timeline-scroll"),
  timelineSnapping: requiredElement<HTMLInputElement>("#timeline-snapping"),
  toast: requiredElement<HTMLElement>("#toast"),
  exportModal: requiredElement<HTMLElement>("#export-modal"),
  exportPhase: requiredElement<HTMLElement>("#export-phase"),
  exportMessage: requiredElement<HTMLElement>("#export-message"),
  exportProgress: requiredElement<HTMLElement>("#export-progress"),
  exportPercent: requiredElement<HTMLElement>("#export-percent"),
  exportFrameCount: requiredElement<HTMLElement>("#export-frame-count"),
  exportElapsed: requiredElement<HTMLElement>("#export-elapsed"),
  exportSpeed: requiredElement<HTMLElement>("#export-speed"),
  exportEta: requiredElement<HTMLElement>("#export-eta"),
  exportCodecs: requiredElement<HTMLElement>("#export-codecs"),
  exportVideoDetails: requiredElement<HTMLElement>("#export-video-details"),
  exportOutputPath: requiredElement<HTMLElement>("#export-output-path"),
  exportRuntimePaths: requiredElement<HTMLElement>("#export-runtime-paths"),
  exportLogPath: requiredElement<HTMLElement>("#export-log-path"),
  cancelExport: requiredElement<HTMLButtonElement>("#cancel-export"),
  stop: requiredElement<HTMLButtonElement>("#stop"),
  stageViewport: requiredElement<HTMLElement>("#stage-viewport"),
  videoStageFrame: requiredElement<HTMLElement>("#video-stage-frame"),
  projectFormat916: requiredElement<HTMLButtonElement>("#project-format-9-16"),
  projectFormat11: requiredElement<HTMLButtonElement>("#project-format-1-1"),
  projectFormat43: requiredElement<HTMLButtonElement>("#project-format-4-3"),
  projectFormat169: requiredElement<HTMLButtonElement>("#project-format-16-9"),
  previewZoomFit: requiredElement<HTMLButtonElement>("#preview-zoom-fit"),
  previewZoom100: requiredElement<HTMLButtonElement>("#preview-zoom-100"),
  previewZoomOut: requiredElement<HTMLButtonElement>("#preview-zoom-out"),
  previewZoomIn: requiredElement<HTMLButtonElement>("#preview-zoom-in"),
  previewZoomValue: requiredElement<HTMLOutputElement>("#preview-zoom-value"),
  simpleChooseCover: requiredElement<HTMLButtonElement>("#simple-choose-cover"),
  simpleCoverFile: requiredElement<HTMLElement>("#simple-cover-file"),
  simpleCoverThumbnail: requiredElement<HTMLImageElement>("#simple-cover-thumbnail"),
  simpleCoverName: requiredElement<HTMLElement>("#simple-cover-name"),
  simpleCoverFit: requiredElement<HTMLSelectElement>("#simple-cover-fit"),
  simpleBackgroundOpacity: requiredElement<HTMLInputElement>(
    "#simple-background-opacity"
  ),
  simpleBackgroundOpacityValue: requiredElement<HTMLOutputElement>(
    "#simple-background-opacity-value"
  ),
  simpleRemoveCover: requiredElement<HTMLButtonElement>("#simple-remove-cover"),
  simpleChooseClip: requiredElement<HTMLButtonElement>("#simple-choose-clip"),
  simpleClipFile: requiredElement<HTMLElement>("#simple-clip-file"),
  simpleClipName: requiredElement<HTMLElement>("#simple-clip-name"),
  simpleClipDetails: requiredElement<HTMLElement>("#simple-clip-details"),
  simpleAudioSourceClip: requiredElement<HTMLInputElement>(
    "#simple-audio-source-clip"
  ),
  simpleAudioSourceExternal: requiredElement<HTMLInputElement>(
    "#simple-audio-source-external"
  ),
  simpleAudioSourceStatus: requiredElement<HTMLElement>(
    "#simple-audio-source-status"
  ),
  simpleChooseAudio: requiredElement<HTMLButtonElement>("#simple-choose-audio"),
  simpleAudioFile: requiredElement<HTMLElement>("#simple-audio-file"),
  simpleAudioName: requiredElement<HTMLElement>("#simple-audio-name"),
  simpleAudioDuration: requiredElement<HTMLElement>("#simple-audio-duration"),
  simpleAudioError: requiredElement<HTMLElement>("#simple-audio-error"),
  simpleClipEndModeRow: requiredElement<HTMLElement>("#simple-clip-end-mode-row"),
  simpleClipEndMode: requiredElement<HTMLSelectElement>("#simple-clip-end-mode"),
  simpleTitle: requiredElement<HTMLInputElement>("#simple-title"),
  simpleTitleSize: requiredElement<HTMLInputElement>("#simple-title-size"),
  simpleTitleSizeValue: requiredElement<HTMLOutputElement>("#simple-title-size-value"),
  simpleTitleColor: requiredElement<HTMLInputElement>("#simple-title-color"),
  simpleTitleOpacity: requiredElement<HTMLInputElement>("#simple-title-opacity"),
  simpleTitleOpacityValue: requiredElement<HTMLOutputElement>("#simple-title-opacity-value"),
  simpleArtist: requiredElement<HTMLInputElement>("#simple-artist"),
  simpleArtistSize: requiredElement<HTMLInputElement>("#simple-artist-size"),
  simpleArtistSizeValue: requiredElement<HTMLOutputElement>("#simple-artist-size-value"),
  simpleArtistColor: requiredElement<HTMLInputElement>("#simple-artist-color"),
  simpleArtistOpacity: requiredElement<HTMLInputElement>("#simple-artist-opacity"),
  simpleArtistOpacityValue: requiredElement<HTMLOutputElement>("#simple-artist-opacity-value"),
  simpleEffect: requiredElement<HTMLSelectElement>("#simple-effect"),
  simplePresetRow: requiredElement<HTMLElement>("#simple-preset-row"),
  simplePreset: requiredElement<HTMLSelectElement>("#simple-preset"),
  simplePresetButton: requiredElement<HTMLButtonElement>("#simple-preset-button"),
  simplePresetValue: requiredElement<HTMLElement>("#simple-preset-value"),
  simplePresetListbox: requiredElement<HTMLElement>("#simple-preset-listbox"),
  simplePresetSearch: requiredElement<HTMLInputElement>("#simple-preset-search"),
  simplePresetFilter: requiredElement<HTMLSelectElement>("#simple-preset-filter"),
  simplePresetSelected: requiredElement<HTMLElement>("#simple-preset-selected"),
  simplePresetFavorite: requiredElement<HTMLButtonElement>(
    "#simple-preset-favorite"
  ),
  simplePresetDelete: requiredElement<HTMLButtonElement>("#simple-preset-delete"),
  simplePresetCount: requiredElement<HTMLElement>("#simple-preset-count"),
  simplePresetAdd: requiredElement<HTMLButtonElement>("#simple-preset-add"),
  simplePresetImportFolder: requiredElement<HTMLButtonElement>(
    "#simple-preset-import-folder"
  ),
  simplePresetImportZip: requiredElement<HTMLButtonElement>(
    "#simple-preset-import-zip"
  ),
  simplePresetLinkFolder: requiredElement<HTMLButtonElement>(
    "#simple-preset-link-folder"
  ),
  simpleEffectError: requiredElement<HTMLElement>("#simple-effect-error"),
  simpleIntensity: requiredElement<HTMLInputElement>("#simple-intensity"),
  simpleIntensityValue: requiredElement<HTMLOutputElement>("#simple-intensity-value"),
  simpleEffectOpacity: requiredElement<HTMLInputElement>("#simple-effect-opacity"),
  simpleEffectOpacityValue: requiredElement<HTMLOutputElement>(
    "#simple-effect-opacity-value"
  ),
  simpleEffectCenter: requiredElement<HTMLButtonElement>("#simple-effect-center"),
  simpleEffectFit: requiredElement<HTMLButtonElement>("#simple-effect-fit"),
  simpleEffectReset: requiredElement<HTMLButtonElement>("#simple-effect-reset"),
  simpleEffectRemove: requiredElement<HTMLButtonElement>("#simple-effect-remove"),
  simpleSelectedLayerName: requiredElement<HTMLElement>(
    "#simple-selected-layer-name"
  ),
  simpleLayerBackground: requiredElement<HTMLButtonElement>(
    "#simple-layer-background"
  ),
  simpleLayerBackgroundLabel: requiredElement<HTMLElement>(
    "#simple-layer-background-label"
  ),
  simpleLayerEffect: requiredElement<HTMLButtonElement>("#simple-layer-effect"),
  simpleLayerTitle: requiredElement<HTMLButtonElement>("#simple-layer-title"),
  simpleLayerArtist: requiredElement<HTMLButtonElement>("#simple-layer-artist"),
  simpleLayerCenter: requiredElement<HTMLButtonElement>("#simple-layer-center"),
  simpleLayerFit: requiredElement<HTMLButtonElement>("#simple-layer-fit"),
  simpleLayerReset: requiredElement<HTMLButtonElement>("#simple-layer-reset"),
  simpleLayerSelectionLock: requiredElement<HTMLInputElement>(
    "#simple-layer-selection-lock"
  ),
  simpleStageGuides: requiredElement<HTMLInputElement>("#simple-stage-guides"),
  simpleSeek: requiredElement<HTMLInputElement>("#simple-seek"),
  simplePlayHint: requiredElement<HTMLElement>("#simple-play-hint"),
  simpleExportVideo: requiredElement<HTMLButtonElement>("#simple-export-video"),
  simpleExportConfig: requiredElement<HTMLElement>("#simple-export-config"),
  simpleExportRatio: requiredElement<HTMLSelectElement>("#simple-export-ratio"),
  simpleExportResolution: requiredElement<HTMLSelectElement>("#simple-export-resolution"),
  simpleExportChoice: requiredElement<HTMLElement>("#simple-export-choice"),
  simpleExportCancel: requiredElement<HTMLButtonElement>("#simple-export-cancel"),
  simpleExportConfirm: requiredElement<HTMLButtonElement>("#simple-export-confirm")
};

let simplePresetOpen = false;
let simplePresetActiveIndex = -1;
let simplePresetRuntimeOverride: PresetRecord[] | null = null;
let simplePresetCatalogRecords: PresetRecord[] = [];

function simplePresetOptions(): HTMLElement[] {
  return [
    ...controls.simplePresetListbox.querySelectorAll<HTMLElement>(
      ".simple-preset-option"
    )
  ];
}

function syncSimplePresetSelection(selectedId: string): void {
  const options = simplePresetOptions();
  const selectedIndex = options.findIndex(
    (option) => option.dataset.value === selectedId
  );
  simplePresetActiveIndex = selectedIndex >= 0 ? selectedIndex : 0;
  for (const [index, option] of options.entries()) {
    const selected = option.dataset.value === selectedId;
    option.setAttribute("aria-selected", String(selected));
    option.classList.toggle("is-active", index === simplePresetActiveIndex);
  }
  const selectedOption = options[selectedIndex] ?? options[0];
  const selectedRecord = simplePresetCatalogRecords.find(
    (preset) => preset.id === selectedId
  );
  controls.simplePresetValue.textContent =
    selectedRecord?.name ??
    selectedOption?.textContent ??
    "Nessun preset disponibile";
  if (selectedIndex >= 0 && selectedOption) {
    controls.simplePresetButton.setAttribute(
      "aria-activedescendant",
      selectedOption.id
    );
  } else {
    controls.simplePresetButton.removeAttribute("aria-activedescendant");
  }
  syncSimplePresetManagement();
}

function simpleSelectedPresetRecord(): PresetRecord | undefined {
  return simplePresetCatalogRecords.find(
    (preset) => preset.id === projectState.project.projectM.presetId
  );
}

function selectedPresetFolderSource(
  preset: PresetRecord | undefined
): string | null {
  if (!preset) return null;
  if (preset.origin.kind === "external-folder") {
    return preset.origin.sourcePath;
  }
  if (
    preset.origin.kind === "internal" &&
    preset.origin.label.startsWith("Cartella copiata:")
  ) {
    return preset.origin.sourcePath;
  }
  return null;
}

function syncSimplePresetManagement(): void {
  const preset = simpleSelectedPresetRecord();
  controls.simplePresetSelected.textContent = preset
    ? `Selezionato: ${preset.name}`
    : "Selezionato: nessuno";
  controls.simplePresetFavorite.disabled = !preset;
  controls.simplePresetFavorite.textContent = preset?.favorite
    ? "★ Preferito"
    : "☆ Preferito";
  controls.simplePresetFavorite.setAttribute(
    "aria-pressed",
    String(Boolean(preset?.favorite))
  );
  controls.simplePresetDelete.disabled =
    !preset || preset.origin.kind === "bundled";
  controls.simplePresetDelete.title = !preset
    ? "Nessun preset selezionato"
    : preset.origin.kind === "bundled"
      ? "Il preset incluso non può essere rimosso"
      : preset.origin.kind === "external-file" ||
          preset.origin.kind === "external-folder"
        ? "Rimuove il preset dalla libreria senza cancellare il file esterno"
        : "Rimuove il preset e sposta la copia interna nel cestino recuperabile";
}

function positionSimplePresetListbox(): void {
  if (!simplePresetOpen) return;
  const rect = controls.simplePresetButton.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - margin);
  const availableAbove = Math.max(0, rect.top - margin);
  const openAbove = availableBelow < 180 && availableAbove > availableBelow;
  const available = openAbove ? availableAbove : availableBelow;
  const width = Math.min(
    Math.max(rect.width, 240),
    Math.max(120, window.innerWidth - margin * 2)
  );
  const maxHeight = Math.max(72, Math.min(280, available - gap));
  const left = Math.max(
    margin,
    Math.min(rect.left, window.innerWidth - width - margin)
  );
  controls.simplePresetListbox.style.width = `${width}px`;
  controls.simplePresetListbox.style.maxHeight = `${maxHeight}px`;
  controls.simplePresetListbox.style.left = `${left}px`;
  controls.simplePresetListbox.style.top = openAbove
    ? `${Math.max(margin, rect.top - maxHeight - gap)}px`
    : `${Math.min(window.innerHeight - margin, rect.bottom + gap)}px`;
  controls.simplePresetListbox.dataset.opens = openAbove ? "up" : "down";
}

function revealSimplePresetActive(): void {
  const options = simplePresetOptions();
  if (!options.length) return;
  simplePresetActiveIndex = Math.max(
    0,
    Math.min(options.length - 1, simplePresetActiveIndex)
  );
  for (const [index, option] of options.entries()) {
    option.classList.toggle("is-active", index === simplePresetActiveIndex);
  }
  const active = options[simplePresetActiveIndex]!;
  controls.simplePresetButton.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function openSimplePresetListbox(preferredIndex?: number): void {
  if (controls.simplePresetButton.disabled) return;
  simplePresetOpen = true;
  controls.simplePresetListbox.classList.remove("hidden");
  controls.simplePresetButton.setAttribute("aria-expanded", "true");
  if (preferredIndex !== undefined) simplePresetActiveIndex = preferredIndex;
  positionSimplePresetListbox();
  revealSimplePresetActive();
}

function closeSimplePresetListbox(focusButton = false): void {
  simplePresetOpen = false;
  controls.simplePresetListbox.classList.add("hidden");
  controls.simplePresetButton.setAttribute("aria-expanded", "false");
  if (focusButton) controls.simplePresetButton.focus();
}

function chooseSimplePresetOption(index: number): void {
  const option = simplePresetOptions()[index];
  if (!option?.dataset.value) return;
  controls.simplePreset.value = option.dataset.value;
  syncSimplePresetSelection(option.dataset.value);
  controls.simplePreset.dispatchEvent(new Event("change", { bubbles: true }));
  closeSimplePresetListbox(true);
}

function moveSimplePresetActive(key: string): void {
  const options = simplePresetOptions();
  if (!options.length) return;
  const page = Math.max(
    1,
    Math.floor(controls.simplePresetListbox.clientHeight / 28)
  );
  if (key === "Home") simplePresetActiveIndex = 0;
  else if (key === "End") simplePresetActiveIndex = options.length - 1;
  else if (key === "PageUp") simplePresetActiveIndex -= page;
  else if (key === "PageDown") simplePresetActiveIndex += page;
  else if (key === "ArrowUp") simplePresetActiveIndex -= 1;
  else if (key === "ArrowDown") simplePresetActiveIndex += 1;
  simplePresetActiveIndex = Math.max(
    0,
    Math.min(options.length - 1, simplePresetActiveIndex)
  );
  revealSimplePresetActive();
}

function syncSimplePresetOptions(records: PresetRecord[]): void {
  simplePresetCatalogRecords = records;
  const valid = records.filter(
    (preset) =>
      !preset.quarantined &&
      preset.status !== "missing" &&
      preset.status !== "incompatible"
  ).sort((left, right) =>
    left.name.localeCompare(right.name, "it", { sensitivity: "base" })
  );
  const query = controls.simplePresetSearch.value.trim().toLocaleLowerCase("it");
  const selectedId = projectState.project.projectM.presetId;
  const selected = records.find((preset) => preset.id === selectedId);
  const currentFolder = selectedPresetFolderSource(selected);
  const folderOption = controls.simplePresetFilter.querySelector<HTMLOptionElement>(
    'option[value="current-folder"]'
  );
  if (folderOption) folderOption.disabled = !currentFolder;
  if (
    controls.simplePresetFilter.value === "current-folder" &&
    !currentFolder
  ) {
    controls.simplePresetFilter.value = "all";
  }
  const filter = controls.simplePresetFilter.value;
  const available = valid.filter((preset) => {
    if (filter === "favorites" && !preset.favorite) return false;
    if (
      filter === "current-folder" &&
      currentFolder &&
      preset.origin.sourcePath !== currentFolder
    ) {
      return false;
    }
    return (
      !query ||
      preset.name.toLocaleLowerCase("it").includes(query) ||
      (preset.author ?? "").toLocaleLowerCase("it").includes(query)
    );
  });
  controls.simplePresetCount.textContent =
    `Preset disponibili: ${valid.length} · ${available.length} visibili`;
  controls.simplePreset.replaceChildren(
    ...available.map((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      return option;
    })
  );
  controls.simplePreset.value = available.some(
    (preset) => preset.id === selectedId
  )
    ? selectedId
    : "";
  controls.simplePreset.disabled = available.length === 0;
  controls.simplePresetButton.disabled = available.length === 0;
  controls.simplePresetListbox.replaceChildren(
    ...available.map((preset, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = `simple-preset-option-${index}`;
      option.className = "simple-preset-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      option.dataset.value = preset.id;
      option.textContent = preset.name;
      return option;
    })
  );
  syncSimplePresetSelection(selectedId);
  if (!available.length) closeSimplePresetListbox();
}

function syncLibraryProjectState(records: PresetRecord[]): void {
  if (isRestoringProject) return;
  const favoritePresetIds = records
    .filter((preset) => preset.favorite)
    .map((preset) => preset.id)
    .sort();
  const externalFolders = [
    ...new Set(
      records
        .filter((preset) => preset.origin.kind === "external-folder")
        .map((preset) => preset.origin.sourcePath)
    )
  ].sort();
  const current = projectState.project.projectM;
  const selected = records.find((preset) => preset.id === current.presetId);
  const selectedChanged = Boolean(
    selected &&
      (current.presetPath !== selected.path ||
        current.presetHash !== selected.hash ||
        current.presetName !== selected.name ||
        current.presetStatus !== selected.status ||
        current.presetLicense !== selected.license ||
        current.presetLicenseVerified !== selected.licenseVerified ||
        JSON.stringify(current.missingTextures) !==
          JSON.stringify(selected.missingTextures))
  );
  if (
    JSON.stringify(current.favoritePresetIds) === JSON.stringify(favoritePresetIds) &&
    JSON.stringify(current.externalFolders) === JSON.stringify(externalFolders) &&
    !selectedChanged
  ) {
    return;
  }
  projectState.update((project) => {
    project.projectM.favoritePresetIds = favoritePresetIds;
    project.projectM.externalFolders = externalFolders;
    if (selected) {
      project.projectM.presetPath = selected.path;
      project.projectM.presetHash = selected.hash;
      project.projectM.presetName = selected.name;
      project.projectM.presetStatus = selected.status;
      project.projectM.presetLicense = selected.license;
      project.projectM.presetLicenseVerified = selected.licenseVerified;
      project.projectM.texturePaths = selected.textures
        .map((texture) => texture.path)
        .filter((value): value is string => Boolean(value));
      project.projectM.missingTextures = [...selected.missingTextures];
    }
  });
}

const presetLibraryView = new PresetLibraryView({
  onSelected: (result, source) => {
    const restoring = isRestoringProject || source === "restore";
    projectMStatus = result.status;
    projectMStatus.enabled = true;
    const fps = projectState.project.projectM.fps;
    projectMLastTargetFrame = Math.max(
      -1,
      Math.floor(audioEngine.currentTime * fps) - 1
    );
    projectMLastAudioTime = Math.max(0, audioEngine.currentTime - 1 / fps);
    projectMResetRequested = false;
    if (!restoring) {
      projectState.update((project) => {
        const preset = result.preset;
        project.projectM.presetId = preset.id;
        project.projectM.presetPath = preset.path;
        project.projectM.presetHash = preset.hash;
        project.projectM.presetName = preset.name;
        project.projectM.presetStatus = preset.status;
        project.projectM.presetLicense = preset.license;
        project.projectM.presetLicenseVerified = preset.licenseVerified;
        project.projectM.texturePaths = preset.textures
          .map((texture) => texture.path)
          .filter((value): value is string => Boolean(value));
        project.projectM.missingTextures = [...preset.missingTextures];
        if (source === "manual") {
          project.projectM.sequenceStartPresetId = preset.id;
        }
        project.projectM.history = [
          ...project.projectM.history,
          {
            presetId: preset.id,
            at: Number(audioEngine.currentTime.toFixed(3)),
            source
          }
        ].slice(-500);
      });
    }
    renderProjectMStatus();
    void requestProjectMFrame(audioEngine.currentTime, 1);
  },
  onLibraryChanged: (records) => {
    syncSimplePresetOptions(simplePresetRuntimeOverride ?? records);
    if (isRestoringProject) return;
    syncLibraryProjectState(records);
    rebuildPresetSequence();
  },
  selectionTransition: () => projectState.project.projectM.transition,
  isInPlaylist: (id) =>
    projectState.project.projectM.playlistIds.includes(id),
  onTogglePlaylist: (id) => {
    projectState.update((project) => {
      const playlist = project.projectM.playlistIds;
      project.projectM.playlistIds = playlist.includes(id)
        ? playlist.filter((candidate) => candidate !== id)
        : [...playlist, id];
      if (!project.projectM.playlistIds.length) {
        project.projectM.playlistIds = [project.projectM.presetId];
      }
    });
    rebuildPresetSequence();
    void presetLibraryView.initialize(projectState.project.projectM.presetId);
  },
  notify: (message, error) => showToast(message, error)
});

const presetCatalogView = new PresetCatalogViewController({
  onLibraryChanged: async () => {
    await presetLibraryView.initialize(projectState.project.projectM.presetId);
  },
  notify: (message, error) => showToast(message, error)
});

async function synchronizeAppliedMedia(project: VisualizerProject): Promise<void> {
  await synchronizeClipMedia(project.clip.filePath);
  if (project.audioFile) {
    await loadAudio(
      project.audioFile,
      project.audioSource === "clip"
        ? "Audio della clip"
        : project.audioFile.split(/[\\/]/).pop() ?? "Audio",
      project.audioSource
    ).catch((error) =>
      showToast(`Audio non disponibile: ${readError(error)}`, true)
    );
  } else {
    clearActiveAudioUi();
  }
  if (project.cover.filePath) {
    await loadCover(
      project.cover.filePath,
      project.cover.filePath.split(/[\\/]/).pop() ?? "Copertina"
    ).catch((error) =>
      showToast(`Copertina non disponibile: ${readError(error)}`, true)
    );
  } else {
    preview.clearCover();
    controls.coverFile.classList.add("hidden");
  }
  if (project.projectM.presetId) {
    try {
      const result = await window.avs.presetSelect({
        id: project.projectM.presetId,
        smoothTransition: project.projectM.transition.enabled,
        transitionSeconds: project.projectM.transition.durationSeconds
      });
      projectMStatus = result.status;
      projectMResetRequested = true;
    } catch (error) {
      showToast(`Preset MilkDrop non disponibile: ${readError(error)}`, true);
    }
  }
}

async function applyProjectPresetPreview(
  previewResult: ProjectPresetPreview
): Promise<void> {
  projectState.update((draft) => {
    Object.assign(draft, structuredClone(previewResult.candidate));
  }, "Applica Preset di progetto");
  await synchronizeAppliedMedia(projectState.project);
  rebuildPresetSequence();
  showToast(
    previewResult.partial
      ? "Preset di progetto applicato parzialmente con conferma."
      : "Preset di progetto applicato."
  );
}

const projectPresetView = new ProjectPresetView({
  root: requiredElement<HTMLElement>("#project-preset-library"),
  currentProject: () => projectState.project,
  preview: (candidate) => {
    preview.update(
      candidate,
      audioEngine.snapshot(candidate.canvas.fps),
      audioEngine.currentTime
    );
  },
  cancelPreview: () => {
    preview.update(
      projectState.project,
      audioEngine.snapshot(projectState.project.canvas.fps),
      audioEngine.currentTime
    );
  },
  apply: applyProjectPresetPreview,
  notify: (message, error) => showToast(message, error)
});

const assetRelinkView = new AssetRelinkView({
  root: requiredElement<HTMLElement>("#project-assets"),
  currentProject: () => projectState.project,
  apply: async (updated, label) => {
    projectState.update((draft) => {
      Object.assign(draft, structuredClone(updated));
    }, label);
    await synchronizeAppliedMedia(projectState.project);
    showToast(`${label} completato.`);
  },
  notify: (message, error) => showToast(message, error)
});

for (const descriptor of pluginRegistry.list()) {
  const option = document.createElement("option");
  option.value = descriptor.id;
  option.textContent = `${descriptor.displayName} · ${descriptor.category}`;
  controls.pluginAddSelect.append(option);
}

function updatePluginSetting(
  layer: ProjectLayer,
  key: string,
  value: PluginSettingValue
): void {
  if (layer.kind !== "visualizer") return;
  const pluginId = layer.plugin?.id || layer.pluginId || "";
  const descriptor = pluginRegistry.get(pluginId);
  const parameter = descriptor?.parameters.find((item) => item.key === key);
  if (!descriptor || !parameter) return;
  const normalized = normalizePluginParameter(parameter, value);
  layer.pluginId = descriptor.id as VisualizerPluginId;
  layer.plugin ??= {
    id: descriptor.id,
    version: descriptor.version,
    settings: {}
  };
  layer.plugin.settings[key] = normalized;
  const legacy = layer.reactive as unknown as
    | Record<string, PluginSettingValue>
    | undefined;
  if (legacy && key in legacy) legacy[key] = normalized;
}

const pluginInspector = new PluginParameterInspector(
  controls.pluginInspector,
  {
    begin: (label) => projectState.beginTransaction(label),
    update: (key, value, label) => {
      projectState.update((project) => {
        const layer = selectedLayer(project);
        if (layer && !layer.locked) updatePluginSetting(layer, key, value);
      }, label);
    },
    commit: () => {
      projectState.commitTransaction();
    },
    resetParameter: (key) => {
      projectState.update((project) => {
        const layer = selectedLayer(project);
        if (!layer || layer.locked) return;
        const pluginId = layer.plugin?.id || layer.pluginId || "";
        const parameter = pluginRegistry
          .get(pluginId)
          ?.parameters.find((item) => item.key === key);
        if (parameter) updatePluginSetting(layer, key, parameter.defaultValue);
      }, "Ripristina parametro plugin");
    },
    resetAll: () => {
      projectState.update((project) => {
        const layer = selectedLayer(project);
        if (!layer || layer.locked) return;
        const pluginId = layer.plugin?.id || layer.pluginId || "";
        const descriptor = pluginRegistry.get(pluginId);
        if (!descriptor) return;
        for (const parameter of descriptor.parameters) {
          updatePluginSetting(layer, parameter.key, parameter.defaultValue);
        }
      }, "Ripristina plugin");
      preview.resetPlugin(selectedLayerId);
    },
    resetRuntime: () => preview.resetPlugin(selectedLayerId),
    status: (layerId) => preview.pluginStatus(layerId)
  }
);
window.setInterval(() => pluginInspector.refreshStatus(), 500);

function rebuildPresetSequence(): void {
  if (isRestoringProject) return;
  const settings = projectState.project.projectM;
  presetSequence = buildPresetSequence(
    settings,
    presetLibraryView.availableRecords.map((preset) => preset.id),
    Math.max(audioEngine.duration, 6 * 3600)
  );
  const current = presetEventAt(presetSequence, audioEngine.currentTime);
  appliedPresetSequenceIndex = current?.index ?? 0;
}

projectState.subscribe((project) => {
  if (
    selectedLayerId &&
    !project.layers.some((layer) => layer.id === selectedLayerId)
  ) {
    selectedLayerId = "";
  }
  preview.selectLayer(selectedLayerId);
  preview.update(
    project,
    audioEngine.snapshot(project.canvas.fps),
    audioEngine.currentTime
  );
  syncProjectFormatControls(project);
  controls.status.textContent =
    `${project.name}${projectState.isDirty ? " • modificato" : ""}`;
  syncControlValues(project);
  renderLayers(project);
  renderTimeline(project);
  drawWaveform();
  assetRelinkView.render(project);
  syncCanvasEmptyState(project);
  if (!isRestoringProject) {
    void synchronizeCoverMedia(project.cover.filePath);
    void synchronizeClipMedia(project.clip.filePath);
  }
});

function syncCanvasEmptyState(project: VisualizerProject): void {
  const hasClip = Boolean(project.clip.filePath);
  const hasCover = Boolean(
    project.cover.filePath &&
      project.layers.some((layer) => layer.kind === "cover" && layer.visible)
  );
  const hasText = project.layers.some(
    (layer) =>
      layer.visible &&
      ((layer.kind === "titleText" && Boolean(project.text.title.trim())) ||
        (layer.kind === "artistText" && Boolean(project.text.artist.trim())))
  );
  const hasEffect = activeSimpleEffect(project) !== "none";
  if (!project.audioFile && !hasClip && !hasCover && !hasText && !hasEffect) {
    controls.canvasEmptyState.replaceChildren(
      ...[
        "1. Scegli una clip o un'immagine",
        "2. Seleziona la sorgente audio",
        "3. Scrivi titolo e artista",
        "4. Scegli un effetto",
        "5. Premi Play"
      ].map((text, index) => {
        const line = document.createElement(index === 0 ? "strong" : "span");
        line.textContent = text;
        return line;
      })
    );
    controls.canvasEmptyState.classList.remove("hidden");
    return;
  }
  controls.canvasEmptyState.textContent = "Scegli un effetto e premi Play";
  controls.canvasEmptyState.classList.toggle(
    "hidden",
    (!project.audioFile && !hasClip) || hasEffect || hasClip
  );
}

type SimpleEffectId = VisualizerPluginId | "projectM" | "none";

function activeSimpleEffect(project = projectState.project): SimpleEffectId {
  const projectMLayer = project.layers.find(
    (layer) => layer.kind === "projectM" && layer.visible
  );
  if (projectMLayer && project.projectM.enabled) return "projectM";
  const visualizer = [...project.layers]
    .reverse()
    .find((layer) => layer.kind === "visualizer" && layer.visible);
  const id = visualizer?.plugin?.id || visualizer?.pluginId;
  return pluginRegistry.get(id ?? "") ? (id as VisualizerPluginId) : "none";
}

function activeSimpleEffectLayer(
  project = projectState.project
): ProjectLayer | undefined {
  const effect = activeSimpleEffect(project);
  if (effect === "none") return undefined;
  return project.layers.find((candidate) =>
    effect === "projectM"
      ? candidate.kind === "projectM" && candidate.visible
      : candidate.kind === "visualizer" &&
        candidate.visible &&
        (candidate.plugin?.id || candidate.pluginId) === effect
  );
}

type SimpleLayerKind =
  | "background"
  | "effect"
  | "titleText"
  | "artistText";

function hasBackgroundMedia(project: VisualizerProject): boolean {
  return Boolean(project.clip.filePath || project.cover.filePath);
}

function backgroundMediaLabel(project: VisualizerProject): "Video" | "Immagine" | "Sfondo" {
  if (project.clip.filePath) return "Video";
  if (project.cover.filePath) return "Immagine";
  return "Sfondo";
}

function backgroundLayer(
  project = projectState.project
): ProjectLayer | undefined {
  return project.layers.find((layer) => layer.kind === "cover");
}

function simpleLayerByKind(
  kind: SimpleLayerKind,
  project = projectState.project
): ProjectLayer | undefined {
  if (kind === "effect") return activeSimpleEffectLayer(project);
  if (kind === "background") return backgroundLayer(project);
  return project.layers.find((layer) => layer.kind === kind);
}

function simpleLayerAvailable(
  kind: SimpleLayerKind,
  project: VisualizerProject
): boolean {
  const layer = simpleLayerByKind(kind, project);
  if (!layer?.visible) return false;
  if (kind === "background") return hasBackgroundMedia(project);
  if (kind === "titleText") return Boolean(project.text.title.trim());
  if (kind === "artistText") return Boolean(project.text.artist.trim());
  return activeSimpleEffect(project) !== "none";
}

function simpleLayerPresent(
  kind: SimpleLayerKind,
  project: VisualizerProject
): boolean {
  if (kind === "background") return hasBackgroundMedia(project);
  if (kind === "titleText") return Boolean(project.text.title.trim());
  if (kind === "artistText") return Boolean(project.text.artist.trim());
  return activeSimpleEffect(project) !== "none";
}

function syncSimpleLayerSelector(project: VisualizerProject): void {
  const entries: Array<{
    kind: SimpleLayerKind;
    label: string;
    button: HTMLButtonElement;
  }> = [
    {
      kind: "background",
      label: backgroundMediaLabel(project),
      button: controls.simpleLayerBackground
    },
    { kind: "effect", label: "Effetto", button: controls.simpleLayerEffect },
    { kind: "titleText", label: "Titolo", button: controls.simpleLayerTitle },
    { kind: "artistText", label: "Artista", button: controls.simpleLayerArtist }
  ];
  controls.simpleLayerBackgroundLabel.textContent =
    backgroundMediaLabel(project);
  let selectedLabel = "Nessun elemento";
  let selectedSimpleLayer: ProjectLayer | undefined;
  for (const entry of entries) {
    const layer = simpleLayerByKind(entry.kind, project);
    const present = simpleLayerPresent(entry.kind, project);
    const available = simpleLayerAvailable(entry.kind, project);
    const active = Boolean(available && layer?.id === selectedLayerId);
    entry.button.disabled = !available;
    entry.button.classList.toggle("selected", active);
    entry.button.setAttribute("aria-pressed", String(active));
    const state = entry.button.querySelector<HTMLElement>("[data-layer-state]");
    if (state) {
      state.textContent = active
        ? "ATTIVO"
        : !present
          ? "ASSENTE"
          : !layer?.visible
            ? "NASCOSTO"
            : "DISPONIBILE";
    }
    entry.button.title = active
      ? `${entry.label}: layer attivo`
      : available
        ? `Seleziona ${entry.label}`
        : present
          ? `${entry.label}: layer nascosto`
          : `${entry.label}: elemento assente`;
    if (active) {
      selectedLabel = entry.label;
      selectedSimpleLayer = layer;
    }
  }
  controls.simpleSelectedLayerName.textContent = selectedLabel;
  for (const action of [
    controls.simpleLayerCenter,
    controls.simpleLayerFit,
    controls.simpleLayerReset
  ]) {
    action.disabled = !selectedSimpleLayer || selectedSimpleLayer.locked;
  }
}

function simpleEffectIntensity(project: VisualizerProject): number {
  const layer = activeSimpleEffectLayer(project);
  return Math.max(0, Math.min(2, layer?.reactive?.intensity ?? 1));
}

function syncControlValues(project: VisualizerProject): void {
  const useClipAudio = project.audioSource === "clip";
  controls.simpleAudioSourceClip.checked = useClipAudio;
  controls.simpleAudioSourceExternal.checked = !useClipAudio;
  controls.simpleAudioSourceStatus.textContent = useClipAudio
    ? `Sorgente attiva: Audio della clip · ${formatTime(
        audioEngine.duration || project.clip.durationSeconds
      )}`
    : `Sorgente attiva: Audio esterno${
        audioEngine.duration || project.externalAudioDurationSeconds
          ? ` · ${formatTime(
              audioEngine.duration || project.externalAudioDurationSeconds
            )}`
          : ""
      }`;
  controls.simpleChooseAudio.classList.toggle("hidden", useClipAudio);
  controls.simpleAudioFile.classList.toggle(
    "hidden",
    !audioEngine.hasPcm || (useClipAudio && !project.clip.filePath)
  );
  controls.simpleClipEndModeRow.classList.toggle(
    "hidden",
    !project.clip.filePath
  );
  controls.simpleClipEndMode.value = project.clip.endMode;
  controls.simpleClipFile.classList.toggle("hidden", !project.clip.filePath);
  if (project.clip.filePath) {
    controls.simpleClipName.textContent =
      project.clip.filePath.split(/[\\/]/).pop() ?? "Clip";
    controls.simpleClipDetails.textContent =
      `${clipTechnicalSummary(project.clip)} · ` +
      `${formatTime(project.clip.durationSeconds)}` +
      (project.clip.hasAudio ? " · con audio" : " · senza audio");
  }

  const layer = selectedLayer(project);
  if (layer) {
    const editable =
      layer.kind === "cover" ||
      layer.kind === "artistText" ||
      layer.kind === "titleText";
    controls.transformSection.classList.toggle("hidden", !editable);
    controls.animationSection.classList.remove("hidden");
    controls.inspectorTitle.textContent = layer.name;
    if (document.activeElement !== controls.layerName) {
      controls.layerName.value = layer.name;
    }
    controls.layerVisible.checked = layer.visible;
    controls.layerLocked.checked = layer.locked;
    controls.layerOpacity.value = String(Math.round(layer.opacity * 100));
    controls.layerOpacityValue.value = `${controls.layerOpacity.value}%`;
    controls.layerBlend.value = layer.blendMode;
    controls.layerStart.value = String(layer.startTime);
    controls.layerEnd.value = layer.endTime === null ? "" : String(layer.endTime);
    const effectiveIndex = buildKeyframeIndex(layer.keyframes);
    const effectiveTransform = {
      x: evaluateProperty(effectiveIndex, layer, audioEngine.currentTime, "x").value,
      y: evaluateProperty(effectiveIndex, layer, audioEngine.currentTime, "y").value,
      scale:
        evaluateProperty(
          effectiveIndex,
          layer,
          audioEngine.currentTime,
          "scale"
        ).value,
      rotation:
        evaluateProperty(
          effectiveIndex,
          layer,
          audioEngine.currentTime,
          "rotation"
        ).value
    };
    controls.transformX.value = String(effectiveTransform.x);
    controls.transformY.value = String(effectiveTransform.y);
    controls.transformScaleX.value = String(
      layer.keyframes.some((item) => item.property === "scale")
        ? effectiveTransform.scale
        : layer.transform.scaleX
    );
    controls.transformScaleY.value = String(
      layer.keyframes.some((item) => item.property === "scale")
        ? effectiveTransform.scale
        : layer.transform.scaleY
    );
    controls.transformRotation.value = String(effectiveTransform.rotation);
    for (const input of [
      controls.transformX,
      controls.transformY,
      controls.transformScaleX,
      controls.transformScaleY,
      controls.transformRotation,
      controls.keyframeValue,
      controls.keyframeInterpolation,
      controls.keyframeToggle
    ]) {
      input.disabled = layer.locked;
    }
    syncKeyframeInspector(layer);
    const isText = layer.kind === "artistText" || layer.kind === "titleText";
    controls.textSection.classList.toggle("hidden", !isText);
    controls.coverSection.classList.toggle("hidden", layer.kind !== "cover");
    controls.layerDuplicate.disabled = layer.kind !== "visualizer" || layer.locked;
    controls.layerDelete.disabled = layer.kind !== "visualizer" || layer.locked;
    controls.layerUp.disabled = layer.locked;
    controls.layerDown.disabled = layer.locked;
    pluginInspector.render(layer);
    for (const control of [
      controls.layerName,
      controls.layerVisible,
      controls.layerOpacity,
      controls.layerBlend,
      controls.layerStart,
      controls.layerEnd,
      controls.artist,
      controls.title,
      controls.textColor,
      controls.textSize,
      controls.coverWidth,
      controls.coverHeight,
      controls.coverOpacity,
      controls.transformReset
    ]) {
      control.disabled = layer.locked;
    }
    controls.pluginInspector
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        "input, select, button"
      )
      .forEach((control) => {
        control.disabled = layer.locked;
      });
    if (layer.kind === "artistText") {
      controls.textSize.value = String(project.text.artistSize * 100);
      controls.textSizeValue.value = `${Math.round(project.text.artistSize * 540)}px`;
    } else if (layer.kind === "titleText") {
      controls.textSize.value = String(project.text.titleSize * 100);
      controls.textSizeValue.value = `${Math.round(project.text.titleSize * 540)}px`;
    }
  }
  if (!layer) {
    pluginInspector.render(null);
    controls.transformSection.classList.add("hidden");
    controls.animationSection.classList.add("hidden");
  }
  if (document.activeElement !== controls.artist) controls.artist.value = project.text.artist;
  if (document.activeElement !== controls.title) controls.title.value = project.text.title;
  controls.textColor.value = project.text.color;
  controls.accentColor.value = project.canvas.accentColor;
  controls.backgroundColor.value = project.canvas.backgroundColor;
  controls.coverWidth.value = String(Math.round(project.cover.width * 100));
  controls.coverHeight.value = String(Math.round(project.cover.height * 100));
  controls.coverOpacity.value = String(Math.round(project.cover.opacity * 100));
  controls.coverFit.value = project.cover.fitMode;
  controls.coverFitPrimary.value = project.cover.fitMode;
  const coverLayer = project.layers.find((candidate) => candidate.kind === "cover");
  controls.coverVisiblePrimary.checked = Boolean(coverLayer?.visible);
  const coverAvailable = Boolean(project.cover.filePath);
  for (const control of [
    controls.coverVisiblePrimary,
    controls.coverFit,
    controls.coverFitPrimary,
    controls.coverAdapt,
    controls.coverAdaptPrimary,
    controls.coverCenter,
    controls.coverCenterPrimary,
    controls.coverReset,
    controls.coverResetPrimary,
    controls.coverRemove,
    controls.coverRemovePrimary
  ]) {
    control.disabled = !coverAvailable || Boolean(coverLayer?.locked);
  }
  controls.coverWidthValue.value = `${controls.coverWidth.value}%`;
  controls.coverHeightValue.value = `${controls.coverHeight.value}%`;
  controls.coverOpacityValue.value = `${controls.coverOpacity.value}%`;
  controls.exportFps.value = String(project.exportSettings.fps);
  controls.projectMEnabled.checked = project.projectM.enabled;
  controls.presetLocked.checked = project.projectM.locked;
  controls.presetAutoEnabled.checked = project.projectM.autoSwitch.enabled;
  controls.presetAutoMode.value = project.projectM.autoSwitch.mode;
  controls.presetAutoOrder.value = project.projectM.autoSwitch.order;
  controls.presetInterval.value = String(project.projectM.autoSwitch.intervalSeconds);
  controls.presetMinimum.value = String(project.projectM.autoSwitch.minimumSeconds);
  controls.presetMaximum.value = String(project.projectM.autoSwitch.maximumSeconds);
  controls.presetNoRepeat.checked = project.projectM.autoSwitch.noImmediateRepeat;
  controls.presetTransitionEnabled.checked = project.projectM.transition.enabled;
  controls.presetTransitionDuration.value = String(project.projectM.transition.durationSeconds);
  controls.presetRandomSeed.value = String(project.projectM.randomSeed);
  controls.particleRandomSeed.value = String(project.projectM.particleSeed);
  controls.presetPlaylistCount.textContent =
    `${project.projectM.playlistIds.length} in playlist`;
  controls.presetMarkerCount.textContent =
    `${project.projectM.markers.length} marcatori`;
  controls.presetFavoriteCurrent.textContent =
    project.projectM.favoritePresetIds.includes(project.projectM.presetId)
      ? "★"
      : "☆";

  const simpleCoverAvailable = Boolean(project.cover.filePath);
  const simpleBackgroundAvailable = hasBackgroundMedia(project);
  controls.simpleCoverFile.classList.toggle("hidden", !simpleCoverAvailable);
  controls.simpleRemoveCover.disabled = !simpleBackgroundAvailable;
  controls.simpleCoverFit.disabled = !simpleBackgroundAvailable;
  controls.simpleBackgroundOpacity.disabled = !simpleBackgroundAvailable;
  controls.simpleCoverFit.value =
    project.cover.fitMode === "fill" || project.cover.fitMode === "original"
      ? project.cover.fitMode
      : "contain";
  controls.simpleBackgroundOpacity.value = String(
    Math.round(project.cover.opacity * 100)
  );
  controls.simpleBackgroundOpacityValue.value =
    `${controls.simpleBackgroundOpacity.value}%`;

  if (document.activeElement !== controls.simpleTitle) {
    controls.simpleTitle.value = project.text.title;
  }
  if (document.activeElement !== controls.simpleArtist) {
    controls.simpleArtist.value = project.text.artist;
  }
  const titleLayer = project.layers.find((item) => item.kind === "titleText");
  const artistLayer = project.layers.find((item) => item.kind === "artistText");
  const titlePixels = Math.round(project.text.titleSize * previewCanvas.width);
  const artistPixels = Math.round(project.text.artistSize * previewCanvas.width);
  controls.simpleTitleSize.value = String(
    Math.max(16, Math.min(120, titlePixels))
  );
  controls.simpleTitleSizeValue.value = `${titlePixels} px`;
  controls.simpleArtistSize.value = String(
    Math.max(12, Math.min(80, artistPixels))
  );
  controls.simpleArtistSizeValue.value = `${artistPixels} px`;
  controls.simpleTitleColor.value = project.text.titleColor;
  controls.simpleArtistColor.value = project.text.artistColor;
  controls.simpleTitleOpacity.value = String(
    Math.round((titleLayer?.opacity ?? 1) * 100)
  );
  controls.simpleTitleOpacityValue.value =
    `${controls.simpleTitleOpacity.value}%`;
  controls.simpleArtistOpacity.value = String(
    Math.round((artistLayer?.opacity ?? 1) * 100)
  );
  controls.simpleArtistOpacityValue.value =
    `${controls.simpleArtistOpacity.value}%`;

  const effect = activeSimpleEffect(project);
  controls.simpleEffect.value = effect;
  controls.simplePresetRow.classList.toggle("hidden", effect !== "projectM");
  if (
    effect === "projectM" &&
    [...controls.simplePreset.options].some(
      (option) => option.value === project.projectM.presetId
    )
  ) {
    controls.simplePreset.value = project.projectM.presetId;
  }
  syncSimplePresetSelection(controls.simplePreset.value);
  if (effect !== "projectM") closeSimplePresetListbox();
  const intensity = Math.round(simpleEffectIntensity(project) * 100);
  controls.simpleIntensity.value = String(intensity);
  controls.simpleIntensityValue.value = `${intensity}%`;
  controls.simpleIntensity.disabled = effect === "none";
  const effectLayer = activeSimpleEffectLayer(project);
  const effectOpacity = Math.round((effectLayer?.opacity ?? 1) * 100);
  controls.simpleEffectOpacity.value = String(effectOpacity);
  controls.simpleEffectOpacityValue.value = `${effectOpacity}%`;
  for (const control of [
    controls.simpleEffectOpacity,
    controls.simpleEffectCenter,
    controls.simpleEffectFit,
    controls.simpleEffectReset,
    controls.simpleEffectRemove
  ]) {
    control.disabled = effect === "none" || Boolean(effectLayer?.locked);
  }

  const audioReady = Boolean(project.audioFile && audioEngine.hasPcm);
  controls.playPause.disabled = !audioReady;
  controls.stop.disabled = !audioReady;
  controls.simpleSeek.disabled = !audioReady;
  controls.simpleExportVideo.disabled = !audioReady;
  controls.simplePlayHint.textContent = audioReady
    ? "Trascina immagine, effetto e testi direttamente nell'anteprima"
    : useClipAudio && project.clip.filePath && !project.clip.hasAudio
      ? "La clip non contiene una traccia audio"
      : "Scegli la sorgente audio";
  controls.simplePlayHint.classList.toggle("ready", audioReady);
  const projectMError =
    effect === "projectM" && projectMStatus && !projectMStatus.available
      ? projectMStatus.error || "Motore projectM non disponibile."
      : "";
  controls.simpleEffectError.textContent = projectMError;
  controls.simpleEffectError.classList.toggle("hidden", !projectMError);
  syncSimpleLayerSelector(project);
}

function selectedAnimationProperty(): AnimatableProperty {
  const value = controls.keyframeProperty.value;
  return isAnimatableProperty(value) ? value : "x";
}

function syncKeyframeInspector(layer: ProjectLayer): void {
  const property = selectedAnimationProperty();
  const index = buildKeyframeIndex(layer.keyframes);
  const evaluated = evaluateProperty(index, layer, audioEngine.currentTime, property);
  if (document.activeElement !== controls.keyframeValue) {
    controls.keyframeValue.value = String(evaluated.value);
  }
  const current = keyframeAt(layer, property, audioEngine.currentTime);
  const animated = layer.keyframes.some((item) => item.property === property);
  controls.keyframeToggle.textContent = current
    ? "Rimuovi keyframe"
    : "Aggiungi keyframe";
  controls.keyframeInterpolation.value =
    current?.interpolation ??
    (index.tracks.get(property)?.at(-1)?.interpolation || "linear");
  controls.keyframeSource.textContent = current
    ? `Keyframe al playhead · ${formatTime(current.time)}`
    : animated
      ? `Valore ${evaluated.source === "interpolated" ? "interpolato" : "base"}`
      : "Valore base · proprietà non animata";
  controls.keyframePrevious.disabled =
    adjacentKeyframe(layer.keyframes, property, audioEngine.currentTime, -1) === null;
  controls.keyframeNext.disabled =
    adjacentKeyframe(layer.keyframes, property, audioEngine.currentTime, 1) === null;
  controls.keyframeDuplicate.disabled = !current || layer.locked;
}

function bindProjectInput(
  element: HTMLInputElement | HTMLSelectElement,
  update: (project: VisualizerProject, value: string) => void
): void {
  element.addEventListener("input", () => {
    const lockSensitive = new Set([
      "layer-name",
      "layer-opacity",
      "layer-blend",
      "layer-start",
      "layer-end",
      "artist",
      "title",
      "text-color",
      "text-size",
      "cover-width",
      "cover-height",
      "cover-opacity"
    ]);
    if (lockSensitive.has(element.id) && selectedLayer()?.locked) return;
    projectState.beginTransaction(`Modifica ${element.id}`);
    projectState.update(
      (project) => update(project, element.value),
      `Modifica ${element.id}`
    );
  });
  element.addEventListener("change", () => projectState.commitTransaction());
  element.addEventListener("blur", () => projectState.commitTransaction());
}

function textLayer(project: VisualizerProject, kind: "titleText" | "artistText") {
  return project.layers.find((layer) => layer.kind === kind);
}

function bindSimpleText(
  input: HTMLInputElement,
  kind: "titleText" | "artistText"
): void {
  const field = kind === "titleText" ? "title" : "artist";
  const layerId = kind === "titleText" ? "title-text" : "artist-text";
  input.addEventListener("input", () => {
    projectState.beginTransaction(`Modifica ${field}`);
    projectState.update((project) => {
      project.text[field] = input.value;
      const layer = textLayer(project, kind);
      if (layer) layer.visible = input.value.trim().length > 0;
    }, `Modifica ${field}`);
    if (input.value.trim()) selectLayer(layerId);
    else if (selectedLayerId === layerId) selectLayer("");
  });
  input.addEventListener("change", () => projectState.commitTransaction());
  input.addEventListener("blur", () => projectState.commitTransaction());
  input.addEventListener("focus", () => {
    if (input.value.trim()) selectLayer(layerId);
  });
}

function bindSimpleValue(
  input: HTMLInputElement,
  label: string,
  update: (project: VisualizerProject, value: number) => void
): void {
  input.addEventListener("input", () => {
    projectState.beginTransaction(label);
    projectState.update(
      (project) => update(project, Number(input.value)),
      label
    );
  });
  input.addEventListener("change", () => projectState.commitTransaction());
  input.addEventListener("blur", () => projectState.commitTransaction());
}

function ensureSimpleVisualizerLayer(
  project: VisualizerProject,
  pluginId: VisualizerPluginId
): ProjectLayer | null {
  const existing = project.layers.find(
    (layer) =>
      layer.kind === "visualizer" &&
      (layer.plugin?.id || layer.pluginId) === pluginId
  );
  if (existing) return existing;
  const descriptor = pluginRegistry.get(pluginId);
  if (!descriptor) return null;
  const settings = structuredClone(descriptor.defaultSettings);
  const reactive: ReactiveSettings = {
    band:
      settings.band === "bass" ||
      settings.band === "mid" ||
      settings.band === "high"
        ? settings.band
        : "volume",
    sensitivity:
      typeof settings.sensitivity === "number" ? settings.sensitivity : 1,
    smoothing: typeof settings.smoothing === "number" ? settings.smoothing : 0.72,
    intensity: typeof settings.intensity === "number" ? settings.intensity : 1,
    color: typeof settings.color === "string" ? settings.color : "#8b5cf6"
  };
  const layer: ProjectLayer = {
    id: `visualizer-${pluginId}`,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId,
    plugin: {
      id: descriptor.id,
      version: descriptor.version,
      settings
    },
    visible: false,
    locked: false,
    opacity: 1,
    blendMode: pluginId === "dynamicVignette" ? "multiply" : "screen",
    startTime: 0,
    endTime: null,
    reactive,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    keyframes: []
  };
  const coverIndex = project.layers.findIndex(
    (candidate) => candidate.kind === "cover"
  );
  project.layers.splice(coverIndex < 0 ? 0 : coverIndex + 1, 0, layer);
  applySimpleLayerOrder(project);
  return layer;
}

async function chooseSimpleEffect(effect: SimpleEffectId): Promise<void> {
  controls.simpleEffectError.classList.add("hidden");
  projectState.update((project) => {
    for (const layer of project.layers) {
      if (layer.kind === "visualizer" || layer.kind === "projectM") {
        layer.visible = false;
      }
    }
    project.projectM.enabled = effect === "projectM";
    if (effect === "projectM") {
      let layer = project.layers.find((candidate) => candidate.kind === "projectM");
      if (!layer) {
        layer = {
          id: "projectm",
          name: "projectM / MilkDrop",
          kind: "projectM",
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: "screen",
          startTime: 0,
          endTime: null,
          reactive: {
            band: "volume",
            sensitivity: 1,
            smoothing: 0.72,
            intensity: Number(controls.simpleIntensity.value) / 100,
            color: "#ffffff"
          },
          transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
          keyframes: []
        };
        const coverIndex = project.layers.findIndex(
          (candidate) => candidate.kind === "cover"
        );
        project.layers.splice(coverIndex < 0 ? 0 : coverIndex + 1, 0, layer);
      }
      layer.visible = true;
      layer.blendMode = "screen";
      layer.reactive ??= {
        band: "volume",
        sensitivity: 1,
        smoothing: 0.72,
        intensity: Number(controls.simpleIntensity.value) / 100,
        color: "#ffffff"
      };
    } else if (effect !== "none") {
      const layer = ensureSimpleVisualizerLayer(project, effect);
      if (layer) layer.visible = true;
    }
    applySimpleLayerOrder(project);
  }, `Scegli effetto ${effect}`);
  const selectedEffectLayer = projectState.project.layers.find((candidate) =>
    effect === "projectM"
      ? candidate.kind === "projectM" && candidate.visible
      : candidate.kind === "visualizer" &&
        candidate.visible &&
        (candidate.plugin?.id || candidate.pluginId) === effect
  );
  selectLayer(selectedEffectLayer?.id ?? "");
  if (effect !== "projectM") {
    preview.clearProjectMFrame();
    return;
  }
  try {
    await initializeProjectM();
    const presetId = controls.simplePreset.value || projectState.project.projectM.presetId;
    if (presetId) await presetLibraryView.select(presetId, "manual", true);
  } catch (error) {
    const message = `projectM non disponibile: ${readError(error)}`;
    controls.simpleEffectError.textContent = message;
    controls.simpleEffectError.classList.remove("hidden");
    showToast(message, true);
  }
}

bindSimpleText(controls.simpleTitle, "titleText");
bindSimpleText(controls.simpleArtist, "artistText");
bindSimpleValue(controls.simpleTitleSize, "Dimensione titolo", (project, value) => {
  project.text.titleSize = value / previewCanvas.width;
});
bindSimpleValue(controls.simpleArtistSize, "Dimensione artista", (project, value) => {
  project.text.artistSize = value / previewCanvas.width;
});
bindSimpleValue(controls.simpleTitleOpacity, "Opacità titolo", (project, value) => {
  const layer = textLayer(project, "titleText");
  if (layer) layer.opacity = value / 100;
});
bindSimpleValue(controls.simpleArtistOpacity, "Opacità artista", (project, value) => {
  const layer = textLayer(project, "artistText");
  if (layer) layer.opacity = value / 100;
});
for (const [color, kind] of [
  [controls.simpleTitleColor, "titleText"],
  [controls.simpleArtistColor, "artistText"]
] as const) {
  color.addEventListener("input", () => {
    projectState.update((project) => {
      if (kind === "titleText") project.text.titleColor = color.value;
      else project.text.artistColor = color.value;
    }, kind === "titleText" ? "Colore titolo" : "Colore artista");
  });
}

bindProjectInput(controls.layerName, (project, value) => {
  const layer = selectedLayer(project);
  if (layer) layer.name = value.trimStart();
});
controls.layerVisible.addEventListener("change", () => {
  updateSelectedLayer((layer) => { layer.visible = controls.layerVisible.checked; });
});
controls.layerLocked.addEventListener("change", () => {
  updateSelectedLayer(
    (layer) => { layer.locked = controls.layerLocked.checked; },
    true
  );
});
bindProjectInput(controls.layerOpacity, (project, value) => {
  const layer = selectedLayer(project);
  if (layer) layer.opacity = Number(value) / 100;
});
bindProjectInput(controls.layerBlend, (project, value) => {
  const layer = selectedLayer(project);
  if (layer) layer.blendMode = value as GlobalCompositeOperation;
});
bindProjectInput(controls.layerStart, (project, value) => {
  const layer = selectedLayer(project);
  if (layer && !layer.locked) {
    const duration = Math.max(1 / 60, audioEngine.duration || 24 * 3600);
    const clipped = clampClip(
      Number(value) || 0,
      layer.endTime ?? duration,
      duration
    );
    layer.startTime = clipped.start;
    layer.endTime = clipped.end >= duration ? null : clipped.end;
  }
});
bindProjectInput(controls.layerEnd, (project, value) => {
  const layer = selectedLayer(project);
  if (layer && !layer.locked) {
    const parsed = Number(value);
    if (value === "" || !Number.isFinite(parsed)) {
      layer.endTime = null;
    } else {
      const duration = Math.max(1 / 60, audioEngine.duration || parsed);
      const clipped = clampClip(layer.startTime, parsed, duration);
      layer.startTime = clipped.start;
      layer.endTime = clipped.end >= duration ? null : clipped.end;
    }
  }
});
bindProjectInput(controls.artist, (project, value) => { project.text.artist = value; });
bindProjectInput(controls.title, (project, value) => { project.text.title = value; });
bindProjectInput(controls.textColor, (project, value) => { project.text.color = value; });
bindProjectInput(controls.textSize, (project, value) => {
  const layer = selectedLayer(project);
  if (layer?.kind === "artistText") project.text.artistSize = Number(value) / 100;
  if (layer?.kind === "titleText") project.text.titleSize = Number(value) / 100;
});
bindProjectInput(controls.accentColor, (project, value) => { project.canvas.accentColor = value; });
bindProjectInput(controls.backgroundColor, (project, value) => { project.canvas.backgroundColor = value; });
bindProjectInput(controls.coverWidth, (project, value) => { project.cover.width = Number(value) / 100; });
bindProjectInput(controls.coverHeight, (project, value) => { project.cover.height = Number(value) / 100; });
bindProjectInput(controls.coverOpacity, (project, value) => { project.cover.opacity = Number(value) / 100; });
for (const fitControl of [controls.coverFit, controls.coverFitPrimary]) {
  fitControl.addEventListener("change", () => {
    projectState.update((project) => {
      project.cover.fitMode =
        fitControl.value === "fill" ||
        fitControl.value === "stretch" ||
        fitControl.value === "original"
          ? fitControl.value
          : "contain";
    }, "Cambia adattamento cover");
  });
}

controls.coverVisiblePrimary.addEventListener("change", () => {
  projectState.update((project) => {
    setCoverVisible(project, controls.coverVisiblePrimary.checked);
  }, controls.coverVisiblePrimary.checked ? "Mostra cover" : "Nascondi cover");
});

function backgroundMetrics(): CoverPreviewInfo | ClipPreviewInfo | null {
  const project = projectState.project;
  if (project.clip.filePath) {
    return (
      clipPreviewInfo ?? {
        width: project.clip.width,
        height: project.clip.height,
        duration: project.clip.durationSeconds,
        readyState: 0,
        presentedFrames: 0
      }
    );
  }
  return project.cover.filePath ? coverPreviewInfo : null;
}

function withBackgroundMedia(
  label: string,
  update: (
    project: VisualizerProject,
    media: CoverPreviewInfo | ClipPreviewInfo,
    video: boolean
  ) => void
): void {
  const media = backgroundMetrics();
  if (!media || !hasBackgroundMedia(projectState.project)) {
    showToast("Carica prima una cover o una clip video.", true);
    return;
  }
  const video = Boolean(projectState.project.clip.filePath);
  projectState.update(
    (project) => update(project, media, video),
    label
  );
  selectLayer(backgroundLayer()?.id ?? "cover");
}

function adaptCurrentCover(): void {
  withBackgroundMedia("Adatta sfondo", (project, media, video) => {
    if (video) {
      project.cover.width = 1;
      project.cover.height = 1;
      project.cover.fitMode = "contain";
      const layer = backgroundLayer(project);
      if (layer) {
        layer.transform.scaleX = 1;
        layer.transform.scaleY = 1;
      }
    } else {
      fitCoverToCanvas(project, media);
    }
    centerCover(project);
  });
}

function centerCurrentCover(): void {
  if (!hasBackgroundMedia(projectState.project)) return;
  projectState.update((project) => centerCover(project), "Centra sfondo");
  selectLayer(backgroundLayer()?.id ?? "cover");
}

function resetCurrentCover(): void {
  withBackgroundMedia("Ripristina sfondo", (project, media, video) => {
    if (video) {
      const layer = backgroundLayer(project);
      project.cover.fitMode = "contain";
      project.cover.width = 1;
      project.cover.height = 1;
      project.cover.opacity = 1;
      project.cover.cornerRadius = 0;
      if (layer && !layer.locked) {
        layer.visible = true;
        layer.opacity = 1;
        layer.blendMode = "source-over";
        layer.transform = {
          x: 0.5,
          y: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        };
        layer.keyframes = [];
      }
    } else {
      resetCoverPresentation(project, media);
    }
  });
}

function removeCurrentCover(): void {
  const removingVideo = Boolean(projectState.project.clip.filePath);
  if (!hasBackgroundMedia(projectState.project)) return;
  projectState.update((project) => {
    if (project.clip.filePath) {
      project.clip = {
        ...project.clip,
        filePath: null,
        durationSeconds: 0,
        audioDurationSeconds: 0,
        hasAudio: false,
        width: 0,
        height: 0,
        frameRate: 0,
        container: "",
        videoCodec: "",
        audioCodec: null
      };
      project.assets = project.assets.filter((asset) => asset.type !== "clip");
      synchronizeSelectedAudio(project);
      const layer = backgroundLayer(project);
      if (layer) {
        layer.visible = false;
        layer.name = "Sfondo";
      }
    } else {
      removeCoverFromProject(project);
    }
  }, "Rimuovi sfondo");
  selectLayer(backgroundLayer()?.id ?? "cover");
  if (removingVideo) {
    if (projectState.project.externalAudioFile) {
      void activateAudioSource("external", false);
    } else {
      clearActiveAudioUi();
    }
  }
}

for (const button of [controls.coverAdapt, controls.coverAdaptPrimary]) {
  button.addEventListener("click", adaptCurrentCover);
}
for (const button of [controls.coverCenter, controls.coverCenterPrimary]) {
  button.addEventListener("click", centerCurrentCover);
}
for (const button of [controls.coverReset, controls.coverResetPrimary]) {
  button.addEventListener("click", resetCurrentCover);
}
for (const button of [controls.coverRemove, controls.coverRemovePrimary]) {
  button.addEventListener("click", removeCurrentCover);
}

function bindTransformInput(
  element: HTMLInputElement,
  property: "x" | "y" | "rotation" | "scaleX" | "scaleY"
): void {
  element.addEventListener("change", () => {
    const value = Number(element.value);
    if (!Number.isFinite(value)) return;
    projectState.update((project) => {
      const layer = selectedLayer(project);
      if (!layer || layer.locked) return;
      if (property === "scaleX" || property === "scaleY") {
        const animated = layer.keyframes.some((item) => item.property === "scale");
        if (animated) writeAnimatedValue(layer, "scale", value, audioEngine.currentTime);
        else layer.transform[property] = Math.max(0.01, Math.min(20, value));
      } else {
        writeAnimatedValue(layer, property, value, audioEngine.currentTime);
      }
    }, `Imposta ${property}`);
  });
}

bindTransformInput(controls.transformX, "x");
bindTransformInput(controls.transformY, "y");
bindTransformInput(controls.transformScaleX, "scaleX");
bindTransformInput(controls.transformScaleY, "scaleY");
bindTransformInput(controls.transformRotation, "rotation");
controls.canvasSnapping.addEventListener("change", () => {
  preview.setSnappingEnabled(controls.canvasSnapping.checked);
});
controls.transformReset.addEventListener("click", () => {
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    layer.transform = { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
    layer.keyframes = layer.keyframes.filter(
      (keyframe) =>
        keyframe.property !== "x" &&
        keyframe.property !== "y" &&
        keyframe.property !== "scale" &&
        keyframe.property !== "rotation"
    );
  }, "Reset trasformazione");
});
controls.keyframeProperty.addEventListener("change", () => {
  selectedKeyframeId = null;
  const layer = selectedLayer();
  if (layer) syncKeyframeInspector(layer);
  renderTimeline(projectState.project);
});
controls.keyframeToggle.addEventListener("click", () => {
  const property = selectedAnimationProperty();
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    const current = keyframeAt(layer, property, audioEngine.currentTime);
    if (current) {
      layer.keyframes = removeKeyframe(layer.keyframes, current.id);
      selectedKeyframeId = null;
    } else {
      writeAnimatedValue(
        layer,
        property,
        evaluateProperty(
          buildKeyframeIndex(layer.keyframes),
          layer,
          audioEngine.currentTime,
          property
        ).value,
        audioEngine.currentTime,
        true
      );
    }
  }, "Attiva keyframe");
});
controls.keyframeValue.addEventListener("change", () => {
  const value = Number(controls.keyframeValue.value);
  if (!Number.isFinite(value)) return;
  const property = selectedAnimationProperty();
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    writeAnimatedValue(layer, property, value, audioEngine.currentTime, true);
  }, `Modifica keyframe ${property}`);
});
controls.keyframeInterpolation.addEventListener("change", () => {
  const property = selectedAnimationProperty();
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    const current = keyframeAt(layer, property, audioEngine.currentTime);
    if (!current) return;
    layer.keyframes = upsertKeyframe(layer.keyframes, {
      ...current,
      interpolation: controls.keyframeInterpolation
        .value as typeof current.interpolation
    });
  }, "Modifica interpolazione");
});
function navigateKeyframe(direction: -1 | 1): void {
  const layer = selectedLayer();
  if (!layer) return;
  const next = adjacentKeyframe(
    layer.keyframes,
    selectedAnimationProperty(),
    audioEngine.currentTime,
    direction
  );
  if (next) {
    selectedKeyframeId = next.id;
    audioEngine.seek(next.time);
    syncControlValues(projectState.project);
    renderTimeline(projectState.project);
  }
}
controls.keyframePrevious.addEventListener("click", () => navigateKeyframe(-1));
controls.keyframeNext.addEventListener("click", () => navigateKeyframe(1));
controls.keyframeDuplicate.addEventListener("click", () => {
  const property = selectedAnimationProperty();
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    const source =
      layer.keyframes.find((item) => item.id === selectedKeyframeId) ??
      keyframeAt(layer, property, audioEngine.currentTime);
    if (!source || typeof source.value !== "number") return;
    const time = Math.min(
      audioEngine.duration || source.time + 1 / project.canvas.fps,
      source.time + 1 / project.canvas.fps
    );
    const id = stableKeyframeId(layer);
    layer.keyframes = upsertKeyframe(layer.keyframes, { ...source, id, time });
    selectedKeyframeId = id;
  }, "Duplica keyframe");
});
bindProjectInput(controls.exportFps, (project, value) => {
  const fps = Number(value) === 60 ? 60 : 30;
  project.exportSettings.fps = fps;
  project.canvas.fps = fps;
});

controls.projectMEnabled.addEventListener("change", () => {
  const enabled = controls.projectMEnabled.checked;
  projectState.update((project) => {
    project.projectM.enabled = enabled;
    const layer = project.layers.find(
      (candidate) => candidate.kind === "projectM"
    );
    if (layer) layer.visible = enabled;
  });
  if (enabled) {
    void initializeProjectM();
  } else {
    preview.clearProjectMFrame();
    projectMLastTargetFrame = -1;
    projectMLastAudioTime = 0;
    void window.avs.projectMShutdown().finally(() => {
      if (projectMStatus) {
        projectMStatus = {
          ...projectMStatus,
          running: false,
          enabled: false,
          pid: null,
          error: ""
        };
      }
      renderProjectMStatus();
    });
  }
});

async function changePresetManual(
  direction: "previous" | "next" | "random"
): Promise<void> {
  const settings = projectState.project.projectM;
  const id = manualPresetChoice(
    settings,
    presetLibraryView.availableRecords.map((preset) => preset.id),
    direction
  );
  if (!id) {
    showToast("Nessun preset compatibile nella playlist.", true);
    return;
  }
  if (direction === "random") {
    projectState.update((project) => {
      project.projectM.manualRandomCounter += 1;
    });
  }
  await presetLibraryView.select(id, "manual");
}

controls.presetPrevious.addEventListener("click", () => {
  void changePresetManual("previous");
});
controls.presetNext.addEventListener("click", () => {
  void changePresetManual("next");
});
controls.presetRandom.addEventListener("click", () => {
  void changePresetManual("random");
});
controls.presetRestart.addEventListener("click", () => {
  void presetLibraryView.select(
    projectState.project.projectM.presetId,
    "restart",
    true
  );
});
controls.presetFavoriteCurrent.addEventListener("click", async () => {
  const settings = projectState.project.projectM;
  const favorite = !settings.favoritePresetIds.includes(settings.presetId);
  try {
    await window.avs.presetFavorite(settings.presetId, favorite);
    await presetLibraryView.initialize(settings.presetId);
  } catch (error) {
    showToast(readError(error), true);
  }
});
controls.presetLocked.addEventListener("change", async () => {
  const locked = controls.presetLocked.checked;
  projectState.update((project) => {
    project.projectM.locked = locked;
  });
  rebuildPresetSequence();
  try {
    projectMStatus = await window.avs.presetLock(locked);
    if (projectMStatus) projectMStatus.enabled = true;
    renderProjectMStatus();
  } catch (error) {
    showToast(`Blocco preset non applicato: ${readError(error)}`, true);
  }
});

function bindPresetAutomationControl(
  element: HTMLInputElement | HTMLSelectElement,
  update: (project: VisualizerProject) => void
): void {
  element.addEventListener("change", () => {
    projectState.update(update);
    rebuildPresetSequence();
  });
}

bindPresetAutomationControl(controls.presetAutoEnabled, (project) => {
  project.projectM.autoSwitch.enabled = controls.presetAutoEnabled.checked;
});
bindPresetAutomationControl(controls.presetAutoMode, (project) => {
  project.projectM.autoSwitch.mode =
    controls.presetAutoMode.value as VisualizerProject["projectM"]["autoSwitch"]["mode"];
});
bindPresetAutomationControl(controls.presetAutoOrder, (project) => {
  project.projectM.autoSwitch.order =
    controls.presetAutoOrder.value === "random" ? "random" : "sequential";
});
bindPresetAutomationControl(controls.presetNoRepeat, (project) => {
  project.projectM.autoSwitch.noImmediateRepeat = controls.presetNoRepeat.checked;
});
bindPresetAutomationControl(controls.presetTransitionEnabled, (project) => {
  project.projectM.transition.enabled = controls.presetTransitionEnabled.checked;
});

for (const element of [
  controls.presetInterval,
  controls.presetMinimum,
  controls.presetMaximum,
  controls.presetTransitionDuration,
  controls.presetRandomSeed,
  controls.particleRandomSeed
]) {
  bindPresetAutomationControl(element, (project) => {
    project.projectM.autoSwitch.intervalSeconds = Math.max(
      1,
      Number(controls.presetInterval.value) || 30
    );
    project.projectM.autoSwitch.minimumSeconds = Math.max(
      1,
      Number(controls.presetMinimum.value) || 10
    );
    project.projectM.autoSwitch.maximumSeconds = Math.max(
      project.projectM.autoSwitch.minimumSeconds,
      Number(controls.presetMaximum.value) || 120
    );
    project.projectM.transition.durationSeconds = Math.min(
      30,
      Math.max(0, Number(controls.presetTransitionDuration.value) || 0)
    );
    project.projectM.randomSeed =
      Math.max(0, Number(controls.presetRandomSeed.value) || 0) >>> 0;
    project.projectM.particleSeed =
      Math.max(0, Number(controls.particleRandomSeed.value) || 0) >>> 0;
  });
}

controls.presetAddMarker.addEventListener("click", () => {
  const time = Number(audioEngine.currentTime.toFixed(3));
  projectState.update((project) => {
    project.projectM.markers.push({
      id: `timeline-${Date.now()}-${project.projectM.markers.length}`,
      time,
      label: `Cambio ${formatTime(time)}`,
      source: "timeline",
      presetId: null
    });
    project.projectM.markers.sort((left, right) => left.time - right.time);
  });
  rebuildPresetSequence();
});
controls.presetAnalyzeMusic.addEventListener("click", () => {
  const times = audioEngine.analyzeMusicEvents();
  if (!audioEngine.hasPcm) {
    showToast("Carica un audio prima dell'analisi musicale.", true);
    return;
  }
  projectState.update((project) => {
    project.projectM.markers = [
      ...project.projectM.markers.filter((marker) => marker.source !== "music"),
      ...times.map((time, index) => ({
        id: `music-${index}-${Math.round(time * 1000)}`,
        time,
        label: `Evento musicale ${index + 1}`,
        source: "music" as const,
        presetId: null
      }))
    ].sort((left, right) => left.time - right.time);
  });
  rebuildPresetSequence();
  showToast(`${times.length} eventi musicali deterministici rilevati.`);
});

controls.simpleChooseClip.addEventListener("click", () => void chooseClip());
controls.simpleAudioSourceClip.addEventListener("change", () => {
  if (controls.simpleAudioSourceClip.checked) {
    void activateAudioSource("clip");
  }
});
controls.simpleAudioSourceExternal.addEventListener("change", () => {
  if (controls.simpleAudioSourceExternal.checked) {
    void activateAudioSource("external");
  }
});
controls.simpleClipEndMode.addEventListener("change", () => {
  projectState.update((project) => {
    project.clip.endMode = controls.simpleClipEndMode.value as ClipEndMode;
  }, "Modalità fine clip");
  preview.setClipPlayback(playing, audioEngine.currentTime);
});
controls.simpleChooseAudio.addEventListener("click", () => void chooseAudio());
controls.simpleChooseCover.addEventListener("click", () => void chooseCover());
controls.simpleRemoveCover.addEventListener("click", removeCurrentCover);
controls.simpleCoverFit.addEventListener("change", () => {
  withBackgroundMedia("Adattamento sfondo", (project, media, video) => {
    project.cover.fitMode =
      controls.simpleCoverFit.value === "fill" ||
      controls.simpleCoverFit.value === "original"
        ? controls.simpleCoverFit.value
        : "contain";
    if (video) {
      if (project.cover.fitMode === "original") {
        fitCoverToCanvas(project, media);
      } else {
        project.cover.width = 1;
        project.cover.height = 1;
        const layer = backgroundLayer(project);
        if (layer && !layer.locked) {
          layer.transform.scaleX = 1;
          layer.transform.scaleY = 1;
        }
      }
    } else {
      fitCoverToCanvas(project, media);
    }
  });
});
controls.simpleBackgroundOpacity.addEventListener("input", () => {
  const opacity = Number(controls.simpleBackgroundOpacity.value) / 100;
  projectState.update((project) => {
    project.cover.opacity = Math.max(0, Math.min(1, opacity));
  }, "Opacità sfondo");
  controls.simpleBackgroundOpacityValue.value =
    `${controls.simpleBackgroundOpacity.value}%`;
});
controls.simpleEffect.addEventListener("change", () => {
  void chooseSimpleEffect(controls.simpleEffect.value as SimpleEffectId);
});
controls.simplePresetSearch.addEventListener("input", () => {
  syncSimplePresetOptions(
    simplePresetRuntimeOverride ?? simplePresetCatalogRecords
  );
  if (simplePresetOpen) {
    positionSimplePresetListbox();
    revealSimplePresetActive();
  }
});
controls.simplePresetFilter.addEventListener("change", () => {
  syncSimplePresetOptions(
    simplePresetRuntimeOverride ?? simplePresetCatalogRecords
  );
  if (simplePresetOpen) {
    positionSimplePresetListbox();
    revealSimplePresetActive();
  }
});
controls.simplePresetFavorite.addEventListener("click", async () => {
  const preset = simpleSelectedPresetRecord();
  if (!preset) return;
  controls.simplePresetFavorite.disabled = true;
  try {
    await window.avs.presetFavorite(preset.id, !preset.favorite);
    await presetLibraryView.initialize(preset.id);
    showToast(
      preset.favorite
        ? `Rimosso dai preferiti: ${preset.name}`
        : `Aggiunto ai preferiti: ${preset.name}`
    );
  } catch (error) {
    showToast(`Preferito non aggiornato: ${readError(error)}`, true);
  } finally {
    syncSimplePresetManagement();
  }
});
controls.simplePresetDelete.addEventListener("click", async () => {
  const preset = simpleSelectedPresetRecord();
  if (!preset || preset.origin.kind === "bundled") return;
  const external =
    preset.origin.kind === "external-file" ||
    preset.origin.kind === "external-folder";
  const confirmed = confirm(
    external
      ? `Rimuovere "${preset.name}" dalla Libreria preset?\n\n` +
          "Il file esterno resterà sul disco."
      : `Eliminare "${preset.name}" dalla Libreria preset?\n\n` +
          "La copia interna verrà spostata nel cestino recuperabile."
  );
  if (!confirmed) return;
  const validBefore = simplePresetCatalogRecords
    .filter(
      (candidate) =>
        !candidate.quarantined &&
        candidate.status !== "missing" &&
        candidate.status !== "incompatible"
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, "it", { sensitivity: "base" })
    );
  const deletedIndex = Math.max(
    0,
    validBefore.findIndex((candidate) => candidate.id === preset.id)
  );
  controls.simplePresetDelete.disabled = true;
  try {
    await window.avs.presetDelete(preset.id);
    await presetLibraryView.initialize(preset.id);
    const remaining = simplePresetCatalogRecords
      .filter(
        (candidate) =>
          !candidate.quarantined &&
          candidate.status !== "missing" &&
          candidate.status !== "incompatible"
      )
      .sort((left, right) =>
        left.name.localeCompare(right.name, "it", { sensitivity: "base" })
      );
    const next =
      remaining[Math.min(deletedIndex, Math.max(0, remaining.length - 1))];
    if (next) {
      await presetLibraryView.select(next.id, "manual", true);
    } else {
      await chooseSimpleEffect("none");
    }
    showToast(
      external
        ? `Preset rimosso dalla libreria; file esterno conservato: ${preset.name}`
        : `Preset spostato nel cestino interno: ${preset.name}`
    );
  } catch (error) {
    showToast(`Preset non eliminato: ${readError(error)}`, true);
  } finally {
    syncSimplePresetManagement();
  }
});

async function importSimplePresets(
  kind: "files" | "folder" | "zip",
  mode: "copy" | "link",
  auditPaths?: string[]
): Promise<import("../shared/presets").PresetImportReport | null> {
  const buttons = [
    controls.simplePresetAdd,
    controls.simplePresetImportFolder,
    controls.simplePresetImportZip,
    controls.simplePresetLinkFolder
  ];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  controls.simplePresetRow.setAttribute("aria-busy", "true");
  try {
    const report = await presetLibraryView.importPresets(kind, mode, auditPaths);
    if (!report) return null;
    controls.simplePresetSearch.value = "";
    await presetLibraryView.initialize(projectState.project.projectM.presetId);
    const firstValid = report.imported.find(
      (preset) =>
        !preset.quarantined &&
        preset.status !== "missing" &&
        preset.status !== "incompatible"
    );
    if (firstValid) {
      await presetLibraryView.select(firstValid.id, "manual", true);
    }
    return report;
  } finally {
    controls.simplePresetRow.removeAttribute("aria-busy");
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

controls.simplePresetAdd.addEventListener("click", () => {
  void importSimplePresets("files", "copy");
});
controls.simplePresetImportFolder.addEventListener("click", () => {
  void importSimplePresets("folder", "copy");
});
controls.simplePresetImportZip.addEventListener("click", () => {
  void importSimplePresets("zip", "copy");
});
controls.simplePresetLinkFolder.addEventListener("click", () => {
  void importSimplePresets("folder", "link");
});
controls.simplePresetButton.addEventListener("click", () => {
  if (simplePresetOpen) closeSimplePresetListbox();
  else openSimplePresetListbox();
});
const handleSimplePresetKey = (event: KeyboardEvent) => {
  const navigation = [
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown"
  ];
  if (navigation.includes(event.key)) {
    event.preventDefault();
    if (!simplePresetOpen) openSimplePresetListbox();
    moveSimplePresetActive(event.key);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (simplePresetOpen) chooseSimplePresetOption(simplePresetActiveIndex);
    else openSimplePresetListbox();
    return;
  }
  if (event.key === "Escape" && simplePresetOpen) {
    event.preventDefault();
    closeSimplePresetListbox(true);
  }
};
controls.simplePresetButton.addEventListener("keydown", handleSimplePresetKey);
controls.simplePresetListbox.addEventListener("keydown", handleSimplePresetKey);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !simplePresetOpen) return;
  event.preventDefault();
  closeSimplePresetListbox(true);
});
controls.simplePresetListbox.addEventListener("click", (event) => {
  const option = (event.target as HTMLElement).closest<HTMLElement>(
    ".simple-preset-option"
  );
  if (!option) return;
  const index = simplePresetOptions().indexOf(option);
  if (index >= 0) chooseSimplePresetOption(index);
});
document.addEventListener("pointerdown", (event) => {
  if (
    simplePresetOpen &&
    !controls.simplePresetButton.contains(event.target as Node) &&
    !controls.simplePresetListbox.contains(event.target as Node)
  ) {
    closeSimplePresetListbox();
  }
});
window.addEventListener("resize", positionSimplePresetListbox);
window.addEventListener("scroll", positionSimplePresetListbox, true);
controls.simplePreset.addEventListener("change", async () => {
  if (activeSimpleEffect() !== "projectM" || !controls.simplePreset.value) return;
  syncSimplePresetSelection(controls.simplePreset.value);
  const loaded = await presetLibraryView.select(
    controls.simplePreset.value,
    "manual",
    true
  );
  if (!loaded) {
    controls.simpleEffectError.textContent =
      "Il Preset MilkDrop selezionato non può essere caricato.";
    controls.simpleEffectError.classList.remove("hidden");
  }
});
controls.simpleIntensity.addEventListener("input", () => {
  projectState.beginTransaction("Intensità effetto");
  const intensity = Number(controls.simpleIntensity.value) / 100;
  projectState.update((project) => {
    const effect = activeSimpleEffect(project);
    const layer = project.layers.find((candidate) =>
      effect === "projectM"
        ? candidate.kind === "projectM" && candidate.visible
        : candidate.kind === "visualizer" &&
          candidate.visible &&
          (candidate.plugin?.id || candidate.pluginId) === effect
    );
    if (!layer || effect === "none") return;
    layer.reactive ??= {
      band: "volume",
      sensitivity: 1,
      smoothing: 0.72,
      intensity,
      color: "#8b5cf6"
    };
    layer.reactive.intensity = intensity;
    if (layer.kind === "visualizer") {
      updatePluginSetting(layer, "intensity", intensity);
    }
  }, "Intensità effetto");
});
controls.simpleIntensity.addEventListener("change", () =>
  projectState.commitTransaction()
);
controls.simpleIntensity.addEventListener("blur", () =>
  projectState.commitTransaction()
);
bindSimpleValue(
  controls.simpleEffectOpacity,
  "Opacità effetto",
  (project, value) => {
    const layer = activeSimpleEffectLayer(project);
    if (layer) layer.opacity = Math.max(0, Math.min(1, value / 100));
  }
);

function updateSimpleEffectTransform(
  label: string,
  update: (layer: ProjectLayer) => void
): void {
  const current = activeSimpleEffectLayer();
  if (!current || current.locked) return;
  projectState.update((project) => {
    const layer = activeSimpleEffectLayer(project);
    if (layer && !layer.locked) update(layer);
    applySimpleLayerOrder(project);
  }, label);
  const layer = activeSimpleEffectLayer();
  if (layer) selectLayer(layer.id);
}

controls.simpleEffectCenter.addEventListener("click", () => {
  updateSimpleEffectTransform("Centra effetto", (layer) => {
    layer.transform.x = 0.5;
    layer.transform.y = 0.5;
  });
});
controls.simpleEffectFit.addEventListener("click", () => {
  updateSimpleEffectTransform("Adatta effetto", (layer) => {
    layer.transform.scaleX = 1;
    layer.transform.scaleY = 1;
  });
});
controls.simpleEffectReset.addEventListener("click", () => {
  updateSimpleEffectTransform("Ripristina effetto", (layer) => {
    layer.transform = {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    layer.opacity = 1;
    layer.reactive ??= {
      band: "volume",
      sensitivity: 1,
      smoothing: 0.72,
      intensity: 1,
      color: "#8b5cf6"
    };
    layer.reactive.intensity = 1;
    if (layer.kind === "visualizer") {
      updatePluginSetting(layer, "intensity", 1);
    }
  });
});
controls.simpleEffectRemove.addEventListener("click", () => {
  void chooseSimpleEffect("none");
});

for (const [format, button] of projectFormatButtons()) {
  button.addEventListener("click", () => applyProjectFormat(format));
}
controls.previewZoomFit.addEventListener("click", () => {
  setPreviewZoom(PREVIEW_FIT_ZOOM, "fit");
});
controls.previewZoom100.addEventListener("click", () => {
  setPreviewZoom(1, "manual");
});
controls.previewZoomOut.addEventListener("click", () => {
  setPreviewZoom(previewZoom - 0.1, "manual");
});
controls.previewZoomIn.addEventListener("click", () => {
  setPreviewZoom(previewZoom + 0.1, "manual");
});
controls.simpleLayerSelectionLock.addEventListener("change", () => {
  preview.setSelectionLocked(controls.simpleLayerSelectionLock.checked);
  previewCanvas.focus();
});
controls.simpleStageGuides.addEventListener("change", () => {
  preview.setEditorGuidesVisible(controls.simpleStageGuides.checked);
});
preview.setSelectionLocked(controls.simpleLayerSelectionLock.checked);
preview.setEditorGuidesVisible(controls.simpleStageGuides.checked);
const stageResizeObserver = new ResizeObserver(() => syncStageLayout());
stageResizeObserver.observe(controls.stageViewport);

for (const [button, kind] of [
  [controls.simpleLayerBackground, "background"],
  [controls.simpleLayerEffect, "effect"],
  [controls.simpleLayerTitle, "titleText"],
  [controls.simpleLayerArtist, "artistText"]
] as const) {
  button.addEventListener("click", () => {
    const layer = simpleLayerByKind(kind);
    if (!layer || !simpleLayerAvailable(kind, projectState.project)) return;
    selectLayer(layer.id);
    previewCanvas.focus();
  });
}

function updateActiveSimpleLayerTransform(
  label: string,
  clearedProperties: readonly AnimatableProperty[],
  update: (layer: ProjectLayer) => void
): void {
  const current = selectedLayer();
  if (
    !current ||
    current.locked ||
    !["cover", "visualizer", "projectM", "titleText", "artistText"].includes(
      current.kind
    )
  ) {
    return;
  }
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (!layer || layer.locked) return;
    update(layer);
    layer.keyframes = layer.keyframes.filter(
      (keyframe) =>
        !clearedProperties.includes(keyframe.property as AnimatableProperty)
    );
  }, label);
  selectLayer(current.id);
  previewCanvas.focus();
}

controls.simpleLayerCenter.addEventListener("click", () => {
  const layer = selectedLayer();
  if (layer?.kind === "cover") {
    centerCurrentCover();
    previewCanvas.focus();
    return;
  }
  updateActiveSimpleLayerTransform(
    "Centra layer selezionato",
    ["x", "y"],
    (target) => {
      target.transform.x = 0.5;
      target.transform.y = 0.5;
    }
  );
});

controls.simpleLayerFit.addEventListener("click", () => {
  const layer = selectedLayer();
  if (layer?.kind === "cover") {
    adaptCurrentCover();
    previewCanvas.focus();
    return;
  }
  updateActiveSimpleLayerTransform(
    "Adatta layer selezionato",
    ["scale"],
    (target) => {
      target.transform.scaleX = 1;
      target.transform.scaleY = 1;
    }
  );
});

controls.simpleLayerReset.addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  if (layer.kind === "cover") {
    resetCurrentCover();
    previewCanvas.focus();
    return;
  }
  updateActiveSimpleLayerTransform(
    "Ripristina layer selezionato",
    ["x", "y", "scale", "rotation"],
    (target) => {
      const position =
        target.kind === "titleText"
          ? { x: 0.5, y: 0.625 }
          : target.kind === "artistText"
            ? { x: 0.5, y: 0.57 }
            : { x: 0.5, y: 0.5 };
      target.transform = {
        ...position,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      };
    }
  );
});
controls.simpleSeek.addEventListener("input", () => {
  audioEngine.seek(Number(controls.simpleSeek.value));
  preview.setClipPlayback(playing, audioEngine.currentTime);
  projectMResetRequested = true;
});

function simpleExportDimensions(): {
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
} {
  const ratio = controls.simpleExportRatio.value as ProjectFormat;
  const definition = PROJECT_FORMATS[ratio] ?? PROJECT_FORMATS["9:16"];
  const resolution =
    controls.simpleExportResolution.value === "720"
      ? definition.hd
      : definition.fullHd;
  return {
    width: resolution.width,
    height: resolution.height,
    previewWidth: definition.preview.width,
    previewHeight: definition.preview.height
  };
}

function syncSimpleExportChoice(): void {
  const dimensions = simpleExportDimensions();
  controls.simpleExportChoice.textContent =
    `Output: ${dimensions.width} × ${dimensions.height}`;
}

controls.simpleExportRatio.addEventListener("change", syncSimpleExportChoice);
controls.simpleExportResolution.addEventListener(
  "change",
  syncSimpleExportChoice
);
controls.simpleExportVideo.addEventListener("click", () => {
  if (!projectState.project.audioFile || !audioEngine.hasPcm) {
    showToast("Carica prima un brano", true);
    return;
  }
  controls.simpleExportRatio.value = inferProjectFormat(projectState.project);
  syncSimpleExportChoice();
  controls.simpleExportConfig.classList.remove("hidden");
});
controls.simpleExportCancel.addEventListener("click", () => {
  controls.simpleExportConfig.classList.add("hidden");
});
controls.simpleExportConfirm.addEventListener("click", () => {
  const ratio = controls.simpleExportRatio.value as ProjectFormat;
  applyProjectFormat(ratio);
  projectState.update((project) => {
    project.canvas.fps = 30;
    project.exportSettings.fps = 30;
    project.projectM.fps = 30;
  }, `Formato export ${ratio}`);
  controls.simpleExportConfig.classList.add("hidden");
  void exportVideo();
});

requiredElement<HTMLButtonElement>("#choose-audio").addEventListener("click", chooseAudio);
requiredElement<HTMLButtonElement>("#choose-cover").addEventListener("click", chooseCover);
requiredElement<HTMLButtonElement>("#play-pause").addEventListener("click", togglePlayback);
requiredElement<HTMLButtonElement>("#stop").addEventListener("click", stopPlayback);
requiredElement<HTMLButtonElement>("#to-start").addEventListener("click", () => {
  audioEngine.seek(0);
  preview.setClipPlayback(playing, 0);
});
requiredElement<HTMLButtonElement>("#new-project").addEventListener("click", newProject);
requiredElement<HTMLButtonElement>("#open-project").addEventListener("click", openProject);
requiredElement<HTMLButtonElement>("#save-project").addEventListener("click", saveProject);
requiredElement<HTMLButtonElement>("#export-video").addEventListener("click", exportVideo);
controls.layerUp.addEventListener("click", () => moveSelectedLayer(1));
controls.layerDown.addEventListener("click", () => moveSelectedLayer(-1));
controls.layerAdd.addEventListener("click", addVisualizerLayer);
controls.layerDuplicate.addEventListener("click", duplicateSelectedLayer);
controls.layerDelete.addEventListener("click", deleteSelectedLayer);
bindHistoryController(projectState, controls, (message) => showToast(message));
controls.layersList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-layer-id]");
  if (!item) return;
  const layerId = item.dataset.layerId;
  if (!layerId) return;
  if (target.closest("[data-action='visibility']")) {
    selectedLayerId = layerId;
    updateSelectedLayer((layer) => { layer.visible = !layer.visible; });
    return;
  }
  if (target.closest("[data-action='lock']")) {
    selectedLayerId = layerId;
    updateSelectedLayer((layer) => { layer.locked = !layer.locked; });
    return;
  }
  selectLayer(layerId);
});
controls.cancelExport.addEventListener("click", async () => {
  controls.cancelExport.disabled = true;
  const cancelled = await window.avs.cancelExport();
  if (cancelled) {
    window.clearInterval(exportElapsedTimer);
    exportElapsedTimer = 0;
    controls.exportModal.classList.add("hidden");
    showToast("Esportazione annullata");
  }
});
controls.timelineZoom.addEventListener("input", () => {
  timelineZoom = Number(controls.timelineZoom.value) || 1;
  timelineScrollTime = normalizeViewport({
    ...timelineViewport(),
    zoom: timelineZoom
  }).scrollTime;
  renderTimeline(projectState.project);
  drawWaveform();
});
controls.timelineScroll.addEventListener("input", () => {
  timelineScrollTime = Number(controls.timelineScroll.value) || 0;
  renderTimeline(projectState.project);
  drawWaveform();
});
controls.timelineSnapping.addEventListener("change", () => {
  timelineSnappingEnabled = controls.timelineSnapping.checked;
});

waveformCanvas.addEventListener("pointerdown", (event) => {
  if (!audioEngine.duration) return;
  const rect = waveformCanvas.getBoundingClientRect();
  audioEngine.seek(
    pixelToTime(
      ((event.clientX - rect.left) / rect.width) * waveformCanvas.width,
      { ...timelineViewport(), width: waveformCanvas.width }
    )
  );
  preview.setClipPlayback(playing, audioEngine.currentTime);
});

audioEngine.element.addEventListener("ended", () => {
  playing = false;
  preview.setClipPlayback(false, audioEngine.currentTime);
  controls.playPause.textContent = "Play";
  controls.playPause.setAttribute("aria-label", "Riproduci");
  controls.simplePlayHint.textContent = "Riproduzione completata";
});

window.addEventListener("keydown", (event) => {
  const control = event.ctrlKey || event.metaKey;
  const editing =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable);
  const key = event.key.toLowerCase();
  if (!editing && (event.key === "Delete" || event.key === "Backspace")) {
    const kind = selectedLayer()?.kind;
    if (kind === "cover" && hasBackgroundMedia(projectState.project)) {
      event.preventDefault();
      removeCurrentCover();
    } else if (kind === "visualizer" || kind === "projectM") {
      event.preventDefault();
      void chooseSimpleEffect("none");
    }
  } else if (event.code === "Space" && !editing) {
    event.preventDefault();
    void togglePlayback();
  } else if (control && key === "s") {
    event.preventDefault();
    void saveProject();
  } else if (control && key === "o") {
    event.preventDefault();
    void openProject();
  } else if (control && key === "n") {
    event.preventDefault();
    newProject();
  } else if (event.key === "Home") {
    audioEngine.seek(0);
    preview.setClipPlayback(playing, 0);
  }
});

window.avs.onExportProgress(handleExportProgress);

const simpleControlsWithHandlers: HTMLElement[] = [
  controls.projectFormat916,
  controls.projectFormat11,
  controls.projectFormat43,
  controls.projectFormat169,
  controls.previewZoomFit,
  controls.previewZoom100,
  controls.previewZoomOut,
  controls.previewZoomIn,
  controls.simpleChooseCover,
  controls.simpleCoverFit,
  controls.simpleBackgroundOpacity,
  controls.simpleRemoveCover,
  controls.simpleChooseClip,
  controls.simpleAudioSourceClip,
  controls.simpleAudioSourceExternal,
  controls.simpleChooseAudio,
  controls.simpleClipEndMode,
  controls.simpleTitle,
  controls.simpleTitleSize,
  controls.simpleTitleColor,
  controls.simpleTitleOpacity,
  controls.simpleArtist,
  controls.simpleArtistSize,
  controls.simpleArtistColor,
  controls.simpleArtistOpacity,
  controls.simpleEffect,
  controls.simplePresetButton,
  controls.simplePresetListbox,
  controls.simplePresetSearch,
  controls.simplePresetFilter,
  controls.simplePresetFavorite,
  controls.simplePresetDelete,
  controls.simplePresetAdd,
  controls.simplePresetImportFolder,
  controls.simplePresetImportZip,
  controls.simplePresetLinkFolder,
  controls.simpleIntensity,
  controls.simpleEffectOpacity,
  controls.simpleEffectCenter,
  controls.simpleEffectFit,
  controls.simpleEffectReset,
  controls.simpleEffectRemove,
  controls.simpleLayerBackground,
  controls.simpleLayerEffect,
  controls.simpleLayerTitle,
  controls.simpleLayerArtist,
  controls.simpleLayerCenter,
  controls.simpleLayerFit,
  controls.simpleLayerReset,
  controls.simpleLayerSelectionLock,
  controls.simpleStageGuides,
  controls.playPause,
  controls.stop,
  controls.simpleSeek,
  controls.simpleExportVideo,
  controls.simpleExportRatio,
  controls.simpleExportResolution,
  controls.simpleExportCancel,
  controls.simpleExportConfirm,
  previewCanvas,
  waveformCanvas
];
for (const control of simpleControlsWithHandlers) {
  control.dataset.simpleControl = "true";
  control.dataset.handler = "connected";
}

function selectedLayer(project = projectState.project): ProjectLayer | undefined {
  return project.layers.find((layer) => layer.id === selectedLayerId);
}

function selectLayer(layerId: string): void {
  if (!layerId) {
    selectedLayerId = "";
    preview.selectLayer("");
    syncControlValues(projectState.project);
    return;
  }
  if (!projectState.project.layers.some((layer) => layer.id === layerId)) return;
  selectedLayerId = layerId;
  preview.selectLayer(layerId);
  syncControlValues(projectState.project);
  renderLayers(projectState.project);
  renderTimeline(projectState.project);
}

function updateSelectedLayer(
  update: (layer: ProjectLayer) => void,
  allowLocked = false
): void {
  projectState.update((project) => {
    const layer = selectedLayer(project);
    if (layer && (allowLocked || !layer.locked)) update(layer);
  });
}

function moveSelectedLayer(offset: -1 | 1): void {
  projectState.update((project) => {
    const index = project.layers.findIndex((layer) => layer.id === selectedLayerId);
    if (index < 0) return;
    if (project.layers[index]?.locked) return;
    const nextIndex = Math.max(0, Math.min(project.layers.length - 1, index + offset));
    if (nextIndex === index) return;
    const [layer] = project.layers.splice(index, 1);
    if (layer) project.layers.splice(nextIndex, 0, layer);
  });
}

function duplicateSelectedLayer(): void {
  const source = selectedLayer();
  if (!source || source.kind !== "visualizer" || source.locked) return;
  const duplicate = structuredClone(source);
  duplicate.id = `${source.id}-${crypto.randomUUID()}`;
  duplicate.name = `${source.name} copia`;
  selectedLayerId = duplicate.id;
  preview.selectLayer(duplicate.id);
  projectState.update((project) => {
    const index = project.layers.findIndex((layer) => layer.id === source.id);
    project.layers.splice(index + 1, 0, duplicate);
  }, "Duplica plugin Canvas");
  queueMicrotask(() => controls.layerName.focus());
}

function addVisualizerLayer(): void {
  const descriptor = pluginRegistry.get(controls.pluginAddSelect.value);
  if (!descriptor) return;
  const settings = structuredClone(descriptor.defaultSettings);
  const reactive: ReactiveSettings = {
    band:
      settings.band === "bass" ||
      settings.band === "mid" ||
      settings.band === "high"
        ? settings.band
        : "volume",
    sensitivity:
      typeof settings.sensitivity === "number" ? settings.sensitivity : 1,
    smoothing: typeof settings.smoothing === "number" ? settings.smoothing : 0.72,
    intensity: typeof settings.intensity === "number" ? settings.intensity : 1,
    color: typeof settings.color === "string" ? settings.color : "#8b5cf6"
  };
  const added: ProjectLayer = {
    id: `visualizer-${descriptor.id}-${crypto.randomUUID()}`,
    name: descriptor.displayName,
    kind: "visualizer",
    pluginId: descriptor.id as VisualizerPluginId,
    plugin: {
      id: descriptor.id,
      version: descriptor.version,
      settings
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "screen",
    startTime: 0,
    endTime: null,
    reactive,
    transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
    keyframes: []
  };
  selectedLayerId = added.id;
  preview.selectLayer(added.id);
  projectState.update((project) => {
    let lastVisualizer = -1;
    project.layers.forEach((layer, index) => {
      if (layer.kind === "visualizer") lastVisualizer = index;
    });
    project.layers.splice(lastVisualizer + 1, 0, added);
  }, `Aggiungi ${descriptor.displayName}`);
  queueMicrotask(() => controls.layerName.focus());
}

function deleteSelectedLayer(): void {
  const source = selectedLayer();
  if (!source || source.kind !== "visualizer" || source.locked) return;
  projectState.update((project) => {
    const index = project.layers.findIndex((layer) => layer.id === source.id);
    if (index < 0) return;
    project.layers.splice(index, 1);
    selectedLayerId =
      project.layers[Math.min(index, project.layers.length - 1)]?.id ?? "";
  }, "Elimina visualizzatore");
  preview.selectLayer(selectedLayerId);
  queueMicrotask(() => {
    controls.layersList
      .querySelector<HTMLButtonElement>(`[data-layer-id="${CSS.escape(selectedLayerId)}"]`)
      ?.focus();
  });
}

function renderLayers(project: VisualizerProject): void {
  controls.layerCount.textContent = String(project.layers.length);
  controls.layersList.replaceChildren();
  const iconFor = (layer: ProjectLayer) => {
    if (layer.kind === "projectM") return "M";
    if (layer.kind === "visualizer") return "✦";
    if (layer.kind === "cover") return "▧";
    return "T";
  };

  for (const layer of [...project.layers].reverse()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `layer-item${layer.id === selectedLayerId ? " selected" : ""}`;
    item.dataset.layerId = layer.id;

    const visibility = document.createElement("span");
    visibility.className = `layer-toggle${layer.visible ? " active" : ""}`;
    visibility.dataset.action = "visibility";
    visibility.textContent = layer.visible ? "●" : "○";
    visibility.title = layer.visible ? "Nascondi livello" : "Mostra livello";

    const icon = document.createElement("span");
    icon.className = "layer-icon";
    icon.textContent = iconFor(layer);

    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = layer.name;

    const lock = document.createElement("span");
    lock.className = `layer-lock${layer.locked ? " active" : ""}`;
    lock.dataset.action = "lock";
    lock.textContent = layer.locked ? "◆" : "◇";
    lock.title = layer.locked ? "Sblocca livello" : "Blocca livello";

    item.append(visibility, icon, name, lock);
    controls.layersList.append(item);
  }
}

function timelineViewport(): TimelineViewport {
  return normalizeViewport({
    duration: Math.max(0.001, audioEngine.duration || 1),
    width: Math.max(1, waveformCanvas.clientWidth || waveformCanvas.width),
    zoom: timelineZoom,
    scrollTime: timelineScrollTime
  });
}

function timelineTargets(project: VisualizerProject, layer: ProjectLayer) {
  return [
    {
      time: frameTime(audioEngine.currentTime, project.canvas.fps),
      kind: "frame" as const
    },
    { time: layer.startTime, kind: "clip" as const },
    {
      time: layer.endTime ?? audioEngine.duration,
      kind: "clip" as const
    },
    ...project.projectM.markers.map((marker) => ({
      time: marker.time,
      kind: "marker" as const
    }))
  ];
}

function beginTimelineGesture(
  label: string,
  move: (event: PointerEvent) => void,
  finish?: () => void
): void {
  projectState.beginTransaction(label);
  let done = false;
  const cleanup = (commit: boolean) => {
    if (done) return;
    done = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey);
    if (commit) {
      finish?.();
      projectState.commitTransaction();
    } else {
      projectState.cancelTransaction();
    }
  };
  const onMove = (event: PointerEvent) => move(event);
  const onUp = () => cleanup(true);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") cleanup(false);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  window.addEventListener("keydown", onKey);
}

function renderTimeline(project: VisualizerProject): void {
  controls.layerTracks.replaceChildren();
  const viewport = timelineViewport();
  const duration = viewport.duration;
  const scrollMaximum = Math.max(0, duration - duration / viewport.zoom);
  timelineScrollTime = Math.min(timelineScrollTime, scrollMaximum);
  controls.timelineScroll.max = String(scrollMaximum);
  controls.timelineScroll.value = String(timelineScrollTime);
  for (const layer of [...project.layers].reverse()) {
    const row = document.createElement("div");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Livello ${layer.name}`);
    row.className = `timeline-layer${layer.id === selectedLayerId ? " selected" : ""}`;
    row.addEventListener("click", (event) => {
      if (!(event.target as HTMLElement).closest("[data-timeline-control]")) {
        selectLayer(layer.id);
      }
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") selectLayer(layer.id);
    });

    const name = document.createElement("span");
    name.className = "timeline-layer-name";
    name.textContent =
      layer.id === selectedLayerId
        ? `${layer.name} · ${selectedAnimationProperty()}`
        : layer.name;

    const lane = document.createElement("span");
    lane.className = "timeline-lane";
    const clip = document.createElement("span");
    clip.className = `timeline-clip${layer.visible ? "" : " muted-clip"}`;
    const start = Math.min(duration, Math.max(0, layer.startTime));
    const end = Math.min(duration, Math.max(start, layer.endTime ?? duration));
    clip.style.left = `${timeToPixel(start, viewport)}px`;
    clip.style.width = `${Math.max(
      2,
      timeToPixel(end, viewport) - timeToPixel(start, viewport)
    )}px`;
    clip.title = `${formatTime(start)} – ${formatTime(end)}`;
    for (const edge of ["start", "end"] as const) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `timeline-clip-handle ${edge}`;
      handle.dataset.timelineControl = edge;
      handle.setAttribute(
        "aria-label",
        `${edge === "start" ? "Inizio" : "Fine"} clip ${layer.name}`
      );
      handle.addEventListener("pointerdown", (downEvent) => {
        if (layer.locked) return;
        downEvent.preventDefault();
        beginTimelineGesture("Ridimensiona clip", (moveEvent) => {
          const rect = lane.getBoundingClientRect();
          let time = pixelToTime(moveEvent.clientX - rect.left, timelineViewport());
          time = snapTimelineTime(
            time,
            timelineViewport(),
            timelineTargets(projectState.project, layer),
            8,
            timelineSnappingEnabled && !moveEvent.altKey
          ).time;
          projectState.update((draft) => {
            const target = draft.layers.find((item) => item.id === layer.id);
            if (!target) return;
            const currentEnd = target.endTime ?? duration;
            const clipped =
              edge === "start"
                ? clampClip(time, currentEnd, duration)
                : clampClip(target.startTime, time, duration);
            target.startTime = clipped.start;
            target.endTime = clipped.end >= duration ? null : clipped.end;
          }, "Ridimensiona clip");
        });
      });
      clip.append(handle);
    }
    lane.append(clip);

    if (layer.id === selectedLayerId) {
      const property = selectedAnimationProperty();
      const track = layer.keyframes.filter(
        (keyframe) => keyframe.property === property
      );
      for (const keyframe of track) {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className =
          `timeline-keyframe${keyframe.id === selectedKeyframeId ? " selected" : ""}`;
        marker.dataset.timelineControl = "keyframe";
        marker.style.left = `${timeToPixel(keyframe.time, viewport)}px`;
        marker.setAttribute(
          "aria-label",
          `${property}, ${formatTime(keyframe.time)}, valore ${keyframe.value}`
        );
        marker.title = `${property} · ${formatTime(keyframe.time)} · ${keyframe.value}`;
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          selectedKeyframeId = keyframe.id;
          audioEngine.seek(keyframe.time);
          syncControlValues(projectState.project);
          renderTimeline(projectState.project);
        });
        marker.addEventListener("pointerdown", (downEvent) => {
          if (layer.locked) return;
          downEvent.stopPropagation();
          downEvent.preventDefault();
          selectedKeyframeId = keyframe.id;
          beginTimelineGesture(
            "Sposta keyframe",
            (moveEvent) => {
              const rect = lane.getBoundingClientRect();
              let time = pixelToTime(
                moveEvent.clientX - rect.left,
                timelineViewport()
              );
              time = snapTimelineTime(
                time,
                timelineViewport(),
                timelineTargets(projectState.project, layer),
                8,
                timelineSnappingEnabled && !moveEvent.altKey
              ).time;
              time = Math.min(end, Math.max(start, time));
              projectState.update((draft) => {
                const target = draft.layers.find((item) => item.id === layer.id);
                const source = target?.keyframes.find(
                  (item) => item.id === keyframe.id
                );
                if (!target || !source) return;
                target.keyframes = upsertKeyframe(target.keyframes, {
                  ...source,
                  time
                });
              }, "Sposta keyframe");
            },
            () => {
              const moved = projectState.project.layers
                .find((item) => item.id === layer.id)
                ?.keyframes.find((item) => item.id === keyframe.id);
              if (moved) audioEngine.seek(moved.time);
            }
          );
        });
        marker.addEventListener("keydown", (event) => {
          if (layer.locked) return;
          if (event.key === "Delete" || event.key === "Backspace") {
            projectState.update((draft) => {
              const target = draft.layers.find((item) => item.id === layer.id);
              if (target) {
                target.keyframes = removeKeyframe(target.keyframes, keyframe.id);
              }
            }, "Elimina keyframe");
            selectedKeyframeId = null;
            event.preventDefault();
          } else if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight"
          ) {
            const delta =
              (event.key === "ArrowLeft" ? -1 : 1) / project.canvas.fps;
            projectState.update((draft) => {
              const target = draft.layers.find((item) => item.id === layer.id);
              const source = target?.keyframes.find(
                (item) => item.id === keyframe.id
              );
              if (!target || !source) return;
              target.keyframes = upsertKeyframe(target.keyframes, {
                ...source,
                time: Math.min(end, Math.max(start, source.time + delta))
              });
            }, "Sposta keyframe di un frame");
            event.preventDefault();
          }
        });
        lane.append(marker);
      }
    }
    row.append(name, lane);
    controls.layerTracks.append(row);
  }
}

function setSimpleAudioError(message = ""): void {
  controls.simpleAudioError.textContent = message;
  controls.simpleAudioError.classList.toggle("hidden", !message);
}

function audioSourceDuration(
  project: VisualizerProject,
  source: AudioSourceMode
): number {
  return source === "clip"
    ? project.clip.audioDurationSeconds || project.clip.durationSeconds
    : project.externalAudioDurationSeconds;
}

function audioSourcePath(
  project: VisualizerProject,
  source: AudioSourceMode
): string | null {
  return source === "clip" ? project.clip.filePath : project.externalAudioFile;
}

function videoCodecLabel(codec: string): string {
  const normalized = codec.toLowerCase();
  if (normalized === "h264") return "H.264";
  if (normalized === "hevc" || normalized === "h265") return "H.265/HEVC";
  if (normalized === "vp8") return "VP8";
  if (normalized === "vp9") return "VP9";
  if (normalized === "av1") return "AV1";
  return codec ? codec.toUpperCase() : "codec sconosciuto";
}

function clipTechnicalSummary(
  clip: Pick<
    VisualizerProject["clip"],
    "container" | "videoCodec" | "width" | "height" | "frameRate"
  >
): string {
  return [
    clip.container || "VIDEO",
    videoCodecLabel(clip.videoCodec),
    `${clip.width}×${clip.height}`,
    clip.frameRate > 0 ? `${clip.frameRate.toFixed(2).replace(/\.00$/, "")} FPS` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

function significantDurationChange(
  previousSeconds: number,
  nextSeconds: number
): boolean {
  if (previousSeconds <= 0 || nextSeconds <= 0) return false;
  return (
    Math.abs(previousSeconds - nextSeconds) >=
    Math.max(2, previousSeconds * 0.1)
  );
}

async function loadAudio(
  path: string,
  name: string,
  source: AudioSourceMode = "external",
  providedMedia?: MediaPayload
): Promise<void> {
  showToast(
    source === "clip"
      ? "Caricamento audio della clip…"
      : "Analisi audio esterno in corso…"
  );
  try {
    const media =
      providedMedia ??
      (source === "clip"
        ? await window.avs.readClipAudio(path)
        : await window.avs.readMedia(path));
    await audioEngine.load(media.bytes, media.mimeType);
    projectMResetRequested = true;
    projectMLastTargetFrame = -1;
    projectMLastAudioTime = 0;
    const sourceName = source === "clip" ? "Audio della clip" : name;
    controls.audioName.textContent = sourceName;
    controls.audioDuration.textContent =
      `${formatTime(audioEngine.duration)} · waveform pronta`;
    controls.simpleAudioName.textContent = sourceName;
    controls.simpleAudioDuration.textContent = formatTime(audioEngine.duration);
    controls.simpleAudioFile.classList.remove("hidden");
    controls.totalTime.textContent = formatTime(audioEngine.duration);
    controls.simpleSeek.max = String(audioEngine.duration);
    controls.simpleSeek.value = "0";
    controls.audioFile.classList.remove("hidden");
    controls.timelineHint.textContent =
      `${audioEngine.waveformData.length} campioni della sorgente attiva`;
    setSimpleAudioError();
    rebuildPresetSequence();
    drawWaveform();
    showToast(
      source === "clip"
        ? "Audio della clip caricato"
        : "Audio esterno caricato e analizzato"
    );
  } catch (error) {
    setSimpleAudioError(readError(error));
    showToast(readError(error), true);
    throw error;
  }
}

function clearActiveAudioUi(): void {
  audioEngine.clear();
  playing = false;
  controls.playPause.textContent = "Play";
  controls.simpleAudioFile.classList.add("hidden");
  controls.simpleAudioName.textContent = "";
  controls.simpleAudioDuration.textContent = "";
  controls.audioFile.classList.add("hidden");
  controls.totalTime.textContent = "00:00.000";
  controls.simpleSeek.max = "0";
  controls.simpleSeek.value = "0";
  controls.timelineHint.textContent =
    "La waveform apparirà per la sorgente audio attiva";
  preview.setClipPlayback(false, 0);
  rebuildPresetSequence();
  drawWaveform();
}

async function activateAudioSource(
  source: AudioSourceMode,
  confirmDuration = true
): Promise<boolean> {
  const project = projectState.project;
  if (source === "clip" && (!project.clip.filePath || !project.clip.hasAudio)) {
    const message = project.clip.filePath
      ? "La clip non contiene una traccia audio"
      : "Scegli prima una clip";
    setSimpleAudioError(message);
    syncControlValues(project);
    showToast(message, true);
    return false;
  }

  const path = audioSourcePath(project, source);
  const previousDuration = audioEngine.duration;
  const nextDuration = audioSourceDuration(project, source);
  if (
    confirmDuration &&
    significantDurationChange(previousDuration, nextDuration) &&
    !window.confirm(
      `La durata del progetto cambierà da ${formatTime(previousDuration)} ` +
        `a ${formatTime(nextDuration)}. Continuare?`
    )
  ) {
    syncControlValues(project);
    return false;
  }

  stopPlayback();
  projectState.update((draft) => {
    draft.audioSource = source;
    synchronizeSelectedAudio(draft);
  }, source === "clip" ? "Usa audio della clip" : "Usa audio esterno");

  if (!path) {
    clearActiveAudioUi();
    setSimpleAudioError("Scegli un file audio esterno");
    syncControlValues(projectState.project);
    return true;
  }

  const name =
    source === "clip"
      ? "Audio della clip"
      : path.split(/[\\/]/).pop() ?? "Audio esterno";
  try {
    await loadAudio(path, name, source);
    projectState.update((draft) => {
      if (source === "external") {
        draft.externalAudioDurationSeconds = audioEngine.duration;
      } else {
        draft.clip.audioDurationSeconds = audioEngine.duration;
      }
      synchronizeSelectedAudio(draft);
    }, "Aggiorna durata audio");
    preview.setClipPlayback(false, 0);
    return true;
  } catch {
    clearActiveAudioUi();
    syncControlValues(projectState.project);
    return false;
  }
}

async function chooseAudio(): Promise<void> {
  const selection = await window.avs.chooseAudio();
  if (!selection) return;
  let media: MediaPayload;
  let candidateDuration = 0;
  try {
    media = await window.avs.readMedia(selection.path);
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(
        media.bytes.slice().buffer as ArrayBuffer
      );
      candidateDuration = buffer.duration;
    } finally {
      await context.close();
    }
  } catch (error) {
    setSimpleAudioError(readError(error));
    showToast(`Audio non valido: ${readError(error)}`, true);
    return;
  }
  if (
    significantDurationChange(audioEngine.duration, candidateDuration) &&
    !window.confirm(
      `La durata del progetto cambierà da ${formatTime(audioEngine.duration)} ` +
        `a ${formatTime(candidateDuration)}. Continuare?`
    )
  ) {
    return;
  }
  stopPlayback();
  projectState.update((project) => {
    project.externalAudioFile = selection.path;
    project.externalAudioDurationSeconds = candidateDuration;
    project.audioSource = "external";
    synchronizeSelectedAudio(project);
    if (project.name === "Progetto senza titolo") {
      project.name = selection.name.replace(/\.[^.]+$/, "");
    }
  }, "Scegli audio esterno");
  try {
    await loadAudio(selection.path, selection.name, "external", media);
    projectState.update((project) => {
      project.externalAudioDurationSeconds = audioEngine.duration;
      synchronizeSelectedAudio(project);
    }, "Aggiorna durata audio esterno");
  } catch {
    clearActiveAudioUi();
  }
}

async function loadClip(
  path: string,
  name: string,
  providedMetadata?: ClipMetadata
): Promise<ClipPreviewInfo> {
  const metadata = providedMetadata ?? (await window.avs.inspectClip(path));
  if (!metadata.previewSupported) {
    throw new Error(
      `${metadata.container} · ${videoCodecLabel(metadata.videoCodec)}: ` +
        metadata.compatibilityReason
    );
  }
  const token = ++clipLoadToken;
  const media = await window.avs.readMedia(path);
  const decoded = await preview.setClip(media.bytes, media.mimeType);
  if (token !== clipLoadToken) return decoded;
  if (!decoded.width || !decoded.height || decoded.presentedFrames < 1) {
    preview.clearClip();
    throw new Error(
      `${metadata.container} · ${videoCodecLabel(metadata.videoCodec)}: ` +
        "il decoder non ha prodotto il primo fotogramma."
    );
  }
  clipPreviewInfo = decoded;
  loadedClipPath = path;
  controls.simpleClipName.textContent = name;
  controls.simpleClipDetails.textContent =
    `${clipTechnicalSummary(metadata)} · ${formatTime(metadata.durationSeconds)}` +
    (metadata.hasAudio ? " · con audio" : " · senza audio");
  controls.simpleClipFile.classList.remove("hidden");
  showToast(
    `Primo fotogramma pronto · ${metadata.container} · ` +
      videoCodecLabel(metadata.videoCodec)
  );
  return decoded;
}

async function chooseClip(): Promise<void> {
  const selection = await window.avs.chooseClip();
  if (!selection) return;
  try {
    const metadata = await window.avs.inspectClip(selection.path);
    const decoded = await loadClip(selection.path, selection.name, metadata);
    const useClipAudio =
      metadata.hasAudio && !projectState.project.externalAudioFile;
    projectState.update((project) => {
      project.clip = {
        ...project.clip,
        filePath: metadata.path,
        durationSeconds: metadata.durationSeconds,
        audioDurationSeconds: metadata.hasAudio ? metadata.durationSeconds : 0,
        hasAudio: metadata.hasAudio,
        width: decoded.width || metadata.width,
        height: decoded.height || metadata.height,
        frameRate: metadata.frameRate,
        container: metadata.container,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec
      };
      project.cover.filePath = null;
      project.assets = project.assets.filter((asset) => asset.type !== "cover");
      project.cover.fitMode = "contain";
      project.cover.width = 1;
      project.cover.height = 1;
      project.cover.opacity = 1;
      project.cover.cornerRadius = 0;
      const layer = backgroundLayer(project);
      if (layer) {
        layer.name = "Video";
        layer.visible = true;
        layer.locked = false;
        layer.opacity = 1;
        layer.blendMode = "source-over";
        layer.transform = {
          x: 0.5,
          y: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0
        };
        layer.keyframes = [];
      }
      if (useClipAudio) project.audioSource = "clip";
      synchronizeSelectedAudio(project);
    }, "Scegli clip");
    selectLayer(backgroundLayer()?.id ?? "cover");
    previewCanvas.focus();
    if (metadata.hasAudio && projectState.project.audioSource === "clip") {
      await activateAudioSource("clip", true);
    } else if (!metadata.hasAudio) {
      setSimpleAudioError("La clip non contiene una traccia audio");
      showToast("La clip non contiene una traccia audio", true);
    }
  } catch (error) {
    setSimpleAudioError(readError(error));
    showToast(`Clip non caricata: ${readError(error)}`, true);
  }
}

async function chooseCover(): Promise<void> {
  const selection = await window.avs.chooseCover();
  if (!selection) return;
  const image = await loadCover(selection.path, selection.name);
  const replacedClipAudio = projectState.project.audioSource === "clip";
  projectState.update((project) => {
    project.clip = {
      ...project.clip,
      filePath: null,
      durationSeconds: 0,
      audioDurationSeconds: 0,
      hasAudio: false,
      width: 0,
      height: 0,
      frameRate: 0,
      container: "",
      videoCodec: "",
      audioCodec: null
    };
    project.assets = project.assets.filter((asset) => asset.type !== "clip");
    loadCoverIntoProject(project, selection.path, image);
    const layer = backgroundLayer(project);
    if (layer) layer.name = "Immagine";
    synchronizeSelectedAudio(project);
  }, "Carica cover");
  selectLayer(backgroundLayer()?.id ?? "cover");
  previewCanvas.focus();
  if (replacedClipAudio) {
    if (projectState.project.externalAudioFile) {
      await activateAudioSource("external", false);
    } else {
      clearActiveAudioUi();
      setSimpleAudioError("Scegli un file audio esterno");
    }
  }
}

async function loadCover(
  path: string,
  name: string
): Promise<CoverPreviewInfo> {
  const token = ++coverLoadToken;
  loadedCoverPath = path;
  try {
    const media = await window.avs.readMedia(path);
    const image = await preview.setCover(media.bytes, media.mimeType);
    if (token !== coverLoadToken) return image;
    coverPreviewInfo = image;
    controls.coverName.textContent = name;
    controls.coverThumbnail.src = image.url;
    controls.coverFile.classList.remove("hidden");
    controls.simpleCoverName.textContent = name;
    controls.simpleCoverThumbnail.src = image.url;
    controls.simpleCoverFile.classList.remove("hidden");
    showToast("Cover caricata e selezionata");
    return image;
  } catch (error) {
    if (token === coverLoadToken) {
      coverPreviewInfo = null;
      preview.clearCover();
      controls.coverThumbnail.removeAttribute("src");
      controls.simpleCoverThumbnail.removeAttribute("src");
    }
    showToast(readError(error), true);
    throw error;
  }
}

async function synchronizeCoverMedia(path: string | null): Promise<void> {
  if (path === loadedCoverPath) return;
  if (!path) {
    coverLoadToken += 1;
    loadedCoverPath = null;
    coverPreviewInfo = null;
    preview.clearCover();
    controls.coverThumbnail.removeAttribute("src");
    controls.coverName.textContent = "";
    controls.coverFile.classList.add("hidden");
    controls.simpleCoverThumbnail.removeAttribute("src");
    controls.simpleCoverName.textContent = "";
    controls.simpleCoverFile.classList.add("hidden");
    return;
  }
  const name = path.split(/[\\/]/).pop() ?? "Cover";
  await loadCover(path, name).catch(() => undefined);
}

async function synchronizeClipMedia(path: string | null): Promise<void> {
  if (path === loadedClipPath) return;
  if (!path) {
    clipLoadToken += 1;
    loadedClipPath = null;
    clipPreviewInfo = null;
    preview.clearClip();
    controls.simpleClipName.textContent = "";
    controls.simpleClipDetails.textContent = "";
    controls.simpleClipFile.classList.add("hidden");
    return;
  }
  const name = path.split(/[\\/]/).pop() ?? "Clip";
  await loadClip(path, name).catch((error) => {
    clipPreviewInfo = null;
    setSimpleAudioError(`Clip non disponibile: ${readError(error)}`);
  });
}

async function togglePlayback(): Promise<void> {
  if (!projectState.project.audioFile) {
    const message =
      projectState.project.audioSource === "clip" &&
      projectState.project.clip.filePath &&
      !projectState.project.clip.hasAudio
        ? "La clip non contiene una traccia audio"
        : "Scegli la sorgente audio";
    controls.simplePlayHint.textContent = message;
    showToast(message, true);
    return;
  }
  try {
    playing = await audioEngine.toggle();
    preview.setClipPlayback(playing, audioEngine.currentTime);
    controls.playPause.textContent = playing ? "Pausa" : "Play";
    controls.playPause.setAttribute(
      "aria-label",
      playing ? "Metti in pausa" : "Riproduci"
    );
    controls.simplePlayHint.textContent = playing
      ? "Anteprima in riproduzione"
      : "Anteprima in pausa";
  } catch (error) {
    const message = `Riproduzione non avviata: ${readError(error)}`;
    controls.simplePlayHint.textContent = message;
    controls.simplePlayHint.classList.remove("ready");
    showToast(message, true);
  }
}

function stopPlayback(): void {
  audioEngine.stop();
  preview.setClipPlayback(false, 0);
  playing = false;
  controls.playPause.textContent = "Play";
  controls.playPause.setAttribute("aria-label", "Riproduci");
  controls.simplePlayHint.textContent = projectState.project.audioFile
    ? "Riproduzione fermata"
    : "Scegli la sorgente audio";
  projectMResetRequested = true;
}

async function newProject(): Promise<void> {
  stopPlayback();
  audioEngine.clear();
  projectPath = undefined;
  selectedLayerId = "";
  controls.audioFile.classList.add("hidden");
  controls.coverFile.classList.add("hidden");
  controls.simpleAudioFile.classList.add("hidden");
  controls.simpleCoverFile.classList.add("hidden");
  controls.simpleClipFile.classList.add("hidden");
  controls.simpleAudioName.textContent = "";
  controls.simpleAudioDuration.textContent = "";
  controls.simpleCoverName.textContent = "";
  controls.simpleClipName.textContent = "";
  controls.simpleClipDetails.textContent = "";
  controls.simpleCoverThumbnail.removeAttribute("src");
  controls.simpleSeek.max = "0";
  controls.simpleSeek.value = "0";
  controls.totalTime.textContent = "00:00.000";
  controls.timelineHint.textContent = "Carica un audio per generare la forma d'onda";
  preview.clearCover();
  preview.clearClip();
  loadedClipPath = null;
  preview.resetEffects();
  preview.clearProjectMFrame();
  projectMResetRequested = true;
  projectMLastTargetFrame = -1;
  projectMLastAudioTime = 0;
  projectState.reset(createSimpleProject());
  await window.avs.projectMShutdown().catch(() => undefined);
  projectMStatus = null;
  await presetLibraryView.initialize("bundled-audio-wave");
  showToast("Nuovo progetto creato");
}

async function saveProject(): Promise<void> {
  try {
    const result = await window.avs.saveProject(projectState.project, projectPath);
    if (!result) return;
    projectPath = result.path;
    projectState.acceptSaved(result.project);
    showToast("Progetto salvato");
  } catch (error) {
    showToast(`Salvataggio non riuscito: ${readError(error)}`, true);
  }
}

async function applyOpenedProject(result: ProjectFileResult): Promise<void> {
  const restoredProject = structuredClone(result.project);
  normalizeProjectForSimpleUi(restoredProject);
  const bodyWasInert = document.body.inert;
  isRestoringProject = true;
  document.body.inert = true;
  document.body.setAttribute("aria-busy", "true");
  try {
    stopPlayback();
    projectPath = result.path;
    selectedLayerId = "";
    preview.resetEffects();
    projectState.reset(restoredProject);
    projectMResetRequested = true;
    projectMLastTargetFrame = -1;
    projectMLastAudioTime = 0;
    if (restoredProject.clip.filePath) {
      const clipName =
        restoredProject.clip.filePath.split(/[\\/]/).pop() ?? "Clip";
      try {
        await loadClip(restoredProject.clip.filePath, clipName);
      } catch {
        preview.clearClip();
        controls.simpleClipName.textContent = `${clipName} — mancante`;
        controls.simpleClipDetails.textContent = "Ricollegamento richiesto";
        controls.simpleClipFile.classList.remove("hidden");
      }
    } else {
      preview.clearClip();
      loadedClipPath = null;
      controls.simpleClipFile.classList.add("hidden");
    }
    if (restoredProject.audioFile) {
      const name = restoredProject.audioFile.split(/[\\/]/).pop() ?? "Audio";
      try {
        await loadAudio(
          restoredProject.audioFile,
          restoredProject.audioSource === "clip" ? "Audio della clip" : name,
          restoredProject.audioSource
        );
      } catch {
        controls.audioName.textContent = `${name} — mancante`;
        controls.audioDuration.textContent = "Ricollegamento richiesto";
        controls.audioFile.classList.remove("hidden");
        controls.simpleAudioName.textContent = `${name} — mancante`;
        controls.simpleAudioDuration.textContent = "File non disponibile";
        controls.simpleAudioFile.classList.remove("hidden");
      }
    } else {
      clearActiveAudioUi();
      if (
        restoredProject.audioSource === "clip" &&
        restoredProject.clip.filePath &&
        !restoredProject.clip.hasAudio
      ) {
        setSimpleAudioError("La clip non contiene una traccia audio");
      }
    }
    if (restoredProject.cover.filePath) {
      const name =
        restoredProject.cover.filePath.split(/[\\/]/).pop() ?? "Copertina";
      try {
        await loadCover(restoredProject.cover.filePath, name);
      } catch {
        preview.clearCover();
        controls.coverName.textContent = `${name} — mancante`;
        controls.coverFile.classList.remove("hidden");
        controls.simpleCoverName.textContent = `${name} — mancante`;
        controls.simpleCoverFile.classList.remove("hidden");
      }
    } else {
      preview.clearCover();
      controls.coverFile.classList.add("hidden");
      controls.simpleCoverFile.classList.add("hidden");
    }
    await presetLibraryView.initialize(restoredProject.projectM.presetId);
    const selected = await presetLibraryView
      .select(restoredProject.projectM.presetId, "restore", true)
      .catch(() => false);
    if (!selected) {
      showToast(
        `Preset MilkDrop salvato non disponibile: ${restoredProject.projectM.presetName}. Usa Ricollega.`,
        true
      );
    }
    // Reapply the immutable snapshot after asynchronous UI/runtime work. No
    // library refresh or selection may alter serialized sequencer state.
    projectState.reset(restoredProject);
  } finally {
    isRestoringProject = false;
    document.body.inert = bodyWasInert;
    document.body.removeAttribute("aria-busy");
    rebuildPresetSequence();
  }
}

async function openProject(): Promise<void> {
  try {
    const result = await window.avs.openProject();
    if (!result) return;
    await applyOpenedProject(result);
    showToast("Progetto aperto");
  } catch (error) {
    showToast(
      `Impossibile aprire il progetto. Verifica che i file sorgente esistano. ${readError(error)}`,
      true
    );
  }
}

async function exportVideo(): Promise<void> {
  if (!projectState.project.audioFile) {
    showToast("Carica un file audio prima di esportare", true);
    return;
  }
  controls.exportModal.classList.remove("hidden");
  controls.exportProgress.style.width = "0%";
  controls.exportPercent.textContent = "0%";
  controls.exportPhase.textContent = "Preparazione progetto";
  controls.exportMessage.textContent = "Validazione progetto e destinazione…";
  controls.exportFrameCount.textContent = "0 / —";
  controls.exportElapsed.textContent = "00:00";
  controls.exportSpeed.textContent = "— frame/s";
  controls.exportEta.textContent = "Calcolo…";
  controls.exportCodecs.textContent = "H.264 OpenH264 + AAC";
  controls.exportVideoDetails.textContent =
    `${projectState.project.exportSettings.width} × ` +
    `${projectState.project.exportSettings.height} · ` +
    `${projectState.project.exportSettings.fps} FPS`;
  controls.exportOutputPath.textContent = "In attesa della destinazione";
  controls.exportRuntimePaths.textContent = "Verifica FFmpeg/OpenH264…";
  controls.exportLogPath.textContent = "Creazione log…";
  controls.cancelExport.disabled = false;
  exportStartedAt = performance.now();
  window.clearInterval(exportElapsedTimer);
  exportElapsedTimer = window.setInterval(() => {
    const elapsed = Math.max(0, (performance.now() - exportStartedAt) / 1000);
    controls.exportElapsed.textContent = formatExportDuration(elapsed);
  }, 1_000);
  try {
    const destination = await window.avs.exportVideo({ project: projectState.project });
    if (!destination) {
      window.clearInterval(exportElapsedTimer);
      exportElapsedTimer = 0;
      controls.exportModal.classList.add("hidden");
    }
  } catch (error) {
    window.clearInterval(exportElapsedTimer);
    exportElapsedTimer = 0;
    controls.exportModal.classList.add("hidden");
    showToast(`Esportazione non avviata: ${readError(error)}`, true);
  }
}

function formatExportDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "—";
  }
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function exportPhaseLabel(phase: ExportProgress["phase"]): string {
  switch (phase) {
    case "loading-audio":
      return "Caricamento audio";
    case "starting-effects":
      return "Avvio motore effetti";
    case "composing":
      return "Composizione frame";
    case "encoding":
      return "Codifica video";
    case "finalizing":
      return "Finalizzazione file";
    case "completed":
      return "Esportazione completata";
    case "cancelled":
      return "Esportazione annullata";
    case "error":
      return "Errore esportazione";
    default:
      return "Preparazione progetto";
  }
}

function handleExportProgress(progress: ExportProgress): void {
  exportProgressHistory.push(structuredClone(progress));
  if (exportProgressHistory.length > 10_000) exportProgressHistory.shift();
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  controls.exportProgress.style.width = `${percent}%`;
  controls.exportPercent.textContent = `${percent}%`;
  controls.exportPhase.textContent = exportPhaseLabel(progress.phase);
  controls.exportMessage.textContent = progress.message;
  if (progress.frameTotal !== undefined) {
    controls.exportFrameCount.textContent =
      `${progress.frameCurrent ?? 0} / ${progress.frameTotal}`;
  }
  if (progress.elapsedSeconds !== undefined) {
    controls.exportElapsed.textContent = formatExportDuration(
      progress.elapsedSeconds
    );
  }
  controls.exportSpeed.textContent =
    progress.framesPerSecond && progress.framesPerSecond > 0
      ? `${progress.framesPerSecond.toFixed(2)} frame/s`
      : "— frame/s";
  controls.exportEta.textContent =
    progress.estimatedRemainingSeconds === undefined
      ? controls.exportEta.textContent
      : progress.estimatedRemainingSeconds === null
        ? "Calcolo…"
        : formatExportDuration(progress.estimatedRemainingSeconds);
  if (progress.videoCodec || progress.audioCodec) {
    controls.exportCodecs.textContent =
      progress.videoCodec === "libopenh264"
        ? "H.264 OpenH264 + AAC"
        : `${progress.videoCodec ?? "Video"} + ${progress.audioCodec ?? "Audio"}`;
  }
  if (progress.width && progress.height && progress.fps) {
    controls.exportVideoDetails.textContent =
      `${progress.width} × ${progress.height} · ${progress.fps} FPS · ` +
      `${formatExportDuration(progress.durationSeconds)} · ` +
      `${progress.frameTotal ?? "—"} frame`;
  }
  if (progress.outputPath) controls.exportOutputPath.textContent = progress.outputPath;
  if (progress.ffmpegPath || progress.openH264Path) {
    controls.exportRuntimePaths.textContent =
      `FFmpeg: ${progress.ffmpegPath ?? "—"} · ` +
      `OpenH264: ${progress.openH264Path ?? "—"}`;
  }
  if (progress.diagnosticLogPath) {
    controls.exportLogPath.textContent = progress.diagnosticLogPath;
  }
  if (!progress.done) return;
  window.clearInterval(exportElapsedTimer);
  exportElapsedTimer = 0;
  setTimeout(() => controls.exportModal.classList.add("hidden"), 900);
  if (progress.error) {
    console.error(progress.error);
    showToast(`Esportazione non riuscita: ${progress.error}`, true);
  } else if (progress.cancelled) {
    showToast("Esportazione annullata");
  } else {
    showToast(`Video creato: ${progress.outputPath ?? ""}`);
  }
}

function drawWaveform(): void {
  const context = waveformContext;
  const width = waveformCanvas.width;
  const height = waveformCanvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#11141c";
  context.fillRect(0, 0, width, height);
  const waveform = audioEngine.waveformData;
  if (!waveform.length) return;

  context.fillStyle = `${projectState.project.canvas.accentColor}aa`;
  const viewport = { ...timelineViewport(), width };
  for (let pixel = 0; pixel < width; pixel += 2) {
    const time = pixelToTime(pixel, viewport);
    const index = Math.min(
      waveform.length - 1,
      Math.max(0, Math.floor((time / audioEngine.duration) * waveform.length))
    );
    const amplitude = waveform[index] ?? 0;
    const barHeight = Math.max(1, amplitude * height * 0.82);
    context.fillRect(pixel, (height - barHeight) / 2, 2, barHeight);
  }
  if (audioEngine.duration) {
    for (const marker of projectState.project.projectM.markers) {
      const markerX = timeToPixel(marker.time, viewport);
      if (markerX < 0 || markerX > width) continue;
      context.fillStyle = marker.source === "music" ? "#22d3eecc" : "#f59e0bcc";
      context.fillRect(markerX, 0, 1, height);
    }
  }
  if (audioEngine.duration) {
    const playheadX = timeToPixel(audioEngine.currentTime, viewport);
    context.fillStyle = "#ffffff";
    context.fillRect(playheadX, 0, 2, height);
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00.000";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function showToast(message: string, isError = false): void {
  window.clearTimeout(toastTimer);
  controls.toast.textContent = message;
  controls.toast.classList.toggle("error", isError);
  controls.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => controls.toast.classList.remove("visible"), 3400);
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function animate(): void {
  preview.setClipPlayback(playing, audioEngine.currentTime);
  preview.update(
    projectState.project,
    audioEngine.snapshot(projectState.project.canvas.fps),
    audioEngine.currentTime
  );
  controls.currentTime.textContent = formatTime(audioEngine.currentTime);
  if (document.activeElement !== controls.simpleSeek) {
    controls.simpleSeek.value = String(audioEngine.currentTime);
  }
  if (playing) drawWaveform();
  void drivePresetAutomation();
  void driveProjectM();
  metricFrames += 1;
  const metricNow = performance.now();
  const metricElapsed = metricNow - metricWindowStart;
  if (metricElapsed >= 5000) {
    const fps = (metricFrames * 1000) / metricElapsed;
    minimumMeasuredFps = Math.min(minimumMeasuredFps, fps);
    const nativeMetrics = projectMLatestFrame
      ? ` · PM ${projectMLatestFrame.latencyMs.toFixed(1)} ms · ` +
        `${projectMLatestFrame.bandwidthMbps.toFixed(0)} Mb/s · ` +
        `drop ${projectMLatestFrame.droppedFrames}`
      : "";
    controls.previewMetrics.textContent =
      `PREVIEW · 540 × 960 · ${fps.toFixed(1)} FPS${nativeMetrics}`;
    console.info(
      `[AVS_METRICS] fps=${fps.toFixed(1)} min=${minimumMeasuredFps.toFixed(1)}`
    );
    metricFrames = 0;
    metricWindowStart = metricNow;
  }
  requestAnimationFrame(animate);
}

async function initializeProjectM(): Promise<void> {
  if (!projectState.project.projectM.enabled) {
    renderProjectMStatus();
    return;
  }
  controls.projectMState.textContent = "Inizializzazione…";
  controls.projectMState.className = "runtime-state pending";
  try {
    const settings = projectState.project.projectM;
    projectMStatus = await window.avs.projectMInitialize(
      settings.previewWidth,
      settings.previewHeight,
      settings.randomSeed
    );
    projectMStatus.enabled = true;
    renderProjectMStatus();
    if (projectMStatus.available) {
      projectMResetRequested = false;
      projectMLastTargetFrame = -1;
      projectMLastAudioTime = 0;
      await requestProjectMFrame(0, 1);
    }
  } catch (error) {
    projectMStatus = {
      available: false,
      running: false,
      enabled: true,
      version: "",
      preset: "",
      error: readError(error),
      glRenderer: "",
      glVersion: "",
      pid: null,
      pcmMaxSamples: 0,
      hostPath: "",
      libraryPath: "",
      presetPath: "",
      receivedPresetPath: "",
      presetPathUtf8Bytes: 0,
      activeCodePage: 0,
      protocolVersion: 2,
      deterministicSeed: String(projectState.project.projectM.randomSeed)
    };
    renderProjectMStatus();
  }
}

function renderProjectMStatus(): void {
  const enabled = projectState.project.projectM.enabled;
  controls.projectMEnabled.checked = enabled;
  if (!enabled) {
    controls.projectMState.textContent = "Disattivato";
    controls.projectMState.className = "runtime-state";
  } else if (projectMStatus?.available && projectMStatus.running) {
    controls.projectMState.textContent = "Disponibile";
    controls.projectMState.className = "runtime-state available";
  } else {
    controls.projectMState.textContent = "Non disponibile";
    controls.projectMState.className = "runtime-state unavailable";
  }
  controls.projectMVersion.textContent = projectMStatus?.version || "—";
  controls.projectMPreset.textContent = projectMStatus?.preset || "—";
  const error = enabled ? projectMStatus?.error ?? "" : "";
  controls.projectMError.textContent = error;
  controls.projectMError.classList.toggle("hidden", !error);
  const simpleError =
    activeSimpleEffect() === "projectM" && !projectMStatus?.available
      ? error || "Motore projectM non disponibile."
      : "";
  controls.simpleEffectError.textContent = simpleError;
  controls.simpleEffectError.classList.toggle("hidden", !simpleError);
}

async function drivePresetAutomation(): Promise<void> {
  const settings = projectState.project.projectM;
  if (
    !settings.autoSwitch.enabled ||
    settings.locked ||
    presetAutomaticChangeInFlight
  ) {
    return;
  }
  const event = presetEventAt(presetSequence, audioEngine.currentTime);
  if (!event || event.index === appliedPresetSequenceIndex) return;
  const previousIndex = appliedPresetSequenceIndex;
  appliedPresetSequenceIndex = event.index;
  if (event.presetId === settings.presetId) return;
  presetAutomaticChangeInFlight = true;
  try {
    const loaded = await presetLibraryView.select(
      event.presetId,
      event.source,
      event.index < previousIndex
    );
    if (!loaded) {
      showToast(
        "Cambio automatico saltato: il preset non compatibile è stato isolato.",
        true
      );
    }
  } finally {
    presetAutomaticChangeInFlight = false;
  }
}

async function driveProjectM(): Promise<void> {
  const settings = projectState.project.projectM;
  const layer = projectState.project.layers.find(
    (candidate) => candidate.kind === "projectM"
  );
  if (
    !settings.enabled ||
    !layer?.visible ||
    !projectMStatus?.available ||
    !audioEngine.hasPcm ||
    projectMRenderInFlight
  ) {
    return;
  }

  const fps = settings.fps;
  const currentTime = audioEngine.currentTime;
  const targetFrame = Math.max(0, Math.floor(currentTime * fps));
  const seekDetected =
    targetFrame < projectMLastTargetFrame ||
    currentTime + 0.001 < projectMLastAudioTime;
  if (projectMResetRequested || seekDetected) {
    projectMRenderInFlight = true;
    try {
      projectMStatus = await window.avs.projectMReset(
        settings.previewWidth,
        settings.previewHeight,
        settings.randomSeed
      );
      projectMStatus.enabled = true;
      if (settings.locked) {
        projectMStatus = await window.avs.presetLock(true);
        projectMStatus.enabled = true;
      }
      renderProjectMStatus();
      projectMLastTargetFrame = targetFrame - 1;
      projectMLastAudioTime = Math.max(0, currentTime - 1 / fps);
      projectMResetRequested = false;
    } catch (error) {
      if (projectMStatus) projectMStatus.error = readError(error);
      renderProjectMStatus();
    } finally {
      projectMRenderInFlight = false;
    }
  }
  if (targetFrame === projectMLastTargetFrame || projectMRenderInFlight) return;
  const steps = Math.max(
    1,
    Math.min(120, targetFrame - projectMLastTargetFrame)
  );
  await requestProjectMFrame(currentTime, steps);
  projectMLastTargetFrame = targetFrame;
  projectMLastAudioTime = currentTime;
}

async function requestProjectMFrame(
  currentTime: number,
  steps: number
): Promise<void> {
  if (projectMRenderInFlight) return;
  const settings = projectState.project.projectM;
  projectMRenderInFlight = true;
  try {
    const startTime = Math.max(
      0,
      Math.min(projectMLastAudioTime, currentTime)
    );
    const samples = audioEngine.pcmBetween(startTime, currentTime);
    const frame = await window.avs.projectMRender({
      width: settings.previewWidth,
      height: settings.previewHeight,
      steps,
      channels: 2,
      samples
    });
    if (frame) {
      preview.setProjectMFrame(frame);
      projectMLatestFrame = frame;
      if (projectMStatus) projectMStatus.error = "";
    }
  } catch (error) {
    if (projectMStatus && projectState.project.projectM.enabled) {
      projectMStatus.error = readError(error);
      projectMStatus.running = false;
      renderProjectMStatus();
    }
  } finally {
    projectMRenderInFlight = false;
  }
}

window.addEventListener("beforeunload", () => {
  stageResizeObserver.disconnect();
  preview.dispose();
  void window.avs.projectMShutdown();
});

if (new URLSearchParams(window.location.search).has("runtimeTest")) {
  window.__avsRuntimeTest = {
    async loadAudio(path: string): Promise<void> {
      const name = path.split(/[\\/]/).pop() ?? "Audio test";
      await loadAudio(path, name, "external");
      projectState.update((project) => {
        project.externalAudioFile = path;
        project.externalAudioDurationSeconds = audioEngine.duration;
        project.audioSource = "external";
        synchronizeSelectedAudio(project);
      });
    },
    async loadClip(path: string): Promise<void> {
      const name = path.split(/[\\/]/).pop() ?? "Clip test";
      const metadata = await window.avs.inspectClip(path);
      const decoded = await loadClip(path, name, metadata);
      projectState.update((project) => {
        project.clip = {
          ...project.clip,
          filePath: metadata.path,
          durationSeconds: metadata.durationSeconds,
          audioDurationSeconds: metadata.hasAudio ? metadata.durationSeconds : 0,
          hasAudio: metadata.hasAudio,
          width: decoded.width || metadata.width,
          height: decoded.height || metadata.height,
          frameRate: metadata.frameRate,
          container: metadata.container,
          videoCodec: metadata.videoCodec,
          audioCodec: metadata.audioCodec
        };
        project.cover.filePath = null;
        project.cover.fitMode = "contain";
        project.cover.width = 1;
        project.cover.height = 1;
        project.cover.opacity = 1;
        project.cover.cornerRadius = 0;
        const layer = backgroundLayer(project);
        if (layer) {
          layer.name = "Video";
          layer.visible = true;
          layer.transform = {
            x: 0.5,
            y: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0
          };
        }
      }, "Carica clip test");
      selectLayer(backgroundLayer()?.id ?? "cover");
    },
    async setAudioSource(source: AudioSourceMode): Promise<boolean> {
      return activateAudioSource(source, false);
    },
    setClipEndMode(mode: ClipEndMode): void {
      projectState.update((project) => {
        project.clip.endMode = mode;
      }, "Modalità fine clip runtime");
      preview.setClipPlayback(playing, audioEngine.currentTime);
    },
    audioSourceState() {
      const waveform = audioEngine.waveformData;
      return {
        source: projectState.project.audioSource,
        activePath: projectState.project.audioFile,
        externalPath: projectState.project.externalAudioFile,
        clipPath: projectState.project.clip.filePath,
        clipHasAudio: projectState.project.clip.hasAudio,
        duration: audioEngine.duration,
        currentTime: audioEngine.currentTime,
        playing,
        documentVisibility: document.visibilityState,
        mediaPaused: audioEngine.element.paused,
        mediaReadyState: audioEngine.element.readyState,
        mediaNetworkState: audioEngine.element.networkState,
        mediaEnded: audioEngine.element.ended,
        mediaError: audioEngine.element.error?.message ?? "",
        waveformPoints: waveform.length,
        waveformFingerprint: waveform.reduce(
          (sum, value, index) => sum + Math.round(value * 10_000) * (index + 1),
          0
        ),
        clipRadio: controls.simpleAudioSourceClip.checked,
        externalRadio: controls.simpleAudioSourceExternal.checked,
        status: controls.simpleAudioSourceStatus.textContent ?? "",
        error: controls.simpleAudioError.textContent ?? "",
        chooseAudioHidden: controls.simpleChooseAudio.classList.contains("hidden")
      };
    },
    async loadCover(path: string): Promise<void> {
      const name = path.split(/[\\/]/).pop() ?? "Immagine test";
      const image = await loadCover(path, name);
      projectState.update((project) => {
        project.clip = {
          ...project.clip,
          filePath: null,
          durationSeconds: 0,
          audioDurationSeconds: 0,
          hasAudio: false,
          width: 0,
          height: 0,
          frameRate: 0,
          container: "",
          videoCodec: "",
          audioCodec: null
        };
        project.assets = project.assets.filter((asset) => asset.type !== "clip");
        loadCoverIntoProject(project, path, image);
        const layer = backgroundLayer(project);
        if (layer) layer.name = "Immagine";
        synchronizeSelectedAudio(project);
      }, "Carica immagine test");
      selectLayer(backgroundLayer()?.id ?? "cover");
    },
    videoLayerState() {
      const layer = backgroundLayer();
      const video = preview.clipPlaybackState();
      return {
        label: controls.simpleLayerBackgroundLabel.textContent ?? "",
        buttonDisabled: controls.simpleLayerBackground.disabled,
        buttonSelected:
          controls.simpleLayerBackground.classList.contains("selected"),
        selectedLayerId,
        mediaType: projectState.project.clip.filePath
          ? "video"
          : projectState.project.cover.filePath
            ? "image"
            : "none",
        layer: layer ? structuredClone(layer) : null,
        background: structuredClone(projectState.project.cover),
        preview: video,
        handles: preview.selectionHandles()
      };
    },
    setBackgroundTransformForTest(transform): void {
      projectState.update((project) => {
        const layer = backgroundLayer(project);
        if (!layer || layer.locked) {
          throw new Error("Layer Sfondo non modificabile.");
        }
        layer.transform = {
          ...layer.transform,
          ...transform
        };
      }, "Trasformazione video runtime");
      selectLayer(backgroundLayer()?.id ?? "cover");
    },
    setVideoPlaybackForTest(playing: boolean, time: number): void {
      preview.setClipPlayback(playing, time);
    },
    async selectSimpleEffect(effect: SimpleEffectId): Promise<void> {
      controls.simpleEffect.value = effect;
      await chooseSimpleEffect(effect);
    },
    async configureExportAudit(options: {
      audioPath: string;
      coverPath: string | null;
      title: string;
      artist: string;
      effect: SimpleEffectId;
      effectOpacity?: number;
    }): Promise<void> {
      const audioName =
        options.audioPath.split(/[\\/]/).pop() ?? "Audio export audit";
      await loadAudio(options.audioPath, audioName, "external");
      let image: CoverPreviewInfo | undefined;
      if (options.coverPath) {
        const coverName =
          options.coverPath.split(/[\\/]/).pop() ?? "Cover export audit";
        image = await loadCover(options.coverPath, coverName);
      }
      projectState.update((project) => {
        project.externalAudioFile = options.audioPath;
        project.externalAudioDurationSeconds = audioEngine.duration;
        project.audioSource = "external";
        synchronizeSelectedAudio(project);
        project.text.title = options.title;
        project.text.artist = options.artist;
        if (options.coverPath && image) {
          loadCoverIntoProject(project, options.coverPath, image);
        } else {
          project.cover.filePath = null;
          const coverLayer = project.layers.find((layer) => layer.kind === "cover");
          if (coverLayer) {
            coverLayer.visible = Boolean(project.clip.filePath);
            coverLayer.name = project.clip.filePath ? "Video" : "Sfondo";
          }
        }
        for (const layer of project.layers) {
          if (layer.kind === "titleText") layer.visible = Boolean(options.title);
          if (layer.kind === "artistText") layer.visible = Boolean(options.artist);
        }
      }, "Configura scenario export audit");
      controls.simpleEffect.value = options.effect;
      await chooseSimpleEffect(options.effect);
      projectState.update((project) => {
        const effectLayer = project.layers.find(
          (layer) =>
            layer.visible &&
            (layer.kind === "projectM" || layer.kind === "visualizer")
        );
        if (effectLayer) {
          effectLayer.opacity = Math.min(
            1,
            Math.max(0, options.effectOpacity ?? 1)
          );
        }
      }, "Imposta opacità effetto export audit");
    },
    async importSimplePresetsAt(
      kind: "files" | "folder" | "zip",
      mode: "copy" | "link",
      paths: string[]
    ) {
      simplePresetRuntimeOverride = null;
      return importSimplePresets(kind, mode, paths);
    },
    async refreshSimplePresetLibrary(): Promise<void> {
      simplePresetRuntimeOverride = null;
      await presetLibraryView.initialize(projectState.project.projectM.presetId);
    },
    simplePresetLibraryState() {
      const valid = simplePresetCatalogRecords.filter(
        (preset) =>
          !preset.quarantined &&
          preset.status !== "missing" &&
          preset.status !== "incompatible"
      );
      return {
        total: simplePresetCatalogRecords.length,
        valid: valid.length,
        displayed: simplePresetOptions().length,
        selectedId: controls.simplePreset.value,
        search: controls.simplePresetSearch.value,
        filter: controls.simplePresetFilter.value,
        selectedText: controls.simplePresetSelected.textContent ?? "",
        countText: controls.simplePresetCount.textContent ?? "",
        names: simplePresetOptions().map((option) => option.textContent ?? ""),
        records: simplePresetCatalogRecords.map((preset) => ({
          id: preset.id,
          name: preset.name,
          path: preset.path,
          status: preset.status,
          quarantined: preset.quarantined,
          favorite: preset.favorite,
          originKind: preset.origin.kind,
          sourcePath: preset.origin.sourcePath,
          textureCount: preset.textures.length,
          missingTextureCount: preset.missingTextures.length
        }))
      };
    },
    simpleLayerSelectorState() {
      const buttons = [
        controls.simpleLayerBackground,
        controls.simpleLayerEffect,
        controls.simpleLayerTitle,
        controls.simpleLayerArtist
      ];
      return {
        selectedLayerId,
        selectedText: controls.simpleSelectedLayerName.textContent ?? "",
        selectionLocked: controls.simpleLayerSelectionLock.checked,
        guidesVisible: controls.simpleStageGuides.checked,
        buttons: buttons.map((button) => ({
          id: button.id,
          disabled: button.disabled,
          selected: button.getAttribute("aria-pressed") === "true",
          stateText:
            button.querySelector<HTMLElement>("[data-layer-state]")
              ?.textContent ?? ""
        }))
      };
    },
    projectStageState() {
      const format = inferProjectFormat(projectState.project);
      const stage = controls.videoStageFrame.getBoundingClientRect();
      const viewport = controls.stageViewport.getBoundingClientRect();
      const panel = controls.simpleLayerBackground
        .closest<HTMLElement>(".simple-layer-selector")
        ?.getBoundingClientRect();
      const workspace = controls.stageViewport
        .closest<HTMLElement>(".stage-workspace")
        ?.getBoundingClientRect();
      const waveform = controls.simpleSeek
        .closest<HTMLElement>(".stage")
        ?.querySelector<HTMLElement>(".simple-waveform")
        ?.getBoundingClientRect();
      const transport = controls.simpleSeek
        .closest<HTMLElement>(".transport")
        ?.getBoundingClientRect();
      const rect = (value: DOMRect | undefined) =>
        value
          ? {
              left: value.left,
              top: value.top,
              right: value.right,
              bottom: value.bottom,
              width: value.width,
              height: value.height
            }
          : null;
      return {
        format,
        canvas: {
          width: projectState.project.canvas.width,
          height: projectState.project.canvas.height
        },
        export: {
          width: projectState.project.exportSettings.width,
          height: projectState.project.exportSettings.height
        },
        preview: {
          width: previewCanvas.width,
          height: previewCanvas.height
        },
        zoom: previewZoom,
        zoomMode: previewZoomMode,
        selectionLocked: controls.simpleLayerSelectionLock.checked,
        guidesVisible: controls.simpleStageGuides.checked,
        stage: rect(stage),
        viewport: rect(viewport),
        panel: rect(panel),
        workspace: rect(workspace),
        waveform: rect(waveform),
        transport: rect(transport)
      };
    },
    setProjectFormat(format: ProjectFormat): void {
      applyProjectFormat(format);
    },
    setPreviewZoomForTest(value: number, mode: "fit" | "manual"): void {
      setPreviewZoom(value, mode);
    },
    setLayerSelectionLockForTest(enabled: boolean): void {
      controls.simpleLayerSelectionLock.checked = enabled;
      controls.simpleLayerSelectionLock.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    },
    setStageGuidesForTest(enabled: boolean): void {
      controls.simpleStageGuides.checked = enabled;
      controls.simpleStageGuides.dispatchEvent(
        new Event("change", { bubbles: true })
      );
    },
    setEffectTransformForTest(transform: Partial<LayerTransform>): void {
      projectState.update((project) => {
        const layer = activeSimpleEffectLayer(project);
        if (!layer) throw new Error("Nessun effetto attivo nel test runtime.");
        layer.transform = { ...layer.transform, ...transform };
      }, "Trasformazione effetto runtime");
    },
    setSimplePresetTestOptions(count: number): void {
      const bounded = Math.max(0, Math.min(5_000, Math.floor(count)));
      const now = new Date(0).toISOString();
      const records = Array.from({ length: bounded }, (_, index): PresetRecord => ({
        id: `runtime-preset-${String(index).padStart(3, "0")}`,
        name: `Runtime Preset ${String(index + 1).padStart(3, "0")}`,
        author: null,
        path: `C:\\runtime\\preset-${index}.milk`,
        origin: {
          kind: "external-file",
          sourcePath: "C:\\runtime",
          label: "Runtime test"
        },
        importedAt: now,
        updatedAt: now,
        hash: String(index).padStart(64, "0"),
        status: "valid",
        license: "Licenza non verificata",
        licenseVerified: false,
        textures: [],
        missingTextures: [],
        compatibility: "projectM-4.1.6",
        favorite: false,
        quarantined: false,
        quarantineReason: "",
        errorReport: [],
        thumbnailPath: null
      }));
      simplePresetRuntimeOverride = records;
      syncSimplePresetOptions(records);
    },
    presetComboboxState() {
      const rect = controls.simplePresetListbox.getBoundingClientRect();
      return {
        open: simplePresetOpen,
        opens: (controls.simplePresetListbox.dataset.opens ?? "") as
          | "up"
          | "down"
          | "",
        count: simplePresetOptions().length,
        activeIndex: simplePresetActiveIndex,
        selectedValue: controls.simplePreset.value,
        scrollTop: controls.simplePresetListbox.scrollTop,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        },
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    },
    selectLayerForTest(id: string): void {
      selectLayer(id);
    },
    visibleControlsAudit() {
      const all = [...document.querySelectorAll<HTMLElement>("[data-simple-control]")];
      const visible = all.filter((element) => {
        const style = getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !element.closest(".hidden")
        );
      });
      return {
        registered: all.length,
        connected: all.filter(
          (element) => element.dataset.handler === "connected"
        ).length,
        visible: visible.length,
        visibleWithoutHandler: visible
          .filter((element) => element.dataset.handler !== "connected")
          .map((element) => element.id)
      };
    },
    async togglePlayback(): Promise<void> {
      await togglePlayback();
    },
    stopPlayback,
    seek(seconds: number): void {
      audioEngine.seek(seconds);
      preview.setClipPlayback(playing, audioEngine.currentTime);
    },
    setProjectMEnabled(enabled: boolean): void {
      controls.projectMEnabled.checked = enabled;
      controls.projectMEnabled.dispatchEvent(new Event("change"));
    },
    async presetCommand(
      command: "previous" | "next" | "random" | "restart"
    ): Promise<void> {
      if (command === "restart") {
        await presetLibraryView.select(
          projectState.project.projectM.presetId,
          "restart",
          true
        );
        return;
      }
      await changePresetManual(command);
    },
    setPresetAutomation(
      enabled: boolean,
      intervalSeconds: number,
      seed: number
    ): void {
      projectState.update((project) => {
        project.projectM.autoSwitch.enabled = enabled;
        project.projectM.autoSwitch.mode = "interval";
        project.projectM.autoSwitch.intervalSeconds = intervalSeconds;
        project.projectM.autoSwitch.minimumSeconds = intervalSeconds;
        project.projectM.autoSwitch.maximumSeconds = intervalSeconds;
        project.projectM.randomSeed = seed >>> 0;
      });
      rebuildPresetSequence();
    },
    async selectPreset(id: string, forceHardCut = false): Promise<boolean> {
      return presetLibraryView.select(id, "manual", forceHardCut);
    },
    setPlaylist(ids: string[], startId: string): void {
      projectState.update((project) => {
        project.projectM.playlistIds = [...ids];
        project.projectM.sequenceStartPresetId = startId;
        project.projectM.presetId = startId;
      });
      rebuildPresetSequence();
    },
    setRestoreAuditState(startId: string): void {
      projectState.update((project) => {
        project.projectM.sequenceStartPresetId = startId;
        project.projectM.transition = {
          enabled: true,
          durationSeconds: 1.25
        };
        project.projectM.markers = [
          {
            id: "audit-marker-120",
            time: 120,
            label: "Audit 120 s",
            source: "timeline",
            presetId: project.projectM.playlistIds[2] ?? null
          },
          {
            id: "audit-marker-360",
            time: 360,
            label: "Audit 360 s",
            source: "music",
            presetId: null
          }
        ];
      });
      rebuildPresetSequence();
    },
    async setPresetLocked(locked: boolean): Promise<void> {
      await window.avs.presetLock(locked);
      projectState.update((project) => {
        project.projectM.locked = locked;
      });
    },
    async configureDemo(
      coverPath: string,
      artist: string,
      title: string,
      fps: 30 | 60
    ): Promise<void> {
      projectState.update((project) => {
        project.name = "Audit finale Fase 2";
        project.cover.filePath = coverPath;
        project.text.artist = artist;
        project.text.title = title;
        project.canvas.fps = fps;
        project.projectM.fps = fps;
        project.exportSettings.fps = fps;
        const overlayIds = new Set([
          "visualizer-spectrumBars",
          "visualizer-circularSpectrum",
          "visualizer-waveformLine"
        ]);
        for (const layer of project.layers) {
          if (overlayIds.has(layer.id)) layer.visible = true;
        }
      });
      await loadCover(coverPath, coverPath.split(/[\\/]/).pop() ?? "Cover audit");
    },
    setExportProfile(width: number, height: number, fps: 30 | 60): void {
      projectState.update((project) => {
        project.exportSettings.width = width;
        project.exportSettings.height = height;
        project.exportSettings.fps = fps;
        project.projectM.fps = fps;
      });
    },
    undo(): boolean {
      return projectState.undo();
    },
    redo(): boolean {
      return projectState.redo();
    },
    async saveProjectAt(path: string): Promise<string> {
      const result = await window.avs.saveProject(projectState.project, path);
      if (!result) throw new Error("Salvataggio audit annullato.");
      projectPath = result.path;
      projectState.acceptSaved(result.project);
      return result.path;
    },
    async openProjectAt(path: string): Promise<void> {
      const result = await window.avs.openProjectPath(path);
      await applyOpenedProject(result);
    },
    async createProjectPreset(name, includeAssets = {
      audio: false,
      cover: false,
      milkdropPreset: false,
      textures: false
    }) {
      const result = await window.avs.projectPresetCreate({
        project: structuredClone(projectState.project),
        name,
        description: "Preset creato dal test runtime M4",
        author: null,
        includeAssets
      });
      await projectPresetView.initialize();
      return result;
    },
    async importProjectPresetAt(path: string) {
      const result = await window.avs.projectPresetImportPath(path);
      await projectPresetView.initialize();
      return result;
    },
    async exportProjectPresetAt(id: string, path: string) {
      return window.avs.projectPresetExportPath(id, path);
    },
    async previewProjectPreset(id: string) {
      return window.avs.projectPresetPreview({
        id,
        project: structuredClone(projectState.project)
      });
    },
    async applyProjectPreset(id: string, allowPartial = false) {
      const candidate = await window.avs.projectPresetPreview({
        id,
        project: structuredClone(projectState.project)
      });
      if (candidate.partial && !allowPartial) {
        throw new Error("Applicazione parziale non confermata.");
      }
      await applyProjectPresetPreview(candidate);
    },
    async relinkAssetAt(assetId, path, confirmHashMismatch = false) {
      const asset = projectState.project.assets.find(
        (item) => item.id === assetId
      );
      if (!asset) throw new Error("Asset runtime non trovato.");
      const match = await window.avs.assetInspectPath({ asset }, path);
      if (match.requiresConfirmation && !confirmHashMismatch) {
        throw new Error("Hash differente non confermato.");
      }
      const updated = updateProjectAssets(
        projectState.project,
        [match],
        confirmHashMismatch ? new Set([assetId]) : new Set()
      );
      projectState.update((draft) => {
        Object.assign(draft, structuredClone(updated));
      }, "Ricollega asset");
      await synchronizeAppliedMedia(projectState.project);
    },
    async exportAt(path: string): Promise<ExportProgress> {
      return new Promise<ExportProgress>((resolve, reject) => {
        const unsubscribe = window.avs.onExportProgress((progress) => {
          if (!progress.done) return;
          unsubscribe();
          if (progress.error) reject(new Error(progress.error));
          else resolve(progress);
        });
        window.avs
          .exportVideoPath({ project: structuredClone(projectState.project) }, path)
          .catch((error) => {
            unsubscribe();
            reject(error);
          });
      });
    },
    async startExportAt(path: string): Promise<string | null> {
      return window.avs.exportVideoPath(
        { project: structuredClone(projectState.project) },
        path
      );
    },
    async cancelExportJob(): Promise<boolean> {
      return window.avs.cancelExport();
    },
    clearExportProgressHistory(): void {
      exportProgressHistory.splice(0);
    },
    exportProgressHistory(): ExportProgress[] {
      return structuredClone(exportProgressHistory);
    },
    selectionHandles() {
      return preview.selectionHandles();
    },
    snapshot() {
      const frame = projectMLatestFrame
        ? (({ bytes: _bytes, ...metadata }) => metadata)(projectMLatestFrame)
        : null;
      return {
        currentTime: audioEngine.currentTime,
        duration: audioEngine.duration,
        playing,
        projectMStatus: projectMStatus ? { ...projectMStatus } : null,
        projectMFrame: frame,
        projectMStateText: controls.projectMState.textContent ?? "",
        projectMSettings: structuredClone(projectState.project.projectM),
        presetSequence: structuredClone(presetSequence.slice(0, 100)),
        project: structuredClone(projectState.project),
        isDirty: projectState.isDirty,
        history: projectState.historySnapshot(),
        selectedLayerId
      };
    }
  };
}

void (async () => {
  await initializeProjectM();
  await presetLibraryView.initialize(projectState.project.projectM.presetId);
  await presetCatalogView.initialize();
  await projectPresetView.initialize();
})();
animate();
