import 'package:flutter/material.dart';

/// 旧版"左滑露出操作按钮"的手势复刻：滑动露出一条固定宽度的操作条（默认 76px，
/// 与旧版 DEBT_REVEAL/PAY_REVEAL 一致），松手时按"是否越过一半"决定开/合；
/// 打开状态下点按钮执行动作。替代 Dismissible 那种"滑过阈值直接触发"的默认行为。
class SwipeReveal extends StatefulWidget {
  final Widget child;
  final String actionLabel;
  final Color actionColor;
  final VoidCallback onAction;
  final bool open;
  final ValueChanged<bool> onOpenChanged;
  final double revealWidth;
  final double? borderRadius;

  const SwipeReveal({
    super.key,
    required this.child,
    required this.actionLabel,
    required this.actionColor,
    required this.onAction,
    required this.open,
    required this.onOpenChanged,
    this.revealWidth = 76,
    this.borderRadius,
  });

  @override
  State<SwipeReveal> createState() => _SwipeRevealState();
}

class _SwipeRevealState extends State<SwipeReveal> {
  double _dragOffset = 0;
  bool _dragging = false;

  @override
  void didUpdateWidget(covariant SwipeReveal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.open && !_dragging) _dragOffset = 0;
  }

  void _update(double delta) {
    setState(() {
      _dragging = true;
      _dragOffset = (_dragOffset + delta)
          .clamp(-widget.revealWidth, 0)
          .toDouble();
    });
  }

  void _end() {
    final shouldOpen = _dragOffset < -widget.revealWidth / 2;
    setState(() {
      _dragging = false;
      _dragOffset = shouldOpen ? -widget.revealWidth : 0;
    });
    widget.onOpenChanged(shouldOpen);
  }

  @override
  Widget build(BuildContext context) {
    final offset = _dragging
        ? _dragOffset
        : widget.open
        ? -widget.revealWidth
        : 0.0;
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.borderRadius ?? 16),
      child: Stack(
        children: [
          Positioned.fill(
            child: Align(
              alignment: Alignment.centerRight,
              child: Container(
                width: widget.revealWidth,
                color: widget.actionColor,
                child: InkWell(
                  onTap: widget.onAction,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.check_circle_outline,
                        color: Colors.white,
                        size: 20,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.actionLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          AnimatedContainer(
            duration: _dragging
                ? Duration.zero
                : const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            transform: Matrix4.translationValues(offset, 0, 0),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onHorizontalDragUpdate: (details) => _update(details.delta.dx),
              onHorizontalDragEnd: (_) => _end(),
              onHorizontalDragCancel: _end,
              onTap: widget.open
                  ? () => widget.onOpenChanged(false)
                  : null,
              child: widget.child,
            ),
          ),
        ],
      ),
    );
  }
}
