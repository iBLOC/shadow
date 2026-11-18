import { useTranslation } from 'react-i18next';
import { Badge } from '../ui';

/**
 * ⚠️ **这条模型条目从哪来**（2026-11-16）—— 「上游列的」还是「按官方文档补的」。
 *
 * ⚠️ **为什么必须有**：上游的「模型列表」**只列对话模型** —— MiniMax 的
 * `GET /v1/models` 逐字只给 `MiniMax-M3.1-Flash` / `MiniMax-M3` ⇒ ⇒ 出图
 * `MiniMax-H3-Image` / 视频 `MiniMax-H3` / 语音 `speech-*` **压根不在那个
 * 列表里**（它们走各自端点）⇒ ⇒ 那几档是**按官方文档补进来的** ⇒ ⇒ 不标
 * 出来 ⇒ ⇒ 界面把它们说成「实时拉的」⇒ ⇒ **来源标签说谎**。
 *
 * ⚠️ **只给「按文档补的」画徽章** —— 上游列的那批是**默认**那一批 ⇒ ⇒ 不画
 * （满屏徽章＝噪音 ⇒ ⇒ 真正的来源反而看不见了）。
 */
export function ModelEntrySource({ source }: { source?: string }) {
  const { t } = useTranslation();
  if (source !== 'preset') return null;
  return (
    <Badge
      variant="outline"
      size="sm"
      title={t('models.entrySourcePresetHint')}
    >
      {t('models.entrySourcePreset')}
    </Badge>
  );
}
