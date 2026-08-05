import 'package:flutter/material.dart';

import '../account/account_screen.dart';

enum LegalKind { privacy, agreement, premiumTerms }

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('关于我们')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 8),
        const Icon(Icons.savings_outlined, size: 68),
        const SizedBox(height: 10),
        Text(
          'After Zero',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const Text('版本 1.0.0', textAlign: TextAlign.center),
        const SizedBox(height: 24),
        const Card(
          child: ListTile(
            leading: Icon(Icons.mail_outline),
            title: Text('联系邮箱'),
            subtitle: SelectableText('jenkjyu36@outlook.com'),
          ),
        ),
        const SizedBox(height: 12),
        _RouteTile(
          title: '隐私政策',
          subtitle: '我们如何收集、使用与保护你的信息',
          route: const LegalScreen(kind: LegalKind.privacy),
        ),
        _RouteTile(
          title: '用户服务协议',
          subtitle: '使用本产品前应了解的权利与义务',
          route: const LegalScreen(kind: LegalKind.agreement),
        ),
        _RouteTile(
          title: '会员服务协议',
          subtitle: 'Premium 购买、退款与账号规则',
          route: const LegalScreen(kind: LegalKind.premiumTerms),
        ),
        const SizedBox(height: 12),
        _RouteTile(
          title: '账户与登录信息',
          subtitle: '查看我们从微信账号获取的信息',
          route: const AccountScreen(),
        ),
      ],
    ),
  );
}

class _RouteTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget route;
  const _RouteTile({
    required this.title,
    required this.subtitle,
    required this.route,
  });
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () =>
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => route)),
    ),
  );
}

class LegalScreen extends StatelessWidget {
  final LegalKind kind;
  const LegalScreen({super.key, required this.kind});

  @override
  Widget build(BuildContext context) {
    final document = _documents[kind]!;
    return Scaffold(
      appBar: AppBar(title: Text(document.$1)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 36),
        children: [
          Text('更新日期：2026年8月', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          for (final section in document.$2) ...[
            Text(
              section.$1,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 7),
            SelectableText(section.$2, style: const TextStyle(height: 1.65)),
            const SizedBox(height: 18),
          ],
        ],
      ),
    );
  }
}

final _documents = <LegalKind, (String, List<(String, String)>)>{
  LegalKind.privacy: (
    '隐私政策',
    [
      (
        '一、我们处理哪些信息',
        '债务记录、还款计划、档案文件和通知设置默认仅保存在您的设备本地。微信登录时，我们会取得微信返回的用户标识、昵称和头像，用于建立账户。您主动创建云备份时，相应债务、设置和档案会上传至云端；使用 AI 债务助手时，您的问题和结构化债务摘要会发送给 AI 服务生成回复。',
      ),
      (
        '二、权限与设备能力',
        '网络权限用于登录、云备份和 AI；通知权限用于还款提醒；文件访问能力仅在您主动导入、导出或保存档案时使用。我们不会在后台扫描您的相册或其他文件。',
      ),
      (
        '三、保存与保护',
        '本地数据由设备系统保护。云备份按您的账户隔离，并通过已认证的云函数访问；您可以逐条删除备份，也可以注销账户并清除服务器上的账户及云备份。AI 对话历史保存在本机，服务器不将其作为聊天记录长期保存，但服务运行日志可能按云平台规则短期留存。',
      ),
      (
        '四、第三方处理',
        '本产品使用腾讯云开发提供身份认证、云函数、云存储和 AI 生成服务。只有在您主动使用对应功能时，完成服务所必需的数据才会传输给相应服务方。',
      ),
      (
        '五、您的权利与联系我们',
        '您可以在应用内查看、更正和删除本地数据，删除云备份，或注销账户。如需咨询隐私问题，请联系 jenkjyu36@outlook.com。',
      ),
    ],
  ),
  LegalKind.agreement: (
    '用户服务协议',
    [
      (
        '一、服务说明',
        'After Zero 是个人债务记录和计划工具，提供债务台账、还款提醒、统计分析、模拟测算，以及 Premium 会员专属的云备份、AI 债务助手和报表导出等能力。',
      ),
      (
        '二、账户与数据',
        '您应妥善保管自己的设备和微信账户，并保证录入信息合法。默认情况下用户内容只保存在设备本地；只有您主动使用云备份或 AI 功能时，相关数据才会经过服务器。恢复备份会整体覆盖本机数据，请在确认后操作。',
      ),
      ('三、使用规范', '不得利用本产品从事违法活动、攻击服务、绕过访问限制或侵害他人权益。我们可能对危害服务安全或违反法律的行为采取限制措施。'),
      (
        '四、重要提示',
        '本产品的还款计划、利率反推、模拟测算和 AI 分析仅供参考，不构成财务、法律或投资建议。银行或平台的实际账单与合同约定优先，您应结合自身情况独立判断。',
      ),
      (
        '五、变更与联系',
        '服务内容和协议可能随产品发展依法更新，重要变更会在应用内说明。如有问题，请联系 jenkjyu36@outlook.com。',
      ),
    ],
  ),
  LegalKind.premiumTerms: (
    '会员服务协议',
    [
      (
        '一、会员权益',
        'Premium 是目前唯一的付费会员等级，包含云备份、AI 债务助手、多策略对比规划和高级报表导出等权益，具体以购买时应用内展示为准。',
      ),
      (
        '二、购买与价格',
        '当前版本尚未开放真实支付，页面价格仅作产品展示。正式接入后，价格、扣款方式和退款规则以届时的应用商店或支付渠道页面为准。兑换码应通过官方认可渠道取得。',
      ),
      (
        '三、账号与设备',
        '会员权益与登录账户关联，不得转售、出租或通过技术手段绕过校验。注销账户会同时终止该账户的云端数据和相关权益，请谨慎操作。',
      ),
      (
        '四、服务调整',
        'AI 和云存储会持续产生服务成本，我们可能在合理范围内调整使用额度、模型或功能范围，并对重大变化提前说明；已经明确承诺的买断权益不会无故失效。',
      ),
    ],
  ),
};
