// static/js/admin_login.js

export function initAdminLogin() {
    const pageContainer = document.getElementById('admin-login-page-container');
    if (!pageContainer) return;

    // Toggle Password Visibility
    const passToggle = document.getElementById('admin-login-password-toggle');
    const passInput = document.getElementById('admin-login-password');
    const passIcon = document.getElementById('admin-login-pass-icon');

    if (passToggle && passInput && passIcon) {
        passToggle.addEventListener('click', () => {
            const isPassword = passInput.type === 'password';
            passInput.type = isPassword ? 'text' : 'password';
            
            // Toggle SVG icon paths or properties
            if (isPassword) {
                // Change to eye-off icon
                passIcon.innerHTML = `
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                `;
            } else {
                // Change to eye icon
                passIcon.innerHTML = `
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                `;
            }
        });
    }

    // Form Submission
    const form = document.getElementById('form-admin-login');
    if (form) {
        form.addEventListener('submit', handleAdminLogin);
    }

    // Fade in page container
    pageContainer.classList.remove('opacity-0');
    pageContainer.classList.add('opacity-100');
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const alertEl = document.getElementById('admin-login-alert');
    if (alertEl) alertEl.classList.add('hidden');

    const username = document.getElementById('admin-login-username').value.trim();
    const password = document.getElementById('admin-login-password').value;

    if (!username || !password) return;

    window.showLoader('Verificando credenciales de administrador...');
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Decodificar token para verificar que sea ADMIN_GLOBAL
            const payload = window.decodeTokenPayload(data.access_token);
            if (payload && payload.rol === 'ADMIN_GLOBAL') {
                // Sesión exitosa
                window.setAdminSession(data.access_token, data.username);
                window.showAlert('success', 'Sesión iniciada correctamente como administrador.');
                window.navigateTo('/admin');
            } else {
                // Denegar acceso si es agente común
                if (alertEl) {
                    alertEl.innerText = 'Acceso denegado. Este panel es exclusivo para administradores globales.';
                    alertEl.classList.remove('hidden');
                }
                // Limpiar cualquier sesión residual
                window.setAdminSession(null, null);
            }
        } else {
            const errData = await response.json();
            if (alertEl) {
                alertEl.innerText = errData.detail || 'Usuario o contraseña incorrectos.';
                alertEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error("Error during admin login fetch:", err);
        if (alertEl) {
            alertEl.innerText = 'Error de comunicación con el servidor. Por favor, intenta de nuevo.';
            alertEl.classList.remove('hidden');
        }
    } finally {
        window.hideLoader();
    }
}
