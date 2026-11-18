import { useTranslation } from 'react-i18next';
import { Badge } from '../ui';

/**
 * ⚠️ **输入模态**（2026-11-16）—— 「这条模型吃什么」。
 *
 * ⚠️ **为什么单独一个组件**：模型管理页那一行要显示「吃什么」＋ 来源 ⇒ ⇒
 * 收成一个组件 ⇒ ⇒ 将来第二处要用，直接复用（不许再抄一份渲染逻辑）。
 *
 * ⚠️ **只给最终模态、不说来源 ⇒ 「上游真给的」与「我们按官方文档预设的」
 * 在界面上长得一样 ⇒ ⇒ 猜错了没人发现** ⇒ ⇒ 所以来源进 `title`（悬停可见）。
 */
export function ModelInputModalities({
  modalities,
  source,
}: {
  modalities?: string[];
  source?: string;
}) {
  const { t } = useTranslation();
  // ⚠️ 老数据没这个字段 ⇒ ⇒ 什么都不画（不许拿空数组画一个空徽章）。
  if (!modalities || modalities.length === 0) return null;
  const sourceKey =
    source === 'upstream'
      ? 'models.inputModalitiesSourceUpstream'
      : source === 'catalog'
        ? 'models.inputModalitiesSourceCatalog'
        : 'models.inputModalitiesSourceDefault';
  return (
    <Badge
      variant="outline"
      size="sm"
      title={t('models.inputModalitiesSource') + ': ' + t(sourceKey)}
    >
      {modalities.join(' / ')}
    </Badge>
  );
}