import Contacts
import EventKit
import Flutter
import Photos
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // ⚠️ **设备数据桥要自己接上** —— 它不是插件（既没有 Podfile 条目，
    // 也不在 GeneratedPluginRegistrant 里）⇒ ⇒ 得在这儿手动注册通道。
    //
    // ⚠️ registrar(forPlugin:) 返回的是**可空**值 ⇒ ⇒ 必须 if let。
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DeviceDataBridge") {
      DeviceDataBridge.register(with: registrar)
    }
  }
}

/// **iOS 侧的设备数据桥** —— 与 Kotlin 侧 DeviceDataBridge **同一份契约**。
///
/// ## 为什么写在 AppDelegate.swift 里，而不是单独一个 Swift 文件
///
/// ios/Runner.xcodeproj/project.pbxproj 的 objectVersion 是 **54**
/// ⇒ ⇒ 没有「文件系统同步分组」⇒ ⇒ **新增一个 .swift 文件必须手改
/// pbxproj**（PBXBuildFile + PBXFileReference + group children + Sources 阶段）
/// ⇒ ⇒ 而本机没有 macOS / Xcode ⇒ ⇒ pbxproj 改坏了 = iOS 整个构建挂掉
/// ⇒ ⇒ 改**已经被 Xcode 引用的那个文件** = 构建图零风险。
/// ⇒ ⇒ 代价是这个文件变长了。
///
/// ## 为什么用 Swift 而不是 Objective-C
///
/// 因为 Swift **自动链接**框架（import EventKit 就够了）
/// ⇒ ⇒ 不用去 pbxproj 里加 -framework EventKit 之类的链接器参数
/// ⇒ ⇒ 又一个不需要动 pbxproj 的理由。
///
/// ## 与 Kotlin 侧**逐字对齐**的地方（改一边就必须改另一边）
///
/// - 通道名：com.ibloc.shadow/device_data
/// - 方法名：hasPermission / requestPermission / openAppSettings /
///   readCalendar / writeCalendar / readContacts / readSms / readPhotos
/// - 错误码：PERMISSION_DENIED / DEVICE_DATA_ERROR（Dart 侧按字符串匹配）
/// - 能力 wire 名：calendar_read / calendar_write / contacts / sms / photos
/// - 返回数据的字段名（一字不差）
///
/// ## ⚠️ iOS 上**没有**的东西
///
/// - **短信**：Apple **没有公开的短信读取 API**（Messages 框架只对自家
///   App 开放）⇒ ⇒ 这个能力在 iOS 上**根本不存在**⇒ ⇒ 一律回
///   「不支持」，绝回一个空列表（那是假装成功）。
/// - **只读日历**：iOS 17+ 的日历授权只有 fullAccess（读 + 写）与
///   writeOnly（只写）⇒ ⇒ **没有「只读」这一档**⇒ ⇒ 日历读/写在
///   iOS 系统层**必然连带**⇒ ⇒ 应用层的分档因此**更重要**。
final class DeviceDataBridge: NSObject {

  // MARK: - 契约常量

  /// 通道名 —— 必须与 Dart 侧 device_data_channel.dart 一字不差。
  private static let channelName = "com.ibloc.shadow/device_data"

  /// 错误码 —— 与 Kotlin 侧同名（Dart 侧按**字符串**匹配）。
  private static let errorPermissionDenied = "PERMISSION_DENIED"
  private static let errorDeviceData = "DEVICE_DATA_ERROR"
  /// 「这个平台压根没有这个能力」—— 与「权限被拒」是**两件事**。
  private static let errorUnsupported = "UNSUPPORTED_ON_IOS"

  /// 能力 —— wire 名与 Dart 侧 capability.dart 一字不差。
  ///
  /// ⚠️ **新增一个能力时，这里必须同步加** —— 两端各抄一份清单
  /// ⇒ ⇒ 少抄一个 ⇒ ⇒ 那一端「认不出」这个能力 ⇒ ⇒
  /// 症状是「静悄悄地当成不支持」⇒ ⇒ 没人知道是漏抄。
  private enum Capability: String {
    case calendarRead = "calendar_read"
    case calendarWrite = "calendar_write"
    case contacts = "contacts"
    case sms = "sms"
    case photos = "photos"

    /// **手机操作** —— 让模型驱动这台手机本身（读屏 / 点击 / 滑动）。
    ///
    /// ⚠️ iOS 上**平台就没有**这个能力：等价于 Android 无障碍服务
    /// （读可访问性树 ＋ 派发手势）的那套 API 在 iOS 上**没有公开对应物**
    /// ⇒ ⇒ 所以它是「不支持」，不是「没实现」⇒ ⇒ 走 [isSupported] 那条路。
    case mobileUse = "mobile_use"
  }

  /// 条数上限 —— 与 Kotlin 侧同一个上限（500）。
  ///
  /// ⚠️ 为什么要有上限：Dart 侧是可以随便传 limit 的 ⇒ ⇒
  /// 「把整本通讯录搬进模型上下文」既慢又贵 ⇒ ⇒ 宁可少给几条。
  private static let defaultLimit = 50
  private static let maxLimit = 500

  // MARK: - 状态

  private let eventStore = EKEventStore()
  private let contactStore = CNContactStore()

  /// 数据读取放在**串行**后台队列上 ——
  /// EventKit / Contacts / Photos 的查询都是阻塞 I/O ⇒ ⇒ 放主线程会卡 UI。
  ///
  /// ⚠️ **串行**而不是并发：EKEventStore 不是线程安全的 ⇒ ⇒
  /// 同一个 store 上的并发访问会出问题。
  private let ioQueue = DispatchQueue(
    label: "com.ibloc.shadow.device_data.io",
    qos: .userInitiated
  )

  /// 通道必须被**强引用** —— 否则 ARC 把它释放掉，通道就断了。
  private var channel: FlutterMethodChannel?
  private static var retained: DeviceDataBridge?

  /// 注册到 Flutter 通道。
  static func register(with registrar: FlutterPluginRegistrar) {
    let bridge = DeviceDataBridge()
    let channel = FlutterMethodChannel(
      name: channelName,
      binaryMessenger: registrar.messenger()
    )
    channel.setMethodCallHandler { [weak bridge] call, result in
      bridge?.handle(call: call, result: result)
    }
    bridge.channel = channel
    retained = bridge
  }

  // MARK: - 分发

  private func handle(call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    // ⚠️ **只允许交付一次** —— Flutter 的 FlutterResult 只能调一次
    // ⇒ ⇒ 这条链路上「抛异常」和「回错误」都可能发生 ⇒ ⇒ 有一道闸。
    let reply = SingleReply(result)

    switch call.method {
    case "requestPermission":
      requestPermission(args: args, reply: reply)
    case "openAppSettings":
      openAppSettings(reply: reply)
    case "hasPermission":
      guard let capability = Self.capability(from: args) else {
        // 未知能力 ⇒ fail-closed（与 Kotlin 侧同一条规矩）。
        reply.failure(
          code: Self.errorDeviceData,
          message: "未知的能力",
          details: nil
        )
        return
      }
      reply.success(self.hasOsPermission(capability))
    case "readCalendar":
      readCalendar(args: args, reply: reply)
    case "writeCalendar":
      writeCalendar(args: args, reply: reply)
    case "readContacts":
      readContacts(args: args, reply: reply)
    case "readSms":
      // ⚠️ iOS 没有公开的短信读取 API ⇒ ⇒ 明确报「不支持」
      // ⇒ ⇒ 而不是回一个空列表（那是假装成功）。
      reply.failure(
        code: Self.errorUnsupported,
        message: "iOS 没有公开的短信读取 API —— 这个能力在 iOS 上不存在",
        details: nil
      )
    case "readPhotos":
      readPhotos(args: args, reply: reply)
    default:
      reply.failure(
        code: Self.errorDeviceData,
        message: "Unsupported method: \(call.method)",
        details: nil
      )
    }
  }

  // MARK: - 权限

  /// 能力在 iOS 上**有没有**这个东西。
  ///
  /// ⚠️ iOS 没有公开的短信读取 API ⇒ ⇒ 短信这个能力在 iOS 上不存在
  /// ⇒ ⇒ 一律当「没有权限」⇒ ⇒ Dart 侧那层「先查后申请」会明确失败。
  private static func isSupported(_ capability: Capability) -> Bool {
    // ⚠️ 短信（Messages 框架只对自家 App 开放）与**手机操作**
    // ⇒ ⇒ 在 iOS 上都是「平台压根没有这个能力」⇒ ⇒ 一律当「不支持」。
    capability != .sms && capability != .mobileUse
  }

  /// 这个能力有没有拿到**系统层**权限（只读，不弹窗）。
  private func hasOsPermission(_ capability: Capability) -> Bool {
    guard Self.isSupported(capability) else { return false }
    switch capability {
    case .calendarRead:
      return Self.calendarAccess().read
    case .calendarWrite:
      return Self.calendarAccess().write
    case .contacts:
      return CNContactStore.authorizationStatus(for: .contacts) == .authorized
    case .photos:
      return Self.photosAccess()
    case .sms:
      return false
    case .mobileUse:
      // ⚠️ iOS 上没有「无障碍服务」这个东西 ⇒ ⇒ 永远拿不到「已开启」。
      // ⚠️ 这个 case 运行时**到不了**（上面的 guard 先拦住了）⇒ ⇒
      // 但 Swift 要求 switch **穷尽** ⇒ ⇒ 必须写出来。
      return false
    }
  }

  /// iOS 17+ 的日历授权状态 —— 读 / 写**是两件事**。
  ///
  /// ⚠️ iOS 17+ 把日历授权拆成了 fullAccess（读 + 写）与 writeOnly（只写）
  /// ⇒ ⇒ writeOnly 正好对上我们要的「只放开写」那一档
  /// ⇒ ⇒ 但**读那一档必然连带写**（iOS 没有「只读」这一档）。
  @available(iOS 17.0, *)
  private static func modernCalendarAccess() -> (read: Bool, write: Bool) {
    switch EKEventStore.authorizationStatus(for: .event) {
    case .fullAccess:
      return (true, true)
    case .writeOnly:
      return (false, true)
    default:
      return (false, false)
    }
  }

  /// iOS 16 及更早 —— 日历授权只有**一个**状态（要么全给，要么全不给）。
  private static func legacyCalendarAccess() -> (read: Bool, write: Bool) {
    let granted = EKEventStore.authorizationStatus(for: .event) == .authorized
    return (granted, granted)
  }

  private static func calendarAccess() -> (read: Bool, write: Bool) {
    if #available(iOS 17.0, *) {
      return modernCalendarAccess()
    }
    return legacyCalendarAccess()
  }

  /// iOS 14+ 的相册授权。
  @available(iOS 14.0, *)
  private static func modernPhotosAccess() -> Bool {
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    // ⚠️ .limited = 用户只挑了一部分照片 ⇒ ⇒ 那些的元数据**读得到**
    // ⇒ ⇒ 算「已授予」（读的是用户自己挑的那部分，不是整本相册）。
    return status == .authorized || status == .limited
  }

  private static func legacyPhotosAccess() -> Bool {
    return PHPhotoLibrary.authorizationStatus() == .authorized
  }

  private static func photosAccess() -> Bool {
    if #available(iOS 14.0, *) {
      return modernPhotosAccess()
    }
    return legacyPhotosAccess()
  }

  /// 申请权限 —— **按能力**申请（不是按权限字符串）。
  ///
  /// ⚠️ 与 Kotlin 侧同一个规矩：Dart 只给**能力名**，
  /// 「这个能力在 iOS 上要什么权限」是**平台侧的知识**
  /// ⇒ ⇒ 两端不会各自漂移一份映射。
  private func requestPermission(args: [String: Any], reply: SingleReply) {
    guard let capability = Self.capability(from: args) else {
      reply.success(false)
      return
    }
    guard Self.isSupported(capability) else {
      reply.success(false)
      return
    }
    switch capability {
    case .calendarRead:
      requestCalendarAccess(needsRead: true, reply: reply)
    case .calendarWrite:
      requestCalendarAccess(needsRead: false, reply: reply)
    case .contacts:
      requestContactsAccess(reply: reply)
    case .photos:
      requestPhotosAccess(reply: reply)
    case .sms:
      reply.success(false)
    case .mobileUse:
      // ⚠️ 同样：运行时到不了（guard 先拦）⇒ ⇒ 但 switch 必须穷尽。
      reply.success(false)
    }
  }

  /// 日历权限申请。
  ///
  /// ⚠️ **iOS 17+ 没有「只读」这一档** ⇒ ⇒ 分档只能这样映射：
  /// - 「读日历」⇒ requestFullAccessToEvents（读需要 full；
  ///   顺带也就有了写 —— 那是**平台**的连带，不是我们的选择）；
  /// - 「写日历」⇒ requestWriteOnlyAccessToEvents（**只要写**）
  ///   ⇒ ⇒ 这样「只放开写」的用户不会被顺带拿到读。
  ///
  /// ⚠️ 应用层的分档（读 / 写两档）仍然由 Dart 侧那道闸管着
  /// ⇒ ⇒ 即便系统在读那一档给了写，应用层照样能挡住写。
  private func requestCalendarAccess(needsRead: Bool, reply: SingleReply) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reply.success(false)
        return
      }
      if #available(iOS 17.0, *) {
        if needsRead {
          self.eventStore.requestFullAccessToEvents { granted, _ in
            reply.success(granted)
          }
        } else {
          self.eventStore.requestWriteOnlyAccessToEvents { granted, _ in
            reply.success(granted)
          }
        }
      } else {
        // ⚠️ iOS 16 及更早：只有一个 requestAccess
        // ⇒ ⇒ 给了就是读 + 写全给（平台如此）。
        self.eventStore.requestAccess(to: .event) { granted, _ in
          reply.success(granted)
        }
      }
    }
  }

  private func requestContactsAccess(reply: SingleReply) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reply.success(false)
        return
      }
      self.contactStore.requestAccess(for: .contacts) { granted, _ in
        reply.success(granted)
      }
    }
  }

  private func requestPhotosAccess(reply: SingleReply) {
    DispatchQueue.main.async {
      if #available(iOS 14.0, *) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
          reply.success(status == .authorized || status == .limited)
        }
      } else {
        PHPhotoLibrary.requestAuthorization { status in
          reply.success(status == .authorized)
        }
      }
    }
  }

  /// 打开**本 App**的系统权限页。
  ///
  /// ⚠️ 界面上写着「系统权限未授予」⇒ ⇒ 用户得有个**一键**去授的入口
  /// ⇒ ⇒ 否则那句话只是把人卡在那儿。
  private func openAppSettings(reply: SingleReply) {
    guard let url = URL(string: UIApplication.openSettingsURLString) else {
      reply.success(false)
      return
    }
    DispatchQueue.main.async {
      guard UIApplication.shared.canOpenURL(url) else {
        reply.success(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in
        reply.success(opened)
      }
    }
  }

  // MARK: - 读日历

  private func readCalendar(args: [String: Any], reply: SingleReply) {
    let startMs = Self.argInt64(args, "startMs")
    let endMs = Self.argInt64(args, "endMs")
    let limit = Self.normalizedLimit(
      Self.argInt(args, "limit"),
      fallback: Self.defaultLimit,
      ceiling: Self.maxLimit
    )

    ioQueue.async { [weak self] in
      guard let self = self else { return }
      // ⚠️ **碰数据之前再查一遍权限** —— 与 Kotlin 侧同一条规矩
      // ⇒ ⇒ Dart 说「有权限」不算数，原生这道门才是真的（fail-closed）。
      guard self.hasOsPermission(.calendarRead) else {
        reply.failure(
          code: Self.errorPermissionDenied,
          message: "缺少系统权限：日历（能力 calendar_read）",
          details: nil
        )
        return
      }
      reply.success(self.fetchCalendarEvents(startMs: startMs, endMs: endMs, limit: limit))
    }
  }

  private func fetchCalendarEvents(
    startMs: Int64,
    endMs: Int64,
    limit: Int
  ) -> [[String: Any]] {
    let start = Date(timeIntervalSince1970: Double(startMs) / 1000.0)
    let end = Date(timeIntervalSince1970: Double(endMs) / 1000.0)
    let predicate = EKEvent.predicateForEvents(
      withStart: start,
      end: end,
      calendars: nil
    )
    var out: [[String: Any]] = []
    for event in eventStore.eventsMatching(predicate) {
      if out.count >= limit { break }
      var row: [String: Any] = [
        // ⚠️ iOS 用 eventIdentifier（**按日历**唯一，不是全局唯一）
        // ⇒ ⇒ 与 Android 的 Events._ID 语义不同，写回去时别混用。
        "id": event.eventIdentifier ?? "",
        "title": event.title ?? "",
        "startMs": Int(event.startDate.timeIntervalSince1970 * 1000.0),
        "endMs": Int(event.endDate.timeIntervalSince1970 * 1000.0),
        "allDay": event.isAllDay,
        "calendar": event.calendar.title,
      ]
      if let location = event.location { row["location"] = location }
      if let notes = event.notes { row["description"] = notes }
      out.append(row)
    }
    return out
  }

  // MARK: - 写日历

  private func writeCalendar(args: [String: Any], reply: SingleReply) {
    guard let title = Self.argString(args, "title"), !title.isEmpty else {
      reply.failure(
        code: Self.errorDeviceData,
        message: "缺少参数：title",
        details: nil
      )
      return
    }
    guard let startMs = Self.argInt64(args, "startMs") else {
      reply.failure(
        code: Self.errorDeviceData,
        message: "缺少参数：startMs",
        details: nil
      )
      return
    }
    guard let endMs = Self.argInt64(args, "endMs") else {
      reply.failure(
        code: Self.errorDeviceData,
        message: "缺少参数：endMs",
        details: nil
      )
      return
    }
    if endMs < startMs {
      reply.failure(
        code: Self.errorDeviceData,
        message: "endMs 不能早于 startMs",
        details: nil
      )
      return
    }
    let notes = Self.argString(args, "description")
    let location = Self.argString(args, "location")
    let eventId = Self.argString(args, "eventId")

    ioQueue.async { [weak self] in
      guard let self = self else { return }
      guard self.hasOsPermission(.calendarWrite) else {
        reply.failure(
          code: Self.errorPermissionDenied,
          message: "缺少系统权限：日历（能力 calendar_write）",
          details: nil
        )
        return
      }

      let event: EKEvent
      if let eventId = eventId {
        // ⚠️ iOS 17 起 eventWithIdentifier 被改名成 event(withIdentifier:)，
        // 旧名**仍然可用**（只是弃用告警）⇒ ⇒ 用旧名，兼容 iOS 13 的部署目标。
        guard let existing = self.eventStore.eventWithIdentifier(eventId) else {
          reply.failure(
            code: Self.errorDeviceData,
            message: "没有这条事件：\(eventId)",
            details: nil
          )
          return
        }
        event = existing
      } else {
        // 新建 ⇒ 必须先挑一个**可写**的日历，否则系统会直接拒绝。
        guard let calendar = self.writableCalendar() else {
          reply.failure(
            code: Self.errorDeviceData,
            message: "没有找到可写的日历",
            details: nil
          )
          return
        }
        event = EKEvent(eventStore: self.eventStore)
        event.calendar = calendar
      }

      event.title = title
      event.startDate = Date(timeIntervalSince1970: Double(startMs) / 1000.0)
      event.endDate = Date(timeIntervalSince1970: Double(endMs) / 1000.0)
      if let notes = notes { event.notes = notes }
      if let location = location { event.location = location }

      do {
        // ⚠️ commit 参数在 iOS 17 起被弃用（改动会自动提交）
        // ⇒ ⇒ 但旧签名在所有版本上**都还在** ⇒ ⇒ 用它最稳。
        try self.eventStore.save(event, span: .thisEvent, commit: true)
      } catch {
        reply.failure(
          code: Self.errorDeviceData,
          message: "写入日历失败：\(error.localizedDescription)",
          details: nil
        )
        return
      }

      var row: [String: Any] = [
        "id": event.eventIdentifier ?? "",
        "title": title,
        "startMs": startMs,
        "endMs": endMs,
        "allDay": false,
      ]
      if let notes = notes { row["description"] = notes }
      if let location = location { row["location"] = location }
      reply.success(row)
    }
  }

  /// 挑一个**可写**的日历。
  ///
  /// ⚠️ 不能随手挑：iOS 的日历有访问级别（只读 / 可写）⇒ ⇒
  /// 选到一个只读的 ⇒ save 会直接抛异常。
  private func writableCalendar() -> EKCalendar? {
    for calendar in eventStore.calendars(for: .event) {
      if calendar.allowsContentModifications { return calendar }
    }
    return nil
  }

  // MARK: - 通讯录

  private func readContacts(args: [String: Any], reply: SingleReply) {
    let query = Self.argString(args, "query")?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let limit = Self.normalizedLimit(
      Self.argInt(args, "limit"),
      fallback: Self.defaultLimit,
      ceiling: Self.maxLimit
    )

    ioQueue.async { [weak self] in
      guard let self = self else { return }
      guard self.hasOsPermission(.contacts) else {
        reply.failure(
          code: Self.errorPermissionDenied,
          message: "缺少系统权限：联系人（能力 contacts）",
          details: nil
        )
        return
      }

      // ⚠️ **必须用 descriptorForRequiredKeys** ——
      // CNContactFormatter 在缺 key 时是**抛异常**（不是返回 nil）
      // ⇒ ⇒ 手工列 key 不够。
      let keys: [CNKeyDescriptor] = [
        CNContactIdentifierKey as CNKeyDescriptor,
        CNContactFormatter.descriptorForRequiredKeys(for: .fullName),
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
      ]
      let request = CNContactFetchRequest(keysToFetch: keys)
      if let query = query, !query.isEmpty {
        // ⚠️ CONTAINS[cd] = 不区分大小写 + 忽略音标
        // ⇒ ⇒ 与 Android 侧「SQL 粗筛 + Kotlin 精确判一次」的效果对得上。
        request.predicate = NSPredicate(
          format: "(%K CONTAINS[cd] %@) OR (%K CONTAINS[cd] %@)",
          CNContactGivenNameKey,
          query,
          CNContactFamilyNameKey,
          query
        )
      }
      request.sortOrder = .userDefault

      var out: [[String: Any]] = []
      do {
        try self.contactStore.enumerateContacts(with: request) { contact, _ in
          if out.count >= limit { return }
          let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
          let phones = contact.phoneNumbers.map { $0.value.stringValue }
          out.append([
            "id": contact.identifier,
            "name": name,
            "phones": phones,
          ])
        }
      } catch {
        reply.failure(
          code: Self.errorDeviceData,
          message: "读取通讯录失败：\(error.localizedDescription)",
          details: nil
        )
        return
      }
      reply.success(out)
    }
  }

  // MARK: - 相册

  private func readPhotos(args: [String: Any], reply: SingleReply) {
    let limit = Self.normalizedLimit(
      Self.argInt(args, "limit"),
      fallback: 30,
      ceiling: Self.maxLimit
    )

    ioQueue.async { [weak self] in
      guard let self = self else { return }
      guard self.hasOsPermission(.photos) else {
        reply.failure(
          code: Self.errorPermissionDenied,
          message: "缺少系统权限：相册（能力 photos）",
          details: nil
        )
        return
      }

      let options = PHFetchOptions()
      options.sortDescriptors = [
        NSSortDescriptor(key: "creationDate", ascending: false)
      ]
      let assets = PHAsset.fetchAssets(with: .image, options: options)

      var out: [[String: Any]] = []
      assets.enumerateObjects { asset, _, stop in
        if out.count >= limit {
          stop.pointee = true
          return
        }
        // ⚠️ **只取元数据，不取像素** —— 像素进模型上下文既没意义又贵。
        // PHAssetResource 只给**文件名与大小**，不加载图像数据。
        let resources = PHAssetResource.assetResources(for: asset)
        let date = asset.creationDate ?? asset.modificationDate ?? Date()
        var row: [String: Any] = [
          "id": asset.localIdentifier,
          "dateMs": Int(date.timeIntervalSince1970 * 1000.0),
          "sizeBytes": resources.first?.fileSize ?? 0,
          "width": asset.pixelWidth,
          "height": asset.pixelHeight,
          // ⚠️ iOS 没有 content:// 那种 URI ⇒ ⇒ 这里给的是 PHAsset 的
          // localIdentifier（ph:// 只是个标记前缀）⇒ ⇒ 真要取像素
          // 得走 PHImageManager。
          "contentUri": "ph://\(asset.localIdentifier)",
        ]
        if let filename = resources.first?.originalFilename {
          row["title"] = filename
        }
        out.append(row)
      }
      reply.success(out)
    }
  }

  // MARK: - 小工具

  private static func capability(from args: [String: Any]) -> Capability? {
    guard let raw = args["capability"] as? String else { return nil }
    return Capability(rawValue: raw)
  }

  private static func argString(_ args: [String: Any], _ key: String) -> String? {
    return args[key] as? String
  }

  private static func argInt(_ args: [String: Any], _ key: String) -> Int? {
    return (args[key] as? NSNumber)?.intValue
  }

  private static func argInt64(_ args: [String: Any], _ key: String) -> Int64? {
    return (args[key] as? NSNumber)?.int64Value
  }

  private static func normalizedLimit(
    _ raw: Int?,
    fallback: Int,
    ceiling: Int
  ) -> Int {
    let value = raw ?? fallback
    return min(max(value, 1), ceiling)
  }

  // MARK: - 只交付一次的结果

  /// **只允许交付一次**的结果包装器。
  ///
  /// ⚠️ 为什么需要它：Flutter 的 FlutterResult **只能调用一次**
  /// ⇒ ⇒ 这条链路上「抛异常」和「回错误」都可能发生 ⇒ ⇒ 必须有一道
  /// 「只算第一次」的闸，否则极端情况下会出现两个终态。
  ///
  /// ⚠️ 而且**必须切到主线程**交付 —— Flutter 的 FlutterResult 底层是
  /// BinaryMessenger.send（官方标注 @UiThread）。
  private final class SingleReply {
    private let delegate: FlutterResult
    private let lock = NSLock()
    private var delivered = false

    init(_ delegate: @escaping FlutterResult) {
      self.delegate = delegate
    }

    func success(_ value: Any?) {
      guard claim() else { return }
      Self.onMain { self.delegate(value) }
    }

    func failure(code: String, message: String, details: Any?) {
      guard claim() else { return }
      let error = FlutterError(code: code, message: message, details: details)
      Self.onMain { self.delegate(error) }
    }

    private func claim() -> Bool {
      lock.lock()
      defer { lock.unlock() }
      if delivered { return false }
      delivered = true
      return true
    }

    private static func onMain(_ block: @escaping () -> Void) {
      if Thread.isMainThread {
        block()
      } else {
        DispatchQueue.main.async(execute: block)
      }
    }
  }
}
