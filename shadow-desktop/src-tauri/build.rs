fn main() {
    // Windows test binaries need the Common-Controls v6 side-by-side
    // dependency in their manifest. tauri-build embeds that manifest
    // into the `bin` target only, so `cargo test` exes load the plain
    // System32 comctl32 5.82 — which doesn't export TaskDialogIndirect
    // (pulled in by the muda/tao menu stack) — and die at load with
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) before any test runs.
    // Declaring the dependency here makes the loader resolve comctl32
    // from WinSxS v6 for test binaries too.
    #[cfg(windows)]
    {
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' \
             name='Microsoft.Windows.Common-Controls' version='6.0.0.0' \
             publicKeyToken='6595b64144ccf1df' language='*' \
             processorArchitecture='*'"
        );
    }

    tauri_build::build()
}
