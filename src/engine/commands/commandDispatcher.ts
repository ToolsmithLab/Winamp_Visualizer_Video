import type { Command } from "./command";
import { History, type HistoryLimits, type HistorySnapshot } from "./history";

export interface DispatcherSnapshot {
  revision: number;
  savedRevision: number;
  dirty: boolean;
  history: HistorySnapshot;
}

export class CommandDispatcher<T> {
  private current: T;
  private revision = 0;
  private savedRevision = 0;
  private nextRevision = 1;
  private readonly history: History<T>;

  constructor(
    initial: T,
    limits?: HistoryLimits
  ) {
    this.current = structuredClone(initial);
    this.history = new History(limits);
  }

  get value(): T {
    return this.current;
  }

  execute(command: Command<T>): T {
    const beforeRevision = this.revision;
    this.current = command.redo(this.current);
    const afterRevision = this.nextRevision++;
    this.revision = afterRevision;
    this.history.push({ command, beforeRevision, afterRevision });
    return this.current;
  }

  recordApplied(command: Command<T>, current: T): T {
    const beforeRevision = this.revision;
    this.current = structuredClone(current);
    const afterRevision = this.nextRevision++;
    this.revision = afterRevision;
    this.history.push({ command, beforeRevision, afterRevision });
    return this.current;
  }

  undo(): T | null {
    const entry = this.history.popUndo();
    if (!entry) return null;
    this.current = entry.command.undo(this.current);
    this.revision = entry.beforeRevision;
    return this.current;
  }

  redo(): T | null {
    const entry = this.history.popRedo();
    if (!entry) return null;
    this.current = entry.command.redo(this.current);
    this.revision = entry.afterRevision;
    return this.current;
  }

  reset(value: T): T {
    this.current = structuredClone(value);
    this.revision = this.nextRevision++;
    this.savedRevision = this.revision;
    this.history.clear();
    return this.current;
  }

  replaceCurrent(value: T): T {
    this.current = structuredClone(value);
    return this.current;
  }

  markSaved(): void {
    this.savedRevision = this.revision;
  }

  snapshot(): DispatcherSnapshot {
    return {
      revision: this.revision,
      savedRevision: this.savedRevision,
      dirty: this.revision !== this.savedRevision,
      history: this.history.snapshot()
    };
  }
}

