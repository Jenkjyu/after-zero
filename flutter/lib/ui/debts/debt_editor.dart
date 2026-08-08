import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:after_zero/calc/calc.dart' as calc;
import 'package:after_zero/data/debt_ops.dart';
import 'package:after_zero/data/models.dart';
import 'package:after_zero/data/providers.dart';

/// 新增/编辑债务。计划本身是唯一源头，所有余额、月供和年化都由 [recomputeDebt] 重算。
class DebtEditorScreen extends ConsumerStatefulWidget {
  final Debt? debt;
  const DebtEditorScreen({super.key, this.debt});

  @override
  ConsumerState<DebtEditorScreen> createState() => _DebtEditorScreenState();
}

class _DebtEditorScreenState extends ConsumerState<DebtEditorScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _funder;
  late final TextEditingController _opened;
  late final TextEditingController _notes;
  final _gen = <String, TextEditingController>{};
  final _batchValue = TextEditingController();
  final _batchMonth = TextEditingController();
  late String _type;
  late bool _oneTime;
  late List<PlanRow> _plan;
  List<PlanRow> _oneTimeStash = [];
  String _planMode = 'manual';
  String _kind = 'amort';
  String _batchColumn = 'principal';

  static const _kinds = <(String, String)>[
    ('amort', '等额本息'),
    ('equalprincipal', '等额本金'),
    ('equalfee', '等本等费'),
    ('interestfirst', '先息后本'),
    ('custom', '自定义'),
  ];

  @override
  void initState() {
    super.initState();
    final d = widget.debt;
    _name = TextEditingController(text: d?.name ?? '');
    _funder = TextEditingController(text: d?.funder ?? '');
    _opened = TextEditingController(text: d?.opened ?? '');
    _notes = TextEditingController(text: d?.notes ?? '');
    _type = d?.type?.isNotEmpty == true ? d!.type! : '银行贷';
    _oneTime = d?.oneTime == true;
    _plan = List.of(d?.plan ?? const []);
    if (_oneTime && _plan.length > 1) {
      _oneTimeStash = _plan.skip(1).toList();
      _plan = _plan.take(1).toList();
    }
    final g = d?.gen;
    _kind = g?.kind ?? 'amort';
    _initGen('first', g?.first ?? d?.opened ?? '');
    _initGen('P', g?.p);
    _initGen('rate', g?.rate);
    _initGen('n', g?.n);
    _initGen('pp', g?.pp);
    _initGen('pf', g?.pf);
    _initGen('ni', g?.ni);
    _initGen('np', g?.np);
    _batchMonth.text = _plan.isNotEmpty && _plan.first.date.length >= 7
        ? _plan.first.date.substring(0, 7)
        : '';
  }

  void _initGen(String key, Object? value) =>
      _gen[key] = TextEditingController(text: value?.toString() ?? '');

  @override
  void dispose() {
    _name.dispose();
    _funder.dispose();
    _opened.dispose();
    _notes.dispose();
    _batchValue.dispose();
    _batchMonth.dispose();
    for (final controller in _gen.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _toggleOneTime(bool value) {
    setState(() {
      if (value && _plan.length > 1) {
        _oneTimeStash = _plan.skip(1).toList();
        _plan = _plan.take(1).toList();
      } else if (!value && _oneTimeStash.isNotEmpty) {
        _plan = [..._plan, ..._oneTimeStash];
        _oneTimeStash = [];
      }
      _oneTime = value;
      if (value) _planMode = 'manual';
    });
  }

  void _generate() {
    final first = _gen['first']!.text.trim();
    final date = calc.parseDate(first);
    if (date == null) return _message('首期还款日必填');
    if (calc.isBadRepeatDay(date.day)) {
      return _message('首期还款日只支持 1–28 日；29–31 日请生成后逐期手动填写。');
    }
    num? value(String key) => num.tryParse(_gen[key]!.text.trim());
    final p = value('P');
    final rate = value('rate');
    final n = value('n');
    if (_kind == 'amort' || _kind == 'equalprincipal') {
      if (p == null || p <= 0 || rate == null || n == null || n <= 0) {
        return _message('借款金额、年化和期数必须填写');
      }
    }
    if (_kind == 'equalfee' && ((value('pp') ?? -1) < 0 || (value('pf') ?? -1) < 0 || (n ?? 0) <= 0)) {
      return _message('请填写每期本金、手续费和期数');
    }
    if (_kind == 'interestfirst' && (p == null || p <= 0 || rate == null || (value('ni') ?? -1) < 0 || (value('np') ?? 0) <= 0)) {
      return _message('请填写本金、年化、利息期数和还本期数');
    }
    if (_kind == 'custom' && (n == null || n <= 0)) return _message('请填写要生成的期数');
    final spec = <String, dynamic>{
      'kind': _kind,
      'first': first,
      if (value('pp') != null) 'pp': value('pp'),
      if (value('pf') != null) 'pf': value('pf'),
      if (value('ni') != null) 'ni': value('ni'),
      if (value('np') != null) 'np': value('np'),
    };
    if (p != null) spec['P'] = p;
    if (rate != null) spec['rate'] = rate;
    if (n != null) spec['n'] = n;
    setState(() {
      _plan = calc.genPlan(spec).map(PlanRow.fromMap).toList();
      _oneTimeStash = [];
      _planMode = 'manual';
    });
    _message('已生成 ${_plan.length} 期，可继续逐行修改');
  }

  void _addRow() {
    final previous = _plan.isEmpty ? null : calc.parseDate(_plan.last.date);
    setState(() {
      _plan.add(
        PlanRow(
          date: previous == null ? '' : calc.fmtDate(calc.addMonths(previous, 1)),
          amount: 0,
          principal: 0,
          interest: 0,
          paid: false,
        ),
      );
    });
  }

  void _applyBatch() {
    if (_plan.isEmpty) return _message('还没有还款期，先加一期');
    if (_batchColumn == 'date') {
      final day = int.tryParse(_batchValue.text.trim());
      final parts = _batchMonth.text.trim().split('-');
      if (day == null || day < 1 || day > 28 || parts.length != 2) {
        return _message('请填 1–28 日及首期年月（如 2026-09）');
      }
      final year = int.tryParse(parts.first);
      final month = int.tryParse(parts.last);
      if (year == null || month == null || month < 1 || month > 12) return _message('首期年月格式不正确');
      setState(() {
        _plan = [
          for (var i = 0; i < _plan.length; i++)
            _plan[i].copyWith(date: calc.fmtDate(DateTime(year, month + i, day))),
        ];
      });
      return _message('已批量设置还款日');
    }
    final value = num.tryParse(_batchValue.text.trim());
    if (value == null || value < 0) return _message('请输入不小于 0 的数值');
    setState(() {
      _plan = [
        for (final row in _plan)
          switch (_batchColumn) {
            'principal' => row.copyWith(principal: calc.r2(value), amount: calc.r2(value + row.interest)),
            'interest' => row.copyWith(interest: calc.r2(value), amount: calc.r2(row.principal + value)),
            _ => row.copyWith(amount: calc.r2(value), principal: 0, interest: 0),
          },
      ];
    });
    _message(_batchColumn == 'amount' ? '金额已批量设置；本金和利息已清零，请重新填写。' : '已批量更新');
  }

  GenSpec _genSpec() {
    num? value(String key) => num.tryParse(_gen[key]!.text.trim());
    return GenSpec(
      kind: _kind,
      first: _gen['first']!.text.trim(),
      p: value('P'),
      rate: value('rate'),
      n: value('n'),
      pp: value('pp'),
      pf: value('pf'),
      ni: value('ni'),
      np: value('np'),
    );
  }

  void _save() {
    if (!(_form.currentState?.validate() ?? false)) return;
    if (_opened.text.trim().isEmpty) return _message('借款日必填');
    if (_plan.isEmpty) return _message('至少要有一期还款计划才能保存');
    for (var i = 0; i < _plan.length; i++) {
      final row = _plan[i];
      if (calc.parseDate(row.date) == null) return _message('第 ${i + 1} 期的还款日期必须填写');
      if (row.amount < 0 || row.principal < 0 || row.interest < 0) return _message('第 ${i + 1} 期不能填写负数');
      if (row.principal == 0 && row.interest == 0) return _message('第 ${i + 1} 期的本金和利息不能同时为 0');
      if ((row.amount - calc.r2(row.principal + row.interest)).abs() > .015) {
        return _message('第 ${i + 1} 期金额与本金＋利息不一致');
      }
    }
    final draft = Debt(
      id: widget.debt?.id ?? calc.genDebtId(),
      name: _name.text.trim(),
      funder: _emptyToNull(_funder.text),
      type: _emptyToNull(_type),
      opened: _opened.text.trim(),
      notes: _emptyToNull(_notes.text),
      oneTime: _oneTime || _plan.length == 1,
      plan: _plan,
      gen: _genSpec(),
    );
    ref.read(debtsProvider.notifier).setDebt(widget.debt?.id, recomputeDebt(draft));
    Navigator.of(context).pop();
    _message('已保存 ✓');
  }

  String? _emptyToNull(String text) => text.trim().isEmpty ? null : text.trim();
  void _message(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _delete() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除这笔债务？'),
        content: const Text('删除后不能恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('删除')),
        ],
      ),
    );
    if (yes == true && mounted) {
      ref.read(debtsProvider.notifier).deleteDebt(widget.debt!.id);
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final borrow = _plan.fold<num>(0, (sum, row) => sum + row.principal);
    final remaining = _plan.where((row) => !row.paid).fold<num>(0, (sum, row) => sum + row.principal);
    final paidTerms = _plan.where((row) => row.paid).length;
    final draft = <String, dynamic>{'plan': _plan.map((row) => row.toMap()).toList()};
    calc.recompute(draft);
    final rate = (draft['rate'] as num?) ?? 0;
    final firstDay = _plan.isEmpty || calc.parseDate(_plan.first.date) == null
        ? ''
        : '${calc.parseDate(_plan.first.date)!.day}';
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.debt == null ? '新增债务' : '编辑债务'),
        actions: [if (widget.debt != null) IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline), tooltip: '删除')],
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
          children: [
            TextFormField(controller: _name, decoration: const InputDecoration(labelText: '贷款产品', border: OutlineInputBorder()), validator: (value) => value?.trim().isEmpty == true ? '请填写贷款产品' : null),
            const SizedBox(height: 12),
            TextFormField(controller: _funder, decoration: const InputDecoration(labelText: '出资方', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(initialValue: _type, decoration: const InputDecoration(labelText: '借款类型', border: OutlineInputBorder()), items: const ['银行贷', '信用卡分期', '网贷', '私人借款'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(), onChanged: (value) => setState(() => _type = value!)),
            const SizedBox(height: 12),
            TextFormField(controller: _opened, keyboardType: TextInputType.datetime, decoration: const InputDecoration(labelText: '借款日（YYYY-MM-DD）', border: OutlineInputBorder()), validator: (value) => calc.parseDate(value ?? '') == null ? '请输入有效日期' : null),
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '还款日（几号）',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    firstDay,
                    style: Theme.of(
                      context,
                    ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('一次性还清'), subtitle: const Text('不计入经常性月供，销项即结清'), value: _oneTime, onChanged: _toggleOneTime),
            TextFormField(controller: _notes, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: '备注', border: OutlineInputBorder())),
            const Divider(height: 36),
            Text('还款计划', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 5),
            Wrap(
              spacing: 20,
              runSpacing: 8,
              children: [
                _summaryItem(context, '借款金额', '¥${calc.fmt(borrow)}'),
                _summaryItem(context, '剩余待还', '¥${calc.fmt(remaining)}'),
                _summaryItem(context, '年化', rate == 0 ? '0%' : '${rate.toStringAsFixed(2)}%'),
                _summaryItem(context, '期数', '共 ${_plan.length} 期 · 已还 $paidTerms'),
              ],
            ),
            if (!_oneTime) ...[
              const SizedBox(height: 14),
              SegmentedButton<String>(segments: const [ButtonSegment(value: 'manual', label: Text('手动添加')), ButtonSegment(value: 'gen', label: Text('公式生成'))], selected: {_planMode}, onSelectionChanged: (value) => setState(() => _planMode = value.first)),
              if (_planMode == 'gen') _GeneratorPanel(kind: _kind, kinds: _kinds, controllers: _gen, onKind: (kind) => setState(() => _kind = kind), onGenerate: _generate),
              if (_planMode == 'manual') _BatchPanel(column: _batchColumn, value: _batchValue, month: _batchMonth, onColumn: (value) => setState(() => _batchColumn = value), onApply: _applyBatch),
            ],
            const SizedBox(height: 14),
            for (var i = 0; i < _plan.length; i++)
              _PlanRowEditor(
                key: ValueKey('plan-$i-${_plan[i].date}-${_plan[i].paid}'),
                index: i,
                row: _plan[i],
                onChanged: (row) => setState(() => _plan[i] = row),
                onDelete: () => setState(() => _plan.removeAt(i)),
              ),
            OutlinedButton.icon(onPressed: _addRow, icon: const Icon(Icons.add), label: const Text('加一期')),
            const SizedBox(height: 20),
            FilledButton(onPressed: _save, child: const Text('保存')),
          ],
        ),
      ),
    );
  }

  Widget _summaryItem(
    BuildContext context,
    String label,
    String value,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 2),
        Text(
          value,
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

class _GeneratorPanel extends StatelessWidget {
  final String kind;
  final List<(String, String)> kinds;
  final Map<String, TextEditingController> controllers;
  final ValueChanged<String> onKind;
  final VoidCallback onGenerate;
  const _GeneratorPanel({required this.kind, required this.kinds, required this.controllers, required this.onKind, required this.onGenerate});

  TextField _field(String key, String label) => TextField(key: Key('gen-$key'), controller: controllers[key], keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: label, border: const OutlineInputBorder()));

  @override
  Widget build(BuildContext context) {
    final labels = kinds.firstWhere((item) => item.$1 == kind).$2;
    final fields = <Widget>[
      DropdownButtonFormField<String>(initialValue: kind, decoration: const InputDecoration(labelText: '计息方式', border: OutlineInputBorder()), items: [for (final item in kinds) DropdownMenuItem(value: item.$1, child: Text(item.$2))], onChanged: (value) => onKind(value!)),
      const SizedBox(height: 12),
    ];
    if (kind == 'amort' || kind == 'equalprincipal') fields.addAll([_field('P', '借款金额 ¥'), const SizedBox(height: 12), _field('rate', '年化 %'), const SizedBox(height: 12), _field('n', '期数')]);
    if (kind == 'equalfee') fields.addAll([_field('pp', '每期本金 ¥'), const SizedBox(height: 12), _field('pf', '每期手续费 ¥'), const SizedBox(height: 12), _field('n', '期数')]);
    if (kind == 'interestfirst') fields.addAll([_field('P', '借款本金 ¥'), const SizedBox(height: 12), _field('rate', '年化 %'), const SizedBox(height: 12), _field('ni', '利息期数'), const SizedBox(height: 12), _field('np', '还本期数')]);
    if (kind == 'custom') fields.add(_field('n', '生成几期空白行'));
    fields.addAll([const SizedBox(height: 12), TextField(key: const Key('gen-first'), controller: controllers['first'], decoration: const InputDecoration(labelText: '首期还款日（YYYY-MM-DD，限 1–28 日）', border: OutlineInputBorder())), const SizedBox(height: 12), FilledButton(onPressed: onGenerate, child: Text('按$labels生成计划'))]);
    return Padding(padding: const EdgeInsets.only(top: 14), child: Column(children: fields));
  }
}

class _BatchPanel extends StatelessWidget {
  final String column;
  final TextEditingController value;
  final TextEditingController month;
  final ValueChanged<String> onColumn;
  final VoidCallback onApply;
  const _BatchPanel({required this.column, required this.value, required this.month, required this.onColumn, required this.onApply});
  @override
  Widget build(BuildContext context) => ExpansionTile(
    initiallyExpanded: true,
    title: const Text('批量设置'),
    childrenPadding: const EdgeInsets.only(bottom: 8),
    children: [
      DropdownButtonFormField<String>(initialValue: column, decoration: const InputDecoration(border: OutlineInputBorder()), items: const [('principal', '本金'), ('interest', '利息/费'), ('amount', '金额（清空构成）'), ('date', '还款日')].map((item) => DropdownMenuItem(value: item.$1, child: Text(item.$2))).toList(), onChanged: (value) => onColumn(value!)),
      const SizedBox(height: 8),
      TextField(controller: value, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: column == 'date' ? '几号（1–28）' : '数值', border: const OutlineInputBorder())),
      if (column == 'date') ...[const SizedBox(height: 8), TextField(controller: month, decoration: const InputDecoration(labelText: '首期年月（YYYY-MM）', border: OutlineInputBorder()))],
      const SizedBox(height: 8),
      FilledButton.tonal(onPressed: onApply, child: const Text('应用到全部')),
    ],
  );
}

class _PlanRowEditor extends StatefulWidget {
  final int index;
  final PlanRow row;
  final ValueChanged<PlanRow> onChanged;
  final VoidCallback onDelete;
  const _PlanRowEditor({super.key, required this.index, required this.row, required this.onChanged, required this.onDelete});
  @override
  State<_PlanRowEditor> createState() => _PlanRowEditorState();
}

class _PlanRowEditorState extends State<_PlanRowEditor> {
  late final TextEditingController _date = TextEditingController(text: widget.row.date);
  late final TextEditingController _amount = TextEditingController(text: widget.row.amount.toString());
  late final TextEditingController _principal = TextEditingController(text: widget.row.principal.toString());
  late final TextEditingController _interest = TextEditingController(text: widget.row.interest.toString());
  @override
  void dispose() { _date.dispose(); _amount.dispose(); _principal.dispose(); _interest.dispose(); super.dispose(); }
  num _number(String text) => num.tryParse(text.trim()) ?? 0;
  void _principalChanged(String value) { final next = calc.r2(_number(value) + widget.row.interest); _amount.text = next.toString(); widget.onChanged(widget.row.copyWith(principal: _number(value), amount: next)); }
  void _interestChanged(String value) { final next = calc.r2(widget.row.principal + _number(value)); _amount.text = next.toString(); widget.onChanged(widget.row.copyWith(interest: _number(value), amount: next)); }
  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(children: [
        Row(children: [Text('第${widget.index + 1}期', style: Theme.of(context).textTheme.titleSmall), const Spacer(), Checkbox(value: widget.row.paid, onChanged: (value) => widget.onChanged(widget.row.copyWith(paid: value ?? false, paidAt: value == true ? widget.row.paidAt : null, paidAmount: value == true ? widget.row.paidAmount : null))), const Text('已还'), IconButton(onPressed: widget.onDelete, icon: const Icon(Icons.close), tooltip: '删除本期')]),
        TextField(controller: _date, onChanged: (value) => widget.onChanged(widget.row.copyWith(date: value)), decoration: const InputDecoration(labelText: '还款日（YYYY-MM-DD）', border: OutlineInputBorder())),
        const SizedBox(height: 8),
        Row(children: [Expanded(child: TextField(controller: _amount, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: (value) => widget.onChanged(widget.row.copyWith(amount: _number(value))), decoration: const InputDecoration(labelText: '金额', border: OutlineInputBorder()))), const SizedBox(width: 8), Expanded(child: TextField(controller: _principal, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: _principalChanged, decoration: const InputDecoration(labelText: '本金', border: OutlineInputBorder()))), const SizedBox(width: 8), Expanded(child: TextField(controller: _interest, keyboardType: const TextInputType.numberWithOptions(decimal: true), onChanged: _interestChanged, decoration: const InputDecoration(labelText: '利息/费', border: OutlineInputBorder())))])
      ]),
    ),
  );
}
