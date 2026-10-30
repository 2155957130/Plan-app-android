import test from 'node:test';
import assert from 'node:assert/strict';
import {dateKey,parseDate,monthCells,validateTask,reminderAt,dueAt,readTasks,readTags,filteredTasks,sortTasks,validReminder,taskOverdue,isStill} from '../android/assets/model.mjs';
const task={id:'test-1',title:'散步',date:'2026-10-21',time:'18:30',reminder:15,category:'life',notes:'带水',done:false};
test('日期按本地年月日计算，不受 UTC 日期偏移影响',()=>{assert.equal(dateKey(new Date(2026,9,21,0,1)),'2026-10-21');assert.equal(parseDate('2026-02-29'),null);assert.ok(parseDate('2028-02-29'));assert.equal(parseDate('2026-13-01'),null);});
test('日历从周一开始，覆盖跨年和闰月',()=>{const cells=monthCells(2026,0);assert.equal(cells.length,42);assert.equal(cells[0].getDay(),1);assert.equal(dateKey(cells[0]),'2025-12-29');assert.equal(monthCells(2028,1).filter(d=>d.getMonth()===1).length,29);});
test('提前提醒跨天，完成和关闭提醒不产生计划',()=>{assert.equal(reminderAt(task),dueAt(task)-15*60000);assert.equal(reminderAt({...task,reminder:1440}),dueAt(task)-86400000);assert.equal(reminderAt({...task,done:true}),null);assert.equal(reminderAt({...task,reminder:-1}),null);assert.equal(reminderAt({...task,date:''}),null);});
test('拒绝无标题、无效时间、无效日期和无效提醒',()=>{assert.equal(validateTask(task),'');for(const change of [{title:'  '},{date:'2026-02-30'},{date:'2026-10-21',time:'25:00'},{reminder:-2},{reminder:10081},{category:'other'},{notes:'x'.repeat(2001)}])assert.ok(validateTask({...task,...change}));});
test('提醒支持任意分钟数，最长一周',()=>{assert.ok(validReminder(0));assert.ok(validReminder(7));assert.ok(validReminder(90));assert.ok(validReminder(10080));assert.ok(validReminder(-1));assert.ok(!validReminder(10081));assert.ok(!validReminder(-2));assert.ok(!validReminder(1.5));assert.equal(reminderAt({...task,reminder:90}),dueAt(task)-90*60000);});
test('读取记录保留中文，拒绝损坏和重复编号',()=>{const expected={id:'test-1',title:'散步',date:'2026-10-21',time:'18:30',reminder:15,notes:'带水',done:false,doneAt:'',tags:['生活']};assert.deepEqual(readTasks(JSON.stringify([task])),[expected]);assert.throws(()=>readTasks('{}'));assert.throws(()=>readTasks(JSON.stringify([task,task])));assert.throws(()=>readTasks('[{"id":"bad"}]'));});
test('待办按日期排序，今天、未来和已完成互相独立',()=>{const future={...task,id:'future',date:'2026-10-22'},done={...task,id:'done',date:'2026-10-19',done:true},past={...task,id:'past',date:'2026-10-20'};const tasks=[future,done,task,past];assert.deepEqual(filteredTasks(tasks,'all').map(t=>t.id),['past','test-1','future']);assert.deepEqual(filteredTasks(tasks,'today','2026-10-21').map(t=>t.id),['test-1']);assert.equal(sortTasks(tasks).at(-1).id,'done');});
test('没有日期的待办一直保留，排在有日期之后且进入今天筛选',()=>{
  const still={...task,id:'still',date:'',time:'',reminder:-1},later={...task,id:'later',date:'2026-10-25',reminder:-1},doneStill={...still,id:'done-still',done:true};
  const tasks=[later,still,doneStill,task];
  assert.equal(isStill(still),true);assert.equal(isStill(task),false);
  assert.deepEqual(filteredTasks(tasks,'all').map(t=>t.id),['test-1','later','still']);
  assert.deepEqual(filteredTasks(tasks,'today','2026-10-21').map(t=>t.id),['test-1','still']);
  assert.equal(taskOverdue(still),false);
  assert.equal(taskOverdue({...task,date:'2026-10-20'},new Date('2026-10-21T00:00:00').getTime()),true);
  const stored=readTasks(JSON.stringify([still]));
  assert.equal(stored[0].date,'');assert.equal(stored[0].time,'');
});
test('没有日期时不能带时间，但可以保留提醒设置',()=>{
  assert.ok(validateTask({...task,date:''}));
  assert.equal(validateTask({...task,date:'',time:'',reminder:-1}),'');
  assert.equal(validateTask({...task,date:'',time:'',reminder:30}),'');
});

test('完成后移入已完成，撤销后移回待办；旧记录与无日期事项也适用',()=>{
  let items=readTasks(JSON.stringify([
    {...task,id:'today',done:false},
    {...task,id:'old',date:'2025-01-01',done:true},
    {...task,id:'undated',date:'',time:'',done:true},
  ]));
  assert.deepEqual(filteredTasks(items,'done').map(t=>t.id),['old','undated']);
  items=items.map(t=>t.id==='today'?{...t,done:true}:t);
  assert.deepEqual(filteredTasks(items,'all'),[]);
  assert.deepEqual(filteredTasks(items,'today','2026-10-21'),[]);
  assert.deepEqual(filteredTasks(items,'done').map(t=>t.id),['old','today','undated']);
  assert.equal(reminderAt(items.find(t=>t.id==='today')),null);
  items=readTasks(JSON.stringify(items));
  assert.equal(filteredTasks(items,'done').length,3);
  items=items.map(t=>['today','undated'].includes(t.id)?{...t,done:false}:t);
  assert.deepEqual(filteredTasks(items,'all').map(t=>t.id),['today','undated']);
  assert.deepEqual(filteredTasks(items,'today','2026-10-21').map(t=>t.id),['today','undated']);
  assert.deepEqual(filteredTasks(items,'done').map(t=>t.id),['old']);
});
test('标签最多 5 个、每个最多 12 个字、不能重复',()=>{
  assert.equal(validateTask({...task,tags:[]}),'');
  assert.equal(validateTask({...task,tags:['健身','项目A']}),'');
  assert.ok(validateTask({...task,tags:['一','二','三','四','五','六']}));
  assert.ok(validateTask({...task,tags:['x'.repeat(13)]}));
  assert.equal(validateTask({...task,tags:['重复','重复']}),'');
  assert.ok(validateTask({...task,tags:['  ']}));
  assert.ok(validateTask({...task,tags:'健身'}));
  assert.deepEqual(readTags([' 健身 ','健身','','项目A']),['健身','项目A']);
  assert.deepEqual(readTags(['1','2','3','4','5','6']).length,5);
  const stored=readTasks(JSON.stringify([{...task,tags:['健身']}]));
  assert.deepEqual(stored[0].tags,['健身','生活']);
  const legacy=readTasks(JSON.stringify([task]));
  assert.deepEqual(legacy[0].tags,['生活']);
  assert.equal(legacy[0].doneAt,'');
});
test('旧的分类合并成同名标签，新待办可以不带分类',()=>{
  const tagsOf=(t)=>readTasks(JSON.stringify([t]))[0].tags;
  assert.deepEqual(tagsOf({...task,category:'work'}),['工作']);
  assert.deepEqual(tagsOf({...task,category:'study'}),['学习']);
  assert.deepEqual(tagsOf({...task,category:'life',tags:['健身']}),['健身','生活']);
  assert.equal(validateTask({...task,category:undefined,tags:['健身']}),'');
  assert.ok(validateTask({...task,category:'other'}));
  assert.deepEqual(tagsOf({...task,category:undefined,tags:['健身','阅读']}),['健身','阅读']);
  assert.equal(readTasks(JSON.stringify([{...task,category:undefined}])).length,1);
});
