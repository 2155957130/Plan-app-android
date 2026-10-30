export const REMINDER_MAX = 10080;
export const TAG_LIMIT = 5;
export const TAG_MAX = 12;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y,m,d]=key.split('-').map(Number);
  const value=new Date(y,m-1,d,12);
  return dateKey(value)===key ? value : null;
}
export function validReminder(value) {
  return Number.isInteger(value) && (value === -1 || (value >= 0 && value <= REMINDER_MAX));
}
/** 标签：去空白、去重，最多 5 个，每个最多 12 个字。 */
export function readTags(raw) {
  const list=(Array.isArray(raw)?raw:[]).map(tag=>String(tag??'').trim()).filter(Boolean);
  return [...new Set(list)].slice(0,TAG_LIMIT);
}
export function isStill(task) { return !task?.date; }
export function dueAt(task) { return task?.date ? new Date(`${task.date}T${task.time}:00`).getTime() : null; }
export function reminderAt(task) {
  if (task.done || task.reminder < 0 || !task.date || !task.time) return null;
  return dueAt(task)-task.reminder*60000;
}
export function taskOverdue(task, now = Date.now()) {
  if (task.done || !task.date) return false;
  const at = dueAt(task);
  return Number.isFinite(at) && at < now;
}
/** 旧版三条内置分类；新版本把分类合并进自定义标签，仅在读取旧记录时用于迁移。 */
export const LEGACY_CATEGORIES = {life:'生活',work:'工作',study:'学习'};
export function validateTask(task) {
  if (!task || typeof task.id!=='string' || !task.id || task.id.length>100) return '事件编号无效';
  if (typeof task.title!=='string' || !task.title.trim()) return '请输入事件名称';
  if (task.title.length>120) return '事件名称最多 120 个字';
  if (task.date && !parseDate(task.date)) return '请选择有效的截止日期';
  if (!task.date && task.time) return '没有截止日期时不能设置时间';
  if (task.date && !TIME_PATTERN.test(task.time)) return '请选择有效的时间';
  if (!validReminder(task.reminder)) return `请选择 0–${REMINDER_MAX} 分钟的提醒时间`;
  // 分类已并入标签；旧记录仍可带 category，校验时只要求合法。
  if (task.category!==undefined && !Object.hasOwn(LEGACY_CATEGORIES,task.category)) return '事件分类有误';
  if (typeof task.notes!=='string' || task.notes.length>2000) return '备注最多 2000 个字';
  const tags=task.tags;
  if (tags!==undefined) {
    if (!Array.isArray(tags) || tags.length>TAG_LIMIT) return `标签最多 ${TAG_LIMIT} 个`;
    const seen=new Set();
    for (const tag of tags) {
      if (typeof tag!=='string' || !tag.trim() || tag.trim().length>TAG_MAX) return `每个标签 1–${TAG_MAX} 个字`;
      if (!seen.add(tag.trim())) return '标签不能重复';
    }
  }
  return '';
}
export function readTasks(raw) {
  const tasks=JSON.parse(raw);
  if (!Array.isArray(tasks)) throw new Error('记录格式有误');
  const ids=new Set();
  return tasks.map(t=>{
    if (validateTask(t) || ids.has(t.id)) throw new Error('记录格式有误');
    ids.add(t.id);
    // 把旧分类转换成同名标签，避免升级后分类信息丢失。
    const legacy=LEGACY_CATEGORIES[t.category];
    const tags=readTags([...(t.tags||[]),...(legacy?[legacy]:[])]);
    const task={...t,date:t.date||'',time:t.date?t.time:'',done:!!t.done,doneAt:typeof t.doneAt==='string'?t.doneAt:'',tags};
    delete task.category;
    return task;
  });
}
export function monthCells(year, month) {
  const first=new Date(year,month,1,12), offset=(first.getDay()+6)%7;
  return Array.from({length:42},(_,i)=>new Date(year,month,1-offset+i,12));
}
// 有日期的待办按日期、时间升序；没有日期的待办排在最后，保持一直存在。
export function sortTasks(tasks) {
  const stamp=t=>{const at=dueAt(t);return Number.isFinite(at)?at:Number.POSITIVE_INFINITY;};
  return [...tasks].sort((a,b)=>Number(a.done)-Number(b.done)||stamp(a)-stamp(b)||a.id.localeCompare(b.id));
}
// 待办和今天仅显示未完成项；完成记录单独归入已完成。
export function filteredTasks(tasks, filter, today=dateKey()) {
  const list = tasks.filter(t=>filter==='done' ? t.done : !t.done)
    .filter(t=>filter!=='today'||!t.date||t.date===today);
  return sortTasks(list);
}

export function shiftDate(key, amount) {
  const d=parseDate(key);
  if (!d) throw new Error('日期无效');
  d.setDate(d.getDate()+amount);
  return dateKey(d);
}
export function validDays(days) {
  return Array.isArray(days) && days.length>0 && days.length<=7 && new Set(days).size===days.length && days.every(d=>Number.isInteger(d)&&d>=0&&d<=6);
}
export const INTERVAL_MIN = 1;
export const INTERVAL_MAX = 365;
export function validInterval(n) { return Number.isInteger(n) && n>=INTERVAL_MIN && n<=INTERVAL_MAX; }
export function isIntervalHabit(h) { return h?.freqType==='interval'; }
export const HABIT_TYPES=['weekly','interval','monthly','yearly'];
export function validSchedule(s) {
  const type=s.freqType??'weekly';
  if(!HABIT_TYPES.includes(type)||!validDays(s.days))return false;
  if(type==='interval')return validInterval(s.intervalDays);
  if(type==='monthly'||type==='yearly'){
    if(!Number.isInteger(s.monthDay)||s.monthDay<1||s.monthDay>31)return false;
    if(type==='yearly')return Number.isInteger(s.yearMonth)&&s.yearMonth>=1&&s.yearMonth<=12&&s.monthDay<=new Date(2000,s.yearMonth,0).getDate();
  }
  return true;
}
export function validateHabit(h) {
  if (!h || typeof h.id!=='string' || !h.id || h.id.length>100) return '习惯编号无效';
  if (typeof h.title!=='string' || !h.title.trim() || h.title.length>120) return '请输入 1 到 120 个字的习惯名称';
  if (!validDays(h.days)) return '请至少选择一周中的一天';
  if (!validSchedule(h)) return '打卡频率或循环日期有误';
  if (h.freqType==='interval' && !validInterval(h.intervalDays)) return `间隔天数需在 ${INTERVAL_MIN}–${INTERVAL_MAX} 之间`;
  if (!TIME_PATTERN.test(h.time)) return '请选择有效的打卡时间';
  if (typeof h.remind!=='boolean' || !parseDate(h.startDate)) return '习惯设置有误';
  if (!Array.isArray(h.checks) || h.checks.some(key=>!parseDate(key)||key<h.startDate) || new Set(h.checks).size!==h.checks.length) return '打卡记录格式有误';
  if (!Array.isArray(h.history) || !h.history.length || h.history[0].from!==h.startDate) return '打卡频率记录有误';
  for (let i=0;i<h.history.length;i++) {
    const item=h.history[i];
    if (!parseDate(item.from) || !validDays(item.days) || (i>0 && item.from<=h.history[i-1].from)) return '打卡频率记录有误';
    if (!validSchedule(item)) return '打卡频率记录有误';
    if (item.freqType==='interval' && !validInterval(item.intervalDays)) return '打卡频率记录有误';
  }
  const latest=h.history.at(-1);
  if (h.days.join(',')!==latest.days.join(',')) return '当前打卡频率有误';
  if ((h.freqType??'weekly')!==(latest.freqType??'weekly')) return '当前打卡频率有误';
  if (['monthly','yearly'].includes(h.freqType) && (h.monthDay!==latest.monthDay || (h.freqType==='yearly'&&h.yearMonth!==latest.yearMonth)))return '当前循环日期有误';
  if (h.freqType==='interval' && (latest.freqType!=='interval'||latest.intervalDays!==h.intervalDays)) return '当前打卡频率有误';
  return '';
}
export function readHabits(raw) {
  const habits=JSON.parse(raw);
  if (!Array.isArray(habits)) throw new Error('习惯记录格式有误');
  const ids=new Set();
  return habits.map(h=>{
    if (validateHabit(h) || ids.has(h.id)) throw new Error('习惯记录格式有误');
    ids.add(h.id);
    // 旧记录保持原样（没有 freqType 即按每周频率理解），只有间隔习惯才补齐字段。
    if (h.freqType!=='interval') return h;
    return {
      ...h,
      intervalDays:h.intervalDays,
      history:h.history.map(s=>s.freqType==='interval'?{...s,intervalDays:s.intervalDays}:s)
    };
  });
}
export function daysBetween(from,to) {
  return Math.round((parseDate(to)-parseDate(from))/86400000);
}
export function habitScheduled(h,key) {
  const d=parseDate(key);
  if (!d || key<h.startDate) return false;
  const schedule=[...h.history].reverse().find(s=>s.from<=key);
  if (!schedule) return false;
  if (schedule.freqType==='interval') {
    const every=schedule.intervalDays;
    if (!validInterval(every)) return false;
    return daysBetween(schedule.from,key)%every===0;
  }
  if(schedule.freqType==='monthly')return d.getDate()===schedule.monthDay;
  if(schedule.freqType==='yearly')return d.getMonth()+1===schedule.yearMonth&&d.getDate()===schedule.monthDay;
  // 旧记录没有 freqType，按每周频率理解。
  return Array.isArray(schedule.days)&&schedule.days.includes(d.getDay());
}
export function habitOnDate(h,key) { return h.checks.includes(key) || habitScheduled(h,key); }
/** 下一个计划打卡日（含今天）；闰日跨越非闰世纪时可能相隔八年。 */
export function nextHabitDate(h,today=dateKey()) {
  let key=today<h.startDate?h.startDate:today;
  const horizon=h.freqType==='yearly'?2929:h.freqType==='monthly'?63:isIntervalHabit(h)?368:15;
  for (let i=0;i<horizon;i++) {
    if (habitScheduled(h,key)) return key;
    key=shiftDate(key,1);
  }
  return null;
}
export function habitFrequencyText(h) {
  if (isIntervalHabit(h)) return `每 ${h.intervalDays} 天`;
  if (h.freqType==='monthly')return `每月 ${h.monthDay} 日`;
  if (h.freqType==='yearly')return `每年 ${h.yearMonth} 月 ${h.monthDay} 日`;
  return frequencyText(h.days);
}
// 当天未打卡时宽限到当天结束；过去的计划日漏卡即中断，休息日不打断。
export function habitStreak(h,today=dateKey()) {
  const checked=new Set(h.checks);
  let key=today,count=0;
  if(habitScheduled(h,key)&&!checked.has(key))key=shiftDate(key,-1);
  while (key>=h.startDate) {
    if (habitScheduled(h,key)) {
      if(!checked.has(key))break;
      count++;
    }
    key=shiftDate(key,-1);
  }
  return count;
}
export function checkHabit(h,key=dateKey()) {
  if (!habitOnDate(h,key)) throw new Error('这一天没有安排这个习惯');
  return {...h,checks:h.checks.includes(key)?h.checks.filter(d=>d!==key):[...h.checks,key].sort()};
}
export function updateHabitSchedule(h,days,today=dateKey(),options={}) {
  if (!validDays(days) || today<h.startDate) throw new Error('打卡频率无效');
  const freqType=options.freqType??'weekly';
  const intervalDays=freqType==='interval'?Number(options.intervalDays):null;
  const monthDay=['monthly','yearly'].includes(freqType)?Number(options.monthDay):null;
  const yearMonth=freqType==='yearly'?Number(options.yearMonth):null;
  const fields={days:[...days],freqType,intervalDays,monthDay,yearMonth};
  if(!validSchedule(fields))throw new Error('循环频率或日期无效');
  const sameAs=(item)=>!!item && item.days.join(',')===days.join(',') && (item.freqType??'weekly')===freqType
    && (freqType!=='interval'||item.intervalDays===intervalDays)
    && (!['monthly','yearly'].includes(freqType)||item.monthDay===monthDay)
    && (freqType!=='yearly'||item.yearMonth===yearMonth);
  const history=h.history.map(s=>s.freqType==='interval'?{...s,intervalDays:s.intervalDays}:s);
  // 同一天多次修改只保留最终频率；跨天修改则在当天追加一条，开始日期那条始终保留。
  if (history.at(-1)?.from===today) {
    if (!sameAs(history.at(-1))) history[history.length-1]={from:today,...fields};
  } else if (!sameAs(history.at(-1))) {
    history.push({from:today,...fields});
  }
  return {...h,...fields,history};
}
export function weekDates(today=dateKey()) {
  const monday=shiftDate(today,-((parseDate(today).getDay()+6)%7));
  return Array.from({length:7},(_,i)=>shiftDate(monday,i));
}
export function frequencyText(days) {
  if (days.length===7) return '每天';
  if (days.length===5 && [1,2,3,4,5].every(d=>days.includes(d))) return '每个工作日';
  return '每周'+[1,2,3,4,5,6,0].filter(d=>days.includes(d)).map(d=>'日一二三四五六'[d]).join('、');
}
export function timelineForDate(tasks,habits,key) {
  const events=[
    ...tasks.filter(t=>t.date===key).map(t=>({...t,kind:'task'})),
    ...habits.filter(h=>habitOnDate(h,key)).map(h=>({...h,kind:'habit',date:key,done:h.checks.includes(key)}))
  ];
  return events.sort((a,b)=>a.time.localeCompare(b.time)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}

/* ---------- 趋势统计（“我的”页使用） ---------- */
/** 待办是否在某天完成：新记录用 doneAt，旧记录退回按截止日期判断。 */
export function taskDoneOn(task,key) {
  if (!task.done) return false;
  if (task.doneAt) return dateKey(new Date(task.doneAt))===key;
  return task.date===key;
}
/** 习惯是否在某天完成（只统计当天有计划的日子）。 */
export function habitDoneOn(h,key) { return h.checks.includes(key)&&habitScheduled(h,key); }
/** 本周（周一至周日）的完成情况：rate 为百分比，0–100。 */
export function weekSummary(tasks,habits,today=dateKey()) {
  const dates=weekDates(today);
  const weekTasks=tasks.filter(t=>t.date&&dates.includes(t.date));
  const tasksDone=weekTasks.filter(t=>t.done).length;
  const habitsDone=dates.reduce((sum,key)=>sum+habits.filter(h=>habitDoneOn(h,key)).length,0);
  const dated=weekTasks.length+dates.reduce((sum,key)=>sum+habits.filter(h=>habitOnDate(h,key)).length,0);
  const done=tasksDone+habitsDone;
  return {dates,tasksDone,habitsDone,done,dated,rate:dated?Math.round(done/dated*100):0};
}
