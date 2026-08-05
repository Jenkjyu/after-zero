// 主题——⚠️这一轮UI搭建的目标是功能对等，不是逐像素复刻vanilla那套CSS设计系统(石墨hero卡/
// 磨砂玻璃/精心调过的elevation分级)。那套视觉语言是CSS写的，跟Flutter的Material渲染模型
// 不是同一套东西，逐一复刻的工作量接近另开一个"视觉重制"项目，不属于这次重写的范围——这次
// 重写要解决的是WebView依赖和跨平台，不是重新设计App长什么样。这里用Material 3的标准组件
// + App品牌色（跟vanilla `--accent` 同一个色值，深墨绿#18453B），做到"干净、看得懂、复用
// Material内置的间距/层级规范"，细节打磨留到功能对等之后再单独决定要不要做、做到什么程度。
import 'package:flutter/material.dart';

const brandSeedColor = Color(0xFF18453B);

ThemeData buildAppTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: brandSeedColor,
    brightness: brightness,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: scheme.surface,
  );
}

/// 三档利率颜色——对应calc.dart的rateClass()(rate-hi/mid/lo)，跟vanilla`.tag.rate-hi/mid/lo`
/// 是同一套语义分档，具体色值不强求跟CSS里的十六进制值完全一致。
Color rateClassColor(String rateClass, ColorScheme scheme) {
  switch (rateClass) {
    case 'rate-hi':
      return Colors.redAccent;
    case 'rate-mid':
      return Colors.orangeAccent;
    default:
      return scheme.primary;
  }
}
