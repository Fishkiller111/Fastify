import { up as migrationUp } from './001-create-users-table';

// 运行所有待处理的迁移
async function runMigrations() {
  try {
    console.log('开始运行数据库迁移...');
    await migrationUp();
    console.log('所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();