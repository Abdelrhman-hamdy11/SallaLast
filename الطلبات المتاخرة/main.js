function initDelayedOrdersReport() {
    console.log("Starting initDelayedOrdersReport...");
    const reportContainer = document.getElementById('main-content');
    if (!reportContainer) {
        console.error("CRITICAL: Main content container #main-content not found.");
        return;
    }

    const salaToken = localStorage.getItem("salla_access_token");
    if (!salaToken) {
        reportContainer.innerHTML = `<p class="text-center text-red-500 p-10">خطأ: لم يتم العثور على توكن سلة. يرجى تسجيل الدخول مرة أخرى.</p>`;
        return;
    }
    const token = "Bearer " + salaToken;

    const ALLOWED_STATUS_NAMES = ["تم التنفيذ", "جاري التوصيل"];
    const REPORT_ID_FOR_COLUMNS = 5;
    const COLUMN_KEYS = [
        'orderNumber', 'status', 'orderDate', 'lastUpdate',
        'delayDays', 'sinceLastUpdate', 'policyNumber', 'city',
        'shippingCompany', 'country', 'notes'
    ];
    let columnVisibility = null;
    const ALLOWED_COUNTRIES_IN_SELECT = ["السعودية", "الامارات", "البحرين", "عمان", "قطر"];

    // --- Helpers ---
    function toISODate(d) {
        const dt = new Date(d);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function daysDiff(d1, d2) { return Math.floor((new Date(d1) - new Date(d2)) / (1000 * 60 * 60 * 24)); }
    function norm(s) { return (s || "").toString().trim(); }
    function containsLoose(str, sub) { return norm(str).toLowerCase().includes(norm(sub).toLowerCase()); }

    async function fetchAll(endpoint) {
        let page = 1, all = [], hasMore = true;
        while (hasMore) {
            const url = `${endpoint}?page=${page}&per_page=50`;
            const res = await fetch(url, { headers: { Authorization: token, Accept: "application/json" } });
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
    function pickMatchingShipmentForOrder(
        shipments,
        countryFilter,
        carrierFilter
    ) {
        if (!shipments?.length) return null;
        let list = shipments.filter((sh) => {
        if (
            carrierFilter !== "all" &&
            !containsLoose(sh.courier_name || "", carrierFilter)
        )
            return false;
        const shipCountry = norm(sh.ship_to?.country);
        if (!shipCountry) return false;
        if (countryFilter === "all")
            return ALLOWED_COUNTRIES_IN_SELECT.includes(shipCountry);
        return eqLoose(shipCountry, countryFilter);
        });
        if (!list.length) return null;
        list.sort(
        (a, b) =>
            new Date(b.updated_at || b.created_at) -
            new Date(a.updated_at || a.created_at)
        );
        return list[0];
    }

    async function getAdminIdForCurrentUser() {
        try {
            const userEmail = localStorage.getItem('user_email');
            const adminEmail = localStorage.getItem('sala_admin_email');
            if (userEmail && userEmail !== adminEmail) {
                const r = await fetch(`https://sala.runasp.net/api/Account/getAdminByUserEmail/${encodeURIComponent(userEmail)}`);
                if (r.ok) {
                    const admin = await r.json();
                    if (admin && admin.email && admin.email === userEmail) {
                        return { adminId: admin.id || admin.userId, isOwnerAdmin: true };
                    }
                    return { adminId: admin && (admin.id || admin.userId), isOwnerAdmin: false };
                }
            }
            if (adminEmail) {
                const idRes = await fetch('https://sala.runasp.net/api/Account/getUserId', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: adminEmail })
                });
                if (idRes.ok) {
                    const idData = await idRes.json();
                    const uid = idData && idData.userId;
                    const isOwner = !userEmail || userEmail === adminEmail;
                    return { adminId: uid, isOwnerAdmin: isOwner };
                }
            }
        } catch (e) { console.warn('getAdminIdForCurrentUser error:', e); }
        return { adminId: null, isOwnerAdmin: false };
    }

    async function loadColumnVisibility() {
        try {
            const info = await getAdminIdForCurrentUser();
            const adminId = info.adminId;
            const isOwnerAdmin = info.isOwnerAdmin;
            if (!adminId) {
                columnVisibility = Object.fromEntries(COLUMN_KEYS.map(k => [k, true]));
                return;
            }

            const res = await fetch(`https://sala.runasp.net/api/ReportColumnPermissions/GetColumnPermission/${REPORT_ID_FOR_COLUMNS}/${adminId}`);
            if (res.ok) {
                const data = await res.json();
                const vis = (data && data.columnVisibility) || {};
                columnVisibility = Object.fromEntries(COLUMN_KEYS.map(k => [k, vis[k] !== false]));
            } else {
                columnVisibility = Object.fromEntries(COLUMN_KEYS.map(k => [k, true]));
            }
        } catch (e) {
            console.error('Failed to load column permissions:', e);
            columnVisibility = Object.fromEntries(COLUMN_KEYS.map(k => [k, true]));
        }
    }

    function getAllowedColumns() {
        if (!columnVisibility) return COLUMN_KEYS;
        return COLUMN_KEYS.filter(k => columnVisibility[k]);
    }

    function renderTableHeader() {
        const thead = reportContainer.querySelector('#reportTable thead tr');
        if (!thead) return;
        const cols = getAllowedColumns();
        const labels = {
            orderNumber: 'رقم الطلب',
            status: 'الحالة',
            orderDate: 'تاريخ الطلب',
            lastUpdate: 'آخر تحديث',
            delayDays: 'أيام التأخير',
            sinceLastUpdate: 'منذ آخر تحديث',
            policyNumber: 'رقم البوليصة',
            city: 'المدينة',
            shippingCompany: 'شركة الشحن',
            country: 'الدولة',
            notes: 'الملاحظات'
        };
        thead.innerHTML = cols.map(k => `<th class="px-4 py-3">${labels[k]}</th>`).join('');
        return cols.length;
    }

    async function fetchNotes(orderNumber) {
        try {
            const res = await fetch(`https://sala.runasp.net/api/DelayedOrderNotes/DelayedOrderId?delayedOrderId=${orderNumber}`);
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            console.error("Error fetching notes:", e);
            return [];
        }
    }
    async function saveOrUpdateNote(orderNumber, noteValue, createdBy) {
        try {
            const payload = { orderNumber: orderNumber.toString(), note: noteValue, createdBy };
            const res = await fetch("https://sala.runasp.net/api/DelayedOrderNotes/AddOrUpdateNote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Error saving note");
            return await res.json();
        } catch (e) {
            console.error("Error saving note:", e);
            alert("حصل خطأ أثناء حفظ الملاحظة");
        }
    }

    function getDelayThresholds() {
        const tem = localStorage.getItem('delayTemTanfeez');
        const jari = localStorage.getItem('delayJariTawseel');
        const legacyTem = localStorage.getItem('delay_tem_tanfeez');
        const legacyJari = localStorage.getItem('delay_jari_tawseel');
        const delayTem = parseInt(tem ?? legacyTem ?? '2', 10);
        const delayJari = parseInt(jari ?? legacyJari ?? '4', 10);
        return {
            delayTemTanfeez: isNaN(delayTem) ? 2 : delayTem,
            delayJariTawseel: isNaN(delayJari) ? 4 : delayJari,
        };
    }

    // --- Generate Report ---
    async function generateDelayedReport() {
        const tbody = reportContainer.querySelector("#reportBody");
        const currentCols = getAllowedColumns();
        tbody.innerHTML = `<tr><td colspan="${currentCols.length}" class="text-center p-5">جاري تحميل البيانات...</td></tr>`;

        try {
            const today = reportContainer.querySelector("#delayed-todayDate").value;
            const start = reportContainer.querySelector("#delayed-startDate").value;
            const countryFilter = reportContainer.querySelector("#delayed-countryFilter").value;
            const carrierFilter = reportContainer.querySelector("#delayed-carrierFilter").value;

            const [orders, shipments] = await Promise.all([
                fetchAll("https://api.salla.dev/admin/v2/orders"),
                fetchAll("https://api.salla.dev/admin/v2/shipments")
            ]);

            const shipmentsByOrder = shipments.reduce((acc, sh) => {
                if (sh.order_id) (acc[sh.order_id] = acc[sh.order_id] || []).push(sh);
                return acc;
            }, {});

            let reportRows = [];
            const { delayTemTanfeez, delayJariTawseel } = getDelayThresholds();
            for (const order of orders) {
                const statusName = norm(order.status?.name);
                if (!ALLOWED_STATUS_NAMES.includes(statusName)) continue;

                const orderDate = norm(order.date?.date)?.split(" ")[0];
                if (!orderDate || orderDate < start) continue;

                const matchedShipment = pickMatchingShipmentForOrder(
                    shipmentsByOrder[order.id] || [],
                    countryFilter,
                    carrierFilter
                );
                if (!matchedShipment) continue;

                let delayDays = statusName === "تم التنفيذ"
                    ? daysDiff(today, orderDate) - delayTemTanfeez
                    : daysDiff(today, orderDate) - delayJariTawseel;

                if (delayDays > 0) {
                    reportRows.push({ order, matchedShipment, delayDays, today });
                }
            }

            if (reportRows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${currentCols.length}" class="text-center p-5">لا توجد طلبات متأخرة تطابق معايير البحث.</td></tr>`;
                return;
            }

            tbody.innerHTML = "";
            for (const { order, matchedShipment, delayDays, today } of reportRows) {
                const orderDate = norm(order.date?.date)?.split(" ")[0];
                const updatedAt = norm(order.updated_at?.date)?.split(" ")[0] || orderDate;
                const referenceId = order.reference_id || order.id;

                const notes = await fetchNotes(referenceId);
                const existingNote = notes.length ? notes[0].note : "";

                const tr = document.createElement("tr");
                tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700";
                const cellByKey = {
                    orderNumber: () => `${referenceId}`,
                    status: () => `${norm(order.status?.name)}`,
                    orderDate: () => `${orderDate}`,
                    lastUpdate: () => `${updatedAt}`,
                    delayDays: () => `<span class="font-bold text-red-500">${delayDays}</span>`,
                    sinceLastUpdate: () => `${updatedAt ? daysDiff(today, updatedAt) : '-'}`,
                    policyNumber: () => `${norm(matchedShipment.awb_number || 'غير متاح')}`,
                    city: () => `${norm(matchedShipment.ship_to?.city || 'غير متاح')}`,
                    shippingCompany: () => `${norm(matchedShipment.courier_name || 'غير متاح')}`,
                    country: () => `${norm(matchedShipment.ship_to?.country || 'غير متاح')}`,
                    notes: () => `
                        <div class="flex items-center space-x-1 space-x-reverse">
                            <input type="text" class="w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600" 
                                id="note_${referenceId}" value="${existingNote}" placeholder="ملاحظة..." readonly>
                            <button class="bg-blue-500 text-white px-2 py-1 rounded-md text-xs" id="btn_${referenceId}">
                                ${existingNote ? 'تعديل' : 'أضف'}
                            </button>
                            <button class="bg-gray-600 text-white px-2 py-1 rounded-md text-xs" id="details_${referenceId}">
                                تفاصيل
                            </button>
                        </div>`
                };
                const cols = getAllowedColumns();
                tr.innerHTML = cols.map(k => `<td class="px-4 py-3">${cellByKey[k]()}</td>`).join('');
                tbody.appendChild(tr);

                if (columnVisibility && columnVisibility.notes) {
                    const inputEl = document.getElementById(`note_${referenceId}`);
                    const btnEl = document.getElementById(`btn_${referenceId}`);
                    const detailsBtn = document.getElementById(`details_${referenceId}`);

                    if (btnEl) {
                        btnEl.addEventListener("click", async () => {
                            if (btnEl.innerText === "أضف" || btnEl.innerText === "تعديل") {
                                inputEl.removeAttribute("readonly");
                                inputEl.focus();
                                btnEl.innerText = "حفظ";
                            } else if (btnEl.innerText === "حفظ") {
                                var userEmail = localStorage.getItem('user_email');
                                var adminEmail = localStorage.getItem('sala_admin_email');
                                const noteValue = inputEl.value;
                                const createdBy = adminEmail || userEmail;
                                const saved = await saveOrUpdateNote(referenceId, noteValue, createdBy);
                                if (saved) {
                                    inputEl.setAttribute("readonly", true);
                                    btnEl.innerText = "تعديل";
                                    alert("تم حفظ الملاحظة بنجاح ✅");
                                }
                            }
                        });
                    }

                    if (detailsBtn) {
                        detailsBtn.addEventListener("click", async () => {
                            const notesData = await fetchNotes(referenceId);
                            if (!notesData.length) {
                                document.getElementById("noteDetailsContent").innerHTML = "<p>لا توجد تفاصيل متاحة لهذه الملاحظة.</p>";
                            } else {
                                const noteObj = notesData[0];
                                document.getElementById("noteDetailsContent").innerHTML = `
                                    <p><strong>رقم الطلب:</strong> ${noteObj.orderNumber}</p>
                                    <p><strong>الملاحظة:</strong> ${noteObj.note}</p>
                                    <p><strong>تمت الإضافة بواسطة:</strong> ${noteObj.createdBy}</p>
                                    <p><strong>تاريخ الإنشاء:</strong> ${noteObj.createdAt ?? "غير متاح"}</p>
                                `;
                            }
                            document.getElementById("noteDetailsModal").classList.remove("hidden");
                        });
                    }
                }
            }

        } catch (error) {
            console.error("Error generating report:", error);
            const errorMsg = error.message === "Unauthorized" ? "خطأ في المصادقة." : "حدث خطأ أثناء جلب البيانات.";
            const currentCols2 = getAllowedColumns();
            tbody.innerHTML = `<tr><td colspan="${currentCols2.length}" class="text-center p-5 text-red-500">${errorMsg}</td></tr>`;
        }
    }

    // --- Export CSV ---
    function downloadCSV() {
        const headers = Array.from(
            reportContainer.querySelectorAll("#reportTable thead th")
        ).map((th) => th.innerText.trim());

        const rows = Array.from(
            reportContainer.querySelectorAll("#reportBody tr")
        ).map((tr) =>
            Array.from(tr.querySelectorAll("td")).map((td) => {
                const input = td.querySelector("input");
                return input ? input.value.trim() : td.innerText.trim();
            })
        );

        if (rows.length === 0 || (rows.length === 1 && rows[0].length === 1)) {
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
        link.download = "تقرير_الطلبات_المتأخرة.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Export PDF ---
    async function downloadPDF() {
        const reportWrapper = reportContainer.querySelector("#reportWrapper");
        if (!reportWrapper) return alert("لم يتم العثور على عنصر التقرير.");

        const hasRows = reportContainer.querySelectorAll("#reportBody tr").length > 0 &&
            !reportContainer.querySelector("#reportBody tr td[colspan]");
        if (!hasRows) return alert("لا توجد بيانات لتصديرها إلى PDF.");

        try {
            const noteCells = reportWrapper.querySelectorAll("td:last-child, th:last-child");
            noteCells.forEach(cell => cell.style.display = "none");

            const canvas = await html2canvas(reportWrapper, {
                scale: 2,
                useCORS: true,
                backgroundColor: document.body.classList.contains('dark-mode') ? '#1f2937' : '#ffffff'
            });

            noteCells.forEach(cell => cell.style.display = "");

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
                    doc.addImage(imgData, "PNG", margin, margin - position, imgW, imgH);
                    position += pageContentH;
                    if (position < imgH) doc.addPage();
                }
            }

            doc.save("تقرير_الطلبات_المتأخرة.pdf");

        } catch (err) {
            console.error("PDF generation error:", err);
            alert("حدث خطأ أثناء إنشاء ملف PDF.");
        }
    }

    // --- Bind Events ---
    console.log("Setting up event listeners and default values...");

    const generateBtn = reportContainer.querySelector('#delayed-generate-report-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateDelayedReport);
    }

    const csvBtn = reportContainer.querySelector('#delayed-download-csv-btn');
    if (csvBtn) {
        csvBtn.addEventListener('click', downloadCSV);
    }

    reportContainer.querySelector('#delayed-download-pdf-btn')?.addEventListener('click', downloadPDF);

    const todayInp = reportContainer.querySelector("#delayed-todayDate");
    const startInp = reportContainer.querySelector("#delayed-startDate");
    if (todayInp && startInp) {
    // السطر التالي هو الذي يقوم بتعريف المتغير 'today'
    const today = new Date(); 

    // هنا نستخدم المتغير 'today' لضبط تاريخ النهاية
    todayInp.value = toISODate(today);

    // وهنا نستخدمه مرة أخرى للحصول على السنة الحالية
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    startInp.value = toISODate(startOfYear);
}

    (async () => {
        await loadColumnVisibility();
        renderTableHeader();
    })();

    // Close modal
    document.getElementById("closeNoteModal")?.addEventListener("click", () => {
        document.getElementById("noteDetailsModal").classList.add("hidden");
    });
}
