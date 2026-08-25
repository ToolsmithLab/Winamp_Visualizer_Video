import type {
  ProjectPresetLibraryRecord,
  ProjectPresetPreview
} from "../../shared/projectPreset";
import type { VisualizerProject } from "../../shared/project";

export interface ProjectPresetViewOptions {
  root: HTMLElement;
  currentProject: () => VisualizerProject;
  preview: (project: VisualizerProject) => void;
  cancelPreview: () => void;
  apply: (preview: ProjectPresetPreview) => Promise<void> | void;
  notify: (message: string, error?: boolean) => void;
}

function button(label: string, action: string, id?: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset.action = action;
  if (id) element.dataset.id = id;
  return element;
}

export class ProjectPresetView {
  private records: ProjectPresetLibraryRecord[] = [];
  private pending: ProjectPresetPreview | null = null;
  private readonly list: HTMLElement;
  private readonly details: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly sort: HTMLSelectElement;

  constructor(private readonly options: ProjectPresetViewOptions) {
    const list = options.root.querySelector<HTMLElement>("[data-role=list]");
    const details = options.root.querySelector<HTMLElement>("[data-role=details]");
    const search = options.root.querySelector<HTMLInputElement>("[data-role=search]");
    const sort = options.root.querySelector<HTMLSelectElement>("[data-role=sort]");
    if (!list || !details || !search || !sort) {
      throw new Error("Interfaccia Preset di progetto incompleta.");
    }
    this.list = list;
    this.details = details;
    this.search = search;
    this.sort = sort;
    options.root.addEventListener("click", (event) => {
      const target = (event.target as Element).closest<HTMLButtonElement>(
        "button[data-action]"
      );
      if (target) void this.handle(target.dataset.action!, target.dataset.id);
    });
    search.addEventListener("input", () => void this.refresh());
    sort.addEventListener("change", () => void this.refresh());
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    this.records = await window.avs.projectPresetList({
      search: this.search.value,
      sort: this.sort.value as "name" | "createdAt" | "modifiedAt"
    });
    this.render();
  }

  private render(): void {
    this.list.replaceChildren();
    if (!this.records.length) {
      const empty = document.createElement("p");
      empty.className = "preset-empty";
      empty.textContent = "Nessun Preset di progetto nella libreria personale.";
      this.list.append(empty);
      return;
    }
    for (const record of this.records) {
      const article = document.createElement("article");
      article.className = "project-preset-item";
      const title = document.createElement("strong");
      title.textContent = record.name;
      const meta = document.createElement("small");
      meta.textContent = [
        record.author || "Autore non dichiarato",
        `formato ${record.formatVersion}`,
        record.compatible ? "compatibile" : "plugin mancanti",
        record.missingAssetCount
          ? `${record.missingAssetCount} asset da risolvere`
          : "asset disponibili"
      ].join(" · ");
      const actions = document.createElement("div");
      actions.className = "preset-actions";
      actions.append(
        button("Anteprima", "preview", record.id),
        button("Rinomina", "rename", record.id),
        button("Duplica", "duplicate", record.id),
        button("Esporta", "export", record.id),
        button("Elimina", "delete", record.id)
      );
      article.append(title, meta, actions);
      this.list.append(article);
    }
  }

  private renderPreview(preview: ProjectPresetPreview): void {
    this.details.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = preview.preset.metadata.name;
    const description = document.createElement("p");
    description.textContent =
      preview.preset.metadata.description || "Nessuna descrizione.";
    const summary = document.createElement("p");
    summary.textContent = [
      `${preview.candidate.layers.length} livelli`,
      `${preview.preset.assets.length} riferimenti asset`,
      preview.compatibility.missingPluginIds.length
        ? `plugin mancanti: ${preview.compatibility.missingPluginIds.join(", ")}`
        : "plugin disponibili",
      preview.compatibility.missingAssets.length
        ? `${preview.compatibility.missingAssets.length} asset mancanti`
        : "nessun asset mancante"
    ].join(" · ");
    const actions = document.createElement("div");
    actions.className = "preset-actions";
    actions.append(button("Applica", "apply"), button("Annulla anteprima", "cancel"));
    this.details.append(heading, description, summary, actions);
    this.details.classList.remove("hidden");
  }

  private async handle(action: string, id?: string): Promise<void> {
    try {
      if (action === "create") {
        const nameInput =
          this.options.root.querySelector<HTMLInputElement>("[data-role=name]");
        const authorInput =
          this.options.root.querySelector<HTMLInputElement>("[data-role=author]");
        const descriptionInput =
          this.options.root.querySelector<HTMLTextAreaElement>(
            "[data-role=description]"
          );
        const name = nameInput?.value.trim() ?? "";
        if (!name) throw new Error("Inserisci un nome per il Preset di progetto.");
        await window.avs.projectPresetCreate({
          project: this.options.currentProject(),
          name,
          author: authorInput?.value.trim() || null,
          description: descriptionInput?.value ?? "",
          includeAssets: {
            audio:
              this.options.root.querySelector<HTMLInputElement>(
                "[data-asset=audio]"
              )?.checked === true,
            cover:
              this.options.root.querySelector<HTMLInputElement>(
                "[data-asset=cover]"
              )?.checked === true,
            milkdropPreset:
              this.options.root.querySelector<HTMLInputElement>(
                "[data-asset=milkdrop]"
              )?.checked === true,
            textures:
              this.options.root.querySelector<HTMLInputElement>(
                "[data-asset=textures]"
              )?.checked === true
          }
        });
        if (nameInput) nameInput.value = "";
        await this.refresh();
        this.options.notify("Preset di progetto creato.");
        return;
      }
      if (action === "import") {
        const result = await window.avs.projectPresetImport();
        if (!result) return;
        await this.refresh();
        this.options.notify(`Preset di progetto importato: ${result.name}.`);
        return;
      }
      if (action === "preview" && id) {
        this.pending = await window.avs.projectPresetPreview({
          id,
          project: this.options.currentProject()
        });
        this.renderPreview(this.pending);
        this.options.preview(this.pending.candidate);
        return;
      }
      if (action === "cancel") {
        this.pending = null;
        this.details.replaceChildren();
        this.details.classList.add("hidden");
        this.options.cancelPreview();
        this.options.notify("Anteprima annullata; progetto invariato.");
        return;
      }
      if (action === "apply" && this.pending) {
        if (
          this.pending.partial &&
          !window.confirm(
            "Mancano uno o più plugin integrati. Applicare esplicitamente solo le parti compatibili?"
          )
        ) {
          return;
        }
        await this.options.apply(this.pending);
        this.pending = null;
        this.details.replaceChildren();
        this.details.classList.add("hidden");
        return;
      }
      if (action === "rename" && id) {
        const current = this.records.find((record) => record.id === id);
        const name = window.prompt(
          "Nuovo nome del Preset di progetto:",
          current?.name ?? ""
        );
        if (!name?.trim()) return;
        await window.avs.projectPresetRename(id, name);
        await this.refresh();
        return;
      }
      if (action === "duplicate" && id) {
        await window.avs.projectPresetDuplicate(id);
        await this.refresh();
        return;
      }
      if (action === "export" && id) {
        const destination = await window.avs.projectPresetExport(id);
        if (destination) this.options.notify(`Preset esportato: ${destination}`);
        return;
      }
      if (
        action === "delete" &&
        id &&
        window.confirm("Eliminare questo Preset di progetto dalla libreria?")
      ) {
        await window.avs.projectPresetDelete(id);
        await this.refresh();
      }
    } catch (error) {
      this.options.notify(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  }
}
