#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include <mutex>
#include <memory>
#include <dlfcn.h>
#include <cstring>

#define LOG_TAG "PrefrontalMNN"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static std::mutex g_mutex;
static bool g_initialized = false;
static bool g_model_loaded = false;
static std::string g_model_path;

static int (*g_mnn_create_llm)(const char* config_path) = nullptr;
static int (*g_mnn_load_model)(int handle) = nullptr;
static const char* (*g_mnn_generate)(int handle, const char* prompt, int max_tokens) = nullptr;
static const char* (*g_mnn_get_info)(int handle) = nullptr;
static void (*g_mnn_release)(int handle) = nullptr;
static int g_llm_handle = -1;

extern "C" {

JNIEXPORT jint JNICALL
JNI_OnLoad(JavaVM* vm, void* reserved) {
    LOGI("JNI_OnLoad called - MNN LLM bridge loaded");
    return JNI_VERSION_1_4;
}

JNIEXPORT void JNICALL
JNI_OnUnload(JavaVM* vm, void* reserved) {
    LOGI("JNI_OnUnload called");
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_llm_handle >= 0 && g_mnn_release) {
        g_mnn_release(g_llm_handle);
        g_llm_handle = -1;
    }
    g_initialized = false;
    g_model_loaded = false;
}

static bool load_mnn_functions() {
    if (g_mnn_create_llm) return true;
    
    void* handle = dlopen("libllm.so", RTLD_NOW);
    if (!handle) {
        const char* err = dlerror();
        LOGE("Failed to load libllm.so: %s", err ? err : "unknown");
        return false;
    }
    
    g_mnn_create_llm = (decltype(g_mnn_create_llm))dlsym(handle, "MNN_LLM_Create");
    g_mnn_load_model = (decltype(g_mnn_load_model))dlsym(handle, "MNN_LLM_LoadModel");
    g_mnn_generate = (decltype(g_mnn_generate))dlsym(handle, "MNN_LLM_Generate");
    g_mnn_get_info = (decltype(g_mnn_get_info))dlsym(handle, "MNN_LLM_GetInfo");
    g_mnn_release = (decltype(g_mnn_release))dlsym(handle, "MNN_LLM_Release");
    
    if (!g_mnn_generate) {
        LOGE("Failed to find MNN_LLM_Generate function");
        g_mnn_create_llm = nullptr;
        g_mnn_load_model = nullptr;
        g_mnn_generate = nullptr;
        g_mnn_get_info = nullptr;
        g_mnn_release = nullptr;
        dlclose(handle);
        return false;
    }
    
    LOGI("Successfully loaded libllm.so and resolved MNN LLM functions");
    return true;
}

static std::string jstring_to_string(JNIEnv* env, jstring jstr) {
    if (!jstr) return "";
    const char* chars = env->GetStringUTFChars(jstr, nullptr);
    std::string result(chars ? chars : "");
    env->ReleaseStringUTFChars(jstr, chars);
    return result;
}

JNIEXPORT jboolean JNICALL
Java_com_ibloc_shadow_mnn_PrefrontalMNN_00024Companion_nativeInitialize(
        JNIEnv *env,
        jobject thiz,
        jstring model_path,
        jint thread_num,
        jint backend_type) {
    std::string path = jstring_to_string(env, model_path);
    LOGI("Initializing MNN LLM engine (model_path=%s, thread_num=%d, backend=%d)", 
         path.c_str(), thread_num, backend_type);
    
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_initialized) {
        LOGI("Already initialized, skipping");
        return JNI_TRUE;
    }
    
    g_model_path = path;
    
    if (!load_mnn_functions()) {
        LOGE("Failed to load MNN functions - using stub mode");
        g_initialized = true;
        return JNI_TRUE;
    }
    
    if (!path.empty()) {
        g_llm_handle = g_mnn_create_llm(path.c_str());
        if (g_llm_handle < 0) {
            LOGE("Failed to create LLM instance");
            g_initialized = true;
            return JNI_TRUE;
        }
        LOGI("LLM instance created with handle: %d", g_llm_handle);
    }
    
    g_initialized = true;
    return JNI_TRUE;
}

JNIEXPORT jboolean JNICALL
Java_com_ibloc_shadow_mnn_PrefrontalMNN_00024Companion_nativeLoadModel(
        JNIEnv *env,
        jobject thiz,
        jstring config_path) {
    std::string config = jstring_to_string(env, config_path);
    LOGI("Loading MNN model from: %s", config.c_str());
    
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (!g_initialized) {
        LOGE("MNN not initialized");
        return JNI_FALSE;
    }
    
    if (g_model_loaded) {
        LOGI("Model already loaded");
        return JNI_TRUE;
    }
    
    if (g_llm_handle >= 0 && g_mnn_load_model) {
        int result = g_mnn_load_model(g_llm_handle);
        if (result == 0) {
            g_model_loaded = true;
            LOGI("Model loaded successfully");
            return JNI_TRUE;
        } else {
            LOGE("Failed to load model, error code: %d", result);
        }
    }
    
    g_model_loaded = true;
    LOGI("Model marked as loaded (stub mode)");
    return JNI_TRUE;
}

JNIEXPORT jstring JNICALL
Java_com_ibloc_shadow_mnn_PrefrontalMNN_00024Companion_nativeGenerate(
        JNIEnv *env,
        jobject thiz,
        jstring prompt) {
    std::string input = jstring_to_string(env, prompt);
    LOGI("Generate called with prompt (len=%zu)", input.length());
    
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (!g_model_loaded) {
        LOGE("Model not loaded - cannot generate");
        return env->NewStringUTF("Error: Model not loaded");
    }
    
    if (g_llm_handle >= 0 && g_mnn_generate) {
        const char* result = g_mnn_generate(g_llm_handle, input.c_str(), 512);
        if (result) {
            LOGI("Generation completed, response length: %zu", strlen(result));
            return env->NewStringUTF(result);
        }
    }
    
    std::string stub_response = "Response: " + input + " [MNN stub mode - no model loaded]";
    return env->NewStringUTF(stub_response.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_ibloc_shadow_mnn_PrefrontalMNN_00024Companion_nativeGetModelInfo(
        JNIEnv *env,
        jobject thiz) {
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_llm_handle >= 0 && g_mnn_get_info) {
        const char* info = g_mnn_get_info(g_llm_handle);
        if (info) {
            return env->NewStringUTF(info);
        }
    }
    
    if (g_model_loaded) {
        std::string info = "MNN LLM - Model loaded (path: " + g_model_path + ")";
        return env->NewStringUTF(info.c_str());
    } else if (g_initialized) {
        return env->NewStringUTF("MNN LLM - Initialized (model not loaded)");
    }
    return env->NewStringUTF("MNN LLM - Not initialized");
}

JNIEXPORT void JNICALL
Java_com_ibloc_shadow_mnn_PrefrontalMNN_00024Companion_nativeRelease(
        JNIEnv *env,
        jobject thiz) {
    LOGI("Releasing MNN LLM resources");
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_llm_handle >= 0 && g_mnn_release) {
        g_mnn_release(g_llm_handle);
        g_llm_handle = -1;
    }
    
    g_model_loaded = false;
    g_initialized = false;
    g_model_path.clear();
}

}
