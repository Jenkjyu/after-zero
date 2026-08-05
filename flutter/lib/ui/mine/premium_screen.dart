import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models.dart';
import '../../data/providers.dart';
import 'legal_screens.dart';

class PremiumScreen extends ConsumerStatefulWidget {
  const PremiumScreen({super.key});

  @override
  ConsumerState<PremiumScreen> createState() => _PremiumScreenState();
}

class _PremiumScreenState extends ConsumerState<PremiumScreen> {
  final _code = TextEditingController();
  bool _redeemOpen = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = ref.watch(premiumProvider).hasPremium;
    return Scaffold(
      appBar: AppBar(title: const Text('Premium')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 30),
        children: [
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                children: [
                  const Icon(Icons.auto_awesome, size: 42),
                  const SizedBox(height: 10),
                  Text(
                    active ? 'Premium 已解锁' : '升级你的 After Zero',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text('云备份、AI 债务助手与多策略规划'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          const _Feature(
            icon: Icons.cloud_outlined,
            title: '云备份',
            subtitle: '手动创建多份云端记录，每条都能单独恢复',
          ),
          const _Feature(
            icon: Icons.psychology_outlined,
            title: 'AI 债务助手',
            subtitle: '分析优先还款顺序，并支持围绕自己的数据继续追问',
          ),
          const _Feature(
            icon: Icons.compare_arrows,
            title: '多策略对比规划',
            subtitle: '雪球法、雪崩法和自定义顺序并排比较',
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  const Text(
                    '永久解锁',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '¥15',
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const Text('一次性付费，永久使用，不再另外收费'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: active ? null : _paymentNotice,
            child: Text(active ? '已开通 Premium' : '开通 Premium'),
          ),
          TextButton(
            onPressed: () => setState(() => _redeemOpen = !_redeemOpen),
            child: const Text('我有兑换码'),
          ),
          if (_redeemOpen)
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _code,
                    decoration: const InputDecoration(hintText: '输入兑换码'),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: _redeem, child: const Text('兑换')),
              ],
            ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Text('开通即表示你同意我们的'),
              TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        const LegalScreen(kind: LegalKind.premiumTerms),
                  ),
                ),
                child: const Text('《会员服务协议》'),
              ),
            ],
          ),
          Text(
            '目前尚未接入真实支付；正式开通后以应用商店或届时接入的支付渠道为准。',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Future<void> _paymentNotice() => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('暂未开放真实支付'),
      content: const Text('After Zero 还未上架应用商店，支付功能尚未接入。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('知道了'),
        ),
      ],
    ),
  );

  void _redeem() {
    if (_code.text.trim() != '0000') {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('兑换码无效')));
      return;
    }
    ref
        .read(premiumProvider.notifier)
        .set(
          Premium(
            premium: PremiumInfo(
              method: 'redeemed',
              at: DateTime.now().toIso8601String(),
            ),
          ),
        );
    _code.clear();
    setState(() => _redeemOpen = false);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('兑换成功，已解锁 Premium')));
  }
}

class _Feature extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const _Feature({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(title),
    subtitle: Text(subtitle),
  );
}
