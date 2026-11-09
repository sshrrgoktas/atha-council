package com.atlascouncil.app

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.widget.*
import android.graphics.Color
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.os.Build
import android.os.Environment
import java.net.ServerSocket
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import org.json.JSONObject
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.jwk.source.RemoteJWKSet
import com.nimbusds.jose.proc.JWSVerificationKeySelector
import com.nimbusds.jwt.proc.DefaultJWTProcessor
import com.nimbusds.jose.proc.SecurityContext

class MainActivity: Activity() {
 private lateinit var status: TextView
 private lateinit var councilWeb: WebView
 private lateinit var prompt: EditText
 private lateinit var reply: TextView
 private lateinit var updateStatus: TextView
 private var downloadId: Long = -1L
 private var downloadReceiver: BroadcastReceiver? = null
 @Volatile private var accessToken: String? = null
 private val random=SecureRandom()
 private fun token(n:Int=32):String { val b=ByteArray(n);random.nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b) }
 private fun enc(s:String)=URLEncoder.encode(s,"UTF-8")
 private fun sha(s:String)=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(s.toByteArray()))
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
  val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(36,48,36,24);setBackgroundColor(Color.rgb(9,19,33)) }
  val title=TextView(this).apply { text="ATLAS COUNCIL";textSize=28f;setTextColor(Color.rgb(77,214,193)) }
  status=TextView(this).apply {text="ChatGPT bağlı değil. Giriş prototipi test edilmedi.";textSize=16f;setTextColor(Color.WHITE);setPadding(0,28,0,28)}
  val button=Button(this).apply {text="ChatGPT ile devam et (deneysel)";setOnClickListener{startLogin()} }
  prompt=EditText(this).apply {hint="Atlas'a bir mesaj yaz";setHintTextColor(Color.LTGRAY);setTextColor(Color.WHITE);minLines=2}
  reply=TextView(this).apply {text="Henüz yanıt yok";setTextColor(Color.WHITE);setPadding(0,18,0,18)}
  val send=Button(this).apply {text="ChatGPT yanıtını test et";setOnClickListener{sendMessage()} }
  updateStatus=TextView(this).apply {text="Güncellemeler kontrol edilmedi";setTextColor(Color.LTGRAY)}
  val checkUpdates=Button(this).apply {text="Güncellemeleri kontrol et";setOnClickListener{checkForUpdates(true)} }
  val web=Button(this).apply {text="Atlas Council web panelini aç";setOnClickListener{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://atlas-council.sshrrgoktas.workers.dev")))} }
  val nativeControls=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL}
  nativeControls.addView(status);nativeControls.addView(button);nativeControls.addView(prompt);nativeControls.addView(send);nativeControls.addView(reply);nativeControls.addView(updateStatus);nativeControls.addView(checkUpdates)
  nativeControls.visibility=android.view.View.GONE
  val nativeToggle=Button(this).apply {text="ChatGPT bağlantısı / yerel ayarlar";setOnClickListener {nativeControls.visibility=if(nativeControls.visibility==android.view.View.VISIBLE)android.view.View.GONE else android.view.View.VISIBLE}}
  councilWeb=WebView(this).apply {
   settings.javaScriptEnabled=true
   settings.domStorageEnabled=true
   webViewClient=object:WebViewClient(){
    override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?):Boolean{
     val u=request?.url?:return false
     return if(u.scheme=="https"&&u.host=="atlas-council.sshrrgoktas.workers.dev")false else {
      try{startActivity(Intent(Intent.ACTION_VIEW,u))}catch(_:Exception){}
      true
     }
    }
   }
   loadUrl("https://atlas-council.sshrrgoktas.workers.dev")
  }
  layout.addView(title);layout.addView(nativeToggle);layout.addView(councilWeb,LinearLayout.LayoutParams(-1,0,1f));layout.addView(nativeControls);setContentView(layout)
  checkForUpdates(false)
 }
 private fun startLogin(){status.text="Deneysel yerel bağlantı hazırlanıyor…";Thread {
  var server:ServerSocket?=null
  try {
   server=ServerSocket(0,1,java.net.InetAddress.getByName("127.0.0.1"));server.soTimeout=180000
   val redirect="http://127.0.0.1:${server.localPort}/auth/callback"
   val state=token();val nonce=token();val verifier=token(48)
   val hostId=getPreferences(MODE_PRIVATE).getString("host_id",null)?:"urn:uuid:${UUID.randomUUID()}".also{getPreferences(MODE_PRIVATE).edit().putString("host_id",it).apply()}
   val savedClient=getPreferences(MODE_PRIVATE).getString("client_id",null)
   val params=linkedMapOf("client_id" to (savedClient?:"dynamic_agent_client"),"ext_agent_host_id" to hostId,"response_type" to "code","redirect_uri" to redirect,"scope" to "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct","resource" to "https://api.openai.com/v1","state" to state,"nonce" to nonce,"code_challenge_method" to "S256","code_challenge" to sha(verifier))
   if(savedClient==null)params["agent_name_hint"]="Atlas Council"
   val url="https://auth.openai.com/api/accounts/authorize?"+params.entries.joinToString("&"){enc(it.key)+"="+enc(it.value)}
   runOnUiThread{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)));status.text="Tarayıcıda giriş iznini onayla…"}
   val socket=server.accept();socket.soTimeout=15000
   val input=socket.getInputStream().bufferedReader();val request=input.readLine()?:throw Exception("Boş dönüş")
   val path=request.split(" ").getOrNull(1)?:throw Exception("Hatalı dönüş")
   val uri=Uri.parse("http://127.0.0.1"+path)
   val valid=uri.path=="/auth/callback"&&uri.getQueryParameter("state")==state
   val response=if(valid)"<h2>Atlas Council</h2><p>Giriş dönüşü alındı. Uygulamaya dönebilirsin.</p>" else "<h2>Geçersiz giriş dönüşü</h2>"
   val bytes=response.toByteArray();socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n").toByteArray()+bytes);socket.close()
   if(!valid)throw Exception("Giriş doğrulaması başarısız")
   uri.getQueryParameter("error")?.let{throw Exception("Yetki verilmedi: $it")}
   val code=uri.getQueryParameter("code")?:throw Exception("Yetki kodu dönmedi")
   val client=uri.getQueryParameter("client_id")?:savedClient?:throw Exception("İstemci kimliği dönmedi")
   if(savedClient!=null&&client!=savedClient)throw Exception("İstemci kimliği uyuşmuyor")
   val form=mapOf("grant_type" to "authorization_code","client_id" to client,"code" to code,"code_verifier" to verifier,"redirect_uri" to redirect,"resource" to "https://api.openai.com/v1").entries.joinToString("&"){enc(it.key)+"="+enc(it.value)}
   val conn=URL("https://auth.openai.com/api/accounts/oauth/token").openConnection() as HttpURLConnection
   conn.requestMethod="POST";conn.doOutput=true;conn.setRequestProperty("Content-Type","application/x-www-form-urlencoded");conn.connectTimeout=15000;conn.readTimeout=20000;conn.outputStream.use{it.write(form.toByteArray())}
   if(conn.responseCode !in 200..299)throw Exception("Token değişimi reddedildi (${conn.responseCode})")
   val data=JSONObject(conn.inputStream.bufferedReader().readText())
   val jwt=data.optString("id_token");if(jwt.isBlank())throw Exception("Kimlik belirteci eksik")
   val processor=DefaultJWTProcessor<SecurityContext>()
   processor.jwsKeySelector=JWSVerificationKeySelector(JWSAlgorithm.RS256,RemoteJWKSet(URL("https://auth.openai.com/.well-known/jwks.json")))
   val claims=processor.process(jwt,null)
   if(claims.issuer!="https://auth.openai.com"||!claims.audience.contains(client)||claims.getStringClaim("nonce")!=nonce||claims.expirationTime.before(java.util.Date()))throw Exception("Kimlik doğrulaması geçersiz")
   val scopes=data.optString("scope").split(" ")
   if(!scopes.contains("chatgpt.tokens.use.direct"))throw Exception("ChatGPT model kullanım izni verilmedi")
   getPreferences(MODE_PRIVATE).edit().putString("client_id",client).apply()
   val tokenValue=data.optString("access_token")
   if(tokenValue.isBlank())throw Exception("Erişim belirteci dönmedi")
   accessToken=tokenValue
   runOnUiThread{status.text="ChatGPT kimliği doğrulandı. Model çağrısını test edebilirsin. Oturum yalnızca uygulama açıkken tutulur."}
  }catch(e:Exception){runOnUiThread{status.text="Bağlantı tamamlanamadı: ${e.message}"}}finally{try{server?.close()}catch(_:Exception){}}
 }.start()}
 private fun sendMessage() {
  val bearer=accessToken
  if(bearer.isNullOrBlank()){status.text="Önce ChatGPT ile giriş yap.";return}
  val message=prompt.text.toString().trim()
  if(message.isBlank()){status.text="Önce bir mesaj yaz.";return}
  reply.text="Model yanıtı bekleniyor…"
  Thread {
   try {
    val conn=URL("https://api.openai.com/v1/responses").openConnection() as HttpURLConnection
    conn.requestMethod="POST"
    conn.doOutput=true
    conn.connectTimeout=15000
    conn.readTimeout=60000
    conn.setRequestProperty("Authorization","Bearer $bearer")
    conn.setRequestProperty("Content-Type","application/json")
    val request=JSONObject().put("model","gpt-6.1-sol").put("input",message).toString()
    conn.outputStream.use {it.write(request.toByteArray(Charsets.UTF_8))}
    val statusCode=conn.responseCode
    val body=(if(statusCode in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use{it.readText()} ?: ""
    if(statusCode !in 200..299){ val detail=try{ val error=JSONObject(body).opt("error"); if(error is JSONObject) error.optString("message").ifBlank{error.toString()} else if(error is String) error else body }catch(_:Exception){body}; throw Exception("Model çağrısı reddedildi (HTTP $statusCode): "+detail.take(600)) }
    val obj=JSONObject(body)
    val output=obj.optJSONArray("output")
    val lines=mutableListOf<String>()
    if(output!=null)for(i in 0 until output.length()){
     val contents=output.optJSONObject(i)?.optJSONArray("content")?:continue
     for(j in 0 until contents.length()){val part=contents.optJSONObject(j)?:continue;if(part.optString("type")=="output_text")lines.add(part.optString("text"))}
    }
    runOnUiThread{reply.text=lines.joinToString("\\n").ifBlank{"Model yanıtı boş döndü."}}
   }catch(e:Exception){runOnUiThread{reply.text="Bağlantı testi başarısız: "+(e.message?:"Bilinmeyen hata")}}
  }.start()
 }

 private fun currentVersion(): Long {
  val info=packageManager.getPackageInfo(packageName,0)
  return if(Build.VERSION.SDK_INT>=28)info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
 }
 private fun checkForUpdates(showCurrent:Boolean) {
  if(showCurrent)updateStatus.text="Yeni sürüm kontrol ediliyor…"
  Thread {
   try {
    val conn=URL("https://api.github.com/repos/sshrrgoktas/atlas-council/releases/tags/latest-debug").openConnection() as HttpURLConnection
    conn.connectTimeout=12000;conn.readTimeout=12000
    conn.setRequestProperty("Accept","application/vnd.github+json")
    conn.setRequestProperty("User-Agent","AtlasCouncilAndroid")
    if(conn.responseCode!=200)throw Exception("Sürüm bilgisi alınamadı (HTTP ${conn.responseCode})")
    val json=JSONObject(conn.inputStream.bufferedReader().use{it.readText()})
    val version=Regex("versionCode:\\s*(\\d+)").find(json.optString("body"))?.groupValues?.get(1)?.toLongOrNull()
      ?:throw Exception("Sürüm numarası bulunamadı")
    val assets=json.getJSONArray("assets")
    var downloadUrl:String?=null
    for(i in 0 until assets.length()){
     val a=assets.getJSONObject(i)
     if(a.optString("name")=="atlas-council-debug.apk")downloadUrl=a.optString("browser_download_url")
    }
    if(downloadUrl.isNullOrBlank())throw Exception("APK sürüm dosyası bulunamadı")
    runOnUiThread{
     if(version>currentVersion()){
      updateStatus.text="Yeni sürüm var: #$version"
      android.app.AlertDialog.Builder(this).setTitle("Atlas Council güncellemesi")
       .setMessage("Yeni sürüm #$version indirilsin mi? Android kurulum için ayrıca onay isteyecek.")
       .setNegativeButton("Sonra",null)
       .setPositiveButton("İndir"){_,_->downloadUpdate(downloadUrl)}.show()
     }else if(showCurrent){updateStatus.text="Uygulama güncel (sürüm ${currentVersion()})."}
    }
   }catch(e:Exception){if(showCurrent)runOnUiThread{updateStatus.text="Güncelleme kontrolü başarısız: ${e.message}"}}
  }.start()
 }
 private fun downloadUpdate(url:String) {
  try{
   val uri=Uri.parse(url)
   if(uri.scheme!="https"||uri.host!="github.com")throw Exception("Güvenilmeyen indirme adresi")
   val request=DownloadManager.Request(uri).setTitle("Atlas Council güncellemesi")
     .setDescription("Android APK indiriliyor")
     .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
     .setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,"atlas-council-update.apk")
   val manager=getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
   downloadId=manager.enqueue(request)
   updateStatus.text="APK indiriliyor…"
   downloadReceiver?.let{unregisterReceiver(it)}
   downloadReceiver=object:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
     if(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1L)!=downloadId)return
     val query=DownloadManager.Query().setFilterById(downloadId)
     manager.query(query)?.use{cursor->
      if(cursor.moveToFirst()){
       val state=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
       if(state==DownloadManager.STATUS_SUCCESSFUL){
        updateStatus.text="İndirme tamamlandı. Kurulumu onayla."
        val apkUri=manager.getUriForDownloadedFile(downloadId)
        if(apkUri!=null){
         val install=Intent(Intent.ACTION_VIEW).setDataAndType(apkUri,"application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
         try{startActivity(install)}catch(e:Exception){updateStatus.text="İndirildi. İndirme bildiriminden APK'yı aç."}
        }
       }else updateStatus.text="APK indirilemedi."
      }
     }
     try{unregisterReceiver(this)}catch(_:Exception){}
     downloadReceiver=null
    }
   }
   val filter=IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
   if(Build.VERSION.SDK_INT>=33)registerReceiver(downloadReceiver,filter,Context.RECEIVER_NOT_EXPORTED)
   else @Suppress("DEPRECATION") registerReceiver(downloadReceiver,filter)
  }catch(e:Exception){updateStatus.text="Güncelleme indirilemedi: ${e.message}"}
 }
 override fun onDestroy(){
  if(::councilWeb.isInitialized)councilWeb.destroy()
  downloadReceiver?.let{try{unregisterReceiver(it)}catch(_:Exception){}}
  downloadReceiver=null
  super.onDestroy()
 }

}
