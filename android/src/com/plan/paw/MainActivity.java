package com.plan.paw;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.webkit.*;
import android.view.*;
import android.widget.FrameLayout;
import android.appwidget.AppWidgetManager;
import java.io.*;
import java.lang.ref.WeakReference;
import org.json.*;

public class MainActivity extends Activity {
    private WebView web;
    private boolean loaded=false;
    private static WeakReference<MainActivity> current;
    private static final String ORIGIN="https://plan.local/";
    private static final int REQUEST_IMPORT=21;
    private static final int REQUEST_EXPORT=22;
    private static final int MAX_BACKUP_BYTES=4*1024*1024;
    private String pendingExport=null;
    private String pendingFileName=null;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        current=new WeakReference<>(this);
        getWindow().setStatusBarColor(Color.rgb(232,239,228));
        getWindow().setNavigationBarColor(Color.rgb(232,239,228));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web=new WebView(this);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setBackgroundColor(Color.rgb(232,239,228));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "PlanAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return !r.getUrl().toString().startsWith(ORIGIN); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String u=r.getUrl().toString();
                try {
                    if (!u.startsWith(ORIGIN)) throw new IOException();
                    String path=r.getUrl().getPath().substring(1);
                    if (path.isEmpty()) path="index.html";
                    if (path.contains("..") || path.contains("\\")) throw new IOException();
                    String mime=path.endsWith(".html")?"text/html":path.endsWith(".css")?"text/css":path.endsWith(".svg")?"image/svg+xml":"application/javascript";
                    WebResourceResponse response=new WebResourceResponse(mime,"UTF-8",getAssets().open(path));
                    return response;
                } catch (IOException e) { return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream(new byte[0])); }
            }
            @Override public void onPageFinished(WebView v,String u) { loaded=true; openTask(); }
        });
        // Pad the parent, not WebView: this resizes the web viewport and its fixed elements.
        FrameLayout safeArea=new FrameLayout(this);
        safeArea.setBackgroundColor(Color.rgb(232,239,228));
        safeArea.addView(web,new FrameLayout.LayoutParams(-1,-1));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            safeArea.setOnApplyWindowInsetsListener((v,insets)->{
                android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            safeArea.setFitsSystemWindows(true);
        }
        setContentView(safeArea);
        safeArea.requestApplyInsets();
        Reminders.channel(this);
        RefreshReceiver.arm(this);
        web.loadUrl(ORIGIN);
    }
    static MainActivity current() {
        MainActivity activity=current==null?null:current.get();
        return activity!=null && !activity.isFinishing() ? activity : null;
    }
    void refreshDay(boolean dayChanged) {
        if (web==null || !loaded) return;
        if (dayChanged) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()",null);
    }
    private void openTask() {
        String view=getIntent().getStringExtra("view");
        if(loaded && view!=null){
            web.evaluateJavascript("window.openPlanView && window.openPlanView("+JSONObject.quote(view)+")",null);
            getIntent().removeExtra("view");
        }
        String habitId=getIntent().getStringExtra("habitId");
        if(loaded && habitId!=null){
            web.evaluateJavascript("window.openHabitFromNotification && window.openHabitFromNotification("+JSONObject.quote(habitId)+")",null);
            getIntent().removeExtra("habitId");
        }
        String id=getIntent().getStringExtra("taskId");
        if (loaded && id!=null) {
            web.evaluateJavascript("window.openTaskFromNotification && window.openTaskFromNotification("+JSONObject.quote(id)+")",null);
            getIntent().removeExtra("taskId");
        }
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i);setIntent(i);openTask(); }
    @Override protected void onResume() {
        super.onResume();
        Reminders.reconcile(this);
        RefreshReceiver.arm(this);
        if (web!=null && loaded) web.evaluateJavascript("window.onNativeResume && window.onNativeResume()",null);
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleBack ? window.handleBack() : false",result->{if (!"true".equals(result)) super.onBackPressed();});
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==10 && web!=null && loaded){
            Reminders.reconcile(this);
            web.evaluateJavascript("window.onNativeResume && window.onNativeResume()",null);
        }
    }
    @Override protected void onDestroy() {
        if(current!=null && current.get()==this)current.clear();
        web.removeJavascriptInterface("PlanAndroid");
        web.destroy();
        super.onDestroy();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==REQUEST_EXPORT){
            if(resultCode!=RESULT_OK || data==null || data.getData()==null) { notifyExport("cancelled"); return; }
            notifyExport(writeBackup(data.getData())?"saved":"error");
            pendingExport=null;pendingFileName=null;return;
        }
        if(requestCode==REQUEST_IMPORT){
            if(resultCode!=RESULT_OK || data==null || data.getData()==null) { notifyImport("{\"ok\":false,\"error\":\"已取消导入\"}"); return; }
            notifyImport(readBackup(data.getData()));return;
        }
    }
    private boolean writeBackup(Uri target) {
        if(pendingExport==null) return false;
        try(OutputStream out=getContentResolver().openOutputStream(target,"wt")){
            if(out==null) return false;
            out.write(pendingExport.getBytes("UTF-8"));
            out.flush();
            return true;
        }catch(Exception e){ return false; }
    }
    private String readBackup(Uri source) {
        try(InputStream in=getContentResolver().openInputStream(source)){
            if(in==null) return "{\"ok\":false,\"error\":\"无法读取该文件\"}";
            ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            byte[] chunk=new byte[8192];
            int total=0,read;
            while((read=in.read(chunk))!=-1){
                total+=read;
                if(total>MAX_BACKUP_BYTES) return "{\"ok\":false,\"error\":\"备份文件过大\"}";
                buffer.write(chunk,0,read);
            }
            return new JSONObject().put("ok",true).put("data",buffer.toString("UTF-8")).toString();
        }catch(Exception e){ return "{\"ok\":false,\"error\":\"无法读取该文件\"}"; }
    }
    private void notifyExport(String result) {
        if(web!=null) web.evaluateJavascript("window.onExportResult && window.onExportResult("+JSONObject.quote(result)+")",null);
    }
    private void notifyImport(String result) {
        if(web!=null && loaded) web.evaluateJavascript("window.onImportData && window.onImportData("+JSONObject.quote(result)+")",null);
    }
    public class Bridge {
        @JavascriptInterface public void pinWidget(String kind) {
            runOnUiThread(()->{
                String result="unsupported";
                try {
                    AppWidgetManager manager=getSystemService(AppWidgetManager.class);
                    if(manager.isRequestPinAppWidgetSupported()) {
                        Class<?> provider="habits".equals(kind)?HabitsWidget.class:TodayWidget.class;
                        boolean requested=manager.requestPinAppWidget(new ComponentName(MainActivity.this,provider),null,null);
                        result=requested?"requested":"unsupported";
                    }
                }catch(Exception e){result="error";}
                web.evaluateJavascript("window.onWidgetPinRequest && window.onWidgetPinRequest("+JSONObject.quote(result)+")",null);
            });
        }
        @JavascriptInterface public String loadData() { return Reminders.tasks(MainActivity.this).toString(); }
        @JavascriptInterface public String saveData(String json) { return Reminders.save(MainActivity.this,json); }
        @JavascriptInterface public String loadHabits() { return Reminders.prefs(MainActivity.this).getString("habits","[]"); }
        @JavascriptInterface public String saveHabits(String json) { return Habits.save(MainActivity.this,json); }
        @JavascriptInterface public String status() { return "{\"notifications\":"+Reminders.allowed(MainActivity.this)+",\"exact\":"+Reminders.exact(MainActivity.this)+"}"; }
        @JavascriptInterface public void requestNotifications() {
            runOnUiThread(()->{
                if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},10);
                else if (!Reminders.allowed(MainActivity.this)) startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));
            });
        }
        @JavascriptInterface public void requestExactAlarms() {
            runOnUiThread(()->{if (Build.VERSION.SDK_INT>=31 && !Reminders.exact(MainActivity.this)) startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));});
        }
        @JavascriptInterface public void exportData(String fileName,String json) {
            runOnUiThread(()->{
                if(json==null || json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>MAX_BACKUP_BYTES){ notifyExport("error"); return; }
                pendingExport=json;
                pendingFileName=(fileName==null||fileName.trim().isEmpty())?"plan-backup.json":fileName;
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE,pendingFileName).addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent,REQUEST_EXPORT); }
                catch(Exception e){ notifyExport("error"); }
            });
        }
        @JavascriptInterface public void importData() {
            runOnUiThread(()->{
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);
                try { startActivityForResult(intent,REQUEST_IMPORT); }
                catch(Exception e){ notifyImport("{\"ok\":false,\"error\":\"无法打开文件选择器\"}"); }
            });
        }
    }
}
