import pool from '../../config/database.js';
import config from '../../config/index.js';
import { createGatewayTransaction, signGatewayParams } from '../../utils/payment-gateway.js';
import type {
  CreateRechargeOrderRequest,
  CreateRechargeOrderResponse,
  GatewayNotifyRequest,
  OrderStatus,
  OrderStatusResponse,
  PaymentOrder,
} from './types.js';

/**
 * 订单服务：负责本地订单创建和调用支付网关
 */
class OrderService {
  /**
   * 生成本地订单号
   * 格式示例：20251119-xxxxx
   */
  private generateOrderId(): string {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const mi = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    const ms = now.getMilliseconds().toString().padStart(3, '0');

    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');

    return `${yyyy}${mm}${dd}${hh}${mi}${ss}${ms}${random}`;
  }

  /**
   * 规范化金额：保留两位小数，返回字符串用于签名 & 网关调用
   */
  private normalizeAmount(amount: number): { numeric: number; asString: string } {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('充值金额必须大于 0');
    }

    const numeric = Number(amount.toFixed(2));
    const asString = numeric.toFixed(2);
    return { numeric, asString };
  }

  /**
   * 创建充值订单：写入本地订单，并调用支付网关创建链上订单
   */
  async createRechargeOrder(
    userId: number,
    payload: CreateRechargeOrderRequest,
  ): Promise<CreateRechargeOrderResponse> {
    const client = await pool.connect();

    try {
      const { numeric: amountNumber, asString: amountString } = this.normalizeAmount(
        payload.amount,
      );

      const gatewayConfig = config.paymentGateway;
      if (!gatewayConfig.notifyUrl) {
        throw new Error('支付回调地址未配置，请设置 PAYMENT_NOTIFY_URL');
      }

      await client.query('BEGIN');

      // 1. 生成本地订单号并写入本地订单表（初始状态：unpaid）
      const orderId = this.generateOrderId();
      const tradeType = payload.trade_type || gatewayConfig.defaultTradeType;
      const timeoutSeconds = payload.timeout || gatewayConfig.defaultTimeoutSeconds;

      const insertResult = await client.query<PaymentOrder>(
        `INSERT INTO payment_orders (
           user_id,
           order_id,
           amount_cny,
           status,
           timeout_seconds
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, order_id, trade_id, amount_cny, actual_amount, token, status, payment_url, timeout_seconds, created_at, updated_at`,
        [userId, orderId, amountNumber.toString(), 'unpaid' as OrderStatus, timeoutSeconds],
      );

      const localOrder = insertResult.rows[0];

      // 2. 调用支付网关创建交易
      const redirectBase = gatewayConfig.redirectBaseUrl;
      const redirectUrl = redirectBase
        ? `${redirectBase}?order_id=${encodeURIComponent(orderId)}`
        : '';

      const gatewayData = await createGatewayTransaction({
        order_id: orderId,
        amount: amountString,
        trade_type: tradeType,
        notify_url: gatewayConfig.notifyUrl,
        redirect_url: redirectUrl,
        timeout: timeoutSeconds,
      });

      // 3. 更新本地订单的网关信息
      const newStatus: OrderStatus = 'unpaid';

      await client.query(
        `UPDATE payment_orders
         SET trade_id = $1,
             payment_url = $2,
             actual_amount = $3,
             token = $4,
             timeout_seconds = $5,
             status = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7`,
        [
          gatewayData.trade_id,
          gatewayData.payment_url,
          gatewayData.actual_amount,
          gatewayData.token,
          gatewayData.expiration_time,
          newStatus,
          localOrder.id,
        ],
      );

      await client.query('COMMIT');

      // 4. 返回给前端的数据（包含 payment_url）
      const response: CreateRechargeOrderResponse = {
        order_id: gatewayData.order_id,
        trade_id: gatewayData.trade_id,
        amount: gatewayData.amount,
        actual_amount: gatewayData.actual_amount,
        payment_url: gatewayData.payment_url,
        expiration_time: gatewayData.expiration_time,
        status: newStatus,
      };

      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 处理支付网关回调（notify_url）
   * 负责验签、更新订单状态以及在支付成功时为用户入账
   */
  async handleGatewayNotify(payload: GatewayNotifyRequest): Promise<void> {
    // 1. 验签
    const { signature, ...signData } = payload as any;
    const expectedSignature = signGatewayParams(signData, config.paymentGateway.authToken);

    if (!signature || signature.toLowerCase() !== expectedSignature.toLowerCase()) {
      throw new Error('INVALID_SIGNATURE');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 2. 锁定本地订单行，避免并发重复处理
      const orderResult = await client.query<any>(
        `SELECT id, user_id, status, amount_cny, actual_amount, trade_id
         FROM payment_orders
         WHERE order_id = $1
         FOR UPDATE`,
        [payload.order_id],
      );

      if (orderResult.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const order = orderResult.rows[0] as {
        id: number;
        user_id: number;
        status: OrderStatus;
        amount_cny: string;
        actual_amount: string | null;
        trade_id: string | null;
      };

      const gatewayStatus = payload.status;
      let newStatus: OrderStatus = order.status;

      // 3. 根据网关 status 更新本地订单状态
      if (gatewayStatus === 1) {
        // 等待支付：仅在当前为 unpaid 时更新为 pending_onchain
        if (order.status === 'unpaid') {
          newStatus = 'pending_onchain';
        }
      } else if (gatewayStatus === 2) {
        // 支付成功：幂等处理，只有非 paid 才入账
        if (order.status !== 'paid') {
          const delta = Number(payload.actual_amount);
          if (!Number.isFinite(delta) || delta <= 0) {
            throw new Error('INVALID_ACTUAL_AMOUNT');
          }

          // 为用户入账（单位：与业务余额一致，这里以 actual_amount 为准）
          await client.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [delta, order.user_id],
          );

          newStatus = 'paid';
        }
      } else if (gatewayStatus === 3) {
        // 订单超时：若尚未支付，则标记为 expired
        if (order.status !== 'paid') {
          newStatus = 'expired';
        }
      }

      // 4. 更新本地订单记录（trade_id / actual_amount / token / status）
      const actualAmountStr = String(payload.actual_amount);

      await client.query(
        `UPDATE payment_orders
         SET trade_id = COALESCE($1, trade_id),
             actual_amount = COALESCE($2, actual_amount),
             token = COALESCE($3, token),
             status = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [payload.trade_id, actualAmountStr, payload.token, newStatus, order.id],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 查询当前用户的订单状态（用于 redirect_url 页面实时展示）
   */
  async getOrderStatus(userId: number, orderId: string): Promise<OrderStatusResponse> {
    const client = await pool.connect();

    try {
      const result = await client.query<any>(
        `SELECT
           id,
           user_id,
           order_id,
           trade_id,
           amount_cny,
           actual_amount,
           status,
           payment_url,
           timeout_seconds,
           created_at,
           updated_at
         FROM payment_orders
         WHERE order_id = $1`,
        [orderId],
      );

      if (result.rows.length === 0) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const row = result.rows[0];

      if (row.user_id !== userId) {
        throw new Error('FORBIDDEN');
      }

      const toString = (v: any) => (v instanceof Date ? v.toISOString() : String(v));

      const response: OrderStatusResponse = {
        order_id: row.order_id,
        trade_id: row.trade_id,
        amount_cny: String(row.amount_cny),
        actual_amount: row.actual_amount !== null ? String(row.actual_amount) : null,
        status: row.status as OrderStatus,
        payment_url: row.payment_url,
        timeout_seconds: row.timeout_seconds,
        created_at: toString(row.created_at),
        updated_at: toString(row.updated_at),
      };

      return response;
    } finally {
      client.release();
    }
  }
}

export default new OrderService();
