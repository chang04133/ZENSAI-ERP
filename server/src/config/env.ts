import dotenv from 'dotenv';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

// 1) .env 로드 (공통 설정: PORT, JWT_SECRET 등)
dotenv.config({ path: path.join(root, '.env') });

// 2) 환경별 오버라이드: .env.development 또는 .env.production
//    같은 키가 있으면 환경별 파일이 우선
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.join(root, envFile), override: true });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiry: process.env.JWT_EXPIRY || '2h',
  jwtRefreshExpiryDays: parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '7', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  corsOrigins: process.env.CORS_ORIGINS || '',
};
