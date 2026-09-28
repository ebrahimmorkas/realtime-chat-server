import type { RequestHandler } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw Unauthorized('Missing bearer token');
  try {
    req.user = verifyToken(header.slice('Bearer '.length));
  } catch {
    throw Unauthorized('Invalid or expired token');
  }
  next();
};
