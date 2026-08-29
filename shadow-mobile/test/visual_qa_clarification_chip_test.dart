import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/cortex/cortex_client.dart';
import 'package:shadow_mobile/widgets/visual_qa_clarification_chip.dart';

void main() {
  group('VisualQaClarificationChip', () {
    testWidgets('renders candidates as outlined buttons', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: VisualQaClarificationChip(
            clarification: ClarificationPayload(
              kind: 'vsrc_pick',
              candidates: const [
                ClarificationCandidate(
                  sourceId: 'vsrc_a',
                  deviceLabel: 'Logitech BRIO',
                ),
                ClarificationCandidate(
                  sourceId: 'vsrc_b',
                  deviceLabel: 'MacBook Camera',
                  hostLabel: 'ibloc-mbp',
                ),
              ],
            ),
            onPick: (_) {},
          ),
        ),
      ));

      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('visual-qa-clarification-chip')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('visual-qa-candidate-vsrc_a')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('visual-qa-candidate-vsrc_b')),
          findsOneWidget);
      expect(find.textContaining('Logitech BRIO'), findsOneWidget);
      expect(find.textContaining('MacBook Camera · ibloc-mbp'),
          findsOneWidget);
    });

    testWidgets('onPick fires with the chosen candidate', (tester) async {
      ClarificationCandidate? picked;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: VisualQaClarificationChip(
            clarification: const ClarificationPayload(
              kind: 'vsrc_pick',
              candidates: [
                ClarificationCandidate(
                  sourceId: 'vsrc_a',
                  deviceLabel: 'Logitech BRIO',
                ),
              ],
            ),
            onPick: (c) => picked = c,
          ),
        ),
      ));

      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('visual-qa-candidate-vsrc_a')));
      await tester.pumpAndSettle();

      expect(picked?.sourceId, 'vsrc_a');
      expect(picked?.deviceLabel, 'Logitech BRIO');
    });
  });

  group('StreamEvent.fromJson', () {
    test('parses clarification payload', () {
      final json = {
        'type': 'clarification',
        'agent': 'temporal',
        'clarification': {
          'kind': 'vsrc_pick',
          'candidates': [
            {
              'source_id': 'vsrc_a',
              'device_label': 'Logitech BRIO',
              'host_label': 'ibloc-mbp',
            },
          ],
        },
      };
      final ev = StreamEvent.fromJson(json);
      expect(ev.type, 'clarification');
      expect(ev.clarification?.kind, 'vsrc_pick');
      expect(ev.clarification?.candidates, hasLength(1));
      expect(ev.clarification?.candidates.first.sourceId, 'vsrc_a');
      expect(ev.clarification?.candidates.first.deviceLabel, 'Logitech BRIO');
      expect(ev.clarification?.candidates.first.hostLabel, 'ibloc-mbp');
    });

    test('returns null clarification when missing', () {
      final ev = StreamEvent.fromJson({'type': 'delta', 'delta': 'hi'});
      expect(ev.clarification, isNull);
    });
  });
}