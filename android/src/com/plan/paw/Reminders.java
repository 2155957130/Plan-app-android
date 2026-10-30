package com.plan.paw;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.provider.Settings;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.*;

final class Reminders {
    static final String CHANNEL = "plan_reminders";
    static final int MAX_REMINDER_MINUTES = 10080;
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("plan", Context.MODE_PRIVATE); }
    static JSONArray tasks(Context c) {
        try { return new JSONArray(prefs(c).getString("tasks", "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }
    static void channel(Context c) {
        NotificationChannel ch = new NotificationChannel(CHANNEL, "日程与待办提醒", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("你在 Plan 中设置的事件提醒");
        ch.enableVibration(true);
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }
    static boolean exact(Context c) {
        return Build.VERSION.SDK_INT < 31 || c.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }
    static boolean allowed(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = nm.getNotificationChannel(CHANNEL);
        return nm.areNotificationsEnabled() && (ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }
    static long due(JSONObject t) {
        String date = t.optString("date", "");
        if (date.isEmpty()) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
            f.setLenient(false);
            return f.parse(date + "T" + t.getString("time")).getTime();
        } catch (Exception e) { return 0; }
    }
    static long when(JSONObject t) {
        int minutes = t.optInt("reminder", -1);
        long at = due(t);
        return minutes < 0 || at == 0 || t.optBoolean("done") ? 0 : at - minutes * 60000L;
    }
    static PendingIntent pending(Context c, String id) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction("com.plan.paw.REMIND");
        i.setData(android.net.Uri.parse("plan://reminder/" + android.net.Uri.encode(id)));
        i.putExtra("id", id);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void cancelAlarm(Context c, String id) {
        if (id == null || id.isEmpty()) return;
        c.getSystemService(AlarmManager.class).cancel(pending(c, id));
        dismissNotification(c, id);
    }
    static void cancel(Context c, JSONArray old) {
        for (int i=0; i<old.length(); i++) {
            JSONObject t = old.optJSONObject(i);
            if (t != null) cancelAlarm(c, t.optString("id"));
        }
    }
    /** Only the notifications that really went away should leave the shade. */
    static void cancelNotifications(Context c, JSONArray old, JSONArray next) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        Set<String> kept = new HashSet<>();
        for (int i=0;i<next.length();i++) {
            JSONObject t = next.optJSONObject(i);
            if (t != null && !t.optBoolean("done")) kept.add(t.optString("id"));
        }
        for (int i=0;i<old.length();i++) {
            JSONObject t = old.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id");
            if (!kept.contains(id) || t.optBoolean("done")) nm.cancel(id, 1);
        }
    }
    static void dismissNotification(Context c, String id) {
        c.getSystemService(NotificationManager.class).cancel(id, 1);
    }
    /** Drop dedupe keys of reminders that no longer exist, so the preference file cannot grow forever. */
    static void pruneDelivered(Context c, JSONArray current) {
        Map<String,String> taskKeys = new HashMap<>();
        for (int i=0;i<current.length();i++) {
            JSONObject t = current.optJSONObject(i);
            if (t == null) continue;
            taskKeys.put("task-delivered:" + t.optString("id"),
                t.optString("date") + "T" + t.optString("time") + "@" + t.optInt("reminder",-1));
        }
        Set<String> habitKeys = new HashSet<>();
        JSONArray habits = Habits.all(c);
        for (int i=0;i<habits.length();i++) {
            JSONObject h = habits.optJSONObject(i);
            if (h != null) habitKeys.add("habit-delivered:" + h.optString("id"));
        }
        SharedPreferences.Editor editor = null;
        for (Map.Entry<String,?> entry : prefs(c).getAll().entrySet()) {
            String key = entry.getKey();
            boolean keep;
            if (key.startsWith("habit-delivered:")) {
                keep = habitKeys.contains(key);
            } else if (key.startsWith("task-delivered:")) {
                int pipe = key.indexOf('|');
                String id = pipe < 0 ? key : key.substring(0,pipe);
                keep = taskKeys.containsKey(id) && (pipe < 0 || taskKeys.get(id).equals(key.substring(pipe+1)));
            } else {
                continue;
            }
            if (keep) continue;
            if (editor == null) editor = prefs(c).edit();
            editor.remove(key);
        }
        if (editor != null) editor.apply();
    }
    static synchronized void reconcile(Context c) {
        JSONArray current = tasks(c);
        cancel(c, current);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        for (int i=0; i<current.length(); i++) {
            JSONObject t = current.optJSONObject(i);
            if (t == null) continue;
            long at = when(t);
            if (at <= System.currentTimeMillis()) continue;
            PendingIntent p = pending(c, t.optString("id"));
            try {
                if (exact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            } catch (SecurityException e) { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p); }
        }
        pruneDelivered(c, current);
        Habits.reconcile(c);
        PlanWidget.updateAll(c);
    }
    /** 标签最多 5 个、每个 1–12 个字且不重复；旧记录没有 tags 时视为空。 */
    static boolean validTags(JSONArray tags) {
        if (tags == null) return true;
        if (tags.length() > 5) return false;
        Set<String> seen = new HashSet<>();
        for (int i=0;i<tags.length();i++) {
            String tag = tags.optString(i, "").trim();
            if (tag.isEmpty() || tag.length() > 12 || !seen.add(tag)) return false;
        }
        return true;
    }
    static synchronized String save(Context c, String raw) {
        try {
            JSONArray next = new JSONArray(raw);
            if (next.length() > 10000) throw new IllegalArgumentException("事件数量超过上限");
            Set<String> ids = new HashSet<>();
            for (int i=0;i<next.length();i++) {
                JSONObject t=next.getJSONObject(i);
                String id=t.getString("id"), title=t.getString("title").trim(), date=t.optString("date","");
                int reminder=t.getInt("reminder");
                if (id.isEmpty() || id.length()>100 || !ids.add(id) || title.isEmpty() || title.length()>120) throw new IllegalArgumentException("事件格式有误");
                if (!date.isEmpty() && due(t)==0) throw new IllegalArgumentException("事件格式有误");
                if (reminder < -1 || reminder > MAX_REMINDER_MINUTES) throw new IllegalArgumentException("提醒时间无效");
                if (!validTags(t.optJSONArray("tags"))) throw new IllegalArgumentException("标签格式有误");
                // 分类已并入标签；旧记录仍可能带 category，出现时只校验取值。
                String category = t.optString("category", "");
                if (!category.isEmpty() && !"life".equals(category) && !"work".equals(category) && !"study".equals(category)) throw new IllegalArgumentException("事件分类有误");
            }
            JSONArray old = tasks(c);
            if (!prefs(c).edit().putString("tasks", next.toString()).commit()) throw new IllegalStateException("存储空间不足");
            cancel(c, old);
            cancelNotifications(c, old, next);
            reconcile(c);
            return new JSONObject().put("ok",true).put("notifications",allowed(c)).put("exact",exact(c)).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"保存失败，请检查事件或存储空间\"}";
        }
    }
}
