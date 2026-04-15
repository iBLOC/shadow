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
}
