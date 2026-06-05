import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('zh'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Shadow'**
  String get appTitle;

  /// No description provided for @models.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get models;

  /// No description provided for @settings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// No description provided for @startConversation.
  ///
  /// In en, this message translates to:
  /// **'Start a conversation'**
  String get startConversation;

  /// No description provided for @addLocalModelComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Add local model dialog coming soon'**
  String get addLocalModelComingSoon;

  /// No description provided for @askSomething.
  ///
  /// In en, this message translates to:
  /// **'Ask something...'**
  String get askSomething;

  /// No description provided for @initializing.
  ///
  /// In en, this message translates to:
  /// **'Initializing...'**
  String get initializing;

  /// No description provided for @modelInfo.
  ///
  /// In en, this message translates to:
  /// **'Model Info'**
  String get modelInfo;

  /// No description provided for @resetEngine.
  ///
  /// In en, this message translates to:
  /// **'Reset Engine'**
  String get resetEngine;

  /// No description provided for @reinitializeMnn.
  ///
  /// In en, this message translates to:
  /// **'Reinitialize the MNN engine'**
  String get reinitializeMnn;

  /// No description provided for @theme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get theme;

  /// No description provided for @accessibilityControl.
  ///
  /// In en, this message translates to:
  /// **'Accessibility Control'**
  String get accessibilityControl;

  /// No description provided for @accessibilityOn.
  ///
  /// In en, this message translates to:
  /// **'Enabled. You can control device tap/swipe.'**
  String get accessibilityOn;

  /// No description provided for @accessibilityOff.
  ///
  /// In en, this message translates to:
  /// **'Disabled. Tap to open settings.'**
  String get accessibilityOff;

  /// No description provided for @addModel.
  ///
  /// In en, this message translates to:
  /// **'Add Model'**
  String get addModel;

  /// No description provided for @addLocalModel.
  ///
  /// In en, this message translates to:
  /// **'Add Local Model'**
  String get addLocalModel;

  /// No description provided for @addCloudModel.
  ///
  /// In en, this message translates to:
  /// **'Add Cloud Model'**
  String get addCloudModel;

  /// No description provided for @searchModels.
  ///
  /// In en, this message translates to:
  /// **'Search models...'**
  String get searchModels;

  /// No description provided for @filterAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get filterAll;

  /// No description provided for @filterText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get filterText;

  /// No description provided for @filterVision.
  ///
  /// In en, this message translates to:
  /// **'Vision'**
  String get filterVision;

  /// No description provided for @filterAudio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get filterAudio;

  /// No description provided for @filterLocal.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get filterLocal;

  /// No description provided for @filterCloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud'**
  String get filterCloud;

  /// No description provided for @local.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get local;

  /// No description provided for @cloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud'**
  String get cloud;

  /// No description provided for @loaded.
  ///
  /// In en, this message translates to:
  /// **'Loaded'**
  String get loaded;

  /// No description provided for @notLoaded.
  ///
  /// In en, this message translates to:
  /// **'Not loaded'**
  String get notLoaded;

  /// No description provided for @modelSettings.
  ///
  /// In en, this message translates to:
  /// **'Model Settings'**
  String get modelSettings;

  /// No description provided for @threadCount.
  ///
  /// In en, this message translates to:
  /// **'Thread Count: {n}'**
  String threadCount(int n);

  /// No description provided for @backendType.
  ///
  /// In en, this message translates to:
  /// **'Backend Type'**
  String get backendType;

  /// No description provided for @cpu.
  ///
  /// In en, this message translates to:
  /// **'CPU'**
  String get cpu;

  /// No description provided for @opencl.
  ///
  /// In en, this message translates to:
  /// **'OpenCL'**
  String get opencl;

  /// No description provided for @metal.
  ///
  /// In en, this message translates to:
  /// **'Metal'**
  String get metal;

  /// No description provided for @modelPath.
  ///
  /// In en, this message translates to:
  /// **'Model Path'**
  String get modelPath;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @apply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get apply;

  /// No description provided for @noModels.
  ///
  /// In en, this message translates to:
  /// **'No Models'**
  String get noModels;

  /// No description provided for @addModelToGetStarted.
  ///
  /// In en, this message translates to:
  /// **'Add a model to get started'**
  String get addModelToGetStarted;

  /// No description provided for @cloudModel.
  ///
  /// In en, this message translates to:
  /// **'Cloud Model'**
  String get cloudModel;

  /// No description provided for @endpoint.
  ///
  /// In en, this message translates to:
  /// **'Endpoint'**
  String get endpoint;

  /// No description provided for @model.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get model;

  /// No description provided for @apiKey.
  ///
  /// In en, this message translates to:
  /// **'API Key'**
  String get apiKey;

  /// No description provided for @notSet.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get notSet;

  /// No description provided for @configureCloudModel.
  ///
  /// In en, this message translates to:
  /// **'Configure Cloud Model'**
  String get configureCloudModel;

  /// No description provided for @apiEndpoint.
  ///
  /// In en, this message translates to:
  /// **'API Endpoint'**
  String get apiEndpoint;

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @cloudModelSettings.
  ///
  /// In en, this message translates to:
  /// **'Cloud Model Settings'**
  String get cloudModelSettings;

  /// No description provided for @provider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get provider;

  /// No description provided for @modelInfoNotInitialized.
  ///
  /// In en, this message translates to:
  /// **'Not initialized'**
  String get modelInfoNotInitialized;

  /// No description provided for @modelLoaded.
  ///
  /// In en, this message translates to:
  /// **'Model loaded'**
  String get modelLoaded;

  /// No description provided for @desktopMode.
  ///
  /// In en, this message translates to:
  /// **'Desktop mode (Android only)'**
  String get desktopMode;

  /// No description provided for @errorMnnInitFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to initialize MNN engine'**
  String get errorMnnInitFailed;

  /// No description provided for @initializingMnn.
  ///
  /// In en, this message translates to:
  /// **'Initializing MNN engine...'**
  String get initializingMnn;

  /// No description provided for @mnnInitSuccess.
  ///
  /// In en, this message translates to:
  /// **'MNN engine initialized successfully!\nModel loaded\nYou can now start chatting.'**
  String get mnnInitSuccess;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Error: {detail}'**
  String errorGeneric(String detail);

  /// No description provided for @desktopUnsupportedMessage.
  ///
  /// In en, this message translates to:
  /// **'MNN engine is only available on Android.\nThis is a desktop build - local LLM features are disabled.\nYou can still use cloud models.'**
  String get desktopUnsupportedMessage;

  /// No description provided for @mobileNetworkDetected.
  ///
  /// In en, this message translates to:
  /// **'Mobile Network Detected'**
  String get mobileNetworkDetected;

  /// No description provided for @downloadOnMobile.
  ///
  /// In en, this message translates to:
  /// **'You are on mobile data. The model ({modelSize}) will be downloaded. Do you want to download now or wait for WiFi?'**
  String downloadOnMobile(String modelSize);

  /// No description provided for @waitForWifi.
  ///
  /// In en, this message translates to:
  /// **'Wait for WiFi'**
  String get waitForWifi;

  /// No description provided for @downloadNow.
  ///
  /// In en, this message translates to:
  /// **'Download Now'**
  String get downloadNow;

  /// No description provided for @gallery.
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get gallery;

  /// No description provided for @camera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get camera;

  /// No description provided for @file.
  ///
  /// In en, this message translates to:
  /// **'File'**
  String get file;

  /// No description provided for @textMode.
  ///
  /// In en, this message translates to:
  /// **'Message Mode'**
  String get textMode;

  /// No description provided for @voiceMode.
  ///
  /// In en, this message translates to:
  /// **'Conversation Mode'**
  String get voiceMode;

  /// No description provided for @agent2uiReady.
  ///
  /// In en, this message translates to:
  /// **'Agent2UI Ready'**
  String get agent2uiReady;

  /// No description provided for @askMeAnything.
  ///
  /// In en, this message translates to:
  /// **'Ask me anything and I will generate UI for you'**
  String get askMeAnything;

  /// No description provided for @connectedToShadowA2AServer.
  ///
  /// In en, this message translates to:
  /// **'Connected to Shadow A2A Server'**
  String get connectedToShadowA2AServer;

  /// No description provided for @connectingToShadow.
  ///
  /// In en, this message translates to:
  /// **'Connecting to Shadow...'**
  String get connectingToShadow;

  /// No description provided for @connectionError.
  ///
  /// In en, this message translates to:
  /// **'Connection error'**
  String get connectionError;

  /// No description provided for @disconnected.
  ///
  /// In en, this message translates to:
  /// **'Disconnected'**
  String get disconnected;

  /// No description provided for @connecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting...'**
  String get connecting;

  /// No description provided for @disconnect.
  ///
  /// In en, this message translates to:
  /// **'Disconnect'**
  String get disconnect;

  /// No description provided for @holdToRecord.
  ///
  /// In en, this message translates to:
  /// **'Hold to record'**
  String get holdToRecord;

  /// No description provided for @recording.
  ///
  /// In en, this message translates to:
  /// **'Recording...'**
  String get recording;

  /// No description provided for @downloadComplete.
  ///
  /// In en, this message translates to:
  /// **'Download complete!'**
  String get downloadComplete;

  /// No description provided for @downloadFailed.
  ///
  /// In en, this message translates to:
  /// **'Download failed'**
  String get downloadFailed;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @startChatting.
  ///
  /// In en, this message translates to:
  /// **'Start Chatting'**
  String get startChatting;

  /// No description provided for @manage.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get manage;

  /// No description provided for @providers.
  ///
  /// In en, this message translates to:
  /// **'Providers'**
  String get providers;

  /// No description provided for @skills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get skills;

  /// No description provided for @agents.
  ///
  /// In en, this message translates to:
  /// **'Agents'**
  String get agents;

  /// No description provided for @memory.
  ///
  /// In en, this message translates to:
  /// **'Memory'**
  String get memory;

  /// No description provided for @mcp.
  ///
  /// In en, this message translates to:
  /// **'MCP'**
  String get mcp;

  /// No description provided for @conversations.
  ///
  /// In en, this message translates to:
  /// **'Conversations'**
  String get conversations;

  /// No description provided for @tasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get tasks;

  /// No description provided for @localModels.
  ///
  /// In en, this message translates to:
  /// **'Local Models'**
  String get localModels;

  /// No description provided for @modelStore.
  ///
  /// In en, this message translates to:
  /// **'Model Store'**
  String get modelStore;

  /// No description provided for @noModelsAvailable.
  ///
  /// In en, this message translates to:
  /// **'No models available'**
  String get noModelsAvailable;

  /// No description provided for @serviceStatus.
  ///
  /// In en, this message translates to:
  /// **'Service Status'**
  String get serviceStatus;

  /// No description provided for @healthy.
  ///
  /// In en, this message translates to:
  /// **'Healthy'**
  String get healthy;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get offline;

  /// No description provided for @checking.
  ///
  /// In en, this message translates to:
  /// **'Checking...'**
  String get checking;

  /// No description provided for @unhealthy.
  ///
  /// In en, this message translates to:
  /// **'Unhealthy'**
  String get unhealthy;

  /// No description provided for @unknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknown;

  /// No description provided for @modelStoreUrlUpdated.
  ///
  /// In en, this message translates to:
  /// **'Model store URL updated'**
  String get modelStoreUrlUpdated;

  /// No description provided for @modelStoreServer.
  ///
  /// In en, this message translates to:
  /// **'Model Store Server'**
  String get modelStoreServer;

  /// No description provided for @custom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get custom;

  /// No description provided for @defaultOption.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get defaultOption;

  /// No description provided for @liteRT.
  ///
  /// In en, this message translates to:
  /// **'LiteRT'**
  String get liteRT;

  /// No description provided for @agent2UI.
  ///
  /// In en, this message translates to:
  /// **'Agent2UI'**
  String get agent2UI;

  /// No description provided for @voiceInputPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'[Voice input: {count} samples]'**
  String voiceInputPlaceholder(int count);

  /// No description provided for @audioProcessingNotImplemented.
  ///
  /// In en, this message translates to:
  /// **'[This is a placeholder response. Audio processing not yet implemented.]'**
  String get audioProcessingNotImplemented;

  /// No description provided for @removeAttachment.
  ///
  /// In en, this message translates to:
  /// **'Remove attachment'**
  String get removeAttachment;

  /// No description provided for @webviewSkillNotImplemented.
  ///
  /// In en, this message translates to:
  /// **'[Webview skill execution not yet implemented]'**
  String get webviewSkillNotImplemented;

  /// No description provided for @nativeSkillNotImplemented.
  ///
  /// In en, this message translates to:
  /// **'[Native skill execution not yet implemented]'**
  String get nativeSkillNotImplemented;

  /// No description provided for @dimensionUser.
  ///
  /// In en, this message translates to:
  /// **'User'**
  String get dimensionUser;

  /// No description provided for @dimensionAgent.
  ///
  /// In en, this message translates to:
  /// **'Agent'**
  String get dimensionAgent;

  /// No description provided for @dimensionSession.
  ///
  /// In en, this message translates to:
  /// **'Session'**
  String get dimensionSession;

  /// No description provided for @dimensionResources.
  ///
  /// In en, this message translates to:
  /// **'Resources'**
  String get dimensionResources;

  /// No description provided for @score.
  ///
  /// In en, this message translates to:
  /// **'Score: {value}'**
  String score(String value);

  /// No description provided for @toDo.
  ///
  /// In en, this message translates to:
  /// **'To Do'**
  String get toDo;

  /// No description provided for @inProgress.
  ///
  /// In en, this message translates to:
  /// **'In Progress'**
  String get inProgress;

  /// No description provided for @done.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// No description provided for @welcomeMessage.
  ///
  /// In en, this message translates to:
  /// **'Hello! I can hear your voice.'**
  String get welcomeMessage;

  /// No description provided for @tellMeStory.
  ///
  /// In en, this message translates to:
  /// **'Tell me a story'**
  String get tellMeStory;

  /// No description provided for @whatCanYouHelp.
  ///
  /// In en, this message translates to:
  /// **'What can you help me with?'**
  String get whatCanYouHelp;

  /// No description provided for @howAudioWorks.
  ///
  /// In en, this message translates to:
  /// **'How does audio input work?'**
  String get howAudioWorks;

  /// No description provided for @ttsSettings.
  ///
  /// In en, this message translates to:
  /// **'TTS Voice Synthesis'**
  String get ttsSettings;

  /// No description provided for @ttsEngine.
  ///
  /// In en, this message translates to:
  /// **'Voice Engine'**
  String get ttsEngine;

  /// No description provided for @ttsEngineAndroid.
  ///
  /// In en, this message translates to:
  /// **'Android Built-in'**
  String get ttsEngineAndroid;

  /// No description provided for @ttsEngineExternal.
  ///
  /// In en, this message translates to:
  /// **'External Service'**
  String get ttsEngineExternal;

  /// No description provided for @ttsStatus.
  ///
  /// In en, this message translates to:
  /// **'Engine Status'**
  String get ttsStatus;

  /// No description provided for @ttsReady.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get ttsReady;

  /// No description provided for @ttsNotReady.
  ///
  /// In en, this message translates to:
  /// **'Not Ready'**
  String get ttsNotReady;

  /// No description provided for @ttsExternalUrl.
  ///
  /// In en, this message translates to:
  /// **'External TTS Service URL'**
  String get ttsExternalUrl;

  /// No description provided for @ttsExternalUrlHint.
  ///
  /// In en, this message translates to:
  /// **'Enter external TTS API URL'**
  String get ttsExternalUrlHint;

  /// No description provided for @ttsTest.
  ///
  /// In en, this message translates to:
  /// **'Test Speech'**
  String get ttsTest;

  /// No description provided for @ttsTestText.
  ///
  /// In en, this message translates to:
  /// **'Hello, this is a speech synthesis test'**
  String get ttsTestText;

  /// No description provided for @continueDesktopTitle.
  ///
  /// In en, this message translates to:
  /// **'Continue on desktop'**
  String get continueDesktopTitle;

  /// No description provided for @continueDesktopDescription.
  ///
  /// In en, this message translates to:
  /// **'Hand off this conversation to another Shadow node on the LAN and pick it up there.'**
  String get continueDesktopDescription;

  /// No description provided for @continueDesktopConfirm.
  ///
  /// In en, this message translates to:
  /// **'Continue now'**
  String get continueDesktopConfirm;

  /// No description provided for @continueDesktopNoPeers.
  ///
  /// In en, this message translates to:
  /// **'No Shadow nodes discovered yet'**
  String get continueDesktopNoPeers;

  /// No description provided for @continueDesktopMessageCount.
  ///
  /// In en, this message translates to:
  /// **'{count} messages'**
  String continueDesktopMessageCount(Object count);

  /// No description provided for @continueDesktopSizeKb.
  ///
  /// In en, this message translates to:
  /// **'{kb} KB'**
  String continueDesktopSizeKb(Object kb);

  /// No description provided for @continueDesktopPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing…'**
  String get continueDesktopPreparing;

  /// No description provided for @continueDesktopInProgress.
  ///
  /// In en, this message translates to:
  /// **'Sending to {peer}…'**
  String continueDesktopInProgress(Object peer);

  /// No description provided for @continueDesktopSuccess.
  ///
  /// In en, this message translates to:
  /// **'Moved to {peer}'**
  String continueDesktopSuccess(Object peer);

  /// No description provided for @continueDesktopError.
  ///
  /// In en, this message translates to:
  /// **'Move failed: {error}'**
  String continueDesktopError(Object error);

  /// No description provided for @addManually.
  ///
  /// In en, this message translates to:
  /// **'Add manually'**
  String get addManually;

  /// No description provided for @wakeWordHeard.
  ///
  /// In en, this message translates to:
  /// **'Heard you'**
  String get wakeWordHeard;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
