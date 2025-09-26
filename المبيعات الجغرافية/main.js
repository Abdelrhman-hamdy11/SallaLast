function initGeographicalSalesReport() {
    const reportContainer = document.getElementById('main-content');
    if (!reportContainer) {
        console.error("Error: Main content container not found.");
        return;
    }

    const salaToken = localStorage.getItem("salla_access_token");
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
            if (res.status === 401) throw new Error("Unauthorized");
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

    async function generateReport() {
        const tbody = reportContainer.querySelector("#reportBody");
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5">جاري تحميل البيانات...</td></tr>`;

        try {
            const start = reportContainer.querySelector("#sales-startDate").value;
            const end = reportContainer.querySelector("#sales-endDate").value;
            const selectedCompany = reportContainer.querySelector("#sales-shippingCompany").value;
            
            const orders = await fetchAll("https://api.salla.dev/admin/v2/orders");

            const summary = {};
            let totals = { executed: 0, delivering: 0, delivered: 0, cancelled: 0 };
            const SAUDI_CITIES = ["الرياض", "جدة", "مكة", "الدمام", "الخبر", "المدينة", "تبوك", "أبها", "حائل", "بريدة"];

            orders.forEach((order) => {
                const dateStr = order.date?.date?.split(" ")[0];
                if (!dateStr || dateStr < start || dateStr > end) return;

                const company = order.shipping?.company || order.shipping?.name || "غير محدد";
                if (selectedCompany !== "all" && company !== selectedCompany) return;

                let country = order.customer?.country || "";
                if (!country && SAUDI_CITIES.some(c => (order.customer?.city || "").includes(c))) {
                    country = "السعودية";
                } else if (!country) {
                    country = "غير معروف";
                }

                if (!summary[country]) {
                    summary[country] = { executed: 0, delivering: 0, delivered: 0, cancelled: 0 };
                }

                const amount = order.total?.amount || 0;
                const slug = order.status?.slug || "";

                if (slug === "completed") { summary[country].executed += amount; totals.executed += amount; } 
                else if (slug === "delivering") { summary[country].delivering += amount; totals.delivering += amount; }
                else if (slug === "delivered") { summary[country].delivered += amount; totals.delivered += amount; } 
                else if (slug === "canceled") { summary[country].cancelled += amount; totals.cancelled += amount; }
            });

            const formatCurrency = (val) => val.toFixed(2);

            tbody.innerHTML = `
              <tr class="bg-gray-100 dark:bg-gray-700 font-bold">
                <td class="px-6 py-3">0</td><td class="px-6 py-3">الإجمالي</td>
                <td class="px-6 py-3">${formatCurrency(totals.executed + totals.delivering + totals.delivered)}</td>
                <td class="px-6 py-3">${formatCurrency(totals.executed)}</td><td class="px-6 py-3">${formatCurrency(totals.delivering)}</td>
                <td class="px-6 py-3">${formatCurrency(totals.delivered)}</td><td class="px-6 py-3">${formatCurrency(totals.cancelled)}</td>
              </tr>
            `;

            let index = 1;
            Object.keys(summary).sort().forEach((country) => {
                const s = summary[country];
                tbody.innerHTML += `
                <tr>
                  <td class="px-6 py-4">${index++}</td><td class="px-6 py-4">${country}</td>
                  <td class="px-6 py-4">${formatCurrency(s.executed + s.delivering + s.delivered)}</td>
                  <td class="px-6 py-4">${formatCurrency(s.executed)}</td><td class="px-6 py-4">${formatCurrency(s.delivering)}</td>
                  <td class="px-6 py-4">${formatCurrency(s.delivered)}</td><td class="px-6 py-4">${formatCurrency(s.cancelled)}</td>
                </tr>`;
            });

            reportContainer.querySelector("#chartsContainer").style.display = "grid";
            renderCharts(summary, totals);
        } catch (error) {
            console.error("Error generating report:", error);
            const errorMsg = error.message === "Unauthorized" ? "خطأ في المصادقة." : "حدث خطأ أثناء جلب البيانات.";
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-5 text-red-500">${errorMsg}</td></tr>`;
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

    function toggleCharts() {
        const el = reportContainer.querySelector("#chartsContainer");
        if (el) el.style.display = el.style.display === "grid" ? "none" : "grid";
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
        link.download = "تقرير_المبيعات_الجغرافية.csv";
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
            doc.save("تقرير_المبيعات_الجغرافية.pdf");
        } catch (err) {
            Chart.defaults.animation = originalAnimation;
            console.error("PDF generation error:", err);
            alert("حدث خطأ أثناء إنشاء ملف PDF.");
        }
    }

    function toISODate(d) {
        return new Date(d).toISOString().split('T')[0];
    }
    
    // --- Event Listeners and Initial Setup ---
    reportContainer.querySelector('#sales-generate-report-btn')?.addEventListener('click', generateReport);
    reportContainer.querySelector('#sales-download-csv-btn')?.addEventListener('click', downloadCSV);
    reportContainer.querySelector('#sales-download-pdf-btn')?.addEventListener('click', downloadPDF);
    reportContainer.querySelector('#sales-toggle-charts-btn')?.addEventListener('click', toggleCharts);

    const startInp = reportContainer.querySelector("#sales-startDate");
    const endInp = reportContainer.querySelector("#sales-endDate");
    if (startInp && endInp) {
        const today = new Date();
        endInp.value = toISODate(today);
        const lastYear = new Date();
        lastYear.setFullYear(today.getFullYear() - 1);
        startInp.value = toISODate(lastYear);
    }
}