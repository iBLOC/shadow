// Chord display + risk classification for the shortcuts settings UI.
//
// Chord format mirrors the Rust side (src-tauri/src/global_keys.rs):
//   [Ctrl+][Shift+][Alt+][Meta+]<KeyboardEvent.code>
// e.g. "Ctrl+Shift+KeyR", "MediaPlayPause", "ArrowUp".
//
// A paired Mi (米家) Bluetooth remote enumerates as a HID keyboard, so
// its buttons arrive as ordinary codes — 播放/暂停 = MediaPlayPause,
// OK = Enter, 返回 = Escape, 音量 = VolumeUp/Down, 方向键 = Arrow*.

const MODIFIER_ORDER = ['Ctrl', 'Shift', 'Alt', 'Meta'] as const;

/** Chinese display names for keys whose code spelling is unreadable. */
const ZH_KEY_NAMES: Record<string, string> = {
  MediaPlayPause: '播放/暂停',
  MediaTrackNext: '下一曲',
  MediaTrackPrevious: '上一曲',
  MediaStop: '停止',
  VolumeMute: '静音',
  VolumeUp: '音量+',
  VolumeDown: '音量-',
  BrowserBack: '后退',
  BrowserForward: '前进',
  BrowserRefresh: '刷新',
  BrowserStop: '停止加载',
  BrowserSearch: '搜索',
  BrowserFavorites: '收藏',
  BrowserHome: '主页',
  LaunchMail: '邮件',
  LaunchMediaPlayer: '媒体播放器',
  LaunchApplication1: '应用1',
  LaunchApplication2: '应用2',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
  Backspace: '退格',
  Enter: 'Enter',
  Tab: 'Tab',
  Space: '空格',
  CapsLock: '大写锁定',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PrintScreen: 'PrtSc',
  Pause: 'Pause',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  Semicolon: ';',
  Equal: '=',
  Comma: ',',
  Minus: '-',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Quote: "'",
  NumpadAdd: '小键盘+',
  NumpadSubtract: '小键盘-',
  NumpadMultiply: '小键盘*',
  NumpadDivide: '小键盘/',
  NumpadDecimal: '小键盘.',
};

function prettyCode(code: string, lang: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) {
    return lang.startsWith('zh') ? `小键盘${code.slice(6)}` : `Num${code.slice(6)}`;
  }
  if (lang.startsWith('zh')) {
    return ZH_KEY_NAMES[code] ?? code;
  }
  return code;
}

/** Human-readable chord, e.g. "Ctrl + Shift + R", "播放/暂停". */
export function formatChord(chord: string, lang: string): string {
  const parts = chord.split('+');
  const code = parts.pop() ?? chord;
  const key = prettyCode(code, lang);
  return parts.length > 0 ? `${parts.join(' + ')} + ${key}` : key;
}

// Keys that type text or act inside whatever app is focused. A bare
// (modifier-less) binding over one of these swallows the key globally —
// bindable after explicit confirmation, never silently.
const TYPING_CODES = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Semicolon',
  'Equal',
  'Comma',
  'Minus',
  'Period',
  'Slash',
  'Backquote',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Quote',
]);

export function isBareTypingChord(chord: string): boolean {
  const parts = chord.split('+');
  const code = parts.pop() ?? '';
  const hasModifier = parts.some((p) => (MODIFIER_ORDER as readonly string[]).includes(p));
  if (hasModifier) return false;
  if (TYPING_CODES.has(code)) return true;
  if (/^(Key[A-Z]|Digit\d)$/.test(code)) return true;
  if (/^(Numpad\d|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal)$/.test(code)) {
    return true;
  }
  return false;
}
