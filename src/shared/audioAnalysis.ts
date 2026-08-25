export const AUDIO_ANALYSIS_FRAMES = 1024;
export const AUDIO_ANALYSIS_BINS = 128;

const HANN_WINDOW = Float64Array.from(
  { length: AUDIO_ANALYSIS_FRAMES },
  (_, index) =>
    0.5 -
    0.5 * Math.cos((2 * Math.PI * index) / (AUDIO_ANALYSIS_FRAMES - 1))
);

export interface AudioSnapshot {
  volume: number;
  bass: number;
  mid: number;
  high: number;
  spectrum: Uint8Array;
  waveform: Uint8Array;
}

export function emptyAudioSnapshot(): AudioSnapshot {
  return {
    volume: 0,
    bass: 0,
    mid: 0,
    high: 0,
    spectrum: new Uint8Array(AUDIO_ANALYSIS_BINS),
    waveform: new Uint8Array(AUDIO_ANALYSIS_BINS).fill(128)
  };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function fftMagnitudes(mono: Float64Array): Float64Array {
  const real = new Float64Array(AUDIO_ANALYSIS_FRAMES);
  const imaginary = new Float64Array(AUDIO_ANALYSIS_FRAMES);
  for (let index = 0; index < real.length; index += 1) {
    real[index] = mono[index] * (HANN_WINDOW[index] ?? 0);
  }
  for (let index = 1, reversed = 0; index < real.length; index += 1) {
    let bit = real.length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const value = real[index];
      real[index] = real[reversed];
      real[reversed] = value;
    }
  }
  for (let length = 2; length <= real.length; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const baseReal = Math.cos(angle);
    const baseImaginary = Math.sin(angle);
    for (let start = 0; start < real.length; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal =
          (real[odd] ?? 0) * twiddleReal -
          (imaginary[odd] ?? 0) * twiddleImaginary;
        const oddImaginary =
          (real[odd] ?? 0) * twiddleImaginary +
          (imaginary[odd] ?? 0) * twiddleReal;
        const evenReal = real[even] ?? 0;
        const evenImaginary = imaginary[even] ?? 0;
        real[even] = evenReal + oddReal;
        imaginary[even] = evenImaginary + oddImaginary;
        real[odd] = evenReal - oddReal;
        imaginary[odd] = evenImaginary - oddImaginary;
        const nextReal =
          twiddleReal * baseReal - twiddleImaginary * baseImaginary;
        twiddleImaginary =
          twiddleReal * baseImaginary + twiddleImaginary * baseReal;
        twiddleReal = nextReal;
      }
    }
  }
  const magnitudes = new Float64Array(AUDIO_ANALYSIS_BINS);
  for (let bin = 0; bin < magnitudes.length; bin += 1) {
    magnitudes[bin] = Math.min(
      1,
      Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0) /
        (AUDIO_ANALYSIS_FRAMES * 0.25)
    );
  }
  return magnitudes;
}

export function analyzePcm(
  interleaved: Float32Array,
  channels: number,
  sampleRate: number
): AudioSnapshot {
  const channelCount = Math.max(1, Math.floor(channels));
  const availableFrames = Math.floor(interleaved.length / channelCount);
  if (availableFrames === 0 || sampleRate <= 0) return emptyAudioSnapshot();

  const mono = new Float64Array(AUDIO_ANALYSIS_FRAMES);
  const sourceStart = Math.max(0, availableFrames - AUDIO_ANALYSIS_FRAMES);
  const targetStart = AUDIO_ANALYSIS_FRAMES - (availableFrames - sourceStart);
  let squareSum = 0;
  for (let sourceFrame = sourceStart; sourceFrame < availableFrames; sourceFrame += 1) {
    let sample = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      sample += interleaved[sourceFrame * channelCount + channel] ?? 0;
    }
    sample /= channelCount;
    const target = targetStart + sourceFrame - sourceStart;
    mono[target] = sample;
    squareSum += sample * sample;
  }

  const waveform = new Uint8Array(AUDIO_ANALYSIS_BINS);
  for (let bin = 0; bin < waveform.length; bin += 1) {
    const source = Math.min(
      mono.length - 1,
      Math.floor((bin / Math.max(1, waveform.length - 1)) * mono.length)
    );
    waveform[bin] = clampByte(128 + mono[source] * 127);
  }

  const spectrum = new Uint8Array(AUDIO_ANALYSIS_BINS);
  const magnitudes = fftMagnitudes(mono);
  for (let bin = 0; bin < AUDIO_ANALYSIS_BINS; bin += 1) {
    spectrum[bin] = clampByte(
      Math.sqrt(Math.min(1, (magnitudes[bin] ?? 0) * 1.8)) * 255
    );
  }

  const averageBand = (minimumHz: number, maximumHz: number): number => {
    const hzPerBin = sampleRate / AUDIO_ANALYSIS_FRAMES;
    const start = Math.max(0, Math.floor(minimumHz / hzPerBin));
    const end = Math.min(magnitudes.length, Math.max(start + 1, Math.ceil(maximumHz / hzPerBin)));
    let total = 0;
    for (let index = start; index < end; index += 1) {
      total += Math.sqrt(Math.min(1, (magnitudes[index] ?? 0) * 1.8));
    }
    return Math.min(1, total / Math.max(1, end - start));
  };

  const volume = Math.min(
    1,
    Math.sqrt(squareSum / Math.max(1, availableFrames)) * 2.2
  );
  return {
    volume,
    bass: averageBand(20, 250),
    mid: averageBand(250, 4_000),
    high: averageBand(4_000, Math.min(sampleRate / 2, 12_000)),
    spectrum,
    waveform
  };
}

export class PcmAnalysisWindow {
  private readonly values: Float32Array;
  private frames = 0;

  constructor(
    private readonly channels: number,
    private readonly sampleRate: number
  ) {
    this.values = new Float32Array(AUDIO_ANALYSIS_FRAMES * channels);
  }

  reset(): void {
    this.values.fill(0);
    this.frames = 0;
  }

  push(samples: Float32Array): AudioSnapshot {
    const incomingFrames = Math.floor(samples.length / this.channels);
    if (incomingFrames >= AUDIO_ANALYSIS_FRAMES) {
      const start = (incomingFrames - AUDIO_ANALYSIS_FRAMES) * this.channels;
      this.values.set(samples.subarray(start, start + this.values.length));
      this.frames = AUDIO_ANALYSIS_FRAMES;
      return this.snapshot();
    }
    const retainedFrames = Math.min(
      this.frames,
      AUDIO_ANALYSIS_FRAMES - incomingFrames
    );
    if (retainedFrames > 0) {
      const source = (this.frames - retainedFrames) * this.channels;
      this.values.copyWithin(0, source, this.frames * this.channels);
    }
    this.values.set(samples, retainedFrames * this.channels);
    this.frames = retainedFrames + incomingFrames;
    return this.snapshot();
  }

  snapshot(): AudioSnapshot {
    return analyzePcm(
      this.values.subarray(0, this.frames * this.channels),
      this.channels,
      this.sampleRate
    );
  }
}
