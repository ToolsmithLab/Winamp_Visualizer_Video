import type { AvsApi } from "../preload/preload";

declare global {
  interface AvsRuntimeTestSnapshot {
    currentTime: number;
    duration: number;
    playing: boolean;
    projectMStatus: import("../shared/ipc").ProjectMStatus | null;
    projectMFrame: Omit<import("../shared/ipc").ProjectMFrame, "bytes"> | null;
    projectMStateText: string;
    projectMSettings: import("../shared/project").ProjectMSettings;
    presetSequence: import("../shared/presetSequencer").PresetSequenceEvent[];
    project: import("../shared/project").VisualizerProject;
    isDirty: boolean;
    history: ReturnType<
      import("../engine/commands/projectStore").ProjectStore["historySnapshot"]
    >;
    selectedLayerId: string;
  }

  interface AvsRuntimeTestApi {
    loadAudio(path: string): Promise<void>;
    loadClip(path: string): Promise<void>;
    setAudioSource(
      source: import("../shared/project").AudioSourceMode
    ): Promise<boolean>;
    setClipEndMode(mode: import("../shared/project").ClipEndMode): void;
    audioSourceState(): {
      source: import("../shared/project").AudioSourceMode;
      activePath: string | null;
      externalPath: string | null;
      clipPath: string | null;
      clipHasAudio: boolean;
      duration: number;
      currentTime: number;
      playing: boolean;
      waveformPoints: number;
      waveformFingerprint: number;
      clipRadio: boolean;
      externalRadio: boolean;
      status: string;
      error: string;
      chooseAudioHidden: boolean;
    };
    loadCover(path: string): Promise<void>;
    videoLayerState(): {
      label: string;
      buttonDisabled: boolean;
      buttonSelected: boolean;
      selectedLayerId: string;
      mediaType: "video" | "image" | "none";
      layer: import("../shared/project").ProjectLayer | null;
      background: import("../shared/project").CoverSettings;
      preview: import("./previewRenderer").ClipPlaybackState;
      handles: Record<
        import("../engine/transforms/geometry").TransformHandle,
        import("../engine/transforms/geometry").Point
      > | null;
    };
    setBackgroundTransformForTest(
      transform: Partial<import("../shared/project").LayerTransform>
    ): void;
    setVideoPlaybackForTest(playing: boolean, time: number): void;
    selectSimpleEffect(
      effect:
        | import("../shared/project").VisualizerPluginId
        | "projectM"
        | "none"
    ): Promise<void>;
    configureExportAudit(options: {
      audioPath: string;
      coverPath: string | null;
      title: string;
      artist: string;
      effect:
        | import("../shared/project").VisualizerPluginId
        | "projectM"
        | "none";
      effectOpacity?: number;
    }): Promise<void>;
    importSimplePresetsAt(
      kind: "files" | "folder" | "zip",
      mode: "copy" | "link",
      paths: string[]
    ): Promise<import("../shared/presets").PresetImportReport | null>;
    refreshSimplePresetLibrary(): Promise<void>;
    simplePresetLibraryState(): {
      total: number;
      valid: number;
      displayed: number;
      selectedId: string;
        search: string;
        filter: string;
        selectedText: string;
        countText: string;
        names: string[];
        records: Array<{
          id: string;
          name: string;
          path: string;
          status: string;
          quarantined: boolean;
          favorite: boolean;
          originKind: string;
          sourcePath: string;
          textureCount: number;
          missingTextureCount: number;
        }>;
      };
    simpleLayerSelectorState(): {
      selectedLayerId: string;
      selectedText: string;
      selectionLocked: boolean;
      guidesVisible: boolean;
      buttons: Array<{
        id: string;
        disabled: boolean;
        selected: boolean;
        stateText: string;
      }>;
    };
    projectStageState(): {
      format: "9:16" | "1:1" | "4:3" | "16:9";
      canvas: { width: number; height: number };
      export: { width: number; height: number };
      preview: { width: number; height: number };
      zoom: number;
      zoomMode: "fit" | "manual";
      selectionLocked: boolean;
      guidesVisible: boolean;
      stage: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
      viewport: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
      panel: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
      workspace: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
      waveform: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
      transport: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
      } | null;
    };
    setProjectFormat(format: "9:16" | "1:1" | "4:3" | "16:9"): void;
    setPreviewZoomForTest(value: number, mode: "fit" | "manual"): void;
    setLayerSelectionLockForTest(enabled: boolean): void;
    setStageGuidesForTest(enabled: boolean): void;
    setEffectTransformForTest(
      transform: Partial<import("../shared/project").LayerTransform>
    ): void;
    setSimplePresetTestOptions(count: number): void;
    presetComboboxState(): {
      open: boolean;
      opens: "up" | "down" | "";
      count: number;
      activeIndex: number;
      selectedValue: string;
      scrollTop: number;
      rect: { left: number; top: number; right: number; bottom: number };
      viewport: { width: number; height: number };
    };
    selectLayerForTest(id: string): void;
    visibleControlsAudit(): {
      registered: number;
      connected: number;
      visible: number;
      visibleWithoutHandler: string[];
    };
    togglePlayback(): Promise<void>;
    stopPlayback(): void;
    seek(seconds: number): void;
    setProjectMEnabled(enabled: boolean): void;
    presetCommand(command: "previous" | "next" | "random" | "restart"): Promise<void>;
    setPresetAutomation(
      enabled: boolean,
      intervalSeconds: number,
      seed: number
    ): void;
    selectPreset(id: string, forceHardCut?: boolean): Promise<boolean>;
    setPlaylist(ids: string[], startId: string): void;
    setRestoreAuditState(startId: string): void;
    setPresetLocked(locked: boolean): Promise<void>;
    configureDemo(
      coverPath: string,
      artist: string,
      title: string,
      fps: 30 | 60
    ): Promise<void>;
    setExportProfile(width: number, height: number, fps: 30 | 60): void;
    undo(): boolean;
    redo(): boolean;
    saveProjectAt(path: string): Promise<string>;
    openProjectAt(path: string): Promise<void>;
    createProjectPreset(
      name: string,
      includeAssets?: import("../shared/projectPreset").ProjectPresetAssetOptions
    ): Promise<import("../shared/projectPreset").ProjectPresetLibraryRecord>;
    importProjectPresetAt(
      path: string
    ): Promise<import("../shared/projectPreset").ProjectPresetLibraryRecord>;
    exportProjectPresetAt(id: string, path: string): Promise<string>;
    previewProjectPreset(
      id: string
    ): Promise<import("../shared/projectPreset").ProjectPresetPreview>;
    applyProjectPreset(id: string, allowPartial?: boolean): Promise<void>;
    relinkAssetAt(
      assetId: string,
      path: string,
      confirmHashMismatch?: boolean
    ): Promise<void>;
    exportAt(path: string): Promise<import("../shared/ipc").ExportProgress>;
    startExportAt(path: string): Promise<string | null>;
    cancelExportJob(): Promise<boolean>;
    clearExportProgressHistory(): void;
    exportProgressHistory(): import("../shared/ipc").ExportProgress[];
    selectionHandles(): Record<
      import("../engine/transforms/geometry").TransformHandle,
      import("../engine/transforms/geometry").Point
    > | null;
    snapshot(): AvsRuntimeTestSnapshot;
  }

  interface Window {
    avs: AvsApi;
    __avsRuntimeTest?: AvsRuntimeTestApi;
  }
}

export {};
