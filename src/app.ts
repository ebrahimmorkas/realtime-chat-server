import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { createApiRouter } from './routes.js';

/**
 * Production build of the React client (`client/dist`), served by the API itself.
 * Tests opt in explicitly so their results don't depend on a local client build.
 */
const defaultWebDir =
  env.NODE_ENV === 'test' ? '' : fileURLToPath(new URL('../client/dist', import.meta.url));

export const corsOrigin = env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',');

export interface AppOptions {
  /** Directory with the built web client; skipped when it does not exist. */
  webDir?: string;
}

export function createApp({ webDir = defaultWebDir }: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test',
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/v1', createApiRouter());

  // Same origin as the API and the WebSocket, so the client needs no CORS.
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    // Vite fingerprints everything under /assets, so it can be cached forever.
    app.use(
      '/assets',
      express.static(join(webDir, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }),
    );
    app.use(express.static(webDir, { index: false }));
    // Client-side routes (e.g. /chat/123) fall back to the SPA shell.
    app.get(/^\/(?!api\/|health|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
