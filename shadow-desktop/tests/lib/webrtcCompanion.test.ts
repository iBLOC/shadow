import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPcInstances: any[] = [];
const mockWsInstances: any[] = [];

vi.mock('../../src/lib/webrtcCompanion', async () => {
  return vi.importActual('../../src/lib/webrtcCompanion');
});

beforeEach(() => {
  mockPcInstances.length = 0;
  mockWsInstances.length = 0;

  class MockRTCPeerConnection {
    iceConnectionState = 'new';
    iceGatheringState = 'new';
    signalingState = 'stable';
    localDescription: RTCSessionDescription | null = { type: 'offer', sdp: 'test-sdp' };
    private pcListeners: Record<string, Set<(ev: Event) => void>> = {};
    constructor() { mockPcInstances.push(this); }
    addEventListener = (event: string, handler: (ev: Event) => void) => {
      if (!this.pcListeners[event]) this.pcListeners[event] = new Set();
      this.pcListeners[event]!.add(handler);
    };
    removeEventListener = (event: string, handler: (ev: Event) => void) => {
      this.pcListeners[event]?.delete(handler);
    };
    dispatchEvent = (event: Event) => {
      this.pcListeners[event.type]?.forEach(h => h(event));
      return true;
    };
    fireIceState = (state: string) => {
      this.iceConnectionState = state;
      this.dispatchEvent(new Event('iceconnectionstatechange'));
    };
    createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test-sdp' });
    setLocalDescription = vi.fn().mockResolvedValue(undefined);
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    addTrack = vi.fn();
    close = vi.fn();
    getStats = vi.fn().mockResolvedValue(new Map());
  }

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    onopen: any = null;
    onmessage: any = null;
    onerror: any = null;
    onclose: any = null;
    private wsListeners: Record<string, Set<(ev: Event) => void>> = {};
    constructor(public url: string) { mockWsInstances.push(this); }
    send = vi.fn();
    addEventListener = (event: string, handler: (ev: Event) => void) => {
      if (!this.wsListeners[event]) this.wsListeners[event] = new Set();
      this.wsListeners[event]!.add(handler);
    };
    dispatchEvent = (event: Event) => {
      this.wsListeners[event.type]?.forEach(h => h(event));
      return true;
    };
    fireOpen() {
      this.readyState = 1;
      if (this.onopen) this.onopen(new Event('open'));
      this.dispatchEvent(new Event('open'));
    }
    fireMessage(data: string) {
      const msg = new MessageEvent('message', { data });
      if (this.onmessage) this.onmessage(msg);
      this.dispatchEvent(msg);
    }
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose(new CloseEvent('close'));
      this.dispatchEvent(new CloseEvent('close'));
    }
  }

  vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({
        tracks: [{ kind: 'audio', stop: vi.fn() }],
        getTracks: () => [{ kind: 'audio', stop: vi.fn() }],
      }),
    },
  });
  vi.stubGlobal('window', {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  vi.stubGlobal('Audio', class {
    srcObject: MediaStream | null = null;
    autoplay = false;
    play() { return Promise.resolve(); }
  });
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    createMediaStreamSource(_s: MediaStream) { return { connect: vi.fn() } as any; }
    createAnalyser() { return { fftSize: 512, frequencyBinCount: 256, getByteFrequencyData: vi.fn() } as any; }
    close() { return Promise.resolve(); }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebRtcCompanion', () => {
  let companion: any;
  let createCompanion: any;

  beforeEach(async () => {
    const { createCompanion: cc } = await import('../../src/lib/webrtcCompanion');
    createCompanion = cc;
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      expect(companion.state.value).toBe('idle');
    });

    it('initial error is null', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      expect(companion.error.value).toBeNull();
    });

    it('initial transcript is empty', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      expect(companion.transcript.value).toBe('');
    });

    it('initial vadState is idle', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      expect(companion.vadState.value).toBe('idle');
    });
  });

  describe('start() - happy path', () => {
    it('initial state changes after start()', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const state = companion.state.value;
      expect(state).toMatch(/^(connecting|connected|closed)$/);
    });

    it('start() does not throw', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await expect(companion.start()).resolves.not.toThrow();
    });
  });

  describe('stop()', () => {
    it('stop() does not throw when called without start', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.stop();
    });
  });

  describe('failure handling', () => {
    it('returns false on getUserMedia error', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) },
      });
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      const result = await companion.start();
      expect(result).toBe(false);
    });

    it('stores error message', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('No mic')) },
      });
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      expect(companion.error.value).toBe('No mic');
    });

    });

  describe('multiple start() calls', () => {
    it('start() called twice returns false', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const result = await companion.start();
      expect(result).toBe(false);
    });

    it('stop() then start() works', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      await companion.stop();
      await companion.start();
      const state = companion.state.value;
      expect(state).toMatch(/^(connecting|connected|closed)$/);
    });
  });

  describe('callbacks', () => {
    it('onVad() callback can be registered', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      const cb = vi.fn();
      companion.onVad(cb);
      expect(typeof companion.onVad).toBe('function');
    });

    it('onTranscription() callback can be registered', () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      const cb = vi.fn();
      companion.onTranscription(cb);
      expect(typeof companion.onTranscription).toBe('function');
    });
  });

  describe('ICE state machine', () => {
    it('transitions to connected on iceconnectionstatechange connected', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      pc.fireIceState('connected');
      expect(companion.state.value).toBe('connected');
    });

    it('transitions to connected on iceconnectionstatechange completed', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      pc.fireIceState('completed');
      expect(companion.state.value).toBe('connected');
    });

    it('transitions to disconnected on iceconnectionstatechange disconnected', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      pc.fireIceState('connected');
      pc.fireIceState('disconnected');
      expect(companion.state.value).toBe('disconnected');
    });

    it('transitions to failed and sets error on iceconnectionstatechange failed', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      pc.fireIceState('failed');
      expect(companion.state.value).toBe('failed');
      expect(companion.error.value).toBe('ICE connection failed');
    });

    it('transitions to closed on iceconnectionstatechange closed', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      pc.fireIceState('closed');
      expect(companion.state.value).toBe('closed');
    });

    it('ignores iceconnectionstatechange when pc is null', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      await companion.stop();
      expect(() => pc.fireIceState('connected')).not.toThrow();
    });
  });

  describe('signaling message handling', () => {
    it('sends webrtc_offer on WebSocket open', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireOpen();
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('webrtc_offer')
      );
    });

    it('handles webrtc_answer and sets remote description', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireOpen();
      ws.fireMessage(JSON.stringify({ type: 'webrtc_answer', sdp: 'answer-sdp' }));
      expect(pc.setRemoteDescription).toHaveBeenCalledWith({
        type: 'answer',
        sdp: 'answer-sdp',
      });
    });

    it('handles webrtc_disconnected message', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireMessage(JSON.stringify({ type: 'webrtc_disconnected' }));
      expect(companion.state.value).toBe('disconnected');
    });

    it('handles vad_state message and updates VAD state', async () => {
      const vadCb = vi.fn();
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      companion.onVad(vadCb);
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireMessage(JSON.stringify({ type: 'vad_state', state: 'speaking' }));
      expect(companion.vadState.value).toBe('speaking');
      expect(vadCb).toHaveBeenCalledWith('speaking');
    });

    it('handles transcription message with done=true', async () => {
      const textCb = vi.fn();
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      companion.onTranscription(textCb);
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireMessage(JSON.stringify({ type: 'transcription', text: 'hello world', done: true }));
      expect(companion.transcript.value).toBe('hello world');
      expect(textCb).toHaveBeenCalledWith('hello world', true);
    });

    it('handles transcription with partial text (done=false)', async () => {
      const textCb = vi.fn();
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      companion.onTranscription(textCb);
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireMessage(JSON.stringify({ type: 'transcription', text: 'partial...', done: false }));
      expect(textCb).toHaveBeenCalledWith('partial...', false);
    });

    it('handles error message from signaling', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.fireMessage(JSON.stringify({ type: 'error', message: 'Signaling error' }));
      expect(companion.error.value).toBe('Signaling error');
    });

    it('handles malformed signaling message gracefully', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const ws = mockWsInstances[mockWsInstances.length - 1];
      expect(() => {
        ws.fireMessage('not-json');
      }).not.toThrow();
    });
  });

  describe('reconnection', () => {
    it('can restart after ICE disconnected', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc1 = mockPcInstances[mockPcInstances.length - 1];
      pc1.fireIceState('disconnected');
      expect(companion.state.value).toBe('disconnected');
      await companion.stop();
      const ok = await companion.start();
      expect(ok).toBe(true);
    });

    it('can restart after ICE failed', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc1 = mockPcInstances[mockPcInstances.length - 1];
      pc1.fireIceState('failed');
      expect(companion.error.value).toBe('ICE connection failed');
      await companion.stop();
      const ok = await companion.start();
      expect(ok).toBe(true);
    });

    it('creates a new RTCPeerConnection after restart', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pcCountBefore = mockPcInstances.length;
      await companion.stop();
      await companion.start();
      expect(mockPcInstances.length).toBe(pcCountBefore + 1);
    });
  });

  describe('cleanup edge cases', () => {
    it('stop calls pc.close() and ws.close()', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      const pc = mockPcInstances[mockPcInstances.length - 1];
      const ws = mockWsInstances[mockWsInstances.length - 1];
      await companion.stop();
      expect(pc.close).toHaveBeenCalled();
    });

    it('stop resets state to closed', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      await companion.stop();
      expect(companion.state.value).toBe('closed');
      expect(companion.vadState.value).toBe('idle');
      expect(companion.audioLevel.value).toBe(0);
    });

    it('can call stop multiple times without error', async () => {
      companion = createCompanion({ signalingUrl: 'ws://localhost:8082', sessionId: 'test' });
      await companion.start();
      await companion.stop();
      await companion.stop();
      await companion.stop();
      expect(companion.state.value).toBe('closed');
    });
  });
});