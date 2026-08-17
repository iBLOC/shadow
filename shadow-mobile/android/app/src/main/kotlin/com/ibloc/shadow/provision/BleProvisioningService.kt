/* SPDX-License-Identifier: Apache-2.0
 *
 * v2.5 — BLE GATT provisioning of shadow-esp32 from the Android
 * side. We do all the heavy lifting here (GATT discovery, write
 * characteristic requests, status polling) so the Dart side
 * just has to bind a single MethodChannel and forward the
 * user's SSID + password.
 *
 * The character of this code matches shadow-esp32's
 * app/src/provision.c: a primary service at UUID
 * 12345678-0001-... with three characteristics
 *   - char 0002 (SSID)   : write
 *   - char 0003 (PSK)    : write
 *   - char 0004 (Status) : read
 */

package com.ibloc.shadow.provision

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BleProvisioningService(private val context: Context) {

    companion object {
        private const val TAG = "shadow-ble-provision"
        private val SERVICE_UUID = UUID.fromString(
            "12345678-0001-0000-0000-000000000000")
        private val CHAR_SSID  = UUID.fromString(
            "12345678-0002-0000-0000-000000000000")
        private val CHAR_PSK   = UUID.fromString(
            "12345678-0003-0000-0000-000000000000")
        private val CHAR_STATUS = UUID.fromString(
            "12345678-0004-0000-0000-000000000000")
        private val DEVICE_NAME_FRAG = "shadow-esp32 setup"
    }

    /**
     * Channel handler for `com.ibloc.shadow/ble_provision`. The
     * Dart side calls provision(ssid, psk) and gets back a
     * map { phase, device, address, status, error }.
     */
    fun attach(engine: FlutterEngine) {
        val channel = MethodChannel(engine.dartExecutor.binaryMessenger,
                                    "com.ibloc.shadow/ble_provision")
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "provision" -> {
                    val ssid = call.argument<String>("ssid") ?: ""
                    val psk  = call.argument<String>("psk") ?: ""
                    Thread {
                        val r = provisionSync(ssid, psk)
                        result.success(r)
                    }.start()
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun provisionSync(ssid: String, psk: String):
            Map<String, String>
    {
        val out = HashMap<String, String>()

        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE)
                as? BluetoothManager
        val adapter = mgr?.adapter ?: run {
            out["phase"] = "failed"
            out["error"] = "no Bluetooth adapter"
            return out
        }
        if (!adapter.isEnabled) {
            out["phase"] = "failed"
            out["error"] = "Bluetooth is off"
            return out
        }

        out["phase"] = "scanning"
        val device = scanForShadow(adapter)
            ?: run {
                out["phase"] = "failed"
                out["error"] = "no shadow-esp32 setup peripheral found"
                return out
            }
        out["deviceName"] = device.name ?: DEVICE_NAME_FRAG
        out["deviceAddress"] = device.address

        out["phase"] = "connecting"
        val gatt = device.connectGatt(context, false, gattCallback)
                ?: run {
            out["phase"] = "failed"
            out["error"] = "GATT connect returned null"
            return out
        }
        gatt.discoverServices()

        val ready = CountDownLatch(1).apply {
            gattCallback.cb = { run { countDown() } }
        }
        if (!ready.await(10, TimeUnit.SECONDS)) {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "service discovery timeout"
            return out
        }

        val svc = gatt.getService(SERVICE_UUID) ?: run {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "shadow provisioning service not found"
            return out
        }
        val cSsid = svc.getCharacteristic(CHAR_SSID) ?: run {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "SSID characteristic missing"
            return out
        }
        val cPsk = svc.getCharacteristic(CHAR_PSK) ?: run {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "PSK characteristic missing"
            return out
        }
        val cStatus = svc.getCharacteristic(CHAR_STATUS) ?: run {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "Status characteristic missing"
            return out
        }

        out["phase"] = "writingCredentials"
        cSsid.value = ssid.toByteArray(Charsets.UTF_8)
        gatt.writeCharacteristic(cSsid)
        cPsk.value = psk.toByteArray(Charsets.UTF_8)
        gatt.writeCharacteristic(cPsk)

        out["phase"] = "readingStatus"
        gatt.readCharacteristic(cStatus)
        val statusLatch = CountDownLatch(1)
        gattCallback.cb = { run { statusLatch.countDown() } }
        if (!statusLatch.await(5, TimeUnit.SECONDS)) {
            gatt.disconnect()
            out["phase"] = "failed"
            out["error"] = "status read timeout"
            return out
        }
        out["status"] = cStatus.value?.let { String(it, Charsets.UTF_8) }
            ?: "unknown"

        gatt.disconnect()
        out["phase"] = "connected"
        return out
    }

    private fun scanForShadow(adapter: BluetoothAdapter): BluetoothDevice? {
        val paired = adapter.bondedDevices ?: return null
        return paired.firstOrNull { (it.name ?: "")
            .contains(DEVICE_NAME_FRAG, ignoreCase = true) }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        var cb: (() -> Unit)? = null
        override fun onConnectionStateChange(g: BluetoothGatt, s: Int,
                                              newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) cb?.invoke()
        }
        override fun onServicesDiscovered(g: BluetoothGatt, s: Int) {
            cb?.invoke()
        }
        override fun onCharacteristicRead(g: BluetoothGatt,
                                           c: BluetoothGattCharacteristic,
                                           s: Int) {
            cb?.invoke()
        }
    }
}
