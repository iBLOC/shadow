import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../theme/app_colors.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/glass_app_bar.dart';

class ManagementHubScreen extends StatelessWidget {
  const ManagementHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Scaffold(
      appBar: const GlassAppBar(title: 'Manage'),
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppColors.darkGradient : AppColors.lightGradient,
        ),
        child: SafeArea(
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
                  title: 'Providers',
                  subtitle: '3 active',
                  onTap: () => context.push('/manage/providers'),
                ),
                _ManagementCard(
                  icon: Icons.inventory_2,
                  title: 'Models',
                  subtitle: '3 local',
                  onTap: () => context.push('/manage/models'),
                ),
                _ManagementCard(
                  icon: Icons.integration_instructions,
                  title: 'MCP',
                  subtitle: '2 servers',
                  onTap: () => context.push('/manage/mcp'),
                ),
                _ManagementCard(
                  icon: Icons.psychology,
                  title: 'Skills',
                  subtitle: '5 active',
                  onTap: () => context.push('/manage/skills'),
                ),
                _ManagementCard(
                  icon: Icons.smart_toy,
                  title: 'Agents',
                  subtitle: '4 online',
                  onTap: () => context.push('/manage/agents'),
                ),
                _ManagementCard(
                  icon: Icons.memory,
                  title: 'Memory',
                  subtitle: '128 docs',
                  onTap: () => context.push('/manage/memory'),
                ),
              ],
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
          Icon(
            icon,
            size: 32,
            color: AppColors.primary,
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
