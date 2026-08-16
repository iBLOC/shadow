import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

enum StatusType { connected, warning, disconnected }

class StatusIndicator extends StatelessWidget {
  final StatusType status;
  final String? label;
  final double size;

  const StatusIndicator({
    super.key,
    required this.status,
    this.label,
    this.size = 8,
  });

  Color get _color {
    switch (status) {
      case StatusType.connected:
        return AppColors.success;
      case StatusType.warning:
        return AppColors.warning;
      case StatusType.disconnected:
        return AppColors.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: _color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: _color.withValues(alpha: 0.5),
                blurRadius: 4,
                spreadRadius: 1,
              ),
            ],
          ),
        ),
        if (label != null) ...[
          const SizedBox(width: 8),
          Text(label!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ],
    );
  }
}
