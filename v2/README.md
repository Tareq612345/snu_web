# Suez National University Portals V2

نسخة جديدة مستقلة مبنية بـ React + Vite + Supabase، وتفصل بوابة الطالب عن بوابة عضو هيئة التدريس.

## الشعار
ضع صورة شعار الجامعة هنا بالاسم التالي فقط:

`v2/public/snu-logo.png`

يفضل PNG بخلفية شفافة وأبعاد مربعة لا تقل عن 512×512.

## Supabase
1. أنشئ مشروع Supabase.
2. نفّذ `supabase/migrations/001_initial_schema.sql` من SQL Editor.
3. انسخ `.env.example` إلى `.env` وأضف Project URL وAnon Key.
4. في Netlify أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`.

## التشغيل
```bash
npm install
npm run dev
npm run build
```
