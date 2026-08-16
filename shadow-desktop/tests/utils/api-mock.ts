import { vi } from 'vitest';

export interface MockResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

export interface MockError {
  message: string;
  status: number;
}

export function createMockResponse<T>(
  data: T,
  status = 200,
  statusText = 'OK'
): MockResponse<T> {
  return { data, status, statusText };
}

export function createMockError(
  message: string,
  status = 500
): MockError {
  return { message, status };
}

export function createApiMock() {
  const mocks = new Map<string, unknown>();

  const get = vi.fn((url: string) => {
    const mock = mocks.get(url);
    if (mock) {
      return Promise.resolve(createMockResponse(mock));
    }
    return Promise.reject(createMockError('Not found', 404));
  });

  const post = vi.fn((url: string, body?: unknown) => {
    mocks.set(url, body);
    return Promise.resolve(createMockResponse(body));
  });

  const put = vi.fn((url: string, body?: unknown) => {
    mocks.set(url, body);
    return Promise.resolve(createMockResponse(body));
  });

  const deleteFn = vi.fn((url: string) => {
    mocks.delete(url);
    return Promise.resolve(createMockResponse(null));
  });

  const mockGet = vi.fn((url: string, response: unknown) => {
    mocks.set(url, response);
  });

  const mockPost = vi.fn((url: string, response: unknown) => {
    mocks.set(url, response);
  });

  const mockPut = vi.fn((url: string, response: unknown) => {
    mocks.set(url, response);
  });

  const mockDelete = vi.fn((url: string) => {
    mocks.delete(url);
  });

  const reset = vi.fn(() => {
    mocks.clear();
  });

  return {
    api: { get, post, put, delete: deleteFn },
    mock: {
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
    },
    reset,
  };
}

export function createFetchMock() {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    })
  );
}

export function createWebSocketMock() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  
  const on = vi.fn((event: string, callback: (data: unknown) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(callback);
  });

  const off = vi.fn((event: string, callback: (data: unknown) => void) => {
    listeners.get(event)?.delete(callback);
  });

  const emit = vi.fn((event: string, data: unknown) => {
    listeners.get(event)?.forEach((callback) => callback(data));
  });

  const send = vi.fn();

  const close = vi.fn();

  return {
    on,
    off,
    emit,
    send,
    close,
    readyState: 1,
    url: 'ws://localhost:8080',
  };
}