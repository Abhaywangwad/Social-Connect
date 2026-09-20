import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import jwt from 'jsonwebtoken';
import { io as ioc } from 'socket.io-client';
import app from '../../src/app.js';
import initSocket from '../../src/socket/index.js';
import config from '../../src/config/config.js';
import { generateAccessToken } from '../../src/utils/jwt.js';
import { createTestUser } from '../helpers/authHelper.js';
import { createSocketClient, createRawSocketClient } from '../helpers/socketHelper.js';

describe('Socket.IO — Authentication & Handshake', () => {
  let server;
  let io;
  let port;

  beforeAll(async () => {
    server = http.createServer(app);
    io = initSocket(server);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (io) await io.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('connects successfully with a valid JWT access token in auth.token', async () => {
    const user = await createTestUser();
    const token = generateAccessToken({ userId: user._id, role: user.role });

    const client = await createSocketClient(token, port);
    expect(client.connected).toBe(true);
    expect(client.id).toBeDefined();

    client.disconnect();
  });

  it('connects successfully with a valid JWT in Authorization header', async () => {
    const user = await createTestUser();
    const token = generateAccessToken({ userId: user._id, role: user.role });

    const client = await new Promise((resolve, reject) => {
      const socket = ioc(`http://localhost:${port}`, {
        extraHeaders: {
          authorization: `Bearer ${token}`,
        },
        forceNew: true,
        reconnection: false,
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('Connection timeout'));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('rejects connection when no token is provided', async () => {
    const client = createRawSocketClient({}, port);

    const error = await new Promise((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err);
      });
    });

    expect(error).toBeDefined();
    expect(error.data?.code).toBe('AUTHENTICATION_FAILED');
    expect(error.data?.message).toContain('Authentication token required');
    expect(client.connected).toBe(false);

    client.disconnect();
  });

  it('rejects connection with an invalid/malformed token', async () => {
    const client = createRawSocketClient({ token: 'malformed.bogus.token' }, port);

    const error = await new Promise((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err);
      });
    });

    expect(error).toBeDefined();
    expect(error.data?.code).toBe('AUTHENTICATION_FAILED');
    expect(error.data?.message).toBe('Invalid or malformed token');
    expect(client.connected).toBe(false);

    client.disconnect();
  });

  it('rejects connection with an expired JWT token', async () => {
    const user = await createTestUser();
    const expiredToken = jwt.sign(
      { userId: user._id.toString(), sub: user._id.toString() },
      config.jwtAccessSecret,
      { expiresIn: '-1s' }
    );

    const client = createRawSocketClient({ token: expiredToken }, port);

    const error = await new Promise((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err);
      });
    });

    expect(error).toBeDefined();
    expect(error.data?.code).toBe('AUTHENTICATION_FAILED');
    expect(error.data?.message).toBe('Token expired');
    expect(client.connected).toBe(false);

    client.disconnect();
  });
});
