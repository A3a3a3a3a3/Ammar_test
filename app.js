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
 irrigation:'ري وتسميد', organic:'مخلفات عضوية وتكامل زراعي',
 license:'الترخيص المهني'
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

let lastCaseLoadError = '';
const LOCAL_CACHE_KEY = 'crop-clinic-case-bank-v1';

function setLoadStatus(msg, isHTML){
  const bc = document.getElementById('bank-count');
  const hs = document.getElementById('hub-status');
  if(bc){ if(isHTML) bc.innerHTML = msg; else bc.textContent = msg; }
  if(hs){ if(isHTML) hs.innerHTML = msg; else hs.textContent = msg; }
}

function saveCaseBankToLocalCache(){
  try{
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      cases: CASE_BANK, facts: FACT_INDEX, prevention: PREVENTION, savedAt: Date.now()
    }));
  }catch(e){ console.warn('تعذر حفظ نسخة احتياطية محلية من بنك الحالات:', e.message); }
}

function loadCaseBankFromLocalCache(){
  try{
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!data.cases || !data.cases.length) return false;
    CASE_BANK = data.cases;
    FACT_INDEX = data.facts || [];
    PREVENTION = data.prevention || {};
    return true;
  }catch(e){ return false; }
}

async function fetchCaseDataOnce(){
  const [casesSnap, factsSnap, prevDoc] = await Promise.all([
    fbDb.collection('cases').get(),
    fbDb.collection('facts').get(),
    fbDb.collection('meta').doc('prevention').get()
  ]);
  CASE_BANK = casesSnap.docs.map(d=>d.data()).sort((a,b)=>a.id-b.id);
  FACT_INDEX = factsSnap.docs.map(d=>d.data());
  PREVENTION = prevDoc.exists ? prevDoc.data() : {};
  return CASE_BANK.length > 0;
}

// يحاول التحميل من الشبكة بصمت (بدون لمس واجهة المستخدم)، ويحدّث النسخة المحلية إن نجح.
// يُستخدم للتحديث بالخلفية بعد الاعتماد على نسخة محلية قديمة.
function scheduleBackgroundRefresh(){
  const tryRefresh = async ()=>{
    if(!fbDb) return;
    try{
      const ok = await fetchCaseDataOnce();
      if(ok){
        saveCaseBankToLocalCache();
        setLoadStatus(`${CASE_BANK.length} حالة تشخيصية — تم تحديث البيانات ✔`);
        console.info('تم تحديث بنك الحالات بالخلفية بنجاح.');
      }
    }catch(e){ /* صامت — نحاول لاحقًا عند رجوع الاتصال */ }
  };
  window.addEventListener('online', tryRefresh, { once:true });
  // محاولة إضافية بعد 30 ثانية احتياطًا (بعض الأجهزة لا تُطلق حدث 'online' بدقة)
  setTimeout(tryRefresh, 30000);
}

async function loadCaseDataFromFirestore(){
  if(!fbDb) return false;
  const MAX_ATTEMPTS = 3;
  for(let attempt=1; attempt<=MAX_ATTEMPTS; attempt++){
    try{
      const ok = await fetchCaseDataOnce();
      if(ok){
        setLoadStatus(`${CASE_BANK.length} حالة تشخيصية — محمية بتسجيل الدخول`);
        saveCaseBankToLocalCache();
        return true;
      } else {
        lastCaseLoadError = 'البنك فارغ (0 حالة) في قاعدة البيانات';
        break; // ما في داعي نعيد المحاولة إذا كان البنك فارغ فعليًا، المشكلة مو اتصال
      }
    }catch(e){
      lastCaseLoadError = (e && (e.code || e.message)) ? `[${e.code||''}] ${e.message||e}` : String(e);
      console.warn(`محاولة تحميل بنك الحالات رقم ${attempt}/${MAX_ATTEMPTS} فشلت:`, lastCaseLoadError);
      if(attempt < MAX_ATTEMPTS){
        await new Promise(r=>setTimeout(r, attempt*1200)); // تأخير متزايد قبل إعادة المحاولة
      }
    }
  }
  // فشلت كل المحاولات المباشرة — جرّب الرجوع لنسخة محفوظة محليًا من زيارة سابقة ناجحة
  if(loadCaseBankFromLocalCache()){
    setLoadStatus(`${CASE_BANK.length} حالة (نسخة محفوظة محليًا — سيتم التحديث تلقائيًا عند توفر الاتصال) ⚠️`);
    scheduleBackgroundRefresh();
    return true;
  }
  console.error('تعذر جلب بيانات الحالات من Firestore بعد كل المحاولات، ولا توجد نسخة محلية محفوظة:', lastCaseLoadError);
  return false;
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
function svgDocument(){
  return `<svg viewBox="0 0 100 110">
    <rect x="18" y="6" width="64" height="98" rx="4" fill="#f5efdd" stroke="#c07a2b" stroke-width="2.5"/>
    <rect x="30" y="2" width="40" height="14" rx="3" fill="#d9b45a"/>
    <line x1="30" y1="34" x2="70" y2="34" stroke="#a3641f" stroke-width="3"/>
    <line x1="30" y1="46" x2="70" y2="46" stroke="#c9bc98" stroke-width="3"/>
    <line x1="30" y1="58" x2="70" y2="58" stroke="#c9bc98" stroke-width="3"/>
    <line x1="30" y1="70" x2="55" y2="70" stroke="#c9bc98" stroke-width="3"/>
    <circle cx="66" cy="84" r="14" fill="none" stroke="#a8402a" stroke-width="2.5"/>
    <path d="M60,84 L64,88 L73,79" stroke="#a8402a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function iconFor(c){
  const seed = c.id;
  if(c.shape==='document') return svgDocument();
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

/* ===================== شاشة الترحيب التعريفية (تظهر بكل زيارة) ===================== */
const introCtaBtn = document.getElementById('intro-cta-btn');
if(introCtaBtn){
  introCtaBtn.addEventListener('click', ()=>{
    document.getElementById('intro-screen').classList.add('hide');
  });
}

function openAuthModal(){ document.getElementById('auth-modal').classList.add('show'); }

/* ===================== التنقل بين شاشة الاختيار الرئيسية والأقسام ===================== */
function showHub(){
  document.getElementById('hub-screen').style.display='flex';
  document.getElementById('app-wrap').style.display='none';
  document.getElementById('license-wrap').style.display='none';
}
function showClinic(){
  document.getElementById('hub-screen').style.display='none';
  document.getElementById('app-wrap').style.display='block';
}
let licenseProgressLoaded = false;
function showLicenseSection(){
  document.getElementById('hub-screen').style.display='none';
  document.getElementById('license-wrap').style.display='block';
  if(!licenseSourcesBuilt){ buildLicenseGuide(); licenseSourcesBuilt = true; }
  if(!licenseProgressLoaded){ licenseProgressLoaded = true; loadLicenseProgress().then(nextLicenseCase); }
  else { nextLicenseCase(); }
}
const hubCardClinic = document.getElementById('hub-card-clinic');
if(hubCardClinic) hubCardClinic.addEventListener('click', showClinic);
const hubCardLicense = document.getElementById('hub-card-license');
if(hubCardLicense) hubCardLicense.addEventListener('click', showLicenseSection);
const backToHubBtn = document.getElementById('back-to-hub-btn');
if(backToHubBtn) backToHubBtn.addEventListener('click', showHub);
const licenseBackBtn = document.getElementById('license-back-btn');
if(licenseBackBtn) licenseBackBtn.addEventListener('click', showHub);
const hubThemeBtn = document.getElementById('hub-theme-btn');
if(hubThemeBtn) hubThemeBtn.addEventListener('click', ()=>{
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
});
const hubAccountBtn = document.getElementById('hub-account-btn');
if(hubAccountBtn) hubAccountBtn.addEventListener('click', openAuthModal);

/* ===== تبويبات فرعية داخل قسم الترخيص المهني ===== */
document.querySelectorAll('#license-wrap .tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#license-wrap .tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.ltab;
    document.getElementById('lview-questions').style.display = tab==='questions' ? 'block' : 'none';
    document.getElementById('lview-sources').style.display = tab==='sources' ? 'block' : 'none';
  });
});
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
    else{
      const cred = await fbAuth.createUserWithEmailAndPassword(email, pass);
      await cred.user.sendEmailVerification();
    }
  }catch(e){ msg.textContent = 'خطأ: ' + (e.message || 'تعذر تسجيل الدخول'); }
});

document.getElementById('auth-logout-btn').addEventListener('click', ()=>{ if(fbAuth) fbAuth.signOut(); });
document.getElementById('auth-verify-logout-btn').addEventListener('click', ()=>{ if(fbAuth) fbAuth.signOut(); });

document.getElementById('auth-recheck-btn').addEventListener('click', async ()=>{
  if(!fbAuth.currentUser) return;
  await fbAuth.currentUser.reload();
  fbUser = fbAuth.currentUser;
  if(fbUser.emailVerified){ renderAuthGate(); }
  else{ alert('لسا ما فعّلت البريد. تأكد من فتح الرابط المرسل لك ثم حاول مرة أخرى.'); }
});
document.getElementById('auth-resend-btn').addEventListener('click', async ()=>{
  if(!fbAuth.currentUser) return;
  try{ await fbAuth.currentUser.sendEmailVerification(); alert('تم إرسال رابط تفعيل جديد إلى بريدك.'); }
  catch(e){ alert('تعذر الإرسال، حاول لاحقًا: ' + e.message); }
});

async function renderAuthGate(){
  const gate = document.getElementById('auth-modal');
  const appWrap = document.getElementById('app-wrap');
  const hub = document.getElementById('hub-screen');
  const user = fbUser;

  if(user && user.emailVerified){
    gate.classList.remove('show');
    hub.style.display='flex';
    document.getElementById('hub-user-email').textContent = user.email;
    document.getElementById('auth-status').textContent = 'مسجّل الدخول: ' + user.email;
    document.getElementById('auth-open-btn').textContent = 'حسابي';
    document.getElementById('auth-form-area').style.display='none';
    document.getElementById('auth-verify-area').style.display='none';
    document.getElementById('auth-loggedin-area').style.display='block';
    document.getElementById('auth-current-email').textContent = user.email;

    if(CASE_BANK.length === 0){
      setLoadStatus('...جارٍ تحميل بيانات الحالات');
      const ok = await loadCaseDataFromFirestore();
      if(!ok || CASE_BANK.length === 0){
        const reason = lastCaseLoadError ? `(${lastCaseLoadError})` : '(البنك فارغ أو لم يتم إرجاع أي حالات)';
        setLoadStatus(
          `تعذر تحميل بيانات الحالات ${reason}. تأكد من اتصال الإنترنت وقواعد الأمان. ` +
          `<button class="retry-load-btn" style="margin-inline-start:6px;padding:2px 10px;border-radius:12px;border:1px solid currentColor;background:none;color:inherit;font-size:11px;cursor:pointer;">إعادة المحاولة 🔄</button>`,
          true
        );
        document.querySelectorAll('.retry-load-btn').forEach(b=> b.addEventListener('click', renderAuthGate));
        return;
      }
      await loadProgress();
      renderStats(); renderBadges();
      buildCropSelect();
      buildCatBar();
      nextCase();
    }
  } else if(user && !user.emailVerified){
    gate.classList.add('show');
    appWrap.style.display='none';
    hub.style.display='none';
    document.getElementById('auth-form-area').style.display='none';
    document.getElementById('auth-loggedin-area').style.display='none';
    document.getElementById('auth-verify-area').style.display='block';
    document.getElementById('auth-verify-email').textContent = user.email;
  } else {
    gate.classList.add('show');
    appWrap.style.display='none';
    hub.style.display='none';
    document.getElementById('auth-form-area').style.display='block';
    document.getElementById('auth-loggedin-area').style.display='none';
    document.getElementById('auth-verify-area').style.display='none';
  }
}

if(fbAuth){
  fbAuth.onAuthStateChanged(async user=>{
    fbUser = user;
    await renderAuthGate();
  });
} else {
  // Firebase غير مُفعّل — لا يوجد مصدر بيانات بديل (البيانات محمية بالكامل خلف تسجيل الدخول)
  document.getElementById('auth-modal').classList.remove('show');
  document.getElementById('app-wrap').style.display='block';
  document.getElementById('bank-count').textContent = 'تسجيل الدخول غير مُفعّل على هذا الموقع، لا يمكن عرض البيانات.';
}

/* ===================== حالة التطبيق ===================== */
let progress = { total:0, correct:0, weakness:{}, seenIds:[], history:[], notes:{} };
let licenseProgress = { total:0, correct:0, weakness:{}, seenIds:[] };
let activeCat = 'all';
let activeCrop = 'all';
let currentCase = null;
let currentLicenseCase = null;
let licenseSourcesBuilt = false;

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

/* ===== تقدّم قسم الترخيص المهني — منفصل تمامًا عن تقدّم العيادة التشخيصية ===== */
async function loadLicenseProgress(){
  if(fbUser && fbDb){
    try{
      const doc = await fbDb.collection('users').doc(fbUser.uid).collection('data').doc('licenseProgress').get();
      if(doc.exists) licenseProgress = Object.assign({total:0,correct:0,weakness:{},seenIds:[]}, doc.data());
      else licenseProgress = { total:0, correct:0, weakness:{}, seenIds:[] };
    }catch(e){ console.warn('تعذر تحميل تقدّم الترخيص المهني من الحساب:', e.message); }
  } else {
    try{ const raw = localStorage.getItem('crop-clinic-license-progress'); if(raw) licenseProgress = JSON.parse(raw); }catch(e){}
  }
  renderLicenseStats();
}
async function saveLicenseProgress(){
  if(fbUser && fbDb){
    try{ await fbDb.collection('users').doc(fbUser.uid).collection('data').doc('licenseProgress').set(licenseProgress); }
    catch(e){ console.warn('تعذر حفظ تقدّم الترخيص المهني بالحساب:', e.message); }
  } else {
    try{ localStorage.setItem('crop-clinic-license-progress', JSON.stringify(licenseProgress)); }catch(e){}
  }
}
function renderLicenseStats(){
  const totalEl = document.getElementById('l-st-total');
  const accEl = document.getElementById('l-st-acc');
  if(!totalEl || !accEl) return;
  totalEl.textContent = licenseProgress.total;
  accEl.textContent = licenseProgress.total ? Math.round(100*licenseProgress.correct/licenseProgress.total)+'%' : '—';
}

function renderStats(){
  document.getElementById('st-total').textContent = progress.total;
  document.getElementById('st-acc').textContent = progress.total ? Math.round(100*progress.correct/progress.total)+'%' : '—';
  document.getElementById('st-seen').textContent = progress.seenIds.length + '/' + clinicCases().length;
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
  const clinicTotal = clinicCases().length;
  return [
    {label:'أول 10 حالات', earned: progress.total>=10},
    {label:'100 حالة', earned: progress.total>=100},
    {label:'300 حالة', earned: progress.total>=300},
    {label:'دقة 70%+', earned: acc>=70 && progress.total>=20},
    {label:'دقة 90%+', earned: acc>=90 && progress.total>=20},
    {label:'نصف البنك', earned: progress.seenIds.length >= clinicTotal/2},
    {label:'كل البنك', earned: progress.seenIds.length >= clinicTotal},
  ];
}
function renderBadges(){
  const row = document.getElementById('badge-row');
  row.innerHTML = computeBadges().map(b=>`<span class="badge-chip ${b.earned?'earned':''}">${b.earned?'🏅 ':'🔒 '}${b.label}</span>`).join('');
  const certBtn = document.getElementById('cert-btn');
  if(certBtn){
    const acc = progress.total ? Math.round(100*progress.correct/progress.total) : 0;
    const eligible = progress.total >= 30 && acc >= 60;
    certBtn.style.display = eligible ? 'block' : 'none';
  }
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


// بنك حالات العيادة التشخيصية فقط (يستثني أسئلة قسم الترخيص المهني تمامًا، لأنها بنك منفصل بغرض مختلف)
function clinicCases(){
  return CASE_BANK.filter(c=>c.category!=='license');
}

function buildCatBar(){
  const bar = document.getElementById('catbar');
  const clinicBank = clinicCases();
  // في وضع التدريب على محصول واحد، أظهر فقط الفئات (الأمراض/الآفات/الحالات الفسيولوجية...) الموجودة فعليًا لهذا المحصول
  const relevantCats = activeCrop==='all'
    ? Object.keys(CATS).filter(k=>k!=='license')
    : Array.from(new Set(clinicBank.filter(c=>c.crop===activeCrop).map(c=>c.category)));
  const all = [['all','الكل'], ...Object.entries(CATS).filter(([key])=>key!=='license' && relevantCats.includes(key))];
  // إن لم تعد الفئة الحالية متاحة ضمن المحصول المختار، ارجع إلى "الكل"
  if(activeCat!=='all' && !relevantCats.includes(activeCat)) activeCat = 'all';
  bar.innerHTML='';
  all.forEach(([key,label])=>{
    const b = document.createElement('button');
    b.className = 'catbtn' + (key===activeCat?' active':'');
    b.textContent = label;
    b.onclick = ()=>{ activeCat = key; buildCatBar(); nextCase(); };
    bar.appendChild(b);
  });
}

function buildCropSelect(){
  const sel = document.getElementById('crop-select');
  if(!sel) return;
  const crops = Array.from(new Set(clinicCases().map(c=>c.crop))).sort((a,b)=>a.localeCompare(b,'ar'));
  sel.innerHTML = '<option value="all">🌱 التدريب على كل المحاصيل</option>' +
    crops.map(name=>`<option value="${name}">${name}</option>`).join('');
  sel.value = activeCrop;
  updateCropFocusLine();
}

function updateCropFocusLine(){
  const line = document.getElementById('crop-focus-line');
  if(!line) return;
  if(activeCrop==='all'){ line.textContent=''; return; }
  const count = clinicCases().filter(c=>c.crop===activeCrop && (activeCat==='all'||c.category===activeCat)).length;
  line.textContent = `🔎 تدريب مركّز على "${activeCrop}" — ${count} حالة متاحة (كل الأمراض والآفات والحالات الفسيولوجية الخاصة به)`;
}

const cropSelectEl = document.getElementById('crop-select');
if(cropSelectEl){
  cropSelectEl.addEventListener('change', (e)=>{
    activeCrop = e.target.value;
    buildCatBar();      // حدّث الفئات المتاحة حسب المحصول
    updateCropFocusLine();
    nextCase();
  });
} else {
  console.warn('عنصر #crop-select غير موجود في index-1.html — تأكد من نسخ ملف الـ HTML الجديد كاملاً.');
}

function pickNextCase(pool, progObj){
  progObj = progObj || progress;
  const matchesFilters = c => c.category!=='license' && (activeCat==='all' || c.category===activeCat) && (activeCrop==='all' || c.crop===activeCrop);
  pool = pool || CASE_BANK.filter(matchesFilters);
  // شبكة أمان: إن لم توجد حالات مطابقة (مثلاً محصول بلا حالات في فئة معينة)، وسّع البحث تدريجيًا بدل توقف التطبيق (مع الإبقاء على استثناء فئة الترخيص المهني دائمًا)
  if(!pool.length && activeCrop!=='all') pool = clinicCases().filter(c=>c.crop===activeCrop);
  if(!pool.length) pool = clinicCases();
  const unseen = pool.filter(c=>!progObj.seenIds.includes(c.id));
  const weakCats = Object.entries(progObj.weakness).sort((a,b)=>b[1]-a[1]).map(w=>w[0]);
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

/* ===================== أسئلة قسم الترخيص المهني ===================== */
function nextLicenseCase(retriesLeft){
  if(retriesLeft === undefined) retriesLeft = 24;
  const pool = CASE_BANK.filter(c=>c.category==='license');
  const card = document.getElementById('license-card');
  const nextBtn = document.getElementById('l-next-btn');
  const emptyMsg = document.getElementById('license-empty-msg');
  if(!pool.length){
    // إذا كان بنك الحالات لسا فارغًا بالكامل، غالبًا التحميل بالخلفية ما خلص بعد — أعد المحاولة بدل الحكم بعدم وجود أسئلة
    if(CASE_BANK.length === 0 && retriesLeft > 0){
      if(card) card.style.display='none';
      if(nextBtn) nextBtn.style.display='none';
      if(emptyMsg){ emptyMsg.style.display='block'; emptyMsg.textContent='...جارٍ تحميل الأسئلة'; }
      setTimeout(()=>nextLicenseCase(retriesLeft-1), 500);
      return;
    }
    if(card) card.style.display='none';
    if(nextBtn) nextBtn.style.display='none';
    if(emptyMsg){ emptyMsg.style.display='block'; emptyMsg.textContent='لا توجد أسئلة بهذا القسم بعد — بيتم إضافتها تباعًا. تابعنا لاحقًا 🌱'; }
    return;
  }
  if(card) card.style.display='block';
  if(nextBtn) nextBtn.style.display='block';
  if(emptyMsg) emptyMsg.style.display='none';
  const c = pickNextCase(pool, licenseProgress);
  currentLicenseCase = c;
  renderCaseInto(c, 'l-options-box','l-symptoms-box','l-illus-box','l-crop-name','l-cat-label','l-lvl-badge', licenseAnswer);
  document.getElementById('l-feedback-box').className='feedback';
  if(!licenseProgress.seenIds.includes(c.id)) licenseProgress.seenIds.push(c.id);
}
function licenseAnswer(i){
  const buttons = document.querySelectorAll('#l-options-box .opt');
  buttons.forEach(b=>b.disabled=true);
  const correct = currentLicenseCase.correctIndex;
  buttons[correct].classList.add('correct');
  const isRight = i===correct;
  if(!isRight){
    buttons[i].classList.add('wrong');
    licenseProgress.weakness[currentLicenseCase.category] = (licenseProgress.weakness[currentLicenseCase.category]||0)+1;
  }
  licenseProgress.total++; if(isRight) licenseProgress.correct++;
  saveLicenseProgress(); renderLicenseStats();
  const fb = document.getElementById('l-feedback-box');
  fb.className = 'feedback show ' + (isRight?'ok':'no');
  fb.innerHTML = feedbackHTML(currentLicenseCase, isRight);
}
const lNextBtn = document.getElementById('l-next-btn');
if(lNextBtn) lNextBtn.addEventListener('click', nextLicenseCase);

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

/* ===================== تصدير تقرير PDF ===================== */
async function exportCasePDF(c){
  if(!c || !window.html2canvas || !window.jspdf){ alert('تعذر تحميل أداة التصدير، تأكد من اتصالك بالإنترنت وحاول مجددًا.'); return; }
  const note = (progress.notes && progress.notes[c.id]) || '';
  const today = new Date().toLocaleDateString('ar-EG');

  const report = document.createElement('div');
  report.style.cssText = 'position:fixed;top:-9999px;left:0;width:640px;background:#fdf9ef;color:#25301c;padding:32px;font-family:Tahoma,sans-serif;direction:rtl;';
  report.innerHTML = `
    <div style="border-bottom:3px solid #c07a2b;padding-bottom:14px;margin-bottom:18px;">
      <div style="font-size:11px;color:#a3641f;letter-spacing:2px;">عيادة المحصول — تقرير حالة ميدانية</div>
      <div style="font-size:24px;font-weight:900;margin-top:6px;">${c.name}</div>
      <div style="font-size:13px;color:#5a4d2c;margin-top:4px;">التاريخ: ${today} &nbsp;|&nbsp; المحصول: ${c.crop} &nbsp;|&nbsp; الفئة: ${CATS[c.category]}</div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-weight:900;font-size:14px;color:#a3641f;margin-bottom:4px;">الأعراض الملاحظة</div>
      <div style="font-size:13.5px;line-height:2;">${c.symptom}</div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-weight:900;font-size:14px;color:#5f7a4f;margin-bottom:4px;">التشخيص والتفسير العلمي</div>
      <div style="font-size:13.5px;line-height:2;">${c.explain}</div>
    </div>
    ${c.treatment ? `<div style="margin-bottom:14px;"><div style="font-weight:900;font-size:14px;color:#a3641f;margin-bottom:4px;">💊 العلاج / المادة الفعالة</div><div style="font-size:13.5px;line-height:2;">${c.treatment}</div></div>` : ''}
    ${PREVENTION[c.category] ? `<div style="margin-bottom:14px;"><div style="font-weight:900;font-size:14px;color:#2f6b8a;margin-bottom:4px;">🛡 الوقاية العامة</div><div style="font-size:13.5px;line-height:2;">${PREVENTION[c.category]}</div></div>` : ''}
    ${note ? `<div style="margin-bottom:14px;padding-top:10px;border-top:1px dashed #d8cca4;"><div style="font-weight:900;font-size:14px;color:#25301c;margin-bottom:4px;">ملاحظة المهندس</div><div style="font-size:13.5px;line-height:2;">${note}</div></div>` : ''}
    <div style="margin-top:24px;padding-top:10px;border-top:1px solid #d8cca4;font-size:10.5px;color:#8a7d55;">تم إنشاء هذا التقرير عبر منصة عيادة المحصول</div>
  `;
  document.body.appendChild(report);
  try{
    const canvas = await html2canvas(report, {scale:2, backgroundColor:'#fdf9ef'});
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`تقرير-${c.crop}-${c.name}.pdf`.replace(/\s+/g,'-'));
  }catch(e){
    alert('حدث خطأ أثناء إنشاء التقرير: ' + e.message);
  }finally{
    document.body.removeChild(report);
  }
}
document.getElementById('pdf-export-btn').addEventListener('click', ()=> exportCasePDF(currentCase));

/* ===================== شهادة إتمام التدريب ===================== */
async function exportCertificatePDF(){
  if(!window.html2canvas || !window.jspdf){ alert('تعذر تحميل أداة التصدير، تأكد من اتصالك بالإنترنت وحاول مجددًا.'); return; }
  const name = (fbUser && fbUser.email) ? fbUser.email.split('@')[0] : 'متدرّب';
  const acc = progress.total ? Math.round(100*progress.correct/progress.total) : 0;
  const today = new Date().toLocaleDateString('ar-EG');
  const weakSorted = Object.entries(progress.weakness).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const strongAreas = Object.keys(CATS).filter(k=>!weakSorted.some(w=>w[0]===k)).map(k=>CATS[k]).slice(0,4);

  const cert = document.createElement('div');
  cert.style.cssText = 'position:fixed;top:-9999px;left:0;width:700px;background:#fdf9ef;color:#25301c;padding:40px;font-family:Tahoma,sans-serif;direction:rtl;border:6px solid #c07a2b;';
  cert.innerHTML = `
    <div style="text-align:center;border-bottom:2px solid #d8cca4;padding-bottom:16px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:3px;color:#a3641f;">CROP CLINIC — CAREER-READY AGRICULTURAL TRAINING</div>
      <div style="font-size:26px;font-weight:900;margin-top:8px;">عيادة المحصول</div>
      <div style="font-size:14px;color:#5a4d2c;margin-top:4px;">شهادة إتمام تدريب ذاتي</div>
    </div>
    <p style="text-align:center;font-size:13.5px;line-height:2;color:#3a3020;">تشهد منصة "عيادة المحصول" أن</p>
    <div style="text-align:center;font-size:22px;font-weight:900;color:#a3641f;margin:8px 0 14px;">${name}</div>
    <p style="text-align:center;font-size:13.5px;line-height:2;color:#3a3020;">
      أتمّ برنامج تدريب ذاتي بالتشخيص الزراعي الميداني عبر المنصة، بواقع
      <b>${progress.total}</b> حالة تشخيصية بدقة إجابة <b>${acc}%</b>،
      شملت التعرف على الأمراض الفطرية، الآفات الحشرية، نقص العناصر الغذائية، والحالات الفسيولوجية عبر عدة محاصيل.
    </p>
    ${strongAreas.length ? `<p style="text-align:center;font-size:12.5px;color:#5f7a4f;margin-top:10px;">مجالات إتقان ملحوظة: ${strongAreas.join(' · ')}</p>` : ''}
    <div style="margin-top:26px;padding-top:14px;border-top:1px dashed #d8cca4;display:flex;justify-content:space-between;font-size:11px;color:#8a7d55;">
      <span>التاريخ: ${today}</span>
      <span>منصة عيادة المحصول</span>
    </div>
    <p style="margin-top:16px;font-size:9.5px;color:#a3641f;text-align:center;line-height:1.7;">
      هذه شهادة توثّق إتمام تدريب ذاتي عبر المنصة، ولا تُعد اعتمادًا أكاديميًا أو نقابيًا رسميًا من أي جهة.
    </p>
  `;
  document.body.appendChild(cert);
  try{
    const canvas = await html2canvas(cert, {scale:2, backgroundColor:'#fdf9ef'});
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l','mm','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`شهادة-عيادة-المحصول-${name}.pdf`.replace(/\s+/g,'-'));
  }catch(e){
    alert('حدث خطأ أثناء إنشاء الشهادة: ' + e.message);
  }finally{
    document.body.removeChild(cert);
  }
}
const certBtnEl = document.getElementById('cert-btn');
if(certBtnEl) certBtnEl.addEventListener('click', exportCertificatePDF);

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
  const pool = seededShuffle(clinicCases(), Date.now()%100000).slice(0,20);
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
/* ===================== دليل الترخيص المهني ===================== */
function buildLicenseGuide(){
  const content = document.getElementById('license-guide-content');
  content.innerHTML = `
    <div class="guide-group">
      <h3>📖 تعاريف أساسية (المادة 1 من قانون المبيدات)</h3>
      <div class="guide-item"><b>المبيدات الزراعية</b><span class="gi-treat">مستحضرات من مادة أو خليط مواد (كيميائية عضوية/غير عضوية أو من مصدر نباتي/حيواني/كائنات حية) غرضها الوقاية من آفة زراعية أو مكافحتها. تشمل: مبيدات الحشرات، النيماتودا، العناكب وحلم فاروا النحل، مسببات الأمراض النباتية، الأعشاب (بما فيها مسقطات الأوراق ومنظمات النمو)، القوارض، الرخويات، ومبيدات من أصل نباتي. ويُلحق بها: الزيوت الصيفية والشتوية، المواد اللاصقة أو الناشرة، المواد الغذائية الجاذبة، المصائد والفرمونات الجنسية، المصائد الفيزيائية (لونية/لاصقة/ضوئية/كرتونية)، والمواد الطاردة.</span></div>
      <div class="guide-item"><b>الشركة المنتجة مقابل الشركة المشكِّلة</b><span class="gi-treat">الشركة المنتجة: تصنّع المادة الفعالة للمبيد (Technical material). الشركة المشكِّلة: تقوم بتشكيل المستحضر النهائي للمبيد (Final formulation) — تمييز مهم عند تقييم مصدر أي مبيد.</span></div>
      <div class="guide-item"><b>نظام التسجيل المتكامل</b><span class="gi-treat">مجموعة الاختبارات الإلزامية قبل ترخيص أي مبيد للاستخدام الزراعي، وتشمل كحد أدنى: السمية على ذوات الدم الحار (فئران، جرذان، أرانب)، السمية على الكائنات المفيدة (نحل، أسماك، طيور)، دراسات سلوك المبيد بالتربة والماء والهواء والنبات، اختبارات فاعلية المبيد على الآفة، والسمية النباتية.</span></div>
    </div>

    <div class="guide-group">
      <h3>🏭 شروط استيراد وتسجيل المبيدات (الشركات)</h3>
      <div class="guide-item"><span class="gi-treat">يُسمح باستيراد المبيدات من كل دول العالم بعد تسجيلها لدى وزارة الزراعة والإصلاح الزراعي وتأمين وثيقة بعدم وجود مانع من التعامل مع الشركة من مكتب مقاطعة إسرائيل. يشترط أن تكون الشركة منتجة بدولة تطبّق نظام التسجيل المتكامل؛ وإن لم تطبّقه دولتها، يُسمح بإدخال مبيداتها إذا كانت مسجّلة بدولة أخرى تطبّق هذا النظام. فروع الشركة الأم بدول أخرى تُعامل معاملة الشركة الأم بشرط تقديم وثيقة تبعية مصدّقة. مجموعة الشركات المتحدة بإدارة واحدة تُعامل معاملة شركة واحدة. يُسمح بالتعاون بين شركتين لإنتاج مبيد بشرط أن يكون الطرفان منتجين للمادة الفعالة. الشركات المسوّقة فقط (بدون إنتاج) يُسمح بالتعامل معها فقط إن لم تكن الشركة المنتجة تسوّق بنفسها مباشرة، ويُمنع التعامل نهائيًا مع شركات تُشكِّل فقط دون إنتاج أي مادة فعالة.</span></div>
    </div>

    <div class="guide-group">
      <h3>📄 شروط الحصول على ترخيص محل تداول المواد الزراعية</h3>
      <div class="guide-item">
        <b>الشروط الأساسية بمقدم الطلب</b>
        <span class="gi-treat">حائز شهادة ثانوية على الأقل (كحد أدنى) · مسجّل بالسجل التجاري وغرفة التجارة · تعيين مدير فني مهندس زراعي منتسب للنقابة (يُعفى من هذا الشرط إن كان صاحب الترخيص نفسه مهندسًا زراعيًا منتسبًا)</span>
      </div>
      <div class="guide-item">
        <b>الأوراق الثبوتية المطلوبة ضمن المصنّف</b>
        <span class="gi-treat">استمارة ترخيص زراعي رسمية · سند ملكية أو عقد إيجار مصدّق ساري لمدة سنتين على الأقل · سجل تجاري · شهادة تسجيل تاجر من غرفة التجارة · وثيقة قيد السجل المدني أو صورة هوية · وثيقة "غير محكوم" من السجل العدلي · وثيقة تثبت عدم كون صاحب الطلب عاملًا بالدولة · وثيقة انتساب لنقابة المهندسين الزراعيين من فرع المحافظة</span>
      </div>
    </div>

    <div class="guide-group">
      <h3>🏬 الشروط الواجب توفرها في المستودع</h3>
      <div class="guide-item"><span class="gi-treat">تزويده بأجهزة تهوية جيدة · تزويده بأجهزة إطفاء حريق ومصدر مياه قريب · إبعاده عن أقرب تجمع سكني بمسافة لا تقل عن 800 متر (لا ينطبق على مستودعات معامل الإنتاج داخل المنشأة نفسها) · إبعاده عن المياه السطحية (أنهار، بحيرات، بحار) بمسافة لا تقل عن 800 متر · رفع المواد المخزّنة عن الأرض بمواد عازلة سماكتها 10 سم على الأقل · إتاحة حركة سهلة لأجهزة الإطفاء حول المستودع</span></div>
    </div>

    <div class="guide-group">
      <h3>🏪 الشروط الواجب توفرها في محل التداول</h3>
      <div class="guide-item"><span class="gi-treat">مبني من الإسمنت · درجة حرارة مناسبة بعيدة عن أشعة الشمس المباشرة · براد لحفظ المستحضرات الحيوية والفرمونات · أجهزة إطفاء حريق ولوازم وقاية (قفازات، أقنعة غازية) · أرضية سهلة التنظيف غير ماصة للسوائل · منافذ تهوية كافية · ترتيب المستحضرات على رفوف وتصنيفها حسب سميتها لسهولة تمييزها · لافتات خطر وتحذير واضحة بخط كبير · مكان مخصص للمواد عالية السمية على مسؤولية صاحب المحل</span></div>
    </div>

    <div class="guide-group">
      <h3>👷 شروط ومهام المدير الفني</h3>
      <div class="guide-item">
        <b>الشروط</b>
        <span class="gi-treat">مهندس زراعي متفرغ تفرغًا كاملًا (لا يحق أن يكون مديرًا فنيًا لأكثر من جهة واحدة) · منتسب لنقابة المهندسين الزراعيين · من غير العاملين بالدولة</span>
      </div>
      <div class="guide-item">
        <b>المهام</b>
        <span class="gi-treat">مسؤول عن صحة المعلومات الفنية والتقنية والبيئية للمواد · الإشراف الفني على التخزين الصحيح والآمن في الأماكن المخصصة</span>
      </div>
    </div>

    <div class="guide-group">
      <h3>🧪 التصنيف الكيميائي الكامل للمبيدات</h3>
      <div class="guide-item"><b>1. المبيدات غير العضوية</b><span class="gi-treat">مركبات الزرنيخ والفلور والكبريت والفوسفور: زرنيخات الرصاص، زرنيخات الكالسيوم، زرنيخات النحاس، زرنيخات الصوديوم، زرنيخات المغنيسيوم، زرنيخات الزنك، فلوريد الصوديوم، فلوسيليكات الباريوم، فلوسيليكات الصوديوم، فلوألومينات الصوديوم، فوسفيد الزنك، مسحوق الكبريت، الكبريت الميكروني، الكبريت القابل للبلل.</span></div>
      <div class="guide-item"><b>2. الزيوت</b><span class="gi-treat">زيت الفولك، زيت التربونا، زيت الألبوليوم، زيت إسو، زيت السويس، والزيوت المخلوطة.</span></div>
      <div class="guide-item"><b>3. الغازات والأدخنة</b><span class="gi-treat">غاز بروميد الميثيل (CH₃Br)، غاز حامض الأيدروسيانيك (HCN)، غاز فوسفيد الأيدروجين (PH₃).</span></div>
      <div class="guide-item"><b>4. المبيدات الحشرية من أصل نباتي</b><span class="gi-treat">النيكوتين، البيرثرين، الروتينون، الريانيا، النيماتاودا.</span></div>
      <div class="guide-item"><b>5. مركبات الكلور العضوية</b><span class="gi-treat">D.D.T ومشابهاته، سادس كلوريد البنزين (الليندين)، توكسافين، الكلوردين، الهبتاكلور، الألدرين، الديالدرين، الإندرين، الثيمول.</span></div>
      <div class="guide-item"><b>6. مركبات الفوسفور العضوية</b><span class="gi-treat">الملاثيون، الباراثيون، ميثايل باراثيون، دورسبان، فوسفيل، أكتلك، ديبتركس، ليباسيد، جوزاثيون، سوبراسيد، جاردونا، ترايازوفوس.</span></div>
      <div class="guide-item"><b>7. المركبات الفوسفورية الجهازية</b><span class="gi-treat">ميتاسيستوكس، سيستوكس، ميتاإيزوسيستوكس، ديمكرون، إيكاتين، ثيمت، دايسيستون، ديمثويت، بدرين، فوليمات، سيولين، سيترولين، نوفاكرون، تمارون، أزودرين.</span></div>
      <div class="guide-item"><b>8. مركبات الكرباميت</b><span class="gi-treat">إسترات حمض الكرباميك؛ من أهمها: السيفين، لانيت، تنيك، زكتران، ميتاسيل، ميسورول، إتروفلان.</span></div>
      <div class="guide-item"><b>9. مركبات الكبريت العضوية</b><span class="gi-treat">تُستخدم أساسًا كمبيدات عناكب، مثل: التديون، الإريزيت.</span></div>
    </div>

    <div class="guide-group">
      <h3>📦 احتياطات تخزين المبيدات</h3>
      <div class="guide-item"><span class="gi-treat">لا تحتفظ بأي مبيد مخلوط بالماء لمدة طويلة لاستعماله لاحقًا · لا تستعمل أوعية الشراب وزجاجاته لتخزين المبيد · احفظ المبيد بمكان مظلل بعيدًا عن الأطفال · احتفظ بالعبوة الفارغة بعد الرش لمدة 15 يومًا؛ وإن حدثت أي حالة تسمم خذها للطبيب لأن مضادات التسمم تختلف من مبيد لآخر.</span></div>
    </div>

    <div class="guide-group">
      <h3>✅ احتياطات ما قبل استعمال المبيدات</h3>
      <div class="guide-item"><span class="gi-treat">اقرأ التعليمات المسجّلة على العبوة وتفهّمها جيدًا · تأكد من صلاحية المبيد · تأكد من فعاليته ضد الآفة المستهدفة تحديدًا · تأكد من الآثار المصاحبة للتسمم بالمبيد المستخدم · لا تستعمل المبيدات المنزلية للأشجار والنباتات، فقد يؤثر عليها الإيروسول المستخدم فيها.</span></div>
    </div>

    <div class="guide-group">
      <h3>⚠️ احتياطات أثناء استعمال المبيدات</h3>
      <div class="guide-item"><span class="gi-treat">تأكد من فترة الأمان (المدة المحرَّمة) قبل جني الثمار · لا تخلط المبيد بنسب أقوى من الموصى به على العبوة · لا ترش بالأيام المشمسة أو شديدة الحرارة، رُش عند الغروب أو العصر · رُش مع اتجاه الريح لا عكسه · البس المعاطف الواقية والقفازات والنظارات وكل ما يطلبه المصنّع · لا ترش وقت تفتح الأزهار وإطلاق حبوب اللقاح · استعمل مرشة جيدة تعمل بالضغط وتطلق رذاذًا ناعمًا · رُش والأوراق جافة بلا ندى · رُش بكمية وافرة تغطي كل الأوراق حتى التصبب · استعمل مرشة ذات قصبة طويلة أو سلمًا للأشجار العالية، وتجنب الرش وأنت جالس تحتها · لا تدخّن أثناء الرش.</span></div>
    </div>

    <div class="guide-group">
      <h3>🧼 احتياطات بعد استعمال المبيدات</h3>
      <div class="guide-item"><span class="gi-treat">لا تستعمل نفس المرشة لمبيد حشائش ثم مبيد حشري خوفًا من بقايا تؤثر على نباتات أخرى · اغسل أي بقعة تصيبك من المبيد فورًا · لا تستعمل أدوات المبيد لأي غرض آخر · لا تسمح للأطفال باللعب أو لمس النباتات المرشوشة حديثًا · اترك ملابس الرش بالشمس والهواء الطلق لمدة 20 يومًا على الأقل.</span></div>
    </div>

    <div class="guide-group">
      <h3>🩺 طرق دخول المادة السامة إلى الجسم</h3>
      <div class="guide-item"><b>الطريق الهضمي</b><span class="gi-treat">أسرع الطرق وأخطرها وأكثرها شيوعًا؛ يحدث غالبًا بتناول مواد نباتية معالجة حديثًا، أو ابتلاع السم خطأ على أنه طعام أو دواء (الأطفال معرّضون أكثر).</span></div>
      <div class="guide-item"><b>الطريق التنفسي</b><span class="gi-treat">المركبات الغازية تدخل مباشرة للرئتين عبر الأنف؛ بعض المركبات السائلة تتصاعد منها أبخرة خصوصًا بارتفاع الحرارة، فالضرر أكبر بالأوقات الحارة وساعات النهار.</span></div>
      <div class="guide-item"><b>الطريق الجلدي</b><span class="gi-treat">بعض المواد المنحلة بالدهن تنفذ عبر طبقات الجلد للدوران اللنفاوي والدموي، لذا المركبات السائلة أخطر من المسحوقة لسرعة تحللها بالشحوم الجلدية.</span></div>
    </div>

    <div class="guide-group">
      <h3>🚑 أعراض التسمم وعلاجه التفصيلي حسب كل مجموعة كيميائية</h3>
      <div class="guide-item"><b>المركبات الزرنيخية</b> (زرنيخ أبيض، أخضر باريس، زرنيخات الرصاص)
        <span class="gi-treat">الأعراض: آلام حنجرة، عطش، نبض ضعيف غير منتظم، تخرش الأغشية المخاطية للمعدة. العلاج: مادة مقيئة + كأس حليب، ويمكن إعطاء 15غ (بنصف كأس ماء فاتر) من خليط: فحم منشّط جزءان + أكسيد مغنيسيوم جزء + حامض تانيك جزء، أو غسل المعدة بـ240 سم³ من محلول بيكربونات الصوديوم 5% مخفف بلتر ماء فاتر مع 30غ كبريتات مغنيسيوم.</span>
      </div>
      <div class="guide-item"><b>المركبات الفلورية والفليوسيليكات</b> (فلورور الصوديوم، فلوسيليكات الصوديوم/الباريوم)
        <span class="gi-treat">الأعراض: تخرش الأنبوب الهضمي، آلام رأس، دوخة، احتقان الرئتين. العلاج: مادة مقيئة + حليب، وحقنة عضلية 10 سم³ من محلول جلوكونات الكالسيوم 10%، مع تنفس اصطناعي وأوكسجين ممزوج بـ5% ثاني أكسيد الكربون.</span>
      </div>
      <div class="guide-item"><b>المركبات الفوسفورية العضوية</b> (باراثيون، مالاثيون، ديازينون، ديبتركس، ليباسيد، ديمكرون)
        <span class="gi-treat">الآلية: توقف عمل خميرة الكولين أستريز فيتراكم الأستيل كولين ويزداد تنبيه الجهاز العصبي. الأعراض: تعرق، دوخة، قيء، اضطرابات رئوية، أوجاع رأس (تظهر بعد نصف ساعة). العلاج: سلفات الأتروبين + استفراغ بماء فاتر ومِلح + تنفس اصطناعي وأوكسجين.</span>
      </div>
      <div class="guide-item"><b>مركبات الفحوم الهيدروجينية الكلورية</b> (D.D.T، الجامكسان، الكلوردان، التوكسافين، الألدرين، الديدرين، الإندرين، الهبتاكلور، الثيودان)
        <span class="gi-treat">الآلية: تراكم بالأنسجة الدهنية وتخرش الكبد. الأعراض: رجفة، دوخة، اضطراب عصبي. العلاج: شاي وقهوة ساخنان مع 30غ ملح إنكليزي.</span>
      </div>
      <div class="guide-item"><b>المركبات الزئبقية</b> (ثاني كلور الزئبق، كلور الزئبق، السيريسان)
        <span class="gi-treat">الأعراض: التهاب الحنجرة، عطش شديد، نبض سريع، برودة الأطراف، التهاب الجهاز الهضمي. العلاج: حليب كمضاد أولي، وحقن وريدي 100-200 سم³ من محلول سلفوكسيلات الصوديوم والفورمالدهيد 5-10% محضّر حديثًا.</span>
      </div>
      <div class="guide-item"><b>مركبات الزنك</b> (فوسفيد الزنك)
        <span class="gi-treat">الأعراض تشبه التسمم الزرنيخي والزئبقي. العلاج: ملعقة صغيرة من فوسفات ثنائي الصوديوم مع ماء، يتبعها 15غ ملح طعام بكأس ماء فاتر، ثم شاي وقهوة.</span>
      </div>
      <div class="guide-item"><b>غاز بروميد الميثيل</b>
        <span class="gi-treat">الأعراض: دوخة، تعب، رغبة بالتقيؤ، آلام بطن (التهاب رئتين وقصبات). العلاج: إخراج فوري للهواء الطلق + تنفس اصطناعي + منبهات كالقهوة والشاي.</span>
      </div>
      <div class="guide-item"><span class="gi-treat">⚠️ ملاحظة مهمة: كل ما سبق إسعافات أولية مؤقتة ريثما يصل الطبيب فقط، ولا تغني إطلاقًا عن المراجعة الطبية الفورية في كل حالة تسمم.</span></div>
    </div>

    <div class="guide-group">
      <h3>📋 توصيات عامة لاستعمال ومزج المبيدات بأمان</h3>
      <div class="guide-item"><span class="gi-treat">استعمال السموم بالكميات المقترحة بدقة · المكافحة بالوقت المناسب فور ظهور أعراض الإصابة وقبل تفاقم الضرر · التأكد من نظافة المرش قبل الاستعمال · خلط المبيد بقليل ماء بوعاء خاص أولاً ثم إضافته للمرش والتأكد من مزجه جيدًا · الرش صباحًا باكرًا وقت هدوء الرياح ومع اتجاهها · عدم الرش على نبات مجهد مائيًا أو مروي حديثًا أو بعد مطر إلا بعد جفاف الأرض · التأكد من تغطية محلول الرش لكل أجزاء النبات · عدم وجود حيوانات (أبقار، أغنام، دجاج) بمنطقة المكافحة · غسل الخضار والفاكهة جيدًا ومرارًا قبل الأكل · عدم غسل أدوات المكافحة بالمياه الجارية أو السواقي أو رميها فيها · عدم غسلها بمراعٍ أو حقول ترتادها الحيوانات · دفن أوعية المبيدات الفارغة بحفرة عميقة بأرض غير منزرعة وردمها جيدًا · ألا يعمل عامل الرش أكثر من 6 ساعات يوميًا، ومراجعة الطبيب فورًا عند أي ألم أو دوخة · اصطحاب أقراص سلفات الأتروبين دائمًا أثناء العمل بالمبيدات.</span></div>
      <div class="guide-item"><b>🐝 حماية نحل العسل والحشرات النافعة</b><span class="gi-treat">تفضيل المبيدات غير الضارة بالنحل · مكافحة الآفات قبل الإزهار، صباحًا باكرًا أو عند الغروب وقت وجود النحل بخلاياه · تفضيل الرش على التعفير · إخطار النحالين المجاورين قبل يومين على الأقل من موعد المكافحة لإغلاق الخلايا.</span></div>
    </div>

    <div class="guide-group">
      <h3>⚗️ مزج المبيدات وتقسيمها — قواعد عملية</h3>
      <div class="guide-item"><b>قد يؤدي الخلط الخاطئ إلى</b><span class="gi-treat">نتيجة عكسية للمبيد، خسارة اقتصادية، عدم نجاح عملية الرش والمكافحة، وربما الإضرار الكامل بالمحصول.</span></div>
      <div class="guide-item"><b>قواعد يجب أن يحققها خلط المبيدات</b><span class="gi-treat">التوافق الكيميائي والتوافق الفيزيائي، مع مراعاة الترتيب الصحيح بالإضافة حسب نوع التركيب: 1) مسحوق قابل للبلل، 2) حبيبات قابلة للبلل أو الانتشار بالماء، 3) معلق مركز، 4) كبسولات معلقة، 5) مركز قابل للاستحلاب، 6) سائل قابل للذوبان.</span></div>
      <div class="guide-item"><b>كيف تُختبر قابلية خلط مبيدين قبل التطبيق الفعلي؟</b><span class="gi-treat">أنبوبة اختبار أو عبوة فارغة صغيرة، يوضع فيها 1 سم من كل مبيد سيتم خلطه، ثم يُلاحظ الخليط: أي حدوث فوران أو ترسيب أو طفو لأحد المبيدات يعني عدم إمكانية إتمام الخلط.</span></div>
      <div class="guide-item"><b>حالات ممنوع الخلط فيها (تحديدًا)</b><span class="gi-treat">مبيد يحتوي نحاسًا مع أي مبيدات أخرى · الكبريت مع أي مبيد (يُرش منفردًا) · المبيدات الفطرية مع الأسمدة الورقية · مبيدات العناكب مع أي مبيدات · الأحماض الأمينية والأسمدة الورقية غير المخلبية مع المبيدات · الأسمدة الورقية النحاسية مع المبيدات النحاسية · لا يُفضَّل خلط الأسمدة الورقية مع المبيدات وبالأخص الفطرية · المبيدات الحشرية مع الفطرية · المبيدات الفطرية مع الزيوت المعدنية · يُفضَّل عدم خلط المبيدات الفطرية ببعضها · عدم استخدام المبيدات النحاسية خلال موسم التزهير (تؤثر على حبوب اللقاح) · مراعاة عدم الرش عند ارتفاع درجات الحرارة · مراعاة استخدام المبيدات الوقائية والعلاجية بالمعدلات المنصوص عليها · عدم رش المبيد الواحد أكثر من مرتين متتاليتين (تلافيًا لظهور مقاومة) · عدم خلط المبيدات الفوسفورية العضوية الحساسة مع بعضها كي لا تتفكك المركبات الفوسفورية · عدم خلط المبيدات التي تحتوي فوسفور عضوي (البيربان، الملاثيون) مع أي مستحضر به مانكوزيب · عدم خلط أي مبيد حشري فوسفوري مع عجينة بوردو.</span></div>
      <div class="guide-item"><b>تصنيف المبيدات حسب طريقة الفعل</b><span class="gi-treat">مبيدات معدية/ملامسة: تمتصها النباتات وتنتقل عبر أنسجتها (جهازية لحائية أو جهازية خشبية)؛ لا تحتاج تغطية تامة للنبات، أقل تأثيرًا على الأعداء الحيوية، لكن أسعارها مرتفعة وضعف انتقالها من الأسفل للأعلى يخفّض كفاءتها بمكافحة آفات الجذور، وبعضها يتحول داخل النبات لمركبات أكثر سمية.</span></div>
      <div class="guide-item"><b>تصنيف المبيدات حسب الآفة المستهدفة</b><span class="gi-treat">المبيدات الحشرية، مبيدات الحشائش، المبيدات الفطرية، مبيدات النيماتودا، مبيدات القواقع، المبيدات الحيوية (بكتيريا Pseudomonas، فطر Beauveria bassiana، فيروس بولي هيدروزيس النووي لحشرات ورق القطن وبعض أنواع الذباب)، فرمونات تشويش الأزواج، الأزاديراكتين، زيت الكانولا لآفات نباتات الزينة، زيت الزعتر لآفات المن.</span></div>
      <div class="guide-item"><b>آليات فعل إضافية</b><span class="gi-treat">مانعات التغذية: تثبّط المستقبلات الحسية الكيميائية الخاصة بالتذوّق فتوقف الحشرة عن التغذي · المعقّمات الكيميائية: تخفض أو توقف القدرة التناسلية · هرمونات الشباب: تعتمد على وجود الهرمون بفترات معينة من حياة الحشرة، فاختفاؤه بفترة تحتاجه يسبب خللًا بتطورها · مثبطات تطور الحشرة ومثبطات تخليق الكيتين · المواد الطاردة (لمكافحة الحشرات والقوارض والطيور) · الجاذبات (الجنسية والغذائية).</span></div>
      <div class="guide-item"><b>عوامل تصنيف إضافية للمبيدات</b><span class="gi-treat">نوع الآفة المستهدفة · طريقة دخول المبيد لجسم الآفة أو طريقة تأثيره عليها · التركيب الكيميائي · طبيعة ونوع المستحضر · وقت الاستخدام (وقائي/علاجي) · طريقة الاستعمال أو التطبيق · أسلوب التطبيق أو الرش (تغطية عامة/جزئية) · سلوك المبيد (جهازي/غير جهازي) · موضع التطبيق · ميعاد التطبيق · الاختيارية أو الانتقالية للمبيد.</span></div>
      <div class="guide-item"><b>تصنيف حسب نوع المستحضر (الشكل التجاري)</b><span class="gi-treat">1) مستحضرات جافة: مساحيق تعفير (dp)، محببات (gr)، محببات دقيقة (mg). 2) مستحضرات الرش المتناهية الدقة (ulv). 3) مستحضرات تُمزج بالماء رشًا: حبيبات قابلة للبلل أو الانتشار (wg)، مركزات قابلة للاستحلاب (ec)، مساحيق قابلة للبلل (wp)، مركزات معلّقة (sc)، مساحيق قابلة للذوبان (sl)، مركزات قابلة للاستحلاب (sp). 4) مستحضرات للطعوم (B). 5) مستحضرات لمعاملة البذور (S). 6) مستحضرات للتبخير والتدخين (F). 7) مستحضرات متنوعة أخرى (M): لسوائل معالجة الحيوان (po)، والمستحضرات الشمعية (gs).</span></div>
      <div class="guide-item"><b>أهم المبيدات والمواد المسموحة بالزراعة العضوية</b>
        <span class="gi-treat">
        المبيدات النباتية — زيت النيم (Azadirachtin): يكافح الحشرات الماصة والمن. البيريثرين (Pyrethrins): مستخلص من زهور الأقحوان، يشلّ الحشرات. الروتينون (Rotenone): مستخلص نباتي.<br>
        المبيدات المعدنية — الكبريت (Sulfur): واسع الاستخدام ضد الأمراض الفطرية كالبياض الدقيقي. النحاس (Copper): مركبات وقائية بحدود سمية معينة لمقاومة الفطريات والبكتيريا. الزيوت المعدنية الشتوية/الصيفية: تخنق الحشرات والبيض.<br>
        المبيدات الحيوية (الميكروبية) — بكتيريا Bacillus thuringiensis (Bt): لمكافحة اليرقات والديدان. الفطريات النافعة Trichoderma: لعلاج أعفان الجذور. الفيروسات مثل NPV: لمكافحة دودة ثمار العنب.<br>
        مواد طبيعية أخرى — بيكربونات الصوديوم/البوتاسيوم: لمكافحة البياض الدقيقي. الصابون البوتاسي: يقضي على الحشرات الصغيرة كالبق والمن (يُصنع من خليط زيت الزيتون وهيدروكسيد البوتاسيوم).
        </span>
      </div>
      <div class="guide-item"><b>مبيدات جاهزة مسجّلة عالميًا (أمثلة)</b><span class="gi-treat">أزافيت (إسبانيا): مركب من الأزاديراكتين مشتق من نبات النيم. زيت البرتقال: يقتل العث والآفات ومسببات الأمراض الفطرية. فليبير: أحماض كربوكسيلية من زيت الزيتون تقتل حشرات الأجسام الرخوة كالمن. زيت الزعتر: يكافح المن ويقاوم بعض الأمراض الفطرية. لوفيل (فرنسا): يحتوي على البارافين ويغطي الآفة والعث بطبقة تخنقها. الكاولين: مادة طينية تشكّل حاجزًا ماديًا يمنع تغذي الحشرات وتصدّها. الشيتوزان: مشتق من الكيتين، مضاد للفطريات المسببة للأمراض. الدياتومية: بقايا كائنات مائية متحجرة، تمتص الدهون من جلد الحشرات فتموت جفافًا (شائعة لمنع إصابة المحاصيل المخزّنة بالسوس والخنافس).</span></div>
    </div>

    <div class="guide-group">
      <h3>⚠️ تصنيف سمية المبيدات (منظمة الصحة العالمية / الأغذية والزراعة)</h3>
      <table class="guide-table">
        <tr><th>الفئة</th><th>لون البطاقة</th><th>العلامة</th><th>درجة السمية</th></tr>
        <tr><td>Ia</td><td>حمراء</td><td>جمجمة وعظمتين</td><td>شديدة السمية</td></tr>
        <tr><td>Ib</td><td>حمراء</td><td>جمجمة وعظمتين</td><td>سام جدًا</td></tr>
        <tr><td>II</td><td>صفراء</td><td>علامة X</td><td>ضار</td></tr>
        <tr><td>III</td><td>زرقاء</td><td>علامة X</td><td>تحذير</td></tr>
        <tr><td>U</td><td>خضراء</td><td>علامة X</td><td>تحذير خفيف</td></tr>
      </table>
      <div class="guide-item" style="margin-top:8px;">
        <b>جرعة LD50 القاتلة النصفية (تقريبية) لكل فئة</b>
        <span class="gi-treat">Ia: أقل من 5 مجم/كغ (صلبة) أو 0-20 مجم/كغ (سائلة). Ib: 5-50 مجم/كغ (صلبة) أو 20-200 مجم/كغ (سائلة). II: 50-500 مجم/كغ (صلبة) أو 200-2000 مجم/كغ (سائلة). III: 500-2000 مجم/كغ (صلبة) أو 2000-3000 مجم/كغ (سائلة). U: أكثر من 2000-5000 مجم/كغ أو أكثر.</span>
      </div>
      <div class="guide-item">
        <b>تصنيف آخر (وكالة حماية البيئة الأمريكية EPA)</b>
        <span class="gi-treat">4 فئات سمية؛ الفئات 1-3 تتطلب إلزاميًا كلمة تحذير على الملصق ("خطر-سم" للفئة الأولى، "تحذير" للثانية والثالثة)، بينما الفئة الرابعة غير سامة عمليًا.</span>
      </div>
      <div class="guide-item">
        <b>حدود الأمان والأثر المتبقي</b>
        <span class="gi-treat">حدود الأمان: أقصى كمية مسموح بها من متبقيات المبيد بالغذاء بما يضمن الاستهلاك اليومي الآمن. الأثر المتبقي: ما يتبقى فعليًا من المبيد داخل أو على المنتجات الزراعية، ويُعبَّر عنه بالجزء من مليون (ملغ/كغ).</span>
      </div>
      <div class="guide-item">
        <b>أضرار الاستخدام الخاطئ على البيئة والإنسان</b>
        <span class="gi-treat">ظهور آفات مقاومة تستوجب تصنيع مبيدات جديدة أقوى · القضاء على الأعداء الحيوية النافعة والإضرار بالنحل · ارتفاع معدل تكاثر بعض الآفات نتيجة تأثير المبيدات على البيوكيميائية النباتية · تلوث الهواء (رش المبيدات يمثّل نحو 6% من إجمالي مستويات الأوزون بالتروبوسفير) · تلوث المياه السطحية (دراسة أمريكية وجدت تلوث أكثر من 90% من الآبار المفحوصة) · تلوث التربة وتدهور الكائنات الدقيقة المكوّنة لخصوبتها.</span>
      </div>
    </div>
  `;
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
