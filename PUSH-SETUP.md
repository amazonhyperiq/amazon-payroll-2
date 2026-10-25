# Amazon Advances — Web Push

الملفات هنا مدمجة مع نسخة نظام السلف الحالية، مع الحفاظ على تسجيل الدخول والصلاحيات والتقارير.

## مهم قبل النشر

`app.js` يحتوي على مفتاح VAPID Public الصحيح. لا تضع مفتاح VAPID Private داخل GitHub أو داخل `app.js`.

لا تضع `VAPID_PRIVATE_KEY` في GitHub أو داخل `app.js`.

## ما تم دمجه

- Service Worker للإشعارات والعمل عند إغلاق الموقع.
- PWA manifest وأيقونات الهاتف.
- تسجيل Push Subscription في `advance_push_subscriptions` عبر `save_advance_push_subscription`.
- إشعار إضافة السلفة يتم إنشاءه من التطبيق ثم استدعاء Edge Function لإرسال الإشعار إلى الاشتراكات المسجلة.
- ملخص مجموع السلف لكل موظف يظهر على الهاتف فقط ولا يظهر في تقرير الكمبيوتر/الطباعة.
- الحفاظ على نظام المدير والمانحين الحالي.

## شرط الخادم

Edge Function `send-push-notifications` يجب أن يبقى منشورًا ويقبل الاستدعاء من التطبيق. عند إضافة سلفة، التطبيق ينشئ حدثًا في `advance_push_events` ثم يستدعي الوظيفة لإرسال الإشعارات.
