import 'soul_service.dart';

/// Service for Agent to review conversations and update Soul
/// Runs nightly review of daily conversations
class AgentReviewService {
  final SoulService _soulService;

  AgentReviewService({required SoulService soulService})
    : _soulService = soulService;

  /// Run nightly review of today's conversations
  /// Called by scheduled task or on-demand
  Future<void> runNightlyReview() async {
    try {
      // 1. Get today's conversation summaries from Hippocampus
      final todayConversations = await _getTodayConversations();

      if (todayConversations.isEmpty) {
        return;
      }

      // 2. Get current Soul
      final currentSoul = await _soulService.getCurrentSoul('chat');
      if (currentSoul == null) {
        return;
      }

      // 3. Analyze conversations for user habits
      final habits = await _analyzeHabits(todayConversations);

      // 4. Check if Soul needs update
      final needsUpdate = await _checkIfNeedsUpdate(habits, currentSoul);

      if (needsUpdate.needsUpdate) {
        // 5. Generate new Soul content
        final newSoul = await _generateNewSoul(currentSoul, habits);

        // 6. Auto-update Soul with reason
        await _soulService.updateSoulByAgent(
          agentId: 'chat',
          newSoul: newSoul,
          reason: needsUpdate.reason,
          conversationSummary: _summarizeConversations(todayConversations),
          triggerType: 'agent_review',
        );
      }
    } catch (e) {
      // Log error but don't fail
      print('Nightly review failed: $e');
    }
  }

  /// Placeholder - TODO: Connect to Hippocampus service
  Future<List<ConversationSummary>> _getTodayConversations() async {
    // TODO: Implement actual Hippocampus connection
    return [];
  }

  /// Analyze conversations to extract user habits
  Future<List<Habit>> _analyzeHabits(
    List<ConversationSummary> conversations,
  ) async {
    // Use LLM to analyze conversations and extract habits
    // This is a simplified implementation
    final habits = <Habit>[];

    for (final conv in conversations) {
      // Check for common patterns
      final messageCount = conv.messages?.length ?? 0;
      if (messageCount > 10) {
        habits.add(
          Habit(
            type: 'verbose',
            description: 'User tends to have long conversations',
            confidence: 0.8,
          ),
        );
      }

      final lastMessage = conv.messages?.lastOrNull ?? '';
      if (lastMessage.contains('?')) {
        habits.add(
          Habit(
            type: 'questioning',
            description: 'User asks many questions',
            confidence: 0.7,
          ),
        );
      }
    }

    return habits;
  }

  /// Check if Soul needs to be updated based on detected habits
  Future<UpdateRecommendation> _checkIfNeedsUpdate(
    List<Habit> habits,
    String currentSoul,
  ) async {
    // Simplified logic - in production would use LLM for comparison
    if (habits.isEmpty) {
      return UpdateRecommendation(needsUpdate: false, reason: '');
    }

    // Check if habits significantly differ from current Soul
    int habitScore = 0;
    for (final habit in habits) {
      if (currentSoul.toLowerCase().contains(habit.type)) {
        habitScore++;
      }
    }

    if (habitScore < habits.length * 0.5) {
      return UpdateRecommendation(
        needsUpdate: true,
        reason:
            'Detected new user habits: ${habits.map((h) => h.type).join(", ")}',
      );
    }

    return UpdateRecommendation(needsUpdate: false, reason: '');
  }

  /// Generate new Soul content based on habits
  Future<String> _generateNewSoul(
    String currentSoul,
    List<Habit> habits,
  ) async {
    // Simplified - in production would use LLM to rewrite
    final newContent = StringBuffer(currentSoul);

    newContent.writeln('\n\n## 习得的习惯');
    for (final habit in habits) {
      newContent.writeln('- ${habit.description}');
    }

    return newContent.toString();
  }

  String _summarizeConversations(List<ConversationSummary> conversations) {
    if (conversations.isEmpty) return 'No conversations';

    final totalMessages = conversations.fold<int>(
      0,
      (sum, conv) => sum + (conv.messages?.length ?? 0),
    );

    return '${conversations.length} conversations, $totalMessages messages';
  }

  /// Manually trigger a review (for testing)
  Future<void> triggerManualReview() async {
    await runNightlyReview();
  }
}

/// Represents a detected user habit
class Habit {
  final String type;
  final String description;
  final double confidence;

  Habit({
    required this.type,
    required this.description,
    required this.confidence,
  });
}

/// Recommendation for Soul update
class UpdateRecommendation {
  final bool needsUpdate;
  final String reason;

  UpdateRecommendation({required this.needsUpdate, required this.reason});
}

/// Placeholder for conversation summary from Hippocampus
class ConversationSummary {
  final String id;
  final DateTime date;
  final List<String>? messages;

  ConversationSummary({required this.id, required this.date, this.messages});
}

/// Placeholder for Hippocampus client
/// TODO: Implement actual Hippocampus client
class HippocampusClient {
  Future<List<ConversationSummary>> getTodayConversations() async {
    // TODO: Connect to Hippocampus service
    return [];
  }
}

/// Placeholder for Prefrontal client
/// TODO: Implement actual Prefrontal client
class PrefrontalClient {
  // TODO: Implement
}
