package com.plan.paw;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.*;
import java.util.Calendar;

/** Runs every midnight so the widgets and an open page move to the new day even if the app stays closed. */
public class RefreshReceiver extends BroadcastReceiver {
    static final String ACTION_REFRESH = "com.plan.paw.DAILY_REFRESH";
    @Override public void onReceive(Context c, Intent intent) {
        String today = Habits.day(System.currentTimeMillis());
        boolean dayChanged = !today.equals(Reminders.prefs(c).getString("lastRefreshDay", ""));
        Reminders.prefs(c).edit().putString("lastRefreshDay", today).apply();
        PlanWidget.updateAll(c);
        MainActivity activity = MainActivity.current();
        if (activity != null) activity.refreshDay(dayChanged);
        arm(c);
    }
    static void arm(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent p = pending(c);
        long at = nextMidnight();
        try {
            if (Reminders.exact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
    }
    static void cancel(Context c) {
        c.getSystemService(AlarmManager.class).cancel(pending(c));
    }
    static PendingIntent pending(Context c) {
        Intent i = new Intent(c, RefreshReceiver.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static long nextMidnight() {
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        return next.getTimeInMillis();
    }
}
