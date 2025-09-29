import { Client } from 'pg';
import config from '../config/index.js';

export const up = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        category VARCHAR(100),
        image_url VARCHAR(500),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
      CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
    `);
    console.log('Products table created successfully');
  } catch (error) {
    console.error('Error creating products table:', error);
    throw error;
  } finally {
    await client.end();
  }
};

export const down = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query('DROP TABLE IF EXISTS products');
    console.log('Products table dropped successfully');
  } catch (error) {
    console.error('Error dropping products table:', error);
    throw error;
  } finally {
    await client.end();
  }
};