// Client-side Session State
let authToken = localStorage.getItem('authToken') || null;
let loggedInUser = localStorage.getItem('loggedInUser') || null;

window.authToken = authToken;
window.loggedInUser = loggedInUser;

// Session Management Helpers
function setSession(token, username) {
    authToken = token;
    loggedInUser = username;
    window.authToken = token;
    window.loggedInUser = username;
    if (token) {
        localStorage.setItem('authToken', token);
        localStorage.setItem('loggedInUser', username);
    } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('loggedInUser');
    }
}
window.setSession = setSession;

// Global Alert Handler
function showAlert(type, message, preventScroll = false) {
    const alertEl = document.getElementById('alert-message');
    if (!alertEl) return;
    
    alertEl.className = 'alert mb-6 p-4 rounded-xl font-semibold border text-sm transition-all duration-300';
    if (type === 'success') {
        alertEl.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else if (type === 'warning') {
        alertEl.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
    } else {
        alertEl.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-800');
    }
    
    alertEl.innerText = message;
    alertEl.classList.remove('hidden');
    
    if (!preventScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    setTimeout(() => {
        alertEl.classList.add('hidden');
    }, 5000);
}
window.showAlert = showAlert;

// Global Formatting Helper
function formatPriceES(val) {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
window.formatPriceES = formatPriceES;

// Authenticated Fetch Wrapper
async function authenticatedFetch(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    
    if (window.authToken) {
        options.headers['Authorization'] = `Bearer ${window.authToken}`;
    }
    
    let res = await fetch(url, options);
    
    // Auto-refresh token if 401
    if (res.status === 401 && window.authToken) {
        try {
            const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                setSession(data.access_token, data.username);
                
                // Retry request
                options.headers['Authorization'] = `Bearer ${data.access_token}`;
                res = await fetch(url, options);
            } else {
                logoutAgent(false);
            }
        } catch (err) {
            logoutAgent(false);
        }
    }
    return res;
}
window.authenticatedFetch = authenticatedFetch;

// SPA Router implementation
async function navigateTo(url) {
    history.pushState(null, null, url);
    await router();
}
window.navigateTo = navigateTo;

const routes = {
    '/login': { html: '/static/views/login.html', js: '/static/js/login.js', init: 'initLogin' },
    '/inicio': { html: '/static/views/inicio.html', js: '/static/js/inicio.js', init: 'initInicio' },
    '/presupuesto-rapido': { html: '/static/views/presupuesto_rapido.html', js: '/static/js/presupuestar.js', init: 'initPresupuestar' },
    '/presupuestos-rapidos': { html: '/static/views/presupuestos_rapidos.html', js: '/static/js/presupuestar.js', init: 'initPresupuestosRapidos' },
    '/hacer-cotizacion': { html: '/static/views/opciones_cotizacion.html', js: '/static/js/inicio.js', init: 'initOpciones' },
    '/cotizar': { html: '/static/views/cotizar_detallado.html', js: '/static/js/cotizar.js', init: 'initCotizar' },
    '/editar': { html: '/static/views/cotizaciones_guardadas.html', js: '/static/js/cotizar.js', init: 'initSavedQuotes' },
    '/config': { html: '/static/views/configuracion.html', js: '/static/js/cotizar.js', init: 'initConfig' }
};

let isConfigLoaded = false;

async function loadHeaderConfig() {
    if (isConfigLoaded || !window.authToken) return;
    try {
        const res = await authenticatedFetch('/api/config');
        if (res.ok) {
            const config = await res.json();
            
            // Set agency colors dynamically on root
            document.documentElement.style.setProperty('--primary-color', config.colores[0]);
            document.documentElement.style.setProperty('--secondary-color', config.colores[1]);
            document.documentElement.style.setProperty('--accent-color', config.colores[2]);

            // Update Header Logo if present
            if (config.logo_base64) {
                const navLogo = document.getElementById('nav-logo');
                if (navLogo) {
                    navLogo.src = 'data:image/png;base64,' + config.logo_base64;
                    navLogo.classList.remove('hidden');
                }
            }
            isConfigLoaded = true;
        }
    } catch (err) {
        console.error("Error loading header config:", err);
    }
}

async function router() {
    let path = window.location.pathname;
    
    // Auth Guards
    if (!window.authToken && path !== '/login') {
        history.pushState(null, null, '/login');
        path = '/login';
    } else if (window.authToken && (path === '/login' || path === '/')) {
        history.pushState(null, null, '/inicio');
        path = '/inicio';
    }

    const route = routes[path] || routes['/inicio'];
    
    // Handle Header/Navigation bar visibility based on route
    const header = document.querySelector('header');
    if (header) {
        if (path === '/login') {
            header.classList.add('hidden');
        } else {
            header.classList.remove('hidden');
            updateNavActiveState(path);

            // Fetch and apply agency configurations
            loadHeaderConfig();

            // Update Session Agent Badge
            const badge = document.getElementById('logged-user-badge');
            const spanUsername = document.getElementById('logged-username-span');
            if (badge && spanUsername) {
                const username = window.loggedInUser;
                if (username) {
                    if (username === 'guest' || username === 'Invitado') {
                        spanUsername.innerText = 'Invitado';
                        const dot = badge.querySelector('span');
                        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-slate-400';
                    } else {
                        const formattedName = username.charAt(0).toUpperCase() + username.slice(1);
                        spanUsername.innerText = formattedName;
                        const dot = badge.querySelector('span');
                        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
                    }
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                } else {
                    badge.classList.add('hidden');
                    badge.classList.remove('flex');
                }
            }
        }
    }

    // Load view content dynamically
    const appEl = document.getElementById('app');
    if (appEl) {
        try {
            const response = await fetch(route.html + '?v=' + Date.now());
            if (!response.ok) throw new Error(`Failed to load view ${route.html}`);
            const html = await response.text();
            appEl.innerHTML = html;
            
            // Import and run dynamic module JS script
            if (route.js) {
                const module = await import(route.js + '?v=' + Date.now());
                const initFunc = module[route.init];
                if (initFunc && typeof initFunc === 'function') {
                    initFunc();
                    
                    // Hook for loading quick quote from list
                    if (route.init === 'initPresupuestar' && window.pendingEditQuickBudgetId) {
                        const quoteId = window.pendingEditQuickBudgetId;
                        window.pendingEditQuickBudgetId = null;
                        if (typeof window.loadQuickBudgetIntoForm === 'function') {
                            window.loadQuickBudgetIntoForm(quoteId);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("SPA Routing error:", err);
            appEl.innerHTML = `<div class="p-8 text-center text-rose-500 font-bold">Error al cargar la página: ${err.message}</div>`;
        }
    }
}
window.router = router;

function updateNavActiveState(path) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-brand-primary', 'to-[#ff7f85]', 'text-white', 'shadow-lg', 'shadow-brand-primary/35');
        btn.classList.add('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100');
    });
    
    let btnId = '';
    if (path === '/cotizar') btnId = 'nav-btn-new-quote';
    else if (path === '/presupuesto-rapido') btnId = 'nav-btn-quick-quote';
    else if (path === '/inicio') btnId = 'nav-btn-inicio';

    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-gradient-to-r', 'from-brand-primary', 'to-[#ff7f85]', 'text-white', 'shadow-lg', 'shadow-brand-primary/35');
        activeBtn.classList.remove('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100');
    }
}

// User session auth operations
function logoutAgent(notifyServer = true) {
    if (notifyServer) {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setSession(null, null);
    isConfigLoaded = false;

    // Reset navbar logo and hide agent badge
    const badge = document.getElementById('logged-user-badge');
    if (badge) {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
    }
    const navLogo = document.getElementById('nav-logo');
    if (navLogo) {
        navLogo.src = '/assets/Banner%20letra%20O.png';
    }

    navigateTo('/login');
}
window.logoutAgent = logoutAgent;

// Intercept routing clicks
document.addEventListener('click', e => {
    const link = e.target.closest('[data-link]');
    if (link) {
        e.preventDefault();
        navigateTo(link.getAttribute('href'));
    }
});

// popstate handling for back/forward browser buttons
window.addEventListener('popstate', router);

// Initialize application routing
document.addEventListener('DOMContentLoaded', () => {
    router();
});

// Global keyboard shortcuts (Ctrl + Alt + 9)
window.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.altKey && e.key === '9') {
        const path = window.location.pathname;
        if (path === '/cotizar' && typeof window.fillTestData === 'function') {
            e.preventDefault();
            await window.fillTestData();
        } else if (path === '/presupuesto-rapido' && typeof window.fillQuickTestData === 'function') {
            e.preventDefault();
            await window.fillQuickTestData();
        }
    }
});
