import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/network_service.dart';

/// 网络服务 —— 做成 provider 是为了**可测**。
///
/// 「等 WiFi」这条分支要读网络类型、还要订阅网络变化；`NetworkService`
/// 直接 `new` 出来的话，测试既没法注入假的网络类型，也没法把「连上 WiFi」
/// 这个事件推进去。做成 provider 之后，测试可以 `overrideWithValue` 一个
/// 假实现，把整条分支跑通。
final networkServiceProvider = Provider<NetworkService>((ref) {
  return NetworkService();
});
