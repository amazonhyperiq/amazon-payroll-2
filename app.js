/* =========================================================
   Amazon Advances & Payroll System - Core Application Script
   Supabase Data Sync & Reliable PDF Engine
   ========================================================= */

// 1. التنقل بين الأقسام (Dynamic SPA Navigation)
function switchView(viewId) {
  // إخفاء جميع الأقسام
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));

  // إلغاء تفعيل عناصر القائمة الجانبية
  const menuItems = document.querySelectorAll('.sidebar-menu li');
  menuItems.forEach(item => item.classList.remove('active'));

  // تفعيل القسم المطلوب
  const targetSection = document.getElementById(viewId);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  // تفعيل عنصر القائمة المظاهرة
  if (event && event.currentTarget) {
    const parentLi = event.currentTarget.closest('li');
    if (parentLi) parentLi.classList.add('active');
  }

  // إعادة تحميل وإفراز بيانات القسم المفتوح
  refreshSectionData(viewId);
}

// 2. تحديث بيانات القسم عند الفتح
function refreshSectionData(viewId) {
  console.log("تم فتح القسم:", viewId);
  if (viewId === 'dashboard') {
    calculateSummaryStats();
  }
}

// 3. حساب وتحديث المؤشرات الإحصائية أعلى لوحة التحكم
function calculateSummaryStats() {
  // يمكن الربط مباشرة بقاعدة بيانات Supabase هنا
  const totalEmployees = document.getElementById('totalEmployeesCount');
  const totalAdvances = document.getElementById('totalAdvancesCount');
  const totalPayroll = document.getElementById('totalPayrollCount');

  if (totalEmployees) totalEmployees.innerText = "61";
  if (totalAdvances) totalAdvances.innerText = "12,450,000 د.ع";
  if (totalPayroll) totalPayroll.innerText = "38,600,000 د.ع";
}

// 4. محرك تصدير الـ PDF المحترف والداعم للغة العربية
function exportPayrollPDF() {
  const element = document.getElementById('pdfReportArea');
  
  if (!element) {
    alert("عذراً، لم يتم العثور على منطقة التقرير للطباعة!");
    return;
  }

  // خيارات تصدير الـ PDF المتقدمة لمنع مشاكل التقطيع والترميز
  const opt = {
    margin:       [10, 10, 10, 10], // [أعلى, يمين, أسفل, يسار]
    filename:     `كشف_رواتب_أمازون_${new Date().toISOString().slice(0,10)}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      logging: false,
      letterRendering: true
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // تنفيذ التصدير المباشر
  html2pdf().set(opt).from(element).save().then(() => {
    console.log("تم تصدير ملف الـ PDF بنجاح!");
  }).catch(err => {
    console.error("خطأ أثناء تصدير الـ PDF:", err);
    // طريقة احتياطية في حال تعثر المكتبة
    window.print();
  });
}

// 5. تهيئة التطبيق عند اكتمال التحميل
document.addEventListener('DOMContentLoaded', () => {
  console.log("نظام إدارة رواتب وسلف أمازون يعمل بنجاح.");
  calculateSummaryStats();
});
