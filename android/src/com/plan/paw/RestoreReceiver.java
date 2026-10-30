package com.plan.paw;
import android.content.*;
public class RestoreReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) { Reminders.reconcile(c); RefreshReceiver.arm(c); }
}
