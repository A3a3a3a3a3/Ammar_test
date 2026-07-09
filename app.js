/* ===================== بيانات عرض أساسية (غير حساسة) ===================== */
const CROPS = {
 grape:'العنب', citrus:'الحمضيات', tomato:'الطماطم', wheat:'القمح', olive:'الزيتون',
 apple:'التفاح', cucumber:'الخيار', eggplant:'الباذنجان', pepper:'الفلفل', potato:'البطاطا',
 fig:'التين', pomegranate:'الرمان', almond:'اللوز', apricot:'المشمش', peach:'الخوخ',
 corn:'الذرة', beans:'الفول', strawberry:'الفراولة'
};
const CATS = {
 nutrient:'نقص عناصر غذائية', fungal:'أمراض فطرية', pest:'آفات حشرية',
 physio:'حالات فسيولوجية', pruning:'تقليم وإدارة النبات',
 irrigation:'ري وتسميد', organic:'مخلفات عضوية وتكامل زراعي'
};

/* ===================== أدوات مساعدة ===================== */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function seededShuffle(arr, seed){
  const rnd = mulberry32(seed); const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pick(arr, n, seed){ return seededShuffle(arr, seed).slice(0,n); }

/* ===================== بنك الحالات (يُجلب من Firestore بعد تسجيل الدخول فقط) ===================== */
let CASE_BANK = [];
let FACT_INDEX = [];
let PREVENTION = {};

function defaultShape(cat){
  if(cat==='physio') return 'fruit';
  if(cat==='pruning') return 'branch';
  if(cat==='organic') return 'soil';
  return 'leaf';
}

async function loadCaseDataFromFirestore(){
  if(!fbDb) return false;
  try{
    const [casesSnap, factsSnap, prevDoc] = await Promise.all([
      fbDb.collection('cases').get(),
      fbDb.collection('facts').get(),
      fbDb.collection('meta').doc('prevention').get()
    ]);
    CASE_BANK = casesSnap.docs.map(d=>d.data()).sort((a,b)=>a.id-b.id);
    FACT_INDEX = factsSnap.docs.map(d=>d.data());
    PREVENTION = prevDoc.exists ? prevDoc.data() : {};
    document.getElementById('bank-count').textContent = `${CASE_BANK.length} حالة تشخيصية — محمية بتسجيل الدخول`;
    return CASE_BANK.length > 0;
  }catch(e){
    console.error('تعذر جلب بيانات الحالات من Firestore:', e.message);
    return false;
  }
}

/* ===================== SVG توضيحي ===================== */
function svgLeaf(tone, spotType, spotCount, seed){
  const rnd = mulberry32(seed);
  const fillMap = {healthy:'#4d7a3a', yellow:'#d9c24a', yellowInter:'#e3d27a', brownEdge:'#4d7a3a', small:'#5a8a45', wilt:'#6f8a55', salt:'#7a9160'};
  const fill = fillMap[tone] || '#4d7a3a';
  let spots = '';
  if(spotType){
    for(let i=0;i<spotCount;i++){
      const x = 25+rnd()*50, y = 20+rnd()*65, r = 3+rnd()*4;
      const c = spotType==='disease' ? '#3d2a1a' : spotType==='hole' ? '#e9e2c9' : '#ffffff';
      spots += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${spotType==='hole'?1:0.85}"/>`;
    }
  }
  let extra = '';
  if(tone==='brownEdge') extra = `<path d="M50,10 C20,20 10,50 10,70 C10,90 30,95 50,98 C70,95 90,90 90,70 C90,50 80,20 50,10 Z" fill="none" stroke="#8a4a28" stroke-width="4"/>`;
  if(tone==='yellowInter') extra = `<path d="M50,15 L50,95 M35,30 L50,50 M65,30 L50,50 M30,55 L50,65 M70,55 L50,65" stroke="#3d5c2a" stroke-width="3" fill="none"/>`;
  return `<svg viewBox="0 0 100 110">
    <path d="M50,10 C20,20 10,50 10,70 C10,90 30,95 50,98 C70,95 90,90 90,70 C90,50 80,20 50,10 Z" fill="${fill}"/>
    <path d="M50,12 L50,96" stroke="#2f4324" stroke-width="2" opacity="0.5"/>
    ${extra}${spots}
  </svg>`;
}
function svgFruit(markType, seed){
  const rnd = mulberry32(seed);
  let mark='';
  if(markType==='darkPatch') mark = `<ellipse cx="50" cy="82" rx="16" ry="10" fill="#3a2418"/>`;
  else if(markType==='crack'){ for(let i=0;i<3;i++){ const a=rnd()*Math.PI*2; mark+=`<path d="M50,50 L${50+Math.cos(a)*30},${50+Math.sin(a)*30}" stroke="#fff" stroke-width="2"/>`; } }
  else if(markType==='whitePatch') mark = `<ellipse cx="35" cy="35" rx="18" ry="14" fill="#e9e2c9" opacity="0.85"/>`;
  else mark = `<circle cx="55" cy="60" r="6" fill="#3a2418"/>`;
  return `<svg viewBox="0 0 100 100"><circle cx="50" cy="55" r="42" fill="#b8452f"/><ellipse cx="38" cy="38" rx="10" ry="6" fill="#d4664a" opacity="0.6"/>${mark}</svg>`;
}
function svgBranch(markType){
  let mark='';
  if(markType==='gum') mark = `<ellipse cx="55" cy="55" rx="8" ry="10" fill="#c07a2b" opacity="0.9"/>`;
  else if(markType==='crack') mark = `<path d="M30,20 L45,90" stroke="#3a2418" stroke-width="2"/>`;
  else mark = `<circle cx="55" cy="45" r="7" fill="#e9e2c9"/>`;
  return `<svg viewBox="0 0 100 100"><rect x="20" y="10" width="16" height="90" rx="8" fill="#6b4a2c" transform="rotate(20 50 50)"/>${mark}</svg>`;
}
function svgSoil(){
  return `<svg viewBox="0 0 100 100">
    <rect x="10" y="55" width="80" height="14" fill="#5a3d24"/>
    <rect x="10" y="69" width="80" height="14" fill="#4a3019"/>
    <rect x="10" y="83" width="80" height="10" fill="#3a2513"/>
    <circle cx="30" cy="60" r="2.5" fill="#2e1e10"/><circle cx="55" cy="63" r="2" fill="#2e1e10"/><circle cx="70" cy="59" r="2.5" fill="#2e1e10"/>
    <path d="M50,55 C48,40 52,30 50,18" stroke="#4d7a3a" stroke-width="3" fill="none"/>
    <circle cx="50" cy="15" r="6" fill="#5a9040"/>
  </svg>`;
}

function iconFor(c){
  const seed = c.id;
  if(c.shape==='fruit'){
    const map = {'تعفن طرف الثمرة':'darkPatch','تشقق الثمار':'crack','لفحة الشمس':'whitePatch','بقاء الكتف الأخضر':'whitePatch','ضعف التلقيح وتشوه الثمار':'crack'};
    return svgFruit(map[c.name] || 'darkPatch', seed);
  }
  if(c.shape==='branch'){
    const map = {'تصمغ اللوزيات':'gum','تشقق اللحاء الشتوي':'crack','نزيف العصارة بعد التقليم المتأخر':'gum'};
    return svgBranch(map[c.name] || 'cut');
  }
  if(c.shape==='soil') return svgSoil();
  // leaf
  if(c.category==='nutrient'){
    const toneMap = {'نقص الحديد (Fe)':'yellowInter','نقص النيتروجين (N)':'yellow','نقص البوتاسيوم (K)':'brownEdge','نقص المغنيسيوم (Mg)':'yellowInter','نقص الزنك (Zn)':'small','نقص الكالسيوم (Ca)':'healthy','نقص البورون (B)':'healthy'};
    return svgLeaf(toneMap[c.name]||'yellow', null, 0, seed);
  }
  if(c.category==='fungal') return svgLeaf('healthy','disease', c.symptom.includes('مبكرة')?3:c.symptom.includes('متقدمة')?9:6, seed);
  if(c.category==='pest') return svgLeaf('healthy','hole', c.symptom.includes('مبكرة')?2:c.symptom.includes('متقدمة')?7:4, seed);
  return svgLeaf('wilt', null, 0, seed);
}

/* ===================== Firebase (اختياري) ===================== */
// ضع بيانات مشروعك من Firebase Console هنا بدل هذه القيم لتفعيل تسجيل الدخول الحقيقي بالبريد وكلمة المرور.
// إذا تركتها كما هي، يعمل التطبيق تلقائيًا في "وضع الضيف" بدون أي خطأ.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDFeIvGg8D35UncOESDYphBLfY_mcg536Q",
  authDomain: "crop-clinic-7b3e6.firebaseapp.com",
  projectId: "crop-clinic-7b3e6",
  storageBucket: "crop-clinic-7b3e6.firebasestorage.app",
  messagingSenderId: "240919436936",
  appId: "1:240919436936:web:52ef5a48ab198921f3893d"
};
let fbApp = null, fbAuth = null, fbDb = null, fbUser = null;
try{
  if(FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY'){
    fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
  }
}catch(e){ console.warn('Firebase غير مُفعّل:', e.message); }

let authMode = 'login'; // login | signup

function openAuthModal(){ document.getElementById('auth-modal').classList.add('show'); }
function closeAuthModal(){ document.getElementById('auth-modal').classList.remove('show'); }
document.getElementById('auth-open-btn').addEventListener('click', openAuthModal);
document.getElementById('auth-close').addEventListener('click', closeAuthModal);

document.getElementById('auth-toggle-mode').addEventListener('click', ()=>{
  authMode = authMode==='login' ? 'signup' : 'login';
  document.getElementById('auth-title').textContent = authMode==='login' ? 'تسجيل الدخول مطلوب' : 'إنشاء حساب جديد';
  document.getElementById('auth-submit-btn').textContent = authMode==='login' ? 'دخول' : 'إنشاء الحساب';
  document.getElementById('auth-toggle-mode').textContent = authMode==='login' ? 'ليس لديك حساب؟ أنشئ حساب جديد' : 'لديك حساب بالفعل؟ سجّل الدخول';
  document.getElementById('auth-msg').textContent='';
});

document.getElementById('auth-submit-btn').addEventListener('click', async ()=>{
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-password').value;
  const msg = document.getElementById('auth-msg');
  if(!fbAuth){ msg.textContent = 'تسجيل الدخول غير مُفعّل بعد على هذا الموقع (يحتاج إعداد Firebase من مالك الموقع).'; return; }
  if(!email || !pass){ msg.textContent = 'الرجاء تعبئة البريد وكلمة المرور.'; return; }
  msg.textContent = '...جارٍ المعالجة';
  try{
    if(authMode==='login') await fbAuth.signInWithEmailAndPassword(email, pass);
    else await fbAuth.createUserWithEmailAndPassword(email, pass);
  }catch(e){ msg.textContent = 'خطأ: ' + (e.message || 'تعذر تسجيل الدخول'); }
});

document.getElementById('auth-logout-btn').addEventListener('click', ()=>{ if(fbAuth) fbAuth.signOut(); });

if(fbAuth){
  fbAuth.onAuthStateChanged(async user=>{
    fbUser = user;
    const gate = document.getElementById('auth-modal');
    const appWrap = document.getElementById('app-wrap');
    if(user){
      gate.classList.remove('show');
      appWrap.style.display='block';
      document.getElementById('auth-status').textContent = 'مسجّل الدخول: ' + user.email;
      document.getElementById('auth-open-btn').textContent = 'حسابي';
      document.getElementById('auth-form-area').style.display='none';
      document.getElementById('auth-loggedin-area').style.display='block';
      document.getElementById('auth-current-email').textContent = user.email;

      document.getElementById('bank-count').textContent = '...جارٍ تحميل بيانات الحالات من حسابك';
      const ok = await loadCaseDataFromFirestore();
      if(!ok || CASE_BANK.length === 0){
        document.getElementById('bank-count').textContent = 'تعذر تحميل بيانات الحالات. تأكد من إجراء الترحيل (seed) وقواعد الأمان بشكل صحيح.';
        return;
      }
      await loadProgress();
      renderStats(); renderBadges();
      buildCatBar();
      nextCase();
    } else {
      gate.classList.add('show');
      appWrap.style.display='none';
      document.getElementById('auth-form-area').style.display='block';
      document.getElementById('auth-loggedin-area').style.display='none';
    }
  });
} else {
  // Firebase غير مُفعّل — لا يوجد مصدر بيانات بديل (البيانات محمية بالكامل خلف تسجيل الدخول)
  document.getElementById('auth-modal').classList.remove('show');
  document.getElementById('app-wrap').style.display='block';
  document.getElementById('bank-count').textContent = 'تسجيل الدخول غير مُفعّل على هذا الموقع، لا يمكن عرض البيانات.';
}

/* ===================== حالة التطبيق ===================== */
let progress = { total:0, correct:0, weakness:{}, seenIds:[], history:[], notes:{} };
let activeCat = 'all';
let currentCase = null;

async function loadProgress(){
  if(fbUser && fbDb){
    try{
      const doc = await fbDb.collection('users').doc(fbUser.uid).collection('data').doc('progress').get();
      if(doc.exists) progress = Object.assign({total:0,correct:0,weakness:{},seenIds:[],history:[],notes:{}}, doc.data());
      else progress = { total:0, correct:0, weakness:{}, seenIds:[], history:[], notes:{} };
    }catch(e){ console.warn('تعذر تحميل التقدم من الحساب:', e.message); }
  } else {
    try{ const raw = localStorage.getItem('crop-clinic-progress'); if(raw) progress = JSON.parse(raw); }catch(e){}
  }
  renderStats(); renderBadges();
}
async function saveProgress(){
  if(fbUser && fbDb){
    try{
      await fbDb.collection('users').doc(fbUser.uid).collection('data').doc('progress').set(progress);
      const acc = progress.total ? Math.round(100*progress.correct/progress.total) : 0;
      await fbDb.collection('leaderboard').doc(fbUser.uid).set({
        email: fbUser.email, total: progress.total, correct: progress.correct, accuracy: acc, updatedAt: Date.now()
      });
    }
    catch(e){ console.warn('تعذر حفظ التقدم في الحساب:', e.message); }
  } else {
    try{ localStorage.setItem('crop-clinic-progress', JSON.stringify(progress)); }catch(e){}
  }
}

function renderStats(){
  document.getElementById('st-total').textContent = progress.total;
  document.getElementById('st-acc').textContent = progress.total ? Math.round(100*progress.correct/progress.total)+'%' : '—';
  document.getElementById('st-seen').textContent = progress.seenIds.length + '/' + CASE_BANK.length;
  const weakSorted = Object.entries(progress.weakness).sort((a,b)=>b[1]-a[1]).slice(0,2);
  document.getElementById('weak-line').textContent = weakSorted.length ? 'نقاط ضعف: ' + weakSorted.map(w=>CATS[w[0]]).join(' · ') : '';
}

/* ===================== لوحة الصدارة ===================== */
async function loadLeaders(){
  const box = document.getElementById('leaders-list');
  if(!fbDb){ box.innerHTML = '<p style="text-align:center;color:#8a7d55;font-size:12px;">لوحة الصدارة تحتاج تسجيل الدخول مفعّلًا على هذا الموقع.</p>'; return; }
  try{
    const snap = await fbDb.collection('leaderboard').orderBy('total','desc').limit(20).get();
    if(snap.empty){ box.innerHTML = '<p style="text-align:center;color:#8a7d55;font-size:12px;">لا يوجد مستخدمون بعد.</p>'; return; }
    let i = 0;
    box.innerHTML = snap.docs.map(doc=>{
      i++;
      const d = doc.data();
      const name = (d.email||'مستخدم').split('@')[0];
      return `<div class="leader-row"><span class="lr-rank">#${i}</span><span class="lr-name">${name}</span><span class="lr-score">${d.total} حالة (${d.accuracy}%)</span></div>`;
    }).join('');
  }catch(e){
    box.innerHTML = '<p style="text-align:center;color:#8a7d55;font-size:12px;">تعذر تحميل لوحة الصدارة حاليًا.</p>';
  }
}

/* ===================== شارات الإنجاز ===================== */
function computeBadges(){
  const acc = progress.total ? Math.round(100*progress.correct/progress.total) : 0;
  return [
    {label:'أول 10 حالات', earned: progress.total>=10},
    {label:'100 حالة', earned: progress.total>=100},
    {label:'300 حالة', earned: progress.total>=300},
    {label:'دقة 70%+', earned: acc>=70 && progress.total>=20},
    {label:'دقة 90%+', earned: acc>=90 && progress.total>=20},
    {label:'نصف البنك', earned: progress.seenIds.length >= CASE_BANK.length/2},
    {label:'كل البنك', earned: progress.seenIds.length >= CASE_BANK.length},
  ];
}
function renderBadges(){
  const row = document.getElementById('badge-row');
  row.innerHTML = computeBadges().map(b=>`<span class="badge-chip ${b.earned?'earned':''}">${b.earned?'🏅 ':'🔒 '}${b.label}</span>`).join('');
}

/* ===================== تبويبات ===================== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ['train','quiz','browse','leaders'].forEach(v=>{
      document.getElementById('view-'+v).style.display = (v===btn.dataset.tab) ? 'block' : 'none';
    });
    if(btn.dataset.tab==='browse') renderBrowseList('');
    if(btn.dataset.tab==='leaders') loadLeaders();
  });
});


function buildCatBar(){
  const bar = document.getElementById('catbar');
  const all = [['all','الكل'], ...Object.entries(CATS)];
  bar.innerHTML='';
  all.forEach(([key,label])=>{
    const b = document.createElement('button');
    b.className = 'catbtn' + (key===activeCat?' active':'');
    b.textContent = label;
    b.onclick = ()=>{ activeCat = key; buildCatBar(); nextCase(); };
    bar.appendChild(b);
  });
}

function pickNextCase(pool){
  pool = pool || (activeCat==='all' ? CASE_BANK : CASE_BANK.filter(c=>c.category===activeCat));
  const unseen = pool.filter(c=>!progress.seenIds.includes(c.id));
  const weakCats = Object.entries(progress.weakness).sort((a,b)=>b[1]-a[1]).map(w=>w[0]);
  if(weakCats.length && Math.random()<0.35){
    const weakPool = pool.filter(c=>c.category===weakCats[0]);
    if(weakPool.length) return weakPool[Math.floor(Math.random()*weakPool.length)];
  }
  if(unseen.length) return unseen[Math.floor(Math.random()*unseen.length)];
  return pool[Math.floor(Math.random()*pool.length)];
}

function renderCaseInto(c, optsBoxId, symptomBoxId, illusBoxId, cropNameId, catLabelId, lvlBadgeId, onAnswer){
  document.getElementById(illusBoxId).innerHTML = c.photo
    ? `<img src="images/${c.photo}" alt="${c.name}" style="max-width:100%;max-height:160px;border-radius:6px;object-fit:cover;" onerror="this.parentElement.innerHTML=iconFor(${JSON.stringify(c).replace(/"/g,'&quot;')});">`
    : iconFor(c);
  document.getElementById(cropNameId).textContent = c.crop;
  document.getElementById(catLabelId).textContent = CATS[c.category];
  document.getElementById(lvlBadgeId).textContent = c.symptom.startsWith('في مرحلة مبكرة') ? 'مبكر' : c.symptom.startsWith('في حالة متقدمة') ? 'متقدم' : 'قياسي';
  document.getElementById(symptomBoxId).textContent = c.symptom;
  const box = document.getElementById(optsBoxId);
  box.innerHTML='';
  c.options.forEach((opt,i)=>{
    const b = document.createElement('button');
    b.className='opt'; b.textContent=opt; b.onclick=()=>onAnswer(i);
    box.appendChild(b);
  });
}

function nextCase(){
  const c = pickNextCase();
  currentCase = c;
  renderCaseInto(c, 'options-box','symptoms-box','illus-box','crop-name','cat-label','lvl-badge', answer);
  document.getElementById('feedback-box').className='feedback';
  const notesArea = document.getElementById('notes-area');
  notesArea.style.display='none';
  document.getElementById('note-input').value = (progress.notes && progress.notes[c.id]) || '';
  if(!progress.seenIds.includes(c.id)) progress.seenIds.push(c.id);
}

function feedbackHTML(c, isRight){
  let html = `<b>${isRight?'✔ إجابة صحيحة — '+c.name:'✘ غير دقيق — الصحيح: '+c.name}</b>${c.explain}`;
  if(c.treatment) html += `<div class="treat-box">💊 <b class="treat-label">العلاج / المادة الفعالة</b>${c.treatment}</div>`;
  if(PREVENTION[c.category]) html += `<div class="prevent-box">🛡 <b class="prevent-label">الوقاية العامة</b>${PREVENTION[c.category]}</div>`;
  return html;
}

function answer(i){
  const buttons = document.querySelectorAll('#options-box .opt');
  buttons.forEach(b=>b.disabled=true);
  const correct = currentCase.correctIndex;
  buttons[correct].classList.add('correct');
  const isRight = i===correct;
  if(!isRight){
    buttons[i].classList.add('wrong');
    progress.weakness[currentCase.category] = (progress.weakness[currentCase.category]||0)+1;
  }
  progress.total++; if(isRight) progress.correct++;
  saveProgress(); renderStats(); renderBadges();
  const fb = document.getElementById('feedback-box');
  fb.className = 'feedback show ' + (isRight?'ok':'no');
  fb.innerHTML = feedbackHTML(currentCase, isRight);
  document.getElementById('notes-area').style.display='block';
}

document.getElementById('note-save-btn').addEventListener('click', ()=>{
  if(!currentCase) return;
  progress.notes = progress.notes || {};
  const val = document.getElementById('note-input').value.trim();
  if(val) progress.notes[currentCase.id] = val; else delete progress.notes[currentCase.id];
  saveProgress();
  const btn = document.getElementById('note-save-btn');
  const old = btn.textContent; btn.textContent = '✔ تم الحفظ';
  setTimeout(()=>{ btn.textContent = old; }, 1500);
});

/* ===================== قراءة صوتية (TTS) ===================== */
document.getElementById('tts-btn').addEventListener('click', ()=>{
  if(!currentCase || !('speechSynthesis' in window)){ alert('القراءة الصوتية غير مدعومة على هذا الجهاز/المتصفح.'); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(currentCase.symptom);
  utter.lang = 'ar-SA'; utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
});

/* ===================== وضع فاتح/داكن ===================== */
function applyTheme(mode){
  document.body.classList.toggle('light', mode==='light');
  document.getElementById('theme-toggle-btn').textContent = mode==='light' ? '☀️' : '🌙';
  try{ localStorage.setItem('crop-clinic-theme', mode); }catch(e){}
}
document.getElementById('theme-toggle-btn').addEventListener('click', ()=>{
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
});
(function initTheme(){
  let saved = 'dark';
  try{ saved = localStorage.getItem('crop-clinic-theme') || 'dark'; }catch(e){}
  applyTheme(saved);
})();

/* ===================== مشاركة التطبيق ===================== */
document.getElementById('share-btn').addEventListener('click', async ()=>{
  const shareData = { title:'عيادة المحصول', text:'منصة تشخيص وتدريب زراعي تفاعلي — جرّبها!', url: location.href };
  if(navigator.share){ try{ await navigator.share(shareData); }catch(e){} }
  else{
    try{ await navigator.clipboard.writeText(location.href); alert('تم نسخ رابط التطبيق! شاركه مع من تحب.'); }
    catch(e){ prompt('انسخ الرابط يدويًا:', location.href); }
  }
});

/* ===================== تثبيت التطبيق (PWA) ===================== */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('تعذر تسجيل Service Worker (تأكد من رفع ملف sw.js بجانب index.html):', e.message));
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn').style.display = 'inline-block';
});
document.getElementById('install-btn').addEventListener('click', async ()=>{
  if(!deferredInstallPrompt){
    alert('للتثبيت يدويًا: افتح قائمة المتصفح (⋮) واختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق".');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-btn').style.display = 'none';
});
window.addEventListener('appinstalled', ()=>{
  document.getElementById('install-btn').style.display = 'none';
});

document.getElementById('next-btn').addEventListener('click', nextCase);

/* ===================== اختبار محاكاة ===================== */
let quiz = null;
document.getElementById('quiz-start-btn').addEventListener('click', startQuiz);

function startQuiz(){
  const pool = seededShuffle(CASE_BANK, Date.now()%100000).slice(0,20);
  quiz = { pool, index:0, correct:0, answered:false };
  renderQuizQuestion();
}
function renderQuizQuestion(){
  const card = document.getElementById('quiz-card');
  if(quiz.index >= quiz.pool.length){
    const pct = Math.round(100*quiz.correct/quiz.pool.length);
    progress.history = progress.history || [];
    progress.history.push({date:new Date().toISOString().slice(0,10), pct});
    if(progress.history.length>10) progress.history.shift();
    saveProgress();
    const trend = progress.history.map(h=>`<div style="display:inline-block;width:8px;height:${10+h.pct*0.5}px;background:var(--amber);margin:0 1px;border-radius:2px;vertical-align:bottom;"></div>`).join('');
    card.innerHTML = `<div class="quiz-result"><div class="big">${pct}%</div><p style="font-size:13px;color:#5a4d2c;">${quiz.correct} إجابة صحيحة من ${quiz.pool.length}</p>
      <p style="font-size:11px;color:#8a7d55;margin-top:14px;">اتجاه آخر ${progress.history.length} اختبارات</p>
      <div style="margin-top:4px;">${trend}</div></div>
      <button class="next-btn" onclick="startQuiz()">اختبار جديد</button>`;
    renderBadges();
    return;
  }
  const c = quiz.pool[quiz.index];
  card.innerHTML = `
    <div class="quiz-progress"><span>سؤال ${quiz.index+1} من ${quiz.pool.length}</span><span>✔ ${quiz.correct}</span></div>
    <div class="illus" id="q-illus"></div>
    <div class="card-top"><div class="crop-name" id="q-crop">—</div><div class="meta"><div id="q-cat">فئة</div><div class="lvl" id="q-lvl">—</div></div></div>
    <div class="symptoms" id="q-symptom"></div>
    <div class="options" id="q-options"></div>
    <div class="feedback" id="q-feedback"></div>
    <button class="next-btn" id="q-next-btn" style="display:none">${quiz.index+1<quiz.pool.length?'السؤال التالي ⟵':'عرض النتيجة'}</button>
  `;
  renderCaseInto(c, 'q-options','q-symptom','q-illus','q-crop','q-cat','q-lvl', quizAnswer);
  document.getElementById('q-next-btn').addEventListener('click', ()=>{ quiz.index++; renderQuizQuestion(); });
}
function quizAnswer(i){
  const c = quiz.pool[quiz.index];
  const buttons = document.querySelectorAll('#q-options .opt');
  buttons.forEach(b=>b.disabled=true);
  buttons[c.correctIndex].classList.add('correct');
  const isRight = i===c.correctIndex;
  if(!isRight) buttons[i].classList.add('wrong'); else quiz.correct++;
  const fb = document.getElementById('q-feedback');
  fb.className = 'feedback show ' + (isRight?'ok':'no');
  fb.innerHTML = feedbackHTML(c, isRight);
  document.getElementById('q-next-btn').style.display='block';
}

/* ===================== تصفح وبحث ===================== */
function renderBrowseList(filterText){
  const list = document.getElementById('browse-list');
  const q = (filterText||'').trim();
  const filtered = FACT_INDEX.filter(f => !q || f.name.includes(q) || (f.crops||[]).some(cid=>CROPS[cid] && CROPS[cid].includes(q)));
  const countLine = `<p style="text-align:center;color:#a9c08f;font-size:11px;margin:0 0 8px;">${filtered.length} نتيجة${q ? ' لـ "'+q+'"' : ''}</p>`;
  if(!filtered.length){ list.innerHTML = countLine + '<p style="text-align:center;color:#a9b696;font-size:12.5px;">لا توجد نتائج مطابقة.</p>'; return; }
  list.innerHTML = countLine + filtered.slice(0,60).map(f=>`
    <div class="browse-item">
      <b>${f.name}</b>
      <span class="bi-crop">${CATS[f.category]}${f.crops ? ' — ' + f.crops.map(c=>CROPS[c]).join('، ') : ' — كل المحاصيل'}</span>
      <div style="margin-top:6px;">${f.symptom}</div>
      ${f.treatment ? `<span class="bi-treat">💊 ${f.treatment}</span>` : ''}
      ${PREVENTION[f.category] ? `<span class="bi-prevent">🛡 ${PREVENTION[f.category]}</span>` : ''}
    </div>`).join('');
}
const searchInputEl = document.getElementById('search-input');
['input','keyup','change'].forEach(evt=>{
  searchInputEl.addEventListener(evt, e=> renderBrowseList(e.target.value));
});

/* ===================== دليل المكافحة ===================== */
function buildGuide(){
  const content = document.getElementById('guide-content');
  let html = '';
  html += '<div class="guide-group"><h3>🍄 أمراض فطرية</h3>';
  FACT_INDEX.filter(f=>f.category==='fungal').forEach(f=>{
    html += `<div class="guide-item"><b>${f.name}</b>${f.treatment ? '<span class="gi-treat">'+f.treatment+'</span>' : ''}</div>`;
  });
  html += '</div><div class="guide-group"><h3>🐛 آفات حشرية</h3>';
  FACT_INDEX.filter(f=>f.category==='pest').forEach(f=>{
    html += `<div class="guide-item"><b>${f.name}</b>${f.treatment ? '<span class="gi-treat">'+f.treatment+'</span>' : ''}</div>`;
  });
  html += '</div>';
  content.innerHTML = html;
}
document.getElementById('guide-btn').addEventListener('click', ()=>{
  buildGuide();
  document.getElementById('guide-modal').classList.add('show');
});
document.getElementById('guide-close').addEventListener('click', ()=>{
  document.getElementById('guide-modal').classList.remove('show');
});

/* ===================== تصدير / استيراد التقدم ===================== */
document.getElementById('export-btn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(progress, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'crop-clinic-progress.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('import-btn').addEventListener('click', ()=> document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const data = JSON.parse(reader.result);
      progress = Object.assign({total:0,correct:0,weakness:{},seenIds:[],history:[],notes:{}}, data);
      await saveProgress(); renderStats(); renderBadges();
      alert('تم استيراد التقدم بنجاح.');
    }catch(e){ alert('ملف غير صالح.'); }
  };
  reader.readAsText(file);
});
