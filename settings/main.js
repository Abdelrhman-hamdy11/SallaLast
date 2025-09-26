document.addEventListener('DOMContentLoaded', () => {
    // This is the main function that sets up the entire page
    function setupSettingsPage() {
        // --- Configuration ---
        const API_BASE_URL = 'https://sala.runasp.net/api';
        const REPORT_ID = 5; // For Column Permissions
        const COLUMN_KEYS = [
            'orderNumber', 'status', 'orderDate', 'lastUpdate',
            'delayDays', 'sinceLastUpdate', 'policyNumber', 'city',
            'shippingCompany', 'country', 'notes'
        ];

        // --- DOM Elements ---
        const emailInput = document.getElementById('autoEmailReport');
        const hourInput = document.getElementById('reportHour');
        const minuteInput = document.getElementById('reportMinute');
        const timeZoneSelect = document.getElementById('reportTimeZone');
        const saveAutoReportBtn = document.getElementById('saveAutoReportBtn');
        const autoReportMessageDiv = document.getElementById('autoReportMessage');
        
        const displayContainer = document.getElementById('currentSettingsDisplay');
        const tableBody = document.getElementById('settingsTableBody');
        const rowTemplate = document.getElementById('settingRowTemplate');
        
        const saveDelaySettingsBtn = document.getElementById('saveDelaySettingsBtn');
        const saveColumnsBtn = document.getElementById('saveColumnsBtn');
        
        // --- State ---
        let editingEmail = null; // To track if we are adding or updating a report setting

        // --- Helper Functions ---
        function showMessage(elementId, message, isSuccess) {
            const messageDiv = document.getElementById(elementId);
            if (!messageDiv) return;
            messageDiv.textContent = message;
            messageDiv.className = `mt-2 p-3 rounded-lg text-center text-sm font-semibold ${
                isSuccess ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'
            }`;
            messageDiv.classList.remove('hidden');
            setTimeout(() => messageDiv.classList.add('hidden'), 4000);
        }

        async function getJson(res) {
            try { return await res.json(); } catch { return null; }
        }

        function getAuthHeaders() {
            const backendToken = localStorage.getItem('token');
            const sallaToken = localStorage.getItem('salla_access_token');
            const authToken = backendToken || sallaToken;
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            return headers;
        }
        
        function clearReportForm() {
            emailInput.value = '';
            hourInput.value = '12';
            minuteInput.value = '0';
            timeZoneSelect.value = 'Arabic Standard Time';
            emailInput.disabled = false;
            editingEmail = null;
            saveAutoReportBtn.innerText = '💾 حفظ وجدولة التقرير';
        }

        // --- SECTION 1: Automatic Report Settings (API Driven) ---
        function renderTable(settings) {
            tableBody.innerHTML = '';
            if (!settings || settings.length === 0) {
                displayContainer.classList.add('hidden');
                return;
            }
            displayContainer.classList.remove('hidden');
            settings.forEach(setting => {
                const newRow = rowTemplate.content.cloneNode(true);
                newRow.querySelector('[data-td="email"]').textContent = setting.recipientEmail;
                newRow.querySelector('[data-td="time"]').textContent = `${String(setting.sendHour).padStart(2, '0')}:${String(setting.sendMinute).padStart(2, '0')}`;
                newRow.querySelector('[data-td="timezone"]').textContent = setting.timeZoneId;
                
                const editBtn = newRow.querySelector('.edit-btn');
                const deleteBtn = newRow.querySelector('.delete-btn');
                
                editBtn.dataset.setting = JSON.stringify(setting);
                deleteBtn.dataset.email = setting.recipientEmail;

                editBtn.addEventListener('click', handleEditClick);
                deleteBtn.addEventListener('click', handleDeleteClick);
                tableBody.appendChild(newRow);
            });
        }

        async function loadReportSettings() {
            const adminEmail = localStorage.getItem('sala_admin_email');
            if (!adminEmail) return;

            try {
                // NOTE: This endpoint should ideally get ALL settings for an admin, not just one.
                const response = await fetch(`${API_BASE_URL}/SendingReportSettings/GetSettingByEmail/${encodeURIComponent(adminEmail)}`, { headers: getAuthHeaders() });
                if (response.ok) {
                    const setting = await response.json();
                    renderTable(Array.isArray(setting) ? setting : [setting]);
                } else {
                    renderTable([]);
                }
            } catch (error) {
                console.error("Error loading report settings:", error);
                showMessage('autoReportMessage', "فشل تحميل إعدادات التقرير من السيرفر", false);
            }
        }

        function handleEditClick(event) {
            const setting = JSON.parse(event.target.dataset.setting);
            emailInput.value = setting.recipientEmail;
            hourInput.value = setting.sendHour;
            minuteInput.value = setting.sendMinute;
            timeZoneSelect.value = setting.timeZoneId;
            editingEmail = setting.recipientEmail;
            emailInput.disabled = true;
            saveAutoReportBtn.innerText = '💾 تحديث الإعدادات';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        
        async function handleDeleteClick(event) {
            const emailToDelete = event.target.dataset.email;
            if (!confirm(`هل أنت متأكد من حذف الإعدادات الخاصة بـ ${emailToDelete}؟`)) return;

            try {
                const response = await fetch(`${API_BASE_URL}/SendingReportSettings/DeleteSettingByEmail/${encodeURIComponent(emailToDelete)}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                if (response.ok) {
                    showMessage('autoReportMessage', "تم الحذف بنجاح", true);
                    loadReportSettings();
                } else {
                    throw new Error('Delete failed');
                }
            } catch (error) {
                console.error("Error deleting setting:", error);
                showMessage('autoReportMessage', "فشل حذف الإعدادات", false);
            }
        }

        async function handleSaveReportSettings() {
            const adminEmail = localStorage.getItem('sala_admin_email');
            const sallaToken = localStorage.getItem('salla_access_token');
            
            if (!adminEmail || !sallaToken) {
                showMessage('autoReportMessage', "خطأ: بيانات الأدمن أو توكن سلة غير موجودة.", false);
                return;
            }

            const payload = {
                adminEmail: adminEmail,
                recipientEmail: emailInput.value,
                sallaAccessToken: sallaToken,
                sendHour: parseInt(hourInput.value, 10),
                sendMinute: parseInt(minuteInput.value, 10),
                timeZoneId: timeZoneSelect.value
            };

            if (!payload.recipientEmail) {
                showMessage('autoReportMessage', "يرجى إدخال البريد الإلكتروني للمستلم.", false);
                return;
            }

            try {
                let response;
                if (editingEmail) {
                    response = await fetch(`${API_BASE_URL}/SendingReportSettings/UpdateSettingByEmail/${encodeURIComponent(editingEmail)}`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await fetch(`${API_BASE_URL}/SendingReportSettings/AddSetting`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(payload)
                    });
                }
                
                if (response.ok) {
                    showMessage('autoReportMessage', "تم حفظ الإعدادات بنجاح!", true);
                    clearReportForm();
                    loadReportSettings();
                } else {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Request failed');
                }
            } catch (error) {
                console.error("Error saving settings:", error);
                showMessage('autoReportMessage', `فشل حفظ الإعدادات: ${error.message}`, false);
            }
        }
        
        // --- SECTION 2: Delay Settings (Local Storage) ---
        function loadDelaySettings() {
            const delayTemTanfeez = localStorage.getItem('delayTemTanfeez') || 2;
            const delayJariTawseel = localStorage.getItem('delayJariTawseel') || 4;
            document.getElementById('delayTemTanfeez').value = delayTemTanfeez;
            document.getElementById('delayJariTawseel').value = delayJariTawseel;
        }

        function saveDelaySettings() {
            const delayTemTanfeez = document.getElementById('delayTemTanfeez').value;
            const delayJariTawseel = document.getElementById('delayJariTawseel').value;
            if (!delayTemTanfeez || !delayJariTawseel) {
                showMessage('delaySettingsMessage', '❌ يرجى ملء جميع الحقول', false);
                return;
            }
            localStorage.setItem('delayTemTanfeez', delayTemTanfeez);
            localStorage.setItem('delayJariTawseel', delayJariTawseel);
            showMessage('delaySettingsMessage', '✅ تم حفظ إعدادات مدد التأخير بنجاح', true);
        }

        // --- SECTION 3: Column Permissions (API Driven) ---
        async function getAdminIdForCurrentUser() {
            const adminEmail = localStorage.getItem('sala_admin_email');
            const userEmail = localStorage.getItem('user_email');
            try {
                if (adminEmail) {
                    const idRes = await fetch(`${API_BASE_URL}/Account/getUserId`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: adminEmail })
                    });
                    if (!idRes.ok) throw new Error('failed to get admin userId');
                    const idData = await getJson(idRes);
                    return idData?.userId;
                }
                if (userEmail) {
                    const res = await fetch(`${API_BASE_URL}/Account/getAdminByUserEmail/${encodeURIComponent(userEmail)}`);
                    if (!res.ok) throw new Error('failed to get admin by user email');
                    const admin = await getJson(res);
                    return admin?.id || admin?.userId;
                }
            } catch (e) { console.error('getAdminIdForCurrentUser error:', e); }
            return null;
        }
        
        async function applyColumnPermissionsToUI(adminId) {
            try {
                const response = await fetch(`${API_BASE_URL}/ReportColumnPermissions/GetColumnPermission/${REPORT_ID}/${adminId}`, { headers: getAuthHeaders() });
                const saved = response.ok ? (await getJson(response))?.columnVisibility : null;
                COLUMN_KEYS.forEach(key => {
                    const checkbox = document.getElementById(`col_${key}`);
                    if (checkbox) {
                        checkbox.checked = saved ? (saved[key] !== false) : true;
                    }
                });
            } catch(e) { console.error('Apply columns error:', e); }
        }
        
async function saveColumnPermissions() {
    const adminId = await getAdminIdForCurrentUser();
    if (!adminId) {
        showMessage('columnsMessage', '⚠️ لم يتم تحديد الأدمن.', false);
        return;
    }
    const visibilityMap = {};
    COLUMN_KEYS.forEach(col => {
        const checkbox = document.getElementById(`col_${col}`);
        if (checkbox) visibilityMap[col] = checkbox.checked;
    });

    const payload = { columnVisibility: visibilityMap };

    try {
        let response = await fetch(`${API_BASE_URL}/ReportColumnPermissions/UpdateColumnPermission/${REPORT_ID}/${adminId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        // لو مش موجود → جرّب POST (إنشاء جديد)
        if (response.status === 404) {
            response = await fetch(`${API_BASE_URL}/ReportColumnPermissions/CreateColumnPermission`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    userId: adminId,
                    reportId: REPORT_ID,
                    columnVisibility: visibilityMap
                })
            });
        }

        if (response.ok) {
            showMessage('columnsMessage', '✅ تم حفظ أذونات الأعمدة بنجاح', true);
        } else {
            throw new Error("Save failed");
        }
    } catch (e) {
        console.error("Save columns error:", e);
        showMessage('columnsMessage', '⚠️ فشل حفظ أذونات الأعمدة', false);
    }
}

        // --- Initial Setup ---
        async function initializePage() {
            // Setup event listeners
            saveAutoReportBtn.addEventListener('click', handleSaveReportSettings);
            saveDelaySettingsBtn.addEventListener('click', saveDelaySettings);
            saveColumnsBtn.addEventListener('click', saveColumnPermissions);

            // Load all settings in parallel for speed
            await Promise.all([
                loadReportSettings(),
                loadDelaySettings(),
                (async () => {
                    const adminId = await getAdminIdForCurrentUser();
                    if (adminId) await applyColumnPermissionsToUI(adminId);
                })()
            ]);
        }

        initializePage();
    }

    // خليه متاح جلوبال
    window.setupSettingsPage = setupSettingsPage;

    // تقدر تناديه هنا لو عاوز يشتغل دايركت
    setupSettingsPage();
});
