import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { createSocketServer, type SocketServerHandle } from '../../src/realtime/socket-server.js';
import type { AckResponse } from '../../src/realtime/types.js';

export interface TestServer {
  httpServer: Server;
  url: string;
  sockets: SocketServerHandle;
}

export async function startTestServer(): Promise<TestServer> {
  const httpServer = createServer(createApp());
  const sockets = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  return { httpServer, sockets, url: `http://localhost:${port}` };
}

const clients: Socket[] = [];

export interface ConnectedClient {
  socket: Socket;
  ready: { userId: string; onlineContacts: string[] };
}

/** Connects and resolves once the server has joined the socket to its rooms. */
export function connect(url: string, token: string): Promise<ConnectedClient> {
  const socket = connectClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('session:ready', (ready) => resolve({ socket, ready }));
    socket.once('connect_error', reject);
  });
}

export function disconnectAll() {
  while (clients.length) clients.pop()!.disconnect();
}

export function nextEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Resolves true if the event does NOT arrive within the window. */
export function noEvent(socket: Socket, event: string, windowMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(true);
    }, windowMs);
    socket.once(event, handler);
  });
}

export function emitWithAck<T = unknown>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<AckResponse<T>> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}
