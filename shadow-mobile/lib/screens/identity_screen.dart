import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/identity_provider.dart';
import '../theme/app_tokens.g.dart';
import '../widgets/glass_app_bar.dart';
import '../widgets/settings/settings_row.dart';

/// 「当前是谁」—— 以及**把这台设备变成另一个人**。
///
/// ## 这一页在干什么
///
/// 端脑持有**账号级身份**：账号密钥派生出 principal（人）与默认人格
/// （记忆的隔离单元）⇒ 两台设备导入同一个账号之后，它们是**同一个人**、
/// 写进**同一份记忆**。
///
/// 这一页给出搬运这个账号的两条路：
///
/// - **导出** —— 把账号密钥拿出来，拿到另一台设备导入；
/// - **导入** —— 把另一台设备导出的码贴进来，这台设备从此是那个人。
///
/// ## ⚠️ 导出的是身份本身
///
/// 账号密钥像密码管理器的恢复码：**持有它的人就是那个人**（记忆也归
/// 那个人）。所以：
///
/// - 导出**不走端脑的 HTTP 面** —— 那张面在 loopback 上，能连上它就
///   意味着「本机任意进程」，把账号密钥放到那儿等于把身份发出去；
/// - 导出的码默认**不显示**，要用户点了才亮出来 —— 它不该出现在
///   截屏、录屏或者别人的肩膀后面。
class IdentityScreen extends ConsumerStatefulWidget {
  const IdentityScreen({super.key});

  @override
  ConsumerState<IdentityScreen> createState() => _IdentityScreenState();
}

class _IdentityScreenState extends ConsumerState<IdentityScreen> {
  /// 导出的码 —— 默认 null（不显示）。用户点了「导出」才出现。
  String? _exportedCode;

  /// 正在做导出/导入。
  bool _busy = false;

  /// 导入用的输入框。
  final _importController = TextEditingController();

  /// 一次性提示（成功/失败）。
  String? _message;

  @override
  void initState() {
    super.initState();
    // 打开这一页就**重新问一次**端脑。
    //
    // 这一页是「我是谁」的唯一真相出口 —— 启动时那一次解析如果超时了
    // （大脑冷启动要十几秒，而单次解析有 15 秒上界），页面就会一直显示
    // 「背后没有人」，而端脑其实答得好好的。⇒ 进来就重问一次。
    //
    // ⚠️ 失败**不**降级：`resolve()` 连不上时保持当前租户，不会把已经
    // 解析出来的身份清掉。
    ref.read(identityProvider.notifier).resolve(force: true);
  }

  @override
  void dispose() {
    _importController.dispose();
    super.dispose();
  }

  Future<void> _export() async {
    setState(() {
      _busy = true;
      _message = null;
    });
    final code = await ref.read(identityProvider.notifier).exportAccount();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _exportedCode = code;
      _message = code == null
          ? currentL10nOf(context).identityExportFailed
          : null;
    });
  }

  Future<void> _copyCode() async {
    final code = _exportedCode;
    if (code == null) return;
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(currentL10nOf(context).identityCopied)),
    );
  }

  Future<void> _import() async {
    final code = _importController.text.trim();
    if (code.isEmpty) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    final tenant =
        await ref.read(identityProvider.notifier).importAccount(code);
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (tenant == null) {
        _message = currentL10nOf(context).identityImportFailed;
      } else {
        _importController.clear();
        _exportedCode = null;
        _message = currentL10nOf(context).identityImportDone;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final identity = ref.watch(identityProvider);
    final theme = ShadTheme.of(context);

    return Scaffold(
      appBar: const GlassAppBar(title: ''),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppTokens.spaceLg),
          children: [
            // ── 我是谁 ───────────────────────────────────────────
            SettingsGroup(
              title: l10n.identityCurrentTitle,
              description: l10n.identityCurrentDesc,
              icon: Icons.person_outline,
              children: [
                SettingsBlock(
                  children: [
                    _InfoRow(
                      label: l10n.identityPrincipal,
                      value: identity.principal ?? l10n.identityNobody,
                    ),
                    _InfoRow(
                      label: l10n.identityPersona,
                      value: identity.persona ?? l10n.identityNobody,
                    ),
                    _InfoRow(
                      label: l10n.identityDevice,
                      value: identity.device ?? l10n.identityNobody,
                    ),
                    _InfoRow(
                      label: l10n.identityTenant,
                      value: identity.tenantId,
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: AppTokens.spaceLg),

            // ── 提示（成功/失败）───────────────────────────────
            //
            // ⚠️ 放在**第一屏**，不是页面最底下 —— 反馈要立刻看得见，
            // 而且 ListView 是懒加载的：放在最底下时它可能压根没被构建。
            if (_message != null) ...[
              Text(
                _message!,
                style: theme.textTheme.small.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
              const SizedBox(height: AppTokens.spaceXl),
            ],

            // ── 导出 ─────────────────────────────────────────────
            SettingsGroup(
              title: l10n.identityExportTitle,
              description: l10n.identityExportDesc,
              icon: Icons.logout,
              children: [
                SettingsBlock(
                  children: [
                    _ActionRow(
                      title: l10n.identityExportAction,
                      subtitle: l10n.identityExportActionDesc,
                      busy: _busy,
                      onTap: _export,
                    ),
                    if (_exportedCode != null) ...[
                      _CodeBlock(
                        code: _exportedCode!,
                        onCopy: _copyCode,
                      ),
                    ],
                  ],
                ),
              ],
            ),

            const SizedBox(height: AppTokens.spaceXl),

            // ── 导入 ─────────────────────────────────────────────
            SettingsGroup(
              title: l10n.identityImportTitle,
              description: l10n.identityImportDesc,
              icon: Icons.login,
              children: [
                SettingsBlock(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppTokens.spaceLg,
                        vertical: AppTokens.spaceMd,
                      ),
                      child: TextField(
                        controller: _importController,
                        enabled: !_busy,
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: InputDecoration(
                          hintText: l10n.identityImportPlaceholder,
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                        onSubmitted: (_) => _import(),
                      ),
                    ),
                    _ActionRow(
                      title: l10n.identityImportAction,
                      subtitle: l10n.identityImportActionDesc,
                      busy: _busy,
                      onTap: _import,
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 一行「标签 —— 值」。
class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTokens.spaceLg,
        vertical: AppTokens.spaceSm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: theme.textTheme.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: theme.textTheme.small.copyWith(
                color: theme.colorScheme.foreground,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 一个可点的动作行。
class _ActionRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool busy;
  final VoidCallback onTap;

  const _ActionRow({
    required this.title,
    required this.subtitle,
    required this.busy,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return InkWell(
      onTap: busy ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppTokens.spaceLg,
          vertical: AppTokens.spaceMd,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.p.copyWith(
                      color: theme.colorScheme.foreground,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: theme.textTheme.small.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              Icon(
                Icons.chevron_right,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
          ],
        ),
      ),
    );
  }
}

/// 导出的账号密钥 —— 可复制。
class _CodeBlock extends StatelessWidget {
  final String code;
  final VoidCallback onCopy;

  const _CodeBlock({required this.code, required this.onCopy});

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTokens.spaceLg,
        vertical: AppTokens.spaceMd,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SelectableText(
            code,
            style: theme.textTheme.small.copyWith(
              fontFamily: 'monospace',
              color: theme.colorScheme.foreground,
            ),
          ),
          const SizedBox(height: AppTokens.spaceSm),
          TextButton.icon(
            onPressed: onCopy,
            icon: const Icon(Icons.copy, size: 14),
            label: Text(currentL10nOf(context).identityCopy),
          ),
        ],
      ),
    );
  }
}

/// 取当前 locale 的文案（页面上没有 context 的地方用）。
AppLocalizations currentL10nOf(BuildContext context) =>
    AppLocalizations.of(context)!;
