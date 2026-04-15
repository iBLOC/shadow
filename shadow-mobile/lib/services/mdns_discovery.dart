import 'dart:async';
import 'package:flutter/services.dart';

class DiscoveredService {
  final String name;
  final String host;
  final int port;
  final Map<String, String> txtRecords;

  DiscoveredService({
    required this.name,
    required this.host,
    required this.port,
    required this.txtRecords,
  });

  factory DiscoveredService.fromMap(Map<dynamic, dynamic> map) {
    return DiscoveredService(
      name: map['name'] as String? ?? '',
      host: map['host'] as String? ?? '',
      port: map['port'] as int? ?? 0,
      txtRecords: Map<String, String>.from(map['txtRecords'] as Map? ?? {}),
    );
  }
}

class MdnsDiscoveryService {
  static const MethodChannel _channel = MethodChannel('com.ibloc.shadow/mdns');

  static Future<List<DiscoveredService>> discoverResonance({
    int timeoutSeconds = 5,
  }) async {
    try {
      final result = await _channel.invokeMethod<List<dynamic>>(
        'discoverMdns',
        {'serviceType': '_shadow._tcp', 'timeout': timeoutSeconds * 1000},
      );

      if (result == null) return [];

      return result
          .map((e) => DiscoveredService.fromMap(e as Map<dynamic, dynamic>))
          .toList();
    } on PlatformException catch (e) {
      throw Exception('mDNS discovery failed: ${e.message}');
    }
  }

  static Future<DiscoveredService?> resolveService(String serviceName) async {
    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'resolveMdns',
        {'serviceName': serviceName},
      );

      if (result == null) return null;

      return DiscoveredService.fromMap(result);
    } on PlatformException catch (e) {
      throw Exception('mDNS resolve failed: ${e.message}');
    }
  }
}
