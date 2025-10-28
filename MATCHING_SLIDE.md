# 匹配滑动值(Matching Slide)机制文档

## 概述

匹配滑动值是一个公平的事件启动机制，用于确保在待匹配状态下，反方投注累计达到创建者允许的最小风险门槛后，才能成功开盘。这保证了双方在正式开始时拥有相等的池子，确保赔率的公平性。

**核心概念**: 
- `matching_slide` = **创建者愿意保留的百分比**
- 反方需要投注的金额 = `initial_pool_amount × (1 - matching_slide%)`
- **核心原理**: 确保 YES Odds = NO Odds = 50%（1:1公平开盘）

---

## 功能设计

### 1. 数据库架构

#### 新增字段 (migration 010-add-matching-slide.ts)

```sql
ALTER TABLE meme_events
ADD COLUMN matching_slide INTEGER DEFAULT 50
CHECK (matching_slide >= 1 AND matching_slide <= 100);

ALTER TABLE meme_events
ADD COLUMN matched_amount NUMERIC(36, 18) DEFAULT 0;
```

**字段说明**:
- `matching_slide` (1-100): **创建者愿意保留的百分比**
  - 例: 50 表示创建者保留50%的初始资金，反方需要投注50%
  - 例: 10 表示创建者仅保留10%的初始资金，反方需要投注90%
  - 允许范围: 1% 至 100%
  - 默认值: 50

- `matched_amount`: 待匹配状态下，反方的累计投注金额
  - 用于快速判断是否满足匹配条件
  - 当反方累计投注 >= 初始资金 × (1 - matching_slide%) 时触发激活

---

## 工作流程

### 2.1 事件创建阶段

```
用户创建事件:
POST /api/meme/events
{
  "type": "pumpfun",
  "contract_address": "0x...",
  "creator_side": "yes",           // 创建者选择YES或NO
  "initial_pool_amount": 100,
  "matching_slide": 50,            // ✅ 新增：匹配滑动值(%)
  "duration": "1days"
}
```

**创建过程**:
1. 验证 `matching_slide` 在1-100范围内
2. 创建事件，状态为 `pending_match`
3. 根据创建者选择的方向分配初始池子
   - YES创建: YES池=100, NO池=0
4. 初始化 `matched_amount = 0`

**示例结果**:
```json
{
  "id": 1,
  "creator_side": "yes",
  "initial_pool_amount": "100",
  "matching_slide": 50,
  "yes_pool": "100",
  "no_pool": "0",
  "matched_amount": "0",
  "status": "pending_match"
}
```

---

### 2.2 待匹配状态投注阶段 (pending_match)

**规则**:
- ✅ 只能下注与创建者**相反**方向
- ✅ 每次投注后检查是否满足匹配条件
- ✅ 不满足时保持 `pending_match` 状态
- ✅ 满足时自动激活并返还超额

#### 场景1: 精确匹配

```
创建: YES 100U, matching_slide 50% (创建者保留50%)
需求: NO 50U 才能开盘 (100 × (1 - 50%) = 50)

投注1: 用户A投注NO 50U
  → matched_amount = 50
  → 50 >= (100 × (1 - 50%)) ✅ 满足条件！
  
激活结果:
  状态: active
  YES池: 50U, NO池: 50U
  创建者退款: 50U (保留部分退款)
  投注者退款: 无
```

#### 场景2: 反方超额

```
创建: YES 100U, matching_slide 70% (创建者保留70%)
需求: NO 30U 才能开盘 (100 × (1 - 70%) = 30)

投注1: 用户A投注NO 20U
投注2: 用户B投注NO 20U (总计40U，超额10U)
  → matched_amount = 40
  → 40 >= 30 ✅ 满足条件！
  
激活结果:
  状态: active
  YES池: 30U, NO池: 30U
  创建者退款: 70U (保留部分退款)
  反方退款: 
    用户B: 10U (最后投注者承担超额)
```

#### 场景3: 多投注者分摊超额

```
创建: YES 100U, matching_slide 70% (创建者保留70%)
需求: NO 30U 才能开盘 (100 × (1 - 70%) = 30)

投注1: 用户A投注NO 15U
投注2: 用户B投注NO 15U
投注3: 用户C投注NO 15U (总计45U，超额15U)
  → matched_amount = 45
  → 45 >= 30 ✅ 满足条件！
  
激活结果:
  状态: active
  YES池: 30U, NO池: 30U
  创建者退款: 70U (保留部分退款)
  反方退款:
    用户C: 15U (从最后一个投注者开始往前退款)
```

---

### 2.3 自动激活逻辑

激活发生在 `placeBet()` 函数中，满足以下条件时触发:

```typescript
const counterPool = creator_side === 'yes' ? parseFloat(no_pool) : parseFloat(yes_pool);
const requiredAmount = initialPoolAmount × (1 - matching_slide / 100);

if (counterPool >= requiredAmount) {
  // 触发激活
  await activateEventAfterMatching(...);
}
```

#### 激活过程

1. **计算多余金额**
   ```
   excess = counterPool - requiredAmount
   ```

2. **退款分配**
   - 反方多余: 按投注顺序从最后一个往前退款
   - 创建者多余: 全额退款（因创建者是单笔）

3. **池子调整**
   ```
   最终 YES池 = requiredAmount
   最终 NO池 = requiredAmount
   ```

4. **状态转换**
   ```
   pending_match → active
   launch_time = 当前时间
   ```

---

## API 参数更新

### 创建事件API

**POST /api/meme/events**

```json
{
  "type": "pumpfun",
  "contract_address": "0x...",
  "creator_side": "yes|no",
  "initial_pool_amount": 100,
  "matching_slide": 50,      // ✅ 新增必填参数
  "duration": "1days"
}
```

**验证规则**:
```typescript
if (!body.matching_slide || body.matching_slide < 1 || body.matching_slide > 100) {
  return reply.code(400).send({ error: '匹配滑动值必须在1-100之间' });
}
```

**Schema定义**:
```json
{
  "matching_slide": {
    "type": "integer",
    "minimum": 1,
    "maximum": 100,
    "description": "匹配滑动值(%)：创建者愿意保留的百分比。反方需要投注 initial_pool_amount × (1 - matching_slide%) 才能成功开盘"
  }
}
```

---

## 关键业务规则

### 3.1 状态转换

```
创建事件
    ↓
pending_match (待匹配)
    ↓ (反方投注达到要求)
active (正式开盘)
    ↓ (到达deadline)
settled (已结算)
```

### 3.2 匹配条件

```
反方累计投注 >= 初始资金 × (1 - matching_slide%)

示例:
  initial: 1000U, slide: 25% (创建者保留25%)
  需求: 750U (1000 × (1 - 25%))
  
  initial: 500U, slide: 100% (创建者保留全部)
  需求: 0U (1000 × (1 - 100%))
  
  initial: 1000U, slide: 10% (创建者仅保留10%)
  需求: 900U (1000 × (1 - 10%))
```

### 3.3 退款原则

**创建者方** (主方):
- 投注金额固定为 `initial_pool_amount`
- 激活时，创建者的保留部分全额退款
- 退款金额 = `initial_pool_amount × matching_slide%`
- 示例：初始100U，保留50%，退款50U

**反方**:
- 若超额投注，从最后一个投注者开始往前按比例退款
- 保证最终反方池子 = `initial_pool_amount × (1 - matching_slide%)`

### 3.4 赔率公平性

激活后保证:
```
YES池 = NO池 = initial_pool_amount × (1 - matching_slide%)
YES odds = 50%
NO odds = 50%
```

例如：初始100U，matching_slide 50%
```
YES池 = 100 × (1 - 50%) = 50U
NO池 = 100 × (1 - 50%) = 50U
赔率: 各50%，完全公平
```

---

## 实现细节

### 4.1 核心函数

#### handlePendingMatchBet()
```typescript
async function handlePendingMatchBet(
  client: any,
  event: any,
  userId: number,
  betType: string,
  betAmount: number,
  eventId: number
): Promise<void>
```
**功能**: 更新 `matched_amount`，记录反方累计投注

#### activateEventAfterMatching()
```typescript
async function activateEventAfterMatching(
  client: any,
  eventId: number,
  creatorSide: string,
  requiredAmount: number,
  initialPoolAmount: number
): Promise<void>
```
**功能**: 
- 处理超额退款
- 调整池子金额
- 更新事件状态为 active

### 4.2 数据一致性

所有操作在数据库事务中执行:
```typescript
await client.query('BEGIN');
try {
  // 所有操作...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
}
```

---

## 测试用例

### 5.1 测试覆盖

✅ **Scenario 1**: 精确匹配 (创建者100, 反方50, slide 50%)
✅ **Scenario 2**: 反方超额 (创建者100, 反方60, slide 50%)
✅ **Scenario 3**: 多投注者超额 (创建者100, 反方3×15, slide 30%)
✅ **Scenario 4**: 反方创建 (创建者NO 100, 反方YES 40, slide 40%)
✅ **Scenario 5**: 全额匹配 (创建者100, 反方100, slide 100%)
✅ **Scenario 6**: 最小匹配 (创建者1000, 反方10, slide 1%)

**运行测试**:
```bash
npm run build
node dist/modules/meme/matching-slide.test.js
```

---

## 集成检查清单

- [x] 数据库迁移文件创建 (010-add-matching-slide.ts)
- [x] Types 定义更新 (MemeEvent, CreateMemeEventRequest)
- [x] API 路由更新 (POST /api/meme/events)
- [x] 参数验证实现
- [x] placeBet() 核心逻辑更新
- [x] handlePendingMatchBet() 实现
- [x] activateEventAfterMatching() 实现
- [x] TypeScript 编译验证
- [x] 单元测试验证
- [ ] 集成测试 (可选)
- [ ] 前端集成

---

## 迁移步骤

1. **备份数据库**
   ```bash
   pg_dump your_database > backup.sql
   ```

2. **运行迁移**
   ```bash
   npm run migrate
   ```

3. **验证字段**
   ```sql
   SELECT matching_slide, matched_amount FROM meme_events LIMIT 1;
   ```

4. **编译项目**
   ```bash
   npm run build
   ```

5. **重启服务**
   ```bash
   npm run dev
   ```

---

## 常见问题 (FAQ)

**Q: matching_slide 10% 表示什么？**
A: 创建者愿意保留初始资金的10%。反方需要投注 initial_pool_amount × (1 - 10%) = initial_pool_amount × 90% 才能开盘。

**Q: 如果创建者投100U，matching_slide设为10%，反方需要投多少？**
A: 反方需要投注 100 × (1 - 10%) = 90U。创建者最终将获得10U的退款。

**Q: 如果反方投注未达到要求，事件会如何处理？**
A: 事件保持 `pending_match` 状态。到达 deadline 时，应实现自动取消机制，返还所有参与者的金额。

**Q: matching_slide 能否修改？**
A: 当前设计为创建时固定，不支持修改。若需修改，需要全新创建事件。

**Q: 多个反方投注者何时退款？**
A: 激活时自动处理。退款操作在 `activateEventAfterMatching()` 中同步执行。

**Q: 创建者可以在事件激活前退出吗？**
A: 不可以。创建者的资金在创建事件时已扣除。待匹配阶段应实现超时自动退款机制。

---

## 性能优化

- 添加索引: `idx_meme_events_matching_slide`
- 减少不必要的查询
- 使用事务保证原子性
- 非关键操作(K线、WebSocket)在事务外执行

---

## 监控指标

建议追踪:
- 平均匹配时间
- 超额投注比例
- 退款频率和金额
- pending_match 超时率

---

**最后更新**: 2025-10-28
**版本**: 1.0
**状态**: ✅ 实现完成，所有测试通过
