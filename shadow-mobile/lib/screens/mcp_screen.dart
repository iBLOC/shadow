import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/telencephalon_provider.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import '../generated/l10n/app_localizations.dart';

/// MCP 页的状态 —— ⚠️ **三态**：「读不到」与「真的没有」必须分开。
///
/// 旧版这一页写的是**本地 SQLite 死表**（`mcp_servers`）：界面上
/// 「添加成功」，端脑从来不知道 —— 典型的「失败长得像成功」。
/// ⇒ 现在与桌面端**同一套接口、同一份数据**：清单、添加、启停、删除
/// 全走端脑 admin 面（`telencephalon_client.dart` 里那批早已落链的
/// 方法；`createMcpServer` 本刀补上了 http transport 形状）。
class MCPState {
  final List<Map<String, dynamic>> servers;
  final bool isLoading;
  /// **读不到**的原因（连不上 / 被门挡住 / 形状不对）。
  final String? error;

  const MCPState({
    this.servers = const [],
    this.isLoading = false,
    this.error,
  });

  MCPState copyWith({
    List<Map<String, dynamic>>? servers,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return MCPState(
      servers: servers ?? this.servers,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class MCPNotifier extends StateNotifier<MCPState> {
  final TelencephalonClient _client;

  MCPNotifier(this._client) : super(const MCPState()) {
    loadServers();
  }

  Future<void> loadServers() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final servers = await _client.listMcpServers();
      state = state.copyWith(servers: servers, isLoading: false);
    } catch (e) {
      // ⚠️ **读不到 ≠ 没有** —— 原因必须留着给界面说真话。
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 添加一台 http MCP（ha-mcp 就是这个形状）。返回 null = 成功，
  /// 否则是**端脑原话**（调用方拿去显示，不许静默）。
  Future<String?> addHttpServer({
    required String name,
    required String url,
    String? bearer,
    String? description,
  }) async {
    try {
      await _client.createMcpServer(
        name: name,
        description: description,
        transport: {
          'kind': 'http',
          'url': url,
          if (bearer != null && bearer.trim().isNotEmpty)
            'bearer': bearer.trim(),
        },
      );
      await loadServers();
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  /// 开关 = 启动/停止（端脑的真相在 `state` 字段上，不是本地布尔）。
  Future<String?> toggle(Map<String, dynamic> server) async {
    final id = server['id'] as String? ?? '';
    final running = server['state'] == 'running';
    try {
      if (running) {
        await _client.stopMcpServer(id);
      } else {
        await _client.startMcpServer(id);
      }
      await loadServers();
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  Future<String?> deleteServer(String id) async {
    try {
      await _client.deleteMcpServer(id);
      await loadServers();
      return null;
    } catch (e) {
      return e.toString();
    }
  }
}

final mcpNotifierProvider =
    StateNotifierProvider<MCPNotifier, MCPState>((ref) {
      final client = ref.watch(telencephalonClientProvider);
      return MCPNotifier(client);
    });

class MCPScreen extends ConsumerWidget {
  const MCPScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mcpState = ref.watch(mcpNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(AppLocalizations.of(context)!.mcpTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(mcpNotifierProvider.notifier).loadServers(),
          ),
        ],
      ),
      body: mcpState.isLoading
          ? const Center(child: CircularProgressIndicator())
          // 三态纪律：**读不到**画错误，不画空态（「404/连不上」与
          // 「一台都没有」从来是两个事实）。
          : mcpState.error != null
          ? _buildErrorState(context, mcpState.error!)
          : mcpState.servers.isEmpty
          ? _buildEmptyState(context)
          : _buildServerList(context, ref, mcpState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddDialog(context, ref),
        icon: const Icon(Icons.add),
        label: Text(AppLocalizations.of(context)!.mcpAddServer),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, String error) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            AppLocalizations.of(context)!.mcpLoadFailed,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          SelectableText(
            error,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return EmptyState(
      icon: Icons.dns_outlined,
      title: AppLocalizations.of(context)!.mcpEmpty,
      description: AppLocalizations.of(context)!.mcpEmptyHint,
    );
  }

  Widget _buildServerList(
    BuildContext context,
    WidgetRef ref,
    MCPState state,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: state.servers.length,
      itemBuilder: (context, index) {
        final server = state.servers[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ServerCard(server: server),
        );
      },
    );
  }

  void _showAddDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => _AddServerDialog(
        onAdd: (name, url, bearer, description) => ref
            .read(mcpNotifierProvider.notifier)
            .addHttpServer(
              name: name,
              url: url,
              bearer: bearer,
              description: description,
            ),
      ),
    );
  }
}

class _ServerCard extends ConsumerWidget {
  final Map<String, dynamic> server;

  const _ServerCard({required this.server});

  String get _transportLine {
    final t = server['transport'];
    if (t is Map && t['kind'] == 'http') {
      return 'http: ${t['url'] ?? ''}';
    }
    if (t is Map && t['kind'] == 'stdio') {
      return 'stdio: ${t['command'] ?? ''}';
    }
    final wasm = server['wasm'];
    if (wasm is Map) {
      return 'wasm: ${wasm['name'] ?? ''}@${wasm['version'] ?? ''}';
    }
    return '—';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = server['state'] as String? ?? 'stopped';
    final running = state == 'running';
    final lastError = server['last_error'] as String?;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: (running
                        ? AppColors.success
                        : AppColors.darkTextSecondary)
                    .withValues(alpha: 0.2),
                child: Icon(
                  Icons.dns,
                  color: running
                      ? AppColors.success
                      : AppColors.darkTextSecondary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server['name'] as String? ?? '',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      _transportLine,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                    ),
                  ],
                ),
              ),
              Switch(
                // ⚠️ 开关值取自**端脑的 state**（running），不是本地布尔。
                value: running,
                onChanged: (value) async {
                  final error = await ref
                      .read(mcpNotifierProvider.notifier)
                      .toggle(server);
                  // 成功不响（start 是同步跑完握手的，清单已刷新成真相）；
                  // 失败必须出声 —— 端脑原话直接进 SnackBar。
                  if (error != null && context.mounted) {
                    ScaffoldMessenger.of(context).removeCurrentSnackBar();
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(error)));
                  }
                },
                activeThumbColor: AppColors.primary,
              ),
            ],
          ),
          // 启动失败的原因要**看得见**（端脑那半的 last_error 是唯一真相）。
          if (!running && lastError != null && lastError.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                lastError,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                icon: const Icon(Icons.delete, color: Colors.red, size: 18),
                label: Text(
                  AppLocalizations.of(context)!.commonDelete,
                  style: TextStyle(color: Colors.red),
                ),
                onPressed: () => _confirmDelete(context, ref),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.commonConfirmDelete),
        content: Text(
          AppLocalizations.of(context)!.commonDeleteConfirmNamed(
            server['name'] as String? ?? '',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          TextButton(
            onPressed: () async {
              final error = await ref
                  .read(mcpNotifierProvider.notifier)
                  .deleteServer(server['id'] as String? ?? '');
              if (context.mounted) Navigator.pop(dialogContext);
              if (error != null && context.mounted) {
                ScaffoldMessenger.of(context).removeCurrentSnackBar();
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(error)));
              }
            },
            child: Text(
              AppLocalizations.of(context)!.commonDelete,
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }
}

/// 添加对话框 —— 桌面 MCPPage 模板的移动端同口径：
/// 「Home Assistant · ha-mcp」只是**预填**（transport=http、名称
/// ha-mcp、两条提示文案），字段全部可改；URL 不猜（secret URL 每台
/// 实例唯一），空 URL 不许提交（不盲发）。
class _AddServerDialog extends StatefulWidget {
  /// 返回 null = 成功；否则是端脑原话（界面显示，不许静默）。
  final Future<String?> Function(
    String name,
    String url,
    String? bearer,
    String? description,
  )
  onAdd;

  const _AddServerDialog({required this.onAdd});

  @override
  State<_AddServerDialog> createState() => _AddServerDialogState();
}

class _AddServerDialogState extends State<_AddServerDialog> {
  final _nameController = TextEditingController();
  final _urlController = TextEditingController();
  final _tokenController = TextEditingController();

  bool _haMcp = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // ⚠️ 输入框是 controller 驱动的 —— 不挂监听的话打字**不触发重建**，
    // 「URL 空 ⇒ 禁用」的钮永远不会解禁（widget 测试抓到的）。
    _nameController.addListener(_sync);
    _urlController.addListener(_sync);
    _tokenController.addListener(_sync);
  }

  void _sync() => setState(() {});

  @override
  void dispose() {
    _nameController.dispose();
    _urlController.dispose();
    _tokenController.dispose();
    super.dispose();
  }

  void _selectTemplate(bool haMcp) {
    setState(() {
      _haMcp = haMcp;
      if (haMcp && _nameController.text.isEmpty) {
        _nameController.text = 'ha-mcp';
      }
    });
  }

  bool get _canSubmit =>
      !_submitting &&
      _nameController.text.trim().isNotEmpty &&
      _urlController.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return AlertDialog(
      title: Text(l10n.mcpAddServerTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Wrap 而非 Row：对话框在窄屏上比屏幕窄 ⇒ 一行装不下
            // 「模板 + 两个 chip」会溢出（widget 测试里真爆过一次）。
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(l10n.mcpTemplateLabel),
                ChoiceChip(
                  label: Text(l10n.mcpTemplateCustom),
                  selected: !_haMcp,
                  onSelected: (_) => _selectTemplate(false),
                ),
                ChoiceChip(
                  label: const Text('Home Assistant · ha-mcp'),
                  selected: _haMcp,
                  onSelected: (_) => _selectTemplate(true),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: l10n.commonName,
                border: OutlineInputBorder(),
                hintText: 'my-mcp-server',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                labelText: l10n.mcpServerUrl,
                border: OutlineInputBorder(),
                hintText: _haMcp
                    ? l10n.mcpHaMcpUrlPlaceholder
                    : 'http://localhost:3000/mcp',
              ),
            ),
            if (_haMcp) ...[
              const SizedBox(height: 8),
              Text(l10n.mcpHaMcpUrlHint, style: TextStyle(fontSize: 12)),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _tokenController,
              decoration: InputDecoration(
                labelText: l10n.mcpAuthTokenOptional,
                border: OutlineInputBorder(),
                hintText: 'Bearer token',
              ),
              obscureText: true,
            ),
            if (_haMcp) ...[
              const SizedBox(height: 8),
              Text(l10n.mcpHaMcpBearerHint, style: TextStyle(fontSize: 12)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.cancel),
        ),
        FilledButton(
          onPressed: _canSubmit
              ? () async {
                  setState(() => _submitting = true);
                  final error = await widget.onAdd(
                    _nameController.text.trim(),
                    _urlController.text.trim(),
                    _tokenController.text.trim().isEmpty
                        ? null
                        : _tokenController.text.trim(),
                    _haMcp ? l10n.mcpHaMcpDescription : null,
                  );
                  if (!context.mounted) return;
                  if (error == null) {
                    Navigator.pop(context);
                  } else {
                    setState(() => _submitting = false);
                    ScaffoldMessenger.of(context).removeCurrentSnackBar();
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(error)));
                  }
                }
              : null,
          child: Text(l10n.commonAdd),
        ),
      ],
    );
  }
}
