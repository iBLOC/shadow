import 'prefrontal_client.dart';

/// High-level service for Soul management
/// Coordinates between Flutter UI and Prefrontal API
class SoulService {
  final PrefrontalClient _client;

  SoulService({required PrefrontalClient client}) : _client = client;

  /// Get current Soul content for an agent
  Future<String?> getCurrentSoul(String agentId) async {
    final response = await _client.getSoul(agentId);
    return response?.soul;
  }

  /// Update Soul by user directly (no review needed)
  Future<void> updateSoulByUser({
    required String agentId,
    required String newSoul,
    String? triggerType = 'user_edit',
  }) async {
    await _client.updateSoul(
      agentId: agentId,
      soul: newSoul,
      source: 'user',
      reason: 'User directly edited Soul',
      triggerType: triggerType,
    );
  }

  /// Update Soul by agent evaluation (auto-modified with reason)
  Future<void> updateSoulByAgent({
    required String agentId,
    required String newSoul,
    required String reason,
    String? conversationSummary,
    String triggerType = 'agent_review',
  }) async {
    await _client.updateSoul(
      agentId: agentId,
      soul: newSoul,
      source: 'agent',
      reason: reason,
      conversationSummary: conversationSummary,
      triggerType: triggerType,
    );
  }

  /// Get version history for UI display
  Future<List<SoulVersionResponse>> getVersionHistory(String agentId) async {
    return await _client.getSoulHistory(agentId);
  }

  /// Get specific version details
  Future<SoulVersionResponse?> getVersion(
    String agentId,
    String versionId,
  ) async {
    return await _client.getSoulVersion(agentId, versionId);
  }
}
