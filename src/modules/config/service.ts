import pool from '../../config/database.js';

// 配置项接口
export interface ConfigItem {
  id?: number;
  key: string;
  value: string;
  description?: string;
  created_at?: Date;
  updated_at?: Date;
}

// 通过key获取配置项
export async function getConfigByKey(key: string): Promise<ConfigItem | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM config WHERE key = $1',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

// 创建或更新配置项
export async function setConfig(configItem: ConfigItem): Promise<ConfigItem> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO config (key, value, description) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (key) 
       DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [configItem.key, configItem.value, configItem.description]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// 获取所有配置项
export async function getAllConfigs(): Promise<ConfigItem[]> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM config ORDER BY key');
    return result.rows;
  } finally {
    client.release();
  }
}

// 删除配置项
export async function deleteConfig(key: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM config WHERE key = $1', [key]);
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    client.release();
  }
}