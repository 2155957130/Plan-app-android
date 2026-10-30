package com.plan.paw;

import java.util.*;

/** Stable daily widget selection, independent of Android for regression checks. */
final class WidgetContent {
    static final class Entry {
        final String id,title,date,time;
        final boolean done;
        Entry(String id,String title,String date,String time,boolean done) {
            this.id=id;this.title=title;this.date=date;this.time=time;this.done=done;
        }
    }
    static List<Entry> today(List<Entry> source,String date) {
        List<Entry> result=new ArrayList<>();
        for(Entry e:source)if(date.equals(e.date))result.add(e);
        result.sort(Comparator.comparing((Entry e)->e.done).thenComparing(e->e.time).thenComparing(e->e.id));
        return result;
    }
    static int completed(List<Entry> entries) {
        int total=0;for(Entry e:entries)if(e.done)total++;return total;
    }
}
