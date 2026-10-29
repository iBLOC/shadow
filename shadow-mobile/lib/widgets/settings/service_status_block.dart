import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/service_provider.dart';
import '../../theme/app_tokens.g.dart';
import 'settings_row.dart';

/// 服务状态 —— 哪些后端服务活着、延迟多少。
///
/// 原来是一张卡里的 4 个平铺 `ListTile`，现在收成一块，行内自带状态徽标。
class ServiceStatusBlock extends ConsumerStatefulWidget {
  const ServiceStatusBlock({super.key});

  @override
  ConsumerState<ServiceStatusBlock> createState() => _ServiceStatusBlockState();
}

class _ServiceStatusBlockState extends ConsumerState<ServiceStatusBlock> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(serviceProvider.notifier).checkAll();
    });
  }

  @override
  Widget build(BuildContext context) {
    final services = ref.watch(serviceProvider);
    final theme = ShadTheme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < services.length; i++) ...[
          if (i > 0)
            const ShadSeparator.horizontal(
              margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
            ),
          _ServiceStatusRow(service: services[i], theme: theme),
        ],
      ],
    );
  }
}

class _ServiceStatusRow extends StatelessWidget {
  final ServiceInfo service;
  final ShadThemeData theme;

  const _ServiceStatusRow({required this.service, required this.theme});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    final (icon, color, label) = switch (service.status) {
      ServiceStatus.healthy => (
        Icons.check_circle,
        AppTokens.statusSuccess,
        l10n.healthy,
      ),
      ServiceStatus.offline => (
        Icons.cancel,
        AppTokens.statusError,
        l10n.offline,
      ),
      ServiceStatus.checking => (
        Icons.sync,
        AppTokens.statusWarning,
        l10n.checking,
      ),
      ServiceStatus.unhealthy => (
        Icons.error,
        AppTokens.statusError,
        l10n.unhealthy,
      ),
      ServiceStatus.unknown => (
        Icons.help,
        theme.colorScheme.mutedForeground,
        l10n.unknown,
      ),
    };

    return SettingsRow(
      dense: true,
      title: service.displayName,
      subtitle: service.error ?? '${service.host}:${service.port}',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (service.latencyMs != null &&
              service.status == ServiceStatus.healthy)
            Text(
              '${service.latencyMs}ms',
              style: theme.textTheme.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          const SizedBox(width: AppTokens.spaceSm),
          Icon(icon, size: 16, color: color),
          const SizedBox(width: AppTokens.spaceXs),
          Text(label, style: theme.textTheme.small.copyWith(color: color)),
        ],
      ),
    );
  }
}
