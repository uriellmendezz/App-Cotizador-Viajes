// tabs.js - Pestañas internas de la aplicación
//
// La pestaña principal es la vista normal (#app). Cada pestaña extra es la app
// completa dentro de un iframe (clase .app-tab-frame), así cada una conserva su
// propio formulario, scroll y estado mientras el agente pasa de una a otra
// (ej. la cotización anterior en una pestaña y el formulario de recotización en otra).
//
// Atajos: Alt+T nueva pestaña · Alt+W cerrar pestaña · Alt+1..9 ir a la pestaña N.
// Ctrl+clic o clic con la rueda en el menú lateral abre la sección en una pestaña nueva.

(function () {
    // Dentro de una pestaña extra solo se reenvían los atajos al contenedor
    if (window.IS_EMBEDDED_TAB) {
        window.addEventListener('keydown', (e) => {
            try {
                if (window.top.AppTabs?.handleShortcut(e)) e.preventDefault();
            } catch (err) {}
        });
        return;
    }

    const MAIN_ID = 'main';
    const MAX_TABS = 8;
    const STORAGE_KEY = 'otg_app_tabs';
    const DEFAULT_PATH = '/inicio';
    // Rutas con formularios: al cerrar la pestaña se pide confirmación
    const FORM_ROUTES = ['/cotizacion-rapida', '/cotizacion-completa', '/cotizacion-multidestino', '/cotizacion-vuelos', '/cotizacion-grupal', '/cotizacion-crucero', '/paquetes'];

    const ICONS = {
        inicio: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
        rapida: 'M13 10V3L4 14h7v7l9-11h-7z',
        pdf: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        archivos: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
        comparar: 'M9 19V6l-2 2m2-2l2 2m4-2v13l2-2m-2 2l-2-2',
        paquetes: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
        config: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
    };

    function iconFor(path) {
        const p = (path || '').split('?')[0];
        if (p.startsWith('/cotizacion-rapida')) return ICONS.rapida;
        if (p.startsWith('/cotizacion-') || p === '/ver-cotizacion' || p === '/hacer-cotizacion') return ICONS.pdf;
        if (p === '/editar') return ICONS.archivos;
        if (p === '/comparar') return ICONS.comparar;
        if (p === '/paquetes') return ICONS.paquetes;
        if (p === '/configuracion' || p === '/administrar') return ICONS.config;
        return ICONS.inicio;
    }

    function routeName(path) {
        const p = (path || '').split('?')[0];
        try {
            if (typeof routeNames !== 'undefined' && routeNames[p]) return routeNames[p];
        } catch (e) {}
        return 'Nueva pestaña';
    }

    // "Cotización | One Trip" -> "Cotización"
    function cleanTitle(title, path) {
        const base = String(title || '').split(' | ')[0].trim();
        return base || routeName(path);
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const state = {
        tabs: [{ id: MAIN_ID, path: window.location.pathname + window.location.search, title: '' }],
        activeId: MAIN_ID,
        mainScrollY: 0
    };

    const getTab = (id) => state.tabs.find(t => t.id === id);
    const activeTab = () => getTab(state.activeId);

    function persist() {
        try {
            const extra = state.tabs
                .filter(t => t.id !== MAIN_ID)
                .map(({ id, path, title }) => ({ id, path, title }));
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
        } catch (e) {}
    }

    // Tras recargar se recuperan las pestañas (su contenido se carga al abrirlas)
    function restore() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
            if (Array.isArray(saved)) {
                saved.slice(0, MAX_TABS - 1).forEach(t => {
                    if (t && t.id && typeof t.path === 'string' && t.path.startsWith('/')) {
                        state.tabs.push({ id: t.id, path: t.path, title: t.title || '' });
                    }
                });
            }
        } catch (e) {}
    }

    function newId() {
        return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function observeTitle(tab, doc) {
        const titleEl = doc?.querySelector('title');
        if (!titleEl) return;
        tab.titleObserver?.disconnect();
        const update = () => {
            const next = cleanTitle(doc.title, tab.path);
            if (next !== tab.title) {
                tab.title = next;
                render();
                persist();
            }
        };
        tab.titleObserver = new MutationObserver(update);
        tab.titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
        update();
    }

    function createFrame(tab) {
        const container = document.getElementById('app-tab-frames');
        if (!container) return;
        const iframe = document.createElement('iframe');
        // La clase debe estar antes de cargar: main.js la usa para detectar el modo pestaña
        iframe.className = 'app-tab-frame';
        iframe.dataset.tabId = tab.id;
        iframe.title = cleanTitle(tab.title, tab.path);
        iframe.style.display = 'none';
        iframe.addEventListener('load', () => {
            try { observeTitle(tab, iframe.contentDocument); } catch (e) {}
        });
        iframe.src = tab.path;
        container.appendChild(iframe);
        tab.frame = iframe;
    }

    function activate(id) {
        const tab = getTab(id);
        if (!tab) return;

        const leavingMain = state.activeId === MAIN_ID && id !== MAIN_ID;
        if (leavingMain) state.mainScrollY = window.scrollY;

        state.activeId = id;
        if (tab.id !== MAIN_ID && !tab.frame) createFrame(tab);

        const mainPane = document.getElementById('app-main-pane');
        if (mainPane) mainPane.style.display = id === MAIN_ID ? '' : 'none';
        state.tabs.forEach(t => {
            if (t.frame) t.frame.style.display = t.id === id ? 'block' : 'none';
        });

        if (id === MAIN_ID) {
            window.scrollTo(0, state.mainScrollY || 0);
        } else {
            window.scrollTo(0, 0);
            try { tab.frame.contentWindow.focus(); } catch (e) {}
        }

        // El menú lateral marca la sección de la pestaña visible
        const route = (tab.route || tab.path || '').split('?')[0];
        if (typeof window.updateNavActiveState === 'function') window.updateNavActiveState(route);

        render();
    }

    function open(path = DEFAULT_PATH, { activate: shouldActivate = true, title = '' } = {}) {
        if (state.tabs.length >= MAX_TABS) {
            window.showAlert?.('warning', `Podés tener hasta ${MAX_TABS} pestañas abiertas. Cerrá alguna para abrir otra.`, true);
            return null;
        }
        const tab = { id: newId(), path, title };
        state.tabs.push(tab);
        createFrame(tab);
        persist();
        if (shouldActivate) activate(tab.id);
        else render();
        return tab.id;
    }

    function removeTab(id) {
        const idx = state.tabs.findIndex(t => t.id === id);
        if (idx <= 0) return;
        const [tab] = state.tabs.splice(idx, 1);
        tab.titleObserver?.disconnect();
        tab.frame?.remove();
        persist();
        if (state.activeId === id) {
            // Como en el navegador: se pasa a la pestaña de la derecha (o la de la izquierda)
            activate((state.tabs[idx] || state.tabs[idx - 1]).id);
        } else {
            render();
        }
    }

    function close(id) {
        if (id === MAIN_ID) return;
        const tab = getTab(id);
        if (!tab) return;
        const route = (tab.route || tab.path || '').split('?')[0];
        const hasForm = FORM_ROUTES.some(r => route.startsWith(r));
        if (hasForm && typeof window.showCustomConfirm === 'function') {
            window.showCustomConfirm({
                title: '¿Cerrar pestaña?',
                desc: `Se cerrará "${cleanTitle(tab.title, tab.path)}". Los datos que no hayas guardado en esa pestaña se van a perder.`,
                btnText: 'Cerrar pestaña',
                callback: () => removeTab(id)
            });
            return;
        }
        removeTab(id);
    }

    // El menú lateral navega dentro de la pestaña activa cuando es una pestaña extra
    function navigateActiveFrame(url) {
        const tab = activeTab();
        if (!tab || tab.id === MAIN_ID || !tab.frame) return false;
        try {
            const win = tab.frame.contentWindow;
            if (typeof win.navigateTo === 'function') {
                win.navigateTo(url);
                return true;
            }
        } catch (e) {}
        tab.frame.src = url;
        return true;
    }

    function onFrameRouted(frameEl, fullPath, route) {
        const tab = getTab(frameEl?.dataset?.tabId);
        if (!tab) return;
        tab.path = fullPath;
        tab.route = route;
        try { tab.title = cleanTitle(frameEl.contentDocument.title, fullPath); } catch (e) {}
        if (state.activeId === tab.id && typeof window.updateNavActiveState === 'function') {
            window.updateNavActiveState(route);
        }
        render();
        persist();
    }

    function onMainRouted(fullPath, route) {
        const main = getTab(MAIN_ID);
        main.path = fullPath;
        main.route = route;
        main.title = cleanTitle(document.title, fullPath);
        if (state.activeId !== MAIN_ID) {
            // Se navegó en la principal (ej. botón atrás del navegador): se muestra
            activate(MAIN_ID);
            return;
        }
        render();
    }

    // Al cerrar sesión se descartan todas las pestañas extra
    function reset() {
        state.tabs.slice(1).forEach(t => { t.titleObserver?.disconnect(); t.frame?.remove(); });
        state.tabs.length = 1;
        state.activeId = MAIN_ID;
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
        render();
    }

    function handleShortcut(e) {
        if (!e.altKey || e.ctrlKey || e.metaKey) return false;
        const key = (e.key || '').toLowerCase();
        if (key === 't') { open(); return true; }
        if (key === 'w') { close(state.activeId); return true; }
        if (/^[1-9]$/.test(key)) {
            const tab = state.tabs[parseInt(key, 10) - 1];
            if (tab) activate(tab.id);
            return true;
        }
        return false;
    }

    function render() {
        const list = document.getElementById('app-tabs-list');
        if (!list) return;
        const single = state.tabs.length === 1;

        list.innerHTML = state.tabs.map((tab, idx) => {
            const isActive = tab.id === state.activeId;
            const label = cleanTitle(tab.title, tab.path);
            const tabCls = isActive
                ? 'bg-slate-50 border-slate-200 text-slate-800 -mb-px'
                : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700';
            const closeBtn = tab.id === MAIN_ID ? '' : `
                <button type="button" data-tab-close="${tab.id}" title="Cerrar pestaña (Alt+W)"
                    class="shrink-0 p-0.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'} transition-all cursor-pointer">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>`;
            return `
                <div role="tab" aria-selected="${isActive}" data-tab-id="${tab.id}" title="${escapeHtml(label)}${idx < 9 ? ` (Alt+${idx + 1})` : ''}"
                    class="group flex items-center gap-1.5 h-8 pl-3 pr-1.5 ${single ? '' : 'min-w-[110px]'} max-w-[210px] rounded-t-lg border border-b-0 text-[11px] font-bold cursor-pointer select-none transition-colors shrink-0 ${tabCls}">
                    <svg class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-brand-primary' : 'text-slate-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="${iconFor(tab.route || tab.path)}" />
                    </svg>
                    <span class="truncate flex-1">${escapeHtml(label)}</span>
                    ${closeBtn}
                </div>`;
        }).join('');

        list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function bindEvents() {
        const list = document.getElementById('app-tabs-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const closeBtn = e.target.closest('[data-tab-close]');
                if (closeBtn) {
                    e.stopPropagation();
                    close(closeBtn.dataset.tabClose);
                    return;
                }
                const tabEl = e.target.closest('[data-tab-id]');
                if (tabEl) activate(tabEl.dataset.tabId);
            });
            // Clic con la rueda sobre una pestaña: cerrarla
            list.addEventListener('auxclick', (e) => {
                const tabEl = e.target.closest('[data-tab-id]');
                if (e.button === 1 && tabEl) {
                    e.preventDefault();
                    close(tabEl.dataset.tabId);
                }
            });
        }

        // Ctrl+clic o clic con la rueda en el menú lateral: abrir en pestaña nueva
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) {
            const pathFromItem = (item) => {
                const match = (item?.getAttribute('onclick') || '').match(/navigateTo\('([^']+)'\)/);
                return match ? match[1] : null;
            };
            const openFromSidebar = (e) => {
                const path = pathFromItem(e.target.closest('.sidebar-item, #sidebar-logo'));
                if (!path) return;
                e.preventDefault();
                e.stopPropagation();
                open(path);
            };
            sidebar.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) openFromSidebar(e);
            }, true);
            sidebar.addEventListener('mousedown', (e) => {
                if (e.button === 1 && e.target.closest('.sidebar-item')) e.preventDefault();
            });
            sidebar.addEventListener('auxclick', (e) => {
                if (e.button === 1) openFromSidebar(e);
            }, true);
        }

        window.addEventListener('keydown', (e) => {
            if (handleShortcut(e)) e.preventDefault();
        });

        try { observeTitle(getTab(MAIN_ID), document); } catch (e) {}
    }

    restore();

    window.AppTabs = {
        open,
        openNew: () => open(DEFAULT_PATH),
        close,
        activate,
        reset,
        navigateActiveFrame,
        onFrameRouted,
        onMainRouted,
        handleShortcut,
        get count() { return state.tabs.length; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { bindEvents(); render(); });
    } else {
        bindEvents();
        render();
    }
})();
