import type { ProjectStore } from "../../engine/commands/projectStore";

interface HistoryControls {
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
}

function isNativeEditor(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function bindHistoryController(
  store: ProjectStore,
  controls: HistoryControls,
  notify: (message: string) => void
): () => void {
  const undo = () => {
    if (!store.undo()) return;
    notify("Modifica annullata");
  };
  const redo = () => {
    if (!store.redo()) return;
    notify("Modifica ripristinata");
  };
  const updateButtons = () => {
    controls.undo.disabled = !store.canUndo;
    controls.redo.disabled = !store.canRedo;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const control = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (control && !isNativeEditor(event.target) && key === "z" && event.shiftKey) {
      if (!store.canRedo) return;
      event.preventDefault();
      redo();
    } else if (control && !isNativeEditor(event.target) && key === "z") {
      if (!store.canUndo) return;
      event.preventDefault();
      undo();
    } else if (control && !isNativeEditor(event.target) && key === "y") {
      if (!store.canRedo) return;
      event.preventDefault();
      redo();
    } else if (event.key === "Escape" && store.cancelTransaction()) {
      event.preventDefault();
    }
  };

  controls.undo.addEventListener("click", undo);
  controls.redo.addEventListener("click", redo);
  window.addEventListener("keydown", onKeyDown);
  const unsubscribe = store.subscribe(updateButtons);
  return () => {
    controls.undo.removeEventListener("click", undo);
    controls.redo.removeEventListener("click", redo);
    window.removeEventListener("keydown", onKeyDown);
    unsubscribe();
  };
}

