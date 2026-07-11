// Client-side Session State
let authToken = localStorage.getItem('authToken') || null;
let loggedInUser = localStorage.getItem('loggedInUser') || null;

// Initialize sidebar collapse state on desktop early
if (window.innerWidth >= 1024) {
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
    }
}

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
    '/ver-cotizacion': { html: '/static/views/ver_cotizacion.html', js: '/static/js/cotizar.js', init: 'initVerCotizacion' }
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

let isSessionChecked = false;

async function router() {
    // Silently restore session via cookie once on startup if no token is in memory
    if (!window.authToken && !isSessionChecked) {
        isSessionChecked = true;
        try {
            const res = await fetch('/api/auth/refresh', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setSession(data.access_token, data.username);
            }
        } catch (err) {
            console.warn("No active session cookie found or refresh failed:", err);
        }
    }

    let path = window.location.pathname;
    
    // Auth Guards
    if (!window.authToken && path !== '/login') {
        history.pushState(null, null, '/login');
        path = '/login';
    } else if (window.authToken && (path === '/login' || path === '/')) {
        history.pushState(null, null, '/inicio');
        path = '/inicio';
    } else if (path === '/cotizaciones-rapidas') {
        history.pushState(null, null, '/editar?tab=rapidos');
        path = '/editar';
    }

    const route = routes[path] || routes['/inicio'];
    
    // Handle Sidebar and Mobile Header visibility based on route
    const sidebarEl = document.getElementById('app-sidebar');
    const wrapperEl = document.getElementById('main-content-wrapper');
    const headerEl = document.getElementById('app-top-header');
    
    if (sidebarEl && wrapperEl) {
        if (path === '/login') {
            sidebarEl.classList.add('hidden');
            if (headerEl) headerEl.classList.add('hidden');
            wrapperEl.classList.remove('lg:pl-[260px]');
        } else {
            sidebarEl.classList.remove('hidden');
            if (headerEl) headerEl.classList.remove('hidden');
            wrapperEl.classList.add('lg:pl-[260px]');
            updateNavActiveState(path);

            // Initialize toggle chevron rotation state
            const chevron = document.getElementById('sidebar-toggle-chevron');
            if (chevron) {
                if (window.innerWidth >= 1024) {
                    const isCollapsed = document.body.classList.contains('sidebar-collapsed');
                    if (isCollapsed) chevron.classList.add('rotate-180');
                    else chevron.classList.remove('rotate-180');
                } else {
                    const isDrawerOpen = sidebarEl.classList.contains('translate-x-0');
                    if (isDrawerOpen) chevron.classList.remove('rotate-180');
                    else chevron.classList.add('rotate-180');
                }
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

    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.classList.add('sidebar-item-active');
    }
}

// User session auth operations
function logoutAgent(notifyServer = true) {
    if (notifyServer) {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setSession(null, null);
    isConfigLoaded = false;

    // Reset sidebar and mobile logo, and hide agent badge
    const badge = document.getElementById('sidebar-user-badge');
    if (badge) {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
    }
    const navLogo = document.getElementById('sidebar-logo');
    if (navLogo) {
        navLogo.src = '/assets/Banner%20letra%20O.png';
    }
    const mobileLogo = document.getElementById('mobile-logo');
    if (mobileLogo) {
        mobileLogo.src = '/assets/Banner%20letra%20O.png';
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
    // Brújula
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"></polygon></svg>`,
    // Avión
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 12h-7.5l-3.5 3.5V12H6.5c-1.38 0-2.5-1.12-2.5-2.5S5.12 7 6.5 7H8V3.5L11.5 7H19c1.66 0 3 1.34 3 3s-1.34 3-3 3z" /></svg>`,
    // Palmera
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M12 6c4-3 8-1 9 2M12 8c-4-3-8-1-9 2M12 10c3-2 6-2 8 0M12 12c-3-2-6-2-8 0M12 7c2-1 4-1 6-2M12 9c-2-1-4-1-6-2"></path></svg>`,
    // Valija
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><rect x="3" y="6" width="18" height="13" rx="2" ry="2" stroke-linejoin="round"></rect><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke-linecap="round" stroke-linejoin="round"></path><line x1="12" y1="11" x2="12" y2="14" stroke-linecap="round"></line></svg>`,
    // Mapa
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>`,
    // Globo terráqueo
    `<svg class="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>`
];

function showLoader(text = 'Cargando...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (!overlay) return;

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

    overlay.classList.remove('hidden');
    overlay.classList.add('flex', 'opacity-100');
    
    startLoaderIconCycling();
}

function hideLoader() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    
    setTimeout(() => {
        overlay.classList.remove('flex');
        overlay.classList.add('hidden');
        overlay.classList.remove('opacity-0');
    }, 200);
    
    stopLoaderIconCycling();
}

function startLoaderIconCycling() {
    if (loadingIconInterval) clearInterval(loadingIconInterval);
    currentLoadingIconIdx = 0;
    
    const container = document.getElementById('loading-travel-icon');
    if (container) {
        container.innerHTML = loadingTravelIcons[0];
    }
    
    loadingIconInterval = setInterval(() => {
        const container = document.getElementById('loading-travel-icon');
        if (!container) return;
        
        container.classList.add('opacity-0', 'scale-75');
        
        setTimeout(() => {
            currentLoadingIconIdx = (currentLoadingIconIdx + 1) % loadingTravelIcons.length;
            container.innerHTML = loadingTravelIcons[currentLoadingIconIdx];
            container.classList.remove('opacity-0', 'scale-75');
        }, 100);
    }, 500);
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
    const chevron = document.getElementById('sidebar-toggle-chevron');
    
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
            if (chevron) chevron.classList.remove('rotate-180');
        } else {
            sidebar.classList.add('-translate-x-full');
            sidebar.classList.remove('translate-x-0');
            backdrop.classList.remove('block');
            backdrop.classList.add('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        }
    } else {
        // Desktop collapse inline behavior
        const body = document.body;
        const shouldCollapse = typeof force === 'boolean' ? !force : !body.classList.contains('sidebar-collapsed');
        
        if (shouldCollapse) {
            body.classList.add('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'true');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            body.classList.remove('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', 'false');
            if (chevron) chevron.classList.remove('rotate-180');
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
