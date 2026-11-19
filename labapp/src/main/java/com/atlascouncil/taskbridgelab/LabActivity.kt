package com.atlascouncil.taskbridgelab

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Separate TEST application.
 * The HTML renderer cannot use the network, read files, or visit other origins.
 * Only the fixed independent LAB gateway is reachable through the native bridge.
 * No main Council login, cookies, room, database, or AthalAI tunnel.
 */
class LabActivity : Activity() {
  private lateinit var web: WebView
  private val gateway = "https://atha-council-taskbridge-lab.sshrrgoktas.workers.dev"
  private val prefs by lazy { getSharedPreferences("atha-test-model-gateway", MODE_PRIVATE) }

  private fun result(id: String, data: JSONObject) {
    runOnUiThread {
      if (::web.isInitialized)
        web.evaluateJavascript(
          "window.athaGatewayResult&&window.athaGatewayResult(" +
             JSONObject.quote(id) + "," + data.toString() + ")", null)
    }
  }

  private fun request(id: String, path: String, body: JSONObject? = null) {
    Thread {
      var connection: HttpURLConnection? = null
      try {
        connection = URL(gateway + path).openConnection() as HttpURLConnection
        connection.connectTimeout = 12000
        connection.readTimeout = 45000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Cache-Control", "no-store")
        if (body != null) {
          val bearer = prefs.getString("token", "").orEmpty()
          if (bearer.isEmpty()) throw IllegalStateException("Önce TEST bağlantı anahtarını gir.")
          connection.requestMethod = "POST"
          connection.doOutput = true
          connection.setRequestProperty("Authorization", "Bearer " + bearer)
          connection.setRequestProperty("Content-Type", "application/json")
          connection.outputStream.use {
            it.write(body.toString().toByteArray(Charsets.UTF_8))
          }
        }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val reply = stream?.bufferedReader()?.use { it.readText().take(16000) } ?: "{}"
        val parsed = try { JSONObject(reply) } catch (_: Exception) { JSONObject() }
        parsed.put("_http", status)
        result(id, parsed)
      } catch (e: Exception) {
        result(id, JSONObject().put("error", "TEST bağlantısı: " + (e.message ?: "Bilinmeyen hata").take(180)))
      } finally { connection?.disconnect() }
    }.start()
  }

  inner class LabNativeBridge {
    @JavascriptInterface fun tokenConfigured(): Boolean =
      !prefs.getString("token", "").isNullOrEmpty()

    @JavascriptInterface fun saveToken(raw: String): Boolean {
      val value = raw.trim()
      if (!value.matches(Regex("[A-Za-z0-9_-]{30,150}"))) return false
      prefs.edit().putString("token", value).apply()
      return true
    }

    @JavascriptInterface fun clearToken() {
      prefs.edit().remove("token").apply()
    }

    @JavascriptInterface fun health(id: String) {
      if (!id.matches(Regex("[A-Za-z0-9_-]{1,60}"))) return
      request(id, "/health")
    }

    // TEST only: two-step user approval in HTML before an isolated read-only OpenCode task.
    @JavascriptInterface fun createTask(id: String, raw: String) {
      if (!id.matches(Regex("[A-Za-z0-9_-]{1,60}")) || raw.length > 3500) return
      val input = try { JSONObject(raw) } catch (_: Exception) {
        result(id, JSONObject().put("error", "Geçersiz TEST görevi")); return
      }
      val context = input.optString("context").trim()
      val latest = input.optString("latest").trim()
      if (context.length > 1000 || latest.isBlank() || latest.length > 600 ||
          input.optString("confirm") != "SEND_TO_TEST_OPENCODE" ||
          !input.optBoolean("ownerApproved", false)) {
        result(id, JSONObject().put("error", "Açık TEST onayı veya bağlam eksik")); return
      }
      request(id, "/task/create", JSONObject()
        .put("context", context).put("latest", latest)
        .put("mode", "read_only_plan").put("ownerApproved", true)
        .put("review", input.optJSONObject("review") ?: JSONObject())
        .put("confirm", "SEND_TO_TEST_OPENCODE"))
    }

    @JavascriptInterface fun taskStatus(id: String, taskId: String) {
      if (!id.matches(Regex("[A-Za-z0-9_-]{1,60}")) ||
          !taskId.matches(Regex("lab_[a-f0-9-]{36}"))) return
      request(id, "/task/status", JSONObject().put("id", taskId))
    }

    @JavascriptInterface fun rememberTask(taskId: String) {
      if (taskId.matches(Regex("lab_[a-f0-9-]{36}")))
        prefs.edit().putString("last_task", taskId).apply()
    }
    @JavascriptInterface fun lastTask(): String = prefs.getString("last_task", "").orEmpty()

    @JavascriptInterface fun sendBugReport(id: String, raw: String) {
      if (!id.matches(Regex("[A-Za-z0-9_-]{1,60}")) || raw.length > 6300) return
      val data = try { JSONObject(raw) } catch (_: Exception) {
        result(id, JSONObject().put("error", "TEST raporu geçersiz")); return
      }
      if (!data.optBoolean("consent", false)) {
        result(id, JSONObject().put("error", "Rapor paylaşım onayı gerekli")); return
      }
      request(id, "/report/create", data)
    }

    @JavascriptInterface fun compare(id: String, raw: String) {
      if (!id.matches(Regex("[A-Za-z0-9_-]{1,60}")) || raw.length > 2600) return
      val data = try { JSONObject(raw) } catch (_: Exception) {
        result(id, JSONObject().put("error", "Geçersiz test isteği")); return
      }
      val context = data.optString("context").trim()
      val latest = data.optString("latest").trim()
      if (context.length > 1000 || latest.isEmpty() || latest.length > 600) {
        result(id, JSONObject().put("error", "Test metni çok uzun veya boş")); return
      }
      // Hard-coded whitelist: the device can never dispatch an arbitrary URL.
      val models = org.json.JSONArray().put("gemini").put("qwen").put("llama")
      request(id, "/compare", JSONObject()
        .put("context", context)
        .put("latest", latest)
        .put("models", models))
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    web = WebView(this)
    web.settings.javaScriptEnabled = true
    web.settings.blockNetworkLoads = true
    web.settings.domStorageEnabled = false
    web.settings.allowFileAccess = false
    web.settings.allowContentAccess = false
    web.settings.cacheMode = WebSettings.LOAD_NO_CACHE
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = true
    }
    web.addJavascriptInterface(LabNativeBridge(), "LabNative")
    val source = assets.open("task-bridge-lab.html").bufferedReader().use { it.readText() }
    val engine = assets.open("task-bridge-engine.js").bufferedReader().use { it.readText() }
    val safeEngine = engine.replace("</script", "<\\/script", ignoreCase = true)
    val page = source.replace("<!--ENGINE_HERE-->", "<script>" + safeEngine + "</script>")
    web.loadDataWithBaseURL(null, page, "text/html", "UTF-8", null)
    setContentView(web)
  }

  override fun onDestroy() {
    if (::web.isInitialized) web.destroy()
    super.onDestroy()
  }
}
