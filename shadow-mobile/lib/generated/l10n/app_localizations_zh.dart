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
  String get waitingForWifiHint => '已选择等待 WiFi，连上后会自动开始下载。';

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
  String get continueDesktopTitle => '在桌面端继续';

  @override
  String get continueDesktopDescription =>
      '选择一个桌面端节点，把当前对话交接过去。音频和 TTS 保留在手机上，推理移动到桌面端。';

  @override
  String get continueDesktopConfirm => '开始交接';

  @override
  String get continueDesktopNoPeers => '未发现桌面端节点。请确认桌面端已启动且在同一网络。';

  @override
  String get continueDesktopProvider => '桌面端节点';

  @override
  String continueDesktopMessageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 条消息',
      one: '1 条消息',
      zero: '暂无消息',
    );
    return '$_temp0';
  }

  @override
  String continueDesktopSizeKb(int size) {
    return '$size KB';
  }

  @override
  String get continueDesktopPreparing => '正在准备交接...';

  @override
  String continueDesktopInProgress(String peer) {
    return '正在交接至 $peer...';
  }

  @override
  String continueDesktopSuccess(String peer) {
    return '与 $peer 的交接完成。请在桌面端打开对话。';
  }

  @override
  String continueDesktopError(String message) {
    return '交接失败：$message';
  }

  @override
  String get addManually => '手动添加';

  @override
  String get confirm => '确认';

  @override
  String get telencephalonFlows => '端脑流程';

  @override
  String get active => '活跃';

  @override
  String get drafts => '草稿';

  @override
  String get liveStreamMode => '直播模式';

  @override
  String get audioOutput => '音频输出';

  @override
  String get routePhoneSpeaker => '手机扬声器';

  @override
  String get routeBluetoothHeadset => '蓝牙';

  @override
  String get routeShadowEsp32 => 'shadow-esp32';

  @override
  String get shadowEsp32ReceivesAudio => 'shadow-esp32 正在接收音频';

  @override
  String get routeViaBluetoothA2dp => '通过蓝牙';

  @override
  String get routeViaPhoneSpeaker => '通过手机扬声器';

  @override
  String get modeMismatch => '当前模式与此页面不匹配。点击右上角麦克风图标切换到语音模式。';

  @override
  String get ttsInputLabel => '朗读文本';

  @override
  String get ttsInputHint => '输入数字人要说的话…';

  @override
  String get startTts => '开始';

  @override
  String get stopTts => '停止';

  @override
  String routeSelected(String device) {
    return '输出: $device';
  }

  @override
  String get digitalHumanTtsNow => '直播模式';

  @override
  String get shadowEsp32PlayingFromUsbAudio => 'shadow-esp32 已通过 USB Audio 连接';

  @override
  String get customerServiceMode => '智能客服';

  @override
  String get callState => '通话状态';

  @override
  String get callStateIdle => '待机';

  @override
  String get callStateRinging => '响铃';

  @override
  String get callStateActive => '通话中';

  @override
  String get callStateEnded => '已结束';

  @override
  String get earphoneTakeoverActive => '检测到有线耳机 — 音频已切到耳机，便于人接管。';

  @override
  String get earphoneTakeoverAudioRouteNote =>
      '耳机插入时，通话音频自动切到耳机；拔出后自动切回 shadow-esp32。';

  @override
  String get aiAutoAnswer => 'AI 自动应答';

  @override
  String get aiAutoAnswerDesc => '自动接听来电并用 LLM 自动回复（端脑 / LiteRT）。';

  @override
  String get endCall => '挂断';

  @override
  String get openLiveStreamMode => '直播模式';

  @override
  String get openVoiceAssistant => '语音助手';

  @override
  String get customerServiceHint =>
      'AI 会自动接听电话并回复。shadow-esp32 播放来电方语音和 AI 回复。插入耳机后自动切到耳机。';

  @override
  String get visualQaPickCamera => '请选择摄像头';

  @override
  String visualQaPicked(Object label) {
    return '已选择 $label';
  }

  @override
  String get modelBindingPromptTitle => '先绑定模型再继续';

  @override
  String get modelBindingPromptGoSettings => '请先到设置页绑定模型';

  @override
  String get modelBindingPromptLater => '稍后';

  @override
  String get conversationNewSession => '新会话';

  @override
  String get conversationManagement => '会话管理';

  @override
  String get conversationEmpty => '暂无会话';

  @override
  String get conversationEmptyHint => '点击右下角开始新对话';

  @override
  String get conversationNewChat => '新对话';

  @override
  String get conversationTitleField => '对话标题';

  @override
  String get conversationCreate => '创建';

  @override
  String get commonConfirmDelete => '确认删除';

  @override
  String get commonDelete => '删除';

  @override
  String get discoveryTitle => '设备发现';

  @override
  String get discoveryScanning => '正在扫描网络设备...';

  @override
  String get discoveryNoDevices => '未发现设备';

  @override
  String get discoveryNoDevicesHint => '点击右上角刷新按钮重新扫描';

  @override
  String get discoveryAddManually => '手动添加设备';

  @override
  String get commonHostAddress => '主机地址';

  @override
  String get commonPort => '端口';

  @override
  String get discoveryDeviceNameOptional => '设备名称（可选）';

  @override
  String get commonAdd => '添加';

  @override
  String get discoveryActive => '活跃';

  @override
  String get discoverySetActive => '设为活跃';

  @override
  String get commonRemove => '移除';

  @override
  String get commonClearFilters => '清除筛选';

  @override
  String get navChat => '对话';

  @override
  String get navLive => '直播';

  @override
  String get navService => '客服';

  @override
  String get navTasks => '任务';

  @override
  String get navManage => '管理';

  @override
  String get navSettings => '设置';

  @override
  String get logsTelencephalonStarted => '端脑服务启动成功';

  @override
  String get logsDbTimeoutRetry => '数据库连接超时，正在重试...';

  @override
  String get logsHippocampusUnreachable => '无法连接到Hippocampus服务';

  @override
  String get logsTitle => '系统日志';

  @override
  String get logsClearFilter => '清除过滤';

  @override
  String get logsClearAll => '清除日志';

  @override
  String get logsClearConfirm => '确定要清除所有日志吗？';

  @override
  String get logsClear => '清除';

  @override
  String get logsEmpty => '暂无日志';

  @override
  String get logsNoMatch => '无匹配日志';

  @override
  String get logsCopied => '已复制到剪贴板';

  @override
  String get mcpTitle => 'MCP 服务管理';

  @override
  String get mcpAddServer => '添加服务器';

  @override
  String get mcpEmpty => '暂无 MCP 服务器';

  @override
  String get mcpEmptyHint => '点击右下角添加服务器';

  @override
  String get mcpAddServerTitle => '添加 MCP 服务器';

  @override
  String get commonName => '名称';

  @override
  String get mcpServerUrl => '服务器 URL';

  @override
  String get mcpAuthTokenOptional => '认证 Token (可选)';

  @override
  String get memoryEmpty => '暂无记忆';

  @override
  String get modelEngineRunning => '引擎运行中';

  @override
  String get modelEngineStopped => '引擎未运行';

  @override
  String get modelEmpty => '暂无模型';

  @override
  String get modelEmptyHint => '点击右下角添加模型';

  @override
  String get modelTypeLabel => '类型:';

  @override
  String get commonAll => '全部';

  @override
  String get modelLiteRtEngine => 'LiteRT 引擎';

  @override
  String get modelInternalService => '内部服务 (Rust)';

  @override
  String get modelCloudProvider => '云端供应商';

  @override
  String get modelNoCloudModels => '暂无云端模型';

  @override
  String get modelNoCloudModelsHint => '点击右下角添加云端模型';

  @override
  String get modelAddLocalTitle => '添加本地模型';

  @override
  String get modelNameField => '模型名称';

  @override
  String get modelPathField => '模型路径';

  @override
  String get modelSizeField => '大小 (MB)';

  @override
  String get modelAddCloudTitle => '添加云端模型';

  @override
  String get commonApiKeyOptional => 'API Key (可选)';

  @override
  String get modelNameOptional => '模型名称 (可选)';

  @override
  String get modelSettingsTitle => '模型设置';

  @override
  String get modelSettingsEngine => '推理引擎';

  @override
  String get modelSettingsSelectModel => '选择模型';

  @override
  String get promptSaved => '提示词已保存';

  @override
  String get promptRestored => '已恢复默认提示词';

  @override
  String get promptSettingsTitle => '提示词设置';

  @override
  String get commonSave => '保存';

  @override
  String get promptMainAgentLabel => '主Agent系统提示词';

  @override
  String get promptInputHint => '输入系统提示词...';

  @override
  String get promptRestoreDefault => '恢复默认';

  @override
  String get providerQwen => '通义千问';

  @override
  String get providerZhipu => '智谱AI';

  @override
  String get providerLocalModel => '本地模型';

  @override
  String get providersTitle => '大模型服务提供商';

  @override
  String get providersEmpty => '暂未配置提供商';

  @override
  String get providersEmptyHint => '点击右下角添加第一个提供商';

  @override
  String get providersAdd => '添加提供商';

  @override
  String get commonEdit => '编辑';

  @override
  String get providersEditTitle => '编辑提供商';

  @override
  String get commonProvider => '提供商';

  @override
  String get commonApiAddress => 'API 地址';

  @override
  String get commonModel => '模型';

  @override
  String get providersApiKeyRequired => '请输入 API Key';

  @override
  String get resonanceNotConnected => '未连接';

  @override
  String get resonanceConnecting => '连接中';

  @override
  String get resonanceConnected => '已连接';

  @override
  String get resonanceError => '错误';

  @override
  String get resonanceLocal => '本地Resonance';

  @override
  String get resonanceTitle => 'Resonance管理';

  @override
  String get resonanceEmpty => '暂无Resonance实例';

  @override
  String get resonanceAddInstance => '添加实例';

  @override
  String get resonanceAddTitle => '添加Resonance实例';

  @override
  String get resonanceInstanceName => '实例名称';

  @override
  String get resonanceApiKeyOptional => 'API密钥（可选）';

  @override
  String get resonanceEditTitle => '编辑Resonance实例';

  @override
  String get resonancePrimary => '主实例';

  @override
  String get resonanceSetPrimary => '设为主实例';

  @override
  String get resonanceTestConnection => '测试连接';

  @override
  String get settingsMemoryUsage => '内存使用';

  @override
  String get settingsDeviceDiscovery => '设备发现';

  @override
  String get settingsDeviceDiscoveryDesc => '扫描和发现网络设备';

  @override
  String get settingsLogsDesc => '查看应用日志和错误信息';

  @override
  String get settingsResonanceDesc => '管理Resonance服务实例';

  @override
  String get settingsRefreshStatus => '刷新状态';

  @override
  String get skillsTitle => '技能管理';

  @override
  String get skillsEmpty => '暂无技能';

  @override
  String get skillsEmptyHint => '点击右下角添加自定义技能';

  @override
  String get skillsBuiltIn => '内置技能';

  @override
  String get skillsCustom => '自定义技能';

  @override
  String get skillsAddCustom => '添加自定义技能';

  @override
  String get skillsNameField => '技能名称';

  @override
  String get commonDescription => '描述';

  @override
  String get soulSaved => 'Soul 已保存';

  @override
  String get soulTitle => 'Soul 设置';

  @override
  String get soulSubtitle => 'Soul - 你的个人助理灵魂';

  @override
  String get soulDescHint => '描述你的个人助理的性格、习惯和偏好。';

  @override
  String get soulVersionHistory => '版本历史';

  @override
  String get soulNoHistory => '暂无版本历史';

  @override
  String get soulUserModified => '用户修改';

  @override
  String get soulAgentReview => 'Agent 评估';

  @override
  String get soulNoReason => '无原因';

  @override
  String get soulChangeReason => '修改原因';

  @override
  String get soulConversationSummary => '对话摘要';

  @override
  String get soulContent => '内容';

  @override
  String get taskBoardTitle => '任务看板';

  @override
  String get taskStatusBacklog => '待规划';

  @override
  String get taskStatusTodo => '待办';

  @override
  String get taskStatusInProgress => '进行中';

  @override
  String get taskStatusDone => '已完成';

  @override
  String get taskStatusFailed => '失败';

  @override
  String get taskStatusCancelled => '已取消';

  @override
  String get taskRetry => '重试';

  @override
  String get taskEmpty => '暂无任务';

  @override
  String get taskAdd => '添加任务';

  @override
  String get taskTitleField => '任务标题';

  @override
  String get taskPriority => '优先级';

  @override
  String get priorityLow => '低';

  @override
  String get priorityMedium => '中';

  @override
  String get priorityHigh => '高';

  @override
  String get priorityUrgent => '紧急';

  @override
  String get taskEditTitle => '编辑任务';

  @override
  String get taskStatus => '状态';

  @override
  String get taskTagsField => '标签 (逗号分隔)';

  @override
  String get taskEditPersistenceNote => '端脑任务：状态随时可改；标题、描述、优先级与标签只在创建时写入。';

  @override
  String get taskDueTime => '截止时间';

  @override
  String get taskDueTimeField => '截止时间';

  @override
  String get taskDueTimeHint => '可留空。支持「明天下午3点」这类相对时间。';

  @override
  String get taskConfirmationPoints => '确认点';

  @override
  String get taskNoConfirmationPoints => '此任务暂无确认点';

  @override
  String get taskConfirmState => '确认状态';

  @override
  String get taskConfirmed => '已确认';

  @override
  String get taskAwaitingConfirm => '待确认';

  @override
  String get taskConfirmAction => '确认任务';

  @override
  String get taskOverview => '概览';

  @override
  String get taskLogs => '日志';

  @override
  String get commonRefresh => '刷新';

  @override
  String get taskCreatedAt => '创建时间';

  @override
  String get taskCompletedAt => '完成时间';

  @override
  String get taskTags => '标签';

  @override
  String get taskNoSubtasks => '此任务暂无子任务';

  @override
  String get taskSubtaskProgress => '子任务进度';

  @override
  String get logsTab => '日志';

  @override
  String get logsBackend => '后端';

  @override
  String get logsApp => '应用';

  @override
  String get logsDevice => '本机组件';

  @override
  String get logsAllLevels => '所有级别';

  @override
  String get logsExport => '导出日志';

  @override
  String get logsPanelClearAll => '清空日志';

  @override
  String get soulPriorityNote => 'System Prompt 优先级最高。';

  @override
  String commonLoadFailed(String error) {
    return '读取失败: $error';
  }

  @override
  String commonErrorDetail(String error) {
    return '错误: $error';
  }

  @override
  String commonDeleteConfirmNamed(String name) {
    return '确定要删除 \"$name\" 吗？';
  }

  @override
  String commonDeleteFailed(String error) {
    return '删除失败: $error';
  }

  @override
  String commonMinutesAgo(int count) {
    return '$count 分钟前';
  }

  @override
  String commonHoursAgo(int count) {
    return '$count 小时前';
  }

  @override
  String commonDaysAgo(int count) {
    return '$count 天前';
  }

  @override
  String settingsMemUsed(int mb) {
    return '已用: $mb MB';
  }

  @override
  String settingsMemTotal(int mb) {
    return '总计: $mb MB';
  }

  @override
  String settingsMemFree(int mb) {
    return '空闲: $mb MB';
  }

  @override
  String settingsMemUsage(String percent) {
    return '使用率: $percent%';
  }

  @override
  String get settingsPrefrontalEmbedded => '嵌入式 Prefrontal';

  @override
  String get settingsPrefrontalEmbeddedDesc => '管理嵌入在本 App 里的 Prefrontal 运行时';

  @override
  String get settingsEncephalonEmbedded => '嵌入式大脑';

  @override
  String get settingsEncephalonEmbeddedDesc =>
      '管理嵌入在本 App 里的 Encephalon 大脑运行时（推理 + 端脑面）';

  @override
  String taskSubtasks(int count) {
    return '子任务 ($count)';
  }

  @override
  String taskStepStarted(String time) {
    return '开始: $time';
  }

  @override
  String taskStepCompleted(String time) {
    return '完成: $time';
  }

  @override
  String taskStepDuration(int seconds) {
    return '耗时: ${seconds}s';
  }

  @override
  String taskStepProgress(int completed, int total) {
    return '$completed/$total 步';
  }

  @override
  String get soulDescHintExample => '例如：\n- 语气友好、简洁\n- 称呼用户为“你”\n- 主动提供有用的建议';

  @override
  String soulHistoryLoadFailed(String error) {
    return '无法加载历史: $error';
  }

  @override
  String soulVersion(int version) {
    return '版本 $version';
  }

  @override
  String logsFilterLabel(String level, String source) {
    return '过滤: $level $source';
  }

  @override
  String logsTotalCount(int count) {
    return '共 $count 条日志';
  }

  @override
  String logsShownCount(int count) {
    return '显示 $count 条';
  }

  @override
  String discoveryLastScan(String time) {
    return '上次扫描: $time';
  }

  @override
  String discoveryDeviceCount(int count) {
    return '发现 $count 个设备';
  }

  @override
  String resonanceLatency(int ms) {
    return '延迟: ${ms}ms';
  }

  @override
  String get modelNameExample => '例如: Qwen2.5-7B';

  @override
  String get cameraOff => '摄像头关闭';

  @override
  String get cameraReady => '摄像头就绪';

  @override
  String get cameraStreaming => '采集中...';

  @override
  String get cameraFlip => '翻转';

  @override
  String get cameraClose => '关闭';

  @override
  String get prefrontalEmbeddedTitle => 'Prefrontal 嵌入式运行时 (NDK)';

  @override
  String get prefrontalEmbeddedRuntime => '嵌入式运行时';

  @override
  String prefrontalPort(int port) {
    return '端口: $port';
  }

  @override
  String get prefrontalStart => '启动';

  @override
  String get prefrontalStop => '停止';

  @override
  String prefrontalAgentsCount(int count) {
    return '智能体 ($count)';
  }

  @override
  String get prefrontalRefresh => '刷新';

  @override
  String get prefrontalStartFirst => '请先启动服务';

  @override
  String get prefrontalNoAgentsHint => '暂无智能体, 添加一个吧:';

  @override
  String get prefrontalAddSampleAgent => '添加示例智能体';

  @override
  String get prefrontalInvokeTitle => '调用智能体 (JNI)';

  @override
  String get prefrontalInput => '输入';

  @override
  String get prefrontalInputHint => '输入要发送给智能体的内容...';

  @override
  String get prefrontalInvoke => '调用 (JNI)';

  @override
  String get prefrontalNoOutput => '(无输出)';

  @override
  String get prefrontalAboutTitle => '关于 NDK 嵌入方式';

  @override
  String get prefrontalAboutLine1 => '- Prefrontal 作为 .so 嵌入在 App 进程内';

  @override
  String get prefrontalAboutLine2 => '- 通过 JNI 与 Kotlin Service 通信';

  @override
  String get prefrontalAboutLine3 => '- 通过 localhost HTTP 与 Prefrontal 通信';

  @override
  String get prefrontalAboutLine4 => '- 服务生命周期与 App 绑定';

  @override
  String get prefrontalAboutLine5 => '- 不需要外部进程, 不会被杀';

  @override
  String get prefrontalAboutArchitecture => '架构:';

  @override
  String get prefrontalStartSuccess => '嵌入式运行时启动成功';

  @override
  String get prefrontalStartFailed => '启动失败';

  @override
  String prefrontalStartError(String error) {
    return '启动异常: $error';
  }

  @override
  String get prefrontalStopSuccess => '嵌入式运行时已停止';

  @override
  String get prefrontalStopFailed => '停止失败';

  @override
  String prefrontalStopError(String error) {
    return '停止异常: $error';
  }

  @override
  String get prefrontalAddSuccess => '添加成功';

  @override
  String get prefrontalAddFailed => '添加失败';

  @override
  String prefrontalAddError(String error) {
    return '添加异常: $error';
  }

  @override
  String get prefrontalInvokeSuccess => 'JNI 调用成功';

  @override
  String get prefrontalInvokeFailed => '调用失败';

  @override
  String prefrontalInvokeError(String error) {
    return '调用异常: $error';
  }

  @override
  String get prefrontalStatusStopped => '已停止';

  @override
  String get prefrontalStatusStarting => '启动中...';

  @override
  String get prefrontalStatusRunning => '运行中';

  @override
  String get prefrontalStatusStopping => '停止中...';

  @override
  String get prefrontalStatusError => '错误';

  @override
  String get prefrontalSampleAgentName => '示例智能体';

  @override
  String get prefrontalSampleAgentDesc => '通过 JNI 注册的示例智能体';

  @override
  String prefrontalErrorPrefix(String error) {
    return '错误: $error';
  }

  @override
  String get chatGreeting => '你好，我是Shadow，有什么可以帮你的吗？';

  @override
  String get chatAttachmentNotAvailable => '端脑链路当前只处理纯文本，图片、文件等附件暂不支持';

  @override
  String get chatVoiceModelRequired => '语音功能需要先加载模型';

  @override
  String chatSorryError(String error) {
    return '抱歉，发生了错误: $error';
  }

  @override
  String get chatSorryErrorShort => '抱歉，发生了错误';

  @override
  String get modelPlaceholderNoLocal => '暂无本地模型';

  @override
  String get deviceThisMachine => '本机';

  @override
  String get actionFlashlightOn => '开启闪光灯';

  @override
  String get actionFlashlightOff => '关闭闪光灯';

  @override
  String actionCreateContact(String name) {
    return '创建联系人: $name';
  }

  @override
  String actionSendEmail(String to) {
    return '发送邮件到: $to';
  }

  @override
  String actionShowLocation(String query) {
    return '显示位置: $query';
  }

  @override
  String get actionOpenWifi => '打开WiFi设置';

  @override
  String actionCreateCalendar(String title) {
    return '创建日历事件: $title';
  }

  @override
  String get actionFlashlightOnDone => '闪光灯已开启';

  @override
  String actionFlashlightOnFailed(String error) {
    return '闪光灯开启失败: $error';
  }

  @override
  String get actionFlashlightOffDone => '闪光灯已关闭';

  @override
  String actionFlashlightOffFailed(String error) {
    return '闪光灯关闭失败: $error';
  }

  @override
  String actionCreatingContact(String name) {
    return '正在创建联系人: $name';
  }

  @override
  String get actionNoContactsApp => '无法打开联系人应用';

  @override
  String actionContactFailed(String error) {
    return '联系人创建失败: $error';
  }

  @override
  String actionEmailOpened(String to) {
    return '邮件客户端已打开，收件人: $to';
  }

  @override
  String get actionNoEmailApp => '无法打开邮件客户端';

  @override
  String actionEmailFailed(String error) {
    return '邮件发送失败: $error';
  }

  @override
  String actionShowingLocation(String query) {
    return '正在显示位置: $query';
  }

  @override
  String get actionNoMapsApp => '无法打开地图应用';

  @override
  String actionLocationFailed(String error) {
    return '位置显示失败: $error';
  }

  @override
  String get actionWifiOpened => 'WiFi设置已打开';

  @override
  String actionWifiFailed(String error) {
    return 'WiFi设置打开失败: $error';
  }

  @override
  String actionCalendarCreated(String title) {
    return '日历事件已创建: $title';
  }

  @override
  String get actionNoCalendarApp => '无法打开日历应用';

  @override
  String actionCalendarFailed(String error) {
    return '日历事件创建失败: $error';
  }

  @override
  String get encephalonStartFailed => '嵌入式大脑启动失败';

  @override
  String get encephalonNotRunning => '嵌入式大脑未运行';

  @override
  String get encephalonEmbeddedTitle => '嵌入式大脑运行时（NDK）';

  @override
  String get encephalonEmbeddedRuntime => '嵌入式大脑运行时';

  @override
  String encephalonPort(int port) {
    return '端口：$port';
  }

  @override
  String get encephalonStart => '启动大脑';

  @override
  String get encephalonStop => '停止大脑';

  @override
  String get encephalonStatusStopped => '已停止';

  @override
  String get encephalonStatusStarting => '启动中...';

  @override
  String get encephalonStatusRunning => '运行中';

  @override
  String get encephalonStatusStopping => '停止中...';

  @override
  String get encephalonStatusError => '错误';

  @override
  String get encephalonInferTitle => '进程内推理';

  @override
  String get encephalonInferHint =>
      '请求直接进入进程内 neuron 的 adapter 管线 —— 不走 socket，没有 CORS。';

  @override
  String get encephalonInferPrompt => '提示词';

  @override
  String get encephalonInferRun => '执行推理';

  @override
  String get encephalonInferFailed => '推理失败';

  @override
  String get encephalonModelSourceTitle => '大脑模型来源';

  @override
  String get encephalonModelSourceHint =>
      '全局默认：各叶区都用这个来源。也可以在下面的「叶区模型路由」里单独覆盖某个叶区。';

  @override
  String get encephalonModelLocalNeuron => '本地 neuron 权重';

  @override
  String get encephalonModelCloud => '云端供应商';

  @override
  String get encephalonModelNoCloudProvider => '还没有配置云端供应商 —— 先去「模型管理」加一个。';

  @override
  String get encephalonModelSourceApplied => '已应用新的模型来源';

  @override
  String get encephalonModelSourceFailed => '模型来源切换失败';

  @override
  String get encephalonLobeRoutingTitle => '叶区模型路由';

  @override
  String get encephalonLobeRoutingHint =>
      '模型使用的最小单位是叶区。默认各叶区跟随上面的全局来源，可以单独覆盖某一个叶区 —— 比如前额叶用本地、实际执行任务的区域用云端。';

  @override
  String get encephalonLobeRoutingUnavailable => '读不到端脑的叶区列表 —— 大脑可能没在跑。';

  @override
  String get encephalonLobeRoutingRefresh => '刷新叶区';

  @override
  String get encephalonLobeFollowGlobal => '跟随全局';

  @override
  String get encephalonLobeRoutingApplied => '叶区模型已更新';

  @override
  String get encephalonLobeRoutingFailed => '叶区模型更新失败';

  @override
  String get encephalonLobeEffectiveLocal => '当前：本地 neuron 权重';

  @override
  String encephalonLobeEffectiveCloud(String name) {
    return '当前：$name';
  }

  @override
  String get settingsAppearance => '外观';

  @override
  String get settingsThemeColor => '主题色';

  @override
  String get settingsThemeColorHint => '影子本身没有颜色 —— 挑一个属于你的光。';

  @override
  String get settingsGlassIntensity => '玻璃强度';

  @override
  String get settingsGlassOff => '关闭';

  @override
  String get settingsGlassFull => '全强度';

  @override
  String get settingsDialogBackground => '对话框背景';

  @override
  String get settingsFollowTheme => '跟随主题';

  @override
  String get settingsSurfaceDeep => '深';

  @override
  String get settingsSurfaceLight => '浅';

  @override
  String get settingsSurfaceNeutral => '中性';

  @override
  String get settingsSurfaceInk => '墨';

  @override
  String get appearanceAccentNeutral => '中性';

  @override
  String get appearanceAccentSlate => '石板';

  @override
  String get appearanceAccentIndigo => '靛蓝';

  @override
  String get appearanceAccentCyan => '月青';

  @override
  String get appearanceAccentEmerald => '竹青';

  @override
  String get appearanceAccentAmber => '琥珀';

  @override
  String get appearanceAccentRose => '绛';

  @override
  String get surfaceChat => '对话';

  @override
  String get surfaceConversations => '对话记录';

  @override
  String get surfaceVoice => '语音对话';

  @override
  String get surfaceLivestream => '直播';

  @override
  String get surfaceCustomerService => '智能客服';

  @override
  String get surfaceTasks => '任务';

  @override
  String get surfaceGroup => '群组';

  @override
  String get surfaceDocument => '文档';

  @override
  String get surfacePreviews => '预览';

  @override
  String get surfaceAgents => '智能体';

  @override
  String get surfaceModels => '模型';

  @override
  String get surfaceModelDownload => '模型下载';

  @override
  String get surfaceModelOnboarding => '模型引导';

  @override
  String get surfaceModelSettings => '模型设置';

  @override
  String get surfaceProviders => '提供商';

  @override
  String get surfaceMcp => 'MCP 工具';

  @override
  String get surfaceSkills => '技能';

  @override
  String get surfaceMemory => '记忆';

  @override
  String get surfacePromptSettings => '提示词';

  @override
  String get surfaceFlows => '流程';

  @override
  String get surfaceWorkflowStudio => '编排';

  @override
  String get surfaceComputerUse => '电脑操作';

  @override
  String get surfaceJdmEditor => '规则编辑器';

  @override
  String get surfaceProvisioning => '设备配网';

  @override
  String get surfaceDiscovery => '设备发现';

  @override
  String get surfaceLogs => '日志';

  @override
  String get surfaceTrace => '追踪';

  @override
  String get surfaceResonance => 'Resonance';

  @override
  String get surfaceTelencephalon => '端脑';

  @override
  String get surfaceSettings => '设置';

  @override
  String get surfaceSetup => '初始设置';

  @override
  String get surfacePrefrontalEmbedded => '嵌入式前额叶';

  @override
  String get navSectionConverse => '对话与表达';

  @override
  String get navSectionWork => '任务与产出';

  @override
  String get navSectionCapability => '能力';

  @override
  String get navSectionMore => '更多';

  @override
  String get navTabChat => '对话';

  @override
  String get navTabTasks => '任务';

  @override
  String get navTabCapability => '能力';

  @override
  String get navTabMe => '我';

  @override
  String get settingsGroupAppearance => '外观';

  @override
  String get settingsGroupVoice => '语音与辅助';

  @override
  String get settingsGroupRuntime => '运行时';

  @override
  String get settingsGroupConnections => '连接';

  @override
  String get settingsGroupAdvanced => '高级';

  @override
  String get settingsGroupAdvancedDesc => '不常用与开发者选项';

  @override
  String get identityTitle => '身份';

  @override
  String get identityTitleDesc => '这台设备是谁，读写哪一份记忆';

  @override
  String get identityCurrentTitle => '当前是谁';

  @override
  String get identityCurrentDesc => '租户由端脑说了算 —— 它报出的人格就是记忆的隔离单元。';

  @override
  String get identityPrincipal => '人';

  @override
  String get identityPersona => '人格';

  @override
  String get identityDevice => '设备';

  @override
  String get identityTenant => '记忆桶';

  @override
  String get identityNobody => '（背后没有人）';

  @override
  String get identityExportTitle => '导出账号';

  @override
  String get identityExportDesc => '把账号密钥拿出来，拿到另一台设备导入 —— 两端就是同一个人、写进同一份记忆。';

  @override
  String get identityExportAction => '导出账号密钥';

  @override
  String get identityExportActionDesc => '账号密钥就是身份本身 —— 持有它的人就是那个人。';

  @override
  String get identityExportFailed => '导出失败 —— 大脑可能还没起来。';

  @override
  String get identityImportTitle => '导入账号';

  @override
  String get identityImportDesc => '贴入另一台设备导出的账号密钥 —— 这台设备从此是那个人。';

  @override
  String get identityImportAction => '导入它';

  @override
  String get identityImportActionDesc => '导入立即生效，不用重启大脑。';

  @override
  String get identityImportPlaceholder => '账号密钥';

  @override
  String get identityImportFailed => '导入失败 —— 密钥不合法，或者端脑拒绝了。';

  @override
  String get identityImportDone => '导入完成 —— 这台设备现在是那个人了。';

  @override
  String get identityCopy => '复制';

  @override
  String get identityCopied => '已复制到剪贴板';

  @override
  String get settingsAdvancedLogs => '日志';

  @override
  String get settingsAdvancedBackend => '端脑后端地址';

  @override
  String get settingsAdvancedBackendDesc => '覆盖移动端使用的端脑基础地址与管理员令牌。';

  @override
  String get settingsBackendAdminTokenHint => '留空则用内嵌端脑那把（外部端脑需自行填写）';

  @override
  String get settingsDangerZone => '危险操作';

  @override
  String get settingsDangerZoneDesc => '这些操作不可撤销，请谨慎使用。';

  @override
  String get resetEngineDesc => '重新初始化引擎';

  @override
  String get resetEngineConfirmDesc => '重置会重新初始化运行时，未保存的会话将丢失。此操作不可撤销。';

  @override
  String get resetEngineConfirm => '重置';

  @override
  String get telencephalonFlowsDesc => '浏览并运行端脑流程';

  @override
  String get settingsThemeModeLight => '浅色';

  @override
  String get settingsThemeModeDark => '深色';

  @override
  String get settingsDialogBackgroundDesc => '覆盖对话框与面板的底色。';

  @override
  String get surfaceA2ui => '生成式界面';

  @override
  String get surfaceIdentity => '身份';

  @override
  String get agent2uiNoConnection => '未连接到端脑';

  @override
  String get agent2uiWaiting => '正在连接端脑…';

  @override
  String get agent2uiNoSurface => '已连接，但端脑这次没有给出界面';

  @override
  String get agent2uiSurfaceHint => '端脑把界面画出来后会显示在这里';

  @override
  String get ttsEngineRust => 'Rust';

  @override
  String get settingsAdvancedLegacy => '遗留运行时';

  @override
  String logsExported(String path) {
    return '日志已导出到 $path';
  }
}
