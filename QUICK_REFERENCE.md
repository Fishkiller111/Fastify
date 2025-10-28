# 快速参考指南

## 🔥 快速概览

**修复内容**: Meme 模块的自动结算逻辑和 API 退款记录集成
**修复文件**: 8 个
**修复行数**: ~383 行代码
**文档新增**: 8 个文档，2,268 行
**编译状态**: ✅ 成功

---

## ⚡ 30 秒速览

### 问题 1: 自动结算中忽略退款
```typescript
// ❌ 修复前
const payout = (betAmount / winnerPool * totalPool).toFixed(2);

// ✅ 修复后
const netBetAmount = betAmount - refundAmount;
const payout = (netBetAmount * (1 + oddsAtBet / 100)).toFixed(2);
```
**文件**: `src/modules/meme/auto-settle.ts:56-80`

### 问题 2: getUserBets 缺少退款信息
```typescript
// ❌ 修复前
SELECT * FROM meme_bets WHERE ...

// ✅ 修复后
SELECT mb.*, COALESCE(SUM(rr.refund_amount), 0) as refund_amount
FROM meme_bets mb
LEFT JOIN refund_records rr ON mb.id = rr.bet_id
```
**文件**: `src/modules/meme/service.ts:720-795`

---

## 📋 文件变更清单

### 核心修改文件
```
✅ src/modules/meme/auto-settle.ts (30 行修改)
✅ src/modules/meme/service.ts (77 行新增)
✅ src/modules/meme/routes.ts (69 行更新)
```

### 相关修改文件
```
✅ src/migrations/001-init-database.ts (8 行修改)
✅ src/migrations/013-fix-timezone-columns.ts (125 行新建)
✅ src/modules/mainstream/service.ts (4 行改进)
✅ src/modules/user/service.ts (50 行新增)
✅ src/modules/user/routes.ts (20 行更新)
```

---

## 🚀 部署检查清单

```bash
# 1. 编译验证
npm run build
# 输出应该无错误和警告

# 2. 运行迁移（修复时区）
npm run migrate
# 应该看到：
# ✅ Migration 001: 初始化数据库...
# ✅ Migration 013: 时区问题修复成功

# 3. 启动开发服务器
npm run dev
# 自动结算日志应该显示详细的退款信息

# 4. 测试 API
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:7000/api/meme/bets"
# 响应应包含 refund_amount, net_bet_amount, refunds[]
```

---

## 📊 修复影响矩阵

| 模块 | 功能 | 修复前 | 修复后 |
|------|------|--------|--------|
| Meme auto-settle | 有退款的赔付 | ❌ 错误 | ✅ 正确 |
| Meme getUserBets | 返回退款信息 | ❌ 无 | ✅ 有 |
| User bets/all | 返回退款信息 | ✅ 有 | ✅ 有 |
| Mainstream settle | 有退款的赔付 | ✅ 正确 | ✅ 正确 |

---

## 🔍 关键查询语句

### 获取有退款的投注
```sql
SELECT mb.*, COALESCE(SUM(rr.refund_amount), 0) as total_refund
FROM meme_bets mb
LEFT JOIN refund_records rr ON mb.id = rr.bet_id AND rr.status = 'completed'
WHERE mb.event_id = $1 AND mb.bet_type = $2 AND mb.status = $3
GROUP BY mb.id
```

### 验证时区列
```sql
\d meme_events
-- 应该看到：
-- deadline | timestamp with time zone | not null
-- launch_time | timestamp with time zone |
-- created_at | timestamp with time zone | default CURRENT_TIMESTAMP
```

---

## 💾 数据库迁移

### 新增迁移文件
`src/migrations/013-fix-timezone-columns.ts`

### 修改内容
- deadline: TIMESTAMP → TIMESTAMP WITH TIME ZONE
- launch_time: TIMESTAMP → TIMESTAMP WITH TIME ZONE
- created_at: TIMESTAMP → TIMESTAMP WITH TIME ZONE
- settled_at: TIMESTAMP → TIMESTAMP WITH TIME ZONE

### 运行命令
```bash
npm run migrate
```

---

## 🧪 测试用例

### 测试场景 1: 有退款的投注结算
```bash
# 创建 Meme 事件 → 下注 100 USDT
# 超额匹配，用户被退款 30 USDT
# 事件结算，用户获胜
# 期望赔付: (100-30) × (1 + odds/100) = 70 × (1 + odds/100)

GET /api/meme/bets
# 响应应包含:
{
  "bet_amount": "100.00",
  "refund_amount": "30.00",
  "net_bet_amount": "70.00",
  "actual_payout": "98.00",  // 示例
  "refunds": [{...}]
}
```

### 测试场景 2: 自动结算日志
```bash
npm run dev
# 当事件自动结算时，日志应显示:
# ✅ 用户 123: 原始投注 $100, 退款 $30, 净投注 $70, 赔付 $98
```

---

## 📖 文档索引

| 文档 | 用途 | 长度 |
|------|------|------|
| **MEME_MODULE_AUDIT.md** | 详细审计报告 | 304 行 |
| **MEME_MODULE_FIXES_SUMMARY.md** | 修复总结 | 354 行 |
| **COMPREHENSIVE_AUDIT_REPORT.md** | 全面审计 | 292 行 |
| **TIMEZONE_FIX.md** | 时区问题分析 | 336 行 |
| **REFUND_RECORDS_API.md** | API 文档 | 326 行 |
| **FIXES_CHECKLIST.md** | 验证清单 | 207 行 |

**推荐阅读顺序**:
1. 本文档（快速了解）
2. COMPREHENSIVE_AUDIT_REPORT.md（全面理解）
3. MEME_MODULE_FIXES_SUMMARY.md（具体修复）
4. 特定问题相关文档（深入学习）

---

## ⚠️ 常见问题

### Q: 为什么要修改 auto-settle.ts?
A: 自动结算的赔付计算与手动结算不一致。有退款的投注会被计算错误。修复后两者逻辑完全相同。

### Q: 是否影响已有的投注?
A: 不影响。修复后的逻辑对新投注和结算都是正确的。

### Q: 需要重新运行迁移吗?
A: 如果使用了旧的时间戳列定义，需要运行 Migration 013 修复。使用新代码的新数据库不需要。

### Q: getUserBets 的新字段会影响现有客户端吗?
A: 新字段是可选添加的，不会破坏现有的响应字段。客户端可以选择性地使用新字段。

---

## 🔗 相关命令

```bash
# 编译
npm run build

# 开发
npm run dev

# 迁移
npm run migrate

# 查看数据库
psql -U user -d database
\d meme_events

# 测试 API
curl -H "Authorization: Bearer TOKEN" http://localhost:7000/api/meme/bets

# 查看日志（自动结算）
tail -f logs/app.log | grep "赔付\|退款"
```

---

## ✨ 修复亮点

✅ **逻辑一致性** - 三个结算方法使用相同的退款处理逻辑
✅ **用户体验** - 所有投注查询端点返回完整的退款信息
✅ **代码质量** - 编译成功，类型安全，无警告
✅ **文档完整** - 详细的审计报告和使用指南
✅ **向后兼容** - 新增字段不破坏现有接口

---

## 📞 支持

遇到问题？参考相应文档：
- 自动结算问题 → MEME_MODULE_AUDIT.md
- 时区问题 → TIMEZONE_FIX.md
- API 问题 → REFUND_RECORDS_API.md
- 部署问题 → FIXES_CHECKLIST.md

