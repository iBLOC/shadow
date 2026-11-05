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

  /// No description provided for @waitingForWifiHint.
  ///
  /// In en, this message translates to:
  /// **'Waiting for WiFi — the model will download automatically once connected.'**
  String get waitingForWifiHint;

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
  /// **'Continue on Desktop'**
  String get continueDesktopTitle;

  /// No description provided for @continueDesktopDescription.
  ///
  /// In en, this message translates to:
  /// **'Pick a desktop peer to hand this conversation off to. Audio and TTS stay on the phone; inference moves to the desktop.'**
  String get continueDesktopDescription;

  /// No description provided for @continueDesktopConfirm.
  ///
  /// In en, this message translates to:
  /// **'Hand off'**
  String get continueDesktopConfirm;

  /// No description provided for @continueDesktopNoPeers.
  ///
  /// In en, this message translates to:
  /// **'No desktop peers found. Make sure your desktop is running and on the same network.'**
  String get continueDesktopNoPeers;

  /// No description provided for @continueDesktopProvider.
  ///
  /// In en, this message translates to:
  /// **'Desktop peer'**
  String get continueDesktopProvider;

  /// No description provided for @continueDesktopMessageCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No messages yet} =1{1 message} other{{count} messages}}'**
  String continueDesktopMessageCount(int count);

  /// No description provided for @continueDesktopSizeKb.
  ///
  /// In en, this message translates to:
  /// **'{size} KB'**
  String continueDesktopSizeKb(int size);

  /// No description provided for @continueDesktopPreparing.
  ///
  /// In en, this message translates to:
  /// **'Preparing handoff...'**
  String get continueDesktopPreparing;

  /// No description provided for @continueDesktopInProgress.
  ///
  /// In en, this message translates to:
  /// **'Handing off to {peer}...'**
  String continueDesktopInProgress(String peer);

  /// No description provided for @continueDesktopSuccess.
  ///
  /// In en, this message translates to:
  /// **'Handoff to {peer} complete. Open the conversation on your desktop.'**
  String continueDesktopSuccess(String peer);

  /// No description provided for @continueDesktopError.
  ///
  /// In en, this message translates to:
  /// **'Handoff failed: {message}'**
  String continueDesktopError(String message);

  /// No description provided for @addManually.
  ///
  /// In en, this message translates to:
  /// **'Add manually'**
  String get addManually;

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @telencephalonFlows.
  ///
  /// In en, this message translates to:
  /// **'Telencephalon Flows'**
  String get telencephalonFlows;

  /// No description provided for @active.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get active;

  /// No description provided for @drafts.
  ///
  /// In en, this message translates to:
  /// **'Drafts'**
  String get drafts;

  /// No description provided for @liveStreamMode.
  ///
  /// In en, this message translates to:
  /// **'Live Stream'**
  String get liveStreamMode;

  /// No description provided for @audioOutput.
  ///
  /// In en, this message translates to:
  /// **'Audio Output'**
  String get audioOutput;

  /// No description provided for @routePhoneSpeaker.
  ///
  /// In en, this message translates to:
  /// **'Phone Speaker'**
  String get routePhoneSpeaker;

  /// No description provided for @routeBluetoothHeadset.
  ///
  /// In en, this message translates to:
  /// **'Bluetooth'**
  String get routeBluetoothHeadset;

  /// No description provided for @routeShadowEsp32.
  ///
  /// In en, this message translates to:
  /// **'shadow-esp32'**
  String get routeShadowEsp32;

  /// No description provided for @shadowEsp32ReceivesAudio.
  ///
  /// In en, this message translates to:
  /// **'shadow-esp32 is receiving audio'**
  String get shadowEsp32ReceivesAudio;

  /// No description provided for @routeViaBluetoothA2dp.
  ///
  /// In en, this message translates to:
  /// **'via Bluetooth'**
  String get routeViaBluetoothA2dp;

  /// No description provided for @routeViaPhoneSpeaker.
  ///
  /// In en, this message translates to:
  /// **'via phone speaker'**
  String get routeViaPhoneSpeaker;

  /// No description provided for @modeMismatch.
  ///
  /// In en, this message translates to:
  /// **'Current mode does not match this screen. Tap the mic icon in the top-right to switch to voice mode.'**
  String get modeMismatch;

  /// No description provided for @ttsInputLabel.
  ///
  /// In en, this message translates to:
  /// **'Text to speak'**
  String get ttsInputLabel;

  /// No description provided for @ttsInputHint.
  ///
  /// In en, this message translates to:
  /// **'Type what the digital human should say…'**
  String get ttsInputHint;

  /// No description provided for @startTts.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get startTts;

  /// No description provided for @stopTts.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get stopTts;

  /// No description provided for @routeSelected.
  ///
  /// In en, this message translates to:
  /// **'Output: {device}'**
  String routeSelected(String device);

  /// No description provided for @digitalHumanTtsNow.
  ///
  /// In en, this message translates to:
  /// **'Live Stream Mode'**
  String get digitalHumanTtsNow;

  /// No description provided for @shadowEsp32PlayingFromUsbAudio.
  ///
  /// In en, this message translates to:
  /// **'shadow-esp32 connected via USB Audio'**
  String get shadowEsp32PlayingFromUsbAudio;

  /// No description provided for @customerServiceMode.
  ///
  /// In en, this message translates to:
  /// **'Customer Service'**
  String get customerServiceMode;

  /// No description provided for @callState.
  ///
  /// In en, this message translates to:
  /// **'Call State'**
  String get callState;

  /// No description provided for @callStateIdle.
  ///
  /// In en, this message translates to:
  /// **'Idle'**
  String get callStateIdle;

  /// No description provided for @callStateRinging.
  ///
  /// In en, this message translates to:
  /// **'Ringing'**
  String get callStateRinging;

  /// No description provided for @callStateActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get callStateActive;

  /// No description provided for @callStateEnded.
  ///
  /// In en, this message translates to:
  /// **'Ended'**
  String get callStateEnded;

  /// No description provided for @earphoneTakeoverActive.
  ///
  /// In en, this message translates to:
  /// **'Wired earphone detected — audio routed to earphone for human takeover.'**
  String get earphoneTakeoverActive;

  /// No description provided for @earphoneTakeoverAudioRouteNote.
  ///
  /// In en, this message translates to:
  /// **'When earphone is connected, call audio automatically routes to earphone. Plug it back out to route to shadow-esp32.'**
  String get earphoneTakeoverAudioRouteNote;

  /// No description provided for @aiAutoAnswer.
  ///
  /// In en, this message translates to:
  /// **'AI Auto-Answer'**
  String get aiAutoAnswer;

  /// No description provided for @aiAutoAnswerDesc.
  ///
  /// In en, this message translates to:
  /// **'Automatically answer incoming calls and respond with AI (telencephalon / LiteRT).'**
  String get aiAutoAnswerDesc;

  /// No description provided for @endCall.
  ///
  /// In en, this message translates to:
  /// **'End Call'**
  String get endCall;

  /// No description provided for @openLiveStreamMode.
  ///
  /// In en, this message translates to:
  /// **'Live Stream'**
  String get openLiveStreamMode;

  /// No description provided for @openVoiceAssistant.
  ///
  /// In en, this message translates to:
  /// **'Voice Assistant'**
  String get openVoiceAssistant;

  /// No description provided for @customerServiceHint.
  ///
  /// In en, this message translates to:
  /// **'AI will answer incoming calls and reply using the LLM. Shadow-esp32 plays caller voice and AI response. Plug earphone to take over.'**
  String get customerServiceHint;

  /// No description provided for @visualQaPickCamera.
  ///
  /// In en, this message translates to:
  /// **'Pick a camera'**
  String get visualQaPickCamera;

  /// No description provided for @visualQaPicked.
  ///
  /// In en, this message translates to:
  /// **'Picked {label}'**
  String visualQaPicked(Object label);

  /// No description provided for @modelBindingPromptTitle.
  ///
  /// In en, this message translates to:
  /// **'Bind a model to continue'**
  String get modelBindingPromptTitle;

  /// No description provided for @modelBindingPromptGoSettings.
  ///
  /// In en, this message translates to:
  /// **'Go to settings and bind a model first'**
  String get modelBindingPromptGoSettings;

  /// No description provided for @modelBindingPromptLater.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get modelBindingPromptLater;

  /// No description provided for @conversationNewSession.
  ///
  /// In en, this message translates to:
  /// **'New Session'**
  String get conversationNewSession;

  /// No description provided for @conversationManagement.
  ///
  /// In en, this message translates to:
  /// **'Conversations'**
  String get conversationManagement;

  /// No description provided for @conversationEmpty.
  ///
  /// In en, this message translates to:
  /// **'No conversations'**
  String get conversationEmpty;

  /// No description provided for @conversationEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to start a new chat'**
  String get conversationEmptyHint;

  /// No description provided for @conversationNewChat.
  ///
  /// In en, this message translates to:
  /// **'New Chat'**
  String get conversationNewChat;

  /// No description provided for @conversationTitleField.
  ///
  /// In en, this message translates to:
  /// **'Chat title'**
  String get conversationTitleField;

  /// No description provided for @conversationCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get conversationCreate;

  /// No description provided for @conversationArchive.
  ///
  /// In en, this message translates to:
  /// **'Archive'**
  String get conversationArchive;

  /// No description provided for @conversationUnarchive.
  ///
  /// In en, this message translates to:
  /// **'Unarchive'**
  String get conversationUnarchive;

  /// No description provided for @conversationArchiveBox.
  ///
  /// In en, this message translates to:
  /// **'Archive box'**
  String get conversationArchiveBox;

  /// No description provided for @conversationArchiveBoxEmpty.
  ///
  /// In en, this message translates to:
  /// **'No archived conversations'**
  String get conversationArchiveBoxEmpty;

  /// No description provided for @conversationArchivedBadge.
  ///
  /// In en, this message translates to:
  /// **'Archived'**
  String get conversationArchivedBadge;

  /// No description provided for @conversationDeleteBody.
  ///
  /// In en, this message translates to:
  /// **'This also deletes the copy in the hippocampus (the session and every message in it). It cannot be undone.'**
  String get conversationDeleteBody;

  /// No description provided for @conversationActionFailed.
  ///
  /// In en, this message translates to:
  /// **'Action failed: {error}'**
  String conversationActionFailed(String error);

  /// No description provided for @commonConfirmDelete.
  ///
  /// In en, this message translates to:
  /// **'Confirm Delete'**
  String get commonConfirmDelete;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @discoveryTitle.
  ///
  /// In en, this message translates to:
  /// **'Device Discovery'**
  String get discoveryTitle;

  /// No description provided for @discoveryScanning.
  ///
  /// In en, this message translates to:
  /// **'Scanning for devices...'**
  String get discoveryScanning;

  /// No description provided for @discoveryNoDevices.
  ///
  /// In en, this message translates to:
  /// **'No devices found'**
  String get discoveryNoDevices;

  /// No description provided for @discoveryNoDevicesHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the refresh button to scan again'**
  String get discoveryNoDevicesHint;

  /// No description provided for @discoveryAddManually.
  ///
  /// In en, this message translates to:
  /// **'Add Device Manually'**
  String get discoveryAddManually;

  /// No description provided for @commonHostAddress.
  ///
  /// In en, this message translates to:
  /// **'Host address'**
  String get commonHostAddress;

  /// No description provided for @commonPort.
  ///
  /// In en, this message translates to:
  /// **'Port'**
  String get commonPort;

  /// No description provided for @discoveryDeviceNameOptional.
  ///
  /// In en, this message translates to:
  /// **'Device name (optional)'**
  String get discoveryDeviceNameOptional;

  /// No description provided for @commonAdd.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get commonAdd;

  /// No description provided for @discoveryActive.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get discoveryActive;

  /// No description provided for @discoverySetActive.
  ///
  /// In en, this message translates to:
  /// **'Set as active'**
  String get discoverySetActive;

  /// No description provided for @commonRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get commonRemove;

  /// No description provided for @commonClearFilters.
  ///
  /// In en, this message translates to:
  /// **'Clear filters'**
  String get commonClearFilters;

  /// No description provided for @navChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get navChat;

  /// No description provided for @navLive.
  ///
  /// In en, this message translates to:
  /// **'Live'**
  String get navLive;

  /// No description provided for @navService.
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get navService;

  /// No description provided for @navTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get navTasks;

  /// No description provided for @navManage.
  ///
  /// In en, this message translates to:
  /// **'Manage'**
  String get navManage;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @logsTelencephalonStarted.
  ///
  /// In en, this message translates to:
  /// **'Telencephalon service started'**
  String get logsTelencephalonStarted;

  /// No description provided for @logsDbTimeoutRetry.
  ///
  /// In en, this message translates to:
  /// **'Database connection timed out, retrying...'**
  String get logsDbTimeoutRetry;

  /// No description provided for @logsHippocampusUnreachable.
  ///
  /// In en, this message translates to:
  /// **'Cannot connect to the Hippocampus service'**
  String get logsHippocampusUnreachable;

  /// No description provided for @logsTitle.
  ///
  /// In en, this message translates to:
  /// **'System Logs'**
  String get logsTitle;

  /// No description provided for @logsClearFilter.
  ///
  /// In en, this message translates to:
  /// **'Clear filter'**
  String get logsClearFilter;

  /// No description provided for @logsClearAll.
  ///
  /// In en, this message translates to:
  /// **'Clear Logs'**
  String get logsClearAll;

  /// No description provided for @logsClearConfirm.
  ///
  /// In en, this message translates to:
  /// **'Clear all logs?'**
  String get logsClearConfirm;

  /// No description provided for @logsClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get logsClear;

  /// No description provided for @logsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No logs yet'**
  String get logsEmpty;

  /// No description provided for @logsNoMatch.
  ///
  /// In en, this message translates to:
  /// **'No matching logs'**
  String get logsNoMatch;

  /// No description provided for @logsCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get logsCopied;

  /// No description provided for @mcpTitle.
  ///
  /// In en, this message translates to:
  /// **'MCP Servers'**
  String get mcpTitle;

  /// No description provided for @mcpAddServer.
  ///
  /// In en, this message translates to:
  /// **'Add server'**
  String get mcpAddServer;

  /// No description provided for @mcpEmpty.
  ///
  /// In en, this message translates to:
  /// **'No MCP servers'**
  String get mcpEmpty;

  /// No description provided for @mcpEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to add a server'**
  String get mcpEmptyHint;

  /// No description provided for @mcpAddServerTitle.
  ///
  /// In en, this message translates to:
  /// **'Add MCP Server'**
  String get mcpAddServerTitle;

  /// No description provided for @commonName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get commonName;

  /// No description provided for @mcpServerUrl.
  ///
  /// In en, this message translates to:
  /// **'Server URL'**
  String get mcpServerUrl;

  /// No description provided for @mcpAuthTokenOptional.
  ///
  /// In en, this message translates to:
  /// **'Auth token (optional)'**
  String get mcpAuthTokenOptional;

  /// No description provided for @memoryEmpty.
  ///
  /// In en, this message translates to:
  /// **'No memories yet'**
  String get memoryEmpty;

  /// No description provided for @modelEngineRunning.
  ///
  /// In en, this message translates to:
  /// **'Engine running'**
  String get modelEngineRunning;

  /// No description provided for @modelEngineStopped.
  ///
  /// In en, this message translates to:
  /// **'Engine not running'**
  String get modelEngineStopped;

  /// No description provided for @modelEmpty.
  ///
  /// In en, this message translates to:
  /// **'No models'**
  String get modelEmpty;

  /// No description provided for @modelEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to add a model'**
  String get modelEmptyHint;

  /// No description provided for @modelTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Type:'**
  String get modelTypeLabel;

  /// No description provided for @commonAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get commonAll;

  /// No description provided for @modelLiteRtEngine.
  ///
  /// In en, this message translates to:
  /// **'LiteRT engine'**
  String get modelLiteRtEngine;

  /// No description provided for @modelInternalService.
  ///
  /// In en, this message translates to:
  /// **'Internal service (Rust)'**
  String get modelInternalService;

  /// No description provided for @modelCloudProvider.
  ///
  /// In en, this message translates to:
  /// **'Cloud provider'**
  String get modelCloudProvider;

  /// No description provided for @modelNoCloudModels.
  ///
  /// In en, this message translates to:
  /// **'No cloud models'**
  String get modelNoCloudModels;

  /// No description provided for @modelNoCloudModelsHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to add a cloud model'**
  String get modelNoCloudModelsHint;

  /// No description provided for @modelAddLocalTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Local Model'**
  String get modelAddLocalTitle;

  /// No description provided for @modelNameField.
  ///
  /// In en, this message translates to:
  /// **'Model name'**
  String get modelNameField;

  /// No description provided for @modelPathField.
  ///
  /// In en, this message translates to:
  /// **'Model path'**
  String get modelPathField;

  /// No description provided for @modelSizeField.
  ///
  /// In en, this message translates to:
  /// **'Size (MB)'**
  String get modelSizeField;

  /// No description provided for @modelAddCloudTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Cloud Model'**
  String get modelAddCloudTitle;

  /// No description provided for @commonApiKeyOptional.
  ///
  /// In en, this message translates to:
  /// **'API key (optional)'**
  String get commonApiKeyOptional;

  /// No description provided for @modelNameOptional.
  ///
  /// In en, this message translates to:
  /// **'Model name (optional)'**
  String get modelNameOptional;

  /// No description provided for @modelSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Model Settings'**
  String get modelSettingsTitle;

  /// No description provided for @modelSettingsEngine.
  ///
  /// In en, this message translates to:
  /// **'Inference engine'**
  String get modelSettingsEngine;

  /// No description provided for @modelSettingsSelectModel.
  ///
  /// In en, this message translates to:
  /// **'Select model'**
  String get modelSettingsSelectModel;

  /// No description provided for @promptSaved.
  ///
  /// In en, this message translates to:
  /// **'Prompt saved'**
  String get promptSaved;

  /// No description provided for @promptRestored.
  ///
  /// In en, this message translates to:
  /// **'Default prompt restored'**
  String get promptRestored;

  /// No description provided for @promptSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Prompt Settings'**
  String get promptSettingsTitle;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @promptMainAgentLabel.
  ///
  /// In en, this message translates to:
  /// **'Main agent system prompt'**
  String get promptMainAgentLabel;

  /// No description provided for @promptInputHint.
  ///
  /// In en, this message translates to:
  /// **'Enter a system prompt...'**
  String get promptInputHint;

  /// No description provided for @promptRestoreDefault.
  ///
  /// In en, this message translates to:
  /// **'Restore default'**
  String get promptRestoreDefault;

  /// No description provided for @providerQwen.
  ///
  /// In en, this message translates to:
  /// **'Qwen'**
  String get providerQwen;

  /// No description provided for @providerZhipu.
  ///
  /// In en, this message translates to:
  /// **'Zhipu AI'**
  String get providerZhipu;

  /// No description provided for @providerLocalModel.
  ///
  /// In en, this message translates to:
  /// **'Local model'**
  String get providerLocalModel;

  /// No description provided for @providerBuiltin.
  ///
  /// In en, this message translates to:
  /// **'Built-in'**
  String get providerBuiltin;

  /// No description provided for @providerModelNotDownloaded.
  ///
  /// In en, this message translates to:
  /// **'Not downloaded'**
  String get providerModelNotDownloaded;

  /// No description provided for @providersTitle.
  ///
  /// In en, this message translates to:
  /// **'Model Providers'**
  String get providersTitle;

  /// No description provided for @providersEmpty.
  ///
  /// In en, this message translates to:
  /// **'No providers configured'**
  String get providersEmpty;

  /// No description provided for @providersEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to add your first provider'**
  String get providersEmptyHint;

  /// No description provided for @providersAdd.
  ///
  /// In en, this message translates to:
  /// **'Add provider'**
  String get providersAdd;

  /// No description provided for @commonEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get commonEdit;

  /// No description provided for @providersEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Provider'**
  String get providersEditTitle;

  /// No description provided for @commonProvider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get commonProvider;

  /// No description provided for @commonApiAddress.
  ///
  /// In en, this message translates to:
  /// **'API address'**
  String get commonApiAddress;

  /// No description provided for @commonModel.
  ///
  /// In en, this message translates to:
  /// **'Model'**
  String get commonModel;

  /// No description provided for @providersApiKeyRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter an API key'**
  String get providersApiKeyRequired;

  /// No description provided for @providersNameRequired.
  ///
  /// In en, this message translates to:
  /// **'Please enter a provider name'**
  String get providersNameRequired;

  /// No description provided for @providersStandard.
  ///
  /// In en, this message translates to:
  /// **'API standard'**
  String get providersStandard;

  /// No description provided for @providersPreviewModels.
  ///
  /// In en, this message translates to:
  /// **'Preview models'**
  String get providersPreviewModels;

  /// No description provided for @providersSelectModel.
  ///
  /// In en, this message translates to:
  /// **'Select model'**
  String get providersSelectModel;

  /// No description provided for @providersRefreshModels.
  ///
  /// In en, this message translates to:
  /// **'Refresh models'**
  String get providersRefreshModels;

  /// No description provided for @providersModelsNotFetched.
  ///
  /// In en, this message translates to:
  /// **'Not fetched yet'**
  String get providersModelsNotFetched;

  /// No description provided for @resonanceNotConnected.
  ///
  /// In en, this message translates to:
  /// **'Not connected'**
  String get resonanceNotConnected;

  /// No description provided for @resonanceConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting'**
  String get resonanceConnecting;

  /// No description provided for @resonanceConnected.
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get resonanceConnected;

  /// No description provided for @resonanceError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get resonanceError;

  /// No description provided for @resonanceLocal.
  ///
  /// In en, this message translates to:
  /// **'Local Resonance'**
  String get resonanceLocal;

  /// No description provided for @resonanceTitle.
  ///
  /// In en, this message translates to:
  /// **'Resonance Management'**
  String get resonanceTitle;

  /// No description provided for @resonanceEmpty.
  ///
  /// In en, this message translates to:
  /// **'No Resonance instances'**
  String get resonanceEmpty;

  /// No description provided for @resonanceAddInstance.
  ///
  /// In en, this message translates to:
  /// **'Add instance'**
  String get resonanceAddInstance;

  /// No description provided for @resonanceAddTitle.
  ///
  /// In en, this message translates to:
  /// **'Add Resonance Instance'**
  String get resonanceAddTitle;

  /// No description provided for @resonanceInstanceName.
  ///
  /// In en, this message translates to:
  /// **'Instance name'**
  String get resonanceInstanceName;

  /// No description provided for @resonanceApiKeyOptional.
  ///
  /// In en, this message translates to:
  /// **'API key (optional)'**
  String get resonanceApiKeyOptional;

  /// No description provided for @resonanceEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Resonance Instance'**
  String get resonanceEditTitle;

  /// No description provided for @resonancePrimary.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get resonancePrimary;

  /// No description provided for @resonanceSetPrimary.
  ///
  /// In en, this message translates to:
  /// **'Set as primary'**
  String get resonanceSetPrimary;

  /// No description provided for @resonanceTestConnection.
  ///
  /// In en, this message translates to:
  /// **'Test connection'**
  String get resonanceTestConnection;

  /// No description provided for @settingsMemoryUsage.
  ///
  /// In en, this message translates to:
  /// **'Memory usage'**
  String get settingsMemoryUsage;

  /// No description provided for @settingsDeviceDiscovery.
  ///
  /// In en, this message translates to:
  /// **'Device discovery'**
  String get settingsDeviceDiscovery;

  /// No description provided for @settingsDeviceDiscoveryDesc.
  ///
  /// In en, this message translates to:
  /// **'Scan for and discover network devices'**
  String get settingsDeviceDiscoveryDesc;

  /// No description provided for @settingsLogsDesc.
  ///
  /// In en, this message translates to:
  /// **'View app logs and error messages'**
  String get settingsLogsDesc;

  /// No description provided for @settingsResonanceDesc.
  ///
  /// In en, this message translates to:
  /// **'Manage Resonance service instances'**
  String get settingsResonanceDesc;

  /// No description provided for @settingsRefreshStatus.
  ///
  /// In en, this message translates to:
  /// **'Refresh status'**
  String get settingsRefreshStatus;

  /// No description provided for @skillsTitle.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get skillsTitle;

  /// No description provided for @skillsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No skills'**
  String get skillsEmpty;

  /// No description provided for @skillsEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the button below to add a custom skill'**
  String get skillsEmptyHint;

  /// No description provided for @skillsBuiltIn.
  ///
  /// In en, this message translates to:
  /// **'Built-in skills'**
  String get skillsBuiltIn;

  /// No description provided for @skillsCustom.
  ///
  /// In en, this message translates to:
  /// **'Custom skills'**
  String get skillsCustom;

  /// No description provided for @skillsAddCustom.
  ///
  /// In en, this message translates to:
  /// **'Add Custom Skill'**
  String get skillsAddCustom;

  /// No description provided for @skillsNameField.
  ///
  /// In en, this message translates to:
  /// **'Skill name'**
  String get skillsNameField;

  /// No description provided for @commonDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get commonDescription;

  /// No description provided for @soulSaved.
  ///
  /// In en, this message translates to:
  /// **'Soul saved'**
  String get soulSaved;

  /// No description provided for @soulTitle.
  ///
  /// In en, this message translates to:
  /// **'Soul Settings'**
  String get soulTitle;

  /// No description provided for @soulSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Soul - your personal assistant persona'**
  String get soulSubtitle;

  /// No description provided for @soulDescHint.
  ///
  /// In en, this message translates to:
  /// **'Describe your assistant\'s personality, habits and preferences.'**
  String get soulDescHint;

  /// No description provided for @soulVersionHistory.
  ///
  /// In en, this message translates to:
  /// **'Version history'**
  String get soulVersionHistory;

  /// No description provided for @soulNoHistory.
  ///
  /// In en, this message translates to:
  /// **'No version history'**
  String get soulNoHistory;

  /// No description provided for @soulUserModified.
  ///
  /// In en, this message translates to:
  /// **'User edit'**
  String get soulUserModified;

  /// No description provided for @soulAgentReview.
  ///
  /// In en, this message translates to:
  /// **'Agent review'**
  String get soulAgentReview;

  /// No description provided for @soulNoReason.
  ///
  /// In en, this message translates to:
  /// **'No reason given'**
  String get soulNoReason;

  /// No description provided for @soulChangeReason.
  ///
  /// In en, this message translates to:
  /// **'Reason for change'**
  String get soulChangeReason;

  /// No description provided for @soulConversationSummary.
  ///
  /// In en, this message translates to:
  /// **'Conversation summary'**
  String get soulConversationSummary;

  /// No description provided for @soulContent.
  ///
  /// In en, this message translates to:
  /// **'Content'**
  String get soulContent;

  /// No description provided for @taskBoardTitle.
  ///
  /// In en, this message translates to:
  /// **'Task Board'**
  String get taskBoardTitle;

  /// No description provided for @taskStatusBacklog.
  ///
  /// In en, this message translates to:
  /// **'Backlog'**
  String get taskStatusBacklog;

  /// No description provided for @taskStatusTodo.
  ///
  /// In en, this message translates to:
  /// **'To do'**
  String get taskStatusTodo;

  /// No description provided for @taskStatusInProgress.
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get taskStatusInProgress;

  /// No description provided for @taskStatusDone.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get taskStatusDone;

  /// No description provided for @taskStatusFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get taskStatusFailed;

  /// No description provided for @taskStatusCancelled.
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get taskStatusCancelled;

  /// No description provided for @taskRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get taskRetry;

  /// No description provided for @taskEmpty.
  ///
  /// In en, this message translates to:
  /// **'No tasks'**
  String get taskEmpty;

  /// No description provided for @taskAdd.
  ///
  /// In en, this message translates to:
  /// **'Add task'**
  String get taskAdd;

  /// No description provided for @taskTitleField.
  ///
  /// In en, this message translates to:
  /// **'Task title'**
  String get taskTitleField;

  /// No description provided for @taskPriority.
  ///
  /// In en, this message translates to:
  /// **'Priority'**
  String get taskPriority;

  /// No description provided for @priorityLow.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get priorityLow;

  /// No description provided for @priorityMedium.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get priorityMedium;

  /// No description provided for @priorityHigh.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get priorityHigh;

  /// No description provided for @priorityUrgent.
  ///
  /// In en, this message translates to:
  /// **'Urgent'**
  String get priorityUrgent;

  /// No description provided for @taskEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit Task'**
  String get taskEditTitle;

  /// No description provided for @taskStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get taskStatus;

  /// No description provided for @taskTagsField.
  ///
  /// In en, this message translates to:
  /// **'Tags (comma separated)'**
  String get taskTagsField;

  /// No description provided for @taskEditPersistenceNote.
  ///
  /// In en, this message translates to:
  /// **'Telencephalon task: the status can be changed at any time; the title, description, priority and tags are only written when the task is created.'**
  String get taskEditPersistenceNote;

  /// No description provided for @taskDueTime.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get taskDueTime;

  /// No description provided for @taskDueTimeField.
  ///
  /// In en, this message translates to:
  /// **'Due date'**
  String get taskDueTimeField;

  /// No description provided for @taskDueTimeHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Relative times such as \"tomorrow 3pm\" are accepted.'**
  String get taskDueTimeHint;

  /// No description provided for @taskConfirmationPoints.
  ///
  /// In en, this message translates to:
  /// **'Confirmation points'**
  String get taskConfirmationPoints;

  /// No description provided for @taskNoConfirmationPoints.
  ///
  /// In en, this message translates to:
  /// **'This task has no confirmation points'**
  String get taskNoConfirmationPoints;

  /// No description provided for @taskConfirmState.
  ///
  /// In en, this message translates to:
  /// **'Confirmation'**
  String get taskConfirmState;

  /// No description provided for @taskConfirmed.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get taskConfirmed;

  /// No description provided for @taskAwaitingConfirm.
  ///
  /// In en, this message translates to:
  /// **'Awaiting confirmation'**
  String get taskAwaitingConfirm;

  /// No description provided for @taskConfirmAction.
  ///
  /// In en, this message translates to:
  /// **'Confirm task'**
  String get taskConfirmAction;

  /// No description provided for @taskOverview.
  ///
  /// In en, this message translates to:
  /// **'Overview'**
  String get taskOverview;

  /// No description provided for @taskLogs.
  ///
  /// In en, this message translates to:
  /// **'Logs'**
  String get taskLogs;

  /// No description provided for @commonRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get commonRefresh;

  /// No description provided for @taskCreatedAt.
  ///
  /// In en, this message translates to:
  /// **'Created at'**
  String get taskCreatedAt;

  /// No description provided for @taskCompletedAt.
  ///
  /// In en, this message translates to:
  /// **'Completed at'**
  String get taskCompletedAt;

  /// No description provided for @taskTags.
  ///
  /// In en, this message translates to:
  /// **'Tags'**
  String get taskTags;

  /// No description provided for @taskNoSubtasks.
  ///
  /// In en, this message translates to:
  /// **'This task has no subtasks'**
  String get taskNoSubtasks;

  /// No description provided for @taskSubtaskProgress.
  ///
  /// In en, this message translates to:
  /// **'Subtask progress'**
  String get taskSubtaskProgress;

  /// No description provided for @logsTab.
  ///
  /// In en, this message translates to:
  /// **'Logs'**
  String get logsTab;

  /// No description provided for @logsClient.
  ///
  /// In en, this message translates to:
  /// **'Client'**
  String get logsClient;

  /// No description provided for @logsApp.
  ///
  /// In en, this message translates to:
  /// **'App'**
  String get logsApp;

  /// No description provided for @logsDevice.
  ///
  /// In en, this message translates to:
  /// **'Device components'**
  String get logsDevice;

  /// No description provided for @logsAllLevels.
  ///
  /// In en, this message translates to:
  /// **'All levels'**
  String get logsAllLevels;

  /// No description provided for @logsExport.
  ///
  /// In en, this message translates to:
  /// **'Export logs'**
  String get logsExport;

  /// No description provided for @logsPanelClearAll.
  ///
  /// In en, this message translates to:
  /// **'Clear all'**
  String get logsPanelClearAll;

  /// No description provided for @soulPriorityNote.
  ///
  /// In en, this message translates to:
  /// **'System Prompt takes highest priority.'**
  String get soulPriorityNote;

  /// No description provided for @commonLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Load failed: {error}'**
  String commonLoadFailed(String error);

  /// No description provided for @commonErrorDetail.
  ///
  /// In en, this message translates to:
  /// **'Error: {error}'**
  String commonErrorDetail(String error);

  /// No description provided for @commonDeleteConfirmNamed.
  ///
  /// In en, this message translates to:
  /// **'Delete \"{name}\"?'**
  String commonDeleteConfirmNamed(String name);

  /// No description provided for @commonDeleteFailed.
  ///
  /// In en, this message translates to:
  /// **'Delete failed: {error}'**
  String commonDeleteFailed(String error);

  /// No description provided for @commonMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{count} min ago'**
  String commonMinutesAgo(int count);

  /// No description provided for @commonHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{count} h ago'**
  String commonHoursAgo(int count);

  /// No description provided for @commonDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{count} d ago'**
  String commonDaysAgo(int count);

  /// No description provided for @settingsMemUsed.
  ///
  /// In en, this message translates to:
  /// **'Used: {mb} MB'**
  String settingsMemUsed(int mb);

  /// No description provided for @settingsMemTotal.
  ///
  /// In en, this message translates to:
  /// **'Total: {mb} MB'**
  String settingsMemTotal(int mb);

  /// No description provided for @settingsMemFree.
  ///
  /// In en, this message translates to:
  /// **'Free: {mb} MB'**
  String settingsMemFree(int mb);

  /// No description provided for @settingsMemUsage.
  ///
  /// In en, this message translates to:
  /// **'Usage: {percent}%'**
  String settingsMemUsage(String percent);

  /// No description provided for @settingsEncephalonEmbedded.
  ///
  /// In en, this message translates to:
  /// **'Embedded Brain'**
  String get settingsEncephalonEmbedded;

  /// No description provided for @settingsEncephalonEmbeddedDesc.
  ///
  /// In en, this message translates to:
  /// **'Manage the Encephalon brain runtime embedded in this app (inference + telencephalon agent surface)'**
  String get settingsEncephalonEmbeddedDesc;

  /// No description provided for @taskSubtasks.
  ///
  /// In en, this message translates to:
  /// **'Subtasks ({count})'**
  String taskSubtasks(int count);

  /// No description provided for @taskStepStarted.
  ///
  /// In en, this message translates to:
  /// **'Started: {time}'**
  String taskStepStarted(String time);

  /// No description provided for @taskStepCompleted.
  ///
  /// In en, this message translates to:
  /// **'Completed: {time}'**
  String taskStepCompleted(String time);

  /// No description provided for @taskStepDuration.
  ///
  /// In en, this message translates to:
  /// **'Duration: {seconds}s'**
  String taskStepDuration(int seconds);

  /// No description provided for @taskStepProgress.
  ///
  /// In en, this message translates to:
  /// **'{completed}/{total} steps'**
  String taskStepProgress(int completed, int total);

  /// No description provided for @soulDescHintExample.
  ///
  /// In en, this message translates to:
  /// **'For example:\n- Friendly and concise\n- Address the user as \"you\"\n- Offer useful suggestions proactively'**
  String get soulDescHintExample;

  /// No description provided for @soulHistoryLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to load history: {error}'**
  String soulHistoryLoadFailed(String error);

  /// No description provided for @soulVersion.
  ///
  /// In en, this message translates to:
  /// **'Version {version}'**
  String soulVersion(int version);

  /// No description provided for @logsFilterLabel.
  ///
  /// In en, this message translates to:
  /// **'Filter: {level} {source}'**
  String logsFilterLabel(String level, String source);

  /// No description provided for @logsTotalCount.
  ///
  /// In en, this message translates to:
  /// **'{count} logs in total'**
  String logsTotalCount(int count);

  /// No description provided for @logsShownCount.
  ///
  /// In en, this message translates to:
  /// **'Showing {count}'**
  String logsShownCount(int count);

  /// No description provided for @discoveryLastScan.
  ///
  /// In en, this message translates to:
  /// **'Last scan: {time}'**
  String discoveryLastScan(String time);

  /// No description provided for @discoveryDeviceCount.
  ///
  /// In en, this message translates to:
  /// **'{count} devices found'**
  String discoveryDeviceCount(int count);

  /// No description provided for @resonanceLatency.
  ///
  /// In en, this message translates to:
  /// **'Latency: {ms}ms'**
  String resonanceLatency(int ms);

  /// No description provided for @modelNameExample.
  ///
  /// In en, this message translates to:
  /// **'e.g. Qwen2.5-7B'**
  String get modelNameExample;

  /// No description provided for @cameraOff.
  ///
  /// In en, this message translates to:
  /// **'Camera off'**
  String get cameraOff;

  /// No description provided for @cameraReady.
  ///
  /// In en, this message translates to:
  /// **'Camera ready'**
  String get cameraReady;

  /// No description provided for @cameraStreaming.
  ///
  /// In en, this message translates to:
  /// **'Capturing...'**
  String get cameraStreaming;

  /// No description provided for @cameraFlip.
  ///
  /// In en, this message translates to:
  /// **'Flip'**
  String get cameraFlip;

  /// No description provided for @cameraClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get cameraClose;

  /// No description provided for @chatGreeting.
  ///
  /// In en, this message translates to:
  /// **'Hello! I am Shadow. How can I help you?'**
  String get chatGreeting;

  /// No description provided for @chatAttachmentNotAvailable.
  ///
  /// In en, this message translates to:
  /// **'Only plain text is supported right now - images, files and other attachments are not supported yet'**
  String get chatAttachmentNotAvailable;

  /// No description provided for @chatVoiceModelRequired.
  ///
  /// In en, this message translates to:
  /// **'Voice features need a model to be loaded first'**
  String get chatVoiceModelRequired;

  /// No description provided for @chatSorryError.
  ///
  /// In en, this message translates to:
  /// **'Sorry, something went wrong: {error}'**
  String chatSorryError(String error);

  /// No description provided for @chatSorryErrorShort.
  ///
  /// In en, this message translates to:
  /// **'Sorry, something went wrong'**
  String get chatSorryErrorShort;

  /// No description provided for @modelPlaceholderNoLocal.
  ///
  /// In en, this message translates to:
  /// **'No local model yet'**
  String get modelPlaceholderNoLocal;

  /// No description provided for @deviceThisMachine.
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get deviceThisMachine;

  /// No description provided for @actionFlashlightOn.
  ///
  /// In en, this message translates to:
  /// **'Turn on flashlight'**
  String get actionFlashlightOn;

  /// No description provided for @actionFlashlightOff.
  ///
  /// In en, this message translates to:
  /// **'Turn off flashlight'**
  String get actionFlashlightOff;

  /// No description provided for @actionCreateContact.
  ///
  /// In en, this message translates to:
  /// **'Create contact: {name}'**
  String actionCreateContact(String name);

  /// No description provided for @actionSendEmail.
  ///
  /// In en, this message translates to:
  /// **'Send email to: {to}'**
  String actionSendEmail(String to);

  /// No description provided for @actionShowLocation.
  ///
  /// In en, this message translates to:
  /// **'Show location: {query}'**
  String actionShowLocation(String query);

  /// No description provided for @actionOpenWifi.
  ///
  /// In en, this message translates to:
  /// **'Open WiFi settings'**
  String get actionOpenWifi;

  /// No description provided for @actionCreateCalendar.
  ///
  /// In en, this message translates to:
  /// **'Create calendar event: {title}'**
  String actionCreateCalendar(String title);

  /// No description provided for @actionFlashlightOnDone.
  ///
  /// In en, this message translates to:
  /// **'Flashlight is on'**
  String get actionFlashlightOnDone;

  /// No description provided for @actionFlashlightOnFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to turn on the flashlight: {error}'**
  String actionFlashlightOnFailed(String error);

  /// No description provided for @actionFlashlightOffDone.
  ///
  /// In en, this message translates to:
  /// **'Flashlight is off'**
  String get actionFlashlightOffDone;

  /// No description provided for @actionFlashlightOffFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to turn off the flashlight: {error}'**
  String actionFlashlightOffFailed(String error);

  /// No description provided for @actionCreatingContact.
  ///
  /// In en, this message translates to:
  /// **'Creating contact: {name}'**
  String actionCreatingContact(String name);

  /// No description provided for @actionNoContactsApp.
  ///
  /// In en, this message translates to:
  /// **'Cannot open the contacts app'**
  String get actionNoContactsApp;

  /// No description provided for @actionContactFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to create the contact: {error}'**
  String actionContactFailed(String error);

  /// No description provided for @actionEmailOpened.
  ///
  /// In en, this message translates to:
  /// **'Email app opened, recipient: {to}'**
  String actionEmailOpened(String to);

  /// No description provided for @actionNoEmailApp.
  ///
  /// In en, this message translates to:
  /// **'Cannot open the email app'**
  String get actionNoEmailApp;

  /// No description provided for @actionEmailFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to send the email: {error}'**
  String actionEmailFailed(String error);

  /// No description provided for @actionShowingLocation.
  ///
  /// In en, this message translates to:
  /// **'Showing location: {query}'**
  String actionShowingLocation(String query);

  /// No description provided for @actionNoMapsApp.
  ///
  /// In en, this message translates to:
  /// **'Cannot open the maps app'**
  String get actionNoMapsApp;

  /// No description provided for @actionLocationFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to show the location: {error}'**
  String actionLocationFailed(String error);

  /// No description provided for @actionWifiOpened.
  ///
  /// In en, this message translates to:
  /// **'WiFi settings opened'**
  String get actionWifiOpened;

  /// No description provided for @actionWifiFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to open the WiFi settings: {error}'**
  String actionWifiFailed(String error);

  /// No description provided for @actionCalendarCreated.
  ///
  /// In en, this message translates to:
  /// **'Calendar event created: {title}'**
  String actionCalendarCreated(String title);

  /// No description provided for @actionNoCalendarApp.
  ///
  /// In en, this message translates to:
  /// **'Cannot open the calendar app'**
  String get actionNoCalendarApp;

  /// No description provided for @actionCalendarFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to create the calendar event: {error}'**
  String actionCalendarFailed(String error);

  /// No description provided for @encephalonStartFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to start the embedded brain'**
  String get encephalonStartFailed;

  /// No description provided for @encephalonNotRunning.
  ///
  /// In en, this message translates to:
  /// **'The embedded brain is not running'**
  String get encephalonNotRunning;

  /// No description provided for @encephalonEmbeddedTitle.
  ///
  /// In en, this message translates to:
  /// **'Embedded Brain Runtime (NDK)'**
  String get encephalonEmbeddedTitle;

  /// No description provided for @encephalonEmbeddedRuntime.
  ///
  /// In en, this message translates to:
  /// **'Embedded brain runtime'**
  String get encephalonEmbeddedRuntime;

  /// No description provided for @encephalonPort.
  ///
  /// In en, this message translates to:
  /// **'Port: {port}'**
  String encephalonPort(int port);

  /// No description provided for @encephalonStart.
  ///
  /// In en, this message translates to:
  /// **'Start brain'**
  String get encephalonStart;

  /// No description provided for @encephalonStop.
  ///
  /// In en, this message translates to:
  /// **'Stop brain'**
  String get encephalonStop;

  /// No description provided for @encephalonStatusStopped.
  ///
  /// In en, this message translates to:
  /// **'Stopped'**
  String get encephalonStatusStopped;

  /// No description provided for @encephalonStatusStarting.
  ///
  /// In en, this message translates to:
  /// **'Starting...'**
  String get encephalonStatusStarting;

  /// No description provided for @encephalonStatusRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get encephalonStatusRunning;

  /// No description provided for @encephalonStatusStopping.
  ///
  /// In en, this message translates to:
  /// **'Stopping...'**
  String get encephalonStatusStopping;

  /// No description provided for @encephalonStatusError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get encephalonStatusError;

  /// No description provided for @encephalonInferTitle.
  ///
  /// In en, this message translates to:
  /// **'In-process inference'**
  String get encephalonInferTitle;

  /// No description provided for @encephalonInferHint.
  ///
  /// In en, this message translates to:
  /// **'The request goes straight into the neuron adapter pipeline in-process — no socket, no CORS.'**
  String get encephalonInferHint;

  /// No description provided for @encephalonInferPrompt.
  ///
  /// In en, this message translates to:
  /// **'Prompt'**
  String get encephalonInferPrompt;

  /// No description provided for @encephalonInferRun.
  ///
  /// In en, this message translates to:
  /// **'Run inference'**
  String get encephalonInferRun;

  /// No description provided for @encephalonInferFailed.
  ///
  /// In en, this message translates to:
  /// **'Inference failed'**
  String get encephalonInferFailed;

  /// No description provided for @encephalonModelSourceTitle.
  ///
  /// In en, this message translates to:
  /// **'Brain model source'**
  String get encephalonModelSourceTitle;

  /// No description provided for @encephalonModelSourceHint.
  ///
  /// In en, this message translates to:
  /// **'Global default: every lobe uses this source. You can override a single lobe under \"Lobe model routing\" below.'**
  String get encephalonModelSourceHint;

  /// No description provided for @encephalonModelLocalNeuron.
  ///
  /// In en, this message translates to:
  /// **'Local neuron weights'**
  String get encephalonModelLocalNeuron;

  /// No description provided for @encephalonModelCloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud provider'**
  String get encephalonModelCloud;

  /// No description provided for @encephalonModelNoCloudProvider.
  ///
  /// In en, this message translates to:
  /// **'No cloud provider configured yet - add one in Model management first.'**
  String get encephalonModelNoCloudProvider;

  /// No description provided for @encephalonModelSourceApplied.
  ///
  /// In en, this message translates to:
  /// **'New model source applied'**
  String get encephalonModelSourceApplied;

  /// No description provided for @encephalonModelSourceFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to switch the model source'**
  String get encephalonModelSourceFailed;

  /// No description provided for @encephalonLobeRoutingTitle.
  ///
  /// In en, this message translates to:
  /// **'Lobe model routing'**
  String get encephalonLobeRoutingTitle;

  /// No description provided for @encephalonLobeRoutingHint.
  ///
  /// In en, this message translates to:
  /// **'A lobe is the smallest unit that picks a model. By default every lobe follows the global source above; you can override a single lobe - e.g. prefrontal on local weights, the region that actually runs tasks on the cloud.'**
  String get encephalonLobeRoutingHint;

  /// No description provided for @encephalonLobeRoutingUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Could not read the lobe list from the telencephalon - the brain may not be running.'**
  String get encephalonLobeRoutingUnavailable;

  /// No description provided for @encephalonLobeRoutingRefresh.
  ///
  /// In en, this message translates to:
  /// **'Refresh lobes'**
  String get encephalonLobeRoutingRefresh;

  /// No description provided for @encephalonLobeFollowGlobal.
  ///
  /// In en, this message translates to:
  /// **'Follow global'**
  String get encephalonLobeFollowGlobal;

  /// No description provided for @encephalonLobeRoutingApplied.
  ///
  /// In en, this message translates to:
  /// **'Lobe model updated'**
  String get encephalonLobeRoutingApplied;

  /// No description provided for @encephalonLobeRoutingFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to update the lobe model'**
  String get encephalonLobeRoutingFailed;

  /// No description provided for @encephalonLobeEffectiveLocal.
  ///
  /// In en, this message translates to:
  /// **'Current: local neuron weights'**
  String get encephalonLobeEffectiveLocal;

  /// No description provided for @encephalonLobeEffectiveCloud.
  ///
  /// In en, this message translates to:
  /// **'Current: {name}'**
  String encephalonLobeEffectiveCloud(String name);

  /// No description provided for @settingsAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearance;

  /// No description provided for @settingsThemeColor.
  ///
  /// In en, this message translates to:
  /// **'Theme color'**
  String get settingsThemeColor;

  /// No description provided for @settingsThemeColorHint.
  ///
  /// In en, this message translates to:
  /// **'The shadow itself has no color — pick the light it casts in.'**
  String get settingsThemeColorHint;

  /// No description provided for @settingsGlassIntensity.
  ///
  /// In en, this message translates to:
  /// **'Glass intensity'**
  String get settingsGlassIntensity;

  /// No description provided for @settingsGlassOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get settingsGlassOff;

  /// No description provided for @settingsGlassFull.
  ///
  /// In en, this message translates to:
  /// **'Full'**
  String get settingsGlassFull;

  /// No description provided for @settingsDialogBackground.
  ///
  /// In en, this message translates to:
  /// **'Dialog background'**
  String get settingsDialogBackground;

  /// No description provided for @settingsFollowTheme.
  ///
  /// In en, this message translates to:
  /// **'Follow theme'**
  String get settingsFollowTheme;

  /// No description provided for @settingsSurfaceDeep.
  ///
  /// In en, this message translates to:
  /// **'Deep'**
  String get settingsSurfaceDeep;

  /// No description provided for @settingsSurfaceLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsSurfaceLight;

  /// No description provided for @settingsSurfaceNeutral.
  ///
  /// In en, this message translates to:
  /// **'Neutral'**
  String get settingsSurfaceNeutral;

  /// No description provided for @settingsSurfaceInk.
  ///
  /// In en, this message translates to:
  /// **'Ink'**
  String get settingsSurfaceInk;

  /// No description provided for @appearanceAccentNeutral.
  ///
  /// In en, this message translates to:
  /// **'Neutral'**
  String get appearanceAccentNeutral;

  /// No description provided for @appearanceAccentSlate.
  ///
  /// In en, this message translates to:
  /// **'Slate'**
  String get appearanceAccentSlate;

  /// No description provided for @appearanceAccentIndigo.
  ///
  /// In en, this message translates to:
  /// **'Indigo'**
  String get appearanceAccentIndigo;

  /// No description provided for @appearanceAccentCyan.
  ///
  /// In en, this message translates to:
  /// **'Cyan'**
  String get appearanceAccentCyan;

  /// No description provided for @appearanceAccentEmerald.
  ///
  /// In en, this message translates to:
  /// **'Emerald'**
  String get appearanceAccentEmerald;

  /// No description provided for @appearanceAccentAmber.
  ///
  /// In en, this message translates to:
  /// **'Amber'**
  String get appearanceAccentAmber;

  /// No description provided for @appearanceAccentRose.
  ///
  /// In en, this message translates to:
  /// **'Rose'**
  String get appearanceAccentRose;

  /// No description provided for @surfaceChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get surfaceChat;

  /// No description provided for @surfaceConversations.
  ///
  /// In en, this message translates to:
  /// **'Conversations'**
  String get surfaceConversations;

  /// No description provided for @surfaceVoice.
  ///
  /// In en, this message translates to:
  /// **'Voice'**
  String get surfaceVoice;

  /// No description provided for @surfaceLivestream.
  ///
  /// In en, this message translates to:
  /// **'Livestream'**
  String get surfaceLivestream;

  /// No description provided for @surfaceCustomerService.
  ///
  /// In en, this message translates to:
  /// **'Customer service'**
  String get surfaceCustomerService;

  /// No description provided for @surfaceTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get surfaceTasks;

  /// No description provided for @surfaceGroup.
  ///
  /// In en, this message translates to:
  /// **'Group'**
  String get surfaceGroup;

  /// No description provided for @surfaceDocument.
  ///
  /// In en, this message translates to:
  /// **'Document'**
  String get surfaceDocument;

  /// No description provided for @surfacePreviews.
  ///
  /// In en, this message translates to:
  /// **'Previews'**
  String get surfacePreviews;

  /// No description provided for @surfaceAgents.
  ///
  /// In en, this message translates to:
  /// **'Agents'**
  String get surfaceAgents;

  /// No description provided for @surfaceModels.
  ///
  /// In en, this message translates to:
  /// **'Models'**
  String get surfaceModels;

  /// No description provided for @surfaceModelDownload.
  ///
  /// In en, this message translates to:
  /// **'Model download'**
  String get surfaceModelDownload;

  /// No description provided for @surfaceModelOnboarding.
  ///
  /// In en, this message translates to:
  /// **'Model onboarding'**
  String get surfaceModelOnboarding;

  /// No description provided for @surfaceModelSettings.
  ///
  /// In en, this message translates to:
  /// **'Model settings'**
  String get surfaceModelSettings;

  /// No description provided for @surfaceProviders.
  ///
  /// In en, this message translates to:
  /// **'Providers'**
  String get surfaceProviders;

  /// No description provided for @surfaceMcp.
  ///
  /// In en, this message translates to:
  /// **'MCP tools'**
  String get surfaceMcp;

  /// No description provided for @surfaceSkills.
  ///
  /// In en, this message translates to:
  /// **'Skills'**
  String get surfaceSkills;

  /// No description provided for @surfaceMemory.
  ///
  /// In en, this message translates to:
  /// **'Memory'**
  String get surfaceMemory;

  /// No description provided for @surfacePromptSettings.
  ///
  /// In en, this message translates to:
  /// **'Prompts'**
  String get surfacePromptSettings;

  /// No description provided for @surfaceFlows.
  ///
  /// In en, this message translates to:
  /// **'Flows'**
  String get surfaceFlows;

  /// No description provided for @surfaceWorkflowStudio.
  ///
  /// In en, this message translates to:
  /// **'Workflow studio'**
  String get surfaceWorkflowStudio;

  /// No description provided for @surfaceComputerUse.
  ///
  /// In en, this message translates to:
  /// **'Computer use'**
  String get surfaceComputerUse;

  /// No description provided for @surfaceJdmEditor.
  ///
  /// In en, this message translates to:
  /// **'Rule editor'**
  String get surfaceJdmEditor;

  /// No description provided for @surfaceProvisioning.
  ///
  /// In en, this message translates to:
  /// **'Device provisioning'**
  String get surfaceProvisioning;

  /// No description provided for @surfaceDiscovery.
  ///
  /// In en, this message translates to:
  /// **'Discovery'**
  String get surfaceDiscovery;

  /// No description provided for @surfaceLogs.
  ///
  /// In en, this message translates to:
  /// **'Logs'**
  String get surfaceLogs;

  /// No description provided for @surfaceTrace.
  ///
  /// In en, this message translates to:
  /// **'Trace'**
  String get surfaceTrace;

  /// No description provided for @surfaceResonance.
  ///
  /// In en, this message translates to:
  /// **'Resonance'**
  String get surfaceResonance;

  /// No description provided for @surfaceTelencephalon.
  ///
  /// In en, this message translates to:
  /// **'Telencephalon'**
  String get surfaceTelencephalon;

  /// No description provided for @surfaceSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get surfaceSettings;

  /// No description provided for @surfaceSetup.
  ///
  /// In en, this message translates to:
  /// **'Setup'**
  String get surfaceSetup;

  /// No description provided for @navSectionConverse.
  ///
  /// In en, this message translates to:
  /// **'Converse'**
  String get navSectionConverse;

  /// No description provided for @navSectionWork.
  ///
  /// In en, this message translates to:
  /// **'Work'**
  String get navSectionWork;

  /// No description provided for @navSectionCapability.
  ///
  /// In en, this message translates to:
  /// **'Capabilities'**
  String get navSectionCapability;

  /// No description provided for @navSectionMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navSectionMore;

  /// No description provided for @navTabChat.
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get navTabChat;

  /// No description provided for @navTabTasks.
  ///
  /// In en, this message translates to:
  /// **'Tasks'**
  String get navTabTasks;

  /// No description provided for @navTabCapability.
  ///
  /// In en, this message translates to:
  /// **'Capabilities'**
  String get navTabCapability;

  /// No description provided for @navTabMe.
  ///
  /// In en, this message translates to:
  /// **'Me'**
  String get navTabMe;

  /// No description provided for @settingsGroupAppearance.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsGroupAppearance;

  /// No description provided for @settingsGroupVoice.
  ///
  /// In en, this message translates to:
  /// **'Voice & Accessibility'**
  String get settingsGroupVoice;

  /// No description provided for @settingsGroupRuntime.
  ///
  /// In en, this message translates to:
  /// **'Runtime'**
  String get settingsGroupRuntime;

  /// No description provided for @settingsGroupConnections.
  ///
  /// In en, this message translates to:
  /// **'Connections'**
  String get settingsGroupConnections;

  /// No description provided for @settingsGroupAdvanced.
  ///
  /// In en, this message translates to:
  /// **'Advanced'**
  String get settingsGroupAdvanced;

  /// No description provided for @settingsGroupAdvancedDesc.
  ///
  /// In en, this message translates to:
  /// **'Less-used and developer options'**
  String get settingsGroupAdvancedDesc;

  /// No description provided for @identityTitle.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get identityTitle;

  /// No description provided for @identityTitleDesc.
  ///
  /// In en, this message translates to:
  /// **'Who this device is, and which memory it reads and writes'**
  String get identityTitleDesc;

  /// No description provided for @identityCurrentTitle.
  ///
  /// In en, this message translates to:
  /// **'Who you are'**
  String get identityCurrentTitle;

  /// No description provided for @identityCurrentDesc.
  ///
  /// In en, this message translates to:
  /// **'The endbrain decides the tenant — the persona it reports is the memory isolation unit.'**
  String get identityCurrentDesc;

  /// No description provided for @identityPrincipal.
  ///
  /// In en, this message translates to:
  /// **'Person'**
  String get identityPrincipal;

  /// No description provided for @identityPersona.
  ///
  /// In en, this message translates to:
  /// **'Persona'**
  String get identityPersona;

  /// No description provided for @identityDevice.
  ///
  /// In en, this message translates to:
  /// **'Device'**
  String get identityDevice;

  /// No description provided for @identityTenant.
  ///
  /// In en, this message translates to:
  /// **'Memory bucket'**
  String get identityTenant;

  /// No description provided for @identityNobody.
  ///
  /// In en, this message translates to:
  /// **'(nobody behind this)'**
  String get identityNobody;

  /// No description provided for @identityExportTitle.
  ///
  /// In en, this message translates to:
  /// **'Export account'**
  String get identityExportTitle;

  /// No description provided for @identityExportDesc.
  ///
  /// In en, this message translates to:
  /// **'Take the account key to another device and import it — both sides become the same person, writing into the same memory.'**
  String get identityExportDesc;

  /// No description provided for @identityExportAction.
  ///
  /// In en, this message translates to:
  /// **'Export account key'**
  String get identityExportAction;

  /// No description provided for @identityExportActionDesc.
  ///
  /// In en, this message translates to:
  /// **'The account key IS the identity — whoever holds it is that person.'**
  String get identityExportActionDesc;

  /// No description provided for @identityExportFailed.
  ///
  /// In en, this message translates to:
  /// **'Export failed — the brain may not be running yet.'**
  String get identityExportFailed;

  /// No description provided for @identityImportTitle.
  ///
  /// In en, this message translates to:
  /// **'Import account'**
  String get identityImportTitle;

  /// No description provided for @identityImportDesc.
  ///
  /// In en, this message translates to:
  /// **'Paste an account key exported from another device — this device becomes that person.'**
  String get identityImportDesc;

  /// No description provided for @identityImportAction.
  ///
  /// In en, this message translates to:
  /// **'Import it'**
  String get identityImportAction;

  /// No description provided for @identityImportActionDesc.
  ///
  /// In en, this message translates to:
  /// **'Import takes effect immediately, no brain restart.'**
  String get identityImportActionDesc;

  /// No description provided for @identityImportPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Account key'**
  String get identityImportPlaceholder;

  /// No description provided for @identityImportFailed.
  ///
  /// In en, this message translates to:
  /// **'Import failed — the key is invalid, or the endbrain refused it.'**
  String get identityImportFailed;

  /// No description provided for @identityImportDone.
  ///
  /// In en, this message translates to:
  /// **'Imported — this device is that person now.'**
  String get identityImportDone;

  /// No description provided for @identityCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get identityCopy;

  /// No description provided for @identityCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get identityCopied;

  /// No description provided for @settingsAdvancedLogs.
  ///
  /// In en, this message translates to:
  /// **'Logs'**
  String get settingsAdvancedLogs;

  /// No description provided for @settingsAdvancedBackend.
  ///
  /// In en, this message translates to:
  /// **'Telencephalon backend'**
  String get settingsAdvancedBackend;

  /// No description provided for @settingsAdvancedBackendDesc.
  ///
  /// In en, this message translates to:
  /// **'Override the telencephalon base URL and admin token used by the mobile client.'**
  String get settingsAdvancedBackendDesc;

  /// No description provided for @settingsBackendAdminTokenHint.
  ///
  /// In en, this message translates to:
  /// **'leave blank for the embedded brain (fill in for an external one)'**
  String get settingsBackendAdminTokenHint;

  /// No description provided for @settingsBackendShadowKeyHint.
  ///
  /// In en, this message translates to:
  /// **'shadow key of an external telencephalon (leave blank if there is none)'**
  String get settingsBackendShadowKeyHint;

  /// No description provided for @settingsDangerZone.
  ///
  /// In en, this message translates to:
  /// **'Danger Zone'**
  String get settingsDangerZone;

  /// No description provided for @settingsDangerZoneDesc.
  ///
  /// In en, this message translates to:
  /// **'These actions cannot be undone. Use with care.'**
  String get settingsDangerZoneDesc;

  /// No description provided for @resetEngineDesc.
  ///
  /// In en, this message translates to:
  /// **'Reinitialize the engine'**
  String get resetEngineDesc;

  /// No description provided for @resetEngineConfirmDesc.
  ///
  /// In en, this message translates to:
  /// **'Resetting reinitializes the runtime and discards unsaved sessions. This cannot be undone.'**
  String get resetEngineConfirmDesc;

  /// No description provided for @resetEngineConfirm.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get resetEngineConfirm;

  /// No description provided for @telencephalonFlowsDesc.
  ///
  /// In en, this message translates to:
  /// **'Browse and run telencephalon flows'**
  String get telencephalonFlowsDesc;

  /// No description provided for @settingsThemeModeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeModeLight;

  /// No description provided for @settingsThemeModeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeModeDark;

  /// No description provided for @settingsDialogBackgroundDesc.
  ///
  /// In en, this message translates to:
  /// **'Override the background of dialogs and panels.'**
  String get settingsDialogBackgroundDesc;

  /// No description provided for @surfaceA2ui.
  ///
  /// In en, this message translates to:
  /// **'Generative UI'**
  String get surfaceA2ui;

  /// No description provided for @surfaceIdentity.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get surfaceIdentity;

  /// No description provided for @agent2uiNoConnection.
  ///
  /// In en, this message translates to:
  /// **'Not connected to the telencephalon'**
  String get agent2uiNoConnection;

  /// No description provided for @agent2uiWaiting.
  ///
  /// In en, this message translates to:
  /// **'Connecting to the telencephalon…'**
  String get agent2uiWaiting;

  /// No description provided for @agent2uiNoSurface.
  ///
  /// In en, this message translates to:
  /// **'Connected, but the telencephalon produced no surface'**
  String get agent2uiNoSurface;

  /// No description provided for @agent2uiSurfaceHint.
  ///
  /// In en, this message translates to:
  /// **'The surface drawn by the telencephalon will appear here'**
  String get agent2uiSurfaceHint;

  /// No description provided for @ttsEngineRust.
  ///
  /// In en, this message translates to:
  /// **'Rust'**
  String get ttsEngineRust;

  /// No description provided for @logsExported.
  ///
  /// In en, this message translates to:
  /// **'Logs exported to {path}'**
  String logsExported(String path);

  /// No description provided for @askAgent2UI.
  ///
  /// In en, this message translates to:
  /// **'Ask the telencephalon to draw...'**
  String get askAgent2UI;

  /// No description provided for @a2uiSurfaceReportTasks.
  ///
  /// In en, this message translates to:
  /// **'Expanded the task board.'**
  String get a2uiSurfaceReportTasks;

  /// No description provided for @a2uiSurfaceReportAgents.
  ///
  /// In en, this message translates to:
  /// **'Expanded the agent list.'**
  String get a2uiSurfaceReportAgents;

  /// No description provided for @a2uiSurfaceReportNoSurface.
  ///
  /// In en, this message translates to:
  /// **'The telencephalon did not draw an interface this time.'**
  String get a2uiSurfaceReportNoSurface;

  /// No description provided for @a2uiSurfaceReportNoSurfaceSaid.
  ///
  /// In en, this message translates to:
  /// **'The telencephalon did not draw an interface this time. It said: {words}'**
  String a2uiSurfaceReportNoSurfaceSaid(String words);

  /// No description provided for @settingsGroupCapabilities.
  ///
  /// In en, this message translates to:
  /// **'Capabilities'**
  String get settingsGroupCapabilities;

  /// No description provided for @settingsGroupCapabilitiesDesc.
  ///
  /// In en, this message translates to:
  /// **'You decide what the model may read on this phone, item by item'**
  String get settingsGroupCapabilitiesDesc;

  /// No description provided for @capabilityCalendarRead.
  ///
  /// In en, this message translates to:
  /// **'Read calendar'**
  String get capabilityCalendarRead;

  /// No description provided for @capabilityCalendarWrite.
  ///
  /// In en, this message translates to:
  /// **'Write calendar'**
  String get capabilityCalendarWrite;

  /// No description provided for @capabilityContacts.
  ///
  /// In en, this message translates to:
  /// **'Read contacts'**
  String get capabilityContacts;

  /// No description provided for @capabilitySms.
  ///
  /// In en, this message translates to:
  /// **'Read SMS'**
  String get capabilitySms;

  /// No description provided for @capabilityPhotos.
  ///
  /// In en, this message translates to:
  /// **'Read photos'**
  String get capabilityPhotos;

  /// No description provided for @capabilityAuthAsk.
  ///
  /// In en, this message translates to:
  /// **'Ask every time'**
  String get capabilityAuthAsk;

  /// No description provided for @capabilityAuthFull.
  ///
  /// In en, this message translates to:
  /// **'Full access'**
  String get capabilityAuthFull;

  /// No description provided for @capabilityAuthDisabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get capabilityAuthDisabled;

  /// No description provided for @capabilityAuthAskDesc.
  ///
  /// In en, this message translates to:
  /// **'Ask before every call'**
  String get capabilityAuthAskDesc;

  /// No description provided for @capabilityAuthFullDesc.
  ///
  /// In en, this message translates to:
  /// **'No per-call prompt'**
  String get capabilityAuthFullDesc;

  /// No description provided for @capabilityAuthDisabledDesc.
  ///
  /// In en, this message translates to:
  /// **'The model cannot see this capability'**
  String get capabilityAuthDisabledDesc;

  /// No description provided for @capabilitySystemGranted.
  ///
  /// In en, this message translates to:
  /// **'System permission granted'**
  String get capabilitySystemGranted;

  /// No description provided for @capabilitySystemMissing.
  ///
  /// In en, this message translates to:
  /// **'System permission not granted'**
  String get capabilitySystemMissing;

  /// No description provided for @capabilityRejectedDisabled.
  ///
  /// In en, this message translates to:
  /// **'This capability has been disabled in settings'**
  String get capabilityRejectedDisabled;

  /// No description provided for @capabilityUnsupportedPlatform.
  ///
  /// In en, this message translates to:
  /// **'Not supported on this platform'**
  String get capabilityUnsupportedPlatform;

  /// No description provided for @capabilityMobileUse.
  ///
  /// In en, this message translates to:
  /// **'Phone control'**
  String get capabilityMobileUse;

  /// No description provided for @capabilityRequestMobileUse.
  ///
  /// In en, this message translates to:
  /// **'to control this phone'**
  String get capabilityRequestMobileUse;

  /// No description provided for @capabilityRequestMobileReadScreen.
  ///
  /// In en, this message translates to:
  /// **'to read what is currently on this phone screen'**
  String get capabilityRequestMobileReadScreen;

  /// No description provided for @capabilityRequestMobileTap.
  ///
  /// In en, this message translates to:
  /// **'to tap a point on this phone screen'**
  String get capabilityRequestMobileTap;

  /// No description provided for @capabilityRequestMobileLongPress.
  ///
  /// In en, this message translates to:
  /// **'to press and hold a point on this phone screen'**
  String get capabilityRequestMobileLongPress;

  /// No description provided for @capabilityRequestMobileSwipe.
  ///
  /// In en, this message translates to:
  /// **'to swipe on this phone screen'**
  String get capabilityRequestMobileSwipe;

  /// No description provided for @capabilityRequestMobileFindAndClick.
  ///
  /// In en, this message translates to:
  /// **'to click a control on this phone screen by its text'**
  String get capabilityRequestMobileFindAndClick;

  /// No description provided for @capabilityRequestMobileGlobalAction.
  ///
  /// In en, this message translates to:
  /// **'to trigger a system action on this phone'**
  String get capabilityRequestMobileGlobalAction;

  /// No description provided for @capabilityArgMobilePoint.
  ///
  /// In en, this message translates to:
  /// **'at {x}, {y}'**
  String capabilityArgMobilePoint(String x, String y);

  /// No description provided for @capabilityArgMobileSwipe.
  ///
  /// In en, this message translates to:
  /// **'from {x1}, {y1} to {x2}, {y2}'**
  String capabilityArgMobileSwipe(String x1, String y1, String x2, String y2);

  /// No description provided for @capabilityArgMobileText.
  ///
  /// In en, this message translates to:
  /// **'text \"{text}\"'**
  String capabilityArgMobileText(String text);

  /// No description provided for @capabilityArgMobileAction.
  ///
  /// In en, this message translates to:
  /// **'action: {action}'**
  String capabilityArgMobileAction(String action);

  /// No description provided for @capabilityServiceGranted.
  ///
  /// In en, this message translates to:
  /// **'Accessibility service enabled'**
  String get capabilityServiceGranted;

  /// No description provided for @capabilityServiceMissing.
  ///
  /// In en, this message translates to:
  /// **'Accessibility service not enabled'**
  String get capabilityServiceMissing;

  /// No description provided for @capabilityGrantService.
  ///
  /// In en, this message translates to:
  /// **'Enable'**
  String get capabilityGrantService;

  /// No description provided for @toolCallAllow.
  ///
  /// In en, this message translates to:
  /// **'Allow'**
  String get toolCallAllow;

  /// No description provided for @toolCallDeny.
  ///
  /// In en, this message translates to:
  /// **'Deny'**
  String get toolCallDeny;

  /// No description provided for @capabilityRequestCalendarRead.
  ///
  /// In en, this message translates to:
  /// **'Read calendar events on this phone'**
  String get capabilityRequestCalendarRead;

  /// No description provided for @capabilityRequestCalendarWrite.
  ///
  /// In en, this message translates to:
  /// **'Write an event to the calendar on this phone'**
  String get capabilityRequestCalendarWrite;

  /// No description provided for @capabilityRequestContacts.
  ///
  /// In en, this message translates to:
  /// **'Read the contacts on this phone'**
  String get capabilityRequestContacts;

  /// No description provided for @capabilityRequestSms.
  ///
  /// In en, this message translates to:
  /// **'Read the SMS messages on this phone'**
  String get capabilityRequestSms;

  /// No description provided for @capabilityRequestPhotos.
  ///
  /// In en, this message translates to:
  /// **'Read photo information from this phone'**
  String get capabilityRequestPhotos;

  /// No description provided for @capabilityArgTimeRange.
  ///
  /// In en, this message translates to:
  /// **'{from} ~ {to}'**
  String capabilityArgTimeRange(String from, String to);

  /// No description provided for @capabilityArgTimeRangeDefault.
  ///
  /// In en, this message translates to:
  /// **'the next 7 days'**
  String get capabilityArgTimeRangeDefault;

  /// No description provided for @capabilityArgTitle.
  ///
  /// In en, this message translates to:
  /// **'Title “{title}”'**
  String capabilityArgTitle(String title);

  /// No description provided for @capabilityArgStartAt.
  ///
  /// In en, this message translates to:
  /// **'starting {time}'**
  String capabilityArgStartAt(String time);

  /// No description provided for @capabilityArgKeyword.
  ///
  /// In en, this message translates to:
  /// **'name contains “{query}”'**
  String capabilityArgKeyword(String query);

  /// No description provided for @capabilityArgContactsHead.
  ///
  /// In en, this message translates to:
  /// **'the first {count} contacts'**
  String capabilityArgContactsHead(String count);

  /// No description provided for @capabilityArgRecentSms.
  ///
  /// In en, this message translates to:
  /// **'the most recent {count} messages'**
  String capabilityArgRecentSms(String count);

  /// No description provided for @capabilityArgRecentPhotos.
  ///
  /// In en, this message translates to:
  /// **'the most recent {count} photos'**
  String capabilityArgRecentPhotos(String count);

  /// No description provided for @capabilityGrantSystemPermission.
  ///
  /// In en, this message translates to:
  /// **'Grant'**
  String get capabilityGrantSystemPermission;

  /// No description provided for @backgroundKeepAlive.
  ///
  /// In en, this message translates to:
  /// **'Keep running in background'**
  String get backgroundKeepAlive;

  /// No description provided for @backgroundKeepAliveHint.
  ///
  /// In en, this message translates to:
  /// **'Keeps the on-device brain and engines alive while backgrounded (shows a persistent notification)'**
  String get backgroundKeepAliveHint;

  /// No description provided for @backgroundServiceStatus.
  ///
  /// In en, this message translates to:
  /// **'Foreground service'**
  String get backgroundServiceStatus;

  /// No description provided for @backgroundServiceOn.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get backgroundServiceOn;

  /// No description provided for @backgroundServiceOff.
  ///
  /// In en, this message translates to:
  /// **'Not running'**
  String get backgroundServiceOff;

  /// No description provided for @backgroundServiceTitle.
  ///
  /// In en, this message translates to:
  /// **'Shadow is running'**
  String get backgroundServiceTitle;

  /// No description provided for @backgroundServiceText.
  ///
  /// In en, this message translates to:
  /// **'Brain and local engines stay alive in the background'**
  String get backgroundServiceText;

  /// No description provided for @backgroundStop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get backgroundStop;

  /// No description provided for @batteryOptimization.
  ///
  /// In en, this message translates to:
  /// **'Battery optimization exemption'**
  String get batteryOptimization;

  /// No description provided for @batteryOptimizationExempt.
  ///
  /// In en, this message translates to:
  /// **'Exempted — background running is reliable'**
  String get batteryOptimizationExempt;

  /// No description provided for @batteryOptimizationAsk.
  ///
  /// In en, this message translates to:
  /// **'Not exempted yet (needed on aggressive systems like MIUI)'**
  String get batteryOptimizationAsk;

  /// No description provided for @batteryOptimizationRequest.
  ///
  /// In en, this message translates to:
  /// **'Request'**
  String get batteryOptimizationRequest;
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
