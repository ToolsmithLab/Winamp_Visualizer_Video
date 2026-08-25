import {
  analyzePcm,
  emptyAudioSnapshot,
  type AudioSnapshot
} from "../shared/audioAnalysis";

export type { AudioSnapshot } from "../shared/audioAnalysis";

export class AudioEngine {
  readonly element = new Audio();
  private objectUrl: string | null = null;
  private waveform: number[] = [];
  private decoded: AudioBuffer | null = null;

  async load(bytes: Uint8Array, mimeType: string): Promise<void> {
    this.clear();
    const byteBuffer = bytes.slice().buffer as ArrayBuffer;
    const blob = new Blob([byteBuffer], { type: mimeType });
    this.objectUrl = URL.createObjectURL(blob);
    this.element.src = this.objectUrl;
    this.element.preload = "auto";

    const decodeContext = new AudioContext();
    try {
      const decoded = await decodeContext.decodeAudioData(
        byteBuffer.slice(0)
      );
      this.decoded = decoded;
      this.waveform = this.calculateWaveform(decoded, 720);
    } finally {
      await decodeContext.close();
    }

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Il file audio non può essere decodificato."));
      };
      const cleanup = () => {
        this.element.removeEventListener("loadedmetadata", onReady);
        this.element.removeEventListener("error", onError);
      };
      this.element.addEventListener("loadedmetadata", onReady);
      this.element.addEventListener("error", onError);
      this.element.load();
    });
  }

  async toggle(): Promise<boolean> {
    if (this.element.paused) {
      let timer = 0;
      try {
        await Promise.race([
          this.element.play(),
          new Promise<never>((_resolve, reject) => {
            timer = window.setTimeout(
              () =>
                reject(
                  new Error(
                    "Il dispositivo audio non ha avviato la riproduzione entro 5 secondi."
                  )
                ),
              5_000
            );
          })
        ]);
      } catch (error) {
        this.element.pause();
        throw error;
      } finally {
        window.clearTimeout(timer);
      }
      return true;
    }
    this.element.pause();
    return false;
  }

  stop(): void {
    this.element.pause();
    this.element.currentTime = 0;
  }

  clear(): void {
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.decoded = null;
    this.waveform = [];
    this.disposeUrl();
  }

  seek(seconds: number): void {
    this.element.currentTime = Math.max(
      0,
      Math.min(seconds, this.element.duration || 0)
    );
  }

  snapshot(fps: 30 | 60 = 60, time = this.currentTime): AudioSnapshot {
    const decoded = this.decoded;
    if (!decoded) return emptyAudioSnapshot();
    const frame = Math.max(0, Math.floor(time * fps));
    const analysisEnd = Math.min(decoded.duration, (frame + 1) / fps);
    const frames = 1024;
    const analysisStart = Math.max(0, analysisEnd - frames / decoded.sampleRate);
    return analyzePcm(
      this.pcmBetween(analysisStart, analysisEnd),
      2,
      decoded.sampleRate
    );
  }

  get duration(): number {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0;
  }

  get currentTime(): number {
    return this.element.currentTime;
  }

  get waveformData(): readonly number[] {
    return this.waveform;
  }

  get sampleRate(): number {
    return this.decoded?.sampleRate ?? 0;
  }

  get hasPcm(): boolean {
    return this.decoded !== null;
  }

  pcmBetween(startSeconds: number, endSeconds: number): Float32Array {
    const decoded = this.decoded;
    if (!decoded || endSeconds <= startSeconds) return new Float32Array(0);
    const start = Math.max(
      0,
      Math.min(decoded.length, Math.floor(startSeconds * decoded.sampleRate))
    );
    const end = Math.max(
      start,
      Math.min(decoded.length, Math.floor(endSeconds * decoded.sampleRate))
    );
    const frames = end - start;
    const interleaved = new Float32Array(frames * 2);
    const left = decoded.getChannelData(0);
    const right =
      decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;
    for (let frame = 0; frame < frames; frame += 1) {
      interleaved[frame * 2] = left[start + frame] ?? 0;
      interleaved[frame * 2 + 1] = right[start + frame] ?? 0;
    }
    return interleaved;
  }

  analyzeMusicEvents(): number[] {
    const decoded = this.decoded;
    if (!decoded) return [];
    const channel = decoded.getChannelData(0);
    const windowFrames = Math.max(1, Math.round(decoded.sampleRate * 0.05));
    const energies: number[] = [];
    for (let start = 0; start < channel.length; start += windowFrames) {
      let sum = 0;
      const end = Math.min(channel.length, start + windowFrames);
      for (let index = start; index < end; index += 1) {
        const sample = channel[index] ?? 0;
        sum += sample * sample;
      }
      energies.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    const events: number[] = [];
    let lastEvent = -10;
    for (let index = 20; index < energies.length; index += 1) {
      let average = 0;
      for (let previous = index - 20; previous < index; previous += 1) {
        average += energies[previous] ?? 0;
      }
      average /= 20;
      const energy = energies[index] ?? 0;
      const prior = energies[index - 1] ?? 0;
      const seconds = (index * windowFrames) / decoded.sampleRate;
      if (
        energy > 0.08 &&
        energy > average * 1.65 &&
        energy - prior > 0.025 &&
        seconds - lastEvent >= 2
      ) {
        events.push(Number(seconds.toFixed(3)));
        lastEvent = seconds;
      }
    }
    return events.slice(0, 2_000);
  }

  private calculateWaveform(buffer: AudioBuffer, points: number): number[] {
    const channel = buffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(channel.length / points));
    const result: number[] = [];
    for (let point = 0; point < points; point += 1) {
      const start = point * blockSize;
      let peak = 0;
      for (
        let index = start;
        index < Math.min(start + blockSize, channel.length);
        index += 1
      ) {
        peak = Math.max(peak, Math.abs(channel[index] ?? 0));
      }
      result.push(peak);
    }
    return result;
  }

  private disposeUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
