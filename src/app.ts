import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';

export const corsOrigin = env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',');

export function createApp() {
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
