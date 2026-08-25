import {
  createDefaultProject,
  type VisualizerProject
} from "../../shared/project";
import { CommandDispatcher } from "./commandDispatcher";
import { projectMutationCommand } from "./projectCommands";

export type ProjectStateListener = (project: VisualizerProject) => void;

export class ProjectStore {
  private value: VisualizerProject;
  private readonly dispatcher: CommandDispatcher<VisualizerProject>;
  private listeners = new Set<ProjectStateListener>();
  private transaction:
    | {
        label: string;
        before: VisualizerProject;
      }
    | undefined;

  constructor(initial = createDefaultProject()) {
    this.value = structuredClone(initial);
    this.dispatcher = new CommandDispatcher(this.value, {
      maxCommands: 200,
      maxBytes: 32 * 1024 * 1024
    });
  }

  get project(): VisualizerProject {
    return this.value;
  }

  get isDirty(): boolean {
    if (this.transaction) {
      const pending = projectMutationCommand(
        this.transaction.label,
        this.transaction.before,
        this.value
      );
      if (!pending.empty) return true;
    }
    return this.dispatcher.snapshot().dirty;
  }

  get canUndo(): boolean {
    return this.dispatcher.snapshot().history.undoCount > 0;
  }

  get canRedo(): boolean {
    return this.dispatcher.snapshot().history.redoCount > 0;
  }

  replace(project: VisualizerProject): void {
    this.reset(project);
  }

  reset(project: VisualizerProject): void {
    this.transaction = undefined;
    this.value = this.dispatcher.reset(project);
    this.emit();
  }

  acceptSaved(project: VisualizerProject): void {
    this.transaction = undefined;
    this.value = this.dispatcher.replaceCurrent(project);
    this.dispatcher.markSaved();
    this.emit();
  }

  markSaved(): void {
    this.commitTransaction();
    this.dispatcher.markSaved();
    this.emit();
  }

  update(
    mutator: (draft: VisualizerProject) => void,
    label = "Modifica progetto"
  ): void {
    const before = structuredClone(this.value);
    const draft = structuredClone(this.value);
    mutator(draft);
    draft.modifiedAt = new Date().toISOString();
    const command = projectMutationCommand(label, before, draft);
    if (command.empty) return;
    if (this.transaction) {
      this.value = draft;
    } else {
      this.value = this.dispatcher.execute(command);
    }
    this.emit();
  }

  beginTransaction(label: string): void {
    if (this.transaction) return;
    this.transaction = {
      label,
      before: structuredClone(this.value)
    };
  }

  commitTransaction(): boolean {
    if (!this.transaction) return false;
    const { before, label } = this.transaction;
    this.transaction = undefined;
    const command = projectMutationCommand(label, before, this.value);
    if (command.empty) return false;
    this.value = this.dispatcher.recordApplied(command, this.value);
    this.emit();
    return true;
  }

  cancelTransaction(): boolean {
    if (!this.transaction) return false;
    this.value = this.transaction.before;
    this.transaction = undefined;
    this.emit();
    return true;
  }

  undo(): boolean {
    this.commitTransaction();
    const project = this.dispatcher.undo();
    if (!project) return false;
    this.value = project;
    this.emit();
    return true;
  }

  redo(): boolean {
    this.commitTransaction();
    const project = this.dispatcher.redo();
    if (!project) return false;
    this.value = project;
    this.emit();
    return true;
  }

  historySnapshot() {
    return this.dispatcher.snapshot();
  }

  subscribe(listener: ProjectStateListener): () => void {
    this.listeners.add(listener);
    listener(this.value);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.value);
    }
  }
}

