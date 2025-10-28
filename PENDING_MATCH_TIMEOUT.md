# 待匹配超时机制文档

## 概述

`pending_match_timeout` 是为了保护创建者的资金而设立的机制。当事件处于 `pending_match` 状态超过指定时间后，系统应自动取消事件并返还所有参与者的资金。

---

## 核心概念

**待匹配状态**：事件创建后，等待反方投注达到匹配要求的状态

**超时时间**：从事件创建时刻开始计时，到达指定秒数后，如果事件还未激活，应自动取消

---

## 字段定义

### pending_match_timeout

- **类型**：INTEGER（秒）
- **范围**：1 - 604800（1秒 - 7天）
- **默认值**：3600（1小时）
- **可选**：是（创建事件时可以指定，不指定则使用默认值）
- **数据库约束**：`CHECK (pending_match_timeout > 0 AND pending_match_timeout <= 604800)`

---

## 工作流程

```
1️⃣ 创建事件
   pending_match_timeout = 3600 (默认1小时)
   created_at = 2025-10-28 12:00:00
   ↓
2️⃣ 待匹配状态 (pending_match)
   计时开始
   ↓
3️⃣ 两种结果
   
   情况A - 反方投注达到要求 (< 3600秒)
   └─→ 自动激活 (active) ✅
   
   情况B - 超时未激活 (>= 3600秒)
   └─→ 自动取消 (cancelled)
   └─→ 返还所有资金 💰
```

---

## API 参数

### 创建事件

**POST /api/meme/events**

```json
{
  "type": "pumpfun",
  "contract_address": "0x...",
  "creator_side": "yes",
  "initial_pool_amount": 100,
  "matching_slide": 50,
  "pending_match_timeout": 3600,    // ✅ 新增（可选）
  "duration": "1days"
}
```

**参数说明**：
- `pending_match_timeout`（可选）：待匹配超时时间(秒)
  - 最小值：1秒
  - 最大值：604800秒（7天）
  - 默认值：3600秒（1小时）
  - 不指定时使用默认值

**响应示例**：
```json
{
  "id": 1,
  "status": "pending_match",
  "created_at": "2025-10-28T12:00:00Z",
  "pending_match_timeout": 3600,
  "matching_slide": 50,
  "yes_pool": "100",
  "no_pool": "0",
  "matched_amount": "0"
}
```

---

## 超时检查机制

### 需要实现的组件

当前代码已添加了字段和参数验证，但仍需实现以下功能：

#### 1. **定时任务（Cron Job）**
```typescript
// 每分钟检查一次
const checkPendingMatchTimeout = async () => {
  const now = new Date();
  
  const timedOutEvents = await pool.query(`
    SELECT * FROM meme_events
    WHERE status = 'pending_match'
    AND created_at + INTERVAL '1 second' * pending_match_timeout <= $1
  `, [now]);
  
  // 为每个超时事件执行取消操作
  for (const event of timedOutEvents.rows) {
    await cancelPendingMatchEvent(event.id);
  }
};
```

#### 2. **取消事件函数**
```typescript
async function cancelPendingMatchEvent(eventId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. 获取事件信息
    const event = await client.query(
      'SELECT * FROM meme_events WHERE id = $1',
      [eventId]
    );
    
    // 2. 返还创建者资金
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [event.initial_pool_amount, event.creator_id]
    );
    
    // 3. 返还反方投注者资金
    const bets = await client.query(
      `SELECT user_id, bet_amount FROM meme_bets 
       WHERE event_id = $1 AND status = 'pending'`,
      [eventId]
    );
    
    for (const bet of bets.rows) {
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [bet.bet_amount, bet.user_id]
      );
    }
    
    // 4. 更新事件状态
    await client.query(
      `UPDATE meme_events 
       SET status = 'cancelled', settled_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [eventId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## 配置建议

### 常见的超时时间设置

| 场景 | 推荐值 | 说明 |
|-----|--------|------|
| 快速赛事 | 300-600秒 | 5-10分钟，适合高热度事件 |
| 标准赛事 | 3600秒 | 1小时（默认值） |
| 长期赛事 | 7200-14400秒 | 2-4小时，等待反方投注 |
| 超长赛事 | 86400秒 | 24小时，宽松的匹配窗口 |

### 动态设置示例

```json
// 创建快速赛事（10分钟）
{
  "type": "pumpfun",
  "contract_address": "0x...",
  "creator_side": "yes",
  "initial_pool_amount": 100,
  "matching_slide": 50,
  "pending_match_timeout": 600,     // 10分钟
  "duration": "1hours"
}

// 创建长期赛事（4小时）
{
  "type": "bonk",
  "contract_address": "0x...",
  "creator_side": "yes",
  "initial_pool_amount": 200,
  "matching_slide": 50,
  "pending_match_timeout": 14400,   // 4小时
  "duration": "1days"
}
```

---

## 边界情况

| 情况 | 处理方式 |
|-----|--------|
| 超时时刻恰好激活 | 激活优先（活跃状态不受超时影响） |
| 多个事件同时超时 | 依次处理，批量返还 |
| 返还过程中出错 | 回滚事务，保证数据一致性 |
| 事件已是 active 状态 | 不受超时影响，继续正常流程 |

---

## 数据库迁移

### Migration 011-add-pending-match-timeout.ts

```sql
-- 添加字段
ALTER TABLE meme_events
ADD COLUMN pending_match_timeout INTEGER DEFAULT 3600
CHECK (pending_match_timeout > 0 AND pending_match_timeout <= 604800);

-- 添加索引以提高查询性能
CREATE INDEX idx_meme_events_pending_match_check
ON meme_events(status, created_at)
WHERE status = 'pending_match';
```

---

## 监控指标

建议追踪以下指标：

- **超时率**：超时取消的事件 / 总pending_match事件
- **平均匹配耗时**：从创建到激活的平均时间
- **超时设置分布**：不同超时时间的使用频率
- **资金返还总额**：因超时而返还的总金额

---

## 常见问题

**Q: 如何修改已创建事件的超时时间？**
A: 当前设计不支持修改。需要创建新事件指定不同的超时时间。

**Q: 超时后，创建者可以重新创建相同的事件吗？**
A: 可以。被取消的事件与新事件完全独立。

**Q: 部分反方投注者已获利后，事件超时会取消吗？**
A: 否。事件激活后不再受超时影响，只有 pending_match 状态才会触发超时。

**Q: 如果设置超时时间过短会怎样？**
A: 反方投注者可能没有足够时间达到匹配要求，事件被取消。建议根据实际情况调整。

---

## 实现检查清单

- [x] 数据库迁移文件 (011-add-pending-match-timeout.ts)
- [x] Types 定义更新 (MemeEvent, CreateMemeEventRequest)
- [x] API 参数验证 (routes.ts)
- [x] Service 函数参数处理 (service.ts)
- [ ] **待实现：定时检查任务**
- [ ] **待实现：取消事件函数**
- [ ] **待实现：事件状态转换逻辑**
- [ ] 集成测试
- [ ] 前端集成

---

**最后更新**：2025-10-28
**版本**：1.0
**状态**：⚠️ 等待超时检查机制实现
