function initOrderSeriesReport() {
    const reportContainer = document.getElementById('main-content');
    if (!reportContainer) return;

    const salaToken = localStorage.getItem("salla_access_token");
    if (!salaToken) {
        reportContainer.innerHTML = `<p class="text-center text-red-500 p-10">خطأ: التوكن غير موجود.</p>`;
        return;
    }
    const token = "Bearer " + salaToken;
    
    const ALLOWED_STATUSES = ["تم التنفيذ", "تم التوصيل", "جاري التوصيل", "ملغي"];
    const ALLOWED_COUNTRIES = ["السعودية", "الامارات", "البحرين", "عمان", "قطر"];

    function toISODate(d) { return new Date(d).toISOString().split('T')[0]; }
    
    // ---== دوال جلب البيانات المحسّنة ==---

    // تجلب كل الشحنات (تبقى كما هي)
    async function fetchAllShipments() {
        let page = 1, allShipments = [], hasMore = true;
        while (hasMore) {
            const res = await fetch(`https://api.salla.dev/admin/v2/shipments?page=${page}&per_page=50`, {
                headers: { Authorization: token, Accept: "application/json" },
            });
            if (res.status === 401) throw new Error("Unauthorized");
            const data = await res.json();
            if (data?.data?.length) {
                allShipments = allShipments.concat(data.data);
                page++;
                hasMore = data.pagination && page <= data.pagination.totalPages;
            } else { hasMore = false; }
        }
        return allShipments;
    }

    // دالة جديدة لجلب الطلبات ضمن نطاق زمني محدد فقط
    async function fetchOrdersByDate(startDate, endDate) {
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

    // ---== الدالة الرئيسية المحدثة والأســــرع ==---
    async function generateReport() {
        const tbody = reportContainer.querySelector("#reportBody");
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5">جاري تحميل البيانات ...</td></tr>`;

        try {
            const start = reportContainer.querySelector("#series-startDate").value;
            const end = reportContainer.querySelector("#series-endDate").value;
            const interval = reportContainer.querySelector("#series-interval").value;
            const countryFilter = reportContainer.querySelector("#series-countryFilter").value;

            // الخطوة 1: جلب كل الشحنات مرة واحدة وإنشاء خريطة بحث سريعة
            const shipments = await fetchAllShipments();
            const shipmentMap = new Map();
            for (const shipment of shipments) {
                if (shipment.order_id) {
                    // قد يكون للطلب أكثر من شحنة، نحفظ الأحدث
                    if (!shipmentMap.has(shipment.order_id)) {
                        shipmentMap.set(shipment.order_id, shipment);
                    }
                }
            }
            
            // الخطوة 2: جلب الطلبات ضمن النطاق الزمني المحدد فقط
            const orders = await fetchOrdersByDate(start, end);

            const summary = {};
            let grandTotal = { total: 0, executed: 0, delivered: 0, delivering: 0, cancelled: 0 };

            // الخطوة 3: معالجة قائمة الطلبات الصغيرة والبحث في الخريطة
            for (const order of orders) {
                if (!order.status?.name || !ALLOWED_STATUSES.includes(order.status.name)) continue;
                
                const shipment = shipmentMap.get(order.id);
                if (!shipment) continue; // تجاهل الطلبات التي لا نجد لها شحنة

                const shipCountry = shipment.ship_to?.country || "غير معروف";
                if (countryFilter !== "all" && shipCountry !== countryFilter) continue;
                if (countryFilter === "all" && !ALLOWED_COUNTRIES.includes(shipCountry)) continue;

                const dateStr = order.date?.date?.split(" ")[0];
                const d = new Date(dateStr);
                let periodKey = "";
                if (interval === "daily") periodKey = dateStr;
                else if (interval === "weekly") {
                    const weekStart = new Date(d);
                    weekStart.setDate(d.getDate() - d.getDay());
                    periodKey = toISODate(weekStart);
                } else if (interval === "monthly") {
                    periodKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
                }

                if (!summary[periodKey]) {
                    summary[periodKey] = { total: 0, executed: 0, delivered: 0, delivering: 0, cancelled: 0 };
                }

                switch (order.status.name) {
                    case "تم التنفيذ": summary[periodKey].executed++; grandTotal.executed++; summary[periodKey].total++; grandTotal.total++; break;
                    case "تم التوصيل": summary[periodKey].delivered++; grandTotal.delivered++; summary[periodKey].total++; grandTotal.total++; break;
                    case "جاري التوصيل": summary[periodKey].delivering++; grandTotal.delivering++; summary[periodKey].total++; grandTotal.total++; break;
                    case "ملغي": summary[periodKey].cancelled++; grandTotal.cancelled++; break;
                }
            }

            if (Object.keys(summary).length === 0) {
                 tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5">لا توجد بيانات تطابق الفلاتر المحددة.</td></tr>`;
                 return;
            }
            
            tbody.innerHTML = `<tr class="bg-gray-100 dark:bg-gray-700 font-bold">
                <td class="px-6 py-3">الإجمالي الكلي</td><td class="px-6 py-3">${grandTotal.total}</td>
                <td class="px-6 py-3">${grandTotal.executed}</td><td class="px-6 py-3">${grandTotal.delivered}</td>
                <td class="px-6 py-3">${grandTotal.delivering}</td><td class="px-6 py-3">${grandTotal.cancelled}</td>
            </tr>`;

            Object.keys(summary).sort().forEach((period) => {
                const s = summary[period];
                tbody.innerHTML += `<tr>
                    <td class="px-6 py-4">${period}</td><td class="px-6 py-4">${s.total}</td>
                    <td class="px-6 py-4">${s.executed}</td><td class="px-6 py-4">${s.delivered}</td>
                    <td class="px-6 py-4">${s.delivering}</td><td class="px-6 py-4">${s.cancelled}</td>
                </tr>`;
            });

        } catch (error) {
            console.error("Error generating report:", error);
            const errorMsg = error.message === "Unauthorized" ? "خطأ في المصادقة." : "حدث خطأ أثناء جلب البيانات.";
            tbody.innerHTML = `<tr><td colspan="6" class="text-center p-5 text-red-500">${errorMsg}</td></tr>`;
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
        link.download = "تقرير_سلسلة_الطلبات.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function downloadPDF() {
        const reportWrapper = reportContainer.querySelector("#reportWrapper");
        if (!reportWrapper) {
            alert("⚠️ عنصر التقرير غير موجود.");
            return;
        }
        const hasRows = reportContainer.querySelectorAll("#reportBody tr").length > 0 && !reportContainer.querySelector("#reportBody tr td[colspan='7']");

        if (!hasRows) {
            alert("⚠️ لا توجد بيانات لتصديرها إلى PDF.");
            return;
        }

        // --- START: الحل الرئيسي لمشكلة الرسم البياني ---
        // 1. نحفظ الإعدادات الأصلية للرسوم المتحركة
        const originalChartAnimation = Chart.defaults.animation;
        // 2. نعطل الرسوم المتحركة مؤقتًا حتى يتمكن html2canvas من التقاط الصورة الثابتة
        Chart.defaults.animation = false;
        // --- END: الحل الرئيسي ---

        try {
            const { jsPDF } = window.jspdf;

            const canvas = await html2canvas(reportWrapper, {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff", // خلفية بيضاء لضمان جودة الطباعة
            });

            // --- START: إعادة تفعيل الرسوم المتحركة ---
            // 3. نعيد تفعيل الرسوم المتحركة بعد التقاط الصورة
            Chart.defaults.animation = originalChartAnimation;
            // --- END: إعادة تفعيل الرسوم المتحركة ---

            const imgData = canvas.toDataURL("image/png");
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
                // منطق تقسيم المحتوى الطويل على عدة صفحات
                let position = 0;
                while (position < imgH) {
                    doc.addImage(imgData, 'PNG', margin, margin - position, imgW, imgH);
                    position += pageContentH;
                    if (position < imgH) {
                        doc.addPage();
                    }
                }
            }
            // حفظ ملف الـ PDF
            doc.save("تقرير_سلسلة_الطلبات.pdf");

        } catch (err) {
            console.error("PDF error:", err);
            alert("⚠️ حصل خطأ أثناء إنشاء ملف الـ PDF. راجع الـ Console.");
            // التأكد من إعادة تفعيل الرسوم المتحركة حتى في حالة حدوث خطأ
            Chart.defaults.animation = originalChartAnimation;
        }
    }

    // --- ربط الأحداث ---
    reportContainer.querySelector('#series-generate-report-btn')?.addEventListener('click', generateReport);
    reportContainer.querySelector('#series-download-csv-btn')?.addEventListener('click', downloadCSV);
    reportContainer.querySelector('#series-download-pdf-btn')?.addEventListener('click', downloadPDF);

    const startInp = reportContainer.querySelector("#series-startDate");
    const endInp = reportContainer.querySelector("#series-endDate");
    if (startInp && endInp) {
        const today = new Date();
        endInp.value = toISODate(today);
        const lastYear = new Date();
        lastYear.setFullYear(today.getFullYear() - 1);
        startInp.value = toISODate(lastYear);
    }
}