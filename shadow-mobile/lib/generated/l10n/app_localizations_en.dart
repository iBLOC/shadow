// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Shadow';

  @override
  String get models => 'Models';

  @override
  String get settings => 'Settings';

  @override
  String get startConversation => 'Start a conversation';

  @override
  String get addLocalModelComingSoon => 'Add local model dialog coming soon';

  @override
  String get askSomething => 'Ask something...';

  @override
  String get initializing => 'Initializing...';

  @override
  String get modelInfo => 'Model Info';

  @override
  String get resetEngine => 'Reset Engine';

  @override
  String get theme => 'Theme';

  @override
  String get accessibilityControl => 'Accessibility Control';

  @override
  String get accessibilityOn => 'Enabled. You can control device tap/swipe.';

  @override
  String get accessibilityOff => 'Disabled. Tap to open settings.';

  @override
  String get addModel => 'Add Model';

  @override
  String get addLocalModel => 'Add Local Model';

  @override
  String get addCloudModel => 'Add Cloud Model';

  @override
  String get searchModels => 'Search models...';

  @override
  String get filterAll => 'All';

  @override
  String get filterText => 'Text';

  @override
  String get filterVision => 'Vision';

  @override
  String get filterAudio => 'Audio';

  @override
  String get filterLocal => 'Local';

  @override
  String get filterCloud => 'Cloud';

  @override
  String get local => 'Local';

  @override
  String get cloud => 'Cloud';

  @override
  String get loaded => 'Loaded';

  @override
  String get notLoaded => 'Not loaded';

  @override
  String get modelSettings => 'Model Settings';

  @override
  String threadCount(int n) {
    return 'Thread Count: $n';
  }

  @override
  String get backendType => 'Backend Type';

  @override
  String get cpu => 'CPU';

  @override
  String get opencl => 'OpenCL';

  @override
  String get metal => 'Metal';

  @override
  String get modelPath => 'Model Path';

  @override
  String get cancel => 'Cancel';

  @override
  String get apply => 'Apply';

  @override
  String get noModels => 'No Models';

  @override
  String get addModelToGetStarted => 'Add a model to get started';

  @override
  String get cloudModel => 'Cloud Model';

  @override
  String get endpoint => 'Endpoint';

  @override
  String get model => 'Model';

  @override
  String get apiKey => 'API Key';

  @override
  String get notSet => 'Not set';

  @override
  String get configureCloudModel => 'Configure Cloud Model';

  @override
  String get apiEndpoint => 'API Endpoint';

  @override
  String get save => 'Save';

  @override
  String get cloudModelSettings => 'Cloud Model Settings';

  @override
  String get provider => 'Provider';

  @override
  String get modelInfoNotInitialized => 'Not initialized';

  @override
  String get modelLoaded => 'Model loaded';

  @override
  String get desktopMode => 'Desktop mode (Android only)';

  @override
  String errorGeneric(String detail) {
    return 'Error: $detail';
  }

  @override
  String get desktopUnsupportedMessage =>
      'MNN engine is only available on Android.\nThis is a desktop build - local LLM features are disabled.\nYou can still use cloud models.';

  @override
  String get mobileNetworkDetected => 'Mobile Network Detected';

  @override
  String downloadOnMobile(String modelSize) {
    return 'You are on mobile data. The model ($modelSize) will be downloaded. Do you want to download now or wait for WiFi?';
  }

  @override
  String get waitForWifi => 'Wait for WiFi';

  @override
  String get waitingForWifiHint =>
      'Waiting for WiFi — the model will download automatically once connected.';

  @override
  String get downloadNow => 'Download Now';

  @override
  String get gallery => 'Gallery';

  @override
  String get camera => 'Camera';

  @override
  String get file => 'File';

  @override
  String get textMode => 'Message Mode';

  @override
  String get voiceMode => 'Conversation Mode';

  @override
  String get agent2uiReady => 'Agent2UI Ready';

  @override
  String get askMeAnything => 'Ask me anything and I will generate UI for you';

  @override
  String get connectedToShadowA2AServer => 'Connected to Shadow A2A Server';

  @override
  String get connectingToShadow => 'Connecting to Shadow...';

  @override
  String get connectionError => 'Connection error';

  @override
  String get disconnected => 'Disconnected';

  @override
  String get connecting => 'Connecting...';

  @override
  String get disconnect => 'Disconnect';

  @override
  String get holdToRecord => 'Hold to record';

  @override
  String get recording => 'Recording...';

  @override
  String get downloadComplete => 'Download complete!';

  @override
  String get downloadFailed => 'Download failed';

  @override
  String get retry => 'Retry';

  @override
  String get startChatting => 'Start Chatting';

  @override
  String get manage => 'Manage';

  @override
  String get providers => 'Providers';

  @override
  String get skills => 'Skills';

  @override
  String get agents => 'Agents';

  @override
  String get memory => 'Memory';

  @override
  String get mcp => 'MCP';

  @override
  String get conversations => 'Conversations';

  @override
  String get tasks => 'Tasks';

  @override
  String get localModels => 'Local Models';

  @override
  String get modelStore => 'Model Store';

  @override
  String get noModelsAvailable => 'No models available';

  @override
  String get serviceStatus => 'Service Status';

  @override
  String get healthy => 'Healthy';

  @override
  String get offline => 'Offline';

  @override
  String get checking => 'Checking...';

  @override
  String get unhealthy => 'Unhealthy';

  @override
  String get unknown => 'Unknown';

  @override
  String get modelStoreUrlUpdated => 'Model store URL updated';

  @override
  String get modelStoreServer => 'Model Store Server';

  @override
  String get custom => 'Custom';

  @override
  String get defaultOption => 'Default';

  @override
  String get liteRT => 'LiteRT';

  @override
  String get agent2UI => 'Agent2UI';

  @override
  String voiceInputPlaceholder(int count) {
    return '[Voice input: $count samples]';
  }

  @override
  String get audioProcessingNotImplemented =>
      '[This is a placeholder response. Audio processing not yet implemented.]';

  @override
  String get removeAttachment => 'Remove attachment';

  @override
  String get webviewSkillNotImplemented =>
      '[Webview skill execution not yet implemented]';

  @override
  String get nativeSkillNotImplemented =>
      '[Native skill execution not yet implemented]';

  @override
  String get dimensionUser => 'User';

  @override
  String get dimensionAgent => 'Agent';

  @override
  String get dimensionSession => 'Session';

  @override
  String get dimensionResources => 'Resources';

  @override
  String score(String value) {
    return 'Score: $value';
  }

  @override
  String get toDo => 'To Do';

  @override
  String get inProgress => 'In Progress';

  @override
  String get done => 'Done';

  @override
  String get welcomeMessage => 'Hello! I can hear your voice.';

  @override
  String get tellMeStory => 'Tell me a story';

  @override
  String get whatCanYouHelp => 'What can you help me with?';

  @override
  String get howAudioWorks => 'How does audio input work?';

  @override
  String get ttsSettings => 'TTS Voice Synthesis';

  @override
  String get ttsEngine => 'Voice Engine';

  @override
  String get ttsEngineAndroid => 'Android Built-in';

  @override
  String get ttsEngineExternal => 'External Service';

  @override
  String get ttsStatus => 'Engine Status';

  @override
  String get ttsReady => 'Ready';

  @override
  String get ttsNotReady => 'Not Ready';

  @override
  String get ttsExternalUrl => 'External TTS Service URL';

  @override
  String get ttsExternalUrlHint => 'Enter external TTS API URL';

  @override
  String get ttsTest => 'Test Speech';

  @override
  String get ttsTestText => 'Hello, this is a speech synthesis test';

  @override
  String get continueDesktopTitle => 'Continue on Desktop';

  @override
  String get continueDesktopDescription =>
      'Pick a desktop peer to hand this conversation off to. Audio and TTS stay on the phone; inference moves to the desktop.';

  @override
  String get continueDesktopConfirm => 'Hand off';

  @override
  String get continueDesktopNoPeers =>
      'No desktop peers found. Make sure your desktop is running and on the same network.';

  @override
  String get continueDesktopProvider => 'Desktop peer';

  @override
  String continueDesktopMessageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count messages',
      one: '1 message',
      zero: 'No messages yet',
    );
    return '$_temp0';
  }

  @override
  String continueDesktopSizeKb(int size) {
    return '$size KB';
  }

  @override
  String get continueDesktopPreparing => 'Preparing handoff...';

  @override
  String continueDesktopInProgress(String peer) {
    return 'Handing off to $peer...';
  }

  @override
  String continueDesktopSuccess(String peer) {
    return 'Handoff to $peer complete. Open the conversation on your desktop.';
  }

  @override
  String continueDesktopError(String message) {
    return 'Handoff failed: $message';
  }

  @override
  String get addManually => 'Add manually';

  @override
  String get confirm => 'Confirm';

  @override
  String get telencephalonFlows => 'Telencephalon Flows';

  @override
  String get active => 'Active';

  @override
  String get drafts => 'Drafts';

  @override
  String get liveStreamMode => 'Live Stream';

  @override
  String get audioOutput => 'Audio Output';

  @override
  String get routePhoneSpeaker => 'Phone Speaker';

  @override
  String get routeBluetoothHeadset => 'Bluetooth';

  @override
  String get routeShadowEsp32 => 'shadow-esp32';

  @override
  String get shadowEsp32ReceivesAudio => 'shadow-esp32 is receiving audio';

  @override
  String get routeViaBluetoothA2dp => 'via Bluetooth';

  @override
  String get routeViaPhoneSpeaker => 'via phone speaker';

  @override
  String get modeMismatch =>
      'Current mode does not match this screen. Tap the mic icon in the top-right to switch to voice mode.';

  @override
  String get ttsInputLabel => 'Text to speak';

  @override
  String get ttsInputHint => 'Type what the digital human should say…';

  @override
  String get startTts => 'Start';

  @override
  String get stopTts => 'Stop';

  @override
  String routeSelected(String device) {
    return 'Output: $device';
  }

  @override
  String get digitalHumanTtsNow => 'Live Stream Mode';

  @override
  String get shadowEsp32PlayingFromUsbAudio =>
      'shadow-esp32 connected via USB Audio';

  @override
  String get customerServiceMode => 'Customer Service';

  @override
  String get callState => 'Call State';

  @override
  String get callStateIdle => 'Idle';

  @override
  String get callStateRinging => 'Ringing';

  @override
  String get callStateActive => 'Active';

  @override
  String get callStateEnded => 'Ended';

  @override
  String get earphoneTakeoverActive =>
      'Wired earphone detected — audio routed to earphone for human takeover.';

  @override
  String get earphoneTakeoverAudioRouteNote =>
      'When earphone is connected, call audio automatically routes to earphone. Plug it back out to route to shadow-esp32.';

  @override
  String get aiAutoAnswer => 'AI Auto-Answer';

  @override
  String get aiAutoAnswerDesc =>
      'Automatically answer incoming calls and respond with AI (telencephalon / LiteRT).';

  @override
  String get endCall => 'End Call';

  @override
  String get openLiveStreamMode => 'Live Stream';

  @override
  String get openVoiceAssistant => 'Voice Assistant';

  @override
  String get customerServiceHint =>
      'AI will answer incoming calls and reply using the LLM. Shadow-esp32 plays caller voice and AI response. Plug earphone to take over.';

  @override
  String get visualQaPickCamera => 'Pick a camera';

  @override
  String visualQaPicked(Object label) {
    return 'Picked $label';
  }

  @override
  String get modelBindingPromptTitle => 'Bind a model to continue';

  @override
  String get modelBindingPromptGoSettings =>
      'Go to settings and bind a model first';

  @override
  String get modelBindingPromptLater => 'Later';

  @override
  String get conversationNewSession => 'New Session';

  @override
  String get conversationManagement => 'Conversations';

  @override
  String get conversationEmpty => 'No conversations';

  @override
  String get conversationEmptyHint =>
      'Tap the button below to start a new chat';

  @override
  String get conversationNewChat => 'New Chat';

  @override
  String get conversationTitleField => 'Chat title';

  @override
  String get conversationCreate => 'Create';

  @override
  String get commonConfirmDelete => 'Confirm Delete';

  @override
  String get commonDelete => 'Delete';

  @override
  String get discoveryTitle => 'Device Discovery';

  @override
  String get discoveryScanning => 'Scanning for devices...';

  @override
  String get discoveryNoDevices => 'No devices found';

  @override
  String get discoveryNoDevicesHint => 'Tap the refresh button to scan again';

  @override
  String get discoveryAddManually => 'Add Device Manually';

  @override
  String get commonHostAddress => 'Host address';

  @override
  String get commonPort => 'Port';

  @override
  String get discoveryDeviceNameOptional => 'Device name (optional)';

  @override
  String get commonAdd => 'Add';

  @override
  String get discoveryActive => 'Active';

  @override
  String get discoverySetActive => 'Set as active';

  @override
  String get commonRemove => 'Remove';

  @override
  String get commonClearFilters => 'Clear filters';

  @override
  String get navChat => 'Chat';

  @override
  String get navLive => 'Live';

  @override
  String get navService => 'Service';

  @override
  String get navTasks => 'Tasks';

  @override
  String get navManage => 'Manage';

  @override
  String get navSettings => 'Settings';

  @override
  String get logsTelencephalonStarted => 'Telencephalon service started';

  @override
  String get logsDbTimeoutRetry => 'Database connection timed out, retrying...';

  @override
  String get logsHippocampusUnreachable =>
      'Cannot connect to the Hippocampus service';

  @override
  String get logsTitle => 'System Logs';

  @override
  String get logsClearFilter => 'Clear filter';

  @override
  String get logsClearAll => 'Clear Logs';

  @override
  String get logsClearConfirm => 'Clear all logs?';

  @override
  String get logsClear => 'Clear';

  @override
  String get logsEmpty => 'No logs yet';

  @override
  String get logsNoMatch => 'No matching logs';

  @override
  String get logsCopied => 'Copied to clipboard';

  @override
  String get mcpTitle => 'MCP Servers';

  @override
  String get mcpAddServer => 'Add server';

  @override
  String get mcpEmpty => 'No MCP servers';

  @override
  String get mcpEmptyHint => 'Tap the button below to add a server';

  @override
  String get mcpAddServerTitle => 'Add MCP Server';

  @override
  String get commonName => 'Name';

  @override
  String get mcpServerUrl => 'Server URL';

  @override
  String get mcpAuthTokenOptional => 'Auth token (optional)';

  @override
  String get memoryEmpty => 'No memories yet';

  @override
  String get modelEngineRunning => 'Engine running';

  @override
  String get modelEngineStopped => 'Engine not running';

  @override
  String get modelEmpty => 'No models';

  @override
  String get modelEmptyHint => 'Tap the button below to add a model';

  @override
  String get modelTypeLabel => 'Type:';

  @override
  String get commonAll => 'All';

  @override
  String get modelLiteRtEngine => 'LiteRT engine';

  @override
  String get modelInternalService => 'Internal service (Rust)';

  @override
  String get modelCloudProvider => 'Cloud provider';

  @override
  String get modelNoCloudModels => 'No cloud models';

  @override
  String get modelNoCloudModelsHint =>
      'Tap the button below to add a cloud model';

  @override
  String get modelAddLocalTitle => 'Add Local Model';

  @override
  String get modelNameField => 'Model name';

  @override
  String get modelPathField => 'Model path';

  @override
  String get modelSizeField => 'Size (MB)';

  @override
  String get modelAddCloudTitle => 'Add Cloud Model';

  @override
  String get commonApiKeyOptional => 'API key (optional)';

  @override
  String get modelNameOptional => 'Model name (optional)';

  @override
  String get modelSettingsTitle => 'Model Settings';

  @override
  String get modelSettingsEngine => 'Inference engine';

  @override
  String get modelSettingsSelectModel => 'Select model';

  @override
  String get promptSaved => 'Prompt saved';

  @override
  String get promptRestored => 'Default prompt restored';

  @override
  String get promptSettingsTitle => 'Prompt Settings';

  @override
  String get commonSave => 'Save';

  @override
  String get promptMainAgentLabel => 'Main agent system prompt';

  @override
  String get promptInputHint => 'Enter a system prompt...';

  @override
  String get promptRestoreDefault => 'Restore default';

  @override
  String get providerQwen => 'Qwen';

  @override
  String get providerZhipu => 'Zhipu AI';

  @override
  String get providerLocalModel => 'Local model';

  @override
  String get providersTitle => 'Model Providers';

  @override
  String get providersEmpty => 'No providers configured';

  @override
  String get providersEmptyHint =>
      'Tap the button below to add your first provider';

  @override
  String get providersAdd => 'Add provider';

  @override
  String get commonEdit => 'Edit';

  @override
  String get providersEditTitle => 'Edit Provider';

  @override
  String get commonProvider => 'Provider';

  @override
  String get commonApiAddress => 'API address';

  @override
  String get commonModel => 'Model';

  @override
  String get providersApiKeyRequired => 'Please enter an API key';

  @override
  String get resonanceNotConnected => 'Not connected';

  @override
  String get resonanceConnecting => 'Connecting';

  @override
  String get resonanceConnected => 'Connected';

  @override
  String get resonanceError => 'Error';

  @override
  String get resonanceLocal => 'Local Resonance';

  @override
  String get resonanceTitle => 'Resonance Management';

  @override
  String get resonanceEmpty => 'No Resonance instances';

  @override
  String get resonanceAddInstance => 'Add instance';

  @override
  String get resonanceAddTitle => 'Add Resonance Instance';

  @override
  String get resonanceInstanceName => 'Instance name';

  @override
  String get resonanceApiKeyOptional => 'API key (optional)';

  @override
  String get resonanceEditTitle => 'Edit Resonance Instance';

  @override
  String get resonancePrimary => 'Primary';

  @override
  String get resonanceSetPrimary => 'Set as primary';

  @override
  String get resonanceTestConnection => 'Test connection';

  @override
  String get settingsMemoryUsage => 'Memory usage';

  @override
  String get settingsDeviceDiscovery => 'Device discovery';

  @override
  String get settingsDeviceDiscoveryDesc =>
      'Scan for and discover network devices';

  @override
  String get settingsLogsDesc => 'View app logs and error messages';

  @override
  String get settingsResonanceDesc => 'Manage Resonance service instances';

  @override
  String get settingsRefreshStatus => 'Refresh status';

  @override
  String get skillsTitle => 'Skills';

  @override
  String get skillsEmpty => 'No skills';

  @override
  String get skillsEmptyHint => 'Tap the button below to add a custom skill';

  @override
  String get skillsBuiltIn => 'Built-in skills';

  @override
  String get skillsCustom => 'Custom skills';

  @override
  String get skillsAddCustom => 'Add Custom Skill';

  @override
  String get skillsNameField => 'Skill name';

  @override
  String get commonDescription => 'Description';

  @override
  String get soulSaved => 'Soul saved';

  @override
  String get soulTitle => 'Soul Settings';

  @override
  String get soulSubtitle => 'Soul - your personal assistant persona';

  @override
  String get soulDescHint =>
      'Describe your assistant\'s personality, habits and preferences.';

  @override
  String get soulVersionHistory => 'Version history';

  @override
  String get soulNoHistory => 'No version history';

  @override
  String get soulUserModified => 'User edit';

  @override
  String get soulAgentReview => 'Agent review';

  @override
  String get soulNoReason => 'No reason given';

  @override
  String get soulChangeReason => 'Reason for change';

  @override
  String get soulConversationSummary => 'Conversation summary';

  @override
  String get soulContent => 'Content';

  @override
  String get taskBoardTitle => 'Task Board';

  @override
  String get taskStatusBacklog => 'Backlog';

  @override
  String get taskStatusTodo => 'To do';

  @override
  String get taskStatusInProgress => 'In progress';

  @override
  String get taskStatusDone => 'Done';

  @override
  String get taskStatusFailed => 'Failed';

  @override
  String get taskStatusCancelled => 'Cancelled';

  @override
  String get taskRetry => 'Retry';

  @override
  String get taskEmpty => 'No tasks';

  @override
  String get taskAdd => 'Add task';

  @override
  String get taskTitleField => 'Task title';

  @override
  String get taskPriority => 'Priority';

  @override
  String get priorityLow => 'Low';

  @override
  String get priorityMedium => 'Medium';

  @override
  String get priorityHigh => 'High';

  @override
  String get priorityUrgent => 'Urgent';

  @override
  String get taskEditTitle => 'Edit Task';

  @override
  String get taskStatus => 'Status';

  @override
  String get taskTagsField => 'Tags (comma separated)';

  @override
  String get taskEditPersistenceNote =>
      'Hippocampus only persists status and tags - title and description have no matching columns and are not saved.';

  @override
  String get taskOverview => 'Overview';

  @override
  String get taskLogs => 'Logs';

  @override
  String get commonRefresh => 'Refresh';

  @override
  String get taskCreatedAt => 'Created at';

  @override
  String get taskCompletedAt => 'Completed at';

  @override
  String get taskTags => 'Tags';

  @override
  String get taskNoSubtasks => 'This task has no subtasks';

  @override
  String get taskSubtaskProgress => 'Subtask progress';

  @override
  String get logsTab => 'Logs';

  @override
  String get logsBackend => 'Backend';

  @override
  String get logsAllLevels => 'All levels';

  @override
  String get logsExport => 'Export logs';

  @override
  String get logsPanelClearAll => 'Clear all';

  @override
  String get soulPriorityNote => 'System Prompt takes highest priority.';

  @override
  String commonLoadFailed(String error) {
    return 'Load failed: $error';
  }

  @override
  String commonErrorDetail(String error) {
    return 'Error: $error';
  }

  @override
  String commonDeleteConfirmNamed(String name) {
    return 'Delete \"$name\"?';
  }

  @override
  String commonDeleteFailed(String error) {
    return 'Delete failed: $error';
  }

  @override
  String commonMinutesAgo(int count) {
    return '$count min ago';
  }

  @override
  String commonHoursAgo(int count) {
    return '$count h ago';
  }

  @override
  String commonDaysAgo(int count) {
    return '$count d ago';
  }

  @override
  String settingsMemUsed(int mb) {
    return 'Used: $mb MB';
  }

  @override
  String settingsMemTotal(int mb) {
    return 'Total: $mb MB';
  }

  @override
  String settingsMemFree(int mb) {
    return 'Free: $mb MB';
  }

  @override
  String settingsMemUsage(String percent) {
    return 'Usage: $percent%';
  }

  @override
  String get settingsPrefrontalEmbedded => 'Embedded Prefrontal';

  @override
  String get settingsPrefrontalEmbeddedDesc =>
      'Manage the Prefrontal runtime embedded in this app';

  @override
  String get settingsEncephalonEmbedded => 'Embedded Brain';

  @override
  String get settingsEncephalonEmbeddedDesc =>
      'Manage the Encephalon brain runtime embedded in this app (inference + telencephalon agent surface)';

  @override
  String taskSubtasks(int count) {
    return 'Subtasks ($count)';
  }

  @override
  String taskStepStarted(String time) {
    return 'Started: $time';
  }

  @override
  String taskStepCompleted(String time) {
    return 'Completed: $time';
  }

  @override
  String taskStepDuration(int seconds) {
    return 'Duration: ${seconds}s';
  }

  @override
  String taskStepProgress(int completed, int total) {
    return '$completed/$total steps';
  }

  @override
  String get soulDescHintExample =>
      'For example:\n- Friendly and concise\n- Address the user as \"you\"\n- Offer useful suggestions proactively';

  @override
  String soulHistoryLoadFailed(String error) {
    return 'Failed to load history: $error';
  }

  @override
  String soulVersion(int version) {
    return 'Version $version';
  }

  @override
  String logsFilterLabel(String level, String source) {
    return 'Filter: $level $source';
  }

  @override
  String logsTotalCount(int count) {
    return '$count logs in total';
  }

  @override
  String logsShownCount(int count) {
    return 'Showing $count';
  }

  @override
  String discoveryLastScan(String time) {
    return 'Last scan: $time';
  }

  @override
  String discoveryDeviceCount(int count) {
    return '$count devices found';
  }

  @override
  String resonanceLatency(int ms) {
    return 'Latency: ${ms}ms';
  }

  @override
  String get modelNameExample => 'e.g. Qwen2.5-7B';

  @override
  String get cameraOff => 'Camera off';

  @override
  String get cameraReady => 'Camera ready';

  @override
  String get cameraStreaming => 'Capturing...';

  @override
  String get cameraFlip => 'Flip';

  @override
  String get cameraClose => 'Close';

  @override
  String get prefrontalEmbeddedTitle => 'Prefrontal Embedded Runtime (NDK)';

  @override
  String get prefrontalEmbeddedRuntime => 'Embedded runtime';

  @override
  String prefrontalPort(int port) {
    return 'Port: $port';
  }

  @override
  String get prefrontalStart => 'Start';

  @override
  String get prefrontalStop => 'Stop';

  @override
  String prefrontalAgentsCount(int count) {
    return 'Agents ($count)';
  }

  @override
  String get prefrontalRefresh => 'Refresh';

  @override
  String get prefrontalStartFirst => 'Start the service first';

  @override
  String get prefrontalNoAgentsHint => 'No agents yet - add one:';

  @override
  String get prefrontalAddSampleAgent => 'Add sample agent';

  @override
  String get prefrontalInvokeTitle => 'Invoke agent (JNI)';

  @override
  String get prefrontalInput => 'Input';

  @override
  String get prefrontalInputHint => 'Type what to send to the agent...';

  @override
  String get prefrontalInvoke => 'Invoke (JNI)';

  @override
  String get prefrontalNoOutput => '(no output)';

  @override
  String get prefrontalAboutTitle => 'About the NDK embedding';

  @override
  String get prefrontalAboutLine1 =>
      '- Prefrontal is embedded in the app process as a .so';

  @override
  String get prefrontalAboutLine2 => '- Talks to the Kotlin service over JNI';

  @override
  String get prefrontalAboutLine3 =>
      '- Talks to Prefrontal over localhost HTTP';

  @override
  String get prefrontalAboutLine4 => '- Service lifetime is bound to the app';

  @override
  String get prefrontalAboutLine5 =>
      '- No external process, so it is not killed';

  @override
  String get prefrontalAboutArchitecture => 'Architecture:';

  @override
  String get prefrontalStartSuccess => 'Embedded runtime started';

  @override
  String get prefrontalStartFailed => 'Start failed';

  @override
  String prefrontalStartError(String error) {
    return 'Start error: $error';
  }

  @override
  String get prefrontalStopSuccess => 'Embedded runtime stopped';

  @override
  String get prefrontalStopFailed => 'Stop failed';

  @override
  String prefrontalStopError(String error) {
    return 'Stop error: $error';
  }

  @override
  String get prefrontalAddSuccess => 'Added';

  @override
  String get prefrontalAddFailed => 'Add failed';

  @override
  String prefrontalAddError(String error) {
    return 'Add error: $error';
  }

  @override
  String get prefrontalInvokeSuccess => 'JNI call succeeded';

  @override
  String get prefrontalInvokeFailed => 'Call failed';

  @override
  String prefrontalInvokeError(String error) {
    return 'Call error: $error';
  }

  @override
  String get prefrontalStatusStopped => 'Stopped';

  @override
  String get prefrontalStatusStarting => 'Starting...';

  @override
  String get prefrontalStatusRunning => 'Running';

  @override
  String get prefrontalStatusStopping => 'Stopping...';

  @override
  String get prefrontalStatusError => 'Error';

  @override
  String get prefrontalSampleAgentName => 'Sample agent';

  @override
  String get prefrontalSampleAgentDesc => 'Sample agent registered over JNI';

  @override
  String prefrontalErrorPrefix(String error) {
    return 'Error: $error';
  }

  @override
  String get chatGreeting => 'Hello! I am Shadow. How can I help you?';

  @override
  String get chatImageNotAvailable =>
      'LiteRT image support is not available yet - please wait for a version update';

  @override
  String get chatVoiceModelRequired =>
      'Voice features need a model to be loaded first';

  @override
  String chatSorryError(String error) {
    return 'Sorry, something went wrong: $error';
  }

  @override
  String get chatSorryErrorShort => 'Sorry, something went wrong';

  @override
  String get modelPlaceholderNoLocal => 'No local model yet';

  @override
  String get deviceThisMachine => 'This device';

  @override
  String get actionFlashlightOn => 'Turn on flashlight';

  @override
  String get actionFlashlightOff => 'Turn off flashlight';

  @override
  String actionCreateContact(String name) {
    return 'Create contact: $name';
  }

  @override
  String actionSendEmail(String to) {
    return 'Send email to: $to';
  }

  @override
  String actionShowLocation(String query) {
    return 'Show location: $query';
  }

  @override
  String get actionOpenWifi => 'Open WiFi settings';

  @override
  String actionCreateCalendar(String title) {
    return 'Create calendar event: $title';
  }

  @override
  String get actionFlashlightOnDone => 'Flashlight is on';

  @override
  String actionFlashlightOnFailed(String error) {
    return 'Failed to turn on the flashlight: $error';
  }

  @override
  String get actionFlashlightOffDone => 'Flashlight is off';

  @override
  String actionFlashlightOffFailed(String error) {
    return 'Failed to turn off the flashlight: $error';
  }

  @override
  String actionCreatingContact(String name) {
    return 'Creating contact: $name';
  }

  @override
  String get actionNoContactsApp => 'Cannot open the contacts app';

  @override
  String actionContactFailed(String error) {
    return 'Failed to create the contact: $error';
  }

  @override
  String actionEmailOpened(String to) {
    return 'Email app opened, recipient: $to';
  }

  @override
  String get actionNoEmailApp => 'Cannot open the email app';

  @override
  String actionEmailFailed(String error) {
    return 'Failed to send the email: $error';
  }

  @override
  String actionShowingLocation(String query) {
    return 'Showing location: $query';
  }

  @override
  String get actionNoMapsApp => 'Cannot open the maps app';

  @override
  String actionLocationFailed(String error) {
    return 'Failed to show the location: $error';
  }

  @override
  String get actionWifiOpened => 'WiFi settings opened';

  @override
  String actionWifiFailed(String error) {
    return 'Failed to open the WiFi settings: $error';
  }

  @override
  String actionCalendarCreated(String title) {
    return 'Calendar event created: $title';
  }

  @override
  String get actionNoCalendarApp => 'Cannot open the calendar app';

  @override
  String actionCalendarFailed(String error) {
    return 'Failed to create the calendar event: $error';
  }

  @override
  String get encephalonStartFailed => 'Failed to start the embedded brain';

  @override
  String get encephalonNotRunning => 'The embedded brain is not running';

  @override
  String get encephalonEmbeddedTitle => 'Embedded Brain Runtime (NDK)';

  @override
  String get encephalonEmbeddedRuntime => 'Embedded brain runtime';

  @override
  String encephalonPort(int port) {
    return 'Port: $port';
  }

  @override
  String get encephalonStart => 'Start brain';

  @override
  String get encephalonStop => 'Stop brain';

  @override
  String get encephalonStatusStopped => 'Stopped';

  @override
  String get encephalonStatusStarting => 'Starting...';

  @override
  String get encephalonStatusRunning => 'Running';

  @override
  String get encephalonStatusStopping => 'Stopping...';

  @override
  String get encephalonStatusError => 'Error';

  @override
  String get encephalonInferTitle => 'In-process inference';

  @override
  String get encephalonInferHint =>
      'The request goes straight into the neuron adapter pipeline in-process — no socket, no CORS.';

  @override
  String get encephalonInferPrompt => 'Prompt';

  @override
  String get encephalonInferRun => 'Run inference';

  @override
  String get encephalonInferFailed => 'Inference failed';

  @override
  String get settingsAppearance => 'Appearance';

  @override
  String get settingsThemeColor => 'Theme color';

  @override
  String get settingsThemeColorHint =>
      'The shadow itself has no color — pick the light it casts in.';

  @override
  String get settingsGlassIntensity => 'Glass intensity';

  @override
  String get settingsGlassOff => 'Off';

  @override
  String get settingsGlassFull => 'Full';

  @override
  String get settingsDialogBackground => 'Dialog background';

  @override
  String get settingsFollowTheme => 'Follow theme';

  @override
  String get settingsSurfaceDeep => 'Deep';

  @override
  String get settingsSurfaceLight => 'Light';

  @override
  String get settingsSurfaceNeutral => 'Neutral';

  @override
  String get settingsSurfaceInk => 'Ink';

  @override
  String get appearanceAccentNeutral => 'Neutral';

  @override
  String get appearanceAccentSlate => 'Slate';

  @override
  String get appearanceAccentIndigo => 'Indigo';

  @override
  String get appearanceAccentCyan => 'Cyan';

  @override
  String get appearanceAccentEmerald => 'Emerald';

  @override
  String get appearanceAccentAmber => 'Amber';

  @override
  String get appearanceAccentRose => 'Rose';

  @override
  String get surfaceChat => 'Chat';

  @override
  String get surfaceConversations => 'Conversations';

  @override
  String get surfaceVoice => 'Voice';

  @override
  String get surfaceLivestream => 'Livestream';

  @override
  String get surfaceCustomerService => 'Customer service';

  @override
  String get surfaceTasks => 'Tasks';

  @override
  String get surfaceGroup => 'Group';

  @override
  String get surfaceDocument => 'Document';

  @override
  String get surfacePreviews => 'Previews';

  @override
  String get surfaceAgents => 'Agents';

  @override
  String get surfaceModels => 'Models';

  @override
  String get surfaceModelDownload => 'Model download';

  @override
  String get surfaceModelOnboarding => 'Model onboarding';

  @override
  String get surfaceModelSettings => 'Model settings';

  @override
  String get surfaceProviders => 'Providers';

  @override
  String get surfaceMcp => 'MCP tools';

  @override
  String get surfaceSkills => 'Skills';

  @override
  String get surfaceMemory => 'Memory';

  @override
  String get surfacePromptSettings => 'Prompts';

  @override
  String get surfaceFlows => 'Flows';

  @override
  String get surfaceWorkflowStudio => 'Workflow studio';

  @override
  String get surfaceComputerUse => 'Computer use';

  @override
  String get surfaceJdmEditor => 'Rule editor';

  @override
  String get surfaceProvisioning => 'Device provisioning';

  @override
  String get surfaceDiscovery => 'Discovery';

  @override
  String get surfaceLogs => 'Logs';

  @override
  String get surfaceTrace => 'Trace';

  @override
  String get surfaceResonance => 'Resonance';

  @override
  String get surfaceTelencephalon => 'Telencephalon';

  @override
  String get surfaceSettings => 'Settings';

  @override
  String get surfaceSetup => 'Setup';

  @override
  String get surfacePrefrontalEmbedded => 'Embedded prefrontal';

  @override
  String get navSectionConverse => 'Converse';

  @override
  String get navSectionWork => 'Work';

  @override
  String get navSectionCapability => 'Capabilities';

  @override
  String get navSectionMore => 'More';

  @override
  String get navTabChat => 'Chat';

  @override
  String get navTabTasks => 'Tasks';

  @override
  String get navTabCapability => 'Capabilities';

  @override
  String get navTabMe => 'Me';

  @override
  String get settingsGroupAppearance => 'Appearance';

  @override
  String get settingsGroupVoice => 'Voice & Accessibility';

  @override
  String get settingsGroupRuntime => 'Runtime';

  @override
  String get settingsGroupConnections => 'Connections';

  @override
  String get settingsGroupAdvanced => 'Advanced';

  @override
  String get settingsGroupAdvancedDesc => 'Less-used and developer options';

  @override
  String get settingsAdvancedLogs => 'Logs';

  @override
  String get settingsAdvancedBackend => 'Telencephalon backend';

  @override
  String get settingsAdvancedBackendDesc =>
      'Override the telencephalon base URL and admin token used by the mobile client.';

  @override
  String get settingsBackendAdminTokenHint => 'leave blank for dev mode';

  @override
  String get settingsDangerZone => 'Danger Zone';

  @override
  String get settingsDangerZoneDesc =>
      'These actions cannot be undone. Use with care.';

  @override
  String get resetEngineDesc => 'Reinitialize the engine';

  @override
  String get resetEngineConfirmDesc =>
      'Resetting reinitializes the runtime and discards unsaved sessions. This cannot be undone.';

  @override
  String get resetEngineConfirm => 'Reset';

  @override
  String get telencephalonFlowsDesc => 'Browse and run telencephalon flows';

  @override
  String get settingsThemeModeLight => 'Light';

  @override
  String get settingsThemeModeDark => 'Dark';

  @override
  String get settingsDialogBackgroundDesc =>
      'Override the background of dialogs and panels.';

  @override
  String get ttsEngineRust => 'Rust';

  @override
  String get settingsAdvancedLegacy => 'Legacy runtime';

  @override
  String logsExported(String path) {
    return 'Logs exported to $path';
  }
}
