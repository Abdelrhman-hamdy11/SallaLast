/**
 * This function analyzes the error object from the server
 * and displays the messages in a clean, organized way for the user.
 */
// File: ./users/add-user.js

/**
 * NEW: A dedicated function to validate the password against specific rules.
 * @param {string} password - The password to validate.
 * @returns {string[]} An array of simple error messages. Returns an empty array if the password is valid.
 */
function validatePassword(password) {
    const errors = [];
    if (password.length < 8 || password.length > 20) {
        errors.push("يجب أن يكون طولها بين 8 و 20 حرفًا.");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("يجب أن تحتوي على حرف كبير واحد على الأقل.");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("يجب أن تحتوي على حرف صغير واحد على الأقل.");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("يجب أن تحتوي على رقم واحد على الأقل.");
    }
    if (!/[@$!%*?&]/.test(password)) {
        errors.push("يجب أن تحتوي على رمز خاص واحد على الأقل (@$!%*?&).");
    }
    return errors;
}

/**
 * A simplified function to translate the generic server password error.
 * This now acts as a fallback.
 */
function translatePasswordError(errorMessage) {
    const passwordErrorPattern = "The field Password must match the regular expression";
    if (typeof errorMessage === 'string' && errorMessage.startsWith(passwordErrorPattern)) {
        // Return a simple, user-friendly message instead of the large HTML block.
        return "كلمة المرور التي أدخلتها غير قوية. يرجى مراجعة الشروط والمحاولة مرة أخرى.";
    }
    return errorMessage;
}


function formatErrorMessage(data) {
    if (data && data.errors && typeof data.errors === 'object') {
        let messages = [];
        for (const field in data.errors) {
            if (Array.isArray(data.errors[field])) {
                // Translate each error message individually
                const translatedErrors = data.errors[field].map(translatePasswordError);
                messages.push(...translatedErrors);
            }
        }
        if (messages.length > 0) {
            return messages.join('<br>');
        }
    }
    if (data && data.detail) {
        return data.detail;
    }
    if (data && data.title) {
        return `حدث خطأ: ${data.title}`;
    }
    return 'فشل في إضافة المستخدم. الرجاء التأكد من صحة البيانات المدخلة.';
}

function initAddUserPage() {
    const container = document.getElementById('main-content');
    if (!container) return;
    
    const addUserForm = container.querySelector('#addUserForm');
    const messageEl = container.querySelector('#message');
    const cancelBtn = container.querySelector('#cancelBtn');
    const submitButton = container.querySelector('button[type="submit"]');

    if (addUserForm) {
        addUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const adminEmail = localStorage.getItem('sala_admin_email');
            const authToken = localStorage.getItem('salla_access_token');

            if (!adminEmail || !authToken) {
                messageEl.textContent = 'خطأ: بيانات المسؤول غير موجودة. الرجاء تسجيل الدخول مرة أخرى.';
                messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
                return;
            }

            const username = container.querySelector('#username').value;
            const email = container.querySelector('#email').value;
            const password = container.querySelector('#password').value;
            const role = container.querySelector('input[name="role"]:checked').value;

            // --- ✅ NEW: Client-side password validation ---
            const passwordErrors = validatePassword(password);
            if (passwordErrors.length > 0) {
                // If there are errors, display them as a list and stop the submission.
                const errorHtml = `
                    <div class="text-right">
                        <strong>كلمة المرور غير صالحة:</strong>
                        <ul class="list-disc list-inside mt-2">
                            ${passwordErrors.map(err => `<li>${err}</li>`).join('')}
                        </ul>
                    </div>
                `;
                messageEl.innerHTML = errorHtml;
                messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
                return; // Stop before calling the API
            }
            // --- End of new validation ---

            submitButton.disabled = true;
            submitButton.textContent = 'جاري الإضافة...';
            messageEl.textContent = '';

            const payload = {
                DisplayName: username,
                Email: email,
                Password: password,

                Role: role,
                AdminEmail: adminEmail
            };

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            };

            try {
                const response = await fetch('https://sala.runasp.net/api/Account/addUser', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    messageEl.textContent = 'تمت إضافة المستخدم بنجاح! جاري العودة...';
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-green-600';
                    setTimeout(() => {
                        loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
                    }, 1500);
                } else {
                    console.error("Server Error Response:", data);
                    messageEl.innerHTML = formatErrorMessage(data);
                    messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
                }
            } catch (error) {
                console.error('API Error:', error);
                messageEl.textContent = 'حدث خطأ في الشبكة. تأكد من اتصالك بالإنترنت.';
                messageEl.className = 'mt-6 text-center font-bold text-sm text-red-600';
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'إضافة المستخدم';
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            loadContent('./ادارة المستخدمين/systemusers.html', initUserManagementPage);
        });
    }

    const toggleBtn = container.querySelector('#togglePassword');
    const pwdInput = container.querySelector('#password');
    if (toggleBtn && pwdInput) {
        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const icon = toggleBtn.querySelector('i');
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
            toggleBtn.title = isPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
        });
    }
}