/* eslint-disable no-undef */
/**
 * WebRTC peer connection service for Companion Mode
 * Uses browser's native RTCPeerConnection + WebSocket signaling
 */

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface CompanionConfig {
  signalingUrl: string;
  sessionId: string;
  iceServers?: RTCIceServer[];
}

export interface SignalingMessage {
  type: string;
  sdp?: string;
  candidate?: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
  state?: string;
  text?: string;
  done?: boolean;
  message?: string;
  sample_rate?: number;
  seq?: number;
  timestamp?: number;
  session_id?: string;
}

export type VadState = 'idle' | 'listening' | 'speaking' | 'barge_in' | 'unknown';

type Listener<T> = (value: T) => void;

class ObservableValue<T> {
  private _value: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    return this._value;
  }

  set value(v: T) {
    this._value = v;
    this.listeners.forEach((l) => l(v));
  }

  subscribe(l: Listener<T>): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export class WebRtcCompanion {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private config: CompanionConfig;
  private mediaStream: MediaStream | null = null;

  public state = new ObservableValue<ConnectionState>('idle');
  public vadState = new ObservableValue<VadState>('idle');
  public transcript = new ObservableValue<string>('');
  public error = new ObservableValue<string | null>(null);
  public audioLevel = new ObservableValue<number>(0);

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelTimer: number | null = null;
  private onTranscriptionCallback?: (text: string, done: boolean) => void;
  private onVadCallback?: (state: VadState) => void;

  constructor(config: CompanionConfig) {
    this.config = config;
  }

  onTranscription(cb: (text: string, done: boolean) => void) {
    this.onTranscriptionCallback = cb;
  }

  onVad(cb: (state: VadState) => void) {
    this.onVadCallback = cb;
  }

  async start(): Promise<boolean> {
    if (
      this.state.value === 'connected' ||
      this.state.value === 'connecting'
    ) {
      return this.state.value === 'connected';
    }
    this.state.value = 'connecting';
    this.error.value = null;
    this.transcript.value = '';

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
        video: false,
      });

      this.pc = new RTCPeerConnection({
        iceServers: this.config.iceServers ?? [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      this.pc.addEventListener('iceconnectionstatechange', () => {
        if (!this.pc) return;
        switch (this.pc.iceConnectionState) {
          case 'connected':
          case 'completed':
            this.state.value = 'connected';
            break;
          case 'disconnected':
            this.state.value = 'disconnected';
            break;
          case 'failed':
            this.state.value = 'failed';
            this.error.value = 'ICE connection failed';
            break;
          case 'closed':
            this.state.value = 'closed';
            break;
        }
      });

      this.pc.addEventListener('track', (ev) => {
        const [remoteStream] = ev.streams;
        this.playRemoteAudio(remoteStream);
      });

      this.mediaStream.getTracks().forEach((track) => {
        if (this.pc && this.mediaStream) {
          this.pc.addTrack(track, this.mediaStream);
        }
      });

      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await this.pc.setLocalDescription(offer);

      this.connectSignaling();
      this.startAudioLevelMonitor();

      return true;
    } catch (e) {
      this.error.value = e instanceof Error ? e.message : String(e);
      this.state.value = 'failed';
      await this.cleanup();
      return false;
    }
  }

  private connectSignaling() {
    const url = this.config.signalingUrl;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      if (this.pc?.localDescription) {
        this.sendSignaling({
          type: 'webrtc_offer',
          sdp: this.pc.localDescription.sdp,
        });
      }
    });

    this.ws.addEventListener('message', (ev) => {
      try {
        const msg: SignalingMessage = JSON.parse(ev.data);
        this.handleSignalingMessage(msg);
      } catch (e) {
        console.error('[WebRTC] Failed to parse signaling message', e);
      }
    });

    this.ws.addEventListener('error', () => {
      this.error.value = 'Signaling connection error';
    });

    this.ws.addEventListener('close', () => {
      if (this.state.value === 'connected') {
        this.state.value = 'disconnected';
      }
    });
  }

  private async handleSignalingMessage(msg: SignalingMessage) {
    switch (msg.type) {
      case 'webrtc_answer':
        if (msg.sdp && this.pc) {
          await this.pc.setRemoteDescription({
            type: 'answer',
            sdp: msg.sdp,
          });
        }
        break;

      case 'webrtc_disconnected':
        this.state.value = 'disconnected';
        break;

      case 'vad_state':
        if (msg.state) {
          const state = msg.state as VadState;
          this.vadState.value = state;
          this.onVadCallback?.(state);
        }
        break;

      case 'transcription':
        if (msg.text !== undefined) {
          if (msg.done) {
            this.transcript.value = msg.text;
          }
          this.onTranscriptionCallback?.(msg.text, msg.done ?? false);
        }
        break;

      case 'error':
        this.error.value = msg.message ?? 'Unknown error';
        break;
    }
  }

  private sendSignaling(msg: SignalingMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private playRemoteAudio(stream: MediaStream) {
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.play().catch((e) => {
      console.warn('[WebRTC] Auto-play blocked, user gesture required', e);
    });
  }

  private startAudioLevelMonitor() {
    if (!this.mediaStream) return;
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const update = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
      this.audioLevel.value = sum / data.length / 255;

      if (
        this.state.value === 'connected' &&
        this.audioLevel.value > 0.1 &&
        this.vadState.value !== 'speaking'
      ) {
        this.sendBargeIn();
      }
    };
    this.levelTimer = window.setInterval(update, 100);
  }

  private sendBargeIn() {
    this.sendSignaling({ type: 'webrtc_barge_in' });
  }

  async stop(): Promise<void> {
    this.sendSignaling({ type: 'webrtc_barge_in' });
    await this.cleanup();
  }

  private async cleanup() {
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state.value = 'closed';
    this.vadState.value = 'idle';
    this.audioLevel.value = 0;
  }
}

export function createCompanion(config: CompanionConfig): WebRtcCompanion {
  return new WebRtcCompanion(config);
}
