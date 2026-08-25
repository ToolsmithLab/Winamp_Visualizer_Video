import type {
  CatalogPackageView,
  PresetCatalogView
} from "../../shared/presetCatalog";

interface PresetCatalogViewOptions {
  onLibraryChanged(): Promise<void>;
  notify(message: string, error?: boolean): void;
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Controllo catalogo mancante: ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class PresetCatalogViewController {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly version: HTMLElement;
  private readonly dialog: HTMLDialogElement;
  private readonly licenseText: HTMLElement;
  private catalog: PresetCatalogView | null = null;
  private busy = false;

  constructor(private readonly options: PresetCatalogViewOptions) {
    this.root = required(document, "#preset-catalog");
    this.list = required(this.root, "#preset-catalog-list");
    this.version = required(this.root, "#preset-catalog-version");
    this.dialog = required(document, "#preset-license-dialog");
    this.licenseText = required(this.dialog, "#preset-license-text");
    required<HTMLButtonElement>(this.dialog, "#preset-license-close").addEventListener(
      "click",
      () => this.dialog.close()
    );
    this.list.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-catalog-action]"
      );
      const item = target?.closest<HTMLElement>("[data-package-id]");
      if (!target || !item?.dataset.packageId || this.busy) return;
      void this.action(target.dataset.catalogAction ?? "", item.dataset.packageId);
    });
  }

  async initialize(): Promise<void> {
    try {
      this.catalog = await window.avs.presetCatalogList();
      this.version.textContent = `v${this.catalog.catalogVersion}`;
      this.render();
    } catch (error) {
      this.list.innerHTML = `<p class="preset-empty">Catalogo non disponibile: ${escapeHtml(
        this.errorText(error)
      )}</p>`;
    }
  }

  private render(): void {
    const packages = this.catalog?.packages ?? [];
    this.list.innerHTML = packages.length
      ? packages.map((item) => this.itemHtml(item)).join("")
      : '<p class="preset-empty">Nessun pacchetto con licenza verificata.</p>';
  }

  private itemHtml(item: CatalogPackageView): string {
    const stateLabels: Record<CatalogPackageView["state"], string> = {
      "not-installed": "Non installato",
      installed: "Installato",
      "update-available": "Aggiornamento disponibile",
      "integrity-error": "Errore integrità"
    };
    const canInstall = item.state === "not-installed";
    const canUpdate = item.state === "update-available";
    const canManage = item.state !== "not-installed";
    return `
      <article class="catalog-package" data-package-id="${escapeHtml(item.id)}">
        <div class="preset-title-row">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="preset-state">${escapeHtml(stateLabels[item.state])}</span>
        </div>
        <small>${escapeHtml(item.authors.join(", "))}</small>
        <small>${escapeHtml(item.license)} · ${item.presetCount} preset · ${item.textureCount} texture</small>
        <details class="preset-details">
          <summary>Dettagli verificati</summary>
          <dl>
            <dt>Versione</dt><dd>${escapeHtml(item.version)}</dd>
            <dt>Data</dt><dd>${escapeHtml(new Date(item.releaseDate).toLocaleDateString("it-IT"))}</dd>
            <dt>projectM</dt><dd>${escapeHtml(item.projectMVersion)}</dd>
            <dt>SHA-256</dt><dd>${escapeHtml(item.sha256)}</dd>
            <dt>Verificato</dt><dd>${escapeHtml(new Date(item.verifiedAt).toLocaleDateString("it-IT"))}</dd>
            <dt>Attribuzione</dt><dd>${escapeHtml(item.attribution.join(" · "))}</dd>
            <dt>Integrità</dt><dd>${escapeHtml(item.integrityError || item.integrityVerifiedAt || "Non ancora verificata")}</dd>
          </dl>
        </details>
        <div class="preset-actions">
          ${canInstall ? '<button data-catalog-action="install">Installa</button>' : ""}
          ${canUpdate ? '<button data-catalog-action="update">Aggiorna</button>' : ""}
          ${canManage ? '<button data-catalog-action="uninstall">Disinstalla</button>' : ""}
          ${canManage ? '<button data-catalog-action="verify">Verifica integrità</button>' : ""}
          <button data-catalog-action="source">Apri fonte</button>
          <button data-catalog-action="license">Leggi licenza</button>
        </div>
      </article>
    `;
  }

  private async action(action: string, id: string): Promise<void> {
    const item = this.catalog?.packages.find((entry) => entry.id === id);
    if (!item) return;
    try {
      if (action === "source") {
        await window.avs.presetCatalogOpenSource(id);
        return;
      }
      if (action === "license") {
        this.licenseText.textContent = await window.avs.presetCatalogReadLicense(id);
        this.dialog.showModal();
        return;
      }
      if (
        action === "install" &&
        !confirm(
          `Scaricare e installare "${item.name}" ${item.version}? ` +
          "Il download partirà solo dopo questa conferma."
        )
      ) {
        return;
      }
      if (
        action === "update" &&
        !confirm(`Aggiornare "${item.name}" alla versione ${item.version}?`)
      ) {
        return;
      }
      if (
        action === "uninstall" &&
        !confirm(
          `Disinstallare "${item.name}"? I preset personali preesistenti non saranno rimossi.`
        )
      ) {
        return;
      }

      this.busy = true;
      this.root.classList.add("catalog-busy");
      const result =
        action === "install"
          ? await window.avs.presetCatalogInstall(id)
          : action === "update"
            ? await window.avs.presetCatalogUpdate(id)
            : action === "uninstall"
              ? await window.avs.presetCatalogUninstall(id)
              : await window.avs.presetCatalogVerify(id);
      this.options.notify(result.message);
      await this.options.onLibraryChanged();
      await this.initialize();
    } catch (error) {
      this.options.notify(`Catalogo ufficiale: ${this.errorText(error)}`, true);
      await this.initialize();
    } finally {
      this.busy = false;
      this.root.classList.remove("catalog-busy");
    }
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
