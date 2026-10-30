package com.plan.paw;

import android.app.*;
import android.content.*;
import android.net.Uri;
import org.json.*;
import java.text.*;
import java.util.*;

final class Habits {
    static JSONArray all(Context c) {
        try { return new JSONArray(Reminders.prefs(c).getString("habits", "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }
    static String day(long at) {
        return new SimpleDateFormat("yyyy-MM-dd",Locale.US).format(new Date(at));
    }
    static boolean validDate(String key) {
        try {
            if (!key.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
            SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.US);f.setLenient(false);
            return f.format(f.parse(key)).equals(key);
        } catch(Exception e) { return false; }
    }
    static boolean validDays(JSONArray days) {
        if(days==null || days.length()<1 || days.length()>7) return false;
        Set<Integer> values=new HashSet<>();
        for(int i=0;i<days.length();i++) {
            Object raw=days.opt(i);
            if(!(raw instanceof Number)) return false;
            int n=((Number)raw).intValue();
            if(n<0 || n>6 || ((Number)raw).doubleValue()!=n || !values.add(n)) return false;
        }
        return true;
    }
    static boolean contains(JSONArray values, String key) {
        if(values==null) return false;
        for(int i=0;i<values.length();i++) if(key.equals(values.optString(i)))return true;
        return false;
    }
    static boolean scheduled(JSONObject h,String key) {
        if(!validDate(key) || key.compareTo(h.optString("startDate"))<0) return false;
        JSONArray history=h.optJSONArray("history");
        JSONObject schedule=null;
        if(history!=null) for(int i=0;i<history.length();i++) {
            JSONObject s=history.optJSONObject(i);
            if(s!=null && s.optString("from").compareTo(key)<=0)schedule=s;
        }
        if(schedule==null)return false;
        JSONArray days=schedule.optJSONArray("days");
        if(days==null)return false;
        int[] values=new int[days.length()];
        for(int i=0;i<days.length();i++)values[i]=days.optInt(i,-1);
        return HabitSchedule.matches(schedule.optString("freqType","weekly"),schedule.optString("from"),key,values,
            schedule.optInt("intervalDays",0),schedule.optInt("monthDay",0),schedule.optInt("yearMonth",0));
    }
    static boolean validSchedule(JSONObject s) {
        if(!validDays(s.optJSONArray("days")))return false;
        String type=s.optString("freqType","weekly");
        String field="interval".equals(type)?"intervalDays":"monthDay";
        if(!"weekly".equals(type)){
            Object number=s.opt(field);
            if(!(number instanceof Number)||((Number)number).doubleValue()!=((Number)number).intValue())return false;
        }
        if("yearly".equals(type)){
            Object month=s.opt("yearMonth");
            if(!(month instanceof Number)||((Number)month).doubleValue()!=((Number)month).intValue())return false;
        }
        return HabitSchedule.validFrequency(type,s.optInt("intervalDays",0),s.optInt("monthDay",0),s.optInt("yearMonth",0));
    }
    static long timeFor(JSONObject h,String key) {
        try {
            SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm",Locale.US);f.setLenient(false);
            return f.parse(key+"T"+h.getString("time")).getTime();
        }catch(Exception e){return 0;}
    }
    static PendingIntent pending(Context c,JSONObject h,String date,long at) {
        String id=h.optString("id");
        Intent i=new Intent(c,ReminderReceiver.class).setAction("com.plan.paw.HABIT");
        i.setData(Uri.parse("plan://habit/"+Uri.encode(id)));
        i.putExtra("habitId",id).putExtra("date",date).putExtra("at",at);
        return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void cancel(Context c,JSONArray habits) {
        AlarmManager am=c.getSystemService(AlarmManager.class);
        for(int i=0;i<habits.length();i++){
            JSONObject h=habits.optJSONObject(i);if(h==null)continue;
            am.cancel(pending(c,h,"",0));
        }
    }
    /** Dismiss the reminder of habits that were deleted or lost their reminder switch. */
    static void cancelNotifications(Context c,JSONArray old,JSONArray next) {
        NotificationManager nm=c.getSystemService(NotificationManager.class);
        Set<String> kept=new HashSet<>();
        for(int i=0;i<next.length();i++){
            JSONObject h=next.optJSONObject(i);
            if(h!=null && h.optBoolean("remind"))kept.add(h.optString("id"));
        }
        for(int i=0;i<old.length();i++){
            JSONObject h=old.optJSONObject(i);
            if(h==null)continue;
            String id=h.optString("id");
            if(!kept.contains(id) || !h.optBoolean("remind"))nm.cancel("habit:"+id,1);
        }
    }
    static void scheduleNext(Context c,JSONObject h,long after) {
        if(!h.optBoolean("remind"))return;
        Set<String> checks=new HashSet<>();JSONArray raw=h.optJSONArray("checks");
        if(raw!=null)for(int i=0;i<raw.length();i++)checks.add(raw.optString(i));
        HabitSchedule.Occurrence next=HabitSchedule.next(h.optString("time"),after,date->scheduled(h,date),checks,HabitSchedule.horizon(h.optString("freqType","weekly")));
        if(next==null)return;
        AlarmManager am=c.getSystemService(AlarmManager.class);
        PendingIntent p=pending(c,h,next.date,next.at);
        try {
            if(Reminders.exact(c))am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.at,p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.at,p);
        }catch(SecurityException e){am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.at,p);}
    }
    static synchronized void reconcile(Context c) {
        JSONArray habits=all(c);cancel(c,habits);
        for(int i=0;i<habits.length();i++){
            JSONObject h=habits.optJSONObject(i);if(h!=null)scheduleNext(c,h,System.currentTimeMillis());
        }
    }
    static synchronized String save(Context c,String raw) {
        try {
            JSONArray next=new JSONArray(raw);
            if(next.length()>1000)throw new IllegalArgumentException();
            Set<String> ids=new HashSet<>();
            for(int i=0;i<next.length();i++){
                JSONObject h=next.getJSONObject(i);String id=h.getString("id"),title=h.getString("title").trim(),start=h.getString("startDate");
                if(id.isEmpty() || id.length()>100 || !ids.add(id) || title.isEmpty() || title.length()>120 || !validDate(start) || !validSchedule(h) || !h.getString("time").matches("([01]\\d|2[0-3]):[0-5]\\d") || !(h.get("remind") instanceof Boolean))throw new IllegalArgumentException();
                JSONArray checks=h.getJSONArray("checks"),history=h.getJSONArray("history");
                Set<String> checked=new HashSet<>();
                for(int j=0;j<checks.length();j++){
                    String date=checks.getString(j);
                    if(!validDate(date) || date.compareTo(start)<0 || !checked.add(date))throw new IllegalArgumentException();
                }
                if(history.length()==0 || !history.getJSONObject(0).getString("from").equals(start))throw new IllegalArgumentException();
                String previous="";
                for(int j=0;j<history.length();j++){
                    JSONObject s=history.getJSONObject(j);String from=s.getString("from");
                    if(!validDate(from) || from.compareTo(previous)<=0 || !validSchedule(s))throw new IllegalArgumentException();
                    previous=from;
                }
                JSONObject latest=history.getJSONObject(history.length()-1);
                if(!h.getJSONArray("days").toString().equals(latest.getJSONArray("days").toString()))throw new IllegalArgumentException();
                String type=h.optString("freqType","weekly");
                if(!type.equals(latest.optString("freqType","weekly")))throw new IllegalArgumentException();
                if(("monthly".equals(type)||"yearly".equals(type))&&h.optInt("monthDay",0)!=latest.optInt("monthDay",0))throw new IllegalArgumentException();
                if("yearly".equals(type)&&h.optInt("yearMonth",0)!=latest.optInt("yearMonth",0))throw new IllegalArgumentException();
                if("interval".equals(h.optString("freqType"))){
                    int every=h.optInt("intervalDays",0);
                    if(every<1 || every>365 || !"interval".equals(latest.optString("freqType")) || latest.optInt("intervalDays",-1)!=every)throw new IllegalArgumentException();
                }
            }
            JSONArray old=all(c);
            if(!Reminders.prefs(c).edit().putString("habits",next.toString()).commit())throw new IllegalStateException();
            cancel(c,old);cancelNotifications(c,old,next);reconcile(c);
            PlanWidget.updateAll(c);
            return "{\"ok\":true}";
        }catch(Exception e){return "{\"ok\":false,\"error\":\"习惯未能保存，请检查记录与存储空间\"}";}
    }
    static synchronized void receive(Context c,Intent intent) {
        String id=intent.getStringExtra("habitId"),date=intent.getStringExtra("date");
        JSONArray habits=all(c);
        for(int i=0;i<habits.length();i++){
            JSONObject h=habits.optJSONObject(i);
            if(h==null || !h.optString("id").equals(id))continue;
            long at=intent.getLongExtra("at",0),now=System.currentTimeMillis();
            if(!h.optBoolean("remind") || !validDate(date) || !scheduled(h,date) || timeFor(h,date)!=at)return;
            if(at>now+2000)return;
            // Chain the next one-shot alarm even while the app is closed or notifications are disabled.
            scheduleNext(c,h,now+2000);
            if(!date.equals(day(now)) || contains(h.optJSONArray("checks"),date) || !Reminders.allowed(c))return;
            String deliveredKey="habit-delivered:"+id;
            String delivery=date+"T"+h.optString("time");
            if(delivery.equals(Reminders.prefs(c).getString(deliveredKey,"")))return;
            Reminders.channel(c);
            Intent open=new Intent(c,MainActivity.class).setData(Uri.parse("plan://open-habit/"+Uri.encode(id))).putExtra("habitId",id).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent content=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(c,Reminders.CHANNEL).setSmallIcon(R.drawable.ic_notification)
                .setColor(0xff365e49).setContentTitle("打卡提醒")
                .setContentText(h.optString("title")+" · "+h.optString("time"))
                .setContentIntent(content).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER).build();
            c.getSystemService(NotificationManager.class).notify("habit:"+id,1,notification);
            Reminders.prefs(c).edit().putString(deliveredKey,delivery).apply();
            return;
        }
    }
}
