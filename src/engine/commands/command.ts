export type PathSegment = string | number;

export interface PatchOperation {
  path: PathSegment[];
  beforeExists: boolean;
  afterExists: boolean;
  before: unknown;
  after: unknown;
}

export interface Command<T> {
  readonly label: string;
  readonly estimatedBytes: number;
  undo(current: T): T;
  redo(current: T): T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  if (isObject(left) && isObject(right)) return false;
  return false;
}

function diff(
  before: unknown,
  after: unknown,
  path: PathSegment[],
  operations: PatchOperation[]
): void {
  if (equal(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const stableShape =
      before.length === after.length &&
      before.every((item, index) => {
        const next = after[index];
        if (isObject(item) && isObject(next) && "id" in item && "id" in next) {
          return item.id === next.id;
        }
        return true;
      });
    if (stableShape) {
      for (let index = 0; index < before.length; index += 1) {
        diff(before[index], after[index], [...path, index], operations);
      }
      return;
    }
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    operations.push({
      path,
      beforeExists: before !== undefined,
      afterExists: after !== undefined,
      before: structuredClone(before),
      after: structuredClone(after)
    });
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const beforeExists = Object.prototype.hasOwnProperty.call(before, key);
      const afterExists = Object.prototype.hasOwnProperty.call(after, key);
      if (!beforeExists || !afterExists) {
        operations.push({
          path: [...path, key],
          beforeExists,
          afterExists,
          before: beforeExists ? structuredClone(before[key]) : undefined,
          after: afterExists ? structuredClone(after[key]) : undefined
        });
      } else {
        diff(before[key], after[key], [...path, key], operations);
      }
    }
    return;
  }
  operations.push({
    path,
    beforeExists: before !== undefined,
    afterExists: after !== undefined,
    before: structuredClone(before),
    after: structuredClone(after)
  });
}

function applyOperations<T>(
  current: T,
  operations: PatchOperation[],
  direction: "undo" | "redo"
): T {
  let result = structuredClone(current) as unknown;
  for (const operation of operations) {
    const exists =
      direction === "undo" ? operation.beforeExists : operation.afterExists;
    const value = direction === "undo" ? operation.before : operation.after;
    if (!operation.path.length) {
      result = exists ? structuredClone(value) : undefined;
      continue;
    }
    let target = result as Record<string | number, unknown>;
    for (let index = 0; index < operation.path.length - 1; index += 1) {
      const segment = operation.path[index]!;
      target = target[segment] as Record<string | number, unknown>;
    }
    const finalSegment = operation.path.at(-1)!;
    if (exists) target[finalSegment] = structuredClone(value);
    else delete target[finalSegment];
  }
  return result as T;
}

function estimateBytes(operations: PatchOperation[]): number {
  const serialized = JSON.stringify(operations);
  return new TextEncoder().encode(serialized).byteLength;
}

export class PatchCommand<T> implements Command<T> {
  readonly estimatedBytes: number;

  constructor(
    readonly label: string,
    readonly operations: PatchOperation[]
  ) {
    this.estimatedBytes = estimateBytes(operations);
  }

  get empty(): boolean {
    return this.operations.length === 0;
  }

  undo(current: T): T {
    return applyOperations(current, this.operations, "undo");
  }

  redo(current: T): T {
    return applyOperations(current, this.operations, "redo");
  }
}

export function createPatchCommand<T>(
  label: string,
  before: T,
  after: T
): PatchCommand<T> {
  const operations: PatchOperation[] = [];
  diff(before, after, [], operations);
  return new PatchCommand(label, operations);
}
