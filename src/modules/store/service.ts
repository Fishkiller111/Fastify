import { Client } from 'pg';
import config from '../../config/index.js';
import { Store, CreateStoreRequest, UpdateStoreRequest, StoreListQuery, StoreListResponse } from './types.js';
import { Product, ProductListQuery, ProductListResponse } from '../product/types.js';

export class StoreService {
  private async getClient(): Promise<Client> {
    const client = new Client(config.database);
    await client.connect();
    return client;
  }

  async getStores(query: StoreListQuery = {}): Promise<StoreListResponse> {
    const client = await this.getClient();

    try {
      const {
        page = 1,
        limit = 10,
        status = 'approved',
        is_active = true,
        search,
        sort = 'created_at',
        order = 'desc'
      } = query;

      const offset = (page - 1) * limit;

      let whereClause = 'WHERE status = $1 AND is_active = $2';
      const params: any[] = [status, is_active];
      let paramIndex = 3;

      if (search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR owner_name ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const orderBy = `ORDER BY ${sort} ${order.toUpperCase()}`;

      // 获取总数
      const countQuery = `SELECT COUNT(*) FROM stores ${whereClause}`;
      const countResult = await client.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      // 获取分页数据
      const storesQuery = `
        SELECT * FROM stores
        ${whereClause}
        ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await client.query(storesQuery, params);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        stores: result.rows,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_count: totalCount,
          per_page: limit
        }
      };
    } finally {
      await client.end();
    }
  }

  async getStoreById(id: number): Promise<Store | null> {
    const client = await this.getClient();

    try {
      const result = await client.query('SELECT * FROM stores WHERE id = $1', [id]);
      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  async createStore(storeData: CreateStoreRequest): Promise<Store> {
    const client = await this.getClient();

    try {
      const {
        name,
        description,
        owner_name,
        contact_phone,
        contact_email,
        address,
        logo_url,
        cover_image_url,
        business_hours,
        business_license
      } = storeData;

      const result = await client.query(`
        INSERT INTO stores (
          name, description, owner_name, contact_phone, contact_email,
          address, logo_url, cover_image_url, business_hours, business_license
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        name, description, owner_name, contact_phone, contact_email,
        address, logo_url, cover_image_url, business_hours, business_license
      ]);

      return result.rows[0];
    } finally {
      await client.end();
    }
  }

  async updateStore(id: number, storeData: UpdateStoreRequest): Promise<Store | null> {
    const client = await this.getClient();

    try {
      const existingStore = await this.getStoreById(id);
      if (!existingStore) {
        return null;
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      Object.keys(storeData).forEach((key) => {
        const value = (storeData as any)[key];
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      });

      if (updateFields.length === 0) {
        return existingStore;
      }

      updateFields.push(`updated_at = $${paramIndex}`);
      params.push(new Date());
      params.push(id);

      const query = `
        UPDATE stores
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await client.query(query, params);
      return result.rows[0];
    } finally {
      await client.end();
    }
  }

  async deleteStore(id: number): Promise<boolean> {
    const client = await this.getClient();

    try {
      const result = await client.query('DELETE FROM stores WHERE id = $1', [id]);
      return (result.rowCount || 0) > 0;
    } finally {
      await client.end();
    }
  }

  async updateStoreStatus(id: number, status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<Store | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        UPDATE stores
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [status, id]);

      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  async updateStoreRating(id: number, rating: number): Promise<Store | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        UPDATE stores
        SET rating = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND $1 >= 0 AND $1 <= 5
        RETURNING *
      `, [rating, id]);

      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  async incrementStoreSales(id: number, amount: number = 1): Promise<Store | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        UPDATE stores
        SET total_sales = total_sales + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [amount, id]);

      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  async getStoreProducts(storeId: number, query: ProductListQuery = {}): Promise<ProductListResponse> {
    const client = await this.getClient();

    try {
      const {
        page = 1,
        limit = 10,
        category,
        is_active = true,
        search,
        sort = 'created_at',
        order = 'desc'
      } = query;

      const offset = (page - 1) * limit;

      let whereClause = 'WHERE store_id = $1 AND is_active = $2';
      const params: any[] = [storeId, is_active];
      let paramIndex = 3;

      if (category) {
        whereClause += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (search) {
        whereClause += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const orderBy = `ORDER BY ${sort} ${order.toUpperCase()}`;

      // 获取总数
      const countQuery = `SELECT COUNT(*) FROM products ${whereClause}`;
      const countResult = await client.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      // 获取分页数据
      const productsQuery = `
        SELECT * FROM products
        ${whereClause}
        ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await client.query(productsQuery, params);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        products: result.rows,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_count: totalCount,
          per_page: limit
        }
      };
    } finally {
      await client.end();
    }
  }
}