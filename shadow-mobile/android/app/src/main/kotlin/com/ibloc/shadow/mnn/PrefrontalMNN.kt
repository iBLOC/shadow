package com.ibloc.shadow.mnn

import android.util.Log

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
            System.loadLibrary("mnnbridge")
            Log.i(TAG, "MNN bridge library loaded")
        }
        
        private external fun nativeInitialize(modelPath: String, threadNum: Int, backendType: Int): Boolean
        private external fun nativeLoadModel(configPath: String): Boolean
        private external fun nativeGenerate(prompt: String): String
        private external fun nativeGetModelInfo(): String
        private external fun nativeRelease()
        
        @Synchronized
        fun initialize(modelPath: String, threadNum: Int = 4, backendType: Int = BACKEND_CPU): Boolean {
            if (isInitialized) {
                Log.w(TAG, "MNN already initialized")
                return true
            }
            val result = nativeInitialize(modelPath, threadNum, backendType)
            isInitialized = result
            Log.i(TAG, "MNN initialized: $result")
            return result
        }
        
        @Synchronized
        fun loadModel(configPath: String): Boolean {
            if (!isInitialized) {
                Log.e(TAG, "MNN not initialized")
                return false
            }
            if (isModelLoaded) {
                Log.w(TAG, "Model already loaded")
                return true
            }
            val result = nativeLoadModel(configPath)
            isModelLoaded = result
            Log.i(TAG, "Model loaded: $result")
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
            Log.i(TAG, "MNN released")
        }
        
        fun isInitialized(): Boolean = isInitialized
        fun isModelLoaded(): Boolean = isModelLoaded
    }
}
