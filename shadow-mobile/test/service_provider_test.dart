import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/service_provider.dart';

void main() {
  group('ServiceInfo', () {
    test('creates with required fields', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test Service',
        host: 'localhost',
        port: 8080,
      );

      expect(service.name, 'test');
      expect(service.displayName, 'Test Service');
      expect(service.host, 'localhost');
      expect(service.port, 8080);
      expect(service.path, '/health');
      expect(service.status, ServiceStatus.unknown);
    });

    test('generates correct url', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test',
        host: 'localhost',
        port: 8080,
        path: '/health',
      );

      expect(service.url, 'http://localhost:8080/health');
    });

    test('generates url with default path', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test',
        host: 'example.com',
        port: 3000,
      );

      expect(service.url, 'http://example.com:3000/health');
    });
  });

  group('ServiceStatus', () {
    test('has correct enum values', () {
      expect(ServiceStatus.values, contains(ServiceStatus.unknown));
      expect(ServiceStatus.values, contains(ServiceStatus.checking));
      expect(ServiceStatus.values, contains(ServiceStatus.healthy));
      expect(ServiceStatus.values, contains(ServiceStatus.unhealthy));
      expect(ServiceStatus.values, contains(ServiceStatus.offline));
    });
  });

  group('ServiceNotifier', () {
    late ServiceNotifier notifier;

    setUp(() {
      notifier = ServiceNotifier();
    });

    test('initializes with 3 services', () {
      expect(notifier.state.length, 3);

      final names = notifier.state.map((s) => s.name).toList();
      expect(names, contains('resonance'));
      expect(names, contains('telencephalon'));
      expect(names, contains('hippocampus'));
    });

    test('has correct default service configurations', () {
      final resonance = notifier.state.firstWhere((s) => s.name == 'resonance');
      expect(resonance.displayName, 'Resonance');
      expect(resonance.host, 'localhost');
      expect(resonance.port, 8080);

      // Telencephalon is the mobile's single platform entry point
      // (port 60080) — the old entry pointed at Prefrontal :8082, which
      // no longer exists as a standalone service anywhere.
      final telencephalon =
          notifier.state.firstWhere((s) => s.name == 'telencephalon');
      expect(telencephalon.displayName, 'Telencephalon');
      expect(telencephalon.host, 'localhost');
      expect(telencephalon.port, 60080);

      final hippocampus = notifier.state.firstWhere((s) => s.name == 'hippocampus');
      expect(hippocampus.displayName, 'Hippocampus');
      expect(hippocampus.host, 'localhost');
      expect(hippocampus.port, 8081);
    });

    test('checkAll sets status to checking during check', () async {
      notifier.checkAll();

      await Future.delayed(const Duration(milliseconds: 10));

      final allCheckingOrResult = notifier.state.every(
        (s) => s.status == ServiceStatus.checking ||
               s.status == ServiceStatus.healthy ||
               s.status == ServiceStatus.offline,
      );
      expect(allCheckingOrResult, isTrue);
    });
  });
}
