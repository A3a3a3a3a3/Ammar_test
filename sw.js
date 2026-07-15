// Service Worker — يحقق شرط "قابلية التثبيت" (installability) بالمتصفحات،
// ويخزّن فعليًا ملفات هيكل الموقع (HTML/JS/الصورة) بأسلوب stale-while-revalidate:
// يعرض النسخة المخزّنة فورًا (سريع، ويعمل حتى بدون إنترنت)، وبنفس الوقت يجلب
// نسخة محدّثة بالخلفية ويستبدلها بالكاش لزيارة لاحقة. رقم النسخة CACHE_NAME
// يُستخدم لتفريغ أي كاش قديم تلقائيًا بعد كل تحديث حقيقي للملفات.

const CACHE_NAME = 'crop-clinic-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './splash-engineers.jpg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .catch(()=>{}) // لا نمنع التثبيت حتى لو فشل تخزين ملف واحد (مثلاً أول تشغيل بدون إنترنت)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return; // لا نتدخل بأي طلب غير GET (حفظًا لسلامة عمليات المصادقة والكتابة)

  let url;
  try{ url = new URL(req.url); }catch(e){ return; }
  // نترك أي نطاق خارجي (Firebase Auth/Firestore، خطوط Google، مكتبات jsPDF/html2canvas) بدون تدخل،
  // كي لا نتعارض مع SDKs لها آليات اتصال وتوثيق خاصة بها.
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then((res) => {
        if(res && res.status === 200){ cache.put(req, res.clone()); }
        return res;
      }).catch(() => cached); // فشل الشبكة → ارجع للنسخة المخزّنة إن وجدت
      // النسخة المخزّنة تُعرض فورًا إن وجدت (لأداء أسرع وعمل بدون إنترنت)،
      // مع تحديثها بالخلفية دائمًا لزيارة لاحقة
      return cached || networkFetch;
    })
  );
});
