function initGeographicalOrdersReport() {
    const reportContainer = document.getElementById('main-content');
    if (!reportContainer) return;

    var salaToken = localStorage.getItem("salla_access_token");
    if (!salaToken) {
        reportContainer.innerHTML = `<p class="text-center text-red-500 p-10">خطأ: لم يتم العثور على توكن سلة. يرجى تسجيل الدخول مرة أخرى.</p>`;
        return;
    }
    const token = "Bearer " + salaToken;
    
    let chartOverall, chartDeliveredByCountry;

    async function fetchAll(endpoint) {
        let page = 1, all = [], hasMore = true;
        while (hasMore) {
            const res = await fetch(`${endpoint}?page=${page}&per_page=50`, {
                headers: { Authorization: token, Accept: "application/json" },
            });
            // Handle potential authorization error
            if (res.status === 401) {
                throw new Error("Unauthorized");
            }
            const data = await res.json();
            if (data?.data?.length) {
                all = all.concat(data.data);
                page++;
                hasMore = data.pagination && page <= data.pagination.totalPages;
            } else {
                hasMore = false;
            }
        }
        return all;
    }

    function toISODate(d) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    async function generateReport() {
        const start = reportContainer.querySelector("#startDate").value;
        const end = reportContainer.querySelector("#endDate").value;
        const carrier = reportContainer.querySelector("#carrier").value;
        const tbody = reportContainer.querySelector("#reportBody");

        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5">جاري تحميل وعرض البيانات...</td></tr>`;

        try {
            const [orders, shipments] = await Promise.all([
                fetchAll("https://api.salla.dev/admin/v2/orders"),
                fetchAll("https://api.salla.dev/admin/v2/shipments"),
            ]);

            const summary = {};
            let totals = { total: 0, executed: 0, delivered: 0, delivering: 0, cancelled: 0 };
            const allowedStatuses = ["جاري التوصيل", "تم التنفيذ", "تم التوصيل", "ملغي"];

            shipments.forEach((sh) => {
                if (carrier !== "all" && (!sh.courier_name || !sh.courier_name.includes(carrier))) return;
                const order = orders.find((o) => o.id === sh.order_id);
                if (!order || !allowedStatuses.includes(order.status?.name)) return;
                const dateStr = order.date?.date?.split(" ")[0];
                if (!dateStr || dateStr < start || dateStr > end) return;
                const country = sh.ship_to?.country || "غير معروف";
                if (!summary[country]) {
                    summary[country] = { total: 0, executed: 0, delivered: 0, delivering: 0, cancelled: 0 };
                }
                switch (order.status?.name) {
                    case "تم التنفيذ": summary[country].executed++; totals.executed++; summary[country].total++; totals.total++; break;
                    case "تم التوصيل": summary[country].delivered++; totals.delivered++; summary[country].total++; totals.total++; break;
                    case "جاري التوصيل": summary[country].delivering++; totals.delivering++; summary[country].total++; totals.total++; break;
                    case "ملغي": summary[country].cancelled++; totals.cancelled++; break;
                }
            });

            if (Object.keys(summary).length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5">لا توجد بيانات تطابق شروط البحث.</td></tr>`;
                 reportContainer.querySelector("#chartsContainer").style.display = "none";
                return;
            }

            let tableHTML = `<tr class="bg-gray-100 dark:bg-gray-700 font-bold"><td class="px-6 py-3">0</td><td class="px-6 py-3">الإجمالي</td><td class="px-6 py-3">${totals.total}</td><td class="px-6 py-3">${totals.executed}</td><td class="px-6 py-3">${totals.delivered}</td><td class="px-6 py-3">${totals.delivering}</td><td class="px-6 py-3">${totals.cancelled}</td></tr>`;
            let index = 1;
            Object.keys(summary).sort().forEach((country) => {
                const s = summary[country];
                tableHTML += `<tr><td class="px-6 py-4">${index++}</td><td class="px-6 py-4">${country}</td><td class="px-6 py-4">${s.total}</td><td class="px-6 py-4">${s.executed}</td><td class="px-6 py-4">${s.delivered}</td><td class="px-6 py-4">${s.delivering}</td><td class="px-6 py-4">${s.cancelled}</td></tr>`;
            });
            tbody.innerHTML = tableHTML;
            
            reportContainer.querySelector("#chartsContainer").style.display = "grid";
            renderCharts(summary, totals);
        } catch(error) {
            if (error.message === "Unauthorized") {
                 tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5 text-red-500">خطأ في المصادقة: التوكن غير صالح أو انتهت صلاحيته. يرجى تسجيل الخروج والدخول مرة أخرى.</td></tr>`;
            } else {
                 tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5 text-red-500">حدث خطأ أثناء جلب البيانات.</td></tr>`;
            }
            console.error("API Fetch Error:", error);
        }
    }

    function renderCharts(summary, totals) {
        if(chartOverall) chartOverall.destroy();
        if(chartDeliveredByCountry) chartDeliveredByCountry.destroy();
        
        const ctxOverall = reportContainer.querySelector("#chartOverall")?.getContext("2d");
        if(ctxOverall) {
            chartOverall = new Chart(ctxOverall, { type: "pie", data: { labels: ["تم التنفيذ", "تم التوصيل", "جاري التوصيل", "ملغي"], datasets: [{ data: [totals.executed, totals.delivered, totals.delivering, totals.cancelled] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
        }
        
        const countries = Object.keys(summary).sort();
        const deliveredByCountry = countries.map((c) => summary[c].delivered);
        const ctxDelivered = reportContainer.querySelector("#chartDeliveredByCountry")?.getContext("2d");
        if(ctxDelivered) {
            chartDeliveredByCountry = new Chart(ctxDelivered, { type: "pie", data: { labels: countries, datasets: [{ data: deliveredByCountry }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
        }
    }
    
   function downloadCSV() {
        const headers = Array.from(
            reportContainer.querySelectorAll("#reportTable thead th") // البحث داخل الحاوية
        ).map((th) => th.innerText.trim());
        
        const rows = Array.from(
            reportContainer.querySelectorAll("#reportBody tr") // البحث داخل الحاوية
        ).map((tr) =>
            Array.from(tr.querySelectorAll("td")).map((td) => {
                const input = td.querySelector("input");
                return input ? input.value.trim() : td.innerText.trim();
            })
        );

        if(rows.length === 0 || (rows.length === 1 && rows[0].length === 1)) {
            alert("لا توجد بيانات لتحميلها.");
            return;
        }

        const esc = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        const csv = "\uFEFF" + [headers.map(esc).join(",")]
            .concat(rows.map((r) => r.map(esc).join(",")))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "تقرير_الطلبات_الجغرافية.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
async function downloadPDF() {
        // تم تغيير هذا السطر ليحدد الحاوية الجديدة الشاملة
        const contentToCapture = reportContainer.querySelector("#pdf-export-area"); 
        
        if (!contentToCapture) {
            alert("لم يتم العثور على عنصر التقرير.");
            return;
        }
        
        const hasRows = reportContainer.querySelectorAll("#reportBody tr").length > 0 && 
                        !reportContainer.querySelector("#reportBody tr td[colspan='7']");

        if (!hasRows) {
            alert("لا توجد بيانات لتصديرها إلى PDF.");
            return;
        }

        const originalAnimation = Chart.defaults.animation;
        Chart.defaults.animation = false;

        try {
            const canvas = await html2canvas(contentToCapture, { // نستخدم المتغير الجديد هنا
                scale: 2, 
                useCORS: true, 
                backgroundColor: document.body.classList.contains('dark-mode') ? '#1f2937' : '#ffffff' 
            });

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
            } else {
                let position = 0;
                while (position < imgH) {
                    doc.addImage(imgData, 'PNG', margin, margin - position, imgW, imgH);
                    position += pageContentH;
                    if (position < imgH) {
                        doc.addPage();
                    }
                }
            }
            doc.save("تقرير_الطلبات_الجغرافية.pdf");
        } catch (err) {
            Chart.defaults.animation = originalAnimation;
            console.error("PDF generation error:", err);
            alert("حدث خطأ أثناء إنشاء ملف PDF.");
        }
    }


    function toggleCharts() {
        const el = reportContainer.querySelector("#chartsContainer");
        if (el) el.style.display = el.style.display === "grid" ? "none" : "grid";
    }

    // --- ربط الأحداث وتهيئة التواريخ ---
    reportContainer.querySelector('#geo-generate-report-btn')?.addEventListener('click', generateReport);
    reportContainer.querySelector('#geo-download-csv-btn')?.addEventListener('click', downloadCSV);
    reportContainer.querySelector('#geo-download-pdf-btn')?.addEventListener('click', downloadPDF);
    reportContainer.querySelector('#geo-toggle-charts-btn')?.addEventListener('click', toggleCharts);

    const startInp = reportContainer.querySelector("#startDate");
    const endInp = reportContainer.querySelector("#endDate");
    if (startInp && endInp) {
        const today = new Date();
        endInp.value = toISODate(today);
        const lastYear = new Date(today);
        lastYear.setFullYear(today.getFullYear() - 1);
        startInp.value = toISODate(lastYear);
    }
}