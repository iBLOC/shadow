/**
 * ShadowMark —— 蚀（日月相蚀）logo 的应用内标记。
 *
 * ⚠️ 由 brand/gen-icons.mjs 生成，请勿手改。
 * 几何真相源：仓根 brand/geom.mjs；改几何请改那里再重跑脚本。
 *
 * 明暗两态**交换两笔的颜色角色**：
 * - 白天：日亮月暗 —— 后面的月牙吃主题色，前面的月盘是中性影色
 * - 黑夜：月亮日暗 —— 前面的月盘亮起来，后面的日轮退成暗影
 *
 * 颜色规则在 shadow-desktop/src/index.css 的 `.shadow-mark` 上。
 */

export interface ShadowMarkProps {
  /** 边长（px）。 */
  size?: number;
  className?: string;
}

export function ShadowMark({ size = 24, className = '' }: ShadowMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`shadow-mark ${className}`.trim()}
      role="img"
      aria-label="Shadow"
    >
      <path data-part="front" d="M 83 256 A 150 150 0 1 1 383 256 A 150 150 0 1 1 83 256 Z" />
      <path data-part="back" d="M 256 107.77 A 150 150 0 1 1 256 404.23 A 150 150 0 0 0 256 107.77 Z" />
    </svg>
  );
}
