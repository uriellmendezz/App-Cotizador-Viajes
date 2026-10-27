// paquetes.js - Paquetes Promocionales para Redes Sociales
// Separados de las cotizaciones de pasajeros. Cada paquete calcula su financiación:
// entrega = valor de los vuelos (monto + fee) por persona, saldo en 3 y/o 6 cuotas.
import {
    REGIMENES, HABITACIONES, MAX_DESCRIPCION_HOTEL,
    escapeHtml, safeImageSrc, starsToString, resizeImageFile, openHotelPicker
} from './hotel_catalog.js';
import { OPERADORES, LOGO_OPERADOR_CLASS, getOperador, fetchComisiones, fmtPct } from './operadores.js';

const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const FLYER_W = 1080;
const FLYER_H = 1350;
const BASE_LABELS = { 1: 'single', 2: 'doble', 3: 'triple', 4: 'cuádruple' };
const PLANES_CUOTAS = [3, 6];

let paquetes = [];
let comisiones = {};          // % de cada operador (Configuración > Comisiones de Operadores)
let tabActiva = 'operadores'; // 'operadores' (prearmados) | 'propios' (One Trip Giordano)
let tipoPaquete = 'propio';   // modo del paquete abierto en el editor
let operadorPaquete = '';     // operador del paquete cuando tipoPaquete === 'operador'
let editingId = null;
let hotelId = null;
let hotelFoto = '';
let isDirty = false;
let previewObserver = null;

export async function initPaquetes() {
    if (window.loggedInUser === 'guest' || window.loggedInUser === 'Invitado') {
        document.getElementById('paquetes-grid').innerHTML =
            '<div class="col-span-full text-center text-xs font-semibold text-slate-500 py-16">Los paquetes promocionales están disponibles solo para agentes.</div>';
        document.getElementById('paquetes-btn-new')?.classList.add('hidden');
        return;
    }

    setupList();
    setupEditor();

    // Sin comisiones cargadas (tabla inexistente, error de red) todo sigue funcionando al 0%
    try {
        comisiones = await fetchComisiones();
    } catch (err) {
        console.error('No se pudieron cargar las comisiones:', err);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('id')) {
        await openEditor(params.get('id'));
    } else if (params.has('nuevo')) {
        const operador = getOperador(params.get('operador'))?.id;
        await openEditor(null, operador ? { tipo: 'operador', operador } : {});
    } else {
        setTab(tabActiva);
    }
    await loadPaquetes();
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers de formato y cálculo
// ──────────────────────────────────────────────────────────────────────────────

const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const ceil2 = (n) => Math.ceil(round2(n * 100)) / 100;

function fmtAmount(n) {
    const value = round2(num(n));
    const hasCents = Math.abs(value % 1) > 0.0001;
    return value.toLocaleString('es-AR', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2
    });
}

function fmtMoney(n, moneda) {
    return `${moneda} ${fmtAmount(n)}`;
}

function isoToDisplay(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).split('T')[0].split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
}

function nightsBetween(isoA, isoB) {
    if (!isoA || !isoB) return 0;
    const a = new Date(`${isoA}T00:00:00`);
    const b = new Date(`${isoB}T00:00:00`);
    const diff = Math.round((b - a) / 86400000);
    return diff > 0 ? diff : 0;
}

// Reparte el saldo en los planes de cuotas elegidos
function buildCuotas(saldo, planes) {
    return saldo > 0
        ? PLANES_CUOTAS.filter(n => (planes || []).includes(n)).map(n => ({ cantidad: n, monto: ceil2(saldo / n) }))
        : [];
}

// Paquete prearmado de un operador: el precio por persona lo fija el operador
function computePaqueteOperador(s) {
    const pax = Math.max(1, parseInt(s.base_pax, 10) || 1);
    const precioPersona = round2(num(s.precio_operador));
    const entrega = Math.min(round2(num(s.entrega_operador)), precioPersona);
    const saldo = round2(precioPersona - entrega);
    return {
        base_pax: pax,
        fee: 0,
        total_aereo: round2(entrega * pax),
        gastos_admin: 0,
        total: round2(precioPersona * pax),
        precio_persona: precioPersona,
        entrega,
        saldo,
        cuotas: buildCuotas(saldo, s.planes)
    };
}

// Comisión estimada que le deja el paquete a la agencia (dato interno, no va en la pieza).
// Operador: % de paquete entero sobre el total. Propio: % aéreo sobre los vuelos y % terrestre
// sobre hotel + traslados, según el operador elegido para cada servicio.
export function computeComision(s, r, tabla = comisiones) {
    const pct = (operador, campo) => num(tabla[operador]?.[campo]);
    const lineas = [];
    const add = (label, operador, campo, base) => {
        if (!operador || base <= 0) return;
        const p = pct(operador, campo);
        lineas.push({ label, operador, pct: p, base: round2(base), monto: round2(base * p / 100) });
    };

    if (s.tipo === 'operador') {
        add('Paquete entero', s.operador, 'pct_paquete', r.total);
    } else {
        add('Servicios aéreos', s.operador_vuelos, 'pct_aereo', num(s.monto_vuelos));
        add('Servicios terrestres', s.operador_terrestre, 'pct_terrestre', num(s.costo_hotel) + num(s.monto_traslados));
    }
    return { lineas, total: round2(lineas.reduce((acc, l) => acc + l.monto, 0)) };
}

// Misma fórmula que las cotizaciones: aéreo + terrestre + 5% gastos admin. sobre terrestre + gastos/IVA
export function computePaquete(s) {
    if (s.tipo === 'operador') return computePaqueteOperador(s);
    const pax = Math.max(1, parseInt(s.base_pax, 10) || 1);
    const vuelos = num(s.monto_vuelos);
    const fee = s.fee_tipo === 'fixed' ? num(s.fee_monto) : round2(vuelos * 0.10);
    const aereo = vuelos + fee;
    const terrestre = num(s.costo_hotel) + num(s.monto_traslados);
    const gastosAdmin = terrestre * 0.05;
    const total = aereo + terrestre + gastosAdmin + num(s.gastos_iva);

    const precioCalculado = total / pax;
    const precioPersona = s.redondear ? Math.ceil(round2(precioCalculado) / 10) * 10 : round2(precioCalculado);

    const entrega = round2(aereo / pax);
    const saldo = round2(Math.max(0, precioPersona - entrega));
    const cuotas = buildCuotas(saldo, s.planes);

    return {
        base_pax: pax,
        fee: round2(fee),
        total_aereo: round2(aereo),
        gastos_admin: round2(gastosAdmin),
        total: round2(total),
        precio_persona: precioPersona,
        entrega,
        saldo,
        cuotas
    };
}

function buildIncluye(s) {
    const items = [];
    const vuelo = s.origen ? `Vuelos ida y vuelta desde ${s.origen}` : 'Vuelos ida y vuelta';
    items.push(s.equipaje ? `${vuelo} (${s.equipaje})` : vuelo);
    const noches = parseInt(s.noches, 10) || 0;
    const aloj = noches ? `${noches} noche${noches > 1 ? 's' : ''} de alojamiento` : 'Alojamiento';
    items.push(s.hotel_regimen ? `${aloj} · ${s.hotel_regimen}` : aloj);
    if (num(s.monto_traslados) > 0) items.push('Traslados aeropuerto - hotel - aeropuerto');
    if (s.asistencia) items.push('Asistencia al viajero');
    (s.extras || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => items.push(l));
    return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// Listado
// ──────────────────────────────────────────────────────────────────────────────

function setupList() {
    document.getElementById('paquetes-btn-new').addEventListener('click', () => openEditor(null));
    document.getElementById('paquetes-search').addEventListener('input', renderLists);

    document.querySelectorAll('[data-pq-tab]').forEach(btn => {
        btn.addEventListener('click', () => setTab(btn.dataset.pqTab));
    });

    // Un solo listener para todas las tarjetas (propios y de cada operador)
    document.getElementById('paquetes-list-view').addEventListener('click', (e) => {
        const nuevo = e.target.closest('[data-new-op]');
        if (nuevo) return openEditor(null, { tipo: 'operador', operador: nuevo.dataset.newOp });
        const edit = e.target.closest('[data-edit-pq]');
        if (edit) return openEditor(edit.dataset.editPq);
        const dup = e.target.closest('[data-dup-pq]');
        if (dup) return duplicatePaquete(dup.dataset.dupPq);
        const del = e.target.closest('[data-del-pq]');
        if (del) return confirmDelete(del.dataset.delPq);
    });
}

function setTab(tab) {
    tabActiva = tab === 'propios' ? 'propios' : 'operadores';
    $('pq-panel-operadores').classList.toggle('hidden', tabActiva !== 'operadores');
    $('pq-panel-propios').classList.toggle('hidden', tabActiva !== 'propios');
    document.querySelectorAll('[data-pq-tab]').forEach(btn => {
        const activa = btn.dataset.pqTab === tabActiva;
        btn.setAttribute('aria-selected', String(activa));
        btn.classList.toggle('bg-slate-900', activa);
        btn.classList.toggle('text-white', activa);
        btn.classList.toggle('border-slate-900', activa);
        btn.classList.toggle('bg-white', !activa);
        btn.classList.toggle('text-slate-600', !activa);
        btn.classList.toggle('border-slate-200', !activa);
    });
}

async function loadPaquetes() {
    try {
        const res = await window.authenticatedFetch('/api/paquetes');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudieron cargar los paquetes.');
        }
        paquetes = await res.json();
        renderLists();
    } catch (err) {
        const html = `<div class="col-span-full text-center text-xs font-semibold text-rose-500 py-16">${escapeHtml(err.message)}</div>`;
        const grid = document.getElementById('paquetes-grid');
        if (grid) grid.innerHTML = html;
        const ops = document.getElementById('pq-operadores-list');
        if (ops) ops.innerHTML = html;
    }
}

function renderLists() {
    renderOperadores();
    renderGrid();
}

function filtrarPaquetes(list) {
    const q = (document.getElementById('paquetes-search')?.value || '').toLowerCase().trim();
    return q ? list.filter(p => `${p.titulo} ${p.destino} ${p.hotel_nombre}`.toLowerCase().includes(q)) : list;
}

const EMPTY_ICON = '<svg class="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>';

function emptyState(message) {
    return `
        <div class="col-span-full flex flex-col items-center justify-center text-center gap-3 py-12 border-2 border-dashed border-slate-200 rounded-2xl">
            ${EMPTY_ICON}
            <p class="text-xs font-semibold text-slate-500">${message}</p>
        </div>`;
}

function renderCard(p) {
    const r = p.resumen || {};
    const moneda = p.moneda || 'USD';
    const cuotasTxt = (r.cuotas || []).map(c => `${c.cantidad} x ${fmtMoney(c.monto, moneda)}`).join(' · ');
    const entregaTxt = r.entrega ? `Entrega ${fmtMoney(r.entrega, moneda)}` : '';
    const financiacion = [entregaTxt, cuotasTxt].filter(Boolean).join(' + ');
    const comision = r.comision?.total;
    return `
        <div class="group bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
            <div class="relative h-40 bg-slate-100 overflow-hidden">
                ${safeImageSrc(p.portada) ? `<img src="${safeImageSrc(p.portada)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">` : ''}
                ${p.noches ? `<span class="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-brand-primary text-white text-[10px] font-black uppercase tracking-wider">${escapeHtml(p.noches)} noches</span>` : ''}
            </div>
            <div class="p-4 flex flex-col gap-1 flex-1">
                <div class="text-[10px] font-black uppercase tracking-widest text-brand-primary truncate">${escapeHtml(p.destino || 'Sin destino')}</div>
                <div class="text-sm font-bold text-slate-800 truncate" title="${escapeHtml(p.titulo)}">${escapeHtml(p.titulo)}</div>
                ${p.hotel_nombre ? `<div class="text-[11px] text-slate-500 font-semibold truncate">${escapeHtml(p.hotel_nombre)} <span class="text-amber-500">${p.hotel_estrellas ? starsToString(p.hotel_estrellas) : ''}</span></div>` : ''}
                <div class="pt-2">
                    <div class="text-lg font-black text-slate-900">${fmtMoney(p.precio_persona, moneda)} <span class="text-[10px] font-bold text-slate-400 uppercase">p/persona</span></div>
                    ${financiacion ? `<div class="text-[11px] text-slate-500 font-semibold">${financiacion}</div>` : ''}
                    ${comision > 0 ? `<div class="text-[11px] text-emerald-600 font-bold">Comisión ${fmtMoney(comision, moneda)}</div>` : ''}
                </div>
                <div class="flex gap-2 pt-3 mt-auto">
                    <button type="button" data-edit-pq="${p.id}" class="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Editar</button>
                    <button type="button" data-dup-pq="${p.id}" title="Duplicar" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Duplicar</button>
                    <button type="button" data-del-pq="${p.id}" title="Eliminar" class="px-3 py-2 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>
        </div>`;
}

// Paquetes cotizados por la agencia (los que no pertenecen a un operador)
function renderGrid() {
    const grid = document.getElementById('paquetes-grid');
    if (!grid) return;
    const hayBusqueda = !!(document.getElementById('paquetes-search')?.value || '').trim();
    const list = filtrarPaquetes(paquetes.filter(p => p.tipo !== 'operador'));

    grid.innerHTML = list.length
        ? list.map(renderCard).join('')
        : emptyState(hayBusqueda ? 'No hay paquetes que coincidan con la búsqueda.' : 'Todavía no armaste paquetes propios. Creá el primero con "Nuevo Paquete propio".');
}

// Una sección por operador con sus paquetes prearmados
function renderOperadores() {
    const container = document.getElementById('pq-operadores-list');
    if (!container) return;
    const hayBusqueda = !!(document.getElementById('paquetes-search')?.value || '').trim();

    container.innerHTML = OPERADORES.map(op => {
        const list = filtrarPaquetes(paquetes.filter(p => p.tipo === 'operador' && p.operador === op.id));
        const pctPaquete = comisiones[op.id]?.pct_paquete ?? 0;
        return `
        <section class="bg-white/80 border border-slate-200/60 rounded-2xl p-5 lg:p-6 shadow-sm space-y-5">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-40 shrink-0 flex items-center justify-start">
                        <img src="${op.logo}" alt="${escapeHtml(op.nombre)}" class="${LOGO_OPERADOR_CLASS}">
                    </div>
                    <span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider whitespace-nowrap">Comisión paquete ${fmtPct(pctPaquete)}</span>
                </div>
                <button type="button" data-new-op="${op.id}"
                    class="px-5 py-3 bg-brand-primary hover:bg-brand-primary/95 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-brand-primary/20 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Cargar paquete de ${escapeHtml(op.nombre)}
                </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                ${list.length
                    ? list.map(renderCard).join('')
                    : emptyState(hayBusqueda ? 'No hay paquetes que coincidan con la búsqueda.' : `Todavía no cargaste paquetes de ${escapeHtml(op.nombre)}.`)}
            </div>
        </section>`;
    }).join('');
}

async function duplicatePaquete(id) {
    window.showLoader('Duplicando paquete...');
    try {
        const res = await window.authenticatedFetch(`/api/paquetes/${id}/duplicar`, { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo duplicar el paquete.');
        }
        await loadPaquetes();
        window.showAlert('success', 'Paquete duplicado.');
    } catch (err) {
        window.showAlert('error', err.message);
    } finally {
        window.hideLoader();
    }
}

function confirmDelete(id) {
    const p = paquetes.find(x => String(x.id) === String(id));
    window.showCustomConfirm({
        title: '¿Eliminar Paquete?',
        desc: `Se eliminará el paquete "${p?.titulo || ''}". Esta acción no se puede deshacer.`,
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            window.showLoader('Eliminando paquete...');
            try {
                const res = await window.authenticatedFetch(`/api/paquetes/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'No se pudo eliminar el paquete.');
                }
                paquetes = paquetes.filter(x => String(x.id) !== String(id));
                renderLists();
                window.showAlert('success', 'Paquete eliminado.');
            } catch (err) {
                window.showAlert('error', err.message);
            } finally {
                window.hideLoader();
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Editor
// ──────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function setupEditor() {
    $('pq-hotel-regimen').innerHTML = REGIMENES.map(r => `<option value="${r}">${r}</option>`).join('');
    $('pq-hotel-regimen').value = 'All Inclusive';
    $('pq-habitacion-options').innerHTML = HABITACIONES.map(h => `<option value="Habitación ${h}"></option>`).join('');

    // Operador de cada servicio (opcional) en los paquetes propios: define la comisión estimada
    const opciones = '<option value="">Sin operador</option>' + OPERADORES.map(o => `<option value="${o.id}">${escapeHtml(o.nombre)}</option>`).join('');
    $('pq-op-vuelos').innerHTML = opciones;
    $('pq-op-terrestre').innerHTML = opciones;

    if (typeof flatpickr !== 'undefined') {
        if (flatpickr.l10ns?.es) flatpickr.localize(flatpickr.l10ns.es);
        ['pq-fecha-salida', 'pq-fecha-regreso', 'pq-validez'].forEach(id => {
            flatpickr($(id), {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'd/m/Y',
                disableMobile: 'true',
                onChange: () => onDatesChanged(id)
            });
        });
    }

    const form = $('paquete-form');
    form.addEventListener('input', onFormChange);
    form.addEventListener('change', onFormChange);
    form.addEventListener('submit', (e) => e.preventDefault());

    $('pq-btn-back').addEventListener('click', () => {
        if (!isDirty) return closeEditor();
        window.showCustomConfirm({
            title: '¿Salir sin guardar?',
            desc: 'Tenés cambios sin guardar en este paquete. Si salís ahora se perderán.',
            btnText: 'Salir',
            confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
            callback: closeEditor
        });
    });
    $('pq-btn-pick-hotel').addEventListener('click', () => openHotelPicker(applyCatalogHotel));
    $('pq-btn-save').addEventListener('click', savePaquete);
    $('pq-btn-copy').addEventListener('click', copyText);
    $('pq-btn-download').addEventListener('click', downloadFlyer);

    // Hotel photo dropzone
    const dz = $('pq-hotel-foto-dz');
    dz.addEventListener('click', () => $('pq-hotel-foto-input').click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') $('pq-hotel-foto-input').click(); });
    dz.addEventListener('dragover', (e) => e.preventDefault());
    dz.addEventListener('drop', async (e) => {
        e.preventDefault();
        await setFotoFromFile(e.dataTransfer?.files?.[0]);
    });
    $('pq-hotel-foto-input').addEventListener('change', async (e) => {
        await setFotoFromFile(e.target.files?.[0]);
        e.target.value = '';
    });

    // Each navigation re-imports this module: drop the listener of the previous instance
    if (window.__paquetesPasteListener) document.removeEventListener('paste', window.__paquetesPasteListener);
    window.__paquetesPasteListener = onPaste;
    document.addEventListener('paste', onPaste);

    // Keep the scaled flyer preview in sync with its frame width
    previewObserver?.disconnect();
    previewObserver = new ResizeObserver(scalePreview);
    previewObserver.observe($('pq-flyer-frame'));

    // Atajo de datos de prueba (Ctrl + Alt + 0). Se reasigna en cada navegación
    // para que apunte siempre a la instancia actual del módulo.
    window.fillPaqueteTestData = fillPaqueteTestData;
}

function isEditorVisible() {
    const view = $('paquetes-editor-view');
    return !!view && !view.classList.contains('hidden');
}

async function onPaste(e) {
    if (!isEditorVisible()) return;
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    await setFotoFromFile(item.getAsFile());
}

async function setFotoFromFile(file) {
    if (!file) return;
    try {
        hotelFoto = await resizeImageFile(file);
        updateFotoPreview();
        markDirty();
        render();
    } catch (err) {
        window.showAlert('error', err.message, true);
    }
}

function updateFotoPreview() {
    const preview = $('pq-hotel-foto-preview');
    const hints = document.querySelectorAll('#pq-hotel-foto-dz .pq-dz-hint');
    if (hotelFoto) {
        preview.src = hotelFoto;
        preview.classList.remove('hidden');
        hints.forEach(h => h.classList.add('invisible'));
    } else {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
        hints.forEach(h => h.classList.remove('invisible'));
    }
}

function applyCatalogHotel(hotel, foto) {
    hotelId = hotel.id;
    $('pq-hotel-nombre').value = hotel.nombre || '';
    $('pq-hotel-estrellas').value = String(Math.min(5, Math.max(1, parseInt(hotel.estrellas, 10) || 4)));
    if (hotel.regimen) {
        const sel = $('pq-hotel-regimen');
        if (!Array.from(sel.options).some(o => o.value === hotel.regimen)) sel.add(new Option(hotel.regimen, hotel.regimen));
        sel.value = hotel.regimen;
    }
    if (hotel.habitacion) $('pq-hotel-habitacion').value = hotel.habitacion;
    $('pq-hotel-descripcion').value = (hotel.descripcion || '').slice(0, MAX_DESCRIPCION_HOTEL);
    if (!$('pq-destino').value.trim() && hotel.destino) $('pq-destino').value = hotel.destino;
    if (safeImageSrc(foto)) hotelFoto = foto;
    updateFotoPreview();
    markDirty();
    render();
}

function onDatesChanged(id) {
    if (id !== 'pq-validez') {
        const n = nightsBetween($('pq-fecha-salida').value, $('pq-fecha-regreso').value);
        if (n) $('pq-noches').value = n;
    }
    markDirty();
    render();
}

function onFormChange(e) {
    if (e.target?.id === 'pq-hotel-nombre') hotelId = null; // manual edit unlinks the catalog hotel
    markDirty();
    render();
}

function markDirty() {
    isDirty = true;
}

function setDateValue(id, iso) {
    const el = $(id);
    if (el?._flatpickr) el._flatpickr.setDate(iso || null, false);
    else if (el) el.value = iso || '';
}

function readForm() {
    const planes = PLANES_CUOTAS.filter(n => $(`pq-plan-${n}`).checked);
    return {
        tipo: tipoPaquete,
        operador: tipoPaquete === 'operador' ? operadorPaquete : '',
        // Cada modo solo guarda los campos que muestra
        operador_vuelos: tipoPaquete === 'propio' ? $('pq-op-vuelos').value : '',
        operador_terrestre: tipoPaquete === 'propio' ? $('pq-op-terrestre').value : '',
        precio_operador: tipoPaquete === 'operador' ? $('pq-op-precio').value : '',
        entrega_operador: tipoPaquete === 'operador' ? $('pq-op-entrega').value : '',
        titulo: $('pq-titulo').value.trim(),
        destino: $('pq-destino').value.trim(),
        origen: $('pq-origen').value.trim(),
        fecha_salida: $('pq-fecha-salida').value,
        fecha_regreso: $('pq-fecha-regreso').value,
        noches: $('pq-noches').value,
        base_pax: $('pq-base').value,
        moneda: $('pq-moneda').value,
        validez: $('pq-validez').value,
        monto_vuelos: $('pq-monto-vuelos').value,
        fee_tipo: $('pq-fee-tipo').value,
        fee_monto: $('pq-fee-monto').value,
        equipaje: $('pq-equipaje').value,
        hotel_id: hotelId,
        hotel_nombre: $('pq-hotel-nombre').value.trim(),
        hotel_estrellas: parseInt($('pq-hotel-estrellas').value, 10) || 4,
        hotel_regimen: $('pq-hotel-regimen').value,
        hotel_habitacion: $('pq-hotel-habitacion').value.trim(),
        hotel_descripcion: $('pq-hotel-descripcion').value.trim(),
        hotel_foto: hotelFoto,
        costo_hotel: $('pq-costo-hotel').value,
        monto_traslados: $('pq-monto-traslados').value,
        gastos_iva: $('pq-gastos-iva').value,
        asistencia: $('pq-asistencia').checked,
        extras: $('pq-extras').value,
        notas: $('pq-notas').value.trim(),
        planes,
        redondear: $('pq-redondear').checked
    };
}

// Muestra solo los campos del tipo de paquete abierto y vuelve a numerar las secciones visibles
function applyModo() {
    document.querySelectorAll('#paquete-form [data-modo]').forEach(el => {
        el.classList.toggle('hidden', el.dataset.modo !== tipoPaquete);
    });
    document.querySelectorAll('#paquete-form > section:not(.hidden) .pq-step').forEach((el, i) => {
        el.textContent = i + 1;
    });

    const op = tipoPaquete === 'operador' ? getOperador(operadorPaquete) : null;
    $('pq-editor-tag').textContent = op ? `Paquete de ${op.nombre}` : 'Paquete propio · One Trip Giordano';
    const logo = $('pq-editor-op-logo');
    if (op) {
        logo.src = op.logo;
        logo.alt = op.nombre;
    } else {
        logo.removeAttribute('src');
    }
    logo.classList.toggle('hidden', !op);
}

function fillForm(d = {}) {
    $('paquete-form').reset();
    tipoPaquete = d.tipo === 'operador' && getOperador(d.operador) ? 'operador' : 'propio';
    operadorPaquete = tipoPaquete === 'operador' ? d.operador : '';
    $('pq-op-vuelos').value = d.operador_vuelos || '';
    $('pq-op-terrestre').value = d.operador_terrestre || '';
    $('pq-op-precio').value = d.precio_operador || '';
    $('pq-op-entrega').value = d.entrega_operador || '';
    applyModo();
    $('pq-titulo').value = d.titulo || '';
    $('pq-destino').value = d.destino || '';
    $('pq-origen').value = d.origen || '';
    setDateValue('pq-fecha-salida', d.fecha_salida);
    setDateValue('pq-fecha-regreso', d.fecha_regreso);
    setDateValue('pq-validez', d.validez);
    $('pq-noches').value = d.noches || '';
    $('pq-base').value = String(d.base_pax || 2);
    $('pq-moneda').value = d.moneda || 'USD';
    $('pq-monto-vuelos').value = d.monto_vuelos || '';
    $('pq-fee-tipo').value = d.fee_tipo || 'auto';
    $('pq-fee-monto').value = d.fee_monto || '';
    $('pq-equipaje').value = d.equipaje || '';
    $('pq-hotel-nombre').value = d.hotel_nombre || '';
    $('pq-hotel-estrellas').value = String(d.hotel_estrellas || 4);
    const regimen = d.hotel_regimen || 'All Inclusive';
    if (!Array.from($('pq-hotel-regimen').options).some(o => o.value === regimen)) {
        $('pq-hotel-regimen').add(new Option(regimen, regimen));
    }
    $('pq-hotel-regimen').value = regimen;
    $('pq-hotel-habitacion').value = d.hotel_habitacion || '';
    $('pq-hotel-descripcion').value = d.hotel_descripcion || '';
    $('pq-costo-hotel').value = d.costo_hotel || '';
    $('pq-monto-traslados').value = d.monto_traslados || '';
    $('pq-gastos-iva').value = d.gastos_iva || '';
    $('pq-asistencia').checked = !!d.asistencia;
    $('pq-extras').value = d.extras || '';
    $('pq-notas').value = d.notas || '';
    const planes = Array.isArray(d.planes) ? d.planes : PLANES_CUOTAS;
    PLANES_CUOTAS.forEach(n => { $(`pq-plan-${n}`).checked = planes.includes(n); });
    $('pq-redondear').checked = !!d.redondear;
    hotelId = d.hotel_id || null;
    hotelFoto = safeImageSrc(d.hotel_foto);
    updateFotoPreview();
}

// opciones: { tipo: 'operador', operador } para cargar un paquete nuevo de un operador
async function openEditor(id, opciones = {}) {
    editingId = id;
    let data = opciones.tipo === 'operador' ? { tipo: 'operador', operador: opciones.operador } : {};
    if (id) {
        window.showLoader('Cargando paquete...');
        try {
            const res = await window.authenticatedFetch(`/api/paquetes/${id}`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'No se pudo cargar el paquete.');
            }
            const row = await res.json();
            data = { ...(row.data || {}), titulo: row.titulo, destino: row.destino, moneda: row.moneda };
        } catch (err) {
            window.showAlert('error', err.message);
            editingId = null;
            return;
        } finally {
            window.hideLoader();
        }
    }

    fillForm(data);
    setTab(tipoPaquete === 'operador' ? 'operadores' : 'propios'); // al volver, el listado queda en la pestaña del paquete
    $('paquete-editor-title').textContent = id ? (data.titulo || 'Editar Paquete') : 'Nuevo Paquete';
    $('paquetes-list-view').classList.add('hidden');
    $('paquetes-editor-view').classList.remove('hidden');
    history.replaceState(null, null, id
        ? `/paquetes?id=${encodeURIComponent(id)}`
        : `/paquetes?nuevo${tipoPaquete === 'operador' ? `&operador=${operadorPaquete}` : ''}`);
    isDirty = false;
    render();
    scalePreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeEditor() {
    editingId = null;
    isDirty = false;
    $('paquetes-editor-view').classList.add('hidden');
    $('paquetes-list-view').classList.remove('hidden');
    history.replaceState(null, null, '/paquetes');
    renderLists();
}

// ──────────────────────────────────────────────────────────────────────────────
// Render en vivo (fee, cuotas y vista previa)
// ──────────────────────────────────────────────────────────────────────────────

function render() {
    if (!$('paquete-form')) return;

    // Fee automático (10% del vuelo)
    const feeTipo = $('pq-fee-tipo').value;
    const feeInput = $('pq-fee-monto');
    feeInput.readOnly = feeTipo !== 'fixed';
    if (feeTipo !== 'fixed') {
        const vuelos = num($('pq-monto-vuelos').value);
        feeInput.value = vuelos ? round2(vuelos * 0.10).toFixed(2) : '';
    }

    const s = readForm();
    document.querySelectorAll('.pq-currency').forEach(el => { el.textContent = s.moneda; });
    $('pq-hotel-descripcion-counter').textContent = `${s.hotel_descripcion.length}/${MAX_DESCRIPCION_HOTEL}`;

    const r = computePaquete(s);
    renderCuotasTable(s, r);
    renderComisionBox(s, r);
    $('pq-flyer-preview').innerHTML = buildFlyerHTML(s, r);
}

// Comisión estimada para la agencia: solo se ve en el editor, nunca en la pieza ni en el texto
function renderComisionBox(s, r) {
    const box = $('pq-comision-box');
    const c = computeComision(s, r);
    const m = s.moneda;

    if (!c.lineas.length) {
        box.innerHTML = s.tipo === 'operador'
            ? ''
            : '<p class="text-[11px] text-slate-400 font-semibold">Elegí el operador de los vuelos y/o de hotel y traslados para ver la comisión estimada.</p>';
        return;
    }

    const porPersona = s.tipo === 'operador' ? ` · ${fmtMoney(c.total / r.base_pax, m)} por persona` : '';
    const sinPct = c.lineas.some(l => !l.pct);
    box.innerHTML = `
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
            <div class="flex items-center justify-between gap-3">
                <span class="text-[10px] font-black uppercase tracking-widest text-emerald-700">Comisión estimada · uso interno</span>
                <span class="text-lg font-black text-emerald-700 whitespace-nowrap">${fmtMoney(c.total, m)}</span>
            </div>
            <div class="divide-y divide-emerald-100">
                ${c.lineas.map(l => `
                    <div class="flex items-center justify-between gap-3 py-1.5 text-xs font-semibold text-slate-600">
                        <span>${escapeHtml(l.label)} · ${escapeHtml(getOperador(l.operador)?.nombre || '')} ${fmtPct(l.pct)} sobre ${fmtMoney(l.base, m)}</span>
                        <span class="font-bold text-slate-800 whitespace-nowrap">${fmtMoney(l.monto, m)}</span>
                    </div>`).join('')}
            </div>
            <p class="text-[10px] text-slate-400 font-semibold">Total para ${r.base_pax} pasajero${r.base_pax > 1 ? 's' : ''}${porPersona}. Los porcentajes se ajustan en Configuración.${sinPct ? ' Hay operadores con 0%: cargá su comisión en Configuración.' : ''}</p>
        </div>`;
}

function renderCuotasTable(s, r) {
    const container = $('pq-cuotas-table');
    const m = s.moneda;
    const base = BASE_LABELS[r.base_pax] || `${r.base_pax} pax`;

    if (!r.precio_persona) {
        container.innerHTML = '<p class="text-xs font-semibold text-slate-400">Cargá los montos de vuelos y alojamiento para ver el desglose de cuotas.</p>';
        return;
    }

    const rows = [
        ['Precio por persona (base ' + base + ')', fmtMoney(r.precio_persona, m), 'font-black text-slate-900'],
        ...(r.entrega > 0 ? [[s.tipo === 'operador' ? 'Entrega' : 'Entrega · valor de los vuelos', fmtMoney(r.entrega, m), 'font-bold text-brand-primary']] : []),
        [r.entrega > 0 ? 'Saldo a financiar' : 'Precio a financiar', fmtMoney(r.saldo, m), 'font-bold text-slate-700']
    ];

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="rounded-xl border border-slate-200 divide-y divide-slate-100">
                ${rows.map(([label, value, cls]) => `
                    <div class="flex items-center justify-between gap-4 px-4 py-3">
                        <span class="text-xs font-semibold text-slate-500">${label}</span>
                        <span class="text-sm ${cls} whitespace-nowrap">${value}</span>
                    </div>`).join('')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${r.cuotas.length ? r.cuotas.map(c => `
                    <div class="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col justify-center">
                        <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">${c.cantidad} cuotas de</span>
                        <span class="text-xl font-black text-slate-900">${fmtMoney(c.monto, m)}</span>
                        ${r.entrega > 0 ? `<span class="text-[10px] font-semibold text-slate-400">+ entrega de ${fmtMoney(r.entrega, m)}</span>` : ''}
                    </div>`).join('') : `
                    <div class="sm:col-span-2 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs font-semibold text-amber-800">
                        ${r.saldo > 0 ? 'Seleccioná al menos un plan de cuotas (3 o 6).' : 'No hay saldo para financiar: el precio está cubierto por la entrega de los vuelos.'}
                    </div>`}
            </div>
        </div>
        <p class="text-[10px] text-slate-400 font-semibold mt-3">${s.tipo === 'operador'
            ? `Precio del operador ${fmtMoney(r.precio_persona, m)} por persona · Total base ${fmtMoney(r.total, m)}`
            : `Vuelos ${fmtMoney(num(s.monto_vuelos), m)} + fee ${fmtMoney(r.fee, m)} · Gastos administrativos (5% terrestre) ${fmtMoney(r.gastos_admin, m)} · Total base ${fmtMoney(r.total, m)}`}</p>`;
}

function scalePreview() {
    const frame = $('pq-flyer-frame');
    const preview = $('pq-flyer-preview');
    if (!frame || !preview) return;
    const scale = frame.clientWidth / FLYER_W;
    preview.style.transform = `scale(${scale})`;
}

// Font size that keeps a bold amount within maxWidth (Montserrat 800-900 ≈ 0.68em per glyph)
function fitFont(text, maxWidth, maxSize, charRatio = 0.68) {
    return Math.min(maxSize, Math.floor(maxWidth / (String(text).length * charRatio)));
}

function agencyLogoSrc() {
    const logo = window.agencyConfig?.logo_base64;
    if (logo) return logo.startsWith('data:') ? logo : `data:image/png;base64,${logo}`;
    return '/assets/Logo%20ONE%20TRIP.png';
}

function brandColor() {
    return window.agencyConfig?.colores?.[0] || '#ff545d';
}

// Pieza 1080x1350 (formato vertical de Instagram). Solo estilos inline para que el
// modo oscuro de la app no la altere y html2canvas la renderice fiel.
export function buildFlyerHTML(s, r) {
    const brand = brandColor();
    const m = s.moneda;
    const destino = s.destino || 'Tu próximo destino';
    const destinoSize = destino.length <= 12 ? 104 : Math.max(60, Math.floor(104 * 12 / destino.length));
    const noches = parseInt(s.noches, 10) || 0;
    const base = BASE_LABELS[r.base_pax] || `${r.base_pax} pax`;
    const incluye = buildIncluye(s).slice(0, 6);
    const compact = incluye.length > 4;
    const itemFont = compact ? 21 : 24;
    const itemGap = compact ? 9 : 14;
    const foto = safeImageSrc(s.hotel_foto)
        ? `background-image: url('${safeImageSrc(s.hotel_foto)}'); background-size: cover; background-position: center;`
        : `background: linear-gradient(135deg, ${brand} 0%, #343434 100%);`;

    const footerParts = [];
    if (s.fecha_salida) footerParts.push(`Salida ${isoToDisplay(s.fecha_salida)}`);
    if (s.validez) footerParts.push(`Válido hasta ${isoToDisplay(s.validez)}`);
    footerParts.push(s.notas || 'Consultá con tu agente de viajes');
    const footerText = footerParts.join('  ·  ');

    const precioTxt = fmtMoney(r.precio_persona, m);
    const filas = [
        ...(r.entrega > 0 ? [['Entrega', fmtMoney(r.entrega, m)]] : []),
        ...r.cuotas.map(c => [`${c.cantidad} cuotas de`, fmtMoney(c.monto, m)])
    ];
    const filaFont = Math.min(...filas.map(([, v]) => fitFont(v, 210, 32)));
    const filasHtml = r.cuotas.length ? filas.map(([label, value]) => `
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0; border-top: 2px solid #e2e8f0; white-space: nowrap;">
            <span style="font-size: 22px; font-weight: 600; color: #475569;">${escapeHtml(label)}</span>
            <span style="font-size: ${filaFont}px; font-weight: 800; color: #0f172a;">${escapeHtml(value)}</span>
        </div>`).join('') : '';

    return `
    <div style="position: relative; width: ${FLYER_W}px; height: ${FLYER_H}px; overflow: hidden; background: #0f172a; font-family: 'Montserrat', sans-serif; color: #ffffff; box-sizing: border-box;">
        <div style="position: absolute; left: 0; top: 0; width: ${FLYER_W}px; height: 830px; ${foto}"></div>
        <div style="position: absolute; left: 0; top: 0; width: ${FLYER_W}px; height: 830px; background: linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0) 28%, rgba(15,23,42,0.15) 50%, rgba(15,23,42,0.88) 100%);"></div>

        <div style="position: absolute; left: 56px; top: 56px; background: #ffffff; border-radius: 28px; padding: 18px 30px;">
            <img src="${agencyLogoSrc()}" alt="" style="height: 72px; width: auto; display: block;">
        </div>
        ${noches ? `<div style="position: absolute; right: 56px; top: 68px; background: ${brand}; color: #ffffff; border-radius: 999px; padding: 16px 34px; font-size: 30px; font-weight: 800; letter-spacing: 2px;">${noches} NOCHES</div>` : ''}

        <div style="position: absolute; left: 64px; right: 64px; top: 520px;">
            ${s.titulo ? `<div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; opacity: 0.92; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.titulo)}</div>` : ''}
            <div style="font-size: ${destinoSize}px; font-weight: 900; line-height: 1; text-transform: uppercase; letter-spacing: -1px;">${escapeHtml(destino)}</div>
            ${s.hotel_nombre ? `
            <div style="margin-top: 22px; font-size: 32px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(s.hotel_nombre)} <span style="color: #fbbf24; letter-spacing: 2px;">${'★'.repeat(s.hotel_estrellas || 0)}</span>
            </div>` : ''}
            ${s.origen ? `<div style="margin-top: 8px; font-size: 24px; font-weight: 600; opacity: 0.85;">Saliendo desde ${escapeHtml(s.origen)}</div>` : ''}
        </div>

        <div style="position: absolute; left: 0; top: 830px; width: ${FLYER_W}px; height: 450px; background: #ffffff; color: #0f172a; padding: 44px 56px; box-sizing: border-box; display: flex; gap: 40px;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 22px; font-weight: 800; letter-spacing: 4px; color: ${brand}; margin-bottom: 18px;">INCLUYE</div>
                ${incluye.map(item => `
                <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: ${itemGap}px;">
                    <span style="flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; background: ${brand}; color: #ffffff; font-size: 19px; font-weight: 900; text-align: center; line-height: 32px;">✓</span>
                    <span style="font-size: ${itemFont}px; font-weight: 600; line-height: 1.3; color: #334155; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(item)}</span>
                </div>`).join('')}
            </div>
            <div style="width: 430px; flex-shrink: 0; background: #f8fafc; border-radius: 32px; padding: 30px 34px; box-sizing: border-box;">
                <div style="font-size: 20px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 2px;">Precio por persona</div>
                <div style="font-size: 18px; font-weight: 600; color: #94a3b8; margin-bottom: 4px;">en base ${escapeHtml(base)}</div>
                <div style="font-size: ${fitFont(precioTxt, 362, 68)}px; font-weight: 900; color: ${brand}; line-height: 1.1; margin-bottom: 14px; white-space: nowrap;">${escapeHtml(precioTxt)}</div>
                ${filasHtml}
            </div>
        </div>

        <div style="position: absolute; left: 0; bottom: 0; width: ${FLYER_W}px; height: 70px; background: ${brand}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: ${fitFont(footerText, 1000, 22, 0.56)}px; font-weight: 700; letter-spacing: 1px; padding: 0 40px; box-sizing: border-box; white-space: nowrap; overflow: hidden;">
            ${escapeHtml(footerText)}
        </div>
    </div>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Datos de prueba (Ctrl + Alt + 0)
// ──────────────────────────────────────────────────────────────────────────────

const TEST_PHOTO_URL = '/assets/test/hotel-test-1.jpg';

async function fetchPhotoAsDataUrl(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return await new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.error('No se pudo cargar la foto de prueba:', url, err);
        return '';
    }
}

function testDate(daysFromToday) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fillPaqueteTestData() {
    if (!$('paquete-form')) return;
    if (!isEditorVisible()) await openEditor(null);

    const foto = safeImageSrc(await fetchPhotoAsDataUrl(TEST_PHOTO_URL));

    fillForm({
        tipo: tipoPaquete,
        operador: operadorPaquete,
        operador_vuelos: 'ola',
        operador_terrestre: 'delfos',
        precio_operador: 1450,
        entrega_operador: 500,
        titulo: 'Caribe Soñado - Salida Especial',
        destino: 'Punta Cana',
        origen: 'Córdoba',
        fecha_salida: testDate(30),
        fecha_regreso: testDate(37),
        validez: testDate(5),
        noches: 7,
        base_pax: 2,
        moneda: 'USD',
        monto_vuelos: 1000,
        fee_tipo: 'auto',
        equipaje: 'Carry on + valija 23kg',
        hotel_nombre: 'Lopesan Costa Bávaro',
        hotel_estrellas: 5,
        hotel_regimen: 'All Inclusive',
        hotel_habitacion: 'Habitación Junior Suite',
        hotel_descripcion: 'Espectacular resort frente a la playa de arena blanca, con piscinas infinitas, restaurantes gourmet y actividades todo el día.',
        hotel_foto: foto,
        costo_hotel: 1500,
        monto_traslados: 100,
        gastos_iva: 50,
        asistencia: true,
        extras: `Excursión a Isla Saona
City tour con guía en español`,
        notas: 'Cupos limitados · Tarifas sujetas a disponibilidad',
        planes: [3, 6],
        redondear: true
    });

    markDirty();
    render();
    window.showAlert('success', '✔ Paquete de prueba cargado. Revisá el desglose de cuotas y la vista previa.', true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ──────────────────────────────────────────────────────────────────────────────
// Acciones: guardar, copiar texto, descargar imagen
// ──────────────────────────────────────────────────────────────────────────────

function validateRequired(s) {
    const missing = [];
    if (!s.titulo) missing.push(['pq-titulo', 'el título']);
    if (!s.destino) missing.push(['pq-destino', 'el destino']);
    if (s.tipo === 'operador' && !(num(s.precio_operador) > 0)) missing.push(['pq-op-precio', 'el precio del operador']);
    if (!missing.length) return true;
    const [firstId] = missing[0];
    $(firstId).focus();
    missing.forEach(([id]) => {
        $(id).classList.add('border-rose-400');
        setTimeout(() => $(id)?.classList.remove('border-rose-400'), 1800);
    });
    window.showAlert('warning', `Completá ${missing.map(x => x[1]).join(' y ')} del paquete.`, true);
    return false;
}

async function savePaquete() {
    const s = readForm();
    if (!validateRequired(s)) return;
    const r = computePaquete(s);

    const payload = {
        titulo: s.titulo,
        destino: s.destino,
        moneda: s.moneda,
        precio_persona: r.precio_persona,
        data: { ...s, resumen: { ...r, comision: computeComision(s, r) } }
    };

    const btn = $('pq-btn-save');
    btn.disabled = true;
    window.showLoader(editingId ? 'Actualizando paquete...' : 'Guardando paquete...');
    try {
        const res = await window.authenticatedFetch(editingId ? `/api/paquetes/${editingId}` : '/api/paquetes', {
            method: editingId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo guardar el paquete.');
        }
        const saved = await res.json();
        const wasNew = !editingId;
        editingId = saved.id;
        isDirty = false;
        $('paquete-editor-title').textContent = s.titulo;
        history.replaceState(null, null, `/paquetes?id=${encodeURIComponent(saved.id)}`);
        loadPaquetes();
        window.showAlert('success', wasNew ? 'Paquete guardado. Ya podés descargar la imagen o copiar el texto para publicarlo.' : 'Paquete actualizado.', true);
    } catch (err) {
        window.showAlert('error', err.message, true);
    } finally {
        btn.disabled = false;
        window.hideLoader();
    }
}

export function buildSocialText(s, r) {
    const m = s.moneda;
    const noches = parseInt(s.noches, 10) || 0;
    const base = BASE_LABELS[r.base_pax] || `${r.base_pax} pax`;
    const lines = [];

    lines.push(`✈️ ${(s.titulo || s.destino || 'Paquete').toUpperCase()}`);
    if (s.destino) lines.push(`📍 ${s.destino}`);
    if (s.origen) lines.push(`🛫 Saliendo desde ${s.origen}`);
    const fecha = [s.fecha_salida ? `Salida ${isoToDisplay(s.fecha_salida)}` : '', noches ? `${noches} noches` : ''].filter(Boolean).join(' · ');
    if (fecha) lines.push(`📅 ${fecha}`);
    if (s.hotel_nombre) lines.push(`🏨 ${s.hotel_nombre} ${'★'.repeat(s.hotel_estrellas || 0)}`.trim());
    const regimenHab = [s.hotel_regimen, s.hotel_habitacion].filter(Boolean).join(' · ');
    if (regimenHab) lines.push(`🍽️ ${regimenHab}`);

    lines.push('', '✅ Incluye:');
    buildIncluye(s).forEach(item => lines.push(`• ${item}`));

    if (r.precio_persona) {
        lines.push('', `💰 ${fmtMoney(r.precio_persona, m)} por persona (base ${base})`);
    }
    if (r.cuotas.length) {
        lines.push('', '💳 Financiá tu viaje:');
        if (r.entrega > 0) lines.push(`• Entrega de ${fmtMoney(r.entrega, m)}${s.tipo === 'operador' ? '' : ' (valor de los vuelos)'}`);
        // Sin entrega se financia el precio completo, no un saldo
        const financiado = r.entrega > 0 ? 'saldo' : 'precio';
        r.cuotas.forEach((c, i) => {
            const prefijo = i > 0 ? `o ${financiado}` : financiado.charAt(0).toUpperCase() + financiado.slice(1);
            lines.push(`• ${prefijo} en ${c.cantidad} cuotas de ${fmtMoney(c.monto, m)}`);
        });
    }

    lines.push('');
    if (s.validez) lines.push(`⏳ Promo válida hasta el ${isoToDisplay(s.validez)}`);
    if (s.notas) lines.push(`ℹ️ ${s.notas}`);
    lines.push('📲 ¡Escribinos y reservá tu lugar!');
    return lines.join('\n');
}

async function copyText() {
    const s = readForm();
    const text = buildSocialText(s, computePaquete(s));
    try {
        await navigator.clipboard.writeText(text);
        window.showAlert('success', 'Texto copiado. Pegalo en la publicación de tus redes.', true);
    } catch (err) {
        window.showAlert('error', 'No se pudo copiar el texto al portapapeles.', true);
    }
}

function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = HTML2CANVAS_URL;
        script.onload = () => resolve(window.html2canvas);
        script.onerror = () => reject(new Error('No se pudo cargar el generador de imágenes.'));
        document.head.appendChild(script);
    });
}

async function waitForImages(root) {
    const imgs = Array.from(root.querySelectorAll('img'));
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = res; })));
}

function slugify(str) {
    return String(str || 'paquete')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'paquete';
}

async function downloadFlyer() {
    const s = readForm();
    if (!validateRequired(s)) return;
    const r = computePaquete(s);
    const target = $('pq-flyer-export');

    window.showLoader('Generando imagen para redes...');
    try {
        const html2canvas = await loadHtml2Canvas();
        target.innerHTML = buildFlyerHTML(s, r);
        await waitForImages(target);
        if (document.fonts?.ready) await document.fonts.ready;

        const canvas = await html2canvas(target.firstElementChild, {
            width: FLYER_W,
            height: FLYER_H,
            scale: 1,
            useCORS: true,
            backgroundColor: '#0f172a',
            logging: false
        });
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        if (!blob) throw new Error('No se pudo generar la imagen.');

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paquete-${slugify(s.destino)}-${slugify(s.titulo)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
        window.showAlert('error', err.message || 'No se pudo generar la imagen.', true);
    } finally {
        target.innerHTML = '';
        window.hideLoader();
    }
}
