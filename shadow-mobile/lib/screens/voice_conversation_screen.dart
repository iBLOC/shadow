import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/ai/brain_llm_provider.dart';
import '../providers/mode_provider.dart';
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../services/usb_audio_routing_service.dart';

class VoiceConversationScreen extends ConsumerStatefulWidget {
  const VoiceConversationScreen({super.key});

  @override
  ConsumerState<VoiceConversationScreen> createState() => _VCSState();
}

class _VCSState extends ConsumerState<VoiceConversationScreen> {
  bool _routingToShadow = false;

  @override
  void initState() {
    super.initState();
    _mirrorRoute();
  }

  Future<void> _mirrorRoute() async {
    final svc = UsbAudioRoutingService();
    try {
      final routes = await svc.currentRoutes();
      final shadow = routes.firstWhere(
        (r) => r.isShadowEsp32,
        orElse: () => const UsbAudioRoute(
          deviceName: '',
          deviceId: 0,
          isUsb: false,
          isShadowEsp32: false,
        ),
      );
      if (shadow.deviceId != 0 && mounted) {
        await svc.routeTo(shadow.deviceId);
        setState(() => _routingToShadow = true);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final route = ref.watch(shadowOutputRouteProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.voiceMode),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          if (_routingToShadow || route == ShadowOutputRoute.shadowEsp32)
            IconButton(
              tooltip: l10n.shadowEsp32PlayingFromUsbAudio,
              icon: const Icon(Icons.check_circle, color: Colors.green),
              onPressed: () {},
            )
          else
            IconButton(
              tooltip: 'Route to shadow-esp32',
              icon: const Icon(Icons.usb),
              onPressed: _mirrorRoute,
            ),
        ],
      ),
      body: LlmChatView(
        // 推理归 neuron 管 —— 进程内管线，本地/云端由大脑目录与路由决定。
        provider: BrainLlmProvider(
          service: ref.read(encephalonMobileServiceProvider),
          failureText: () => l10n.encephalonInferFailed,
          audioHint: () => l10n.voiceNoteBrainAsrPending,
        ),
        enableAttachments: true,
        enableVoiceNotes: true,
        welcomeMessage: l10n.welcomeMessage,
        suggestions: [
          l10n.tellMeStory,
          l10n.whatCanYouHelp,
          l10n.howAudioWorks,
        ],
      ),
    );
  }
}
