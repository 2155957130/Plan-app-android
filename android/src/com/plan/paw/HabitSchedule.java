package com.plan.paw;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.function.Predicate;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/** Calendar-day recurrence shared by the Android scheduler and JVM regression tests. */
final class HabitSchedule {
    static boolean validFrequency(String type,int interval,int day,int month) {
        if("weekly".equals(type))return true;
        if("interval".equals(type))return interval>=1&&interval<=365;
        if("monthly".equals(type))return day>=1&&day<=31;
        if("yearly".equals(type)){
            try{LocalDate.of(2000,month,day);return true;}catch(Exception e){return false;}
        }
        return false;
    }
    static boolean matches(String type,String from,String key,int[] days,int interval,int day,int month) {
        try {
            LocalDate date=LocalDate.parse(key),start=LocalDate.parse(from);
            if(date.isBefore(start)||!validFrequency(type,interval,day,month))return false;
            if("interval".equals(type))return ChronoUnit.DAYS.between(start,date)%interval==0;
            if("monthly".equals(type))return date.getDayOfMonth()==day;
            if("yearly".equals(type))return date.getMonthValue()==month&&date.getDayOfMonth()==day;
            int weekday=date.getDayOfWeek().getValue()%7;
            for(int n:days)if(n==weekday)return true;
            return false;
        }catch(Exception e){return false;}
    }
    static int horizon(String type) {
        return "yearly".equals(type)?2929:"monthly".equals(type)?63:"interval".equals(type)?368:15;
    }
    static final class Occurrence {
        final String date;
        final long at;
        Occurrence(String date,long at){this.date=date;this.at=at;}
    }
    static Occurrence next(String time,long after,Predicate<String> scheduled,Set<String> checked) {
        return next(time,after,scheduled,checked,2929);
    }
    static Occurrence next(String time,long after,Predicate<String> scheduled,Set<String> checked,int horizon) {
        Calendar cursor=Calendar.getInstance();cursor.setTimeInMillis(after);
        SimpleDateFormat dateFormat=new SimpleDateFormat("yyyy-MM-dd",Locale.US);
        SimpleDateFormat timeFormat=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm",Locale.US);
        timeFormat.setLenient(false);
        // Feb 29 may be eight years away when the intervening century is not a leap year.
        for(int offset=0;offset<horizon;offset++){
            String date=dateFormat.format(cursor.getTime());
            if(scheduled.test(date) && !checked.contains(date)){
                try{
                    long at=timeFormat.parse(date+"T"+time).getTime();
                    if(at>after)return new Occurrence(date,at);
                }catch(java.text.ParseException e){ /* A nonexistent local time is skipped. */ }
            }
            cursor.add(Calendar.DAY_OF_YEAR,1);
        }
        return null;
    }
}
