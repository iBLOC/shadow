import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../generated/l10n/app_localizations.dart';
import '../../theme/app_colors.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/glass_app_bar.dart';
import '../../services/prefrontal_client.dart';

class ManagementHubScreen extends ConsumerWidget {
  const ManagementHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hubState = ref.watch(hubNotifierProvider);

    return Scaffold(
      appBar: GlassAppBar(
        title: l10n.manage,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(hubNotifierProvider.notifier).loadAllCounts(),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.darkGradient : AppColors.lightGradient,
        ),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () =>
                ref.read(hubNotifierProvider.notifier).loadAllCounts(),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                childAspectRatio: 1.2,
                children: [
                  _ManagementCard(
                    icon: Icons.business,
                    title: l10n.providers,
                    subtitle: hubState.isLoading
                        ? '...'
                        : '${hubState.providerCount} active',
                    onTap: () => context.push('/manage/providers'),
                  ),
                  _ManagementCard(
                    icon: Icons.inventory_2,
                    title: l10n.models,
                    subtitle: hubState.isLoading ? '...' : 'local',
                    onTap: () => context.push('/manage/models'),
                  ),
                  _ManagementCard(
                    icon: Icons.integration_instructions,
                    title: l10n.mcp,
                    subtitle: hubState.isLoading
                        ? '...'
                        : '${hubState.mcpServerCount} servers',
                    onTap: () => context.push('/manage/mcp'),
                  ),
                  _ManagementCard(
                    icon: Icons.psychology,
                    title: l10n.skills,
                    subtitle: hubState.isLoading
                        ? '...'
                        : '${hubState.skillCount} active',
                    onTap: () => context.push('/manage/skills'),
                  ),
                  _ManagementCard(
                    icon: Icons.smart_toy,
                    title: l10n.agents,
                    subtitle: hubState.isLoading
                        ? '...'
                        : '${hubState.agentCount} online',
                    onTap: () => context.push('/manage/agents'),
                  ),
                  _ManagementCard(
                    icon: Icons.memory,
                    title: l10n.memory,
                    subtitle: hubState.isLoading
                        ? '...'
                        : '${hubState.memoryCount} docs',
                    onTap: () => context.push('/manage/memory'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ManagementCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ManagementCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 32, color: AppColors.primary),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
