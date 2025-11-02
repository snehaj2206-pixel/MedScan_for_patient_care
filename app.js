// MedScan app.js - final (keeps original content and fixes requested issues)
// Multiple reminders, expiry days left, image upload/remove, beep notification
const MED = {
  name: "Udapa Gold",
  api: "Dapagliflozin + Metformin",
  contents: "Dapagliflozin 10 mg + Metformin 500 mg",
  uses: "Used for controlling blood sugar in Type 2 Diabetes Mellitus.",
  how: "Take with meals. Swallow whole with water. Follow dosage instructions provided by your doctor.",
  side: "Nausea, diarrhea, urinary tract infection, dizziness and abdominal pain.",
  precautions: "Avoid alcohol. Inform doctor if you have kidney or liver issues. Monitor blood sugar level regularly.",
  tips: "Include fiber-rich fruits like guava and vegetables to support recovery."
};

// Storage keys
const KEY_BASE = 'medscan_v3_' + MED.name.replace(/\s+/g,'_').toLowerCase();
const KEY_REM = KEY_BASE + '_reminders';
const KEY_EXP = KEY_BASE + '_expiry';
const KEY_IMG = KEY_BASE + '_img';

// State
let reminders = [];
let expiryDate = null;
let medImage = null;
let audioCtx = null;
let alarmOsc = null;
let alarmGain = null;
let alarmInterval = null;

// DOM helpers
function $(id){ return document.getElementById(id); }

// Load state
function loadState(){
  try{ reminders = JSON.parse(localStorage.getItem(KEY_REM) || '[]'); }catch(e){ reminders = []; }
  expiryDate = localStorage.getItem(KEY_EXP) || null;
  medImage = localStorage.getItem(KEY_IMG) || null;
}
function saveState(){
  localStorage.setItem(KEY_REM, JSON.stringify(reminders));
  if(expiryDate) localStorage.setItem(KEY_EXP, expiryDate); else localStorage.removeItem(KEY_EXP);
  if(medImage) localStorage.setItem(KEY_IMG, medImage); else localStorage.removeItem(KEY_IMG);
}

// Render content (keep original text)
function renderContent(){
  $('medName').textContent = MED.name;
  $('medApi').textContent = MED.api;
  $('medContents').textContent = MED.contents;
  $('usesText').textContent = MED.uses;
  $('howText').textContent = MED.how;
  $('sideText').textContent = MED.side;
  $('precText').textContent = MED.precautions;
  $('tipsText').textContent = MED.tips;
}

// Reminders UI
function renderReminders(){
  const ul = $('reminderList');
  ul.innerHTML = '';
  reminders.forEach((r,idx)=>{
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = '<strong>'+r.time+'</strong><div class="small">'+(r.taken?'Taken':'Pending')+'</div>';
    li.appendChild(left);
    const btns = document.createElement('div');
    const takeBtn = document.createElement('button'); takeBtn.textContent = r.taken? 'Mark not taken':'Mark taken';
    takeBtn.onclick = ()=>{ r.taken = !r.taken; saveState(); renderReminders(); };
    const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.style.background='#ff6b6b'; delBtn.style.color='#fff';
    delBtn.onclick = ()=>{ cancelScheduled(idx); reminders.splice(idx,1); saveState(); renderReminders(); };
    btns.appendChild(takeBtn); btns.appendChild(delBtn);
    li.appendChild(btns);
    ul.appendChild(li);
  });
  renderExpiryInfo();
}

function addReminder(){
  const t = $('reminderTime').value;
  if(!t) return alert('Please choose a time');
  if(reminders.find(x=>x.time===t)) return alert('Already set');
  const obj = { id: Date.now()+Math.floor(Math.random()*999), time: t, taken: false, firedDate: '' };
  reminders.push(obj); saveState(); scheduleReminder(obj); renderReminders(); alert('Reminder set for '+t);
}
function deleteReminderByIndex(i){ reminders.splice(i,1); saveState(); renderReminders(); }

// Scheduling
const scheduledMap = {};
function scheduleReminder(obj){
  cancelScheduledById(obj.id);
  const ms = msUntil(obj.time);
  const tid = setTimeout(()=>{ triggerReminder(obj.id); }, ms);
  scheduledMap[obj.id] = tid;
}
function cancelScheduledById(id){ if(scheduledMap[id]){ clearTimeout(scheduledMap[id]); delete scheduledMap[id]; } }
function cancelScheduled(index){
  const obj = reminders[index];
  if(obj) cancelScheduledById(obj.id);
}

// time calc
function msUntil(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  const now = new Date();
  let t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if(t <= now) t.setDate(t.getDate()+1);
  return t - now;
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Trigger reminder
function triggerReminder(id){
  const r = reminders.find(x=>x.id===id);
  if(!r) return;
  const today = todayISO();
  if(r.firedDate === today) return;
  // show notification
  showNotification('Medicine Reminder', 'Time to take '+MED.name+' ('+r.time+')');
  // play alarm
  startAlarm();
  // show modal
  $('alarmBody').textContent = 'Time to take '+MED.name+' at '+r.time;
  $('alarmModal').style.display = 'block';
  r.firedDate = today; saveState();
  // reschedule for next day
  scheduleReminder(r);
}

// Notification helper
function showNotification(title, body){
  if('serviceWorker' in navigator && navigator.serviceWorker.controller){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(reg) reg.showNotification(title, { body, tag:'medscan' });
      else if('Notification' in window && Notification.permission==='granted') new Notification(title, { body });
    }).catch(()=>{ if('Notification' in window && Notification.permission==='granted') new Notification(title, { body }); });
  } else {
    if('Notification' in window && Notification.permission==='granted') try{ new Notification(title, { body }); }catch(e){}
  }
}

// Audio alarm (beep pattern)
function initAudio(){
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }catch(e){ audioCtx = null; }
}
function startAlarm(){
  if(!audioCtx) initAudio();
  if(!audioCtx) return;
  // create oscillator and gain
  alarmOsc = audioCtx.createOscillator();
  alarmGain = audioCtx.createGain();
  alarmOsc.type = 'sine';
  alarmOsc.frequency.setValueAtTime(880, audioCtx.currentTime);
  alarmGain.gain.setValueAtTime(0.00001, audioCtx.currentTime);
  alarmOsc.connect(alarmGain); alarmGain.connect(audioCtx.destination);
  alarmOsc.start();
  // fade in
  alarmGain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
  // alternate frequency to create beep pattern
  alarmInterval = setInterval(()=>{
    alarmOsc.frequency.setValueAtTime(880, audioCtx.currentTime);
    setTimeout(()=>{ alarmOsc.frequency.setValueAtTime(660, audioCtx.currentTime); }, 300);
  }, 700);
}
function stopAlarm(){
  try{
    if(alarmGain) alarmGain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.02);
    if(alarmOsc) alarmOsc.stop();
  }catch(e){}
  if(alarmInterval) clearInterval(alarmInterval);
  alarmOsc = null; alarmGain = null; alarmInterval = null;
  $('alarmModal').style.display = 'none';
}

// Expiry handling
function saveExpiry(){
  const val = $('expiryInput').value;
  if(!val) return alert('Choose expiry date');
  expiryDate = val;
  saveState();
  renderExpiryInfo();
  alert('Expiry saved: '+expiryDate);
}
function renderExpiryInfo(){
  if(!expiryDate){
    $('expiryDate').textContent = '--';
    $('expiryDays').textContent = '--';
    return;
  }
  $('expiryDate').textContent = new Date(expiryDate).toLocaleDateString();
  const days = Math.ceil((new Date(expiryDate) - new Date())/(1000*60*60*24));
  $('expiryDays').textContent = days;
  if(days < 0){
    showNotification('⚠️ Medicine Expired','Your medicine '+MED.name+' expired on '+expiryDate);
    startAlarm();
    $('alarmBody').textContent = MED.name + ' has expired on ' + expiryDate;
    $('alarmModal').style.display = 'block';
  }
}

// Image upload/remove
function handleImageUpload(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    medImage = e.target.result;
    $('medImage').src = medImage;
    $('medImage').style.display = 'block';
    saveState();
  };
  reader.readAsDataURL(file);
}
function removeImage(){
  medImage = null;
  $('medImage').src = '';
  $('medImage').style.display = 'none';
  saveState();
}

// Permission modal
function requestPerm(){
  if(!('Notification' in window)) return alert('Notifications not supported');
  Notification.requestPermission().then(p=>{
    if(p==='granted') alert('Notifications enabled');
    else alert('Notifications denied');
  });
}

// Language toggle - keep same text (no extra emojis)
function setLang(lang){
  if(lang==='en'){
    $('usesText').textContent = MED.uses;
    $('howText').textContent = MED.how;
    $('sideText').textContent = MED.side;
    $('precText').textContent = MED.precautions;
    $('tipsText').textContent = MED.tips;
  } else if(lang==='hi'){
    $('usesText').textContent = 'टाइप 2 मधुमेह में ब्लड शुगर नियंत्रित करने के लिए उपयोग किया जाता है।';
    $('howText').textContent = 'भोजन के साथ लें। गोली पानी के साथ पूरा निगलें। डॉक्टर के निर्देशों का पालन करें।';
    $('sideText').textContent = 'मतली, दस्त, मूत्र मार्ग संक्रमण, चक्कर और पेट में दर्द।';
    $('precText').textContent = 'शराब से बचें। यदि गुर्दे या जिगर की समस्या हो तो डॉक्टर को बताएं।';
    $('tipsText').textContent = 'फाइबर युक्त फल और सब्जियाँ शामिल करें।';
  } else {
    $('usesText').textContent = 'टाइप २ मधुमेहात रक्तातील साखर नियंत्रित करण्यासाठी वापरले जाते.';
    $('howText').textContent = 'जेवणासोबत घ्या. गोळी पाण्याने गिळा. डॉक्टरांच्या सूचनांचे पालन करा.';
    $('sideText').textContent = 'मळमळ, जुलाब, संसर्ग, चक्कर व पोटदुखी.';
    $('precText').textContent = 'दारू टाळा. डॉक्टरांना कळवा.';
    $('tipsText').textContent = 'फायबरयुक्त अन्न खा.';
  }
}

// Service worker registration
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('service-worker.js').catch(()=>{}); });
}

// Init on DOM load
document.addEventListener('DOMContentLoaded', ()=>{
  loadState();
  renderContent();
  // load image if present
  if(medImage) { $('medImage').src = medImage; $('medImage').style.display = 'block'; }
  // expiry
  if(expiryDate){ $('expiryInput').value = expiryDate; renderExpiryInfo(); }
  // reminders
  renderReminders();
  // wire up DOM buttons
  $('addReminderBtn').addEventListener('click', addReminder);
  $('permissionBtn').addEventListener('click', requestPerm);
  $('saveExpiryBtn').addEventListener('click', saveExpiry);
  $('clearImgBtn').addEventListener('click', removeImage);
  $('imgUpload').addEventListener('change', (e)=> handleImageUpload(e.target.files[0]));
  $('alarmOk').addEventListener('click', stopAlarm);
  $('btn-en').addEventListener('click', ()=>{ setLang('en'); });
  $('btn-hi').addEventListener('click', ()=>{ setLang('hi'); });
  $('btn-mr').addEventListener('click', ()=>{ setLang('mr'); });
  // schedule existing reminders
  reminders.forEach(r=> scheduleReminder(r));
  // periodic check for reminders every 30s as fallback
  setInterval(()=>{ const now=new Date(); const hh=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'); reminders.forEach(r=>{ if(r.time===hh && r.firedDate!==todayISO()) triggerReminder(r.id); }); },30000);
});
