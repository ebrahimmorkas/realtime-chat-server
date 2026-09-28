import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AuthUser {
  id: string;
  username: string;
}

interface TokenPayload {
  sub: string;
  username: string;
}

export function signToken(user: AuthUser): string {
  const payload: TokenPayload = { sub: user.id, username: user.username };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_TTL as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  return { id: payload.sub, username: payload.username };
}
