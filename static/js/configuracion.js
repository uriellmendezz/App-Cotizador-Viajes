// configuracion.js - Configuración: Catálogo de Hoteles de la sucursal
import {
    REGIMENES, HABITACIONES, MAX_FOTOS_HOTEL, MAX_DESCRIPCION_HOTEL,
    escapeHtml, safeImageSrc, starsToString, resizeImageFile, fetchHotelList, fetchHotel
} from './hotel_catalog.js';
import { OPERADORES, LOGO_OPERADOR_CLASS, TIPOS_COMISION, fetchComisiones, saveComision, fmtPct } from './operadores.js';

let hotels = [];
let airlines = [];
let comisiones = {};
let editingComision = null; // { operador, campo } mientras se edita un porcentaje
let logosSugeridos = [];
let editingId = null;
let editingAirlineId = null;
let airlineLogo = '';
let editorFotos = [];
let editorStars = 4;

export async function initConfiguracion() {
    if (window.loggedInUser === 'guest' || window.loggedInUser === 'Invitado') {
        document.getElementById('config-menu').innerHTML =
            '<div class="col-span-full text-center text-xs font-semibold text-slate-500 py-16">La configuración está disponible solo para agentes.</div>';
        return;
    }

    setupMenu();
    setupEditor();
    setupHotelView();
    setupAirlineEditor();
    document.getElementById('config-btn-export-csv').addEventListener('click', exportarCotizacionesCsv);
    document.getElementById('config-btn-new-hotel').addEventListener('click', () => openEditor());
    document.getElementById('config-btn-new-airline').addEventListener('click', () => openAirlineEditor());
    document.getElementById('config-hotel-search').addEventListener('input', renderGrid);

    // Los catálogos se cargan al entrar para poder mostrar el conteo en el menú
    await Promise.all([loadHotels(), loadAirlines(), loadComisiones()]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Navegación entre el menú y cada panel
// ──────────────────────────────────────────────────────────────────────────────

const PANELES = ['hoteles', 'aerolineas', 'comisiones', 'exportar'];

// Texto del encabezado de la página para el menú y cada sección
const ENCABEZADOS = {
    menu: {
        tag: 'Configuración',
        tagCls: 'text-brand-primary bg-rose-50',
        titulo: 'Configuración',
        desc: 'Administrá los datos que reutilizás en tus cotizaciones y descargá tu información.'
    },
    hoteles: {
        tag: 'Configuración',
        tagCls: 'text-brand-primary bg-rose-50',
        titulo: 'Catálogo de Hoteles',
        desc: 'Alojamientos con fotos, descripción y estrellas, listos para usar en cotizaciones y paquetes.'
    },
    aerolineas: {
        tag: 'Configuración',
        tagCls: 'text-sky-600 bg-sky-50',
        titulo: 'Catálogo de Aerolíneas',
        desc: 'Cargá aerolíneas con su logo para identificar los vuelos en las cotizaciones rápidas.'
    },
    comisiones: {
        tag: 'Configuración',
        tagCls: 'text-amber-600 bg-amber-50',
        titulo: 'Comisiones de Operadores',
        desc: 'Porcentaje de comisión de cada operador por servicios terrestres, aéreos y paquetes enteros.'
    },
    exportar: {
        tag: 'Configuración',
        tagCls: 'text-emerald-600 bg-emerald-50',
        titulo: 'Exportar Cotizaciones',
        desc: 'Descargá todas tus cotizaciones en un CSV listo para abrir en Excel.'
    }
};

function actualizarEncabezado(seccion) {
    const datos = ENCABEZADOS[seccion] || ENCABEZADOS.menu;
    const tag = document.getElementById('config-header-tag');
    if (tag) {
        tag.textContent = datos.tag;
        tag.className = `inline-block text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${datos.tagCls}`;
    }
    const titulo = document.getElementById('config-header-title');
    if (titulo) titulo.textContent = datos.titulo;
    const desc = document.getElementById('config-header-desc');
    if (desc) desc.textContent = datos.desc;
    // El botón de volver solo aparece dentro de una sección
    document.getElementById('config-header-back')?.classList.toggle('hidden', seccion === 'menu');
}

function setupMenu() {
    document.querySelectorAll('[data-config-open]').forEach(btn => {
        btn.addEventListener('click', () => abrirPanel(btn.dataset.configOpen));
    });
    document.querySelectorAll('[data-config-back]').forEach(btn => {
        btn.addEventListener('click', volverAlMenu);
    });
}

function abrirPanel(nombre) {
    document.getElementById('config-menu').classList.add('hidden');
    PANELES.forEach(p => {
        document.getElementById(`config-panel-${p}`)?.classList.toggle('hidden', p !== nombre);
    });
    actualizarEncabezado(nombre);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function volverAlMenu() {
    PANELES.forEach(p => document.getElementById(`config-panel-${p}`)?.classList.add('hidden'));
    document.getElementById('config-menu').classList.remove('hidden');
    actualizarEncabezado('menu');
    actualizarConteos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarConteos() {
    const etiqueta = (n, sing, plur) => n ? `${n} ${n === 1 ? sing : plur}` : 'Vacío';
    const elH = document.getElementById('config-count-hoteles');
    if (elH) elH.textContent = etiqueta(hotels.length, 'hotel', 'hoteles');
    const elA = document.getElementById('config-count-aerolineas');
    if (elA) elA.textContent = etiqueta(airlines.length, 'aerolínea', 'aerolíneas');
    const elC = document.getElementById('config-count-comisiones');
    if (elC) {
        const configurados = OPERADORES.filter(o => TIPOS_COMISION.some(t => comisiones[o.id]?.[t.campo] > 0)).length;
        elC.textContent = configurados ? `${configurados} de ${OPERADORES.length}` : 'Sin configurar';
    }
}

async function loadHotels() {
    const grid = document.getElementById('config-hotels-grid');
    try {
        hotels = await fetchHotelList();
        renderGrid();
        actualizarConteos();
    } catch (err) {
        if (grid) grid.innerHTML = `<div class="col-span-full text-center text-xs font-semibold text-rose-500 py-16">${escapeHtml(err.message)}</div>`;
    }
}

function renderGrid() {
    const grid = document.getElementById('config-hotels-grid');
    if (!grid) return;
    const q = (document.getElementById('config-hotel-search')?.value || '').toLowerCase().trim();
    const list = q ? hotels.filter(h => `${h.nombre} ${h.destino}`.toLowerCase().includes(q)) : hotels;

    if (!list.length) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center text-center gap-3 py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                <svg class="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                <p class="text-xs font-semibold text-slate-500">${q ? 'No hay hoteles que coincidan con la búsqueda.' : 'Todavía no cargaste hoteles. Empezá con el botón "Nuevo Hotel".'}</p>
            </div>`;
        return;
    }

    grid.innerHTML = list.map(h => `
        <div data-view-hotel="${h.id}" role="button" tabindex="0" title="Ver ficha del hotel"
            class="group bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col cursor-pointer focus:outline-none focus:ring-4 focus:ring-brand-primary/10">
            <div class="relative h-40 bg-slate-100 overflow-hidden">
                ${safeImageSrc(h.portada) ? `<img src="${safeImageSrc(h.portada)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">` : '<div class="w-full h-full flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-slate-400">Sin fotos</div>'}
                ${h.total_fotos > 1 ? `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/60 text-white text-[10px] font-bold">${h.total_fotos} fotos</span>` : ''}
            </div>
            <div class="p-4 flex flex-col gap-1 flex-1">
                <div class="text-sm font-bold text-slate-800 truncate" title="${escapeHtml(h.nombre)}">${escapeHtml(h.nombre)}</div>
                <div class="text-xs text-amber-500 tracking-wider">${starsToString(h.estrellas)}</div>
                <div class="text-[11px] text-slate-500 font-semibold truncate">${escapeHtml(h.destino || 'Sin destino')}${h.regimen ? ' · ' + escapeHtml(h.regimen) : ''}</div>
                ${h.descripcion ? `<p class="text-[11px] text-slate-500 leading-snug mt-1 line-clamp-2">${escapeHtml(h.descripcion)}</p>` : ''}
                <div class="flex gap-2 pt-3 mt-auto">
                    <button type="button" data-edit-hotel="${h.id}" class="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Editar</button>
                    <button type="button" data-delete-hotel="${h.id}" class="px-3 py-2 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Eliminar</button>
                </div>
            </div>
        </div>`).join('');

    // stopPropagation: los botones no deben abrir además la ficha del hotel
    grid.querySelectorAll('[data-edit-hotel]').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(btn.dataset.editHotel);
    }));
    grid.querySelectorAll('[data-delete-hotel]').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDelete(btn.dataset.deleteHotel);
    }));
    grid.querySelectorAll('[data-view-hotel]').forEach(card => {
        card.addEventListener('click', () => openHotelView(card.dataset.viewHotel));
        card.addEventListener('keydown', (e) => {
            if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            openHotelView(card.dataset.viewHotel);
        });
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Ficha del hotel (modal de solo lectura)
// ──────────────────────────────────────────────────────────────────────────────

let viewingHotelId = null;
let viewFotos = [];

function setupHotelView() {
    const modal = document.getElementById('config-hotel-view-modal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-hotel-view]')) closeHotelView();
    });
    document.getElementById('hotel-view-edit-btn').addEventListener('click', () => {
        const id = viewingHotelId;
        closeHotelView();
        openEditor(id);
    });
}

function isHotelViewOpen() {
    const modal = document.getElementById('config-hotel-view-modal');
    return !!modal && !modal.classList.contains('pointer-events-none');
}

async function openHotelView(id) {
    window.showLoader('Cargando hotel...');
    let hotel;
    try {
        hotel = await fetchHotel(id);
    } catch (err) {
        window.showAlert('error', err.message);
        return;
    } finally {
        window.hideLoader();
    }

    viewingHotelId = id;
    viewFotos = Array.isArray(hotel.fotos) ? hotel.fotos.filter(safeImageSrc) : [];
    const sinDato = '<span class="text-slate-400 font-medium">Sin especificar</span>';

    document.getElementById('hotel-view-nombre').textContent = hotel.nombre || '';
    document.getElementById('hotel-view-estrellas').textContent = starsToString(hotel.estrellas);
    document.getElementById('hotel-view-destino').innerHTML = hotel.destino ? escapeHtml(hotel.destino) : sinDato;
    document.getElementById('hotel-view-regimen').innerHTML = hotel.regimen ? escapeHtml(hotel.regimen) : sinDato;
    document.getElementById('hotel-view-habitacion').innerHTML = hotel.habitacion ? escapeHtml(hotel.habitacion) : sinDato;
    document.getElementById('hotel-view-descripcion').innerHTML = hotel.descripcion
        ? escapeHtml(hotel.descripcion) : '<span class="text-slate-400">Este hotel no tiene descripción.</span>';

    document.getElementById('hotel-view-sin-fotos').classList.toggle('hidden', viewFotos.length > 0);
    renderHotelViewThumbs();
    showHotelViewFoto(0);

    document.getElementById('config-hotel-view-modal').classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => document.querySelector('#config-hotel-view-modal [data-close-hotel-view]')?.focus(), 50);
}

function renderHotelViewThumbs() {
    const thumbs = document.getElementById('hotel-view-thumbs');
    thumbs.classList.toggle('hidden', viewFotos.length < 2);
    thumbs.innerHTML = viewFotos.length < 2 ? '' : viewFotos.map((f, i) => `
        <button type="button" data-view-foto="${i}" title="Ver foto ${i + 1}"
            class="aspect-[4/3] rounded-lg overflow-hidden border-2 border-transparent hover:border-slate-300 transition-all cursor-pointer">
            <img src="${f}" alt="" class="w-full h-full object-cover">
        </button>`).join('');
    thumbs.querySelectorAll('[data-view-foto]').forEach(btn => btn.addEventListener('click', () => {
        showHotelViewFoto(parseInt(btn.dataset.viewFoto, 10));
    }));
}

function showHotelViewFoto(index) {
    const img = document.getElementById('hotel-view-foto');
    const counter = document.getElementById('hotel-view-foto-counter');
    const foto = viewFotos[index];
    img.classList.toggle('hidden', !foto);
    img.src = foto || '';
    counter.classList.toggle('hidden', viewFotos.length < 2);
    counter.textContent = `${index + 1} / ${viewFotos.length}`;
    document.querySelectorAll('#hotel-view-thumbs [data-view-foto]').forEach((btn, i) => {
        btn.classList.toggle('border-brand-primary', i === index);
        btn.classList.toggle('border-transparent', i !== index);
    });
}

function closeHotelView() {
    document.getElementById('config-hotel-view-modal')?.classList.add('opacity-0', 'pointer-events-none');
    viewingHotelId = null;
}

function confirmDelete(id) {
    const hotel = hotels.find(h => String(h.id) === String(id));
    window.showCustomConfirm({
        title: '¿Eliminar Hotel?',
        desc: `Se eliminará "${hotel?.nombre || 'este hotel'}" del catálogo. Las cotizaciones y paquetes ya creados no se modifican.`,
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            window.showLoader('Eliminando hotel...');
            try {
                const res = await window.authenticatedFetch(`/api/hoteles/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'No se pudo eliminar el hotel.');
                }
                hotels = hotels.filter(h => String(h.id) !== String(id));
                renderGrid();
                window.showAlert('success', 'Hotel eliminado del catálogo.');
            } catch (err) {
                window.showAlert('error', err.message);
            } finally {
                window.hideLoader();
            }
        }
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// Comisiones de Operadores
// ──────────────────────────────────────────────────────────────────────────────

async function loadComisiones() {
    const list = document.getElementById('config-comisiones-list');
    try {
        comisiones = await fetchComisiones();
        renderComisiones();
        actualizarConteos();
    } catch (err) {
        if (list) list.innerHTML = `<div class="text-center text-xs font-semibold text-rose-500 py-16">${escapeHtml(err.message)}</div>`;
    }
}

const PENCIL_SVG = '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2.5 2.5 0 113.536 3.536L12.536 16.5 8 18l1-5z" /></svg>';

function renderComisionCell(op, tipo) {
    const valor = comisiones[op.id]?.[tipo.campo] ?? 0;
    const editando = editingComision?.operador === op.id && editingComision?.campo === tipo.campo;
    const cuerpo = editando ? `
        <div class="flex items-center gap-2">
            <div class="relative flex-1 min-w-0">
                <input type="number" data-comision-input min="0" max="100" step="0.01" value="${valor || ''}" placeholder="0"
                    class="w-full border border-brand-primary rounded-lg pl-3 pr-7 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-brand-primary/10 bg-white">
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
            </div>
            <button type="button" data-comision-save title="Guardar" class="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            </button>
            <button type="button" data-comision-cancel title="Cancelar" class="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>` : `
        <div class="flex items-center justify-between gap-2">
            <span class="text-2xl font-black text-slate-900 font-display">${fmtPct(valor)}</span>
            <button type="button" data-comision-edit="${op.id}:${tipo.campo}" title="Editar porcentaje" aria-label="Editar ${escapeHtml(tipo.label)} de ${escapeHtml(op.nombre)}"
                class="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-brand-primary hover:border-brand-primary transition-all cursor-pointer">${PENCIL_SVG}</button>
        </div>`;
    return `
        <div class="rounded-xl bg-slate-50 border border-slate-200/70 p-4 flex flex-col gap-2">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">${tipo.label}</span>
            ${cuerpo}
        </div>`;
}

function renderComisiones() {
    const list = document.getElementById('config-comisiones-list');
    if (!list) return;

    list.innerHTML = OPERADORES.map(op => `
        <div class="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center gap-5">
            <div class="lg:w-48 h-16 shrink-0 flex items-center justify-center lg:justify-start">
                <img src="${op.logo}" alt="${escapeHtml(op.nombre)}" class="${LOGO_OPERADOR_CLASS}">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                ${TIPOS_COMISION.map(t => renderComisionCell(op, t)).join('')}
            </div>
        </div>`).join('');

    list.querySelectorAll('[data-comision-edit]').forEach(btn => btn.addEventListener('click', () => {
        const [operador, campo] = btn.dataset.comisionEdit.split(':');
        editingComision = { operador, campo };
        renderComisiones();
        list.querySelector('[data-comision-input]')?.select();
    }));
    list.querySelector('[data-comision-save]')?.addEventListener('click', guardarComision);
    list.querySelector('[data-comision-cancel]')?.addEventListener('click', cancelarComision);
    list.querySelector('[data-comision-input]')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); guardarComision(); }
        if (e.key === 'Escape') cancelarComision();
    });
}

function cancelarComision() {
    editingComision = null;
    renderComisiones();
}

async function guardarComision() {
    if (!editingComision) return;
    const { operador, campo } = editingComision;
    const input = document.querySelector('#config-comisiones-list [data-comision-input]');
    const valor = input?.value === '' ? 0 : parseFloat(input?.value);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        window.showAlert('warning', 'Ingresá un porcentaje entre 0 y 100.', true);
        input?.focus();
        return;
    }

    window.showLoader('Guardando comisión...');
    try {
        const saved = await saveComision(operador, { [campo]: valor });
        comisiones[operador] = { ...comisiones[operador], ...saved };
        editingComision = null;
        renderComisiones();
        actualizarConteos();
        window.showAlert('success', 'Comisión actualizada.');
    } catch (err) {
        window.showAlert('error', err.message);
    } finally {
        window.hideLoader();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Catálogo de Aerolíneas
// ──────────────────────────────────────────────────────────────────────────────

async function loadAirlines() {
    const grid = document.getElementById('config-airlines-grid');
    try {
        const res = await window.authenticatedFetch('/api/aerolineas');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo cargar el catálogo de aerolíneas.');
        }
        airlines = await res.json();
        renderAirlines();
        actualizarConteos();
    } catch (err) {
        if (grid) grid.innerHTML = `<div class="col-span-full text-center text-xs font-semibold text-rose-500 py-16">${escapeHtml(err.message)}</div>`;
    }
}

function renderAirlines() {
    const grid = document.getElementById('config-airlines-grid');
    if (!grid) return;

    if (!airlines.length) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center text-center gap-3 py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                <svg class="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-5.5l8 2.5z" /></svg>
                <p class="text-xs font-semibold text-slate-500">Todavía no cargaste aerolíneas. Empezá con el botón "Nueva Aerolínea".</p>
            </div>`;
        return;
    }

    grid.innerHTML = airlines.map(a => `
        <div class="group bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
            <div class="h-24 bg-slate-50 flex items-center justify-center p-4">
                ${a.logo ? `<img src="${escapeHtml(a.logo)}" alt="" class="max-h-full max-w-full object-contain">`
                         : '<span class="text-[10px] font-bold uppercase tracking-wider text-slate-300">Sin logo</span>'}
            </div>
            <div class="p-4 flex flex-col gap-1 flex-1 border-t border-slate-100">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-slate-800 truncate" title="${escapeHtml(a.nombre)}">${escapeHtml(a.nombre)}</span>
                    ${a.codigo ? `<span class="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black tracking-wider">${escapeHtml(a.codigo)}</span>` : ''}
                </div>
                <div class="flex gap-2 pt-3 mt-auto">
                    <button type="button" data-edit-airline="${a.id}" class="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Editar</button>
                    <button type="button" data-delete-airline="${a.id}" class="px-3 py-2 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer">Eliminar</button>
                </div>
            </div>
        </div>`).join('');

    grid.querySelectorAll('[data-edit-airline]').forEach(btn => btn.addEventListener('click', () => openAirlineEditor(btn.dataset.editAirline)));
    grid.querySelectorAll('[data-delete-airline]').forEach(btn => btn.addEventListener('click', () => confirmDeleteAirline(btn.dataset.deleteAirline)));
}

function confirmDeleteAirline(id) {
    const a = airlines.find(x => String(x.id) === String(id));
    window.showCustomConfirm({
        title: '¿Eliminar Aerolínea?',
        desc: `Se eliminará "${a?.nombre || 'esta aerolínea'}" del catálogo. Las cotizaciones ya creadas no se modifican.`,
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            window.showLoader('Eliminando aerolínea...');
            try {
                const res = await window.authenticatedFetch(`/api/aerolineas/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'No se pudo eliminar la aerolínea.');
                }
                airlines = airlines.filter(x => String(x.id) !== String(id));
                renderAirlines();
                actualizarConteos();
                window.showAlert('success', 'Aerolínea eliminada del catálogo.');
            } catch (err) {
                window.showAlert('error', err.message);
            } finally {
                window.hideLoader();
            }
        }
    });
}

function setupAirlineEditor() {
    const modal = document.getElementById('config-airline-modal');
    const form = document.getElementById('config-airline-form');

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-airline-modal]')) closeAirlineEditor();
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveAirline();
    });

    document.getElementById('airline-btn-upload').addEventListener('click', () => document.getElementById('airline-logo-input').click());
    document.getElementById('airline-btn-clear-logo').addEventListener('click', () => {
        airlineLogo = '';
        renderAirlineLogo();
    });
    document.getElementById('airline-logo-input').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            airlineLogo = await resizeImageFile(file, 400, 240, 0.9);
            renderAirlineLogo();
        } catch (err) {
            window.showAlert('error', err.message, true);
        }
    });
}

function renderAirlineLogo() {
    const preview = document.getElementById('airline-logo-preview');
    preview.innerHTML = airlineLogo
        ? `<img src="${escapeHtml(airlineLogo)}" alt="" class="max-h-full max-w-full object-contain">`
        : '<span class="text-[10px] font-bold text-slate-300 uppercase">Sin logo</span>';

    document.querySelectorAll('#airline-logos-sugeridos [data-logo-ruta]').forEach(btn => {
        const elegido = btn.dataset.logoRuta === airlineLogo;
        btn.classList.toggle('border-brand-primary', elegido);
        btn.classList.toggle('border-slate-200', !elegido);
    });
}

async function renderLogosSugeridos() {
    const cont = document.getElementById('airline-logos-sugeridos');
    if (!cont) return;
    if (!logosSugeridos.length) {
        try {
            const res = await window.authenticatedFetch('/api/aerolineas/logos-sugeridos');
            if (res.ok) logosSugeridos = await res.json();
        } catch (err) {
            console.warn('No se pudieron cargar los logos incluidos:', err);
        }
    }
    if (!logosSugeridos.length) {
        cont.innerHTML = '<p class="col-span-full text-[10px] font-semibold text-slate-400">No hay logos incluidos disponibles.</p>';
        return;
    }
    cont.innerHTML = logosSugeridos.map(l => `
        <button type="button" data-logo-ruta="${escapeHtml(l.ruta)}" title="${escapeHtml(l.nombre)}"
            class="h-14 rounded-xl border-2 border-slate-200 bg-white hover:border-brand-primary transition-all cursor-pointer flex items-center justify-center p-1.5">
            <img src="${escapeHtml(l.ruta)}" alt="${escapeHtml(l.nombre)}" class="max-h-full max-w-full object-contain">
        </button>`).join('');

    cont.querySelectorAll('[data-logo-ruta]').forEach(btn => btn.addEventListener('click', () => {
        airlineLogo = btn.dataset.logoRuta;
        const nombreInput = document.getElementById('airline-nombre');
        if (!nombreInput.value.trim()) {
            nombreInput.value = logosSugeridos.find(l => l.ruta === airlineLogo)?.nombre || '';
        }
        renderAirlineLogo();
    }));
}

async function openAirlineEditor(id = null) {
    editingAirlineId = id;
    airlineLogo = '';
    document.getElementById('config-airline-form').reset();
    document.getElementById('config-airline-modal-title').textContent = id ? 'Editar Aerolínea' : 'Nueva Aerolínea';

    if (id) {
        const a = airlines.find(x => String(x.id) === String(id));
        if (a) {
            document.getElementById('airline-nombre').value = a.nombre || '';
            document.getElementById('airline-codigo').value = a.codigo || '';
            airlineLogo = a.logo || '';
        }
    }

    await renderLogosSugeridos();
    renderAirlineLogo();

    const modal = document.getElementById('config-airline-modal');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => document.getElementById('airline-nombre').focus(), 50);
}

function closeAirlineEditor() {
    document.getElementById('config-airline-modal')?.classList.add('opacity-0', 'pointer-events-none');
    editingAirlineId = null;
}

async function saveAirline() {
    const nombreInput = document.getElementById('airline-nombre');
    const nombre = nombreInput.value.trim();
    if (!nombre) {
        nombreInput.focus();
        nombreInput.classList.add('border-rose-400');
        setTimeout(() => nombreInput.classList.remove('border-rose-400'), 1500);
        return;
    }

    const payload = {
        nombre,
        codigo: document.getElementById('airline-codigo').value.trim(),
        logo: airlineLogo
    };

    const saveBtn = document.getElementById('config-airline-save-btn');
    saveBtn.disabled = true;
    window.showLoader(editingAirlineId ? 'Actualizando aerolínea...' : 'Guardando aerolínea...');
    try {
        const res = await window.authenticatedFetch(editingAirlineId ? `/api/aerolineas/${editingAirlineId}` : '/api/aerolineas', {
            method: editingAirlineId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo guardar la aerolínea.');
        }
        const editaba = !!editingAirlineId;
        closeAirlineEditor();
        await loadAirlines();
        window.showAlert('success', editaba ? `Aerolínea "${nombre}" actualizada.` : `Aerolínea "${nombre}" agregada al catálogo.`);
    } catch (err) {
        window.showAlert('error', err.message, true);
    } finally {
        saveBtn.disabled = false;
        window.hideLoader();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Exportación de cotizaciones a CSV
// ──────────────────────────────────────────────────────────────────────────────

async function exportarCotizacionesCsv() {
    const btn = document.getElementById('config-btn-export-csv');
    btn.disabled = true;
    window.showLoader('Generando archivo CSV...');
    try {
        const res = await window.authenticatedFetch('/api/exportar-cotizaciones-csv');
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo generar el archivo.');
        }
        const blob = await res.blob();
        if (blob.size <= 3) {
            window.showAlert('warning', 'Todavía no hay cotizaciones para exportar.');
            return;
        }

        // El backend propone el nombre en Content-Disposition
        const disp = res.headers.get('Content-Disposition') || '';
        const match = disp.match(/filename="?([^"]+)"?/);
        const nombre = match ? match[1] : `cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        window.showAlert('success', 'Archivo descargado con todas tus cotizaciones.');
    } catch (err) {
        window.showAlert('error', err.message);
    } finally {
        btn.disabled = false;
        window.hideLoader();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Editor de hotel (modal)
// ──────────────────────────────────────────────────────────────────────────────

function setupEditor() {
    const modal = document.getElementById('config-hotel-modal');
    const form = document.getElementById('config-hotel-form');

    document.getElementById('hotel-regimen').innerHTML =
        '<option value="">Sin especificar</option>' + REGIMENES.map(r => `<option value="${r}">${r}</option>`).join('');
    document.getElementById('hotel-habitacion-options').innerHTML =
        HABITACIONES.map(h => `<option value="${h}"></option>`).join('');

    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close-hotel-modal]')) closeEditor();
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveHotel();
    });

    const desc = document.getElementById('hotel-descripcion');
    desc.addEventListener('input', updateDescCounter);

    document.getElementById('hotel-fotos-input').addEventListener('change', async (e) => {
        await addFotoFiles(Array.from(e.target.files || []));
        e.target.value = '';
    });

    // Each navigation re-imports this module: drop the listeners of the previous instance
    if (window.__configHotelListeners) {
        document.removeEventListener('paste', window.__configHotelListeners.paste);
        document.removeEventListener('keydown', window.__configHotelListeners.keydown);
    }
    window.__configHotelListeners = { paste: onPaste, keydown: onKeydown };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeydown);
}

function isEditorOpen() {
    const modal = document.getElementById('config-hotel-modal');
    return !!modal && !modal.classList.contains('pointer-events-none');
}

function onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (isEditorOpen()) closeEditor();
    else if (isHotelViewOpen()) closeHotelView();
}

async function onPaste(e) {
    if (!isEditorOpen()) return;
    const files = Array.from(e.clipboardData?.items || [])
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);
    if (files.length) {
        e.preventDefault();
        await addFotoFiles(files);
    }
}

function renderStarsPicker() {
    const picker = document.getElementById('hotel-estrellas-picker');
    picker.innerHTML = [1, 2, 3, 4, 5].map(n => `
        <button type="button" data-star="${n}" role="radio" aria-checked="${n === editorStars}" title="${n} estrella${n > 1 ? 's' : ''}"
            class="text-2xl leading-none transition-transform hover:scale-110 cursor-pointer ${n <= editorStars ? 'text-amber-400' : 'text-slate-300'}">★</button>`).join('')
        + `<span class="ml-2 text-[11px] font-bold text-slate-500">${editorStars} estrella${editorStars > 1 ? 's' : ''}</span>`;
    picker.querySelectorAll('[data-star]').forEach(btn => btn.addEventListener('click', () => {
        editorStars = parseInt(btn.dataset.star, 10);
        renderStarsPicker();
    }));
}

function updateDescCounter() {
    const desc = document.getElementById('hotel-descripcion');
    document.getElementById('hotel-descripcion-counter').textContent = `${desc.value.length}/${MAX_DESCRIPCION_HOTEL}`;
}

function renderFotos() {
    const grid = document.getElementById('hotel-fotos-grid');
    document.getElementById('hotel-fotos-counter').textContent = `${editorFotos.length}/${MAX_FOTOS_HOTEL}`;

    const tiles = editorFotos.map((f, i) => `
        <div class="relative aspect-[4/3] rounded-xl overflow-hidden border ${i === 0 ? 'border-brand-primary border-2' : 'border-slate-200'} group">
            <img src="${f}" alt="" class="w-full h-full object-cover">
            ${i === 0 ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-brand-primary text-white text-[9px] font-black uppercase tracking-wider">Portada</span>' : `
            <button type="button" data-cover-foto="${i}" title="Usar como portada" class="absolute top-2 left-2 w-7 h-7 rounded-lg bg-slate-950/50 text-white hover:bg-brand-primary flex items-center justify-center text-sm cursor-pointer transition-all">★</button>`}
            <button type="button" data-remove-foto="${i}" title="Quitar foto" class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-slate-950/50 text-white hover:bg-rose-500 flex items-center justify-center cursor-pointer transition-all">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>`);

    if (editorFotos.length < MAX_FOTOS_HOTEL) {
        tiles.push(`
            <button type="button" id="hotel-fotos-add" class="aspect-[4/3] rounded-xl border-2 border-dashed border-slate-200 hover:border-brand-primary bg-white flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-brand-primary transition-all cursor-pointer">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <span class="text-[10px] font-bold uppercase tracking-wider">Agregar fotos</span>
            </button>`);
    }
    grid.innerHTML = tiles.join('');

    grid.querySelectorAll('[data-remove-foto]').forEach(btn => btn.addEventListener('click', () => {
        editorFotos.splice(parseInt(btn.dataset.removeFoto, 10), 1);
        renderFotos();
    }));
    grid.querySelectorAll('[data-cover-foto]').forEach(btn => btn.addEventListener('click', () => {
        const [foto] = editorFotos.splice(parseInt(btn.dataset.coverFoto, 10), 1);
        editorFotos.unshift(foto);
        renderFotos();
    }));
    document.getElementById('hotel-fotos-add')?.addEventListener('click', () => document.getElementById('hotel-fotos-input').click());

    // Drag & drop over the photos area
    grid.ondragover = (e) => { e.preventDefault(); };
    grid.ondrop = async (e) => {
        e.preventDefault();
        await addFotoFiles(Array.from(e.dataTransfer?.files || []));
    };
}

async function addFotoFiles(files) {
    const images = files.filter(f => f.type.startsWith('image/'));
    const available = MAX_FOTOS_HOTEL - editorFotos.length;
    if (!images.length) return;
    if (images.length > available) {
        window.showAlert('warning', `Podés cargar hasta ${MAX_FOTOS_HOTEL} fotos por hotel.`, true);
    }
    for (const file of images.slice(0, Math.max(0, available))) {
        try {
            editorFotos.push(await resizeImageFile(file));
        } catch (err) {
            window.showAlert('error', err.message, true);
        }
    }
    renderFotos();
}

async function openEditor(id = null) {
    editingId = id;
    editorFotos = [];
    editorStars = 4;
    document.getElementById('config-hotel-form').reset();
    document.getElementById('config-hotel-modal-title').textContent = id ? 'Editar Hotel' : 'Nuevo Hotel';

    if (id) {
        window.showLoader('Cargando hotel...');
        try {
            const hotel = await fetchHotel(id);
            document.getElementById('hotel-nombre').value = hotel.nombre || '';
            document.getElementById('hotel-destino').value = hotel.destino || '';
            const regimenSel = document.getElementById('hotel-regimen');
            if (hotel.regimen && !REGIMENES.includes(hotel.regimen)) regimenSel.add(new Option(hotel.regimen, hotel.regimen));
            regimenSel.value = hotel.regimen || '';
            document.getElementById('hotel-habitacion').value = hotel.habitacion || '';
            document.getElementById('hotel-descripcion').value = hotel.descripcion || '';
            editorStars = parseInt(hotel.estrellas, 10) || 4;
            editorFotos = Array.isArray(hotel.fotos) ? hotel.fotos.filter(safeImageSrc) : [];
        } catch (err) {
            window.showAlert('error', err.message);
            return;
        } finally {
            window.hideLoader();
        }
    }

    renderStarsPicker();
    renderFotos();
    updateDescCounter();

    const modal = document.getElementById('config-hotel-modal');
    modal.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => document.getElementById('hotel-nombre').focus(), 50);
}

function closeEditor() {
    const modal = document.getElementById('config-hotel-modal');
    modal?.classList.add('opacity-0', 'pointer-events-none');
    editingId = null;
}

async function saveHotel() {
    const nombreInput = document.getElementById('hotel-nombre');
    const nombre = nombreInput.value.trim();
    if (!nombre) {
        nombreInput.focus();
        nombreInput.classList.add('border-rose-400');
        setTimeout(() => nombreInput.classList.remove('border-rose-400'), 1500);
        return;
    }

    const payload = {
        nombre,
        destino: document.getElementById('hotel-destino').value.trim(),
        estrellas: editorStars,
        regimen: document.getElementById('hotel-regimen').value,
        habitacion: document.getElementById('hotel-habitacion').value.trim(),
        descripcion: document.getElementById('hotel-descripcion').value.trim(),
        fotos: editorFotos
    };

    const saveBtn = document.getElementById('config-hotel-save-btn');
    saveBtn.disabled = true;
    window.showLoader(editingId ? 'Actualizando hotel...' : 'Guardando hotel...');
    try {
        const res = await window.authenticatedFetch(editingId ? `/api/hoteles/${editingId}` : '/api/hoteles', {
            method: editingId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo guardar el hotel.');
        }
        const saved = await res.json();
        const wasEditing = !!editingId;
        closeEditor();
        await loadHotels();
        // El backend unifica el nombre con el hotel ya registrado y normaliza el destino
        const est = saved.estandarizacion || {};
        const nombreFinal = saved.nombre || nombre;
        const destinoFinal = est.lugar ? ` (${est.lugar})` : '';
        const aviso = est.cambio ? ` Se guardó como "${nombreFinal}"${destinoFinal}.` : '';
        window.showAlert('success', (wasEditing ? `Hotel "${nombre}" actualizado.` : `Hotel "${nombre}" agregado al catálogo.`) + aviso);
    } catch (err) {
        window.showAlert('error', err.message, true);
    } finally {
        saveBtn.disabled = false;
        window.hideLoader();
    }
}
