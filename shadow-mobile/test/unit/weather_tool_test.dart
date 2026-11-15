import 'dart:io' show SocketException;

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/services/weather/weather_client.dart';

/// 客户端工具 get_weather —— **「模型问天气」那条路**。
///
/// ## 为什么钉它
///
/// 天气是**纯网络数据**：工具在**这台设备上**直连公开数据源（Open-Meteo，
/// 免 Key、免注册），不走端脑 ⇒ ⇒ 不欠用户任何账号或密钥。
///
/// ⚠️ **两端同一份契约**（工具名 / 参数表 / 结果形状逐字一致）
/// ⇒ ⇒ 桌面端 shadow-desktop/src/lib/clientTools.ts 同名工具同形。
///
/// ## 钉住的几格
///
/// ❶ 发给模型的那一份参数表（模型看得见 ⇒ 两端必须一致）。
/// ❷ **中文地名必须带 language=zh** —— 不带的实测是「查不到北京」（真机直探）。
/// ❸ 成功路径的结果形状与真值（含 WMO 代码 → 人话）。
/// ❹ 经纬度直查（不打地理编码那一步）。
/// ❺ 参数容错：数字写成字符串、days 越界、乱填。
/// ❻ 失败路径：**每一种都带真因**，且不许默默成功。
void main() {
  const geocodeBody = '{"results":[{"id":1816670,"name":"北京","latitude":39.9075,'
      '"longitude":116.39723,"country":"中国","admin1":"北京市",'
      '"timezone":"Asia/Shanghai"}],"generationtime_ms":0.2}';

  const forecastBody = '{"latitude":39.89455,"longitude":116.35983,'
      '"timezone":"Asia/Shanghai","current":{"time":"2026-11-16T00:00","interval":900,'
      '"temperature_2m":6.5,"relative_humidity_2m":64,"apparent_temperature":3.4,'
      '"precipitation":0.0,"weather_code":3,"wind_speed_10m":6.6,'
      '"wind_direction_10m":103},"daily":{"time":["2026-11-16","2026-11-17"],'
      '"weather_code":[3,61],"temperature_2m_max":[7.1,6.0],'
      '"temperature_2m_min":[1.2,3.3],"precipitation_sum":[0.0,2.4],'
      '"precipitation_probability_max":[10,80],"wind_speed_10m_max":[9.0,14.2]}}';

  /// 一个假上游：按 URL 里有没有 geocoding / forecast 分流。
  ({List<String> urls, WeatherClient client}) fakeUpstream({
    String geocode = geocodeBody,
    String forecast = forecastBody,
    int geocodeStatus = 200,
    int forecastStatus = 200,
  }) {
    final urls = <String>[];
    final client = WeatherClient(
      httpClient: MockClient((req) async {
        urls.add(req.url.toString());
        // ⚠️ geocoding 在**主机名**里（geocoding-api.open-meteo.com），
        // 路径是 /v1/search ⇒ ⇒ 判 path 会把地理编码当预报 ⇒ ⇒ 返回体形状不对。
        final isGeocode = req.url.host.contains('geocoding');
        return http.Response(
          isGeocode ? geocode : forecast,
          isGeocode ? geocodeStatus : forecastStatus,
          headers: <String, String>{'content-type': 'application/json'},
        );
      }),
    );
    return (urls: urls, client: client);
  }

  ClientToolRegistry registryWith(WeatherClient weather) {
    return buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents: (_) async => const [],
      generateImage: (_) async => <String, dynamic>{},
      weatherClient: weather,
    );
  }

  group('get_weather（注册表这一层）', () {
    test('进了注册表，且发给模型的那一份参数表齐全', () {
      final registry = registryWith(fakeUpstream().client);
      expect(registry.lookup('get_weather'), isNotNull);
      final openai = toOpenAiTools(registry).firstWhere(
        (t) => t['function']['name'] == 'get_weather',
      );
      final params = openai['function']['parameters'] as Map<String, dynamic>;
      expect(params['type'], 'object');
      expect(
        (params['properties'] as Map).keys.toSet(),
        {'location', 'latitude', 'longitude', 'days', 'units'},
      );
      final units = (params['properties'] as Map)['units'] as Map;
      expect(units['enum'], ['celsius', 'fahrenheit']);
      final location = (params['properties'] as Map)['location'] as Map;
      expect(location['type'], 'string');
      expect(location['description'], contains('北京'));
    });

    test('成功：结果带 source / units / location / current / daily', () async {
      final up = fakeUpstream();
      final result = await registryWith(up.client)
          .lookup('get_weather')!
          .execute({'location': '北京'}) as Map<String, dynamic>;

      expect(result['source'], 'Open-Meteo');
      final units = result['units'] as Map;
      expect(units['temperature'], '°C');
      expect(units['windSpeed'], 'km/h');

      final location = result['location'] as Map;
      expect(location['name'], '北京');
      expect(location['country'], '中国');
      expect(location['latitude'], 39.9075);
      expect(location['timezone'], 'Asia/Shanghai');

      final current = result['current'] as Map;
      expect(current['temperature'], 6.5);
      expect(current['apparentTemperature'], 3.4);
      expect(current['humidity'], 64);
      expect(current['windSpeed'], 6.6);
      expect(current['windDirection'], 103);
      // ⚠️ WMO 代码 → 人话（模型看得懂的那一半）
      expect(current['weatherCode'], 3);
      expect(current['weatherText'], 'Overcast');

      final daily = result['daily'] as List;
      expect(daily, hasLength(2));
      expect((daily[0] as Map)['temperatureMax'], 7.1);
      expect((daily[0] as Map)['weatherText'], 'Overcast');
      expect((daily[1] as Map)['weatherText'], 'Slight rain');
      expect((daily[1] as Map)['precipitationProbabilityMax'], 80);
    });
  });

  group('get_weather（取数那一半）', () {
    test('中文地名 ⇒ 地理编码带 language=zh（不带的实测是「查不到」）', () async {
      final up = fakeUpstream();
      await up.client.fetchWeather(location: '北京');
      expect(up.urls, hasLength(2));
      expect(up.urls.first, contains('language=zh'));
      expect(up.urls.first, contains('name=%E5%8C%97%E4%BA%AC'));
      expect(up.urls.last, contains('latitude=39.9075'));
    });

    test('拉丁地名 ⇒ 不带 language（回来的是本地写法）', () async {
      final up = fakeUpstream();
      await up.client.fetchWeather(location: 'Tokyo');
      expect(up.urls.first, isNot(contains('language=zh')));
    });

    test('给经纬度 ⇒ 直接查预报，不打地理编码', () async {
      final up = fakeUpstream();
      final result = await up.client.fetchWeather(
        latitude: 39.9042,
        longitude: 116.4074,
      );
      expect(up.urls, hasLength(1));
      expect(up.urls.single, contains('latitude=39.9042'));
      expect(up.urls.single, contains('longitude=116.4074'));
      expect((result['location'] as Map)['name'], '39.9042, 116.4074');
    });

    test('模型把数字写成字符串 ⇒ 照样认', () async {
      final up = fakeUpstream();
      await up.client.fetchWeather(latitude: '39.9042', longitude: '116.4074');
      expect(up.urls.single, contains('latitude=39.9042'));
    });

    test('days 越界 ⇒ 夹到 1..7；乱填 ⇒ 用默认 3', () async {
      final tooMany = fakeUpstream();
      await tooMany.client.fetchWeather(latitude: 1, longitude: 2, days: 99);
      expect(tooMany.urls.single, contains('forecast_days=7'));

      final tooFew = fakeUpstream();
      await tooFew.client.fetchWeather(latitude: 1, longitude: 2, days: 0);
      expect(tooFew.urls.single, contains('forecast_days=1'));

      final junk = fakeUpstream();
      await junk.client.fetchWeather(latitude: 1, longitude: 2, days: 'abc');
      expect(junk.urls.single, contains('forecast_days=3'));
    });

    test('units=fahrenheit ⇒ 上游收华氏、结果单位也变成 °F', () async {
      final up = fakeUpstream();
      final result =
          await up.client.fetchWeather(latitude: 1, longitude: 2, units: 'fahrenheit');
      expect(up.urls.single, contains('temperature_unit=fahrenheit'));
      expect(up.urls.single, contains('wind_speed_unit=mph'));
      expect((result['units'] as Map)['temperature'], '°F');
      expect((result['units'] as Map)['windSpeed'], 'mph');
    });

    test('既没地名也没经纬度 ⇒ 明确失败（一个网络包都不发）', () async {
      final up = fakeUpstream();
      await expectLater(
        up.client.fetchWeather(),
        throwsA(
          isA<WeatherException>().having(
            (e) => e.message,
            'message',
            contains('needs a place'),
          ),
        ),
      );
      expect(up.urls, isEmpty);
    });

    test('地名查不到 ⇒ 失败带真因（不是空结果）', () async {
      final up = fakeUpstream(geocode: '{"generationtime_ms":0.1}');
      await expectLater(
        up.client.fetchWeather(location: '不存在的城市'),
        throwsA(
          isA<WeatherException>()
              .having((e) => e.message, 'message', contains('no place matched')),
        ),
      );
    });

    test('上游非 200 ⇒ 失败带状态码', () async {
      final up = fakeUpstream(forecastStatus: 503);
      await expectLater(
        up.client.fetchWeather(latitude: 1, longitude: 2),
        throwsA(
          isA<WeatherException>().having((e) => e.message, 'message', contains('503')),
        ),
      );
    });

    test('响应形状变了（没有 current）⇒ 失败带真因', () async {
      final up = fakeUpstream(forecast: '{"daily":{}}');
      await expectLater(
        up.client.fetchWeather(latitude: 1, longitude: 2),
        throwsA(
          isA<WeatherException>()
              .having((e) => e.message, 'message', contains('without a "current" block')),
        ),
      );
    });

    test('连不上 ⇒ 失败带真因（不许静默）', () async {
      final client = WeatherClient(
        httpClient: MockClient((req) async {
          throw const SocketException('connection refused');
        }),
      );
      await expectLater(
        client.fetchWeather(latitude: 1, longitude: 2),
        throwsA(
          isA<WeatherException>()
              .having((e) => e.message, 'message', contains('unreachable')),
        ),
      );
    });
  });

  group('weatherTextForCode（WMO 代码 → 人话）', () {
    test('常见代码各归各', () {
      expect(weatherTextForCode(0), 'Clear sky');
      expect(weatherTextForCode(2), 'Partly cloudy');
      expect(weatherTextForCode(3), 'Overcast');
      expect(weatherTextForCode(61), 'Slight rain');
      expect(weatherTextForCode(65), 'Heavy rain');
      expect(weatherTextForCode(75), 'Heavy snow fall');
      expect(weatherTextForCode(95), 'Thunderstorm');
    });

    test('认不出的代码 ⇒ Unknown（不猜）', () {
      expect(weatherTextForCode(-1), 'Unknown');
      expect(weatherTextForCode(999), 'Unknown');
    });
  });
}
