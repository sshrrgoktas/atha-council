package com.atlascouncil.app

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.net.Uri
import android.widget.*
import android.graphics.Color
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
 private val random=SecureRandom()
 private fun token(n:Int=32):String { val b=ByteArray(n);random.nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b) }
 private fun enc(s:String)=URLEncoder.encode(s,"UTF-8")
 private fun sha(s:String)=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(s.toByteArray()))
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState)
  val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(36,48,36,24);setBackgroundColor(Color.rgb(9,19,33)) }
  val title=TextView(this).apply { text="ATLAS COUNCIL";textSize=28f;setTextColor(Color.rgb(77,214,193)) }
  status=TextView(this).apply {text="ChatGPT bağlı değil. Giriş prototipi test edilmedi.";textSize=16f;setTextColor(Color.WHITE);setPadding(0,28,0,28)}
  val button=Button(this).apply {text="ChatGPT ile devam et (deneysel)";setOnClickListener{startLogin()} }
  val web=Button(this).apply {text="Atlas Council web panelini aç";setOnClickListener{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://atlas-council.sshrrgoktas.workers.dev")))} }
  layout.addView(title);layout.addView(status);layout.addView(button);layout.addView(web);setContentView(layout)
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
   runOnUiThread{status.text="Kimlik doğrulandı. Güvenli token saklama ve model çağrısı henüz eklenmedi."}
  }catch(e:Exception){runOnUiThread{status.text="Bağlantı tamamlanamadı: ${e.message}"}}finally{try{server?.close()}catch(_:Exception){}}
 }.start()}
}
