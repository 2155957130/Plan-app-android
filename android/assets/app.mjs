import {dateKey,parseDate,dueAt,reminderAt,validReminder,validateTask,readTasks,readTags,monthCells,filteredTasks,readHabits,validateHabit,habitOnDate,habitScheduled,habitDoneOn,habitStreak,nextHabitDate,habitFrequencyText,isIntervalHabit,checkHabit,updateHabitSchedule,weekDates,frequencyText,timelineForDate,taskOverdue,TAG_LIMIT,TAG_MAX,REMINDER_MAX,INTERVAL_MIN,INTERVAL_MAX} from './model.mjs';
const $=id=>document.getElementById(id);
const native=typeof window.PlanAndroid!=='undefined';
const weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const reminderPresets=[-1,0,5,15,30,60,1440];
const icons=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tasks=[],habits=[],loadFailed=false,habitsLoadFailed=false,currentView='todo',filter='all',tagFilter='',selected=dateKey(),month=new Date().getMonth(),year=new Date().getFullYear(),editing=null,editingHabit=null,deleteKind='task',toastTimer,day=dateKey();
let mineHabit=readSelectedHabit();
function readSelectedHabit(){try{return localStorage.getItem('plan-mine-habit')||'';}catch{return '';}}
function rememberSelectedHabit(id){mineHabit=id;try{localStorage.setItem('plan-mine-habit',id);}catch{/* 忽略隐私模式下的存储失败 */}}
try {tasks=readTasks(native?window.PlanAndroid.loadData():(localStorage.getItem('plan-tasks-v1')||'[]'));}
catch(e){loadFailed=true;}
try {habits=readHabits(native?window.PlanAndroid.loadHabits():(localStorage.getItem('plan-habits-v1')||'[]'));}
catch(e){habitsLoadFailed=true;}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200);}
function status(){try{return native?JSON.parse(window.PlanAndroid.status()):{notifications:false,exact:false};}catch{return {notifications:false,exact:false};}}
function persist(next){
  if(loadFailed){toast('记录读取失败，请重新打开应用，避免覆盖原有记录');return false;}
  try{
    if(native){const result=JSON.parse(window.PlanAndroid.saveData(JSON.stringify(next)));if(!result.ok)throw new Error(result.error||'保存失败');}
    else localStorage.setItem('plan-tasks-v1',JSON.stringify(next));
    tasks=next;render();return true;
  }catch(e){toast(e.message==='QuotaExceededError'?'存储空间不足，未能保存':'未能保存，请检查可用存储空间');return false;}
}
function persistHabits(next){
  if(habitsLoadFailed){toast('习惯记录读取失败，请重新打开，避免覆盖原有记录');return false;}
  try {
    if(native){const result=JSON.parse(window.PlanAndroid.saveHabits(JSON.stringify(next)));if(!result.ok)throw new Error(result.error);}
    else localStorage.setItem('plan-habits-v1',JSON.stringify(next));
    habits=next;render();return true;
  }catch{toast('习惯未能保存，请检查可用存储空间');return false;}
}
function dateText(key){const today=dateKey();const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);if(key===today)return '今天';if(key===dateKey(tomorrow))return '明天';const d=parseDate(key);return `${d.getFullYear()===new Date().getFullYear()?'':d.getFullYear()+'年'}${d.getMonth()+1}月${d.getDate()}日`;}
function reminderText(minutes){
  if(minutes<0)return '不提醒';
  if(minutes===0)return '准时提醒';
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60,parts=[];
  if(days)parts.push(days+' 天');if(hours)parts.push(hours+' 小时');if(mins)parts.push(mins+' 分钟');
  return `提前 ${parts.join(' ')}`;
}
function tagChips(tags){return (tags||[]).map(tag=>`<span class="tag-chip">#${escape(tag)}</span>`).join('');}
function row(t){
  const overdue=taskOverdue(t),hasDate=!!t.date;
  const when=hasDate?`${dateText(t.date)} ${escape(t.time)}${overdue?' · 已逾期':''}`:'无日期 · 一直保留';
  const reminder=t.reminder>=0?(hasDate?`<span>${icons('bell')}${reminderText(t.reminder)}</span>`:`<span>${icons('bell')}设置日期后提醒</span>`):'';
  return `<article class="task-row ${t.done?'completed':''}" data-id="${escape(t.id)}"><button class="check-button" data-toggle="${escape(t.id)}" aria-label="${t.done?'标记未完成':'完成'}：${escape(t.title)}" aria-pressed="${t.done}">${t.done?icons('check'):''}</button><button class="task-main" data-edit="${escape(t.id)}" aria-label="编辑 ${escape(t.title)}"><div class="task-title-line"><span class="task-title">${escape(t.title)}</span>${!hasDate&&!t.done?'<span class="still-tag">无日期</span>':''}</div><div class="task-meta"><span class="${overdue?'overdue':hasDate&&t.date===dateKey()&&!t.done?'up-next':''}">${icons(hasDate?'clock':'calendar')}${when}</span>${reminder}</div>${t.tags?.length?`<div class="task-tags">${tagChips(t.tags)}</div>`:''}${t.notes?`<div class="task-notes">${escape(t.notes)}</div>`:''}</button></article>`;
}
function renderTagFilter(){
  const used=[...new Set(tasks.flatMap(t=>t.tags||[]))].sort((a,b)=>a.localeCompare(b,'zh'));
  if(tagFilter&&!used.includes(tagFilter))tagFilter='';
  const box=$('tag-filter');box.classList.toggle('hidden',!used.length);
  if(!used.length){box.innerHTML='';return;}
  const button=(attr,value,label,active)=>`<button class="tag-filter-chip ${active?'active':''}" ${attr}="${escape(value)}" aria-pressed="${active}">${escape(label)}</button>`;
  box.innerHTML=used.map(tag=>button('data-tag-filter',tag,'#'+tag,tag===tagFilter)).join('')
    +(tagFilter?'<button class="tag-filter-chip clear" data-clear-tag aria-pressed="false">清除筛选</button>':'');
}
function empty(type='all'){
  const messages={all:['暂无待办','添加待办'],today:['今天暂无待办','添加待办'],done:['暂无已完成待办','查看待办'],agenda:['当天暂无安排','添加日程']}[type]||['暂无待办','添加待办'];
  return `<div class="empty-state"><h3>${messages[0]}</h3><button class="text-button" data-empty-add="${type}">${icons('plus')}${messages[1]}</button></div>`;
}
function render(){
  const today=dateKey(),now=new Date(),open=tasks.filter(t=>!t.done),todayTasks=tasks.filter(t=>t.date===today||!t.date),todayDone=todayTasks.filter(t=>t.done).length;
  $('stat-open').textContent=open.length;$('stat-done').textContent=tasks.filter(t=>t.done).length;$('stat-today').textContent=todayTasks.length;
  const doneCount=tasks.length-open.length;
  $('nav-count').textContent=open.length;$('heading-count').textContent=filter==='done'?doneCount:open.length;$('filter-count').textContent=open.length;$('done-count').textContent=doneCount;
  $('top-date').textContent=`${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
  $('today-number').textContent=String(now.getDate()).padStart(2,'0');$('today-weekday').textContent=`${now.getMonth()+1}月 · ${weekdays[now.getDay()]}`;
  const percent=todayTasks.length?Math.round(todayDone/todayTasks.length*100):0;$('today-percent').textContent=percent+'%';$('progress-fill').style.width=percent+'%';
  const list=filteredTasks(tasks,filter,today).filter(t=>!tagFilter||t.tags?.includes(tagFilter));
  $('task-list').innerHTML=list.length?list.map(row).join(''):empty(filter);
  renderTagFilter();
  renderCalendar();renderHabits();renderMine();
}
function renderCalendar(){
  $('month-label').textContent=`${year}年 ${month+1}月`;
  const today=dateKey(),counts=new Map();monthCells(year,month).forEach(d=>{const key=dateKey(d);counts.set(key,timelineForDate(tasks,habits,key).filter(t=>!t.done).length);});
  $('calendar-grid').innerHTML=monthCells(year,month).map(d=>{const key=dateKey(d),count=counts.get(key)||0;return `<button class="day ${d.getMonth()!==month?'other-month':''} ${key===today?'today':''} ${key===selected?'selected':''}" data-day="${key}" aria-label="${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日${count?'，'+count+'个未完成安排':''}" aria-pressed="${key===selected}"><span>${d.getDate()}</span><span class="day-dots">${'<i></i>'.repeat(Math.min(count,3))}</span></button>`;}).join('');
  const d=parseDate(selected);$('selected-date').textContent=`${d.getMonth()+1}月${d.getDate()}日`;$('selected-weekday').textContent=`${d.getFullYear()} · ${weekdays[d.getDay()]}`;
  const list=timelineForDate(tasks,habits,selected);$('timeline-count').textContent=`${list.length} 项`;$('agenda-list').innerHTML=list.length?`<ol class="timeline-list">${list.map(timelineRow).join('')}</ol>`:empty('agenda');
}
function timelineRow(t){
  const isHabit=t.kind==='habit',canCheck=!isHabit||selected===dateKey();
  const overdue=!t.done&&dueAt(t)!==null&&dueAt(t)<Date.now();
  const toggleAttr=isHabit?`data-habit-check="${escape(t.id)}"`:`data-toggle="${escape(t.id)}"`;
  const editAttr=isHabit?`data-habit-edit="${escape(t.id)}"`:`data-edit="${escape(t.id)}"`;
  return `<li class="timeline-event ${t.done?'completed':''}"><time datetime="${t.date}T${t.time}">${t.time}</time><span class="timeline-node ${t.done?'checked':''}">${t.done?icons('check'):''}</span><div class="timeline-content"><button class="timeline-title" ${editAttr} aria-label="编辑 ${escape(t.title)}">${escape(t.title)}</button><div class="timeline-meta"><span class="${overdue?'overdue':''}">${t.done?'已完成':isHabit?(selected===dateKey()?'待打卡':selected<dateKey()?'未打卡':'待打卡'):overdue?'已逾期':'待完成'}</span>${(isHabit?t.remind:t.reminder>=0)?icons('bell'):''}</div>${t.tags?.length?`<div class="task-tags">${tagChips(t.tags)}</div>`:''}${!isHabit&&t.notes?`<p>${escape(t.notes)}</p>`:''}</div>${canCheck?`<button class="check-button" ${toggleAttr} aria-label="${t.done?'撤销完成':'完成'}时间线事件：${escape(t.title)}" aria-pressed="${t.done}">${t.done?icons('check'):''}</button>`:''}</li>`;
}
function setView(view){
  const names={todo:'待办',habits:'打卡',calendar:'日历',mine:'我的'};
  currentView=Object.hasOwn(names,view)?view:'todo';
  document.body.classList.toggle('calendar-mode',currentView==='calendar');
  document.body.classList.toggle('focused-mode',currentView!=='todo');
  Object.keys(names).forEach(name=>$(name+'-view').classList.toggle('hidden',currentView!==name));
  document.querySelectorAll('[data-view]').forEach(e=>{e.classList.toggle('active',e.dataset.view===currentView);e.setAttribute('aria-current',e.dataset.view===currentView?'page':'false');});
  $('view-name').textContent=names[currentView];
  if(location.hash!==`#${currentView}`)history.replaceState(null,'',`#${currentView}`);
  window.scrollTo({top:0,behavior:'instant'});
}
function selectDate(key,reveal=false){selected=key;const d=parseDate(key);month=d.getMonth();year=d.getFullYear();renderCalendar();if(reveal&&window.matchMedia('(max-width:700px)').matches)document.querySelector('.agenda-card').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
function syncDateTimeFields(){
  const hasDate=!!$('task-date').value;
  $('task-time').disabled=!hasDate;
  document.querySelector('.date-clear').textContent='不设日期，一直保留';
  updateReminderHint();
}
function syncReminderChoice(minutes){
  const select=$('task-reminder'),custom=$('custom-reminder'),input=$('reminder-minutes');
  const preset=reminderPresets.includes(minutes)?String(minutes):'custom';
  select.value=preset;
  custom.classList.toggle('hidden',preset!=='custom');
  input.value=preset==='custom'?String(minutes):'';
}
function readReminderChoice(){
  const select=$('task-reminder');
  if(select.value==='custom'){
    const input=$('reminder-minutes'),text=input.value.trim();
    if(!/^\d+$/.test(text))return null;
    const minutes=Number(text);return validReminder(minutes)&&minutes>=1?minutes:null;
  }
  return Number(select.value);
}
function updateReminderHint(){
  const minutes=readReminderChoice(),hint=$('reminder-hint');
  if(minutes===null){hint.textContent=`请输入 1–${REMINDER_MAX} 之间的分钟数`;return;}
  if(minutes<0){hint.textContent='';return;}
  if(!native){hint.textContent='浏览器不支持后台提醒，安装安卓版后生效';return;}
  if(!$('task-date').value){hint.textContent='设置截止日期后才会发送提醒';return;}
  const at=reminderAt({date:$('task-date').value,time:$('task-time').value||'09:00',reminder:minutes,done:false});
  hint.textContent=at!==null&&at<=Date.now()?'提醒时间已过，本次将不会发送通知，但仍可正常保存。':(status().notifications?'':'需允许通知权限');}
function readTagLibrary(){
  try{return readTags(JSON.parse(localStorage.getItem('plan-tags-v1')||'[]'));}catch{return [];}
}
function rememberTags(list){try{localStorage.setItem('plan-tags-v1',JSON.stringify(readTags(list)));}catch{/* 忽略隐私模式下的存储失败 */}}
/** 标签库 + 记录里实际用过的标签，合并去重后作为可点选列表。 */
function tagOptions(){
  return readTags([...readTagLibrary(),...tasks.flatMap(t=>t.tags||[])]).sort((a,b)=>a.localeCompare(b,'zh'));
}
let tagDraft=[];
function openForm(task=null,key=null){
  editing=task?.id??null;$('task-form').reset();$('form-error').textContent='';
  $('form-heading').textContent=task?'编辑待办':'添加待办';$('task-title').value=task?.title??'';
  $('task-date').value=task?(task.date||''):(key??(currentView==='calendar'?selected:dateKey()));
  $('task-time').value=task?.time||'18:00';$('task-notes').value=task?.notes??'';
  $('delete-task').classList.toggle('hidden',!task);
  tagDraft=[...(task?.tags||[])];
  renderTagPicker();
  syncReminderChoice(task?.reminder??-1);
  syncDateTimeFields();
  $('task-dialog').showModal();
}
function renderTagPicker(){
  const options=tagOptions(),box=$('task-tags-picker');
  tagDraft=tagDraft.filter(tag=>options.includes(tag));
  if(!options.length){box.innerHTML='<span class="tag-picker-empty">还没有标签，点右上角「管理标签」新建。</span>';return;}
  box.innerHTML=options.map(tag=>`<button type="button" class="tag-option ${tagDraft.includes(tag)?'active':''}" data-tag-option="${escape(tag)}" aria-pressed="${tagDraft.includes(tag)}">#${escape(tag)}</button>`).join('');
}
function toggleTagDraft(tag){
  if(tagDraft.includes(tag)){tagDraft=tagDraft.filter(t=>t!==tag);return;}
  if(tagDraft.length>=TAG_LIMIT){toast(`最多选 ${TAG_LIMIT} 个标签`);return;}
  tagDraft=[...tagDraft,tag];
}
function renderTagManager(){
  const list=tagOptions();
  $('tag-manage-list').innerHTML=list.length
    ?list.map(tag=>`<span class="tag-manage-item">#${escape(tag)}<button type="button" data-delete-tag="${escape(tag)}" aria-label="删除标签 ${escape(tag)}"><svg><use href="#i-close"/></svg></button></span>`).join('')
    :'<p class="tag-manage-empty">还没有标签，在上方输入框里新建一个。</p>';
}
function openTagManager(){
  $('tag-form-error').textContent='';
  $('tag-new').value='';
  renderTagManager();
  if(!$('tag-dialog').open)$('tag-dialog').showModal();
  $('tag-new').focus?.();
}
function saveTagForm(event){
  event.preventDefault();
  const tag=String($('tag-new').value||'').replace(/^#+/,'').trim();
  if(!tag){$('tag-form-error').textContent='请输入标签名称';return;}
  if(tag.length>TAG_MAX){$('tag-form-error').textContent=`标签最多 ${TAG_MAX} 个字`;return;}
  const list=tagOptions();
  if(list.includes(tag)){$('tag-form-error').textContent='这个标签已经存在';return;}
  if(list.length>=24){$('tag-form-error').textContent='标签最多 24 个，请先删除不用的标签';return;}
  rememberTags([...list,tag]);
  $('tag-new').value='';
  $('tag-form-error').textContent='';
  renderTagManager();
  renderTagPicker();
  toast(`已添加标签 #${tag}`);
}
function deleteTag(tag){
  rememberTags(tagOptions().filter(t=>t!==tag));
  tagDraft=tagDraft.filter(t=>t!==tag);
  renderTagManager();
  renderTagPicker();
}
function saveForm(event){
  event.preventDefault();
  const existing=tasks.find(t=>t.id===editing),rawDate=$('task-date').value,tags=[...tagDraft];
  const task={
    id:editing??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,11)}`,
    title:$('task-title').value.trim(),
    date:rawDate,time:rawDate?$('task-time').value:'',
    reminder:readReminderChoice(),tags,
    notes:$('task-notes').value.trim(),done:existing?.done??false,doneAt:existing?.doneAt??''
  };
  if(task.reminder===null){$('form-error').textContent=`请输入 1–${REMINDER_MAX} 之间的提醒分钟数`;return;}
  const error=validateTask(task);
  if(error){$('form-error').textContent=error;return;}
  const next=editing?tasks.map(t=>t.id===editing?task:t):[...tasks,task];
  if(!persist(next))return;
  $('task-dialog').close();if(currentView==='calendar'&&task.date)selectDate(task.date);
  const at=reminderAt(task);
  const notice=!task.date&&task.reminder>=0?'已保存；没有截止日期，提醒不会发送'
    :at!==null&&at<=Date.now()?'已保存；提醒时间已过，不再发送通知'
    :editing?'已更新':'已保存';
  toast(notice);
  if(native&&task.date&&task.reminder>=0&&!status().notifications)window.PlanAndroid.requestNotifications();
}
function toggle(id){
  const t=tasks.find(t=>t.id===id);if(!t)return;
  const done=!t.done;
  if(persist(tasks.map(t=>t.id===id?{...t,done,doneAt:done?new Date().toISOString():''}:t)))toast(t.done?'已移回待办':'已移入已完成');
}
function showSettings(){
  const s=status(),backup=native
    ?`<div class="setting-item"><div><strong>本地备份</strong><p>导出或恢复待办与打卡记录</p></div><button data-export-data>导出</button><button data-import-data>导入</button></div>`
    :`<div class="setting-item"><div><strong>本地备份</strong><p>浏览器预览不支持文件导入导出</p></div></div>`;
  $('settings-content').innerHTML=(native
    ?`<div class="setting-item"><div><strong>系统通知</strong></div><button data-notifications>${s.notifications?'已开启':'去开启'}</button></div><div class="setting-item"><div><strong>准时提醒</strong>${s.exact?'':'<p>未开启时可能延迟</p>'}</div><button data-exact>${s.exact?'已开启':'去开启'}</button></div>`
    :`<div class="settings-note"><p>浏览器不支持后台提醒，请安装安卓版。</p></div>`)+backup
    +`<div class="setting-item"><div><strong>本机记录</strong><p>${tasks.length} 个待办 · ${habits.length} 个习惯</p></div><span class="setting-value">本地保存</span></div><p class="settings-footnote">卸载或清除数据会删除记录，建议定期导出备份</p><div class="setting-item"><strong>版本</strong><span class="setting-value">Plan 1.5.0</span></div>`;
  if(!$('settings-dialog').open)$('settings-dialog').showModal();
}
function backupPayload(){return JSON.stringify({app:'plan',schemaVersion:1,exportedAt:new Date().toISOString(),tasks,habits},null,2);}
function exportData(){
  if(!native||!window.PlanAndroid.exportData){toast('当前环境不支持导出');return;}
  const stamp=dateKey();
  try{window.PlanAndroid.exportData(`plan-backup-${stamp}.json`,backupPayload());}
  catch{toast('导出未启动，请重试');}
}
function importData(){
  if(!native||!window.PlanAndroid.importData){toast('当前环境不支持导入');return;}
  try{window.PlanAndroid.importData();}catch{toast('导入未启动，请重试');}
}
function applyImport(raw){
  const result=JSON.parse(raw);
  if(result.ok===false){toast(result.error||'导入失败，文件格式不正确');return;}
  let parsed;try{parsed=JSON.parse(result.data);}catch{toast('导入失败，文件内容无法解析');return;}
  if(!parsed||typeof parsed!=='object'){toast('导入失败，文件格式不正确');return;}
  let nextTasks,nextHabits;
  try{
    nextTasks=readTasks(JSON.stringify(Array.isArray(parsed)?parsed:parsed.tasks??[]));
    nextHabits=readHabits(JSON.stringify(parsed.habits??[]));
  }catch{toast('导入失败，记录内容校验未通过，原有数据未改动');return;}
  if(loadFailed||habitsLoadFailed){toast('当前记录读取失败，为避免覆盖已取消导入');return;}
  if(!persist(nextTasks))return;
  if(!persistHabits(nextHabits)){toast('待办已导入，习惯写入失败');return;}
  $('settings-dialog').close();
  toast(`已导入 ${nextTasks.length} 个待办、${nextHabits.length} 个习惯`);
  if(native&&nextTasks.some(t=>t.reminder>=0)&&!status().notifications)window.PlanAndroid.requestNotifications();
}
window.onExportResult=result=>{
  if(result==='saved')toast('已导出备份文件');
  else if(result==='error')toast('导出失败，请检查存储权限或可用空间');
};
window.onImportData=raw=>{try{applyImport(raw);}catch{toast('导入失败，文件格式不正确');}};
function renderHabits(){
  const today=dateKey(),dates=weekDates(today),due=habits.filter(h=>habitOnDate(h,today)),checked=due.filter(h=>h.checks.includes(today));
  $('habit-summary').textContent=`今日 ${checked.length} / ${due.length}`;
  $('habit-date').textContent=`${dateText(today)} · ${weekdays[new Date().getDay()]}`;
  if(!habits.length){$('habit-list').innerHTML=`<div class="empty-state habit-empty"><h3>暂无习惯</h3><button class="text-button" data-add-habit>${icons('plus')}添加习惯</button></div>`;return;}
  const sorted=[...habits].sort((a,b)=>Number(!habitOnDate(a,today))-Number(!habitOnDate(b,today))||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
  $('habit-list').innerHTML=sorted.map(h=>{
    const done=h.checks.includes(today),planned=habitOnDate(h,today),weekGoal=dates.filter(key=>habitOnDate(h,key)).length,weekDone=dates.filter(key=>habitDoneOn(h,key)).length;
    const paws=dates.map((key,i)=>{
      const scheduled=habitScheduled(h,key),completed=scheduled&&h.checks.includes(key);
      const label=`${key} ${completed?'已打卡':!scheduled?'休息':key<today?'未打卡':key===today?'待打卡':'计划打卡'}`;
      return `<div class="paw-day ${completed?'done':!scheduled?'rest':key<today?'missed':''} ${key===today?'is-today':''}" title="${label}" aria-label="${label}"><span class="paw-day-label">${['一','二','三','四','五','六','日'][i]}</span><span class="paw-print">${icons('paw')}</span><small>${parseDate(key).getDate()}</small></div>`;
    }).join('');
    const next=isIntervalHabit(h)&&!habitScheduled(h,today)?nextHabitDate(h,today):null;
    const freq=escape(habitFrequencyText(h))+(next?`<span>·</span>下次 ${parseDate(next).getMonth()+1}月${parseDate(next).getDate()}日`:'');
    return `<article class="habit-card ${done?'habit-done':''}"><div class="habit-card-heading"><span class="habit-icon">${icons('paw')}</span><div><button class="habit-title" data-habit-edit="${escape(h.id)}" aria-label="编辑习惯 ${escape(h.title)}">${escape(h.title)}</button><p>${freq}<span>·</span>${h.time}${h.remind?icons('bell'):''}</p></div><button class="icon-button" data-habit-edit="${escape(h.id)}" aria-label="设置习惯 ${escape(h.title)}">${icons('settings')}</button></div><div class="streak-line"><span>连续打卡 <strong>${habitStreak(h,today)}</strong> ${['monthly','yearly'].includes(h.freqType)?'次':'天'}</span><span>本周 ${weekDone} / ${weekGoal} 次</span></div><div class="paw-week">${paws}</div><div class="habit-card-bottom"><span>累计 ${h.checks.length} 次</span><button class="habit-check ${done?'done':''}" data-habit-check="${escape(h.id)}" ${!planned?'disabled':''} aria-label="${done?'撤销今天打卡':planned?'打卡':'今天休息'}：${escape(h.title)}" aria-pressed="${done}">${icons(done?'check':'paw')}${done?'已打卡':planned?'打卡':'今天休息'}</button></div></article>`;
  }).join('');
}
function mineHabitView(){
  if(!habits.length)return {selected:null};
  const sorted=mineHabitOrder();
  let selected=habits.find(h=>h.id===mineHabit);
  if(!selected){selected=sorted[0];rememberSelectedHabit(selected.id);}
  return {selected};
}
/** 今天已打卡的习惯排在前面，其余按打卡时间排序，切换时优先看到有进展的。 */
function mineHabitOrder(){
  const today=dateKey();
  return [...habits].sort((a,b)=>Number(b.checks.includes(today))-Number(a.checks.includes(today))||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
}
function taskCompletion(today=dateKey()){
  // 只统计已到期（截止日期不晚于今天）的待办，未来安排不影响当前完成率。
  const due=tasks.filter(t=>t.date&&t.date<=today);
  const done=due.filter(t=>t.done).length;
  return {done,total:due.length,rate:due.length?Math.round(done/due.length*100):0};
}
function renderMine(){
  const today=dateKey(),completion=taskCompletion(today);
  $('mine-week').textContent=completion.rate+'%';
  $('mine-week-bar').style.width=completion.rate+'%';
  $('mine-week-line').textContent=completion.total
    ?`已到期 ${completion.done} / ${completion.total} 个待办已完成`
    :'还没有已到期的待办，添加后会显示完成率';

  const {selected}=mineHabitView(),order=mineHabitOrder();
  $('mine-habit-tabs').innerHTML=habits.length
    ?order.map(h=>`<button class="mine-habit-tab ${h.id===selected?.id?'active':''}" data-mine-habit="${escape(h.id)}" aria-pressed="${h.id===selected?.id}">${escape(h.title)}</button>`).join('')
    :'<span class="mine-habit-tab empty">还没有习惯</span>';
  $('mine-habit-streak').textContent=selected?habitStreak(selected,today):'—';
  $('mine-streak-label').textContent=['monthly','yearly'].includes(selected?.freqType)?'连续打卡次数':'习惯坚持天数';
  renderWidgetPreviews();
}
function renderWidgetPreviews(){
  const today=dateKey();
  const sets={todo:tasks.filter(t=>t.date===today),habits:habits.filter(h=>habitOnDate(h,today)).map(h=>({...h,done:h.checks.includes(today)}))};
  for(const [kind,items] of Object.entries(sets)){
    items.sort((a,b)=>Number(a.done)-Number(b.done)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
    $('widget-'+kind+'-summary').textContent=`今天 · 已完成 ${items.filter(t=>t.done).length} / ${items.length}`;
    $('widget-'+kind+'-rows').innerHTML=items.length?items.slice(0,2).map(t=>`<div class="widget-preview-row ${t.done?'is-done':''}"><span>${t.done?icons('check'):t.time}</span><strong>${escape(t.title)}</strong></div>`).join(''):`<div class="widget-preview-empty">${kind==='todo'?'今天暂无待办':'今天暂无打卡'}</div>`;
  }
}
function showWidgetHelp(){
  $('widget-platform-note').textContent=native?'记录更新后，小组件会同步刷新。':'浏览器仅支持预览，请在安卓版中添加。';
  if(!$('widget-dialog').open)$('widget-dialog').showModal();
}
window.onWidgetPinRequest=result=>{
  if(result==='requested')toast('请在桌面弹窗中确认添加');
  else {showWidgetHelp();$('widget-platform-note').textContent=result==='error'?'添加未成功，请从桌面小组件列表添加。':'当前桌面不支持快捷添加，请长按桌面添加。';}
};
window.openPlanView=view=>setView(view);
function syncHabitFrequency(){
  const value=$('habit-frequency').value,interval=value==='interval',calendar=['monthly','yearly'].includes(value);
  $('interval-options').classList.toggle('hidden',!interval);
  $('calendar-frequency-options').classList.toggle('hidden',!calendar);
  $('habit-month-field').classList.toggle('hidden',value!=='yearly');
  document.querySelector('.day-picker').classList.toggle('hidden',interval||calendar);
  const previous=Number($('habit-month-day').value)||new Date().getDate();
  const max=value==='yearly'?new Date(2000,Number($('habit-year-month').value),0).getDate():31;
  $('habit-month-day').innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1} 日</option>`).join('');
  $('habit-month-day').value=String(Math.min(previous,max));
  if(interval){
    const n=Number($('habit-interval').value);
    $('habit-frequency-hint').textContent=`从开始日期起，每 ${Number.isInteger(n)&&n>=INTERVAL_MIN?n:'N'} 天安排一次打卡；例如 3 表示今天、第 4 天、第 7 天…`;
  }else{
    const day=Number($('habit-month-day').value),month=Number($('habit-year-month').value);
    $('habit-frequency-hint').textContent=value==='monthly'&&day>28?'当月没有该日期时跳过':value==='yearly'&&month===2&&day===29?'仅在闰年 2 月 29 日循环':'';
  }
}
function openHabit(h=null){
  editingHabit=h?.id??null;$('habit-form').reset();$('habit-form-error').textContent='';$('habit-form-heading').textContent=h?'编辑习惯':'添加习惯';
  $('habit-title').value=h?.title??'';$('habit-time').value=h?.time??'08:00';$('habit-remind').checked=h?.remind??false;
  const days=h?.days??[1,2,3,4,5,6,0],interval=h&&isIntervalHabit(h);
  $('habit-frequency').value=['monthly','yearly'].includes(h?.freqType)?h.freqType:interval?'interval':days.length===7?'daily':days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'workdays':'custom';
  $('habit-interval').value=interval?String(h.intervalDays):'2';
  $('habit-year-month').value=String(h?.yearMonth??new Date().getMonth()+1);
  $('habit-month-day').innerHTML=Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1} 日</option>`).join('');
  $('habit-month-day').value=String(h?.monthDay??new Date().getDate());
  document.querySelectorAll('.day-picker input').forEach(e=>{e.checked=days.includes(Number(e.value));});
  $('delete-habit').classList.toggle('hidden',!h);syncHabitFrequency();updateHabitHint();$('habit-dialog').showModal();
}
function updateHabitHint(){
  $('habit-reminder-hint').textContent=!$('habit-remind').checked?'':native?(status().notifications?'':'需允许通知权限'):'浏览器不支持后台提醒';
}
function saveHabitForm(e){
  e.preventDefault();
  const today=dateKey(),existing=habits.find(h=>h.id===editingHabit),frequency=$('habit-frequency').value;
  const interval=frequency==='interval',calendar=['monthly','yearly'].includes(frequency),days=interval||calendar?[1,2,3,4,5,6,0]:[...document.querySelectorAll('.day-picker input')].filter(e=>e.checked).map(e=>Number(e.value));
  if(!interval&&!calendar&&!days.length){$('habit-form-error').textContent='请至少选择一个打卡日';return;}
  const intervalDays=interval?Number($('habit-interval').value):null;
  if(interval&&(!Number.isInteger(intervalDays)||intervalDays<INTERVAL_MIN||intervalDays>INTERVAL_MAX)){$('habit-form-error').textContent=`间隔天数需在 ${INTERVAL_MIN}–${INTERVAL_MAX} 之间`;return;}
  const options={freqType:calendar?frequency:interval?'interval':'weekly',intervalDays,monthDay:calendar?Number($('habit-month-day').value):null,yearMonth:frequency==='yearly'?Number($('habit-year-month').value):null};
  const base=existing?updateHabitSchedule(existing,days,today,options):{id:`habit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,days,startDate:today,checks:[],history:[{from:today,days:[...days],...options}],...options};
  const h={...base,title:$('habit-title').value.trim(),time:$('habit-time').value,remind:$('habit-remind').checked};
  const error=validateHabit(h);if(error){$('habit-form-error').textContent=error;return;}
  if(!persistHabits(existing?habits.map(item=>item.id===h.id?h:item):[...habits,h]))return;
  $('habit-dialog').close();toast(existing?'已更新':'已保存');
  if(native&&h.remind&&!status().notifications)window.PlanAndroid.requestNotifications();
}
function toggleHabit(id){
  const h=habits.find(item=>item.id===id);if(!h||!habitOnDate(h,dateKey()))return;
  const done=h.checks.includes(dateKey());
  if(persistHabits(habits.map(item=>item.id===id?checkHabit(item):item)))toast(done?'已撤销打卡':'已打卡');
}
function confirmDelete(kind){
  deleteKind=kind;const isHabit=kind==='habit';
  $('confirm-title').textContent=isHabit?'删除习惯？':'删除待办？';
  $('confirm-description').textContent=isHabit?'将删除打卡记录并取消提醒，无法恢复。':'删除后无法恢复，也会取消对应提醒。';
  $('confirm-dialog').showModal();
}
document.addEventListener('click',e=>{
  const target=e.target.closest('button,a');if(!target)return;
  if(target.dataset.pinWidget){if(native&&window.PlanAndroid.pinWidget)window.PlanAndroid.pinWidget(target.dataset.pinWidget);else showWidgetHelp();return;}
  if(target.dataset.view){setView(target.dataset.view);return;}
  if(target.classList.contains('brand')){setView('todo');return;}
  if(target.dataset.close){$(target.dataset.close).close();return;}
  if(target.dataset.filter){filter=target.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('active',x===target);x.setAttribute('aria-selected',x===target);});render();return;}
  if(target.dataset.tagFilter){tagFilter=tagFilter===target.dataset.tagFilter?'':target.dataset.tagFilter;render();return;}
  if(target.hasAttribute('data-clear-tag')){tagFilter='';render();return;}
  if(target.dataset.mineHabit){rememberSelectedHabit(target.dataset.mineHabit);renderMine();return;}
  if(target.dataset.deleteTag){deleteTag(target.dataset.deleteTag);return;}
  if(target.dataset.toggle){toggle(target.dataset.toggle);return;}
  if(target.dataset.habitCheck){toggleHabit(target.dataset.habitCheck);return;}
  if(target.dataset.habitEdit){const h=habits.find(h=>h.id===target.dataset.habitEdit);if(h)openHabit(h);return;}
  if(target.hasAttribute('data-add-habit')){openHabit();return;}
  if(target.dataset.edit){const t=tasks.find(t=>t.id===target.dataset.edit);if(t)openForm(t);return;}
  if(target.dataset.day){selectDate(target.dataset.day,true);return;}
  if(target.dataset.tagOption){
    toggleTagDraft(target.dataset.tagOption);
    target.classList.toggle('active',tagDraft.includes(target.dataset.tagOption));
    target.setAttribute('aria-pressed',String(tagDraft.includes(target.dataset.tagOption)));
    return;
  }
  if(target.dataset.deleteTag){deleteTag(target.dataset.deleteTag);return;}
  if(target.dataset.emptyAdd){const t=target.dataset.emptyAdd;if(t==='done'){document.querySelector('[data-filter="all"]').click();return;}openForm(null,t==='today'?dateKey():t==='agenda'?selected:null);return;}
  if(target.hasAttribute('data-notifications')){if(!status().notifications)window.PlanAndroid?.requestNotifications();return;}
  if(target.hasAttribute('data-exact')){if(!status().exact)window.PlanAndroid?.requestExactAlarms();return;}
  if(target.hasAttribute('data-export-data')){exportData();return;}
  if(target.hasAttribute('data-import-data')){importData();return;}
  if(target.id==='clear-task-date'){$('task-date').value='';syncDateTimeFields();return;}
});
$('task-form').addEventListener('submit',saveForm);
$('task-date').addEventListener('change',syncDateTimeFields);
$('task-date').addEventListener('input',syncDateTimeFields);
$('task-reminder').addEventListener('change',()=>{
  const custom=$('task-reminder').value==='custom',input=$('reminder-minutes');
  $('custom-reminder').classList.toggle('hidden',!custom);
  if(custom&&!input.value)$('reminder-minutes').value='10';
  updateReminderHint();
});
$('reminder-minutes').addEventListener('input',updateReminderHint);
['add-task','add-calendar','add-selected'].forEach(id=>$(id).addEventListener('click',()=>openForm()));
$('add-habit').addEventListener('click',()=>openHabit());
$('habit-form').addEventListener('submit',saveHabitForm);
$('habit-frequency').addEventListener('change',()=>{
  const value=$('habit-frequency').value;
  syncHabitFrequency();
  if(['custom','interval','monthly','yearly'].includes(value))return;
  document.querySelectorAll('.day-picker input').forEach(e=>{e.checked=value==='daily'||[1,2,3,4,5].includes(Number(e.value));});
});
$('habit-interval').addEventListener('input',syncHabitFrequency);
['habit-year-month','habit-month-day'].forEach(id=>$(id).addEventListener('change',syncHabitFrequency));
document.querySelectorAll('.day-picker input').forEach(e=>e.addEventListener('change',()=>{$('habit-frequency').value='custom';syncHabitFrequency();}));
$('habit-remind').addEventListener('change',updateHabitHint);
$('widget-help').addEventListener('click',showWidgetHelp);
$('manage-tags').addEventListener('click',openTagManager);
$('tag-form').addEventListener('submit',saveTagForm);

$('jump-today').addEventListener('click',()=>{selectDate(dateKey());setView('calendar');});
$('calendar-today').addEventListener('click',()=>selectDate(dateKey()));
$('back-month').addEventListener('click',()=>document.querySelector('.calendar-card').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}));
function shiftMonth(amount){const d=new Date(year,month+amount,1,12);if(d.getFullYear()<2000||d.getFullYear()>2100)return;year=d.getFullYear();month=d.getMonth();renderCalendar();}
$('prev-month').addEventListener('click',()=>shiftMonth(-1));$('next-month').addEventListener('click',()=>shiftMonth(1));
$('settings').addEventListener('click',showSettings);
$('delete-task').addEventListener('click',()=>confirmDelete('task'));
$('delete-habit').addEventListener('click',()=>confirmDelete('habit'));
$('confirm-delete').addEventListener('click',()=>{
  const isHabit=deleteKind==='habit',id=isHabit?editingHabit:editing;if(!id)return;
  if(isHabit?persistHabits(habits.filter(h=>h.id!==id)):persist(tasks.filter(t=>t.id!==id))){$('confirm-dialog').close();$(isHabit?'habit-dialog':'task-dialog').close();toast('已删除');if(isHabit)editingHabit=null;else editing=null;}
});
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});});
window.handleBack=()=>{for(const id of ['confirm-dialog','tag-dialog','widget-dialog','settings-dialog','habit-dialog','task-dialog'])if($(id).open){$(id).close();return true;}if(currentView!=='todo'){setView('todo');return true;}return false;};
window.openTaskFromNotification=id=>{const t=tasks.find(t=>t.id===id);if(t){if(t.date){selectDate(t.date);setView('calendar');}else setView('todo');openForm(t);}};
window.openHabitFromNotification=id=>{if(habits.some(h=>h.id===id))setView('habits');};
window.onNativeResume=()=>{try{tasks=readTasks(window.PlanAndroid.loadData());loadFailed=false;}catch{loadFailed=true;toast('记录读取失败，请重新打开应用');}try{habits=readHabits(window.PlanAndroid.loadHabits());habitsLoadFailed=false;}catch{habitsLoadFailed=true;toast('习惯记录读取失败，请重新打开应用');}render();if($('settings-dialog').open)showSettings();};
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)));
window.addEventListener('storage',e=>{if(native)return;try{if(e.key==='plan-tasks-v1')tasks=readTasks(e.newValue||'[]');if(e.key==='plan-habits-v1')habits=readHabits(e.newValue||'[]');render();}catch{toast('另一页面的记录读取失败，请刷新');}});
setInterval(()=>{if(day!==dateKey()){day=dateKey();if(currentView!=='calendar')selected=day;}render();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
setView(location.hash.slice(1));render();if(loadFailed||habitsLoadFailed)toast('部分记录读取失败，请重新打开应用，原有记录未被覆盖');
