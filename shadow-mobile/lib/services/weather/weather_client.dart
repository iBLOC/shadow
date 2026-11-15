import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// **天气数据源 —— Open-Meteo**（免费 / 免注册 / 免 Key）。
///
/// ⚠️ **为什么是它**（2026-11-15 全网横评 ＋ 真机直探的结论）：
/// 免 Key、免信用卡、全球覆盖、数据是 **CC BY 4.0**（可商用、要署名）
/// ⇒ ⇒ 「内置天气工具」不欠用户任何账号、密钥或信用卡。
///
/// ⚠️ **为什么设备侧直连、不绕端脑**：天气是**纯网络数据**、不碰这台设备
/// ⇒ ⇒ 手机（INTERNET 权限）／桌面（tauri.conf.json 的 csp = null）都能直连
/// ⇒ ⇒ **零新增端脑路由、零新增依赖、零新增权限**。
///
/// ⚠️ **额度这一格已经裁定**（用户逐字：「我这是客户端使用的无所谓10000次」，
/// 2026-11-16）—— 官方条款逐字（open-meteo.com/en/terms 的 Non-Commercial
/// Use 段）：「**Rate limits are applied by IP addresses and application**」
/// ⇒ ⇒ 客户端直连 ⇒ 每个用户从**自己的 IP** 各算各的
/// ⇒ ⇒ 10,000 次/天**不是产品级天花板** ⇒ ⇒ 不订阅、也不换源。
/// ⚠️ **但这三条还欠着**（别把「额度不是问题」读成「全清了」）：
/// ① **署名** —— CC BY 4.0 的义务（结果里的 source 字段就是它）；
/// ② **取数必须留在客户端** —— 一旦挪到端脑／服务器代理 ⇒ 所有用户共用我们
/// 的出口 IP ⇒ ⇒ 限额立刻变成产品级（官方同段逐字点名：Vercel／Netlify／
/// Render 这类托管「might be rate-limited earlier then expected」）；
/// ③ **产品一旦开始订阅／收费** —— free API 那条「only for non-commercial
/// purposes」就不再覆盖 ⇒ ⇒ 那时才要订阅或换源（WeatherAPI 免费档官方
/// 写明含商用）。
const String kWeatherSourceName = 'Open-Meteo';
const String kWeatherForecastBase = 'https://api.open-meteo.com/v1/forecast';
const String kWeatherGeocodingBase = 'https://geocoding-api.open-meteo.com/v1/search';

/// 天气工具的失败 —— **带真因**。
///
/// ⚠️ **不许静默、不许长得像成功**：工具失败时错误会回传给端脑 ⇒ ⇒ 模型
/// 才知道这条路走不通（可以换个地名再问一次），而不是卡在等结果上。
class WeatherException implements Exception {
  final String message;
  const WeatherException(this.message);

  @override
  String toString() => 'WeatherException: $message';
}

/// WMO 天气代码 → 人话（**英文**）。
///
/// ⚠️ **为什么是英文**：这份文字是**给模型看的**（结果 JSON 回传给端脑）
/// ⇒ ⇒ 模型自己会翻成用户说的语言 ⇒ ⇒ 客户端不替模型做翻译决定。
/// ⚠️ 认不出的代码给 Unknown（**不猜**）—— 猜错一次，用户看到的天气
/// 和真实天气对不上，而模型以为自己拿到了真数据。
String weatherTextForCode(int code) {
  switch (code) {
    case 0:
      return 'Clear sky';
    case 1:
      return 'Mainly clear';
    case 2:
      return 'Partly cloudy';
    case 3:
      return 'Overcast';
    case 45:
      return 'Fog';
    case 48:
      return 'Depositing rime fog';
    case 51:
      return 'Light drizzle';
    case 53:
      return 'Moderate drizzle';
    case 55:
      return 'Dense drizzle';
    case 56:
      return 'Light freezing drizzle';
    case 57:
      return 'Dense freezing drizzle';
    case 61:
      return 'Slight rain';
    case 63:
      return 'Moderate rain';
    case 65:
      return 'Heavy rain';
    case 66:
      return 'Light freezing rain';
    case 67:
      return 'Heavy freezing rain';
    case 71:
      return 'Slight snow fall';
    case 73:
      return 'Moderate snow fall';
    case 75:
      return 'Heavy snow fall';
    case 77:
      return 'Snow grains';
    case 80:
      return 'Slight rain showers';
    case 81:
      return 'Moderate rain showers';
    case 82:
      return 'Violent rain showers';
    case 85:
      return 'Slight snow showers';
    case 86:
      return 'Heavy snow showers';
    case 95:
      return 'Thunderstorm';
    case 96:
      return 'Thunderstorm with slight hail';
    case 99:
      return 'Thunderstorm with heavy hail';
    default:
      return 'Unknown';
  }
}

/// 一个地名解析后的结果。
class _ResolvedPlace {
  final String name;
  final double latitude;
  final double longitude;
  final String? country;
  final String? admin1;
  final String? timezone;

  const _ResolvedPlace({
    required this.name,
    required this.latitude,
    required this.longitude,
    this.country,
    this.admin1,
    this.timezone,
  });
}

/// 一次取数的结果（当前实况 ＋ 逐日预报）。
class _WeatherBundle {
  final Map<String, dynamic> current;
  final List<Map<String, dynamic>> daily;

  const _WeatherBundle({required this.current, required this.daily});
}

/// **天气工具的取数那一半**。
///
/// ⚠️ **注入 http.Client** ⇒ 单测可以喂假响应，不必真连网
/// ⇒ ⇒ 真连网那条路（DNS / TLS / 上游形状）另用真机读数验。
class WeatherClient {
  final http.Client _http;

  /// 一次网络往返的上限（超时 ⇒ 明确失败，不许挂着）。
  final Duration timeout;

  WeatherClient({
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 12),
  }) : _http = httpClient ?? http.Client();

  /// 取天气。
  ///
  /// ⚠️ **参数一律按「模型可能乱填」的形状收**（模型有时把数字写成字符串）
  /// ⇒ ⇒ 认不出来就**用默认值**，不因此让整轮失败（与 set_theme 那族同一纪律）。
  ///
  /// 返回形状（**两端逐字同形**）：
  /// { source, units, location, current, daily }
  Future<Map<String, dynamic>> fetchWeather({
    Object? location,
    Object? latitude,
    Object? longitude,
    Object? days,
    Object? units,
  }) async {
    final name = _asText(location);
    final lat = _asDouble(latitude);
    final lon = _asDouble(longitude);
    final dayCount = _asDays(days);
    final fahrenheit = _isFahrenheit(units);

    if (name.isEmpty && (lat == null || lon == null)) {
      throw const WeatherException(
        'get_weather needs a place: give "location" (a city name, e.g. "北京") '
        'or both "latitude" and "longitude".',
      );
    }

    final place = name.isEmpty
        ? _ResolvedPlace(
            name: '${lat!.toStringAsFixed(4)}, ${lon!.toStringAsFixed(4)}',
            latitude: lat,
            longitude: lon,
          )
        : await _geocode(name);

    final bundle = await _forecast(
      latitude: place.latitude,
      longitude: place.longitude,
      days: dayCount,
      fahrenheit: fahrenheit,
    );

    return <String, dynamic>{
      // ⚠️ **署名是 CC BY 4.0 的义务** —— 数据是 Open-Meteo 的。
      'source': kWeatherSourceName,
      'units': <String, dynamic>{
        'temperature': fahrenheit ? '°F' : '°C',
        'windSpeed': fahrenheit ? 'mph' : 'km/h',
        'precipitation': 'mm',
      },
      'location': <String, dynamic>{
        'name': place.name,
        if (place.country != null) 'country': place.country,
        if (place.admin1 != null) 'admin1': place.admin1,
        'latitude': place.latitude,
        'longitude': place.longitude,
        if (place.timezone != null) 'timezone': place.timezone,
      },
      'current': bundle.current,
      'daily': bundle.daily,
    };
  }

  /// 地名 → 经纬度。
  ///
  /// ⚠️ **中文地名必须带 language=zh** —— 实测（2026-11-15 真机直探）：
  /// 同一个「北京」，**不带** language=zh ⇒ 返回空 results（=「查不到」）
  /// ⇒ ⇒ 「中国城市查不到」的现象，根因是这个参数，不是「没有那个城市」。
  /// ⇒ ⇒ 反过来：拉丁字母地名**不带**它 ⇒ 回来的名字是本地写法（Tokyo 不是 东京）。
  Future<_ResolvedPlace> _geocode(String name) async {
    final uri = Uri.parse(kWeatherGeocodingBase).replace(
      queryParameters: <String, String>{
        'name': name,
        'count': '1',
        'format': 'json',
        if (_hasCjk(name)) 'language': 'zh',
      },
    );
    final body = await _fetchJson(uri);
    final results = (body['results'] as List?) ?? const [];
    if (results.isEmpty) {
      throw WeatherException(
        'no place matched "$name" — try another spelling, or pass '
        'latitude/longitude instead.',
      );
    }
    final first = Map<String, dynamic>.from(results.first as Map);
    final lat = _asDouble(first['latitude']);
    final lon = _asDouble(first['longitude']);
    if (lat == null || lon == null) {
      // ⚠️ 缺坐标 ⇒ **不许**拿 (0,0) 顶上（那是几内亚湾）⇒ ⇒ 明确失败。
      throw WeatherException(
        'the place "$name" came back without coordinates — pass '
        'latitude/longitude instead.',
      );
    }
    final resolvedName = (first['name'] as String?)?.trim();
    return _ResolvedPlace(
      name: (resolvedName == null || resolvedName.isEmpty) ? name : resolvedName,
      latitude: lat,
      longitude: lon,
      country: first['country'] as String?,
      admin1: first['admin1'] as String?,
      timezone: first['timezone'] as String?,
    );
  }

  /// 经纬度 → 实况 ＋ 逐日预报。
  Future<_WeatherBundle> _forecast({
    required double latitude,
    required double longitude,
    required int days,
    required bool fahrenheit,
  }) async {
    final uri = Uri.parse(kWeatherForecastBase).replace(
      queryParameters: <String, String>{
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'current':
            'temperature_2m,relative_humidity_2m,apparent_temperature,'
            'precipitation,weather_code,wind_speed_10m,wind_direction_10m',
        'daily':
            'weather_code,temperature_2m_max,temperature_2m_min,'
            'precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
        'timezone': 'auto',
        'forecast_days': '$days',
        'temperature_unit': fahrenheit ? 'fahrenheit' : 'celsius',
        'wind_speed_unit': fahrenheit ? 'mph' : 'kmh',
      },
    );
    final body = await _fetchJson(uri);

    final currentBlock = body['current'];
    if (currentBlock is! Map) {
      throw const WeatherException(
        'the weather source answered without a "current" block — the payload '
        'shape changed or the place has no observation.',
      );
    }
    final current = Map<String, dynamic>.from(currentBlock);
    final code = _asDouble(current['weather_code'])?.toInt() ?? -1;

    final dailyBlock = body['daily'];
    final daily = <Map<String, dynamic>>[];
    if (dailyBlock is Map) {
      final block = Map<String, dynamic>.from(dailyBlock);
      final dates = (block['time'] as List?) ?? const [];
      for (var i = 0; i < dates.length; i++) {
        final dayCode = _asDouble(_at(block, 'weather_code', i))?.toInt() ?? -1;
        daily.add(<String, dynamic>{
          'date': dates[i],
          'temperatureMax': _asDouble(_at(block, 'temperature_2m_max', i)),
          'temperatureMin': _asDouble(_at(block, 'temperature_2m_min', i)),
          'precipitationSum': _asDouble(_at(block, 'precipitation_sum', i)),
          'precipitationProbabilityMax':
              _asDouble(_at(block, 'precipitation_probability_max', i))?.toInt(),
          'windSpeedMax': _asDouble(_at(block, 'wind_speed_10m_max', i)),
          'weatherCode': dayCode,
          'weatherText': weatherTextForCode(dayCode),
        });
      }
    }

    return _WeatherBundle(
      current: <String, dynamic>{
        'time': current['time'],
        'temperature': _asDouble(current['temperature_2m']),
        'apparentTemperature': _asDouble(current['apparent_temperature']),
        'humidity': _asDouble(current['relative_humidity_2m'])?.toInt(),
        'precipitation': _asDouble(current['precipitation']),
        'windSpeed': _asDouble(current['wind_speed_10m']),
        'windDirection': _asDouble(current['wind_direction_10m'])?.toInt(),
        'weatherCode': code,
        'weatherText': weatherTextForCode(code),
      },
      daily: daily,
    );
  }

  /// 一次 HTTP GET → 一份 JSON 对象。
  ///
  /// ⚠️ **每一种失败都带真因**（超时 / 连不上 / 状态码 / 形状不对）
  /// ⇒ ⇒ 不出现「失败长得像成功」。
  Future<Map<String, dynamic>> _fetchJson(Uri uri) async {
    http.Response response;
    try {
      response = await _http.get(uri).timeout(timeout);
    } on TimeoutException catch (e) {
      throw WeatherException(
        'the weather source timed out after ${timeout.inSeconds}s '
        '(${uri.host}): $e',
      );
    } catch (e) {
      throw WeatherException(
        'the weather source is unreachable (${uri.host}): $e',
      );
    }
    if (response.statusCode != 200) {
      throw WeatherException(
        'the weather source answered HTTP ${response.statusCode} '
        '(${uri.host}): ${_snippet(response.body)}',
      );
    }
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      throw WeatherException(
        'the weather source returned a non-object payload (${uri.host})',
      );
    } on FormatException catch (e) {
      throw WeatherException(
        'the weather source returned malformed JSON (${uri.host}): ${e.message}',
      );
    }
  }
}

/// 数组型字段的第 i 项（越界 ⇒ null，不抛）。
Object? _at(Map<String, dynamic> block, String key, int index) {
  final values = block[key];
  if (values is! List) return null;
  if (index < 0 || index >= values.length) return null;
  return values[index];
}

/// 地点名 —— 不是字符串就当没给（模型偶尔把地名塞成数字）。
String _asText(Object? raw) {
  if (raw is! String) return '';
  return raw.trim();
}

/// 模型可能把数字写成字符串 ⇒ 两种都认；都不是 ⇒ null。
double? _asDouble(Object? raw) {
  if (raw is num) return raw.toDouble();
  if (raw is String) return double.tryParse(raw.trim());
  return null;
}

/// 预报天数 —— 认不出来用默认 3；越界夹到 1..7。
int _asDays(Object? raw) {
  var value = 3;
  final parsed = _asDouble(raw)?.toInt();
  if (parsed != null) value = parsed;
  if (value < 1) return 1;
  if (value > 7) return 7;
  return value;
}

/// 温度单位 —— 只有 fahrenheit 才是华氏，其余一律摄氏（默认）。
bool _isFahrenheit(Object? raw) {
  if (raw is! String) return false;
  return raw.trim().toLowerCase() == 'fahrenheit';
}

/// 这个名字里有没有中日韩字符 ⇒ ⇒ 决定要不要带 language=zh。
bool _hasCjk(String text) {
  for (final rune in text.runes) {
    if ((rune >= 0x4E00 && rune <= 0x9FFF) ||
        (rune >= 0x3400 && rune <= 0x4DBF) ||
        (rune >= 0x3000 && rune <= 0x303F)) {
      return true;
    }
  }
  return false;
}

/// 错误信息里带一小截响应体（够看出「上游说了什么」，又不把整页甩出去）。
String _snippet(String body) {
  final flat = body.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (flat.length <= 160) return flat;
  return '${flat.substring(0, 160)}…';
}
