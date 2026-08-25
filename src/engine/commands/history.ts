import type { Command } from "./command";

export interface HistoryEntry<T> {
  command: Command<T>;
  beforeRevision: number;
  afterRevision: number;
}

export interface HistoryLimits {
  maxCommands: number;
  maxBytes: number;
}

export interface HistorySnapshot {
  undoCount: number;
  redoCount: number;
  estimatedBytes: number;
  maxCommands: number;
  maxBytes: number;
}

export class History<T> {
  private undoEntries: HistoryEntry<T>[] = [];
  private redoEntries: HistoryEntry<T>[] = [];
  private bytes = 0;

  constructor(
    readonly limits: HistoryLimits = {
      maxCommands: 200,
      maxBytes: 32 * 1024 * 1024
    }
  ) {}

  push(entry: HistoryEntry<T>): void {
    this.undoEntries.push(entry);
    this.bytes += entry.command.estimatedBytes;
    this.redoEntries = [];
    this.trim();
  }

  popUndo(): HistoryEntry<T> | undefined {
    const entry = this.undoEntries.pop();
    if (!entry) return undefined;
    this.bytes -= entry.command.estimatedBytes;
    this.redoEntries.push(entry);
    return entry;
  }

  popRedo(): HistoryEntry<T> | undefined {
    const entry = this.redoEntries.pop();
    if (!entry) return undefined;
    this.undoEntries.push(entry);
    this.bytes += entry.command.estimatedBytes;
    this.trim();
    return entry;
  }

  clear(): void {
    this.undoEntries = [];
    this.redoEntries = [];
    this.bytes = 0;
  }

  get canUndo(): boolean {
    return this.undoEntries.length > 0;
  }

  get canRedo(): boolean {
    return this.redoEntries.length > 0;
  }

  snapshot(): HistorySnapshot {
    return {
      undoCount: this.undoEntries.length,
      redoCount: this.redoEntries.length,
      estimatedBytes: Math.max(0, this.bytes),
      maxCommands: this.limits.maxCommands,
      maxBytes: this.limits.maxBytes
    };
  }

  private trim(): void {
    while (
      this.undoEntries.length > this.limits.maxCommands ||
      (this.bytes > this.limits.maxBytes && this.undoEntries.length > 1)
    ) {
      const removed = this.undoEntries.shift();
      if (!removed) break;
      this.bytes -= removed.command.estimatedBytes;
    }
  }
}

