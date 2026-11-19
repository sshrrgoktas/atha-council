package com.atlascouncil.taskbridgelab

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color

/** Independent TEST application. Zero production Council/AthalAI credentials or backend access. */
class LabActivity:Activity() {
  override fun onCreate(savedInstanceState:Bundle?) {
    super.onCreate(savedInstanceState)
    val web=WebView(this)
    web.settings.javaScriptEnabled=true
    web.settings.blockNetworkLoads=true
    web.settings.domStorageEnabled=false
    web.settings.allowFileAccess=false
    web.settings.allowContentAccess=false
    web.webViewClient=object:WebViewClient(){
      override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?):Boolean=true
    }
    val source=assets.open("task-bridge-lab.html").bufferedReader().use{it.readText()}
    val engine=assets.open("task-bridge-engine.js").bufferedReader().use{it.readText()}
    // Inline the local engine, so the WebView never needs even local file permissions.
    val safeEngine=engine.replace("</script","<\\/script",ignoreCase=true)
    val page=source.replace("<!--ENGINE_HERE-->","<script>"+safeEngine+"</script>")
    web.loadDataWithBaseURL(null,page,"text/html","UTF-8",null)
    setContentView(web)
  }
}
