import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('navigator.mediaDevices.getUserMedia', () => ({
  default: vi.fn().mockResolvedValue(new global.MediaStream()),
}));

describe('webrtcCompanion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    
    vi.stubGlobal('RTCPeerConnection', vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      addTrack: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test-sdp' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      iceConnectionState: 'new',
      localDescription: { type: 'offer', sdp: 'test-sdp' },
    })));
    
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.CONNECTING,
    })));
    
    vi.stubGlobal('Audio', vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    })));
    
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 512,
        getByteFrequencyData: vi.fn(),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    })));
    
    vi.stubGlobal('setInterval', vi.fn((cb: TimerHandler) => 1));
    vi.stubGlobal('clearInterval', vi.fn());
  });

  it('exports WebRtcCompanion class', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    expect(WebRtcCompanion).toBeDefined();
    expect(typeof WebRtcCompanion).toBe('function');
  });

  it('exports createCompanion factory', async () => {
    const { createCompanion } = await import('../webrtcCompanion');
    expect(createCompanion).toBeDefined();
    expect(typeof createCompanion).toBe('function');
  });

  it('WebRtcCompanion is constructable with config', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion).toBeDefined();
  });

  it('initializes with idle state by default', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion.state.value).toBe('idle');
  });

  it('initializes with idle vad state by default', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion.vadState.value).toBe('idle');
  });

  it('initializes with empty transcript', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion.transcript.value).toBe('');
  });

  it('initializes with null error', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion.error.value).toBeNull();
  });

  it('initializes with zero audio level', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion.audioLevel.value).toBe(0);
  });

  it('accepts custom iceServers in config', async () => {
    const customServers = [{ urls: 'stun:custom.example.com:3478' }];
    
    vi.stubGlobal('RTCPeerConnection', vi.fn().mockImplementation((config: RTCConfiguration) => {
      expect(config.iceServers).toEqual(customServers);
      return {
        addEventListener: vi.fn(),
        addTrack: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        iceConnectionState: 'new',
        localDescription: { type: 'offer', sdp: 'test-sdp' },
      };
    }));
    
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
      iceServers: customServers,
    });
  });

  it('has onTranscription method', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(typeof companion.onTranscription).toBe('function');
  });

  it('registers onTranscription callback', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    const cb = vi.fn();
    companion.onTranscription(cb);
    
    expect(companion.onTranscription).toBeDefined();
  });

  it('has onVad method', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(typeof companion.onVad).toBe('function');
  });

  it('registers onVad callback', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    const cb = vi.fn();
    companion.onVad(cb);
    
    expect(companion.onVad).toBeDefined();
  });

  it('has start method', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(typeof companion.start).toBe('function');
  });

  it('has stop method', async () => {
    const { WebRtcCompanion } = await import('../webrtcCompanion');
    
    const companion = new WebRtcCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(typeof companion.stop).toBe('function');
  });

  it('createCompanion factory creates WebRtcCompanion instance', async () => {
    const { createCompanion } = await import('../webrtcCompanion');
    
    const companion = createCompanion({
      signalingUrl: 'ws://localhost:8082/ws',
      sessionId: 'session-1',
    });
    
    expect(companion).toBeDefined();
  });
});