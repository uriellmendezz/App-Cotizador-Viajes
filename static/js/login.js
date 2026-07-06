let loginSlideshowInterval = null;

export function initLogin() {
    // Check if session exists in memory
    const activeToken = window.authToken;
    const activeUser = window.loggedInUser;

    const welcomeSection = document.getElementById('login-welcome-section');
    const loginForm = document.getElementById('login-form');
    const sessionActiveContainer = document.getElementById('session-active-container');
    const sessionActiveUsername = document.getElementById('session-active-username');
    const sessionActiveBtnName = document.getElementById('session-active-btn-name');

    if (activeToken && activeUser) {
        // Active session layout
        if (welcomeSection) welcomeSection.classList.add('hidden');
        if (loginForm) loginForm.classList.add('hidden');
        if (sessionActiveContainer) sessionActiveContainer.classList.remove('hidden');
        
        if (sessionActiveUsername) {
            sessionActiveUsername.innerText = activeUser === 'guest' ? 'Invitado' : activeUser;
        }
        if (sessionActiveBtnName) {
            sessionActiveBtnName.innerText = activeUser === 'guest' ? 'Invitado' : activeUser;
        }

        const btnContinue = document.getElementById('btn-continue-session');
        if (btnContinue) {
            btnContinue.onclick = () => loginSuccess(activeToken, activeUser);
        }

        const btnLogout = document.getElementById('btn-logout-session');
        if (btnLogout) {
            btnLogout.onclick = () => logoutActiveSession();
        }
    } else {
        // Standard login layout
        if (welcomeSection) welcomeSection.classList.remove('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
        if (sessionActiveContainer) sessionActiveContainer.classList.add('hidden');

        // Bind form submit
        if (loginForm) {
            loginForm.onsubmit = (e) => handleLoginSubmit(e);
        }

        // Toggle password button
        const btnTogglePassword = document.getElementById('btn-toggle-password');
        if (btnTogglePassword) {
            btnTogglePassword.onclick = () => toggleLoginPassword();
        }

        // Login as guest button
        const btnGuest = document.getElementById('btn-login-guest');
        if (btnGuest) {
            btnGuest.onclick = () => loginAsGuest();
        }
    }

    startLoginSlideshow();
}

function startLoginSlideshow() {
    if (loginSlideshowInterval) clearInterval(loginSlideshowInterval);

    const layers = document.querySelectorAll('.login-bg-layer');
    if (layers.length === 0) return;

    let currentIdx = 0;
    layers.forEach(l => l.classList.remove('active'));
    layers[currentIdx].classList.add('active');

    loginSlideshowInterval = setInterval(() => {
        layers[currentIdx].classList.remove('active');
        currentIdx = (currentIdx + 1) % layers.length;
        layers[currentIdx].classList.add('active');
    }, 6000);
}

function stopLoginSlideshow() {
    if (loginSlideshowInterval) {
        clearInterval(loginSlideshowInterval);
        loginSlideshowInterval = null;
    }
}

async function handleLoginSubmit(e) {
    if (e) e.preventDefault();

    const usernameInput = document.getElementById('login_username');
    const passwordInput = document.getElementById('login_password');
    const alertEl = document.getElementById('login-alert-message');

    if (!usernameInput || !passwordInput) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (alertEl) {
        alertEl.classList.add('hidden');
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Credenciales inválidas");
        }

        const data = await res.json();
        loginSuccess(data.access_token, data.username);
    } catch (err) {
        if (alertEl) {
            alertEl.innerText = "Error: " + err.message;
            alertEl.classList.remove('hidden');
            alertEl.className = "p-3 rounded-xl border text-xs font-semibold leading-relaxed transition-all duration-300 bg-rose-50 border-rose-100 text-rose-600";
        }
    }
}

async function loginAsGuest() {
    const alertEl = document.getElementById('login-alert-message');
    if (alertEl) {
        alertEl.classList.add('hidden');
    }

    try {
        const res = await fetch('/api/auth/login-guest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "No se pudo ingresar como invitado");
        }

        const data = await res.json();
        loginSuccess(data.access_token, data.username);
    } catch (err) {
        if (alertEl) {
            alertEl.innerText = "Error: " + err.message;
            alertEl.classList.remove('hidden');
            alertEl.className = "p-3 rounded-xl border text-xs font-semibold leading-relaxed transition-all duration-300 bg-rose-50 border-rose-100 text-rose-600";
        }
    }
}

function loginSuccess(token, username) {
    window.setSession(token, username);
    stopLoginSlideshow();
    
    // Redirect to dashboard (SPA)
    window.navigateTo('/inicio');
}

function logoutActiveSession() {
    stopLoginSlideshow();
    window.logoutAgent(true);
}

function toggleLoginPassword() {
    const passwordInput = document.getElementById('login_password');
    const eyeOpen = document.getElementById('svg-eye-open');
    const eyeClosed = document.getElementById('svg-eye-closed');
    if (!passwordInput) return;

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        if (eyeOpen) eyeOpen.classList.add('hidden');
        if (eyeClosed) eyeClosed.classList.remove('hidden');
    } else {
        passwordInput.type = 'password';
        if (eyeOpen) eyeOpen.classList.remove('hidden');
        if (eyeClosed) eyeClosed.classList.add('hidden');
    }
}
