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

  /// No description provided for @modelSettings.
  ///
  /// In en, this message translates to:
  /// **'Model Settings'**
  String get modelSettings;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @messageActionCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get messageActionCopy;

  /// No description provided for @messageActionRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get messageActionRetry;

  /// No description provided for @messageActionUndo.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get messageActionUndo;

  /// No description provided for @messageCopiedToast.
  ///
  /// In en, this message translates to:
  /// **'Copied to clipboard'**
  String get messageCopiedToast;

  /// No description provided for @messageTokenStatsSummary.
  ///
  /// In en, this message translates to:
  /// **'{tokens} tokens · {speed} tok/s'**
  String messageTokenStatsSummary(int tokens, String speed);

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

  /// No description provided for @save.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// No description provided for @provider.
  ///
  /// In en, this message translates to:
  /// **'Provider'**
  String get provider;

  /// No description provided for @errorGeneric.
  ///
  /// In en, this message translates to:
  /// **'Error: {detail}'**
  String errorGeneric(String detail);

  /// No description provided for @mobileNetworkDetected.
  ///
  /// In en, this message translates to:
  /// **'Mobile Network Detected'**
  String get mobileNetworkDetected;

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

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

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

  /// No description provided for @custom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get custom;

  /// No description provided for @agent2UI.
  ///
  /// In en, this message translates to:
  /// **'Agent2UI'**
  String get agent2UI;

  /// No description provided for @removeAttachment.
  ///
  /// In en, this message translates to:
  /// **'Remove attachment'**
  String get removeAttachment;

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

  /// No description provided for @aiAutoAnswer.
  ///
  /// In en, this message translates to:
  /// **'AI Auto-Answer'**
  String get aiAutoAnswer;

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

  /// No description provided for @conversationRunning.
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get conversationRunning;

  /// No description provided for @conversationToolReadScreen.
  ///
  /// In en, this message translates to:
  /// **'Read screen'**
  String get conversationToolReadScreen;

  /// No description provided for @conversationToolTap.
  ///
  /// In en, this message translates to:
  /// **'Tap'**
  String get conversationToolTap;

  /// No description provided for @conversationToolLongPress.
  ///
  /// In en, this message translates to:
  /// **'Long-press'**
  String get conversationToolLongPress;

  /// No description provided for @conversationToolSwipe.
  ///
  /// In en, this message translates to:
  /// **'Swipe'**
  String get conversationToolSwipe;

  /// No description provided for @conversationToolFindAndClick.
  ///
  /// In en, this message translates to:
  /// **'Find & tap'**
  String get conversationToolFindAndClick;

  /// No description provided for @conversationToolGlobalAction.
  ///
  /// In en, this message translates to:
  /// **'Global action'**
  String get conversationToolGlobalAction;

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

  /// No description provided for @mcpLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Cannot read the MCP server list from the brain'**
  String get mcpLoadFailed;

  /// No description provided for @mcpTemplateLabel.
  ///
  /// In en, this message translates to:
  /// **'Template'**
  String get mcpTemplateLabel;

  /// No description provided for @mcpTemplateCustom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get mcpTemplateCustom;

  /// No description provided for @mcpHaMcpUrlPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'http://<HA-host>:9584/private_… or …/api/webhook/mcp_…'**
  String get mcpHaMcpUrlPlaceholder;

  /// No description provided for @mcpHaMcpUrlHint.
  ///
  /// In en, this message translates to:
  /// **'Paste the connect URL from the HA-MCP integration\'s Configure screen: on the LAN it is http://<HA-host>:9584/private_…, remote access goes through the webhook. The secret URL itself is the credential.'**
  String get mcpHaMcpUrlHint;

  /// No description provided for @mcpHaMcpBearerHint.
  ///
  /// In en, this message translates to:
  /// **'Usually leave it empty — the URL is the credential. ha-mcp\'s Home Assistant sign-in mode uses OAuth, which the brain does not support yet.'**
  String get mcpHaMcpBearerHint;

  /// No description provided for @mcpHaMcpDescription.
  ///
  /// In en, this message translates to:
  /// **'Home Assistant control & automation (ha-mcp)'**
  String get mcpHaMcpDescription;

  /// No description provided for @memoryEmpty.
  ///
  /// In en, this message translates to:
  /// **'No memories yet'**
  String get memoryEmpty;

  /// No description provided for @memoryUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach the memory store'**
  String get memoryUnavailable;

  /// No description provided for @memoryUnavailableHint.
  ///
  /// In en, this message translates to:
  /// **'The {brain} on this device has no memory face (hippocampus not enabled), or the request failed. Reason: {reason}'**
  String memoryUnavailableHint(String brain, String reason);

  /// No description provided for @commonAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get commonAll;

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

  /// No description provided for @modelCategoryText.
  ///
  /// In en, this message translates to:
  /// **'Text models'**
  String get modelCategoryText;

  /// No description provided for @modelCategoryVision.
  ///
  /// In en, this message translates to:
  /// **'Vision models'**
  String get modelCategoryVision;

  /// No description provided for @modelCatalogTitle.
  ///
  /// In en, this message translates to:
  /// **'Supported models'**
  String get modelCatalogTitle;

  /// No description provided for @modelCatalogHint.
  ///
  /// In en, this message translates to:
  /// **'Models the embedded brain supports; local models marked \"not downloaded\" cannot run yet.'**
  String get modelCatalogHint;

  /// No description provided for @modelCatalogEmpty.
  ///
  /// In en, this message translates to:
  /// **'Catalog not fetched yet'**
  String get modelCatalogEmpty;

  /// No description provided for @capLlm.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get capLlm;

  /// No description provided for @capVision.
  ///
  /// In en, this message translates to:
  /// **'Vision'**
  String get capVision;

  /// No description provided for @capAsr.
  ///
  /// In en, this message translates to:
  /// **'Speech recognition'**
  String get capAsr;

  /// No description provided for @capTts.
  ///
  /// In en, this message translates to:
  /// **'Speech synthesis'**
  String get capTts;

  /// No description provided for @capEmbedding.
  ///
  /// In en, this message translates to:
  /// **'Embedding'**
  String get capEmbedding;

  /// No description provided for @capRerank.
  ///
  /// In en, this message translates to:
  /// **'Rerank'**
  String get capRerank;

  /// No description provided for @capOcr.
  ///
  /// In en, this message translates to:
  /// **'OCR'**
  String get capOcr;

  /// No description provided for @capImageGen.
  ///
  /// In en, this message translates to:
  /// **'Image generation'**
  String get capImageGen;

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
  /// **'Brain Runtime'**
  String get settingsEncephalonEmbedded;

  /// No description provided for @settingsEncephalonEmbeddedDesc.
  ///
  /// In en, this message translates to:
  /// **'Brain runtime status, start/stop, and the in-process inference probe (model choice lives on the capability tab: the default-model card and the agents page)'**
  String get settingsEncephalonEmbeddedDesc;

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

  /// No description provided for @deviceThisMachine.
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get deviceThisMachine;

  /// No description provided for @encephalonStartFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to start the embedded brain'**
  String get encephalonStartFailed;

  /// No description provided for @encephalonEmbeddedTitle.
  ///
  /// In en, this message translates to:
  /// **'Brain Runtime'**
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
  /// **'Default models'**
  String get encephalonModelSourceTitle;

  /// No description provided for @encephalonModelSourceHint.
  ///
  /// In en, this message translates to:
  /// **'Each category picks its own model - chat can run in the cloud while speech recognition stays local. Lobes follow the chat model here unless you set one for them below.'**
  String get encephalonModelSourceHint;

  /// No description provided for @encephalonModelLocalNeuron.
  ///
  /// In en, this message translates to:
  /// **'Local neuron weights'**
  String get encephalonModelLocalNeuron;

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

  /// No description provided for @encephalonModelOptionsUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Could not read the provider catalog from the brain - it may not be running.'**
  String get encephalonModelOptionsUnavailable;

  /// No description provided for @capabilityDefaultsAppliedButNotCached.
  ///
  /// In en, this message translates to:
  /// **'Applied to the brain, but the local copy was not saved - this tier will reset after a restart.'**
  String get capabilityDefaultsAppliedButNotCached;

  /// No description provided for @capabilityDefaultUnset.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get capabilityDefaultUnset;

  /// No description provided for @capabilityDefaultsEmpty.
  ///
  /// In en, this message translates to:
  /// **'This brain exposes no capability tiers.'**
  String get capabilityDefaultsEmpty;

  /// No description provided for @brainChatModelLabel.
  ///
  /// In en, this message translates to:
  /// **'Chat model'**
  String get brainChatModelLabel;

  /// No description provided for @brainModelBadgeLocal.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get brainModelBadgeLocal;

  /// No description provided for @brainModelBadgeCloud.
  ///
  /// In en, this message translates to:
  /// **'Cloud'**
  String get brainModelBadgeCloud;

  /// No description provided for @brainTiersNotReadNote.
  ///
  /// In en, this message translates to:
  /// **'{tiers}: the brain does not read a default model for these categories yet, so there is nothing to choose here.'**
  String brainTiersNotReadNote(String tiers);

  /// No description provided for @brainLobeSectionHint.
  ///
  /// In en, this message translates to:
  /// **'Each lobe follows the chat model above until you set one for it; speech recognition / speech synthesis can each pick their own engine per lobe.'**
  String get brainLobeSectionHint;

  /// No description provided for @brainLobeListEmpty.
  ///
  /// In en, this message translates to:
  /// **'This brain has no lobes that can be set individually.'**
  String get brainLobeListEmpty;

  /// No description provided for @brainLobeCapabilityCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current: {model}'**
  String brainLobeCapabilityCurrent(String model);

  /// No description provided for @brainLobeCapabilityFollowsGlobal.
  ///
  /// In en, this message translates to:
  /// **'Follows global: {model}'**
  String brainLobeCapabilityFollowsGlobal(String model);

  /// No description provided for @encephalonLobeRoutingTitle.
  ///
  /// In en, this message translates to:
  /// **'Lobe model routing'**
  String get encephalonLobeRoutingTitle;

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

  /// No description provided for @settingsBackground.
  ///
  /// In en, this message translates to:
  /// **'Background'**
  String get settingsBackground;

  /// No description provided for @settingsBackgroundDesc.
  ///
  /// In en, this message translates to:
  /// **'Chat wallpaper and dialog backdrop color.'**
  String get settingsBackgroundDesc;

  /// No description provided for @settingsAccentCustom.
  ///
  /// In en, this message translates to:
  /// **'Custom'**
  String get settingsAccentCustom;

  /// No description provided for @settingsAccentCustomPick.
  ///
  /// In en, this message translates to:
  /// **'Custom color…'**
  String get settingsAccentCustomPick;

  /// No description provided for @settingsAccentHue.
  ///
  /// In en, this message translates to:
  /// **'Hue'**
  String get settingsAccentHue;

  /// No description provided for @settingsAccentSat.
  ///
  /// In en, this message translates to:
  /// **'Saturation'**
  String get settingsAccentSat;

  /// No description provided for @settingsAccentLight.
  ///
  /// In en, this message translates to:
  /// **'Lightness'**
  String get settingsAccentLight;

  /// No description provided for @settingsAccentApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get settingsAccentApply;

  /// No description provided for @settingsChatBackground.
  ///
  /// In en, this message translates to:
  /// **'Chat background'**
  String get settingsChatBackground;

  /// No description provided for @settingsChatBackgroundDesc.
  ///
  /// In en, this message translates to:
  /// **'Pick a background image for the chat page.'**
  String get settingsChatBackgroundDesc;

  /// No description provided for @settingsChatBackgroundPick.
  ///
  /// In en, this message translates to:
  /// **'Choose image'**
  String get settingsChatBackgroundPick;

  /// No description provided for @settingsChatBackgroundClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get settingsChatBackgroundClear;

  /// No description provided for @settingsChatBackgroundFailed.
  ///
  /// In en, this message translates to:
  /// **'Failed to set background: {error}'**
  String settingsChatBackgroundFailed(String error);

  /// No description provided for @settingsConfigSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Not saved: {error}'**
  String settingsConfigSaveFailed(String error);

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

  /// No description provided for @memoryStorageTitle.
  ///
  /// In en, this message translates to:
  /// **'Memory storage'**
  String get memoryStorageTitle;

  /// No description provided for @memoryStorageDesc.
  ///
  /// In en, this message translates to:
  /// **'Where long-term memory lives (local directory / S3-compatible / Alibaba OSS)'**
  String get memoryStorageDesc;

  /// No description provided for @memoryStorageBackendLocal.
  ///
  /// In en, this message translates to:
  /// **'Local'**
  String get memoryStorageBackendLocal;

  /// No description provided for @memoryStorageBackendS3.
  ///
  /// In en, this message translates to:
  /// **'S3-compatible'**
  String get memoryStorageBackendS3;

  /// No description provided for @memoryStorageBackendRustfs.
  ///
  /// In en, this message translates to:
  /// **'RustFS'**
  String get memoryStorageBackendRustfs;

  /// No description provided for @memoryStorageInvalidRustfsEndpoint.
  ///
  /// In en, this message translates to:
  /// **'RustFS needs an endpoint (e.g. http://127.0.0.1:9000)'**
  String get memoryStorageInvalidRustfsEndpoint;

  /// No description provided for @memoryStorageDefaultRootHint.
  ///
  /// In en, this message translates to:
  /// **'Leave empty to use the default location: {path}'**
  String memoryStorageDefaultRootHint(String path);

  /// No description provided for @memoryStorageCopyIfNotExists.
  ///
  /// In en, this message translates to:
  /// **'copy_if_not_exists'**
  String get memoryStorageCopyIfNotExists;

  /// No description provided for @memoryStorageCopyIfNotExistsHint.
  ///
  /// In en, this message translates to:
  /// **'Header for create-if-not-exists copies (RustFS: header: if-none-match: *; AWS S3 does not support it — leave empty)'**
  String get memoryStorageCopyIfNotExistsHint;

  /// No description provided for @memoryStorageBackendOss.
  ///
  /// In en, this message translates to:
  /// **'Alibaba OSS'**
  String get memoryStorageBackendOss;

  /// No description provided for @memoryStorageLocation.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get memoryStorageLocation;

  /// No description provided for @memoryStorageLocationLocalHint.
  ///
  /// In en, this message translates to:
  /// **'Absolute path of a local directory'**
  String get memoryStorageLocationLocalHint;

  /// No description provided for @memoryStorageLocationRemoteHint.
  ///
  /// In en, this message translates to:
  /// **'Like s3://bucket/prefix or oss://bucket/prefix'**
  String get memoryStorageLocationRemoteHint;

  /// No description provided for @memoryStorageEndpoint.
  ///
  /// In en, this message translates to:
  /// **'Endpoint'**
  String get memoryStorageEndpoint;

  /// No description provided for @memoryStorageEndpointHint.
  ///
  /// In en, this message translates to:
  /// **'For a self-hosted store or a non-default region; required for OSS'**
  String get memoryStorageEndpointHint;

  /// No description provided for @memoryStorageRegion.
  ///
  /// In en, this message translates to:
  /// **'Region'**
  String get memoryStorageRegion;

  /// No description provided for @memoryStorageAccessKey.
  ///
  /// In en, this message translates to:
  /// **'Access Key'**
  String get memoryStorageAccessKey;

  /// No description provided for @memoryStorageSecretKey.
  ///
  /// In en, this message translates to:
  /// **'Secret Key'**
  String get memoryStorageSecretKey;

  /// No description provided for @memoryStorageSecretHint.
  ///
  /// In en, this message translates to:
  /// **'Shown as *** when configured (saving it unchanged keeps the value)'**
  String get memoryStorageSecretHint;

  /// No description provided for @memoryStorageAllowHttp.
  ///
  /// In en, this message translates to:
  /// **'Allow an HTTP endpoint (self-hosted store on the LAN)'**
  String get memoryStorageAllowHttp;

  /// No description provided for @memoryStorageSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get memoryStorageSave;

  /// No description provided for @memoryStorageSaving.
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get memoryStorageSaving;

  /// No description provided for @memoryStorageSavedPending.
  ///
  /// In en, this message translates to:
  /// **'Saved — takes effect after the brain restarts'**
  String get memoryStorageSavedPending;

  /// No description provided for @memoryStorageConfigured.
  ///
  /// In en, this message translates to:
  /// **'Configured'**
  String get memoryStorageConfigured;

  /// No description provided for @memoryStorageNotConfigured.
  ///
  /// In en, this message translates to:
  /// **'Not configured (default location)'**
  String get memoryStorageNotConfigured;

  /// No description provided for @memoryStorageUnreadable.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach the control plane'**
  String get memoryStorageUnreadable;

  /// No description provided for @memoryStorageRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get memoryStorageRetry;

  /// No description provided for @memoryStorageBuildHint.
  ///
  /// In en, this message translates to:
  /// **'Note: the default build does not include the memory system (needs a mobile-memory build); a setting here only applies in such a build'**
  String get memoryStorageBuildHint;

  /// No description provided for @memoryStoragePendingHint.
  ///
  /// In en, this message translates to:
  /// **'⚠️ The storage location is read once at boot — saving takes effect only after a restart'**
  String get memoryStoragePendingHint;

  /// No description provided for @memoryStorageMigrationHint.
  ///
  /// In en, this message translates to:
  /// **'⚠️ Changing the location **migrates** the existing memories (copy first, then switch; old data removed). Chat and memory operations pause while it runs — keep the app open'**
  String get memoryStorageMigrationHint;

  /// No description provided for @memoryStorageMigrationTitle.
  ///
  /// In en, this message translates to:
  /// **'Migrating the memory store'**
  String get memoryStorageMigrationTitle;

  /// No description provided for @memoryStorageMigrationRunningHint.
  ///
  /// In en, this message translates to:
  /// **'Moving memories, conversations and graph data to the new location. Please don\'t use the app; if it is closed mid-way, the migration resumes next time'**
  String get memoryStorageMigrationRunningHint;

  /// No description provided for @memoryStorageMigrationFailedHint.
  ///
  /// In en, this message translates to:
  /// **'The migration did not finish. Your existing data is untouched — retry or abort'**
  String get memoryStorageMigrationFailedHint;

  /// No description provided for @memoryStorageMigrationDatasets.
  ///
  /// In en, this message translates to:
  /// **'Datasets {done}/{total}'**
  String memoryStorageMigrationDatasets(int done, int total);

  /// No description provided for @memoryStorageMigrationCurrent.
  ///
  /// In en, this message translates to:
  /// **'Copying: {name}'**
  String memoryStorageMigrationCurrent(String name);

  /// No description provided for @memoryStorageMigrationAbort.
  ///
  /// In en, this message translates to:
  /// **'Abort and keep the old store'**
  String get memoryStorageMigrationAbort;

  /// No description provided for @memoryStorageMigrationRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get memoryStorageMigrationRetry;

  /// No description provided for @memoryStorageMigrationRestarting.
  ///
  /// In en, this message translates to:
  /// **'Migration complete — restarting the brain…'**
  String get memoryStorageMigrationRestarting;

  /// No description provided for @memoryStorageInvalidLocation.
  ///
  /// In en, this message translates to:
  /// **'The location cannot be empty'**
  String get memoryStorageInvalidLocation;

  /// No description provided for @memoryStorageInvalidScheme.
  ///
  /// In en, this message translates to:
  /// **'The location must start with {scheme}'**
  String memoryStorageInvalidScheme(String scheme);

  /// No description provided for @memoryStorageInvalidOssEndpoint.
  ///
  /// In en, this message translates to:
  /// **'OSS requires an endpoint'**
  String get memoryStorageInvalidOssEndpoint;

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

  /// No description provided for @capabilityAuthAskMobileUseDesc.
  ///
  /// In en, this message translates to:
  /// **'Ask once per task round; inside sensitive apps (e.g. payment) every step asks again'**
  String get capabilityAuthAskMobileUseDesc;

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

  /// No description provided for @capabilityNotificationsRead.
  ///
  /// In en, this message translates to:
  /// **'Read notifications'**
  String get capabilityNotificationsRead;

  /// No description provided for @capabilityRequestNotificationsRead.
  ///
  /// In en, this message translates to:
  /// **'to read recent notifications on this device'**
  String get capabilityRequestNotificationsRead;

  /// No description provided for @capabilityArgRecentNotifications.
  ///
  /// In en, this message translates to:
  /// **'the most recent {count} notifications'**
  String capabilityArgRecentNotifications(String count);

  /// No description provided for @capabilityListenerGranted.
  ///
  /// In en, this message translates to:
  /// **'notification access granted'**
  String get capabilityListenerGranted;

  /// No description provided for @capabilityListenerMissing.
  ///
  /// In en, this message translates to:
  /// **'notification access not granted, tap to enable'**
  String get capabilityListenerMissing;

  /// No description provided for @capabilityGrantSystemPermission.
  ///
  /// In en, this message translates to:
  /// **'Grant'**
  String get capabilityGrantSystemPermission;

  /// No description provided for @capabilityGrantSucceeded.
  ///
  /// In en, this message translates to:
  /// **'Granted'**
  String get capabilityGrantSucceeded;

  /// No description provided for @capabilityGrantDenied.
  ///
  /// In en, this message translates to:
  /// **'Permission denied'**
  String get capabilityGrantDenied;

  /// No description provided for @capabilityGrantNeedsSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'The system will not ask again'**
  String get capabilityGrantNeedsSettingsTitle;

  /// No description provided for @capabilityGrantNeedsSettingsBody.
  ///
  /// In en, this message translates to:
  /// **'Needs to be turned on in system settings'**
  String get capabilityGrantNeedsSettingsBody;

  /// No description provided for @capabilityGrantGoToSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get capabilityGrantGoToSettings;

  /// No description provided for @capabilityPermissionRequired.
  ///
  /// In en, this message translates to:
  /// **'System permission needed: {permission}'**
  String capabilityPermissionRequired(String permission);

  /// No description provided for @capabilityPermissionRequiredAccessibility.
  ///
  /// In en, this message translates to:
  /// **'the accessibility service (phone control)'**
  String get capabilityPermissionRequiredAccessibility;

  /// No description provided for @capabilityDeclarationMismatch.
  ///
  /// In en, this message translates to:
  /// **'Permission declaration does not match: the model declared {declared}, but this tool really needs {required}'**
  String capabilityDeclarationMismatch(String declared, String required);

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

  /// No description provided for @selfHostedAdd.
  ///
  /// In en, this message translates to:
  /// **'Add self-hosted model'**
  String get selfHostedAdd;

  /// No description provided for @selfHostedTitle.
  ///
  /// In en, this message translates to:
  /// **'Add self-hosted model'**
  String get selfHostedTitle;

  /// No description provided for @selfHostedModelId.
  ///
  /// In en, this message translates to:
  /// **'Model ID'**
  String get selfHostedModelId;

  /// No description provided for @selfHostedModelIdRequired.
  ///
  /// In en, this message translates to:
  /// **'Model ID is required'**
  String get selfHostedModelIdRequired;

  /// No description provided for @selfHostedDisplayName.
  ///
  /// In en, this message translates to:
  /// **'Display name (optional)'**
  String get selfHostedDisplayName;

  /// No description provided for @selfHostedEndpoint.
  ///
  /// In en, this message translates to:
  /// **'Endpoint (OpenAI-compatible base URL)'**
  String get selfHostedEndpoint;

  /// No description provided for @selfHostedEndpointRequired.
  ///
  /// In en, this message translates to:
  /// **'Endpoint is required'**
  String get selfHostedEndpointRequired;

  /// No description provided for @selfHostedApiKeyOptional.
  ///
  /// In en, this message translates to:
  /// **'API key (optional)'**
  String get selfHostedApiKeyOptional;

  /// No description provided for @selfHostedContextWindow.
  ///
  /// In en, this message translates to:
  /// **'Context window'**
  String get selfHostedContextWindow;

  /// No description provided for @selfHostedMaxOutput.
  ///
  /// In en, this message translates to:
  /// **'Max output tokens'**
  String get selfHostedMaxOutput;

  /// No description provided for @selfHostedInputTypes.
  ///
  /// In en, this message translates to:
  /// **'Input types'**
  String get selfHostedInputTypes;

  /// No description provided for @selfHostedCapabilities.
  ///
  /// In en, this message translates to:
  /// **'Capabilities'**
  String get selfHostedCapabilities;

  /// No description provided for @selfHostedReasoningLevels.
  ///
  /// In en, this message translates to:
  /// **'Reasoning effort levels (low to high)'**
  String get selfHostedReasoningLevels;

  /// No description provided for @selfHostedReasoningOff.
  ///
  /// In en, this message translates to:
  /// **'Not supported'**
  String get selfHostedReasoningOff;

  /// No description provided for @selfHostedAdvanced.
  ///
  /// In en, this message translates to:
  /// **'Advanced'**
  String get selfHostedAdvanced;

  /// No description provided for @selfHostedReasoningMapping.
  ///
  /// In en, this message translates to:
  /// **'Reasoning parameter mapping'**
  String get selfHostedReasoningMapping;

  /// No description provided for @selfHostedReasoningMappingHint.
  ///
  /// In en, this message translates to:
  /// **'JSON snapshot: standard × level → request body params'**
  String get selfHostedReasoningMappingHint;

  /// No description provided for @selfHostedAdvancedConfig.
  ///
  /// In en, this message translates to:
  /// **'Advanced config (JSON)'**
  String get selfHostedAdvancedConfig;

  /// No description provided for @selfHostedProbe.
  ///
  /// In en, this message translates to:
  /// **'Probe models from endpoint'**
  String get selfHostedProbe;

  /// No description provided for @selfHostedProbeEmpty.
  ///
  /// In en, this message translates to:
  /// **'Endpoint returned no models'**
  String get selfHostedProbeEmpty;

  /// No description provided for @selfHostedProbePick.
  ///
  /// In en, this message translates to:
  /// **'Pick a model ID'**
  String get selfHostedProbePick;

  /// No description provided for @selfHostedSubmit.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get selfHostedSubmit;

  /// No description provided for @selfHostedSaving.
  ///
  /// In en, this message translates to:
  /// **'Adding…'**
  String get selfHostedSaving;

  /// No description provided for @smartConfigBadge.
  ///
  /// In en, this message translates to:
  /// **'Smart config'**
  String get smartConfigBadge;

  /// No description provided for @inputTypeText.
  ///
  /// In en, this message translates to:
  /// **'Text'**
  String get inputTypeText;

  /// No description provided for @inputTypeImage.
  ///
  /// In en, this message translates to:
  /// **'Image'**
  String get inputTypeImage;

  /// No description provided for @inputTypeAudio.
  ///
  /// In en, this message translates to:
  /// **'Audio'**
  String get inputTypeAudio;

  /// No description provided for @inputTypeVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get inputTypeVideo;

  /// No description provided for @cloudGuideTitle.
  ///
  /// In en, this message translates to:
  /// **'Cloud models live with providers'**
  String get cloudGuideTitle;

  /// No description provided for @cloudGuideDesc.
  ///
  /// In en, this message translates to:
  /// **'Add a cloud provider and its supported models are fetched automatically.'**
  String get cloudGuideDesc;

  /// No description provided for @voiceNoteBrainAsrPending.
  ///
  /// In en, this message translates to:
  /// **'Voice transcription is not wired to the brain\'s speech-recognition face yet — type your question, or wait until it is connected.'**
  String get voiceNoteBrainAsrPending;

  /// No description provided for @zitiGroup.
  ///
  /// In en, this message translates to:
  /// **'Zero Trust'**
  String get zitiGroup;

  /// No description provided for @zitiGroupDesc.
  ///
  /// In en, this message translates to:
  /// **'Put this phone on the zero-trust network: reach a remote brain, or publish this one'**
  String get zitiGroupDesc;

  /// No description provided for @zitiMode.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get zitiMode;

  /// No description provided for @zitiModeOff.
  ///
  /// In en, this message translates to:
  /// **'No zero trust'**
  String get zitiModeOff;

  /// No description provided for @zitiModeClient.
  ///
  /// In en, this message translates to:
  /// **'Reach a remote brain'**
  String get zitiModeClient;

  /// No description provided for @zitiModeServer.
  ///
  /// In en, this message translates to:
  /// **'Publish this brain'**
  String get zitiModeServer;

  /// No description provided for @zitiModeHint.
  ///
  /// In en, this message translates to:
  /// **'Save to apply. The role is decided at startup, so restart the app.'**
  String get zitiModeHint;

  /// No description provided for @zitiService.
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get zitiService;

  /// No description provided for @zitiServicePlaceholder.
  ///
  /// In en, this message translates to:
  /// **'shadow-brain'**
  String get zitiServicePlaceholder;

  /// No description provided for @zitiServiceHint.
  ///
  /// In en, this message translates to:
  /// **'The zero-trust service to dial or publish'**
  String get zitiServiceHint;

  /// No description provided for @zitiIdentity.
  ///
  /// In en, this message translates to:
  /// **'Identity'**
  String get zitiIdentity;

  /// No description provided for @zitiIdentityNone.
  ///
  /// In en, this message translates to:
  /// **'No identity imported yet'**
  String get zitiIdentityNone;

  /// No description provided for @zitiIdentityLoaded.
  ///
  /// In en, this message translates to:
  /// **'Imported: controller {api} · identity {id}'**
  String zitiIdentityLoaded(String api, String id);

  /// No description provided for @zitiIdentityLoadedNoId.
  ///
  /// In en, this message translates to:
  /// **'Imported: controller {api}'**
  String zitiIdentityLoadedNoId(String api);

  /// No description provided for @zitiIdentityPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Paste the identity JSON (ztAPI / id / ca / cert / key)'**
  String get zitiIdentityPlaceholder;

  /// No description provided for @zitiIdentityHint.
  ///
  /// In en, this message translates to:
  /// **'The identity must carry inline ca / cert / key PEMs; a file path is rejected explicitly (that file does not exist here)'**
  String get zitiIdentityHint;

  /// No description provided for @zitiImport.
  ///
  /// In en, this message translates to:
  /// **'Import identity'**
  String get zitiImport;

  /// No description provided for @zitiClearIdentity.
  ///
  /// In en, this message translates to:
  /// **'Delete identity'**
  String get zitiClearIdentity;

  /// No description provided for @zitiSavedHint.
  ///
  /// In en, this message translates to:
  /// **'Saved (restart the app to apply)'**
  String get zitiSavedHint;

  /// No description provided for @zitiRestartHint.
  ///
  /// In en, this message translates to:
  /// **'The zero-trust role is fixed at startup ⇒ saving only writes the file; restart the app to apply.'**
  String get zitiRestartHint;

  /// No description provided for @zitiSecretHint.
  ///
  /// In en, this message translates to:
  /// **'The identity holds a private key and lives in the app-private directory; shadow key / admin token stay in the host, not here.'**
  String get zitiSecretHint;

  /// No description provided for @zitiImportFailed.
  ///
  /// In en, this message translates to:
  /// **'Import failed'**
  String get zitiImportFailed;

  /// No description provided for @zitiSaveFailed.
  ///
  /// In en, this message translates to:
  /// **'Save failed'**
  String get zitiSaveFailed;

  /// No description provided for @capabilityDefaultsUnusableNow.
  ///
  /// In en, this message translates to:
  /// **'These tiers point at a model this brain has not registered - the setting is saved, but it cannot run until the engine is registered.'**
  String get capabilityDefaultsUnusableNow;

  /// No description provided for @providersDownloadModels.
  ///
  /// In en, this message translates to:
  /// **'Download local models'**
  String get providersDownloadModels;

  /// No description provided for @providersDownloadedOnly.
  ///
  /// In en, this message translates to:
  /// **'Downloaded'**
  String get providersDownloadedOnly;

  /// No description provided for @providersDownloadAction.
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get providersDownloadAction;

  /// No description provided for @providersDownloading.
  ///
  /// In en, this message translates to:
  /// **'Downloading…'**
  String get providersDownloading;

  /// No description provided for @providersDownloadFailed.
  ///
  /// In en, this message translates to:
  /// **'Download failed'**
  String get providersDownloadFailed;

  /// No description provided for @providersDownloadNoLocal.
  ///
  /// In en, this message translates to:
  /// **'No downloaded local models yet'**
  String get providersDownloadNoLocal;

  /// No description provided for @providersDownloadRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get providersDownloadRetry;

  /// No description provided for @providersDownloadDone.
  ///
  /// In en, this message translates to:
  /// **'Download complete'**
  String get providersDownloadDone;

  /// No description provided for @providersDownloadProgress.
  ///
  /// In en, this message translates to:
  /// **'Downloading {received} / {total}'**
  String providersDownloadProgress(int received, int total);

  /// No description provided for @providersDownloadReceived.
  ///
  /// In en, this message translates to:
  /// **'{received} downloaded'**
  String providersDownloadReceived(int received);

  /// No description provided for @providersDownloadEmpty.
  ///
  /// In en, this message translates to:
  /// **'The brain returned no model catalog'**
  String get providersDownloadEmpty;

  /// No description provided for @clientToolsImageGenerated.
  ///
  /// In en, this message translates to:
  /// **'Generated {count} image(s) ({size}) and showed them to the user.'**
  String clientToolsImageGenerated(int count, String size);
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
