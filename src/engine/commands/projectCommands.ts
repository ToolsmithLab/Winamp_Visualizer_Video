import type { VisualizerProject } from "../../shared/project";
import { createPatchCommand, type PatchCommand } from "./command";

export function projectMutationCommand(
  label: string,
  before: VisualizerProject,
  after: VisualizerProject
): PatchCommand<VisualizerProject> {
  return createPatchCommand(label, before, after);
}

