import 'dart:math' as math;

import 'package:flutter/material.dart';

/// 折叠屏 / 平板适配的断点真相源 —— 全 App 只在这里定义一次。
///
/// Material 3 窗口档：compact < 600dp / medium 600–840 / expanded ≥ 840。
/// Galaxy Z Fold5 展开后逻辑宽 ≈ 690–725dp，落在 **medium** 档；
/// 阈值取 600 才能吃到展开态（取 840 会错过），外屏 ≈ 300dp 与普通手机
/// （MIX4 ≈ 393dp）仍走 compact 的底部导航。
const double kWideBreakpoint = 600;

/// 是否处于宽屏（折叠屏展开 / 平板）形态。
bool isWideScreen(BuildContext context) =>
    MediaQuery.sizeOf(context).width >= kWideBreakpoint;

/// 宽屏下聊天内容的最大逻辑宽 —— 列表 / 输入条居中，不拉满整屏。
const double kContentMaxWidth = 720;

/// 气泡宽度 = 屏宽 × [fraction]，但不超过 [cap]（逻辑像素）。
///
/// 手机上分数宽度就是想要的形状；折叠屏展开后屏宽 ≈ 700dp，
/// 0.9 × 700 = 630dp 的气泡没法读 —— 绝对上限兜住它。
double cappedBubbleWidth(
  BuildContext context, {
  required double fraction,
  required double cap,
}) => math.min(MediaQuery.sizeOf(context).width * fraction, cap);
