import { up as migrationUp1 } from './001-create-users-table.js';
import { up as migrationUp2 } from './002-create-config-table.js';
import { up as migrationUp3 } from './003-add-phone-number-to-users.js';
import { up as migrationUp4 } from './004-create-products-table.js';
import migration005 from './005-refactor-user-roles.js';

// 运行所有待处理的迁移
async function runMigrations() {
  try {
    console.log('开始运行数据库迁移...');
    await migrationUp1();
    await migrationUp2();
    await migrationUp3();
    await migrationUp4();
    await migration005();
    console.log('所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();