import pool from '../../config/database.js';
import config from '../../config/index.js';
import {
  createGatewayWithdraw,
  cancelGatewayWithdraw,
} from '../../utils/withdraw-gateway.js';
import { getConfigByKey } from '../config/service.js';
import type {
  CreateWithdrawApplyRequest,
  CreateWithdrawApplyResponse,
  WithdrawStatusResponse,
  CancelWithdrawResponse,
  WithdrawGatewayNotifyRequest,
  WithdrawStatus,
} from './types.js';

/**
 * 提现服务：负责本地提现订单与调用 BEpusdt 提现接口
 */
class WithdrawService {
  /**
   * 生成本地提现订单号
   * 与充值订单保持类似格式：yyyyMMddHHmmssSSS + 3位随机数
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
   * 规范化提现金额：保留 6 位小数，使用字符串参与签名与落库
   */
  private normalizeAmount(amount: number): { numeric: number; asString: string } {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('提现金额必须大于 0');
    }

    const numeric = Number(amount.toFixed(6));
    const asString = numeric.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return { numeric, asString };
  }

  /**
   * 读取全局提现抽成比例（百分比 0-100），来自 config 表 key=withdraw_fee_rate_percent
   */
  private async getGlobalWithdrawFeeRatePercent(): Promise<number> {
    try {
      const item = await getConfigByKey('withdraw_fee_rate_percent');
      if (!item || !item.value) return 0;
      const v = Number(item.value);
      if (!Number.isFinite(v) || v <= 0) return 0;
      if (v >= 100) return 99.999; // 避免 100% 抽成
      return v;
    } catch {
      return 0;
    }
  }

  /**
   * 用户申请提现：根据全局抽成配置决定是否扣除抽成
   * - 未配置或为 0 时：走无抽成逻辑
   * - >0 时：走带抽成逻辑
   */
  async applyWithdraw(
    userId: number,
    payload: CreateWithdrawApplyRequest,
  ): Promise<CreateWithdrawApplyResponse> {
    const feeRatePercent = await this.getGlobalWithdrawFeeRatePercent();
    if (feeRatePercent > 0) {
      return this.applyWithdrawWithFee(userId, payload, feeRatePercent);
    }
    return this.applyWithdrawNoFee(userId, payload);
  }

  /**
   * 无抽成提现逻辑（原 /apply 行为）
   */
  private async applyWithdrawNoFee(
    userId: number,
    payload: CreateWithdrawApplyRequest,
  ): Promise<CreateWithdrawApplyResponse> {
    const client = await pool.connect();

    try {
      const { numeric: amountNumber, asString: amountString } = this.normalizeAmount(
        payload.amount,
      );

      const gatewayConfig = config.withdrawGateway;
      if (!gatewayConfig.notifyUrl) {
        throw new Error('提现回调地址未配置，请设置 WITHDRAW_NOTIFY_URL');
      }

      await client.query('BEGIN');

      // 1. 锁定用户余额并校验
      const userResult = await client.query(
        'SELECT id, balance, wallet_address FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );

      if (userResult.rows.length === 0) {
        throw new Error('用户不存在');
      }

      const userRow = userResult.rows[0] as {
        id: number;
        balance: string | null;
        wallet_address: string | null;
      };

      const currentBalance = parseFloat(userRow.balance ?? '0');
      if (!Number.isFinite(currentBalance) || currentBalance < amountNumber) {
        throw new Error('余额不足');
      }

      const address = (payload.address ?? userRow.wallet_address ?? '').trim();
      if (!address) {
        throw new Error('提现地址不能为空');
      }

      // 扣减用户余额
      await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [
        amountNumber,
        userId,
      ]);

      const orderId = this.generateOrderId();
      const tradeType = payload.trade_type || gatewayConfig.defaultTradeType;
      const timeoutSeconds = payload.timeout || gatewayConfig.defaultTimeoutSeconds;

      // 2. 创建本地提现订单（先写入 pending 状态）
      const insertResult = await client.query(
        `INSERT INTO withdraw_orders (
           user_id,
           order_id,
           trade_type,
           amount,
           address,
           status,
           expired_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' seconds')::interval)
         RETURNING id, user_id, order_id, withdraw_id, trade_type, amount, address, status, from_address, tx_hash, expired_at, created_at, updated_at`,
        [userId, orderId, tradeType, amountString, address, 'pending', timeoutSeconds],
      );

      const localOrder = insertResult.rows[0] as {
        id: number;
        user_id: number;
        order_id: string;
      };

      // 3. 调用 BEpusdt 创建提现订单
      const gatewayData = await createGatewayWithdraw({
        order_id: orderId,
        user_id: String(userId),
        amount: amountString,
        trade_type: tradeType,
        address,
        notify_url: gatewayConfig.notifyUrl,
        timeout: timeoutSeconds,
        daily_limit: payload.daily_limit,
      });

      // 更新本地订单的网关信息
      await client.query(
        `UPDATE withdraw_orders
         SET withdraw_id = $1,
             from_address = $2,
             tx_hash = $3,
             expired_at = TO_TIMESTAMP($4),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          gatewayData.withdraw_id,
          gatewayData.from_address || null,
          gatewayData.tx_hash || null,
          gatewayData.expired_at,
          localOrder.id,
        ],
      );

      await client.query('COMMIT');

      const response: CreateWithdrawApplyResponse = {
        order_id: gatewayData.order_id,
        withdraw_id: gatewayData.withdraw_id,
        amount: gatewayData.amount,
        trade_type: gatewayData.trade_type,
        address: gatewayData.address,
        status: 'pending',
        expired_at: gatewayData.expired_at,
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
   * 处理 BEpusdt 提现结果回调（notify_url）
   * 1. 验签
   * 2. 根据回调 status 更新本地订单状态
   * 3. 在失败/取消时退回用户余额（幂等处理）
   */
  async handleGatewayNotify(payload: WithdrawGatewayNotifyRequest): Promise<void> {
    const { signature, ...signData } = payload as any;

    // 复用支付网关的签名算法（与 docs/api.md & withdraw.md 一致）
    const { signGatewayParams } = await import('../../utils/payment-gateway.js');
    const expectedSignature = signGatewayParams(signData, config.withdrawGateway.authToken);

    if (!signature || signature.toLowerCase() !== expectedSignature.toLowerCase()) {
      throw new Error('INVALID_SIGNATURE');
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `SELECT id, user_id, amount, status, withdraw_id
         FROM withdraw_orders
         WHERE order_id = $1
         FOR UPDATE`,
        [payload.order_id],
      );

      if (orderResult.rows.length === 0) {
        throw new Error('WITHDRAW_ORDER_NOT_FOUND');
      }

      const order = orderResult.rows[0] as {
        id: number;
        user_id: number;
        amount: string;
        gross_amount?: string | null;
        status: WithdrawStatus;
        withdraw_id: string | null;
      };

      const currentStatus = order.status;
      let newStatus: WithdrawStatus = currentStatus;

      // 文档中约定：2=提现成功，3=提现失败/取消
      if (payload.status === 2) {
        // 提现成功：只在非 success 状态下更新为 success，不再变更余额
        if (currentStatus !== 'success') {
          newStatus = 'success';
        }
      } else if (payload.status === 3) {
        // 提现失败/取消：仅在 pending 状态下退回余额
        if (currentStatus === 'pending') {
          const grossOrAmount =
            order.gross_amount && Number(order.gross_amount) > 0
              ? Number(order.gross_amount)
              : Number(order.amount);
          if (!Number.isFinite(grossOrAmount) || grossOrAmount <= 0) {
            throw new Error('INVALID_WITHDRAW_AMOUNT');
          }

          await client.query(
            'UPDATE users SET balance = balance + $1 WHERE id = $2',
            [grossOrAmount, order.user_id],
          );

          newStatus = 'failed';
        }
      }

      await client.query(
        `UPDATE withdraw_orders
         SET status = $1,
             tx_hash = COALESCE($2, tx_hash),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newStatus, payload.block_transaction_id || null, order.id],
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
   * 查询当前用户的提现状态
   */
  async getWithdrawStatus(
    userId: number,
    params: { order_id: string },
  ): Promise<WithdrawStatusResponse> {
    const client = await pool.connect();

    try {
      const { order_id } = params;
      const result = await client.query(
        `SELECT id, user_id, order_id, withdraw_id, trade_type, amount, address, status,
                from_address, tx_hash, expired_at, created_at, updated_at
         FROM withdraw_orders
         WHERE order_id = $1`,
        [order_id],
      );

      if (result.rows.length === 0) {
        throw new Error('WITHDRAW_ORDER_NOT_FOUND');
      }

      const row = result.rows[0];

      if (row.user_id !== userId) {
        throw new Error('FORBIDDEN');
      }

      const toString = (v: any): string =>
        v instanceof Date ? v.toISOString() : String(v);

      return {
        order_id: row.order_id,
        withdraw_id: row.withdraw_id,
        amount: String(row.amount),
        trade_type: row.trade_type,
        address: row.address,
        status: row.status,
        tx_hash: row.tx_hash,
        from_address: row.from_address,
        expired_at: row.expired_at ? toString(row.expired_at) : null,
        created_at: toString(row.created_at),
        updated_at: toString(row.updated_at),
      };
    } finally {
      client.release();
    }
  }

  /**
   * 取消提现：仅允许 pending 状态，退回余额并标记为 cancelled，之后调用网关取消
   */
  async cancelWithdraw(userId: number, orderId: string): Promise<CancelWithdrawResponse> {
    const client = await pool.connect();
    let order: {
      id: number;
      user_id: number;
      order_id: string;
      withdraw_id: string | null;
      status: WithdrawStatus;
      amount: string;
      gross_amount?: string | null;
    } | null = null;

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT id, user_id, order_id, withdraw_id, status, amount
         FROM withdraw_orders
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId],
      );

      if (result.rows.length === 0) {
        throw new Error('WITHDRAW_ORDER_NOT_FOUND');
      }

      const row = result.rows[0] as {
        id: number;
        user_id: number;
        order_id: string;
        withdraw_id: string | null;
        status: WithdrawStatus;
        amount: string;
        gross_amount?: string | null;
      };

      if (row.user_id !== userId) {
        throw new Error('FORBIDDEN');
      }

      if (row.status === 'success') {
        throw new Error('WITHDRAW_ALREADY_SUCCESS');
      }
      if (row.status === 'cancelled') {
        throw new Error('WITHDRAW_ALREADY_CANCELLED');
      }
      if (row.status === 'failed') {
        throw new Error('WITHDRAW_ALREADY_FAILED');
      }

      if (row.status !== 'pending') {
        throw new Error('WITHDRAW_NOT_PENDING');
      }

      const grossOrAmount =
        row.gross_amount && Number(row.gross_amount) > 0
          ? Number(row.gross_amount)
          : Number(row.amount);
      if (!Number.isFinite(grossOrAmount) || grossOrAmount <= 0) {
        throw new Error('INVALID_WITHDRAW_AMOUNT');
      }

      // 退回余额（包含抽成部分）
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [grossOrAmount, row.user_id],
      );

      await client.query(
        `UPDATE withdraw_orders
         SET status = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        ['cancelled', row.id],
      );

      order = row;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // 提交本地事务后，再调用网关取消接口（避免长事务）
    try {
      if (order?.withdraw_id) {
        await cancelGatewayWithdraw(order.withdraw_id);
      }
    } catch (error: any) {
      console.error('调用提现网关取消失败:', error?.message || error);
      // 不抛出，让本地取消结果生效
    }

    return {
      order_id: order!.order_id,
      withdraw_id: order!.withdraw_id,
      status: 'cancelled',
    };
  }
  /**
   * 带抽成的提现申请：
   * - amount 为用户希望扣减的总金额（含抽成）
   * - fee_rate 为抽成比例，0-100 表示百分比，例如 5 表示 5% 抽成
   * - 用户最终实际到账金额 = amount * (1 - fee_rate/100)
   */
  private async applyWithdrawWithFee(
    userId: number,
    payload: CreateWithdrawApplyRequest,
    feeRatePercent: number,
  ): Promise<CreateWithdrawApplyResponse> {
    const client = await pool.connect();

    try {
      if (!Number.isFinite(feeRatePercent) || feeRatePercent <= 0 || feeRatePercent >= 100) {
        throw new Error('全局提现抽成比例 withdraw_fee_rate_percent 必须在 0-100 之间');
      }

      const feeRate = feeRatePercent / 100;
      const { numeric: grossAmount, asString: grossAmountStr } = this.normalizeAmount(
        payload.amount,
      );

      // 计算抽成金额和最终到账金额
      const feeNumericRaw = grossAmount * feeRate;
      const feeNumeric = Number(feeNumericRaw.toFixed(6));
      const feeAmountStr = feeNumeric
        .toFixed(6)
        .replace(/0+$/, '')
        .replace(/\.$/, '');

      const netNumericRaw = grossAmount - feeNumeric;
      if (netNumericRaw <= 0) {
        throw new Error('抽成后提现金额必须大于 0');
      }
      const netNumeric = Number(netNumericRaw.toFixed(6));
      const netAmountStr = netNumeric
        .toFixed(6)
        .replace(/0+$/, '')
        .replace(/\.$/, '');

      const gatewayConfig = config.withdrawGateway;
      if (!gatewayConfig.notifyUrl) {
        throw new Error('提现回调地址未配置，请设置 WITHDRAW_NOTIFY_URL');
      }

      await client.query('BEGIN');

      // 1. 锁定用户余额并校验（按总金额扣减）
      const userResult = await client.query(
        'SELECT id, balance, wallet_address FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );

      if (userResult.rows.length === 0) {
        throw new Error('用户不存在');
      }

      const userRow = userResult.rows[0] as {
        id: number;
        balance: string | null;
        wallet_address: string | null;
      };

      const currentBalance = parseFloat(userRow.balance ?? '0');
      if (!Number.isFinite(currentBalance) || currentBalance < grossAmount) {
        throw new Error('余额不足');
      }

      const address = (payload.address ?? userRow.wallet_address ?? '').trim();
      if (!address) {
        throw new Error('提现地址不能为空');
      }

      // 扣减用户余额：按总金额扣减
      await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [
        grossAmount,
        userId,
      ]);

      const orderId = this.generateOrderId();
      const tradeType = payload.trade_type || gatewayConfig.defaultTradeType;
      const timeoutSeconds = payload.timeout || gatewayConfig.defaultTimeoutSeconds;

      // 2. 创建本地提现订单（记录总金额、抽成金额和实际到账金额）
      const insertResult = await client.query(
        `INSERT INTO withdraw_orders (
           user_id,
           order_id,
           trade_type,
           amount,
           gross_amount,
           fee_amount,
           fee_rate,
           address,
           status,
           expired_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           NOW() + ($10 || ' seconds')::interval)
         RETURNING id, user_id, order_id, withdraw_id, trade_type, amount, gross_amount, fee_amount, fee_rate, address, status, from_address, tx_hash, expired_at, created_at, updated_at`,
        [
          userId,
          orderId,
          tradeType,
          netAmountStr,
          grossAmountStr,
          feeAmountStr,
          feeRate,
          address,
          'pending',
          timeoutSeconds,
        ],
      );

      const localOrder = insertResult.rows[0] as {
        id: number;
        user_id: number;
        order_id: string;
      };

      // 3. 调用 BEpusdt 创建提现订单（按净额发起链上提现）
      const gatewayData = await createGatewayWithdraw({
        order_id: orderId,
        user_id: String(userId),
        amount: netAmountStr,
        trade_type: tradeType,
        address,
        notify_url: gatewayConfig.notifyUrl,
        timeout: timeoutSeconds,
        daily_limit: payload.daily_limit,
      });

      // 更新本地订单的网关信息
      await client.query(
        `UPDATE withdraw_orders
         SET withdraw_id = $1,
             from_address = $2,
             tx_hash = $3,
             expired_at = TO_TIMESTAMP($4),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          gatewayData.withdraw_id,
          gatewayData.from_address || null,
          gatewayData.tx_hash || null,
          gatewayData.expired_at,
          localOrder.id,
        ],
      );

      await client.query('COMMIT');

      return {
        order_id: gatewayData.order_id,
        withdraw_id: gatewayData.withdraw_id,
        amount: gatewayData.amount,
        trade_type: gatewayData.trade_type,
        address: gatewayData.address,
        status: 'pending',
        expired_at: gatewayData.expired_at,
        gross_amount: grossAmountStr,
        fee_amount: feeAmountStr,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new WithdrawService();
