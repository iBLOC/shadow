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
  String get cortexFlows => 'Cortex Flows';

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
  String get openVoiceMode => 'Voice Assistant';

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
      'Automatically answer incoming calls and respond with AI (cortex / LiteRT).';

  @override
  String get endCall => 'End Call';

  @override
  String get openLiveStreamMode => 'Live Stream';

  @override
  String get customerServiceHint =>
      'AI will answer incoming calls and reply using the LLM. Shadow-esp32 plays caller voice and AI response. Plug earphone to take over.';

  @override
  String get visualQaPickCamera => 'Pick a camera';

  @override
  String visualQaPicked(Object label) {
    return 'Picked $label';
  }
}
