import { Client } from 'pg';
import config from '../config/index.js';

export const up = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_name VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(20),
        contact_email VARCHAR(255),
        address TEXT,
        logo_url VARCHAR(500),
        cover_image_url VARCHAR(500),
        business_hours VARCHAR(255),
        business_license VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        is_active BOOLEAN NOT NULL DEFAULT true,
        rating DECIMAL(2,1) DEFAULT 0.0,
        total_sales INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT stores_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
        CONSTRAINT stores_rating_check CHECK (rating >= 0 AND rating <= 5)
      );

      CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
      CREATE INDEX IF NOT EXISTS idx_stores_is_active ON stores(is_active);
      CREATE INDEX IF NOT EXISTS idx_stores_rating ON stores(rating);
      CREATE INDEX IF NOT EXISTS idx_stores_created_at ON stores(created_at);
      CREATE INDEX IF NOT EXISTS idx_stores_owner_name ON stores(owner_name);
    `);
    console.log('Stores table created successfully');
  } catch (error) {
    console.error('Error creating stores table:', error);
    throw error;
  } finally {
    await client.end();
  }
};

export const down = async (): Promise<void> => {
  const client = new Client(config.database);
  await client.connect();

  try {
    await client.query('DROP TABLE IF EXISTS stores');
    console.log('Stores table dropped successfully');
  } catch (error) {
    console.error('Error dropping stores table:', error);
    throw error;
  } finally {
    await client.end();
  }
};