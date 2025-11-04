# Meme 事件结算机制（当前实现）

本文档梳理当前代码中的结算流程与相关数据变更，便于排查问题与后续统一逻辑。

## 概念与符号
- pool：资金池，`yes_pool` 与 `no_pool`。
- amount：份额，系统约定 1 amount = 0.5 U。
- odds：赔率，当前实现为“本方池子占比”，如 `yes_odds = yes_pool/(yes_pool+no_pool)*100`。
- 价格：买/卖 1 amount 的价格 = `odds/100`（单位：U）。

## 事件状态
- `pending_match` 待匹配（创建后进入）
- `active` 已开盘（达到最低匹配阈值后激活）
- `settled` 已结算
- `cancelled` 已取消

## 待匹配阶段的超时与激活
- 超时检查：当 `pending_match` 超过 `pending_match_timeout`：
  - 若反方 amount ≥ `initial_amount * (1 - matching_slide%)`：调用激活逻辑，重置双方 pool 与 amount 为匹配后的最终值，并将 `yes_odds=no_odds=50`，状态改为 `active`。
  - 否则：对所有参与者做“全额退款”，事件状态置为 `cancelled`（见下方“数据表变更”）。

---
## 结算触发方式
1) 手动结算（管理员接口）
- 路由：POST /meme/events/settle
- 前置：事件必须为 `active` 且已到达 `deadline`。
- is_launched：可显式传入；未传入时通过 DexScreener API 自动判断。

2) 自动结算（定时任务）
- 任务：每分钟运行一次。
- 处理两类：
  - `pending_match` 超时（见上节）。
  - `active` 且 `deadline<=now()` 的事件自动结算。

> Mainstream 类型事件走独立的 `settleMainstreamEvent`，本文不展开。

## 结算计算与资金流（两条实现路径）
当前代码存在“手动结算”和“自动结算”两套实现，核心差异在于清算返还的口径：

### A. 手动结算（service.settleEvent）
流程：
1. AMM 强制清算（settleAllPositions）
   - 对每个用户持仓：
     - YES 返还：`yes_amount * (yes_odds/100)`
     - NO 返还：`no_amount * (no_odds/100)`
   - 特点：两边（YES/NO）均按当前赔率返还；不产生价格冲击；不更新事件 pool。
2. 判定胜负：`winnerSide = is_launched ? 'yes' : 'no'`。
3. 更新事件：`status='settled'`, `is_launched`, `settled_at`。
4. 更新投注：将 `meme_bets` 中胜方标记为 `won`、负方标记为 `lost`（不在此处再做赔付）。
5. 佣金：对胜方投注执行佣金结算。

### B. 自动结算（auto-settle.ts/settleEventAuto）
流程：
1. 判定胜负并更新事件与投注状态（同上）。
2. AMM 清算返还：
   - 仅按“获胜方”的持仓返还：
     - 若 YES 胜：返还 `yes_amount * (yes_odds/100)`；NO 持仓返还为 0。
     - 若 NO 胜：返还 `no_amount * (no_odds/100)`；YES 持仓返还为 0。
   - 同样不更新事件 pool，不产生价格冲击。

> 小结：A 路径“双方都返还”，B 路径“仅胜方返还”。这是当前实现的关键差异。

---
## 数据表变更（结算/退款相关）
- meme_events：
  - 手动/自动结算：更新 `status='settled'`, `is_launched`, `settled_at`。
  - 待匹配激活：重置 pool、amount、odds 到匹配后的最终值并置 `active`。
  - 待匹配超时取消：`status='cancelled'`。

- meme_bets：
  - 结算时：胜方 `won`，负方 `lost`。
  - 待匹配阶段退款：标记为 `refunded`。

- user_positions：
  - 结算/自动结算：清零 `yes_amount`、`no_amount`，累计 `total_returned`。
  - 待匹配超额退款/超时退款：相应减少或删除记录。

- users（余额）：
  - 结算返还：按上述公式增加余额。
  - 各类退款：增加余额（超额匹配、超时未达标等）。

- transactions（交易流水）：
  - `buy`/`sell`：正常买卖
  - `refund`：匹配阶段的各类退款（包括创建者/反方超额与超时未达标）
  - `settle`：结算时为每个用户分别记录 YES/NO 的结算交易（amount 为负数，返还金额体现在 `cost_or_return`）

- refund_records：
  - 仅发生在“匹配阶段”的退款（Stage 2~4 及 pending_match 超时），用于明细对账。

---
## 公式与示例
- 返还公式：`return = amount * (odds / 100)`
- 示例：
  - YES 赔率 80%，持有 100 amount，返还 `100 * 0.8 = 80U`。
  - NO 赔率 20%，持有 50 amount，返还 `50 * 0.2 = 10U`。

> 手动结算路径会同时返还 YES 与 NO；自动结算路径只返还获胜一侧。

## 已知差异与风险点（建议后续统一）
1. 返还口径不一致：
   - 手动结算：双方都返还；
   - 自动结算：仅胜方返还。
   建议统一为“仅胜方返还”或“按统一的资金守恒模型返还”，并在代码中复用同一结算模块。

2. 清算过程未更新事件 pool：
   - 当前清算不改变 `yes_pool/no_pool`，仅改变余额与持仓，可能造成账面与池子不一致的理解成本。
   - 若未来引入二级做市或需要资金守恒对账，建议补充池子侧的变动逻辑或在文档中明确“池子为报价参考，不作为清算资金来源”。

3. 赔率快照时点：
   - 结算采用调用时的 `yes_odds/no_odds` 快照，不考虑清算的价格冲击（price impact=0）。
   - 若需防范临界时刻的价格操纵，建议在 `deadline` 前 N 秒冻结赔率或采用 TWAP。

4. 幂等与重复结算：
   - 结算接口仅允许在 `active` 时调用，一旦置为 `settled` 将拒绝再次结算。

## 接口与任务摘要
- 手动结算：`POST /meme/events/settle`（管理员权限）
- 自动任务：每分钟执行一次，处理 pending_match 超时与到期 active 事件

## 变更记录
- 2025-11-03：文档首次整理；赔率定义更新为“本方池子占比即本方赔率”。
