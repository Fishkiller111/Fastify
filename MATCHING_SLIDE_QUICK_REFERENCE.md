# 匹配滑动值 - 快速参考

## 核心概念（一句话）
**matching_slide = 创建者愿意保留的百分比。反方投注必须累计达到初始资金的剩余百分比，才能成功开盘，确保双方池子相等（公平开盘）**

---

## 创建事件 API

```bash
POST /api/meme/events
Content-Type: application/json

{
  "type": "pumpfun",
  "contract_address": "0x...",
  "creator_side": "yes",
  "initial_pool_amount": 100,
  "matching_slide": 50,      # ✅ 新增：1-100% 的整数
  "duration": "1days"
}
```

---

## 工作流程图

```
1️⃣ 创建事件
   创建者YES投入 100U, matching_slide=50% (创建者保留50%)
   ↓
2️⃣ 待匹配状态 (pending_match)
   需要反方(NO)投注达到: 100 × (1 - 50%) = 50U
   ↓
3️⃣ 反方投注
   用户A投NO 50U → 激活！ ✅
   或
   用户A投NO 35U, 用户B投NO 25U → 激活！✅
   (超额10U，用户B退款10U)
   ↓
4️⃣ 激活成功 (active)
   YES池: 50U, NO池: 50U
   创建者退款: 50U (保留部分退款)
   正式开盘！
```

---

## 匹配条件

### 简单公式
```
反方累计投注 >= 初始资金 × (1 - matching_slide%)

matching_slide = 创建者保留的百分比

例:
initial=100, slide=50%  →  创建者保留50%, 反方需要 50U (100 × 50%)
initial=200, slide=70%  →  创建者保留70%, 反方需要 60U (200 × 30%)
initial=1000, slide=90% →  创建者保留90%, 反方需要 100U (1000 × 10%)
```

---

## 退款规则

| 情况 | 退款对象 | 金额 |
|-----|--------|------|
| 创建者保留部分 | 创建者 | 初始资金 × matching_slide% |
| 反方超额 | 最后投注者→往前 | 超额部分 |

### 例子
```
创建: YES 100, slide 70% (创建者保留70%)
需求: 30U (100 × (1 - 70%))

投注: NO 15 + NO 20 + NO 20 = 55U (超额25U)
↓
激活:
  创建者退款: 70U (100 × 70%)
  反方退款: 最后一个投注者 20U 全额退款
```

---

## 状态转换

```
pending_match ──(反方达到要求)──→ active ──(deadline)──→ settled
     ↓
   (超时) 
     └──→ cancelled (未来实现)
```

---

## 数据库字段

```sql
-- 新增到 meme_events 表
matching_slide      INTEGER   -- 1-100，匹配百分比
matched_amount      NUMERIC   -- 反方当前累计投注
```

---

## 赔率逻辑

激活后保证：
```
YES池 = NO池 = 初始资金 × (1 - matching_slide%)

示例:
初始: YES 100U, NO 0U (matching_slide=50%)
    ↓ 反方投50U (100 × (1-50%))
匹配: YES 50U, NO 50U, odds 50:50% ✅ 公平！

示例2:
初始: YES 100U, NO 0U (matching_slide=70%)
    ↓ 反方投30U (100 × (1-70%))
匹配: YES 30U, NO 30U, odds 50:50% ✅ 公平！
```

---

## 边界情况

| 情况 | matching_slide | 反方需投 | 说明 |
|-----|---|---|---|
| 最小值 | 1% | 99% | 创建者仅保留1%，反方需投99% |
| 最大值 | 100% | 0% | 创建者保留全部，反方无需投注 |
| 平衡点 | 50% | 50% | 双方各投50%，无差别 |
| 低风险 | 90% | 10% | 创建者保留90%，反方只需10% |

---

## 关键代码位置

| 功能 | 文件 | 函数 |
|-----|-----|------|
| 创建事件 | `routes.ts:L8` | POST `/events` |
| 参数验证 | `routes.ts:L42-45` | 匹配滑动值验证 |
| 投注逻辑 | `service.ts:L180` | `placeBet()` |
| 待匹配处理 | `service.ts:L130` | `handlePendingMatchBet()` |
| 激活逻辑 | `service.ts:L145` | `activateEventAfterMatching()` |
| 数据库迁移 | `migrations/010-add-matching-slide.ts` | 添加字段 |

---

## 测试命令

```bash
# 编译
npm run build

# 运行匹配逻辑测试
node dist/modules/meme/matching-slide.test.js

# 运行服务
npm run dev
```

---

## API 响应示例

### 创建事件成功
```json
{
  "id": 1,
  "creator_id": 123,
  "creator_side": "yes",
  "initial_pool_amount": "100",
  "matching_slide": 50,
  "yes_pool": "100",
  "no_pool": "0",
  "matched_amount": "0",
  "yes_odds": "0.00",
  "no_odds": "100.00",
  "status": "pending_match",
  "deadline": "2025-10-29T12:00:00Z",
  "created_at": "2025-10-28T12:00:00Z"
}
```

### 投注后激活成功
```json
{
  "id": 1,
  "status": "active",
  "yes_pool": "50",
  "no_pool": "50",
  "matched_amount": "50",
  "yes_odds": "50.00",
  "no_odds": "50.00",
  "launch_time": "2025-10-28T12:01:00Z"
}
```

---

## 常见集成点

### 前端
- [ ] 创建事件表单添加 `matching_slide` 滑块 (1-100)
- [ ] 显示创建者保留百分比：`matching_slide%`
- [ ] 显示需求金额：`initial × (1 - matching_slide%)`
- [ ] 显示当前进度：`matched_amount / required`
- [ ] 激活时刷新页面显示 `active` 状态

### WebSocket
- [ ] 反方投注时广播 `matched_amount` 更新
- [ ] 激活时广播状态转换通知
- [ ] 推送激活时的退款信息

### 通知
- [ ] 激活成功通知所有参与者
- [ ] 退款通知受影响的用户
- [ ] 开盘提醒

---

## 监控点

```
关键指标:
- 平均匹配耗时
- 超额投注占比
- 失败（timeout）率
- 退款总金额

告警规则:
- pending_match > 24小时 → 检查是否需要超时取消
- 单次退款 > 1000U → 异常投注
```

---

## 故障排查

| 问题 | 原因 | 解决方案 |
|-----|------|--------|
| 投注后还是 pending_match | 反方未达到要求 | 继续等待或查看 matched_amount |
| 激活后池子不相等 | 逻辑错误 | 检查 activateEventAfterMatching() |
| 用户反馈未收到退款 | 超额处理失败 | 检查 Rollback/Commit 日志 |
| API 返回 matching_slide 错误 | 值超出范围 | 确保 1-100 的整数 |

---

**快速开始**: 
1. 创建事件时指定 `matching_slide`（1-100，创建者保留百分比）
2. 计算反方需投额 = `初始资金 × (1 - matching_slide%)`
3. 等待反方投注达到需投额
4. 自动激活并公平开盘（50:50赔率）✅
