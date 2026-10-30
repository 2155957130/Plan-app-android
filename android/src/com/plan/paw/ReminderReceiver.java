package com.plan.paw;

import android.app.*;
import android.content.*;
import org.json.*;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent intent) {
        if ("com.plan.paw.HABIT".equals(intent.getAction())) { Habits.receive(c,intent);return; }
        String id = intent.getStringExtra("id");
        JSONArray tasks = Reminders.tasks(c);
        for (int i=0;i<tasks.length();i++) {
            JSONObject t=tasks.optJSONObject(i);
            if (t == null || !t.optString("id").equals(id) || t.optBoolean("done") || t.optInt("reminder",-1)<0) continue;
            long when=Reminders.when(t);
            if (when > System.currentTimeMillis()+2000 || when <= 0 || !Reminders.allowed(c)) return;
            // A reconcile right after delivery must not post the same reminder twice.
            String key="task-delivered:"+id;
            String delivery=t.optString("date")+"T"+t.optString("time")+"@"+t.optInt("reminder",-1);
            if (delivery.equals(Reminders.prefs(c).getString(key,""))) return;
            Reminders.channel(c);
            Intent open=new Intent(c, MainActivity.class).putExtra("taskId",id).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent content=PendingIntent.getActivity(c,id.hashCode(),open,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n=new Notification.Builder(c,Reminders.CHANNEL)
                .setSmallIcon(com.plan.paw.R.drawable.ic_notification)
                .setColor(0xff365e49).setContentTitle(t.optString("title"))
                .setContentText("截止时间："+t.optString("date")+" "+t.optString("time"))
                .setStyle(new Notification.BigTextStyle().bigText("截止时间："+t.optString("date")+" "+t.optString("time")+(t.optString("notes").isEmpty()?"":"\n"+t.optString("notes"))))
                .setContentIntent(content).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER).build();
            c.getSystemService(NotificationManager.class).notify(id,1,n);
            Reminders.prefs(c).edit().putString(key,delivery).apply();
            return;
        }
    }
}
