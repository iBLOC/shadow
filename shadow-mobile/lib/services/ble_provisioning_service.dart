// SPDX-License-Identifier: Apache-2.0
//
// v2.5 — BLE GATT provisioning of shadow-esp32 ("shadow-esp32
// setup" peripheral). Scans for the device, connects, writes
// the SSID and PSK to the two write-only characteristics, and
// reports the status read from the third. The custom 128-bit
// UUIDs mirror what shadow-esp32's provision.c publishes:
//
//   service  12345678-...-0001  "shadow provisioning"
//   char     12345678-...-0002  SSID       (write, UTF-8, <= 32B)
//   char     12345678-...-0003  PSK        (write, UTF-8, <= 63B)
//   char     12345678-...-0004  status     (read, "idle"|"connecting"
//                                              |"connected"|"failed")
//
// The whole flow is BLE-only — no Wi-Fi credentials are typed
// anywhere outside this screen. The Android app's `flutter_blue_plus`
// wraps the platform's `BluetoothGatt` so we don't talk to
// `BluetoothAdapter` directly.

import 'dart:async';
import 'dart:convert';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// UUIDs mirror what shadow-esp32 publishes in provision.c.
class ProvisioningUuids {
  static final Guid service   = Guid('12345678-0001-0000-0000-000000000000');
  static final Guid charSsid  = Guid('12345678-0002-0000-0000-000000000000');
  static final Guid charPsk   = Guid('12345678-0003-0000-0000-000000000000');
  static final Guid charStatus = Guid('12345678-0004-0000-0000-000000000000');

  /// Android ble scanner filter — match only the shadow-esp32
  /// provisioning peripheral (advertised name "shadow-esp32 setup").
  static const String deviceNameFragment = 'shadow-esp32 setup';
}

enum BleProvisionPhase {
  idle,
  scanning,
  deviceFound,
  connecting,
  discoveringServices,
  writingCredentials,
  readingStatus,
  connected,
  failed,
}

class BleProvisionResult {
  final BleProvisionPhase phase;
  final String? ssid;          // what was written
  final String? deviceName;     // BLE local name
  final String? deviceAddress;  // BLE MAC
  final String? status;         // status readback ("connected"/"failed"/...)
  final String? error;
  final bool wifiSsidPersisted; // true after we also write to OS Wi-Fi

  const BleProvisionResult({
    required this.phase,
    this.ssid,
    this.deviceName,
    this.deviceAddress,
    this.status,
    this.error,
    this.wifiSsidPersisted = false,
  });

  bool get isTerminal =>
      phase == BleProvisionPhase.connected ||
      phase == BleProvisionPhase.failed;
}

class BleProvisioningService {
  StreamSubscription<dynamic>? _resultsSubscription;
  BluetoothDevice? _device;
  BluetoothCharacteristic? _charSsid;
  BluetoothCharacteristic? _charPsk;
  BluetoothCharacteristic? _charStatus;

  /// Run a full scan → connect → discover → write → poll-status
  /// sequence. The callback receives one phase update per step
  /// and a final BleProvisionResult on the terminal step.
  Future<void> provision({
    required String ssid,
    required String psk,
    required void Function(BleProvisionResult) onUpdate,
  }) async {
    onUpdate(const BleProvisionResult(phase: BleProvisionPhase.scanning));

    // flutter_blue_plus scanResults is a getter; startScan drives
    // the actual scan. The stream listener receives updates for
    // every batch of scan results, including the device name
    // metadata. We keep the subscription alive while scanning.
    _resultsSubscription = FlutterBluePlus.scanResults.listen((results) async {
      for (final r in results) {
        final name = r.device.platformName;
        if (name.contains(ProvisioningUuids.deviceNameFragment)) {
          _device = r.device;
          onUpdate(BleProvisionResult(
            phase: BleProvisionPhase.deviceFound,
            deviceName: name,
            deviceAddress: r.device.remoteId.str,
          ));
          await FlutterBluePlus.stopScan();
          await _connectAndWrite(ssid: ssid, psk: psk, onUpdate: onUpdate);
          return;
        }
      }
    });

    await FlutterBluePlus.startScan(timeout: const Duration(seconds: 8));
  }

  Future<void> _connectAndWrite({
    required String ssid,
    required String psk,
    required void Function(BleProvisionResult) onUpdate,
  }) async {
    final dev = _device;
    if (dev == null) {
      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.failed,
        error: 'no device selected',
      ));
      return;
    }
    onUpdate(BleProvisionResult(
      phase: BleProvisionPhase.connecting,
      deviceName: dev.platformName,
      deviceAddress: dev.remoteId.str,
    ));

    try {
      await dev.connect(timeout: const Duration(seconds: 10));
      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.discoveringServices,
        deviceName: dev.platformName,
        deviceAddress: dev.remoteId.str,
      ));
      await dev.discoverServices();
      final services = await dev.discoverServices();
      final svc = services.firstWhere(
        (s) => s.uuid == ProvisioningUuids.service,
        orElse: () => throw StateError('shadow provisioning service not found'),
      );
      _charSsid  = svc.characteristics.firstWhere((c) => c.uuid == ProvisioningUuids.charSsid);
      _charPsk   = svc.characteristics.firstWhere((c) => c.uuid == ProvisioningUuids.charPsk);
      _charStatus = svc.characteristics.firstWhere((c) => c.uuid == ProvisioningUuids.charStatus);

      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.writingCredentials,
        deviceName: dev.platformName,
        deviceAddress: dev.remoteId.str,
        ssid: ssid,
      ));
      await _charSsid!.write(utf8.encode(ssid), withoutResponse: true);
      await _charPsk!.write(utf8.encode(psk), withoutResponse: true);

      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.readingStatus,
        deviceName: dev.platformName,
        deviceAddress: dev.remoteId.str,
        ssid: ssid,
      ));
      final raw = await _charStatus!.read();
      final status = utf8.decode(raw);

      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.connected,
        deviceName: dev.platformName,
        deviceAddress: dev.remoteId.str,
        ssid: ssid,
        status: status,
      ));
    } catch (e) {
      onUpdate(BleProvisionResult(
        phase: BleProvisionPhase.failed,
        error: e.toString(),
      ));
    } finally {
      await _device?.disconnect();
    }
  }

  Future<void> stop() async {
    await FlutterBluePlus.stopScan();
    await _resultsSubscription?.cancel();
    await _device?.disconnect();
  }
}

/// Riverpod provider so provisioning_screen.dart can watch phase
/// and drive the service without owning it.
final bleProvisioningServiceProvider = Provider<BleProvisioningService>((ref) {
  final svc = BleProvisioningService();
  ref.onDispose(() => svc.stop());
  return svc;
});

final bleProvisioningPhaseProvider = StateProvider<BleProvisionResult>(
  (ref) => const BleProvisionResult(phase: BleProvisionPhase.idle),
);
