import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../services/group_service.dart';
import '../services/prefrontal_client.dart';

class GroupScreen extends ConsumerStatefulWidget {
  const GroupScreen({super.key});

  @override
  ConsumerState<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends ConsumerState<GroupScreen> {
  final _pinController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    if (_pinController.text.length != 6) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('PIN must be 6 digits')));
      return;
    }

    setState(() => _isLoading = true);

    final service = ref.read(groupServiceProvider.notifier);
    await service.createGroup(_pinController.text);

    setState(() => _isLoading = false);
  }

  Future<void> _joinGroup() async {
    if (_pinController.text.length != 6) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('PIN must be 6 digits')));
      return;
    }

    setState(() => _isLoading = true);

    final service = ref.read(groupServiceProvider.notifier);
    await service.joinGroup(_pinController.text);

    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(groupServiceProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group'),
        actions: [
          if (state.state == GroupState.inGroup)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: () {
                ref.read(groupServiceProvider.notifier).refreshMembers();
              },
            ),
        ],
      ),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(GroupServiceState state) {
    switch (state.state) {
      case GroupState.idle:
        return _buildIdleState();
      case GroupState.creating:
      case GroupState.joining:
        return const Center(child: CircularProgressIndicator());
      case GroupState.inGroup:
        return _buildInGroupState(state);
      case GroupState.error:
        return _buildErrorState(state.errorMessage);
    }
  }

  Widget _buildIdleState() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.group, size: 80, color: Colors.grey),
          const SizedBox(height: 24),
          Text(
            'Join or Create a Group',
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Enter 6-digit PIN to join existing group or create new one',
            style: Theme.of(context).textTheme.bodyMedium
                ?.copyWith(color: Colors.grey),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          TextField(
            controller: _pinController,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            decoration: const InputDecoration(
              labelText: 'PIN Code',
              hintText: '000000',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock),
            ),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, letterSpacing: 8),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isLoading ? null : _joinGroup,
                  icon: const Icon(Icons.login),
                  label: const Text('Join'),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _isLoading ? null : _createGroup,
                  icon: const Icon(Icons.add),
                  label: const Text('Create'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInGroupState(GroupServiceState state) {
    final group = state.currentGroup;
    final qrData = state.qrData;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  const Icon(Icons.check_circle, size: 48, color: Colors.green),
                  const SizedBox(height: 8),
                  Text(
                    'In Group',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  if (group != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'ID: ${group.id.substring(0, 8)}...',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (qrData != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      'QR Code',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    QrImageView(data: qrData.toQrString(), size: 200),
                    const SizedBox(height: 8),
                    Text(
                      'Share this QR to invite devices',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Members (${state.discoveredMembers.length})',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      IconButton(
                        icon: const Icon(Icons.refresh, size: 20),
                        onPressed: () {
                          ref
                              .read(groupServiceProvider.notifier)
                              .refreshMembers();
                        },
                      ),
                    ],
                  ),
                  const Divider(),
                  if (state.discoveredMembers.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('No other members discovered'),
                    )
                  else
                    ...state.discoveredMembers.map(
                      (m) => ListTile(
                        leading: const CircleAvatar(
                          child: Icon(Icons.phone_android),
                        ),
                        title: Text(m.name),
                        subtitle: Text('${m.host}:${m.port}'),
                        trailing: Wrap(
                          spacing: 4,
                          children: m.capabilities
                              .map(
                                (c) => Chip(
                                  label: Text(
                                    c,
                                    style: const TextStyle(fontSize: 10),
                                  ),
                                  padding: EdgeInsets.zero,
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () {
              ref.read(groupServiceProvider.notifier).leaveGroup();
            },
            icon: const Icon(Icons.logout),
            label: const Text('Leave Group'),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(String? message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            Text('Error', style: Theme.of(context).textTheme.headlineSmall),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                _pinController.clear();
              },
              child: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}

final groupServiceProvider =
    StateNotifierProvider<GroupServiceNotifier, GroupServiceState>((ref) {
      return GroupServiceNotifier(
        // ⚠️ 用**共享** client（跟随「配置里那个端脑」）—— 裸
        // `PrefrontalClient()` 是个没人管 baseUrl 的孤儿实例，永远打
        // 写死的 `localhost:60080`，手机上必败。
        service: GroupService(client: ref.read(prefrontalClientProvider)),
        deviceName: 'Shadow Mobile',
        pubkey: '',
      );
    });
