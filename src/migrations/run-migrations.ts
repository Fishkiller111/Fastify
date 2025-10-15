import { up as initDatabase } from './001-init-database.js';
import { up as addBigCoins } from './002-add-big-coins.js';
import { up as addMainstreamType } from './003-add-mainstream-type.js';
import { up as addTokenName } from './004-add-token-name.js';
import { up as createKlineTable } from './005-create-kline-table.js';
import { up as addFuturePrice } from './006-add-future-price.js';
import { up as addCoinIcon } from './007-add-coin-icon.js';
import { up as addReferralSystem } from './008-referral-system.js';
import { up as createKlineBuyRecords } from './009-create-kline-buy-records.js';

// 运行数据库迁移
async function runMigrations() {
  try {
    console.log('🚀 开始运行数据库迁移...');

    // 执行所有迁移
    await initDatabase();
    await addBigCoins();
    await addMainstreamType();
    await addTokenName();
    await createKlineTable();
    await addFuturePrice();
    await addCoinIcon();
    await addReferralSystem();
    await createKlineBuyRecords();

    console.log('🎉 所有迁移已完成');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ 迁移过程中发生错误:', err);
    process.exit(1);
  }
}

runMigrations();
