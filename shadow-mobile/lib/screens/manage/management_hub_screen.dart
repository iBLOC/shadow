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
      // ⚠️ 头部与底 tab **同名同源** —— 用户点的是「能力」tab（agent-surface
      // 单一真源，经 gen_nav 生成），落地页头部若写死 l10n.manage（「管理」）
      // ⇒ 两处两个名字 ⇒ 用户以为自己点错了地方。navLabel 保证这页改名时
      // tab 与头部永远一起改。
      appBar: GlassAppBar(
        title: navLabel(l10n, 'nav.tab.capability'),
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
            // ⚠️ **整页只有一条滚动物** —— 原来只有 Expanded 里的 grid 可
            // 滚，「默认模型」首卡（单选列表 ＋ 分档默认下拉）钉在 Column
            // 固定区：云供应商一多首卡比一屏还高 ⇒ 固定区溢出、grid 被压
            // 到 0 ⇒ 整页滚不动（真机 MIX 4 实测）。改成 slivers：首卡与
            // 卡片格子住在同一条 CustomScrollView 里，滚的是整页。
            child: CustomScrollView(
              // AlwaysScrollable：内容不足一屏时下拉刷新也要活着。
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList.list(
                    children: const [
                      // 「默认模型」首卡 —— 大脑用哪个模型回答，能力 tab
                      // 落地首屏就能设（原来埋在 设置→连接→嵌入式大脑 里
                      // ⇒ 用户找不到 ⇒「无处设置默认模型」）。
                      DefaultModelCard(),
                      SizedBox(height: 16),
                    ],
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  sliver: SliverGrid(
                    // maxCrossAxisExtent 而非固定 crossAxisCount：手机上
                    // 仍是 2 列（≈390dp 宽），折叠屏展开（≈700dp）自动
                    // 变 3 列。
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                          maxCrossAxisExtent: 260,
                          mainAxisSpacing: 16,
                          crossAxisSpacing: 16,
                          childAspectRatio: 1.2,
                        ),
                    delegate: SliverChildListDelegate(
                      _buildCards(context, hubState, l10n),
                    ),
                  ),
                ),
              ],
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

  /// hub 的卡片清单（body 里 SliverGrid 的格子）。
  List<Widget> _buildCards(
    BuildContext context,
    HubState hubState,
    AppLocalizations l10n,
  ) {
    return [
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
    ];
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
