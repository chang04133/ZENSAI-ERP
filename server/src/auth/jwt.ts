import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import { TokenPayload } from '../types';

export function signAccessToken(payload: TokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwtExpiry as any };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
