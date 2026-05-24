enum ModelReleaseStage { stable, preview }

enum ModelPreference { fast, full }

class LiteRTModel {
  final String id;
  final String name;
  final String displayName;
  final int minMemoryGb;
  final String description;
  final bool supportImage;
  final ModelReleaseStage releaseStage;
  final ModelPreference preference;

  const LiteRTModel({
    required this.id,
    required this.name,
    required this.displayName,
    required this.minMemoryGb,
    required this.description,
    required this.supportImage,
    required this.releaseStage,
    required this.preference,
  });

  String get sizeString => 'ML Kit Managed';
}

class LiteRTModels {
  static const gemma4E4B = LiteRTModel(
    id: 'gemma4-e4b',
    name: 'gemma-4-E2B-it',
    displayName: 'Gemma-4-E4B',
    minMemoryGb: 12,
    description: 'Gemma 4 4B parameters, supports image input',
    supportImage: true,
    releaseStage: ModelReleaseStage.stable,
    preference: ModelPreference.fast,
  );

  static const gemma3_1B = LiteRTModel(
    id: 'gemma3-1b',
    name: 'gemma-3n-E4B-it',
    displayName: 'Gemma-3-1B',
    minMemoryGb: 6,
    description: 'Gemma 3 1B, lightweight for mobile devices',
    supportImage: false,
    releaseStage: ModelReleaseStage.stable,
    preference: ModelPreference.fast,
  );

  static List<LiteRTModel> get allModels => [gemma4E4B, gemma3_1B];

  static LiteRTModel? getById(String id) {
    try {
      return allModels.firstWhere((m) => m.id == id);
    } catch (_) {
      return null;
    }
  }

  static LiteRTModel get defaultModel => gemma4E4B;

  static LiteRTModel get mobileModel => gemma3_1B;
}

enum AgentType {
  chat('Chat Agent', 'General conversation with multimodal support'),
  mobileActions(
    'Mobile Actions',
    'Automate mobile tasks using function calling',
  );

  final String displayName;
  final String description;
  const AgentType(this.displayName, this.description);
}

class Agent {
  final AgentType type;
  final LiteRTModel model;
  final bool isInitialized;

  const Agent({
    required this.type,
    required this.model,
    this.isInitialized = false,
  });

  Agent copyWith({AgentType? type, LiteRTModel? model, bool? isInitialized}) {
    return Agent(
      type: type ?? this.type,
      model: model ?? this.model,
      isInitialized: isInitialized ?? this.isInitialized,
    );
  }
}

class Agents {
  static const chatAgent = Agent(
    type: AgentType.chat,
    model: LiteRTModels.gemma4E4B,
  );

  static const mobileActionsAgent = Agent(
    type: AgentType.mobileActions,
    model: LiteRTModels.gemma3_1B,
  );

  static List<Agent> get allAgents => [chatAgent, mobileActionsAgent];

  static Agent getByType(AgentType type) {
    switch (type) {
      case AgentType.chat:
        return chatAgent;
      case AgentType.mobileActions:
        return mobileActionsAgent;
    }
  }
}
