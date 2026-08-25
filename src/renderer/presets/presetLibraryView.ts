import type {
  PresetImportKind,
  PresetImportMode,
  PresetImportReport,
  PresetRecord
} from "../../shared/presets";
import type { PresetSelectionResult } from "../../shared/ipc";
import type { PresetChangeSource } from "../../shared/project";

interface PresetLibraryViewOptions {
  onSelected(result: PresetSelectionResult, source: PresetChangeSource): void;
  onLibraryChanged(records: PresetRecord[]): void;
  selectionTransition(): { enabled: boolean; durationSeconds: number };
  isInPlaylist(id: string): boolean;
  onTogglePlaylist(id: string): void;
  notify(message: string, error?: boolean): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Controllo libreria mancante: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class PresetLibraryView {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly status: HTMLSelectElement;
  private readonly sort: HTMLSelectElement;
  private readonly favorites: HTMLInputElement;
  private readonly license: HTMLSelectElement;
  private records: PresetRecord[] = [];
  private selectedId = "bundled-audio-wave";
  private thumbnailUrls: string[] = [];

  constructor(private readonly options: PresetLibraryViewOptions) {
    this.root = required(document, "#preset-library");
    this.list = required(this.root, "#preset-list");
    this.search = required(this.root, "#preset-search");
    this.status = required(this.root, "#preset-status-filter");
    this.sort = required(this.root, "#preset-sort");
    this.favorites = required(this.root, "#preset-favorites-only");
    this.license = required(this.root, "#preset-license-filter");
    this.bind();
  }

  async initialize(selectedId?: string): Promise<void> {
    if (selectedId) this.selectedId = selectedId;
    await this.refresh();
  }

  get availableRecords(): PresetRecord[] {
    return this.records.filter(
      (preset) =>
        !preset.quarantined &&
        preset.status !== "missing" &&
        preset.status !== "incompatible"
    );
  }

  async select(
    id: string,
    source: PresetChangeSource = "manual",
    forceHardCut = false
  ): Promise<boolean> {
    try {
      const transition = this.options.selectionTransition();
      const result = await window.avs.presetSelect({
        id,
        smoothTransition: transition.enabled && !forceHardCut,
        transitionSeconds: transition.durationSeconds
      });
      this.selectedId = id;
      this.options.onSelected(result, source);
      await this.refresh();
      this.options.notify(`Preset MilkDrop caricato: ${result.preset.name}`);
      return true;
    } catch (error) {
      this.options.notify(this.errorText(error), true);
      await this.refresh();
      return false;
    }
  }

  private bind(): void {
    for (const eventTarget of [
      this.search,
      this.status,
      this.sort,
      this.favorites,
      this.license
    ]) {
      eventTarget.addEventListener("input", () => void this.refresh());
      eventTarget.addEventListener("change", () => void this.refresh());
    }

    this.root.querySelectorAll<HTMLButtonElement>("[data-import-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.dataset.importKind as PresetImportKind;
        const mode = (button.dataset.importMode ?? "copy") as PresetImportMode;
        void this.importPresets(kind, mode);
      });
    });

    this.list.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLElement>("[data-preset-id]");
      const id = item?.dataset.presetId;
      if (!id) return;
      const action = target.closest<HTMLElement>("[data-preset-action]")?.dataset.presetAction;
      if (!action) {
        void this.select(id);
        return;
      }
      void this.action(action, id);
    });
  }

  async importPresets(
    kind: PresetImportKind,
    mode: PresetImportMode,
    auditPaths?: string[]
  ): Promise<PresetImportReport | null> {
    try {
      const report = await window.avs.presetImport({ kind, mode, auditPaths });
      if (!report) return null;
      const details = [
        `${report.imported.length} importati`,
        `${report.duplicates.length} duplicati`,
        `${report.quarantined.length} in quarantena`,
        `${report.issues.length} errori`
      ].join(" · ");
      this.options.notify(`Importa preset: ${details}`, report.issues.some((item) => item.fatal));
      await this.refresh();
      return report;
    } catch (error) {
      this.options.notify(`Importazione fallita: ${this.errorText(error)}`, true);
      return null;
    }
  }

  private async action(action: string, id: string): Promise<void> {
    const preset = this.records.find((candidate) => candidate.id === id);
    if (!preset) return;
    try {
      if (action === "select") {
        await this.select(id);
        return;
      }
      if (action === "favorite") {
        await window.avs.presetFavorite(id, !preset.favorite);
      } else if (action === "playlist") {
        this.options.onTogglePlaylist(id);
      } else if (action === "open") {
        await window.avs.presetOpenPath(id);
        return;
      } else if (action === "delete") {
        if (!confirm(`Rimuovere "${preset.name}" dalla Libreria preset?`)) return;
        await window.avs.presetDelete(id);
      } else if (action === "edit") {
        const name = prompt("Nome preset", preset.name);
        if (name === null) return;
        const author = prompt("Autore (lascia vuoto se non noto)", preset.author ?? "");
        if (author === null) return;
        const license = prompt("Licenza dichiarata", preset.license);
        if (license === null) return;
        const licenseVerified =
          license !== "Licenza non verificata" &&
          confirm("Hai verificato la licenza su una fonte attendibile?");
        await window.avs.presetUpdateMetadata({
          id,
          name,
          author: author || null,
          license,
          licenseVerified
        });
      } else if (action === "relink") {
        const relinked = await window.avs.presetRelink({ id });
        if (!relinked) return;
      } else if (action === "retry") {
        await window.avs.presetClearQuarantine(id);
      } else if (action === "report") {
        alert(
          preset.errorReport.length
            ? preset.errorReport.join("\n")
            : "Nessun errore registrato."
        );
        return;
      }
      await this.refresh();
    } catch (error) {
      this.options.notify(this.errorText(error), true);
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    this.records = await window.avs.presetList({
      search: this.search.value,
      status: this.status.value as "all" | PresetRecord["status"],
      sort: this.sort.value as "name" | "importedAt" | "status" | "author",
      favoritesOnly: this.favorites.checked,
      license: this.license.value as "all" | "verified" | "unverified"
    });
    this.options.onLibraryChanged(this.records);
    this.render();
    await this.loadThumbnails();
  }

  private render(): void {
    for (const url of this.thumbnailUrls) URL.revokeObjectURL(url);
    this.thumbnailUrls = [];
    this.list.innerHTML = this.records.length
      ? this.records.map((preset) => this.itemHtml(preset)).join("")
      : `<p class="preset-empty">Nessun Preset MilkDrop corrispondente.</p>`;
  }

  private itemHtml(preset: PresetRecord): string {
    const selected = preset.id === this.selectedId ? " selected" : "";
    const license = preset.licenseVerified ? preset.license : "Licenza non verificata";
    const status = preset.quarantined
      ? "Quarantena"
      : preset.status === "missing"
        ? "Mancante"
        : preset.missingTextures.length
          ? `${preset.missingTextures.length} texture mancanti`
          : "Compatibile";
    const disabled = preset.quarantined || preset.status === "missing";
    return `
      <article class="preset-item${selected}" data-preset-id="${escapeHtml(preset.id)}">
        <div class="preset-thumb" data-thumbnail-id="${escapeHtml(preset.id)}">M</div>
        <div class="preset-item-main">
          <div class="preset-title-row">
            <strong>${escapeHtml(preset.name)}</strong>
            <button data-preset-action="favorite" title="Preferito">${preset.favorite ? "★" : "☆"}</button>
          </div>
          <small>${escapeHtml(preset.author ?? "Autore non indicato")}</small>
          <span class="preset-state preset-state-${escapeHtml(preset.status)}">${escapeHtml(status)}</span>
          <small>${escapeHtml(license)}</small>
          <small title="${escapeHtml(preset.path)}">${escapeHtml(preset.origin.label)}</small>
          <details class="preset-details">
            <summary>Dettagli</summary>
            <dl>
              <dt>Percorso</dt><dd>${escapeHtml(preset.path)}</dd>
              <dt>Importato</dt><dd>${escapeHtml(new Date(preset.importedAt).toLocaleString("it-IT"))}</dd>
              <dt>SHA-256</dt><dd>${escapeHtml(preset.hash)}</dd>
              <dt>Stato</dt><dd>${escapeHtml(preset.status)}</dd>
              <dt>Compatibilità</dt><dd>${escapeHtml(preset.compatibility)}</dd>
              <dt>Origine</dt><dd>${escapeHtml(preset.origin.kind)}</dd>
              <dt>Texture</dt><dd>${escapeHtml(preset.textures.map((item) => item.reference).join(", ") || "Nessuna")}</dd>
              <dt>Texture mancanti</dt><dd>${escapeHtml(preset.missingTextures.join(", ") || "Nessuna")}</dd>
              <dt>Quarantena</dt><dd>${escapeHtml(preset.quarantineReason || "No")}</dd>
            </dl>
          </details>
          <div class="preset-actions">
            <button data-preset-action="select" ${disabled ? "disabled" : ""}>Anteprima</button>
            <button data-preset-action="playlist" ${disabled ? "disabled" : ""}>${this.options.isInPlaylist(preset.id) ? "Rimuovi playlist" : "Aggiungi playlist"}</button>
            <button data-preset-action="open">Percorso</button>
            <button data-preset-action="edit">Metadati</button>
            ${preset.status === "missing" ? '<button data-preset-action="relink">Ricollega</button>' : ""}
            ${preset.quarantined ? '<button data-preset-action="retry">Riprova</button>' : ""}
            ${preset.errorReport.length ? '<button data-preset-action="report">Errori</button>' : ""}
            ${preset.origin.kind !== "bundled" ? '<button data-preset-action="delete">Elimina</button>' : ""}
          </div>
        </div>
      </article>
    `;
  }

  private async loadThumbnails(): Promise<void> {
    await Promise.all(
      this.records.map(async (preset) => {
        const bytes = await window.avs.presetThumbnail(preset.id);
        if (!bytes?.byteLength) return;
        const url = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/bmp" })
        );
        this.thumbnailUrls.push(url);
        const target = this.list.querySelector<HTMLElement>(
          `[data-thumbnail-id="${CSS.escape(preset.id)}"]`
        );
        if (target) {
          target.innerHTML = `<img src="${url}" alt="" />`;
        }
      })
    );
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
