function initSalesSeriesReport() {
    const reportContainer = document.getElementById('main-content');
    if (!reportContainer) return;

    const salaToken = localStorage.getItem("salla_access_token");
    if (!salaToken) {
        reportContainer.innerHTML = `<p class="text-center text-red-500 p-10">خطأ: التوكن غير موجود.</p>`;
        return;
    }
    const token = "Bearer " + salaToken;
    let timeChart;
    
    const COUNTRY_CODES = { "السعودية": "SA", "الامارات": "AE", "البحرين": "BH", "عمان": "OM", "قطر": "QA" };
    const ALLOWED_COUNTRY_CODES = Object.values(COUNTRY_CODES);

    function toISODate(d) { return new Date(d).toISOString().split('T')[0]; }
    function formatMoney(num) { 
        return new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num || 0);
    }

    async function fetchAllOrders(startDate, endDate) {
        let page = 1, allOrders = [], hasMore = true;
        while (hasMore) {
            const url = `https://api.salla.dev/admin/v2/orders?created_at_min=${startDate}&created_at_max=${endDate}&page=${page}&per_page=50`;
            const res = await fetch(url, { headers: { Authorization: token, Accept: "application/json" } });
            if (res.status === 401) throw new Error("Unauthorized");
            const data = await res.json();
            if (data?.data?.length) {
                allOrders = allOrders.concat(data.data);
                page++;
                hasMore = data.pagination && page <= data.pagination.totalPages;
            } else { hasMore = false; }
        }
        return allOrders;
    }

    async function generateReport() {
        // ... (This function remains the same as the previous correct version)
        const tbody = reportContainer.querySelector("#reportBody");
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5">جاري تحميل البيانات...</td></tr>`;
        try {
            const start = reportContainer.querySelector("#sales-series-startDate").value;
            const end = reportContainer.querySelector("#sales-series-endDate").value;
            const interval = reportContainer.querySelector("#sales-series-interval").value;
            const selectedCountry = reportContainer.querySelector("#sales-series-countryFilter").value;
            const orders = await fetchAllOrders(start, end);
            const summary = {};
            let totals = { executed: 0, delivering: 0, delivered: 0, cancelled: 0 };
            const saudiCities = ["الرياض", "جدة", "مكة", "الدمام", "الخبر", "المدينة", "تبوك", "أبها", "حائل", "بريدة"];
            for (const order of orders) {
                let country = order.shipping?.address?.country || "";
                const city = order.shipping?.address?.city || "";
                if (!country && city) { country = saudiCities.some(c => city.includes(c)) ? "السعودية" : "غير معروف"; } 
                else if (!country) { country = "غير معروف"; }
                if (selectedCountry !== "all" && country !== selectedCountry) continue;
                const dateStr = order.date.date.split(" ")[0];
                const d = new Date(dateStr);
                let periodKey = "";
                if (interval === "daily") periodKey = dateStr;
                else if (interval === "weekly") {
                    const weekStart = new Date(d);
                    weekStart.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
                    periodKey = toISODate(weekStart);
                } else { periodKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`; }
                if (!summary[periodKey]) summary[periodKey] = { executed: 0, delivering: 0, delivered: 0, cancelled: 0 };
                const amount = order.total?.amount || 0;
                const statusName = order.status?.name || "";
                if (statusName === "تم التنفيذ") { summary[periodKey].executed += amount; totals.executed += amount; }
                else if (statusName === "جاري التوصيل") { summary[periodKey].delivering += amount; totals.delivering += amount; }
                else if (statusName === "تم التوصيل") { summary[periodKey].delivered += amount; totals.delivered += amount; }
                else if (statusName === "ملغي") { summary[periodKey].cancelled += amount; totals.cancelled += amount; }
            }
            if (Object.keys(summary).length === 0) {
                 tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5">لا توجد بيانات تطابق الفلاتر المحددة.</td></tr>`;
                 reportContainer.querySelector("#chartBlock").style.display = 'none';
                 return;
            }
            const totalSales = totals.executed + totals.delivering + totals.delivered;
            tbody.innerHTML = `<tr class="bg-gray-100 dark:bg-gray-700 font-bold"><td class="px-6 py-3">الإجمالي</td><td class="px-6 py-3">${formatMoney(totalSales)}</td><td class="px-6 py-3">${formatMoney(totals.executed)}</td><td class="px-6 py-3">${formatMoney(totals.delivering)}</td><td class="px-6 py-3">${formatMoney(totals.delivered)}</td><td class="px-6 py-3">${formatMoney(totals.cancelled)}</td></tr>`;
            Object.keys(summary).sort().forEach(period => {
                const s = summary[period];
                const total = s.executed + s.delivering + s.delivered;
                tbody.innerHTML += `<tr><td class="px-6 py-4">${period}</td><td class="px-6 py-4">${formatMoney(total)}</td><td class="px-6 py-4">${formatMoney(s.executed)}</td><td class="px-6 py-4">${formatMoney(s.delivering)}</td><td class="px-6 py-4">${formatMoney(s.delivered)}</td><td class="px-6 py-4">${formatMoney(s.cancelled)}</td></tr>`;
            });
            renderChart(summary);
        } catch (error) {
            console.error("Error generating report:", error);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5 text-red-500">${error.message === "Unauthorized" ? "خطأ في المصادقة." : "حدث خطأ."}</td></tr>`;
        }
    }
    
     function renderChart(summary) {
        if(timeChart) timeChart.destroy();
        
        const chartBlock = reportContainer.querySelector("#chartBlock");
        const ctx = reportContainer.querySelector("#timeChart")?.getContext("2d");
        if (!ctx || !chartBlock) return;
        
        // ==> السطر الجديد الذي تم إضافته لإظهار الحاوية <==
        chartBlock.style.display = 'block';

        const labels = Object.keys(summary).sort();
        const datasets = [
            { label: "إجمالي المبيعات", data: labels.map(k => summary[k].executed + summary[k].delivering + summary[k].delivered), backgroundColor: "#2E86C1" },
            { label: "تم التوصيل", data: labels.map(k => summary[k].delivered), backgroundColor: "#28B463" },
            { label: "تم التنفيذ", data: labels.map(k => summary[k].executed), backgroundColor: "#AF7AC5" },
            { label: "جاري التوصيل", data: labels.map(k => summary[k].delivering), backgroundColor: "#F1C40F" },
            { label: "ملغي", data: labels.map(k => summary[k].cancelled), backgroundColor: "#E74C3C" },
        ];
        
        timeChart = new Chart(ctx, {
            type: 'bar', 
            data: { labels, datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
        });
    }
    function toggleCharts() {
        const chartBlock = reportContainer.querySelector("#chartBlock");
        if(chartBlock) chartBlock.style.display = chartBlock.style.display === 'none' ? 'block' : 'none';
    }

    // ---== دالة تحميل CSV (النسخة الكاملة) ==---
    function downloadCSV() {
        const table = reportContainer.querySelector("#reportTable");
        if (!table) return alert("لم يتم العثور على عنصر الجدول.");

        const headers = Array.from(table.querySelectorAll("thead th")).map(th => `"${th.innerText.trim()}"`).join(",");
        
        const rows = Array.from(table.querySelectorAll("tbody tr")).map(tr => 
            Array.from(tr.querySelectorAll("td")).map(td => `"${td.innerText.trim()}"`).join(",")
        );

        if (rows.length === 0 || (rows[0] && rows[0].includes("الرجاء تحديد الفلاتر"))) {
            alert("لا توجد بيانات لتحميلها. يرجى توليد التقرير أولاً.");
            return;
        }

        const csvContent = "\uFEFF" + [headers, ...rows].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "تقرير_سلسلة_المبيعات.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ---== دالة تحميل PDF (النسخة الكاملة) ==---
    async function downloadPDF() {
        const reportWrapper = reportContainer.querySelector("#reportWrapper");
        if (!reportWrapper) {
            alert("لم يتم العثور على عنصر التقرير.");
            return;
        }
        
        const hasRows = reportContainer.querySelectorAll("#reportBody tr").length > 0 && 
                        !reportContainer.querySelector("#reportBody tr td[colspan='6']");
        if (!hasRows) {
            alert("لا توجد بيانات لتصديرها إلى PDF.");
            return;
        }
        
        // تعطيل مؤقت لحركة الرسم البياني لضمان التقاط الصورة بشكل صحيح
        const originalAnimation = Chart.defaults.animation;
        Chart.defaults.animation = false;

        try {
            const canvas = await html2canvas(reportWrapper, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: document.body.classList.contains('dark-mode') ? '#1f2937' : '#ffffff' 
            });

            // إعادة تفعيل حركة الرسم البياني بعد التقاط الصورة
            Chart.defaults.animation = originalAnimation;

            const imgData = canvas.toDataURL("image/png");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: "l", unit: "pt", format: "a4" });

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 20;
            const imgW = pageW - margin * 2;
            const ratio = imgW / canvas.width;
            const imgH = canvas.height * ratio;
            const pageContentH = pageH - margin * 2;

            if (imgH <= pageContentH) {
                doc.addImage(imgData, "PNG", margin, margin, imgW, imgH);
            } else { // التعامل مع المحتوى الطويل الذي يحتاج لأكثر من صفحة
                let position = 0;
                while (position < imgH) {
                    doc.addImage(imgData, 'PNG', margin, margin - position, imgW, imgH);
                    position += pageContentH;
                    if (position < imgH) {
                        doc.addPage();
                    }
                }
            }
            doc.save("تقرير_سلسلة_المبيعات.pdf");
        } catch (err) {
            // التأكد من إعادة تفعيل الحركة حتى في حالة حدوث خطأ
            Chart.defaults.animation = originalAnimation;
            console.error("PDF generation error:", err);
            alert("حدث خطأ أثناء إنشاء ملف PDF.");
        }
    }

    // --- ربط الأحداث ---
    reportContainer.querySelector('#sales-series-generate-report-btn')?.addEventListener('click', generateReport);
    reportContainer.querySelector('#sales-series-toggle-charts-btn')?.addEventListener('click', toggleCharts);
    reportContainer.querySelector('#sales-series-download-csv-btn')?.addEventListener('click', downloadCSV);
    reportContainer.querySelector('#sales-series-download-pdf-btn')?.addEventListener('click', downloadPDF);

    // ... (بقية الكود الخاص بإعداد التواريخ الافتراضية)
    const startInp = reportContainer.querySelector("#sales-series-startDate");
    const endInp = reportContainer.querySelector("#sales-series-endDate");
    if (startInp && endInp) {
        const today = new Date();
        endInp.value = toISODate(today);
        const lastYear = new Date();
        lastYear.setFullYear(today.getFullYear() - 1);
        startInp.value = toISODate(lastYear);
    }
}