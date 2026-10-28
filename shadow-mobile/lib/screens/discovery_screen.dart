import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/mdns_discovery.dart';
import '../generated/l10n/app_localizations.dart';

/// 发现的设备信息
class DiscoveredDevice {
  final String id;
  final String name;
  final String host;
  final int port;
  final String type;
  final List<String> capabilities;
  final Map<String, String> metadata;

  DiscoveredDevice({
    required this.id,
    required this.name,
    required this.host,
    required this.port,
    this.type = 'agent',
    this.capabilities = const [],
    this.metadata = const {},
  });

  factory DiscoveredDevice.fromService(DiscoveredService service) {
    return DiscoveredDevice(
      id: '${service.host}:${service.port}',
      name: service.name,
      host: service.host,
      port: service.port,
      type: service.txtRecords['type'] ?? 'agent',
      capabilities: (service.txtRecords['capabilities'] ?? '').split(',').where((c) => c.isNotEmpty).toList(),
      metadata: Map<String, String>.from(service.txtRecords),
    );
  }

  String get url => 'http://$host:$port';
}

/// 发现状态
class DiscoveryState {
  final List<DiscoveredDevice> devices;
  final DiscoveredDevice? activeDevice;
  final bool isScanning;
  final String? error;
  final DateTime? lastScan;

  const DiscoveryState({
    this.devices = const [],
    this.activeDevice,
    this.isScanning = false,
    this.error,
    this.lastScan,
  });

  DiscoveryState copyWith({
    List<DiscoveredDevice>? devices,
    DiscoveredDevice? activeDevice,
    bool? isScanning,
    String? error,
    DateTime? lastScan,
    bool clearActive = false,
    bool clearError = false,
  }) {
    return DiscoveryState(
      devices: devices ?? this.devices,
      activeDevice: clearActive ? null : (activeDevice ?? this.activeDevice),
      isScanning: isScanning ?? this.isScanning,
      error: clearError ? null : (error ?? this.error),
      lastScan: lastScan ?? this.lastScan,
    );
  }
}

/// 发现状态管理
class DiscoveryNotifier extends StateNotifier<DiscoveryState> {
  DiscoveryNotifier() : super(const DiscoveryState());

  Future<void> startScan() async {
    state = state.copyWith(isScanning: true, clearError: true);
    try {
      final services = await MdnsDiscoveryService.discoverResonance(timeoutSeconds: 5);
      final devices = services.map((s) => DiscoveredDevice.fromService(s)).toList();
      state = state.copyWith(
        devices: devices,
        isScanning: false,
        lastScan: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        isScanning: false,
        error: e.toString(),
      );
    }
  }

  void setActiveDevice(DiscoveredDevice? device) {
    state = state.copyWith(
      activeDevice: device,
      clearActive: device == null,
    );
  }

  void addManualDevice(DiscoveredDevice device) {
    final exists = state.devices.any((d) => d.id == device.id);
    if (!exists) {
      state = state.copyWith(
        devices: [...state.devices, device],
      );
    }
  }

  void removeDevice(String deviceId) {
    state = state.copyWith(
      devices: state.devices.where((d) => d.id != deviceId).toList(),
      clearActive: state.activeDevice?.id == deviceId,
    );
  }

  void clearError() {
    state = state.copyWith(clearError: true);
  }
}

/// 发现状态Provider
final discoveryProvider = StateNotifierProvider<DiscoveryNotifier, DiscoveryState>((ref) {
  return DiscoveryNotifier();
});

/// 发现页面
class DiscoveryPage extends ConsumerStatefulWidget {
  const DiscoveryPage({super.key});

  @override
  ConsumerState<DiscoveryPage> createState() => _DiscoveryPageState();
}

class _DiscoveryPageState extends ConsumerState<DiscoveryPage> {
  @override
  void initState() {
    super.initState();
    // 自动扫描
    Future.microtask(() {
      ref.read(discoveryProvider.notifier).startScan();
    });
  }

  @override
  Widget build(BuildContext context) {
    final discoveryState = ref.watch(discoveryProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.discoveryTitle),
        actions: [
          IconButton(
            icon: discoveryState.isScanning
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
            onPressed: discoveryState.isScanning
                ? null
                : () => ref.read(discoveryProvider.notifier).startScan(),
          ),
        ],
      ),
      body: Column(
        children: [
          // 错误提示
          if (discoveryState.error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                children: [
                  Icon(Icons.error_outline, color: Colors.red.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      discoveryState.error!,
                      style: TextStyle(color: Colors.red.shade700),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => ref.read(discoveryProvider.notifier).clearError(),
                  ),
                ],
              ),
            ),

          // 扫描状态
          if (discoveryState.isScanning)
            Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(width: 16),
                  Text(AppLocalizations.of(context)!.discoveryScanning),
                ],
              ),
            ),

          // 设备列表
          Expanded(
            child: discoveryState.devices.isEmpty && !discoveryState.isScanning
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.wifi_find,
                          size: 64,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          AppLocalizations.of(context)!.discoveryNoDevices,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          AppLocalizations.of(context)!.discoveryNoDevicesHint,
                          style: TextStyle(color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: discoveryState.devices.length,
                    itemBuilder: (context, index) {
                      final device = discoveryState.devices[index];
                      final isActive = discoveryState.activeDevice?.id == device.id;
                      return _DeviceCard(
                        device: device,
                        isActive: isActive,
                        onSetActive: () {
                          ref.read(discoveryProvider.notifier).setActiveDevice(device);
                        },
                        onRemove: () {
                          ref.read(discoveryProvider.notifier).removeDevice(device.id);
                        },
                      );
                    },
                  ),
          ),

          // 底部信息
          if (discoveryState.lastScan != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    AppLocalizations.of(context)!.discoveryLastScan('${discoveryState.lastScan!.hour}:${discoveryState.lastScan!.minute.toString().padLeft(2, '0')}'),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                    ),
                  ),
                  Text(
                    AppLocalizations.of(context)!.discoveryDeviceCount(discoveryState.devices.length),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddManualDialog(context),
        child: const Icon(Icons.add),
      ),
    );
  }

  void _showAddManualDialog(BuildContext context) {
    final hostController = TextEditingController();
    final portController = TextEditingController(text: '60080');
    final nameController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.discoveryAddManually),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: hostController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonHostAddress,
                hintText: '192.168.1.100',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: portController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonPort,
                hintText: '60080',
              ),
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.discoveryDeviceNameOptional,
                hintText: 'My Shadow Node',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final host = hostController.text.trim();
              final port = int.tryParse(portController.text) ?? 60080;
              final name = nameController.text.trim();

              if (host.isNotEmpty) {
                ref.read(discoveryProvider.notifier).addManualDevice(
                  DiscoveredDevice(
                    id: '$host:$port',
                    name: name.isNotEmpty ? name : '$host:$port',
                    host: host,
                    port: port,
                  ),
                );
                Navigator.of(context).pop();
              }
            },
            child: Text(AppLocalizations.of(context)!.commonAdd),
          ),
        ],
      ),
    );
  }
}

/// 设备卡片组件
class _DeviceCard extends StatelessWidget {
  final DiscoveredDevice device;
  final bool isActive;
  final VoidCallback onSetActive;
  final VoidCallback onRemove;

  const _DeviceCard({
    required this.device,
    required this.isActive,
    required this.onSetActive,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  _getDeviceIcon(),
                  color: isActive ? Colors.green : Colors.grey,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        device.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        device.url,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
                if (isActive)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green.shade100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      AppLocalizations.of(context)!.discoveryActive,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.green.shade700,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            if (device.capabilities.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: device.capabilities.map((cap) {
                  return Chip(
                    label: Text(
                      cap.toUpperCase(),
                      style: const TextStyle(fontSize: 10),
                    ),
                    backgroundColor: Colors.blue.shade50,
                    labelStyle: TextStyle(color: Colors.blue.shade700),
                  );
                }).toList(),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!isActive)
                  TextButton(
                    onPressed: onSetActive,
                    child: Text(AppLocalizations.of(context)!.discoverySetActive),
                  ),
                TextButton(
                  onPressed: onRemove,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.red,
                  ),
                  child: Text(AppLocalizations.of(context)!.commonRemove),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData _getDeviceIcon() {
    switch (device.type) {
      case 'engine':
        return Icons.memory;
      case 'router':
        return Icons.router;
      case 'agent':
      default:
        return Icons.computer;
    }
  }
}
