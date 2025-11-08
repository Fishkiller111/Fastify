# 结算逻辑重大变更 (2025-11-08)

## 变更概述

结算时的返还金额计算方式已修改：

**旧规则：**
- 返还金额 = amount × (odds / 100)
- 例如：YES 赔率 80%，持有 100 amount，返还 100 × 0.8 = 80U

**新规则：**
- 返还金额 = 获胜方 amount × 1U
- 例如：YES 获胜，持有 100 YES amount，返还 100 × 1 = 100U
- **结算时每个合约的单价永远按照 1U 计算**

## 修改的文件

### 1. `src/modules/meme/auto-settle.ts`
- 修改 `settleEventAuto` 函数
- 行 95-105：将结算计算从 `amount * (odds / 100)` 改为 `amount * 1`

### 2. `src/modules/mainstream/service.ts`
- 修改 `settleMainstreamEvent` 函数
- 行 1095-1104：将结算计算从 `amount * (odds / 100)` 改为 `amount * 1`

### 3. `src/modules/meme/amm-service.ts`
- 修改 `settleAllPositions` 函数签名，新增 `winnerSide` 参数
- 行 564-576：函数签名更新
- 行 605-645：结算逻辑重写，只返还获胜方持仓，按 1U/amount 计算

### 4. `src/modules/meme/service.ts`
- 修改 `settleEvent` 函数
- 行 742-749：调整顺序，先确定获胜方，再调用 `settleAllPositions(client, eventId, winnerSide)`

### 5. `docs/SETTLEMENT.md`
- 更新文档以反映新的结算规则

## 核心逻辑变化

### 之前的实现
手动结算和自动结算有差异：
- 手动结算：YES 和 NO 双方都按赔率返还
- 自动结算：只返还获胜方，按赔率计算

### 现在的实现
手动结算和自动结算已统一：
- **仅返还获胜方持仓**
- **不使用赔率，统一按 1U/amount 计算**

```typescript
// 新的结算逻辑
if (winnerSide === 'yes') {
  settleReturn = yesAmount * 1; // 单价固定为 1U
} else if (winnerSide === 'no') {
  settleReturn = noAmount * 1; // 单价固定为 1U
}
```

## 影响范围

### 受影响的功能
1. Meme 事件手动结算 (`POST /meme/events/settle`)
2. Meme 事件自动结算 (定时任务)
3. 主流币事件结算 (`settleMainstreamEvent`)

### 不受影响的功能
1. 正常的买入/卖出交易（仍然使用赔率定价）
2. K线数据记录
3. 用户持仓显示

## 示例对比

### 场景：YES 获胜，用户持有 100 YES + 50 NO

**旧规则（假设 YES 赔率 70%，NO 赔率 30%）：**
- 手动结算：YES 返还 100 × 0.7 = 70U，NO 返还 50 × 0.3 = 15U，总计 85U
- 自动结算：YES 返还 100 × 0.7 = 70U，NO 返还 0U，总计 70U

**新规则：**
- 统一返还：YES 返还 100 × 1 = 100U，NO 返还 0U，总计 100U

## 注意事项

1. **赔率仍然用于交易定价**：在 `active` 状态下的买卖操作仍然使用赔率进行定价
2. **只影响结算**：这个变更只影响事件结算时的返还计算，不影响交易过程
3. **向后不兼容**：已结算的事件不会重新计算，新规则仅对未来的结算生效

## 测试建议

1. 测试 Meme 事件手动结算
2. 测试 Meme 事件自动结算
3. 测试主流币事件结算
4. 验证获胜方和失败方的返还金额
5. 检查交易记录中的 `cost_or_return` 字段
6. 确认用户余额正确更新
