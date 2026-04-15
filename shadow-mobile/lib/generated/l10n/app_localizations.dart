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
