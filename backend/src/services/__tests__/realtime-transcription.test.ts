import { attachRealtimeWebSocket } from '../realtime-transcription';
import { EventEmitter } from 'events';

// Self-contained ws mock — instances are accessed via jest.requireMock after setup
jest.mock('ws', () => {
  const Server = jest.fn().mockImplementation(() => ({
    handleUpgrade: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
  }));
  const WS = function () {} as any;
  WS.Server = Server;
  return { __esModule: true, default: WS };
});

// Mock @clerk/express (intercepts both static and dynamic imports)
jest.mock('@clerk/express', () => ({
  verifyToken: jest.fn(),
}));

function makeRequest(url: string) {
  return { url, headers: { host: 'localhost' } };
}

function makeSocket() {
  return { write: jest.fn(), destroy: jest.fn() };
}

describe('attachRealtimeWebSocket — JWT auth', () => {
  let server: EventEmitter;
  let wssInstance: { handleUpgrade: jest.Mock; on: jest.Mock; emit: jest.Mock };
  let mockVerifyToken: jest.Mock;

  beforeEach(() => {
    server = new EventEmitter();
    process.env.CLERK_SECRET_KEY = 'test-clerk-key';

    // Clear mock state before each test
    const MockServer = jest.requireMock('ws').default.Server as jest.Mock;
    MockServer.mockClear();

    mockVerifyToken = jest.requireMock('@clerk/express').verifyToken as jest.Mock;
    mockVerifyToken.mockReset();

    attachRealtimeWebSocket(server as any);

    // Capture the wss instance created inside attachRealtimeWebSocket
    wssInstance = MockServer.mock.results[0].value as typeof wssInstance;
  });

  afterEach(() => {
    delete process.env.CLERK_SECRET_KEY;
  });

  it('rejects upgrade without ?token= with HTTP 401', () => {
    const socket = makeSocket();
    server.emit('upgrade', makeRequest('/realtime'), socket, Buffer.alloc(0));

    // No-token path is synchronous — no async needed
    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n');
    expect(socket.destroy).toHaveBeenCalled();
    expect(mockVerifyToken).not.toHaveBeenCalled();
    expect(wssInstance.handleUpgrade).not.toHaveBeenCalled();
  });

  it('rejects upgrade with an invalid/expired token with HTTP 401', async () => {
    mockVerifyToken.mockRejectedValue(new Error('Token verification failed'));
    const socket = makeSocket();

    const destroyPromise = new Promise<void>((resolve) => {
      socket.destroy.mockImplementation(resolve);
    });

    server.emit('upgrade', makeRequest('/realtime?token=bad-token'), socket, Buffer.alloc(0));
    await destroyPromise;

    expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n');
    expect(socket.destroy).toHaveBeenCalled();
    expect(wssInstance.handleUpgrade).not.toHaveBeenCalled();
  });

  it('allows upgrade with a valid Clerk JWT', async () => {
    mockVerifyToken.mockResolvedValue({ sub: 'user_abc123' });
    const socket = makeSocket();
    const head = Buffer.alloc(0);

    const handleUpgradePromise = new Promise<void>((resolve) => {
      wssInstance.handleUpgrade.mockImplementation(resolve);
    });

    server.emit('upgrade', makeRequest('/realtime?token=valid-clerk-jwt'), socket, head);
    await handleUpgradePromise;

    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(mockVerifyToken).toHaveBeenCalledWith('valid-clerk-jwt', expect.any(Object));
    expect(wssInstance.handleUpgrade).toHaveBeenCalled();
  });

  it('ignores non-/realtime upgrade requests without touching the socket', async () => {
    const socket = makeSocket();
    server.emit('upgrade', makeRequest('/other-path'), socket, Buffer.alloc(0));

    await new Promise((r) => setImmediate(r));

    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(wssInstance.handleUpgrade).not.toHaveBeenCalled();
  });
});
