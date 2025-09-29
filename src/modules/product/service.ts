import { Client } from 'pg';
import config from '../../config/index.js';
import { Product, CreateProductRequest, UpdateProductRequest, ProductListQuery, ProductListResponse } from './types.js';

export class ProductService {
  private async getClient(): Promise<Client> {
    const client = new Client(config.database);
    await client.connect();
    return client;
  }

  async getProducts(query: ProductListQuery = {}): Promise<ProductListResponse> {
    const client = await this.getClient();

    try {
      const {
        page = 1,
        limit = 10,
        category,
        store_id,
        is_active = true,
        search,
        sort = 'created_at',
        order = 'desc'
      } = query;

      const offset = (page - 1) * limit;

      let whereClause = 'WHERE is_active = $1';
      const params: any[] = [is_active];
      let paramIndex = 2;

      if (category) {
        whereClause += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (store_id) {
        whereClause += ` AND store_id = $${paramIndex}`;
        params.push(store_id);
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

  async getProductById(id: number): Promise<Product | null> {
    const client = await this.getClient();

    try {
      const result = await client.query('SELECT * FROM products WHERE id = $1', [id]);
      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  async createProduct(productData: CreateProductRequest): Promise<Product> {
    const client = await this.getClient();

    try {
      const {
        name,
        description,
        price,
        stock,
        category,
        image_url,
        store_id,
        is_active = true,
        media_type,
        video_url,
        thumbnail_url,
        media_duration,
        media_size
      } = productData;

      const result = await client.query(`
        INSERT INTO products (
          name, description, price, stock, category, image_url, store_id, is_active,
          media_type, video_url, thumbnail_url, media_duration, media_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        name, description, price, stock, category, image_url, store_id, is_active,
        media_type, video_url, thumbnail_url, media_duration, media_size
      ]);

      return result.rows[0];
    } finally {
      await client.end();
    }
  }

  async updateProduct(id: number, productData: UpdateProductRequest): Promise<Product | null> {
    const client = await this.getClient();

    try {
      const existingProduct = await this.getProductById(id);
      if (!existingProduct) {
        return null;
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      Object.keys(productData).forEach((key) => {
        const value = (productData as any)[key];
        if (value !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      });

      if (updateFields.length === 0) {
        return existingProduct;
      }

      updateFields.push(`updated_at = $${paramIndex}`);
      params.push(new Date());
      params.push(id);

      const query = `
        UPDATE products
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

  async deleteProduct(id: number): Promise<boolean> {
    const client = await this.getClient();

    try {
      const result = await client.query('DELETE FROM products WHERE id = $1', [id]);
      return (result.rowCount || 0) > 0;
    } finally {
      await client.end();
    }
  }

  async updateStock(id: number, quantity: number): Promise<Product | null> {
    const client = await this.getClient();

    try {
      const result = await client.query(`
        UPDATE products
        SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND stock + $1 >= 0
        RETURNING *
      `, [quantity, id]);

      return result.rows[0] || null;
    } finally {
      await client.end();
    }
  }

  // 便捷方法，与getProductById一致
  async getProduct(id: number): Promise<Product | null> {
    return this.getProductById(id);
  }
}