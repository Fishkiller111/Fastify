import pg from 'pg';
import config from '../../config/index.js';
import type {
  AgentSession,
  SessionMessage,
  CreateSessionRequest,
  UpdateSessionRequest,
  SendMessageRequest
} from './types.js';

const { Pool } = pg;

export class SessionService {
  private pool: pg.Pool;

  constructor() {
    this.pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
    });
  }

  // 创建新会话
  async createSession(userId: number, request: CreateSessionRequest): Promise<AgentSession> {
    const client = await this.pool.connect();
    try {
      // 首先验证agent是否存在且属于该用户
      const agentCheckQuery = `
        SELECT id FROM mastra_agents
        WHERE id = $1 AND created_by = $2
      `;
      const agentResult = await client.query(agentCheckQuery, [request.agentId, userId]);

      if (agentResult.rows.length === 0) {
        throw new Error('Agent不存在或无权限访问');
      }

      const insertQuery = `
        INSERT INTO agent_sessions (agent_id, user_id, title)
        VALUES ($1, $2, $3)
        RETURNING id, agent_id, user_id, title, status, created_at, updated_at
      `;

      const values = [
        request.agentId,
        userId,
        request.title || '新对话'
      ];

      const result = await client.query(insertQuery, values);
      const row = result.rows[0];

      return {
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  // 获取用户的所有会话
  async getUserSessions(userId: number, agentId?: string): Promise<AgentSession[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT s.id, s.agent_id, s.user_id, s.title, s.status, s.created_at, s.updated_at,
               a.name as agent_name
        FROM agent_sessions s
        JOIN mastra_agents a ON s.agent_id = a.id
        WHERE s.user_id = $1 AND s.status != 'deleted'
      `;

      const values: any[] = [userId];

      if (agentId) {
        query += ` AND s.agent_id = $2`;
        values.push(agentId);
      }

      query += ` ORDER BY s.updated_at DESC`;

      const result = await client.query(query, values);

      return result.rows.map(row => ({
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } finally {
      client.release();
    }
  }

  // 获取单个会话详情
  async getSession(sessionId: string, userId: number): Promise<AgentSession | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT s.id, s.agent_id, s.user_id, s.title, s.status, s.created_at, s.updated_at
        FROM agent_sessions s
        WHERE s.id = $1 AND s.user_id = $2 AND s.status != 'deleted'
      `;

      const result = await client.query(query, [sessionId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  // 更新会话
  async updateSession(sessionId: string, userId: number, request: UpdateSessionRequest): Promise<AgentSession | null> {
    const client = await this.pool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (request.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        values.push(request.title);
      }

      if (request.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        values.push(request.status);
      }

      if (updateFields.length === 0) {
        // 没有更新字段，直接返回现有会话
        return this.getSession(sessionId, userId);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(sessionId, userId);

      const query = `
        UPDATE agent_sessions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} AND status != 'deleted'
        RETURNING id, agent_id, user_id, title, status, created_at, updated_at
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        agentId: row.agent_id,
        userId: row.user_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  // 删除会话（软删除）
  async deleteSession(sessionId: string, userId: number): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE agent_sessions
        SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2 AND status != 'deleted'
      `;

      const result = await client.query(query, [sessionId, userId]);
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  // 添加消息到会话
  async addMessage(sessionId: string, userId: number, message: SendMessageRequest & { role: 'user' | 'assistant' | 'system' }): Promise<SessionMessage> {
    const client = await this.pool.connect();
    try {
      // 首先验证会话是否存在且属于该用户
      const sessionCheck = await this.getSession(sessionId, userId);
      if (!sessionCheck) {
        throw new Error('会话不存在或无权限访问');
      }

      const insertQuery = `
        INSERT INTO session_messages (session_id, role, content, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id, session_id, role, content, metadata, created_at, updated_at
      `;

      const values = [
        sessionId,
        message.role,
        message.content,
        JSON.stringify(message.metadata || {})
      ];

      const result = await client.query(insertQuery, values);
      const row = result.rows[0];

      // 更新会话的更新时间
      await client.query(
        'UPDATE agent_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [sessionId]
      );

      return {
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } finally {
      client.release();
    }
  }

  // 获取会话的消息历史
  async getSessionMessages(sessionId: string, userId: number, limit = 50, offset = 0): Promise<SessionMessage[]> {
    const client = await this.pool.connect();
    try {
      // 首先验证会话是否存在且属于该用户
      const sessionCheck = await this.getSession(sessionId, userId);
      if (!sessionCheck) {
        throw new Error('会话不存在或无权限访问');
      }

      const query = `
        SELECT id, session_id, role, content, metadata, created_at, updated_at
        FROM session_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
        LIMIT $2 OFFSET $3
      `;

      const result = await client.query(query, [sessionId, limit, offset]);

      return result.rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } finally {
      client.release();
    }
  }

  // 关闭连接池
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const sessionService = new SessionService();