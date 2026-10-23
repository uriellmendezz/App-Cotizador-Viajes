// comparar.js - Sección "Comparar Cotizaciones" (/comparar)
// El agente elige dos o más cotizaciones guardadas (PDF o rápidas) y ve sus montos
// lado a lado. Los cálculos y la tabla vienen de comparador.js.
//
// La selección se refleja en la URL (/comparar?ids=completa:12,rapida:34) para que
// la comparación se conserve al recargar o al abrirla en otra pestaña.

import { buildQuoteModel, fetchQuote, renderComparisonTable } from './comparador.js';

const MAX_COMPARAR = 6;
const MAX_LIST_ITEMS = 80;

let pickerKind = 'completa';
let lists = { completa: null, rapida: null };
let selected = []; // [{ kind, id, model }]
let pending = new Set();

const keyOf = (kind, id) => `${kind}:${id}`;

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(String(dateStr).includes(' ') && !String(dateStr).includes('T') ? String(dateStr).replace(' ', 'T') : dateStr);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function quickCurrency(q) {
    const meta = (q.hoteles || []).find(h => h && h.nombre === 'METADATA_PRESUPUESTO_RAPIDO');
    return meta?.moneda || 'USD';
}

// Datos comunes para mostrar cada cotización en el listado
function listItemInfo(kind, q) {
    if (kind === 'rapida') {
        const meta = (q.hoteles || []).find(h => h && h.nombre === 'METADATA_PRESUPUESTO_RAPIDO') || {};
        return {
            id: q.id,
            nombre: q.pasajero_nombre || 'Sin nombre',
            destino: meta.destino || '',
            fecha: q.created_at,
            total: q.total_cotizacion || 0,
            moneda: quickCurrency(q)
        };
    }
    return {
        id: q.id,
        nombre: q.nombre_pax || 'Sin nombre',
        destino: q.destino || '',
        fecha: q.created_at,
        total: q.costo_total || 0,
        moneda: q.moneda || 'USD'
    };
}

async function loadList(kind) {
    if (lists[kind]) return lists[kind];
    const url = kind === 'rapida' ? '/api/presupuestos' : '/api/cotizaciones';
    const res = await window.authenticatedFetch(url);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudieron cargar las cotizaciones.');
    }
    lists[kind] = await res.json();
    return lists[kind];
}

function syncUrl() {
    const ids = selected.map(s => keyOf(s.kind, s.id)).join(',');
    const url = ids ? `/comparar?ids=${encodeURIComponent(ids)}` : '/comparar';
    history.replaceState(null, null, url);
}

function renderPickerTabs() {
    const active = 'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer bg-white text-brand-primary shadow-2xs';
    const idle = 'flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-slate-500 hover:text-slate-800';
    const btnCompleta = document.getElementById('comparar-tab-completa');
    const btnRapida = document.getElementById('comparar-tab-rapida');
    if (btnCompleta) btnCompleta.className = pickerKind === 'completa' ? active : idle;
    if (btnRapida) btnRapida.className = pickerKind === 'rapida' ? active : idle;
}

async function renderList() {
    const container = document.getElementById('comparar-list');
    if (!container) return;
    const kind = pickerKind;

    let list;
    try {
        list = await loadList(kind);
    } catch (err) {
        container.innerHTML = `<div class="p-6 text-center text-xs font-semibold text-rose-500">${escapeHtml(err.message)}</div>`;
        return;
    }
    if (kind !== pickerKind) return;

    const query = (document.getElementById('comparar-search')?.value || '').toLowerCase().trim();
    const items = list
        .map(q => listItemInfo(kind, q))
        .filter(info => !query || `${info.nombre} ${info.destino} ${info.id}`.toLowerCase().includes(query))
        .slice(0, MAX_LIST_ITEMS);

    if (items.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-xs font-semibold text-slate-400">No hay cotizaciones que coincidan.</div>';
        return;
    }

    container.innerHTML = items.map(info => {
        const key = keyOf(kind, info.id);
        const isSelected = selected.some(s => keyOf(s.kind, s.id) === key);
        const isPending = pending.has(key);
        const check = isSelected
            ? '<span class="w-5 h-5 shrink-0 rounded-md bg-brand-primary text-white flex items-center justify-center"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg></span>'
            : `<span class="w-5 h-5 shrink-0 rounded-md border-2 ${isPending ? 'border-brand-primary animate-pulse' : 'border-slate-300'}"></span>`;
        const meta = [info.destino, formatDate(info.fecha), `#${info.id}`].filter(Boolean).map(escapeHtml).join(' · ');
        return `
            <button type="button" data-compare-key="${escapeHtml(key)}"
                class="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${isSelected ? 'bg-brand-primary/5' : 'hover:bg-slate-50'}">
                ${check}
                <span class="min-w-0 flex-1">
                    <span class="block text-xs font-bold text-slate-800 truncate">${escapeHtml(info.nombre)}</span>
                    <span class="block text-[10px] font-semibold text-slate-400 truncate">${meta}</span>
                </span>
                <span class="text-[11px] font-bold text-brand-primary whitespace-nowrap">${escapeHtml(info.moneda)} ${window.formatPriceES(info.total)}</span>
            </button>`;
    }).join('');
}

function renderResult() {
    const container = document.getElementById('comparar-result');
    const count = document.getElementById('comparar-count');
    const clearBtn = document.getElementById('comparar-clear-btn');
    if (!container) return;

    if (count) count.textContent = selected.length ? `${selected.length} de ${MAX_COMPARAR}` : '';
    if (clearBtn) clearBtn.classList.toggle('hidden', selected.length === 0);

    if (selected.length === 0) {
        container.innerHTML = `
            <div class="py-14 text-center space-y-2">
                <p class="text-sm font-bold text-slate-500">Todavía no elegiste cotizaciones</p>
                <p class="text-xs font-semibold text-slate-400">Sumá al menos dos desde el listado para compararlas.</p>
            </div>`;
        return;
    }

    renderComparisonTable(selected.map(s => s.model), container, { onRemove: 'removeFromComparison' });

    if (selected.length === 1) {
        container.insertAdjacentHTML('afterbegin', `
            <div class="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                Sumá otra cotización para compararla con esta.
            </div>`);
    }
}

async function addToComparison(kind, id, { silent = false } = {}) {
    const key = keyOf(kind, id);
    if (selected.some(s => keyOf(s.kind, s.id) === key) || pending.has(key)) return;
    if (selected.length + pending.size >= MAX_COMPARAR) {
        if (!silent) window.showAlert('warning', `Podés comparar hasta ${MAX_COMPARAR} cotizaciones a la vez.`, true);
        return;
    }

    pending.add(key);
    renderList();
    try {
        let quote;
        if (kind === 'rapida') {
            // El listado de rápidas ya trae vuelos y alojamientos
            const list = await loadList('rapida');
            quote = list.find(q => String(q.id) === String(id)) || await fetchQuote(id, 'rapida');
        } else {
            quote = await fetchQuote(id, 'completa');
        }
        const model = buildQuoteModel(quote);
        if (model) selected.push({ kind, id: String(id), model });
    } catch (err) {
        if (!silent) window.showAlert('warning', `No se pudo agregar la cotización #${id}: ${err.message}`, true);
    } finally {
        pending.delete(key);
        syncUrl();
        renderResult();
        renderList();
    }
}

function removeFromComparison(idx) {
    selected.splice(idx, 1);
    syncUrl();
    renderResult();
    renderList();
}
window.removeFromComparison = removeFromComparison;

function toggleComparison(kind, id) {
    const idx = selected.findIndex(s => s.kind === kind && String(s.id) === String(id));
    if (idx >= 0) removeFromComparison(idx);
    else addToComparison(kind, id);
}

function clearComparison() {
    selected = [];
    syncUrl();
    renderResult();
    renderList();
}
window.clearComparison = clearComparison;

function setComparePickerKind(kind) {
    pickerKind = kind === 'rapida' ? 'rapida' : 'completa';
    renderPickerTabs();
    const container = document.getElementById('comparar-list');
    if (container && !lists[pickerKind]) {
        container.innerHTML = '<div class="p-6 text-center text-xs font-semibold text-slate-400">Cargando cotizaciones...</div>';
    }
    renderList();
}
window.setComparePickerKind = setComparePickerKind;

export function initComparar() {
    pickerKind = 'completa';
    lists = { completa: null, rapida: null };
    selected = [];
    pending = new Set();

    renderPickerTabs();
    renderResult();

    document.getElementById('comparar-search')?.addEventListener('input', () => renderList());
    document.getElementById('comparar-list')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-compare-key]');
        if (!btn) return;
        const [kind, ...rest] = btn.dataset.compareKey.split(':');
        toggleComparison(kind, rest.join(':'));
    });

    renderList();

    // Selección inicial desde la URL (?ids=completa:12,rapida:34), en el mismo orden
    const ids = new URLSearchParams(window.location.search).get('ids');
    if (ids) {
        const entries = ids.split(',')
            .map(part => part.trim().split(':'))
            .filter(([kind, id]) => (kind === 'completa' || kind === 'rapida') && id)
            .slice(0, MAX_COMPARAR);
        entries.reduce((chain, [kind, id]) => chain.then(() => addToComparison(kind, id, { silent: true })), Promise.resolve());
    }
}
