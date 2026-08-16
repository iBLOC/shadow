import 'dart:convert';

class MCPServer {
  final String id;
  final String name;
  final String url;
  final String? authToken;
  final bool isEnabled;
  final Map<String, dynamic>? settings;

  const MCPServer({
    required this.id,
    required this.name,
    required this.url,
    this.authToken,
    this.isEnabled = true,
    this.settings,
  });

  factory MCPServer.fromMap(Map<String, dynamic> map) {
    return MCPServer(
      id: map['id'] as String,
      name: map['name'] as String,
      url: map['url'] as String,
      authToken: map['auth_token'] as String?,
      isEnabled: (map['is_enabled'] as int) == 1,
      settings: map['settings'] != null
          ? jsonDecode(map['settings'] as String) as Map<String, dynamic>
          : null,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'url': url,
      'auth_token': authToken,
      'is_enabled': isEnabled ? 1 : 0,
      'settings': settings != null ? jsonEncode(settings) : null,
    };
  }

  MCPServer copyWith({
    String? id,
    String? name,
    String? url,
    String? authToken,
    bool? isEnabled,
    Map<String, dynamic>? settings,
  }) {
    return MCPServer(
      id: id ?? this.id,
      name: name ?? this.name,
      url: url ?? this.url,
      authToken: authToken ?? this.authToken,
      isEnabled: isEnabled ?? this.isEnabled,
      settings: settings ?? this.settings,
    );
  }
}
