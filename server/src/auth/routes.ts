import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAccessToken, generateRefreshToken, hashToken } from './jwt';
import { authMiddleware } from './middleware';
import { config } from '../config/env';
import { getPool } from '../db/connection';

async function findUserForLogin(userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.user_id, u.user_name, u.password_hash, u.partner_code, u.is_active, rg.group_name AS role_name
     FROM users u JOIN role_groups rg ON u.role_group = rg.group_id
     WHERE u.user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function updateLastLogin(userId: string) {
  const pool = getPool();
  await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [userId]);
}

async function saveRefreshToken(tokenId: string, userId: string, hashedToken: string, expiresAt: number) {
  const pool = getPool();
  await pool.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)',
    [tokenId, userId, hashedToken, expiresAt, Date.now()],
  );
}

async function findRefreshToken(hashedToken: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND expires_at > $2',
    [hashedToken, Date.now()],
  );
  return result.rows[0] || null;
}

async function deleteRefreshToken(id: string) {
  const pool = getPool();
  await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [id]);
}

async function deleteUserRefreshTokens(userId: string) {
  const pool = getPool();
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { user_id, password } = req.body;
    if (!user_id || !password) {
      res.status(400).json({ success: false, error: '아이디와 비밀번호를 입력해주세요.' });
      return;
    }

    const user = await findUserForLogin(user_id);
    if (!user || !user.is_active) {
      res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ success: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    // Generate tokens
    const payload = {
      userId: user.user_id,
      userName: user.user_name,
      role: user.role_name,
      partnerCode: user.partner_code,
    };
    const accessToken = signAccessToken(payload);
    const refreshToken = generateRefreshToken();

    // Save refresh token
    const tokenId = crypto.randomUUID();
    const expiresAt = Date.now() + config.jwtRefreshExpiryDays * 24 * 60 * 60 * 1000;
    await saveRefreshToken(tokenId, user.user_id, hashToken(refreshToken), expiresAt);
    await updateLastLogin(user.user_id);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          userId: user.user_id,
          userName: user.user_name,
          role: user.role_name,
          partnerCode: user.partner_code,
        },
      },
    });
  } catch (error: any) {
    console.error('로그인 오류:', error);
    res.status(500).json({ success: false, error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: '리프레시 토큰이 필요합니다.' });
      return;
    }

    const tokenRecord = await findRefreshToken(hashToken(refreshToken));
    if (!tokenRecord) {
      res.status(401).json({ success: false, error: '유효하지 않거나 만료된 리프레시 토큰입니다.' });
      return;
    }

    // Delete old token
    await deleteRefreshToken(tokenRecord.id);

    // Get user info for new access token
    const user = await findUserForLogin(tokenRecord.user_id);
    if (!user || !user.is_active) {
      res.status(401).json({ success: false, error: '비활성화된 계정입니다.' });
      return;
    }

    // Issue new tokens
    const payload = {
      userId: user.user_id,
      userName: user.user_name,
      role: user.role_name,
      partnerCode: user.partner_code,
    };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = generateRefreshToken();

    const tokenId = crypto.randomUUID();
    const expiresAt = Date.now() + config.jwtRefreshExpiryDays * 24 * 60 * 60 * 1000;
    await saveRefreshToken(tokenId, user.user_id, hashToken(newRefreshToken), expiresAt);

    res.json({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    console.error('토큰 갱신 오류:', error);
    res.status(500).json({ success: false, error: '토큰 갱신 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await deleteUserRefreshTokens(req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    res.status(500).json({ success: false, error: '로그아웃 처리 중 오류가 발생했습니다.' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
