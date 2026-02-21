import { Migration } from './runner';

const migration: Migration = {
  version: 21,
  name: 'notification_cancelled_status',
  up: async (db) => {
    // CHECK 제약 재생성: CANCELLED 상태 추가
    await db.query(`ALTER TABLE stock_notifications DROP CONSTRAINT IF EXISTS stock_notifications_status_check`);
    await db.query(`ALTER TABLE stock_notifications ADD CONSTRAINT stock_notifications_status_check CHECK (status IN ('PENDING','READ','RESOLVED','CANCELLED'))`);
  },
};

export default migration;
