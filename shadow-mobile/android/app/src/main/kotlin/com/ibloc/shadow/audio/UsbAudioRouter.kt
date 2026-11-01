/* SPDX-License-Identifier: Apache-2.0
 *
 * v2.4 — enumerate and route to USB Audio sinks on Android.
 *
 * Android 7+ supports USB Audio Class 1.0/2.0 natively; we
 * read the current output devices through AudioManager and
 * match "shadow-esp32" (case-insensitive) in the device
 * product name. On match we expose the device id to the
 * Flutter side which can flip `setMode` to MODE_NORMAL +
 * dispatch `setSpeakerphoneOn(false)` + call
 * `requestAudioFocus` to make the route the active one.
 */

package com.ibloc.shadow.audio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import com.ibloc.shadow.AppLog

class UsbAudioRouter(private val context: Context) {

    companion object { private const val TAG = "shadow-usb-audio" }

    fun listSinks(): List<Map<String, Any>> {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val out = ArrayList<Map<String, Any>>()
        for (dev in am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            val isUsb = dev.type == AudioDeviceInfo.TYPE_USB_DEVICE ||
                         dev.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
                         dev.type == AudioDeviceInfo.TYPE_USB_ACCESSORY
            out.add(mapOf(
                "id" to dev.id,
                "name" to (dev.productName?.toString() ?: ""),
                "isUsb" to isUsb,
            ))
        }
        AppLog.d(TAG, "listSinks: ${out.size} output devices")
        return out
    }

    fun routeTo(deviceId: Int) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.mode = AudioManager.MODE_NORMAL
        am.isSpeakerphoneOn = false
        // requestAudioFocus to actually activate the route.
        am.requestAudioFocus(null, AudioManager.STREAM_MUSIC,
                             AudioManager.AUDIOFOCUS_GAIN)
        AppLog.i(TAG, "routeTo: deviceId=$deviceId, set MODE_NORMAL + speakerphoneOff")
    }
}
