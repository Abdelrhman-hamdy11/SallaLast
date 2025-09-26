function initEditUserPage(userData) {
    // يجب التأكد من وجود عنصر يحمل id="main-content" في صفحتك الرئيسية
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
    const togglePassword = container.querySelector('#togglePassword'); // تم إضافته
    const editUserForm = container.querySelector('#editUserForm');
    const messageEl = container.querySelector('#message');
    const submitButton = container.querySelector('button[type="submit"]');

    // 1. ملء النموذج بالبيانات الحالية للمستخدم
    if(titleName) titleName.textContent = userData.name;
    if(usernameInput) usernameInput.value = userData.name;
    if(emailInput) emailInput.value = userData.email;
    
    // (اختياري) يمكنك هنا تحديد الدور الحالي للمستخدم بناءً على البيانات القادمة
    // const roleInput = container.querySelector(`input[name="role"][value="${userData.role}"]`);
    // if(roleInput) roleInput.checked = true;



    // 3. التحكم في زر "تحديث المستخدم"
    if(editUserForm) {
        editUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // جلب التوكن الخاص بالمسؤول للمصادقة
            const authToken = localStorage.getItem('salla_access_token');
            if (!authToken) {
                alert('خطأ في المصادقة. الرجاء تسجيل الدخول مرة أخرى.');
                return;
            }

            // تعطيل الزر لمنع الضغطات المتكررة
            submitButton.disabled = true;
            submitButton.textContent = 'جاري التحديث...';
            messageEl.textContent = '';

            // جمع البيانات الجديدة من النموذج
            const payload = {
                currentEmail: userData.email, // الإيميل الحالي لتحديد المستخدم
                newEmail: emailInput.value,
                newDisplayName: usernameInput.value,
                newRole: container.querySelector('input[name="role"]:checked')?.value || 'User'
            };
            // أضف كلمة المرور الجديدة فقط إذا قام المستخدم بكتابتها
            if (passwordInput.value) {
                payload.password = passwordInput.value;
            }

            try {
                const response = await fetch('https://sala.runasp.net/api/Account/editUser', {
                    method: 'PUT', // استخدام PUT للتحديث
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}` // إضافة التوكن
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    messageEl.textContent = data.message || 'تم تحديث المستخدم بنجاح!';
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-green-600';

                    // انتظر قليلاً ثم ارجع لصفحة الإدارة
                    setTimeout(() => {
                        // تفترض هذه الدالة وجود دوال loadContent و initUserManagementPage في النطاق العام
                        loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
                    }, 500);

                } else {
                    // عرض رسالة الخطأ القادمة من السيرفر
                    messageEl.textContent = data.detail || data.title || 'فشل في تحديث المستخدم.';
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
                }

            } catch (error) {
                console.error("Update User API Error:", error);
                messageEl.textContent = 'حدث خطأ في الشبكة. لم يتم تحديث المستخدم.';
                messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
            } finally {
                // إعادة تفعيل الزر في كل الحالات
                submitButton.disabled = false;
                submitButton.textContent = 'تحديث المستخدم';
            }
        });
    }

    // 4. التحكم في أزرار "الإلغاء" و "الرجوع"
    container.querySelectorAll('.cancel-btn, .back-to-users-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // تفترض هذه الدالة وجود دوال loadContent و initUserManagementPage في النطاق العام
            loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
        });
    });
}

