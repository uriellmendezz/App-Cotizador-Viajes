// cotizar_multidestino.js - Controlador para Cotizaciones Multidestino (Operador AND)

let stopCount = 0;
let currentQuoteId = null;
let currentPdfUrl = null;
let currentPdfBlob = null;
let currentPdfFileName = '';
let selectedBaggage = [];
let isDraggingSidebar = false;
let sidebarWidth = 380;
let isReadOnlyMode = false;

// Format Price Helper
function formatPriceES(num) {
    if (isNaN(num) || num === null || num === undefined) return '0';
    return Number(num).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getDatePickerValue(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (el._flatpickr && el._flatpickr.selectedDates && el._flatpickr.selectedDates.length > 0) {
        const dateObj = el._flatpickr.selectedDates[0];
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    return el.value || "";
}

function getDatePickerValueFromInput(el) {
    if (!el) return "";
    if (el._flatpickr && el._flatpickr.selectedDates && el._flatpickr.selectedDates.length > 0) {
        const d = el._flatpickr.selectedDates[0];
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return el.value || "";
}

function formatDatePickerDate(val) {
    if (!val) return '';
    const parts = val.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
    }
    return val;
}

function formatToPicker(val) {
    if (!val) return '';
    val = String(val).trim();
    if (val.includes('-')) {
        const parts = val.split('-');
        if (parts[0].length === 4) return val;
        if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    if (val.includes('/')) {
        const parts = val.split('/');
        if (parts.length === 3) {
            const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
    }
    return val;
}

function handleCapitalizationBlur(input) {
    if (!input || !input.value) return;
    const val = input.value.trim();
    if (val.length > 0) {
        input.value = val.split(' ').map(w => w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
    }
}
window.handleCapitalizationBlur = handleCapitalizationBlur;

function updateBaseLabel() {
    const pax = parseInt(document.getElementById('cantidad_pasajeros')?.value) || 1;
    let label = 'Base Doble';
    if (pax === 1) label = 'Base Single';
    else if (pax === 2) label = 'Base Doble';
    else if (pax === 3) label = 'Base Triple';
    else if (pax === 4) label = 'Base Cuádruple';
    else label = `Base ${pax} Pax`;

    const basisLabel = document.getElementById('res-basis-label');
    if (basisLabel) basisLabel.innerText = label;
}
window.updateBaseLabel = updateBaseLabel;

// Baggage Handling
function toggleBaggage(type) {
    const idx = selectedBaggage.indexOf(type);
    if (idx > -1) {
        selectedBaggage.splice(idx, 1);
    } else {
        selectedBaggage.push(type);
    }
    updateBaggageUI();
}
window.toggleBaggage = toggleBaggage;

function updateBaggageUI() {
    ['mano', 'carry', 'valija'].forEach(type => {
        const btn = document.getElementById(`btn-bag-${type}`);
        if (!btn) return;
        const checkDot = btn.querySelector('.check-dot');
        const isSelected = selectedBaggage.includes(type);
        if (isSelected) {
            btn.classList.add('border-emerald-500/40', 'bg-emerald-50/20');
            btn.classList.remove('border-slate-200/80', 'bg-white/40');
            if (checkDot) checkDot.classList.remove('hidden');
        } else {
            btn.classList.remove('border-emerald-500/40', 'bg-emerald-50/20');
            btn.classList.add('border-slate-200/80', 'bg-white/40');
            if (checkDot) checkDot.classList.add('hidden');
        }
    });
    const input = document.getElementById('equipaje_seleccionado');
    if (input) input.value = JSON.stringify(selectedBaggage);
}

// Transfer Type Handling
function selectTransferType(type) {
    const input = document.getElementById('tipo_traslado');
    if (input) input.value = type;

    const btnTrad = document.getElementById('btn-traslado-tradicional');
    const btnAuto = document.getElementById('btn-traslado-auto');
    const labelMonto = document.getElementById('label_monto_traslados');

    if (type === 'auto') {
        if (btnAuto) {
            btnAuto.classList.add('border-emerald-500/30', 'bg-emerald-500/5');
            btnAuto.classList.remove('border-slate-200/80', 'bg-white/40');
            btnAuto.querySelector('.check-dot')?.classList.remove('hidden');
        }
        if (btnTrad) {
            btnTrad.classList.remove('border-emerald-500/30', 'bg-emerald-500/5');
            btnTrad.classList.add('border-slate-200/80', 'bg-white/40');
            btnTrad.querySelector('.check-dot')?.classList.add('hidden');
        }
        if (labelMonto) labelMonto.innerText = 'Monto Alquiler de Vehículo';
    } else {
        if (btnTrad) {
            btnTrad.classList.add('border-emerald-500/30', 'bg-emerald-500/5');
            btnTrad.classList.remove('border-slate-200/80', 'bg-white/40');
            btnTrad.querySelector('.check-dot')?.classList.remove('hidden');
        }
        if (btnAuto) {
            btnAuto.classList.remove('border-emerald-500/30', 'bg-emerald-500/5');
            btnAuto.classList.add('border-slate-200/80', 'bg-white/40');
            btnAuto.querySelector('.check-dot')?.classList.add('hidden');
        }
        if (labelMonto) labelMonto.innerText = 'Monto Traslados In/Out';
    }
}
window.selectTransferType = selectTransferType;

// Flight Tramo 2 Toggle
function toggleExtraFlightSegment() {
    const card = document.getElementById('card-vuelo-3');
    const container = document.getElementById('flight-segments-container');
    const btn = document.getElementById('btn-toggle-flight-segment');
    if (!card || !container) return;

    const isHidden = card.classList.contains('hidden');
    if (isHidden) {
        card.classList.remove('hidden');
        container.classList.remove('md:grid-cols-2');
        container.classList.add('md:grid-cols-3');
        if (btn) {
            btn.innerText = '− Quitar Tramo';
            btn.classList.add('bg-rose-50', 'text-rose-600');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
        }
    } else {
        card.classList.add('hidden');
        container.classList.remove('md:grid-cols-3');
        container.classList.add('md:grid-cols-2');
        if (btn) {
            btn.innerText = '+ Agregar Tramo';
            btn.classList.remove('bg-rose-50', 'text-rose-600');
            btn.classList.add('bg-slate-100', 'text-slate-600');
        }
        const f3 = document.getElementById('fecha_vuelo_3');
        if (f3 && f3._flatpickr) f3._flatpickr.clear();
        const d3 = document.getElementById('data-vuelo-3');
        if (d3) d3.value = '';
        const prev3 = document.getElementById('preview-vuelo-3');
        if (prev3) { prev3.src = ''; prev3.style.display = 'none'; }
    }
    updateRealTimeSummary();
}
window.toggleExtraFlightSegment = toggleExtraFlightSegment;

// Fee Type Handling
function toggleFeeType() {
    const feeType = document.getElementById('fee_aereo_tipo')?.value;
    const feeInput = document.getElementById('fee_aereo_monto');
    if (!feeInput) return;
    if (feeType === 'auto') {
        feeInput.readOnly = true;
        feeInput.classList.add('bg-slate-100', 'text-slate-500');
        calculateAutoFee();
    } else {
        feeInput.readOnly = false;
        feeInput.classList.remove('bg-slate-100', 'text-slate-500');
    }
}
window.toggleFeeType = toggleFeeType;

function calculateAutoFee() {
    const feeType = document.getElementById('fee_aereo_tipo')?.value;
    if (feeType !== 'auto') return;
    const flightsCost = parseFloat(document.getElementById('monto_vuelos')?.value) || 0;
    const feeInput = document.getElementById('fee_aereo_monto');
    if (feeInput) {
        const fee = Math.round(flightsCost * 0.10 * 100) / 100;
        feeInput.value = fee > 0 ? fee.toFixed(2) : '';
    }
}
window.calculateAutoFee = calculateAutoFee;

function validateDates() {
    const salidaVal = getDatePickerValue('fecha_vuelo_ida');
    const regresoVal = getDatePickerValue('fecha_vuelo_vuelta');
    if (salidaVal && regresoVal) {
        if (regresoVal < salidaVal) {
            window.showAlert ? window.showAlert('warning', 'La fecha de regreso no puede ser anterior a la de salida.') : alert('La fecha de regreso no puede ser anterior a la de salida.');
            return false;
        }
    }
    return true;
}
window.validateDates = validateDates;

// File Upload & Dropzone Helpers
function triggerFileInput(id) {
    const input = document.getElementById(id);
    if (input) input.click();
}
window.triggerFileInput = triggerFileInput;

function handleImageUpload(input, previewId, dataId) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64 = e.target.result;
        const dataInput = document.getElementById(dataId);
        if (dataInput) dataInput.value = base64;
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = base64;
            preview.style.display = 'block';
        }
        const dz = input.closest('.dropzone');
        if (dz) {
            const span = dz.querySelector('span');
            const svg = dz.querySelector('svg');
            if (span) span.style.display = 'none';
            if (svg) svg.style.display = 'none';
        }
    };
    reader.readAsDataURL(file);
}
window.handleImageUpload = handleImageUpload;

// Night counter for each stop
function updateStopNights(card) {
    if (!card) return 0;
    const checkinInput = card.querySelector('.hotel-checkin-val');
    const checkoutInput = card.querySelector('.hotel-checkout-val');
    const badge = card.querySelector('.hotel-noches-badge');

    const ciVal = getDatePickerValueFromInput(checkinInput);
    const coVal = getDatePickerValueFromInput(checkoutInput);

    let nights = 0;
    if (ciVal && coVal) {
        const d1 = new Date(ciVal + 'T00:00:00');
        const d2 = new Date(coVal + 'T00:00:00');
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff > 0) nights = diff;
    }

    if (badge) {
        if (nights > 0) {
            badge.innerText = nights === 1 ? '1 noche' : `${nights} noches`;
            badge.classList.remove('hidden');
        } else {
            badge.innerText = '';
            badge.classList.add('hidden');
        }
    }
    return nights;
}

// Room Custom Option Toggle
function toggleHabitacionCustom(selectEl) {
    const card = selectEl.closest('.hotel-stop-card');
    if (!card) return;
    const customInput = card.querySelector('.hotel-habitacion-custom');
    if (!customInput) return;
    if (selectEl.value === 'Personalizado') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
}
window.toggleHabitacionCustom = toggleHabitacionCustom;

function getHabitacionValueFromCard(card) {
    const select = card.querySelector('.hotel-habitacion-select');
    if (!select) return 'Habitación Estándar';
    if (select.value === 'Personalizado') {
        const custom = card.querySelector('.hotel-habitacion-custom');
        return custom && custom.value.trim() ? custom.value.trim() : 'Habitación Estándar';
    }
    return `Habitación ${select.value}`;
}

// Multi-destination Hotel Stop Addition (Operator AND)
function addHotelStop(data = null) {
    const container = document.getElementById('hotels-container');
    if (!container) return;

    const currentCards = container.querySelectorAll('.hotel-stop-card');
    if (currentCards.length >= 5) {
        window.showAlert ? window.showAlert('warning', 'Máximo 5 paradas permitidas en el itinerario multidestino.') : alert('Máximo 5 paradas permitidas.');
        return;
    }

    stopCount++;
    const cardId = `stop-card-${stopCount}`;
    const stopNumber = currentCards.length + 1;

    const card = document.createElement('div');
    card.className = 'hotel-stop-card bg-slate-50/70 border border-slate-200 rounded-2xl p-6 relative flex flex-col justify-center gap-4 transition-all duration-300 hover:bg-slate-50 shadow-sm';
    card.id = cardId;

    const destinoVal = data ? (data.destino || data.ciudad || '') : '';
    const hotelNombreVal = data ? (data.nombre || data.hotel_nombre || '') : '';
    const starsVal = data ? (data.estrellas || '★★★★☆') : '★★★★☆';
    const regimenVal = data ? (data.regimen || 'Desayuno incluido') : 'Desayuno incluido';
    const standardRegimens = ["All Inclusive", "Desayuno incluido", "Solo alojamiento", "Media Pensión", "Desayuno y Cena incluidos"];
    let isRegimenMapped = false;
    let regimenOptionsHtml = "";
    standardRegimens.forEach(opt => {
        const isSelected = regimenVal.toLowerCase().trim() === opt.toLowerCase().trim();
        if (isSelected) isRegimenMapped = true;
        regimenOptionsHtml += `<option value="${opt}" ${isSelected ? 'selected' : ''}>${opt}</option>`;
    });
    if (!isRegimenMapped && regimenVal) {
        regimenOptionsHtml += `<option value="${regimenVal}" selected>${regimenVal}</option>`;
    }

    let rawHabitacion = data ? (data.habitacion || '') : '';
    const standardHabitaciones = ["Estándar", "Suite", "Vista Mar", "Superior", "Deluxe"];
    let selectedHabOption = "Estándar";
    let customHabVal = "";
    if (rawHabitacion) {
        let clean = rawHabitacion.replace(/^habitaci[oó]n\s+/i, '').trim();
        const matched = standardHabitaciones.find(o => o.toLowerCase() === clean.toLowerCase() || o.toLowerCase() === rawHabitacion.toLowerCase().trim());
        if (matched) selectedHabOption = matched;
        else {
            selectedHabOption = "Personalizado";
            customHabVal = rawHabitacion;
        }
    }
    let habitacionOptionsHtml = "";
    standardHabitaciones.forEach(opt => {
        habitacionOptionsHtml += `<option value="${opt}" ${selectedHabOption === opt ? 'selected' : ''}>Habitación ${opt}</option>`;
    });
    habitacionOptionsHtml += `<option value="Personalizado" ${selectedHabOption === 'Personalizado' ? 'selected' : ''}>Personalizado / Otro</option>`;

    let costVal = data ? (data.costo_neto !== undefined ? data.costo_neto : (data.costo || '')) : '';
    let checkinVal = data ? (data.fecha_checkin || '') : '';
    let checkoutVal = data ? (data.fecha_checkout || '') : '';

    const currency = document.getElementById('moneda_seleccionada')?.value || 'USD';

    card.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div class="flex items-center gap-2">
                <span class="stop-badge px-2.5 py-1 bg-brand-primary text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm">Parada #${stopNumber}</span>
                <span class="text-xs font-bold text-slate-500">Parada del Itinerario</span>
            </div>
            <button type="button" class="remove-stop-btn text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all cursor-pointer ${currentCards.length === 0 ? 'hidden' : ''}" onclick="removeHotelStop('${cardId}')">
                Eliminar Parada
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mt-2">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <span>Destino / Ciudad de la Parada</span>
                    <span class="text-brand-primary font-black">*</span>
                </label>
                <input type="text" class="hotel-destino-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Madrid" value="${destinoVal}" oninput="updateRealTimeSummary()" onblur="handleCapitalizationBlur(this)">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Hotel</label>
                <input type="text" class="hotel-nombre-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Hotel Regina" value="${hotelNombreVal}" oninput="updateRealTimeSummary()" onblur="handleCapitalizationBlur(this)">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Categoría</label>
                <select class="hotel-estrellas-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white">
                    <option value="★★★★★" ${starsVal.includes('5') ? 'selected' : ''}>5 Estrellas (★★★★★)</option>
                    <option value="★★★★☆" ${starsVal.includes('4') ? 'selected' : ''}>4 Estrellas (★★★★☆)</option>
                    <option value="★★★☆☆" ${starsVal.includes('3') ? 'selected' : ''}>3 Estrellas (★★★☆☆)</option>
                    <option value="★★☆☆☆" ${starsVal.includes('2') ? 'selected' : ''}>2 Estrellas (★★☆☆☆)</option>
                </select>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Régimen</label>
                <select class="hotel-regimen-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white">
                    ${regimenOptionsHtml}
                </select>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Check-in</label>
                <input type="date" class="hotel-checkin-val w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" placeholder="dd/mm/aa" value="${checkinVal}">
            </div>
            <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha Check-out</label>
                    <span class="hotel-noches-badge text-[10px] font-extrabold text-brand-primary uppercase tracking-wider"></span>
                </div>
                <input type="date" class="hotel-checkout-val w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" placeholder="dd/mm/aa" value="${checkoutVal}">
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Habitación</label>
                <div class="flex flex-col gap-2">
                    <select class="hotel-habitacion-select border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" onchange="toggleHabitacionCustom(this)">
                        ${habitacionOptionsHtml}
                    </select>
                    <input type="text" class="hotel-habitacion-custom border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white ${selectedHabOption === 'Personalizado' ? '' : 'hidden'}" placeholder="Ej. Apartamento Doble" value="${customHabVal}" oninput="updateRealTimeSummary()" onblur="handleCapitalizationBlur(this)">
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Costo Neto de esta Parada</label>
                <div class="relative flex items-center">
                    <span class="absolute left-3 text-xs font-bold text-slate-400 pointer-events-none currency-label">${currency}</span>
                    <input type="number" class="hotel-costo-val w-full border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 text-sm font-semibold text-right focus:outline-none focus:border-brand-primary transition-all bg-white" min="0" step="0.01" required value="${costVal}" placeholder="0.00" oninput="updateRealTimeSummary()">
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-1 w-full">
            <div class="flex items-center justify-between">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción del Alojamiento</label>
                <span class="hotel-desc-counter text-[10px] font-semibold text-slate-400">0/200</span>
            </div>
            <textarea class="hotel-descripcion-val border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-brand-primary transition-all bg-white h-[75px] resize-y w-full" placeholder="Breve reseña del hotel, ubicación y comodidades..." oninput="updateStopDescCounter(this)">${data ? (data.descripcion || '') : ''}</textarea>
        </div>

        <div class="flex flex-col gap-2 w-full">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Imagen del Hotel / Destino</label>
            <div class="dropzone relative overflow-hidden border-2 border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-4 bg-white flex flex-col items-center justify-center min-h-[110px] cursor-pointer transition-all duration-300 group w-full" id="dropzone-${cardId}" tabindex="0" onclick="triggerFileInput('file-${cardId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6 text-slate-400 group-hover:text-brand-primary mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <span class="text-xs text-slate-500 font-semibold text-center leading-tight">Seleccionar imagen<br><span class="text-[10px] text-brand-primary/80 font-bold">Ctrl+V para pegar</span></span>
                <input type="file" id="file-${cardId}" accept="image/*" class="hidden" onchange="handleImageUpload(this, 'preview-${cardId}', 'data-${cardId}')">
                <img id="preview-${cardId}" class="dropzone-preview absolute inset-0 w-full h-full object-cover rounded-xl" style="display: none;" alt="">
                <input type="hidden" id="data-${cardId}" class="hotel-imagen-val">
            </div>
        </div>
    `;

    container.appendChild(card);
    updateStopNumbersAndRemoveButtons();

    // Flatpickr on stop check-in and check-out
    const checkinInput = card.querySelector('.hotel-checkin-val');
    const checkoutInput = card.querySelector('.hotel-checkout-val');
    if (checkinInput && checkoutInput && typeof flatpickr !== 'undefined') {
        flatpickr(checkinInput, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/y",
            disableMobile: "true",
            static: true,
            defaultDate: checkinVal ? formatToPicker(checkinVal) : null,
            onOpen: function (selectedDates, dateStr, instance) {
                if (!instance.selectedDates.length && instance.config.minDate) {
                    instance.jumpToDate(instance.config.minDate);
                }
            },
            onChange: function (selectedDates) {
                syncStopDateRestrictions();
                updateStopNights(card);
                updateRealTimeSummary();
            }
        });

        flatpickr(checkoutInput, {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d/m/y",
            disableMobile: "true",
            static: true,
            defaultDate: checkoutVal ? formatToPicker(checkoutVal) : null,
            onOpen: function (selectedDates, dateStr, instance) {
                if (!instance.selectedDates.length && instance.config.minDate) {
                    instance.jumpToDate(instance.config.minDate);
                }
            },
            onChange: function () {
                syncStopDateRestrictions();
                updateStopNights(card);
                updateRealTimeSummary();
            }
        });
    }

    const descInput = card.querySelector('.hotel-descripcion-val');
    if (descInput) updateStopDescCounter(descInput);

    syncStopDateRestrictions();
    updateRealTimeSummary();
}
window.addHotelStop = addHotelStop;

function removeHotelStop(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.remove();
    updateStopNumbersAndRemoveButtons();
    syncStopDateRestrictions();
    updateRealTimeSummary();
}
window.removeHotelStop = removeHotelStop;

// Sequential Stop Date Restrictions (Stop N check-in >= Stop N-1 check-out)
function syncStopDateRestrictions() {
    const cards = Array.from(document.querySelectorAll('.hotel-stop-card'));
    if (cards.length === 0) return;

    const flightSalidaStr = getDatePickerValue('fecha_vuelo_ida');
    let baselineDate = flightSalidaStr ? new Date(flightSalidaStr + 'T00:00:00') : null;

    cards.forEach((card, idx) => {
        const checkinInput = card.querySelector('.hotel-checkin-val');
        const checkoutInput = card.querySelector('.hotel-checkout-val');
        const fpCheckin = checkinInput ? checkinInput._flatpickr : null;
        const fpCheckout = checkoutInput ? checkoutInput._flatpickr : null;

        // Restriction on check-in:
        if (fpCheckin) {
            if (idx === 0) {
                // First stop: minimum is flight departure if provided
                if (baselineDate) {
                    fpCheckin.set('minDate', baselineDate);
                } else {
                    fpCheckin.set('minDate', null);
                }
            } else {
                // Subsequent stops: CANNOT be earlier than previous stop!
                if (baselineDate) {
                    fpCheckin.set('minDate', baselineDate);
                    if (fpCheckin.selectedDates.length > 0 && fpCheckin.selectedDates[0] < baselineDate) {
                        fpCheckin.clear();
                        if (fpCheckout) fpCheckout.clear();
                    }
                } else {
                    fpCheckin.set('minDate', null);
                }
            }
        }

        const thisCheckin = (fpCheckin && fpCheckin.selectedDates.length > 0) ? fpCheckin.selectedDates[0] : null;

        // Restriction on checkout:
        if (fpCheckout) {
            const minCoDate = thisCheckin || baselineDate;
            if (minCoDate) {
                fpCheckout.set('minDate', minCoDate);
                if (fpCheckout.selectedDates.length > 0 && fpCheckout.selectedDates[0] < minCoDate) {
                    fpCheckout.clear();
                }
            } else {
                fpCheckout.set('minDate', null);
            }
        }

        // Update baselineDate for the next stop: prioritize checkout date, fallback to checkin
        const thisCheckout = (fpCheckout && fpCheckout.selectedDates.length > 0) ? fpCheckout.selectedDates[0] : null;
        if (thisCheckout) {
            baselineDate = thisCheckout;
        } else if (thisCheckin) {
            baselineDate = thisCheckin;
        }

        updateStopNights(card);
    });
}
window.syncStopDateRestrictions = syncStopDateRestrictions;

function updateStopNumbersAndRemoveButtons() {
    const cards = Array.from(document.querySelectorAll('.hotel-stop-card'));
    cards.forEach((c, idx) => {
        const badge = c.querySelector('.stop-badge');
        if (badge) badge.innerText = `Parada #${idx + 1}`;
        const removeBtn = c.querySelector('.remove-stop-btn');
        if (removeBtn) {
            if (cards.length > 1) removeBtn.classList.remove('hidden');
            else removeBtn.classList.add('hidden');
        }
    });
}

function updateStopDescCounter(textarea) {
    const len = textarea.value.length;
    const card = textarea.closest('.hotel-stop-card');
    if (!card) return;
    const counter = card.querySelector('.hotel-desc-counter');
    if (counter) {
        counter.innerText = `${len}/200`;
        if (len > 200) {
            counter.classList.add('text-rose-600', 'font-bold');
            counter.classList.remove('text-slate-400');
        } else {
            counter.classList.remove('text-rose-600', 'font-bold');
            counter.classList.add('text-slate-400');
        }
    }
}
window.updateStopDescCounter = updateStopDescCounter;

// Real-time Summary centered on AND operator
function updateRealTimeSummary() {
    const currency = document.getElementById('moneda_seleccionada')?.value || 'USD';
    const cantPax = parseInt(document.getElementById('cantidad_pasajeros')?.value) || 1;
    const flightsCost = parseFloat(document.getElementById('monto_vuelos')?.value) || 0;
    const flightsFee = parseFloat(document.getElementById('fee_aereo_monto')?.value) || 0;
    const transfersCost = parseFloat(document.getElementById('monto_traslados')?.value) || 0;
    const aplicarRedondeo = document.getElementById('aplicar_redondeo') ? document.getElementById('aplicar_redondeo').checked : true;

    // Update currency labels throughout the form
    document.querySelectorAll('.currency-label').forEach(el => el.innerText = currency);

    const container = document.getElementById('realtime-breakdown-container');
    if (!container) return;

    const cards = Array.from(document.querySelectorAll('.hotel-stop-card'));
    if (cards.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 text-xs font-semibold">
                No hay paradas agregadas aún.
            </div>
        `;
        return;
    }

    const hotelList = cards.map((card, idx) => {
        const dest = card.querySelector('.hotel-destino-val')?.value.trim() || `Parada ${idx + 1}`;
        const name = card.querySelector('.hotel-nombre-val')?.value.trim() || `Hotel ${idx + 1}`;
        const cost = parseFloat(card.querySelector('.hotel-costo-val')?.value) || 0;
        const nights = updateStopNights(card);
        return {
            hotelName: name,
            destino: dest,
            noches: nights,
            hotelCost: cost
        };
    });

    if (window.renderMultidestinoSummaryHTML) {
        window.renderMultidestinoSummaryHTML({
            currency,
            cantPax,
            flightsCost,
            flightsFee,
            transfersCost,
            aplicarRedondeo,
            hotelList
        }, container);
    }
}
window.updateRealTimeSummary = updateRealTimeSummary;

function _buildPayload() {
    const imgIda = document.getElementById('data-vuelo-ida')?.value || '';
    const imgVuelta = document.getElementById('data-vuelo-vuelta')?.value || '';
    const cardVuelo3 = document.getElementById('card-vuelo-3');
    const isVuelo3Active = cardVuelo3 && !cardVuelo3.classList.contains('hidden');
    const fechaVuelo3 = isVuelo3Active ? formatDatePickerDate(getDatePickerValue('fecha_vuelo_3')) : '';
    const imgVuelo3 = isVuelo3Active ? (document.getElementById('data-vuelo-3')?.value || '') : '';
    const aplicarRedondeo = document.getElementById('aplicar_redondeo') ? document.getElementById('aplicar_redondeo').checked : true;
    const monedaVal = document.getElementById('moneda_seleccionada')?.value || 'USD';

    const payload = {
        tipo_cotizacion: "multidestino",
        nombre_pax: document.getElementById('nombre_pax')?.value || '',
        destino: document.getElementById('destino')?.value || '',
        cantidad_pasajeros: parseInt(document.getElementById('cantidad_pasajeros')?.value) || 1,
        fecha_salida: formatDatePickerDate(getDatePickerValue('fecha_vuelo_ida')),
        origen: document.getElementById('origen')?.value || '',
        agente_nombre: window.loggedInUser || '',
        fecha_vuelo_ida: formatDatePickerDate(getDatePickerValue('fecha_vuelo_ida')),
        fecha_vuelo_vuelta: formatDatePickerDate(getDatePickerValue('fecha_vuelo_vuelta')),
        fecha_vuelo_3: fechaVuelo3,
        validez_cotizacion: formatDatePickerDate(getDatePickerValue('validez_cotizacion')),
        img_vuelo_ida: imgIda,
        img_vuelo_vuelta: imgVuelta,
        img_vuelo_3: imgVuelo3,
        monto_vuelos: parseFloat(document.getElementById('monto_vuelos')?.value) || 0,
        fee_aereo: parseFloat(document.getElementById('fee_aereo_monto')?.value) || 0,
        monto_traslados: parseFloat(document.getElementById('monto_traslados')?.value) || 0,
        tipo_traslado: document.getElementById('tipo_traslado')?.value || 'tradicional',
        gastos_iva: 0.0,
        equipaje: selectedBaggage,
        redondear: aplicarRedondeo,
        hoteles: []
    };

    if (currentQuoteId) {
        payload.id = currentQuoteId;
    }

    const cards = Array.from(document.querySelectorAll('.hotel-stop-card'));
    let totalNoches = 0;
    const nochesDetalleList = [];

    cards.forEach((card, idx) => {
        const checkinEl = card.querySelector('.hotel-checkin-val');
        const checkoutEl = card.querySelector('.hotel-checkout-val');
        const fechaCheckin = formatDatePickerDate(getDatePickerValueFromInput(checkinEl));
        const fechaCheckout = formatDatePickerDate(getDatePickerValueFromInput(checkoutEl));
        const nochesCount = updateStopNights(card);
        const nochesAlojamiento = nochesCount > 0 ? (nochesCount === 1 ? "1 noche" : `${nochesCount} noches`) : "";

        const destinoStop = card.querySelector('.hotel-destino-val')?.value.trim() || `Parada ${idx + 1}`;
        const hotelCostVal = parseFloat(card.querySelector('.hotel-costo-val')?.value) || 0;

        if (nochesCount > 0) {
            totalNoches += nochesCount;
            nochesDetalleList.push(`${destinoStop}: ${nochesCount} nts`);
        }

        payload.hoteles.push({
            destino: destinoStop,
            nombre: card.querySelector('.hotel-nombre-val')?.value.trim() || `Hotel Parada ${idx + 1}`,
            estrellas: card.querySelector('.hotel-estrellas-val')?.value || '★★★★☆',
            regimen: card.querySelector('.hotel-regimen-val')?.value || 'Desayuno incluido',
            habitacion: getHabitacionValueFromCard(card),
            fecha_checkin: fechaCheckin,
            fecha_checkout: fechaCheckout,
            noches: nochesCount,
            noches_alojamiento: nochesAlojamiento,
            costo_neto: hotelCostVal,
            costo: hotelCostVal,
            descripcion: card.querySelector('.hotel-descripcion-val')?.value || '',
            imagen1: card.querySelector('.hotel-imagen-val')?.value || '',
            imagen2: "",
            imagen3: "",
            redondear: aplicarRedondeo
        });
    });

    if (totalNoches > 0) {
        payload.noches_alojamiento = `${totalNoches} noches en total (${nochesDetalleList.join(', ')})`;
    }

    // Metadata record
    payload.hoteles.push({
        nombre: "METADATA_COTIZACION",
        tipo_cotizacion: "multidestino",
        moneda: monedaVal,
        fecha_vuelo_3: fechaVuelo3,
        img_vuelo_3: imgVuelo3,
        redondear: aplicarRedondeo
    });

    return payload;
}

// Generate PDF & Submit
async function generatePDFPreview(e, isViewingSavedQuote = false) {
    if (e) e.preventDefault();
    if (!validateDates()) return;

    const imgIda = document.getElementById('data-vuelo-ida')?.value;
    const imgVuelta = document.getElementById('data-vuelo-vuelta')?.value;
    if (!imgIda || !imgVuelta) {
        window.showAlert ? window.showAlert('warning', 'Debe adjuntar una captura obligatoria para el Vuelo de Salida y de Regreso.') : alert('Faltan fotos de vuelos.');
        return;
    }

    // Check stops
    const cards = document.querySelectorAll('.hotel-stop-card');
    if (cards.length === 0) {
        window.showAlert ? window.showAlert('warning', 'Debe agregar al menos una parada de hotel en el itinerario.') : alert('Falta agregar hotel.');
        return;
    }

    for (const card of cards) {
        const dest = card.querySelector('.hotel-destino-val');
        if (!dest || !dest.value.trim()) {
            dest?.focus();
            window.showAlert ? window.showAlert('warning', 'Ingrese el destino / ciudad para cada parada del itinerario.') : alert('Falta destino en parada.');
            return;
        }
        const descInput = card.querySelector('.hotel-descripcion-val');
        if (descInput && descInput.value.length > 200) {
            descInput.focus();
            window.showAlert ? window.showAlert('warning', 'Superaste el máximo de 200 caracteres en la descripción de una parada.') : alert('Descripción muy larga.');
            return;
        }
    }

    const paxNameForLoading = document.getElementById('nombre_pax')?.value || 'Pasajero';

    const formTab = document.getElementById('cotizacion-tab');
    if (formTab) formTab.classList.add('hidden');

    window.changeFavicon ? window.changeFavicon('loading') : null;
    window.showLoader ? window.showLoader(`Creando cotización multidestino para ${paxNameForLoading}...`) : null;

    const payload = _buildPayload();

    try {
        if (!isReadOnlyMode) {
            window.showLoader ? window.showLoader(`Guardando itinerario en la base de datos...`) : null;
            const saveRes = await window.authenticatedFetch('/api/cotizaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (saveRes.ok) {
                const savedQuote = await saveRes.json();
                currentQuoteId = savedQuote.id;
                payload.id = currentQuoteId;
                console.log("Auto-save multidestino completed successfully. ID:", currentQuoteId);
            }
        }

        window.showLoader ? window.showLoader(`Generando PDF para ${paxNameForLoading}...`) : null;

        const res = await window.authenticatedFetch('/api/cotizar-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al generar el PDF multidestino');
        }

        const blob = await res.blob();
        currentPdfBlob = blob;

        window.hideLoader ? window.hideLoader() : null;
        window.changeFavicon ? window.changeFavicon('success') : null;

        const url = window.URL.createObjectURL(blob);
        currentPdfUrl = url;
        const iframe = document.getElementById('pdf-preview-iframe');
        if (iframe) iframe.src = url + '#navpanes=0&zoom=67';

        const paxName = (document.getElementById('nombre_pax')?.value || 'Pasajero').replace(/[\/\\]/g, '-');
        const destName = (document.getElementById('destino')?.value || 'Multidestino').replace(/[\/\\]/g, '-');
        currentPdfFileName = `Cotización Multidestino - ${paxName} - ${destName}.pdf`;

        window.lastGeneratedPdfUrl = url;
        window.lastGeneratedQuote = {
            id: currentQuoteId,
            tipo_cotizacion: "multidestino",
            nombre_pax: payload.nombre_pax,
            destino: payload.destino,
            agente_nombre: payload.agente_nombre || window.loggedInUser,
            redondear: payload.redondear,
            hoteles: payload.hoteles
        };
        window.currentPdfBlob = blob;
        window.currentPdfUrl = url;
        window.currentPdfFileName = currentPdfFileName;

        navigateTo('/ver-cotizacion?id=' + currentQuoteId);
    } catch (err) {
        window.hideLoader ? window.hideLoader() : null;
        window.changeFavicon ? window.changeFavicon('error') : null;
        if (formTab) formTab.classList.remove('hidden');
        window.showAlert ? window.showAlert('warning', 'Error al generar cotización multidestino: ' + err.message) : alert(err.message);
    }
}
window.generatePDFPreview = generatePDFPreview;

function downloadPDFBlob() {
    const blob = window.currentPdfBlob || currentPdfBlob;
    const filename = window.currentPdfFileName || currentPdfFileName || 'Cotizacion_Multidestino.pdf';
    if (!blob) {
        window.showAlert ? window.showAlert('warning', 'No hay ningún PDF generado para descargar.') : alert('No hay PDF');
        return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    window.showAlert ? window.showAlert('success', '✔ PDF descargado con éxito.') : null;
}
window.downloadPDFBlob = downloadPDFBlob;

function openPDFInNewTab() {
    const url = window.currentPdfUrl || currentPdfUrl;
    if (url) {
        const targetUrl = url.includes('#') ? url : url + '#navpanes=0&zoom=67';
        window.open(targetUrl, '_blank');
    } else {
        window.showAlert ? window.showAlert('warning', 'No hay ningún PDF generado para abrir.') : null;
    }
}
window.openPDFInNewTab = openPDFInNewTab;

function scrollToPreview() {
    const resultsPanel = document.getElementById('results-panel');
    if (resultsPanel) resultsPanel.scrollIntoView({ behavior: 'smooth' });
}
window.scrollToPreview = scrollToPreview;

function toggleRealTimeBreakdown() {
    const cardContent = document.getElementById('realtime-card-content');
    const icon = document.getElementById('sidebar-arrow-icon');
    if (!cardContent) return;
    const isHidden = cardContent.classList.contains('hidden');
    if (isHidden) {
        cardContent.classList.remove('hidden');
        if (icon) icon.classList.remove('rotate-180');
    } else {
        cardContent.classList.add('hidden');
        if (icon) icon.classList.add('rotate-180');
    }
}
window.toggleRealTimeBreakdown = toggleRealTimeBreakdown;

// Module Export: Init
export function initCotizarMultidestino() {
    if (typeof flatpickr !== "undefined" && flatpickr.l10ns && flatpickr.l10ns.es) {
        flatpickr.localize(flatpickr.l10ns.es);
    }

    flatpickr("#fecha_vuelo_ida", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/y",
        disableMobile: "true",
        static: true,
        onChange: function (selectedDates) {
            const extraPicker = document.getElementById("fecha_vuelo_3")?._flatpickr;
            const returnPicker = document.getElementById("fecha_vuelo_vuelta")?._flatpickr;
            if (selectedDates[0]) {
                if (extraPicker) extraPicker.set("minDate", selectedDates[0]);
                if (returnPicker) returnPicker.set("minDate", selectedDates[0]);
            }
            validateDates();
            syncStopDateRestrictions();
            updateRealTimeSummary();
        }
    });

    flatpickr("#fecha_vuelo_3", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/y",
        disableMobile: "true",
        static: true,
        onChange: function (selectedDates) {
            const returnPicker = document.getElementById("fecha_vuelo_vuelta")?._flatpickr;
            if (returnPicker && selectedDates[0]) {
                returnPicker.set("minDate", selectedDates[0]);
            }
            validateDates();
            updateRealTimeSummary();
        }
    });

    flatpickr("#fecha_vuelo_vuelta", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/y",
        disableMobile: "true",
        static: true,
        onChange: function () {
            validateDates();
            updateRealTimeSummary();
        }
    });

    flatpickr("#validez_cotizacion", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/y",
        disableMobile: "true",
        static: true
    });

    toggleFeeType();

    const inputs = ["monto_vuelos", "fee_aereo_monto", "monto_traslados", "cantidad_pasajeros", "nombre_pax", "destino"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateRealTimeSummary);
    });

    const hotelsContainer = document.getElementById("hotels-container");
    if (hotelsContainer && hotelsContainer.children.length === 0) {
        // Add 2 initial stops for multidestino by default!
        addHotelStop();
        addHotelStop();
    }

    updateRealTimeSummary();
}
