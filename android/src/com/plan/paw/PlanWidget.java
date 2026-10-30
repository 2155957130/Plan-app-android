package com.plan.paw;

import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.os.Bundle;
import java.text.SimpleDateFormat;
import java.util.*;
import org.json.*;

public abstract class PlanWidget extends AppWidgetProvider {
    private static final String REFRESH="com.plan.paw.WIDGET_REFRESH";
    protected abstract boolean isHabit();
    static void updateAll(Context c) {
        AppWidgetManager manager=c.getSystemService(AppWidgetManager.class);
        for(Class<?> type:new Class<?>[]{TodayWidget.class,HabitsWidget.class}) {
            int[] ids=manager.getAppWidgetIds(new ComponentName(c,type));
            for(int id:ids)render(c,manager,id,type==HabitsWidget.class);
        }
    }
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) {
        for(int id:ids)render(c,manager,id,isHabit());
    }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,Bundle options) {
        render(c,manager,id,isHabit());
    }
    @Override public void onReceive(Context c,Intent intent) {
        super.onReceive(c,intent);
        if(REFRESH.equals(intent.getAction()))updateAll(c);
    }
    private static PendingIntent open(Context c,boolean habit,String id) {
        String view=habit?"habits":"todo";
        Intent intent=new Intent(c,MainActivity.class)
            .setData(Uri.parse("plan://widget/"+view+"/"+Uri.encode(id)))
            .putExtra("view",view).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if(!id.isEmpty())intent.putExtra(habit?"habitId":"taskId",id);
        return PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    private static void render(Context c,AppWidgetManager manager,int widgetId,boolean habit) {
        String today=Habits.day(System.currentTimeMillis());
        List<WidgetContent.Entry> source=new ArrayList<>();
        JSONArray raw=habit?Habits.all(c):Reminders.tasks(c);
        for(int i=0;i<raw.length();i++) {
            JSONObject item=raw.optJSONObject(i);if(item==null)continue;
            if(habit&&!Habits.scheduled(item,today))continue;
            source.add(new WidgetContent.Entry(item.optString("id"),item.optString("title"),
                habit?today:item.optString("date"),item.optString("time"),
                habit?Habits.contains(item.optJSONArray("checks"),today):item.optBoolean("done")));
        }
        List<WidgetContent.Entry> entries=WidgetContent.today(source,today);
        RemoteViews views=new RemoteViews(c.getPackageName(),habit?R.layout.habits_widget:R.layout.plan_widget);
        views.setInt(R.id.widget_root,"setBackgroundResource",habit?R.drawable.widget_lilac:R.drawable.widget_sage);
        views.setTextViewText(R.id.widget_title,habit?"习惯打卡":"今日待办");
        views.setTextViewText(R.id.widget_date,new SimpleDateFormat("M月d日 E",Locale.CHINA).format(new Date()));
        views.setTextViewText(R.id.widget_summary,"已完成 "+WidgetContent.completed(entries)+" / "+entries.size());
        views.setOnClickPendingIntent(R.id.widget_root,open(c,habit,""));
        Intent refresh=new Intent(c,habit?HabitsWidget.class:TodayWidget.class).setAction(REFRESH);
        views.setOnClickPendingIntent(R.id.widget_refresh,PendingIntent.getBroadcast(c,0,refresh,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
        views.removeAllViews(R.id.widget_rows);
        views.setViewVisibility(R.id.widget_empty,entries.isEmpty()?View.VISIBLE:View.GONE);
        views.setTextViewText(R.id.widget_empty,habit?"今天暂无打卡":"今天暂无待办");
        int height=manager.getAppWidgetOptions(widgetId).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,180);
        int limit=Math.max(1,Math.min(5,(height-120)/36));
        int shown=Math.min(limit,entries.size());
        for(int i=0;i<shown;i++) {
            WidgetContent.Entry item=entries.get(i);
            RemoteViews row=new RemoteViews(c.getPackageName(),R.layout.widget_row);
            row.setTextViewText(R.id.widget_row_time,item.done?"✓":item.time);
            row.setTextViewText(R.id.widget_row_title,item.title);
            row.setTextColor(R.id.widget_row_title,item.done?0xff788478:0xff293e34);
            row.setOnClickPendingIntent(R.id.widget_row,open(c,habit,item.id));
            views.addView(R.id.widget_rows,row);
        }
        views.setTextViewText(R.id.widget_more,entries.size()>shown?"查看全部 · "+entries.size()+" 项":"打开 Plan  ›");
        manager.updateAppWidget(widgetId,views);
    }
}
