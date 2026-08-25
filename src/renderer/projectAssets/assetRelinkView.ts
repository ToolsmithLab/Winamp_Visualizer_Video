import {
  markAssetIgnored,
  removeProjectAsset,
  unresolvedAssets,
  updateProjectAssets,
  type AssetMatch
} from "../../engine/project/assetResolver";
import type {
  ProjectAssetReference,
  VisualizerProject
} from "../../shared/project";

export interface AssetRelinkViewOptions {
  root: HTMLElement;
  currentProject: () => VisualizerProject;
  apply: (project: VisualizerProject, label: string) => Promise<void> | void;
  notify: (message: string, error?: boolean) => void;
}

function actionButton(
  label: string,
  action: string,
  id?: string
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset.assetAction = action;
  if (id) element.dataset.assetId = id;
  return element;
}

export class AssetRelinkView {
  private readonly list: HTMLElement;

  constructor(private readonly options: AssetRelinkViewOptions) {
    const list = options.root.querySelector<HTMLElement>("[data-role=asset-list]");
    if (!list) throw new Error("Elenco asset del progetto non trovato.");
    this.list = list;
    options.root.addEventListener("click", (event) => {
      const target = (event.target as Element).closest<HTMLButtonElement>(
        "button[data-asset-action]"
      );
      if (target) {
        void this.handle(
          target.dataset.assetAction!,
          target.dataset.assetId
        );
      }
    });
  }

  render(project = this.options.currentProject()): void {
    this.list.replaceChildren();
    if (!project.assets.length) {
      const empty = document.createElement("p");
      empty.className = "preset-empty";
      empty.textContent = "Il progetto non contiene riferimenti asset.";
      this.list.append(empty);
      return;
    }
    for (const asset of project.assets) {
      const row = document.createElement("article");
      row.className = `asset-item asset-state-${asset.status}`;
      const title = document.createElement("strong");
      title.textContent = asset.fileName || asset.id;
      const detail = document.createElement("small");
      detail.textContent = [
        asset.type,
        asset.status,
        asset.required ? "essenziale" : "opzionale",
        asset.hash ? `SHA-256 ${asset.hash.slice(0, 12)}…` : "hash non disponibile"
      ].join(" · ");
      const actions = document.createElement("div");
      actions.className = "preset-actions";
      actions.append(actionButton("Ricollega", "relink", asset.id));
      if (!asset.required && asset.status !== "ignored") {
        actions.append(actionButton("Ignora", "ignore", asset.id));
      }
      if (!asset.required) {
        actions.append(actionButton("Rimuovi riferimento", "remove", asset.id));
      }
      row.append(title, detail, actions);
      this.list.append(row);
    }
  }

  private confirmMatches(matches: AssetMatch[]): Set<string> | null {
    const mismatches = matches.filter((match) => match.requiresConfirmation);
    if (
      mismatches.length &&
      !window.confirm(
        `${mismatches.length} file hanno un hash differente. Confermare esplicitamente la sostituzione?`
      )
    ) {
      return null;
    }
    return new Set(mismatches.map((match) => match.assetId));
  }

  private async applyMatches(matches: AssetMatch[], label: string): Promise<void> {
    const confirmations = this.confirmMatches(matches);
    if (!confirmations) return;
    const updated = updateProjectAssets(
      this.options.currentProject(),
      matches,
      confirmations
    );
    await this.options.apply(updated, label);
    this.render(updated);
  }

  private asset(id?: string): ProjectAssetReference {
    const asset = this.options
      .currentProject()
      .assets.find((item) => item.id === id);
    if (!asset) throw new Error("Asset del progetto non trovato.");
    return asset;
  }

  private async handle(action: string, id?: string): Promise<void> {
    try {
      if (action === "relink") {
        const match = await window.avs.assetChooseReplacement({
          asset: this.asset(id)
        });
        if (!match) return;
        await this.applyMatches([match], "Ricollega asset");
        return;
      }
      if (action === "ignore") {
        const updated = markAssetIgnored(
          this.options.currentProject(),
          this.asset(id).id
        );
        await this.options.apply(updated, "Ignora asset opzionale");
        this.render(updated);
        return;
      }
      if (
        action === "remove" &&
        window.confirm("Rimuovere questo riferimento asset dal progetto?")
      ) {
        const updated = removeProjectAsset(
          this.options.currentProject(),
          this.asset(id).id
        );
        await this.options.apply(updated, "Rimuovi riferimento asset");
        this.render(updated);
        return;
      }
      if (action === "search" || action === "search-recursive") {
        const assets = unresolvedAssets(this.options.currentProject());
        if (!assets.length) {
          this.options.notify("Nessun asset irrisolto.");
          return;
        }
        const matches = await window.avs.assetSearchFolder({
          assets,
          recursive: action === "search-recursive"
        });
        if (!matches?.length) {
          this.options.notify("Nessuna corrispondenza trovata.", true);
          return;
        }
        await this.applyMatches(matches, "Ricollega più asset");
      }
    } catch (error) {
      this.options.notify(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  }
}
