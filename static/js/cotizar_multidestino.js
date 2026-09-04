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

let hoveredDropzone = null;

function setupDragAndDrop() {
    document.querySelectorAll('.dropzone').forEach(dz => {
        setupSingleDropzone(dz);
    });
}
window.setupDragAndDrop = setupDragAndDrop;

function setupSingleDropzone(dz) {
    if (!dz || dz._hasDropzoneListeners) return;
    dz._hasDropzoneListeners = true;

    dz.addEventListener('mouseenter', () => {
        hoveredDropzone = dz;
        dz.classList.add('border-brand-primary', 'bg-brand-primary/5');
    });

    dz.addEventListener('mouseleave', () => {
        if (hoveredDropzone === dz) {
            hoveredDropzone = null;
        }
        dz.classList.remove('border-brand-primary', 'bg-brand-primary/5');
    });

    dz.addEventListener('focus', () => {
        hoveredDropzone = dz;
        dz.classList.add('border-brand-primary', 'bg-brand-primary/5');
    });

    dz.addEventListener('blur', () => {
        if (hoveredDropzone === dz) {
            hoveredDropzone = null;
        }
        dz.classList.remove('border-brand-primary', 'bg-brand-primary/5');
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dz.addEventListener(eventName, e => {
            e.preventDefault();
            dz.classList.add('border-brand-primary', 'bg-brand-primary/5');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dz.addEventListener(eventName, e => {
            e.preventDefault();
            dz.classList.remove('border-brand-primary', 'bg-brand-primary/5');
        }, false);
    });

    dz.addEventListener('drop', e => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        const fileInput = dz.querySelector('input[type="file"]');

        if (files && files.length > 0 && fileInput) {
            fileInput.files = files;
            fileInput.dispatchEvent(new Event('change'));
        }
    }, false);

    // Keyboard accessibility
    dz.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dz.click();
        }
    });
}
window.setupSingleDropzone = setupSingleDropzone;

// Global paste listener on document for clipboard images
if (!window._multidestinoPasteListenerAttached) {
    document.addEventListener('paste', e => {
        let targetDropzone = hoveredDropzone;
        if (!targetDropzone && document.activeElement) {
            targetDropzone = document.activeElement.closest ? document.activeElement.closest('.dropzone') : null;
        }

        if (targetDropzone) {
            let imageFile = null;
            if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
                for (let i = 0; i < e.clipboardData.files.length; i++) {
                    if (e.clipboardData.files[i].type && e.clipboardData.files[i].type.startsWith('image/')) {
                        imageFile = e.clipboardData.files[i];
                        break;
                    }
                }
            }
            if (!imageFile && e.clipboardData && e.clipboardData.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    if (e.clipboardData.items[i].type && e.clipboardData.items[i].type.indexOf('image') !== -1) {
                        imageFile = e.clipboardData.items[i].getAsFile();
                        break;
                    }
                }
            }

            if (imageFile) {
                e.preventDefault();
                const fileInput = targetDropzone.querySelector('input[type="file"]');
                if (fileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(imageFile);
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            }
        }
    });
    window._multidestinoPasteListenerAttached = true;
}

// Client-side image resizing and compression (matches standard quote)
function handleImageUpload(input, previewId, dataId) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const max_width = 800;
            const max_height = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > max_width) {
                    height *= max_width / width;
                    width = max_width;
                }
            } else {
                if (height > max_height) {
                    width *= max_height / height;
                    height = max_height;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            const isPng = file.type === 'image/png' || (file.name && file.name.toLowerCase().endsWith('.png'));
            const mimeType = isPng ? 'image/png' : 'image/jpeg';

            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL(mimeType, isPng ? 0.85 : 0.75);

            const preview = document.getElementById(previewId);
            if (preview) {
                preview.src = dataUrl;
                preview.style.display = 'block';
            }

            const dataInput = document.getElementById(dataId);
            if (dataInput) {
                dataInput.value = dataUrl;
            }

            const dz = input.closest('.dropzone');
            if (dz) {
                const span = dz.querySelector('span');
                const svg = dz.querySelector('svg');
                if (span) span.style.display = 'none';
                if (svg) svg.style.display = 'none';
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}
window.handleImageUpload = handleImageUpload;

// AI Description Optimizer Functions
async function optimizeDescription(btn) {
    const relativeContainer = btn.closest('.relative') || btn.parentElement;
    const textarea = relativeContainer ? relativeContainer.querySelector('.hotel-descripcion-val') : null;
    if (!textarea) {
        window.showAlert ? window.showAlert('warning', 'No se encontró el campo de descripción.') : alert("No se encontró el campo de descripción.");
        return;
    }
    const originalText = textarea.value.trim();
    if (!originalText) {
        window.showAlert ? window.showAlert('warning', 'Por favor, escribe una descripción básica primero para que la IA la optimice.') : alert("Por favor, escribe una descripción básica primero para que la IA la optimice.");
        return;
    }

    const originalBtnContent = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-slow animate-spin inline mr-1" style="color: white;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        Optimizando...
    `;

    try {
        const fetchFunc = window.authenticatedFetch || fetch;
        const res = await fetchFunc('/api/optimizar-descripcion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion: originalText })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al optimizar');
        }

        const data = await res.json();

        // Preserve state immediately prior to AI execution
        textarea.dataset.previousDescriptionText = textarea.value;
        textarea.value = data.descripcion_optimizada || '';

        updateHotelDescCharCounter(textarea);
        updateUndoButtonState(textarea);
    } catch (err) {
        window.showAlert ? window.showAlert('danger', 'Error al optimizar la descripción: ' + err.message) : alert("Error al optimizar la descripción: " + err.message);
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1.0';
        btn.innerHTML = originalBtnContent;
    }
}
window.optimizeDescription = optimizeDescription;

function updateUndoButtonState(textarea) {
    if (!textarea) return;
    const wrapper = textarea.closest('.relative') || textarea.parentElement;
    const undoBtn = wrapper ? wrapper.querySelector('.btn-ia-undo') : null;
    if (!undoBtn) return;

    const hasPreviousState = textarea.dataset.previousDescriptionText !== undefined && textarea.dataset.previousDescriptionText !== null;
    if (hasPreviousState) {
        undoBtn.disabled = false;
        undoBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        undoBtn.classList.add('opacity-100', 'cursor-pointer', 'hover:bg-slate-200');
    } else {
        undoBtn.disabled = true;
        undoBtn.classList.add('opacity-40', 'cursor-not-allowed');
        undoBtn.classList.remove('opacity-100', 'cursor-pointer', 'hover:bg-slate-200');
    }
}
window.updateUndoButtonState = updateUndoButtonState;

function handleHotelDescInput(textarea) {
    if (!textarea) return;
    if (textarea.dataset.previousDescriptionText !== undefined) {
        delete textarea.dataset.previousDescriptionText;
        updateUndoButtonState(textarea);
    }
}
window.handleHotelDescInput = handleHotelDescInput;

function undoAiDescription(btnOrTextarea) {
    let textarea = null;
    if (btnOrTextarea.classList.contains && btnOrTextarea.classList.contains('hotel-descripcion-val')) {
        textarea = btnOrTextarea;
    } else if (btnOrTextarea.closest) {
        const wrapper = btnOrTextarea.closest('.relative') || btnOrTextarea.parentElement;
        textarea = wrapper ? wrapper.querySelector('.hotel-descripcion-val') : null;
    }

    if (!textarea) return;

    const prevText = textarea.dataset.previousDescriptionText;
    if (prevText !== undefined && prevText !== null) {
        textarea.value = prevText;
        delete textarea.dataset.previousDescriptionText;
        updateHotelDescCharCounter(textarea);
        updateUndoButtonState(textarea);
    }
}
window.undoAiDescription = undoAiDescription;

function setupAiUndoKeyboardShortcut() {
    if (window._aiUndoKeyboardShortcutListener) {
        document.removeEventListener('keydown', window._aiUndoKeyboardShortcutListener);
    }

    window._aiUndoKeyboardShortcutListener = function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !e.altKey) {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.classList.contains('hotel-descripcion-val')) {
                if (activeEl.dataset.previousDescriptionText !== undefined && activeEl.dataset.previousDescriptionText !== null) {
                    e.preventDefault();
                    undoAiDescription(activeEl);
                }
            }
        }
    };

    document.addEventListener('keydown', window._aiUndoKeyboardShortcutListener);
}
window.setupAiUndoKeyboardShortcut = setupAiUndoKeyboardShortcut;

function updateHotelDescCharCounter(textarea) {
    if (!textarea) return;
    const wrapper = textarea.closest('.relative') || textarea.parentElement;
    const counter = wrapper ? wrapper.querySelector('.hotel-desc-counter') : null;
    const errorTooltip = wrapper ? wrapper.querySelector('.hotel-desc-error-tooltip') : null;

    const max = 200;
    const len = textarea.value ? textarea.value.length : 0;

    if (counter) {
        counter.textContent = `${len}/${max}`;
        if (len > max) {
            counter.className = 'hotel-desc-counter text-[10px] font-black text-rose-500 select-none transition-colors animate-pulse';
            textarea.classList.add('border-rose-500', 'focus:border-rose-500', 'bg-rose-50/20');
            textarea.classList.remove('border-slate-200', 'focus:border-brand-primary');
            if (errorTooltip) errorTooltip.classList.remove('hidden');
        } else if (len === max) {
            counter.className = 'hotel-desc-counter text-[10px] font-bold text-amber-600 select-none transition-colors';
            textarea.classList.remove('border-rose-500', 'focus:border-rose-500', 'bg-rose-50/20');
            textarea.classList.add('border-slate-200', 'focus:border-brand-primary');
            if (errorTooltip) errorTooltip.classList.add('hidden');
        } else {
            counter.className = 'hotel-desc-counter text-[10px] font-semibold text-slate-400 select-none transition-colors';
            textarea.classList.remove('border-rose-500', 'focus:border-rose-500', 'bg-rose-50/20');
            textarea.classList.add('border-slate-200', 'focus:border-brand-primary');
            if (errorTooltip) errorTooltip.classList.add('hidden');
        }
    }
}
window.updateHotelDescCharCounter = updateHotelDescCharCounter;

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
    const imgVal = data ? (data.imagen || data.imagen1 || data.hotel_imagen || '') : '';

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
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción del Alojamiento</label>
            <div class="relative flex flex-col w-full">
                <textarea class="hotel-descripcion-val border border-slate-200 rounded-xl px-3 py-2 pb-8 text-xs font-medium focus:outline-none focus:border-brand-primary transition-all bg-white h-[85px] resize-y w-full" placeholder="Breve reseña del hotel, ubicación y comodidades..." style="line-height: 1.3;" oninput="handleHotelDescInput(this); updateHotelDescCharCounter(this);" onkeyup="updateHotelDescCharCounter(this)" onpaste="setTimeout(() => updateHotelDescCharCounter(this), 10);">${data ? (data.descripcion || data.hotel_descripcion || '') : ''}</textarea>
                
                <!-- Custom Error Tooltip -->
                <div class="hotel-desc-error-tooltip hidden absolute -top-8 right-0 bg-rose-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-lg pointer-events-none z-20 transition-all flex items-center gap-1">
                    <svg class="w-3 h-3 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Superaste el máximo de caracteres
                    <div class="absolute top-full right-4 border-4 border-transparent border-t-rose-600"></div>
                </div>

                <!-- Bottom Right Controls: IA Button, Undo & Counter -->
                <div class="absolute bottom-1.5 right-1.5 flex items-center gap-2 z-10 pointer-events-none">
                    <button type="button" class="btn-ia-optimize pointer-events-auto text-[9px] px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg hover:shadow-sm active:scale-95 transition-all cursor-pointer" onclick="optimizeDescription(this)">
                        Mejorar con IA
                    </button>
                    <button type="button" class="btn-ia-undo pointer-events-auto text-[9px] p-1.5 bg-slate-100 text-slate-700 font-bold rounded-lg transition-all opacity-40 cursor-not-allowed flex items-center justify-center" disabled onclick="undoAiDescription(this)" title="Deshacer cambio de IA (Ctrl+Z)">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                    </button>
                    <span class="hotel-desc-counter text-[10px] font-semibold text-slate-400 select-none transition-colors">0/200</span>
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-2 w-full">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Imagen del Hotel / Destino</label>
            <div class="dropzone relative overflow-hidden border-2 border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-4 bg-white flex flex-col items-center justify-center min-h-[110px] cursor-pointer transition-all duration-300 group w-full" id="dropzone-${cardId}" tabindex="0" onclick="triggerFileInput('file-${cardId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6 text-slate-400 group-hover:text-brand-primary mb-2" style="${imgVal ? 'display: none;' : ''}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <span class="text-xs text-slate-500 font-semibold text-center leading-tight" style="${imgVal ? 'display: none;' : ''}">Seleccionar imagen<br><span class="text-[10px] text-brand-primary/80 font-bold">Ctrl+V para pegar</span></span>
                <input type="file" id="file-${cardId}" accept="image/*" class="hidden" onchange="handleImageUpload(this, 'preview-${cardId}', 'data-${cardId}')">
                <img id="preview-${cardId}" class="dropzone-preview absolute inset-0 w-full h-full object-cover rounded-xl" style="${imgVal ? 'display: block;' : 'display: none;'}" src="${imgVal}" alt="">
                <input type="hidden" id="data-${cardId}" class="hotel-imagen-val" value="${imgVal}">
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
    if (descInput) {
        updateHotelDescCharCounter(descInput);
        updateUndoButtonState(descInput);
    }

    const dz = card.querySelector('.dropzone');
    if (dz) {
        setupSingleDropzone(dz);
    }
    updateStopNights(card);

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

// Multidestino Real-Time Summary Table Renderer (Exact parity with standard quote design)
function renderMultidestinoSummaryHTML(config, container) {
    const { currency, cantPax, flightsCost, flightsFee, transfersCost, aplicarRedondeo, hotelList } = config;
    if (!container) return;

    if (!hotelList || hotelList.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 text-xs font-semibold">
                No hay alojamientos agregados aún.
            </div>
        `;
        return;
    }

    const aereosTotal = flightsCost + flightsFee;
    const totalHoteles = hotelList.reduce((acc, h) => acc + (parseFloat(h.hotelCost) || 0), 0);
    const adminFee = (totalHoteles + transfersCost) * 0.05;
    const subtotalGeneral = aereosTotal + totalHoteles + transfersCost + adminFee;
    const perPerson = subtotalGeneral / cantPax;

    const roundedPerPerson = aplicarRedondeo ? (Math.ceil(perPerson / 10) * 10) : perPerson;
    const roundedTotal = aplicarRedondeo ? (roundedPerPerson * cantPax) : subtotalGeneral;
    const totalRoundingAdded = roundedTotal - subtotalGeneral;

    let hotelsRowsHtml = '';
    if (hotelList.length === 1) {
        const h = hotelList[0];
        const hName = h.hotelName || 'Hotel 1';
        const hCost = parseFloat(h.hotelCost) || 0;
        hotelsRowsHtml = `
            <tr>
                <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                    <img src="/assets/iconos/cama.svg" class="w-3.5 h-3.5 icon-slate" alt="Alojamiento">
                    <span class="truncate" title="${hName}">Alojamiento: ${hName}</span>
                </td>
                <td class="py-2 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(hCost)}</td>
            </tr>
        `;
    } else {
        const stopsHtml = hotelList.map((h, idx) => {
            const hName = h.hotelName || `Hotel ${idx + 1}`;
            const hCost = parseFloat(h.hotelCost) || 0;
            return `
                <tr>
                    <td class="py-1.5 pr-2 font-medium text-slate-500 flex items-center gap-1">
                        <img src="/assets/iconos/cama.svg" class="w-3.5 h-3.5 icon-slate" alt="Alojamiento">
                        <span class="truncate" title="${hName}">Parada ${idx + 1}: ${hName}</span>
                    </td>
                    <td class="py-1.5 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(hCost)}</td>
                </tr>
            `;
        }).join('');

        hotelsRowsHtml = `
            ${stopsHtml}
            <tr class="bg-slate-50/50 font-semibold border-t border-slate-100">
                <td class="py-1.5 pr-2 text-[9px] text-slate-500 uppercase tracking-wider pl-4">Subtotal Alojamientos</td>
                <td class="py-1.5 px-2 text-right font-bold text-slate-800">${currency} ${formatPriceES(totalHoteles)}</td>
            </tr>
        `;
    }

    container.innerHTML = `
        <div class="w-full overflow-x-auto">
            <table class="w-full min-w-max text-left border-collapse text-[10px] font-medium">
                <thead>
                    <tr class="border-b border-slate-200 text-slate-500 font-bold">
                        <th class="py-2 pr-2 text-[9px] uppercase tracking-wider text-slate-400 w-[95px]">Concepto</th>
                        <th class="py-2 px-2 text-right text-[9px] uppercase tracking-wider text-brand-primary font-extrabold min-w-[80px]">Itinerario</th>
                    </tr>
                    <tr class="border-b border-slate-100 text-slate-700">
                        <th class="py-1.5 pr-2 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Paradas</th>
                        <th class="py-1.5 px-2 text-right text-[10px] font-bold text-slate-800">${hotelList.length} ${hotelList.length === 1 ? 'Parada' : 'Paradas'}</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/avion.svg" class="w-3.5 h-3.5 icon-slate" alt="Vuelos">
                            <span class="truncate">Vuelos</span>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(flightsCost)}</td>
                    </tr>
                    <tr class="${flightsFee > 0 ? '' : 'opacity-40'}">
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/gastos.svg" class="w-3.5 h-3.5 icon-slate" alt="Fee Aéreo">
                            <span class="truncate">Fee Aéreo</span>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-slate-700">${flightsFee > 0 ? currency + ' ' + formatPriceES(flightsFee) : '<span class="text-slate-300">—</span>'}</td>
                    </tr>
                    ${hotelsRowsHtml}
                    ${transfersCost > 0 ? `
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/traslados.svg" class="w-3.5 h-3.5 icon-slate" alt="Traslados">
                            <span class="truncate">Traslados</span>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(transfersCost)}</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/gastos.svg" class="w-3.5 h-3.5 icon-slate" alt="Gastos Admin">
                            <span class="truncate">Gastos Admin (5%)</span>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(adminFee)}</td>
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/dinero.svg" class="w-3.5 h-3.5 icon-slate" alt="Redondeo">
                            <span class="truncate">Redondeo</span>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-slate-700">${currency} ${formatPriceES(totalRoundingAdded)}</td>
                    </tr>
                    <tr class="bg-slate-50/50 font-bold border-t border-slate-200">
                        <td class="py-2.5 pr-2 text-[10px] text-slate-800 uppercase tracking-wider flex items-center gap-1">
                            <img src="/assets/iconos/dinero.svg" class="w-3.5 h-3.5 icon-dark" alt="Total">
                            <span>Total</span>
                        </td>
                        <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">${currency} ${formatPriceES(roundedTotal)}</td>
                    </tr>
                    <tr class="bg-brand-primary/5 font-bold border-t border-brand-primary/10">
                        <td class="py-2.5 pr-2 text-[9px] text-brand-primary uppercase tracking-widest flex items-center gap-1">
                            <img src="/assets/iconos/persona.svg" class="w-3.5 h-3.5 icon-brand" alt="Por Pax">
                            <span class="truncate">Por Pax (${cantPax})</span>
                        </td>
                        <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">${currency} ${formatPriceES(roundedPerPerson)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}
window.renderMultidestinoSummaryHTML = renderMultidestinoSummaryHTML;

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

    renderMultidestinoSummaryHTML({
        currency,
        cantPax,
        flightsCost,
        flightsFee,
        transfersCost,
        aplicarRedondeo,
        hotelList
    }, container);
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

// Active Editing Indicator Helpers
function updateEditingIndicator() {
    const indicator = document.getElementById('editing-indicator');
    const textEl = document.getElementById('editing-indicator-text');
    if (!indicator) return;
    if (currentQuoteId) {
        indicator.classList.remove('hidden');
        if (textEl) {
            textEl.innerHTML = `<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Editando cotización multidestino guardada (ID #${currentQuoteId})</span>`;
        }
    } else {
        indicator.classList.add('hidden');
    }
}
window.updateEditingIndicator = updateEditingIndicator;

function saveQuoteChanges() {
    const btn = document.getElementById('btn-generar-preview');
    if (btn) btn.click();
}
window.saveQuoteChanges = saveQuoteChanges;

function duplicateCurrentQuote() {
    currentQuoteId = null;
    window.currentQuoteOwner = null;
    updateEditingIndicator();
    const paxEl = document.getElementById('nombre_pax');
    if (paxEl && paxEl.value && !paxEl.value.startsWith('Copia de ')) {
        paxEl.value = 'Copia de ' + paxEl.value;
    }
    if (window.showAlert) {
        window.showAlert('success', 'Cotización duplicada en formulario. Al generar se guardará como un nuevo registro.');
    }
}
window.duplicateCurrentQuote = duplicateCurrentQuote;

function cancelEditingQuote() {
    currentQuoteId = null;
    window.currentQuoteOwner = null;
    resetMultidestinoForm();
    updateEditingIndicator();
    if (window.showAlert) {
        window.showAlert('info', 'Edición cancelada. Formulario reiniciado.');
    }
}
window.cancelEditingQuote = cancelEditingQuote;

async function loadMultidestinoQuoteIntoForm(quoteId, forceEditMode = true) {
    if (!quoteId) return;
    window.showLoader ? window.showLoader("Cargando cotización multidestino...") : null;
    const signal = window.getAbortSignal ? window.getAbortSignal(true) : undefined;

    try {
        const fetchFunc = window.authenticatedFetch || fetch;
        const res = await fetchFunc(`/api/cotizaciones/${quoteId}`, { signal });
        if (!res.ok) throw new Error("No se pudo cargar la cotización multidestino solicitada.");
        const q = await res.json();

        // Check if this is truly a multidestino quote
        const isMultidestino = q.tipo_cotizacion === 'multidestino' ||
            (Array.isArray(q.hoteles) && q.hoteles.some(h => h.tipo_cotizacion === 'multidestino'));

        if (!isMultidestino) {
            window.pendingEditQuoteId = quoteId;
            window.pendingEditQuoteEditable = forceEditMode;
            window.hideLoader ? window.hideLoader() : null;
            navigateTo('/cotizacion-completa?id=' + quoteId);
            return;
        }

        // 1. Basic Fields
        const nombrePaxEl = document.getElementById('nombre_pax');
        if (nombrePaxEl) nombrePaxEl.value = q.nombre_pax || '';

        const destinoEl = document.getElementById('destino');
        if (destinoEl) destinoEl.value = q.destino || '';

        const cantPaxEl = document.getElementById('cantidad_pasajeros');
        if (cantPaxEl) cantPaxEl.value = q.cantidad_pasajeros || 1;

        const origenEl = document.getElementById('origen');
        if (origenEl) origenEl.value = q.origen || 'Córdoba';

        // 2. Moneda & Redondeo
        let currency = q.moneda || 'USD';
        if (q.hoteles) {
            const meta = q.hoteles.find(h => h.nombre === "METADATA_COTIZACION");
            if (meta && meta.moneda) currency = meta.moneda;
        }
        const monedaEl = document.getElementById('moneda_seleccionada');
        if (monedaEl) {
            monedaEl.value = currency;
            updateCurrencyLabels();
        }

        const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
        if (aplicarRedondeoEl) {
            const redondearVal = (q.hoteles && q.hoteles[0] && typeof q.hoteles[0].redondear !== 'undefined')
                ? q.hoteles[0].redondear
                : (q.redondear !== undefined ? q.redondear : false);
            aplicarRedondeoEl.checked = !!redondearVal;
        }

        // 3. Flight Dates
        const dateIda = formatToPicker(q.fecha_vuelo_ida);
        const idaPicker = document.getElementById('fecha_vuelo_ida')?._flatpickr;
        if (idaPicker) {
            idaPicker.setDate(dateIda, false);
        }
        const returnPicker = document.getElementById('fecha_vuelo_vuelta')?._flatpickr;
        if (returnPicker) {
            if (dateIda) returnPicker.set('minDate', dateIda);
            returnPicker.setDate(formatToPicker(q.fecha_vuelo_vuelta), false);
        }
        const validezPicker = document.getElementById('validez_cotizacion')?._flatpickr;
        if (validezPicker) {
            validezPicker.setDate(formatToPicker(q.validez_cotizacion || ''), false);
        }

        // 4. Flight & Transfer Costs
        const montoVuelosEl = document.getElementById('monto_vuelos');
        if (montoVuelosEl) montoVuelosEl.value = (q.monto_vuelos !== undefined && q.monto_vuelos !== null) ? q.monto_vuelos : '';

        const feeAereoEl = document.getElementById('fee_aereo_monto');
        if (feeAereoEl) feeAereoEl.value = (q.fee_aereo !== undefined && q.fee_aereo !== null) ? q.fee_aereo : '';

        const feeTipoEl = document.getElementById('fee_aereo_tipo');
        if (feeTipoEl) {
            feeTipoEl.value = (q.fee_aereo !== undefined && q.fee_aereo !== null && q.fee_aereo !== 0) ? 'fixed' : 'auto';
        }
        toggleFeeType();

        const montoTrasladosEl = document.getElementById('monto_traslados');
        if (montoTrasladosEl) montoTrasladosEl.value = (q.monto_traslados !== undefined && q.monto_traslados !== null) ? q.monto_traslados : '';

        selectTransferType(q.tipo_traslado || 'tradicional');

        // 5. Baggage
        let baggage = q.equipaje;
        if (typeof baggage === 'string') {
            try { baggage = JSON.parse(baggage); } catch (e) { baggage = []; }
        }
        selectedBaggage = Array.isArray(baggage) ? [...baggage] : [];
        updateBaggageUI();

        // 6. Flight Images Helper
        const populateImage = (previewId, dataId, dzId, b64) => {
            const preview = document.getElementById(previewId);
            const dataInput = document.getElementById(dataId);
            const dz = document.getElementById(dzId);
            if (preview && dataInput && dz) {
                if (b64) {
                    preview.src = b64;
                    preview.style.display = 'block';
                    dataInput.value = b64;
                    const span = dz.querySelector('span');
                    const svg = dz.querySelector('svg');
                    if (span) span.style.display = 'none';
                    if (svg) svg.style.display = 'none';
                } else {
                    preview.src = '';
                    preview.style.display = 'none';
                    dataInput.value = '';
                    const span = dz.querySelector('span');
                    const svg = dz.querySelector('svg');
                    if (span) span.style.display = 'block';
                    if (svg) svg.style.display = 'block';
                }
            }
        };

        populateImage('preview-vuelo-ida', 'data-vuelo-ida', 'dropzone-vuelo-ida', q.img_vuelo_ida);
        populateImage('preview-vuelo-vuelta', 'data-vuelo-vuelta', 'dropzone-vuelo-vuelta', q.img_vuelo_vuelta);

        // 7. Tramo 3 / Segment 3
        let qFechaVuelo3 = q.fecha_vuelo_3 || '';
        let qImgVuelo3 = q.img_vuelo_3 || '';
        if ((!qFechaVuelo3 || !qImgVuelo3) && q.hoteles) {
            const meta = q.hoteles.find(h => h.nombre === 'METADATA_COTIZACION');
            if (meta) {
                if (!qFechaVuelo3 && meta.fecha_vuelo_3) qFechaVuelo3 = meta.fecha_vuelo_3;
                if (!qImgVuelo3 && meta.img_vuelo_3) qImgVuelo3 = meta.img_vuelo_3;
            }
        }
        const cardVuelo3 = document.getElementById('card-vuelo-3');
        const isCurrentlyHidden = cardVuelo3 ? cardVuelo3.classList.contains('hidden') : true;
        if (qFechaVuelo3 || qImgVuelo3) {
            if (isCurrentlyHidden) toggleExtraFlightSegment();
            const f3Picker = document.getElementById('fecha_vuelo_3')?._flatpickr;
            if (f3Picker) f3Picker.setDate(formatToPicker(qFechaVuelo3), false);
            populateImage('preview-vuelo-3', 'data-vuelo-3', 'dropzone-vuelo-3', qImgVuelo3);
        } else {
            if (!isCurrentlyHidden) toggleExtraFlightSegment();
        }

        // 8. Hotel Stops (Operator AND)
        const hotelsContainer = document.getElementById('hotels-container');
        if (hotelsContainer) {
            hotelsContainer.innerHTML = '';
            stopCount = 0;
        }

        const realHotels = (q.hoteles || []).filter(h => h.nombre !== "METADATA_COTIZACION" && h.nombre !== "METADATA_PRESUPUESTO_RAPIDO");
        if (realHotels.length > 0) {
            realHotels.forEach(hotel => {
                addHotelStop(hotel);
            });
        } else {
            addHotelStop();
            addHotelStop();
        }
        syncStopDateRestrictions();

        // 9. Cache IDs & State
        currentQuoteId = q.id;
        window.currentQuoteOwner = q.agente_nombre;
        isReadOnlyMode = false;

        updateEditingIndicator();
        updateRealTimeSummary();
        window.hideLoader ? window.hideLoader() : null;

        if (window.showAlert) {
            window.showAlert('info', `Editando cotización multidestino #${q.id} para ${q.nombre_pax || 'Pasajero'}`);
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        window.hideLoader ? window.hideLoader() : null;
        if (window.showAlert) {
            window.showAlert('danger', 'Error al cargar la cotización multidestino: ' + err.message);
        } else {
            alert('Error al cargar la cotización multidestino: ' + err.message);
        }
    }
}
window.loadMultidestinoQuoteIntoForm = loadMultidestinoQuoteIntoForm;

// Reset and confirmation logic
function confirmNewQuote() {
    if (typeof window.showCustomConfirm === 'function') {
        window.showCustomConfirm({
            title: '¿Limpiar formulario?',
            desc: 'Se borrarán todos los datos cargados en el formulario actual para iniciar una nueva cotización multidestino. Esta acción no se puede deshacer.',
            btnText: 'Sí, Limpiar',
            callback: () => {
                currentQuoteId = null;
                resetMultidestinoForm();
                if (window.showAlert) window.showAlert('success', 'Formulario multidestino reiniciado.');
            }
        });
    } else {
        if (confirm('¿Deseas reiniciar el formulario de cotización multidestino?')) {
            currentQuoteId = null;
            resetMultidestinoForm();
        }
    }
}
window.confirmNewQuote = confirmNewQuote;

function resetMultidestinoForm() {
    ['nombre_pax', 'destino', 'cantidad_pasajeros', 'monto_vuelos', 'fee_aereo_monto', 'monto_traslados'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const origenEl = document.getElementById('origen');
    if (origenEl) origenEl.value = 'Córdoba';
    const monedaEl = document.getElementById('moneda_seleccionada');
    if (monedaEl) monedaEl.value = 'USD';
    const redondeoEl = document.getElementById('aplicar_redondeo');
    if (redondeoEl) redondeoEl.checked = false;

    ['fecha_vuelo_ida', 'fecha_vuelo_3', 'fecha_vuelo_vuelta', 'validez_cotizacion'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el._flatpickr) el._flatpickr.clear();
        else if (el) el.value = '';
    });

    ['vuelo-ida', 'vuelo-3', 'vuelo-vuelta'].forEach(suffix => {
        const dataEl = document.getElementById(`data-${suffix}`);
        if (dataEl) dataEl.value = '';
        const prevEl = document.getElementById(`preview-${suffix}`);
        if (prevEl) {
            prevEl.src = '';
            prevEl.style.display = 'none';
        }
        const dz = document.getElementById(`dropzone-${suffix}`);
        if (dz) {
            const span = dz.querySelector('span');
            if (span) span.style.display = 'block';
            const svg = dz.querySelector('svg');
            if (svg) svg.style.display = 'block';
        }
    });

    selectedBaggage = [];
    updateBaggageUI();
    selectTransferType('tradicional');

    const hotelsContainer = document.getElementById('hotels-container');
    if (hotelsContainer) {
        hotelsContainer.innerHTML = '';
        stopCount = 0;
        addHotelStop();
        addHotelStop();
    }
    updateEditingIndicator();
    updateRealTimeSummary();
}
window.resetMultidestinoForm = resetMultidestinoForm;

// Fill Multidestino Test Data (Ctrl + Alt + 9)
async function fillMultidestinoTestData() {
    // 1. Populate general itinerary fields
    const nombrePaxEl = document.getElementById('nombre_pax');
    if (nombrePaxEl) nombrePaxEl.value = 'Familia Gómez (Prueba Multidestino)';

    const destinoEl = document.getElementById('destino');
    if (destinoEl) destinoEl.value = 'Madrid, Barcelona y Roma';

    const cantPaxEl = document.getElementById('cantidad_pasajeros');
    if (cantPaxEl) cantPaxEl.value = 2;

    const origenEl = document.getElementById('origen');
    if (origenEl) origenEl.value = 'Córdoba';

    const monedaEl = document.getElementById('moneda_seleccionada');
    if (monedaEl) monedaEl.value = 'USD';

    const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
    if (aplicarRedondeoEl) aplicarRedondeoEl.checked = true;

    // 2. Dates calculation
    const today = new Date();

    const departureDate = new Date(today);
    departureDate.setDate(today.getDate() + 30);

    const stop1CheckoutDate = new Date(today);
    stop1CheckoutDate.setDate(today.getDate() + 35);

    const stop2CheckoutDate = new Date(today);
    stop2CheckoutDate.setDate(today.getDate() + 40);

    const validityDate = new Date(today);
    validityDate.setDate(today.getDate() + 7);

    const toYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

    const depDateStr = toYMD(departureDate);
    const stop1CoStr = toYMD(stop1CheckoutDate);
    const returnDateStr = toYMD(stop2CheckoutDate);
    const valDateStr = toYMD(validityDate);

    // Set flight dates in Flatpickr instances
    const idaPicker = document.getElementById('fecha_vuelo_ida')?._flatpickr;
    if (idaPicker) idaPicker.setDate(depDateStr);

    const vueltaPicker = document.getElementById('fecha_vuelo_vuelta')?._flatpickr;
    if (vueltaPicker) {
        vueltaPicker.set('minDate', depDateStr);
        vueltaPicker.setDate(returnDateStr);
    }

    const validezPicker = document.getElementById('validez_cotizacion')?._flatpickr;
    if (validezPicker) validezPicker.setDate(valDateStr);

    // 3. Flight pricing and transfers
    const montoVuelosEl = document.getElementById('monto_vuelos');
    if (montoVuelosEl) montoVuelosEl.value = '1850.00';

    const feeTipoEl = document.getElementById('fee_aereo_tipo');
    if (feeTipoEl) feeTipoEl.value = 'auto';
    toggleFeeType();

    const montoTrasladosEl = document.getElementById('monto_traslados');
    if (montoTrasladosEl) montoTrasladosEl.value = '220.00';
    selectTransferType('tradicional');

    // 4. Baggage
    selectedBaggage = ['mano', 'carry', 'valija'];
    updateBaggageUI();

    // 5. Load mock images from /assets/test/
    const getBase64FromUrl = async (url) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.warn("Could not load test image from url:", url, err);
            return '';
        }
    };

    const [imgIdaB64, imgVueltaB64, hotel1B64, hotel2B64] = await Promise.all([
        getBase64FromUrl('/assets/test/tramo-ida.png'),
        getBase64FromUrl('/assets/test/tramo-vuelta.png'),
        getBase64FromUrl('/assets/test/hotel-test-1.jpg'),
        getBase64FromUrl('/assets/test/hotel-test-2.avif')
    ]);

    const setMockFlightImage = (previewId, dataId, dropzoneId, b64) => {
        if (!b64) return;
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = b64;
            preview.style.display = 'block';
        }
        const dataEl = document.getElementById(dataId);
        if (dataEl) dataEl.value = b64;

        const dz = document.getElementById(dropzoneId);
        if (dz) {
            const span = dz.querySelector('span');
            if (span) span.style.display = 'none';
            const svg = dz.querySelector('svg');
            if (svg) svg.style.display = 'none';
        }
    };

    setMockFlightImage('preview-vuelo-ida', 'data-vuelo-ida', 'dropzone-vuelo-ida', imgIdaB64);
    setMockFlightImage('preview-vuelo-vuelta', 'data-vuelo-vuelta', 'dropzone-vuelo-vuelta', imgVueltaB64);

    // 6. Clear existing hotel stops and add 2 realistic consecutive stops (AND)
    const hotelsContainer = document.getElementById('hotels-container');
    if (hotelsContainer) {
        hotelsContainer.innerHTML = '';
        stopCount = 0;
    }

    // Stop 1: Madrid (5 nights)
    addHotelStop({
        destino: 'Madrid',
        nombre: 'Hotel Regina Madrid',
        estrellas: '★★★★☆',
        regimen: 'Desayuno incluido',
        habitacion: 'Estándar',
        costo_neto: 950.00,
        fecha_checkin: depDateStr,
        fecha_checkout: stop1CoStr,
        descripcion: 'Hotel elegante y clásico ubicado sobre la calle Alcalá, a pasos de la Puerta del Sol. Ofrece habitaciones insonorizadas, desayuno buffet gourmet y atención de primer nivel.',
        imagen: hotel1B64
    });

    // Stop 2: Barcelona (5 nights)
    addHotelStop({
        destino: 'Barcelona',
        nombre: 'H10 Marina Barcelona',
        estrellas: '★★★★☆',
        regimen: 'Solo alojamiento',
        habitacion: 'Deluxe',
        costo_neto: 1150.00,
        fecha_checkin: stop1CoStr,
        fecha_checkout: returnDateStr,
        descripcion: 'Hotel moderno situado cerca de la Villa Olímpica y la playa del Bogatell. Cuenta con piscina panorámica en el rooftop con vistas a la ciudad y circuito de aguas termales.',
        imagen: hotel2B64
    });

    // 7. Update UI and Calculations
    syncStopDateRestrictions();
    updateBaseLabel();
    updateRealTimeSummary();

    if (window.showAlert) {
        window.showAlert('success', '✔ Datos de prueba multidestino cargados correctamente (Ctrl + Alt + 9).');
    } else {
        alert('✔ Datos de prueba multidestino cargados.');
    }
}
window.fillMultidestinoTestData = fillMultidestinoTestData;
window.fillTestData = fillMultidestinoTestData;

// Module Export: Init
export async function initCotizarMultidestino() {
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
    setupDragAndDrop();
    setupAiUndoKeyboardShortcut();

    // Setup Ctrl + Alt + 9 test data shortcut listener
    if (window._fillMultidestinoShortcutListener) {
        document.removeEventListener('keydown', window._fillMultidestinoShortcutListener);
    }
    window._fillMultidestinoShortcutListener = async (e) => {
        if (e.ctrlKey && e.altKey && (e.key === '9' || e.code === 'Digit9' || e.code === 'Numpad9')) {
            if (window.location.pathname !== '/cotizacion-multidestino') return;
            e.preventDefault();
            await fillMultidestinoTestData();
        }
    };
    document.addEventListener('keydown', window._fillMultidestinoShortcutListener);

    const inputs = ["monto_vuelos", "fee_aereo_monto", "monto_traslados", "cantidad_pasajeros", "nombre_pax", "destino"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateRealTimeSummary);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const quoteIdToLoad = window.pendingEditQuoteId || urlParams.get('id');
    const forceEdit = window.pendingEditQuoteEditable !== null ? !!window.pendingEditQuoteEditable : true;
    window.pendingEditQuoteId = null;
    window.pendingEditQuoteEditable = null;

    if (quoteIdToLoad) {
        await loadMultidestinoQuoteIntoForm(quoteIdToLoad, forceEdit);
    } else {
        const hotelsContainer = document.getElementById("hotels-container");
        if (hotelsContainer && hotelsContainer.children.length === 0) {
            // Add 2 initial stops for multidestino by default!
            addHotelStop();
            addHotelStop();
        }
        updateEditingIndicator();
        updateRealTimeSummary();
    }
}
