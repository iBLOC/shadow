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
  String get askSomething => '输入内容…';

  @override
  String get initializing => '初始化中…';

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
  String get searchModels => '搜索模型…';

  @override
  String get filterAll => '全部';

  @override
  String get local => '本地';

  @override
  String get cloud => '云端';

  @override
  String get loaded => '已加载';

  @override
  String get modelSettings => '模型设置';

  @override
  String get cancel => '取消';

  @override
  String get apply => '应用';

  @override
  String get noModels => '暂无模型';

  @override
  String get cloudModel => '云端模型';

  @override
  String get endpoint => '端点';

  @override
  String get model => '模型';

  @override
  String get apiKey => 'API 密钥';

  @override
  String get save => '保存';

  @override
  String get provider => '提供商';

  @override
  String errorGeneric(String detail) {
    return '错误：$detail';
  }

  @override
  String get mobileNetworkDetected => '检测到移动网络';

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
  String get retry => '重试';

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
  String get custom => '自定义';

  @override
  String get agent2UI => 'Agent2UI';

  @override
  String get removeAttachment => '移除附件';

  @override
  String get dimensionUser => '用户';

  @override
  String get dimensionAgent => '代理';

  @override
  String get dimensionSession => '会话';

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
  String get shadowEsp32PlayingFromUsbAudio => 'shadow-esp32 已通过 USB Audio 连接';

  @override
  String get customerServiceMode => '智能客服';

  @override
  String get aiAutoAnswer => 'AI 自动应答';

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
  String get conversationArchive => '归档';

  @override
  String get conversationUnarchive => '取消归档';

  @override
  String get conversationArchiveBox => '归档箱';

  @override
  String get conversationArchiveBoxEmpty => '没有已归档的会话';

  @override
  String get conversationArchivedBadge => '已归档';

  @override
  String get conversationDeleteBody => '这会连海马体里的那份一起删掉（会话与它的全部消息），不可撤销。';

  @override
  String conversationActionFailed(String error) {
    return '操作失败：$error';
  }

  @override
  String get commonConfirmDelete => '确认删除';

  @override
  String get commonCancel => '取消';

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
  String get commonAll => '全部';

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
  String get providerBuiltin => '内置';

  @override
  String get providerModelNotDownloaded => '未下载';

  @override
  String get modelCategoryText => '文本模型';

  @override
  String get modelCategoryVision => '视觉模型';

  @override
  String get modelCatalogTitle => '支持的模型';

  @override
  String get modelCatalogHint => '内嵌大脑支持的模型目录；标着「未下载」的本地模型选了也跑不起来。';

  @override
  String get modelCatalogEmpty => '目录尚未获取';

  @override
  String get capLlm => '文本';

  @override
  String get capVision => '视觉';

  @override
  String get capAsr => '语音识别';

  @override
  String get capTts => '语音合成';

  @override
  String get capEmbedding => '向量';

  @override
  String get capRerank => '重排';

  @override
  String get capOcr => '文字识别';

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
  String get providersApiKeyRequired => '请输入 API Key';

  @override
  String get providersNameRequired => '请输入提供商名称';

  @override
  String get providersStandard => '接口标准';

  @override
  String get providersPreviewModels => '预览模型';

  @override
  String get providersSelectModel => '选择模型';

  @override
  String get providersRefreshModels => '刷新模型';

  @override
  String get providersModelsNotFetched => '尚未获取';

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
  String get logsClient => '客户端';

  @override
  String get logsApp => '应用';

  @override
  String get logsDevice => '本机组件';

  @override
  String get logsAllLevels => '所有级别';

  @override
  String get logsExport => '导出日志';

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
  String get settingsEncephalonEmbedded => '大脑运行时';

  @override
  String get settingsEncephalonEmbeddedDesc =>
      '大脑运行状态、启停与进程内推理探针（模型选择在能力 tab：默认模型首卡与叶区 Agents 页）';

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
  String get chatGreeting => '你好，我是Shadow，有什么可以帮你的吗？';

  @override
  String get chatAttachmentNotAvailable => '端脑链路当前只处理纯文本，图片、文件等附件暂不支持';

  @override
  String chatSorryError(String error) {
    return '抱歉，发生了错误: $error';
  }

  @override
  String get chatSorryErrorShort => '抱歉，发生了错误';

  @override
  String get deviceThisMachine => '本机';

  @override
  String get encephalonStartFailed => '嵌入式大脑启动失败';

  @override
  String get encephalonEmbeddedTitle => '大脑运行时';

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
  String get encephalonModelNoCloudProvider => '还没有配置云端供应商 —— 先去「模型管理」加一个。';

  @override
  String get encephalonModelSourceApplied => '已应用新的模型来源';

  @override
  String get encephalonModelSourceFailed => '模型来源切换失败';

  @override
  String get encephalonModelOptionsUnavailable => '读不到大脑的供应商目录 —— 大脑可能没在跑。';

  @override
  String get encephalonLobeRoutingTitle => '叶区模型路由';

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
  String get settingsBackendShadowKeyHint => '外部端脑的影子锁（没有就留空）';

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
  String get settingsBackground => '背景';

  @override
  String get settingsBackgroundDesc => '聊天页背景图与对话框底色。';

  @override
  String get settingsAccentCustom => '自定义';

  @override
  String get settingsAccentCustomPick => '自定义色号…';

  @override
  String get settingsAccentHue => '色相';

  @override
  String get settingsAccentSat => '饱和度';

  @override
  String get settingsAccentLight => '亮度';

  @override
  String get settingsAccentApply => '应用';

  @override
  String get settingsChatBackground => '聊天背景';

  @override
  String get settingsChatBackgroundDesc => '为聊天页选一张背景图。';

  @override
  String get settingsChatBackgroundPick => '选择图片';

  @override
  String get settingsChatBackgroundClear => '清除';

  @override
  String settingsChatBackgroundFailed(String error) {
    return '设置背景失败：$error';
  }

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
  String logsExported(String path) {
    return '日志已导出到 $path';
  }

  @override
  String get askAgent2UI => '让端脑画界面...';

  @override
  String get a2uiSurfaceReportTasks => '已展开「任务看板」。';

  @override
  String get a2uiSurfaceReportAgents => '已展开「Agent 列表」。';

  @override
  String get a2uiSurfaceReportNoSurface => '端脑这次没有画界面。';

  @override
  String a2uiSurfaceReportNoSurfaceSaid(String words) {
    return '端脑这次没有画界面，它说：$words';
  }

  @override
  String get settingsGroupCapabilities => '能力授权';

  @override
  String get settingsGroupCapabilitiesDesc => '模型能读这台手机上的哪些东西，由你逐项决定';

  @override
  String get capabilityCalendarRead => '读取日历';

  @override
  String get capabilityCalendarWrite => '写入日历';

  @override
  String get capabilityContacts => '读取联系人';

  @override
  String get capabilitySms => '读取短信';

  @override
  String get capabilityPhotos => '读取相册';

  @override
  String get capabilityAuthAsk => '每次询问';

  @override
  String get capabilityAuthFull => '完全访问';

  @override
  String get capabilityAuthDisabled => '彻底关闭';

  @override
  String get capabilityAuthAskDesc => '每次调用前都先问你';

  @override
  String get capabilityAuthFullDesc => '不再逐次询问';

  @override
  String get capabilityAuthDisabledDesc => '模型看不到这个能力';

  @override
  String get capabilitySystemGranted => '系统权限已授予';

  @override
  String get capabilitySystemMissing => '系统权限未授予';

  @override
  String get capabilityRejectedDisabled => '这个能力已在设置中关闭';

  @override
  String get capabilityUnsupportedPlatform => '当前平台不支持这个能力';

  @override
  String get capabilityMobileUse => '手机操作';

  @override
  String get capabilityRequestMobileUse => '要操作这台手机';

  @override
  String get capabilityRequestMobileReadScreen => '要读取这台手机当前屏幕上的内容';

  @override
  String get capabilityRequestMobileTap => '要点这台手机屏幕上的一个位置';

  @override
  String get capabilityRequestMobileLongPress => '要长按这台手机屏幕上的一个位置';

  @override
  String get capabilityRequestMobileSwipe => '要在这台手机屏幕上滑动';

  @override
  String get capabilityRequestMobileFindAndClick => '要点这台手机屏幕上某个文字的控件';

  @override
  String get capabilityRequestMobileGlobalAction => '要在这台手机上触发一个系统动作';

  @override
  String capabilityArgMobilePoint(String x, String y) {
    return '位置 $x, $y';
  }

  @override
  String capabilityArgMobileSwipe(String x1, String y1, String x2, String y2) {
    return '从 $x1, $y1 滑到 $x2, $y2';
  }

  @override
  String capabilityArgMobileText(String text) {
    return '文字「$text」';
  }

  @override
  String capabilityArgMobileAction(String action) {
    return '动作：$action';
  }

  @override
  String get capabilityServiceGranted => '无障碍服务已开启';

  @override
  String get capabilityServiceMissing => '无障碍服务未开启';

  @override
  String get capabilityGrantService => '去开启';

  @override
  String get toolCallAllow => '允许';

  @override
  String get toolCallDeny => '拒绝';

  @override
  String get capabilityRequestCalendarRead => '要读取你手机上的日历事件';

  @override
  String get capabilityRequestCalendarWrite => '要往你手机上的日历里写一条日程';

  @override
  String get capabilityRequestContacts => '要读取你手机上的联系人';

  @override
  String get capabilityRequestSms => '要读取你手机上的短信';

  @override
  String get capabilityRequestPhotos => '要读取你手机上相册的图片信息';

  @override
  String capabilityArgTimeRange(String from, String to) {
    return '时间范围 $from ~ $to';
  }

  @override
  String get capabilityArgTimeRangeDefault => '接下来 7 天';

  @override
  String capabilityArgTitle(String title) {
    return '标题「$title」';
  }

  @override
  String capabilityArgStartAt(String time) {
    return '$time 开始';
  }

  @override
  String capabilityArgKeyword(String query) {
    return '姓名包含「$query」';
  }

  @override
  String capabilityArgContactsHead(String count) {
    return '通讯录前 $count 条';
  }

  @override
  String capabilityArgRecentSms(String count) {
    return '最近 $count 条短信';
  }

  @override
  String capabilityArgRecentPhotos(String count) {
    return '最近 $count 张图片';
  }

  @override
  String get capabilityGrantSystemPermission => '去授权';

  @override
  String get backgroundKeepAlive => '后台常驻';

  @override
  String get backgroundKeepAliveHint => '切到后台或息屏时，端脑与本地引擎继续运行（显示常驻通知）';

  @override
  String get backgroundServiceStatus => '前台服务';

  @override
  String get backgroundServiceOn => '运行中';

  @override
  String get backgroundServiceOff => '未运行';

  @override
  String get backgroundServiceTitle => 'Shadow 正在后台运行';

  @override
  String get backgroundServiceText => '端脑与本地引擎保持可用';

  @override
  String get backgroundStop => '停止';

  @override
  String get batteryOptimization => '电池优化白名单';

  @override
  String get batteryOptimizationExempt => '已在白名单 —— 后台运行有保障';

  @override
  String get batteryOptimizationAsk => '未加入白名单（MIUI 等系统需要）';

  @override
  String get batteryOptimizationRequest => '去申请';

  @override
  String get selfHostedAdd => '添加自持模型';

  @override
  String get selfHostedTitle => '添加自持模型';

  @override
  String get selfHostedModelId => '模型 ID';

  @override
  String get selfHostedModelIdRequired => '模型 ID 必填';

  @override
  String get selfHostedDisplayName => '显示名（可选）';

  @override
  String get selfHostedEndpoint => '接入点（OpenAI 兼容地址）';

  @override
  String get selfHostedEndpointRequired => '接入点必填';

  @override
  String get selfHostedApiKeyOptional => 'API Key（可选）';

  @override
  String get selfHostedContextWindow => '上下文窗口';

  @override
  String get selfHostedMaxOutput => '最大输出 Token';

  @override
  String get selfHostedInputTypes => '输入类型';

  @override
  String get selfHostedCapabilities => '模型能力';

  @override
  String get selfHostedReasoningLevels => '推理等级（从低到高）';

  @override
  String get selfHostedReasoningOff => '不支持';

  @override
  String get selfHostedAdvanced => '高级配置';

  @override
  String get selfHostedReasoningMapping => '推理参数映射';

  @override
  String get selfHostedReasoningMappingHint => 'JSON 快照：标准 × 档位 → 请求体参数';

  @override
  String get selfHostedAdvancedConfig => '高级配置（JSON）';

  @override
  String get selfHostedProbe => '从接入点探测模型';

  @override
  String get selfHostedProbeEmpty => '接入点没有返回模型';

  @override
  String get selfHostedProbePick => '选择模型 ID';

  @override
  String get selfHostedSubmit => '添加';

  @override
  String get selfHostedSaving => '添加中…';

  @override
  String get smartConfigBadge => '已智能配置';

  @override
  String get inputTypeText => '文本';

  @override
  String get inputTypeImage => '图片';

  @override
  String get inputTypeAudio => '音频';

  @override
  String get inputTypeVideo => '视频';

  @override
  String get cloudGuideTitle => '云端模型在供应商页';

  @override
  String get cloudGuideDesc => '添加云供应商后，其支持的模型自动获取，无需手填。';

  @override
  String get voiceNoteBrainAsrPending => '语音转写还没接上大脑的语音识别面 —— 打字问，或者等大脑那边接通。';
}
