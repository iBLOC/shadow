import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:genui/genui.dart';
import '../services/genui/gen_ui_agent_service.dart';
import '../services/genui/shadow_catalog.dart';

/// Export GenUIAgentService for use in other files
export '../services/genui/gen_ui_agent_service.dart';

/// Prefrontal server URL
const prefrontalUrl = 'http://localhost:60080';

/// Provider for GenUIAgentService
final genUIAgentServiceProvider = Provider<GenUIAgentService>((ref) {
  final catalog = ShadowCatalog.create();
  final service = GenUIAgentService(serverUrl: prefrontalUrl, catalog: catalog);

  ref.onDispose(() {
    service.dispose();
  });

  return service;
});

/// Provider for A2UI connection status (listens to service's connection status)
final a2uiConnectionStatusProvider = StreamProvider<ConnectionStatus>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.connectionStatusStream;
});

/// Provider that indicates whether to use Agent2UI mode
final useAgent2UIModeProvider = StateProvider<bool>((ref) => false);

/// Provider for surface IDs from GenUIAgentService
final surfaceIdsProvider = StreamProvider<List<String>>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.surfaceIdsStream;
});

/// Provider for GenUiConversation
final genUiConversationProvider = Provider<GenUiConversation>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return service.conversation;
});
