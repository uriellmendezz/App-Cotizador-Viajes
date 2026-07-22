// Clean up legacy session keys on initialization
['authToken', 'loggedInUser', 'userRole', 'userSucursalId', 'userSucursalNombre'].forEach(key => {
    try { localStorage.removeItem(key); } catch (e) {}
});

// Helper: Check if path belongs to admin route
function isAdminPath(path = window.location.pathname) {
    return path === '/admin' || path === '/admin-login';
}
window.isAdminPath = isAdminPath;

// Initialize sidebar collapse state on desktop early
if (window.innerWidth >= 1024) {
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
    }
}

// Session Management Helpers
function decodeTokenPayload(token) {
    if (!token) return null;
    try {
        const base64Url = token.split('.')[0];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error decoding token payload:", e);
        return null;
    }
}
window.decodeTokenPayload = decodeTokenPayload;

function isUuidString(str) {
    if (!str || typeof str !== 'string') return false;
    return str.length > 20 || str.includes('-');
}
window.isUuidString = isUuidString;

function resolveDisplayName(username, payload, fallback = 'Invitado') {
    if (username && !isUuidString(username)) {
        return username;
    }
    if (payload?.nombre && !isUuidString(payload.nombre)) {
        return payload.nombre;
    }
    if (payload?.username && !isUuidString(payload.username)) {
        return payload.username;
    }
    if (payload?.email) {
        return payload.email.split('@')[0];
    }
    return fallback;
}
window.resolveDisplayName = resolveDisplayName;

function setAgentSession(token, username) {
    if (token) {
        const payload = decodeTokenPayload(token);
        const displayName = resolveDisplayName(username, payload, 'Agente');
        localStorage.setItem('otg_agent_token', token);
        localStorage.setItem('otg_agent_user', displayName);
        if (payload?.rol) localStorage.setItem('otg_agent_role', payload.rol);
        else localStorage.removeItem('otg_agent_role');
        if (payload?.sucursal_id) localStorage.setItem('otg_agent_sucursal_id', payload.sucursal_id);
        else localStorage.removeItem('otg_agent_sucursal_id');
        if (payload?.sucursal_nombre) localStorage.setItem('otg_agent_sucursal_nombre', payload.sucursal_nombre);
        else localStorage.removeItem('otg_agent_sucursal_nombre');
    } else {
        localStorage.removeItem('otg_agent_token');
        localStorage.removeItem('otg_agent_user');
        localStorage.removeItem('otg_agent_role');
        localStorage.removeItem('otg_agent_sucursal_id');
        localStorage.removeItem('otg_agent_sucursal_nombre');
    }
    updateAdminBtnVisibility();
}
window.setAgentSession = setAgentSession;

function setAdminSession(token, username) {
    if (token) {
        const payload = decodeTokenPayload(token);
        const displayName = resolveDisplayName(username, payload, 'Administrador');
        localStorage.setItem('otg_admin_token', token);
        localStorage.setItem('otg_admin_user', displayName);
        if (payload?.rol) localStorage.setItem('otg_admin_role', payload.rol);
        else localStorage.removeItem('otg_admin_role');
    } else {
        localStorage.removeItem('otg_admin_token');
        localStorage.removeItem('otg_admin_user');
        localStorage.removeItem('otg_admin_role');
    }
    updateAdminBtnVisibility();
}
window.setAdminSession = setAdminSession;

function clearAllSessions() {
    const keysToRemove = [
        'otg_agent_token', 'otg_agent_user', 'otg_agent_role', 'otg_agent_sucursal_id', 'otg_agent_sucursal_nombre',
        'otg_admin_token', 'otg_admin_user', 'otg_admin_role',
        'authToken', 'loggedInUser', 'userRole', 'userSucursalId', 'userSucursalNombre',
        'adminAuthToken', 'adminLoggedInUser'
    ];
    keysToRemove.forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
    });

    isConfigLoaded = false;
    isAgentSessionChecked = false;
    isAdminSessionChecked = false;
    window.userId = null;

    const spanUsername = document.getElementById('sidebar-username-span');
    if (spanUsername) spanUsername.innerText = 'Invitado';

    const userBadge = document.getElementById('sidebar-user-badge');
    if (userBadge) {
        const dot = userBadge.querySelector('span');
        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
    }

    const adminBtn = document.getElementById('sidebar-btn-admin');
    if (adminBtn) adminBtn.classList.add('hidden');
}
window.clearAllSessions = clearAllSessions;

function setSession(token, username) {
    if (!token) {
        clearAllSessions();
        return;
    }
    const payload = decodeTokenPayload(token);
    if (payload && payload.rol === 'ADMIN_GLOBAL') {
        setAdminSession(token, username);
    } else {
        setAgentSession(token, username);
    }
}
window.setSession = setSession;

function updateAdminBtnVisibility() {
    const adminBtn = document.getElementById('sidebar-btn-admin');
    if (adminBtn) {
        const adminToken = localStorage.getItem('otg_admin_token');
        if (adminToken) {
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
        }
    }
}

// Dynamic properties on window for seamless backward compatibility
Object.defineProperty(window, 'authToken', {
    get: () => {
        return isAdminPath() 
            ? (localStorage.getItem('otg_admin_token') || null) 
            : (localStorage.getItem('otg_agent_token') || null);
    },
    configurable: true
});

Object.defineProperty(window, 'loggedInUser', {
    get: () => {
        const raw = isAdminPath() 
            ? (localStorage.getItem('otg_admin_user') || null) 
            : (localStorage.getItem('otg_agent_user') || null);
        const token = window.authToken;
        if (!token && !raw) return 'Invitado';
        const payload = decodeTokenPayload(token);
        return resolveDisplayName(raw, payload, isAdminPath() ? 'Administrador' : 'Invitado');
    },
    configurable: true
});

Object.defineProperty(window, 'userRole', {
    get: () => {
        return isAdminPath() 
            ? (localStorage.getItem('otg_admin_role') || null) 
            : (localStorage.getItem('otg_agent_role') || null);
    },
    configurable: true
});

Object.defineProperty(window, 'userSucursalId', {
    get: () => localStorage.getItem('otg_agent_sucursal_id') || null,
    configurable: true
});

Object.defineProperty(window, 'userSucursalNombre', {
    get: () => localStorage.getItem('otg_agent_sucursal_nombre') || null,
    configurable: true
});

Object.defineProperty(window, 'userId', {
    get: () => {
        const token = window.authToken;
        return token ? (decodeTokenPayload(token)?.sub || null) : null;
    },
    configurable: true
});

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

    const isAdminCall = url.startsWith('/api/admin') || isAdminPath();
    const token = isAdminCall ? localStorage.getItem('otg_admin_token') : localStorage.getItem('otg_agent_token');

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    let res = await fetch(url, options);

    // Auto-refresh token if 401
    if (res.status === 401 && token) {
        try {
            const scope = isAdminCall ? 'admin' : 'agent';
            const refreshRes = await fetch(`/api/auth/refresh?scope=${scope}`, { method: 'POST' });
            if (refreshRes.ok) {
                const data = await refreshRes.json();
                if (isAdminCall) {
                    setAdminSession(data.access_token, data.username);
                } else {
                    setAgentSession(data.access_token, data.username);
                }

                // Retry request
                options.headers['Authorization'] = `Bearer ${data.access_token}`;
                res = await fetch(url, options);
            } else {
                if (isAdminCall) {
                    logoutAdmin(false);
                } else {
                    logoutAgent(false);
                }
            }
        } catch (err) {
            if (isAdminCall) {
                logoutAdmin(false);
            } else {
                logoutAgent(false);
            }
        }
    }
    return res;
}
window.authenticatedFetch = authenticatedFetch;

// Navigation History Stack
let navStack = [];

// Human-readable names for each route
const routeNames = {
    '/login': 'Iniciar Sesión',
    '/inicio': 'Inicio',
    '/cotizacion-rapida': 'Cotización Rápida',
    '/cotizaciones-rapidas': 'Cotizaciones Rápidas',
    '/hacer-cotizacion': 'Nueva Cotización',
    '/cotizacion-completa': 'Generar Cotización',
    '/editar': 'Archivos',
    '/config': 'Configuración',
    '/ver-cotizacion': 'Ver Cotización',
    '/admin': 'Administración',
};

// SPA Router implementation
async function navigateTo(url) {
    const currentPath = window.location.pathname;
    // Push current path to history stack before leaving
    if (currentPath && currentPath !== url && currentPath !== '/login') {
        navStack.push(currentPath);
    }
    history.pushState(null, null, url);
    await router();
}
window.navigateTo = navigateTo;

// Navigate back to the previous page in the internal nav stack
function navigateBack() {
    if (navStack.length > 0) {
        const prevPath = navStack.pop();
        history.pushState(null, null, prevPath);
        router();
    } else {
        navigateTo('/inicio');
    }
}
window.navigateBack = navigateBack;

// Get the label and destination for the back button
function getBackButtonInfo() {
    if (navStack.length === 0) return { label: 'Volver al Inicio', path: '/inicio' };
    const prevPath = navStack[navStack.length - 1];
    const name = routeNames[prevPath] || 'Volver';
    return { label: `Volver a ${name}`, path: prevPath };
}
window.getBackButtonInfo = getBackButtonInfo;

// Update the back button text/tooltip on the currently loaded view
function updateBackButton() {
    const btn = document.getElementById('page-back-btn');
    if (!btn) return;
    const info = getBackButtonInfo();
    const labelEl = btn.querySelector('.back-btn-label');
    if (labelEl) labelEl.textContent = info.label;
    btn.title = info.label;
}
window.updateBackButton = updateBackButton;

// Logout with native confirmation modal
function confirmLogout() {
    window.showCustomConfirm({
        title: '¿Cerrar Sesión?',
        desc: '¿Estás seguro de que deseas cerrar sesión? Tendrás que volver a ingresar tus credenciales para acceder al sistema.',
        btnText: 'Sí, Cerrar Sesión',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: () => logoutAgent(true)
    });
}
window.confirmLogout = confirmLogout;

const routes = {
    '/login': { html: '/static/views/login.html', js: '/static/js/login.js', init: 'initLogin' },
    '/inicio': { html: '/static/views/inicio.html', js: '/static/js/inicio.js', init: 'initInicio' },
    '/cotizacion-rapida': { html: '/static/views/cotizacion_rapida.html', js: '/static/js/cotizacion_rapida.js', init: 'initCotizacionRapida' },
    '/cotizaciones-rapidas': { html: '/static/views/cotizaciones_rapidas.html', js: '/static/js/cotizacion_rapida.js', init: 'initCotizacionesRapidas' },
    '/hacer-cotizacion': { html: '/static/views/opciones_cotizacion.html', js: '/static/js/inicio.js', init: 'initOpciones' },
    '/cotizacion-completa': { html: '/static/views/cotizar_detallado.html', js: '/static/js/cotizar.js', init: 'initCotizar' },
    '/editar': { html: '/static/views/cotizaciones_guardadas.html', js: '/static/js/cotizar.js', init: 'initSavedQuotes' },
    '/config': { html: '/static/views/configuracion.html', js: '/static/js/cotizar.js', init: 'initConfig' },
    '/ver-cotizacion': { html: '/static/views/ver_cotizacion.html', js: '/static/js/cotizar.js', init: 'initVerCotizacion' },
    '/admin': { html: '/static/views/admin.html', js: '/static/js/admin.js', init: 'initAdmin' },
    '/admin-login': { html: '/static/views/admin_login.html', js: '/static/js/admin_login.js', init: 'initAdminLogin' }
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

            // Update Sidebar and Mobile Logo if present
            if (config.logo_base64) {
                const sidebarLogo = document.getElementById('sidebar-logo');
                if (sidebarLogo) {
                    sidebarLogo.src = 'data:image/png;base64,' + config.logo_base64;
                }
                const mobileLogo = document.getElementById('mobile-logo');
                if (mobileLogo) {
                    mobileLogo.src = 'data:image/png;base64,' + config.logo_base64;
                }
            }
            window.agencyConfig = config;
            
            window.agentColors = {};
            if (config.agentes && Array.isArray(config.agentes)) {
                config.agentes.forEach(a => {
                    if (a.tag_color) {
                        if (a.username) window.agentColors[a.username.toLowerCase()] = a.tag_color;
                        if (a.nombre) window.agentColors[a.nombre.toLowerCase()] = a.tag_color;
                    }
                });
            }

            isConfigLoaded = true;

            const currentPath = window.location.pathname;
            if (currentPath !== '/ver-cotizacion') {
                const secName = routeNames[currentPath] || 'Inicio';
                document.title = `${secName} | ${config.nombre_agencia || 'One Trip'}`;
            }
        }
    } catch (err) {
        console.error("Error loading header config:", err);
    }
}

let isAgentSessionChecked = false;
let isAdminSessionChecked = false;

async function router() {
    // Abort active request and hide loader if user is navigating/routing
    if (window.activeRequestController) {
        try {
            window.activeRequestController.abort();
        } catch (e) {}
        window.activeRequestController = null;
        hideLoader();
    }

    // Clear welcome logo shimmer interval if user navigates away from inicio
    if (window.welcomeShimmerInterval) {
        clearInterval(window.welcomeShimmerInterval);
        window.welcomeShimmerInterval = null;
    }

    let path = window.location.pathname;
    let normalizedPath = path;
    if (path.startsWith('/cotizacion-rapida/')) {
        normalizedPath = '/cotizacion-rapida';
    }
    const isTargetAdmin = isAdminPath(path);

    // Check for explicit logout flag to bypass auto-refresh on page load right after logout
    let isExplicitLogout = false;
    try {
        if (sessionStorage.getItem('otg_explicit_logout') === 'true') {
            isExplicitLogout = true;
            sessionStorage.removeItem('otg_explicit_logout');
            isAgentSessionChecked = true;
            isAdminSessionChecked = true;
        }
    } catch (e) {}

    // Silently restore session via cookie once on startup for the current context
    if (!isExplicitLogout) {
        if (isTargetAdmin) {
            if (!localStorage.getItem('otg_admin_token') && !isAdminSessionChecked) {
                isAdminSessionChecked = true;
                try {
                    const res = await fetch('/api/auth/refresh?scope=admin', { method: 'POST' });
                    if (res.ok) {
                        const data = await res.json();
                        setAdminSession(data.access_token, data.username);
                    }
                } catch (err) {
                    console.warn("No active admin session cookie found or refresh failed:", err);
                }
            }
        } else {
            if (!localStorage.getItem('otg_agent_token') && !isAgentSessionChecked) {
                isAgentSessionChecked = true;
                try {
                    const res = await fetch('/api/auth/refresh?scope=agent', { method: 'POST' });
                    if (res.ok) {
                        const data = await res.json();
                        setAgentSession(data.access_token, data.username);
                    }
                } catch (err) {
                    console.warn("No active agent session cookie found or refresh failed:", err);
                }
            }
        }
    }

    // Auth Guards using isolated tokens per scope
    const agentToken = localStorage.getItem('otg_agent_token');
    const adminToken = localStorage.getItem('otg_admin_token');

    if (isTargetAdmin) {
        if (path === '/admin-login') {
            if (adminToken) {
                const payload = decodeTokenPayload(adminToken);
                if (payload && payload.rol === 'ADMIN_GLOBAL') {
                    history.pushState(null, null, '/admin');
                    path = '/admin';
                    normalizedPath = '/admin';
                }
            }
        } else if (path === '/admin') {
            if (!adminToken) {
                history.pushState(null, null, '/admin-login');
                path = '/admin-login';
                normalizedPath = '/admin-login';
            } else {
                const payload = decodeTokenPayload(adminToken);
                if (!payload || payload.rol !== 'ADMIN_GLOBAL') {
                    setTimeout(() => showAlert('error', 'Acceso denegado. Se requieren permisos de Administrador Global.'), 100);
                    history.pushState(null, null, '/admin-login');
                    path = '/admin-login';
                    normalizedPath = '/admin-login';
                }
            }
        }
    } else {
        // Agent View Auth Guards
        if (!agentToken) {
            if (path !== '/login') {
                history.pushState(null, null, '/login');
                path = '/login';
                normalizedPath = '/login';
            }
        } else {
            // Agent Authenticated
            if (path === '/login' || path === '/') {
                history.pushState(null, null, '/inicio');
                path = '/inicio';
                normalizedPath = '/inicio';
            } else if (path === '/cotizaciones-rapidas') {
                history.pushState(null, null, '/editar?tab=rapidos');
                path = '/editar';
                normalizedPath = '/editar';
            }
        }
    }

    const route = routes[normalizedPath] || routes[path] || routes['/inicio'];

    // Handle Sidebar and Mobile Header visibility based on route
    const sidebarEl = document.getElementById('app-sidebar');
    const wrapperEl = document.getElementById('main-content-wrapper');
    const headerEl = document.getElementById('app-top-header');

    if (sidebarEl && wrapperEl) {
        if (normalizedPath === '/login' || normalizedPath === '/admin-login' || normalizedPath === '/admin') {
            sidebarEl.classList.add('hidden');
            if (headerEl) headerEl.classList.add('hidden');
            wrapperEl.classList.remove('lg:pl-[260px]');
        } else {
            sidebarEl.classList.remove('hidden');
            if (headerEl) headerEl.classList.remove('hidden');
            wrapperEl.classList.add('lg:pl-[260px]');
            updateNavActiveState(normalizedPath);

            // Toggle admin button visibility
            const adminBtn = document.getElementById('sidebar-btn-admin');
            if (adminBtn) {
                if (window.userRole === 'ADMIN_GLOBAL') {
                    adminBtn.classList.remove('hidden');
                } else {
                    adminBtn.classList.add('hidden');
                }
            }

            // Initialize inner toggle chevron rotation state
            const innerChevron = document.getElementById('sidebar-inner-chevron');
            if (innerChevron) {
                const isCollapsed = document.body.classList.contains('sidebar-collapsed');
                if (isCollapsed) innerChevron.classList.add('rotate-180');
                else innerChevron.classList.remove('rotate-180');
            }

            // Fetch and apply agency configurations
            loadHeaderConfig();

            // Update Sidebar Session Agent Badge
            const badge = document.getElementById('sidebar-user-badge');
            const spanUsername = document.getElementById('sidebar-username-span');
            if (badge && spanUsername) {
                const username = window.loggedInUser;
                if (username) {
                    if (username === 'guest' || username === 'Invitado') {
                        spanUsername.innerText = 'Invitado';
                        const dot = badge.querySelector('span');
                        if (dot) dot.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
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
            updateHomeButtonVisibility();
        }
    }

    // Load view content dynamically
    const appEl = document.getElementById('app');
    if (appEl) {
        try {
            // Start exit transition
            appEl.classList.remove('opacity-100');
            appEl.classList.add('opacity-0');

            // Fetch content concurrently
            const fetchPromise = fetch(route.html + '?v=' + Date.now());

            // Wait for exit transition to complete (150ms)
            await new Promise(resolve => setTimeout(resolve, 150));

            const response = await fetchPromise;
            if (!response.ok) throw new Error(`Failed to load view ${route.html}`);
            const html = await response.text();

            // Inject new HTML content
            appEl.innerHTML = html;

            // Force browser reflow to register new element states
            appEl.offsetHeight;

            // Start entry transition
            appEl.classList.remove('opacity-0');
            appEl.classList.add('opacity-100');

            // Update document title dynamically based on section
            if (path !== '/ver-cotizacion') {
                const sectionName = routeNames[path] || 'Inicio';
                const appName = (window.agencyConfig && window.agencyConfig.nombre_agencia) || 'One Trip';
                document.title = `${sectionName} | ${appName}`;
            }

            // Import and run dynamic module JS script
            if (route.js) {
                const module = await import(route.js + '?v=' + Date.now());
                const initFunc = module[route.init];
                if (initFunc && typeof initFunc === 'function') {
                    initFunc();

                    // Hook for loading quick quote from list
                    if (route.init === 'initCotizacionRapida' && window.pendingEditQuickBudgetId) {
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
            appEl.classList.remove('opacity-0');
            appEl.classList.add('opacity-100');
        }

        // Update dynamic back button after content loads
        updateBackButton();
    }
}
window.router = router;

function updateNavActiveState(path) {
    // Remove active styles from all sidebar items
    document.querySelectorAll('.sidebar-item').forEach(btn => {
        btn.classList.remove('sidebar-item-active');
    });

    let btnId = '';
    if (path === '/inicio' || path === '/') btnId = 'sidebar-btn-inicio';
    else if (path === '/cotizacion-rapida') btnId = 'sidebar-btn-quick-quote';
    else if (path === '/cotizacion-completa') btnId = 'sidebar-btn-full-quote';
    else if (path === '/editar') btnId = 'sidebar-btn-editar';
    else if (path === '/config') btnId = 'sidebar-btn-config';
    else if (path === '/admin') btnId = 'sidebar-btn-admin';

    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.classList.add('sidebar-item-active');
    }
}

// User session auth operations
async function logoutAgent(notifyServer = true) {
    clearAllSessions();
    try {
        sessionStorage.setItem('otg_explicit_logout', 'true');
    } catch (e) {}

    if (notifyServer) {
        try {
            await fetch('/api/auth/logout?scope=agent', { method: 'POST', cache: 'no-store' });
        } catch (e) {
            console.warn("Logout endpoint error:", e);
        }
    }

    const navLogo = document.getElementById('sidebar-logo');
    if (navLogo) navLogo.src = '/assets/Logo%20ONE%20TRIP.png';
    const mobileLogo = document.getElementById('mobile-logo');
    if (mobileLogo) mobileLogo.src = '/assets/Logo%20ONE%20TRIP.png';

    window.location.replace('/login');
}
window.logoutAgent = logoutAgent;

async function logoutAdmin(notifyServer = true) {
    clearAllSessions();
    try {
        sessionStorage.setItem('otg_explicit_logout', 'true');
    } catch (e) {}

    if (notifyServer) {
        try {
            await fetch('/api/auth/logout?scope=admin', { method: 'POST', cache: 'no-store' });
        } catch (e) {
            console.warn("Logout endpoint error:", e);
        }
    }

    window.location.replace('/admin-login');
}
window.logoutAdmin = logoutAdmin;

// Intercept routing clicks & logout button clicks
document.addEventListener('click', e => {
    const logoutBtn = e.target.closest('#sidebar-btn-logout') || e.target.closest('[data-logout]');
    if (logoutBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.confirmLogout === 'function') {
            window.confirmLogout();
        } else {
            window.logoutAgent(true);
        }
        return;
    }

    const link = e.target.closest('[data-link]');
    if (link) {
        e.preventDefault();
        navigateTo(link.getAttribute('href'));
    }
});

// popstate handling for back/forward browser buttons
window.addEventListener('popstate', router);

// Header date & time dynamic clock
window.lastDateTimeString = "";
function updateHeaderDateTime() {
    const elements = document.querySelectorAll('.nav-date-time-text');
    if (elements.length === 0) return;

    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    const dayName = days[now.getDay()];
    const day = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const dateTimeString = `${dayName}, ${day} de ${monthName} de ${year} - ${hours}:${minutes}`;

    if (dateTimeString !== window.lastDateTimeString) {
        if (!window.lastDateTimeString) {
            elements.forEach(el => el.innerText = dateTimeString);
            window.lastDateTimeString = dateTimeString;
        } else {
            elements.forEach(el => el.classList.add('opacity-0', 'scale-95'));
            setTimeout(() => {
                elements.forEach(el => el.innerText = dateTimeString);
                window.lastDateTimeString = dateTimeString;
                elements.forEach(el => el.classList.remove('opacity-0', 'scale-95'));
            }, 200);
        }
    }
}
window.updateHeaderDateTime = updateHeaderDateTime;

// Initialize application routing
document.addEventListener('DOMContentLoaded', () => {
    router();
    updateHeaderDateTime();
    setInterval(updateHeaderDateTime, 1000);
});

// Global keyboard shortcuts (Ctrl + Alt + 9)
window.addEventListener('keydown', async (e) => {
    if (e.ctrlKey && e.altKey && (e.key === '9' || e.code === 'Digit9' || e.code === 'Numpad9')) {
        const path = window.location.pathname;
        if (path === '/cotizacion-completa' && typeof window.fillTestData === 'function') {
            e.preventDefault();
            await window.fillTestData();
        } else if (path === '/cotizacion-rapida' && typeof window.fillQuickTestData === 'function') {
            e.preventDefault();
            await window.fillQuickTestData();
        }
    }
});

// Centralized Loader Component
let loadingIconInterval = null;
let currentLoadingIconIdx = 0;

const loadingTravelIcons = [
    // asiento-avion.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M581-613.33q-11.33 0-20-6.67t-12-17.67l-57-200q-4.33-16 5.5-29.16Q507.33-880 524-880h263q11.33 0 20 6.67 8.67 6.66 12 17.66l57 200q4.33 16-5.5 29.17-9.83 13.17-26.5 13.17H581ZM606.33-680h193.34l-38.34-133.33h-193l38 133.33Zm-329.66 0q-30.34 0-51.5-21.17Q204-722.33 204-752.67q0-30.33 21.17-52.16 21.16-21.84 51.5-21.84 30.33 0 52.16 21.84 21.84 21.83 21.84 52.16 0 30.34-21.84 51.5Q307-680 276.67-680Zm244.66 560H248q-28.33 0-49.83-19.17-21.5-19.16-27.17-47.5L80-643.33h69.33l87.34 456.66h284.66V-120Zm233.34 93.33L637.33-230h-302q-27 0-47.83-15.83-20.83-15.84-26.17-42.17l-46-236.67q-9.33-46.66 23-82.66 32.34-36 80.34-36 35 0 61.16 22 26.17 22 33.5 56.66l45.34 227.34h154q20.33 0 36.33 11.66 16 11.67 26.33 29L813.33-60l-58.66 33.33ZM606.33-680l-38-133.33 38 133.33Z"/></svg>`,
    // avion.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M394.33-117.67 298-298.33l-181.33-97 63-62.67 147 26.33L442-546.33 118.33-684l76-76.67L586.67-692l130-130q21.66-21.67 52.66-21.67 31 0 52.67 21.67t21.67 52.5q0 30.83-21.67 52.5L691.67-586.67l68.66 392L684-118.33 546-442 431.33-326.67l26 146-63 63Z"/></svg>`,
    // boleto-avion.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="m350-328 364-98.67q16.33-4.66 24.17-16.83 7.83-12.17 3.16-28.5-4.66-16.33-17.83-23.17-13.17-6.83-28.7-2.74l-101.47 26.58-164-158L376-616.67 476.67-440l-106 28.67-51.34-41.34-32 10L350-328Zm463.33 168H146.67q-27.5 0-47.09-19.58Q80-199.17 80-226.67V-382q35.67-5.33 59.83-32.83Q164-442.33 164-480t-24.17-65.5Q115.67-573.33 80-578v-155.33q0-27.5 19.58-47.09Q119.17-800 146.67-800h666.66q27.5 0 47.09 19.58Q880-760.83 880-733.33v506.66q0 27.5-19.58 47.09Q840.83-160 813.33-160Zm0-66.67v-506.66H146.67v106.66Q185-602 207.83-563.83q22.84 38.16 22.84 83.83t-22.84 83.83Q185-358 146.67-333.33v106.66h666.66ZM480-480Z"/></svg>`,
    // brujula.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="m302-302 273.33-82 82-273.33-273.33 82L302-302Zm177.84-131.33q-19.51 0-33.01-13.66-13.5-13.66-13.5-33.17t13.66-33.01q13.66-13.5 33.17-13.5t33.01 13.66q13.5 13.66 13.5 33.17t-13.66 33.01q-13.66 13.5-33.17 13.5ZM480.18-80q-82.83 0-155.67-31.5-72.84-31.5-127.18-85.83Q143-251.67 111.5-324.56T80-480.33q0-82.88 31.5-155.78Q143-709 197.33-763q54.34-54 127.23-85.5T480.33-880q82.88 0 155.78 31.5Q709-817 763-763t85.5 127Q880-563 880-480.18q0 82.83-31.5 155.67Q817-251.67 763-197.46q-54 54.21-127 85.84Q563-80 480.18-80Zm.14-66.67q138.68 0 235.85-97.49 97.16-97.49 97.16-236.16 0-138.68-97.16-235.85-97.17-97.16-235.85-97.16-138.67 0-236.16 97.16-97.49 97.17-97.49 235.85 0 138.67 97.49 236.16 97.49 97.49 236.16 97.49ZM480-480Z"/></svg>`,
    // cafe.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M160-120v-66.67h640V-120H160Zm154-146.67q-64 0-109-44.66Q160-356 160-420v-420h653.33q27.5 0 47.09 19.58Q880-800.83 880-773.33v146.66q0 27.5-19.58 47.09Q840.83-560 813.33-560h-90.66v140q0 64-45 108.67-45 44.66-109 44.66H314Zm0-66.66h254.65q35.02 0 61.18-26.17Q656-385.67 656-420v-353.33H226.67V-420q0 34.33 26.5 60.5T314-333.33Zm408.67-293.34h90.66v-146.66h-90.66v146.66ZM314-333.33h-87.33H656 314Z"/></svg>`,
    // cama.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M80-200v-250q0-25.67 10.33-47.67 10.34-22 29.67-37v-114.66Q120-696 152-728t78.67-32H404q22.33 0 41.67 9.5Q465-741 480-724.67q15-16.33 34-25.83t41.33-9.5h173.34q46.66 0 79 32Q840-696 840-649.33v114.66q19.33 15 29.67 37Q880-475.67 880-450v250h-66.67v-80H146.67v80H80Zm433.33-356.67h260v-92.66q0-19-12.83-31.5t-31.83-12.5H553.33q-17 0-28.5 13.16-11.5 13.17-11.5 30.84v92.66Zm-326.66 0h260v-92.66q0-17.67-11.5-30.84-11.5-13.16-28.5-13.16h-176q-18.34 0-31.17 12.83-12.83 12.83-12.83 31.17v92.66Zm-40 210h666.66V-450q0-17-11.5-28.5t-28.5-11.5H186.67q-17 0-28.5 11.5t-11.5 28.5v103.33Zm666.66 0H146.67h666.66Z"/></svg>`,
    // camioneta.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M153-233q-33-33-33-80.33H40v-373.34Q40-717 61.5-738.5t51.83-21.5H684l236 236v210.67h-80Q840-266 807-233t-80.33 33q-47.34 0-80.34-33t-33-80.33H346.67q0 47.33-33 80.33t-80.34 33Q186-200 153-233Zm447-327h182.67L649.33-693.33H600V-560Zm-246.67 0h180v-133.33h-180V-560Zm-246.66 0h180v-133.33h-180V-560ZM273.5-273.17q16.5-16.5 16.5-40.16 0-23.67-16.5-40.17T233.33-370q-23.66 0-40.16 16.5-16.5 16.5-16.5 40.17 0 23.66 16.5 40.16 16.5 16.5 40.16 16.5 23.67 0 40.17-16.5Zm493.33 0q16.5-16.5 16.5-40.16 0-23.67-16.5-40.17T726.67-370q-23.67 0-40.17 16.5T670-313.33q0 23.66 16.5 40.16 16.5 16.5 40.17 16.5 23.66 0 40.16-16.5ZM106.67-380H142q17-23.33 41.33-35 24.34-11.67 50-11.67 25.67 0 50 11.67 24.34 11.67 41.34 35h310.66q17-23.33 41.34-35 24.33-11.67 50-11.67 25.66 0 50 11.67Q801-403.33 818-380h35.33v-113.33H106.67V-380Zm746.66-113.33H106.67h746.66Z"/></svg>`,
    // concerje.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M400-80v-66.67h520V-80H400Zm40-120q0-81 51-141.5t129-74.33v-24.71q0-16.79 11.5-28.29t28.5-11.5q17 0 28.5 11.5t11.5 28.5v24.57Q777-402 828.5-341.5 880-281 880-200H440Zm82.33-67h274Q778-305.33 741.5-329.5t-81.36-24.17q-46.14 0-82.81 24.17-36.66 24.17-55 62.5Zm137.34 0ZM40-441.33v-409.34h223.33v57.34L564-878.67l316 97.34v44.66q0 41.67-31.67 70.84-31.66 29.16-73.66 29.16H672v8q0 21-20.5 51.5T612-539l-260 97.67H40ZM106.67-508H196v-276h-89.33v276Zm156.66 0h77.34l240.66-90.33q9.67-3.34 15.5-15.84 5.84-12.5 5.84-22.5h-75l-115.67 38-22.67-64L517-703.33h257.67q12.33 0 24.16-8.67 11.84-8.67 11.84-20.67l-250-76.66L263.33-724v216Z"/></svg>`,
    // durmiendo.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M40-200v-590h66.67v396h342v-312.67H770q61.88 0 105.94 44.07Q920-618.54 920-556.67V-200h-66.67v-127.33H106.67V-200H40Zm154.67-278q-32-32-32-78.67 0-46.66 32-78.66t78.66-32q46.67 0 78.67 32t32 78.66Q384-510 352-478t-78.67 32q-46.66 0-78.66-32Zm320.66 84h338v-162.67q0-34.37-24.48-58.85Q804.38-640 770-640H515.33v246ZM304.5-525.5q12.83-12.83 12.83-31.17 0-18.33-12.83-31.16-12.83-12.84-31.17-12.84-18.33 0-31.16 12.84-12.84 12.83-12.84 31.16 0 18.34 12.84 31.17 12.83 12.83 31.16 12.83 18.34 0 31.17-12.83Zm-31.17-31.17Zm242-83.33v246-246Z"/></svg>`,
    // estrellas.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M333.33-259 480-347l146.67 89-39-166.67 129-112-170-15L480-709l-66.67 156.33-170 15 129 112.34-39 166.33ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm457-560 21-89-71-59 94-8 36-84 36 84 94 8-71 59 21 89-80-47-80 47ZM480-483.67Z"/></svg>`,
    // familia.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M720.05-724.67q-31.05 0-53.22-22.11-22.16-22.11-22.16-53.17 0-31.05 22.11-53.22 22.11-22.16 53.17-22.16 31.05 0 53.22 22.11 22.16 22.11 22.16 53.17 0 31.05-22.11 53.22-22.11 22.16-53.17 22.16ZM666.67-80v-330.67q0-33.33-16.84-60-16.83-26.66-46.83-40L642-625q8-25 29.5-40t48.5-15q27 0 48.5 15t29.5 40l102 298.33H793.33V-80H666.67Zm-212.5-437.5q-17.5-17.5-17.5-42.5t17.5-42.5q17.5-17.5 42.5-17.5t42.5 17.5q17.5 17.5 17.5 42.5t-17.5 42.5q-17.5 17.5-42.5 17.5t-42.5-17.5ZM220.05-724.67q-31.05 0-53.22-22.11-22.16-22.11-22.16-53.17 0-31.05 22.11-53.22 22.11-22.16 53.17-22.16 31.05 0 53.22 22.11 22.16 22.11 22.16 53.17 0 31.05-22.11 53.22-22.11 22.16-53.17 22.16ZM146.67-80v-286.67H80v-246.66q0-27.5 19.58-47.09Q119.17-680 146.67-680h146.66q27.5 0 47.09 19.58Q360-640.83 360-613.33v246.66h-66.67V-80H146.67ZM440-80v-166.67h-46.67v-164q0-20.55 14.39-34.94Q422.11-460 442.67-460h108q20.55 0 34.94 14.39Q600-431.22 600-410.67v164h-46.67V-80H440Z"/></svg>`,
    // hamburguesa.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M146.67-120q-27.5 0-47.09-19.58Q80-159.17 80-186.67V-312h800v125.33q0 27.5-19.58 47.09Q840.83-120 813.33-120H146.67Zm0-125.33v58.66h666.66v-58.66H146.67Zm274-157.34q-20 21.34-74.67 21.34t-73-21.34Q254.67-424 215.33-424q-39.33 0-59.9 21.33-20.57 21.34-75.43 21.34V-448q34 0 57.33-21.33 23.34-21.34 78-21.34 54.67 0 73 21.34Q306.67-448 346-448t59.33-21.33q20-21.34 74.67-21.34t74.67 21.34Q574.67-448 614-448t57.67-21.33q18.33-21.34 73-21.34 54.66 0 78.66 21.34Q847.33-448 880-448v66.67q-54.67 0-74.67-21.34Q785.33-424 746-424t-58.33 21.33q-19 21.34-73.67 21.34t-74.67-21.34Q519.33-424 480-424t-59.33 21.33ZM80-558.67v-40q0-111 106.17-176.16Q292.33-840 480-840t293.83 65.17Q880-709.67 880-598.67v40H80Zm400-214.66q-140 0-230.83 41.33-90.84 41.33-99.17 106.67h660q-9.67-65.34-99.83-106.67Q620-773.33 480-773.33Zm0 528Zm0-380Z"/></svg>`,
    // hotel.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M120-120v-556.67h163.33V-840h393.34v326.67H840V-120H528.67v-163.33h-97.34V-120H120Zm66.67-66.67h96.66v-96.66h-96.66v96.66Zm0-163.33h96.66v-96.67h-96.66V-350Zm0-163.33h96.66V-610h-96.66v96.67ZM350-350h96.67v-96.67H350V-350Zm0-163.33h96.67V-610H350v96.67Zm0-163.34h96.67v-96.66H350v96.66ZM513.33-350H610v-96.67h-96.67V-350Zm0-163.33H610V-610h-96.67v96.67Zm0-163.34H610v-96.66h-96.67v96.66Zm163.34 490h96.66v-96.66h-96.66v96.66Zm0-163.33h96.66v-96.67h-96.66V-350Z"/></svg>`,
    // huellas.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M260-853.33q-49.67 0-81.5 50.66Q146.67-752 146.67-680q0 73 21.16 124.83Q189-503.33 200-486l132.67-27.33q13.66-36 27.16-80.34 13.5-44.33 13.5-86.33 0-64.67-30.16-119Q313-853.33 260-853.33Zm55 546.66q25 0 41.67-18.33 16.66-18.33 16.66-48 0-19-8.66-39.33Q356-432.67 346-448.67L226.67-424q-.67 42 20.16 79.67 20.84 37.66 68.17 37.66Zm385-346.66q-53 0-83.17 54.33-30.16 54.33-30.16 119 0 42.67 13.83 86.5t27.5 80.17l132 26.66q11.67-18 32.5-69.33t20.83-124q0-72-31.83-122.67-31.83-50.66-81.5-50.66Zm-55 546.66q47.33 0 67.83-38t20.5-80l-119.33-24q-9.33 16-18.33 36.34-9 20.33-9 39.33 0 28 16.5 47.17 16.5 19.16 41.83 19.16ZM315-240q-77 0-117-57t-38-128l-18-27q-11-17-36.5-77T80-680q0-103 51-171.5T260-920q85 0 132.5 75.5T440-680q0 58-16 107t-28 79l8 13q8 14 22 44.5t14 63.5q0 57-35.5 95T315-240ZM645-40q-54 0-89.5-38T520-173q0-33 14-63.5t22-44.5l8-13q-12-30-28-79t-16-107q0-89 47.5-164.5T700-720q78 0 129 68.5T880-480q0 91-25.5 150.5T818-253l-18 28q1 71-38.5 128T645-40Z"/></svg>`,
    // kihing.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M281.33-40 403-660.67q5.33-25.66 24.33-39.16 19-13.5 40-13.5T506.5-704q18.17 9.33 29.5 27.33l39.33 64q18.67 31 50.5 55.5 31.84 24.5 74.17 37.5v-73.66h46.67V-40H700v-411.33q-50-11-93.67-37.67-43.66-26.67-77-65.67L502-418l84.67 80.67V-40H520v-242.67l-94.67-90L352-40h-70.67Zm17-400.33L220-455q-12-2.33-20-14.17-8-11.83-5.67-24.83l30-157q5.34-30 30.67-46.5 25.33-16.5 55.33-11.17l39.34 7.67-51.34 260.67ZM480.17-771.5Q458-793.67 458-824.67t22.17-53.16Q502.33-900 533.33-900q31 0 53.17 22.17 22.17 22.16 22.17 53.16 0 31-22.17 53.17t-53.17 22.17q-31 0-53.16-22.17Z"/></svg>`,
    // lentes.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M262-320q-61 0-93-16.5T110-398q-15-25-25.5-59.5T65-520q-11 0-18-7t-7-18v-49q0-9 6-15.5t15-8.5q56-11 101.5-16t87.5-5q61 0 110.5 10t77.5 29h85q24-18 76-28.83 52-10.84 112-10.84 41.33 0 86.67 5.34Q843-629 899-618q9 2 15 8.5t6 15.5v49q0 11-7 18t-18 7q-9 28-19.5 62.5T850-398q-26 44-58.5 61T698-320q-63 0-105.33-27.67Q550.33-375.33 530-434q-5.67-16-8.83-32-3.17-16-8.17-32-4-12-12-17.5t-21-5.5q-12 0-20 6t-13 17q-5 16-8.5 32t-8.5 32q-17 60-61 87t-107 27Zm0-46q77 0 105.67-48.33 28.66-48.34 28.66-115 0-25-18.33-35.5t-49.33-18.5q-30-7.67-67.67-9.17t-71.33 3.5q-30.67 4.67-46.17 17.33Q128-559 128-538q0 28.33 4.83 54.33 4.84 26 14.5 48.34 18 39.66 41.84 54.5Q213-366 262-366Zm436 0q49 0 73.5-15.17 24.5-15.16 40.83-54.16Q822-457.67 827-484q5-26.33 5-55 0-21.67-15.5-34.5-15.5-12.83-47.17-16.5-33.66-4.33-70.83-2.67-37.17 1.67-67.17 9.34-31 8-49.33 18.33-18.33 10.33-18.33 35.33 0 66.67 28.66 115.17Q621-366 698-366Z"/></svg>`,
    // luna.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M484-80q-84 0-157.5-32t-128-86.5Q144-253 112-326.5T80-484q0-146 93-257.5T410-880q-18 98.33 11 192.92 29 94.59 100 165.66t165.5 100.1Q781-392.3 880-410.31q-26 144.13-138 237.22T484-80Zm0-66.67q96 0 175.67-52.66Q739.33-252 787-336.33q-88.67-8-169.67-42.17-81-34.17-143.66-96.5Q411-537.33 377-618t-41.67-168.67q-84.33 46.34-136.5 126.5Q146.67-580 146.67-484q0 140.56 98.39 238.94 98.38 98.39 238.94 98.39ZM473.33-475Z"/></svg>`,
    // maleta.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M146.67-120q-27.5 0-47.09-19.58Q80-159.17 80-186.67v-466.66q0-27.5 19.58-47.09Q119.17-720 146.67-720H320v-93.33q0-27.5 19.58-47.09Q359.17-880 386.67-880h186.66q27.5 0 47.09 19.58Q640-840.83 640-813.33V-720h173.33q27.5 0 47.09 19.58Q880-680.83 880-653.33v466.66q0 27.5-19.58 47.09Q840.83-120 813.33-120H146.67Zm240-600h186.66v-93.33H386.67V-720Zm-142 66.67h-98v466.66h98v-466.66Zm404.66 466.66v-466.66h-338v466.66h338ZM716-653.33v466.66h97.33v-466.66H716Zm-236 230Z"/></svg>`,
    // menu-comida.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M226.67-80q-27 0-46.84-19.83Q160-119.67 160-146.67v-96h-40v-66.66h40v-137.34h-40v-66.66h40v-137.34h-40v-66.66h40v-96q0-27 19.83-46.84Q199.67-880 226.67-880h506.66q27 0 46.84 19.83Q800-840.33 800-813.33v666.66q0 27-19.83 46.84Q760.33-80 733.33-80H226.67Zm0-66.67h506.66v-666.66H226.67v96h40v66.66h-40v137.34h40v66.66h-40v137.34h40v66.66h-40v96Zm0 0v-666.66 666.66ZM383.33-280h53.34v-160q27.44-6.91 45.39-28.12Q500-489.33 500-516.79V-680h-40v151h-30v-151h-40v151h-30v-151h-40v163q0 27.67 17.94 48.88 17.95 21.21 45.39 28.12v160Zm223.34 0H660v-400q-50 0-81.67 31.67-31.66 31.66-31.66 81.66V-440h60v160Z"/></svg>`,
    // mochila.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M266.67-80q-27 0-46.84-19.83Q200-119.67 200-146.67v-340q0-87 47.5-156.33Q295-712.33 370-744.67v-22q0-46 32.12-79.66 32.12-33.67 78-33.67T558-846.33q32 33.66 32 79.66v22Q665-712.33 712.5-643T760-486.67v340q0 27-19.83 46.84Q720.33-80 693.33-80H266.67Zm0-66.67h426.66v-340.11q0-88.22-62.36-150.72Q568.62-700 480.14-700q-88.47 0-150.97 62.4t-62.5 150.93v340Zm383.5-189.83Q660-346.33 660-360v-120H300v66.67h293.33V-360q0 13.67 9.84 23.5 9.83 9.83 23.5 9.83 13.66 0 23.5-9.83ZM436.67-764q7-1.33 20.33-2 13.33-.67 23-.67t23 .67q13.33.67 20.33 2v-2.67q0-19-12.16-32.83Q499-813.33 480-813.33t-31.17 13.83q-12.16 13.83-12.16 32.83v2.67Zm-170 617.33H693.33 266.67Z"/></svg>`,
    // mundo-sudamerica.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5Zm156-35.17L450.67-176q-6.67-6.67-9.34-13.95-2.66-7.29-2.66-15.61v-233.11q-34.38 0-58.86-24.28-24.48-24.28-24.48-58.38v-41.78L225-693.67q-37 44-57.67 98.1-20.66 54.11-20.66 115.49 0 139.41 96.87 236.41 96.88 97 236.46 97Zm41.33-2Q645.67-165 729.5-258.33q83.83-93.34 83.83-221.52 0-138.6-97.44-236.04-97.43-97.44-236.04-97.44-45.85 0-87.68 11.83-41.84 11.83-78.84 33.17V-688h147.92q18.75 0 35.92 8 17.16 8 28.83 23.33L584.25-584h62.42q17 0 29.16 12.17Q688-559.67 688-542.67v44.09q0 9.45-2.5 17.85-2.5 8.4-7.5 16.4l-156.67 234.4v81.26Z"/></svg>`,
    // mundo.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q78 0 147.67 28.17 69.66 28.16 123.33 77.16t87.33 116q33.67 67 40 144.67-16.66-9.67-34.33-16.33-17.67-6.67-36.67-11-15.66-85-69.16-151t-133.5-99V-774q0 34.33-23.84 59.5-23.83 25.17-58.16 25.17H438v84.66q0 17-12.83 28.17-12.84 11.17-29.84 11.17h-82V-480H598q-31 31.33-47.83 71.33-16.84 40-16.84 84.67 0 76 31.34 117.33 31.33 41.34 79 91.67Q605-97.67 564-88.83 523-80 480-80Zm-42-68v-80.67q-34.33 0-58.17-25.16Q356-279 356-313.33V-356L155.33-556.67q-4.33 19.34-6.5 38.34-2.16 19-2.16 38.33 0 127 82.83 222T438-148Zm364.5-129.5Q820-295 820-320t-17-42.5Q786-380 761-380q-26 0-43.5 17.5T700-320q0 25 17.5 42.5T760-260q25 0 42.5-17.5ZM760-80q-3 0-16-11l-4-7q-22-38-55.5-67.5T627-232q-14-20-20.5-43.5T600-324q0-66 47-111t113-45q66 0 113 45t47 111q0 25-6.5 48.5T893-232q-24 37-57.5 66.5T780-98l-4 7q-2 5-6.5 8t-9.5 3Z"/></svg>`,
    // mundo2.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M323.67-111.5q-73-31.5-127.17-85.67-54.17-54.16-85.33-127.5Q80-398 80-481.5q0-83.5 31.17-156 31.16-72.5 85.33-126.67 54.17-54.16 127.17-85 73-30.83 156.5-30.83t156.33 30.83q72.83 30.84 127 85Q817.67-710 848.83-637.5 880-565 880-481.5t-31.17 156.83q-31.16 73.34-85.33 127.5-54.17 54.17-127 85.67T480.17-80q-83.5 0-156.5-31.5ZM480-146q32-36 54-80t36-101.33H390.67Q404-272.67 426-227.67T480-146Zm-91.33-13.33q-22.67-36.34-39.17-77.5Q333-278 322-327.33H182.67q35 64 82.83 103.33t123.17 64.67ZM572-160q66.67-21.33 119.5-64.33t85.83-103H638.67Q627-278.67 610.83-237.5 594.67-196.33 572-160ZM158-394h151.33q-3-24.67-3.83-45.5-.83-20.83-.83-41.83 0-23.67 1.16-43.17Q307-544 310-566.67H158q-6.33 22.67-8.83 41.84-2.5 19.16-2.5 43.5 0 24.33 2.5 44.5 2.5 20.16 8.83 42.83Zm219.33 0h206q3.67-27.33 4.84-46.83 1.16-19.5 1.16-40.5 0-20.34-1.16-39.17-1.17-18.83-4.84-46.17h-206q-3.66 27.34-4.83 46.17-1.17 18.83-1.17 39.17 0 21 1.17 40.5t4.83 46.83ZM650-394h152q6.33-22.67 8.83-42.83 2.5-20.17 2.5-44.5 0-24.34-2.5-43.5-2.5-19.17-8.83-41.84H650.67q3 30 4.16 48.84Q656-499 656-481.33q0 21.66-1.5 41.16-1.5 19.5-4.5 46.17Zm-12-239.33h139.33Q745.67-696 692.83-739q-52.83-43-121.5-61.67Q594-765 610.17-724.5 626.33-684 638-633.33Zm-247.33 0h180q-11.34-50-35-96-23.67-46-55.67-83.34-30 30-51 72.34-21 42.33-38.33 107Zm-208 0h140Q333-682 348.83-722.17 364.67-762.33 388-800q-68.67 18.67-120.5 61t-84.83 105.67Z"/></svg>`,
    // nadando.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M80-120v-69.33q36.67-2 57.33-20.67 20.67-18.67 70-18.67 49.34 0 75.67 21t63.67 21q37.33 0 60.66-21 23.34-21 72.67-21t75.67 21q26.33 21 63.66 21 37.34 0 61-21 23.67-21 73-21 49.34 0 69.67 18.67t57 20.67V-120q-43-2-66.17-21.67-23.16-19.66-60.5-19.66-37.33 0-62.33 20.66Q666-120 619.33-120q-46.66 0-74.33-20.67-27.67-20.66-65-20.66t-63.33 20.66Q390.67-120 344-120t-73-20.67q-26.33-20.66-63.67-20.66-37.33 0-60.83 19.66Q123-122 80-120Zm0-185.33V-372q36.67-2 57.33-20.33 20.67-18.34 70-18.34 49.34 0 74.5 19.34Q307-372 344-372q37.33 0 62-19.33 24.67-19.34 74-19.34t74.33 19.34q25 19.33 62.34 19.33Q654-372 679-391.33q25-19.34 74.33-19.34 49.34 0 69.67 18.34Q843.33-374 880-372v66.67q-43-2-66.17-21.67-23.16-19.67-60.5-19.67-37.33 0-61.83 20.67t-72.17 20.67q-47 0-74.5-20.67T480-346.67q-38 0-61.83 20.67-23.84 20.67-71.5 20.67-47.67 0-74.84-20.67-27.16-20.67-64.5-20.67-37.33 0-60.83 19.67T80-305.33ZM284-512l134.33-134.33L369-695.67q-33.67-33.66-69.33-46.33Q264-754.67 210-754.67v-86q73 0 120.33 17.5 47.34 17.5 92.34 62.5l254 254q-13 9.67-28 14.5-15 4.84-32 4.84-37.34 0-62.67-20.67t-74-20.67q-48.67 0-73.67 20.67T344-487.33q-19 0-34-6.84Q295-501 284-512Zm452.67-297.83q28 28.16 28 68.5 0 40.66-28 68.66t-68.67 28q-40.67 0-68.67-28t-28-68.66q0-40.34 28-68.5Q627.33-838 668-838t68.67 28.17Z"/></svg>`,
    // pasaporte.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M340-220h280v-60H340v60Zm140-120q83 0 141.5-58.5T680-540q0-83-58.5-141.5T480-740q-83 0-141.5 58.5T280-540q0 83 58.5 141.5T480-340Zm0-67q-8-11-17-36.5T451-510h58q-3 41-12 66.5T480-407Zm-72-13q-24-15-41-38t-23-52h47q2 25 6 47.5t11 42.5Zm144 0q7-20 11-42.5t6-47.5h47q-6 29-23 52t-41 38ZM344-570q6-29 23-52t41-38q-7 20-11 42.5t-6 47.5h-47Zm107 0q3-41 12-66.5t17-36.5q8 11 17 36.5t12 66.5h-58Zm118 0q-2-25-6-47.5T552-660q24 15 41 38t23 52h-47ZM160-80v-800h573.33q27.5 0 47.09 19.58Q800-840.83 800-813.33v666.66q0 27.5-19.58 47.09Q760.83-80 733.33-80H160Zm66.67-66.67h506.66v-666.66H226.67v666.66Zm0 0v-666.66 666.66Z"/></svg>`,
    // persona.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M164.67-80v-228.67H274V-80H164.67Zm208 0v-502Q320-560.33 297-516.5t-23 105.83h-66.67q0-124 73.67-194t200.33-70q106 0 161.34-43.5Q698-761.67 698-864h66.67q0 92.67-41.5 154.83-41.5 62.17-129.84 85.84V-80h-66.66v-250h-87.34v250h-66.66Zm108.72-649.33q-31.06 0-53.22-22.12Q406-773.56 406-804.61q0-31.06 22.11-53.22Q450.23-880 481.28-880t53.22 22.11q22.17 22.12 22.17 53.17t-22.12 53.22q-22.11 22.17-53.16 22.17Z"/></svg>`,
    // silla-playa.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M505.33-120v-444.67q-14.66-20.66-38.16-33-23.5-12.33-51.5-12.33t-51.5 13.17q-23.5 13.16-38.84 34.83H260q0-115.67 81.11-196.83Q422.22-840 538.67-840q116.72 0 198.02 81.17Q818-677.67 818-562h-65.33q-15.34-21.67-38.74-34.83Q690.54-610 662-610q-27.67 0-51.17 12.33Q587.33-585.33 572-564v444h-66.67Zm26.34-513.33h14.66q23.19-20.59 52.93-31.96Q629-676.67 663-676.67q16.04 0 31.35 2.84 15.32 2.83 30.32 8.16-27-49-76.34-78.33Q599-773.33 539-773.33T429.67-744q-49.34 29.33-76.34 78.33 15-5.33 30.32-8.16 15.31-2.84 31.35-2.84 34 0 63.74 11.38 29.74 11.37 52.93 31.96ZM645.33-120v-237.33H880V-120h-66.67v-170.67H712V-120h-66.67ZM160-120v-118q-17.33-1.67-29.95-14.31-12.61-12.63-14.72-30.69L80-675.33h20.78q19.12 0 33.67 13.33T151-629.67l25.33 272.34h189q27 0 46.84 19.83Q432-317.67 432-290.67v53.34h-40.67V-120h-46.66v-117.33h-138V-120H160Zm379.33-513.33Z"/></svg>`,
    // ski.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M740.67-40q-24.67 0-48.84-4-24.16-4-47.16-11.33L80.67-261 96-305.33l284.67 103.66 69.66-180L296.67-542q-24.34-26.67-19.17-61.5 5.17-34.83 35.83-52.83L463-743q15-8.67 31.5-9.5 16.5-.83 31.5 4.83 15 5.34 26.83 17Q564.67-719 570-703l13 43q15.67 50.33 47.17 83.33t76.5 49.34l21-64L772-578l-41 126.67q-70-13.34-123-55.34t-80-110l-121.67 70 123 142.67L443-179.33l136.67 49.66L670.33-410q11.34 3.67 22 6.67 10.67 3 21.67 5.33l-91 284.67 37.67 13q18.66 6.66 38.5 10.16 19.83 3.5 41.5 3.5 28 0 53.83-5.33t50.5-17.33l35 35q-32.67 17-67 25.66Q778.67-40 740.67-40Zm-128.5-691.5Q590-753.67 590-784.67t22.17-53.16Q634.33-860 665.33-860q31 0 53.17 22.17 22.17 22.16 22.17 53.16 0 31-22.17 53.17t-53.17 22.17q-31 0-53.16-22.17Z"/></svg>`,
    // sofa.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M813.33-80v-606.67q0-36.33-25.16-61.5-25.17-25.16-61.5-25.16H680v58.66q0 9.15-6.1 15.24-6.09 6.1-15.23 6.1h-224q-11.34 0-17.17-12.34-5.83-12.33-.83-22.33l76-164q5.66-13 17.76-20.5 12.1-7.5 28.24-7.5h92q21.14 0 35.23 16 14.1 16 14.1 37.33V-840h46.67q64 0 108.66 44.67Q880-750.67 880-686.67V-80h-66.67ZM504.67-760h108.66v-93.33h-66.66l-42 93.33ZM193.33-80q-48.16 0-80.75-32.58Q80-145.17 80-193.33v-100q0-30.34 22-57.63 22-27.29 58-33.04v-96q0-27.5 19.58-47.08 19.59-19.59 47.09-19.59H560q27.5 0 47.08 19.59 19.59 19.58 19.59 47.08v96q36 5.73 58 31.53t22 59.14v100q0 48.16-32.59 80.75Q641.5-80 593.33-80h-400Zm33.34-400v110q18 15 29 34.45 11 19.45 11 42.22v26.66H520v-26.66q0-22.77 11-42.22T560-370v-110H226.67Zm-33.34 333.33h400q21 0 33.84-14.58Q640-175.83 640-193.33v-100q0-12-7.33-19.34-7.34-7.33-19.34-7.33T594-312.67q-7.33 7.34-7.33 19.34V-200H200v-93.33q0-12-7.33-19.34-7.34-7.33-19.34-7.33T154-312.67q-7.33 7.34-7.33 19.34v100q0 17.5 12.83 32.08 12.83 14.58 33.83 14.58Zm326.67-120H266.67 520ZM226.67-480H560 226.67ZM200-146.67h386.67H200Z"/></svg>`,
    // sombrilla.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="m790.67-125.33-260-260L580-434.67l260 260-49.33 49.34Zm-562-40Q173.33-224 146.67-296 120-368 120-442.67q0-78 29-152T237.33-728q59.34-59.33 133.84-88.5t152.5-29.17q74.66 0 146.5 26.84Q742-792 800-736.67L228.67-165.33Zm4.66-100 64-64.67q-16-21.67-31.5-46t-28.5-50.67q-13-26.33-22-54-9-27.66-13.33-56-21.67 69-12.83 140 8.83 71 44.16 131.34Zm115.34-113.34 238-240q-45-35-91.17-55.5T408-701.5q-41.33-6.83-73.83-.83T284-678.67q-17.67 18-22.67 50.5t2.5 73q7.5 40.5 28.67 85.84 21.17 45.33 56.17 90.66ZM635.33-668 702-732q-61.67-38.67-133-46.67t-140.33 15.34Q456-759 483-750t53.33 21.17q26.34 12.16 51.17 27.66 24.83 15.5 47.83 33.17Z"/></svg>`,
    // teleferico.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M194.67-120q-30.8 0-52.74-21.93Q120-163.87 120-194.67v-248Q120-508 166-554t110-46h170.67v-122.33L40-611.33v-66l209.67-57.34q-3.34-5.66-4.84-11.87-1.5-6.21-1.5-13.46 0-22.22 15.82-37.78 15.81-15.55 38.4-15.55 20.78 0 36.45 14.66 15.67 14.67 16.33 36.34l96.34-26V-840h66.66v33l103.34-27.67q-3.67-6-5.5-12.5-1.84-6.5-1.84-14.16 0-22.5 15.82-38.25 15.81-15.75 38.4-15.75 20.78 0 36.62 15.33 15.83 15.33 16.5 37.67L920-918v66.67l-406.67 111V-600h171.34q64.66 0 110 46Q840-508 840-442.67v248q0 30.8-21.74 52.74Q796.53-120 766-120H194.67Zm-8-66.67h586.66v-98H186.67v98Zm0-164.66h151v-182H276q-36.33 0-62.83 26.63t-26.5 64.03v91.34Zm217.66 0h151v-182h-151v182Zm218 0h151v-91.33q0-37.67-26.04-64.17-26.05-26.5-62.62-26.5h-62.34v182ZM186.67-186.67v-98 98Z"/></svg>`,
    // tren.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M160-340v-380q0-45 21.83-75.83 21.84-30.84 63.17-49.34 41.33-18.5 100.83-26.66Q405.33-880 480-880q79.33 0 139.17 7.83 59.83 7.84 100 26.34 40.16 18.5 60.5 49Q800-766.33 800-720v380q0 59-40.5 99.5T660-200l60 60v20h-73.33l-80-80H393.33l-80 80H240v-20l60-60q-59 0-99.5-40.5T160-340Zm320-473.33q-115.33 0-167 14.5T240-760h483.33q-17-23.67-72.5-38.5-55.5-14.83-170.83-14.83ZM226.67-550h222.66v-143.33H226.67V-550ZM660-483.33H226.67h506.66H660ZM516-550h217.33v-143.33H516V-550ZM377-333q16.33-16.33 16.33-40.33T377-413.67Q360.67-430 336.67-430t-40.34 16.33Q280-397.33 280-373.33q0 24 16.33 40.33 16.34 16.33 40.34 16.33 24 0 40.33-16.33Zm286.67 0Q680-349.33 680-373.33t-16.33-40.34Q647.33-430 623.33-430q-24 0-40.33 16.33-16.33 16.34-16.33 40.34 0 24 16.33 40.33t40.33 16.33q24 0 40.33-16.33ZM300-263.33h360q31.33 0 52.33-22.34 21-22.33 21-54.33v-143.33H226.67V-340q0 32 21 54.33 21 22.34 52.33 22.34ZM480-760h243.33H240h240Z"/></svg>`,
    // ubicacion.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5Zm156-163.17q41.67-42.33 74.43-87.06 28.09-38.21 51.5-83.87 23.4-45.67 23.4-90.4 0-62-43.66-105.67Q542-685.33 480-685.33t-105.67 43.66Q330.67-598 330.67-536.25q0 44.92 23.4 90.6 23.41 45.68 51.5 83.9Q438.33-317 480-274.67Zm-39.83-221.66Q424-512.67 424-536q0-23.33 16.17-39.67Q456.33-592 480-592q23.67 0 39.83 16.33Q536-559.33 536-536q0 23.33-16.17 39.67Q503.67-480 480-480q-23.67 0-39.83-16.33Z"/></svg>`,
    // valija.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M266.67-120q-27.5 0-47.09-19.58Q200-159.17 200-186.67v-466.66q0-27.5 19.58-47.09Q239.17-720 266.67-720h96.66v-93.33q0-27.5 19.59-47.09Q402.5-880 430-880h100q27.5 0 47.08 19.58 19.59 19.59 19.59 47.09V-720h96.66q27.5 0 47.09 19.58Q760-680.83 760-653.33v466.66q0 27.5-19.58 47.09Q720.83-120 693.33-120q0 17-11.5 28.5T653.33-80q-17 0-28.5-11.5t-11.5-28.5H346.67q0 17-11.5 28.5T306.67-80q-17 0-28.5-11.5t-11.5-28.5Zm0-66.67h426.66v-466.66H266.67v466.66ZM363.33-240H430v-360h-66.67v360ZM530-240h66.67v-360H530v360ZM430-720h100v-93.33H430V-720Zm50 300Z"/></svg>`,
    // valija2.svg
    `<svg class="w-16 h-16" xmlns="http://www.w3.org/2000/svg" height="40px" viewBox="0 -960 960 960" width="40px" fill="currentColor"><path d="M266.67-80v-43.33q-27.67 0-47.17-19.59Q200-162.5 200-190v-463.33q0-27.5 19.58-47.09Q239.17-720 266.67-720h96.66v-123.33q0-15 10.84-25.84Q385-880 400-880h160q15 0 25.83 10.83 10.84 10.84 10.84 25.84V-720h96.66q27.5 0 47.09 19.58Q760-680.83 760-653.33V-190q0 27.5-19.58 47.08-19.59 19.59-47.09 19.59V-80h-66.66v-43.33H333.33V-80h-66.66ZM430-720h100v-93.33H430V-720Zm160.83 223.5q54.5-13.17 102.5-42.83v-114H266.67v114q48 29.66 102.5 42.83 54.5 13.17 110.83 13.17t110.83-13.17ZM446.67-373.33v-41.34q-48-3.66-93.34-16Q308-443 266.67-466v276h426.66v-276q-41.33 23-86.66 35.33-45.34 12.34-93.34 16v41.34h-66.66Zm33.33 0Zm0-110Zm0 17.33Z"/></svg>`
];

// Variable global para controlar peticiones abortables
window.activeRequestController = null;

function getAbortSignal(forceNew = false) {
    if (forceNew && window.activeRequestController) {
        try {
            window.activeRequestController.abort();
        } catch (e) {}
        window.activeRequestController = null;
    }
    if (!window.activeRequestController) {
        window.activeRequestController = new AbortController();
    }
    return window.activeRequestController.signal;
}
window.getAbortSignal = getAbortSignal;

function showLoader(text = 'Cargando...') {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    // Prevent body scrolling while loading
    document.body.classList.add('overflow-hidden');

    let overlay = document.getElementById('app-loader-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'app-loader-overlay';
        overlay.className = 'bg-slate-50/80 backdrop-blur-sm flex flex-col items-center justify-center gap-6 transition-opacity duration-300 opacity-0';
        overlay.innerHTML = `
            <div class="relative flex items-center justify-center">
                <span id="loading-travel-icon" class="block w-16 h-16 text-brand-primary transition-all duration-100 ease-in-out transform">
                    <!-- Default compass icon -->
                    <svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"></polygon>
                    </svg>
                </span>
            </div>
            <span id="loading-text" class="text-base font-bold text-slate-800 text-center max-w-xs select-none">Cargando...</span>
        `;
        appEl.appendChild(overlay);

        // Force browser reflow to enable transition
        overlay.offsetHeight;
    }

    const loadingText = overlay.querySelector('#loading-text');
    if (loadingText) {
        let formattedText = text.trim();
        // Convert to sentence case if it is sustained uppercase
        if (formattedText === formattedText.toUpperCase()) {
            formattedText = formattedText.toLowerCase();
        }
        if (formattedText) {
            formattedText = formattedText.charAt(0).toUpperCase() + formattedText.slice(1);
        }
        loadingText.innerText = formattedText || 'Cargando...';
    }

    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');

    startLoaderIconCycling();
}

function hideLoader() {
    // Restore scrolling
    document.body.classList.remove('overflow-hidden');

    const overlay = document.getElementById('app-loader-overlay');
    if (!overlay) return;

    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');

    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 300);

    stopLoaderIconCycling();
}

let unshownIconIndices = [];

function getNextRandomIcon() {
    if (!unshownIconIndices || unshownIconIndices.length === 0) {
        unshownIconIndices = Array.from({ length: loadingTravelIcons.length }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = unshownIconIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [unshownIconIndices[i], unshownIconIndices[j]] = [unshownIconIndices[j], unshownIconIndices[i]];
        }
    }
    return unshownIconIndices.pop();
}

function startLoaderIconCycling() {
    if (loadingIconInterval) clearInterval(loadingIconInterval);
    
    currentLoadingIconIdx = getNextRandomIcon();

    const container = document.getElementById('loading-travel-icon');
    if (container) {
        container.innerHTML = loadingTravelIcons[currentLoadingIconIdx];
    }

    loadingIconInterval = setInterval(() => {
        const container = document.getElementById('loading-travel-icon');
        if (!container) return;

        container.classList.add('opacity-0', 'scale-75');

        setTimeout(() => {
            currentLoadingIconIdx = getNextRandomIcon();
            container.innerHTML = loadingTravelIcons[currentLoadingIconIdx];
            container.classList.remove('opacity-0', 'scale-75');
        }, 100);
    }, 400);
}

function stopLoaderIconCycling() {
    if (loadingIconInterval) {
        clearInterval(loadingIconInterval);
        loadingIconInterval = null;
    }
}

window.showLoader = showLoader;
window.hideLoader = hideLoader;

let currentConfirmCallback = null;
let currentCancelCallback = null;

function showCustomConfirm({ title, desc, btnText, confirmColorClass, callback, cancelCallback }) {
    const titleEl = document.getElementById('confirm-modal-title');
    const descEl = document.getElementById('confirm-modal-desc');
    const confirmBtn = document.getElementById('confirm-modal-btn-confirm');

    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerText = desc;
    if (confirmBtn) {
        confirmBtn.innerText = btnText || 'Confirmar';
        // Reset classes
        confirmBtn.className = "flex-1 px-4 py-2.5 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer";
        if (confirmColorClass) {
            confirmBtn.className += " " + confirmColorClass;
        } else {
            confirmBtn.className += " bg-brand-primary hover:bg-brand-primary/95 shadow-brand-primary/20";
        }
    }

    currentConfirmCallback = callback;
    currentCancelCallback = cancelCallback || null;

    const modal = document.getElementById('confirm-modal');
    const box = document.getElementById('confirm-modal-box');
    if (modal && box) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
        box.classList.remove('scale-90');
        box.classList.add('scale-100');
    }
}
window.showCustomConfirm = showCustomConfirm;

function closeConfirmModal(confirmAction) {
    const modal = document.getElementById('confirm-modal');
    const box = document.getElementById('confirm-modal-box');
    if (modal && box) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        box.classList.add('scale-90');
        box.classList.remove('scale-100');
    }

    if (confirmAction) {
        if (currentConfirmCallback) currentConfirmCallback();
    } else {
        if (currentCancelCallback) currentCancelCallback();
    }
    currentConfirmCallback = null;
    currentCancelCallback = null;
}
window.closeConfirmModal = closeConfirmModal;

// Sidebar toggle behavior (mobile drawer and desktop collapse)
function toggleSidebar(force) {
    const isMobile = window.innerWidth < 1024;
    const innerChevron = document.getElementById('sidebar-inner-chevron');

    if (isMobile) {
        // Mobile drawer behavior
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!sidebar || !backdrop) return;

        const isOpen = sidebar.classList.contains('translate-x-0');
        const shouldOpen = typeof force === 'boolean' ? force : !isOpen;

        if (shouldOpen) {
            sidebar.classList.remove('-translate-x-full');
            sidebar.classList.add('translate-x-0');
            backdrop.classList.remove('hidden');
            backdrop.classList.add('block');
        } else {
            sidebar.classList.add('-translate-x-full');
            sidebar.classList.remove('translate-x-0');
            backdrop.classList.remove('block');
            backdrop.classList.add('hidden');
        }
    } else {
        // Desktop collapse inline behavior
        const body = document.body;
        const shouldCollapse = typeof force === 'boolean' ? !force : !body.classList.contains('sidebar-collapsed');

        if (shouldCollapse) {
            body.classList.add('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'true');
            if (innerChevron) innerChevron.classList.add('rotate-180');
        } else {
            body.classList.remove('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'false');
            if (innerChevron) innerChevron.classList.remove('rotate-180');
        }
    }

    updateHomeButtonVisibility();
}
window.toggleSidebar = toggleSidebar;

function updateHomeButtonVisibility() {
    const isMobile = window.innerWidth < 1024;
    const homeBtn = document.getElementById('top-nav-inicio-btn');
    if (!homeBtn) return;

    if (isMobile) {
        const sidebar = document.getElementById('app-sidebar');
        const isOpen = sidebar && sidebar.classList.contains('translate-x-0');
        if (isOpen) {
            homeBtn.classList.add('hidden');
        } else {
            homeBtn.classList.remove('hidden');
        }
    } else {
        const isCollapsed = document.body.classList.contains('sidebar-collapsed');
        if (isCollapsed) {
            homeBtn.classList.remove('hidden');
        } else {
            homeBtn.classList.add('hidden');
        }
    }
}
window.updateHomeButtonVisibility = updateHomeButtonVisibility;
window.addEventListener('resize', updateHomeButtonVisibility);

// Fallback for loading quick budgets when cotizacion_rapida.js is not loaded yet
window.loadQuickBudgetIntoForm = function(quoteId) {
    const isFormPage = !!document.getElementById('quick-budget-body');
    if (!isFormPage) {
        window.pendingEditQuickBudgetId = quoteId;
        window.navigateTo(`/cotizacion-rapida?id=${quoteId}`);
    }
};

let faviconTimer = null;
function changeFavicon(type) {
    if (faviconTimer) {
        clearTimeout(faviconTimer);
        faviconTimer = null;
    }

    const faviconEl = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel="shortcut icon"]');
    if (!faviconEl) return;

    let href = '/assets/favicon.png';
    let duration = 0;

    switch (type) {
        case 'loading':
            href = '/assets/favicon-loading.png';
            break;
        case 'success':
            href = '/assets/favicon-ok.png';
            duration = 3000;
            break;
        case 'error':
            href = '/assets/favicon-error.png';
            duration = 4000;
            break;
        case 'default':
        default:
            href = '/assets/favicon.png';
            break;
    }

    faviconEl.setAttribute('href', href + '?v=' + Date.now());

    if (duration > 0) {
        faviconTimer = setTimeout(() => {
            changeFavicon('default');
        }, duration);
    }
}
window.changeFavicon = changeFavicon;
