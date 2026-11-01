package com.ibloc.shadow.mnn

import android.util.Log
import com.ibloc.shadow.AppLog

class PrefrontalMNN {
    
    companion object {
        private const val TAG = "PrefrontalMNN"
        const val BACKEND_CPU = 0
        const val BACKEND_OPENCL = 1
        const val BACKEND_METAL = 2
        
        @Volatile
        private var isInitialized = false
        
        @Volatile
        private var isModelLoaded = false
        
        init {
            try {
                System.loadLibrary("mnnbridge")
                AppLog.i(TAG, "MNN bridge library loaded")
            } catch (e: UnsatisfiedLinkError) {
                // 与 EncephalonRuntime 同一套降级策略：不重抛。
                //
                // 重抛会让类初始化失败，之后每次访问都变成 NoClassDefFoundError ——
                // 而调用方接的是 UnsatisfiedLinkError，接不住 NoClassDefFoundError，
                // App 会直接崩。
                //
                // 什么时候会 load 失败：libmnnbridge.so 动态依赖 libc++_shared.so
                // （llvm-readelf -d 实测），而 APK 里只有 arm64-v8a 带了它 ——
                // x86_64 那份 jniLibs 不完整，load 必然失败。
                AppLog.e(TAG, "❌ Failed to load mnnbridge.so: ${e.message}")
            }
        }
        
        private external fun nativeInitialize(modelPath: String, threadNum: Int, backendType: Int): Boolean
        private external fun nativeLoadModel(configPath: String): Boolean
        private external fun nativeGenerate(prompt: String): String
        private external fun nativeGetModelInfo(): String
        private external fun nativeRelease()
        
        @Synchronized
        fun initialize(modelPath: String, threadNum: Int = 4, backendType: Int = BACKEND_CPU): Boolean {
            if (isInitialized) {
                AppLog.w(TAG, "MNN already initialized")
                return true
            }
            val result = nativeInitialize(modelPath, threadNum, backendType)
            isInitialized = result
            AppLog.i(TAG, "MNN initialized: $result")
            return result
        }
        
        @Synchronized
        fun loadModel(configPath: String): Boolean {
            if (!isInitialized) {
                AppLog.e(TAG, "MNN not initialized")
                return false
            }
            if (isModelLoaded) {
                AppLog.w(TAG, "Model already loaded")
                return true
            }
            val result = nativeLoadModel(configPath)
            isModelLoaded = result
            AppLog.i(TAG, "Model loaded: $result")
            return result
        }
        
        fun generate(prompt: String): String {
            if (!isModelLoaded) {
                return "Error: Model not loaded"
            }
            return nativeGenerate(prompt)
        }
        
        fun getModelInfo(): String {
            return nativeGetModelInfo()
        }
        
        @Synchronized
        fun release() {
            nativeRelease()
            isInitialized = false
            isModelLoaded = false
            AppLog.i(TAG, "MNN released")
        }
        
        fun isInitialized(): Boolean = isInitialized
        fun isModelLoaded(): Boolean = isModelLoaded
    }
}
