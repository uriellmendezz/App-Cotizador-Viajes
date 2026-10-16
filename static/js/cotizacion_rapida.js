import { openHotelPicker, REGIMENES, escapeHtml } from './hotel_catalog.js';

let isQuickFeeLocked = true;
let currentQuickQuoteId = null;
let isRestoringState = false;
let isQuickReadOnlyMode = false;
let isQuickRedondeoActive = false;

// Planes de financiación disponibles: entrega (valor de los vuelos) + saldo en 3 o 6 cuotas
const PLANES_CUOTAS_RAPIDA = [3, 6];
let quickCuotasScope = 'persona'; // 'persona' | 'total'

function ensureQuickRedondeoRowExists() {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return null;

    let redondeoRow = tbody.querySelector('tr.quick-row .quick-row-tipo[value="redondeo"]')?.closest('tr');
    if (!redondeoRow) {
        const adminRow = tbody.querySelector('tr.quick-row .quick-row-tipo[value="admin"]')?.closest('tr');
        addQuickBudgetRow({ tipo: 'redondeo', isDefault: true, monto: 0 });
        redondeoRow = tbody.querySelector('tr.quick-row .quick-row-tipo[value="redondeo"]')?.closest('tr');
        if (adminRow && redondeoRow && adminRow.nextSibling !== redondeoRow) {
            adminRow.parentNode.insertBefore(redondeoRow, adminRow.nextSibling);
        }
        if (!isQuickRedondeoActive && redondeoRow) {
            redondeoRow.classList.add('hidden', 'opacity-0', '-translate-y-2');
        }
    }
    return redondeoRow;
}
window.ensureQuickRedondeoRowExists = ensureQuickRedondeoRowExists;

function toggleQuickQuoteRedondeo(forceState) {
    if (typeof forceState === 'boolean') {
        isQuickRedondeoActive = forceState;
    } else {
        isQuickRedondeoActive = !isQuickRedondeoActive;
    }

    const toggleBtn = document.getElementById('rapido-redondeo-toggle');
    const knob = document.getElementById('rapido-redondeo-knob');
    const tfootRow = document.getElementById('rapido-redondeo-row');

    if (toggleBtn) {
        toggleBtn.setAttribute('aria-checked', isQuickRedondeoActive ? 'true' : 'false');
        if (isQuickRedondeoActive) {
            toggleBtn.classList.remove('bg-slate-200');
            toggleBtn.classList.add('bg-brand-primary');
        } else {
            toggleBtn.classList.remove('bg-brand-primary');
            toggleBtn.classList.add('bg-slate-200');
        }
    }

    if (knob) {
        if (isQuickRedondeoActive) {
            knob.classList.remove('translate-x-0', 'text-slate-400', 'text-slate-500');
            knob.classList.add('translate-x-4', 'text-brand-primary');
        } else {
            knob.classList.remove('translate-x-4', 'text-brand-primary');
            knob.classList.add('translate-x-0', 'text-slate-500');
        }
    }

    // Toggle footer row
    if (tfootRow) {
        if (isQuickRedondeoActive) {
            tfootRow.classList.remove('hidden');
            void tfootRow.offsetWidth;
            tfootRow.classList.remove('opacity-0', '-translate-y-2');
            tfootRow.classList.add('opacity-100', 'translate-y-0');
        } else {
            tfootRow.classList.remove('opacity-100', 'translate-y-0');
            tfootRow.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => {
                if (!isQuickRedondeoActive && tfootRow) {
                    tfootRow.classList.add('hidden');
                }
            }, 300);
        }
    }

    // Toggle body row (below Gastos Administrativos)
    const bodyRedondeoRow = ensureQuickRedondeoRowExists();
    if (bodyRedondeoRow) {
        if (isQuickRedondeoActive) {
            bodyRedondeoRow.classList.remove('hidden');
            void bodyRedondeoRow.offsetWidth;
            bodyRedondeoRow.classList.remove('opacity-0', '-translate-y-2');
            bodyRedondeoRow.classList.add('opacity-100', 'translate-y-0');
        } else {
            bodyRedondeoRow.classList.remove('opacity-100', 'translate-y-0');
            bodyRedondeoRow.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => {
                if (!isQuickRedondeoActive && bodyRedondeoRow) {
                    bodyRedondeoRow.classList.add('hidden');
                }
            }, 300);
        }
    }

    calculateQuickQuote();
}
window.toggleQuickQuoteRedondeo = toggleQuickQuoteRedondeo;

function parseFormattedNumber(inputStr) {
    if (typeof inputStr !== 'string') inputStr = String(inputStr || '');
    let str = inputStr.trim();
    if (!str) return 0;

    // Remove space separators (e.g. "1 250,50")
    str = str.replace(/\s+/g, '');
    // Keep only digits, dots, commas, minus
    str = str.replace(/[^\d.,-]/g, '');

    if (!str) return 0;

    const hasDot = str.includes('.');
    const hasComma = str.includes(',');

    if (hasDot && hasComma) {
        const lastDot = str.lastIndexOf('.');
        const lastComma = str.lastIndexOf(',');
        if (lastDot < lastComma) {
            // "1.250,50" -> dot is thousands, comma is decimal
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // "1,250.50" -> comma is thousands, dot is decimal
            str = str.replace(/,/g, '');
        }
    } else if (hasComma && !hasDot) {
        // "1250,50" -> comma as decimal separator
        str = str.replace(',', '.');
    } else if (hasDot && !hasComma) {
        // Could be "1.500" (thousands dot) or "1250.50" (decimal dot)
        const parts = str.split('.');
        if (parts.length > 2) {
            // Multiple dots e.g. "1.500.000" -> thousands separators
            str = parts.join('');
        } else if (parts.length === 2) {
            const integerPart = parts[0];
            const decimalPart = parts[1];
            // If decimalPart has exactly 3 digits (e.g. "1.500" or "25.000") and integerPart length is 1..3
            if (decimalPart.length === 3 && integerPart.length >= 1 && integerPart.length <= 3) {
                str = integerPart + decimalPart;
            }
        }
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}
window.parseFormattedNumber = parseFormattedNumber;

function handleAmountPaste(event) {
    const clipboardData = event.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const pastedData = clipboardData.getData('Text');
    if (!pastedData) return;

    if (/[.,$\sUSDARS]/i.test(pastedData)) {
        event.preventDefault();
        const parsedVal = parseFormattedNumber(pastedData);
        const inputEl = event.target;
        inputEl.value = parsedVal > 0 ? formatPriceES(parsedVal) : (parsedVal === 0 ? '0,00' : '');
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
}
window.handleAmountPaste = handleAmountPaste;

document.addEventListener('paste', (event) => {
    if (event.target && event.target.classList && event.target.classList.contains('quick-row-monto')) {
        handleAmountPaste(event);
    }
});

// Ensure window.savedQuickQuoteState exists
if (typeof window.savedQuickQuoteState === 'undefined') {
    window.savedQuickQuoteState = null;
}

function saveQuickQuoteFormState() {
    if (isRestoringState) return;
    const passengerInput = document.getElementById('rapido-pasajero');
    if (!passengerInput) return;

    const rows = [];
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const label = tr.querySelector('.quick-row-label')?.value || '';
        const operador = tr.querySelector('.quick-row-operador')?.value || '';
        const estrellas = parseInt(tr.querySelector('.quick-row-estrellas')?.value, 10) || 4;
        const montoRaw = tr.querySelector('.quick-row-monto')?.value || '';
        const monto = parseFormattedNumber(montoRaw);
        const aerolinea = tr.querySelector('.quick-row-aerolinea')?.value || '';
        const aerolinea_logo = tr.querySelector('.quick-row-aerolinea-logo')?.value || '';
        const regimen = tr.querySelector('.quick-row-regimen')?.value || '';
        const hotel_id = tr.querySelector('.quick-row-hotel-id')?.value || '';
        rows.push({ tipo, label, monto, operador, estrellas, aerolinea, aerolinea_logo, regimen, hotel_id });
    });

    window.savedQuickQuoteState = {
        currentQuickQuoteId,
        isQuickFeeLocked,
        isQuickRedondeoActive,
        passengerName: passengerInput.value,
        paxCount: document.getElementById('rapido-pax-count')?.value || 2,
        origen: document.getElementById('rapido-origen')?.value || '',
        destino: document.getElementById('rapido-destino')?.value || '',
        fechaSalida: document.getElementById('rapido-fecha-salida')?.value || '',
        fechaRegreso: document.getElementById('rapido-fecha-regreso')?.value || '',
        moneda: document.getElementById('rapido-moneda')?.value || 'USD',
        rows: rows
    };

    updateResetButtonVisibility();
}

function restoreQuickQuoteFormState() {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    isRestoringState = true;

    currentQuickQuoteId = window.savedQuickQuoteState.currentQuickQuoteId;
    isQuickFeeLocked = window.savedQuickQuoteState.isQuickFeeLocked;

    const passengerInput = document.getElementById('rapido-pasajero');
    if (passengerInput) passengerInput.value = window.savedQuickQuoteState.passengerName;

    const savedPax = window.savedQuickQuoteState.paxCount || 2;
    updatePaxStepperUI(savedPax);

    const origenInput = document.getElementById('rapido-origen');
    if (origenInput) origenInput.value = window.savedQuickQuoteState.origen || '';

    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.value = window.savedQuickQuoteState.destino;

    const depPickerInput = document.getElementById('rapido-fecha-salida');
    if (depPickerInput && depPickerInput._flatpickr && window.savedQuickQuoteState.fechaSalida) {
        depPickerInput._flatpickr.setDate(window.savedQuickQuoteState.fechaSalida);
    }

    const retPickerInput = document.getElementById('rapido-fecha-regreso');
    if (retPickerInput && retPickerInput._flatpickr && window.savedQuickQuoteState.fechaRegreso) {
        retPickerInput._flatpickr.setDate(window.savedQuickQuoteState.fechaRegreso);
    }

    const savedCurrency = window.savedQuickQuoteState.moneda || 'USD';
    setQuickCurrency(savedCurrency);

    window.savedQuickQuoteState.rows.forEach(r => {
        addQuickBudgetRow({
            tipo: r.tipo,
            label: r.label,
            monto: r.monto,
            operador: r.operador,
            estrellas: r.estrellas,
            aerolinea: r.aerolinea,
            aerolinea_logo: r.aerolinea_logo,
            regimen: r.regimen,
            hotel_id: r.hotel_id,
            isDefault: (r.tipo === 'fee-aereo' || r.tipo === 'admin')
        });
    });

    isRestoringState = false;
    updateQuickCurrencyLabels();
    toggleQuickQuoteRedondeo(window.savedQuickQuoteState.isQuickRedondeoActive || false);
    calculateQuickQuote();
}

function updateSaveButtonState() {
    const btnSaveOnly = document.getElementById('btn-save-quick-only');
    if (!btnSaveOnly) return;

    if (currentQuickQuoteId) {
        if (isQuickReadOnlyMode) {
            btnSaveOnly.innerText = 'Editar';
            btnSaveOnly.className = 'px-6 py-3.5 bg-brand-primary hover:bg-brand-primary/90 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer';
        } else {
            btnSaveOnly.innerText = 'Guardar cambios';
            btnSaveOnly.className = 'px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer';
        }
    } else {
        btnSaveOnly.innerText = 'Guardar';
        btnSaveOnly.className = 'px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer';
    }
}

const conceptTypes = {
    'vuelo': {
        label: 'Vuelo',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-5.5l8 2.5z" /></svg>`
    },
    'fee-aereo': {
        label: 'Fee Aéreo',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>`
    },
    'hotel': {
        label: 'Alojamiento',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>`
    },
    'traslado': {
        label: 'Traslado',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>`
    },
    'admin': {
        label: 'Gastos Administrativos (5%)',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`
    },
    'redondeo': {
        label: 'Redondeo',
        icon: `<svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>`
    },
    'iva': {
        label: 'Gastos + IVA',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14l2 2 4-4m5-6a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
    }
};

const typeOrder = {
    'vuelo': 1,
    'fee-aereo': 2,
    'hotel': 3,
    'traslado': 4,
    'admin': 5,
    'redondeo': 6,
    'iva': 7
};

// ────────────────────────────────────────────────────────────────────────────
// FORMATO DE TEXTO: Mayuscula En Cada Palabra (Origen / Destino)
// ────────────────────────────────────────────────────────────────────────────

// Conectores que se mantienen en minuscula cuando no abren el texto
const TITLE_CASE_MINUSCULAS = new Set([
    'de', 'del', 'la', 'las', 'lo', 'los', 'y', 'e', 'da', 'das', 'do', 'dos',
    'el', 'al', 'en', 'of', 'the', 'van', 'von'
]);

/**
 * Pone en mayuscula la primera letra de cada palabra, respetando conectores
 * y separadores internos ("rio de janeiro" -> "Rio de Janeiro").
 */
export function toTitleCaseES(str) {
    const texto = String(str == null ? '' : str);
    if (!texto.trim()) return texto;

    let esPrimeraPalabra = true;

    return texto.replace(/[^\s\-\/]+/g, (palabra, offset) => {
        const lower = palabra.toLocaleLowerCase('es-AR');
        const abrePalabra = esPrimeraPalabra;
        esPrimeraPalabra = false;

        // Siglas ya escritas en mayuscula (EZE, CBA, USA) se dejan como estan
        if (palabra.length <= 3 && palabra === palabra.toLocaleUpperCase('es-AR') && /^[A-Z\u00c0-\u00dc]+$/.test(palabra)) {
            return palabra;
        }

        // Un conector detras de una coma vuelve a comportarse como inicio
        const textoPrevio = texto.slice(0, offset);
        const trasSeparador = /[,(\u00b7|]\s*$/.test(textoPrevio);

        if (!abrePalabra && !trasSeparador && TITLE_CASE_MINUSCULAS.has(lower)) {
            return lower;
        }

        return lower.charAt(0).toLocaleUpperCase('es-AR') + lower.slice(1);
    });
}
window.toTitleCaseES = toTitleCaseES;

/**
 * Aplica title case al input conservando la posicion del cursor.
 */
function applyTitleCaseToInput(input) {
    if (!input) return;
    const caret = input.selectionStart;
    const formateado = toTitleCaseES(input.value);
    if (formateado === input.value) return;
    input.value = formateado;
    if (typeof caret === 'number' && input === document.activeElement) {
        try { input.setSelectionRange(caret, caret); } catch (_) { /* input sin soporte */ }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// FILAS: identificacion y panel de detalles desplegable
// ────────────────────────────────────────────────────────────────────────────

let quickRowSeq = 0;

const REGIMENES_RAPIDA = ['', ...REGIMENES];

/** Fila de detalles asociada a una fila de concepto. */
function getQuickRowDetails(tr) {
    const id = tr && tr.dataset ? tr.dataset.rowId : '';
    if (!id) return null;
    return document.querySelector(`#quick-budget-body tr.quick-row-details[data-details-for="${id}"]`);
}

/** Fila de concepto a la que pertenece un elemento (este o su panel de detalles). */
function getQuickMainRow(el) {
    const tr = el ? el.closest('tr') : null;
    if (!tr) return null;
    if (tr.classList.contains('quick-row')) return tr;
    const id = tr.dataset ? tr.dataset.detailsFor : '';
    return id ? document.querySelector(`#quick-budget-body tr.quick-row[data-row-id="${id}"]`) : null;
}
window.getQuickMainRow = getQuickMainRow;

/** Abre o cierra el panel de detalles de una fila. */
function toggleQuickRowDetails(el) {
    const tr = getQuickMainRow(el);
    const details = tr ? getQuickRowDetails(tr) : null;
    if (!tr || !details) return;

    const abrir = details.classList.contains('hidden');
    details.classList.toggle('hidden', !abrir);

    const chevron = tr.querySelector('.quick-row-chevron');
    if (chevron) chevron.classList.toggle('rotate-90', abrir);

    const btn = tr.querySelector('.quick-row-details-toggle');
    if (btn) {
        btn.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        btn.title = abrir ? 'Ocultar detalles' : 'Ver detalles';
    }
}
window.toggleQuickRowDetails = toggleQuickRowDetails;

/**
 * Resumen compacto de los detalles cargados, visible con el panel cerrado.
 */
function renderQuickRowSummary(tr) {
    if (!tr) return;
    const contenedor = tr.querySelector('.quick-row-summary');
    if (!contenedor) return;

    const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
    const chips = [];

    if (tipo === 'hotel') {
        const estrellas = parseInt(tr.querySelector('.quick-row-estrellas')?.value, 10) || 4;
        chips.push(`<span class="text-amber-600">${'\u2605'.repeat(Math.min(5, Math.max(1, estrellas)))}</span>`);
        const regimen = tr.querySelector('.quick-row-regimen')?.value || '';
        if (regimen) chips.push(escapeHtml(regimen));
    }

    if (tipo === 'vuelo') {
        const aerolinea = tr.querySelector('.quick-row-aerolinea')?.value || '';
        if (aerolinea) chips.push(escapeHtml(aerolinea));
    }

    const operador = tr.querySelector('.quick-row-operador')?.value || '';
    if (operador) chips.push(escapeHtml(operador));

    contenedor.innerHTML = chips.length
        ? chips.join('<span class="text-slate-300 mx-1">\u00b7</span>')
        : '<span class="text-slate-300 font-medium">Sin detalles</span>';
}
window.renderQuickRowSummary = renderQuickRowSummary;

/** Campo con etiqueta dentro del panel de detalles. */
function detailsFieldHtml(label, contenido) {
    return `
        <div class="flex flex-col gap-1.5 min-w-0">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 select-none">${label}</span>
            ${contenido}
        </div>`;
}

/** Contenido del panel de detalles segun el tipo de concepto. */
function detailsPanelHtml(tipo, estrellasVal, regimenVal) {
    const campos = [];

    if (tipo === 'vuelo') {
        campos.push(detailsFieldHtml('Aerol\u00ednea',
            '<div class="quick-row-airline-wrapper relative flex items-center"></div>'));
    }

    if (tipo === 'hotel') {
        campos.push(detailsFieldHtml('Hotel del cat\u00e1logo', `
            <button type="button" onclick="openQuickHotelPicker(this)" title="Elegir un hotel de tu cat\u00e1logo"
                class="quick-row-hotel-picker inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                Mis Hoteles
            </button>`));

        campos.push(detailsFieldHtml('Categor\u00eda', `
            <select class="quick-row-estrellas-select w-full text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100/90 border border-amber-200/90 rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400 transition-colors"
                onchange="setQuickRowEstrellas(this)" title="Categor\u00eda / Estrellas del alojamiento">
                ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${estrellasVal === n ? 'selected' : ''}>${'\u2b50'.repeat(n)} (${n}\u2605)</option>`).join('')}
            </select>`));

        campos.push(detailsFieldHtml('R\u00e9gimen', `
            <select class="quick-row-regimen-select w-full text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-brand-primary transition-colors"
                onchange="setQuickRowRegimen(this)" title="R\u00e9gimen de comidas">
                ${REGIMENES_RAPIDA.map(r => `<option value="${escapeHtml(r)}" ${regimenVal === r ? 'selected' : ''}>${r ? escapeHtml(r) : 'Sin especificar'}</option>`).join('')}
            </select>`));
    }

    if (tipo === 'vuelo' || tipo === 'hotel' || tipo === 'traslado') {
        campos.push(detailsFieldHtml('Operador',
            '<div class="quick-row-operator-wrapper relative flex items-center"></div>'));
    }

    if (!campos.length) return '';

    return `
        <div class="quick-row-details-panel bg-slate-50/80 border-y border-slate-100 px-4 py-4">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                ${campos.join('')}
            </div>
        </div>`;
}

function updateResetButtonVisibility() {
    const btnReset = document.getElementById('btn-reset-quick-budget');
    if (!btnReset) return;

    const passengerInput = document.getElementById('rapido-pasajero');
    const paxCountInput = document.getElementById('rapido-pax-count');
    const origenInput = document.getElementById('rapido-origen');
    const destInput = document.getElementById('rapido-destino');
    const depPickerInput = document.getElementById('rapido-fecha-salida');
    const retPickerInput = document.getElementById('rapido-fecha-regreso');

    const hasPassenger = passengerInput && passengerInput.value.trim() !== '';
    const hasCustomPaxCount = paxCountInput && paxCountInput.value !== '2' && paxCountInput.value !== '';
    const hasOrigen = origenInput && origenInput.value.trim() !== '';
    const hasDestino = destInput && destInput.value.trim() !== '';
    const hasFechaSalida = depPickerInput && depPickerInput.value !== '';
    const hasFechaRegreso = retPickerInput && retPickerInput.value !== '';

    const rows = document.querySelectorAll('#quick-budget-body tr.quick-row');
    const hasCustomRowsCount = rows.length !== 5;

    let hasAnyMonto = false;
    let hasCustomLabels = false;

    rows.forEach(tr => {
        const label = tr.querySelector('.quick-row-label')?.value || '';
        const monto = tr.querySelector('.quick-row-monto')?.value || '';
        if (monto.trim() !== '' && parseFloat(monto) !== 0) {
            hasAnyMonto = true;
        }
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const defaultLabelForType = conceptTypes[tipo]?.label;
        if (label !== defaultLabelForType && label !== 'Hotel' && label !== 'Alojamiento') {
            hasCustomLabels = true;
        }
    });

    const isDirty = hasPassenger || hasCustomPaxCount || hasOrigen || hasDestino || hasFechaSalida || hasFechaRegreso || hasCustomRowsCount || hasAnyMonto || hasCustomLabels;

    if (isDirty) {
        btnReset.classList.remove('hidden');
        btnReset.classList.add('flex');
    } else {
        btnReset.classList.remove('flex');
        btnReset.classList.add('hidden');
    }
}

export function initCotizacionRapida() {
    loadAerolineasCatalogo();
    currentQuickQuoteId = null;
    window.currentQuickQuoteOwner = null;
    isQuickReadOnlyMode = false;

    // Hide editing indicator initially
    const indicator = document.getElementById('editing-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
    }
    // Bind main events
    const paxCountInput = document.getElementById('rapido-pax-count');
    if (paxCountInput) {
        paxCountInput.addEventListener('input', () => {
            calculateQuickQuote();
            saveQuickQuoteFormState();
        });
    }

    const monedaInput = document.getElementById('rapido-moneda');
    if (monedaInput) {
        monedaInput.addEventListener('change', () => {
            updateQuickCurrencyLabels();
            calculateQuickQuote();
            saveQuickQuoteFormState();
        });
    }

    // Initialize flatpickr on date fields
    if (typeof flatpickr !== 'undefined') {
        flatpickr("#rapido-fecha-salida", {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/y",
            disableMobile: "true",
            placeholder: "Opcional",
            onChange: function (selectedDates, dateStr, instance) {
                const returnPicker = document.getElementById('rapido-fecha-regreso')?._flatpickr;
                if (returnPicker) {
                    if (selectedDates[0]) {
                        returnPicker.set('minDate', selectedDates[0]);
                    } else {
                        returnPicker.set('minDate', null);
                    }
                }
                saveQuickQuoteFormState();
            }
        });
        flatpickr("#rapido-fecha-regreso", {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/y",
            disableMobile: "true",
            placeholder: "Opcional",
            onChange: function (selectedDates, dateStr, instance) {
                saveQuickQuoteFormState();
            }
        });
    }

    const btnSaveOnly = document.getElementById('btn-save-quick-only');
    if (btnSaveOnly) {
        btnSaveOnly.onclick = () => {
            if (isQuickReadOnlyMode) {
                enableQuickFormEditing(true);
            } else {
                saveQuickQuote(false);
            }
        };
    }

    const btnSaveAndGo = document.getElementById('btn-save-quick-and-go');
    if (btnSaveAndGo) {
        btnSaveAndGo.onclick = () => saveQuickQuote(true);
    }

    // Add buttons
    const btnAddFlight = document.getElementById('btn-add-flight');
    if (btnAddFlight) {
        btnAddFlight.onclick = () => {
            const label = getNextLabelForType('vuelo');
            addQuickBudgetRow({ tipo: 'vuelo', label: label });
        };
    }

    const btnAddHotel = document.getElementById('btn-add-hotel');
    if (btnAddHotel) {
        btnAddHotel.onclick = () => {
            const tbody = document.getElementById('quick-budget-body');
            const currentHotels = tbody ? tbody.querySelectorAll('tr.quick-row .quick-row-tipo[value="hotel"]').length : 0;
            if (currentHotels >= 2) {
                window.showAlert('warning', 'Máximo 2 alojamientos permitidos.');
                return;
            }
            const label = getNextLabelForType('hotel');
            addQuickBudgetRow({ tipo: 'hotel', label: label });
        };
    }

    const btnAddTransfer = document.getElementById('btn-add-transfer');
    if (btnAddTransfer) {
        btnAddTransfer.onclick = () => {
            const label = getNextLabelForType('traslado');
            addQuickBudgetRow({ tipo: 'traslado', label: label });
        };
    }

    const btnReset = document.getElementById('btn-reset-quick-budget');
    if (btnReset) {
        btnReset.onclick = () => {
            window.showCustomConfirm({
                title: '¿Limpiar tabla?',
                desc: '¿Estás seguro de que deseas restablecer la cotización rápida a los valores por defecto? Se perderán todos los cambios no guardados.',
                btnText: 'Sí, Limpiar',
                confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
                callback: () => {
                    window.savedQuickQuoteState = null;
                    currentQuickQuoteId = null;
                    window.currentQuickQuoteOwner = null;
                    isQuickFeeLocked = true;
                    const passengerInput = document.getElementById('rapido-pasajero');
                    if (passengerInput) passengerInput.value = '';
                    const paxCountInput = document.getElementById('rapido-pax-count');
                    if (paxCountInput) paxCountInput.value = 2;
                    const origenInput = document.getElementById('rapido-origen');
                    if (origenInput) origenInput.value = '';
                    const destInput = document.getElementById('rapido-destino');
                    if (destInput) destInput.value = '';
                    const depPickerInput = document.getElementById('rapido-fecha-salida');
                    if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.clear();
                    const retPickerInput = document.getElementById('rapido-fecha-regreso');
                    if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.clear();
                    loadDefaultQuickQuoteRows();
                    toggleQuickQuoteRedondeo(false);
                    calculateQuickQuote();
                    saveQuickQuoteFormState();
                }
            });
        };
    }

    // Watch text inputs
    const inputsToWatch = ['rapido-pasajero', 'rapido-origen', 'rapido-destino'];
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => saveQuickQuoteFormState());
        }
    });

    // Origen y Destino se escriben con may\u00fascula en cada palabra
    ['rapido-origen', 'rapido-destino'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => applyTitleCaseToInput(el));
        el.addEventListener('blur', () => {
            applyTitleCaseToInput(el);
            saveQuickQuoteFormState();
        });
    });

    // Extract quote ID from query string, path parameter, or pending variable
    const urlParams = new URLSearchParams(window.location.search);
    let pathQuoteId = null;
    if (window.location.pathname.startsWith('/cotizacion-rapida/')) {
        const parts = window.location.pathname.split('/cotizacion-rapida/');
        if (parts[1]) pathQuoteId = parts[1].split('/')[0];
    }
    const initialQuoteId = urlParams.get('id') || pathQuoteId || window.pendingEditQuickBudgetId;
    window.pendingEditQuickBudgetId = null;

    if (initialQuoteId) {
        const cleanId = String(initialQuoteId).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (cleanId) {
            loadQuickBudgetIntoForm(cleanId);
            return;
        }
    }

    if (window.savedQuickQuoteState) {
        restoreQuickQuoteFormState();
    } else {
        loadDefaultQuickQuoteRows();
        saveQuickQuoteFormState();
    }
    updateSaveButtonState();
}

function getNextLabelForType(tipo) {
    const tbody = document.getElementById('quick-budget-body');
    const count = tbody ? tbody.querySelectorAll(`tr.quick-row .quick-row-tipo[value="${tipo}"]`).length : 0;

    if (count === 0) {
        if (tipo === 'hotel') return 'Alojamiento';
        return conceptTypes[tipo].label;
    } else {
        if (tipo === 'vuelo') return 'Vuelo Adicional';
        if (tipo === 'hotel') return 'Alojamiento Adicional';
        if (tipo === 'traslado') return 'Traslado Adicional';
        return conceptTypes[tipo].label + ' Adicional';
    }
}

function updateRowOperatorUI(tr, operadorVal = '') {
    const wrapper = getQuickRowDetails(tr)?.querySelector('.quick-row-operator-wrapper');
    const inputHidden = tr.querySelector('.quick-row-operador');
    if (inputHidden) inputHidden.value = operadorVal || '';
    renderQuickRowSummary(tr);

    if (!wrapper) return;

    const op = (operadorVal || '').trim();
    const lower = op.toLowerCase();

    if (lower === 'delfos') {
        wrapper.innerHTML = `
            <div class="relative inline-flex items-center justify-center my-auto">
                <span onclick="toggleOperatorMenu(this)" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-600 shadow-sm cursor-pointer hover:brightness-95 transition-all select-none" title="Operador: Delfos (Clic para cambiar)">
                    Delfos
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, '')" class="hover:text-orange-900 rounded-full p-0.5 transition-colors" title="Quitar operador">
                        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </span>
                <div class="operator-popover-menu hidden absolute left-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-1">
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Delfos')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-orange-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-600">Delfos</span>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Ola')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-600">Ola</span>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, '')" class="w-full text-left px-2 py-1 text-[10px] font-semibold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border-t border-slate-100 mt-0.5">
                        Quitar operador
                    </button>
                </div>
            </div>
        `;
    } else if (lower === 'ola') {
        wrapper.innerHTML = `
            <div class="relative inline-flex items-center justify-center my-auto">
                <span onclick="toggleOperatorMenu(this)" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-600 shadow-sm cursor-pointer hover:brightness-95 transition-all select-none" title="Operador: Ola (Clic para cambiar)">
                    Ola
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, '')" class="hover:text-rose-900 rounded-full p-0.5 transition-colors" title="Quitar operador">
                        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </span>
                <div class="operator-popover-menu hidden absolute left-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-1">
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Delfos')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-orange-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-600">Delfos</span>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Ola')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-600">Ola</span>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, '')" class="w-full text-left px-2 py-1 text-[10px] font-semibold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border-t border-slate-100 mt-0.5">
                        Quitar operador
                    </button>
                </div>
            </div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="relative inline-flex items-center justify-center my-auto">
                <button type="button" onclick="toggleOperatorMenu(this)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all border border-slate-200/80 select-none my-auto whitespace-nowrap" title="Agregar operador">
                    Agregar operador
                </button>
                <div class="operator-popover-menu hidden absolute left-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-1">
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Delfos')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-orange-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-orange-200 bg-orange-50 text-orange-600">Delfos</span>
                    </button>
                    <button type="button" onclick="event.stopPropagation(); setRowOperator(this, 'Ola')" class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center justify-between">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-200 bg-rose-50 text-rose-600">Ola</span>
                    </button>
                </div>
            </div>
        `;
    }
}
window.updateRowOperatorUI = updateRowOperatorUI;

function updatePaxStepperUI(val) {
    const input = document.getElementById('rapido-pax-count');
    const display = document.getElementById('quick-pax-display');
    const btnDec = document.getElementById('btn-pax-dec');
    const btnInc = document.getElementById('btn-pax-inc');

    const pax = Math.max(1, Math.min(50, parseInt(val, 10) || 1));

    if (input) input.value = pax;
    if (display) display.innerText = pax;

    if (btnDec) btnDec.disabled = (pax <= 1);
    if (btnInc) btnInc.disabled = (pax >= 50);

    if (!isRestoringState) {
        calculateQuickQuote();
        saveQuickQuoteFormState();
    }
}
window.updatePaxStepperUI = updatePaxStepperUI;

function incrementQuickPax() {
    const input = document.getElementById('rapido-pax-count');
    const current = parseInt(input?.value || '2', 10);
    updatePaxStepperUI(current + 1);
}
window.incrementQuickPax = incrementQuickPax;

function decrementQuickPax() {
    const input = document.getElementById('rapido-pax-count');
    const current = parseInt(input?.value || '2', 10);
    updatePaxStepperUI(current - 1);
}
window.decrementQuickPax = decrementQuickPax;

function setQuickCurrency(curr) {
    const select = document.getElementById('rapido-moneda');
    if (select) select.value = curr;

    const btnUsd = document.getElementById('btn-currency-usd');
    const btnArs = document.getElementById('btn-currency-ars');

    if (curr === 'ARS') {
        if (btnArs) btnArs.className = 'px-2 py-0.5 rounded-md text-xs font-black transition-all bg-white text-brand-primary shadow-2xs select-none';
        if (btnUsd) btnUsd.className = 'px-2 py-0.5 rounded-md text-xs font-bold transition-all text-slate-500 hover:text-slate-800 select-none';
    } else {
        if (btnUsd) btnUsd.className = 'px-2 py-0.5 rounded-md text-xs font-black transition-all bg-white text-brand-primary shadow-2xs select-none';
        if (btnArs) btnArs.className = 'px-2 py-0.5 rounded-md text-xs font-bold transition-all text-slate-500 hover:text-slate-800 select-none';
    }

    updateQuickCurrencyLabels();
    if (!isRestoringState) {
        calculateQuickQuote();
        saveQuickQuoteFormState();
    }
}
window.setQuickCurrency = setQuickCurrency;

// ──────────────────────────────────────────────────────────────────────────────
// Aerolínea de cada fila de vuelo (catálogo cargado en Configuración)
// ──────────────────────────────────────────────────────────────────────────────

let aerolineasCatalogo = [];

async function loadAerolineasCatalogo() {
    try {
        const res = await window.authenticatedFetch('/api/aerolineas');
        if (res.ok) aerolineasCatalogo = await res.json();
    } catch (err) {
        console.warn('No se pudo cargar el catálogo de aerolíneas:', err);
    }
    // Refrescar las filas que ya estaban en pantalla
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        if (tr.querySelector('.quick-row-tipo')?.value === 'vuelo') {
            updateRowAirlineUI(tr, tr.querySelector('.quick-row-aerolinea')?.value || '',
                                   tr.querySelector('.quick-row-aerolinea-logo')?.value || '');
        }
    });
}

function airlineMenuHtml() {
    if (!aerolineasCatalogo.length) {
        return `
            <div class="px-3 py-2 text-[10px] font-semibold text-slate-400 leading-relaxed">
                No cargaste aerolíneas todavía.
                <button type="button" onclick="event.stopPropagation(); window.navigateTo('/configuracion')" class="block mt-1 text-brand-primary font-bold hover:underline cursor-pointer">Ir a Configuración</button>
            </div>`;
    }
    return aerolineasCatalogo.map(a => `
        <button type="button" onclick="event.stopPropagation(); setRowAirline(this, '${a.id}')"
            class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sky-50 transition-colors flex items-center gap-2">
            ${a.logo ? `<img src="${a.logo}" alt="" class="h-5 w-8 object-contain shrink-0">`
                     : '<span class="h-5 w-8 shrink-0"></span>'}
            <span class="text-[10px] font-bold text-slate-600 truncate">${a.nombre}</span>
        </button>`).join('')
        + `<button type="button" onclick="event.stopPropagation(); setRowAirline(this, '')" class="w-full text-left px-2 py-1 text-[10px] font-semibold text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border-t border-slate-100 mt-0.5">
            Quitar aerolínea
        </button>`;
}

function updateRowAirlineUI(tr, nombre = '', logo = '') {
    const wrapper = getQuickRowDetails(tr)?.querySelector('.quick-row-airline-wrapper');
    const inputNombre = tr.querySelector('.quick-row-aerolinea');
    const inputLogo = tr.querySelector('.quick-row-aerolinea-logo');
    if (inputNombre) inputNombre.value = nombre || '';
    if (inputLogo) inputLogo.value = logo || '';
    renderQuickRowSummary(tr);
    if (!wrapper) return;

    const chip = nombre
        ? `<span onclick="toggleOperatorMenu(this)" class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border border-sky-200 bg-sky-50 text-sky-700 shadow-sm cursor-pointer hover:brightness-95 transition-all select-none" title="Aerolínea: ${nombre} (Clic para cambiar)">
                ${logo ? `<img src="${logo}" alt="" class="h-5 w-11 object-contain">` : ''}
                <span class="max-w-[90px] truncate">${nombre}</span>
            </span>`
        : `<button type="button" onclick="toggleOperatorMenu(this)" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all border border-slate-200/80 select-none whitespace-nowrap" title="Elegir aerolínea">
                Agregar aerolínea
            </button>`;

    wrapper.innerHTML = `
        <div class="relative inline-flex items-center justify-center my-auto">
            ${chip}
            <div class="operator-popover-menu hidden absolute left-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-1 max-h-56 overflow-y-auto">
                ${airlineMenuHtml()}
            </div>
        </div>`;
}

function setRowAirline(el, aerolineaId) {
    if (window.event) window.event.stopPropagation();
    const tr = getQuickMainRow(el);
    if (!tr) return;

    document.querySelectorAll('.operator-popover-menu').forEach(m => m.classList.add('hidden'));

    const a = aerolineasCatalogo.find(x => String(x.id) === String(aerolineaId));
    updateRowAirlineUI(tr, a ? a.nombre : '', a ? (a.logo || '') : '');
    saveQuickQuoteFormState();
}
window.setRowAirline = setRowAirline;

function toggleOperatorMenu(el) {
    if (window.event) window.event.stopPropagation();
    const container = el.closest('.relative');
    const menu = container ? container.querySelector('.operator-popover-menu') : null;
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.operator-popover-menu').forEach(m => m.classList.add('hidden'));

    if (isHidden) {
        menu.classList.remove('hidden');
    }
}
window.toggleOperatorMenu = toggleOperatorMenu;

function setRowOperator(el, operatorName) {
    if (window.event) window.event.stopPropagation();
    const tr = getQuickMainRow(el);
    if (!tr) return;

    document.querySelectorAll('.operator-popover-menu').forEach(m => m.classList.add('hidden'));

    updateRowOperatorUI(tr, operatorName);
    saveQuickQuoteFormState();
}
window.setRowOperator = setRowOperator;

document.addEventListener('click', (e) => {
    if (!e.target.closest('.operator-popover-menu') && !e.target.closest('.quick-row-operator-wrapper')) {
        document.querySelectorAll('.operator-popover-menu').forEach(m => m.classList.add('hidden'));
    }
});

// ────────────────────────────────────────────────────────────────────────────
// DETALLES DE ALOJAMIENTO: categoria, regimen y carga desde el catalogo
// ────────────────────────────────────────────────────────────────────────────

function setQuickRowEstrellas(el) {
    const tr = getQuickMainRow(el);
    if (!tr) return;
    const hidden = tr.querySelector('.quick-row-estrellas');
    if (hidden) hidden.value = parseInt(el.value, 10) || 4;
    renderQuickRowSummary(tr);
    saveQuickQuoteFormState();
}
window.setQuickRowEstrellas = setQuickRowEstrellas;

function setQuickRowRegimen(el) {
    const tr = getQuickMainRow(el);
    if (!tr) return;
    const hidden = tr.querySelector('.quick-row-regimen');
    if (hidden) hidden.value = el.value || '';
    renderQuickRowSummary(tr);
    saveQuickQuoteFormState();
}
window.setQuickRowRegimen = setQuickRowRegimen;

/**
 * Carga en la fila los datos de un hotel del catalogo (nombre, categoria y
 * regimen) y completa el destino de la cotizacion si estaba vacio.
 */
function applyHotelToQuickRow(tr, hotel) {
    if (!tr || !hotel) return;

    const labelInput = tr.querySelector('.quick-row-label');
    if (labelInput && hotel.nombre) labelInput.value = hotel.nombre;

    const estrellas = Math.min(5, Math.max(1, parseInt(hotel.estrellas, 10) || 4));
    const hiddenEstrellas = tr.querySelector('.quick-row-estrellas');
    if (hiddenEstrellas) hiddenEstrellas.value = estrellas;
    const selectEstrellas = getQuickRowDetails(tr)?.querySelector('.quick-row-estrellas-select');
    if (selectEstrellas) selectEstrellas.value = String(estrellas);

    const regimen = REGIMENES.includes(hotel.regimen) ? hotel.regimen : '';
    const hiddenRegimen = tr.querySelector('.quick-row-regimen');
    if (hiddenRegimen) hiddenRegimen.value = regimen;
    const selectRegimen = getQuickRowDetails(tr)?.querySelector('.quick-row-regimen-select');
    if (selectRegimen) selectRegimen.value = regimen;

    const hiddenId = tr.querySelector('.quick-row-hotel-id');
    if (hiddenId) hiddenId.value = hotel.id || '';

    // El destino del hotel completa el de la cotizacion solo si no se carg\u00f3 uno
    const destInput = document.getElementById('rapido-destino');
    if (destInput && !destInput.value.trim() && hotel.destino) {
        destInput.value = toTitleCaseES(hotel.destino);
    }

    renderQuickRowSummary(tr);
    calculateQuickQuote();
    saveQuickQuoteFormState();
}

/** Abre el catalogo de hoteles para la fila del boton. */
function openQuickHotelPicker(el) {
    const tr = getQuickMainRow(el);
    if (!tr || isQuickReadOnlyMode) return;

    openHotelPicker((hotel) => {
        applyHotelToQuickRow(tr, hotel);
        window.showAlert?.('success', `Se cargaron los datos de "${hotel.nombre}" desde tu cat\u00e1logo.`, true);
    });
}
window.openQuickHotelPicker = openQuickHotelPicker;

function loadDefaultQuickQuoteRows() {
    currentQuickQuoteId = null;
    window.currentQuickQuoteOwner = null;
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Clear title and passengers meta fields
    const passengerInput = document.getElementById('rapido-pasajero');
    if (passengerInput) passengerInput.value = '';

    updatePaxStepperUI(2);
    setQuickCurrency('USD');

    const origenInput = document.getElementById('rapido-origen');
    if (origenInput) origenInput.value = '';

    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.value = '';

    const depPickerInput = document.getElementById('rapido-fecha-salida');
    if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.clear();

    const retPickerInput = document.getElementById('rapido-fecha-regreso');
    if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.clear();

    addQuickBudgetRow({ tipo: 'vuelo', isDefault: true });
    addQuickBudgetRow({ tipo: 'fee-aereo', isDefault: true });
    addQuickBudgetRow({ tipo: 'hotel', isDefault: true, label: 'Hotel' });
    addQuickBudgetRow({ tipo: 'traslado', isDefault: true });
    addQuickBudgetRow({ tipo: 'admin', isDefault: true });
    addQuickBudgetRow({ tipo: 'redondeo', isDefault: true });

    isQuickFeeLocked = true;
    updateSaveButtonState();
}

function addQuickBudgetRow(data = null) {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;

    const currency = document.getElementById('rapido-moneda')?.value || 'USD';
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition-colors quick-row border-b border-slate-100';

    const selectedTipo = data ? data.tipo : 'hotel';
    const estrellasVal = (data && data.estrellas) ? parseInt(data.estrellas, 10) : 4;
    const labelVal = data && data.label ? data.label : conceptTypes[selectedTipo].label;
    const rawMonto = (data && data.monto !== undefined) ? data.monto : '';
    const montoVal = rawMonto !== '' ? formatPriceES(parseFormattedNumber(rawMonto)) : '';
    const operadorVal = data && data.operador ? data.operador : '';
    const regimenVal = data && data.regimen ? data.regimen : '';
    const hotelIdVal = (data && data.hotel_id) ? data.hotel_id : '';
    const aerolineaVal = data && data.aerolinea ? data.aerolinea : '';
    const aerolineaLogoVal = data && data.aerolinea_logo ? data.aerolinea_logo : '';
    const isDefault = data && data.isDefault;
    const isUndeletable = (selectedTipo === 'fee-aereo' || selectedTipo === 'admin' || selectedTipo === 'redondeo');
    const isLabelReadOnly = isUndeletable ? 'readonly' : '';
    const labelTitle = isUndeletable ? '' : 'title="Haz clic para renombrar este concepto"';
    const cursorClass = isUndeletable ? 'cursor-default pointer-events-none' : 'cursor-text';

    if (selectedTipo === 'redondeo') {
        const isHidden = !isQuickRedondeoActive;
        tr.className = `hover:bg-emerald-50/40 transition-all duration-300 ease-in-out quick-row border-b border-slate-100 bg-emerald-50/30 ${isHidden ? 'hidden opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}`;
    }

    let helpIconHtml = '';
    if (selectedTipo === 'fee-aereo') {
        helpIconHtml = `
            <div class="relative group inline-block flex-shrink-0 ml-1">
                <svg class="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] leading-normal font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-center normal-case tracking-normal">
                    Se calcula automáticamente como el 10% del total de vuelos.
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                </div>
            </div>
        `;
    } else if (selectedTipo === 'admin') {
        helpIconHtml = `
            <div class="relative group inline-block flex-shrink-0 ml-1">
                <svg class="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] leading-normal font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-center normal-case tracking-normal">
                    Se calcula automáticamente como el 5% sobre el total terrestre.
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                </div>
            </div>
        `;
    } else if (selectedTipo === 'redondeo') {
        helpIconHtml = `
            <div class="relative group inline-block flex-shrink-0 ml-1">
                <svg class="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] leading-normal font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-center normal-case tracking-normal">
                    Diferencia del redondeo al múltiplo de 10 superior por persona.
                    <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                </div>
            </div>
        `;
    }

    let labelCellHtml = '';
    if (isUndeletable) {
        labelCellHtml = `
            <span class="text-sm font-semibold text-slate-700 bg-transparent py-1 select-none truncate">${labelVal}</span>
            ${helpIconHtml}
            <input type="hidden" class="quick-row-label" value="${labelVal}">
        `;
    } else {
        labelCellHtml = `
            <input type="text" class="quick-row-label text-sm font-semibold text-slate-700 border-none bg-transparent focus:ring-0 focus:outline-none m-0 flex-1 min-w-0 ${cursorClass}" value="${labelVal}" ${labelTitle} style="border: none !important; background: transparent !important; outline: none !important; box-shadow: none !important; padding: 4px 4px !important; margin: 0 !important;" autocomplete="off">
        `;
    }

    // Solo los conceptos cargados por el usuario tienen detalles para desplegar
    const tieneDetalles = (selectedTipo === 'vuelo' || selectedTipo === 'hotel' || selectedTipo === 'traslado');
    const rowId = `qr-${++quickRowSeq}`;
    tr.dataset.rowId = rowId;

    const toggleHtml = tieneDetalles ? `
        <button type="button" onclick="toggleQuickRowDetails(this)" aria-expanded="false" title="Ver detalles"
            class="quick-row-details-toggle flex items-center justify-center w-5 h-5 rounded-lg text-slate-400 hover:text-brand-primary hover:bg-slate-100 transition-all cursor-pointer flex-shrink-0">
            <svg class="quick-row-chevron w-3.5 h-3.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
        </button>` : '<span class="w-5 flex-shrink-0"></span>';

    tr.innerHTML = `
        <td class="py-3 font-bold text-slate-700 pl-2 bg-white align-middle">
            <div class="flex items-center gap-1 min-w-0">
                ${toggleHtml}
                <span class="quick-row-icon flex items-center justify-center flex-shrink-0">${conceptTypes[selectedTipo].icon}</span>
                <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center gap-1 min-w-0">
                        ${labelCellHtml}
                    </div>
                    ${tieneDetalles ? '<div class="quick-row-summary text-[10px] font-bold text-slate-500 truncate pl-1"></div>' : ''}
                </div>
            </div>
            <input type="hidden" class="quick-row-tipo" value="${selectedTipo}">
            <input type="hidden" class="quick-row-operador" value="${operadorVal}">
            <input type="hidden" class="quick-row-aerolinea" value="${aerolineaVal}">
            <input type="hidden" class="quick-row-aerolinea-logo" value="${aerolineaLogoVal}">
            <input type="hidden" class="quick-row-estrellas" value="${estrellasVal}">
            <input type="hidden" class="quick-row-regimen" value="${regimenVal}">
            <input type="hidden" class="quick-row-hotel-id" value="${hotelIdVal}">
        </td>
        <td class="py-3.5 text-right relative">
            <div class="flex items-center justify-end w-full">
                <span class="quick-fee-unlock-container absolute right-full top-1/2 -translate-y-1/2 mr-2 flex items-center ${selectedTipo === 'fee-aereo' ? 'block' : 'hidden'}">
                    <button type="button" class="quick-row-fee-unlock flex items-center justify-center text-slate-400 hover:text-brand-primary bg-slate-100 hover:bg-slate-200 transition-all duration-300 p-1.5 cursor-pointer rounded-full" title="Activar/Desactivar edición manual">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                        </svg>
                    </button>
                </span>
                <div class="relative flex items-center justify-end w-full">
                    <span class="absolute left-2.5 text-[10px] font-extrabold text-slate-400 pointer-events-none quick-currency-label">${currency}</span>
                    <input type="text" inputmode="decimal" class="quick-row-monto border border-slate-200 rounded-xl pl-9 pr-2.5 py-1.5 text-right w-full text-sm font-semibold focus:outline-none focus:border-brand-primary" placeholder="0,00" value="${montoVal}" autocomplete="off">
                </div>
            </div>
        </td>
        <td class="quick-row-pax py-3.5 text-right font-semibold text-slate-500 pr-2 truncate">${currency} 0,00</td>
        <td class="py-3.5 text-center">
            <button type="button" class="btn-delete-row text-rose-500 hover:text-rose-700 focus:outline-none cursor-pointer p-1 ${isUndeletable ? 'invisible pointer-events-none' : ''}">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </td>
    `;

    tbody.appendChild(tr);

    // Fila hermana con el panel de detalles (oculta hasta que se despliega)
    if (tieneDetalles) {
        const detailsTr = document.createElement('tr');
        detailsTr.className = 'quick-row-details hidden';
        detailsTr.dataset.detailsFor = rowId;
        detailsTr.innerHTML = `<td colspan="4" class="p-0 border-0">${detailsPanelHtml(selectedTipo, estrellasVal, regimenVal)}</td>`;
        tbody.appendChild(detailsTr);
    }

    updateRowOperatorUI(tr, operadorVal);
    if (selectedTipo === 'vuelo') {
        updateRowAirlineUI(tr, aerolineaVal, aerolineaLogoVal);
    }
    renderQuickRowSummary(tr);
    updateQuickCurrencyLabels();

    const montoInput = tr.querySelector('.quick-row-monto');
    if (montoInput) {
        montoInput.addEventListener('paste', handleAmountPaste);
        montoInput.addEventListener('input', () => {
            calculateQuickQuote();
            saveQuickQuoteFormState();
        });
        montoInput.addEventListener('blur', () => {
            const val = montoInput.value.trim();
            if (val !== '') {
                const parsed = parseFormattedNumber(val);
                montoInput.value = formatPriceES(parsed);
            }
            calculateQuickQuote();
        });
        montoInput.addEventListener('focus', () => {
            montoInput.select();
        });
    }

    const labelInput = tr.querySelector('.quick-row-label');
    if (labelInput) {
        labelInput.addEventListener('input', () => {
            saveQuickQuoteFormState();
        });
    }

    const btnDelete = tr.querySelector('.btn-delete-row');
    if (btnDelete) {
        btnDelete.onclick = () => {
            getQuickRowDetails(tr)?.remove();
            tr.remove();
            calculateQuickQuote();
            saveQuickQuoteFormState();
        };
    }

    const btnUnlock = tr.querySelector('.quick-row-fee-unlock');
    if (btnUnlock) {
        btnUnlock.onclick = () => {
            toggleQuickRowFeeLock();
            saveQuickQuoteFormState();
        };
    }

    syncQuickRowEditableState(tr);
    sortQuickBudgetRows();
    calculateQuickQuote();
    saveQuickQuoteFormState();
}

function sortQuickBudgetRows() {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr.quick-row'));
    if (rows.length <= 1) return;

    rows.sort((a, b) => {
        const typeA = a.querySelector('.quick-row-tipo')?.value || '';
        const typeB = b.querySelector('.quick-row-tipo')?.value || '';

        const orderA = typeOrder[typeA] || 99;
        const orderB = typeOrder[typeB] || 99;

        return orderA - orderB;
    });

    rows.forEach(row => {
        const details = getQuickRowDetails(row);
        tbody.appendChild(row);
        if (details) tbody.appendChild(details);
    });
}

function syncQuickRowEditableState(tr) {
    const tipo = tr.querySelector('.quick-row-tipo')?.value || 'hotel';
    const montoInput = tr.querySelector('.quick-row-monto');
    const unlockContainer = tr.querySelector('.quick-fee-unlock-container');

    if (!montoInput) return;

    if (tipo === 'fee-aereo') {
        if (unlockContainer) unlockContainer.classList.remove('hidden');

        if (isQuickFeeLocked) {
            montoInput.readOnly = true;
            montoInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
            montoInput.classList.remove('bg-white');

            const btnUnlock = tr.querySelector('.quick-row-fee-unlock');
            if (btnUnlock) {
                btnUnlock.className = "quick-row-fee-unlock flex items-center justify-center text-slate-400 hover:text-brand-primary bg-slate-100 hover:bg-slate-200 transition-all duration-300 p-1.5 cursor-pointer rounded-full";
                btnUnlock.innerHTML = `<svg class="w-3.5 h-3.5 transition-all duration-300 transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>`;
            }
        } else {
            montoInput.readOnly = false;
            montoInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
            montoInput.classList.add('bg-white');

            const btnUnlock = tr.querySelector('.quick-row-fee-unlock');
            if (btnUnlock) {
                btnUnlock.className = "quick-row-fee-unlock flex items-center justify-center text-white bg-brand-primary hover:bg-brand-primary/95 transition-all duration-300 p-1.5 cursor-pointer rounded-full shadow-sm shadow-brand-primary/20";
                btnUnlock.innerHTML = `<svg class="w-3.5 h-3.5 transition-all duration-300 transform scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>`;
            }
        }
    } else if (tipo === 'admin') {
        if (unlockContainer) unlockContainer.classList.add('hidden');
        montoInput.readOnly = true;
        montoInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
        montoInput.classList.remove('bg-white');
    } else {
        if (unlockContainer) unlockContainer.classList.add('hidden');
        montoInput.readOnly = false;
        montoInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
        montoInput.classList.add('bg-white');
    }
}

function toggleQuickRowFeeLock() {
    isQuickFeeLocked = !isQuickFeeLocked;

    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'fee-aereo') {
            syncQuickRowEditableState(tr);
            if (isQuickFeeLocked) {
                const flightsSum = getQuickVuelosSum();
                const montoInput = tr.querySelector('.quick-row-monto');
                if (montoInput) {
                    montoInput.value = (flightsSum * 0.10).toFixed(2);
                }
            }
        }
    });

    calculateQuickQuote();
}

function getQuickVuelosSum() {
    let sum = 0;
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'vuelo') {
            sum += parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);
        }
    });
    return sum;
}

function getQuickFeeAereoSum() {
    let sum = 0;
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'fee-aereo') {
            sum += parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);
        }
    });
    return sum;
}

function getQuickHotelsAndTrasladosSum() {
    let sum = 0;
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'hotel' || tipo === 'traslado') {
            sum += parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);
        }
    });
    return sum;
}

// ────────────────────────────────────────────────────────────────────────────
// FINANCIACIÓN EN CUOTAS
// La entrega inicial equivale al aéreo (vuelos + fee) y el saldo restante se
// fracciona en 3 o 6 cuotas, igual que en los paquetes promocionales.
// ────────────────────────────────────────────────────────────────────────────

const round2Quick = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const ceil2Quick = (n) => Math.ceil(round2Quick(n) * 100) / 100;

/**
 * Calcula la entrega, el saldo y los planes de cuotas de la cotización actual.
 *
 * @param {Object} params
 * @param {number} params.totalAereo - Vuelos + fee aéreo (total del grupo)
 * @param {number} params.totalFinal - Precio total del grupo (ya redondeado si corresponde)
 * @param {number} params.paxCount - Cantidad de pasajeros
 * @returns {Object} Montos por persona y totales con sus planes de cuotas
 */
export function computeQuickCuotas({ totalAereo = 0, totalFinal = 0, paxCount = 1 }) {
    const pax = Math.max(1, parseInt(paxCount, 10) || 1);

    const entregaTotal = round2Quick(Math.min(Math.max(0, totalAereo), Math.max(0, totalFinal)));
    const saldoTotal = round2Quick(Math.max(0, totalFinal - entregaTotal));

    const entregaPersona = round2Quick(entregaTotal / pax);
    const saldoPersona = round2Quick(saldoTotal / pax);
    const precioPersona = round2Quick(totalFinal / pax);

    const planes = PLANES_CUOTAS_RAPIDA.map(cantidad => ({
        cantidad,
        montoPersona: saldoPersona > 0 ? ceil2Quick(saldoPersona / cantidad) : 0,
        montoTotal: saldoTotal > 0 ? ceil2Quick(saldoTotal / cantidad) : 0
    }));

    return {
        paxCount: pax,
        precioPersona,
        precioTotal: round2Quick(totalFinal),
        entregaPersona,
        entregaTotal,
        saldoPersona,
        saldoTotal,
        planes
    };
}
window.computeQuickCuotas = computeQuickCuotas;

function setQuickCuotasScope(scope) {
    quickCuotasScope = (scope === 'total') ? 'total' : 'persona';

    const btnPersona = document.getElementById('btn-cuotas-por-persona');
    const btnTotal = document.getElementById('btn-cuotas-total');
    const activeCls = 'px-3.5 py-1 rounded-lg text-xs font-black transition-all bg-white text-brand-primary shadow-2xs select-none cursor-pointer';
    const idleCls = 'px-3.5 py-1 rounded-lg text-xs font-bold transition-all text-slate-500 hover:text-slate-800 select-none cursor-pointer';
    if (btnPersona) btnPersona.className = quickCuotasScope === 'persona' ? activeCls : idleCls;
    if (btnTotal) btnTotal.className = quickCuotasScope === 'total' ? activeCls : idleCls;

    calculateQuickQuote();
}
window.setQuickCuotasScope = setQuickCuotasScope;

/**
 * Dibuja las tarjetas de cuotas para tenerlas a mano al hablar con el pasajero.
 */
function renderQuickCuotas(cuotas, currency) {
    const container = document.getElementById('quick-cuotas-content');
    if (!container) return;

    const money = (val) => `${currency} ${window.formatPriceES(val)}`;
    const porPersona = quickCuotasScope === 'persona';

    if (!cuotas || cuotas.precioTotal <= 0) {
        container.innerHTML = '<p class="text-xs font-semibold text-slate-400">Cargá los montos de vuelos y alojamiento para ver cómo quedarían las cuotas.</p>';
        return;
    }

    const precio = porPersona ? cuotas.precioPersona : cuotas.precioTotal;
    const entrega = porPersona ? cuotas.entregaPersona : cuotas.entregaTotal;
    const saldo = porPersona ? cuotas.saldoPersona : cuotas.saldoTotal;
    const sufijo = porPersona
        ? 'por persona'
        : `total · ${cuotas.paxCount} ${cuotas.paxCount === 1 ? 'pasajero' : 'pasajeros'}`;

    const resumen = [
        [`Precio ${sufijo}`, money(precio), 'font-black text-slate-900'],
        ['Entrega inicial · valor de los vuelos', money(entrega), 'font-bold text-brand-primary'],
        ['Saldo a financiar', money(saldo), 'font-bold text-slate-700']
    ];

    const tarjetas = saldo > 0
        ? cuotas.planes.map(plan => {
            const monto = porPersona ? plan.montoPersona : plan.montoTotal;
            return `
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col justify-center">
                    <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">${plan.cantidad} cuotas de</span>
                    <span class="text-xl font-black text-slate-900 whitespace-nowrap">${money(monto)}</span>
                    <span class="text-[10px] font-semibold text-slate-400">+ entrega de ${money(entrega)}</span>
                </div>`;
        }).join('')
        : `<div class="sm:col-span-2 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs font-semibold text-amber-800">
                No hay saldo para financiar: el precio queda cubierto por la entrega de los vuelos.
           </div>`;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                ${resumen.map(([label, value, cls]) => `
                    <div class="flex items-center justify-between gap-4 px-4 py-3">
                        <span class="text-xs font-semibold text-slate-500">${label}</span>
                        <span class="text-sm ${cls} whitespace-nowrap">${value}</span>
                    </div>`).join('')}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${tarjetas}
            </div>
        </div>
        <p class="text-[10px] text-slate-400 font-semibold mt-3">
            La entrega inicial cubre el aéreo (vuelos + fee)${porPersona ? `: ${money(cuotas.entregaPersona)} por persona · ${money(cuotas.entregaTotal)} en total` : `: ${money(cuotas.entregaTotal)}`}. El saldo se abona en 3 o 6 cuotas.
        </p>`;
}
window.renderQuickCuotas = renderQuickCuotas;

function calculateQuickQuote() {
    const paxCount = parseInt(document.getElementById('rapido-pax-count')?.value) || 2;
    const currency = document.getElementById('rapido-moneda')?.value || 'USD';

    // Update headers text
    const hdrTotal = document.getElementById('hdr-total');
    if (hdrTotal) hdrTotal.innerText = `Total (${currency})`;
    const hdrPax = document.getElementById('hdr-pax');
    if (hdrPax) hdrPax.innerText = `Por Persona (${currency})`;

    const flightsSum = getQuickVuelosSum();
    const hotelsAndTransfersSum = getQuickHotelsAndTrasladosSum();
    const adminVal = hotelsAndTransfersSum * 0.05;

    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const montoInput = tr.querySelector('.quick-row-monto');

        if (tipo === 'fee-aereo' && isQuickFeeLocked && montoInput) {
            const feeVal = flightsSum * 0.10;
            montoInput.value = feeVal > 0 ? formatPriceES(feeVal) : '0,00';
        } else if (tipo === 'admin' && montoInput) {
            montoInput.value = adminVal > 0 ? formatPriceES(adminVal) : '0,00';
        }
    });

    let totalAereo = 0;
    let totalTerrestreNeto = 0;
    let totalAdminFee = 0;

    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const monto = parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);

        if (tipo === 'vuelo') {
            totalAereo += monto;
        } else if (tipo === 'fee-aereo') {
            totalAereo += monto;
        } else if (tipo === 'hotel' || tipo === 'traslado') {
            totalTerrestreNeto += monto;
        } else if (tipo === 'admin') {
            totalAdminFee += monto;
        }
    });

    const totalFinal = totalAereo + totalTerrestreNeto + totalAdminFee;
    const perPersonRaw = paxCount > 0 ? (totalFinal / paxCount) : totalFinal;

    // Rounding calculations (Always round up to nearest 10 per person)
    const roundedPerPerson = perPersonRaw > 0 ? (Math.ceil(perPersonRaw / 10) * 10) : 0;
    const roundedTotal = roundedPerPerson * paxCount;
    const redondeoDiffTotal = isQuickRedondeoActive ? Math.max(0, roundedTotal - totalFinal) : 0;
    const redondeoDiffPax = isQuickRedondeoActive ? Math.max(0, roundedPerPerson - perPersonRaw) : 0;

    // Update body redondeo row input & pax cell
    const bodyRedondeoRow = document.querySelector('#quick-budget-body tr.quick-row .quick-row-tipo[value="redondeo"]')?.closest('tr');
    if (bodyRedondeoRow) {
        const rMontoInput = bodyRedondeoRow.querySelector('.quick-row-monto');
        if (rMontoInput) {
            rMontoInput.value = redondeoDiffTotal > 0 ? formatPriceES(redondeoDiffTotal) : '0,00';
        }
        const rPaxCell = bodyRedondeoRow.querySelector('.quick-row-pax');
        if (rPaxCell) {
            rPaxCell.innerText = `${currency} ${window.formatPriceES(redondeoDiffPax)}`;
        }
    }

    // Update per-row per-person cells for all other rows
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'redondeo') return; // Handled above
        const monto = parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);
        const paxCell = tr.querySelector('.quick-row-pax');
        if (paxCell) {
            paxCell.innerText = `${currency} ${window.formatPriceES(monto / paxCount)}`;
        }
    });

    const elTotalFinal = document.getElementById('rapido-total-final');
    if (elTotalFinal) elTotalFinal.innerText = `${currency} ${window.formatPriceES(totalFinal)}`;

    const elTotalPax = document.getElementById('rapido-total-pax');
    if (elTotalPax) elTotalPax.innerText = `${currency} ${window.formatPriceES(perPersonRaw)}`;

    const elTotalRedondeado = document.getElementById('rapido-total-redondeado');
    if (elTotalRedondeado) elTotalRedondeado.innerText = `${currency} ${window.formatPriceES(roundedTotal)}`;

    const elPaxRedondeado = document.getElementById('rapido-pax-redondeado');
    if (elPaxRedondeado) elPaxRedondeado.innerText = `${currency} ${window.formatPriceES(roundedPerPerson)}`;

    // Financiación: entrega = aéreo, saldo en 3 o 6 cuotas (respeta el redondeo activo)
    const totalParaCuotas = isQuickRedondeoActive ? roundedTotal : totalFinal;
    renderQuickCuotas(
        computeQuickCuotas({ totalAereo, totalFinal: totalParaCuotas, paxCount }),
        currency
    );

    saveQuickQuoteFormState();
}

async function saveQuickQuote(andRedirect = false) {
    const passengerName = (document.getElementById('rapido-pasajero')?.value || '').trim();
    if (!passengerName) {
        window.showAlert('warning', 'La cotización rápida debe tener un título obligatorio.');
        return;
    }
    const paxCount = parseInt(document.getElementById('rapido-pax-count')?.value) || 2;

    // Check if there is at least one flight, hotel, or transfer service with a cost greater than 0
    const rows = Array.from(document.querySelectorAll('#quick-budget-body tr.quick-row'));
    const hasServiceWithCost = rows.some(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const monto = parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);
        return (tipo === 'vuelo' || tipo === 'hotel' || tipo === 'traslado') && monto > 0;
    });

    if (!hasServiceWithCost) {
        window.showAlert('warning', 'Para poder guardar la cotización, debe haber por lo menos un servicio de Vuelo, Alojamiento o Traslado con un monto mayor a 0.');
        return;
    }

    const vuelos = [];
    const hoteles = [];    // solo alojamientos reales
    const traslados = []; // traslados separados
    let totalAereo = 0;
    let totalTerrestreNeto = 0;

    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const label = tr.querySelector('.quick-row-label')?.value || '';
        const operador = tr.querySelector('.quick-row-operador')?.value || '';
        const monto = parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);

        if (tipo === 'vuelo') {
            totalAereo += monto;
            vuelos.push({
                nombre: label, monto: monto, fee: 0, operador: operador,
                aerolinea: tr.querySelector('.quick-row-aerolinea')?.value || '',
                aerolinea_logo: tr.querySelector('.quick-row-aerolinea-logo')?.value || ''
            });
        } else if (tipo === 'fee-aereo') {
            totalAereo += monto;
            if (vuelos.length > 0) {
                vuelos[0].fee += monto;
                if (operador) vuelos[0].operador = operador;
            } else {
                vuelos.push({ nombre: "Fee Aéreo", monto: 0, fee: monto, operador: operador });
            }
        } else if (tipo === 'hotel') {
            totalTerrestreNeto += monto;
            const estrellas = parseInt(tr.querySelector('.quick-row-estrellas')?.value, 10) || 4;
            hoteles.push({
                nombre: label, costo: monto, operador: operador, estrellas: estrellas,
                regimen: tr.querySelector('.quick-row-regimen')?.value || '',
                hotel_id: tr.querySelector('.quick-row-hotel-id')?.value || ''
            });
        } else if (tipo === 'traslado') {
            totalTerrestreNeto += monto;
            traslados.push({ nombre: label, costo: monto, operador: operador });
        }
    });

    const origen = document.getElementById('rapido-origen')?.value || '';
    const destino = document.getElementById('rapido-destino')?.value || '';
    const fechaSalida = document.getElementById('rapido-fecha-salida')?.value || '';
    const fechaRegreso = document.getElementById('rapido-fecha-regreso')?.value || '';

    // Build backend payload: hoteles array includes transfers and METADATA (backend format)
    const hotelesPayload = [
        ...hoteles,
        ...traslados,
        {
            nombre: "METADATA_PRESUPUESTO_RAPIDO",
            costo: 0,
            origen: origen,
            destino: destino,
            fecha_salida: fechaSalida,
            fecha_regreso: fechaRegreso,
            moneda: document.getElementById('rapido-moneda')?.value || 'USD',
            operador: document.getElementById('rapido-operador')?.value || '',
            redondear: isQuickRedondeoActive
        }
    ];

    const adminVal = totalTerrestreNeto * 0.05;
    const totalFinal = totalAereo + totalTerrestreNeto + adminVal;

    const payload = {
        pasajero_nombre: passengerName,
        cantidad_pasajeros: paxCount,
        vuelos: vuelos,
        hoteles: hotelesPayload,
        gastos_iva: 0,
        total_cotizacion: totalFinal
    };

    const currentUser = (window.loggedInUser || '').toLowerCase();
    const quoteOwner = (window.currentQuickQuoteOwner || '').toLowerCase();
    const isOwner = (currentUser && quoteOwner && (currentUser === quoteOwner)) ||
        (window.userId && quoteOwner && (window.userId.toLowerCase() === quoteOwner));
    if (currentQuickQuoteId && quoteOwner && !isOwner) {
        currentQuickQuoteId = null;
        window.currentQuickQuoteOwner = null;
        window.showAlert('info', 'Esta cotización pertenece a otro agente. Se ha guardado como una copia nueva bajo tu usuario.');
    }

    if (currentQuickQuoteId) {
        payload.id = currentQuickQuoteId;
    }

    window.changeFavicon('loading');
    window.showLoader("Guardando cotización rápida...");
    const signal = window.getAbortSignal(true);

    try {
        const res = await window.authenticatedFetch('/api/presupuestos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Error al guardar");
        }

        const saved = await res.json();
        currentQuickQuoteId = saved.id;
        window.currentQuickQuoteOwner = saved.agente_id;

        // Update URL to reflect saved quote ID
        if (window.location.pathname === '/cotizacion-rapida' || window.location.pathname.startsWith('/cotizacion-rapida/')) {
            history.replaceState(null, null, `/cotizacion-rapida?id=${saved.id}`);
        }

        window.changeFavicon('success');
        window.showAlert('success', 'Cotización rápida guardada correctamente.');

        if (andRedirect) {
            // Keep quote payload in memory to pre-load detailed quote tab
            // hoteles: only real accommodation entries (no transfers, no metadata)
            // traslados: transfer entries only
            const trasladosTotal = traslados.reduce((sum, t) => sum + t.costo, 0);
            window.quickQuoteBridge = {
                passengerName,
                paxCount,
                vuelos,
                hoteles,        // alojamientos reales
                traslados,      // traslados separados
                trasladosTotal,
                origen,
                destino,
                fechaSalida,
                fechaRegreso,
                moneda: document.getElementById('rapido-moneda')?.value || 'USD',
                redondear: isQuickRedondeoActive,
                ivaSum: 0,
                totalFinal
            };
            window.savedQuickQuoteState = null;
            window.navigateTo('/cotizacion-completa');
        } else {
            enableQuickFormEditing(false);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        window.changeFavicon('error');
        window.showAlert('warning', 'Error al procesar: ' + err.message);
    } finally {
        window.hideLoader();
    }
}
window.saveQuickQuote = saveQuickQuote;

export function initCotizacionesRapidas() {
    loadQuickBudgetsList();
}

let allSavedQuickBudgets = [];

async function loadQuickBudgetsList() {
    const tbody = document.getElementById('db-budgets-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('budget-search-input');
    if (searchInput) searchInput.value = '';

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-8 text-center text-slate-400">
                <span class="inline-block animate-spin border-2 border-brand-primary border-t-transparent rounded-full w-4 h-4 mr-2"></span>
                Cargando cotizaciones rápidas...
            </td>
        </tr>
    `;

    const signal = window.getAbortSignal(true);
    try {
        const res = await window.authenticatedFetch('/api/presupuestos', { signal });
        if (!res.ok) throw new Error("Error al obtener las cotizaciones rápidas de la base de datos.");
        const budgets = await res.json();

        allSavedQuickBudgets = budgets;
        renderQuickBudgetsTable(allSavedQuickBudgets);

    } catch (err) {
        if (err.name === 'AbortError') return;
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-rose-500 font-bold">
                    Error al cargar las cotizaciones rápidas: ${err.message}
                </td>
            </tr>
        `;
    }
}
window.loadQuickBudgetsList = loadQuickBudgetsList;

function renderQuickBudgetsTable(budgetsList) {
    const tbody = document.getElementById('db-budgets-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (budgetsList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-slate-400 font-semibold">
                    No se encontraron cotizaciones rápidas.
                </td>
            </tr>
        `;
        return;
    }

    budgetsList.forEach(q => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-slate-50 transition-colors duration-150 cursor-pointer';
        tr.onclick = (e) => {
            loadQuickBudgetIntoForm(q.id);
        };

        const totalUSD = q.total_cotizacion || 0;
        let dateFormatted = '-';
        if (q.created_at) {
            try {
                const dateObj = new Date(q.created_at);
                const dd = String(dateObj.getDate()).padStart(2, '0');
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const yyyy = dateObj.getFullYear();
                const hh = String(dateObj.getHours()).padStart(2, '0');
                const min = String(dateObj.getMinutes()).padStart(2, '0');
                dateFormatted = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
            } catch (e) {
                dateFormatted = q.created_at;
            }
        }

        const currentUser = (window.loggedInUser || '').toLowerCase();
        const quoteOwner = (q.agente_id || '').toLowerCase();
        const isOwner = currentUser && quoteOwner && (currentUser === quoteOwner);

        const deleteButtonHtml = isOwner ? `
            <button type="button" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Eliminar cotización rápida" onclick="deleteQuickBudget('${q.id}', event)">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        ` : '';

        const copyButtonHtml = `
            <button type="button" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer" title="Copiar cotización como texto para WhatsApp" onclick="copySavedQuickBudgetAsText('${q.id}', event)">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
            </button>
        `;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-slate-500">${dateFormatted}</td>
            <td class="p-3 font-semibold text-slate-800">${q.pasajero_nombre || 'Sin Nombre'}</td>
            <td class="p-3 text-center">${q.cantidad_pasajeros || 1}</td>
            <td class="p-3">${q.agente_id || '-'}</td>
            <td class="p-3 text-right font-semibold text-brand-primary">USD ${window.formatPriceES(totalUSD)}</td>
            <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-1">
                    ${copyButtonHtml}
                    ${deleteButtonHtml}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteQuickBudget(quoteId, event) {
    if (event) event.stopPropagation();
    window.showCustomConfirm({
        title: '¿Eliminar cotización rápida?',
        desc: '¿Estás seguro de que deseas eliminar esta cotización rápida? Esta acción no se puede deshacer.',
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: () => executeDeleteQuickBudget(quoteId)
    });
}
window.deleteQuickBudget = deleteQuickBudget;

async function executeDeleteQuickBudget(quoteId) {
    try {
        const res = await window.authenticatedFetch(`/api/presupuestos/${quoteId}`, {
            method: 'DELETE'
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "No se pudo eliminar la cotización rápida.");
        }

        window.showAlert('success', 'Cotización rápida eliminada correctamente.');
        loadQuickBudgetsList();
    } catch (err) {
        window.showAlert('warning', 'Error: ' + err.message);
    }
}

async function loadQuickBudgetIntoForm(quoteId) {
    const cleanId = quoteId ? String(quoteId).trim().replace(/[^a-zA-Z0-9_-]/g, '') : null;
    if (!cleanId) {
        window.showAlert('warning', 'ID de cotización rápida no válido.');
        history.replaceState(null, null, '/cotizacion-rapida');
        return;
    }

    const isFormPage = !!document.getElementById('quick-budget-body');
    if (!isFormPage) {
        window.pendingEditQuickBudgetId = cleanId;
        navigateTo(`/cotizacion-rapida?id=${cleanId}`);
        return;
    }

    // Sync URL state
    if (window.location.pathname !== '/cotizacion-rapida' || window.location.search !== `?id=${cleanId}`) {
        history.replaceState(null, null, `/cotizacion-rapida?id=${cleanId}`);
    }

    window.showLoader("Cargando cotización rápida...");
    const signal = window.getAbortSignal(true);

    try {
        const res = await window.authenticatedFetch(`/api/presupuestos/${cleanId}`, { signal });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Presupuesto rápido no encontrado.");
        }
        const q = await res.json();
        currentQuickQuoteId = q.id;
        window.currentQuickQuoteOwner = q.agente_id;

        document.getElementById('rapido-pasajero').value = q.pasajero_nombre || '';
        document.getElementById('rapido-pax-count').value = q.cantidad_pasajeros || 2;

        // Reset optional inputs first
        const origenInput = document.getElementById('rapido-origen');
        if (origenInput) origenInput.value = '';

        const destInput = document.getElementById('rapido-destino');
        if (destInput) destInput.value = '';

        const depPickerInput = document.getElementById('rapido-fecha-salida');
        if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.clear();

        const retPickerInput = document.getElementById('rapido-fecha-regreso');
        if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.clear();

        const tbody = document.getElementById('quick-budget-body');
        tbody.innerHTML = '';

        // Add Flight rows
        let feeSum = 0;
        let flightsSum = 0;

        if (q.vuelos && q.vuelos.length > 0) {
            q.vuelos.forEach(v => {
                feeSum += v.fee || 0;
                flightsSum += v.monto || 0;

                if (v.nombre === "Fee Aéreo" && v.monto === 0) {
                    return;
                }
                addQuickBudgetRow({
                    tipo: 'vuelo', label: v.nombre, monto: v.monto, operador: v.operador,
                    aerolinea: v.aerolinea, aerolinea_logo: v.aerolinea_logo
                });
            });
        }

        // Add Fee-aereo row
        addQuickBudgetRow({ tipo: 'fee-aereo', monto: feeSum });

        // Sync fee lock state
        if (flightsSum > 0 && Math.abs(feeSum - (flightsSum * 0.10)) > 0.01) {
            isQuickFeeLocked = false;
        } else {
            isQuickFeeLocked = true;
        }

        // Add Hotel/Traslado rows
        if (q.hoteles && q.hoteles.length > 0) {
            q.hoteles.forEach(h => {
                if (h.nombre === "METADATA_PRESUPUESTO_RAPIDO") {
                    if (origenInput) origenInput.value = h.origen || '';
                    if (destInput) destInput.value = h.destino || '';
                    if (h.fecha_salida && depPickerInput && depPickerInput._flatpickr) {
                        depPickerInput._flatpickr.setDate(h.fecha_salida);
                    }
                    if (h.fecha_regreso && retPickerInput && retPickerInput._flatpickr) {
                        retPickerInput._flatpickr.setDate(h.fecha_regreso);
                    }
                    const currency = h.moneda || 'USD';
                    setQuickCurrency(currency);
                    const savedRedondeo = typeof h.redondear !== 'undefined' ? h.redondear : false;
                    toggleQuickQuoteRedondeo(savedRedondeo);
                    return;
                }
                const tipo = h.nombre.toLowerCase().includes('traslado') ? 'traslado' : 'hotel';
                addQuickBudgetRow({
                    tipo: tipo, label: h.nombre, monto: h.costo, operador: h.operador,
                    estrellas: h.estrellas || 4, regimen: h.regimen || '', hotel_id: h.hotel_id || ''
                });
            });
        }
        updateQuickCurrencyLabels();
        updatePaxStepperUI(q.cantidad_pasajeros || 2);

        // Add Admin row
        addQuickBudgetRow({ tipo: 'admin' });

        // Sync locks on all rows
        document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
            syncQuickRowEditableState(tr);
        });

        calculateQuickQuote();
        updateSaveButtonState();
        enableQuickFormEditing(false);

        // Update document title dynamically
        const appName = (window.agencyConfig && window.agencyConfig.nombre_agencia) || 'One Trip';
        document.title = `Cotización Rápida #${q.id} | ${appName}`;

    } catch (err) {
        if (err.name === 'AbortError') return;
        window.showAlert('warning', 'No se pudo cargar la cotización rápida: ' + err.message);
        currentQuickQuoteId = null;
        window.currentQuickQuoteOwner = null;
        isQuickReadOnlyMode = false;
        history.replaceState(null, null, '/cotizacion-rapida');
        const indicator = document.getElementById('editing-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
            indicator.classList.remove('flex');
        }
        loadDefaultQuickQuoteRows();
        calculateQuickQuote();
        updateSaveButtonState();
    } finally {
        window.hideLoader();
    }
}
window.loadQuickBudgetIntoForm = loadQuickBudgetIntoForm;

function filterQuickBudgets() {
    const query = document.getElementById('budget-search-input').value.toLowerCase().trim();
    if (!query) {
        renderQuickBudgetsTable(allSavedQuickBudgets);
        return;
    }

    const filtered = allSavedQuickBudgets.filter(q => {
        const paxName = (q.pasajero_nombre || '').toLowerCase();
        const agent = (q.agente_id || '').toLowerCase();
        return paxName.includes(query) || agent.includes(query);
    });

    renderQuickBudgetsTable(filtered);
}
window.filterQuickBudgets = filterQuickBudgets;

async function fillQuickTestData() {
    const passengerInput = document.getElementById('rapido-pasajero');
    const paxCountInput = document.getElementById('rapido-pax-count');
    if (!passengerInput || !paxCountInput) return;

    passengerInput.value = 'Pasajero de prueba';
    paxCountInput.value = 2;

    const origenInput = document.getElementById('rapido-origen');
    if (origenInput) origenInput.value = 'Córdoba';

    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.value = 'Cancún, México';

    const today = new Date();
    const departureDate = new Date(today);
    departureDate.setDate(today.getDate() + 30);
    const returnDate = new Date(today);
    returnDate.setDate(today.getDate() + 37);

    const depPickerInput = document.getElementById('rapido-fecha-salida');
    if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.setDate(departureDate);

    const retPickerInput = document.getElementById('rapido-fecha-regreso');
    if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.setDate(returnDate);

    const tbody = document.getElementById('quick-budget-body');
    if (tbody) tbody.innerHTML = '';

    isQuickFeeLocked = true;

    addQuickBudgetRow({ tipo: 'vuelo', label: 'Vuelo Aerolíneas Argentinas', monto: 1800.00 });
    addQuickBudgetRow({ tipo: 'fee-aereo', isDefault: true, monto: 180.00 });
    addQuickBudgetRow({ tipo: 'hotel', label: 'Riu Palace Aruba', monto: 3200.00, estrellas: 5, regimen: 'All Inclusive' });
    addQuickBudgetRow({ tipo: 'traslado', label: 'Traslado Privado In/Out', monto: 250.00 });
    addQuickBudgetRow({ tipo: 'admin', isDefault: true });

    // Sync locks on all rows
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        syncQuickRowEditableState(tr);
    });

    calculateQuickQuote();

    window.showAlert('success', '✔ Montos de prueba cargados correctamente en Cotización Rápida.');
}
window.fillQuickTestData = fillQuickTestData;

function adjustQuickInputWidth(input) {
    if (!input) return;
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'pre';
    tempSpan.style.font = window.getComputedStyle(input).font;
    tempSpan.innerText = input.value || input.placeholder || '';
    document.body.appendChild(tempSpan);

    const extraPadding = 24;
    const newWidth = Math.max(80, tempSpan.offsetWidth + extraPadding);
    input.style.width = newWidth + 'px';

    document.body.removeChild(tempSpan);
}
window.adjustQuickInputWidth = adjustQuickInputWidth;

export function enableQuickFormEditing(enabled) {
    isQuickReadOnlyMode = !enabled;

    // Enable/disable basic fields
    const titleInput = document.getElementById('rapido-pasajero');
    if (titleInput) titleInput.readOnly = !enabled;

    const paxInput = document.getElementById('rapido-pax-count');
    if (paxInput) paxInput.disabled = !enabled;

    const origenInput = document.getElementById('rapido-origen');
    if (origenInput) origenInput.disabled = !enabled;

    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.disabled = !enabled;

    // Flatpickrs
    ['rapido-fecha-salida', 'rapido-fecha-regreso'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el._flatpickr) {
            el._flatpickr.input.disabled = !enabled;
            if (el._flatpickr.altInput) {
                el._flatpickr.altInput.disabled = !enabled;
            }
        }
    });

    // Controles del panel de detalles de cada fila
    document.querySelectorAll('#quick-budget-body tr.quick-row-details select').forEach(sel => {
        sel.disabled = !enabled;
    });
    document.querySelectorAll('#quick-budget-body tr.quick-row-details button').forEach(btn => {
        btn.disabled = !enabled;
    });
    // Los chips de operador/aerolinea son spans con onclick: se desactiva el panel completo
    document.querySelectorAll('#quick-budget-body .quick-row-details-panel').forEach(panel => {
        panel.classList.toggle('pointer-events-none', !enabled);
        panel.classList.toggle('opacity-60', !enabled);
    });

    // Enable/disable rows
    const rows = document.querySelectorAll('#quick-budget-body tr.quick-row');
    rows.forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const labelInput = tr.querySelector('.quick-row-label');
        const montoInput = tr.querySelector('.quick-row-monto');
        const btnDelete = tr.querySelector('.btn-delete-row');
        const btnUnlock = tr.querySelector('.quick-row-fee-unlock');

        if (labelInput) {
            const isUndeletable = (tipo === 'fee-aereo' || tipo === 'admin');
            if (isUndeletable) {
                labelInput.readOnly = true;
            } else {
                labelInput.readOnly = !enabled;
            }
            if (enabled && !isUndeletable) {
                labelInput.classList.remove('cursor-default', 'pointer-events-none');
                labelInput.classList.add('cursor-text');
            } else {
                labelInput.classList.add('cursor-default', 'pointer-events-none');
                labelInput.classList.remove('cursor-text');
            }
        }

        if (montoInput) {
            if (!enabled) {
                montoInput.readOnly = true;
                montoInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
                montoInput.classList.remove('bg-white');
            } else {
                if (tipo === 'admin' || tipo === 'redondeo') {
                    montoInput.readOnly = true;
                    montoInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
                    montoInput.classList.remove('bg-white');
                } else if (tipo === 'fee-aereo') {
                    if (isQuickFeeLocked) {
                        montoInput.readOnly = true;
                        montoInput.classList.add('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
                        montoInput.classList.remove('bg-white');
                    } else {
                        montoInput.readOnly = false;
                        montoInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
                        montoInput.classList.add('bg-white');
                    }
                } else {
                    montoInput.readOnly = false;
                    montoInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
                    montoInput.classList.add('bg-white');
                }
            }
        }

        if (btnDelete) {
            const isUndeletable = (tipo === 'fee-aereo' || tipo === 'admin');
            if (!isUndeletable) {
                if (enabled) {
                    btnDelete.classList.remove('invisible', 'pointer-events-none');
                } else {
                    btnDelete.classList.add('invisible', 'pointer-events-none');
                }
            }
        }

        const starsSelect = tr.querySelector('.quick-row-estrellas');
        if (starsSelect) {
            starsSelect.disabled = !enabled;
            if (enabled) {
                starsSelect.classList.remove('opacity-60', 'pointer-events-none');
            } else {
                starsSelect.classList.add('opacity-60', 'pointer-events-none');
            }
        }

        if (btnUnlock) {
            if (enabled) {
                btnUnlock.disabled = false;
                btnUnlock.classList.remove('pointer-events-none', 'opacity-50');
            } else {
                btnUnlock.disabled = true;
                btnUnlock.classList.add('pointer-events-none', 'opacity-50');
            }
        }
    });

    const addConceptBtn = document.getElementById('quick-add-concept-container');
    if (addConceptBtn) {
        if (enabled) {
            addConceptBtn.classList.remove('hidden');
        } else {
            addConceptBtn.classList.add('hidden');
        }
    }

    const btnReset = document.getElementById('btn-reset-quick-budget');
    if (btnReset) {
        if (enabled) {
            updateResetButtonVisibility();
        } else {
            btnReset.classList.add('hidden');
            btnReset.classList.remove('flex');
        }
    }

    const btnSaveAndGo = document.getElementById('btn-save-quick-and-go');
    if (btnSaveAndGo) {
        btnSaveAndGo.classList.remove('hidden');
    }

    updateQuickEditingIndicator();
    updateSaveButtonState();
}
window.enableQuickFormEditing = enableQuickFormEditing;

export function updateQuickEditingIndicator() {
    const indicator = document.getElementById('editing-indicator');
    const indicatorText = document.getElementById('editing-indicator-text');
    const actionsContainer = document.getElementById('editing-indicator-actions');
    if (!indicator || !indicatorText || !actionsContainer) return;

    if (currentQuickQuoteId) {
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');

        const currentUser = (window.loggedInUser || '').toLowerCase();
        const quoteOwner = (window.currentQuickQuoteOwner || '').toLowerCase();
        const isOwner = (currentUser && quoteOwner && (currentUser === quoteOwner)) ||
            (window.userId && quoteOwner && (window.userId.toLowerCase() === quoteOwner));

        if (isQuickReadOnlyMode) {
            indicatorText.innerHTML = `<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> Visualizando cotización rápida guardada (ID #${currentQuickQuoteId})</span>`;

            const editBtnHtml = isOwner ? `
                <button type="button" onclick="window.enableQuickFormEditing(true)" class="px-3 py-1 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider shadow-sm shadow-brand-primary/20">Editar Cotización</button>
            ` : '';

            actionsContainer.innerHTML = `
                ${editBtnHtml}
                <button type="button" onclick="window.duplicateCurrentQuickQuote()" class="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Duplicar como Nueva</button>
                <button type="button" onclick="window.closeSavedQuickQuoteView()" class="px-3 py-1 bg-white hover:bg-amber-100 text-slate-800 border border-slate-200 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Cerrar</button>
            `;
        } else {
            indicatorText.innerHTML = `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Editando cotización rápida guardada (ID #${currentQuickQuoteId})</span>`;

            actionsContainer.innerHTML = `
                <button type="button" onclick="window.saveQuickQuoteChanges()" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider shadow-sm shadow-emerald-600/20">Guardar cambios</button>
                <button type="button" onclick="window.duplicateCurrentQuickQuote()" class="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Duplicar como Nueva</button>
                <button type="button" onclick="window.cancelEditingQuickQuote()" class="px-3 py-1 bg-white hover:bg-amber-100 text-slate-800 border border-slate-200 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Cancelar Edición</button>
            `;
        }
    } else {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
    }
}
window.updateQuickEditingIndicator = updateQuickEditingIndicator;

export function duplicateCurrentQuickQuote() {
    currentQuickQuoteId = null;
    window.currentQuickQuoteOwner = null;
    history.replaceState(null, null, '/cotizacion-rapida');
    const paxInput = document.getElementById('rapido-pasajero');
    if (paxInput && paxInput.value && !paxInput.value.startsWith('Copia de ')) {
        paxInput.value = 'Copia de ' + paxInput.value;
    }
    enableQuickFormEditing(true);
    window.showAlert('success', 'Cotización rápida duplicada como nueva. Los cambios se guardarán como un registro nuevo.');
    updateQuickEditingIndicator();
    updateSaveButtonState();
    saveQuickQuoteFormState();
}
window.duplicateCurrentQuickQuote = duplicateCurrentQuickQuote;

export async function cancelEditingQuickQuote() {
    if (currentQuickQuoteId) {
        await loadQuickBudgetIntoForm(currentQuickQuoteId);
        enableQuickFormEditing(false);
    } else {
        enableQuickFormEditing(true);
    }
}
window.cancelEditingQuickQuote = cancelEditingQuickQuote;

export function closeSavedQuickQuoteView() {
    currentQuickQuoteId = null;
    window.currentQuickQuoteOwner = null;
    isQuickReadOnlyMode = false;

    // Clear fields to defaults
    const passengerInput = document.getElementById('rapido-pasajero');
    if (passengerInput) passengerInput.value = '';
    const paxCountInput = document.getElementById('rapido-pax-count');
    if (paxCountInput) paxCountInput.value = 2;
    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.value = '';
    const depPickerInput = document.getElementById('rapido-fecha-salida');
    if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.clear();
    const retPickerInput = document.getElementById('rapido-fecha-regreso');
    if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.clear();

    const operadorSelect = document.getElementById('rapido-operador');
    if (operadorSelect) operadorSelect.value = '';

    const tbody = document.getElementById('quick-budget-body');
    if (tbody) tbody.innerHTML = '';
    loadDefaultQuickQuoteRows();
    calculateQuickQuote();
    saveQuickQuoteFormState();

    // Hide indicator
    const indicator = document.getElementById('editing-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
    }

    navigateTo('/editar?tab=rapidos');
}
window.closeSavedQuickQuoteView = closeSavedQuickQuoteView;

export async function saveQuickQuoteChanges() {
    await saveQuickQuote(false);
    enableQuickFormEditing(false);
}
window.saveQuickQuoteChanges = saveQuickQuoteChanges;

function updateQuickCurrencyLabels() {
    const selectedCurrency = document.getElementById('rapido-moneda')?.value || 'USD';
    document.querySelectorAll('.quick-currency-label').forEach(el => {
        el.innerText = selectedCurrency;
    });
}
window.updateQuickCurrencyLabels = updateQuickCurrencyLabels;

// ──────────────────────────────────────────────────────────────────────────────
// COPIAR COTIZACIÓN RÁPIDA COMO TEXTO (WHATSAPP / MARKDOWN)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Genera el texto formateado de la cotización para WhatsApp / Portapapeles
 * siguiendo las reglas de contenido, lista con viñetas, emojis y negritas clave.
 *
 * @param {Object} data - Datos consolidados de la cotización
 * @param {Object} options - Configuración de formato ({ forWhatsApp: true })
 * @returns {string} Mensaje listo para enviar
 */
export function buildQuickQuoteTextMessage(data, options = { forWhatsApp: true }) {
    const bold = (txt) => (options && options.forWhatsApp) ? `*${txt}*` : `**${txt}**`;

    // 1. Base y Pasajeros
    const pax = Math.max(1, parseInt(data.paxCount, 10) || 1);
    const paxTexto = pax === 1 ? '1 pasajero' : `${pax} pasajeros`;

    let baseHabitacion = 'Single';
    if (pax === 2) baseHabitacion = 'Doble';
    else if (pax === 3) baseHabitacion = 'Triple';
    else if (pax === 4) baseHabitacion = 'Cuádruple';
    else if (pax > 4) baseHabitacion = `Grupal (${pax} personas)`;

    if (data.baseHabitacion) {
        baseHabitacion = data.baseHabitacion;
    }

    // 2. Vuelos y Equipaje
    let lineaVuelo = '';
    const destinoRaw = (data.destino || '').trim();
    if (destinoRaw || data.hasVuelo) {
        const origenExplicito = (data.origen || '').trim();
        let origen = origenExplicito || 'Córdoba';
        let destino = destinoRaw || 'Destino a confirmar';

        // Manejar formatos "Origen a Destino" o "Origen - Destino".
        // Si el usuario cargó el campo Origen, ese valor tiene prioridad.
        if (destino.toLowerCase().includes(' a ')) {
            const parts = destino.split(/\s+a\s+/i);
            if (parts.length >= 2) {
                if (!origenExplicito) origen = parts[0].trim();
                destino = parts.slice(1).join(' a ').trim();
            }
        } else if (destino.includes(' - ')) {
            const parts = destino.split(' - ');
            if (parts.length >= 2) {
                if (!origenExplicito) origen = parts[0].trim();
                destino = parts.slice(1).join(' - ').trim();
            }
        }

        // Equipaje
        let baggageList = [];
        if (Array.isArray(data.equipaje) && data.equipaje.length > 0) {
            if (data.equipaje.includes('carry')) baggageList.push('carry-on');
            if (data.equipaje.includes('valija')) baggageList.push('equipaje en bodega (23kg)');
        } else if (typeof data.equipaje === 'string' && data.equipaje.trim()) {
            baggageList.push(data.equipaje.trim());
        } else {
            // Predeterminado estándar
            baggageList = ['carry-on'];
        }

        let detalleEquipaje = 'con mochila';
        if (baggageList.length === 1) {
            detalleEquipaje += ` y ${baggageList[0]}`;
        } else if (baggageList.length > 1) {
            detalleEquipaje += `, ${baggageList.slice(0, -1).join(', ')} y ${baggageList.slice(-1)}`;
        }

        lineaVuelo = `✈️ Vuelos para ${paxTexto} desde ${bold(origen)} a ${bold(destino)} ${detalleEquipaje}`;
    }

    // 3. Fechas de viaje (Salida y Regreso)
    const formatFechaDisplay = (dStr) => {
        if (!dStr) return '';
        const clean = String(dStr).trim();
        if (!clean) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            const [y, m, d] = clean.split('-');
            return `${d}/${m}/${y}`;
        }
        return clean;
    };

    const calculateNights = (fSalidaRaw, fRegresoRaw) => {
        if (!fSalidaRaw || !fRegresoRaw) return 0;
        try {
            const parseDate = (str) => {
                const clean = String(str).trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
                    return new Date(clean + 'T00:00:00');
                }
                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
                    const [d, m, y] = clean.split('/');
                    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
                }
                return new Date(clean);
            };
            const d1 = parseDate(fSalidaRaw);
            const d2 = parseDate(fRegresoRaw);
            if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
            const diffMs = d2 - d1;
            return diffMs > 0 ? Math.round(diffMs / (1000 * 60 * 60 * 24)) : 0;
        } catch (_) {
            return 0;
        }
    };

    let lineaFechas = '';
    const fSalida = formatFechaDisplay(data.fechaSalida);
    const fRegreso = formatFechaDisplay(data.fechaRegreso);

    if (fSalida && fRegreso) {
        lineaFechas = `🗓️ Salida: ${fSalida} | Regreso: ${fRegreso}`;
    } else if (fSalida) {
        lineaFechas = `🗓️ Fecha de salida: ${fSalida}`;
    } else if (fRegreso) {
        lineaFechas = `🗓️ Fecha de regreso: ${fRegreso}`;
    }

    // 4. Alojamientos y Noches
    const totalNoches = calculateNights(data.fechaSalida, data.fechaRegreso);
    let tituloAlojamiento = 'Alojamiento';
    if (totalNoches > 0) {
        const nochesTexto = totalNoches === 1 ? '1 noche' : `${totalNoches} noches`;
        tituloAlojamiento = `Alojamiento (${nochesTexto})`;
    }

    const lineasHoteles = (data.hoteles || []).map(hotel => {
        let nombre = typeof hotel === 'string' ? hotel : (hotel.nombre || hotel.label || 'Hotel');
        nombre = nombre.trim();

        if (nombre.toLowerCase() === 'alojamiento' || nombre.toLowerCase() === 'hotel') {
            nombre = data.destino ? `Hotel en ${data.destino}` : 'Hotel seleccionado';
        }

        // Detectar estrellas si ya existen en el nombre o en el objeto
        let starsCount = typeof hotel === 'object' && hotel.estrellas ? parseInt(hotel.estrellas, 10) : 0;
        if (!starsCount) {
            const starMatch = nombre.match(/([⭐★]+)/);
            if (starMatch) {
                starsCount = (starMatch[1].match(/[⭐★]/g) || []).length;
                nombre = nombre.replace(/[⭐★]+/g, '').trim();
            } else {
                const numStarMatch = nombre.match(/(\d)\s*(?:\*|estrellas|star|stars)/i);
                if (numStarMatch) {
                    starsCount = parseInt(numStarMatch[1], 10);
                    nombre = nombre.replace(/\(?\d\s*(?:\*|estrellas|star|stars)\)?/i, '').trim();
                }
            }
        } else {
            nombre = nombre.replace(/[⭐★]+/g, '').trim();
            nombre = nombre.replace(/\(?\d\s*(?:\*|estrellas|star|stars)\)?/i, '').trim();
        }

        nombre = nombre.replace(/[-–—:]+$/, '').trim();

        if (!starsCount || isNaN(starsCount) || starsCount <= 0) {
            starsCount = 4;
        }
        starsCount = Math.min(5, Math.max(1, starsCount));
        const estrellasTexto = starsCount === 1 ? '1 estrella' : `${starsCount} estrellas`;

        const regimen = (typeof hotel === 'object' && hotel.regimen) ? String(hotel.regimen).trim() : '';

        return `🏨 ${nombre} - ${estrellasTexto}${regimen ? ` · ${regimen}` : ''}`;
    });

    // Bloque de Alojamientos con título en negrita y salto de línea
    let bloqueAlojamientos = '';
    if (lineasHoteles.length > 0) {
        bloqueAlojamientos = `${bold(tituloAlojamiento)}\n${lineasHoteles.join('\n')}`;
    }

    // 5. Traslados (Opcional - solo si están incluidos)
    let lineaTraslado = '';
    const hasTraslado = Boolean(data.incluyeTraslado || (data.traslados && data.traslados.length > 0));
    if (hasTraslado) {
        lineaTraslado = '🚐 Traslados incluidos (aeropuerto > hotel > aeropuerto)';
    }

    // 6. Precios y Base
    const moneda = data.moneda || 'USD';
    const formatNumber = (num) => {
        const val = parseFloat(num) || 0;
        if (Math.round(val) === val) {
            return val.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }
        return val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const strPrecioPersona = `${moneda} ${formatNumber(data.precioPersona || 0)}`;
    const strPrecioTotal = `${moneda} ${formatNumber(data.total || 0)}`;

    // Construcción limpia del mensaje separando cada sección con salto de línea
    const lineasServicios = [
        lineaFechas,
        lineaVuelo,
        bloqueAlojamientos,
        lineaTraslado
    ].filter(Boolean);

    const bloquePrecios = [
        `👤 ${bold('Precio por persona:')} ${strPrecioPersona}`,
        `💰 ${bold(`Total (Base ${baseHabitacion}):`)} ${strPrecioTotal}`
    ].join('\n');

    // 7. Financiación: entrega inicial (valor de los vuelos) + saldo en cuotas
    let bloqueCuotas = '';
    const cuotas = data.cuotas;
    if (cuotas && cuotas.entregaPersona > 0) {
        const lineasCuotas = [`💳 ${bold('Formas de pago (por persona)')}`];
        lineasCuotas.push(`• Entrega inicial de ${moneda} ${formatNumber(cuotas.entregaPersona)} (valor de los vuelos)`);

        const planes = (cuotas.planes || []).filter(plan => plan && plan.montoPersona > 0);
        if (planes.length > 0) {
            planes.forEach(plan => {
                lineasCuotas.push(`• Saldo en ${plan.cantidad} cuotas de ${moneda} ${formatNumber(plan.montoPersona)}`);
            });
        } else {
            lineasCuotas.push('• Sin saldo a financiar: la entrega cubre el total');
        }

        bloqueCuotas = lineasCuotas.join('\n');
    }

    const secciones = [
        ...lineasServicios,
        bloquePrecios,
        bloqueCuotas
    ].filter(Boolean);

    return secciones.join('\n\n');
}
window.buildQuickQuoteTextMessage = buildQuickQuoteTextMessage;

/**
 * Extrae los datos actuales de la Cotización Rápida y los copia al portapapeles.
 */
export async function copyQuickQuoteAsText() {
    const paxCount = parseInt(document.getElementById('rapido-pax-count')?.value, 10) || 2;
    const origen = (document.getElementById('rapido-origen')?.value || '').trim();
    const destino = (document.getElementById('rapido-destino')?.value || '').trim();
    const moneda = document.getElementById('rapido-moneda')?.value || 'USD';

    const hoteles = [];
    let incluyeTraslado = false;
    let hasVuelo = false;
    let equipajeCustom = null;

    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const label = (tr.querySelector('.quick-row-label')?.value || '').trim();
        const monto = parseFormattedNumber(tr.querySelector('.quick-row-monto')?.value);

        if (tipo === 'vuelo') {
            if (monto > 0 || label) hasVuelo = true;
            const lowerLabel = label.toLowerCase();
            if (lowerLabel.includes('valija') || lowerLabel.includes('23kg') || lowerLabel.includes('bodega')) {
                equipajeCustom = ['carry', 'valija'];
            } else if (lowerLabel.includes('solo mochila')) {
                equipajeCustom = [];
            }
        } else if (tipo === 'hotel') {
            const estrellas = parseInt(tr.querySelector('.quick-row-estrellas')?.value, 10) || 4;
            if (monto > 0 || (label && label.toLowerCase() !== 'alojamiento')) {
                hoteles.push({
                    nombre: label,
                    estrellas: estrellas,
                    regimen: tr.querySelector('.quick-row-regimen')?.value || ''
                });
            }
        } else if (tipo === 'traslado') {
            if (monto > 0) {
                incluyeTraslado = true;
            }
        }
    });

    if (hoteles.length === 0) {
        const defEstrellas = parseInt(document.querySelector('#quick-budget-body tr.quick-row .quick-row-estrellas')?.value, 10) || 4;
        hoteles.push({ nombre: destino ? `Hotel en ${destino}` : 'Hotel seleccionado', estrellas: defEstrellas });
    }

    // Totales respetando redondeo si está activo
    let total = 0;
    let precioPersona = 0;

    if (isQuickRedondeoActive) {
        total = parseFormattedNumber(document.getElementById('rapido-total-redondeado')?.innerText || '0');
        precioPersona = parseFormattedNumber(document.getElementById('rapido-pax-redondeado')?.innerText || '0');
    }

    if (!total) {
        total = parseFormattedNumber(document.getElementById('rapido-total-final')?.innerText || '0');
        precioPersona = parseFormattedNumber(document.getElementById('rapido-total-pax')?.innerText || '0');
    }

    const fechaSalida = document.getElementById('rapido-fecha-salida')?.value || '';
    const fechaRegreso = document.getElementById('rapido-fecha-regreso')?.value || '';

    // Financiación: la entrega inicial es el aéreo (vuelos + fee)
    const totalAereo = getQuickVuelosSum() + getQuickFeeAereoSum();
    const cuotas = computeQuickCuotas({ totalAereo, totalFinal: total, paxCount });

    const payload = {
        paxCount,
        origen: origen || 'Córdoba',
        destino: destino || (document.getElementById('rapido-pasajero')?.value || ''),
        fechaSalida,
        fechaRegreso,
        hasVuelo: hasVuelo || Boolean(destino),
        equipaje: equipajeCustom || ['carry'],
        hoteles,
        incluyeTraslado,
        moneda,
        precioPersona,
        total,
        cuotas
    };

    const mensaje = buildQuickQuoteTextMessage(payload, { forWhatsApp: true });

    // Abrir popup de vista previa con fondo desenfocado
    openQuickQuotePreviewModal(mensaje);
}
window.copyQuickQuoteAsText = copyQuickQuoteAsText;

/**
 * Copia una cotización rápida guardada directamente desde el listado abriendo el popup de vista previa.
 *
 * @param {string} quoteId - ID de la cotización guardada
 * @param {Event} event - Evento del clic
 */
export async function copySavedQuickBudgetAsText(quoteId, event) {
    if (event) event.stopPropagation();

    try {
        const res = await window.authenticatedFetch(`/api/presupuestos/${quoteId}`);
        if (!res.ok) throw new Error("No se pudo obtener la cotización rápida.");
        const q = await res.json();

        const hoteles = (q.hoteles || []).map(h => ({
            nombre: typeof h === 'string' ? h : (h.nombre || h.label || 'Hotel'),
            estrellas: (typeof h === 'object' && h.estrellas) ? h.estrellas : 4,
            regimen: (typeof h === 'object' && h.regimen) ? h.regimen : ''
        }));

        const traslados = q.traslados || [];
        const incluyeTraslado = traslados.length > 0;

        const metadata = (q.hoteles || []).find(h => h && h.nombre === 'METADATA_PRESUPUESTO_RAPIDO') || {};
        const fechaSalida = q.fecha_salida || metadata.fecha_salida || '';
        const fechaRegreso = q.fecha_regreso || metadata.fecha_regreso || '';

        const total = q.total_cotizacion || q.costo_total || 0;
        const paxCount = q.cantidad_pasajeros || 2;
        const precioPersona = paxCount > 0 ? (total / paxCount) : total;

        // Entrega inicial = aéreo guardado (monto de cada vuelo + su fee)
        const totalAereo = (q.vuelos || []).reduce((sum, v) => sum + (v.monto || 0) + (v.fee || 0), 0);
        const cuotas = computeQuickCuotas({ totalAereo, totalFinal: total, paxCount });

        const payload = {
            paxCount: paxCount,
            origen: metadata.origen || q.origen || 'Córdoba',
            destino: q.destino || q.pasajero_nombre || '',
            fechaSalida,
            fechaRegreso,
            hasVuelo: true,
            equipaje: ['carry'],
            hoteles: hoteles.length > 0 ? hoteles : [{ nombre: q.destino ? `Hotel en ${q.destino}` : 'Hotel seleccionado', estrellas: 4 }],
            incluyeTraslado: incluyeTraslado,
            moneda: q.moneda || 'USD',
            precioPersona: precioPersona,
            total: total,
            cuotas: cuotas
        };

        const mensaje = buildQuickQuoteTextMessage(payload, { forWhatsApp: true });

        openQuickQuotePreviewModal(mensaje);
    } catch (err) {
        console.error('Error al obtener cotización guardada:', err);
        if (window.showAlert) {
            window.showAlert('error', 'No se pudo cargar la cotización para vista previa.');
        }
    }
}
window.copySavedQuickBudgetAsText = copySavedQuickBudgetAsText;

// ──────────────────────────────────────────────────────────────────────────────
// MODAL POPUP DE VISTA PREVIA (CON FONDO DESENFOCADO)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Garantiza que el HTML del modal exista en el DOM.
 */
function ensureQuickQuotePreviewModal() {
    if (document.getElementById('quick-quote-preview-modal')) return;

    const modalHtml = `
    <div id="quick-quote-preview-modal" class="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-[6000] flex items-center justify-center p-4 opacity-0 pointer-events-none transition-all duration-300">
        <div id="quick-quote-preview-modal-box" class="bg-white border border-slate-200/90 rounded-3xl p-6 lg:p-7 shadow-2xl max-w-lg w-full transform scale-95 transition-all duration-300 flex flex-col gap-4 max-h-[90vh]">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
                <div class="flex items-center gap-3">
                    <span class="p-2.5 bg-emerald-50 rounded-2xl text-emerald-600 flex items-center justify-center">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </span>
                    <div>
                        <h3 class="font-display font-black text-base text-slate-800 tracking-tight uppercase">Vista Previa para WhatsApp</h3>
                        <p class="text-[11px] text-slate-400 font-medium">Revisa o ajusta el texto antes de enviarlo</p>
                    </div>
                </div>
                <button type="button" onclick="closeQuickQuotePreviewModal()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer" title="Cerrar ventana">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <!-- Preview Box / Textarea -->
            <div class="relative flex flex-col">
                <textarea id="quick-quote-preview-textarea" rows="9"
                    class="w-full bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 text-xs sm:text-sm font-sans text-slate-800 focus:outline-none focus:border-brand-primary leading-relaxed resize-none h-64 selection:bg-emerald-100"
                    placeholder="Generando texto de cotización..."></textarea>
            </div>

            <!-- Footer Actions -->
            <div class="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <button type="button" onclick="closeQuickQuotePreviewModal()"
                    class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer">
                    Cerrar
                </button>
                <div class="flex items-center gap-2">
                    <button type="button" id="btn-modal-copy-quote" onclick="copyTextFromPreviewModal()"
                        class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer flex items-center gap-2">
                        <svg id="icon-modal-copy" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        <span id="btn-modal-copy-text">Copiar Texto</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modalEl = document.getElementById('quick-quote-preview-modal');
    if (modalEl) {
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                closeQuickQuotePreviewModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('pointer-events-none')) {
            closeQuickQuotePreviewModal();
        }
    });
}

/**
 * Abre el popup en el centro de la pantalla con fondo desenfocado.
 *
 * @param {string} mensajeTexto - Texto listo de la cotización
 */
export function openQuickQuotePreviewModal(mensajeTexto) {
    ensureQuickQuotePreviewModal();

    const modal = document.getElementById('quick-quote-preview-modal');
    const box = document.getElementById('quick-quote-preview-modal-box');
    const textarea = document.getElementById('quick-quote-preview-textarea');

    if (textarea) {
        textarea.value = mensajeTexto || '';
    }

    if (modal && box) {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
        box.classList.remove('scale-95');
        box.classList.add('scale-100');

        if (textarea) {
            setTimeout(() => {
                textarea.focus();
                textarea.select();
            }, 50);
        }
    }
}
window.openQuickQuotePreviewModal = openQuickQuotePreviewModal;

/**
 * Cierra el popup de vista previa.
 */
export function closeQuickQuotePreviewModal() {
    const modal = document.getElementById('quick-quote-preview-modal');
    const box = document.getElementById('quick-quote-preview-modal-box');
    if (modal && box) {
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.classList.remove('opacity-100', 'pointer-events-auto');
        box.classList.add('scale-95');
        box.classList.remove('scale-100');
    }
}
window.closeQuickQuotePreviewModal = closeQuickQuotePreviewModal;

/**
 * Copia el contenido del textarea al portapapeles y ofrece feedback.
 */
export async function copyTextFromPreviewModal() {
    const textarea = document.getElementById('quick-quote-preview-textarea');
    const textToCopy = textarea ? textarea.value : '';

    if (!textToCopy) return;

    let copied = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
            copied = true;
        } else if (textarea) {
            textarea.focus();
            textarea.select();
            copied = document.execCommand('copy');
        }
    } catch (err) {
        console.error('Error al copiar desde modal:', err);
    }

    const btn = document.getElementById('btn-modal-copy-quote');
    const btnText = document.getElementById('btn-modal-copy-text');

    if (btn && btnText) {
        const originalText = btnText.innerText;
        btnText.innerText = '¡Copiado! ✓';
        btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        btn.classList.add('bg-emerald-700');

        setTimeout(() => {
            btnText.innerText = originalText;
            btn.classList.remove('bg-emerald-700');
            btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
        }, 2200);
    }

    if (window.showAlert) {
        window.showAlert('success', '¡Cotización copiada en formato WhatsApp!');
    }
}
window.copyTextFromPreviewModal = copyTextFromPreviewModal;

