import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:crypto/crypto.dart';

import 'prefrontal_client.dart';

enum GroupState { idle, creating, joining, inGroup, error }

class GroupInfo {
  final String id;
  final String pin;
  final DateTime createdAt;
  final List<GroupMember> members;

  GroupInfo({
    required this.id,
    required this.pin,
    required this.createdAt,
    this.members = const [],
  });

  factory GroupInfo.fromJson(Map<String, dynamic> json) {
    return GroupInfo(
      id: json['id'] as String,
      pin: json['pin'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      members:
          (json['members'] as List<dynamic>?)
              ?.map((m) => GroupMember.fromJson(m))
              .toList() ??
          [],
    );
  }
}

class GroupMember {
  final String id;
  final String name;
  final String pubkey;
  final List<String> capabilities;

  GroupMember({
    required this.id,
    required this.name,
    required this.pubkey,
    this.capabilities = const [],
  });

  factory GroupMember.fromJson(Map<String, dynamic> json) {
    return GroupMember(
      id: json['id'] as String,
      name: json['name'] as String,
      pubkey: json['pubkey'] as String,
      capabilities:
          (json['capabilities'] as List<dynamic>?)
              ?.map((c) => c as String)
              .toList() ??
          [],
    );
  }
}

class QrCodeData {
  final String groupId;
  final String pinHash;
  final String pubkey;

  QrCodeData({
    required this.groupId,
    required this.pinHash,
    required this.pubkey,
  });

  factory QrCodeData.fromJson(Map<String, dynamic> json) {
    return QrCodeData(
      groupId: json['group_id'] as String,
      pinHash: json['pin_hash'] as String,
      pubkey: json['pubkey'] as String,
    );
  }

  Map<String, dynamic> toJson() => {
    'group_id': groupId,
    'pin_hash': pinHash,
    'pubkey': pubkey,
  };

  String toQrString() => base64Encode(utf8.encode(json.encode(toJson())));

  factory QrCodeData.fromQrString(String qr) {
    final decoded = utf8.decode(base64Decode(qr));
    return QrCodeData.fromJson(json.decode(decoded));
  }
}

class DiscoveredMember {
  final String id;
  final String name;
  final String host;
  final int port;
  final List<String> capabilities;

  DiscoveredMember({
    required this.id,
    required this.name,
    required this.host,
    required this.port,
    this.capabilities = const [],
  });
}

class GroupServiceState {
  final GroupState state;
  final GroupInfo? currentGroup;
  final QrCodeData? qrData;
  final List<DiscoveredMember> discoveredMembers;
  final String? errorMessage;

  const GroupServiceState({
    this.state = GroupState.idle,
    this.currentGroup,
    this.qrData,
    this.discoveredMembers = const [],
    this.errorMessage,
  });

  GroupServiceState copyWith({
    GroupState? state,
    GroupInfo? currentGroup,
    QrCodeData? qrData,
    List<DiscoveredMember>? discoveredMembers,
    String? errorMessage,
  }) {
    return GroupServiceState(
      state: state ?? this.state,
      currentGroup: currentGroup ?? this.currentGroup,
      qrData: qrData ?? this.qrData,
      discoveredMembers: discoveredMembers ?? this.discoveredMembers,
      errorMessage: errorMessage,
    );
  }
}

class GroupService {
  final PrefrontalClient _client;

  GroupService({PrefrontalClient? client})
    : _client = client ?? PrefrontalClient();

  Future<GroupServiceState> createGroup({
    required String pin,
    required String deviceName,
    required String pubkey,
  }) async {
    try {
      final response = await _client.request(
        'POST',
        '/api/group/create',
        body: {'pin': pin, 'device_name': deviceName, 'pubkey': pubkey},
      );

      if (response['success'] == true && response['data'] != null) {
        final group = GroupInfo.fromJson(response['data']);
        final qrData = QrCodeData(
          groupId: group.id,
          pinHash: _hashPin(pin),
          pubkey: pubkey,
        );
        return GroupServiceState(
          state: GroupState.inGroup,
          currentGroup: group,
          qrData: qrData,
        );
      }
      return const GroupServiceState(
        state: GroupState.error,
        errorMessage: 'Failed to create group',
      );
    } catch (e) {
      return GroupServiceState(
        state: GroupState.error,
        errorMessage: e.toString(),
      );
    }
  }

  Future<GroupServiceState> joinGroup({
    required String pin,
    required String deviceName,
    required String pubkey,
  }) async {
    try {
      final response = await _client.request(
        'POST',
        '/api/group/join',
        body: {'pin': pin, 'device_name': deviceName, 'pubkey': pubkey},
      );

      if (response['success'] == true && response['data'] != null) {
        final group = GroupInfo.fromJson(response['data']);
        return GroupServiceState(
          state: GroupState.inGroup,
          currentGroup: group,
        );
      }
      return const GroupServiceState(
        state: GroupState.error,
        errorMessage: 'Failed to join group',
      );
    } catch (e) {
      return GroupServiceState(
        state: GroupState.error,
        errorMessage: e.toString(),
      );
    }
  }

  Future<GroupServiceState> leaveGroup() async {
    try {
      await _client.request('POST', '/api/group/leave');
      return const GroupServiceState(state: GroupState.idle);
    } catch (e) {
      return GroupServiceState(
        state: GroupState.error,
        errorMessage: e.toString(),
      );
    }
  }

  Future<List<DiscoveredMember>> discoverMembers() async {
    try {
      final response = await _client.requestList('GET', '/api/group/members');

      return response
          .map(
            (m) => DiscoveredMember(
              id: m['id'] as String,
              name: m['name'] as String,
              host: m['host'] as String,
              port: m['port'] as int,
              capabilities:
                  (m['capabilities'] as List<dynamic>?)
                      ?.map((c) => c as String)
                      .toList() ??
                  [],
            ),
          )
          .toList();
    } catch (e) {
      return [];
    }
  }

  String _hashPin(String pin) {
    final bytes = utf8.encode(pin);
    final digest = sha256.convert(bytes);
    return digest.toString().substring(0, 8);
  }
}

class GroupServiceNotifier extends StateNotifier<GroupServiceState> {
  final GroupService _service;
  final String _deviceName;
  final String _pubkey;

  GroupServiceNotifier({
    required GroupService service,
    required String deviceName,
    required String pubkey,
  }) : _service = service,
       _deviceName = deviceName,
       _pubkey = pubkey,
       super(const GroupServiceState());

  Future<void> createGroup(String pin) async {
    state = state.copyWith(state: GroupState.creating);
    final result = await _service.createGroup(
      pin: pin,
      deviceName: _deviceName,
      pubkey: _pubkey,
    );
    state = result;
  }

  Future<void> joinGroup(String pin) async {
    state = state.copyWith(state: GroupState.joining);
    final result = await _service.joinGroup(
      pin: pin,
      deviceName: _deviceName,
      pubkey: _pubkey,
    );
    state = result;
  }

  Future<void> leaveGroup() async {
    final result = await _service.leaveGroup();
    state = result;
  }

  Future<void> refreshMembers() async {
    final members = await _service.discoverMembers();
    state = state.copyWith(discoveredMembers: members);
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
