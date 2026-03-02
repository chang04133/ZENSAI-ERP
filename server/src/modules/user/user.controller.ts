import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { User } from '../../../../shared/types/user';
import { userService } from './user.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { ROLE_LEVEL } from '../../../../shared/constants/roles';
import { audit } from '../../core/audit';

class UserController extends BaseController<User> {
  constructor() {
    super(userService);
  }

  /** 요청자의 직급 레벨 */
  private myLevel(req: Request): number {
    return ROLE_LEVEL[req.user?.role || ''] || 99;
  }

  /** 대상 role_group(group_name)의 레벨 */
  private async groupLevel(groupId: number): Promise<{ level: number; name: string }> {
    if (isNaN(groupId)) return { level: 99, name: '' };
    const pool = getPool();
    const r = await pool.query('SELECT group_name FROM role_groups WHERE group_id = $1', [groupId]);
    if (!r.rows[0]) return { level: 99, name: '' };
    const name = r.rows[0].group_name;
    return { level: ROLE_LEVEL[name] || 99, name };
  }

  getRoles = asyncHandler(async (req: Request, res: Response) => {
    const roles = await userService.getRoleGroups();
    const myLv = this.myLevel(req);
    // 자기보다 낮은 직급만 보여줌
    const filtered = roles.filter((r: any) => (ROLE_LEVEL[r.group_name] || 99) > myLv);
    res.json({ success: true, data: filtered });
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const myLv = this.myLevel(req);
    // 자기 레벨 이상(같거나 낮은 직급)만 표시
    const allowedRoles = Object.entries(ROLE_LEVEL)
      .filter(([, lv]) => lv >= myLv)
      .map(([name]) => name);

    const opts: any = { ...req.query, allowed_roles: allowedRoles };

    // 매장 매니저: 자기 매장 직원만
    if (req.user?.role === 'STORE_MANAGER') {
      opts.partner_code = req.user!.partnerCode;
      opts.role_group = 'STORE_STAFF';
    }

    const result = await userService.list(opts);
    res.json({ success: true, data: result });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const myLv = this.myLevel(req);

    // S-6: role_group 유효성 검증
    const rgId = Number(req.body.role_group);
    if (isNaN(rgId)) {
      res.status(400).json({ success: false, error: '유효하지 않은 역할 그룹입니다.' });
      return;
    }
    const target = await this.groupLevel(rgId);
    if (!target.name) {
      res.status(400).json({ success: false, error: '존재하지 않는 역할 그룹입니다.' });
      return;
    }

    // S-7: user_id 형식 검증
    const userId = req.body.user_id;
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(userId)) {
      res.status(400).json({ success: false, error: '사용자 ID는 영문, 숫자, 밑줄만 가능하며 3~50자여야 합니다.' });
      return;
    }

    // S-8: 비밀번호 최소 길이 검증
    if (!req.body.password || req.body.password.length < 4) {
      res.status(400).json({ success: false, error: '비밀번호는 4자 이상이어야 합니다.' });
      return;
    }

    // 자기보다 낮은 직급만 생성 가능
    if (target.level <= myLv) {
      res.status(403).json({ success: false, error: '자신보다 낮은 직급만 생성할 수 있습니다.' });
      return;
    }

    // 매장 매니저: 자기 매장 강제
    if (req.user?.role === 'STORE_MANAGER') {
      req.body.partner_code = req.user!.partnerCode;
    }

    try {
      const user = await userService.createUser(req.body);
      await audit('users', user.user_id, 'INSERT', req.user!.userId, null, user);
      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      if (error.code === '23505') {
        res.status(409).json({ success: false, error: '이미 존재하는 사용자 ID입니다.' });
        return;
      }
      throw error;
    }
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const myLv = this.myLevel(req);
    const pool = getPool();

    // 대상 사용자의 현재 직급 확인
    const current = await pool.query(
      `SELECT u.partner_code, u.role_group, u.user_name, u.is_active, rg.group_name
       FROM users u JOIN role_groups rg ON u.role_group = rg.group_id WHERE u.user_id = $1`,
      [req.params.id],
    );
    if (!current.rows[0]) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    const currentLevel = ROLE_LEVEL[current.rows[0].group_name] || 99;
    if (currentLevel <= myLv) {
      res.status(403).json({ success: false, error: '자신보다 낮은 직급의 사용자만 수정할 수 있습니다.' });
      return;
    }

    // S-2: STORE_MANAGER는 자기 매장 직원만 수정 가능
    if (req.user?.role === 'STORE_MANAGER' && current.rows[0].partner_code !== req.user.partnerCode) {
      res.status(403).json({ success: false, error: '자신의 매장 직원만 수정할 수 있습니다.' });
      return;
    }

    // 변경하려는 직급도 자기보다 낮아야 함
    if (req.body.role_group) {
      const rgId = Number(req.body.role_group);
      if (isNaN(rgId)) {
        res.status(400).json({ success: false, error: '유효하지 않은 역할 그룹입니다.' });
        return;
      }
      const target = await this.groupLevel(rgId);
      if (!target.name) {
        res.status(400).json({ success: false, error: '존재하지 않는 역할 그룹입니다.' });
        return;
      }
      if (target.level <= myLv) {
        res.status(403).json({ success: false, error: '자신보다 낮은 직급으로만 변경할 수 있습니다.' });
        return;
      }
    }

    // S-8: 비밀번호 변경 시 최소 길이 검증
    if (req.body.password && req.body.password.length < 4) {
      res.status(400).json({ success: false, error: '비밀번호는 4자 이상이어야 합니다.' });
      return;
    }

    // 매장 매니저: 자기 매장 강제
    if (req.user?.role === 'STORE_MANAGER') {
      req.body.partner_code = req.user!.partnerCode;
    }

    const oldData = current.rows[0];
    const user = await userService.updateUser(req.params.id as string, req.body);
    if (!user) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    await audit('users', req.params.id as string, 'UPDATE', req.user!.userId, oldData, user);
    res.json({ success: true, data: user });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const myLv = this.myLevel(req);
    const pool = getPool();

    // S-9: 자기 삭제 방지
    if (req.params.id === req.user?.userId) {
      res.status(400).json({ success: false, error: '자기 자신은 삭제할 수 없습니다.' });
      return;
    }

    // 대상 사용자 직급 확인
    const target = await pool.query(
      `SELECT u.partner_code, u.user_name, rg.group_name
       FROM users u JOIN role_groups rg ON u.role_group = rg.group_id WHERE u.user_id = $1`,
      [req.params.id],
    );
    if (!target.rows[0]) {
      res.status(404).json({ success: false, error: '사용자를 찾을 수 없습니다.' });
      return;
    }
    const targetLevel = ROLE_LEVEL[target.rows[0].group_name] || 99;
    if (targetLevel <= myLv) {
      res.status(403).json({ success: false, error: '자신보다 낮은 직급의 사용자만 삭제할 수 있습니다.' });
      return;
    }

    // S-2: STORE_MANAGER는 자기 매장 직원만 삭제 가능
    if (req.user?.role === 'STORE_MANAGER' && target.rows[0].partner_code !== req.user.partnerCode) {
      res.status(403).json({ success: false, error: '자신의 매장 직원만 삭제할 수 있습니다.' });
      return;
    }

    // S-1: soft-delete + 감사로그
    await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1', [req.params.id]);
    await audit('users', req.params.id as string, 'DELETE', req.user!.userId, target.rows[0], null);
    res.json({ success: true });
  });
}

export const userController = new UserController();
