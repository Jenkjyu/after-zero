// 逐条对照 test/calc.test.js 翻译过来的Dart版本——calc.js的57个纯函数移植到Dart（阶段1）
// 的标准答案就是原JS测试套件本身，这份文件的测试描述/断言顺序都尽量跟JS原版一一对应，
// 方便以后两边同时改的话逐条对照，不是重新设计了一套覆盖范围。
import 'package:flutter_test/flutter_test.dart';
import 'package:after_zero/calc/calc.dart' as calc;

double r2sum(List<Map<String, dynamic>> rows) {
  num s = 0;
  for (final r in rows) {
    s += (r['principal'] as num?) ?? 0;
  }
  return calc.r2(s);
}

Map<String, dynamic> makeDebt(int paidCount) {
  final d = <String, dynamic>{
    'id': 'dtest',
    'name': '测试债务',
    'plan': calc.genPlan({
      'kind': 'amort',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    }),
  };
  calc.markPaidThrough(
    (d['plan'] as List<dynamic>).cast<Map<String, dynamic>>(),
    paidCount,
  );
  calc.recompute(d);
  return d;
}

Map<String, dynamic> planDebt(
  List<Map<String, dynamic>> rows, [
  Map<String, dynamic>? extra,
]) {
  return {'id': 'd', 'name': '测试债务', 'plan': rows, ...?extra};
}

void main() {
  test('r2 四舍五入到分', () {
    expect(calc.r2(2.345), 2.35);
    expect(calc.r2(-2.345), -2.35);
    expect(calc.r2(0), 0);
    expect(calc.r2('abc'), 0);
    expect(calc.r2(null), 0);
  });

  test('genPlan: 等额本息(amort) 本金相加=借款金额，最后一期清零剩余本金', () {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    });
    expect(plan.length, 12);
    expect(plan.fold<num>(0, (s, r) => s + (r['principal'] as num)), 12000);
    expect(plan[0]['date'], '2026-01-15');
    expect(plan[11]['date'], '2026-12-15');
    expect(plan[0]['amount'], plan[5]['amount']);
  });

  test('genPlan: 等额本息(amort) rate=0(免息)时，本金合计依然精确=借款金额', () {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 500,
      'rate': 0,
      'n': 9,
      'first': '2026-01-01',
    });
    expect(plan.length, 9);
    expect(plan.fold<num>(0, (s, r) => s + (r['principal'] as num)), 500);
    for (final r in plan) {
      expect(r['interest'], 0);
    }
  });

  test('genPlan: 等额本息(amort) 长期限+高利率(30年内的真实组合)不会让某一期本金/金额变成负数', () {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 100,
      'rate': 36,
      'n': 210,
      'first': '2026-01-01',
    });
    expect(plan.length, 210);
    for (final r in plan) {
      expect((r['principal'] as num) >= 0, isTrue, reason: '本金不能为负: $r');
      expect((r['interest'] as num) >= 0, isTrue, reason: '利息不能为负: $r');
      expect((r['amount'] as num) >= 0, isTrue, reason: '金额不能为负: $r');
    }
    expect(
      calc.r2(plan.fold<num>(0, (s, r) => s + (r['principal'] as num))),
      100,
    );
  });

  test('genPlan: 等额本金(equalprincipal) 每期本金固定，利息按剩余本金递减，本金相加=借款金额', () {
    final plan = calc.genPlan({
      'kind': 'equalprincipal',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    });
    expect(plan.length, 12);
    expect(plan.fold<num>(0, (s, r) => s + (r['principal'] as num)), 12000);
    for (final r in plan) {
      expect(r['principal'], 1000);
    }
    expect((plan[0]['interest'] as num) > (plan[1]['interest'] as num), isTrue);
    expect((plan[0]['amount'] as num) > (plan[11]['amount'] as num), isTrue);
  });

  test('genPlan: 等额本金(equalprincipal) P/n除不尽时，本金合计依然精确=借款金额(不因逐期四舍五入累积偏差)', () {
    final plan = calc.genPlan({
      'kind': 'equalprincipal',
      'P': 500,
      'rate': 6,
      'n': 9,
      'first': '2026-01-01',
    });
    expect(plan.length, 9);
    expect(plan.fold<num>(0, (s, r) => s + (r['principal'] as num)), 500);
    for (var i = 0; i < 8; i++) {
      expect(plan[i]['principal'], 55.56);
    }
    expect(plan[8]['principal'], 55.52);
  });

  test('genPlan: 等额本金(equalprincipal) P/n向下舍入时，最后一期吸收的零头比pr4更大也不会被漏掉', () {
    final plan = calc.genPlan({
      'kind': 'equalprincipal',
      'P': 100,
      'rate': 6,
      'n': 3,
      'first': '2026-01-01',
    });
    expect(plan.map((r) => r['principal']).toList(), [33.33, 33.33, 33.34]);
    expect(plan.fold<num>(0, (s, r) => s + (r['principal'] as num)), 100);
  });

  test('genPlan: 等额本金(equalprincipal) 长期限+高利率不会让某一期本金/金额变成负数', () {
    final plan = calc.genPlan({
      'kind': 'equalprincipal',
      'P': 100,
      'rate': 36,
      'n': 210,
      'first': '2026-01-01',
    });
    for (final r in plan) {
      expect((r['principal'] as num) >= 0, isTrue, reason: '本金不能为负: $r');
      expect((r['interest'] as num) >= 0, isTrue, reason: '利息不能为负: $r');
      expect((r['amount'] as num) >= 0, isTrue, reason: '金额不能为负: $r');
    }
    expect(
      calc.r2(plan.fold<num>(0, (s, r) => s + (r['principal'] as num))),
      100,
    );
  });

  test('genPlan: 信用卡等本等费(equalfee) 每期金额固定=本金+手续费', () {
    final plan = calc.genPlan({
      'kind': 'equalfee',
      'pp': 1000,
      'pf': 50,
      'n': 6,
      'first': '2026-02-01',
    });
    expect(plan.length, 6);
    for (final r in plan) {
      expect(r['principal'], 1000);
      expect(r['interest'], 50);
      expect(r['amount'], 1050);
    }
  });

  test('genPlan: 先息后本(interestfirst) 前ni期只付利息本金为0，后np期摊销本金', () {
    final plan = calc.genPlan({
      'kind': 'interestfirst',
      'P': 6000,
      'rate': 12,
      'ni': 2,
      'np': 4,
      'first': '2026-01-01',
    });
    expect(plan.length, 6);
    expect(plan[0]['principal'], 0);
    expect(plan[1]['principal'], 0);
    expect((plan[0]['interest'] as num) > 0, isTrue);
    final amortSection = plan.sublist(2);
    expect(
      amortSection.fold<num>(0, (s, r) => s + (r['principal'] as num)),
      6000,
    );
  });

  test('genPlan: 先息后本(interestfirst) 还本阶段期数很多+高利率不会让某一期本金/金额变成负数', () {
    final plan = calc.genPlan({
      'kind': 'interestfirst',
      'P': 100,
      'rate': 36,
      'ni': 2,
      'np': 208,
      'first': '2026-01-01',
    });
    final amortSection = plan.sublist(2);
    for (final r in amortSection) {
      expect((r['principal'] as num) >= 0, isTrue, reason: '本金不能为负: $r');
      expect((r['interest'] as num) >= 0, isTrue, reason: '利息不能为负: $r');
      expect((r['amount'] as num) >= 0, isTrue, reason: '金额不能为负: $r');
    }
    expect(
      calc.r2(amortSection.fold<num>(0, (s, r) => s + (r['principal'] as num))),
      100,
    );
  });

  test('genPlan: 自定义(custom) 生成n期全零占位', () {
    final plan = calc.genPlan({
      'kind': 'custom',
      'n': 3,
      'first': '2026-01-01',
    });
    expect(plan.length, 3);
    for (final r in plan) {
      expect(r['amount'], 0);
      expect(r['principal'], 0);
      expect(r['interest'], 0);
    }
  });

  test('impliedAPR: 反推出等额本息计划本身设定的年化利率', () {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    });
    expect(calc.impliedAPR(plan), 12);
  });

  test('impliedAPR: 空计划或零本金返回0，不抛异常', () {
    expect(calc.impliedAPR([]), 0);
    expect(
      calc.impliedAPR([
        {'amount': 0, 'principal': 0},
      ]),
      0,
    );
  });

  test('recompute: 已还/未还正确分区，月供和下一期日期取第一条未还记录', () {
    final plan = calc.genPlan({
      'kind': 'amort',
      'P': 12000,
      'rate': 12,
      'n': 12,
      'first': '2026-01-15',
    });
    final d = <String, dynamic>{
      'plan': [
        for (var i = 0; i < plan.length; i++) {...plan[i], 'paid': i < 3},
      ],
    };
    calc.recompute(d);
    expect(d['original'], 12000);
    expect(d['paidTerms'], 3);
    expect(d['terms'], 9);
    expect(d['totalTerms'], 12);
    expect(d['nextDate'], '2026-04-15');
    expect(d['monthly'], plan[3]['amount']);
    expect(d['balance'], r2sum(plan.sublist(3)));
    expect(d['rate'], 12);
  });

  test('recompute: 空plan不抛异常，各字段归零', () {
    final d = <String, dynamic>{'plan': <Map<String, dynamic>>[]};
    calc.recompute(d);
    expect(d['original'], null);
    expect(d['balance'], 0);
    expect(d['monthly'], 0);
    expect(d['nextDate'], null);
  });

  test(
    'recompute: 5种计息方式(amort/equalprincipal/equalfee/interestfirst/custom)各跑一遍，都不抛异常且字段形状一致',
    () {
      final specs = <String, Map<String, dynamic>>{
        'amort': {
          'kind': 'amort',
          'P': 5000,
          'rate': 15,
          'n': 6,
          'first': '2026-01-01',
        },
        'equalprincipal': {
          'kind': 'equalprincipal',
          'P': 5000,
          'rate': 15,
          'n': 6,
          'first': '2026-01-01',
        },
        'equalfee': {
          'kind': 'equalfee',
          'pp': 800,
          'pf': 40,
          'n': 6,
          'first': '2026-01-01',
        },
        'interestfirst': {
          'kind': 'interestfirst',
          'P': 5000,
          'rate': 15,
          'ni': 2,
          'np': 4,
          'first': '2026-01-01',
        },
        'custom': {'kind': 'custom', 'n': 4, 'first': '2026-01-01'},
      };
      for (final kind in specs.keys) {
        final plan = calc.genPlan(specs[kind]!);
        final d = <String, dynamic>{'plan': plan};
        calc.recompute(d);
        expect(d['totalTerms'], plan.length);
        expect(d['terms'], plan.length);
        expect(d['balance'], d['original']);
        expect((d['rate'] as num) >= 0, isTrue);
      }
      final customPlan = calc.genPlan(specs['custom']!);
      final dCustom = <String, dynamic>{'plan': customPlan};
      calc.recompute(dCustom);
      expect(dCustom['original'], 0);
      expect(dCustom['rate'], 0);
    },
  );

  test('markPaidThrough: 前n期标记为已还，其余未还', () {
    final plan = calc.genPlan({
      'kind': 'custom',
      'n': 5,
      'first': '2026-01-01',
    });
    calc.markPaidThrough(plan, 2);
    expect(plan.map((p) => p['paid']).toList(), [
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  test('normalize: 从spec生成plan、按gen.paid标记已还期数、recompute派生字段', () {
    final d = <String, dynamic>{
      'gen': {
        'kind': 'amort',
        'P': 1000,
        'rate': 6,
        'n': 3,
        'first': '2026-01-01',
        'paid': 1,
      },
    };
    calc.normalize(d);
    expect((d['plan'] as List<dynamic>).map((p) => p['paid']).toList(), [
      true,
      false,
      false,
    ]);
    expect(d['paidTerms'], 1);
    expect(d['rate'], 6);
  });

  test('genDebtId: 返回以d开头的字符串，两次调用不同', () {
    final a = calc.genDebtId();
    final b = calc.genDebtId();
    expect(a, isA<String>());
    expect(a.startsWith('d'), isTrue);
    expect(a, isNot(equals(b)));
  });

  test('normalize: 给缺id的老数据补发id，已有id的不会被覆盖', () {
    final legacy = <String, dynamic>{
      'gen': {'kind': 'custom', 'n': 1, 'first': '2026-01-01'},
    };
    calc.normalize(legacy);
    expect(legacy['id'], isA<String>());
    expect((legacy['id'] as String).startsWith('d'), isTrue);

    final withId = <String, dynamic>{
      'id': 'd-existing',
      'gen': {'kind': 'custom', 'n': 1, 'first': '2026-01-01'},
    };
    calc.normalize(withId);
    expect(withId['id'], 'd-existing');
  });

  test('amortForward: 标准摊销直到还清，返回月数+总利息', () {
    final r = calc.amortForward(1000, 0.01, 90, null)!;
    expect(r['months'], 12);
    expect(
      (r['totalInterest'] as num) > 0 && (r['totalInterest'] as num) < 100,
      isTrue,
    );
  });

  test('amortForward: 月供不够付利息时返回null(不会死循环)', () {
    expect(calc.amortForward(1000, 0.5, 10, null), null);
  });

  test('amortForward: 先息后本债务月供恰好=利息(只差舍入噪声)不该被误判成月供不够', () {
    final gen = {
      'kind': 'interestfirst',
      'P': 500,
      'rate': 5.81,
      'ni': 8,
      'np': 11,
      'first': '2025-01-01',
    };
    final plan = calc.genPlan(gen);
    final d = <String, dynamic>{'gen': gen, 'plan': plan};
    calc.markPaidThrough(
      (d['plan'] as List<dynamic>).cast<Map<String, dynamic>>(),
      1,
    );
    calc.recompute(d);
    expect(
      calc.amortForward(
        d['balance'] as num,
        (d['rate'] as num) / 1200,
        d['monthly'] as num,
        null,
      ),
      isNot(null),
    );
  });

  test('interestCoverTolerance: 真正入不敷出的月供(远低于利息)依然要被拦住，不是把检查整个关掉', () {
    final tol = calc.interestCoverTolerance(1000);
    expect(tol < 50, isTrue);
    expect(calc.amortForward(1000, 0.5, 10, null), null);
  });

  test('simulatePrepay: 单次多还一笔比不还提前还清、少付利息', () {
    final d = <String, dynamic>{'rate': 12, 'monthly': 100, 'balance': 1000};
    final sim = calc.simulatePrepay(d, 'single', 3, 300)!;
    expect((sim['monthsSaved'] as num) > 0, isTrue);
    expect((sim['interestSaved'] as num) > 0, isTrue);
    expect(
      sim['newMonths'],
      (sim['baseMonths'] as int) - (sim['monthsSaved'] as int),
    );
  });

  test('simulatePrepay: 每期都多还比单次多还省得更多（同样起始追加点，recurring持续复利叠加）', () {
    final d = <String, dynamic>{'rate': 12, 'monthly': 100, 'balance': 1000};
    final single = calc.simulatePrepay(d, 'single', 1, 20)!;
    final recurring = calc.simulatePrepay(d, 'recurring', 1, 20)!;
    expect(
      (recurring['monthsSaved'] as num) >= (single['monthsSaved'] as num),
      isTrue,
    );
    expect(
      (recurring['interestSaved'] as num) >= (single['interestSaved'] as num),
      isTrue,
    );
  });

  test('simulatePrepay: 月供覆盖不了利息时返回null', () {
    final d = <String, dynamic>{'rate': 600, 'monthly': 1, 'balance': 1000};
    expect(calc.simulatePrepay(d, 'single', 1, 10), null);
  });

  test('snowballOrder: 按余额升序排id', () {
    final debts = [
      {'id': 'a', 'balance': 500},
      {'id': 'b', 'balance': 100},
      {'id': 'c', 'balance': 300},
    ];
    expect(calc.snowballOrder(debts), ['b', 'c', 'a']);
  });

  test('avalancheOrder: 按年化利率降序排id', () {
    final debts = [
      {'id': 'a', 'rate': 8},
      {'id': 'b', 'rate': 24},
      {'id': 'c', 'rate': 15},
    ];
    expect(calc.avalancheOrder(debts), ['b', 'c', 'a']);
  });

  test('simulateRepaymentOrder: 单笔债务退化成跟amortForward一致的结果', () {
    final debts = [
      {'id': 'a', 'balance': 1000, 'rate': 12, 'monthly': 100},
    ];
    final res = calc.simulateRepaymentOrder(debts, ['a'], 0)!;
    final base = calc.amortForward(1000, 12 / 1200, 100, null)!;
    expect(res['months'], base['months']);
    expect(res['totalInterest'], base['totalInterest']);
    expect((res['monthly'] as List).length, res['months']);
    expect(((res['monthly'] as List).last as Map)['balance'], 0);
    expect(res['payoffMonth'], {'a': res['months']});
  });

  test(
    'simulateRepaymentOrder: 一笔还清后，它的月供滚入队列里下一笔（雪球效应）——两笔均衡余额但顺序不同，总利息应该不同',
    () {
      final debts = [
        {'id': 'hi', 'balance': 2000, 'rate': 24, 'monthly': 100},
        {'id': 'lo', 'balance': 500, 'rate': 6, 'monthly': 100},
      ];
      final snowball = calc.simulateRepaymentOrder(
        debts,
        calc.snowballOrder(debts),
        0,
      )!;
      final avalanche = calc.simulateRepaymentOrder(
        debts,
        calc.avalancheOrder(debts),
        0,
      )!;
      expect(calc.snowballOrder(debts), ['lo', 'hi']);
      expect(calc.avalancheOrder(debts), ['hi', 'lo']);
      expect(
        (avalanche['totalInterest'] as num) <=
            (snowball['totalInterest'] as num),
        isTrue,
      );
    },
  );

  test('simulateRepaymentOrder: 额外月供能让两种顺序都提前还清、总利息都下降', () {
    final debts = [
      {'id': 'a', 'balance': 2000, 'rate': 18, 'monthly': 100},
      {'id': 'b', 'balance': 1000, 'rate': 10, 'monthly': 80},
    ];
    final order = calc.snowballOrder(debts);
    final noExtra = calc.simulateRepaymentOrder(debts, order, 0)!;
    final withExtra = calc.simulateRepaymentOrder(debts, order, 300)!;
    expect((withExtra['months'] as int) < (noExtra['months'] as int), isTrue);
    expect(
      (withExtra['totalInterest'] as num) < (noExtra['totalInterest'] as num),
      isTrue,
    );
  });

  test('simulateRepaymentOrder: 队首是笔小额债务时，额外投入不能被这笔债务一次性吞掉不往下流', () {
    final debts = [
      {'id': 'tiny', 'balance': 100, 'rate': 0, 'monthly': 100},
      {'id': 'big', 'balance': 10000, 'rate': 12, 'monthly': 200},
    ];
    final withoutFix = calc.simulateRepaymentOrder(debts, [
      'tiny',
      'big',
    ], 5000)!;
    final firstMonthBalance =
        ((withoutFix['monthly'] as List).first as Map)['balance'] as num;
    expect(
      firstMonthBalance < 6000,
      isTrue,
      reason: '第1个月过后余额应该已经因为5000额外投入大幅下降，不该几乎纹丝不动',
    );
  });

  test('simulateRepaymentOrder: 月供覆盖不了利息时返回null', () {
    final debts = [
      {'id': 'a', 'balance': 1000, 'rate': 600, 'monthly': 1},
    ];
    expect(calc.simulateRepaymentOrder(debts, ['a'], 0), null);
  });

  test('simulateRepaymentOrder: 混入一笔先息后本债务(月供≈利息，只差舍入噪声)不该让整体对比失败', () {
    final gen = {
      'kind': 'interestfirst',
      'P': 500,
      'rate': 5.81,
      'ni': 8,
      'np': 11,
      'first': '2025-01-01',
    };
    final plan = calc.genPlan(gen);
    final interestFirstDebt = <String, dynamic>{
      'id': 'x',
      'gen': gen,
      'plan': plan,
    };
    calc.markPaidThrough(
      (interestFirstDebt['plan'] as List<dynamic>).cast<Map<String, dynamic>>(),
      1,
    );
    calc.recompute(interestFirstDebt);
    final debts = [
      {'id': 'a', 'balance': 2000, 'rate': 18, 'monthly': 200},
      {
        'id': 'x',
        'balance': interestFirstDebt['balance'],
        'rate': interestFirstDebt['rate'],
        'monthly': interestFirstDebt['monthly'],
      },
    ];
    final res = calc.simulateRepaymentOrder(
      debts,
      calc.snowballOrder(debts),
      0,
    );
    expect(res, isNot(null));
  });

  test('simulateRepaymentOrder: 先息后本债务首期利息因放款日不是整月而偏高(真实数据)，不该让整体对比失败', () {
    final irregular = {
      'id': 'bank',
      'balance': 25000,
      'rate': 8.95,
      'monthly': 180,
    };
    final debts = [
      {'id': 'a', 'balance': 2000, 'rate': 18, 'monthly': 200},
      irregular,
    ];
    final res = calc.simulateRepaymentOrder(
      debts,
      calc.snowballOrder(debts),
      5000,
    );
    expect(res, isNot(null));
  });

  test('simulateRepaymentOrder: orderIds没覆盖到的债务被忽略，不参与模拟', () {
    final debts = [
      {'id': 'a', 'balance': 500, 'rate': 10, 'monthly': 100},
      {'id': 'b', 'balance': 99999, 'rate': 999, 'monthly': 0},
    ];
    final res = calc.simulateRepaymentOrder(debts, ['a'], 0);
    expect(res, isNot(null));
    expect((res!['payoffMonth'] as Map).keys.toList(), ['a']);
  });

  test('simulateRepaymentOrder: 全部债务余额已为0时返回0个月、空历史', () {
    final debts = [
      {'id': 'a', 'balance': 0, 'rate': 10, 'monthly': 100},
    ];
    final res = calc.simulateRepaymentOrder(debts, ['a'], 0)!;
    expect(res['months'], 0);
    expect(res['totalInterest'], 0);
    expect(res['monthly'], []);
  });

  test('simulateRepaymentOrder: monthly数组的balance应该单调不增、最后一条为0', () {
    final debts = [
      {'id': 'a', 'balance': 3000, 'rate': 20, 'monthly': 150},
      {'id': 'b', 'balance': 1500, 'rate': 8, 'monthly': 90},
    ];
    final res = calc.simulateRepaymentOrder(
      debts,
      calc.avalancheOrder(debts),
      50,
    )!;
    final monthly = res['monthly'] as List;
    for (var k = 1; k < monthly.length; k++) {
      expect(
        (monthly[k]['balance'] as num) <=
            (monthly[k - 1]['balance'] as num) + 0.005,
        isTrue,
      );
    }
    expect((monthly.last as Map)['balance'], 0);
  });

  test('detectMatchingSort: 顺序匹配某个预设排序时返回该排序名', () {
    final sorts = <String, num Function(dynamic)>{
      'a-asc': (x) => x['v'] as num,
      'a-desc': (x) => -(x['v'] as num),
    };
    final arr = [
      {'v': 1},
      {'v': 2},
      {'v': 3},
    ];
    expect(calc.detectMatchingSort(arr, sorts), 'a-asc');
    expect(calc.detectMatchingSort(arr.reversed.toList(), sorts), 'a-desc');
  });

  test('detectMatchingSort: 顺序不匹配任何预设时返回custom', () {
    final sorts = <String, num Function(dynamic)>{
      'a-asc': (x) => x['v'] as num,
      'a-desc': (x) => -(x['v'] as num),
    };
    expect(
      calc.detectMatchingSort([
        {'v': 2},
        {'v': 1},
        {'v': 3},
      ], sorts),
      'custom',
    );
  });

  test('urgencyTier: 边界值 -1/0/3/4/14/15', () {
    expect(calc.urgencyTier(-1), 'overdue');
    expect(calc.urgencyTier(0), 'crit');
    expect(calc.urgencyTier(3), 'crit');
    expect(calc.urgencyTier(4), 'warn');
    expect(calc.urgencyTier(14), 'warn');
    expect(calc.urgencyTier(15), 'dim');
  });

  test('dueBucket: 边界值 -1/0/7/8/30/31（跟urgencyTier是两套独立阈值）', () {
    expect(calc.dueBucket(-1), 'overdue');
    expect(calc.dueBucket(0), 'week');
    expect(calc.dueBucket(7), 'week');
    expect(calc.dueBucket(8), 'month');
    expect(calc.dueBucket(30), 'month');
    expect(calc.dueBucket(31), 'later');
  });

  test('relLabel: 逾期/今天/未来三种措辞', () {
    expect(calc.relLabel(-3), '已逾期 3 天');
    expect(calc.relLabel(0), '就在今天');
    expect(calc.relLabel(5), '5 天后');
  });

  test('isBadRepeatDay: 只拦29/30/31号(批量设置还款日/公式生成首期还款日用)', () {
    expect([1, 28, 29, 30, 31, 32].map(calc.isBadRepeatDay).toList(), [
      false,
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  test('offsetLabel: 当天到期 vs 提前N天两种措辞', () {
    expect(calc.offsetLabel(0), '当天到期');
    expect(calc.offsetLabel(2), '提前2天');
  });

  test('computeReportData: 已结清债务被排除，加权平均利率/预计还清日期/按类型分组都正确', () {
    final d1 = <String, dynamic>{
      'name': 'debt1',
      'type': '银行贷',
      'settled': false,
      'plan': calc.genPlan({
        'kind': 'amort',
        'P': 6000,
        'rate': 12,
        'n': 6,
        'first': '2026-01-01',
      }),
    };
    calc.recompute(d1);
    final d2 = <String, dynamic>{
      'name': 'debt2',
      'type': '网贷',
      'settled': false,
      'plan': calc.genPlan({
        'kind': 'amort',
        'P': 3000,
        'rate': 24,
        'n': 3,
        'first': '2026-02-01',
      }),
    };
    calc.recompute(d2);
    final d3 = <String, dynamic>{
      'name': 'debt3',
      'type': '私人借款',
      'settled': true,
      'plan': calc.genPlan({'kind': 'custom', 'n': 2, 'first': '2026-01-01'}),
    };
    calc.recompute(d3);
    final data = calc.computeReportData([d1, d2, d3]);
    expect((data['active'] as List).length, 2);
    expect(
      data['totalBalance'],
      calc.r2((d1['balance'] as num) + (d2['balance'] as num)),
    );
    expect((data['byName'] as List).length, 2);
    expect((data['typeList'] as List).length, 2);
    expect(data['payoffDate'], '2026-06-01');
    final expectedAvg =
        ((d1['balance'] as num) * 12 + (d2['balance'] as num) * 24) /
        ((d1['balance'] as num) + (d2['balance'] as num));
    expect(((data['avgRate'] as num) - expectedAvg).abs() < 0.001, isTrue);
  });

  test("computeReportData: 债务类型超过6种时第6+种折叠成'其他'", () {
    final types = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    final debts = <Map<String, dynamic>>[];
    for (var i = 0; i < types.length; i++) {
      final plan = calc.genPlan({
        'kind': 'custom',
        'n': 1,
        'first': '2026-01-01',
      });
      plan[0]['principal'] = (i + 1) * 100;
      plan[0]['amount'] = plan[0]['principal'];
      final d = <String, dynamic>{
        'name': 'd$i',
        'type': types[i],
        'settled': false,
        'plan': plan,
      };
      calc.recompute(d);
      debts.add(d);
    }
    final data = calc.computeReportData(debts);
    final typeList = data['typeList'] as List;
    expect(typeList.length, 6);
    expect(typeList.last['name'], '其他');
    expect(typeList.last['value'], 600);
  });

  test('computeReportData: 没有在还债务时返回空结构而不是抛异常', () {
    final data = calc.computeReportData([]);
    expect(data['totalBalance'], 0);
    expect(data['avgRate'], 0);
    expect(data['payoffDate'], null);
    expect(data['byName'], []);
    expect(data['typeList'], []);
    expect((data['timeline'] as List).length, 1);
  });

  test('summarizeDebts: 已结清债务不计入在还总负债/月供，但它已还的本金/利息计入累计', () {
    final d1 = {
      'settled': false,
      'oneTime': false,
      'balance': 1000,
      'monthly': 200,
      'paidPrincipal': 500,
      'paidInterest': 50,
    };
    final d2 = {
      'settled': false,
      'oneTime': true,
      'balance': 2000,
      'monthly': 2000,
      'paidPrincipal': 0,
      'paidInterest': 0,
    };
    final d3 = {
      'settled': true,
      'oneTime': false,
      'balance': 0,
      'monthly': 0,
      'paidPrincipal': 3000,
      'paidInterest': 300,
    };
    final s = calc.summarizeDebts([d1, d2, d3]);
    expect(s['active'], 2);
    expect(s['settled'], 1);
    expect(s['total'], 3000);
    expect(s['monthly'], 200);
    expect(s['paidPrincipal'], 3500);
    expect(s['paidInterest'], 350);
  });

  test('summarizeDebts: 完成度百分比 = 已还本金/(已还本金+在还总负债)，零本零负债兜底0%', () {
    final s1 = calc.summarizeDebts([
      {
        'settled': false,
        'balance': 1000,
        'paidPrincipal': 1000,
        'monthly': 0,
        'paidInterest': 0,
      },
    ]);
    expect(s1['pct'], 50);
    final s2 = calc.summarizeDebts([]);
    expect(s2['pct'], 0);
    expect(s2['total'], 0);
    expect(s2['active'], 0);
    expect(s2['settled'], 0);
  });

  test('computeMonthlyRepayment: 空输入返回空数组', () {
    expect(calc.computeMonthlyRepayment([]), []);
  });

  test('computeMonthlyRepayment: 单笔债务已还/待还正确拆分', () {
    final d = {
      'plan': [
        {'date': '2026-01-15', 'amount': 1000, 'paid': true},
        {'date': '2026-02-15', 'amount': 1000, 'paid': false},
      ],
    };
    final out = calc.computeMonthlyRepayment([d]);
    expect(out, [
      {'month': '2026-01', 'actual': 1000, 'scheduled': 0},
      {'month': '2026-02', 'actual': 0, 'scheduled': 1000},
    ]);
  });

  test('computeMonthlyRepayment: 两笔债务同月金额相加', () {
    final d1 = {
      'plan': [
        {'date': '2026-03-05', 'amount': 500, 'paid': true},
      ],
    };
    final d2 = {
      'plan': [
        {'date': '2026-03-20', 'amount': 300, 'paid': true},
      ],
    };
    final out = calc.computeMonthlyRepayment([d1, d2]);
    expect(out, [
      {'month': '2026-03', 'actual': 800, 'scheduled': 0},
    ]);
  });

  test('computeMonthlyRepayment: settled=true 债务的已还记录仍被计入（不按active过滤）', () {
    final d = {
      'settled': true,
      'plan': [
        {'date': '2026-04-10', 'amount': 200, 'paid': true},
      ],
    };
    final out = calc.computeMonthlyRepayment([d]);
    expect(out, [
      {'month': '2026-04', 'actual': 200, 'scheduled': 0},
    ]);
  });

  test('computeMonthlyRepayment: 月份缺口正确补0（1月和4月有数据，输出4条，2/3月为0）', () {
    final d = {
      'plan': [
        {'date': '2026-01-10', 'amount': 100, 'paid': true},
        {'date': '2026-04-10', 'amount': 200, 'paid': false},
      ],
    };
    final out = calc.computeMonthlyRepayment([d]);
    expect(out, [
      {'month': '2026-01', 'actual': 100, 'scheduled': 0},
      {'month': '2026-02', 'actual': 0, 'scheduled': 0},
      {'month': '2026-03', 'actual': 0, 'scheduled': 0},
      {'month': '2026-04', 'actual': 0, 'scheduled': 200},
    ]);
  });

  test('computeMonthlyRepayment: 跨年补月（11月到次年2月）', () {
    final d = {
      'plan': [
        {'date': '2026-11-10', 'amount': 100, 'paid': true},
        {'date': '2027-02-10', 'amount': 150, 'paid': false},
      ],
    };
    final out = calc.computeMonthlyRepayment([d]);
    expect(out.map((x) => x['month']).toList(), [
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  test('computeMonthlyRepayment: date缺失/格式不对的行被防御性忽略', () {
    final d = {
      'plan': [
        {'date': '2026-05-01', 'amount': 100, 'paid': true},
        {'date': '', 'amount': 999, 'paid': true},
        {'amount': 999, 'paid': true},
        {'date': 'not-a-date', 'amount': 999, 'paid': true},
      ],
    };
    final out = calc.computeMonthlyRepayment([d]);
    expect(out, [
      {'month': '2026-05', 'actual': 100, 'scheduled': 0},
    ]);
  });

  test('isActive / rateClass: 简单谓词', () {
    expect(calc.isActive({'settled': false}), true);
    expect(calc.isActive({'settled': true}), false);
    expect(calc.rateClass(20), 'rate-hi');
    expect(calc.rateClass(10), 'rate-mid');
    expect(calc.rateClass(5), 'rate-lo');
  });

  test('clone: 深拷贝，改动副本不影响原对象', () {
    final original = {
      'a': 1,
      'nested': {'b': 2},
    };
    final copy = calc.clone(original) as Map<String, dynamic>;
    (copy['nested'] as Map)['b'] = 999;
    expect((original['nested'] as Map)['b'], 2);
    expect(copy, {
      'a': 1,
      'nested': {'b': 999},
    });
  });

  test('fmt/money: 金额格式化', () {
    expect(calc.fmt(1234.6), '1,235');
    expect(calc.fmt('abc'), '0');
    expect(calc.money(1234.5), '1,234.50');
    expect(calc.money(-5), '-5.00');
  });

  test('todayStr: 返回 M/D 格式（依赖系统时钟，只校验格式不校验具体值）', () {
    expect(calc.todayStr(), matches(RegExp(r'^\d{1,2}/\d{1,2}$')));
  });

  test('baseName / extOf: 从路径/文件名提取信息', () {
    expect(calc.baseName('a/b/c.pdf'), 'c.pdf');
    expect(calc.baseName('justname.jpg'), 'justname.jpg');
    expect(calc.baseName(''), '');
    expect(calc.extOf('report.PDF'), 'pdf');
    expect(calc.extOf('noext'), '');
    expect(calc.extOf(''), '');
  });

  test('esc/escSvg: 转义 & < >，且&优先不会被二次转义', () {
    expect(calc.esc('<a & b>'), '&lt;a &amp; b&gt;');
    expect(calc.escSvg('<a & b>'), '&lt;a &amp; b&gt;');
  });

  test('inline: 粗体/行内代码/wiki式斜体/链接只保留文字，且转义在先', () {
    expect(
      calc.inline('**bold** `code` [[em]]'),
      '<strong>bold</strong> <code>code</code> <em>em</em>',
    );
    expect(calc.inline('[点这里](http://x.com)'), '点这里');
    expect(calc.inline('<script>'), '&lt;script&gt;');
  });

  test('isHr: 三个以上-/=/_/*算分隔线，两个不算', () {
    expect(calc.isHr('---'), true);
    expect(calc.isHr('___'), true);
    expect(calc.isHr('***'), true);
    expect(calc.isHr('--'), false);
    expect(calc.isHr('abc'), false);
  });

  test('truncateLabel: 超过n截断加省略号，未超过原样返回', () {
    expect(calc.truncateLabel('1234567890', 5), '1234…');
    expect(calc.truncateLabel('abc', 5), 'abc');
    expect(calc.truncateLabel('abcde', 5), 'abcde');
  });

  test('mdToHtml: 标题/粗体/列表/引用/分隔线/代码块/表格都能转出预期的HTML结构', () {
    final html = calc.mdToHtml(
      '# Title\n\nSome **bold** text.\n\n- item1\n- item2\n\n1. one\n2. two\n\n> quote\n\n---\n\n```\ncode <tag>\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
    );
    expect(html, matches(RegExp(r'<h2>Title</h2>')));
    expect(html, matches(RegExp(r'<p>Some <strong>bold</strong> text\.</p>')));
    expect(html, matches(RegExp(r'<ul><li>item1</li><li>item2</li></ul>')));
    expect(html, matches(RegExp(r'<ol><li>one</li><li>two</li></ol>')));
    expect(html, matches(RegExp(r'<blockquote>quote</blockquote>')));
    expect(html, matches(RegExp(r'<hr>')));
    expect(
      html,
      matches(RegExp(r'<pre class="md-pre">code &lt;tag&gt;</pre>')),
    );
    expect(
      html,
      matches(
        RegExp(
          r'<div class="md-tbl"><table>.*<th>A</th>.*<td>1</td>.*</table></div>',
        ),
      ),
    );
  });

  test('mdToHtml: 空输入返回空字符串，不抛异常', () {
    expect(calc.mdToHtml(''), '');
  });

  test('hasPremium/premiumLabel: 会员判断与文案', () {
    expect(
      calc.hasPremium({
        'premium': {'method': 'onetime'},
      }),
      true,
    );
    expect(calc.hasPremium({'premium': null}), false);
    expect(calc.hasPremium(null), false);
    expect(
      calc.premiumLabel({
        'premium': {'method': 'yearly'},
      }),
      'Premium 会员',
    );
    expect(calc.premiumLabel({'premium': null}), null);
  });

  test('findAiConv: 按id查找历史对话，找不到返回null', () {
    final convos = [
      {'id': 'a'},
      {'id': 'b'},
      {'id': 'c'},
    ];
    expect(calc.findAiConv(convos, 'b'), {'id': 'b'});
    expect(calc.findAiConv(convos, 'zzz'), null);
  });

  test('bumpAiConvTop: 把指定记录挪到数组最前面，已经在最前时不做多余操作', () {
    final convos = [
      {'id': 'a'},
      {'id': 'b'},
      {'id': 'c'},
    ];
    final rec = convos[2];
    calc.bumpAiConvTop(convos, rec);
    expect(convos.map((r) => r['id']).toList(), ['c', 'a', 'b']);
    calc.bumpAiConvTop(convos, rec);
    expect(convos.map((r) => r['id']).toList(), ['c', 'a', 'b']);
  });

  // ===== 统计tab口径修正：3个已确认bug的回归测试 =====

  test('summarizeDebts: 债务结清瞬间已还金额/归零进度不倒退（BUG-2 回归）', () {
    final beforeSettle = {
      'settled': false,
      'oneTime': false,
      'balance': 0,
      'monthly': 0,
      'paidPrincipal': 3000,
      'paidInterest': 300,
    };
    final afterSettle = {
      'settled': true,
      'oneTime': false,
      'balance': 0,
      'monthly': 0,
      'paidPrincipal': 3000,
      'paidInterest': 300,
    };
    final before = calc.summarizeDebts([beforeSettle]);
    final after = calc.summarizeDebts([afterSettle]);
    expect(before['paidPrincipal'], 3000);
    expect(after['paidPrincipal'], 3000);
    expect(after['paidInterest'], 300);
    expect(after['pct'], 100);
    expect(
      (after['pct'] as num) >= (before['pct'] as num),
      isTrue,
      reason: '归零进度不能因为一笔债务结清而倒退',
    );
  });

  test('summarizeDebts: 结清/恢复来回切换，已还金额保持不变（用户报的"点恢复数字自己涨了"）', () {
    final base = {
      'settled': false,
      'oneTime': false,
      'balance': 3000,
      'monthly': 500,
      'paidPrincipal': 6144,
      'paidInterest': 120,
    };
    final oneTime = {
      'oneTime': true,
      'balance': 0,
      'monthly': 0,
      'paidPrincipal': 100,
      'paidInterest': 0,
    };
    final settled = calc.summarizeDebts([
      base,
      {...oneTime, 'settled': true},
    ]);
    final restored = calc.summarizeDebts([
      base,
      {...oneTime, 'settled': false},
    ]);
    expect(settled['paidPrincipal'], 6244);
    expect(restored['paidPrincipal'], 6244);
    expect(settled['pct'], restored['pct']);
  });

  test('computeUpcomingPressure: 提前结清的债务，未来未还期次不再计入待还（BUG-1 回归）', () {
    final settledDebt = {
      'id': 'd1',
      'name': '已结清',
      'settled': true,
      'plan': [
        {
          'date': '2026-06-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': true,
        },
        {
          'date': '2026-08-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': false,
        },
        {
          'date': '2026-09-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': false,
        },
      ],
    };
    final activeDebt = {
      'id': 'd2',
      'name': '在还',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 500,
          'principal': 450,
          'interest': 50,
          'paid': false,
        },
      ],
    };
    final today = DateTime(2026, 7, 29);
    final p = calc.computeUpcomingPressure(
      [settledDebt, activeDebt],
      12,
      today,
    );
    final months = p['months'] as List;
    final aug = months.firstWhere((m) => m['month'] == '2026-08');
    expect(aug['total'], 500, reason: '8月只该有在还债务的500，不含已结清债务的1100');
    final sep = months.firstWhere((m) => m['month'] == '2026-09');
    expect(sep['total'], 0, reason: '9月已结清债务的期次不该出现');
    expect(p['totalAhead'], 500);
    final oldOut = calc.computeMonthlyRepayment([settledDebt, activeDebt]);
    expect(
      oldOut.firstWhere((m) => m['month'] == '2026-09')['scheduled'],
      1100,
    );
  });

  test('computeReportData: 含逾期未销期次时 timeline 日期不倒流（BUG-3 回归）', () {
    final d = {
      'id': 'd1',
      'name': '有逾期',
      'settled': false,
      'plan': [
        {
          'date': '2026-01-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': false,
        },
        {
          'date': '2026-12-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': false,
        },
      ],
    };
    calc.recompute(d);
    final timeline = calc.computeReportData([d])['timeline'] as List;
    final dates = timeline.map((p) => p['date'] as String).toList();
    final sortedDates = dates.toList()..sort();
    expect(dates, sortedDates, reason: 'timeline日期必须单调不减');
    expect(timeline.first['balance'], 2000);
    expect(timeline.last['balance'], 0);
  });

  test('computeUpcomingPressure: 空输入返回N个空月份桶而不是空数组', () {
    final p = calc.computeUpcomingPressure([], 12, DateTime(2026, 7, 29));
    final months = p['months'] as List;
    expect(months.length, 12);
    expect(months[0]['month'], '2026-07');
    expect(p['currentMonth'], '2026-07');
    expect(p['totalAhead'], 0);
    expect(p['monthlyAvg'], 0);
    expect(p['peak'], null);
    expect(p['overdue'], {
      'amount': 0.0,
      'principal': 0.0,
      'interest': 0.0,
      'count': 0,
    });
  });

  test('computeUpcomingPressure: 逾期未销期次单独进overdue桶，不混进未来月份', () {
    final d = {
      'id': 'd1',
      'name': '有逾期',
      'settled': false,
      'plan': [
        {
          'date': '2026-05-10',
          'amount': 300,
          'principal': 250,
          'interest': 50,
          'paid': false,
        },
        {
          'date': '2026-07-10',
          'amount': 300,
          'principal': 250,
          'interest': 50,
          'paid': false,
        },
        {
          'date': '2026-07-31',
          'amount': 300,
          'principal': 250,
          'interest': 50,
          'paid': false,
        },
      ],
    };
    final p = calc.computeUpcomingPressure([d], 12, DateTime(2026, 7, 29));
    final overdue = p['overdue'] as Map;
    expect(overdue['count'], 2);
    expect(overdue['amount'], 600);
    expect(overdue['principal'], 500);
    expect(overdue['interest'], 100);
    final months = p['months'] as List;
    expect(months[0]['month'], '2026-07');
    expect(months[0]['total'], 300, reason: '本月桶只含今天及以后未到期的那一期');
    expect(p['totalAhead'], 300, reason: 'totalAhead不含逾期');
  });

  test('computeUpcomingPressure: 本金/利息两段拆分正确，月份连续补0且跨年', () {
    final d = {
      'id': 'd1',
      'name': '跨年',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 1100,
          'principal': 1000,
          'interest': 100,
          'paid': false,
        },
        {
          'date': '2027-01-10',
          'amount': 1100,
          'principal': 900,
          'interest': 200,
          'paid': false,
        },
      ],
    };
    final p = calc.computeUpcomingPressure([d], 12, DateTime(2026, 7, 29));
    final months = p['months'] as List;
    final aug = months.firstWhere((m) => m['month'] == '2026-08');
    expect(aug['principal'], 1000);
    expect(aug['interest'], 100);
    expect(aug['total'], 1100);
    final jan = months.firstWhere((m) => m['month'] == '2027-01');
    expect(jan['principal'], 900);
    expect(jan['interest'], 200);
    expect(months.firstWhere((m) => m['month'] == '2026-10')['total'], 0);
    expect(
      months.map((m) => m['month']).join(','),
      '2026-07,2026-08,2026-09,2026-10,2026-11,2026-12,2027-01,2027-02,2027-03,2027-04,2027-05,2027-06',
    );
  });

  test('computeUpcomingPressure: 峰值月/月均/窗口外期次被排除', () {
    final d = {
      'id': 'd1',
      'name': '长期',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 500,
          'principal': 500,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2026-09-10',
          'amount': 2000,
          'principal': 2000,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2028-09-10',
          'amount': 9999,
          'principal': 9999,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final p = calc.computeUpcomingPressure([d], 12, DateTime(2026, 7, 29));
    expect(p['peak'], {'month': '2026-09', 'total': 2000});
    expect(p['totalAhead'], 2500, reason: '窗口外的9999不计入');
    expect(p['monthlyAvg'], calc.r2(2500 / 12));
  });

  test('computeUpcomingPressure: 同一债务同月多期合并成一个items条目，多笔债务各自成条目并按金额降序', () {
    final a = {
      'id': 'dA',
      'name': 'A债',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-05',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2026-08-20',
          'amount': 200,
          'principal': 200,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final b = {
      'id': 'dB',
      'name': 'B债',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-15',
          'amount': 900,
          'principal': 900,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final p = calc.computeUpcomingPressure([a, b], 12, DateTime(2026, 7, 29));
    final months = p['months'] as List;
    final aug = months.firstWhere((m) => m['month'] == '2026-08');
    expect(aug['total'], 1200);
    expect(aug['items'], [
      {'id': 'dB', 'name': 'B债', 'amount': 900},
      {'id': 'dA', 'name': 'A债', 'amount': 300},
    ]);
  });

  test('computeUpcomingPressure: 已还期次和一次性还清债务的处理', () {
    final paidOff = {
      'id': 'd1',
      'name': '已还',
      'settled': false,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 500,
          'principal': 500,
          'interest': 0,
          'paid': true,
        },
      ],
    };
    final oneTime = {
      'id': 'd2',
      'name': '一次性',
      'settled': false,
      'oneTime': true,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 8000,
          'principal': 8000,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final p = calc.computeUpcomingPressure(
      [paidOff, oneTime],
      12,
      DateTime(2026, 7, 29),
    );
    final months = p['months'] as List;
    final aug = months.firstWhere((m) => m['month'] == '2026-08');
    expect(aug['total'], 8000, reason: '已还期次不计入；一次性还清是真实的当月支出，必须计入');
    expect((aug['items'] as List).length, 1);
  });

  test('computeUpcomingPressure: 部分还款(已知的数据模型缺口④)的期次只算还欠的那部分，不虚高', () {
    final d = {
      'id': 'd1',
      'name': '分期',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': false,
          'paidAmount': 40,
        },
      ],
    };
    final p = calc.computeUpcomingPressure([d], 12, DateTime(2026, 7, 29));
    final months = p['months'] as List;
    final aug = months.firstWhere((m) => m['month'] == '2026-08');
    expect(aug['total'], 60);
    expect(aug['principal'], 60);
    expect(aug['interest'], 0);
    expect((aug['items'] as List).first['amount'], 60);
  });

  test('remainingInterest: 只累加未还期次的利息/手续费', () {
    final d = {
      'plan': [
        {'interest': 100, 'paid': true},
        {'interest': 90, 'paid': true},
        {'interest': 80, 'paid': false},
        {'interest': 70, 'paid': false},
      ],
    };
    expect(calc.remainingInterest(d), 150);
    expect(calc.remainingInterest({'plan': <Map<String, dynamic>>[]}), 0);
    expect(calc.remainingInterest({}), 0);
    expect(
      calc.remainingInterest({
        'plan': [
          {'amount': 5000, 'principal': 0, 'interest': 0, 'paid': false},
        ],
      }),
      0,
    );
  });

  test('niceCeil: 取整到好看的刻度数字，档位够细不会把柱子压成半格高', () {
    expect(calc.niceCeil(2760), 3000);
    expect(calc.niceCeil(2194), 2500);
    expect(calc.niceCeil(1733), 2000);
    expect(calc.niceCeil(1000), 1000);
    expect(calc.niceCeil(1001), 1500);
    expect(calc.niceCeil(85), 100);
    expect(calc.niceCeil(0), 0);
    expect(calc.niceCeil(-5), 0);
    for (final s in calc.niceSteps) {
      if (s == 2.5) continue;
      expect((s * 1000) / 2 % 1, 0, reason: '档位${s}k的一半不是整数');
    }
  });

  // ===== 提前结清 / 撤销结清（applySettle / undoSettle）=====

  test('applySettle: 实付=剩余本金时，本金全额计入已还、利息为0', () {
    final d = makeDebt(3);
    final remain = d['balance'] as num;
    final paidPrincipalBefore = d['paidPrincipal'] as num;
    final paidInterestBefore = d['paidInterest'] as num;

    expect(calc.applySettle(d, remain, '2026-07-29'), true);
    expect(d['settled'], true);
    expect(d['settledDate'], '7/29');
    final plan = d['plan'] as List;
    expect(plan.length, 4);
    expect(plan[3]['settleRow'], true);
    expect(plan[3]['date'], '2026-07-29');
    expect((d['settleStash'] as List).length, 9);
    expect(d['paidPrincipal'], calc.r2(paidPrincipalBefore + remain));
    expect(d['paidInterest'], paidInterestBefore);
    expect(d['balance'], 0);
    expect(d['terms'], 0);
    expect(d['original'], makeDebt(3)['original']);
  });

  test('applySettle: 多付的部分记成利息', () {
    final d = makeDebt(2);
    final remain = d['balance'] as num;
    final paidInterestBefore = d['paidInterest'] as num;
    calc.applySettle(d, remain + 125, '2026-07-29');
    final plan = d['plan'] as List;
    expect(plan.last['interest'], 125);
    expect(d['paidInterest'], calc.r2(paidInterestBefore + 125));
    expect(d['paidPrincipal'], calc.r2(d['original'] as num));
  });

  test('applySettle: 协商减免时利息记负数，本金照实算（两栏加起来=真实付出去的钱）', () {
    final d = makeDebt(2);
    final remain = d['balance'] as num;
    calc.applySettle(d, remain - 100, '2026-07-29');
    final row = (d['plan'] as List).last as Map<String, dynamic>;
    expect(row['principal'], remain);
    expect(row['interest'], -100);
    expect(
      calc.r2((row['principal'] as num) + (row['interest'] as num)),
      calc.r2(remain - 100),
    );
  });

  test('applySettle: 已经没有未还期次时返回false、不做任何改动', () {
    final d = makeDebt(12);
    final before = List<Map<String, dynamic>>.from(
      (d['plan'] as List).cast<Map<String, dynamic>>(),
    );
    expect(calc.applySettle(d, 100, '2026-07-29'), false);
    expect(d['plan'], before);
    expect(d['settleStash'], null);
  });

  test('applySettle: 年化利率仍按原始完整计划反推，不被结清行带偏', () {
    final d = makeDebt(3);
    final rateBefore = d['rate'];
    calc.applySettle(d, (d['balance'] as num) + 500, '2026-07-29');
    expect(d['rate'], rateBefore);
    calc.recompute(d);
    expect(d['rate'], rateBefore);
  });

  test('undoSettle: 提前结清后撤销，精确回到结清前那一刻', () {
    final before = makeDebt(3);
    final d = makeDebt(3);
    calc.applySettle(d, (d['balance'] as num) + 300, '2026-07-29');
    calc.undoSettle(d);

    expect(d['settled'], false);
    expect(d['settleStash'], null);
    final plan = d['plan'] as List;
    expect(plan.length, 12);
    expect(plan.any((r) => r['settleRow'] == true), false);
    expect(d['balance'], before['balance']);
    expect(d['paidPrincipal'], before['paidPrincipal']);
    expect(d['paidInterest'], before['paidInterest']);
    expect(d['terms'], before['terms']);
    expect(d['nextDate'], before['nextDate']);
    expect(d['plan'], before['plan']);
  });

  test('undoSettle: 销完最后一期自动结清的债务，恢复后不能留下待还¥0的僵尸', () {
    final d = <String, dynamic>{
      'id': 'd1',
      'name': '一次性',
      'oneTime': true,
      'plan': [
        {
          'date': '2026-07-01',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': true,
          'paidAt': '2026-07-01',
        },
      ],
    };
    d['settled'] = true;
    d['settledDate'] = '7/1';
    calc.recompute(d);
    expect(d['balance'], 0);

    calc.undoSettle(d);
    expect(d['settled'], false);
    expect((d['plan'] as List)[0]['paid'], false);
    expect(d['balance'], 100);
    expect(d['terms'], 1);
    expect((d['plan'] as List)[0]['paidAt'], null);
    expect((d['plan'] as List)[0]['paidAmount'], null);
  });

  test('undoSettle: 多期债务销完最后一期后恢复，只释放最后一期(原来已还几期还是几期)', () {
    final d = makeDebt(12);
    d['settled'] = true;
    d['settledDate'] = '7/29';
    calc.undoSettle(d);
    expect(d['paidTerms'], 11);
    expect(d['terms'], 1);
    final plan = d['plan'] as List;
    expect(plan[10]['paid'], true);
    expect(plan[11]['paid'], false);
  });

  // ===== 还款流水(paidAt) + 部分还款(recordPayment/waivePeriod) =====

  test('rowRemaining: 没还过就是全额，还了一部分就扣掉那部分', () {
    expect(calc.rowRemaining({'amount': 100}), 100);
    expect(calc.rowRemaining({'amount': 100, 'paidAmount': 40}), 60);
    expect(calc.rowRemaining({'amount': 100, 'paidAmount': 100}), 0);
  });

  test('recompute: 未还期次有部分还款时，按利息优先分摊已还本金/利息，剩余待还本金相应减少', () {
    final d = <String, dynamic>{
      'id': 'd',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': false,
          'paidAmount': 40,
        },
      ],
    };
    calc.recompute(d);
    expect(d['paidPrincipal'], 20);
    expect(d['paidInterest'], 20);
    expect(d['balance'], 60);
    expect(d['paidTerms'], 0);
    expect(d['terms'], 1);
  });

  test('recompute: 部分还款不够利息时，全部冲抵利息、本金分文未减', () {
    final d = <String, dynamic>{
      'id': 'd',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': false,
          'paidAmount': 15,
        },
      ],
    };
    calc.recompute(d);
    expect(d['paidPrincipal'], 0);
    expect(d['paidInterest'], 15);
    expect(d['balance'], 80);
  });

  test('recompute: 老数据(paid=true但没有paidAmount字段)按计划全额算，行为不变', () {
    final d = <String, dynamic>{
      'id': 'd',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': true,
        },
      ],
    };
    calc.recompute(d);
    expect(d['paidPrincipal'], 80);
    expect(d['paidInterest'], 20);
    expect(d['balance'], 0);
  });

  test('recompute: 已还期次paidAmount达到amount(不是协商减免)按计划全额算，不触发分摊', () {
    final d = <String, dynamic>{
      'id': 'd',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': true,
          'paidAmount': 100,
        },
      ],
    };
    calc.recompute(d);
    expect(d['paidPrincipal'], 80);
    expect(d['paidInterest'], 20);
  });

  test('recompute: 已还期次paidAmount小于amount(协商减免关闭)按实付金额利息优先分摊，不是全额', () {
    final d = <String, dynamic>{
      'id': 'd',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 80,
          'interest': 20,
          'paid': true,
          'paidAmount': 15,
        },
      ],
    };
    calc.recompute(d);
    expect(d['paidPrincipal'], 0);
    expect(d['paidInterest'], 15);
    expect(d['balance'], 0);
    expect((d['plan'] as List)[0]['principal'], 80);
    expect((d['plan'] as List)[0]['interest'], 20);
  });

  test('recordPayment: 还的钱不够这期，累加paidAmount、这期继续留在未还里，可以之后再补', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 80,
        'interest': 20,
        'paid': false,
      },
    ]);
    final res = calc.recordPayment(d, 40, '2026-07-29');
    expect(res, {'idx': 0, 'full': false, 'remaining': 60});
    expect((d['plan'] as List)[0]['paid'], false);
    expect((d['plan'] as List)[0]['paidAmount'], 40);
    expect((d['plan'] as List)[0]['paidAt'], null);
    expect(d['balance'], 60);
  });

  test('recordPayment: 分两次补齐，第二次凑够金额后自动标记已还+盖实付日期', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 80,
        'interest': 20,
        'paid': false,
      },
    ]);
    calc.recordPayment(d, 40, '2026-07-29');
    final res = calc.recordPayment(d, 60, '2026-08-05')!;
    expect(res['full'], true);
    expect((d['plan'] as List)[0]['paid'], true);
    expect((d['plan'] as List)[0]['paidAt'], '2026-08-05');
    expect((d['plan'] as List)[0]['paidAmount'], 100);
    expect(d['paidPrincipal'], 80);
    expect(d['paidInterest'], 20);
  });

  test('recordPayment: 一次性还够/超额，直接标记已还，paidAmount封顶在amount(多付不结转)', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 80,
        'interest': 20,
        'paid': false,
      },
    ]);
    final res = calc.recordPayment(d, 150, '2026-07-29')!;
    expect(res['full'], true);
    expect((d['plan'] as List)[0]['paid'], true);
    expect((d['plan'] as List)[0]['paidAmount'], 100);
  });

  test('recordPayment: 最后一期还清后，跟payInstallment一样自动整体结清债务', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 100,
        'interest': 0,
        'paid': false,
      },
    ]);
    final res = calc.recordPayment(d, 100, '2026-07-29')!;
    expect(res['full'], true);
    expect(d['settled'], true);
    expect(d['settledDate'], '7/29');
  });

  test('recordPayment: 已经没有未还期次时返回null', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 100,
        'interest': 0,
        'paid': true,
      },
    ]);
    expect(calc.recordPayment(d, 50, '2026-07-29'), null);
  });

  test('waivePeriod: 协商减免——不管实付多少都强制关闭这一期，差额自动体现为少算的已还', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 80,
        'interest': 20,
        'paid': false,
      },
    ]);
    final res = calc.waivePeriod(d, 40, '2026-07-29');
    expect(res, {'idx': 0});
    expect((d['plan'] as List)[0]['paid'], true);
    expect((d['plan'] as List)[0]['paidAt'], '2026-07-29');
    expect((d['plan'] as List)[0]['paidAmount'], 40);
    expect(d['paidPrincipal'], 20);
    expect(d['paidInterest'], 20);
    expect(d['balance'], 0);
    expect(d['terms'], 0);
    expect((d['plan'] as List)[0]['principal'], 80);
  });

  test('waivePeriod: 最后一期减免关闭后，整体债务自动结清', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 80,
        'interest': 20,
        'paid': false,
      },
    ]);
    calc.waivePeriod(d, 30, '2026-07-29');
    expect(d['settled'], true);
    expect(d['settledDate'], '7/29');
  });

  test('waivePeriod: 已经没有未还期次时返回null', () {
    final d = planDebt([
      {
        'date': '2026-08-10',
        'amount': 100,
        'principal': 100,
        'interest': 0,
        'paid': true,
      },
    ]);
    expect(calc.waivePeriod(d, 50, '2026-07-29'), null);
  });

  // ===== pressureWindowMonths =====

  test('pressureWindowMonths: 铺到最后一笔未还期次所在的月份，下限12上限60', () {
    final today = DateTime(2026, 7, 15);
    Map<String, dynamic> mk(List<String> dates, [Map<String, dynamic>? extra]) {
      return {
        'id': 'd',
        'plan': [
          for (final dt in dates)
            {
              'date': dt,
              'amount': 100,
              'principal': 100,
              'interest': 0,
              'paid': false,
            },
        ],
        ...?extra,
      };
    }

    expect(calc.pressureWindowMonths([], today), 12);
    expect(calc.pressureWindowMonths([mk([])], today), 12);
    expect(
      calc.pressureWindowMonths([
        mk(['2026-10-10']),
      ], today),
      12,
    );
    expect(
      calc.pressureWindowMonths([
        mk(['2028-07-01']),
      ], today),
      25,
    );
    expect(
      calc.pressureWindowMonths([
        mk(['2040-01-01']),
      ], today),
      60,
    );
    expect(
      calc.pressureWindowMonths([
        mk(['2030-01-01'], {'settled': true}),
      ], today),
      12,
    );

    final paidLate = {
      'id': 'd',
      'plan': [
        {
          'date': '2030-01-01',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': true,
        },
        {
          'date': '2026-01-01',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    expect(calc.pressureWindowMonths([paidLate], today), 12);

    expect(
      calc.pressureWindowMonths([
        mk(['2027-01-05']),
        mk(['2027-07-05']),
      ], today),
      13,
    );
  });

  // ===== computeNotifySchedule =====

  test('computeNotifySchedule: 通知关闭或没有规则时返回空', () {
    final d = {
      'id': 'd',
      'name': 'A',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final now = DateTime(2026, 7, 29).millisecondsSinceEpoch;
    expect(
      calc.computeNotifySchedule(
        [d],
        {
          'enabled': false,
          'rules': [
            {'offsetDays': 1, 'time': '09:00'},
          ],
        },
        now,
        6,
        450,
      ),
      [],
    );
    expect(
      calc.computeNotifySchedule(
        [d],
        {'enabled': true, 'rules': <Map<String, dynamic>>[]},
        now,
        6,
        450,
      ),
      [],
    );
    expect(calc.computeNotifySchedule([d], null, now, 6, 450), []);
  });

  test('computeNotifySchedule: 排的不只是下一期，窗口内每一期未还都排（回归：老版本只排nextDate）', () {
    final d = {
      'id': 'd',
      'name': '分期贷',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2026-09-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2026-10-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final now = DateTime(2026, 7, 29).millisecondsSinceEpoch;
    final rules = [
      {'offsetDays': 1, 'time': '09:00'},
    ];
    final list = calc.computeNotifySchedule(
      [d],
      {'enabled': true, 'rules': rules},
      now,
      6,
      450,
    );
    expect(list.length, 3, reason: '三期各排一条，不是只有下一期');
    expect(list.map((x) => x['date']).toList(), [
      '2026-08-10',
      '2026-09-10',
      '2026-10-10',
    ]);
  });

  test('computeNotifySchedule: 已结清债务不参与；已还的期次不参与', () {
    final settled = {
      'id': 'd1',
      'name': '已结清',
      'settled': true,
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final paid = {
      'id': 'd2',
      'name': '已还这期',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': true,
        },
      ],
    };
    final now = DateTime(2026, 7, 29).millisecondsSinceEpoch;
    final list = calc.computeNotifySchedule(
      [settled, paid],
      {
        'enabled': true,
        'rules': [
          {'offsetDays': 1, 'time': '09:00'},
        ],
      },
      now,
      6,
      450,
    );
    expect(list, []);
  });

  test('computeNotifySchedule: 超出窗口的期次不排；窗口边界当天算在窗口内', () {
    final today = DateTime(2026, 7, 29);
    final d = {
      'id': 'd',
      'name': '长期',
      'plan': [
        {
          'date': '2027-01-29',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
        {
          'date': '2027-02-01',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final list = calc.computeNotifySchedule(
      [d],
      {
        'enabled': true,
        'rules': [
          {'offsetDays': 0, 'time': '09:00'},
        ],
      },
      today.millisecondsSinceEpoch,
      6,
      450,
    );
    expect(list.length, 1);
    expect(list[0]['date'], '2027-01-29');
  });

  test('computeNotifySchedule: 一期配多条规则各自算出正确的提醒时间；已经过去的提醒时间被跳过', () {
    final d = {
      'id': 'd',
      'name': 'A',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 200,
          'principal': 200,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final now = DateTime(2026, 8, 9, 12, 0, 0).millisecondsSinceEpoch;
    final rules = [
      {'offsetDays': 3, 'time': '09:00'},
      {'offsetDays': 1, 'time': '09:00'},
      {'offsetDays': 0, 'time': '18:00'},
    ];
    final list = calc.computeNotifySchedule(
      [d],
      {'enabled': true, 'rules': rules},
      now,
      6,
      450,
    );
    expect(list.length, 1);
    expect(
      (list[0]['fireAt'] as DateTime).millisecondsSinceEpoch,
      DateTime(2026, 8, 10, 18, 0, 0).millisecondsSinceEpoch,
    );
  });

  test('computeNotifySchedule: 结果按触发时间升序排列', () {
    final a = {
      'id': 'a',
      'name': 'A',
      'plan': [
        {
          'date': '2026-09-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final b = {
      'id': 'b',
      'name': 'B',
      'plan': [
        {
          'date': '2026-08-10',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
      ],
    };
    final now = DateTime(2026, 7, 29).millisecondsSinceEpoch;
    final list = calc.computeNotifySchedule(
      [a, b],
      {
        'enabled': true,
        'rules': [
          {'offsetDays': 0, 'time': '09:00'},
        ],
      },
      now,
      6,
      450,
    );
    expect(list.map((x) => x['name']).toList(), ['B', 'A']);
  });

  test('computeNotifySchedule: 超过maxCount按触发时间截断，保留最近的那些', () {
    final plan = <Map<String, dynamic>>[
      for (var m = 1; m <= 12; m++)
        {
          'date': '2026-${m.toString().padLeft(2, '0')}-15',
          'amount': 100,
          'principal': 100,
          'interest': 0,
          'paid': false,
        },
    ];
    final d = {'id': 'd', 'name': '多期', 'plan': plan};
    final now = DateTime(2026, 1, 1).millisecondsSinceEpoch;
    final list = calc.computeNotifySchedule(
      [d],
      {
        'enabled': true,
        'rules': [
          {'offsetDays': 0, 'time': '09:00'},
        ],
      },
      now,
      12,
      5,
    );
    expect(list.length, 5);
    expect(list[0]['date'], '2026-01-15', reason: '截断后保留的是离现在最近的那些，不是随便丢的');
    expect(list[4]['date'], '2026-05-15');
  });
}
