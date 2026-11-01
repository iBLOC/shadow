package com.ibloc.shadow.mnn

import android.content.Context
import android.util.Log
import com.ibloc.shadow.AppLog

class OpenAIServerManager {
    companion object {
        private const val TAG = "OpenAIServerManager"
        const val DEFAULT_PORT = 8085

        @Volatile
        private var server: OpenAIServer? = null

        fun startServer(context: Context, port: Int = DEFAULT_PORT): Boolean {
            return try {
                if (server?.isRunning() == true) {
                    AppLog.w(TAG, "Server already running")
                    return true
                }

                val newServer = OpenAIServer(context).apply {
                    setPort(port)
                }
                if (newServer.start()) {
                    server = newServer
                    AppLog.i(TAG, "API Server started on port $port")
                    true
                } else {
                    AppLog.e(TAG, "Server failed to start on port $port")
                    false
                }
            } catch (e: Exception) {
                AppLog.e(TAG, "Failed to start server: ${e.message}")
                false
            }
        }

        fun stopServer() {
            try {
                server?.stop()
                server = null
                AppLog.i(TAG, "API Server stopped")
            } catch (e: Exception) {
                AppLog.e(TAG, "Failed to stop server: ${e.message}")
            }
        }

        fun isServerRunning(): Boolean = server?.isRunning() == true

        fun getServerUrl(): String = server?.getServerUrl() ?: ""

        fun getApiKey(): String = server?.getApiKey() ?: ""

        fun setApiKey(key: String) {
            server?.setApiKey(key)
        }

        fun setAuthEnabled(enabled: Boolean) {
            server?.setAuthEnabled(enabled)
        }

        fun setEngineProvider(provider: OpenAIServer.EngineProvider?) {
            server?.setEngineProviderCompat(provider)
        }
    }
}
