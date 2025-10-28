/**
 * 匹配滑动值机制测试
 * 
 * matching_slide = 创建者保留的百分比
 * 反方需要达到的金额 = initial_pool_amount × (1 - matching_slide%)
 * 
 * 场景1: 创建者YES 100U, matching_slide 50% (创建者保留50%, 反方需50%)
 *  - 需要反方(NO)投注 50U 才能成功开盘
 *  - 开盘后: YES池 50U, NO池 50U (1:1 公平)
 *  - 多余的YES 50U 返还给创建者
 * 
 * 场景2: 创建者YES 100U, matching_slide 70% (创建者保留70%, 反方需30%)
 *  - 需要反方(NO)投注 30U 才能成功开盘
 *  - 如果NO投注了 40U (超额10U)
 *  - 开盘后: YES池 30U, NO池 30U
 *  - YES多余 70U 返还创建者, NO多余 10U 返还投注者
 */

// 测试用例定义
export const testCases = {
  // 场景1: 50%匹配 精确投注
  scenario1_exact_match: {
    description: '创建者YES 100U, matching_slide 50%, 反方精确投注50U',
    creator_side: 'yes' as const,
    initial_pool_amount: 100,
    matching_slide: 50,
    counter_bets: [
      { user_id: 2, amount: 50 }  // NO 投注 50U
    ],
    expected_result: {
      status: 'active',
      yes_pool: 50,
      no_pool: 50,
      creator_refund: 50,
      bets_refund: []
    }
  },

  // 场景2: 反方超额投注
  scenario2_excess_bet: {
    description: '创建者YES 100U, matching_slide 70%, 反方投注40U(超额)',
    creator_side: 'yes' as const,
    initial_pool_amount: 100,
    matching_slide: 70,
    counter_bets: [
      { user_id: 2, amount: 20 },
      { user_id: 3, amount: 20 }  // 总计40U, 超额10U (需求30U)
    ],
    expected_result: {
      status: 'active',
      yes_pool: 30,
      no_pool: 30,
      creator_refund: 70,
      bets_refund: [
        { user_id: 3, amount: 10 }  // 最后一个投注者退款10U
      ]
    }
  },

  // 场景3: 多用户分摊退款
  scenario3_multiple_refund: {
    description: '创建者YES 100U, matching_slide 70%, 3个反方投注者',
    creator_side: 'yes' as const,
    initial_pool_amount: 100,
    matching_slide: 70,
    counter_bets: [
      { user_id: 2, amount: 15 },
      { user_id: 3, amount: 15 },
      { user_id: 4, amount: 15 }  // 总计45U, 超额15U (需求30U)
    ],
    expected_result: {
      status: 'active',
      yes_pool: 30,
      no_pool: 30,
      creator_refund: 70,
      bets_refund: [
        { user_id: 4, amount: 15 }  // 最后一个投注者全额退款15U
      ]
    }
  },

  // 场景4: NO方创建, 反方YES投注
  scenario4_no_creator: {
    description: '创建者NO 100U, matching_slide 60%, YES投注40U',
    creator_side: 'no' as const,
    initial_pool_amount: 100,
    matching_slide: 60,
    counter_bets: [
      { user_id: 2, amount: 40 }  // YES 投注 40U (需求40U = 100 × (1-60%))
    ],
    expected_result: {
      status: 'active',
      yes_pool: 40,
      no_pool: 40,
      creator_refund: 60,
      bets_refund: []
    }
  },

  // 场景5: 创建者保留100% (反方需投0)
  scenario5_creator_keep_all: {
    description: '创建者YES 100U, matching_slide 100% (创建者保留全部，无需反方投注)',
    creator_side: 'yes' as const,
    initial_pool_amount: 100,
    matching_slide: 100,
    counter_bets: [
      { user_id: 2, amount: 0.01 }  // NO 投注 0.01U (需求0U)
    ],
    expected_result: {
      status: 'active',
      yes_pool: 0,
      no_pool: 0,
      creator_refund: 100,
      bets_refund: [
        { user_id: 2, amount: 0.01 }
      ]
    }
  },

  // 场景6: 创建者保留1% (反方需投99%)
  scenario6_creator_keep_minimal: {
    description: '创建者YES 1000U, matching_slide 1% (创建者保留1%，反方需投99%)',
    creator_side: 'yes' as const,
    initial_pool_amount: 1000,
    matching_slide: 1,
    counter_bets: [
      { user_id: 2, amount: 990 }  // NO 投注 990U (需求990U = 1000 × (1-1%))
    ],
    expected_result: {
      status: 'active',
      yes_pool: 990,
      no_pool: 990,
      creator_refund: 10,
      bets_refund: []
    }
  }
};

// 验证逻辑的辅助函数
export function validateMatchingLogic(
  creatorSide: 'yes' | 'no',
  initialPoolAmount: number,
  matchingSlide: number,
  counterBets: Array<{ user_id: number; amount: number }>
) {
  // 计算反方总投注
  const counterPoolTotal = counterBets.reduce((sum, bet) => sum + bet.amount, 0);
  
  // 计算需求金额 = initial_pool_amount × (1 - matching_slide%)
  // matching_slide 是创建者保留的百分比，反方需要达到剩余的百分比
  const requiredAmount = initialPoolAmount * (1 - matchingSlide / 100);
  
  // 检查是否满足匹配条件
  const isMatched = counterPoolTotal >= requiredAmount;
  
  if (!isMatched) {
    return {
      status: 'pending_match',
      message: `未满足匹配条件: ${counterPoolTotal} < ${requiredAmount}`
    };
  }

  // 计算超额
  const excess = counterPoolTotal - requiredAmount;
  
  // 计算退款
  const creatorRefund = initialPoolAmount - requiredAmount;
  const counterRefunds: Array<{ user_id: number; amount: number }> = [];

  if (excess > 0) {
    // 从最后一个投注者开始往前退款
    let remainingExcess = excess;
    
    for (let i = counterBets.length - 1; i >= 0 && remainingExcess > 0; i--) {
      const bet = counterBets[i];
      const refundAmount = Math.min(bet.amount, remainingExcess);
      
      if (refundAmount > 0) {
        counterRefunds.push({
          user_id: bet.user_id,
          amount: refundAmount
        });
        remainingExcess -= refundAmount;
      }
    }
  }

  return {
    status: 'active',
    yes_pool: creatorSide === 'yes' ? requiredAmount : requiredAmount,
    no_pool: creatorSide === 'yes' ? requiredAmount : requiredAmount,
    creator_refund: creatorRefund,
    counter_refunds: counterRefunds,
    message: `匹配成功！开盘 ${requiredAmount}U vs ${requiredAmount}U`
  };
}

// 运行测试
console.log('📋 匹配滑动值机制测试用例\n');

Object.entries(testCases).forEach(([key, testCase]) => {
  console.log(`\n✅ ${key}`);
  console.log(`📝 ${testCase.description}`);
  
  const result = validateMatchingLogic(
    testCase.creator_side,
    testCase.initial_pool_amount,
    testCase.matching_slide,
    testCase.counter_bets
  );

  console.log(`状态: ${result.status}`);
  
  if (result.status === 'active') {
    console.log(`YES池: ${(result as any).yes_pool}U`);
    console.log(`NO池: ${(result as any).no_pool}U`);
    console.log(`创建者退款: ${(result as any).creator_refund}U`);
    if ((result as any).counter_refunds.length > 0) {
      console.log(`反方退款:`);
      (result as any).counter_refunds.forEach((refund: any) => {
        console.log(`  - 用户${refund.user_id}: ${refund.amount}U`);
      });
    }
  }
  
  console.log(`💬 ${result.message}`);
});

export default testCases;
