// hotel_catalog.js - Utilidades compartidas del Catálogo de Hoteles
// Lo usan: Configuración (alta de hoteles), Cotización PDF (selector en tarjetas) y Paquetes Promocionales.

export const REGIMENES = ["All Inclusive", "Desayuno incluido", "Solo alojamiento", "Media Pensión", "Desayuno y Cena incluidos"];
export const HABITACIONES = ["Estándar", "Suite", "Vista Mar", "Superior", "Deluxe"];
export const MAX_FOTOS_HOTEL = 6;
export const MAX_DESCRIPCION_HOTEL = 200;

export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only base64 image data URLs are rendered (they are injected into src/style attributes)
export function safeImageSrc(src) {
    return typeof src === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}

// 4 -> "★★★★☆" (formato usado por los selects de Categoría de las cotizaciones)
export function starsToString(n) {
    const count = Math.min(5, Math.max(1, parseInt(n, 10) || 0));
    return '★'.repeat(count) + '☆'.repeat(5 - count);
}

export function starsFromString(str) {
    if (!str) return 0;
    const digit = String(str).match(/[1-5]/);
    if (digit) return parseInt(digit[0], 10);
    return (String(str).match(/★/g) || []).length;
}

// Lee un archivo de imagen y lo devuelve redimensionado y comprimido como data URL JPEG
export function resizeImageFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('El archivo seleccionado no es una imagen.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
            img.onload = () => {
                const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * ratio);
                canvas.height = Math.round(img.height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export async function fetchHotelList() {
    const res = await window.authenticatedFetch('/api/hoteles');
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo cargar el catálogo de hoteles.');
    }
    return res.json();
}

export async function fetchHotel(id) {
    const res = await window.authenticatedFetch(`/api/hoteles/${id}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo cargar el hotel.');
    }
    return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// Selector de hoteles (modal)
// ──────────────────────────────────────────────────────────────────────────────

function closePicker() {
    const modal = document.getElementById('hotel-picker-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => modal.remove(), 200);
    document.removeEventListener('keydown', onPickerKeydown);
}

function onPickerKeydown(e) {
    if (e.key === 'Escape') closePicker();
}

function renderPickerShell() {
    document.getElementById('hotel-picker-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'hotel-picker-modal';
    modal.className = 'fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[6000] flex items-center justify-center p-4 opacity-0 transition-opacity duration-200';
    modal.innerHTML = `
        <div class="bg-white border border-slate-200/80 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div class="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100">
                <div>
                    <h3 class="font-display font-black text-base text-slate-800 tracking-tight uppercase">Mis Hoteles</h3>
                    <p id="hotel-picker-subtitle" class="text-[11px] text-slate-500 font-semibold">Seleccioná un alojamiento cargado en Configuración</p>
                </div>
                <button type="button" data-picker-close class="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer" title="Cerrar">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div id="hotel-picker-search-wrap" class="px-6 pt-4">
                <input id="hotel-picker-search" type="text" placeholder="Buscar por nombre o destino..."
                    class="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all bg-white">
            </div>
            <div id="hotel-picker-body" class="p-6 overflow-y-auto flex-1">
                <div class="text-center text-xs font-semibold text-slate-400 py-10">Cargando hoteles...</div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-picker-close]')) closePicker();
    });
    document.addEventListener('keydown', onPickerKeydown);
    requestAnimationFrame(() => modal.classList.remove('opacity-0'));
    return modal;
}

function renderHotelGrid(body, hotels, onPick) {
    if (!hotels.length) {
        body.innerHTML = `
            <div class="text-center py-10 space-y-3">
                <p class="text-xs font-semibold text-slate-500">No hay hoteles que coincidan.</p>
                <button type="button" data-go-config class="px-4 py-2 bg-slate-100 hover:bg-brand-primary hover:text-white rounded-full font-bold text-xs text-slate-600 uppercase tracking-wider transition-all cursor-pointer">Cargar hoteles en Configuración</button>
            </div>`;
        body.querySelector('[data-go-config]')?.addEventListener('click', () => {
            closePicker();
            window.navigateTo('/configuracion');
        });
        return;
    }
    body.innerHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">${hotels.map(h => `
        <button type="button" data-hotel-id="${escapeHtml(h.id)}"
            class="group text-left bg-white border border-slate-200/80 rounded-2xl overflow-hidden hover:border-brand-primary hover:shadow-md transition-all cursor-pointer flex flex-col">
            <div class="h-28 w-full bg-slate-100 overflow-hidden">
                ${safeImageSrc(h.portada) ? `<img src="${safeImageSrc(h.portada)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">` : ''}
            </div>
            <div class="p-3 space-y-0.5">
                <div class="text-sm font-bold text-slate-800 truncate">${escapeHtml(h.nombre)}</div>
                <div class="text-[11px] text-amber-500 tracking-wider">${starsToString(h.estrellas)}</div>
                <div class="text-[11px] text-slate-500 font-semibold truncate">${escapeHtml(h.destino || 'Sin destino')}${h.regimen ? ' · ' + escapeHtml(h.regimen) : ''}</div>
            </div>
        </button>`).join('')}</div>`;
    body.querySelectorAll('[data-hotel-id]').forEach(btn => {
        btn.addEventListener('click', () => onPick(btn.dataset.hotelId));
    });
}

function renderPhotoChoice(body, hotel, onChoose) {
    document.getElementById('hotel-picker-search-wrap')?.classList.add('hidden');
    const subtitle = document.getElementById('hotel-picker-subtitle');
    if (subtitle) subtitle.textContent = `${hotel.nombre}: elegí la foto a utilizar`;
    body.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${hotel.fotos.map((f, i) => `
        <button type="button" data-foto-idx="${i}" class="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-transparent hover:border-brand-primary transition-all cursor-pointer">
            <img src="${f}" alt="" class="w-full h-full object-cover">
            ${i === 0 ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-brand-primary text-white text-[9px] font-black uppercase tracking-wider">Portada</span>' : ''}
        </button>`).join('')}</div>`;
    body.querySelectorAll('[data-foto-idx]').forEach(btn => {
        btn.addEventListener('click', () => onChoose(hotel.fotos[parseInt(btn.dataset.fotoIdx, 10)]));
    });
}

// Abre el selector. onSelect(hotel, foto) recibe el hotel completo y la foto elegida ('' si no tiene)
export async function openHotelPicker(onSelect) {
    renderPickerShell();
    const body = document.getElementById('hotel-picker-body');
    const search = document.getElementById('hotel-picker-search');

    let hotels = [];
    try {
        hotels = await fetchHotelList();
    } catch (err) {
        body.innerHTML = `<div class="text-center text-xs font-semibold text-rose-500 py-10">${escapeHtml(err.message)}</div>`;
        return;
    }

    const onPick = async (id) => {
        body.innerHTML = '<div class="text-center text-xs font-semibold text-slate-400 py-10">Cargando hotel...</div>';
        try {
            const hotel = await fetchHotel(id);
            const fotos = (hotel.fotos || []).filter(safeImageSrc);
            hotel.fotos = fotos;
            if (fotos.length > 1) {
                renderPhotoChoice(body, hotel, (foto) => {
                    closePicker();
                    onSelect(hotel, foto);
                });
            } else {
                closePicker();
                onSelect(hotel, fotos[0] || '');
            }
        } catch (err) {
            body.innerHTML = `<div class="text-center text-xs font-semibold text-rose-500 py-10">${escapeHtml(err.message)}</div>`;
        }
    };

    const filterAndRender = () => {
        const q = (search.value || '').toLowerCase().trim();
        const filtered = q
            ? hotels.filter(h => `${h.nombre} ${h.destino}`.toLowerCase().includes(q))
            : hotels;
        renderHotelGrid(body, filtered, onPick);
    };
    search.addEventListener('input', filterAndRender);
    filterAndRender();
    search.focus();
}

// ──────────────────────────────────────────────────────────────────────────────
// Integración con las tarjetas de hotel de la Cotización PDF (estándar y multidestino)
// ──────────────────────────────────────────────────────────────────────────────

function ensureOption(select, value, label = value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(o => o.value === value);
    if (!exists) select.add(new Option(label, value));
    select.value = value;
}

export function applyHotelToCard(card, hotel, foto) {
    const nombreInput = card.querySelector('.hotel-nombre-val');
    if (nombreInput) nombreInput.value = hotel.nombre || '';

    const destinoInput = card.querySelector('.hotel-destino-val');
    if (destinoInput && !destinoInput.value.trim() && hotel.destino) destinoInput.value = hotel.destino;

    const n = parseInt(hotel.estrellas, 10) || 4;
    ensureOption(card.querySelector('.hotel-estrellas-val'), starsToString(n), `${n} Estrellas (${starsToString(n)})`);

    if (hotel.regimen) ensureOption(card.querySelector('.hotel-regimen-val'), hotel.regimen);

    const habSelect = card.querySelector('.hotel-habitacion-select');
    if (habSelect && hotel.habitacion) {
        const clean = hotel.habitacion.replace(/^habitaci[oó]n\s+/i, '').trim();
        const std = HABITACIONES.find(h => h.toLowerCase() === clean.toLowerCase());
        const customInput = card.querySelector('.hotel-habitacion-custom');
        if (std) {
            habSelect.value = std;
            customInput?.classList.add('hidden');
        } else {
            habSelect.value = 'Personalizado';
            if (customInput) {
                customInput.value = hotel.habitacion;
                customInput.classList.remove('hidden');
            }
        }
    }

    const descInput = card.querySelector('.hotel-descripcion-val');
    if (descInput) {
        descInput.value = (hotel.descripcion || '').slice(0, MAX_DESCRIPCION_HOTEL);
        if (typeof window.updateHotelDescCharCounter === 'function') window.updateHotelDescCharCounter(descInput);
    }

    const dropzone = card.querySelector('.dropzone');
    if (dropzone && foto) {
        const preview = dropzone.querySelector('.dropzone-preview');
        const hidden = dropzone.querySelector('input[type="hidden"]');
        if (preview) {
            preview.src = foto;
            preview.style.display = 'block';
        }
        if (hidden) hidden.value = foto;
        dropzone.querySelectorAll(':scope > svg, :scope > span').forEach(el => { el.style.display = 'none'; });
    }

    // El hotel ya está en el catálogo: se oculta la sugerencia de guardarlo
    refreshCardSavePrompt(card);

    if (typeof window.updateRealTimeSummary === 'function') window.updateRealTimeSummary();
    if (typeof window.updateHotelBadges === 'function') window.updateHotelBadges();
    if (typeof window.saveDetailedQuoteFormState === 'function') window.saveDetailedQuoteFormState();
}

// Botón "Mis Hoteles" de cada tarjeta de hotel
window.openHotelPickerForCard = function (btn) {
    const card = btn.closest('.hotel-option-card, .hotel-stop-card');
    if (!card || card.querySelector('.hotel-nombre-val')?.disabled) return;
    openHotelPicker((hotel, foto) => {
        applyHotelToCard(card, hotel, foto);
        window.showAlert?.('success', `Se cargaron los datos de "${hotel.nombre}" desde tu catálogo.`, true);
    });
};

// ──────────────────────────────────────────────────────────────────────────────
// Guardar en "Mis Hoteles" los alojamientos cargados a mano en una cotización
// (Cotización PDF estándar, multidestino y Cotización Rápida)
// ──────────────────────────────────────────────────────────────────────────────

const CATALOG_NAMES_TTL_MS = 60 * 1000;
let catalogNamesPromise = null;
let catalogNamesLoadedAt = 0;
// Nombres que el agente decidió no guardar durante esta sesión
const dismissedHotelNames = new Set();

// "Hotel Bahía Príncipe" y "bahia principe" cuentan como el mismo alojamiento
export function normalizeHotelName(name) {
    return String(name || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/^hotel\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Los nombres por defecto ("Hotel", "Alojamiento Adicional", "Opción 1"...) no se ofrecen para guardar
const GENERIC_HOTEL_NAME_RE = /^(hotel|alojamiento|opci[oó]n|parada)(\s+(adicional|(parada\s+)?\d+))?$/i;

export function isSaveableHotelName(name) {
    const clean = String(name || '').trim();
    return clean.length >= 3 && !GENERIC_HOTEL_NAME_RE.test(clean);
}

// Set con los nombres normalizados del catálogo (null si no se pudo consultar, ej. invitados)
function loadCatalogHotelNames() {
    const expired = Date.now() - catalogNamesLoadedAt > CATALOG_NAMES_TTL_MS;
    if (!catalogNamesPromise || expired) {
        catalogNamesLoadedAt = Date.now();
        catalogNamesPromise = fetchHotelList()
            .then(list => new Set(list.map(h => normalizeHotelName(h.nombre))))
            .catch(() => null);
    }
    return catalogNamesPromise;
}

/** true si conviene ofrecer guardar ese nombre en el catálogo. */
export async function shouldOfferSaveHotel(name) {
    if (!isSaveableHotelName(name)) return false;
    const key = normalizeHotelName(name);
    if (dismissedHotelNames.has(key)) return false;
    const names = await loadCatalogHotelNames();
    return !!names && !names.has(key);
}

export function dismissSaveHotel(name) {
    dismissedHotelNames.add(normalizeHotelName(name));
}

export async function saveHotelToCatalog(data) {
    const res = await window.authenticatedFetch('/api/hoteles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo guardar el hotel en el catálogo.');
    }
    const saved = await res.json();
    const names = await loadCatalogHotelNames();
    if (names) names.add(normalizeHotelName(data.nombre));
    return saved;
}

// ── Tarjetas de hotel de la Cotización PDF ──

const CARD_SELECTOR = '.hotel-option-card, .hotel-stop-card';

function ensureSavePrompt(card) {
    let prompt = card.querySelector('.hotel-save-catalog-prompt');
    if (prompt) return prompt;
    const nombreInput = card.querySelector('.hotel-nombre-val');
    if (!nombreInput) return null;
    // Va al final de la tarjeta: se guarda una vez cargados todos los datos e imagen
    prompt = document.createElement('div');
    prompt.className = 'hotel-save-catalog-prompt hidden items-center justify-between gap-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100';
    prompt.innerHTML = `
        <span class="text-[11px] font-semibold text-emerald-800">¿Guardar este alojamiento en Mis Hoteles? Se guardan los datos, la descripción y la imagen cargados.</span>
        <span class="flex items-center gap-1 shrink-0">
            <button type="button" data-save-hotel
                class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer">Guardar hotel</button>
            <button type="button" data-dismiss-hotel title="No guardar"
                class="p-0.5 rounded-md text-emerald-700/50 hover:text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </span>`;
    card.appendChild(prompt);
    prompt.querySelector('[data-save-hotel]').addEventListener('click', () => saveCardHotelToCatalog(card));
    prompt.querySelector('[data-dismiss-hotel]').addEventListener('click', () => {
        dismissSaveHotel(nombreInput.value);
        showPrompt(prompt, false);
    });
    return prompt;
}

function showPrompt(prompt, visible) {
    if (!prompt) return;
    prompt.classList.toggle('hidden', !visible);
    prompt.classList.toggle('flex', visible);
}

/** Muestra u oculta la sugerencia de guardar el hotel de una tarjeta. */
export async function refreshCardSavePrompt(card) {
    const nombreInput = card?.querySelector('.hotel-nombre-val');
    if (!nombreInput) return;
    const name = nombreInput.value;
    const offer = await shouldOfferSaveHotel(name) && !nombreInput.disabled;
    // El nombre (o el modo lectura) pudo cambiar mientras se consultaba el catálogo
    if (nombreInput.value !== name) return;
    if (!offer) {
        showPrompt(card.querySelector('.hotel-save-catalog-prompt'), false);
        return;
    }
    showPrompt(ensureSavePrompt(card), true);
}

async function saveCardHotelToCatalog(card) {
    const nombre = card.querySelector('.hotel-nombre-val')?.value.trim() || '';
    if (!nombre) return;
    const btn = card.querySelector('.hotel-save-catalog-prompt [data-save-hotel]');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const foto = card.querySelector('.hotel-imagen-val-1, .hotel-imagen-val')?.value || '';
    const destino = card.querySelector('.hotel-destino-val')?.value.trim()
        || document.getElementById('destino')?.value.trim() || '';
    const habitacion = typeof window.getHabitacionValueFromCard === 'function'
        ? (window.getHabitacionValueFromCard(card) || '') : '';

    try {
        await saveHotelToCatalog({
            nombre,
            destino,
            estrellas: starsFromString(card.querySelector('.hotel-estrellas-val')?.value) || 4,
            regimen: card.querySelector('.hotel-regimen-val')?.value || '',
            habitacion,
            descripcion: (card.querySelector('.hotel-descripcion-val')?.value || '').slice(0, MAX_DESCRIPCION_HOTEL),
            fotos: safeImageSrc(foto) ? [foto] : []
        });
        showPrompt(card.querySelector('.hotel-save-catalog-prompt'), false);
        window.showAlert?.('success', `"${nombre}" se guardó en Mis Hoteles.`, true);
    } catch (err) {
        window.showAlert?.('warning', err.message, true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Guardar hotel'; }
    }
}

// Se revisa al terminar de escribir el nombre (blur) o tras una pausa al tipear
let savePromptTimer = null;
document.addEventListener('focusout', (e) => {
    const input = e.target.closest?.('.hotel-nombre-val');
    const card = input?.closest(CARD_SELECTOR);
    if (card) refreshCardSavePrompt(card);
});
document.addEventListener('input', (e) => {
    const input = e.target.closest?.('.hotel-nombre-val');
    const card = input?.closest(CARD_SELECTOR);
    if (!card) return;
    clearTimeout(savePromptTimer);
    savePromptTimer = setTimeout(() => refreshCardSavePrompt(card), 900);
});

// Markup del botón para insertar junto a la etiqueta "Nombre del Hotel"
export const HOTEL_PICKER_BUTTON_HTML = `
    <button type="button" onclick="openHotelPickerForCard(this)" title="Elegir un hotel de tu catálogo"
        class="btn-hotel-picker flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer normal-case">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        Mis Hoteles
    </button>`;
window.HOTEL_PICKER_BUTTON_HTML = HOTEL_PICKER_BUTTON_HTML;
