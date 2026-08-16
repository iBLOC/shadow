import 'package:flutter/foundation.dart';

/// Debug mode check for shadow-mobile.
///
/// The global error popup is enabled when:
///   1. `kDebugMode` is true (running a debug build via `flutter run`),
///      OR
///   2. The app was launched with `--dart-define=SHADOW_DEBUG_ERRORS=true`.
///
/// Note: unlike the web desktop, mobile does not have a runtime URL
/// parameter mechanism. Production opt-in is a compile-time define so
/// testers can build a release APK that surfaces errors without code
/// changes.
class DebugMode {
  DebugMode._();

  static const bool _kForceEnabled =
      bool.fromEnvironment('SHADOW_DEBUG_ERRORS', defaultValue: false);

  static bool get isEnabled {
    if (kDebugMode) return true;
    return _kForceEnabled;
  }
}
