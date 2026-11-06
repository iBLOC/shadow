import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../navigation/nav.g.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../theme/app_colors.dart';
import '../../widgets/brain/default_model_card.dart';
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
            onPressed: () => _refreshAll(context, ref),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.darkGradient : AppColors.lightGradient,
        ),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () => _refreshAll(context, ref),
            child: Padding(
              padding: const EdgeInsets.all(16),
              // 「默认模型」首卡 —— 大脑用哪个模型回答，能力 tab 落地首屏
              // 就能设（原来埋在 设置→连接→嵌入式大脑 里 ⇒ 用户找不到
              // ⇒「无处设置默认模型」）。
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const DefaultModelCard(),
                  const SizedBox(height: 16),
                  Expanded(child: _buildCardGrid(context, hubState, l10n)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// 刷新 hub 计数 ＋ 默认模型卡的目录（直读大脑，失败在卡片里说真话）。
  Future<void> _refreshAll(BuildContext context, WidgetRef ref) async {
    await ref.read(hubNotifierProvider.notifier).loadAllCounts();
    ref.invalidate(brainProviderOptionsProvider);
  }

  Widget _buildCardGrid(
    BuildContext context,
    HubState hubState,
    AppLocalizations l10n,
  ) {
    // maxCrossAxisExtent 而非固定 crossAxisCount：手机上仍是
    // 2 列（≈390dp 宽），折叠屏展开（≈700dp）自动变 3 列。
    return GridView(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 260,
        mainAxisSpacing: 16,
        crossAxisSpacing: 16,
        childAspectRatio: 1.2,
      ),
      children: [
        _ManagementCard(
          icon: Icons.business,
          title: l10n.providers,
          // ⚠️ **「读不到」不能显示成「0」** —— 端脑没起来 / 钥匙不对 /
          // 地址不对，三种情况都会让这个数取不到 ⇒ ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.providerError != null
                    ? l10n.unknown
                    : '${hubState.providerCount} active'),
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
          // ⚠️ **「读不到」不能显示成「0」** —— 端脑没起来 / 钥匙不对 /
          // 地址不对，三种情况都会让这个数取不到 ⇒ ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.mcpError != null
                    ? l10n.unknown
                    : '${hubState.mcpServerCount} servers'),
          onTap: () => context.push('/manage/mcp'),
        ),
        _ManagementCard(
          icon: Icons.psychology,
          title: l10n.skills,
          // ⚠️ **「读不到」不能显示成「0」** —— 端脑没起来 / 钥匙不对 /
          // 地址不对，三种情况都会让这个数取不到 ⇒ ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.skillError != null
                    ? l10n.unknown
                    : '${hubState.skillCount} active'),
          onTap: () => context.push('/manage/skills'),
        ),
        _ManagementCard(
          icon: Icons.smart_toy,
          title: l10n.agents,
          // ⚠️ **「读不到」不能显示成「0」** —— 端脑没起来 / 钥匙不对 /
          // 地址不对，三种情况都会让这个数取不到 ⇒ ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.agentError != null
                    ? l10n.unknown
                    : '${hubState.agentCount} online'),
          onTap: () => context.push('/manage/agents'),
        ),
        _ManagementCard(
          icon: Icons.memory,
          title: l10n.memory,
          // ⚠️ **「读不到」不能显示成「0」** —— 端脑没起来 / 钥匙不对 /
          // 地址不对，三种情况都会让这个数取不到 ⇒ ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.memoryError != null
                    ? l10n.unknown
                    : '${hubState.memoryCount} docs'),
          onTap: () => context.push('/manage/memory'),
        ),
        _ManagementCard(
          icon: Icons.account_tree,
          title: navLabel(l10n, 'surface.flows'),
          // ⚠️ 「读不到」**不能**显示成「0 flows」—— 那看起来像
          // 「真的没有流程」。端脑没起来 / 钥匙不对 / 地址不对，
          // 三种情况都会让这个数取不到 ⇒ 显示「未知」。
          subtitle: hubState.isLoading
              ? '...'
              : (hubState.flowError != null
                    ? l10n.unknown
                    : '${hubState.flowCount} flows'),
          onTap: () => context.push('/flows'),
        ),
      ],
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
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
