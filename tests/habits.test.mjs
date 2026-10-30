import test from 'node:test';
import assert from 'node:assert/strict';
import {readTasks,readHabits,validateHabit,habitScheduled,habitOnDate,habitStreak,nextHabitDate,habitFrequencyText,isIntervalHabit,checkHabit,updateHabitSchedule,weekDates,frequencyText,timelineForDate,weekSummary,habitDoneOn} from '../android/assets/model.mjs';

const habit=(changes={})=>({id:'reading',title:'阅读 20 分钟',days:[1,2,3,4,5,6,0],time:'08:30',remind:true,startDate:'2026-10-19',checks:[],history:[{from:'2026-10-19',days:[1,2,3,4,5,6,0]}],...changes});
const calendarHabit=(type,from,monthDay,yearMonth)=>{
  const days=[1,2,3,4,5,6,0],schedule={days,freqType:type,monthDay,...(type==='yearly'?{yearMonth}:{})};
  return habit({...schedule,startDate:from,history:[{from,...schedule}]});
};

test('每月指定日期循环，月末缺少日期时跳过，不滚入下个月',()=>{
  const h=calendarHabit('monthly','2026-01-31',31);
  assert.equal(validateHabit(h),'');
  assert.equal(habitFrequencyText(h),'每月 31 日');
  assert.equal(habitScheduled(h,'2025-12-31'),false);
  for(const date of ['2026-01-31','2026-03-31','2026-05-31','2027-01-31'])assert.equal(habitScheduled(h,date),true,date);
  for(const date of ['2026-02-28','2026-03-01','2026-04-30'])assert.equal(habitScheduled(h,date),false,date);
  assert.equal(nextHabitDate(h,'2026-02-01'),'2026-03-31');
  assert.equal(nextHabitDate(h,'2026-12-31'),'2026-12-31');
});

test('年度循环跨年和闰世纪，2月29日仅在真实闰日安排',()=>{
  const yearly=calendarHabit('yearly','2026-10-26',5,11);
  assert.equal(habitFrequencyText(yearly),'每年 11 月 5 日');
  assert.equal(nextHabitDate(yearly,'2026-11-06'),'2027-11-05');
  assert.equal(habitScheduled(yearly,'2027-12-05'),false);
  const leap=calendarHabit('yearly','2024-02-29',29,2);
  assert.equal(validateHabit(leap),'');
  assert.equal(nextHabitDate(leap,'2025-01-01'),'2028-02-29');
  assert.equal(nextHabitDate(leap,'2096-03-01'),'2104-02-29');
  assert.equal(habitScheduled(leap,'2100-02-29'),false);
  assert.equal(habitScheduled(leap,'2025-02-28'),false);
});

test('月度年度循环拒绝不存在的日期，当前字段必须与历史规则一致',()=>{
  const yearly=calendarHabit('yearly','2026-01-01',30,4);
  assert.equal(validateHabit(yearly),'');
  for(const [day,month] of [[31,4],[30,2],[1,0],[1,13],[1.5,1]])assert.ok(validateHabit(calendarHabit('yearly','2026-01-01',day,month)));
  assert.ok(validateHabit(calendarHabit('monthly','2026-01-01',0)));
  assert.ok(validateHabit(calendarHabit('monthly','2026-01-01',32)));
  assert.ok(validateHabit({...yearly,monthDay:29}));
  assert.ok(validateHabit({...yearly,yearMonth:3}));
  assert.ok(validateHabit({...yearly,freqType:'weekly'}));
});

test('月度年度漏卡按计划日期中断，空档不计入连续次数',()=>{
  const monthly={...calendarHabit('monthly','2026-01-31',31),checks:['2026-01-31','2026-03-31','2026-05-31']};
  assert.equal(habitStreak(monthly,'2026-06-30'),3);
  assert.equal(habitStreak(monthly,'2026-07-31'),3);
  assert.equal(habitStreak(monthly,'2026-08-01'),0);
  const yearly={...calendarHabit('yearly','2024-02-29',29,2),checks:['2024-02-29','2028-02-29']};
  assert.equal(habitStreak(yearly,'2031-12-31'),2);
  assert.equal(habitStreak(yearly,'2032-02-29'),2);
  assert.equal(habitStreak(yearly,'2032-03-01'),0);
});

test('日循环改月循环再改年循环保留历史，同日改动只保留最终规则',()=>{
  const original=habit({checks:['2026-10-19','2026-10-20']});
  const monthly=updateHabitSchedule(original,original.days,'2026-10-21',{freqType:'monthly',monthDay:25});
  assert.equal(validateHabit(monthly),'');
  assert.equal(habitScheduled(monthly,'2026-10-20'),true);
  assert.equal(habitScheduled(monthly,'2026-10-22'),false);
  assert.equal(habitScheduled(monthly,'2026-10-25'),true);
  const yearly=updateHabitSchedule(monthly,monthly.days,'2026-11-01',{freqType:'yearly',monthDay:1,yearMonth:12});
  assert.equal(habitScheduled(yearly,'2026-10-25'),true);
  assert.equal(habitScheduled(yearly,'2026-11-25'),false);
  assert.equal(habitScheduled(yearly,'2026-12-01'),true);
  assert.deepEqual(yearly.checks,original.checks);
  const changed=updateHabitSchedule(yearly,yearly.days,'2026-11-01',{freqType:'yearly',monthDay:29,yearMonth:2});
  assert.equal(changed.history.length,3);
  assert.equal(validateHabit(changed),'');
  assert.equal(nextHabitDate(changed,'2026-11-01'),'2028-02-29');
  assert.throws(()=>updateHabitSchedule(changed,changed.days,'2026-11-01',{freqType:'yearly',monthDay:31,yearMonth:4}));
});

test('月年度记录刷新导入兼容，并进入正确日历时间线与狗爪周进度',()=>{
  const monthly=calendarHabit('monthly','2026-01-01',26),yearly={...calendarHabit('yearly','2026-01-01',26,10),id:'yearly',time:'06:30'};
  assert.deepEqual(readHabits(JSON.stringify([monthly,yearly])),[monthly,yearly]);
  assert.deepEqual(timelineForDate([],[monthly,yearly],'2026-10-26').map(e=>e.id),['yearly','reading']);
  assert.equal(timelineForDate([],[monthly,yearly],'2026-10-27').length,0);
  const checked=checkHabit(monthly,'2026-10-26');
  assert.equal(habitDoneOn(checked,'2026-10-26'),true);
  assert.equal(weekSummary([],[checked],'2026-10-26').dated,1);
  assert.equal(weekSummary([],[checked],'2026-10-26').habitsDone,1);
  assert.throws(()=>checkHabit(monthly,'2026-10-27'));
});

test('每天习惯连续计数，今天尚未打卡不提前清零，漏一天后断开',()=>{
  const h=habit({checks:['2026-10-19','2026-10-20']});
  assert.equal(habitStreak(h,'2026-10-21'),2);
  const checked=checkHabit(h,'2026-10-21');
  assert.equal(habitStreak(checked,'2026-10-21'),3);
  assert.equal(habitStreak(checked,'2026-10-22'),3);
  assert.equal(habitStreak(checked,'2026-10-23'),0);
  assert.deepEqual(checkHabit(checked,'2026-10-21'),h);
});
test('连续段结束多天后不再把空档算作连续',()=>{
  const h=habit({checks:['2026-10-19','2026-10-20','2026-10-21']});
  assert.equal(habitStreak(h,'2026-10-22'),3);
  assert.equal(habitStreak(h,'2026-10-25'),0);
  assert.equal(habitStreak(h,'2026-11-02'),0);
  const gap=habit({checks:['2026-10-19','2026-10-20','2026-10-22','2026-10-23']});
  assert.equal(habitStreak(gap,'2026-10-23'),2);
});
test('工作日的周末不打断连续记录，计划日缺卡才中断',()=>{
  const days=[1,2,3,4,5],h=habit({days,startDate:'2026-10-16',history:[{from:'2026-10-16',days}],checks:['2026-10-16','2026-10-19']});
  assert.equal(habitScheduled(h,'2026-10-17'),false);
  assert.equal(habitStreak(h,'2026-10-20'),2);
  assert.equal(habitStreak({...h,checks:['2026-10-16','2026-10-20']},'2026-10-20'),1);
  assert.throws(()=>checkHabit(h,'2026-10-18'));
});
test('自选星期按实际打卡日累计，创建之前不产生安排',()=>{
  const days=[3,5],h=habit({days,startDate:'2026-10-21',history:[{from:'2026-10-21',days}],checks:['2026-10-21','2026-10-23']});
  assert.equal(habitStreak(h,'2026-10-24'),2);
  assert.equal(habitScheduled(h,'2026-10-16'),false);
  assert.equal(habitOnDate(h,'2026-10-22'),false);
  assert.equal(frequencyText(days),'每周三、五');
});
test('频率修改保留历史安排，同一天多次修改只保留最终频率',()=>{
  const h=habit({checks:['2026-10-19','2026-10-20']});
  const updated=updateHabitSchedule(h,[3,5],'2026-10-21');
  assert.equal(habitScheduled(updated,'2026-10-20'),true);
  assert.equal(habitScheduled(updated,'2026-10-22'),false);
  const checked={...updated,checks:[...updated.checks,'2026-10-21','2026-10-23']};
  assert.equal(habitStreak(checked,'2026-10-24'),4);
  const again=updateHabitSchedule(updated,[1,3,5],'2026-10-21');
  assert.equal(again.history.length,2);assert.equal(validateHabit(again),'');
  assert.equal(validateHabit(updateHabitSchedule(h,[1,2,3,4,5,6,0],'2026-10-21')),'');
});
test('本周狗爪进度覆盖周一至周日，包括跨年',()=>{
  assert.deepEqual(weekDates('2026-10-21'),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
  assert.equal(weekDates('2027-01-01')[0],'2026-12-28');
});
test('校验习惯频率、记录、历史，读取后保存提醒和打卡状态',()=>{
  const h=habit({checks:['2026-10-19']});assert.equal(validateHabit(h),'');
  assert.deepEqual(readHabits(JSON.stringify([h])),[h]);
  for(const change of [{days:[]},{days:[1,1]},{days:[7]},{time:'24:00'},{remind:'yes'},{checks:['2026-02-30']},{checks:['2026-10-19','2026-10-19']},{history:[]}])assert.ok(validateHabit({...h,...change}));
  assert.throws(()=>readHabits(JSON.stringify([h,h])));
  assert.throws(()=>readHabits('{}'));
});
test('时间线合并任务与习惯，按时间排序，已完成事项不跳到最后',()=>{
  const base={date:'2026-10-21',reminder:-1,category:'life',notes:''};
  const tasks=[{...base,id:'late',title:'晚上的计划',time:'20:00',done:false},{...base,id:'early',title:'早上的计划',time:'07:00',done:true},{...base,id:'tomorrow',title:'明天',date:'2026-10-22',time:'06:00',done:false}];
  const h=habit(),events=timelineForDate(tasks,[h],'2026-10-21');
  assert.deepEqual(events.map(t=>t.id),['early','reading','late']);
  assert.equal(events[0].done,true);assert.equal(events[1].kind,'habit');
  assert.equal(timelineForDate(tasks,[h],'2026-10-18').length,0);
});
test('旧版待办数据可直接读取，新习惯存储为空时不影响旧记录',()=>{
  const old={id:'old',title:'旧计划',date:'2026-10-21',time:'18:00',reminder:-1,notes:'旧备注',done:false};
  assert.deepEqual(readTasks(JSON.stringify([old])),[{...old,tags:[],doneAt:''}]);
  assert.deepEqual(readHabits('[]'),[]);
});
test('每间隔几天的习惯从开始日期起算，休息日不计入连续',()=>{
  const days=[1,2,3,4,5,6,0];
  const h={id:'interval',title:'浇花',days,time:'08:00',remind:false,startDate:'2026-10-19',checks:[],freqType:'interval',intervalDays:3,history:[{from:'2026-10-19',days,freqType:'interval',intervalDays:3}]};
  assert.equal(validateHabit(h),'');
  assert.equal(isIntervalHabit(h),true);
  assert.equal(habitFrequencyText(h),'每 3 天');
  assert.equal(habitScheduled(h,'2026-10-18'),false);
  assert.equal(habitScheduled(h,'2026-10-19'),true);
  assert.equal(habitScheduled(h,'2026-10-20'),false);
  assert.equal(habitScheduled(h,'2026-10-22'),true);
  assert.equal(habitScheduled(h,'2026-10-25'),true);
  assert.equal(nextHabitDate(h,'2026-10-20'),'2026-10-22');
  assert.equal(nextHabitDate(h,'2026-10-19'),'2026-10-19');
  assert.equal(habitStreak({...h,checks:['2026-10-19','2026-10-22']},'2026-10-22'),2);
  assert.equal(habitStreak({...h,checks:['2026-10-19']},'2026-10-25'),0);
  const skipped={...h,checks:['2026-10-19','2026-10-25']};
  assert.equal(habitStreak(skipped,'2026-10-25'),1);
  assert.equal(habitDoneOn(skipped,'2026-10-20'),false);
  assert.equal(habitDoneOn(skipped,'2026-10-25'),true);
  assert.throws(()=>checkHabit(h,'2026-10-20'));
});
test('间隔频率可修改并保留历史，非法间隔被拒绝',()=>{
  const h=habit();
  const updated=updateHabitSchedule(h,[1,2,3,4,5,6,0],'2026-10-21',{freqType:'interval',intervalDays:2});
  assert.equal(updated.freqType,'interval');
  assert.equal(updated.intervalDays,2);
  assert.equal(validateHabit(updated),'');
  assert.equal(habitScheduled(updated,'2026-10-21'),true);
  assert.equal(habitScheduled(updated,'2026-10-22'),false);
  assert.equal(habitScheduled(updated,'2026-10-23'),true);
  const again=updateHabitSchedule(updated,[1,2,3,4,5,6,0],'2026-10-21',{freqType:'interval',intervalDays:5});
  assert.equal(again.history.length,2);
  assert.equal(habitScheduled(again,'2026-10-22'),false);
  assert.equal(habitScheduled(again,'2026-10-26'),true);
  assert.ok(validateHabit({...updated,intervalDays:0}));
  assert.ok(validateHabit({...updated,intervalDays:366}));
  assert.ok(validateHabit({...updated,freqType:'sometimes'}));
  assert.throws(()=>updateHabitSchedule(updated,[1,2,3,4,5,6,0],'2026-10-21',{freqType:'interval',intervalDays:0}));
});
test('本周完成率同时统计待办与习惯',()=>{
  const days=[1,2,3,4,5,6,0];
  const h={id:'h',title:'喝水',days,time:'08:00',remind:false,freqType:'weekly',startDate:'2026-10-19',checks:['2026-10-19','2026-10-20'],history:[{from:'2026-10-19',days,freqType:'weekly',intervalDays:null}]};
  const tasks=[
    {id:'a',title:'完成',date:'2026-10-20',time:'09:00',reminder:-1,notes:'',done:true,tags:[]},
    {id:'b',title:'未完成',date:'2026-10-22',time:'09:00',reminder:-1,notes:'',done:false,tags:[]},
    {id:'c',title:'下周',date:'2026-10-26',time:'09:00',reminder:-1,notes:'',done:false,tags:[]}
  ];
  const summary=weekSummary(tasks,[h],'2026-10-22');
  assert.equal(summary.tasksDone,1);
  assert.equal(summary.habitsDone,2);
  assert.equal(summary.dated,2+7);
  assert.equal(summary.rate,33);
  assert.equal(summary.dates[0],'2026-10-19');
  assert.equal(summary.dates[6],'2026-10-25');
});
