async function initPermissionsPage(userData) {
    const container = document.getElementById('main-content');
    if (!container) return;

    if (!userData) {
        container.innerHTML = `<div class="p-8 text-center text-red-500">خطأ: لم يتم تحديد المستخدم.</div>`;
        return;
    }

    // عنصر عرض بيانات المستخدم
    const userInfoEl = container.querySelector('#user-info');
    if (userInfoEl) {
        userInfoEl.textContent = `${userData.name} (${userData.email})`;
    }

    // مكان جدول الصلاحيات
    let tableEl = container.querySelector('#permissions-table');
    if (!tableEl) {
        tableEl = document.createElement('div');
        tableEl.id = 'permissions-table';
        tableEl.className = 'mt-6';
        container.appendChild(tableEl);
    }

    // دالة: تجيب userId من خلال الإيميل
    async function getUserIdByEmail(email) {
        const res = await fetch("https://sala.runasp.net/api/Account/getUserId", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        if (!res.ok) throw new Error("فشل في جلب UserId");
        const data = await res.json();
        return data.userId;
    }

    // دالة: تحميل صلاحيات المستخدم
    async function loadUserPermissions() {
        try {
            // أولاً: نجيب userId من الإيميل
            const userId = await getUserIdByEmail(userData.email);
            userData.id = userId; // نخزنه عشان نستخدمه بعدين

            // ثانياً: نجيب الصلاحيات
            const response = await fetch(`https://sala.runasp.net/api/ReportPermissions/GetPermissionsByUserId/${userId}`);
            if (!response.ok) throw new Error("تعذر جلب صلاحيات المستخدم");
            const permissions = await response.json();

            // تحديث checkboxes
            const allCheckboxes = container.querySelectorAll('input[name="permission"]');
            allCheckboxes.forEach(checkbox => {
                const reportId = parseInt(checkbox.value, 10);
                const found = permissions.find(p => p.reportId === reportId && p.hasAccess);
                checkbox.checked = !!found;
            });

/*             // عرض جدول الصلاحيات
            let html = `
                <h3 class="text-lg font-bold mb-2">📋 الصلاحيات الحالية:</h3>
                <table class="min-w-full border border-gray-300 text-sm">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="border px-2 py-1">ReportId</th>
                            <th class="border px-2 py-1">HasAccess</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            permissions.forEach(p => {
                html += `
                    <tr>
                        <td class="border px-2 py-1 text-center">${p.reportId}</td>
                        <td class="border px-2 py-1 text-center ${p.hasAccess ? 'text-green-600 font-bold' : 'text-red-600'}">
                            ${p.hasAccess}
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            tableEl.innerHTML = html; */

        } catch (error) {
            console.error("Error loading permissions:", error);
            tableEl.innerHTML = `<p class="text-red-500">⚠️ فشل تحميل الصلاحيات.</p>`;
        }
    }

    // تحميل الصلاحيات عند بداية الصفحة
    loadUserPermissions();

    // عند الحفظ
    const permissionsForm = container.querySelector('#permissionsForm');
    if (permissionsForm) {
        permissionsForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const messageEl = container.querySelector('#message');
            messageEl.textContent = '';

            const authToken = localStorage.getItem('salla_access_token');
            if (!authToken) {
                alert("⚠️ غير مصرح. يرجى تسجيل الدخول.");
                return;
            }

            const checkboxes = container.querySelectorAll('input[name="permission"]');
            for (let checkbox of checkboxes) {
                const reportId = parseInt(checkbox.value, 10);
                const hasAccess = checkbox.checked;

                try {
                    const updateRes = await fetch(`https://sala.runasp.net/api/ReportPermissions/UpdatePermission/${reportId}/${userData.id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({ hasAccess })
                    });

                    // لو مفيش update نعمل create
                    if (!updateRes.ok) {
                        await fetch('https://sala.runasp.net/api/ReportPermissions/CreatePermission', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${authToken}`
                            },
                            body: JSON.stringify({
                                userId: userData.id,
                                reportId,
                                hasAccess
                            })
                        });
                    }
                } catch (err) {
                    console.error(`Error updating/creating permission for report ${reportId}:`, err);
                }
            }

            messageEl.textContent = '✅ تم حفظ الصلاحيات بنجاح!';
            messageEl.className = 'mt-6 text-center font-bold text-sm text-green-600';

            // إعادة تحميل الصلاحيات بعد الحفظ
            loadUserPermissions();
        });
    }

    // زرار رجوع
    container.querySelectorAll('.cancel-btn, .back-to-users-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
        });
    });
}
