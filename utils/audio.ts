import { ParsedNote, Tuning, TICKS_QUARTER } from '../types';
import { BASE_TUNING, ASSETS_BASE_URL } from '../constants';
// @ts-ignore
import * as lamejs from 'lamejs';

// Helper for WAV encoding (Still kept as fallback/utility)
function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample,
      offset = 0,
      pos = 0;

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit (hardcoded in this parser)

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < len) {
    for(i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(offset, sample, true);       // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: any) {
    view.setUint16(offset, data, true);
    offset += 2;
  }

  function setUint32(data: any) {
    view.setUint32(offset, data, true);
    offset += 4;
  }
}

class AudioEngine {
  public ctx: AudioContext | null = null;
  private isPlaying = false;
  private nextNoteIndex = 0;
  private startTime = 0;
  private schedulerId: number | null = null;
  private bpm = 120;
  private playbackSpeed = 1.0; 
  private notes: ParsedNote[] = [];
  private onTickCallback: ((tick: number) => void) | null = null;
  private onEndedCallback: (() => void) | null = null; 
  private animationFrameId: number | null = null;
  private currentTuning: Tuning = BASE_TUNING;
  
  private isMetronomeEnabled = false;
  private nextBeatTime = 0;
  private currentBeatIndex = 0; 
  private rhythmMode: 'binary' | 'ternary' = 'binary'; 
  private shakerBuffer: AudioBuffer | null = null;

  private stringBuffers: Record<string, AudioBuffer> = {};
  private samplesLoaded = false;
  
  // Destination node for MediaRecorder (Stream)
  private dest: MediaStreamAudioDestinationNode | null = null;

  // Source node for playing back pre-rendered audio (Video Export)
  private prerenderedSource: AudioBufferSourceNode | null = null;

  constructor() {}

  public init() {
    if (!this.ctx) {
      // OPTIMIZATION: 'latencyHint: playback' tells the browser to prioritize 
      // smooth audio over low latency, using larger buffers to prevent stuttering.
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'playback'
      });
      this.dest = this.ctx.createMediaStreamDestination();
      this.shakerBuffer = this.createNoiseBuffer(this.ctx);
      
      // FIX: Keep-Alive Oscillator
      // Creates an inaudible signal to keep the MediaStream track active
      // This prevents browsers from dropping the audio track if the recording starts with silence
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 100; // Low frequency
      gain.gain.value = 0.000001; // Effectively silent
      osc.connect(gain);
      gain.connect(this.dest);
      osc.start();
    }
  }

  public setMetronome(enabled: boolean) { this.isMetronomeEnabled = enabled; }
  public setRhythmMode(mode: 'binary' | 'ternary') { this.rhythmMode = mode; }
  public setPlaybackSpeed(speed: number) { this.playbackSpeed = speed; }

  private createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
      const bufferSize = ctx.sampleRate * 2.0; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
      }
      return buffer;
  }

  private playShaker(ctx: BaseAudioContext, dest: AudioNode, time: number, accent: boolean = false, buffer: AudioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = accent ? 1500 : 1000; 
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, time);
      const peakGain = accent ? 0.35 : 0.15;
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.005); 
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05); 
      source.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      source.start(time);
      source.stop(time + 0.1);
  }

  public async loadSamples() {
     if (!this.ctx) return;
     const uniqueNotes = Array.from(new Set(Object.values(this.currentTuning)));
     
     const loadPromises = uniqueNotes.map(async (note) => {
        if (this.stringBuffers[note]) return;
        try {
            const url = `${ASSETS_BASE_URL}samples/${encodeURIComponent(note)}.mp3`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Fichier introuvable sur ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
            this.stringBuffers[note] = audioBuffer;
        } catch (e) {
            console.warn(`Sample manquant pour ${note}.`, e);
            if (this.ctx) {
                this.stringBuffers[note] = this.generateFallbackBuffer(this.ctx, this.getNoteFreq(note));
            }
        }
     });
     await Promise.all(loadPromises);
     this.samplesLoaded = true;
  }

  private getNoteFreq(note: string): number {
    const noteMap: Record<string, number> = {
      'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
      'C5': 523.25, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99
    };
    return noteMap[note] || 440;
  }

  private generateFallbackBuffer(ctx: BaseAudioContext, freq: number): AudioBuffer {
     const sr = ctx.sampleRate;
     const len = sr * 1.0; 
     const buffer = ctx.createBuffer(1, len, sr);
     const data = buffer.getChannelData(0);
     for(let i=0; i<len; i++) {
         const t = i/sr;
         data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-4 * t);
     }
     return buffer;
  }

  public getAudioStream(): MediaStream | null {
    if (!this.dest) this.init();
    return this.dest ? this.dest.stream : null;
  }

  public setNotes(notes: ParsedNote[]) {
    this.notes = notes.filter(n => n.stringId !== 'TEXTE' && n.stringId !== 'PAGE_BREAK');
  }

  public setBpm(bpm: number) { this.bpm = bpm; }
  
  public setTuning(tuning: Tuning) {
    this.currentTuning = tuning;
    if (this.ctx) this.loadSamples();
  }

  public setOnTick(cb: (tick: number) => void) { this.onTickCallback = cb; }
  public setOnEnded(cb: () => void) { this.onEndedCallback = cb; }

  public get isAudioPlaying(): boolean { return this.isPlaying; }

  public getCurrentTick(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    const effectiveBpm = this.bpm * this.playbackSpeed;
    const secondsPerTick = (60 / effectiveBpm) / 12;
    return (this.ctx.currentTime - this.startTime) / secondsPerTick;
  }

  public async play(startTick: number = 0) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.loadSamples();
    this.isPlaying = true;

    const effectiveBpm = this.bpm * this.playbackSpeed;
    const secondsPerTick = (60 / effectiveBpm) / 12;

    let effectiveStartTick = startTick;
    if (startTick === 0) {
        effectiveStartTick = - (2 * TICKS_QUARTER); 
    }

    this.startTime = this.ctx.currentTime - (effectiveStartTick * secondsPerTick) + 0.1; 

    this.nextNoteIndex = this.notes.findIndex(n => n.tick >= effectiveStartTick);
    if (this.nextNoteIndex === -1) this.nextNoteIndex = this.notes.length; 
    
    const ticksPerBeat = TICKS_QUARTER;
    const beatsPassed = Math.ceil(effectiveStartTick / ticksPerBeat);
    const nextBeatTick = beatsPassed * ticksPerBeat;
    
    this.currentBeatIndex = beatsPassed; 
    this.nextBeatTime = this.startTime + (nextBeatTick * secondsPerTick);

    this.schedule();
    this.updateTickUI();
  }

  public stop() {
    this.isPlaying = false;
    if (this.schedulerId) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }
    // Stop pre-rendered playback if active
    if (this.prerenderedSource) {
        try { this.prerenderedSource.stop(); } catch(e) {}
        this.prerenderedSource = null;
    }
  }

  private schedule = () => {
    if (!this.isPlaying || !this.ctx) return;

    // Increased buffer/lookahead to prevent audio glitches
    const lookahead = 100.0; 
    const scheduleAheadTime = 0.4;
    
    const effectiveBpm = this.bpm * this.playbackSpeed;
    const secondsPerTick = (60 / effectiveBpm) / 12;
    const secondsPerBeat = (60 / effectiveBpm);
    const beatsPerMeasure = this.rhythmMode === 'binary' ? 4 : 3;

    if (this.isMetronomeEnabled) {
        while (this.nextBeatTime < this.ctx.currentTime + scheduleAheadTime) {
            if (this.nextBeatTime >= this.ctx.currentTime - 0.05) {
                const normalizedBeatIndex = ((this.currentBeatIndex % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
                const isAccent = normalizedBeatIndex === 0;
                if (this.shakerBuffer) this.playShaker(this.ctx, this.ctx.destination, this.nextBeatTime, isAccent, this.shakerBuffer);
            }
            this.nextBeatTime += secondsPerBeat;
            this.currentBeatIndex++;
        }
    }

    while (this.nextNoteIndex < this.notes.length) {
      const note = this.notes[this.nextNoteIndex];
      const noteTime = this.startTime + (note.tick * secondsPerTick);

      if (noteTime < this.ctx.currentTime + scheduleAheadTime) {
        this.playNote(this.ctx, this.ctx.destination, note, noteTime);
        this.nextNoteIndex++;
      } else {
        break;
      }
    }
    
    if (this.nextNoteIndex >= this.notes.length) {
        const lastNote = this.notes[this.notes.length - 1];
        if (lastNote) {
            const endTime = this.startTime + (lastNote.tick * secondsPerTick) + 0.5;
            if (this.ctx.currentTime > endTime) {
                this.stop();
                if (this.onEndedCallback) this.onEndedCallback();
                return;
            }
        } else {
            this.stop();
            if (this.onEndedCallback) this.onEndedCallback();
            return;
        }
    }

    this.schedulerId = window.setTimeout(this.schedule, lookahead);
  };

  private updateTickUI = () => {
    if (!this.isPlaying || !this.ctx) return;
    const effectiveBpm = this.bpm * this.playbackSpeed;
    const secondsPerTick = (60 / effectiveBpm) / 12;
    // Calculate tick from currentTime vs startTime
    // This works for both real-time scheduling AND pre-rendered playback
    // because playPrerendered sets startTime to (currentTime - startOffset)
    const currentTick = (this.ctx.currentTime - this.startTime) / secondsPerTick;
    
    if (this.onTickCallback) this.onTickCallback(currentTick);
    this.animationFrameId = requestAnimationFrame(this.updateTickUI);
  }

  private playNote(ctx: BaseAudioContext, dest: AudioNode, note: ParsedNote, time: number) {
    if (time < ctx.currentTime - 0.05) return;
    const noteName = this.currentTuning[note.stringId];
    if (!noteName) return; 
    const buffer = this.stringBuffers[noteName];
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    
    const velocity = 0.35 + Math.random() * 0.1; 
    gain.gain.value = velocity;

    source.connect(gain);
    gain.connect(dest);
    
    // Also connect to recorder dest if available (for real-time recording)
    // BUT only if we are in real-time mode (not pre-rendered playback)
    if (this.dest && ctx === this.ctx && !this.prerenderedSource) {
        gain.connect(this.dest);
    }

    source.start(time);
  }

  /**
   * Joue le son d'une corde immédiatement (Preview)
   */
  public async previewString(stringId: string) {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
          try { await this.ctx.resume(); } catch(e) {}
      }
      
      const noteName = this.currentTuning[stringId];
      if (!noteName) return;
      
      // Ensure specific sample is loaded if not already (optimistic)
      if (!this.stringBuffers[noteName]) {
          await this.loadSamples();
      }

      const buffer = this.stringBuffers[noteName];
      if (buffer && this.ctx) {
          const source = this.ctx.createBufferSource();
          source.buffer = buffer;
          const gain = this.ctx.createGain();
          gain.gain.value = 0.4;
          source.connect(gain);
          gain.connect(this.ctx.destination);
          source.start();
      }
  }

  /**
   * Internal method to render audio to a buffer using OfflineAudioContext.
   */
  public async renderProjectToBuffer(): Promise<AudioBuffer | null> {
    if (this.notes.length === 0) return null;
    await this.loadSamples();

    // 1. Calculate duration based on playback speed (Slow Motion support)
    const lastNote = this.notes[this.notes.length - 1];
    
    // Apply speed factor: lower speed = longer duration
    const effectiveBpm = this.bpm * this.playbackSpeed; 
    
    const secondsPerTick = (60 / effectiveBpm) / 12;
    const duration = (lastNote.tick * secondsPerTick) + 3.0; // +3s tail

    // 2. Create Offline Context
    // FIX: Match sample rate with the main context to avoid resampling issues during playback
    // If ctx is not initialized, use 44100 as fallback
    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    // 3. Render Notes
    this.notes.forEach(note => {
        const noteTime = note.tick * secondsPerTick;
        const noteName = this.currentTuning[note.stringId];
        if (noteName && this.stringBuffers[noteName]) {
           const source = offlineCtx.createBufferSource();
           source.buffer = this.stringBuffers[noteName];
           const gain = offlineCtx.createGain();
           gain.gain.value = 0.4;
           source.connect(gain);
           gain.connect(offlineCtx.destination);
           source.start(noteTime);
        }
    });

    // 4. Render
    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
  }

  /**
   * Plays a pre-rendered buffer to the main destination AND the recorder stream.
   * This is used for video export to ensure perfect sync and no stutter.
   * @param buffer The pre-rendered audio buffer
   * @param monitor If true, plays to speakers. If false, plays ONLY to the recorder stream (for silence/performance).
   */
  public playPrerendered(buffer: AudioBuffer, monitor: boolean = true) {
      this.init();
      if (!this.ctx || !this.dest) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      this.isPlaying = true;
      
      // Setup Source
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      this.prerenderedSource = source;

      // Connect to speakers (monitor) if requested
      if (monitor) {
          source.connect(this.ctx.destination);
      }
      
      // ALWAYS Connect to recorder (capture)
      source.connect(this.dest);

      // Sync math setup
      // CRITICAL: Must use effective BPM matching the rendered buffer (Speed)
      const effectiveBpm = this.bpm * this.playbackSpeed; 
      const secondsPerTick = (60 / effectiveBpm) / 12;
      
      // Start 'now'
      this.startTime = this.ctx.currentTime;
      
      source.onended = () => {
          this.stop();
          if (this.onEndedCallback) this.onEndedCallback();
      };

      source.start();
      
      // Start UI loop to update visualizer
      this.updateTickUI(); 
  }

  public async exportWav(): Promise<Blob | null> {
      // Audio export usually ignores visual playback speed unless explicitly requested.
      // For now, we keep audio export at 1.0x (standard tempo) to just export the song.
      // If needed, we could inject this.playbackSpeed here too.
      // Temporarily resetting speed for audio-only export to ensure standard pitch/speed? 
      // User request implies video slow motion. Let's assume audio export is standard.
      const savedSpeed = this.playbackSpeed;
      this.playbackSpeed = 1.0; 
      const buffer = await this.renderProjectToBuffer();
      this.playbackSpeed = savedSpeed;

      if (!buffer) return null;
      return bufferToWave(buffer, buffer.length);
  }

  public async exportMp3(): Promise<Blob | null> {
      // Standard MP3 export at 1.0x speed
      const savedSpeed = this.playbackSpeed;
      this.playbackSpeed = 1.0;
      const buffer = await this.renderProjectToBuffer();
      this.playbackSpeed = savedSpeed;
      
      if (!buffer) return null;

      const channels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 320); // 320kbps

      const left = buffer.getChannelData(0);
      const right = channels > 1 ? buffer.getChannelData(1) : left; // Fallback for mono

      const sampleBlockSize = 1152;
      const mp3Data = [];

      // Create Int16 arrays for lamejs
      const samplesLeft = new Int16Array(left.length);
      const samplesRight = new Int16Array(right.length);

      // Convert Float32 to Int16
      for (let i = 0; i < left.length; i++) {
        let valLeft = Math.max(-1, Math.min(1, left[i]));
        samplesLeft[i] = valLeft < 0 ? valLeft * 0x8000 : valLeft * 0x7FFF;

        let valRight = Math.max(-1, Math.min(1, right[i]));
        samplesRight[i] = valRight < 0 ? valRight * 0x8000 : valRight * 0x7FFF;
      }

      // Encode in blocks
      for (let i = 0; i < samplesLeft.length; i += sampleBlockSize) {
        const leftChunk = samplesLeft.subarray(i, i + sampleBlockSize);
        const rightChunk = samplesRight.subarray(i, i + sampleBlockSize);
        
        let mp3buf;
        if (channels === 2) {
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }
        
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
      }

      return new Blob(mp3Data, { type: 'audio/mp3' });
  }
}

export const audioEngine = new AudioEngine();