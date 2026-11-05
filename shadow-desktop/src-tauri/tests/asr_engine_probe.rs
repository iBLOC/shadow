//! 真机级探针 —— **大脑的 ASR 引擎注册契约**。
//!
//! # 这条测试钉的是什么
//!
//! `neuron` 的 ASR 引擎**只**在两处会注册：
//!
//! ① 环境变量 `NEURON_ASR_RUNTIME` ∈ {`whisper`/`candle`, `tract`, `sherpa`}
//!    —— 它注册**一个**硬编码 id（`whisper-model` / `sensevoice-small`）；
//! ② `config.registrations` 里的显式条目。
//!
//! 而**模型目录**在两条路上都**只**从环境变量取：**`NEURON_ASR_MODEL_PATH`**
//! （candle-whisper 与 sherpa 两条路都是 —— 实测两处 `resolve_model_path`）。
//!
//! ⇒ ⇒ **两个环境变量** ⇒ ⇒ 大脑的 ASR 面就通；**一个都没有** ⇒ ⇒
//! `NoRegisteredModel: register at least one ASR model`。
//!
//! ⚠️ 真机证据（2026-11-05，桌面端真端脑 `127.0.0.1:60080`）：
//! **一个 `NEURON_*` 变量都没设** ⇒ ⇒ 内嵌 neuron 的 ASR registry **空的**
//! ⇒ ⇒ `/v1/audio/transcriptions` 逐字回
//! `neuron_error: NoRegisteredModel: register at least one ASR model`。
//!
//! # 这条测试怎么跑
//!
//! * 模型目录不在 ⇒ ⇒ **跳过**（CI 上没有模型，跳过是诚实的）；
//! * 模型在 ⇒ ⇒ 起一个**真** embedded neuron（随机端口）⇒ ⇒ POST 一段**真语音**
//!   ⇒ ⇒ **必须拿到非空文本**。
//!
//! ⚠️ 环境变量在**起 runtime 之前**设（Rust 2024：`set_var` 在多线程里是 UB）
//! ⇒ ⇒ 这里先设、再建 runtime ⇒ ⇒ 没有并发读 env 的窗口。

use std::path::PathBuf;
use std::time::Duration;

// neuron 的 [lib] target 叫 `neuron_lib`；按仓里既有写法别名成 crate 名。
use neuron_lib as neuron;

fn home_dir() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .ok()
        .map(PathBuf::from)
        .or_else(|| std::env::var("HOME").ok().map(PathBuf::from))
}

/// 本机的 candle-whisper 布局模型目录（`config.json` + `tokenizer.json`
/// + `model.safetensors` + `mel_filters.safetensors`）。
fn whisper_model_dir() -> Option<PathBuf> {
    let asr = home_dir()?
        .join(".neuron")
        .join("models")
        .join("asr");
    for name in ["whisper-base", "whisper-small", "whisper-tiny"] {
        let d = asr.join(name);
        if d.join("config.json").is_file()
            && d.join("tokenizer.json").is_file()
            && d.join("model.safetensors").is_file()
            && d.join("mel_filters.safetensors").is_file()
        {
            return Some(d);
        }
    }
    None
}

/// 一段**真语音** —— sherpa-onnx 那份模型自带 `en.wav` / `zh.wav`。
fn sample_wav() -> Option<PathBuf> {
    let d = home_dir()?
        .join(".neuron")
        .join("models")
        .join("asr")
        .join("sensevoice-small");
    for name in ["en.wav", "zh.wav"] {
        let p = d.join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// **大脑的 ASR 面在引擎注册后必须真出文本** ——
/// 这是「叶区的 ASR 面能不能用」的那一格（叶区 → 端脑门 → neuron → 引擎）。
#[test]
fn asr_face_returns_text_when_the_engine_is_registered() {
    let Some(model_dir) = whisper_model_dir() else {
        eprintln!("skip: 本机没有 candle-whisper 布局的 ASR 模型目录");
        return;
    };
    let Some(wav) = sample_wav() else {
        eprintln!("skip: 本机没有样例语音");
        return;
    };

    // ⚠️ Rust 2024：`set_var` 在多线程里是 UB ⇒ ⇒ 必须在**起 runtime 之前**设。
    unsafe {
        std::env::set_var("NEURON_ASR_RUNTIME", "whisper");
        std::env::set_var("NEURON_ASR_MODEL_PATH", &model_dir);
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");

    let (status, body) = rt.block_on(async move {
        let cfg = neuron::NeuronEmbedConfig {
            port: 0,
            config: neuron::NeuronConfig::new(),
        };
        let handle = neuron::run_embedded(cfg).await.expect("embedded neuron binds");
        // handle.addr 回显通配绑定（0.0.0.0）⇒ ⇒ 换回环 host，端口照用。
        let base = format!("http://127.0.0.1:{}", handle.addr.port());

        let bytes = std::fs::read(&wav).expect("read wav");
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name("sample.wav")
            .mime_str("audio/wav")
            .expect("mime");
        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("model", "whisper-1");

        let resp = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("client")
            .post(format!("{base}/v1/audio/transcriptions"))
            .multipart(form)
            .send()
            .await
            .expect("asr request");
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        (status, body)
    });

    assert!(
        status.is_success(),
        "ASR 面失败：{status} / {body}"
    );
    let v: serde_json::Value = serde_json::from_str(&body).expect("ASR json");
    let text = v["text"].as_str().unwrap_or("").trim().to_string();
    assert!(!text.is_empty(), "ASR 返回空文本：{body}");
    eprintln!("ASR text = {text}");
}
