import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

describe('openaiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OpenAIClient', () => {
    it('sends POST to /v1/chat/completions with body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677652288,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
        }),
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      const result = await client.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/v1/chat/completions',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.choices[0].message.content).toBe('Hello!');
    });

    it('sends Bearer token when set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ id: 'test' }),
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      client.setAuthToken('test-token');

      await client.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        })
      );
    });

    it('clears auth token when clearAuthToken called', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ id: 'test' }),
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      client.setAuthToken('old-token');
      client.clearAuthToken();

      await client.chatCompletions({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers).not.toHaveProperty('Authorization');
    });

    it('throws on 4xx error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Invalid request',
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');

      await expect(
        client.chatCompletions({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('HTTP 400');
    });

    it('throws on 5xx error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => 'Error',
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');

      await expect(
        client.chatCompletions({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('HTTP 500');
    });
  });

  describe('chatCompletionsStream', () => {
    it('streams SSE chunks', async () => {
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"content":"hello"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: mockStream,
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      const gen = client.chatCompletionsStream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      });

      const chunks = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0].choices[0].delta.content).toBe('hello');
    });
  });

  describe('speech', () => {
    it('sends POST to /v1/audio/speech', async () => {
      const mockBlob = new Blob(['audio-data'], { type: 'audio/mpeg' });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'audio/mpeg']]),
        blob: async () => mockBlob,
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      await client.speech({
        model: 'tts-1',
        input: 'Hello world',
        voice: 'alloy',
      });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('transcriptions', () => {
    it('sends FormData with file and model', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ text: 'Transcribed text' }),
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      const mockFile = new Blob(['audio'], { type: 'audio/webm' });

      await client.transcriptions({
        file: mockFile,
        model: 'whisper-1',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8082/v1/audio/transcriptions',
        expect.objectContaining({ method: 'POST' })
      );
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body).toBeInstanceOf(FormData);
    });
  });

  describe('listModels', () => {
    it('fetches GET /v1/models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({
          object: 'list',
          data: [{ id: 'gpt-4', object: 'model', created: 1677610602, owned_by: 'openai' }],
        }),
      });

      const { OpenAIClient } = await import('../openaiClient');
      const client = new OpenAIClient('http://localhost:8082');
      const result = await client.listModels();

      expect(mockFetch).toHaveBeenCalled();
      expect(result.data[0].id).toBe('gpt-4');
    });
  });
});