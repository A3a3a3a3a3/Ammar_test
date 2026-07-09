// Service Worker بسيط — الغرض الأساسي منه هو تحقيق شرط "قابلية التثبيت" (installability)
// الذي تطلبه المتصفحات (Chrome على أندرويد) قبل السماح بزر تثبيت مخصص داخل الصفحة.
// لا يقوم بتخزين مؤقت (cache) للبيانات كي لا تظهر نسخة قديمة من التطبيق بعد أي تحديث.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
