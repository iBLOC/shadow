use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter,
};

/// 日志目录名称
const LOG_DIR_NAME: &str = "logs";
/// 日志文件前缀
const LOG_FILE_PREFIX: &str = "shadow";
/// 保留天数
const MAX_LOG_DAYS: usize = 7;

/// 获取 Shadow 数据目录（可执行文件所在目录）
fn shadow_data_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 获取日志目录路径
pub fn log_dir() -> PathBuf {
    shadow_data_dir().join(LOG_DIR_NAME)
}

/// 初始化日志系统
/// - stdout 输出 (开发控制台)
/// - 滚动文件日志 (~/.shadow/logs/shadow-YYYY-MM-DD.log)
pub fn init() {
    let dir = log_dir();

    // 确保日志目录存在
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("Failed to create log directory {:?}: {}", dir, e);
        // 回退到仅 stdout
        fmt().with_env_filter(EnvFilter::from_default_env()).init();
        return;
    }

    // 滚动文件 appender: 每天轮转，单文件 10MB，保留 7 天
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .max_log_files(MAX_LOG_DAYS)
        .filename_prefix(LOG_FILE_PREFIX)
        .filename_suffix("log")
        .build(&dir)
        .unwrap_or_else(|e| {
            eprintln!("Failed to create log appender: {}", e);
            // Fallback: try without rotation
            RollingFileAppender::builder()
                .rotation(Rotation::NEVER)
                .build(&dir)
                .expect("Failed to create fallback log appender")
        });

    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // 保存 guard 到全局变量，防止提前 drop
    // (drop guard 会 flush 缓冲区)
    GUARD.set(_guard).ok();

    // 构建 subscriber: stdout + file
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_ansi(true)
        .with_target(true);

    let file_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_file(true)
        .with_line_number(true);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .with(file_layer)
        .init();

    tracing::info!(
        log_dir = %dir.display(),
        "Shadow 日志系统初始化完成（可执行文件目录）"
    );
}

/// 记录启动诊断信息（工作目录、关键路径等）
pub fn log_startup_diagnostics() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();
    let shadow_dir = shadow_data_dir();
    let log_directory = log_dir();

    tracing::info!("=== Shadow Desktop 启动诊断 ===");
    tracing::info!(cwd = %cwd.display(), "当前工作目录");
    tracing::info!(home = %home.display(), "用户主目录");
    tracing::info!(shadow_dir = %shadow_dir.display(), "Shadow 数据目录");
    tracing::info!(log_dir = %log_directory.display(), "日志目录");

    // 检查关键目录是否存在
    let models_dir = shadow_dir.join("models");
    tracing::info!(
        models_dir = %models_dir.display(),
        exists = models_dir.exists(),
        "模型目录"
    );

    // 环境变量
    for (key, value) in [
        ("CORTEX_SKIP_NEURE", std::env::var("CORTEX_SKIP_NEURE").unwrap_or_default()),
        ("LANCE_URI", std::env::var("LANCE_URI").map(|_| "***".to_string()).unwrap_or_default()),
        ("CORTEX_PORT", std::env::var("CORTEX_PORT").unwrap_or_default()),
        ("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_default()),
    ] {
        if !value.is_empty() {
            tracing::info!(key = key, value = value.as_str(), "环境变量");
        }
    }

    tracing::info!("=== 启动诊断结束 ===");
}

/// 全局 guard，防止提前 drop 导致日志丢失
static GUARD: std::sync::OnceLock<tracing_appender::non_blocking::WorkerGuard> =
    std::sync::OnceLock::new();
