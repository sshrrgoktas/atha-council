package com.atlascouncil.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.net.URI;

public class PcWorkspaceActivity extends Activity {
    private static final int BG = Color.rgb(9,22,36), PANEL = Color.rgb(16,36,55),
        TEAL = Color.rgb(75,213,197), WHITE = Color.rgb(232,245,250), MUTED = Color.rgb(158,186,199);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LinearLayout root;
    private FrameLayout content;
    private WebView web;
    private URI server;
    private SharedPreferences preferences;
    private TextView connectionLabel;
    private ProgressBar loading;
    private LinearLayout nativeBar;
    private boolean failed;
    private int loadGeneration;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        preferences = getSharedPreferences("athalai-connection", MODE_PRIVATE);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(BG);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets system = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(system.left, system.top, system.right, Math.max(system.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            }
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        buildHeader();
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        String saved = preferences.getString("server", "");
        if (!saved.isEmpty()) {
            try { server = ConnectionPolicy.parse(saved); connect(); }
            catch (IllegalArgumentException e) { showWelcome(""); }
        } else { server=ConnectionPolicy.parse(ConnectionPolicy.REMOTE_ORIGIN); connect(); }
    }

    private void buildHeader() {
        nativeBar=new LinearLayout(this);nativeBar.setGravity(Gravity.CENTER_VERTICAL);nativeBar.setPadding(dp(12),0,dp(12),0);
        Button back=new Button(this);back.setText("← Konsey");back.setAllCaps(false);back.setTextColor(TEAL);back.setBackgroundColor(Color.TRANSPARENT);back.setOnClickListener(v->finish());
        nativeBar.addView(back,new LinearLayout.LayoutParams(dp(110),dp(48)));
        connectionLabel=text("Bilgisayar bağlantısı",14,WHITE);nativeBar.addView(connectionLabel,new LinearLayout.LayoutParams(0,-2,1));
        root.addView(nativeBar,new LinearLayout.LayoutParams(-1,dp(54)));
        loading=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);loading.setIndeterminate(true);loading.setVisibility(View.GONE);
        root.addView(loading,new LinearLayout.LayoutParams(-1,dp(3)));
    }

    private void showWelcome(String error) {
        loading.setVisibility(View.GONE); nativeBar.setVisibility(View.VISIBLE); content.removeAllViews(); connectionLabel.setText("Mobil çalışma alanın");
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setClipToPadding(false);
        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(24),dp(30),dp(24),dp(30));
        scroll.addView(page,new ScrollView.LayoutParams(-1,-2));
        page.addView(text("Bugün ne yapıyoruz?",29,WHITE)); spacer(page,12);
        page.addView(text("Sohbet et, Work’te çalış ve bilgisayarındaki işlere devam et.",16,MUTED)); spacer(page,20);
        addChatActions(page);
        spacer(page,22);
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(20),dp(20),dp(20),dp(20));
        card.setBackground(shape(PANEL,18)); page.addView(card,new LinearLayout.LayoutParams(-1,-2));
        TextView title=text("Bilgisayarını eşleştir",20,WHITE); title.setTypeface(Typeface.DEFAULT,Typeface.BOLD);card.addView(title);spacer(card,14);
        card.addView(text("Bilgisayarındaki işlerin durumunu ve sonuçlarını getir. AthalAI → Telefonundan takip ekranında internet erişimini açıp eşleştirme kodu oluştur.",14,MUTED));spacer(card,18);
        Button internet=button("İnternet üzerinden bağlan");
        card.addView(internet,new LinearLayout.LayoutParams(-1,dp(54)));
        internet.setOnClickListener(view -> {
            server=ConnectionPolicy.parse(ConnectionPolicy.REMOTE_ORIGIN);
            preferences.edit().putString("server",server.toString()).apply();
            ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(view.getWindowToken(),0);
            connect();
        });
        spacer(card,22);card.addView(text("Aynı Wi-Fi ile bağlan",17,WHITE));spacer(card,8);
        card.addView(text("Telefon ve bilgisayar aynı ağdaysa AthalAI’de gösterilen yerel adresi yaz. Açılan ekranda eşleştirme kodunu gir.",14,MUTED));spacer(card,16);
        TextView label=text("Yerel bilgisayar adresi",13,WHITE);card.addView(label);
        EditText address = new EditText(this); address.setSingleLine(true);address.setTextColor(WHITE);address.setHintTextColor(MUTED);
        address.setTextSize(15);address.setHint("http://192.168.1.10:52936");address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        String savedAddress=preferences.getString("server","");
        try { if(ConnectionPolicy.isRemote(ConnectionPolicy.parse(savedAddress))) savedAddress=""; } catch(IllegalArgumentException ignored){}
        address.setText(savedAddress);address.setSelectAllOnFocus(true);address.setContentDescription("Yerel bilgisayar adresi");
        address.setPadding(dp(12),dp(10),dp(12),dp(10));address.setBackground(shape(BG,10));
        LinearLayout.LayoutParams addressParams=new LinearLayout.LayoutParams(-1,dp(52));addressParams.topMargin=dp(8);card.addView(address,addressParams);
        TextView message=text(error,13,Color.rgb(255,180,166));message.setVisibility(error.isEmpty()?View.GONE:View.VISIBLE);
        LinearLayout.LayoutParams messageParams=new LinearLayout.LayoutParams(-1,-2);messageParams.topMargin=dp(10);card.addView(message,messageParams);
        Button connect=button("Bu adrese bağlan");LinearLayout.LayoutParams buttonParams=new LinearLayout.LayoutParams(-1,dp(54));buttonParams.topMargin=dp(16);card.addView(connect,buttonParams);
        connect.setOnClickListener(view -> {
            try {
                server=ConnectionPolicy.parse(address.getText().toString());preferences.edit().putString("server",server.toString()).apply();
                ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(),0);connect();
            } catch (IllegalArgumentException e) { message.setText("AthalAI’de gösterilen yerel adresi portuyla birlikte gir. İnternet bağlantısı için yukarıdaki düğmeyi kullan.");message.setVisibility(View.VISIBLE); }
        });
        spacer(page,20); page.addView(text("Wi-Fi veya mobil veri • Eşleştirme ve erişimler bilgisayarından yönetilir",12,MUTED));
        spacer(page,10);page.addView(text("AthalAI Mobile 0.4.15",11,MUTED));
        content.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    }

    private void connect() {
        failed=false; int generation=++loadGeneration; content.removeAllViews(); loading.setVisibility(View.VISIBLE);
        connectionLabel.setText(ConnectionPolicy.isRemote(server) ? "Güvenli internet bağlantısı" : server.getHost()+":"+(server.getPort()<0?("https".equals(server.getScheme())?443:80):server.getPort()));
        if(web!=null){web.destroy();web=null;}
        web=new WebView(this);web.setBackgroundColor(BG);web.setVisibility(View.INVISIBLE);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUserAgentString(settings.getUserAgentString()+" AthalAI-Mobile/0.4.15");
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String url=request.getUrl().toString();
                if(request.isForMainFrame()&&"athalai://council".equals(url)){finish();return true;}
                if(request.isForMainFrame()&&"athalai://connection".equals(url)){web.stopLoading();loadGeneration++;showWelcome("");return true;}
                if(ConnectionPolicy.sameOrigin(server,url))return false;
                if(request.isForMainFrame()&&request.hasGesture()&&"https".equalsIgnoreCase(request.getUrl().getScheme())){
                    if("chatgpt.com".equalsIgnoreCase(request.getUrl().getHost()))openChat(url);
                    else try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()).addCategory(Intent.CATEGORY_BROWSABLE));}catch(android.content.ActivityNotFoundException ignored){}
                } return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if(ConnectionPolicy.sameOrigin(server,request.getUrl().toString())){
                    if("/_atha/native-workspace.css".equals(request.getUrl().getPath())){
                        try{return new WebResourceResponse("text/css","UTF-8",getAssets().open("workspace-theme.css"));}
                        catch(java.io.IOException ignored){return new WebResourceResponse("text/css","UTF-8",new ByteArrayInputStream(new byte[0]));}
                    }
                    return null;
                }
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",null,new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view,String url){
                if(generation!=loadGeneration||failed||!ConnectionPolicy.sameOrigin(server,url))return;
                loading.setVisibility(View.GONE);nativeBar.setVisibility(View.GONE);
                try { java.io.InputStream input=getAssets().open("workspace-shell.js");java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);input.close();view.evaluateJavascript(new String(output.toByteArray(),java.nio.charset.StandardCharsets.UTF_8),null); }
                catch(java.io.IOException ignored){ }
                view.setVisibility(View.VISIBLE);CookieManager.getInstance().flush();
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
                if(request.isForMainFrame()&&generation==loadGeneration)showConnectionError();
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){
                if(request.isForMainFrame()&&response.getStatusCode()>=400&&generation==loadGeneration)showConnectionError();
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler sslHandler,android.net.http.SslError error){sslHandler.cancel();if(generation==loadGeneration)showConnectionError();}
        });
        content.addView(web,new FrameLayout.LayoutParams(-1,-1));web.loadUrl(server.toString());
        handler.postDelayed(()->{if(generation==loadGeneration&&loading.getVisibility()==View.VISIBLE){web.stopLoading();showConnectionError();}},20000);
    }

    private void showConnectionError(){
        if(failed)return;failed=true;loading.setVisibility(View.GONE);nativeBar.setVisibility(View.VISIBLE);content.removeAllViews();
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        LinearLayout page=new LinearLayout(this);page.setGravity(Gravity.CENTER_VERTICAL);page.setOrientation(LinearLayout.VERTICAL);page.setPadding(dp(28),dp(24),dp(28),dp(24));
        page.addView(text("Bilgisayara ulaşılamıyor",25,WHITE));spacer(page,16);
        page.addView(text("ChatGPT’de sohbet etmeye ve desteklenen bulut işlerine devam edebilirsin. Bilgisayarındaki uygulamaları kullanmak ve iş sonuçlarını almak için bilgisayarın ile AthalAI açık olmalı.",16,MUTED));spacer(page,20);
        addChatActions(page);spacer(page,22);
        page.addView(text(ConnectionPolicy.isRemote(server) ? "Bilgisayarındaki internet bağlantısını ve AthalAI’de internet erişiminin açık olduğunu kontrol et." : "Yerel bağlantı için telefon ve bilgisayar aynı Wi-Fi ağında olmalı; AthalAI’deki güncel adresi kullan.",14,MUTED));spacer(page,18);
        Button retry=button("Yeniden dene");retry.setOnClickListener(view->connect());page.addView(retry,new LinearLayout.LayoutParams(-1,dp(54)));spacer(page,12);
        Button change=button("Bilgisayar adresini değiştir");change.setOnClickListener(view->showWelcome(""));page.addView(change,new LinearLayout.LayoutParams(-1,dp(54)));
        scroll.addView(page,new ScrollView.LayoutParams(-1,-2));content.addView(scroll,new FrameLayout.LayoutParams(-1,-1));
    }

    private void addChatActions(LinearLayout page){
        Button council=button("← Konsey sohbetine dön");council.setOnClickListener(v->finish());page.addView(council,new LinearLayout.LayoutParams(-1,dp(48)));
    }

    private void openChat(String destination){
        if(!ConnectionPolicy.isOfficialChat(destination))return;
        try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(destination)).addCategory(Intent.CATEGORY_BROWSABLE));}
        catch(android.content.ActivityNotFoundException ignored){Toast.makeText(this,"ChatGPT’yi açmak için bir tarayıcı veya resmî ChatGPT uygulaması gerekli.",Toast.LENGTH_LONG).show();}
    }

    @Override public void onBackPressed(){
        if(web!=null&&web.getParent()!=null&&web.getVisibility()==View.VISIBLE&&web.canGoBack()){web.goBack();return;}
        if(server!=null&&web!=null&&web.getParent()!=null){web.stopLoading();loadGeneration++;showWelcome("");return;}
        super.onBackPressed();
    }
    @Override protected void onDestroy(){loadGeneration++;handler.removeCallbacksAndMessages(null);if(web!=null)web.destroy();super.onDestroy();}
    private TextView text(String value,int size,int color){TextView label=new TextView(this);label.setText(value);label.setTextColor(color);label.setTextSize(size);label.setLineSpacing(dp(3),1);return label;}
    private Button button(String value){Button button=new Button(this);button.setText(value);button.setTextColor(BG);button.setTextSize(15);button.setAllCaps(false);button.setTypeface(Typeface.DEFAULT,Typeface.BOLD);button.setBackground(shape(TEAL,12));return button;}
    private GradientDrawable shape(int color,int radius){GradientDrawable drawable=new GradientDrawable();drawable.setColor(color);drawable.setCornerRadius(dp(radius));return drawable;}
    private void spacer(LinearLayout layout,int height){layout.addView(new View(this),new LinearLayout.LayoutParams(1,dp(height)));}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
