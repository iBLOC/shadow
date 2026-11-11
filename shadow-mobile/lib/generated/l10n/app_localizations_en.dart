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
  String get askSomething => 'Ask something...';

  @override
  String get initializing => 'Initializing...';

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
  String get searchModels => 'Search models...';

  @override
  String get filterAll => 'All';

  @override
  String get local => 'Local';

  @override
  String get cloud => 'Cloud';

  @override
  String get loaded => 'Loaded';

  @override
  String get modelSettings => 'Model Settings';

  @override
  String get cancel => 'Cancel';

  @override
  String get apply => 'Apply';

  @override
  String get noModels => 'No Models';

  @override
  String get cloudModel => 'Cloud Model';

  @override
  String get endpoint => 'Endpoint';

  @override
  String get model => 'Model';

  @override
  String get apiKey => 'API Key';

  @override
  String get save => 'Save';

  @override
  String get provider => 'Provider';

  @override
  String errorGeneric(String detail) {
    return 'Error: $detail';
  }

  @override
  String get mobileNetworkDetected => 'Mobile Network Detected';

  @override
  String get waitForWifi => 'Wait for WiFi';

  @override
  String get downloadNow => 'Download Now';

  @override
  String get gallery => 'Gallery';

  @override
  String get camera => 'Camera';

  @override
  String get file => 'File';

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
  String get retry => 'Retry';

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
  String get custom => 'Custom';

  @override
  String get agent2UI => 'Agent2UI';

  @override
  String get removeAttachment => 'Remove attachment';

  @override
  String get dimensionUser => 'User';

  @override
  String get dimensionAgent => 'Agent';

  @override
  String get dimensionSession => 'Session';

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
  String get shadowEsp32PlayingFromUsbAudio =>
      'shadow-esp32 connected via USB Audio';

  @override
  String get customerServiceMode => 'Customer Service';

  @override
  String get aiAutoAnswer => 'AI Auto-Answer';

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
  String get conversationArchive => 'Archive';

  @override
  String get conversationUnarchive => 'Unarchive';

  @override
  String get conversationArchiveBox => 'Archive box';

  @override
  String get conversationArchiveBoxEmpty => 'No archived conversations';

  @override
  String get conversationArchivedBadge => 'Archived';

  @override
  String get conversationDeleteBody =>
      'This also deletes the copy in the hippocampus (the session and every message in it). It cannot be undone.';

  @override
  String conversationActionFailed(String error) {
    return 'Action failed: $error';
  }

  @override
  String get commonConfirmDelete => 'Confirm Delete';

  @override
  String get commonCancel => 'Cancel';

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
  String get commonAll => 'All';

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
  String get providerBuiltin => 'Built-in';

  @override
  String get providerModelNotDownloaded => 'Not downloaded';

  @override
  String get modelCategoryText => 'Text models';

  @override
  String get modelCategoryVision => 'Vision models';

  @override
  String get modelCatalogTitle => 'Supported models';

  @override
  String get modelCatalogHint =>
      'Models the embedded brain supports; local models marked \"not downloaded\" cannot run yet.';

  @override
  String get modelCatalogEmpty => 'Catalog not fetched yet';

  @override
  String get capLlm => 'Text';

  @override
  String get capVision => 'Vision';

  @override
  String get capAsr => 'Speech recognition';

  @override
  String get capTts => 'Speech synthesis';

  @override
  String get capEmbedding => 'Embedding';

  @override
  String get capRerank => 'Rerank';

  @override
  String get capOcr => 'OCR';

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
  String get providersApiKeyRequired => 'Please enter an API key';

  @override
  String get providersNameRequired => 'Please enter a provider name';

  @override
  String get providersStandard => 'API standard';

  @override
  String get providersPreviewModels => 'Preview models';

  @override
  String get providersSelectModel => 'Select model';

  @override
  String get providersRefreshModels => 'Refresh models';

  @override
  String get providersModelsNotFetched => 'Not fetched yet';

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
  String get taskEditPersistenceNote =>
      'Telencephalon task: the status can be changed at any time; the title, description, priority and tags are only written when the task is created.';

  @override
  String get taskDueTime => 'Due';

  @override
  String get taskDueTimeField => 'Due date';

  @override
  String get taskDueTimeHint =>
      'Optional. Relative times such as \"tomorrow 3pm\" are accepted.';

  @override
  String get taskConfirmationPoints => 'Confirmation points';

  @override
  String get taskNoConfirmationPoints => 'This task has no confirmation points';

  @override
  String get taskConfirmState => 'Confirmation';

  @override
  String get taskConfirmed => 'Confirmed';

  @override
  String get taskAwaitingConfirm => 'Awaiting confirmation';

  @override
  String get taskConfirmAction => 'Confirm task';

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
  String get logsClient => 'Client';

  @override
  String get logsApp => 'App';

  @override
  String get logsDevice => 'Device components';

  @override
  String get logsAllLevels => 'All levels';

  @override
  String get logsExport => 'Export logs';

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
  String get settingsEncephalonEmbedded => 'Brain Runtime';

  @override
  String get settingsEncephalonEmbeddedDesc =>
      'Brain runtime status, start/stop, and the in-process inference probe (model choice lives on the capability tab: the default-model card and the agents page)';

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
  String get chatGreeting => 'Hello! I am Shadow. How can I help you?';

  @override
  String get chatAttachmentNotAvailable =>
      'Only plain text is supported right now - images, files and other attachments are not supported yet';

  @override
  String chatSorryError(String error) {
    return 'Sorry, something went wrong: $error';
  }

  @override
  String get chatSorryErrorShort => 'Sorry, something went wrong';

  @override
  String get deviceThisMachine => 'This device';

  @override
  String get encephalonStartFailed => 'Failed to start the embedded brain';

  @override
  String get encephalonEmbeddedTitle => 'Brain Runtime';

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
  String get encephalonModelSourceTitle => 'Brain model source';

  @override
  String get encephalonModelSourceHint =>
      'Global default: every lobe uses this source. You can override a single lobe under \"Lobe model routing\" below.';

  @override
  String get encephalonModelLocalNeuron => 'Local neuron weights';

  @override
  String get encephalonModelNoCloudProvider =>
      'No cloud provider configured yet - add one in Model management first.';

  @override
  String get encephalonModelSourceApplied => 'New model source applied';

  @override
  String get encephalonModelSourceFailed => 'Failed to switch the model source';

  @override
  String get encephalonModelOptionsUnavailable =>
      'Could not read the provider catalog from the brain - it may not be running.';

  @override
  String get capabilityDefaultsTitle => 'Default model per capability';

  @override
  String get capabilityDefaultsHint =>
      'Text / speech recognition / speech synthesis each get their own default model; leave a tier unset and the brain picks one.';

  @override
  String get capabilityDefaultsAppliedButNotCached =>
      'Applied to the brain, but the local copy was not saved - this tier will reset after a restart.';

  @override
  String get capabilityDefaultUnset => 'Not set';

  @override
  String get capabilityDefaultsEmpty =>
      'This brain exposes no capability tiers.';

  @override
  String get encephalonLobeRoutingTitle => 'Lobe model routing';

  @override
  String get encephalonLobeFollowGlobal => 'Follow global';

  @override
  String get encephalonLobeRoutingApplied => 'Lobe model updated';

  @override
  String get encephalonLobeRoutingFailed => 'Failed to update the lobe model';

  @override
  String get encephalonLobeEffectiveLocal => 'Current: local neuron weights';

  @override
  String encephalonLobeEffectiveCloud(String name) {
    return 'Current: $name';
  }

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
  String get identityTitle => 'Identity';

  @override
  String get identityTitleDesc =>
      'Who this device is, and which memory it reads and writes';

  @override
  String get identityCurrentTitle => 'Who you are';

  @override
  String get identityCurrentDesc =>
      'The endbrain decides the tenant — the persona it reports is the memory isolation unit.';

  @override
  String get identityPrincipal => 'Person';

  @override
  String get identityPersona => 'Persona';

  @override
  String get identityDevice => 'Device';

  @override
  String get identityTenant => 'Memory bucket';

  @override
  String get identityNobody => '(nobody behind this)';

  @override
  String get identityExportTitle => 'Export account';

  @override
  String get identityExportDesc =>
      'Take the account key to another device and import it — both sides become the same person, writing into the same memory.';

  @override
  String get identityExportAction => 'Export account key';

  @override
  String get identityExportActionDesc =>
      'The account key IS the identity — whoever holds it is that person.';

  @override
  String get identityExportFailed =>
      'Export failed — the brain may not be running yet.';

  @override
  String get identityImportTitle => 'Import account';

  @override
  String get identityImportDesc =>
      'Paste an account key exported from another device — this device becomes that person.';

  @override
  String get identityImportAction => 'Import it';

  @override
  String get identityImportActionDesc =>
      'Import takes effect immediately, no brain restart.';

  @override
  String get identityImportPlaceholder => 'Account key';

  @override
  String get identityImportFailed =>
      'Import failed — the key is invalid, or the endbrain refused it.';

  @override
  String get identityImportDone => 'Imported — this device is that person now.';

  @override
  String get identityCopy => 'Copy';

  @override
  String get identityCopied => 'Copied to clipboard';

  @override
  String get settingsAdvancedLogs => 'Logs';

  @override
  String get settingsAdvancedBackend => 'Telencephalon backend';

  @override
  String get settingsAdvancedBackendDesc =>
      'Override the telencephalon base URL and admin token used by the mobile client.';

  @override
  String get settingsBackendAdminTokenHint =>
      'leave blank for the embedded brain (fill in for an external one)';

  @override
  String get settingsBackendShadowKeyHint =>
      'shadow key of an external telencephalon (leave blank if there is none)';

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
  String get settingsBackground => 'Background';

  @override
  String get settingsBackgroundDesc =>
      'Chat wallpaper and dialog backdrop color.';

  @override
  String get settingsAccentCustom => 'Custom';

  @override
  String get settingsAccentCustomPick => 'Custom color…';

  @override
  String get settingsAccentHue => 'Hue';

  @override
  String get settingsAccentSat => 'Saturation';

  @override
  String get settingsAccentLight => 'Lightness';

  @override
  String get settingsAccentApply => 'Apply';

  @override
  String get settingsChatBackground => 'Chat background';

  @override
  String get settingsChatBackgroundDesc =>
      'Pick a background image for the chat page.';

  @override
  String get settingsChatBackgroundPick => 'Choose image';

  @override
  String get settingsChatBackgroundClear => 'Clear';

  @override
  String settingsChatBackgroundFailed(String error) {
    return 'Failed to set background: $error';
  }

  @override
  String settingsConfigSaveFailed(String error) {
    return 'Not saved: $error';
  }

  @override
  String get surfaceA2ui => 'Generative UI';

  @override
  String get surfaceIdentity => 'Identity';

  @override
  String get agent2uiNoConnection => 'Not connected to the telencephalon';

  @override
  String get agent2uiWaiting => 'Connecting to the telencephalon…';

  @override
  String get agent2uiNoSurface =>
      'Connected, but the telencephalon produced no surface';

  @override
  String get agent2uiSurfaceHint =>
      'The surface drawn by the telencephalon will appear here';

  @override
  String get ttsEngineRust => 'Rust';

  @override
  String logsExported(String path) {
    return 'Logs exported to $path';
  }

  @override
  String get askAgent2UI => 'Ask the telencephalon to draw...';

  @override
  String get a2uiSurfaceReportTasks => 'Expanded the task board.';

  @override
  String get a2uiSurfaceReportAgents => 'Expanded the agent list.';

  @override
  String get a2uiSurfaceReportNoSurface =>
      'The telencephalon did not draw an interface this time.';

  @override
  String a2uiSurfaceReportNoSurfaceSaid(String words) {
    return 'The telencephalon did not draw an interface this time. It said: $words';
  }

  @override
  String get settingsGroupCapabilities => 'Capabilities';

  @override
  String get settingsGroupCapabilitiesDesc =>
      'You decide what the model may read on this phone, item by item';

  @override
  String get capabilityCalendarRead => 'Read calendar';

  @override
  String get capabilityCalendarWrite => 'Write calendar';

  @override
  String get capabilityContacts => 'Read contacts';

  @override
  String get capabilitySms => 'Read SMS';

  @override
  String get capabilityPhotos => 'Read photos';

  @override
  String get capabilityAuthAsk => 'Ask every time';

  @override
  String get capabilityAuthFull => 'Full access';

  @override
  String get capabilityAuthDisabled => 'Disabled';

  @override
  String get capabilityAuthAskDesc => 'Ask before every call';

  @override
  String get capabilityAuthFullDesc => 'No per-call prompt';

  @override
  String get capabilityAuthDisabledDesc =>
      'The model cannot see this capability';

  @override
  String get capabilitySystemGranted => 'System permission granted';

  @override
  String get capabilitySystemMissing => 'System permission not granted';

  @override
  String get capabilityRejectedDisabled =>
      'This capability has been disabled in settings';

  @override
  String get capabilityUnsupportedPlatform => 'Not supported on this platform';

  @override
  String get capabilityMobileUse => 'Phone control';

  @override
  String get capabilityRequestMobileUse => 'to control this phone';

  @override
  String get capabilityRequestMobileReadScreen =>
      'to read what is currently on this phone screen';

  @override
  String get capabilityRequestMobileTap =>
      'to tap a point on this phone screen';

  @override
  String get capabilityRequestMobileLongPress =>
      'to press and hold a point on this phone screen';

  @override
  String get capabilityRequestMobileSwipe => 'to swipe on this phone screen';

  @override
  String get capabilityRequestMobileFindAndClick =>
      'to click a control on this phone screen by its text';

  @override
  String get capabilityRequestMobileGlobalAction =>
      'to trigger a system action on this phone';

  @override
  String capabilityArgMobilePoint(String x, String y) {
    return 'at $x, $y';
  }

  @override
  String capabilityArgMobileSwipe(String x1, String y1, String x2, String y2) {
    return 'from $x1, $y1 to $x2, $y2';
  }

  @override
  String capabilityArgMobileText(String text) {
    return 'text \"$text\"';
  }

  @override
  String capabilityArgMobileAction(String action) {
    return 'action: $action';
  }

  @override
  String get capabilityServiceGranted => 'Accessibility service enabled';

  @override
  String get capabilityServiceMissing => 'Accessibility service not enabled';

  @override
  String get capabilityGrantService => 'Enable';

  @override
  String get toolCallAllow => 'Allow';

  @override
  String get toolCallDeny => 'Deny';

  @override
  String get capabilityRequestCalendarRead =>
      'Read calendar events on this phone';

  @override
  String get capabilityRequestCalendarWrite =>
      'Write an event to the calendar on this phone';

  @override
  String get capabilityRequestContacts => 'Read the contacts on this phone';

  @override
  String get capabilityRequestSms => 'Read the SMS messages on this phone';

  @override
  String get capabilityRequestPhotos =>
      'Read photo information from this phone';

  @override
  String capabilityArgTimeRange(String from, String to) {
    return '$from ~ $to';
  }

  @override
  String get capabilityArgTimeRangeDefault => 'the next 7 days';

  @override
  String capabilityArgTitle(String title) {
    return 'Title “$title”';
  }

  @override
  String capabilityArgStartAt(String time) {
    return 'starting $time';
  }

  @override
  String capabilityArgKeyword(String query) {
    return 'name contains “$query”';
  }

  @override
  String capabilityArgContactsHead(String count) {
    return 'the first $count contacts';
  }

  @override
  String capabilityArgRecentSms(String count) {
    return 'the most recent $count messages';
  }

  @override
  String capabilityArgRecentPhotos(String count) {
    return 'the most recent $count photos';
  }

  @override
  String get capabilityGrantSystemPermission => 'Grant';

  @override
  String get capabilityGrantSucceeded => 'Granted';

  @override
  String get capabilityGrantDenied => 'Permission denied';

  @override
  String get capabilityGrantNeedsSettingsTitle =>
      'The system will not ask again';

  @override
  String get capabilityGrantNeedsSettingsBody =>
      'Needs to be turned on in system settings';

  @override
  String get capabilityGrantGoToSettings => 'Open settings';

  @override
  String capabilityPermissionRequired(String permission) {
    return 'System permission needed: $permission';
  }

  @override
  String get capabilityPermissionRequiredAccessibility =>
      'the accessibility service (phone control)';

  @override
  String capabilityDeclarationMismatch(String declared, String required) {
    return 'Permission declaration does not match: the model declared $declared, but this tool really needs $required';
  }

  @override
  String get backgroundKeepAlive => 'Keep running in background';

  @override
  String get backgroundKeepAliveHint =>
      'Keeps the on-device brain and engines alive while backgrounded (shows a persistent notification)';

  @override
  String get backgroundServiceStatus => 'Foreground service';

  @override
  String get backgroundServiceOn => 'Running';

  @override
  String get backgroundServiceOff => 'Not running';

  @override
  String get backgroundServiceTitle => 'Shadow is running';

  @override
  String get backgroundServiceText =>
      'Brain and local engines stay alive in the background';

  @override
  String get backgroundStop => 'Stop';

  @override
  String get batteryOptimization => 'Battery optimization exemption';

  @override
  String get batteryOptimizationExempt =>
      'Exempted — background running is reliable';

  @override
  String get batteryOptimizationAsk =>
      'Not exempted yet (needed on aggressive systems like MIUI)';

  @override
  String get batteryOptimizationRequest => 'Request';

  @override
  String get selfHostedAdd => 'Add self-hosted model';

  @override
  String get selfHostedTitle => 'Add self-hosted model';

  @override
  String get selfHostedModelId => 'Model ID';

  @override
  String get selfHostedModelIdRequired => 'Model ID is required';

  @override
  String get selfHostedDisplayName => 'Display name (optional)';

  @override
  String get selfHostedEndpoint => 'Endpoint (OpenAI-compatible base URL)';

  @override
  String get selfHostedEndpointRequired => 'Endpoint is required';

  @override
  String get selfHostedApiKeyOptional => 'API key (optional)';

  @override
  String get selfHostedContextWindow => 'Context window';

  @override
  String get selfHostedMaxOutput => 'Max output tokens';

  @override
  String get selfHostedInputTypes => 'Input types';

  @override
  String get selfHostedCapabilities => 'Capabilities';

  @override
  String get selfHostedReasoningLevels =>
      'Reasoning effort levels (low to high)';

  @override
  String get selfHostedReasoningOff => 'Not supported';

  @override
  String get selfHostedAdvanced => 'Advanced';

  @override
  String get selfHostedReasoningMapping => 'Reasoning parameter mapping';

  @override
  String get selfHostedReasoningMappingHint =>
      'JSON snapshot: standard × level → request body params';

  @override
  String get selfHostedAdvancedConfig => 'Advanced config (JSON)';

  @override
  String get selfHostedProbe => 'Probe models from endpoint';

  @override
  String get selfHostedProbeEmpty => 'Endpoint returned no models';

  @override
  String get selfHostedProbePick => 'Pick a model ID';

  @override
  String get selfHostedSubmit => 'Add';

  @override
  String get selfHostedSaving => 'Adding…';

  @override
  String get smartConfigBadge => 'Smart config';

  @override
  String get inputTypeText => 'Text';

  @override
  String get inputTypeImage => 'Image';

  @override
  String get inputTypeAudio => 'Audio';

  @override
  String get inputTypeVideo => 'Video';

  @override
  String get cloudGuideTitle => 'Cloud models live with providers';

  @override
  String get cloudGuideDesc =>
      'Add a cloud provider and its supported models are fetched automatically.';

  @override
  String get voiceNoteBrainAsrPending =>
      'Voice transcription is not wired to the brain\'s speech-recognition face yet — type your question, or wait until it is connected.';

  @override
  String get zitiGroup => 'Zero Trust';

  @override
  String get zitiGroupDesc =>
      'Put this phone on the zero-trust network: reach a remote brain, or publish this one';

  @override
  String get zitiMode => 'Role';

  @override
  String get zitiModeOff => 'No zero trust';

  @override
  String get zitiModeClient => 'Reach a remote brain';

  @override
  String get zitiModeServer => 'Publish this brain';

  @override
  String get zitiModeHint =>
      'Save to apply. The role is decided at startup, so restart the app.';

  @override
  String get zitiService => 'Service';

  @override
  String get zitiServicePlaceholder => 'shadow-brain';

  @override
  String get zitiServiceHint => 'The zero-trust service to dial or publish';

  @override
  String get zitiIdentity => 'Identity';

  @override
  String get zitiIdentityNone => 'No identity imported yet';

  @override
  String zitiIdentityLoaded(String api, String id) {
    return 'Imported: controller $api · identity $id';
  }

  @override
  String zitiIdentityLoadedNoId(String api) {
    return 'Imported: controller $api';
  }

  @override
  String get zitiIdentityPlaceholder =>
      'Paste the identity JSON (ztAPI / id / ca / cert / key)';

  @override
  String get zitiIdentityHint =>
      'The identity must carry inline ca / cert / key PEMs; a file path is rejected explicitly (that file does not exist here)';

  @override
  String get zitiImport => 'Import identity';

  @override
  String get zitiClearIdentity => 'Delete identity';

  @override
  String get zitiSavedHint => 'Saved (restart the app to apply)';

  @override
  String get zitiRestartHint =>
      'The zero-trust role is fixed at startup ⇒ saving only writes the file; restart the app to apply.';

  @override
  String get zitiSecretHint =>
      'The identity holds a private key and lives in the app-private directory; shadow key / admin token stay in the host, not here.';

  @override
  String get zitiImportFailed => 'Import failed';

  @override
  String get zitiSaveFailed => 'Save failed';

  @override
  String get capabilityDefaultsUnusableNow =>
      'These tiers point at a model this brain has not registered - the setting is saved, but it cannot run until the engine is registered.';

  @override
  String get providersDownloadModels => 'Download local models';

  @override
  String get providersDownloadedOnly => 'Downloaded';

  @override
  String get providersDownloadAction => 'Download';

  @override
  String get providersDownloading => 'Downloading…';

  @override
  String get providersDownloadFailed => 'Download failed';

  @override
  String get providersDownloadNoLocal => 'No downloaded local models yet';

  @override
  String get providersDownloadRetry => 'Retry';

  @override
  String get providersDownloadDone => 'Download complete';

  @override
  String providersDownloadProgress(int received, int total) {
    return 'Downloading $received / $total';
  }

  @override
  String providersDownloadReceived(int received) {
    return '$received downloaded';
  }

  @override
  String get providersDownloadEmpty => 'The brain returned no model catalog';
}
