import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

enum NetworkType { wifi, mobile, none, other }

class NetworkService {
  final Connectivity _connectivity = Connectivity();

  Future<NetworkType> getNetworkType() async {
    final result = await _connectivity.checkConnectivity();
    return _parseConnectivityResult(result);
  }

  NetworkType _parseConnectivityResult(List<ConnectivityResult> results) {
    if (results.contains(ConnectivityResult.wifi)) {
      return NetworkType.wifi;
    }
    if (results.contains(ConnectivityResult.mobile)) {
      return NetworkType.mobile;
    }
    if (results.contains(ConnectivityResult.none)) {
      return NetworkType.none;
    }
    return NetworkType.other;
  }

  Stream<NetworkType> get onNetworkTypeChanged {
    return _connectivity.onConnectivityChanged.map(_parseConnectivityResult);
  }
}
