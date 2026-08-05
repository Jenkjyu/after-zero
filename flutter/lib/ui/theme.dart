// 全局视觉基线——与旧版www/index.html的设计token对齐。
// Flutter不是WebView，控件不可能自动继承旧CSS；所有Material组件都从这里收敛到同一套
// 雾灰背景、石墨绿强调色、白色渐变卡片与低对比描边，避免默认Material 3外观混入App。
import 'package:flutter/material.dart';

const brandSeedColor = Color(0xFF18453B);

ThemeData buildAppTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final background = dark ? const Color(0xFF0F1319) : const Color(0xFFE7EAEF);
  final surface = dark ? const Color(0xFF24282F) : Colors.white;
  final surface2 = dark ? const Color(0xFF2E3239) : const Color(0xFFEFF1F6);
  final text = dark ? const Color(0xFFE4E8EF) : const Color(0xFF23272F);
  final muted = dark ? const Color(0xFF98A0B0) : const Color(0xFF656C7E);
  final border = dark ? const Color(0xFF3C4047) : const Color(0xFFCED2DB);
  final accent = dark ? const Color(0xFF6FBE9E) : brandSeedColor;
  final scheme = ColorScheme.fromSeed(
    seedColor: accent,
    brightness: brightness,
  ).copyWith(
    primary: accent,
    onPrimary: dark ? const Color(0xFF0E2119) : Colors.white,
    secondary: accent,
    onSecondary: dark ? const Color(0xFF0E2119) : Colors.white,
    surface: surface,
    onSurface: text,
    surfaceContainerHighest: surface2,
    onSurfaceVariant: muted,
    outline: border,
    error: dark ? const Color(0xFFEE7B7B) : const Color(0xFFBE3A3A),
  );
  final roundedCard = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(18),
    side: BorderSide(color: border.withValues(alpha: dark ? 1 : .55)),
  );

  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: background,
    cardTheme: CardThemeData(
      color: surface,
      shadowColor: Colors.black.withValues(alpha: dark ? .28 : .10),
      elevation: 2,
      margin: EdgeInsets.zero,
      shape: roundedCard,
    ),
    // 旧版所有页面都落在同一张雾灰渐变画布上；不让子页重新长出
    // Material 默认的白色顶栏，滚动时也不添加另一层表面色。
    appBarTheme: AppBarTheme(
      backgroundColor: background,
      surfaceTintColor: Colors.transparent,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: text,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      iconTheme: IconThemeData(color: muted),
    ),
    dividerTheme: DividerThemeData(color: border.withValues(alpha: .7)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface2,
      contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: accent, width: 2),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      elevation: 8,
      // 旧版底栏只切换描边/实心图标，没有Material 3的胶囊选中底。
      indicatorColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected) ? accent : muted,
          fontSize: 11,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected) ? accent : muted,
          size: 23,
        ),
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      modalBackgroundColor: surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: dark ? const Color(0xFF333B45) : const Color(0xFF253039),
      contentTextStyle: const TextStyle(color: Colors.white),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

/// 三档利率颜色——与旧版rate-hi/mid/lo对应。
Color rateClassColor(String rateClass, ColorScheme scheme) {
  switch (rateClass) {
    case 'rate-hi':
      return scheme.error;
    case 'rate-mid':
      return const Color(0xFFA66A0A);
    default:
      return scheme.primary;
  }
}
