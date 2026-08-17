// SPDX-License-Identifier: Apache-2.0
//
// v2.5 — Provisioning screen for the shadow-esp32 BLE flow.
//
// The user opens the app, the screen runs a BLE scan for
// "shadow-esp32 setup", shows the device once found, asks for
// SSID + password, and writes both through flutter_blue_plus.
// While the dialog is up we also show the read-back status from
// the device ("idle" / "connecting" / "connected" / "failed").
// On "connected" we route the live-streaming audio output to
// the shadow-esp32 USB sink so the device immediately starts
// playing the synthesized voice.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/ble_provisioning_service.dart';
import '../services/usb_audio_routing_service.dart';
import '../services/mdns_discovery.dart';

class ProvisioningScreen extends ConsumerStatefulWidget {
  const ProvisioningScreen({super.key});

  @override
  ConsumerState<ProvisioningScreen> createState() => _ProvisioningScreenState();
}

class _ProvisioningScreenState extends ConsumerState<ProvisioningScreen> {
  final _ssidCtl = TextEditingController();
  final _pskCtl  = TextEditingController();
  final _ble     = BleProvisioningService();
  bool _scanning = false;

  @override
  void dispose() {
    _ssidCtl.dispose();
    _pskCtl.dispose();
    _ble.stop();
    super.dispose();
  }

  Future<void> _startScan() async {
    setState(() => _scanning = true);
    bleProvisioningPhaseProvider.state = const BleProvisionResult(
      phase: BleProvisionPhase.idle,
    );
    await _ble.provision(
      ssid: _ssidCtl.text,
      psk:  _pskCtl.text,
      onUpdate: (r) {
        bleProvisioningPhaseProvider.state = r;
        if (r.phase == BleProvisionPhase.connected) {
          // The shadow-esp32 just joined the Wi-Fi network. Try
          // to switch this phone's audio output to it so the
          // live-streaming screen has somewhere to go.
          _autoRouteToShadow();
        }
      },
    );
    setState(() => _scanning = false);
  }

  Future<void> _autoRouteToShadow() async {
    final svc = UsbAudioRoutingService();
    final routes = await svc.currentRoutes();
    final shadow = routes.firstWhere(
      (r) => r.isShadowEsp32,
      orElse: () => const UsbAudioRoute(
        deviceName: '', deviceId: 0, isUsb: false, isShadowEsp32: false,
      ),
    );
    if (shadow.deviceId != 0) {
      await svc.routeTo(shadow.deviceId);
    }
  }

  Widget _phaseBadge(BleProvisionResult r) {
    final color = switch (r.phase) {
      BleProvisionPhase.idle              => Colors.grey,
      BleProvisionPhase.scanning           => Colors.blue,
      BleProvisionPhase.deviceFound       => Colors.teal,
      BleProvisionPhase.connecting        => Colors.orange,
      BleProvisionPhase.discoveringServices => Colors.amber,
      BleProvisionPhase.writingCredentials => Colors.deepPurple,
      BleProvisionPhase.readingStatus      => Colors.indigo,
      BleProvisionPhase.connected         => Colors.green,
      BleProvisionPhase.failed            => Colors.red,
    };
    final label = switch (r.phase) {
      BleProvisionPhase.idle              => 'ready',
      BleProvisionPhase.scanning           => 'scanning BLE…',
      BleProvisionPhase.deviceFound       => 'device found',
      BleProvisionPhase.connecting        => 'connecting…',
      BleProvisionPhase.discoveringServices => 'discovering services…',
      BleProvisionPhase.writingCredentials => 'writing SSID + PSK…',
      BleProvisionPhase.readingStatus      => 'reading status…',
      BleProvisionPhase.connected         => 'connected',
      BleProvisionPhase.failed            => 'failed: ${r.error ?? ""}',
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color, width: 1),
      ),
      child: Text(label, style: TextStyle(color: color)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final phase = ref.watch(bleProvisioningPhaseProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Setup shadow-esp32')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Provision your shadow-esp32',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Plug the device into a USB-C charger or the '
                'phone, then enter the Wi-Fi network it should join. The '
                'BLE flow below pushes the credentials over GATT; '
                'shadow-esp32 then connects to your Wi-Fi and re-publishes '
                'its mDNS service.'),
              const SizedBox(height: 16),
              _phaseBadge(phase),
              if (phase.deviceName != null) ...[
                const SizedBox(height: 8),
                Text('Device: ${phase.deviceName}'),
                if (phase.deviceAddress != null)
                  Text('Address: ${phase.deviceAddress}'),
              ],
              if (phase.status != null) ...[
                const SizedBox(height: 8),
                Text('shadow-esp32 status: ${phase.status}',
                  style: const TextStyle(fontFamily: 'monospace')),
              ],
            ]),
          )),
          const SizedBox(height: 12),
          TextField(
            controller: _ssidCtl,
            decoration: const InputDecoration(
              labelText: 'Wi-Fi SSID',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _pskCtl,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Wi-Fi password',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            icon: const Icon(Icons.bluetooth),
            label: Text(_scanning ? 'Scanning…' : 'Pair via BLE'),
            onPressed: _scanning ? null : _startScan,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.usb),
            label: const Text('Or skip — route audio to USB now'),
            onPressed: _autoRouteToShadow,
          ),
          const SizedBox(height: 24),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Discovery (mDNS)',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('Once provisioned, shadow-esp32 advertises '
                '`_shadow._tcp` over mDNS. Tap below to re-scan.'),
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: () async {
                  final services = await MdnsDiscoveryService
                      .discoverResonance();
                  if (!mounted) return;
                  showDialog(
                    context: context,
                    builder: (_) => SimpleDialog(
                      title: const Text('Discovered services'),
                      children: services
                          .map((s) => SimpleDialogOption(
                                child: Text('${s.name} @ ${s.host}:${s.port}'),
                                onPressed: () => Navigator.pop(context),
                              ))
                          .toList(),
                    ),
                  );
                },
                child: const Text('Scan mDNS'),
              ),
            ]),
          )),
        ]),
      ),
    );
  }
}