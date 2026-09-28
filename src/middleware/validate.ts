import type { RequestHandler } from 'express';
import type { z } from 'zod';

type Schemas = {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
};

/**
 * Validates and coerces request input. Parsed values replace the originals so
 * handlers always receive typed, sanitized data.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) {
      // Express 5 exposes req.query as a getter, so redefine it with the parsed value.
      Object.defineProperty(req, 'query', {
        value: schemas.query.parse(req.query),
        writable: true,
        configurable: true,
      });
    }
    next();
  };
