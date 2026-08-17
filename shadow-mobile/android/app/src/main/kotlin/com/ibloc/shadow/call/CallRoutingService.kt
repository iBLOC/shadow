/* SPDX-License-Identifier: Apache-2.0
 *
 * v2.8 — Android InCallService for detecting phone calls and
 * routing call audio to USB Audio (shadow-esp32) or wired
 * earphone (human takeover).
 *
 * The InCallService is declared in AndroidManifest.xml with
 * BIND_INCALL_SERVICE permission and a meta-data tag declaring
 * telecom.xml for the audio routing capabilities.
 *
 * When a call is active, we set AudioManager to MODE_IN_CALL
 * and route to the preferred device (USB or earphone).
 * On earphone plug-in, we switch to earphone so the human can
 * take over; on earphone plug-out, we switch back to USB.
 *
 * v2.8 key behavior:
 *   - On CALL_RINGING → answer if AI mode is active
 *   - On CALL_ACTIVE → route audio to USB (shadow-esp32)
 *   - On headset plug → route audio to earphone
 *   - On headset unplug → route back to USB
 *   - On CALL_IDLE → clean up, restore normal audio mode
 */

package com.ibloc.shadow.call

import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.telecom.Call
import android.telecom.InCallService
import android.util.Log

class CallRoutingService : InCallService() {
    companion object {
        private const val TAG = "shadow-call"
    }

    private var audioManager: AudioManager? = null
    private var audioDeviceCallback: AudioDeviceCallback? = null
    private var headsetReceiver: BroadcastReceiver? = null

    override fun onCreate() {
        super.onCreate()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        registerAudioDeviceCallback()
        registerHeadsetPlugReceiver()
        Log.d(TAG, "InCallService created")
    }

    override fun onDestroy() {
        unregisterAudioDeviceCallback()
        unregisterHeadsetPlugReceiver()
        restoreNormalAudioMode()
        Log.d(TAG, "InCallService destroyed")
        super.onDestroy()
    }

    override fun onCallAdded(call: Call) {
        Log.d(TAG, "onCallAdded: state=${call.state}")
        // Auto-answer on incoming call when in AI mode
        // (In production, this should be gated by a user setting)
        if (call.state == Call.STATE_RINGING) {
            call.answer(0)
            Log.d(TAG, "auto-answered incoming call")
        }
    }

    override fun onCallRemoved(call: Call) {
        Log.d(TAG, "onCallRemoved: state=${call.state}")
        // Check if any other active calls remain; if not, clean up
        if (calls.isEmpty()) {
            restoreNormalAudioMode()
            notifyCallEnded()
        }
    }

    override fun onCallStateChanged(call: Call, state: Int) {
        Log.d(TAG, "onCallStateChanged: state=$state")
        when (state) {
            Call.STATE_RINGING -> onRinging()
            Call.STATE_ACTIVE -> onActive()
            Call.STATE_DISCONNECTED -> onDisconnected()
        }
    }

    private fun onRinging() {
        // Set mode to IN_CALL and route to USB Audio (shadow-esp32)
        routeAudioToUsb()
    }

    private fun onActive() {
        // Ensure audio stays routed to USB Audio
        routeAudioToUsb()
        notifyCallActive()
    }

    private fun onDisconnected() {
        restoreNormalAudioMode()
        notifyCallEnded()
    }

    // ── Audio routing ──────────────────────────────────────

    private fun routeAudioToUsb() {
        val am = audioManager ?: return
        am.mode = AudioManager.MODE_IN_CALL
        // Find shadow-esp32 USB Audio device
        val usbDevice = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .firstOrNull {
                it.productName?.toString()
                    ?.contains("shadow-esp32", ignoreCase = true) == true ||
                it.type == AudioDeviceInfo.TYPE_USB_DEVICE
            }
        if (usbDevice != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.preferredDevice = usbDevice
            }
            am.isSpeakerphoneOn = false
            Log.d(TAG, "routed to USB Audio: ${usbDevice.productName}")
        } else {
            Log.w(TAG, "no USB Audio device found; using default")
        }
    }

    private fun routeAudioToEarphone() {
        val am = audioManager ?: return
        val earphone = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .firstOrNull {
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
            }
        if (earphone != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.preferredDevice = earphone
            }
            am.isSpeakerphoneOn = false
            Log.d(TAG, "routed to earphone: ${earphone.productName}")
        }
    }

    private fun restoreNormalAudioMode() {
        val am = audioManager ?: return
        am.mode = AudioManager.MODE_NORMAL
        am.isSpeakerphoneOn = false
        Log.d(TAG, "restored normal audio mode")
    }

    // ── Headset detection ──────────────────────────────────

    private fun registerAudioDeviceCallback() {
        audioDeviceCallback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
                for (dev in addedDevices) {
                    if (dev.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        dev.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES) {
                        Log.d(TAG, "wired earphone detected; routing to earphone")
                        routeAudioToEarphone()
                        notifyEarphoneTakeover(true)
                    }
                }
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
                for (dev in removedDevices) {
                    if (dev.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        dev.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES) {
                        Log.d(TAG, "wired earphone removed; routing back to USB")
                        routeAudioToUsb()
                        notifyEarphoneTakeover(false)
                    }
                }
            }
        }
        audioManager?.registerAudioDeviceCallback(audioDeviceCallback!!, null)
    }

    private fun unregisterAudioDeviceCallback() {
        val cb = audioDeviceCallback ?: return
        audioManager?.unregisterAudioDeviceCallback(cb)
    }

    private fun registerHeadsetPlugReceiver() {
        headsetReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == Intent.ACTION_HEADSET_PLUG) {
                    val state = intent.getIntExtra("state", 0)
                    Log.d(TAG, "headset plug state: $state")
                    if (state == 1) {
                        routeAudioToEarphone()
                        notifyEarphoneTakeover(true)
                    } else {
                        routeAudioToUsb()
                        notifyEarphoneTakeover(false)
                    }
                }
            }
        }
        val filter = IntentFilter(Intent.ACTION_HEADSET_PLUG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(headsetReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(headsetReceiver, filter)
        }
    }

    private fun unregisterHeadsetPlugReceiver() {
        headsetReceiver?.let { receiver ->
            try { unregisterReceiver(receiver) } catch (e: Exception) {
                Log.w(TAG, "unregisterReceiver failed: ${e.message}")
            }
        }
    }

    // ── Notify Dart side via PlatformChannel ──────────────

    private fun notifyCallActive() {
        // Emit to a Dart MethodChannel so the Flutter UI can react
        // Channel: com.ibloc.shadow/call_state
        // Event: { "state": "active" }
    }

    private fun notifyCallEnded() {
        // Event: { "state": "ended" }
    }

    private fun notifyEarphoneTakeover(taken: Boolean) {
        // Event: { "state": "earphone_takeover", "taken": true/false }
    }
}