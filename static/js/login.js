let loginSlideshowInterval = null;
let typewriterTimeout = null;
let brandIconInterval = null;

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
    startTypewriter();
    startBrandIconCycling();
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

    if (typeof window.showLoader === 'function') {
        window.showLoader("Iniciando sesión...");
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
        if (typeof window.hideLoader === 'function') {
            window.hideLoader();
        }
        loginSuccess(data.access_token, data.username);
    } catch (err) {
        if (typeof window.hideLoader === 'function') {
            window.hideLoader();
        }
        
        // Clear password but keep username
        if (passwordInput) {
            passwordInput.value = '';
        }

        if (alertEl) {
            alertEl.innerText = "Error: " + err.message;
            alertEl.className = "p-3 rounded-xl border text-xs font-semibold leading-relaxed transition-all duration-300 bg-rose-50 border-rose-100 text-rose-600 opacity-0 scale-95 transform";
            alertEl.classList.remove('hidden');
            
            // Force browser reflow to register initial state
            alertEl.offsetHeight;
            
            // Transition to visible state
            alertEl.classList.remove('opacity-0', 'scale-95');
            alertEl.classList.add('opacity-100', 'scale-100');
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
    stopTypewriter();
    stopBrandIconCycling();
    
    // Redirect to dashboard (SPA)
    window.navigateTo('/inicio');
}

function logoutActiveSession() {
    stopLoginSlideshow();
    stopTypewriter();
    stopBrandIconCycling();
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

function startTypewriter() {
    const el = document.getElementById('login-typewriter');
    if (!el) return;

    const texts = [
        "Diseña itinerarios memorables en segundos.",
        "Optimiza tus presupuestos con inteligencia.",
        "Sorprende a tus clientes con viajes únicos."
    ];

    let textIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function tick() {
        const currentText = texts[textIdx];
        if (isDeleting) {
            el.innerText = currentText.substring(0, charIdx - 1);
            charIdx--;
        } else {
            el.innerText = currentText.substring(0, charIdx + 1);
            charIdx++;
        }

        let delay = isDeleting ? 40 : 80;

        if (!isDeleting && charIdx === currentText.length) {
            isDeleting = true;
            delay = 2500; // Pausa con texto completo
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;
            textIdx = (textIdx + 1) % texts.length;
            delay = 500; // Pausa tras borrar
        }

        typewriterTimeout = setTimeout(tick, delay);
    }

    tick();
}

function stopTypewriter() {
    if (typewriterTimeout) {
        clearTimeout(typewriterTimeout);
        typewriterTimeout = null;
    }
}

const travelIcons = [
    // Brújula / Compass (original)
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"></polygon></svg>`,
    // Avión comercial
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 12h-7.5l-3.5 3.5V12H6.5c-1.38 0-2.5-1.12-2.5-2.5S5.12 7 6.5 7H8V3.5L11.5 7H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z" /></svg>`,
    // Palmera
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M12 6c4-3 8-1 9 2M12 8c-4-3-8-1-9 2M12 10c3-2 6-2 8 0M12 12c-3-2-6-2-8 0M12 7c2-1 4-1 6-2M12 9c-2-1-4-1-6-2"></path></svg>`,
    // Valija / Maleta
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><rect x="3" y="6" width="18" height="13" rx="2" ry="2" stroke-linejoin="round"></rect><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke-linecap="round" stroke-linejoin="round"></path><line x1="12" y1="11" x2="12" y2="14" stroke-linecap="round"></line></svg>`,
    // Mapa
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>`,
    // Globo terráqueo
    `<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>`
];

let currentIconIdx = 0;

function startBrandIconCycling() {
    if (brandIconInterval) clearInterval(brandIconInterval);
    currentIconIdx = 0;
    
    brandIconInterval = setInterval(() => {
        const container = document.getElementById('login-brand-icon');
        if (!container) return;
        
        container.classList.add('opacity-0', 'scale-75');
        
        setTimeout(() => {
            currentIconIdx = (currentIconIdx + 1) % travelIcons.length;
            container.innerHTML = travelIcons[currentIconIdx];
            container.classList.remove('opacity-0', 'scale-75');
        }, 350);
    }, 3000);
}

function stopBrandIconCycling() {
    if (brandIconInterval) {
        clearInterval(brandIconInterval);
        brandIconInterval = null;
    }
}
