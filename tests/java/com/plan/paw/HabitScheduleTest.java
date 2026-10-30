package com.plan.paw;

import java.text.*;
import java.util.*;
import java.util.function.Predicate;

public class HabitScheduleTest {
    static int passed=0;
    static long at(String value)throws Exception{return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.US).parse(value).getTime();}
    static void equal(Object expected,Object actual){if(!Objects.equals(expected,actual))throw new AssertionError("Expected "+expected+", got "+actual);passed++;}
    static Predicate<String> weekdays(Integer...days){
        return date->{try{
            Calendar c=Calendar.getInstance();c.setTime(new SimpleDateFormat("yyyy-MM-dd",Locale.US).parse(date));
            return Arrays.asList(days).contains(c.get(Calendar.DAY_OF_WEEK)-1);
        }catch(Exception e){throw new IllegalArgumentException(e);}};
    }
    public static void main(String[]args)throws Exception{
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        Set<String> none=Collections.emptySet();
        equal("2026-10-21",HabitSchedule.next("08:30",at("2026-10-21 08:29:59"),d->true,none).date);
        equal("2026-10-22",HabitSchedule.next("08:30",at("2026-10-21 08:30:00"),d->true,none).date);
        equal("2026-10-22",HabitSchedule.next("08:30",at("2026-10-21 07:00:00"),d->true,new HashSet<>(Arrays.asList("2026-10-21"))).date);
        equal("2026-10-26",HabitSchedule.next("08:30",at("2026-10-23 09:00:00"),weekdays(1,2,3,4,5),none).date);
        equal("2026-10-28",HabitSchedule.next("08:30",at("2026-10-21 09:00:00"),weekdays(3),none).date);
        // 只在周一打卡：周一 08:30:02 响过之后，必须还能排到下周一（旧实现 8 天窗口会返回 null）。
        equal("2026-10-26",HabitSchedule.next("08:30",at("2026-10-19 08:30:02"),weekdays(1),new HashSet<>(Arrays.asList("2026-10-19"))).date);
        equal("2026-10-25",HabitSchedule.next("08:30",at("2026-10-18 08:30:02"),weekdays(0),none).date);
        // 每 3 天一次：10-19 开始，下一次是 10-22，再下一次 10-25。
        Predicate<String> every3=date->{
            try{
                SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.US);f.setLenient(false);
                long days=Math.round((f.parse(date).getTime()-f.parse("2026-10-19").getTime())/86400000.0);
                return days>=0&&days%3==0;
            }catch(Exception e){throw new IllegalArgumentException(e);}
        };
        equal("2026-10-22",HabitSchedule.next("08:30",at("2026-10-19 08:30:02"),every3,new HashSet<>(Arrays.asList("2026-10-19"))).date);
        equal("2026-10-28",HabitSchedule.next("08:30",at("2026-10-26 08:30:02"),every3,new HashSet<>(Arrays.asList("2026-10-19","2026-10-22","2026-10-25"))).date);        equal("2027-01-01",HabitSchedule.next("08:30",at("2026-12-31 23:59:59"),d->true,none).date);
        equal("2028-02-29",HabitSchedule.next("08:30",at("2028-02-28 09:00:00"),d->true,none).date);
        equal(null,HabitSchedule.next("08:30",at("2026-10-21 09:00:00"),d->false,none));
        int[] all={0,1,2,3,4,5,6};
        Predicate<String> monthly=date->HabitSchedule.matches("monthly","2026-01-01",date,all,0,31,0);
        equal("2026-03-31",HabitSchedule.next("08:30",at("2026-01-31 08:30:02"),monthly,none,HabitSchedule.horizon("monthly")).date);
        equal("2026-05-31",HabitSchedule.next("08:30",at("2026-04-01 00:00:00"),monthly,none,HabitSchedule.horizon("monthly")).date);
        equal("2026-03-31",HabitSchedule.next("08:30",at("2026-01-31 07:00:00"),monthly,new HashSet<>(Arrays.asList("2026-01-31")),63).date);
        Predicate<String> yearly=date->HabitSchedule.matches("yearly","2026-01-01",date,all,0,5,11);
        equal("2027-11-05",HabitSchedule.next("08:30",at("2026-11-05 08:30:02"),yearly,none).date);
        Predicate<String> leap=date->HabitSchedule.matches("yearly","2024-02-29",date,all,0,29,2);
        equal("2028-02-29",HabitSchedule.next("08:30",at("2025-01-01 00:00:00"),leap,none).date);
        equal("2104-02-29",HabitSchedule.next("08:30",at("2096-02-29 08:30:02"),leap,none).date);
        equal(false,leap.test("2100-02-29"));
        equal(false,leap.test("2025-02-28"));
        equal(false,monthly.test("2026-04-30"));
        equal(false,HabitSchedule.validFrequency("yearly",0,31,4));
        equal(false,HabitSchedule.validFrequency("yearly",0,1,13));
        equal(false,HabitSchedule.validFrequency("monthly",0,32,0));
        equal(true,HabitSchedule.validFrequency("yearly",0,29,2));
        equal(true,HabitSchedule.matches("weekly","2026-10-19","2026-10-26",new int[]{1},0,0,0));
        equal(false,HabitSchedule.matches("weekly","2026-10-19","2026-10-27",new int[]{1},0,0,0));
        Predicate<String> longInterval=date->HabitSchedule.matches("interval","2026-01-01",date,all,365,0,0);
        equal("2027-01-01",HabitSchedule.next("08:30",at("2026-01-01 08:30:02"),longInterval,none,HabitSchedule.horizon("interval")).date);
        System.out.println("Native recurrence checks passed: "+passed);
    }
}
