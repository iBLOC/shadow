import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/flow_provider.dart';
import '../services/cortex/cortex_client.dart';

class FlowsScreen extends ConsumerStatefulWidget {
  const FlowsScreen({super.key});

  @override
  ConsumerState<FlowsScreen> createState() => _FlowsScreenState();
}

class _FlowsScreenState extends ConsumerState<FlowsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(flowsProvider.notifier).refresh());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(flowsProvider);

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.cortexFlows),
          bottom: TabBar(
            tabs: [
              Tab(text: l10n.active),
              Tab(text: l10n.drafts),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(flowsProvider.notifier).refresh(),
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: () => ref.read(flowsProvider.notifier).refresh(),
          child: TabBarView(
            children: [
              _FlowsList(flows: state.flows, status: state.status, error: state.error),
              _DraftsList(drafts: state.drafts, status: state.status, error: state.error),
            ],
          ),
        ),
      ),
    );
  }
}

class _FlowsList extends ConsumerWidget {
  final List<FlowMeta> flows;
  final FlowsStatus status;
  final String? error;
  const _FlowsList({required this.flows, required this.status, this.error});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (status == FlowsStatus.loading && flows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (status == FlowsStatus.error && flows.isEmpty) {
      return ListView(children: [
        Padding(padding: const EdgeInsets.all(24), child: Text('Error: ${error ?? "unknown"}')),
      ]);
    }
    if (flows.isEmpty) {
      return ListView(children: const [
        Padding(padding: EdgeInsets.all(24), child: Text('No flows registered in telencephalon yet.')),
      ]);
    }
    return ListView.builder(
      itemCount: flows.length,
      itemBuilder: (ctx, i) {
        final flow = flows[i];
        return ListTile(
          title: Text(flow.name),
          subtitle: Text('v${flow.version}  •  ${flow.tags.join(", ")}'),
          trailing: const Icon(Icons.play_arrow),
          onTap: () => _showRunDialog(context, ref, flow),
        );
      },
    );
  }

  void _showRunDialog(BuildContext context, WidgetRef ref, FlowMeta flow) {
    final inputsController = TextEditingController(text: '{}');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Run flow: ${flow.name}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Inputs (JSON object):'),
            TextField(controller: inputsController, maxLines: 4),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                final inputs = inputsController.text.trim().isEmpty
                    ? <String, dynamic>{}
                    : Map<String, dynamic>.from(
                        jsonDecode(inputsController.text) as Map,
                      );
                final result = await ref.read(flowsProvider.notifier).runFlow(flow.name, inputs);
                if (context.mounted) {
                  showDialog(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text('Flow result'),
                      content: Text(result.outputs.toString()),
                      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
                    ),
                  );
                }
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Run failed: $e')));
                }
              }
            },
            child: const Text('Run'),
          ),
        ],
      ),
    );
  }
}

class _DraftsList extends ConsumerWidget {
  final List<FlowDefinition> drafts;
  final FlowsStatus status;
  final String? error;
  const _DraftsList({required this.drafts, required this.status, this.error});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (status == FlowsStatus.loading && drafts.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (drafts.isEmpty) {
      return ListView(children: const [
        Padding(padding: EdgeInsets.all(24), child: Text('No draft flows.')),
      ]);
    }
    return ListView.builder(
      itemCount: drafts.length,
      itemBuilder: (ctx, i) {
        final draft = drafts[i];
        return ListTile(
          title: Text(draft.name),
          subtitle: Text('v${draft.version}  (draft)'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(Icons.check, color: Colors.green),
                tooltip: 'Promote',
                onPressed: () => ref.read(flowsProvider.notifier).promoteDraft(draft.id),
              ),
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red),
                tooltip: 'Reject',
                onPressed: () => ref.read(flowsProvider.notifier).rejectDraft(draft.id),
              ),
            ],
          ),
        );
      },
    );
  }
}
