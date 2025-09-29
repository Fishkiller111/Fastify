import { Client } from 'pg';
import config from '../config/index.js';

export const up = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query(`
      -- 添加店铺ID字段到商品表
      ALTER TABLE products ADD COLUMN store_id INTEGER;

      -- 添加外键约束，关联到店铺表
      ALTER TABLE products ADD CONSTRAINT fk_products_store_id
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;

      -- 添加索引提高查询性能
      CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

      -- 可选：为现有商品设置默认店铺（如果有数据的话）
      -- UPDATE products SET store_id = 1 WHERE store_id IS NULL;
    `);
    console.log('商品表店铺关联字段添加成功');
  } catch (error) {
    console.error('添加商品表店铺关联字段时出错:', error);
    throw error;
  } finally {
    await client.end();
  }
};

export const down = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query(`
      -- 删除索引
      DROP INDEX IF EXISTS idx_products_store_id;

      -- 删除外键约束
      ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_products_store_id;

      -- 删除店铺ID字段
      ALTER TABLE products DROP COLUMN IF EXISTS store_id;
    `);
    console.log('商品表店铺关联字段删除成功');
  } catch (error) {
    console.error('删除商品表店铺关联字段时出错:', error);
    throw error;
  } finally {
    await client.end();
  }
};