function initUserManagementPage() {
    const container = document.getElementById('main-content');
    if (!container) {
        console.error("خطأ: حاوية المحتوى الرئيسية غير موجودة.");
        return;
    }

    let currentPage = 1;
    const rowsPerPage = 5;
    let allUsers = [];

    // --- 1. دالة لجلب المستخدمين وعرضهم في الجدول ---
    async function fetchAndDisplayUsers() {
        const tbody = container.querySelector("tbody");
        const tableInfo = container.querySelector("#table-info");

        if (!tbody || !tableInfo) {
            console.error("خطأ: لم يتم العثور على عناصر الجدول الأساسية (tbody, table-info).");
            return;
        }

        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">جاري تحميل المستخدمين...</td></tr>`;
        tableInfo.innerHTML = "";

        const adminEmail = localStorage.getItem("sala_admin_email");
        if (!adminEmail) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">⚠️ لم يتم العثور على بريد المسؤول في النظام.</td></tr>`;
            return;
        }

        try {
            const response = await fetch(`https://sala.runasp.net/api/Account/getAdminMembers?adminEmail=${encodeURIComponent(adminEmail)}`);
            if (!response.ok) throw new Error(`خطأ في السيرفر: ${response.status}`);

            allUsers = await response.json();
            renderTable();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">🚨 حدث خطأ أثناء تحميل المستخدمين: ${err.message}</td></tr>`;
            console.error(err);
        }
    }

    // --- 1.1 دالة عرض الجدول مع الصفحات ---
    function renderTable() {
    const tbody = container.querySelector("tbody");
    const tableInfo = container.querySelector("#table-info");
    const pageNumberEl = container.querySelector("#pageNumber");
    tbody.innerHTML = "";

    if (allUsers.length === 0) {
        tableInfo.innerHTML = "لا توجد نتائج للعرض";
        return;
    }

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const usersToShow = allUsers.slice(start, end);

    usersToShow.forEach((user, index) => {
        const row = document.createElement("tr");
        row.dataset.userId = user.email;
        row.dataset.userName = user.displayName;
        row.dataset.userEmail = user.email;
        row.dataset.userRole = user.role;
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50";

        const permissionsButton = user.role !== 'Admin' ? `
            <button class="action-permissions flex items-center gap-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                <i class="fas fa-key"></i> الصلاحيات
            </button>
        ` : "";

        const deleteButton = `
            <button class="action-delete flex items-center gap-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
                <i class="fas fa-trash"></i> حذف
            </button>
        `;

        row.innerHTML = `
            <td class="p-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">${start + index + 1}</td>
            <td class="p-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">${user.displayName}</td>
            <td class="p-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${user.email}</td>
            <td class="p-4 whitespace-nowrap">
                <span class="px-3 py-1 text-xs font-bold rounded-full ${user.role === 'Admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'}">
                    ${user.role === 'Admin' ? 'مسؤول' : 'مستخدم'}
                </span>
            </td>
            <td class="p-4 whitespace-nowrap text-sm font-medium">
                <div class="flex items-center gap-4">
                    <button class="action-edit flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                        <i class="fas fa-edit"></i> تعديل
                    </button>
                    ${permissionsButton}
                    ${deleteButton}
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });

    // تحديث معلومات الجدول
    tableInfo.innerHTML = `عرض <b>${start + 1}</b> إلى <b>${Math.min(end, allUsers.length)}</b> من <b>${allUsers.length}</b> نتيجة`;

    // 🔹 تحديث رقم الصفحة هنا
    if (pageNumberEl) {
        pageNumberEl.textContent = currentPage;
    }

    attachRowActionListeners();
}


    // --- 1.2 التحكم في الصفحات ---
    function goToPage(page) {
        if (page < 1) return;
        if ((page - 1) * rowsPerPage >= allUsers.length) return;
        currentPage = page;
        renderTable();
    }

    // --- 2. ربط الأحداث (تعديل, صلاحيات, حذف) ---
    function attachRowActionListeners() {
        container.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', function() {
                const userRow = this.closest('tr');
                const userData = {
                    id: userRow.dataset.userId,
                    name: userRow.dataset.userName,
                    email: userRow.dataset.userEmail,
                    role: userRow.dataset.userRole
                };
                loadContent('./تعديل المستخدم/user_update.html', initEditUserPage, userData);
            });
        });

        container.querySelectorAll('.action-permissions').forEach(btn => {
            btn.addEventListener('click', function() {
                const userRow = this.closest('tr');
                const userData = {
                    id: userRow.dataset.userId,
                    name: userRow.dataset.userName,
                    email: userRow.dataset.userEmail,
                };
                loadContent('./الصلاحيات/pre.html', initPermissionsPage, userData);
            });
        });

        container.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async function() {
                const row = this.closest('tr');
                const userEmail = row.dataset.userEmail;
                const userName = row.dataset.userName;

                if (confirm(`هل أنت متأكد من حذف المستخدم: ${userName}؟`)) {
                    try {
                        const authToken = localStorage.getItem('salla_access_token');
                        if (!authToken) {
                            alert('⚠️ خطأ: غير مصرح. يرجى تسجيل الدخول مرة أخرى.');
                            return;
                        }

                        const response = await fetch(`https://sala.runasp.net/api/Account/deleteUser?email=${encodeURIComponent(userEmail)}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${authToken}`
                            }
                        });

                        if (response.ok) {
                            row.remove();
                            alert(`✅ تم حذف المستخدم: ${userName}`);
                        } else {
                            const errData = await response.json().catch(() => ({}));
                            alert(`❌ فشل حذف المستخدم: ${errData.detail || response.statusText}`);
                        }
                    } catch (error) {
                        console.error("Delete User API Error:", error);
                        alert("🚨 حدث خطأ أثناء محاولة حذف المستخدم.");
                    }
                }
            });
        });

        // التحكم في أزرار الصفحات
        const prevBtn = container.querySelector(".pagination-prev");
        const nextBtn = container.querySelector(".pagination-next");

        if (prevBtn) {
            prevBtn.onclick = () => goToPage(currentPage - 1);
        }
        if (nextBtn) {
            nextBtn.onclick = () => goToPage(currentPage + 1);
        }
    }

    // --- 3. زر إضافة مستخدم ---
    const addUserButton = container.querySelector('.add-user-btn');
    if (addUserButton) {
        addUserButton.addEventListener('click', async function() {
            const adminEmail = localStorage.getItem('sala_admin_email');
            if (!adminEmail) {
                alert('⚠️ لا يوجد بريد مسؤول محفوظ. الرجاء تسجيل الدخول مجدداً.');
                return;
            }

            try {
                const idRes = await fetch('https://sala.runasp.net/api/Account/getUserId', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: adminEmail })
                });
                const idData = await idRes.json();
                if (!idRes.ok || !idData.userId) {
                    alert('تعذر جلب معرف المستخدم.');
                    return;
                }

                const userId = idData.userId;

                const payRes = await fetch(`https://sala.runasp.net/api/Payments/CheckPayment/${userId}`);
                const payData = await payRes.json();

                if (payData && payData.hasPaid) {
                    loadContent('./اضافة مستخدم/add_users.html', initAddUserPage);
                    return;
                }

                localStorage.setItem('postPaymentTarget', 'add_user');

                const sessionRes = await fetch('https://sala.runasp.net/api/Payments/CreateCheckoutSession', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: 1000,
                        currency: 'USD',
                        productName: 'Add User Access',
                        userId: userId,
                        email: adminEmail
                    })
                });
                const sessionData = await sessionRes.json();
                if (sessionData && sessionData.url) {
                    window.location.href = sessionData.url;
                } else {
                    alert('تعذر إنشاء جلسة الدفع.');
                }
            } catch (error) {
                console.error(error);
                alert('حدث خطأ أثناء معالجة الدفع.');
            }
        });
    }

    fetchAndDisplayUsers();
}

// --- 4. صفحة تعديل المستخدم ---
function initEditUserPage(userData) {
    const container = document.getElementById('main-content');
    if (!container) return;

    if (!userData) {
        container.innerHTML = `<div class="p-8 text-center text-red-500">خطأ: لم يتم تحديد المستخدم المطلوب تعديله.</div>`;
        return;
    }

    const titleName = container.querySelector('#edit-user-title-name');
    const usernameInput = container.querySelector('#username');
    const emailInput = container.querySelector('#email');
    const passwordInput = container.querySelector('#password');
    const editUserForm = container.querySelector('#editUserForm');
    const messageEl = container.querySelector('#message');
    const submitButton = container.querySelector('button[type="submit"]');

    if(titleName) titleName.textContent = userData.name;
    if(usernameInput) usernameInput.value = userData.name;
    if(emailInput) emailInput.value = userData.email;
    if(userData.role) {
        const roleRadio = container.querySelector(`input[name="role"][value="${userData.role}"]`);
        if (roleRadio) roleRadio.checked = true;
    }

    if (passwordInput && togglePassword) {
        togglePassword.addEventListener("click", function (e) {
            e.preventDefault();

            const isPassword = passwordInput.type === "password";
            passwordInput.type = isPassword ? "text" : "password";

            const icon = togglePassword.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-eye");
                icon.classList.toggle("fa-eye-slash");
            }
            passwordInput.focus();
        });
    }

    if(editUserForm) {
        editUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const authToken = localStorage.getItem('salla_access_token');
            if (!authToken) {
                alert('خطأ في المصادقة. الرجاء تسجيل الدخول مرة أخرى.');
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'جاري التحديث...';
            messageEl.textContent = '';

            const payload = {
                currentEmail: userData.email,
                newEmail: emailInput.value,
                newPassword: passwordInput.value,
                newDisplayName: usernameInput.value,
                newRole: container.querySelector('input[name="role"]:checked')?.value || 'User'
            };

            try {
                const response = await fetch('https://sala.runasp.net/api/Account/editUser', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    messageEl.textContent = data.message || 'تم تحديث المستخدم بنجاح!';
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-green-600';
                    setTimeout(() => {
                        loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
                    }, 500);
                } else {
                    messageEl.textContent = data.detail || data.title || 'فشل في تحديث المستخدم.';
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
                }

            } catch (error) {
                console.error("Update User API Error:", error);
                messageEl.textContent = 'حدث خطأ في الشبكة. لم يتم تحديث المستخدم.';
                messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'تحديث المستخدم';
            }
        });
    }

    container.querySelectorAll('.cancel-btn, .back-to-users-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
        });
    });
}
