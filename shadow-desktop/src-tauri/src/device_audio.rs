//! **设备静音探针** —— 「这台机器现在有没有声音」。
//!
//! ⚠️ **为什么要有它**：TTS 合成要烧**模型算力**（端脑/neuron 那一发
//! `/v1/audio/speech`）⇒ ⇒ 用户把音量调到 0（静音）时，合成出来的音频
//! **没人听得见** ⇒ ⇒ 那一发**纯属浪费**。
//!
//! ⚠️ **三态，不是布尔** —— `known = false`（**查不到**）必须与「有声音」
//! **分开**：查不到时上层按「未静音」处理（宁可多合成一次，也绝不静默
//! 吞掉声音）⇒ ⇒ 查不到的那一格若被当成静音 ⇒ ⇒ 那台机器上的声音会被
//! **静默吞掉**（而用户什么都看不出来）⇒ ⇒ 那是「失败长得像成功」。
//!
//! ⚠️ **平台能力**（谁查得到什么）：
//! · **Windows** —— COM 端点音量（`IAudioEndpointVolume`）：能查到
//!   **托盘静音**（那个真静音开关）与主音量标量；兜底是 waveOut 的设备
//!   主音量（只看得见滑块）。
//! · **macOS** —— CoreAudio 默认输出设备（静音标志 + 主音量标量）。
//! · **其它** —— **查不到**（Linux 上 PulseAudio / PipeWire / ALSA 各有
//!   各的协议，零依赖读不出来）⇒ ⇒ 如实说「查不到」，不猜。

use serde::{Deserialize, Serialize};

/// **设备声音状态** —— 三态。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceAudioState {
    /// 设备**确定**是静音的（媒体音量为 0 ／ 端点被 mute）。
    ///
    /// ⚠️ `known = false` 时这一位**没有意义**（恒为 false）⇒ ⇒ 上层
    /// 必须先看 `known`。
    pub muted: bool,
    /// 这个结论**是不是查到的** —— false ⇒ **查不到**（按「未静音」处理）。
    pub known: bool,
}

impl DeviceAudioState {
    /// **查不到** —— 不是「有声音」，是「不知道」。
    pub const UNKNOWN: DeviceAudioState = DeviceAudioState {
        muted: false,
        known: false,
    };

    /// **确定有声音**。
    pub const UNMUTED: DeviceAudioState = DeviceAudioState {
        muted: false,
        known: true,
    };

    /// **确定静音**。
    pub const MUTED: DeviceAudioState = DeviceAudioState {
        muted: true,
        known: true,
    };

    /// 从「静音标志 + 主音量标量」推出结论（纯函数 ⇒ 可测）。
    pub fn from_parts(mute_flag: Option<bool>, master_volume: Option<f32>) -> DeviceAudioState {
        match decide_muted(mute_flag, master_volume) {
            Some(true) => DeviceAudioState::MUTED,
            Some(false) => DeviceAudioState::UNMUTED,
            None => DeviceAudioState::UNKNOWN,
        }
    }
}

/// **音量判零的阈值** —— 主音量标量（0.0 – 1.0）低于它就算静音。
///
/// ⚠️ 为什么不是严格等于 0：浮点标量在 Windows 上被量化过（COM 那一路
/// 常用 1/100 的步进），严格的 `== 0.0` 会漏掉「几乎为 0」那一格 ⇒ ⇒
/// 漏检的代价是**白烧一次算力**（可接受），误检的代价是**吞掉声音**
/// （不可接受）⇒ ⇒ 阈值取极小值（0.0001），只把**真静音**判成静音。
pub const SILENCE_EPSILON: f32 = 0.0001;

/// **判定规则**（纯函数）—— 静音标志 + 主音量标量 ⇒ 静音？
///
/// ⚠️ 规则**只有这一份**：Windows 端点、macOS 端点、waveOut 兜底都调它
/// ⇒ ⇒ 同一规则写两份实现 ⇒ ⇒ 变异只打掉一份时另一份会把断言喂饱
/// （假绿教训，见 `tts_engine.dart` 的同款注释）。
pub fn decide_muted(mute_flag: Option<bool>, master_volume: Option<f32>) -> Option<bool> {
    // ❶ 静音标志最硬：托盘上的那个静音开关就是它。
    if mute_flag == Some(true) {
        return Some(true);
    }
    // ❷ 主音量标量（0.0 – 1.0）⇒ 滑块在 0 也是「没人听得见」。
    if let Some(volume) = master_volume {
        return Some(volume <= SILENCE_EPSILON);
    }
    // ❸ 只知道「没被 mute」⇒ 按「有声音」处理（宁可多合成一次）。
    if mute_flag == Some(false) {
        return Some(false);
    }
    // ❹ 两样都没查到 ⇒ **查不到**（不是「有声音」）。
    None
}

/// **探一次设备声音状态** —— 平台实现。
///
/// ⚠️ **异步**（不是同步命令）：COM 初始化 + 跨进程查询要几毫秒 ⇒ ⇒
/// 同步命令会占住 Tauri 的主线程 ⇒ ⇒ 界面会卡一下。
#[tauri::command]
pub async fn device_audio_state() -> DeviceAudioState {
    probe()
}

// ── Windows ────────────────────────────────────────────────────────────

/// **Windows 探针** —— 端点音量优先，waveOut 兜底。
#[cfg(windows)]
fn probe() -> DeviceAudioState {
    match probe_windows_parts() {
        Some((mute_flag, master_volume)) => DeviceAudioState::from_parts(mute_flag, master_volume),
        None => DeviceAudioState::UNKNOWN,
    }
}

/// **Windows 的两样读数** —— (静音标志, 主音量标量)。
#[cfg(windows)]
fn probe_windows_parts() -> Option<(Option<bool>, Option<f32>)> {
    // ❶ COM 端点（能查到**托盘静音**）—— 这是「用户静音了」最常见的那种。
    if let Some(parts) = probe_windows_endpoint() {
        return Some(parts);
    }
    // ❷ 兜底：waveOut mapper 设备的主音量（只看得见滑块，看不见静音开关）。
    let volume_zero = probe_windows_wave_out_volume_zero()?;
    Some((None, Some(if volume_zero { 0.0 } else { 1.0 })))
}

/// **COM 端点音量** —— 默认输出设备的静音标志 + 主音量标量。
#[cfg(windows)]
fn probe_windows_endpoint() -> Option<(Option<bool>, Option<f32>)> {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    // ⚠️ **COM 必须先在本线程初始化** —— Tauri 的命令跑在 tokio 工作线程上
    // ⇒ ⇒ 那些线程**没有** COM apartment ⇒ ⇒ 不初始化就 CoCreateInstance
    // ⇒ ⇒ 直接 CO_E_NOTINITIALIZED（探针静默失效 ⇒ 「静音了也在烧算力」）。
    let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    // ⚠️ S_OK / S_FALSE **都**算「这一线程的 COM 现在是起来的」⇒ ⇒ 两种
    // 都要配一次 CoUninitialize；而 RPC_E_CHANGED_MODE（失败）**不能**配 ——
    // 那时 COM 是这个线程**原来**就有的，不是我们起的。
    let we_initialized = hr.is_ok();

    let outcome = (|| -> Option<(Option<bool>, Option<f32>)> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
            let mute_flag = volume.GetMute().ok().map(|flag| flag.as_bool());
            let master_volume = volume.GetMasterVolumeLevelScalar().ok();
            Some((mute_flag, master_volume))
        }
    })();

    if we_initialized {
        unsafe { CoUninitialize() };
    }
    outcome
}

/// **waveOut 兜底** —— mapper 设备（系统默认播放设备）的主音量是不是 0。
#[cfg(windows)]
fn probe_windows_wave_out_volume_zero() -> Option<bool> {
    use windows::Win32::Media::Audio::waveOutGetVolume;

    let mut volume: u32 = 0;
    // ⚠️ `None` ＝ **mapper** 设备（系统默认的那个播放设备）。
    let rc = unsafe { waveOutGetVolume(None, &mut volume) };
    if rc != 0 {
        return None;
    }
    // ⚠️ waveOut 的主音量是 0 – 0xFFFF（0xFFFF ＝ 100%）⇒ ⇒ 判零。
    Some(volume == 0)
}

// ── macOS ──────────────────────────────────────────────────────────────

/// **macOS 探针** —— CoreAudio 默认输出设备。
///
/// ⚠️ **本机（Windows）跑不到这一格** ⇒ ⇒ 它的读数是「类型检查过、
/// 真机未验」⇒ ⇒ 见台账条。
#[cfg(target_os = "macos")]
fn probe() -> DeviceAudioState {
    match probe_macos_parts() {
        Some((mute_flag, master_volume)) => DeviceAudioState::from_parts(mute_flag, master_volume),
        None => DeviceAudioState::UNKNOWN,
    }
}

/// **CoreAudio 的两样读数** —— (静音标志, 主音量标量)。
#[cfg(target_os = "macos")]
fn probe_macos_parts() -> Option<(Option<bool>, Option<f32>)> {
    use coreaudio::{
        kAudioDevicePropertyMuted, kAudioDevicePropertyVolumeScalar,
        kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal,
        kAudioObjectSystemObject, AudioObjectGetPropertyData, AudioObjectPropertyAddress,
    };
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::ptr;

    /// 读一个 u32 属性。
    fn read_u32(object_id: u32, selector: u32) -> Option<u32> {
        let address = AudioObjectPropertyAddress {
            m_selector: selector,
            m_scope: kAudioObjectPropertyScopeGlobal,
            m_element: 0,
        };
        let mut value: u32 = 0;
        let mut size = size_of::<u32>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object_id,
                &address,
                0,
                ptr::null(),
                &mut size,
                &mut value as *mut u32 as *mut c_void,
            )
        };
        if status != 0 {
            return None;
        }
        Some(value)
    }

    /// 读一个 f32 属性（主音量标量）。
    fn read_f32(object_id: u32, selector: u32) -> Option<f32> {
        let address = AudioObjectPropertyAddress {
            m_selector: selector,
            m_scope: kAudioObjectPropertyScopeGlobal,
            m_element: 0,
        };
        let mut value: f32 = 0.0;
        let mut size = size_of::<f32>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                object_id,
                &address,
                0,
                ptr::null(),
                &mut size,
                &mut value as *mut f32 as *mut c_void,
            )
        };
        if status != 0 {
            return None;
        }
        Some(value)
    }

    // ❶ 默认输出设备（AudioObjectID）。
    let device_id = read_u32(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice)?;
    // ❷ 静音标志（有些设备没有这一项 ⇒ 读不到就是读不到）。
    let mute_flag = read_u32(device_id, kAudioDevicePropertyMuted).map(|v| v != 0);
    // ❸ 主音量标量（0.0 – 1.0；聚合设备可能没有这一项）。
    let master_volume = read_f32(device_id, kAudioDevicePropertyVolumeScalar);
    Some((mute_flag, master_volume))
}

/// **CoreAudio 的那层薄 FFI** —— 只有几个常量 + 一个函数。
#[cfg(target_os = "macos")]
mod coreaudio {
    use std::ffi::c_void;

    /// `AudioObjectPropertyAddress` —— CoreAudio 的属性寻址三元组。
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct AudioObjectPropertyAddress {
        pub m_selector: u32,
        pub m_scope: u32,
        pub m_element: u32,
    }

    /// 默认输出设备（'dOut'）。
    pub const kAudioHardwarePropertyDefaultOutputDevice: u32 = 0x646F_7574;
    /// 全局作用域（'glob'）。
    pub const kAudioObjectPropertyScopeGlobal: u32 = 0x676C_6F62;
    /// 设备静音标志（'mute'）。
    pub const kAudioDevicePropertyMuted: u32 = 0x6D75_7465;
    /// 设备主音量标量（'volm'）。
    pub const kAudioDevicePropertyVolumeScalar: u32 = 0x766F_6C6D;
    /// 系统对象（'system'）—— 全局性的属性挂在它上面。
    pub const kAudioObjectSystemObject: u32 = 1;

    unsafe extern "C" {
        pub fn AudioObjectGetPropertyData(
            in_object_id: u32,
            in_address: *const AudioObjectPropertyAddress,
            in_qualifier_data_size: u32,
            in_qualifier_data: *const c_void,
            io_data_size: *mut u32,
            out_data: *mut c_void,
        ) -> i32;
    }
}

// ── 其它平台 ───────────────────────────────────────────────────────────

/// **其它平台** —— **查不到**（不是「有声音」）。
#[cfg(not(any(windows, target_os = "macos")))]
fn probe() -> DeviceAudioState {
    DeviceAudioState::UNKNOWN
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── 判定规则（纯函数）───────────────────────────────────────────────

    #[test]
    fn mute_flag_true_wins_over_everything() {
        assert_eq!(decide_muted(Some(true), Some(1.0)), Some(true));
        assert_eq!(decide_muted(Some(true), Some(0.5)), Some(true));
        assert_eq!(decide_muted(Some(true), None), Some(true));
    }

    #[test]
    fn master_volume_zero_means_muted() {
        assert_eq!(decide_muted(None, Some(0.0)), Some(true));
        assert_eq!(decide_muted(Some(false), Some(0.0)), Some(true));
    }

    #[test]
    fn tiny_but_nonzero_volume_is_still_muted() {
        // ⚠️ 浮点量化过 ⇒ 「几乎为 0」也要判静音（漏检＝白烧算力）。
        assert_eq!(decide_muted(None, Some(0.00001)), Some(true));
    }

    #[test]
    fn audible_volume_is_not_muted() {
        assert_eq!(decide_muted(Some(false), Some(0.5)), Some(false));
        assert_eq!(decide_muted(None, Some(0.3)), Some(false));
    }

    #[test]
    fn nothing_known_is_unknown_not_unmuted() {
        // ⚠️ **查不到 ≠ 有声音** —— 这一格若被当成「有声音」就是默认值，
        // 被当成「静音」就会吞掉声音 ⇒ ⇒ 必须单独一态。
        assert_eq!(decide_muted(None, None), None);
    }

    // ── 三态构造 ────────────────────────────────────────────────────────

    #[test]
    fn from_parts_maps_to_three_states() {
        assert_eq!(
            DeviceAudioState::from_parts(Some(true), None),
            DeviceAudioState::MUTED
        );
        assert_eq!(
            DeviceAudioState::from_parts(Some(false), Some(0.5)),
            DeviceAudioState::UNMUTED
        );
        assert_eq!(
            DeviceAudioState::from_parts(None, None),
            DeviceAudioState::UNKNOWN
        );
    }

    #[test]
    fn unknown_state_is_never_muted() {
        assert!(!DeviceAudioState::UNKNOWN.muted);
        assert!(!DeviceAudioState::UNKNOWN.known);
    }

    // ── 平台探针（形状）────────────────────────────────────────────────

    /// **本机真读数** —— 这一条在**这台机器**上真跑 COM（不是假引擎）。
    ///
    /// ⚠️ **不断言 known** —— 没有音频设备的机器（容器／CI）会查不到
    /// ⇒ ⇒ 那是「环境」的事实，不是代码的事实 ⇒ ⇒ 只断言「探针不许自己
    /// 造出静音」⇒ ⇒ 真读数靠 `--nocapture` 打出来。
    #[cfg(windows)]
    #[test]
    fn windows_probe_is_a_real_reading_on_this_machine() {
        let state = probe();
        println!("[device_audio] 本机读数 = {state:?}");
        assert!(state.known || !state.muted);
    }

    #[test]
    fn probe_never_panics_and_never_invents_mute() {
        let state = probe();
        // ⚠️ 探针**不许**自己造出「静音」—— 静音只能由真读数得出。
        assert!(state.known || !state.muted);
    }
}
