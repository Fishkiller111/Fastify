import { FastifyInstance } from 'fastify';
import AdminJS from 'adminjs';
import AdminJSFastify from '@adminjs/fastify';
import Adapter, { Database, Resource } from '@adminjs/sql';
import config from '../config/index.js';
import pool from '../config/database.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function ensureAdminJsEntryFile() {
  try {
    const projectRoot = process.cwd();
    const adminDir = path.join(projectRoot, '.adminjs');
    const entryPath = path.join(adminDir, 'entry.js');

    await fs.mkdir(adminDir, { recursive: true });

    try {
      await fs.access(entryPath);
    } catch {
      // 如果 entry.js 不存在，则创建一个最简单的入口，避免 AdminJS bundler 在构建时报错
      await fs.writeFile(entryPath, 'AdminJS.UserComponents = {}\n', 'utf8');
      console.log('Created default AdminJS entry file at', entryPath);
    }
  } catch (error) {
    console.error('Failed to ensure .adminjs/entry.js:', error);
  }
}

// Admin 面板插件（单实例，使用 AdminJS 原生样式与默认语言）
async function adminPanelPlugin(fastify: FastifyInstance) {
  // 确保 .adminjs/entry.js 存在（在 Docker 等环境下首次启动可能缺失）
  await ensureAdminJsEntryFile();
  // 注册 SQL 适配器
  AdminJS.registerAdapter({ Database, Resource });

  const dbConfig = config.database;
  const password = encodeURIComponent(dbConfig.password || '');
  const connectionString = `postgresql://${dbConfig.user}:${password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;

  // 初始化 SQL 适配器
  const adapter = new Adapter('postgresql', {
    connectionString,
    database: dbConfig.database,
  });

  const db = await adapter.init();

  // 资源配置：单个后台实例，保持 AdminJS 原生 UI，不做多语言
  const resources: any[] = [
    // 用户表：用户管理、余额、角色等
    {
      resource: db.table('users'),
      options: {
        // 使用英文导航名称，避免在某些生产环境编码异常显示乱码
        navigation: { name: 'Users', icon: 'User' },
        icon: 'User',
        properties: {
          password: { isVisible: false },
          // permissions 列在数据库中是 text[]，AdminJS SQL 适配器会错误地生成 permissions."0" 更新语句
          // 这里直接在后台隐藏该字段，避免通过 AdminJS 编辑它
          permissions: {
            isVisible: { list: false, filter: false, show: false, edit: false },
          },
        },
        listProperties: [
          'id',
          'username',
          'email',
          'wallet_address',
          'balance',
          'role',
          'status',
          'created_at',
        ],
        editProperties: [
          'username',
          'email',
          'phone_number',
          'wallet_address',
          'balance',
          'role',
          'status',
        ],
        actions: {
          // 在更新/创建用户前，强制把 permissions 相关字段从 payload 中移除，避免生成错误 SQL
          edit: {
            before: async (request: any) => {
              if (request && request.payload) {
                const payload = { ...request.payload };
                Object.keys(payload)
                  .filter((key) => key === 'permissions' || key.startsWith('permissions.'))
                  .forEach((key) => delete payload[key]);
                request.payload = payload;
              }
              return request;
            },
          },
          new: {
            before: async (request: any) => {
              if (request && request.payload) {
                const payload = { ...request.payload };
                Object.keys(payload)
                  .filter((key) => key === 'permissions' || key.startsWith('permissions.'))
                  .forEach((key) => delete payload[key]);
                request.payload = payload;
              }
              return request;
            },
          },
        },
      },
    },
    // 反佣等级配置
    {
      resource: db.table('commission_tiers'),
      options: {
        navigation: { name: 'Commission Tiers', icon: 'Settings' },
        icon: 'Settings',
        listProperties: ['id', 'tier_name', 'volume', 'commission_rate', 'tier_order', 'is_active'],
        sort: {
          sortBy: 'tier_order',
          direction: 'asc',
        },
      },
    },
    // 充值订单（只读）
    {
      resource: db.table('payment_orders'),
      options: {
        navigation: { name: 'Funds & Orders', icon: 'CurrencyDollar' },
        icon: 'CurrencyDollar',
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
          deleteExpired: {
            actionType: 'resource',
            // 不需要自定义页面，点击后直接执行 handler
            component: false,
            icon: 'Trash2',
            label: '删除超时订单',
            guard: '确定要删除所有已超时（expired）的订单吗？此操作不可恢复。',
            handler: async () => {
              const result = await pool.query(
                "DELETE FROM payment_orders WHERE status = 'expired'",
              );

              return {
                notice: {
                  message: `已删除 ${result.rowCount} 条超时订单`,
                  type: 'success',
                },
              } as any;
            },
          },
        },
        listProperties: [
          'id',
          'user_id',
          'order_id',
          'trade_id',
          'amount_cny',
          'actual_amount',
          'status',
          'created_at',
        ],
      },
    },
    // 主流币 / Meme 合约相关基础表
    {
      resource: db.table('big_coins'),
      options: {
        navigation: { name: 'Contracts', icon: 'Database' },
        icon: 'Database',
        listProperties: ['id', 'symbol', 'name', 'contract_address', 'chain', 'is_active'],
      },
    },
    {
      resource: db.table('meme_events'),
      options: {
        navigation: { name: 'Contract Events', icon: 'DocumentSearch' },
        icon: 'DocumentSearch',
        listProperties: [
          'id',
          'type',
          'creator_id',
          'contract_address',
          'big_coin_id',
          'status',
          'deadline',
          'created_at',
        ],
        filterProperties: ['type', 'status', 'big_coin_id'],
        actions: {
          new: { isAccessible: false },
          delete: { isAccessible: false },
          deleteFinishedEvents: {
            actionType: 'resource',
            component: false,
            icon: 'Trash2',
            label: '删除已结算/已取消事件',
            guard: '确定要删除所有已结算（settled）或已取消（cancelled）的事件及其相关数据吗？此操作不可恢复。',
            handler: async () => {
              const client = await pool.connect();

              try {
                await client.query('BEGIN');

                // 1. 找出所有已结算或已取消的事件
                const eventsResult = await client.query<{ id: number }>(
                  "SELECT id FROM meme_events WHERE status IN ('settled', 'cancelled')",
                );

                const eventIds = eventsResult.rows.map((row) => row.id);

                if (eventIds.length === 0) {
                  await client.query('COMMIT');
                  return {
                    notice: {
                      message: '没有可删除的已结算/已取消事件',
                      type: 'info',
                    },
                  } as any;
                }

                // 2. 先删除关联的 meme_bets（其他表大多对 meme_events 使用 ON DELETE CASCADE）
                const betsResult = await client.query(
                  'DELETE FROM meme_bets WHERE event_id = ANY($1::int[])',
                  [eventIds],
                );

                // 3. 再删除 meme_events 本身，触发 ON DELETE CASCADE 清理 user_positions / transactions / klines / refund_records / kline_buy_records 等
                const eventsDeleteResult = await client.query(
                  'DELETE FROM meme_events WHERE id = ANY($1::int[])',
                  [eventIds],
                );

                await client.query('COMMIT');

                const eventsDeleted = eventsDeleteResult.rowCount || 0;
                const betsDeleted = betsResult.rowCount || 0;

                return {
                  notice: {
                    message: `已删除 ${eventsDeleted} 个事件及其相关投注记录 (${betsDeleted} 条)`,
                    type: 'success',
                  },
                } as any;
              } catch (error) {
                await client.query('ROLLBACK');
                console.error('删除已结算/已取消事件失败:', error);
                throw error;
              } finally {
                client.release();
              }
            },
          },
        },
      },
    },
    {
      resource: db.table('meme_bets'),
      options: {
        navigation: { name: 'Contract Bets', icon: 'DocumentCheck' },
        icon: 'DocumentCheck',
        listProperties: [
          'id',
          'event_id',
          'user_id',
          'bet_type',
          'bet_amount',
          'status',
          'created_at',
        ],
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
        },
      },
    },
  ];

  const adminOptions: any = {
    rootPath: '/admin',
    resources,
    branding: {
      companyName: 'Meme Admin Panel',
      logo: false,
      withMadeWithLove: false,
    },
  };

  const admin = new AdminJS(adminOptions);

  // 开发环境下启用 AdminJS watch，方便调试
  if (process.env.NODE_ENV !== 'production') {
    try {
      // @ts-ignore - watch 在部分类型定义中可能缺失
      admin.watch?.();
    } catch {
      // ignore
    }
  }

  // 将 AdminJS 挂到 /admin，并用 adminAuth 保护
  await fastify.register(async (instance) => {
    instance.addHook('onRequest', instance.adminAuth());
    await AdminJSFastify.buildRouter(admin, instance as any);
  });
}

export default adminPanelPlugin;
