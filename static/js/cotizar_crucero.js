// cotizar_crucero.js - Cotización de Crucero
// El agente arrastra el PDF del operador (ej. Ola), el backend extrae los datos del
// crucero y el formulario suma, de forma opcional, vuelos, alojamientos pre/post
// crucero y traslados. Se guarda en la tabla `cotizaciones` (tipo "crucero") y el
// PDF se genera con la plantilla de línea de tiempo (templates/cotizacion_crucero_pdf.html).

import { openHotelPicker, REGIMENES, starsToString, starsFromString, resizeImageFile, escapeHtml, safeImageSrc, MAX_DESCRIPCION_HOTEL } from './hotel_catalog.js';
import { renderCruceroSummaryHTML, extractCrucero, isCruceroQuote } from './crucero_resumen.js';

const OPERADORES_HABITUALES = ['Delfos', 'Ola'];
const BAG_TYPES = ['mano', 'carry', 'valija'];

let currentQuoteId = null;
let images = {};          // destino -> data URL (cabina, mapa, capturas de vuelo, fotos de hoteles)
let equipaje = new Set();

const $ = (id) => document.getElementById(id);
const num = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
};

// ── Fechas ────────────────────────────────────────────────────────────────────

/** '30/01/27', '30/01/2027' o '2027-01-30' -> '2027-01-30' */
function toISODate(val) {
    if (!val) return '';
    const s = String(val).trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!m) return '';
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function shiftISODate(iso, days) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setupDatePicker(el, onChange) {
    if (!el || typeof flatpickr === 'undefined') return;
    flatpickr(el, {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'd/m/y',
        disableMobile: 'true',
        onChange: () => {
            if (onChange) onChange();
            updateSummary();
        }
    });
}

function getDate(el) {
    if (!el) return '';
    if (el._flatpickr && el._flatpickr.selectedDates.length > 0) {
        const d = el._flatpickr.selectedDates[0];
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return toISODate(el.value);
}

function setDate(el, val) {
    if (!el) return;
    const iso = toISODate(val);
    if (el._flatpickr) {
        if (iso) el._flatpickr.setDate(iso, false);
        else el._flatpickr.clear();
    } else {
        el.value = iso;
    }
}

// ── Imágenes (foto de cabina, mapa, capturas de vuelo, fotos de hoteles) ─────

function renderImageDropzone(container) {
    const target = container.dataset.target;
    container.innerHTML = `
        <div class="cr-img-box relative overflow-hidden border-2 border-dashed border-slate-200 hover:border-brand-primary rounded-xl bg-white flex flex-col items-center justify-center min-h-[140px] cursor-pointer transition-all duration-300 group" tabindex="0">
            <div class="cr-img-empty flex flex-col items-center p-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-7 h-7 text-slate-400 group-hover:text-brand-primary transition-colors mb-2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <span class="text-xs text-slate-500 font-semibold text-center leading-relaxed">Arrastrá o hacé clic para subir<br><span class="text-[10px] text-brand-primary/80 font-bold">o pulsá Ctrl+V para pegar</span></span>
            </div>
            <img class="cr-img-preview absolute inset-0 w-full h-full object-contain bg-slate-50 rounded-xl hidden" alt="">
            <button type="button" class="cr-img-remove hidden absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-slate-200 text-slate-500 hover:text-rose-500 flex items-center justify-center shadow-sm" title="Quitar imagen">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <input type="file" accept="image/*" class="hidden">
        </div>`;

    const box = container.querySelector('.cr-img-box');
    const input = box.querySelector('input[type="file"]');
    box.addEventListener('click', (e) => {
        if (e.target.closest('.cr-img-remove')) return;
        input.click();
    });
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });
    input.addEventListener('change', () => {
        if (input.files[0]) loadImageFile(target, input.files[0]);
        input.value = '';
    });
    box.querySelector('.cr-img-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        setImage(target, '');
    });
    box.addEventListener('mouseenter', () => { window.__cruceroHoveredDrop = box; });
    box.addEventListener('mouseleave', () => {
        if (window.__cruceroHoveredDrop === box) window.__cruceroHoveredDrop = null;
    });
    ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.add('cr-dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, (e) => {
        e.preventDefault();
        box.classList.remove('cr-dragover');
    }));
    box.addEventListener('drop', (e) => {
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file) loadImageFile(target, file);
    });

    setImage(target, images[target] || '');
}

async function loadImageFile(target, file) {
    try {
        setImage(target, await resizeImageFile(file, 1400, 1400, 0.85));
    } catch (err) {
        window.showAlert?.('warning', err.message);
    }
}

function setImage(target, dataUrl) {
    const safe = safeImageSrc(dataUrl);
    if (safe) images[target] = safe;
    else delete images[target];
    document.querySelectorAll(`.cr-img-dropzone[data-target="${target}"]`).forEach(container => {
        const preview = container.querySelector('.cr-img-preview');
        if (!preview) return;
        preview.src = safe;
        preview.classList.toggle('hidden', !safe);
        container.querySelector('.cr-img-remove').classList.toggle('hidden', !safe);
        container.querySelector('.cr-img-empty').classList.toggle('invisible', !!safe);
    });
}

// Ctrl+V sobre la zona de imagen que está bajo el mouse (se registra una sola vez)
if (!window.__cruceroPasteBound) {
    window.__cruceroPasteBound = true;
    document.addEventListener('paste', (e) => {
        const box = window.__cruceroHoveredDrop;
        if (!box || !box.isConnected) return;
        const file = e.clipboardData && e.clipboardData.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        e.preventDefault();
        const target = box.closest('.cr-img-dropzone')?.dataset.target;
        if (target) loadImageFile(target, file);
    });
}

// ── PDF del operador ──────────────────────────────────────────────────────────

function setupPdfDropzone() {
    const dz = $('crucero-pdf-dropzone');
    const input = $('crucero-pdf-input');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
        }
    });
    input.addEventListener('change', () => {
        if (input.files[0]) handleCruisePdf(input.files[0]);
        input.value = '';
    });

    // El PDF se puede soltar sobre la zona o en cualquier parte del formulario
    const form = $('crucero-form');
    ['dragenter', 'dragover'].forEach(ev => form.addEventListener(ev, (e) => {
        if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
        e.preventDefault();
        dz.classList.add('cr-dragover');
    }));
    form.addEventListener('dragleave', (e) => {
        if (!form.contains(e.relatedTarget)) dz.classList.remove('cr-dragover');
    });
    form.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        e.preventDefault();
        dz.classList.remove('cr-dragover');
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            handleCruisePdf(file);
        } else {
            window.showAlert?.('warning', 'Soltá el PDF del crucero sobre el formulario, o una imagen sobre su recuadro.');
        }
    });
}

/** Devuelve true si el PDF se leyó y se cargó en el formulario. */
async function handleCruisePdf(file) {
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        window.showAlert?.('warning', 'El archivo debe ser un PDF.');
        return false;
    }
    window.changeFavicon?.('loading');
    window.showLoader('Leyendo el PDF del crucero...');
    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await window.authenticatedFetch('/api/crucero/extraer-pdf', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'No se pudo leer el PDF.');
        fillFromExtraction(data);
        renderPdfStatus(data, file.name);
        window.hideLoader();
        window.changeFavicon?.('success');
        return true;
    } catch (err) {
        window.hideLoader();
        window.changeFavicon?.('error');
        renderPdfStatus(null, file.name, err.message);
        return false;
    }
}

const FIELD_LABELS = {
    barco: 'Barco', cabina: 'Cabina', noches: 'Noches', fecha_embarque: 'Embarque',
    precio: 'Precio', itinerario: 'Itinerario'
};

function renderPdfStatus(data, fileName, error = '') {
    const box = $('crucero-pdf-status');
    box.classList.remove('hidden', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-800', 'bg-amber-50', 'border-amber-200', 'text-amber-800', 'bg-rose-50', 'border-rose-200', 'text-rose-700');
    if (error) {
        box.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-700');
        box.innerHTML = `<strong>${escapeHtml(fileName)}:</strong> ${escapeHtml(error)}`;
        return;
    }
    const found = data.campos_detectados || [];
    const missing = Object.keys(FIELD_LABELS).filter(k => !found.includes(k));
    const chips = found.map(k => `<span class="inline-flex px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-[10px] font-bold">${FIELD_LABELS[k]}</span>`).join(' ');
    const fotos = [data.imagen_cabina && 'foto de cabina', data.imagen_mapa && 'mapa'].filter(Boolean);
    box.classList.add(...(missing.length ? ['bg-amber-50', 'border-amber-200', 'text-amber-800'] : ['bg-emerald-50', 'border-emerald-200', 'text-emerald-800']));
    box.innerHTML = `
        <div class="flex flex-wrap items-center gap-1.5">
            <span>Datos leídos de <strong>${escapeHtml(fileName)}</strong>:</span> ${chips}
            ${fotos.length ? `<span class="text-[10px] font-semibold">+ ${fotos.join(' y ')}</span>` : ''}
        </div>
        ${missing.length ? `<div class="mt-2">No se encontró: <strong>${missing.map(k => FIELD_LABELS[k]).join(', ')}</strong>. Completalo a mano.</div>` : ''}
        ${data.completado_con_ia ? '<div class="mt-2 text-[10px]">Algunos datos se completaron con IA: revisalos antes de generar.</div>' : ''}
        <div class="mt-2 text-[10px] opacity-80">Los campos en verde se completaron desde el PDF. Revisalos y ajustá lo que haga falta.</div>`;
}

function markAutofilled(el) {
    if (!el) return;
    const visible = el._flatpickr?.altInput || el;
    visible.classList.add('cr-autofilled');
    visible.addEventListener('input', () => visible.classList.remove('cr-autofilled'), { once: true });
}

function setField(id, value, autofill = false) {
    const el = $(id);
    if (!el || value === undefined || value === null || value === '' || value === 0) return;
    if (el.classList.contains('cr-date')) setDate(el, value);
    else el.value = value;
    if (autofill) markAutofilled(el);
}

function fillFromExtraction(c) {
    setField('cr_barco', c.barco, true);
    setField('cr_naviera', c.naviera, true);
    setField('cr_cabina', c.cabina, true);
    setField('cr_cabina_tamano', c.cabina_tamano, true);
    setField('cr_noches', c.noches, true);
    setField('cr_fecha_embarque', c.fecha_embarque, true);
    setField('cr_fecha_desembarque', c.fecha_desembarque, true);
    setField('cr_codigo', c.codigo_presupuesto, true);
    setField('cr_puerto_embarque', c.puerto_embarque, true);
    setField('cr_puerto_desembarque', c.puerto_desembarque, true);
    setField('cr_operador', c.operador, true);
    setField('cr_costo_neto', c.precio, true);
    setField('cr_incluye', c.incluye, true);
    if (c.paquete_bebidas) setBebidas(c.paquete_bebidas);
    if (c.pasajeros && !$('cr_cantidad_pasajeros').value) setField('cr_cantidad_pasajeros', c.pasajeros, true);
    if (c.moneda && Array.from($('cr_moneda').options).some(o => o.value === c.moneda)) $('cr_moneda').value = c.moneda;

    if (Array.isArray(c.itinerario) && c.itinerario.length) {
        $('cr-itinerary-body').innerHTML = '';
        c.itinerario.forEach(row => addItineraryRow(row));
    }
    if (c.imagen_cabina) setImage('imagen_cabina', c.imagen_cabina);
    if (c.imagen_mapa) setImage('imagen_mapa', c.imagen_mapa);

    syncHotelDatesWithCruise();
    updateCurrencyLabels();
    updateSummary();
}

// ── Itinerario ────────────────────────────────────────────────────────────────

function addItineraryRow(row = {}) {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-slate-100';
    tr.innerHTML = `
        <td class="p-1.5"><input type="text" class="cr-itin-input cr-itin-fecha" placeholder="dd/mm/aa"></td>
        <td class="p-1.5"><input type="text" class="cr-itin-input cr-itin-puerto" placeholder="Ej. Nassau, Bahamas"></td>
        <td class="p-1.5"><input type="time" class="cr-itin-input cr-itin-llegada"></td>
        <td class="p-1.5"><input type="time" class="cr-itin-input cr-itin-salida"></td>
        <td class="p-1.5 text-center">
            <button type="button" class="cr-itin-remove p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors" title="Quitar día">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </td>`;
    $('cr-itinerary-body').appendChild(tr);
    const fecha = tr.querySelector('.cr-itin-fecha');
    if (typeof flatpickr !== 'undefined') {
        flatpickr(fecha, { dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/y', disableMobile: 'true' });
    }
    setDate(fecha, row.fecha || '');
    tr.querySelector('.cr-itin-puerto').value = row.navegacion ? 'Navegación' : (row.puerto || '');
    tr.querySelector('.cr-itin-llegada').value = row.llegada || '';
    tr.querySelector('.cr-itin-salida').value = row.salida || '';
    tr.querySelector('.cr-itin-remove').addEventListener('click', () => tr.remove());
}

function readItinerary() {
    return Array.from(document.querySelectorAll('#cr-itinerary-body tr')).map(tr => {
        const puerto = tr.querySelector('.cr-itin-puerto').value.trim();
        return {
            fecha: getDate(tr.querySelector('.cr-itin-fecha')),
            puerto,
            llegada: tr.querySelector('.cr-itin-llegada').value,
            salida: tr.querySelector('.cr-itin-salida').value,
            navegacion: /naveg|alta mar|at sea/i.test(puerto)
        };
    }).filter(r => r.fecha || r.puerto);
}

// ── Paquete de bebidas ────────────────────────────────────────────────────────

function getBebidas() {
    const sel = $('cr_bebidas_select').value;
    return sel === '__custom' ? $('cr_bebidas_custom').value.trim() : sel;
}

function setBebidas(text) {
    const select = $('cr_bebidas_select');
    const custom = $('cr_bebidas_custom');
    const match = Array.from(select.options).find(o => o.value && o.value.toLowerCase() === String(text || '').toLowerCase());
    if (!text) {
        select.value = '';
    } else if (match) {
        select.value = match.value;
    } else {
        select.value = '__custom';
        custom.value = text;
    }
    custom.classList.toggle('hidden', select.value !== '__custom');
}

// ── Alojamientos pre / post crucero ──────────────────────────────────────────

function renderHotelCard(etapa, data = {}) {
    const container = $(`cr-hotel-${etapa}`);
    const target = `hotel_${etapa}`;
    const stars = starsFromString(data.estrellas);
    const regimenes = [...REGIMENES];
    if (data.regimen && !regimenes.includes(data.regimen)) regimenes.push(data.regimen);

    container.innerHTML = `
        <div class="cr-hotel-card bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-5">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div class="flex flex-col gap-2 md:col-span-2">
                    <div class="flex items-center justify-between gap-2">
                        <label class="cr-label">Nombre del hotel</label>
                        <button type="button" class="cr-hotel-picker flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer">Mis Hoteles</button>
                    </div>
                    <input type="text" class="cr-input h-nombre" placeholder="Ej. Hotel Riu Plaza Miami Beach">
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Ciudad</label>
                    <input type="text" class="cr-input h-ciudad" placeholder="Ej. Miami">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Check-in</label>
                    <input type="text" class="cr-input cr-date h-checkin" placeholder="dd/mm/aa">
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Check-out</label>
                    <input type="text" class="cr-input cr-date h-checkout" placeholder="dd/mm/aa">
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Categoría</label>
                    <select class="cr-input h-estrellas">
                        <option value="">Sin categoría</option>
                        ${[1, 2, 3, 4, 5].map(n => `<option value="${starsToString(n)}">${n} Estrellas (${starsToString(n)})</option>`).join('')}
                    </select>
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Régimen</label>
                    <select class="cr-input h-regimen">
                        ${regimenes.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Habitación</label>
                    <input type="text" class="cr-input h-habitacion" placeholder="Ej. Habitación Estándar">
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Costo neto</label>
                    <div class="relative flex items-center">
                        <span class="absolute left-4 text-xs font-bold text-slate-400 pointer-events-none cr-currency">USD</span>
                        <input type="number" min="0" step="0.01" placeholder="0.00" class="cr-input cr-money h-costo">
                    </div>
                </div>
                <div class="flex flex-col gap-2">
                    <label class="cr-label">Operador</label>
                    <input type="text" list="operadores-list" placeholder="Ej. Delfos" class="cr-input h-operador">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div class="flex flex-col gap-2">
                    <label class="cr-label flex justify-between"><span>Descripción</span><span class="h-desc-count normal-case tracking-normal text-[10px] text-slate-400">0/${MAX_DESCRIPCION_HOTEL}</span></label>
                    <textarea rows="4" maxlength="${MAX_DESCRIPCION_HOTEL}" class="cr-input h-descripcion resize-none" placeholder="Breve descripción del hotel (opcional)"></textarea>
                </div>
                <div class="flex flex-col gap-2">
                    <span class="cr-label">Foto del hotel</span>
                    <div class="cr-img-dropzone" data-target="${target}"></div>
                </div>
            </div>
        </div>`;

    const card = container.querySelector('.cr-hotel-card');
    card.querySelector('.h-nombre').value = data.nombre || '';
    card.querySelector('.h-ciudad').value = data.ciudad || '';
    card.querySelector('.h-estrellas').value = stars ? starsToString(stars) : '';
    card.querySelector('.h-regimen').value = data.regimen || regimenes[0];
    card.querySelector('.h-habitacion').value = data.habitacion || '';
    card.querySelector('.h-costo').value = data.costo_neto ?? '';
    card.querySelector('.h-operador').value = data.operador || '';
    const desc = card.querySelector('.h-descripcion');
    desc.value = (data.descripcion || '').slice(0, MAX_DESCRIPCION_HOTEL);
    const updateCount = () => { card.querySelector('.h-desc-count').textContent = `${desc.value.length}/${MAX_DESCRIPCION_HOTEL}`; };
    desc.addEventListener('input', updateCount);
    updateCount();

    card.querySelectorAll('.cr-date').forEach(el => setupDatePicker(el));
    setDate(card.querySelector('.h-checkin'), data.fecha_checkin);
    setDate(card.querySelector('.h-checkout'), data.fecha_checkout);

    if (data.imagen1) images[target] = data.imagen1;
    renderImageDropzone(card.querySelector('.cr-img-dropzone'));

    card.querySelector('.cr-hotel-picker').addEventListener('click', () => {
        openHotelPicker((hotel, foto) => {
            card.querySelector('.h-nombre').value = hotel.nombre || '';
            if (hotel.destino) card.querySelector('.h-ciudad').value = hotel.destino;
            const n = parseInt(hotel.estrellas, 10);
            if (n) card.querySelector('.h-estrellas').value = starsToString(n);
            if (hotel.regimen) {
                const sel = card.querySelector('.h-regimen');
                if (!Array.from(sel.options).some(o => o.value === hotel.regimen)) sel.add(new Option(hotel.regimen, hotel.regimen));
                sel.value = hotel.regimen;
            }
            if (hotel.habitacion) card.querySelector('.h-habitacion').value = hotel.habitacion;
            desc.value = (hotel.descripcion || '').slice(0, MAX_DESCRIPCION_HOTEL);
            updateCount();
            if (foto) setImage(target, foto);
            updateSummary();
            window.showAlert?.('success', `Se cargaron los datos de "${hotel.nombre}" desde tu catálogo.`, true);
        });
    });
    updateCurrencyLabels();
}

function readHotel(etapa) {
    const card = document.querySelector(`#cr-hotel-${etapa} .cr-hotel-card`);
    if (!card) return null;
    return {
        etapa,
        nombre: card.querySelector('.h-nombre').value.trim(),
        ciudad: card.querySelector('.h-ciudad').value.trim(),
        estrellas: card.querySelector('.h-estrellas').value,
        regimen: card.querySelector('.h-regimen').value,
        habitacion: card.querySelector('.h-habitacion').value.trim(),
        fecha_checkin: getDate(card.querySelector('.h-checkin')),
        fecha_checkout: getDate(card.querySelector('.h-checkout')),
        costo_neto: num(card.querySelector('.h-costo').value),
        operador: card.querySelector('.h-operador').value.trim(),
        descripcion: card.querySelector('.h-descripcion').value.trim(),
        imagen1: images[`hotel_${etapa}`] || ''
    };
}

/** Propone las fechas del hotel pre (noche anterior al embarque) y post (noche del desembarque). */
function syncHotelDatesWithCruise() {
    const embarque = getDate($('cr_fecha_embarque'));
    const desembarque = getDate($('cr_fecha_desembarque'));
    const pre = document.querySelector('#cr-hotel-pre .cr-hotel-card');
    if (pre && embarque) {
        const ci = pre.querySelector('.h-checkin');
        const co = pre.querySelector('.h-checkout');
        if (!getDate(co)) setDate(co, embarque);
        if (!getDate(ci)) setDate(ci, shiftISODate(embarque, -1));
    }
    const post = document.querySelector('#cr-hotel-post .cr-hotel-card');
    if (post && desembarque) {
        const ci = post.querySelector('.h-checkin');
        const co = post.querySelector('.h-checkout');
        if (!getDate(ci)) setDate(ci, desembarque);
        if (!getDate(co)) setDate(co, shiftISODate(desembarque, 1));
    }
}

// ── Secciones opcionales ──────────────────────────────────────────────────────

function setSectionVisible(checkbox) {
    const section = $(checkbox.dataset.section);
    section.classList.toggle('hidden', !checkbox.checked);
    if (checkbox.id === 'cr_incluye_vuelos') $('cr-vuelos-off').classList.toggle('hidden', checkbox.checked);
    if (checkbox.id === 'cr_incluye_traslados') $('cr-traslados-off').classList.toggle('hidden', checkbox.checked);
    if (checkbox.checked && section.dataset.etapa && !section.querySelector('.cr-hotel-card')) {
        renderHotelCard(section.dataset.etapa);
        syncHotelDatesWithCruise();
    }
}

function setupToggles() {
    document.querySelectorAll('#crucero-form input[data-section]').forEach(cb => {
        cb.addEventListener('change', () => {
            setSectionVisible(cb);
            updateSummary();
        });
        setSectionVisible(cb);
    });
}

function setEquipaje(list) {
    equipaje = new Set((list || []).filter(b => BAG_TYPES.includes(b)));
    document.querySelectorAll('#cr-equipaje .cr-chip').forEach(btn => {
        btn.classList.toggle('active', equipaje.has(btn.dataset.bag));
    });
}

// ── Montos y resumen ──────────────────────────────────────────────────────────

function updateFee() {
    const auto = $('cr_fee_auto').checked;
    const fee = $('cr_fee_aereo');
    fee.readOnly = auto;
    if (auto) fee.value = $('cr_monto_vuelos').value ? (num($('cr_monto_vuelos').value) * 0.10).toFixed(2) : '';
}

function updateCurrencyLabels() {
    const currency = $('cr_moneda')?.value || 'USD';
    document.querySelectorAll('.cr-currency').forEach(el => { el.textContent = currency; });
}

function readCrucero() {
    return {
        barco: $('cr_barco').value.trim(),
        naviera: $('cr_naviera').value.trim(),
        cabina: $('cr_cabina').value.trim(),
        cabina_tamano: $('cr_cabina_tamano').value.trim(),
        noches: parseInt($('cr_noches').value) || 0,
        fecha_embarque: getDate($('cr_fecha_embarque')),
        fecha_desembarque: getDate($('cr_fecha_desembarque')),
        codigo_presupuesto: $('cr_codigo').value.trim(),
        puerto_embarque: $('cr_puerto_embarque').value.trim(),
        puerto_desembarque: $('cr_puerto_desembarque').value.trim(),
        operador: $('cr_operador').value.trim(),
        paquete_bebidas: getBebidas(),
        incluye: $('cr_incluye').value.trim(),
        costo_neto: num($('cr_costo_neto').value),
        costo_tasas: num($('cr_costo_tasas').value),
        costo_bebidas: num($('cr_costo_bebidas').value),
        itinerario: readItinerary(),
        imagen_cabina: images.imagen_cabina || '',
        imagen_mapa: images.imagen_mapa || ''
    };
}

function activeHotels() {
    return ['pre', 'post']
        .filter(etapa => $(`cr_incluye_${etapa}`).checked)
        .map(readHotel)
        .filter(Boolean);
}

function updateSummary() {
    const container = $('crucero-resumen');
    if (!container) return;
    const incluyeVuelos = $('cr_incluye_vuelos').checked;
    const incluyeTraslados = $('cr_incluye_traslados').checked;
    renderCruceroSummaryHTML({
        currency: $('cr_moneda').value || 'USD',
        cantPax: $('cr_cantidad_pasajeros').value || 1,
        flightsCost: incluyeVuelos ? $('cr_monto_vuelos').value : 0,
        flightsFee: incluyeVuelos ? $('cr_fee_aereo').value : 0,
        operadorVuelos: $('cr_operador_vuelos').value,
        crucero: readCrucero(),
        hotelList: activeHotels().map(h => ({ etapa: h.etapa, hotelName: h.nombre, hotelCost: h.costo_neto, operador: h.operador })),
        transfersCost: incluyeTraslados ? $('cr_monto_traslados').value : 0,
        operadorTraslados: $('cr_operador_traslados').value,
        aplicarRedondeo: $('cr_redondear').checked
    }, container);
}

async function loadOperadores() {
    const list = $('operadores-list');
    if (!list) return;
    let usados = [];
    try {
        const res = await window.authenticatedFetch('/api/operadores');
        if (res.ok) usados = await res.json();
    } catch (e) { /* el autocompletado es opcional */ }
    const nombres = [...new Set([...OPERADORES_HABITUALES, ...usados.filter(Boolean)])];
    list.innerHTML = nombres.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
}

// ── Payload, validación y generación ──────────────────────────────────────────

function buildPayload() {
    const incluyeVuelos = $('cr_incluye_vuelos').checked;
    const incluyeTraslados = $('cr_incluye_traslados').checked;
    const moneda = $('cr_moneda').value || 'USD';
    const redondear = $('cr_redondear').checked;
    const crucero = readCrucero();
    const hoteles = activeHotels();

    const fechaIda = incluyeVuelos ? getDate($('cr_fecha_vuelo_ida')) : '';
    const fechas = [fechaIda, ...hoteles.filter(h => h.etapa === 'pre').map(h => h.fecha_checkin), crucero.fecha_embarque].filter(Boolean).sort();

    return {
        id: currentQuoteId || undefined,
        tipo_cotizacion: 'crucero',
        nombre_pax: $('cr_nombre_pax').value.trim(),
        destino: $('cr_destino').value.trim() || (crucero.barco ? `Crucero ${crucero.barco}` : 'Crucero'),
        cantidad_pasajeros: parseInt($('cr_cantidad_pasajeros').value) || 1,
        origen: $('cr_origen').value.trim(),
        validez_cotizacion: getDate($('cr_validez')),
        fecha_salida: fechas[0] || '',
        moneda,
        redondear,
        incluye_vuelos: incluyeVuelos,
        fecha_vuelo_ida: fechaIda,
        fecha_vuelo_vuelta: incluyeVuelos ? getDate($('cr_fecha_vuelo_vuelta')) : '',
        img_vuelo_ida: incluyeVuelos ? (images.img_vuelo_ida || '') : '',
        img_vuelo_vuelta: incluyeVuelos ? (images.img_vuelo_vuelta || '') : '',
        monto_vuelos: incluyeVuelos ? num($('cr_monto_vuelos').value) : 0,
        fee_aereo: incluyeVuelos ? num($('cr_fee_aereo').value) : 0,
        operador_vuelos: incluyeVuelos ? $('cr_operador_vuelos').value.trim() : '',
        equipaje: incluyeVuelos ? [...equipaje] : [],
        monto_traslados: incluyeTraslados ? num($('cr_monto_traslados').value) : 0,
        operador_traslados: incluyeTraslados ? $('cr_operador_traslados').value.trim() : '',
        tipo_traslado: 'tradicional',
        gastos_iva: 0,
        crucero,
        // El backend guarda el bloque `crucero` dentro de esta entrada METADATA
        hoteles: [...hoteles, { nombre: 'METADATA_COTIZACION', moneda, redondear, tipo_cotizacion: 'crucero' }]
    };
}

function fail(id, message) {
    window.showAlert?.('warning', message);
    const el = typeof id === 'string' ? $(id) : id;
    const visible = el?._flatpickr?.altInput || el;
    if (visible) {
        visible.scrollIntoView({ behavior: 'smooth', block: 'center' });
        visible.focus({ preventScroll: true });
    }
    return false;
}

function validate(p) {
    if (!p.nombre_pax) return fail('cr_nombre_pax', 'Ingresá el nombre del pasajero.');
    if (!p.crucero.barco) return fail('cr_barco', 'Falta el barco. Subí el PDF del operador o completalo a mano.');
    if (!p.crucero.fecha_embarque) return fail('cr_fecha_embarque', 'Falta la fecha de embarque.');
    if (p.crucero.costo_neto <= 0) return fail('cr_costo_neto', 'Ingresá la tarifa neta del crucero.');
    if (p.incluye_vuelos) {
        if (p.monto_vuelos <= 0) return fail('cr_monto_vuelos', 'Ingresá el monto de los vuelos o desactivá "Incluir vuelos".');
        if (!p.fecha_vuelo_ida || !p.fecha_vuelo_vuelta) return fail(!p.fecha_vuelo_ida ? 'cr_fecha_vuelo_ida' : 'cr_fecha_vuelo_vuelta', 'Completá las fechas de los vuelos.');
        if (p.fecha_vuelo_ida > p.crucero.fecha_embarque) return fail('cr_fecha_vuelo_ida', 'El vuelo de ida no puede ser posterior al embarque.');
    }
    for (const h of p.hoteles.filter(h => h.etapa)) {
        const card = document.querySelector(`#cr-hotel-${h.etapa} .cr-hotel-card`);
        const label = h.etapa === 'pre' ? 'pre-crucero' : 'post-crucero';
        if (!h.nombre) return fail(card.querySelector('.h-nombre'), `Ingresá el nombre del hotel ${label}.`);
        if (h.costo_neto <= 0) return fail(card.querySelector('.h-costo'), `Ingresá el costo del hotel ${label}.`);
        if (h.fecha_checkin && h.fecha_checkout && h.fecha_checkout <= h.fecha_checkin) {
            return fail(card.querySelector('.h-checkout'), `El check-out del hotel ${label} debe ser posterior al check-in.`);
        }
    }
    if ($('cr_incluye_traslados').checked && p.monto_traslados <= 0) {
        return fail('cr_monto_traslados', 'Ingresá el monto de los traslados o desactivá "Incluir traslados".');
    }
    return true;
}

async function submitCrucero(e) {
    e.preventDefault();
    const payload = buildPayload();
    if (!validate(payload)) return;

    const pax = payload.nombre_pax;
    window.changeFavicon?.('loading');
    window.showLoader(`Guardando la cotización para ${pax}...`);
    const signal = window.getAbortSignal(true);

    try {
        const saveRes = await window.authenticatedFetch('/api/cotizaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
        if (!saveRes.ok) {
            const err = await saveRes.json().catch(() => ({}));
            throw new Error(err.detail || 'No se pudo guardar la cotización.');
        }
        const saved = await saveRes.json();
        currentQuoteId = saved.id;
        payload.id = saved.id;

        window.showLoader(`Generando cotización para ${pax}...`);
        const res = await window.authenticatedFetch('/api/cotizar-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Error al generar el PDF.');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const clean = (s) => String(s || '').replace(/[\/\\]/g, '-');
        window.currentPdfBlob = blob;
        window.currentPdfUrl = url;
        window.currentPdfFileName = `Cotización para ${clean(pax)} - ${clean(payload.destino)} - ${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.pdf`;
        window.lastGeneratedPdfUrl = url;
        window.lastGeneratedQuote = {
            ...payload,
            ...saved,
            crucero: payload.crucero,
            tipo_cotizacion: 'crucero',
            moneda: payload.moneda,
            redondear: payload.redondear,
            created_at: saved.created_at || now.toISOString(),
            updated_at: now.toISOString()
        };

        window.hideLoader();
        window.changeFavicon?.('success');
        navigateTo('/ver-cotizacion?id=' + saved.id);
    } catch (err) {
        if (err.name === 'AbortError') return;
        window.hideLoader();
        window.changeFavicon?.('error');
        window.showAlert?.('warning', 'Error al generar la cotización: ' + err.message);
    }
}

// ── Edición de una cotización guardada ────────────────────────────────────────

async function loadQuoteIntoForm(quoteId) {
    window.showLoader('Cargando cotización...');
    try {
        const res = await window.authenticatedFetch(`/api/cotizaciones/${quoteId}`);
        if (!res.ok) throw new Error('No se pudo cargar la cotización.');
        const q = await res.json();
        if (!isCruceroQuote(q)) {
            window.hideLoader();
            navigateTo('/cotizacion-completa?id=' + quoteId);
            return;
        }

        currentQuoteId = q.id;
        const c = extractCrucero(q);
        const meta = (q.hoteles || []).find(h => h && h.nombre === 'METADATA_COTIZACION') || {};

        $('cr_nombre_pax').value = q.nombre_pax || '';
        $('cr_destino').value = q.destino || '';
        $('cr_cantidad_pasajeros').value = q.cantidad_pasajeros || '';
        $('cr_origen').value = q.origen || '';
        setDate($('cr_validez'), q.validez_cotizacion);
        const moneda = q.moneda || meta.moneda || 'USD';
        if (Array.from($('cr_moneda').options).some(o => o.value === moneda)) $('cr_moneda').value = moneda;
        $('cr_redondear').checked = q.redondear !== false;

        fillFromExtraction({ ...c, precio: c.costo_neto, pasajeros: 0 });
        $('cr_costo_tasas').value = c.costo_tasas || '';
        $('cr_costo_bebidas').value = c.costo_bebidas || '';
        setBebidas(c.paquete_bebidas || '');
        document.querySelectorAll('#crucero-form .cr-autofilled').forEach(el => el.classList.remove('cr-autofilled'));

        const monto = num(q.monto_vuelos);
        const incluyeVuelos = monto > 0 || !!q.img_vuelo_ida || !!q.img_vuelo_vuelta;
        $('cr_incluye_vuelos').checked = incluyeVuelos;
        if (incluyeVuelos) {
            $('cr_monto_vuelos').value = monto || '';
            const fee = num(q.fee_aereo);
            $('cr_fee_auto').checked = Math.abs(fee - monto * 0.10) < 0.01;
            $('cr_fee_aereo').value = fee || '';
            $('cr_operador_vuelos').value = q.operador_vuelos || '';
            setDate($('cr_fecha_vuelo_ida'), q.fecha_vuelo_ida);
            setDate($('cr_fecha_vuelo_vuelta'), q.fecha_vuelo_vuelta);
            setImage('img_vuelo_ida', q.img_vuelo_ida || '');
            setImage('img_vuelo_vuelta', q.img_vuelo_vuelta || '');
            setEquipaje(q.equipaje || []);
        }

        ['pre', 'post'].forEach(etapa => {
            const h = (q.hoteles || []).find(x => x && x.etapa === etapa);
            $(`cr_incluye_${etapa}`).checked = !!h;
            if (h) renderHotelCard(etapa, h);
        });

        const traslados = num(q.monto_traslados);
        $('cr_incluye_traslados').checked = traslados > 0;
        $('cr_monto_traslados').value = traslados || '';
        $('cr_operador_traslados').value = q.operador_traslados || '';

        document.querySelectorAll('#crucero-form input[data-section]').forEach(setSectionVisible);
        updateFee();
        updateCurrencyLabels();
        updateSummary();

        $('crucero-editing-text').textContent = `Editando la cotización de ${q.nombre_pax || 'Pasajero'}. Al generar se guardan los cambios.`;
        $('crucero-editing-indicator').classList.remove('hidden');
        window.hideLoader();
    } catch (err) {
        window.hideLoader();
        window.showAlert?.('danger', err.message);
    }
}

function cancelCruceroEditing() {
    if (currentQuoteId) navigateTo('/ver-cotizacion?id=' + currentQuoteId);
    else navigateTo('/hacer-cotizacion');
}
window.cancelCruceroEditing = cancelCruceroEditing;

// ── Datos de prueba (Ctrl + Alt + 9) ─────────────────────────────────────────

async function fetchTestFile(url, name) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type });
}

/**
 * Crucero desde el PDF de prueba del operador (pasa por la extracción real) y
 * vuelos, alojamientos y fotos de prueba de la Cotización, con
 * alojamiento pre y post crucero, vuelos y traslados.
 */
async function fillCruceroTestData() {
    currentQuoteId = null;
    $('crucero-editing-indicator').classList.add('hidden');

    let pdf;
    try {
        pdf = await fetchTestFile('/assets/test/crucero-ola-prueba.pdf', 'crucero-ola-prueba.pdf');
    } catch (err) {
        window.showAlert?.('warning', err.message);
        return;
    }
    if (!(await handleCruisePdf(pdf))) return;

    $('cr_nombre_pax').value = 'Cotización de prueba';
    $('cr_destino').value = 'Caribe Oriental';
    $('cr_cantidad_pasajeros').value = 2;
    $('cr_origen').value = 'Córdoba';
    $('cr_redondear').checked = true;
    setDate($('cr_validez'), shiftISODate(new Date().toISOString().slice(0, 10), 5));
    $('cr_costo_tasas').value = '300.00';
    setBebidas('Paquete de bebidas Easy Plus');
    $('cr_costo_bebidas').value = '450.00';

    const [imgIda, imgVuelta, hotel1, hotel2] = await Promise.all([
        '/assets/test/tramo-ida.png', '/assets/test/tramo-vuelta.png',
        '/assets/test/hotel-test-1.jpg', '/assets/test/hotel-test-2.avif'
    ].map(async (url) => {
        try {
            return await resizeImageFile(await fetchTestFile(url, url.split('/').pop()), 1400, 1400, 0.85);
        } catch (err) {
            console.error('Error cargando imagen de prueba:', url, err);
            return '';
        }
    }));

    // Vuelos: llegan el día anterior al embarque y regresan el día posterior al desembarque
    const embarque = getDate($('cr_fecha_embarque'));
    const desembarque = getDate($('cr_fecha_desembarque'));
    $('cr_incluye_vuelos').checked = true;
    setDate($('cr_fecha_vuelo_ida'), shiftISODate(embarque, -1));
    setDate($('cr_fecha_vuelo_vuelta'), shiftISODate(desembarque, 1));
    setImage('img_vuelo_ida', imgIda);
    setImage('img_vuelo_vuelta', imgVuelta);
    $('cr_monto_vuelos').value = '1250.00';
    $('cr_fee_auto').checked = true;
    $('cr_operador_vuelos').value = 'Delfos';
    setEquipaje(['mano', 'carry']);

    // Alojamientos pre y post crucero (las fechas se proponen a partir del crucero)
    $('cr_incluye_pre').checked = true;
    renderHotelCard('pre', {
        nombre: 'Lopesan Costa Bávaro',
        estrellas: '5',
        habitacion: 'Junior Suite Tropical',
        regimen: 'All Inclusive',
        costo_neto: 2450.00,
        descripcion: 'Espectacular resort de 5 estrellas con infinitas piscinas frente a la playa de arena blanca, múltiples restaurantes gourmet y actividades todo el día.',
        imagen1: hotel1
    });
    $('cr_incluye_post').checked = true;
    renderHotelCard('post', {
        nombre: 'Barceló Bávaro Palace',
        estrellas: '4',
        habitacion: 'Superior Room',
        regimen: 'All Inclusive',
        costo_neto: 2100.00,
        descripcion: 'Resort ideal con campo de golf, parque acuático, spa de primer nivel y acceso directo a una de las 10 mejores playas del mundo.',
        imagen1: hotel2
    });
    syncHotelDatesWithCruise();

    $('cr_incluye_traslados').checked = true;
    $('cr_monto_traslados').value = '150.00';

    document.querySelectorAll('#crucero-form input[data-section]').forEach(setSectionVisible);
    updateFee();
    updateCurrencyLabels();
    updateSummary();
    window.showAlert?.('success', '✔ Datos de prueba cargados: crucero desde el PDF, vuelos, alojamiento pre y post crucero y traslados.');
}
window.fillCruceroTestData = fillCruceroTestData;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initCotizarCrucero() {
    currentQuoteId = null;
    images = {};
    equipaje = new Set();

    if (typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.es) {
        flatpickr.localize(flatpickr.l10ns.es);
    }

    // Las tarjetas de hotel crean sus propios selectores al agregarse
    document.querySelectorAll('#crucero-form .cr-date').forEach(el => {
        const onChange = (el.id === 'cr_fecha_embarque' || el.id === 'cr_fecha_desembarque') ? syncHotelDatesWithCruise : null;
        setupDatePicker(el, onChange);
    });
    document.querySelectorAll('.cr-img-dropzone').forEach(renderImageDropzone);

    setupPdfDropzone();
    setupToggles();

    $('cr-add-itinerary-row').addEventListener('click', () => addItineraryRow());
    $('cr_bebidas_select').addEventListener('change', () => {
        $('cr_bebidas_custom').classList.toggle('hidden', $('cr_bebidas_select').value !== '__custom');
        updateSummary();
    });
    $('cr_fee_auto').addEventListener('change', () => { updateFee(); updateSummary(); });
    $('cr_monto_vuelos').addEventListener('input', updateFee);
    $('cr_moneda').addEventListener('change', updateCurrencyLabels);
    document.querySelectorAll('#cr-equipaje .cr-chip').forEach(btn => btn.addEventListener('click', () => {
        if (equipaje.has(btn.dataset.bag)) equipaje.delete(btn.dataset.bag);
        else equipaje.add(btn.dataset.bag);
        setEquipaje([...equipaje]);
    }));

    const form = $('crucero-form');
    form.addEventListener('input', updateSummary);
    form.addEventListener('change', updateSummary);
    form.addEventListener('submit', submitCrucero);

    loadOperadores();
    updateFee();
    updateCurrencyLabels();
    updateSummary();

    const params = new URLSearchParams(window.location.search);
    const quoteId = params.get('id') || window.pendingEditQuoteId;
    window.pendingEditQuoteId = null;
    window.pendingEditQuoteEditable = null;
    if (quoteId) loadQuoteIntoForm(quoteId);
}
window.initCotizarCrucero = initCotizarCrucero;
