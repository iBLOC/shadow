/// **v1.0** 的四种消息键（当前规范）。
///
/// ⚠️ 这一份**单独成文件** —— 服务层（A2A 那条路）与协议层（AG-UI 那条路）
/// 都用它 ⇒ ⇒ **不许各写一份** ⇒ ⇒ 两份判据漂了就会「这边认、那边不认」。
const a2uiV1MessageKeys = <String>{
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
};

/// 这个值是不是一条 **v1.0** 的 A2UI 消息？
///
/// ⚠️ **版本也要对** —— 只看键不看版本 ⇒ ⇒ v0.8 的旧信封会被当成 v1.0
/// ⇒ ⇒ 官方 SDK 拒 ⇒ ⇒ 界面上「什么都没有」。
bool isA2uiV1Message(Object? value) {
  if (value is! Map) return false;
  if (value['version'] != '1.0') return false;
  return a2uiV1MessageKeys.any((key) => value.containsKey(key));
}
