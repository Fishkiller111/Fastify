# 提现功能接入说明

3. 商户后端对接流程

通常建议你在自己系统里封一层 API，比如 `/api/user/withdraw`，由这层去调用 BEpusdt 的接口。

### 3.1 签名规则（与收款完全相同）

提现接口的签名规则与文档 `docs/api.md` 中描述的 Epusdt 签名完全一致：

1. 对请求 JSON 里**除 `signature` 外的所有非空字段**，按 key 的 ASCII 字典序排序；
2. 用 `key1=value1&key2=value2...` 拼成一行；
3. 在末尾拼接 `auth_token`（conf.toml 中配置）；
4. 对最终字符串做 MD5，再转小写，即为 `signature`。

你可以直接复用现有收款端的签名代码。

### 3.2 创建提现订单 `/api/v1/withdraw/create`

#### 3.2.1 请求参数

- URL：`POST /api/v1/withdraw/create`
- Header：`Content-Type: application/json`
- Body 字段（被签名的字段）：

```json
{
  "order_id": "merchant_withdraw_123",
  "user_id": "uid_1001",
  "amount": 10.5,
  "trade_type": "usdt.polygon",
  "address": "0xUserEvmAddress",
  "notify_url": "https://merchant.example.com/withdraw/notify",
  "timeout": 1800,
  "daily_limit": 5000,
  "signature": "md5-signature-here"
}
```

字段说明：

- `order_id`：你系统里的提现单号（字符串）；
- `user_id`：提现用户的唯一标识，用于 BEpusdt 做单日限额统计；
- `amount`：提现代币数量（如 10.5 USDT）；
- `trade_type`：代币类型（如 `usdt.bep20` / `usdt.polygon` / `usdt.erc20` / `usdc.base` 等）；
- `address`：用户的收款地址（当前 EVM 提现只接受 EVM 地址）；
- `notify_url`：提现结果回调地址；
- `timeout`（可选）：提现单过期时间（秒），不填则走默认逻辑；
- `daily_limit`（可选）：覆盖该用户今日提现限额（代币数量），<=0 则使用 conf 默认；
- `signature`：按签名规则计算。

> 注意：BEpusdt 会按 `(user_id, trade_type)` 统计当天已提现总额，`today_used + amount > limit` 时直接返回「超过当日提现限额」。

#### 3.2.2 响应数据

成功时（包了一层通用 success 格式）：

```json
{
  "status_code": 200,
  "message": "success",
  "data": {
    "withdraw_id": "本地提现ID",
    "order_id": "merchant_withdraw_123",
    "user_id": "uid_1001",
    "trade_type": "usdt.polygon",
    "amount": "10.5",
    "status": 1,
    "address": "0xUserEvmAddress",
    "from_address": "",
    "tx_hash": "",
    "expired_at": 1732260000
  },
  "request_id": ""
}
```

#### 3.2.3 示例 curl

```bash
curl -X POST "https://bepusdt.example.com/api/v1/withdraw/create" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "merchant_withdraw_123",
    "user_id": "uid_1001",
    "amount": 10.5,
    "trade_type": "usdt.polygon",
    "address": "0xUserEvmAddress",
    "notify_url": "https://merchant.example.com/withdraw/notify",
    "timeout": 1800,
    "daily_limit": 5000,
    "signature": "your_signature_here"
  }'
```

### 3.3 查询提现状态 `/api/v1/withdraw/status`

- URL：`GET /api/v1/withdraw/status`
- Query 参数（二选一方式）：
  - 方式 1：`withdraw_id=...`
  - 方式 2：`order_id=...&user_id=...`

响应：

```json
{
  "status_code": 200,
  "message": "success",
  "data": {
    "withdraw_id": "本地提现ID",
    "order_id": "merchant_withdraw_123",
    "user_id": "uid_1001",
    "trade_type": "usdt.polygon",
    "amount": "10.5",
    "status": 2,
    "address": "0xUserEvmAddress",
    "from_address": "0xFromAddress",
    "tx_hash": "0x...",
    "expired_at": 1732260000
  },
  "request_id": ""
}
```

`status` 为内部状态码，大致对应：

- `1`：Pending（待出款）；
- `2`：Broadcasting / 处理中；
- `3`：Success；
- `4`：Failed；
- `5`：Canceled。

### 3.4 取消提现 `/api/v1/withdraw/cancel`

- URL：`POST /api/v1/withdraw/cancel`
- Body（签名同样通过 `signVerify` 校验）：

```json
{
  "withdraw_id": "本地提现ID",
  "signature": "md5-signature"
}
```

只允许在 `Pending` 状态下取消；取消后不会再尝试链上转账。

---

## 4. 提现结果回调（商户后端）

提现完成后，BEpusdt 会给 `notify_url` 做回调，结构**与原收款回调完全一致**，并使用同一签名算法：

```json
{
  "trade_id": "本地提现ID（WithdrawId）",
  "order_id": "merchant_withdraw_123",
  "amount": 0,
  "actual_amount": "10.5",
  "token": "0xUserEvmAddress",
  "block_transaction_id": "0xOnChainTxHash",
  "signature": "md5签名",
  "status": 2
}
```

- 你可以直接复用收款回调的验签逻辑；
- 建议以 `status` 为准：
  - `2`：提现成功，更新用户账务；
  - `3`：提现失败/取消，退回余额或标记异常。

---

## 5. 商户前端接入建议

前端**不建议直接调用 BEpusdt**，推荐流程：

1. 用户在前端发起提现（页面：输入金额 + 选择链 + 输入/选择收款地址）；
2. 前端调用你自己的后端接口，例如：`POST /api/user/withdraw/apply`；
3. 后端：
   - 校验用户余额、风控（最小/最大单笔、KYC 等）；
   - 在本地写一条提现记录；
   - 生成签名，调用 BEpusdt `/api/v1/withdraw/create`；
   - 保存 BEpusdt 返回的 `withdraw_id`、`tx_hash` 等；
   - 把本地提现单状态返回给前端。
4. 前端轮询你自己的接口（比如 `GET /api/user/withdraw/status?order_id=...`），后端内部再查 BEpusdt `/api/v1/withdraw/status` 或等待回调更新状态。
5. 前端展示：
   - 「处理中」→ 「成功」/「失败」；
   - 如有需要，可展示链上浏览器链接（通过 `tx_hash` 拼接）。

---

## 6. 总结：接入步骤 Checklist

1. **BEpusdt 实例**：

   - [X] 在 `conf.toml` 中配置 `[withdraw]` 段落并 `enabled = true`；
   - [X] 配置 `WALLET_KEY_PASSWORD` 环境变量；
   - [X] 通过 `/wallet/manage` 导入提现钱包私钥；
   - [X] 确认提现钱包地址都在 `[withdraw].wallet_address` 中；
   - [X] 配置 `auth_token` 并确保商户端使用相同 token 签名。
2. **商户后端**：

   - [ ] 封装提现申请接口 `/api/user/withdraw/apply`，内部调用 `/api/v1/withdraw/create`；
   - [ ] 使用与收款一致的签名算法生成 `signature`；
   - [ ] 在 `notify_url` 上实现提现回调处理与验签；
   - [ ] （可选）实现本地轮询提现状态的接口。
3. **商户前端**：

   - [ ] 添加提现页面（金额 + 链 + 收款地址）；
   - [ ] 调用你自己的后端接口发起提现；
   - [ ] 通过你的后端轮询/推送展示提现进度和结果。
