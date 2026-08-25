import { pluginRegistry } from "../../engine/plugins/registry";
import type {
  PluginParameterDescriptor,
  PluginRuntimeStatus
} from "../../engine/plugins/types";
import type { PluginSettingValue, ProjectLayer } from "../../shared/project";

export interface PluginInspectorCallbacks {
  begin(label: string): void;
  update(
    key: string,
    value: PluginSettingValue,
    label: string
  ): void;
  commit(): void;
  resetParameter(key: string): void;
  resetAll(): void;
  resetRuntime(): void;
  status(layerId: string): PluginRuntimeStatus | null;
}

function parameterValue(
  layer: ProjectLayer,
  parameter: PluginParameterDescriptor
): PluginSettingValue {
  const pluginValue = layer.plugin?.settings[parameter.key];
  if (pluginValue !== undefined) return pluginValue;
  const legacy = layer.reactive as unknown as Record<string, PluginSettingValue>;
  return legacy?.[parameter.key] ?? parameter.defaultValue;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "mini-button";
  element.textContent = label;
  element.addEventListener("click", action);
  return element;
}

export class PluginParameterInspector {
  private selectedLayerId = "";

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: PluginInspectorCallbacks
  ) {}

  render(layer: ProjectLayer | null): void {
    if (this.container.contains(document.activeElement)) return;
    this.container.replaceChildren();
    this.selectedLayerId = layer?.id ?? "";
    if (!layer || layer.kind !== "visualizer") {
      this.container.classList.add("hidden");
      return;
    }
    this.container.classList.remove("hidden");
    const pluginId = layer.plugin?.id || layer.pluginId || "";
    const descriptor = pluginRegistry.get(pluginId);
    const heading = document.createElement("div");
    heading.className = "plugin-inspector-heading";
    const title = document.createElement("h3");
    title.textContent = descriptor?.displayName ?? `Plugin non disponibile: ${pluginId}`;
    heading.append(title);
    if (descriptor) {
      const version = document.createElement("span");
      version.className = "runtime-state";
      version.textContent = `v${descriptor.version}`;
      heading.append(version);
    }
    this.container.append(heading);

    const description = document.createElement("p");
    description.className = "setting-hint";
    description.textContent =
      descriptor?.description ??
      "I dati del plugin restano conservati, ma il renderer non viene eseguito.";
    this.container.append(description);
    if (!descriptor) return;

    const parameters = document.createElement("div");
    parameters.className = "plugin-parameter-list";
    for (const parameter of descriptor.parameters) {
      parameters.append(this.createParameter(layer, parameter));
    }
    this.container.append(parameters);

    const actions = document.createElement("div");
    actions.className = "layer-actions";
    actions.append(
      button("Ripristina tutti", () => this.callbacks.resetAll()),
      button("Riattiva runtime", () => this.callbacks.resetRuntime())
    );
    this.container.append(actions);

    const status = document.createElement("p");
    status.dataset.pluginRuntimeStatus = layer.id;
    status.className = "plugin-runtime-status";
    this.container.append(status);
    this.refreshStatus();
  }

  refreshStatus(): void {
    if (!this.selectedLayerId) return;
    const statusNode = this.container.querySelector<HTMLElement>(
      "[data-plugin-runtime-status]"
    );
    if (!statusNode) return;
    const status = this.callbacks.status(this.selectedLayerId);
    if (!status || status.state === "ready") {
      statusNode.textContent = "Runtime pronto";
      statusNode.classList.remove("is-error");
      return;
    }
    statusNode.textContent =
      status.state === "suspended"
        ? `Istanza sospesa: ${status.message}`
        : status.message;
    statusNode.classList.add("is-error");
  }

  private createParameter(
    layer: ProjectLayer,
    parameter: PluginParameterDescriptor
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "plugin-parameter";
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = parameter.label;
    caption.title = parameter.description;
    label.append(caption);
    const id = `plugin-param-${layer.id}-${parameter.key}`;
    const current = parameterValue(layer, parameter);
    const update = (value: PluginSettingValue) =>
      this.callbacks.update(
        parameter.key,
        value,
        `Modifica ${parameter.label}`
      );

    if (parameter.type === "number") {
      const row = document.createElement("div");
      row.className = "plugin-number-row";
      const input = document.createElement("input");
      input.type = "range";
      input.id = id;
      input.min = String(parameter.minimum);
      input.max = String(parameter.maximum);
      input.step = String(parameter.step);
      input.value = String(current);
      input.setAttribute("aria-label", parameter.label);
      const output = document.createElement("output");
      output.htmlFor = id;
      output.value = String(current);
      input.addEventListener("input", () => {
        this.callbacks.begin(`Modifica ${parameter.label}`);
        output.value = input.value;
        update(Number(input.value));
      });
      input.addEventListener("change", () => this.callbacks.commit());
      input.addEventListener("blur", () => this.callbacks.commit());
      row.append(input, output);
      label.append(row);
    } else if (parameter.type === "boolean") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = current === true;
      input.addEventListener("change", () => update(input.checked));
      label.prepend(input);
    } else if (parameter.type === "color") {
      const input = document.createElement("input");
      input.type = "color";
      input.id = id;
      input.value = String(current);
      input.addEventListener("input", () => {
        this.callbacks.begin(`Modifica ${parameter.label}`);
        update(input.value);
      });
      input.addEventListener("change", () => this.callbacks.commit());
      input.addEventListener("blur", () => this.callbacks.commit());
      label.append(input);
    } else {
      const select = document.createElement("select");
      select.id = id;
      for (const option of parameter.options) {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        select.append(element);
      }
      select.value = String(current);
      select.addEventListener("change", () => update(select.value));
      label.append(select);
    }
    wrapper.append(
      label,
      button("Ripristina", () =>
        this.callbacks.resetParameter(parameter.key)
      )
    );
    return wrapper;
  }
}
