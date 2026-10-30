package com.plan.paw;

import java.util.*;

public final class WidgetContentTest {
    static WidgetContent.Entry entry(String id,String date,String time,boolean done){return new WidgetContent.Entry(id,"事项 "+id,date,time,done);}
    static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
    public static void main(String[] args){
        List<WidgetContent.Entry> source=Arrays.asList(
            entry("done","2026-12-31","07:00",true),entry("late","2026-12-31","18:00",false),
            entry("b","2026-12-31","08:00",false),entry("a","2026-12-31","08:00",false),
            entry("tomorrow","2027-01-01","08:00",false),entry("yesterday","2026-12-30","08:00",false));
        List<WidgetContent.Entry> today=WidgetContent.today(source,"2026-12-31");
        check(today.size()==4,"Only today's items belong in the widget");
        check(today.get(0).id.equals("a")&&today.get(1).id.equals("b"),"Tied times must have stable order");
        check(today.get(2).id.equals("late")&&today.get(3).done,"Pending items precede completed items");
        check(WidgetContent.completed(today)==1,"Completion summary must include all today's entries");
        check(WidgetContent.today(source,"2027-01-01").get(0).id.equals("tomorrow"),"Midnight switches the day's content");
        check(WidgetContent.today(source,"2027-01-02").isEmpty(),"Empty day has no stale content");
        check(source.get(0).id.equals("done"),"Rendering must not mutate stored ordering");
        check(WidgetContent.completed(Collections.emptyList())==0,"Empty summary is zero");
        System.out.println("Native widget checks passed: 8");
    }
}
