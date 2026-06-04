// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => '影';

  @override
  String get models => '模型';

  @override
  String get settings => '设置';

  @override
  String get startConversation => '开始对话';

  @override
  String get addLocalModelComingSoon => '添加本地模型对话框即将推出';

  @override
  String get askSomething => '输入内容…';

  @override
  String get initializing => '初始化中…';

  @override
  String get modelInfo => '模型信息';

  @override
  String get resetEngine => '重置引擎';

  @override
  String get reinitializeMnn => '重新初始化 MNN 引擎';

  @override
  String get theme => '主题';

  @override
  String get accessibilityControl => '无障碍控制';

  @override
  String get accessibilityOn => '已开启，可控制设备点击/滑动';

  @override
  String get accessibilityOff => '未开启，点击进入设置';

  @override
  String get addModel => '添加模型';

  @override
  String get addLocalModel => '添加本地模型';

  @override
  String get addCloudModel => '添加云端模型';

  @override
  String get searchModels => '搜索模型…';

  @override
  String get filterAll => '全部';

  @override
  String get filterText => '文本';

  @override
  String get filterVision => '视觉';

  @override
  String get filterAudio => '音频';

  @override
  String get filterLocal => '本地';

  @override
  String get filterCloud => '云端';

  @override
  String get local => '本地';

  @override
  String get cloud => '云端';

  @override
  String get loaded => '已加载';

  @override
  String get notLoaded => '未加载';

  @override
  String get modelSettings => '模型设置';

  @override
  String threadCount(int n) {
    return '线程数：$n';
  }

  @override
  String get backendType => '后端类型';

  @override
  String get cpu => 'CPU';

  @override
  String get opencl => 'OpenCL';

  @override
  String get metal => 'Metal';

  @override
  String get modelPath => '模型路径';

  @override
  String get cancel => '取消';

  @override
  String get apply => '应用';

  @override
  String get noModels => '暂无模型';

  @override
  String get addModelToGetStarted => '添加模型以开始使用';

  @override
  String get cloudModel => '云端模型';

  @override
  String get endpoint => '端点';

  @override
  String get model => '模型';

  @override
  String get apiKey => 'API 密钥';

  @override
  String get notSet => '未设置';

  @override
  String get configureCloudModel => '配置云端模型';

  @override
  String get apiEndpoint => 'API 端点';

  @override
  String get save => '保存';

  @override
  String get cloudModelSettings => '云端模型设置';

  @override
  String get provider => '提供商';

  @override
  String get modelInfoNotInitialized => '未初始化';

  @override
  String get modelLoaded => '模型已加载';

  @override
  String get desktopMode => '桌面模式（仅 Android）';

  @override
  String get errorMnnInitFailed => 'MNN 引擎初始化失败';

  @override
  String get initializingMnn => '正在初始化 MNN 引擎…';

  @override
  String get mnnInitSuccess => 'MNN 引擎已初始化成功！\n模型已加载\n可以开始对话。';

  @override
  String errorGeneric(String detail) {
    return '错误：$detail';
  }

  @override
  String get desktopUnsupportedMessage =>
      'MNN 引擎仅在 Android 上可用。\n当前为桌面构建，本地 LLM 功能已禁用。\n您仍可使用云端模型。';

  @override
  String get mobileNetworkDetected => '检测到移动网络';

  @override
  String downloadOnMobile(String modelSize) {
    return '您正在使用移动数据。模型 ($modelSize) 将被下载。是否立即下载或等待 WiFi？';
  }

  @override
  String get waitForWifi => '等待 WiFi';

  @override
  String get downloadNow => '立即下载';

  @override
  String get gallery => '相册';

  @override
  String get camera => '相机';

  @override
  String get file => '文件';

  @override
  String get textMode => '消息模式';

  @override
  String get voiceMode => '对话模式';

  @override
  String get agent2uiReady => 'Agent2UI 就绪';

  @override
  String get askMeAnything => '问我任何问题，我会为您生成界面';

  @override
  String get connectedToShadowA2AServer => '已连接到 Shadow A2A 服务器';

  @override
  String get connectingToShadow => '正在连接 Shadow...';

  @override
  String get connectionError => '连接错误';

  @override
  String get disconnected => '已断开';

  @override
  String get connecting => '连接中...';

  @override
  String get disconnect => '断开连接';

  @override
  String get holdToRecord => '按住录音';

  @override
  String get recording => '录音中...';

  @override
  String get downloadComplete => '下载完成！';

  @override
  String get downloadFailed => '下载失败';

  @override
  String get retry => '重试';

  @override
  String get startChatting => '开始对话';

  @override
  String get manage => '管理';

  @override
  String get providers => '提供商';

  @override
  String get skills => '技能';

  @override
  String get agents => '代理';

  @override
  String get memory => '记忆';

  @override
  String get mcp => 'MCP';

  @override
  String get conversations => '会话';

  @override
  String get tasks => '任务';

  @override
  String get localModels => '本地模型';

  @override
  String get modelStore => '模型商店';

  @override
  String get noModelsAvailable => '暂无可用模型';

  @override
  String get serviceStatus => '服务状态';

  @override
  String get healthy => '正常';

  @override
  String get offline => '离线';

  @override
  String get checking => '检查中...';

  @override
  String get unhealthy => '异常';

  @override
  String get unknown => '未知';

  @override
  String get modelStoreUrlUpdated => '模型商店地址已更新';

  @override
  String get modelStoreServer => '模型商店服务器';

  @override
  String get custom => '自定义';

  @override
  String get defaultOption => '默认';

  @override
  String get liteRT => 'LiteRT';

  @override
  String get agent2UI => 'Agent2UI';

  @override
  String voiceInputPlaceholder(int count) {
    return '[语音输入：$count 采样]';
  }

  @override
  String get audioProcessingNotImplemented => '[这是一个占位响应。音频处理尚未实现。]';

  @override
  String get removeAttachment => '移除附件';

  @override
  String get webviewSkillNotImplemented => '[Webview 技能执行尚未实现]';

  @override
  String get nativeSkillNotImplemented => '[原生技能执行尚未实现]';

  @override
  String get dimensionUser => '用户';

  @override
  String get dimensionAgent => '代理';

  @override
  String get dimensionSession => '会话';

  @override
  String get dimensionResources => '资源';

  @override
  String score(String value) {
    return '评分：$value';
  }

  @override
  String get toDo => '待办';

  @override
  String get inProgress => '进行中';

  @override
  String get done => '已完成';

  @override
  String get welcomeMessage => '你好！我能听到你的声音。';

  @override
  String get tellMeStory => '给我讲个故事';

  @override
  String get whatCanYouHelp => '有什么可以帮助你的？';

  @override
  String get howAudioWorks => '音频输入是如何工作的？';

  @override
  String get ttsSettings => 'TTS 语音合成';

  @override
  String get ttsEngine => '语音引擎';

  @override
  String get ttsEngineAndroid => 'Android 内置';

  @override
  String get ttsEngineExternal => '外部服务';

  @override
  String get ttsStatus => '引擎状态';

  @override
  String get ttsReady => '就绪';

  @override
  String get ttsNotReady => '未就绪';

  @override
  String get ttsExternalUrl => '外部 TTS 服务地址';

  @override
  String get ttsExternalUrlHint => '输入外部 TTS API 地址';

  @override
  String get ttsTest => '测试朗读';

  @override
  String get ttsTestText => '你好，这是语音合成测试';

  @override
  String get continueDesktopTitle => '继续在桌面端';

  @override
  String get continueDesktopDescription => '将会话迁移到其他设备继续。';

  @override
  String get continueDesktopConfirm => '迁移';

  @override
  String get continueDesktopNoPeers => '未发现设备';

  @override
  String continueDesktopMessageCount(int count) => '$count 条消息';

  @override
  String continueDesktopSizeKb(int kb) => '$kb KB';

  @override
  String get continueDesktopPreparing => '准备中...';

  @override
  String continueDesktopInProgress(String peer) => '正在发送到 $peer...';

  @override
  String continueDesktopSuccess(String peer) => '已迁移到 $peer';

  @override
  String continueDesktopError(String error) => '迁移失败：$error';

  @override
  String get addManually => '手动添加';

  @override
  String get confirm => '确认';
}
