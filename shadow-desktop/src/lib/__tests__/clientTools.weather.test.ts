import { describe, it, expect, vi, afterEach } from 'vitest';

// ⚠️ **stub 的还原纪律**（与 clientTools.imageGen.test.ts 同一条）：vitest 默认
// unstubGlobals: false ⇒ 本文件 stub 出去的东西不会自动还原 ⇒ ⇒ 泄漏给同一
// worker 的后续文件 ⇒ ⇒ 失败长得像成功。装在 afterEach（不外泄）。
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { desktopClientTools, toOpenAiTools } from '../clientTools';
import { WeatherError, weatherTextForCode } from '../weatherClient';

const GEO_BODY = JSON.stringify({
  results: [
    {
      id: 1816670,
      name: '北京',
      latitude: 39.9075,
      longitude: 116.39723,
      country: '中国',
      admin1: '北京市',
      timezone: 'Asia/Shanghai',
    },
  ],
  generationtime_ms: 0.2,
});

const FORECAST_BODY = JSON.stringify({
  latitude: 39.89455,
  longitude: 116.35983,
  timezone: 'Asia/Shanghai',
  current: {
    time: '2026-11-16T00:00',
    interval: 900,
    temperature_2m: 6.5,
    relative_humidity_2m: 64,
    apparent_temperature: 3.4,
    precipitation: 0,
    weather_code: 3,
    wind_speed_10m: 6.6,
    wind_direction_10m: 103,
  },
  daily: {
    time: ['2026-11-16', '2026-11-17'],
    weather_code: [3, 61],
    temperature_2m_max: [7.1, 6],
    temperature_2m_min: [1.2, 3.3],
    precipitation_sum: [0, 2.4],
    precipitation_probability_max: [10, 80],
    wind_speed_10m_max: [9, 14.2],
  },
});

/**
 * 假上游：按 URL 里有没有 geocoding / forecast 分流，并把每次 URL 记下来。
 *
 * ⚠️ 返回的是**最小 Response 形状**（ok / status / json / text）——客户端只
 * 用这四个 ⇒ ⇒ 不依赖运行环境有没有 Response 类。
 */
function fakeUpstream(opts: {
  geocode?: string;
  forecast?: string;
  geocodeStatus?: number;
  forecastStatus?: number;
} = {}) {
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    const isGeocode = url.includes('geocoding');
    const body = isGeocode ? (opts.geocode ?? GEO_BODY) : (opts.forecast ?? FORECAST_BODY);
    const status = isGeocode ? (opts.geocodeStatus ?? 200) : (opts.forecastStatus ?? 200);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(body),
      text: async () => body,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { urls, fetchMock };
}

/** get_weather 在注册表里的那条（找不到就直红 —— 工具没注册等于没这功能）。 */
function theTool() {
  const tool = desktopClientTools.lookup('get_weather');
  expect(tool, 'get_weather must be registered in desktopClientTools').toBeTruthy();
  return tool!;
}

describe('get_weather（天气客户端工具）', () => {
  it('进了注册表，且导出的参数表齐全', () => {
    const openai = toOpenAiTools(desktopClientTools).find(
      (t) => t.function.name === 'get_weather',
    );
    expect(openai, 'get_weather must be exported to the model').toBeTruthy();
    const params = openai!.function.parameters as {
      type: string;
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
    };
    expect(params.type).toBe('object');
    expect(Object.keys(params.properties).sort()).toEqual([
      'days',
      'latitude',
      'location',
      'longitude',
      'units',
    ]);
    expect(params.properties.units.enum).toEqual(['celsius', 'fahrenheit']);
    expect(params.properties.location.description).toContain('北京');
  });

  it('中文地名 ⇒ 地理编码带 language=zh（不带的实测是「查不到」）', async () => {
    const up = fakeUpstream();
    await theTool().execute({ location: '北京' }, {});
    expect(up.urls).toHaveLength(2);
    expect(up.urls[0]).toContain('language=zh');
    expect(up.urls[0]).toContain('name=%E5%8C%97%E4%BA%AC');
    expect(up.urls[1]).toContain('latitude=39.9075');
  });

  it('拉丁地名 ⇒ 不带 language（回来的是本地写法）', async () => {
    const up = fakeUpstream();
    await theTool().execute({ location: 'Tokyo' }, {});
    expect(up.urls[0]).not.toContain('language=zh');
  });

  it('成功：结果带 source / units / location / current / daily', async () => {
    fakeUpstream();
    const result = (await theTool().execute({ location: '北京' }, {})) as {
      source: string;
      units: Record<string, string>;
      location: Record<string, unknown>;
      current: Record<string, unknown>;
      daily: Array<Record<string, unknown>>;
    };
    expect(result.source).toBe('Open-Meteo');
    expect(result.units.temperature).toBe('°C');
    expect(result.units.windSpeed).toBe('km/h');
    expect(result.location.name).toBe('北京');
    expect(result.location.country).toBe('中国');
    expect(result.location.latitude).toBe(39.9075);
    expect(result.current.temperature).toBe(6.5);
    expect(result.current.humidity).toBe(64);
    expect(result.current.weatherCode).toBe(3);
    // ⚠️ WMO 代码 → 人话（模型看得懂的那一半）
    expect(result.current.weatherText).toBe('Overcast');
    expect(result.daily).toHaveLength(2);
    expect(result.daily[1].weatherText).toBe('Slight rain');
    expect(result.daily[1].precipitationProbabilityMax).toBe(80);
  });

  it('给经纬度 ⇒ 直接查预报，不打地理编码', async () => {
    const up = fakeUpstream();
    await theTool().execute({ latitude: 39.9042, longitude: 116.4074 }, {});
    expect(up.urls).toHaveLength(1);
    expect(up.urls[0]).toContain('latitude=39.9042');
  });

  it('模型把数字写成字符串 ⇒ 照样认', async () => {
    const up = fakeUpstream();
    await theTool().execute({ latitude: '39.9042', longitude: '116.4074' }, {});
    expect(up.urls[0]).toContain('latitude=39.9042');
  });

  it('days 越界 ⇒ 夹到 1..7；乱填 ⇒ 用默认 3', async () => {
    const many = fakeUpstream();
    await theTool().execute({ latitude: 1, longitude: 2, days: 99 }, {});
    expect(many.urls[0]).toContain('forecast_days=7');

    const few = fakeUpstream();
    await theTool().execute({ latitude: 1, longitude: 2, days: 0 }, {});
    expect(few.urls[0]).toContain('forecast_days=1');

    const junk = fakeUpstream();
    await theTool().execute({ latitude: 1, longitude: 2, days: 'abc' }, {});
    expect(junk.urls[0]).toContain('forecast_days=3');
  });

  it('units=fahrenheit ⇒ 上游收华氏、结果单位也变成 °F', async () => {
    const up = fakeUpstream();
    const result = (await theTool().execute(
      { latitude: 1, longitude: 2, units: 'fahrenheit' },
      {},
    )) as { units: Record<string, string> };
    expect(up.urls[0]).toContain('temperature_unit=fahrenheit');
    expect(result.units.temperature).toBe('°F');
  });

  it('既没地名也没经纬度 ⇒ 明确失败（一个网络包都不发）', async () => {
    const up = fakeUpstream();
    await expect(theTool().execute({}, {})).rejects.toThrow(/needs a place/);
    expect(up.urls).toHaveLength(0);
  });

  it('地名查不到 ⇒ 失败带真因（不是空结果）', async () => {
    fakeUpstream({ geocode: JSON.stringify({ generationtime_ms: 0.1 }) });
    await expect(theTool().execute({ location: '不存在的城市' }, {})).rejects.toThrow(
      /no place matched/,
    );
  });

  it('上游非 200 ⇒ 失败带状态码', async () => {
    fakeUpstream({ forecastStatus: 503 });
    await expect(theTool().execute({ latitude: 1, longitude: 2 }, {})).rejects.toThrow(
      /503/,
    );
  });

  it('响应形状变了（没有 current）⇒ 失败带真因', async () => {
    fakeUpstream({ forecast: JSON.stringify({ daily: {} }) });
    await expect(theTool().execute({ latitude: 1, longitude: 2 }, {})).rejects.toThrow(
      /without a "current" block/,
    );
  });

  it('连不上 ⇒ 失败带真因（不许静默）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    await expect(theTool().execute({ latitude: 1, longitude: 2 }, {})).rejects.toThrow(
      /unreachable/,
    );
  });

  it('失败时抛的是 WeatherError（可被上层分辨）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );
    await expect(theTool().execute({ latitude: 1, longitude: 2 }, {})).rejects.toBeInstanceOf(
      WeatherError,
    );
  });
});

describe('weatherTextForCode（WMO 代码 → 人话）', () => {
  it('常见代码各归各', () => {
    expect(weatherTextForCode(0)).toBe('Clear sky');
    expect(weatherTextForCode(2)).toBe('Partly cloudy');
    expect(weatherTextForCode(3)).toBe('Overcast');
    expect(weatherTextForCode(61)).toBe('Slight rain');
    expect(weatherTextForCode(65)).toBe('Heavy rain');
    expect(weatherTextForCode(75)).toBe('Heavy snow fall');
    expect(weatherTextForCode(95)).toBe('Thunderstorm');
  });

  it('认不出的代码 ⇒ Unknown（不猜）', () => {
    expect(weatherTextForCode(-1)).toBe('Unknown');
    expect(weatherTextForCode(999)).toBe('Unknown');
  });
});
