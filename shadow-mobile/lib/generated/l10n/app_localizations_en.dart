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
  String get reinitializeMnn => 'Reinitialize the MNN engine';

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
  String get errorMnnInitFailed => 'Failed to initialize MNN engine';

  @override
  String get initializingMnn => 'Initializing MNN engine...';

  @override
  String get mnnInitSuccess =>
      'MNN engine initialized successfully!\nModel loaded\nYou can now start chatting.';

  @override
  String errorGeneric(String detail) {
    return 'Error: $detail';
  }

  @override
  String get desktopUnsupportedMessage =>
      'MNN engine is only available on Android.\nThis is a desktop build - local LLM features are disabled.\nYou can still use cloud models.';
}
