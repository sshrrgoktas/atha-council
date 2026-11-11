package com.atlascouncil.app

import android.app.Activity
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.content.Intent
import android.net.Uri
import android.widget.*
import android.graphics.Color
import android.webkit.WebView
import android.webkit.CookieManager
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.JavascriptInterface
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
 private lateinit var loginButton: Button
 private lateinit var testButton: Button
 private lateinit var authBadge: TextView
 private lateinit var councilWeb: WebView
 private lateinit var nativeSettingsDialog: android.app.AlertDialog
 private var lastWebRefresh:Long=0L
 private var googleVerifier:String?=null
 private var githubVerifier:String?=null
 private lateinit var prompt: EditText
 private lateinit var reply: TextView
 private lateinit var updateStatus: TextView
 private var downloadId: Long = -1L
 private var downloadInProgress = false
 private var downloadReceiver: BroadcastReceiver? = null
 @Volatile private var accessToken: String? = null
 private val random=SecureRandom()
 private fun councilCallback(id:String,payload:JSONObject){
  if(!::councilWeb.isInitialized)return
  runOnUiThread { councilWeb.evaluateJavascript("window.atlasNativeResult&&window.atlasNativeResult("+JSONObject.quote(id)+","+payload.toString()+")",null) }
 }
 inner class CouncilBridge {
  @JavascriptInterface fun shareText(title:String,content:String){
   if(content.length>1000000)return
   runOnUiThread {
    val intent=Intent(Intent.ACTION_SEND).apply {
     type="text/plain"
     putExtra(Intent.EXTRA_SUBJECT,title.take(120))
     putExtra(Intent.EXTRA_TEXT,content)
    }
    startActivity(Intent.createChooser(intent,"Atha Council sohbetini paylaş"))
   }
  }
  // Expose updates to the web drawer as well as the always-visible native toolbar.
  @JavascriptInterface fun openUpdates(){
   runOnUiThread{checkForUpdates(true)}
  }
  @JavascriptInterface fun installedVersion():Long = currentVersion()
  @JavascriptInterface fun connected():Boolean = !accessToken.isNullOrBlank()
  @JavascriptInterface fun ask(id:String,message:String){
   if(!id.matches(Regex("[A-Za-z0-9_-]{1,48}"))||message.length>4000||message.isBlank())return
   runOnUiThread {
    android.app.AlertDialog.Builder(this@MainActivity).setTitle("Atha / ChatGPT isteği")
     .setMessage("Bu mesajı bağlı ChatGPT hesabıyla göndermeyi onaylıyor musun?\\n\\n"+message.take(220))
     .setNegativeButton("Vazgeç"){_,_->councilCallback(id,JSONObject().put("error","İstek onaylanmadı"))}
     .setPositiveButton("Gönder"){_,_->callNativeModel(id,message)}.show()
   }
  }
 }
 private fun callNativeModel(id:String,message:String){
  val bearer=accessToken
  if(bearer.isNullOrBlank()){councilCallback(id,JSONObject().put("error","ChatGPT oturumu bağlı değil"));return}
  Thread {
   var conn:HttpURLConnection?=null
   try {
    conn=URL("https://api.openai.com/v1/responses").openConnection() as HttpURLConnection
    conn.requestMethod="POST";conn.doOutput=true;conn.connectTimeout=15000;conn.readTimeout=90000
    conn.setRequestProperty("Authorization","Bearer $bearer")
    conn.setRequestProperty("Content-Type","application/json")
    conn.setRequestProperty("Accept","text/event-stream")
    val input=org.json.JSONArray().put(JSONObject().put("role","user").put("content",org.json.JSONArray().put(JSONObject().put("type","input_text").put("text",message))))
    val request=JSONObject().put("model","gpt-6.1-sol").put("store",false).put("stream",true).put("input",input)
    conn.outputStream.use{it.write(request.toString().toByteArray(Charsets.UTF_8))}
    val code=conn.responseCode
    if(code !in 200..299){
     val error=conn.errorStream?.bufferedReader()?.use{it.readText()}?:""
     throw Exception("OpenAI HTTP $code: "+error.take(350))
    }
    val answer=StringBuilder()
    var completed=false
    conn.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
     while(true){
      val line=reader.readLine()?:break
      if(!line.startsWith("data:"))continue
      val data=line.substring(5).trim()
      if(data.isEmpty()||data=="[DONE]")continue
      val event=try{JSONObject(data)}catch(_:Exception){continue}
      when(event.optString("type")){
       "response.output_text.delta" -> answer.append(event.optString("delta"))
       "response.output_text.done" -> if(answer.isEmpty())answer.append(event.optString("text"))
       "response.completed" -> completed=true
       "response.failed" -> throw Exception("Model yanıtı başarısız: "+event.optJSONObject("response")?.optJSONObject("error")?.optString("message","Bilinmeyen hata"))
       "error" -> throw Exception(event.optString("message",event.toString().take(350)))
      }
     }
    }
    if(!completed)throw Exception("Akış tamamlanmadı; eksik yanıt gösterilmedi")
    councilCallback(id,JSONObject().put("text",answer.toString().ifBlank{"Model boş yanıt döndürdü"}))
   }catch(e:Exception){councilCallback(id,JSONObject().put("error",e.message?:"Bağlantı hatası"))}
   finally{conn?.disconnect()}
  }.start()
 }

 private fun startGitHubLogin(){
  val verifier=token(48)
  githubVerifier=verifier
  getPreferences(MODE_PRIVATE).edit().putString("github_pending_verifier",verifier).apply()
  val url="https://atlas-council.sshrrgoktas.workers.dev/auth/github/start?mobile=1&challenge="+enc(sha(verifier))
  try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}catch(e:Exception){
   runOnUiThread{Toast.makeText(this,"GitHub giriş tarayıcısı açılamadı",Toast.LENGTH_LONG).show()}
  }
 }
 private fun completeGitHubLogin(ticket:String){
  if(ticket.isBlank()||ticket.length>7000)return
  val verifier=githubVerifier?:getPreferences(MODE_PRIVATE).getString("github_pending_verifier",null)?:return
  githubVerifier=null
  getPreferences(MODE_PRIVATE).edit().remove("github_pending_verifier").apply()
  Thread {
   var conn:HttpURLConnection?=null
   try{
    conn=URL("https://atlas-council.sshrrgoktas.workers.dev/auth/github/mobile-exchange").openConnection() as HttpURLConnection
    conn.requestMethod="POST";conn.doOutput=true;conn.connectTimeout=12000;conn.readTimeout=12000
    conn.setRequestProperty("Content-Type","application/json")
    val body=JSONObject().put("ticket",ticket).put("verifier",verifier).toString()
    conn.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))}
    if(conn.responseCode!=200)throw Exception("GitHub doğrulaması reddedildi (HTTP "+conn.responseCode+")")
    val result=JSONObject(conn.inputStream.bufferedReader().use{it.readText()})
    val cookie=result.getString("cookie")
    if(!cookie.startsWith("atlas_copilot_session=")||!result.optBoolean("connected"))throw Exception("GitHub oturum verisi geçersiz")
    runOnUiThread{
     CookieManager.getInstance().setAcceptCookie(true)
     CookieManager.getInstance().setCookie("https://atlas-council.sshrrgoktas.workers.dev",cookie){saved->
      if(saved){CookieManager.getInstance().flush();councilWeb.loadUrl("https://atlas-council.sshrrgoktas.workers.dev/council-v2?github=connected")}
      else Toast.makeText(this,"GitHub oturumu uygulamaya aktarılamadı",Toast.LENGTH_LONG).show()
     }
    }
   }catch(e:Exception){runOnUiThread{Toast.makeText(this,"Copilot GitHub bağlantısı: "+(e.message?:"Hata"),Toast.LENGTH_LONG).show()}}
   finally{conn?.disconnect()}
  }.start()
 }

 private fun startGoogleLogin(){
  val verifier=token(48);googleVerifier=verifier;getPreferences(MODE_PRIVATE).edit().putString("google_pending_verifier",verifier).apply()
  val digest=sha(verifier)
  val url="https://atlas-council.sshrrgoktas.workers.dev/auth/google/start?mobile=1&challenge="+enc(digest)
  try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)))}catch(e:Exception){Toast.makeText(this,"Google girişi açılamadı",Toast.LENGTH_LONG).show()}
 }
 private fun completeGoogleLogin(ticket:String){
  val verifier=googleVerifier?:getPreferences(MODE_PRIVATE).getString("google_pending_verifier",null)?:return
  googleVerifier=null;getPreferences(MODE_PRIVATE).edit().remove("google_pending_verifier").apply()
  Thread {
   var conn:HttpURLConnection?=null
   try{
    conn=URL("https://atlas-council.sshrrgoktas.workers.dev/auth/google/mobile-exchange").openConnection() as HttpURLConnection
    conn.requestMethod="POST";conn.doOutput=true;conn.connectTimeout=12000;conn.readTimeout=12000
    conn.setRequestProperty("Content-Type","application/json")
    val body=JSONObject().put("ticket",ticket).put("verifier",verifier).toString()
    conn.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))}
    if(conn.responseCode!=200)throw Exception("Google oturum aktarımı reddedildi: "+conn.responseCode)
    val result=JSONObject(conn.inputStream.bufferedReader().use{it.readText()})
    val cookie=result.getString("cookie")
    if(!cookie.startsWith("atlas_google="))throw Exception("Oturum verisi geçersiz")
    runOnUiThread{
     CookieManager.getInstance().setAcceptCookie(true)
     CookieManager.getInstance().setCookie("https://atlas-council.sshrrgoktas.workers.dev",cookie){ok->
      if(ok){CookieManager.getInstance().flush();councilWeb.loadUrl("https://atlas-council.sshrrgoktas.workers.dev/council-v2?google=connected")}
      else Toast.makeText(this,"Google oturumu uygulamaya kaydedilemedi",Toast.LENGTH_LONG).show()
     }
    }
   }catch(e:Exception){runOnUiThread{Toast.makeText(this,"Gemini bağlantısı: "+e.message,Toast.LENGTH_LONG).show()}}
   finally{conn?.disconnect()}
  }.start()
 }
 override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);val uri=intent.data;if(uri?.scheme=="atlascouncil"&&uri.host=="google-auth"){val ticket=uri.getQueryParameter("ticket");if(!ticket.isNullOrBlank())completeGoogleLogin(ticket)}else if(uri?.scheme=="atlascouncil"&&uri.host=="github-auth"){val ticket=uri.getQueryParameter("ticket");if(!ticket.isNullOrBlank())completeGitHubLogin(ticket)}}
 private fun token(n:Int=32):String { val b=ByteArray(n);random.nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b) }
 private fun enc(s:String)=URLEncoder.encode(s,"UTF-8")
 private fun sha(s:String)=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(s.toByteArray()))
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
  val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setBackgroundColor(Color.rgb(9,19,33)) }
  val title=TextView(this).apply { text="AthalAI";textSize=28f;setTextColor(Color.rgb(77,214,193)) }
  status=TextView(this).apply {text="ChatGPT bağlı değil. Giriş prototipi test edilmedi.";textSize=16f;setTextColor(Color.WHITE);setPadding(0,28,0,28)}
  loginButton=Button(this).apply {text="ChatGPT ile devam et (deneysel)";setOnClickListener{startLogin()} }
  authBadge=TextView(this).apply {text="ChatGPT bağlı değil";textSize=17f;setTextColor(Color.rgb(77,214,193));visibility=android.view.View.GONE}
  prompt=EditText(this).apply {hint="Atha'ya bir mesaj yaz";setHintTextColor(Color.LTGRAY);setTextColor(Color.WHITE);minLines=2}
  reply=TextView(this).apply {text="Henüz yanıt yok";setTextColor(Color.WHITE);setPadding(0,18,0,18)}
  testButton=Button(this).apply {text="ChatGPT yanıtını test et";setOnClickListener{sendMessage()} }
  updateStatus=TextView(this).apply {text="Güncellemeler kontrol edilmedi";setTextColor(Color.LTGRAY)}
  val checkUpdates=Button(this).apply {text="Güncellemeleri kontrol et";setOnClickListener{checkForUpdates(true)} }
  val web=Button(this).apply {text="Gemini / Atha Council (tarayıcıda)";setOnClickListener{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://atlas-council.sshrrgoktas.workers.dev/council-v2")))} }
  val nativeControls=LinearLayout(this).apply {orientation=LinearLayout.VERTICAL}
  nativeControls.addView(status);nativeControls.addView(authBadge);nativeControls.addView(loginButton);nativeControls.addView(prompt);nativeControls.addView(testButton);nativeControls.addView(reply);nativeControls.addView(updateStatus);nativeControls.addView(checkUpdates);nativeControls.addView(web)
  val nativeScroll=ScrollView(this).apply {addView(nativeControls);setPadding(18,8,18,8)}
  nativeSettingsDialog=android.app.AlertDialog.Builder(this).setTitle("Bağlantılar ve güncellemeler").setView(nativeScroll).setPositiveButton("Kapat"){d,_->d.dismiss()}.create()
  councilWeb=WebView(this).apply {
   settings.javaScriptEnabled=true
   addJavascriptInterface(CouncilBridge(),"AtlasNative")
   settings.domStorageEnabled=true
   settings.cacheMode=WebSettings.LOAD_NO_CACHE
   clearHistory()
   clearCache(true)
   webViewClient=object:WebViewClient(){
    override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?):Boolean{
     val u=request?.url?:return false
     // Both OAuth providers use Chrome and return a verified, short-lived ticket to the APK.
     if(u.scheme=="https"&&u.host=="atlas-council.sshrrgoktas.workers.dev"&&u.path=="/auth/github/start"){
      startGitHubLogin()
      return true
     }
     if(u.scheme=="https"&&u.host=="atlas-council.sshrrgoktas.workers.dev"&&u.path=="/auth/google/start"){
      startGoogleLogin()
      return true
     }
     return if(u.scheme=="https"&&u.host=="atlas-council.sshrrgoktas.workers.dev")false else {
      try{startActivity(Intent(Intent.ACTION_VIEW,u))}catch(_:Exception){}
      true
     }
    }
   }
   clearCache(true)
   loadUrl("https://atlas-council.sshrrgoktas.workers.dev/council-v2?source=android&refresh="+System.currentTimeMillis())
  }
  // Full-screen WebView: all update and connection actions live in the side menu.
  layout.addView(councilWeb,LinearLayout.LayoutParams(-1,-1))
  setContentView(layout)
  // Web UI updates arrive from Cloudflare; APK updates are checked only on request.
  val incoming=intent?.data;if(incoming?.scheme=="atlascouncil"&&incoming.host=="google-auth"){incoming.getQueryParameter("ticket")?.let{completeGoogleLogin(it)}}else if(incoming?.scheme=="atlascouncil"&&incoming.host=="github-auth"){incoming.getQueryParameter("ticket")?.let{completeGitHubLogin(it)}}
  // Future releases appear in-app without asking users to find or download an APK file.
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
   if(savedClient==null)params["agent_name_hint"]="Atha Council"
   val url="https://auth.openai.com/api/accounts/authorize?"+params.entries.joinToString("&"){enc(it.key)+"="+enc(it.value)}
   runOnUiThread{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)));status.text="Tarayıcıda giriş iznini onayla…"}
   val socket=server.accept();socket.soTimeout=15000
   val input=socket.getInputStream().bufferedReader();val request=input.readLine()?:throw Exception("Boş dönüş")
   val path=request.split(" ").getOrNull(1)?:throw Exception("Hatalı dönüş")
   val uri=Uri.parse("http://127.0.0.1"+path)
   val valid=uri.path=="/auth/callback"&&uri.getQueryParameter("state")==state
   val response=if(valid)"<h2>Atha Council</h2><p>Giriş dönüşü alındı. Uygulamaya dönebilirsin.</p>" else "<h2>Geçersiz giriş dönüşü</h2>"
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
   runOnUiThread{
    authBadge.text="✓ ChatGPT hesabı bağlı"
    authBadge.visibility=android.view.View.VISIBLE
    loginButton.visibility=android.view.View.GONE
    testButton.visibility=android.view.View.GONE
    prompt.visibility=android.view.View.GONE
    reply.visibility=android.view.View.GONE
    status.text="Kimlik doğrulandı. Model erişimi henüz doğrulanmadı; web konseyine otomatik aktarılmaz. Oturum uygulama açıkken geçerlidir."
   }
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
    val request=JSONObject().put("model","gpt-6.1-sol").put("store",false).put("input",org.json.JSONArray().put(JSONObject().put("role","user").put("content",org.json.JSONArray().put(JSONObject().put("type","input_text").put("text",message))))).toString()
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
 private fun sendUpdateResult(state:String,latest:Long?,description:String){
  runOnUiThread {
   if(!::councilWeb.isInitialized)return@runOnUiThread
   val data=JSONObject().put("state",state).put("installed",currentVersion())
    .put("latest",latest?:JSONObject.NULL).put("message",description.take(250))
   councilWeb.evaluateJavascript("window.atlasUpdateResult&&window.atlasUpdateResult("+data.toString()+")",null)
  }
 }
 private fun checkForUpdates(showCurrent:Boolean) {
  if(showCurrent){
   updateStatus.text="Yeni sürüm kontrol ediliyor…"
   sendUpdateResult("checking",null,"Güncelleme kontrol ediliyor…")
  }
  Thread {
   try {
    val conn=URL("https://api.github.com/repos/sshrrgoktas/atha-council/releases/tags/latest-debug").openConnection() as HttpURLConnection
    conn.connectTimeout=12000;conn.readTimeout=12000
    conn.setRequestProperty("Accept","application/vnd.github+json")
    conn.setRequestProperty("User-Agent","AthaCouncilAndroid")
    if(conn.responseCode!=200)throw Exception("Sürüm bilgisi alınamadı (HTTP ${conn.responseCode})")
    val json=JSONObject(conn.inputStream.bufferedReader().use{it.readText()})
    val version=Regex("versionCode:\\s*(\\d+)").find(json.optString("body"))?.groupValues?.get(1)?.toLongOrNull()
      ?:throw Exception("Sürüm numarası bulunamadı")
    val assets=json.getJSONArray("assets")
    var downloadUrl:String?=null
    for(i in 0 until assets.length()){
     val a=assets.getJSONObject(i)
     val assetName=a.optString("name")
     if(assetName=="atha-council.apk" || (downloadUrl.isNullOrBlank()&&assetName=="atlas-council-debug.apk"))downloadUrl=a.optString("browser_download_url")
    }
    if(downloadUrl.isNullOrBlank())throw Exception("APK sürüm dosyası bulunamadı")
    runOnUiThread{
     if(version>currentVersion()){
      updateStatus.text="Yeni sürüm var: #$version"
      if(showCurrent){
       sendUpdateResult("available",version,"Android sürümü $version hazır. İstersen indirip kurabilirsin.")
       android.app.AlertDialog.Builder(this).setTitle("Atha Council Android güncellemesi")
        .setMessage("Yeni Android sürümü #$version mevcut. Yalnızca yerel uygulama değiştiğinde indirilir. Kurulsun mu?")
        .setNegativeButton("Şimdi değil",null)
        .setPositiveButton("Bir kez indir"){_,_->downloadUpdate(downloadUrl,version)}.show()
      }
     }else if(showCurrent){
      updateStatus.text="Uygulama güncel (sürüm ${currentVersion()})."
      sendUpdateResult("current",version,"Uygulaman güncel. Kurulu sürüm: ${currentVersion()}, yayınlanan sürüm: $version.")
     }
    }
   }catch(e:Exception){if(showCurrent)runOnUiThread{
     updateStatus.text="Güncelleme kontrolü başarısız: ${e.message}"
     sendUpdateResult("error",null,"Sürüm bilgisi alınamadı. İnternet veya GitHub erişimini kontrol et.")
   }}
  }.start()
 }
 private fun openDownloadedUpdate(manager:DownloadManager,id:Long) {
  val uri=manager.getUriForDownloadedFile(id)
  if(uri==null){updateStatus.text="APK dosyası bulunamadı; yeniden indirmeyi dene.";return}
  try{
   val install=Intent(Intent.ACTION_INSTALL_PACKAGE).setData(uri)
    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
   startActivity(install)
  }catch(e:Exception){updateStatus.text="Kurulum açılmadı. İndirme bildiriminden APK'yı aç."}
 }
 private fun downloadUpdate(url:String,version:Long) {
  if(downloadInProgress){
   updateStatus.text="APK zaten indiriliyor; ikinci kopya oluşturulmadı."
   sendUpdateResult("checking",version,"APK zaten indiriliyor.")
   return
  }
  try{
   val uri=Uri.parse(url)
   if(uri.scheme!="https"||uri.host!="github.com")throw Exception("Güvenilmeyen indirme adresi")
   val manager=getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
   val prefs=getPreferences(MODE_PRIVATE)
   val previousVersion=prefs.getLong("last_atha_download_version",-1L)
   val previousId=prefs.getLong("last_atha_download_id",-1L)
   if(previousVersion==version && previousId>0){
    manager.query(DownloadManager.Query().setFilterById(previousId))?.use{cursor->
     if(cursor.moveToFirst()){
      val state=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      if(state==DownloadManager.STATUS_SUCCESSFUL){
       updateStatus.text="Bu sürüm daha önce indirildi; mevcut APK açılıyor."
       openDownloadedUpdate(manager,previousId)
       return
      }
      if(state==DownloadManager.STATUS_RUNNING||state==DownloadManager.STATUS_PENDING||state==DownloadManager.STATUS_PAUSED){
       updateStatus.text="Bu sürüm zaten indiriliyor. Yeniden indirme başlatılmadı."
       return
      }
     }
    }
   }
   val request=DownloadManager.Request(uri).setTitle("Atha Council güncellemesi")
     .setDescription("Android sürüm "+version+" indiriliyor")
     .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
     .setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,"atha-council-update-"+version+".apk")
   downloadInProgress=true
   downloadId=manager.enqueue(request)
   prefs.edit().putLong("last_atha_download_version",version)
    .putLong("last_atha_download_id",downloadId).apply()
   updateStatus.text="Android sürüm "+version+" indiriliyor…"
   downloadReceiver?.let{try{unregisterReceiver(it)}catch(_:Exception){}}
   downloadReceiver=object:BroadcastReceiver(){
    override fun onReceive(context:Context,intent:Intent){
     if(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1L)!=downloadId)return
     downloadInProgress=false
     manager.query(DownloadManager.Query().setFilterById(downloadId))?.use{cursor->
      if(cursor.moveToFirst()){
       val state=cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
       if(state==DownloadManager.STATUS_SUCCESSFUL){
        updateStatus.text="İndirme tamamlandı. Android kurulumuna onay ver."
        openDownloadedUpdate(manager,downloadId)
       }else updateStatus.text="APK indirilemedi; yeniden deneyebilirsin."
      }
     }
     try{unregisterReceiver(this)}catch(_:Exception){}
     downloadReceiver=null
    }
   }
   val filter=IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
   if(Build.VERSION.SDK_INT>=33)registerReceiver(downloadReceiver,filter,Context.RECEIVER_NOT_EXPORTED)
   else @Suppress("DEPRECATION") registerReceiver(downloadReceiver,filter)
  }catch(e:Exception){
   downloadInProgress=false
   updateStatus.text="Güncelleme indirilemedi: "+e.message
  }
 }
 override fun onCreateOptionsMenu(menu:Menu):Boolean {
  menu.add(0,100,0,"Bağlantılar ve güncellemeler")
  menu.add(0,101,1,"Konseyi yenile")
  return true
 }
 override fun onOptionsItemSelected(item:MenuItem):Boolean {
  when(item.itemId){
   100 -> {if(::nativeSettingsDialog.isInitialized)nativeSettingsDialog.show();return true}
   101 -> {if(::councilWeb.isInitialized)councilWeb.reload();return true}
  }
  return super.onOptionsItemSelected(item)
 }
 override fun onDestroy(){
  if(::councilWeb.isInitialized)councilWeb.destroy()
  downloadReceiver?.let{try{unregisterReceiver(it)}catch(_:Exception){}}
  downloadReceiver=null
  super.onDestroy()
 }

}
