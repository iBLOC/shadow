/**
 * **天气工具的取数那一半** —— Open-Meteo（免费 / 免注册 / 免 Key）。
 *
 * ⚠️ **为什么是它**（2026-11-15 全网横评 ＋ 真机直探的结论）：
 * 免 Key、免信用卡、全球覆盖、数据是 **CC BY 4.0**（可商用、要署名）
 * ⇒ ⇒ 「内置天气工具」不欠用户任何账号、密钥或信用卡。
 *
 * ⚠️ **为什么设备侧直连、不绕端脑**：天气是**纯网络数据**、不碰这台设备
 * ⇒ ⇒ 桌面端 tauri.conf.json 的 csp = null（没有 connect-src 限制）
 * ⇒ ⇒ **零新增端脑路由、零新增依赖、零新增权限**。
 *
 * ⚠️ **与移动端同形**：shadow-mobile/lib/services/weather/weather_client.dart
 * ⇒ ⇒ 两端同一个工具、同一个数据源、同一个结果形状。
 *
 * ⚠️ **额度这一格已经裁定**（用户逐字：「我这是客户端使用的无所谓10000次」，
 * 2026-11-16）—— 官方条款逐字（open-meteo.com/en/terms 的 Non-Commercial
 * Use 段）：「**Rate limits are applied by IP addresses and application**」
 * ⇒ ⇒ 客户端直连 ⇒ 每个用户从**自己的 IP** 各算各的
 * ⇒ ⇒ 10,000 次/天**不是产品级天花板** ⇒ ⇒ 不订阅、也不换源。
 * ⚠️ **但这三条还欠着**（别把「额度不是问题」读成「全清了」）：
 * ① **署名** —— CC BY 4.0 的义务（结果里的 source 字段就是它）；
 * ② **取数必须留在客户端** —— 一旦挪到端脑／服务器代理 ⇒ 所有用户共用我们
 * 的出口 IP ⇒ ⇒ 限额立刻变成产品级（官方同段逐字点名：Vercel／Netlify／
 * Render 这类托管「might be rate-limited earlier then expected」）；
 * ③ **产品一旦开始订阅／收费** —— free API 那条「only for non-commercial
 * purposes」就不再覆盖 ⇒ ⇒ 那时才要订阅或换源（WeatherAPI 免费档官方
 * 写明含商用）。
 */

export const WEATHER_SOURCE_NAME = 'Open-Meteo'
const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast'
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search'

export interface WeatherLocation {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
  timezone?: string
}

export interface WeatherCurrent {
  time?: string
  temperature?: number
  apparentTemperature?: number
  humidity?: number
  precipitation?: number
  windSpeed?: number
  windDirection?: number
  weatherCode: number
  weatherText: string
}

export interface WeatherDay {
  date: string
  temperatureMax?: number
  temperatureMin?: number
  precipitationSum?: number
  precipitationProbabilityMax?: number
  windSpeedMax?: number
  weatherCode: number
  weatherText: string
}

export interface WeatherResult {
  source: string
  units: { temperature: string; windSpeed: string; precipitation: string }
  location: WeatherLocation
  current: WeatherCurrent
  daily: WeatherDay[]
}

/**
 * 天气工具的失败 —— **带真因**。
 *
 * ⚠️ **不许静默、不许长得像成功**：工具失败时错误会回传给端脑 ⇒ ⇒ 模型
 * 才知道这条路走不通（可以换个地名再问一次），而不是卡在等结果上。
 */
export class WeatherError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherError'
  }
}

/**
 * WMO 天气代码 → 人话（**英文**）。
 *
 * ⚠️ **为什么是英文**：这份文字是**给模型看的**（结果 JSON 回传给端脑）
 * ⇒ ⇒ 模型自己会翻成用户说的语言 ⇒ ⇒ 客户端不替模型做翻译决定。
 * ⚠️ 认不出的代码给 Unknown（**不猜**）—— 猜错一次，用户看到的天气
 * 和真实天气对不上，而模型以为自己拿到了真数据。
 */
export function weatherTextForCode(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky'
    case 1:
      return 'Mainly clear'
    case 2:
      return 'Partly cloudy'
    case 3:
      return 'Overcast'
    case 45:
      return 'Fog'
    case 48:
      return 'Depositing rime fog'
    case 51:
      return 'Light drizzle'
    case 53:
      return 'Moderate drizzle'
    case 55:
      return 'Dense drizzle'
    case 56:
      return 'Light freezing drizzle'
    case 57:
      return 'Dense freezing drizzle'
    case 61:
      return 'Slight rain'
    case 63:
      return 'Moderate rain'
    case 65:
      return 'Heavy rain'
    case 66:
      return 'Light freezing rain'
    case 67:
      return 'Heavy freezing rain'
    case 71:
      return 'Slight snow fall'
    case 73:
      return 'Moderate snow fall'
    case 75:
      return 'Heavy snow fall'
    case 77:
      return 'Snow grains'
    case 80:
      return 'Slight rain showers'
    case 81:
      return 'Moderate rain showers'
    case 82:
      return 'Violent rain showers'
    case 85:
      return 'Slight snow showers'
    case 86:
      return 'Heavy snow showers'
    case 95:
      return 'Thunderstorm'
    case 96:
      return 'Thunderstorm with slight hail'
    case 99:
      return 'Thunderstorm with heavy hail'
    default:
      return 'Unknown'
  }
}

interface ResolvedPlace {
  name: string
  latitude: number
  longitude: number
  country?: string
  admin1?: string
  timezone?: string
}

/**
 * **天气工具的取数那一半**。
 *
 * ⚠️ **fetch 可注入** ⇒ 单测可以喂假响应，不必真连网
 * ⇒ ⇒ 真连网那条路（DNS / TLS / 上游形状）另用真机读数验。
 */
export class WeatherClient {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
    this.fetchImpl =
      opts.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
    this.timeoutMs = opts.timeoutMs ?? 12000
  }

  /**
   * 取天气。
   *
   * ⚠️ **参数一律按「模型可能乱填」的形状收**（模型有时把数字写成字符串）
   * ⇒ ⇒ 认不出来就**用默认值**，不因此让整轮失败（与 set_theme 那族同一纪律）。
   *
   * 返回形状（**两端逐字同形**）：
   * { source, units, location, current, daily }
   */
  async fetchWeather(args: {
    location?: unknown
    latitude?: unknown
    longitude?: unknown
    days?: unknown
    units?: unknown
  } = {}): Promise<WeatherResult> {
    const name = asText(args.location)
    const lat = asDouble(args.latitude)
    const lon = asDouble(args.longitude)
    const days = asDays(args.days)
    const fahrenheit = isFahrenheit(args.units)

    if (name === '' && (lat === null || lon === null)) {
      throw new WeatherError(
        'get_weather needs a place: give "location" (a city name, e.g. "北京") ' +
          'or both "latitude" and "longitude".',
      )
    }

    const place: ResolvedPlace =
      name === ''
        ? {
            name: `${lat!.toFixed(4)}, ${lon!.toFixed(4)}`,
            latitude: lat!,
            longitude: lon!,
          }
        : await this.geocode(name)

    const bundle = await this.forecast(place.latitude, place.longitude, days, fahrenheit)

    return {
      // ⚠️ **署名是 CC BY 4.0 的义务** —— 数据是 Open-Meteo 的。
      source: WEATHER_SOURCE_NAME,
      units: {
        temperature: fahrenheit ? '°F' : '°C',
        windSpeed: fahrenheit ? 'mph' : 'km/h',
        precipitation: 'mm',
      },
      location: {
        name: place.name,
        ...(place.country !== undefined ? { country: place.country } : {}),
        ...(place.admin1 !== undefined ? { admin1: place.admin1 } : {}),
        latitude: place.latitude,
        longitude: place.longitude,
        ...(place.timezone !== undefined ? { timezone: place.timezone } : {}),
      },
      current: bundle.current,
      daily: bundle.daily,
    }
  }

  /**
   * 地名 → 经纬度。
   *
   * ⚠️ **中文地名必须带 language=zh** —— 实测（2026-11-15 真机直探）：
   * 同一个「北京」，**不带** language=zh ⇒ 返回空 results（=「查不到」）
   * ⇒ ⇒ 「中国城市查不到」的现象，根因是这个参数，不是「没有那个城市」。
   * ⇒ ⇒ 反过来：拉丁字母地名**不带**它 ⇒ 回来的名字是本地写法（Tokyo 不是 东京）。
   */
  private async geocode(name: string): Promise<ResolvedPlace> {
    const params = new URLSearchParams({
      name,
      count: '1',
      format: 'json',
    })
    if (hasCjk(name)) params.set('language', 'zh')
    const url = `${GEOCODING_BASE}?${params.toString()}`

    const body = await this.fetchJson(url)
    const results = Array.isArray(body.results) ? body.results : []
    if (results.length === 0) {
      throw new WeatherError(
        `no place matched "${name}" — try another spelling, or pass latitude/longitude instead.`,
      )
    }
    const first = (results[0] ?? {}) as Record<string, unknown>
    const lat = asDouble(first.latitude)
    const lon = asDouble(first.longitude)
    if (lat === null || lon === null) {
      // ⚠️ 缺坐标 ⇒ **不许**拿 (0,0) 顶上（那是几内亚湾）⇒ ⇒ 明确失败。
      throw new WeatherError(
        `the place "${name}" came back without coordinates — pass latitude/longitude instead.`,
      )
    }
    const resolvedName = asText(first.name)
    return {
      name: resolvedName === '' ? name : resolvedName,
      latitude: lat,
      longitude: lon,
      country: typeof first.country === 'string' ? first.country : undefined,
      admin1: typeof first.admin1 === 'string' ? first.admin1 : undefined,
      timezone: typeof first.timezone === 'string' ? first.timezone : undefined,
    }
  }

  /** 经纬度 → 实况 ＋ 逐日预报。 */
  private async forecast(
    latitude: number,
    longitude: number,
    days: number,
    fahrenheit: boolean,
  ): Promise<{ current: WeatherCurrent; daily: WeatherDay[] }> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,' +
        'precipitation,weather_code,wind_speed_10m,wind_direction_10m',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,' +
        'precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
      timezone: 'auto',
      forecast_days: String(days),
      temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
      wind_speed_unit: fahrenheit ? 'mph' : 'kmh',
    })
    const url = `${FORECAST_BASE}?${params.toString()}`

    const body = await this.fetchJson(url)

    const currentBlock = body.current
    if (typeof currentBlock !== 'object' || currentBlock === null || Array.isArray(currentBlock)) {
      throw new WeatherError(
        'the weather source answered without a "current" block — the payload ' +
          'shape changed or the place has no observation.',
      )
    }
    const current = currentBlock as Record<string, unknown>
    const code = asDouble(current.weather_code) ?? -1

    const daily: WeatherDay[] = []
    const dailyBlock = body.daily
    if (typeof dailyBlock === 'object' && dailyBlock !== null && !Array.isArray(dailyBlock)) {
      const block = dailyBlock as Record<string, unknown>
      const dates = Array.isArray(block.time) ? block.time : []
      dates.forEach((date, index) => {
        const dayCode = asDouble(at(block, 'weather_code', index)) ?? -1
        daily.push({
          date: String(date),
          temperatureMax: asDouble(at(block, 'temperature_2m_max', index)) ?? undefined,
          temperatureMin: asDouble(at(block, 'temperature_2m_min', index)) ?? undefined,
          precipitationSum: asDouble(at(block, 'precipitation_sum', index)) ?? undefined,
          precipitationProbabilityMax:
            asDouble(at(block, 'precipitation_probability_max', index)) ?? undefined,
          windSpeedMax: asDouble(at(block, 'wind_speed_10m_max', index)) ?? undefined,
          weatherCode: dayCode,
          weatherText: weatherTextForCode(dayCode),
        })
      })
    }

    return {
      current: {
        time: typeof current.time === 'string' ? current.time : undefined,
        temperature: asDouble(current.temperature_2m) ?? undefined,
        apparentTemperature: asDouble(current.apparent_temperature) ?? undefined,
        humidity: asDouble(current.relative_humidity_2m) ?? undefined,
        precipitation: asDouble(current.precipitation) ?? undefined,
        windSpeed: asDouble(current.wind_speed_10m) ?? undefined,
        windDirection: asDouble(current.wind_direction_10m) ?? undefined,
        weatherCode: code,
        weatherText: weatherTextForCode(code),
      },
      daily,
    }
  }

  /**
   * 一次 HTTP GET → 一份 JSON 对象。
   *
   * ⚠️ **每一种失败都带真因**（超时 / 连不上 / 状态码 / 形状不对）
   * ⇒ ⇒ 不出现「失败长得像成功」。
   */
  private async fetchJson(url: string): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url, { signal: controller.signal })
    } catch (e) {
      if (controller.signal.aborted) {
        throw new WeatherError(
          `the weather source timed out after ${this.timeoutMs}ms (${hostOf(url)})`,
        )
      }
      throw new WeatherError(
        `the weather source is unreachable (${hostOf(url)}): ${reasonOf(e)}`,
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let body = ''
      try {
        body = await response.text()
      } catch (e) {
        body = `(body unreadable: ${reasonOf(e)})`
      }
      throw new WeatherError(
        `the weather source answered HTTP ${response.status} (${hostOf(url)}): ${snippet(body)}`,
      )
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch (e) {
      throw new WeatherError(
        `the weather source returned malformed JSON (${hostOf(url)}): ${reasonOf(e)}`,
      )
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new WeatherError(
        `the weather source returned a non-object payload (${hostOf(url)})`,
      )
    }
    return parsed as Record<string, unknown>
  }
}

/** 默认那一支（真实网络）。单测自己 new 一个带假 fetch 的。 */
export const weatherClient = new WeatherClient()

/** 数组型字段的第 i 项（越界 ⇒ undefined，不抛）。 */
function at(block: Record<string, unknown>, key: string, index: number): unknown {
  const values = block[key]
  if (!Array.isArray(values)) return undefined
  if (index < 0 || index >= values.length) return undefined
  return values[index]
}

/** 地点名 —— 不是字符串就当没给（模型偶尔把地名塞成数字）。 */
function asText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim()
}

/** 模型可能把数字写成字符串 ⇒ 两种都认；都不是 ⇒ null。 */
function asDouble(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 预报天数 —— 认不出来用默认 3；越界夹到 1..7。 */
function asDays(raw: unknown): number {
  const parsed = asDouble(raw)
  const value = parsed === null ? 3 : Math.trunc(parsed)
  if (value < 1) return 1
  if (value > 7) return 7
  return value
}

/** 温度单位 —— 只有 fahrenheit 才是华氏，其余一律摄氏（默认）。 */
function isFahrenheit(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  return raw.trim().toLowerCase() === 'fahrenheit'
}

/** 这个名字里有没有中日韩字符 ⇒ ⇒ 决定要不要带 language=zh。 */
function hasCjk(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f)
    ) {
      return true
    }
  }
  return false
}

/** 错误信息里的主机名（够定位是哪一个上游）。 */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 异常的原文。 */
function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 错误信息里带一小截响应体（够看出「上游说了什么」，又不把整页甩出去）。 */
function snippet(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  return `${flat.substring(0, 160)}…`
}
