// configuracion.js - Configuración: Catálogo de Hoteles de la sucursal
import {
    REGIMENES, HABITACIONES, MAX_FOTOS_HOTEL, MAX_DESCRIPCION_HOTEL,
    escapeHtml, safeImageSrc, starsToString, resizeImageFile, fetchHotelList, fetchHotel
} from './hotel_catalog.js';

let hotels = [];
let airlines = [];
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
    setupAirlineEditor();
    document.getElementById('config-btn-export-csv').addEventListener('click', exportarCotizacionesCsv);
    document.getElementById('config-btn-new-hotel').addEventListener('click', () => openEditor());
    document.getElementById('config-btn-new-airline').addEventListener('click', () => openAirlineEditor());
    document.getElementById('config-hotel-search').addEventListener('input', renderGrid);

    // Ambos catálogos se cargan al entrar para poder mostrar el conteo en el menú
    await Promise.all([loadHotels(), loadAirlines()]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Navegación entre el menú y cada panel
// ──────────────────────────────────────────────────────────────────────────────

const PANELES = ['hoteles', 'aerolineas', 'exportar'];

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function volverAlMenu() {
    PANELES.forEach(p => document.getElementById(`config-panel-${p}`)?.classList.add('hidden'));
    document.getElementById('config-menu').classList.remove('hidden');
    actualizarConteos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarConteos() {
    const etiqueta = (n, sing, plur) => n ? `${n} ${n === 1 ? sing : plur}` : 'Vacío';
    const elH = document.getElementById('config-count-hoteles');
    if (elH) elH.textContent = etiqueta(hotels.length, 'hotel', 'hoteles');
    const elA = document.getElementById('config-count-aerolineas');
    if (elA) elA.textContent = etiqueta(airlines.length, 'aerolínea', 'aerolíneas');
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
        <div class="group bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
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

    grid.querySelectorAll('[data-edit-hotel]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.editHotel)));
    grid.querySelectorAll('[data-delete-hotel]').forEach(btn => btn.addEventListener('click', () => confirmDelete(btn.dataset.deleteHotel)));
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
    if (e.key === 'Escape' && isEditorOpen()) closeEditor();
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
        const wasEditing = !!editingId;
        closeEditor();
        await loadHotels();
        window.showAlert('success', wasEditing ? `Hotel "${nombre}" actualizado.` : `Hotel "${nombre}" agregado al catálogo.`);
    } catch (err) {
        window.showAlert('error', err.message, true);
    } finally {
        saveBtn.disabled = false;
        window.hideLoader();
    }
}
