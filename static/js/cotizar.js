let hotelCount = 0;
let agencyConfig = {};
let importedQuotes = [];
let hoveredDropzone = null;
let isDraggingSidebar = false;
let sidebarWidth = 380;
let currentQuoteId = null;
let currentPdfUrl = null;
let allSavedQuotes = [];
let isRestoringStateDetailed = false;

function saveDetailedQuoteFormState() {
    if (isRestoringStateDetailed) return;

    const passengerInput = document.getElementById('nombre_pax');
    if (!passengerInput) return; // Not on form page

    const hotels = [];
    document.querySelectorAll('#hotels-container .hotel-option-card').forEach(card => {
        const nombre = card.querySelector('.hotel-nombre-val')?.value || '';
        const estrellas = card.querySelector('.hotel-estrellas-val')?.value || '';
        const regimen = card.querySelector('.hotel-regimen-val')?.value || '';
        const habitacion = card.querySelector('.hotel-habitacion-val')?.value || '';
        const costo = card.querySelector('.hotel-costo-val')?.value || '';
        const descripcion = card.querySelector('.hotel-descripcion-val')?.value || '';

        const imgInput = card.querySelector('.hotel-imagen-val-1');
        const imagen = imgInput ? imgInput.value : '';

        const recommendedRadio = card.querySelector('.hotel-recommended-radio');
        const recommended = recommendedRadio ? recommendedRadio.checked : false;

        hotels.push({
            nombre,
            estrellas,
            regimen,
            habitacion,
            costo,
            descripcion,
            imagen,
            recommended
        });
    });

    const state = {
        currentQuoteId: currentQuoteId,
        currentQuoteOwner: window.currentQuoteOwner,
        isReadOnlyMode: isReadOnlyMode,
        nombre_pax: passengerInput.value,
        destino: document.getElementById('destino')?.value || '',
        cantidad_pasajeros: document.getElementById('cantidad_pasajeros')?.value || '',
        origen: document.getElementById('origen')?.value || '',
        aplicar_redondeo: document.getElementById('aplicar_redondeo')?.checked,
        fecha_salida: document.getElementById('fecha_salida')?.value || '',
        fecha_vuelo_ida: document.getElementById('fecha_vuelo_ida')?.value || '',
        fecha_vuelo_vuelta: document.getElementById('fecha_vuelo_vuelta')?.value || '',
        validez_cotizacion: document.getElementById('validez_cotizacion')?.value || '',
        img_vuelo_ida: document.getElementById('data-vuelo-ida')?.value || '',
        img_vuelo_vuelta: document.getElementById('data-vuelo-vuelta')?.value || '',
        monto_vuelos: document.getElementById('monto_vuelos')?.value || '',
        fee_aereo_monto: document.getElementById('fee_aereo_monto')?.value || '',
        monto_traslados: document.getElementById('monto_traslados')?.value || '',
        fee_aereo_tipo: document.getElementById('fee_aereo_tipo')?.value || '',
        selectedBaggage: selectedBaggage,
        hotels: hotels
    };

    sessionStorage.setItem('detailedQuoteFormState', JSON.stringify(state));
}
window.saveDetailedQuoteFormState = saveDetailedQuoteFormState;

function restoreDetailedQuoteFormState() {
    const saved = sessionStorage.getItem('detailedQuoteFormState');
    if (!saved) return;

    try {
        const state = JSON.parse(saved);
        if (!state) return;

        isRestoringStateDetailed = true;

        currentQuoteId = state.currentQuoteId;
        window.currentQuoteOwner = state.currentQuoteOwner;
        isReadOnlyMode = state.isReadOnlyMode;

        // General info
        const nombrePaxEl = document.getElementById('nombre_pax');
        if (nombrePaxEl) nombrePaxEl.value = state.nombre_pax || '';

        const destinoEl = document.getElementById('destino');
        if (destinoEl) destinoEl.value = state.destino || '';

        const paxCountEl = document.getElementById('cantidad_pasajeros');
        if (paxCountEl) paxCountEl.value = state.cantidad_pasajeros || '';

        const origenEl = document.getElementById('origen');
        if (origenEl) origenEl.value = state.origen || '';

        const redondeoEl = document.getElementById('aplicar_redondeo');
        if (redondeoEl) redondeoEl.checked = state.aplicar_redondeo !== false;

        // Set Flatpickr dates
        const setDateSafe = (id, val) => {
            const el = document.getElementById(id);
            if (el && el._flatpickr && val) {
                el._flatpickr.setDate(val);
            }
        };
        setDateSafe('fecha_salida', state.fecha_salida);
        setDateSafe('fecha_vuelo_ida', state.fecha_vuelo_ida);
        setDateSafe('fecha_vuelo_vuelta', state.fecha_vuelo_vuelta);
        setDateSafe('validez_cotizacion', state.validez_cotizacion);

        // Flight Images
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

        populateImage('preview-vuelo-ida', 'data-vuelo-ida', 'dropzone-vuelo-ida', state.img_vuelo_ida);
        populateImage('preview-vuelo-vuelta', 'data-vuelo-vuelta', 'dropzone-vuelo-vuelta', state.img_vuelo_vuelta);

        // Costs
        document.getElementById('monto_vuelos').value = state.monto_vuelos || '';
        document.getElementById('fee_aereo_monto').value = state.fee_aereo_monto || '';
        document.getElementById('monto_traslados').value = state.monto_traslados || '';

        const feeTypeEl = document.getElementById('fee_aereo_tipo');
        if (feeTypeEl) feeTypeEl.value = state.fee_aereo_tipo || 'auto';
        toggleFeeType();

        // Baggage
        setBaggageSelection(state.selectedBaggage || []);

        // Hotels
        const hotelsContainer = document.getElementById('hotels-container');
        if (hotelsContainer) {
            hotelsContainer.innerHTML = '';
        }
        hotelCount = 0;

        if (state.hotels && state.hotels.length > 0) {
            state.hotels.forEach(h => {
                addHotelCard(h);
            });
            // Restore recommended state
            document.querySelectorAll('#hotels-container .hotel-option-card').forEach((card, idx) => {
                const hState = state.hotels[idx];
                if (hState && hState.recommended) {
                    const recommendedRadio = card.querySelector('.hotel-recommended-radio');
                    if (recommendedRadio) {
                        recommendedRadio.checked = true;
                    }
                }
            });
        } else {
            addHotelCard();
        }

        // Apply read only or editing mode layout
        enableFormEditing(!isReadOnlyMode);
        updateEditingIndicator();
        updateRealTimeSummary();
        updateHotelBadges();

    } catch (e) {
        console.error("Error restoring detailed quote state:", e);
    } finally {
        isRestoringStateDetailed = false;
    }
}
window.restoreDetailedQuoteFormState = restoreDetailedQuoteFormState;

const authenticatedFetch = window.authenticatedFetch;

function formatPriceES(val) {
    if (val === undefined || val === null || isNaN(val)) return "0,00";
    return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCapitalization(value) {
    if (!value) return '';
    const minorWords = ['de', 'la', 'el', 'en', 'y', 'a', 'del', 'los', 'las', 'con', 'por', 'para', 'o'];

    // Split the value into words, preserving spaces
    const words = value.trim().split(/\s+/);
    const formattedWords = words.map((word, index) => {
        if (!word) return '';

        const lowerWord = word.toLowerCase();

        // If it's a minor word and NOT the first word, keep it in lowercase
        if (minorWords.includes(lowerWord) && index > 0) {
            return lowerWord;
        }

        // Otherwise, capitalize the first letter and keep the rest as lowercase
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    return formattedWords.join(' ');
}
window.formatCapitalization = formatCapitalization;

function handleCapitalizationBlur(input) {
    if (!input) return;
    const oldVal = input.value;
    const newVal = formatCapitalization(oldVal);
    if (newVal !== oldVal) {
        input.value = newVal;
        // Trigger input event to update real-time breakdown
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
    }
}
window.handleCapitalizationBlur = handleCapitalizationBlur;

function formatHabitacionValue(value) {
    if (!value) return "";
    let trimmed = value.trim();
    if (trimmed === "") return "";

    // Capitalize using the new helper
    trimmed = formatCapitalization(trimmed);

    const normalized = trimmed.toLowerCase();
    if (normalized.includes("habitacion") || normalized.includes("habitación")) {
        if (trimmed.startsWith("Habitacion ")) {
            trimmed = "Habitación " + trimmed.substring(11);
        } else if (trimmed === "Habitacion") {
            trimmed = "Habitación";
        }
        return trimmed;
    }
    return "Habitación " + trimmed;
}
window.formatHabitacionValue = formatHabitacionValue;

function formatHabitacionInput(inputEl) {
    if (!inputEl) return;
    const currentVal = inputEl.value;
    const formatted = formatHabitacionValue(currentVal);
    if (formatted !== currentVal) {
        inputEl.value = formatted;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
window.formatHabitacionInput = formatHabitacionInput;

// On window load
window.addEventListener('load', () => {
    // Set flatpickr Spanish translation globally
    if (typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.es) {
        flatpickr.localize(flatpickr.l10ns.es);
    }

    // Initialize custom date pickers (Flatpickr)
    flatpickr("#fecha_vuelo_ida", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true",
        onChange: function (selectedDates, dateStr, instance) {
            const returnPicker = document.getElementById('fecha_vuelo_vuelta')._flatpickr;
            if (returnPicker) {
                if (selectedDates[0]) {
                    returnPicker.set('minDate', selectedDates[0]);
                } else {
                    returnPicker.set('minDate', null);
                }
            }
            validateDates();
        }
    });
    flatpickr("#fecha_vuelo_vuelta", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true",
        onOpen: function (selectedDates, dateStr, instance) {
            const departureVal = getDatePickerValue('fecha_vuelo_ida');
            if (departureVal && !instance.selectedDates.length) {
                instance.jumpToDate(departureVal);
            }
        },
        onReady: function (selectedDates, dateStr, instance) {
            const calendarContainer = instance.calendarContainer;

            calendarContainer.addEventListener('mouseover', function (e) {
                const dayElem = e.target.closest('.flatpickr-day');
                if (!dayElem || dayElem.classList.contains('disabled')) return;

                const departureVal = getDatePickerValue('fecha_vuelo_ida');
                if (!departureVal) return;

                const depTime = new Date(departureVal + 'T00:00:00').getTime();

                const hoverDate = dayElem.dateObj;
                if (!hoverDate) return;
                const hoverTime = new Date(hoverDate.getFullYear(), hoverDate.getMonth(), hoverDate.getDate()).getTime();

                if (hoverTime < depTime) return;

                const days = calendarContainer.querySelectorAll('.flatpickr-day');
                days.forEach(day => {
                    const thisDate = day.dateObj;
                    if (!thisDate || day.classList.contains('disabled')) return;
                    const thisTime = new Date(thisDate.getFullYear(), thisDate.getMonth(), thisDate.getDate()).getTime();

                    if (thisTime > depTime && thisTime < hoverTime) {
                        day.classList.add('inRange');
                        day.classList.remove('startRange', 'endRange');
                    } else if (thisTime === depTime) {
                        day.classList.add('startRange');
                        day.classList.remove('inRange', 'endRange');
                    } else if (thisTime === hoverTime) {
                        day.classList.add('endRange');
                        day.classList.remove('inRange', 'startRange');
                    } else {
                        day.classList.remove('inRange', 'startRange', 'endRange');
                    }
                });
            });

            calendarContainer.addEventListener('mouseleave', function () {
                const departureVal = getDatePickerValue('fecha_vuelo_ida');
                const returnVal = getDatePickerValue('fecha_vuelo_vuelta');

                const depTime = departureVal ? new Date(departureVal + 'T00:00:00').getTime() : null;
                const retTime = returnVal ? new Date(returnVal + 'T00:00:00').getTime() : null;

                const days = calendarContainer.querySelectorAll('.flatpickr-day');
                days.forEach(day => {
                    const thisDate = day.dateObj;
                    if (!thisDate) return;
                    const thisTime = new Date(thisDate.getFullYear(), thisDate.getMonth(), thisDate.getDate()).getTime();

                    if (depTime && retTime) {
                        if (thisTime > depTime && thisTime < retTime) {
                            day.classList.add('inRange');
                            day.classList.remove('startRange', 'endRange');
                        } else if (thisTime === depTime) {
                            day.classList.add('startRange');
                            day.classList.remove('inRange', 'endRange');
                        } else if (thisTime === retTime) {
                            day.classList.add('endRange');
                            day.classList.remove('inRange', 'startRange');
                        } else {
                            day.classList.remove('inRange', 'startRange', 'endRange');
                        }
                    } else {
                        // Keep startRange visible even if return date is not selected yet
                        if (depTime && thisTime === depTime) {
                            day.classList.add('startRange');
                            day.classList.remove('inRange', 'endRange');
                        } else {
                            day.classList.remove('inRange', 'startRange', 'endRange');
                        }
                    }
                });
            });
        },
        onDayCreate: function (dObj, dStr, fp, dayElem) {
            const departureVal = getDatePickerValue('fecha_vuelo_ida');
            const returnVal = getDatePickerValue('fecha_vuelo_vuelta');
            if (departureVal) {
                const depTime = new Date(departureVal + 'T00:00:00').getTime();
                const thisTime = new Date(dayElem.dateObj.getFullYear(), dayElem.dateObj.getMonth(), dayElem.dateObj.getDate()).getTime();

                if (returnVal) {
                    const retTime = new Date(returnVal + 'T00:00:00').getTime();
                    if (thisTime > depTime && thisTime < retTime) {
                        dayElem.classList.add('inRange');
                    } else if (thisTime === depTime) {
                        dayElem.classList.add('startRange');
                    } else if (thisTime === retTime) {
                        dayElem.classList.add('endRange');
                    }
                } else {
                    if (thisTime === depTime) {
                        dayElem.classList.add('startRange');
                    }
                }
            }
        }
    });
    flatpickr("#validez_cotizacion", {
        dateFormat: "d/m/Y",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true"
    });

    setupDragAndDrop();
    setupSidebarResizer();

    // Initialize flights fee
    toggleFeeType();

    // Bind real-time pricing inputs
    document.getElementById('monto_vuelos').addEventListener('input', updateRealTimeSummary);
    document.getElementById('fee_aereo_monto').addEventListener('input', updateRealTimeSummary);
    document.getElementById('monto_traslados').addEventListener('input', updateRealTimeSummary);
    document.getElementById('cantidad_pasajeros').addEventListener('change', updateRealTimeSummary);
    document.getElementById('nombre_pax').addEventListener('input', updateRealTimeSummary);
    document.getElementById('destino').addEventListener('input', updateRealTimeSummary);
    document.getElementById('fecha_vuelo_ida').addEventListener('change', updateRealTimeSummary);
    document.getElementById('fecha_vuelo_vuelta').addEventListener('change', updateRealTimeSummary);
    if (document.getElementById('validez_cotizacion')) {
        document.getElementById('validez_cotizacion').addEventListener('change', updateRealTimeSummary);
    }

    // Setup cost input focus/blur helpers
    setupCostInputHelpers();

    updateRealTimeSummary();

    // Validar sesión inicial
    if (window.innerWidth < 1024) {
        toggleRealTimeBreakdown();
    }
    checkSession();
});

function calculateAutoFee() {
    const costInput = document.getElementById('monto_vuelos');
    const feeType = document.getElementById('fee_aereo_tipo').value;
    const feeInput = document.getElementById('fee_aereo_monto');
    if (feeType === 'auto') {
        const cost = parseFloat(costInput.value) || 0;
        feeInput.value = (cost * 0.1).toFixed(2);
    }
}
window.calculateAutoFee = calculateAutoFee;

function toggleFeeType() {
    const feeType = document.getElementById('fee_aereo_tipo').value;
    const feeInput = document.getElementById('fee_aereo_monto');
    if (feeType === 'auto') {
        feeInput.readOnly = true;
        feeInput.style.opacity = '0.6';
        calculateAutoFee();
    } else {
        feeInput.readOnly = false;
        feeInput.style.opacity = '1.0';
    }
}
window.toggleFeeType = toggleFeeType;

function bindInputHelper(input) {
    if (!input) return;

    // Focus event: auto-select text
    input.addEventListener('focus', function () {
        setTimeout(() => {
            this.select();
        }, 50);
    });

    // Blur event: format to 2 decimals
    input.addEventListener('blur', function () {
        let val = parseFloat(this.value);
        if (isNaN(val) || this.value.trim() === '') {
            this.value = '0.00';
        } else {
            this.value = val.toFixed(2);
        }
        updateRealTimeSummary();
    });
}
window.bindInputHelper = bindInputHelper;

function setupCostInputHelpers() {
    const inputs = [
        document.getElementById('monto_vuelos'),
        document.getElementById('fee_aereo_monto'),
        document.getElementById('monto_traslados')
    ];
    inputs.forEach(input => {
        if (input) {
            bindInputHelper(input);
        }
    });
}
window.setupCostInputHelpers = setupCostInputHelpers;

function toggleRealTimeBreakdown() {
    const container = document.getElementById('sidebar-container');
    const card = document.getElementById('realtime-card');
    const content = document.getElementById('realtime-card-content');
    const btn = document.getElementById('toggle-sidebar-btn');
    const arrow = document.getElementById('sidebar-arrow-icon');
    const resizer = document.getElementById('layout-resizer');

    if (!container || !card || !content || !btn || !arrow) return;

    const isCollapsed = container.style.width === '0px' || container.classList.contains('w-0');

    if (isCollapsed) {
        // Expand
        container.classList.remove('w-0', 'lg:w-0', 'overflow-visible');
        container.style.width = `${sidebarWidth}px`;
        container.style.minWidth = `${sidebarWidth}px`;
        container.style.maxWidth = `${sidebarWidth}px`;

        if (resizer) {
            resizer.classList.remove('hidden');
            resizer.classList.add('lg:flex');
        }

        card.className = "bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-6 shadow-xl shadow-slate-200/50 lg:shadow-md lg:shadow-slate-100 fixed bottom-4 left-4 right-4 z-50 lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:z-0 max-h-[85vh] overflow-hidden transition-all duration-500 w-[calc(100%-2rem)] lg:w-full";

        content.classList.remove('hidden', 'opacity-0');
        content.classList.add('opacity-100');

        btn.className = "absolute top-5 right-5 w-7 h-7 bg-slate-100 hover:bg-brand-primary hover:text-white text-slate-500 rounded-full flex items-center justify-center shadow-sm border border-slate-200/60 cursor-pointer z-50 transition-all duration-300 hover:scale-105 active:scale-95";
        arrow.classList.remove('rotate-180');
    } else {
        // Collapse
        container.classList.add('w-0', 'lg:w-0', 'overflow-visible');
        container.style.width = '0px';
        container.style.minWidth = '0px';
        container.style.maxWidth = '0px';

        if (resizer) {
            resizer.classList.add('hidden');
            resizer.classList.remove('lg:flex');
        }

        card.className = "fixed bottom-4 right-4 lg:absolute lg:top-0 lg:right-0 w-12 h-12 rounded-full p-0 flex items-center justify-center bg-brand-primary text-white border-0 shadow-2xl z-50 transition-all duration-500 max-h-[48px] overflow-hidden cursor-pointer";

        content.classList.add('hidden', 'opacity-0');
        content.classList.remove('opacity-100');

        btn.className = "absolute inset-0 w-full h-full flex items-center justify-center text-white hover:bg-brand-primary/90 rounded-full cursor-pointer z-50";
        arrow.classList.add('rotate-180');
    }
}
window.toggleRealTimeBreakdown = toggleRealTimeBreakdown;

function updateHotelBadges() {
    const container = document.getElementById('hotels-container');
    if (!container) return;
    const cards = container.querySelectorAll('.hotel-option-card');

    // Find which radio is currently checked
    let recommendedCardId = null;
    cards.forEach(card => {
        const radio = card.querySelector('.hotel-recommended-radio');
        if (radio && radio.checked) {
            recommendedCardId = card.id;
        }
    });

    // If none selected, default to first card
    if (!recommendedCardId && cards.length > 0) {
        const firstRadio = cards[0].querySelector('.hotel-recommended-radio');
        if (firstRadio) {
            firstRadio.checked = true;
            recommendedCardId = cards[0].id;
        }
    }

    cards.forEach((card) => {
        // Remove existing badge if any
        const oldBadge = card.querySelector('.recommendation-badge');
        if (oldBadge) oldBadge.remove();

        const isRecommended = card.id === recommendedCardId;

        if (isRecommended) {
            const badge = document.createElement('div');
            badge.className = 'recommendation-badge absolute -top-3 left-6 px-3 py-1 bg-brand-primary text-white text-[9px] font-extrabold rounded-full uppercase tracking-wider shadow-md z-10';
            badge.innerText = 'NUESTRA RECOMENDACIÓN';
            card.appendChild(badge);
        }

        // Update radio label style
        const radioLabel = card.querySelector('.hotel-recommended-label');
        if (radioLabel) {
            if (isRecommended) {
                radioLabel.className = 'hotel-recommended-label flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 cursor-pointer text-[10px] font-extrabold uppercase tracking-wider transition-all select-none';
            } else {
                radioLabel.className = 'hotel-recommended-label flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-pointer text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all select-none';
            }
        }
    });
}
window.updateHotelBadges = updateHotelBadges;

// Tab Switch Logic
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
        tab.classList.remove('block');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-brand-primary', 'to-[#ff7f85]', 'text-white', 'shadow-lg', 'shadow-brand-primary/35');
        btn.classList.add('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100');
    });

    const activeTab = document.getElementById(tabId);
    activeTab.classList.remove('hidden');
    activeTab.classList.add('block');

    // Find matching button
    const btns = document.querySelectorAll('.tab-btn');
    let btnIdx = 0;
    if (tabId === 'cotizacion-tab') btnIdx = 0;
    else if (tabId === 'editar-tab') btnIdx = 1;
    else if (tabId === 'config-tab') btnIdx = 2;

    btns[btnIdx].classList.add('active', 'bg-gradient-to-r', 'from-brand-primary', 'to-[#ff7f85]', 'text-white', 'shadow-lg', 'shadow-brand-primary/35');
    btns[btnIdx].classList.remove('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100');
}
window.switchTab = switchTab;

// Show Alerts
function showAlert(type, message, preventScroll = false) {
    // Evitar mostrar avisos informativos o de éxito
    if (type === 'success' || type === 'info') {
        return;
    }
    const el = document.getElementById('alert-message');
    el.className = `alert p-4 rounded-xl font-semibold border text-sm mb-6 transition-all duration-300`;

    if (type === 'success') {
        el.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
    } else if (type === 'warning') {
        el.classList.add('bg-amber-50', 'border-amber-200', 'text-amber-800');
    } else {
        el.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-800');
    }

    el.innerText = message;
    el.classList.remove('hidden');
    el.classList.add('block');

    if (!preventScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('block');
    }, 5000);
}

// Load Agency Configurations
async function loadConfig() {
    try {
        const res = await authenticatedFetch('/api/config');
        agencyConfig = await res.json();

        // Update Configuration Form inputs
        document.getElementById('config_nombre_agencia').value = agencyConfig.nombre_agencia;
        document.getElementById('config_nombre_agencia_legal').value = agencyConfig.nombre_agencia_legal;
        document.getElementById('color_primary').value = agencyConfig.colores[0];
        document.getElementById('color_secondary').value = agencyConfig.colores[1];
        document.getElementById('color_neutral').value = agencyConfig.colores[2];
        const slidesTemplateInput = document.getElementById('config_slides_template_id');
        if (slidesTemplateInput) {
            slidesTemplateInput.value = agencyConfig.google_slides_template_id || '';
        }
        const slidesFolderInput = document.getElementById('config_slides_folder_id');
        if (slidesFolderInput) {
            slidesFolderInput.value = agencyConfig.google_slides_folder_id || '';
        }

        // Update header navbar title & colors
        const navAgencyName = document.getElementById('nav-agency-name');
        if (navAgencyName) {
            navAgencyName.innerText = agencyConfig.nombre_agencia.toUpperCase();
        }
        document.documentElement.style.setProperty('--primary-color', agencyConfig.colores[0]);
        document.documentElement.style.setProperty('--secondary-color', agencyConfig.colores[1]);
        document.documentElement.style.setProperty('--accent-color', agencyConfig.colores[2]);

        if (agencyConfig.logo_base64) {
            const logoPreview = document.getElementById('preview-logo');
            logoPreview.src = 'data:image/png;base64,' + agencyConfig.logo_base64;
            logoPreview.classList.remove('hidden');
            document.getElementById('data-logo').value = 'data:image/png;base64,' + agencyConfig.logo_base64;

            // Header Logo
            const navLogo = document.getElementById('nav-logo');
            navLogo.src = 'data:image/png;base64,' + agencyConfig.logo_base64;
            navLogo.classList.remove('hidden');
        }
    } catch (err) {
        console.error("Error loading brand configuration:", err);
    }
}

// Save Agency Configurations
async function saveConfig(e) {
    e.preventDefault();
    const configData = {
        nombre_agencia: document.getElementById('config_nombre_agencia').value,
        nombre_agencia_legal: document.getElementById('config_nombre_agencia_legal').value,
        colores: [
            document.getElementById('color_primary').value,
            document.getElementById('color_secondary').value,
            document.getElementById('color_neutral').value
        ],
        logo_base64: document.getElementById('data-logo').value.includes('base64') ? document.getElementById('data-logo').value.split(',')[1] : document.getElementById('data-logo').value,
        google_slides_template_id: document.getElementById('config_slides_template_id') ? document.getElementById('config_slides_template_id').value : '',
        google_slides_folder_id: document.getElementById('config_slides_folder_id') ? document.getElementById('config_slides_folder_id').value : ''
    };

    try {
        const res = await authenticatedFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });
        const result = await res.json();
        if (result.status === 'success') {
            showAlert('success', 'Configuración de marca guardada de forma exitosa.');
            loadConfig(); // Reload styles and values
        }
    } catch (err) {
        showAlert('warning', 'Error al guardar la configuración: ' + err.message);
    }
}

// Dynamic Hotel Cards Additions
function addHotelCard(data = null) {
    const container = document.getElementById('hotels-container');
    const currentCards = container.querySelectorAll('.hotel-option-card');

    if (currentCards.length >= 2 && !isRestoringStateDetailed) {
        alert("Máximo 2 hoteles permitidos.");
        return;
    }

    hotelCount++;
    const cardId = `hotel-card-${hotelCount}`;

    const card = document.createElement('div');
    card.className = 'hotel-option-card bg-slate-50/60 border border-slate-200/80 rounded-xl p-5 relative flex flex-col justify-center gap-4 transition-all duration-300 hover:bg-slate-50';
    card.id = cardId;

    const starsVal = data ? (data.estrellas || data.hotel_estrellas || "★★★★☆") : "★★★★☆";

    const regimenVal = data ? (data.hotel_regimen || data.regimen || 'Desayuno incluido') : 'Desayuno incluido';
    const standardRegimens = ["All Inclusive", "Desayuno incluido", "Solo alojamiento", "Media Pension", "Desayuno y Cena incluidos"];

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

    let habitacionVal = data ? (data.hotel_habitacion || data.habitacion || '') : '';
    if (habitacionVal) {
        habitacionVal = formatHabitacionValue(habitacionVal);
    }

    let costVal = '';
    if (data) {
        const isSavedQuoteHotel = typeof data.precio_persona !== 'undefined' || typeof data.costo_neto !== 'undefined';
        if (isSavedQuoteHotel) {
            if (typeof data.costo_neto !== 'undefined' && data.costo_neto !== null && data.costo_neto !== '') {
                costVal = data.costo_neto;
            } else {
                // Reconstruct legacy quote net hotel cost: Costo Neto = (Costo Total - Total Aéreo - 1.05 * Monto Traslados) / 1.05
                const totalCost = parseFloat(data.costo) || 0;
                const flightCost = parseFloat(document.getElementById('monto_vuelos').value) || 0;
                const feeCost = parseFloat(document.getElementById('fee_aereo_monto').value) || 0;
                const transfersCost = parseFloat(document.getElementById('monto_traslados').value) || 0;
                const totalAereo = flightCost + feeCost;
                const reconstructed = (totalCost - totalAereo - 1.05 * transfersCost) / 1.05;
                costVal = Math.max(0, Math.round(reconstructed * 100) / 100);
            }
        } else {
            // From quick budget bridge or similar new quote init
            costVal = data.monto_alojamiento || data.costo || '';
        }
    }

    card.innerHTML = `
        <div class="flex items-center justify-between mb-1">
            <label class="hotel-recommended-label flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 cursor-pointer text-[10px] font-bold uppercase tracking-wider hover:bg-slate-200 transition-all select-none">
                <input type="radio" name="hotel-recommended" class="hotel-recommended-radio hidden" value="${cardId}" onchange="updateHotelBadges(); updateRealTimeSummary();">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                Recomendar
            </label>
            <button type="button" class="remove-hotel-btn text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all" onclick="removeHotelCard('${cardId}')">Eliminar Opción</button>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Hotel</label>
                <input type="text" class="hotel-nombre-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Bahia Principe" value="${data ? (data.hotel_nombre || data.nombre || '') : ''}" oninput="updateRealTimeSummary()" onblur="handleCapitalizationBlur(this)">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Categoría</label>
                <select class="hotel-estrellas-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white">
                    <option value="★★★★★" ${starsVal.includes('5') || starsVal === '★★★★★' ? 'selected' : ''}>5 Estrellas (★★★★★)</option>
                    <option value="★★★★☆" ${starsVal.includes('4') || starsVal === '★★★★☆' ? 'selected' : ''}>4 Estrellas (★★★★☆)</option>
                    <option value="★★★☆☆" ${starsVal.includes('3') || starsVal === '★★★☆☆' ? 'selected' : ''}>3 Estrellas (★★★☆☆)</option>
                    <option value="★★☆☆☆" ${starsVal.includes('2') || starsVal === '★★☆☆☆' ? 'selected' : ''}>2 Estrellas (★★☆☆☆)</option>
                </select>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Régimen</label>
                <select class="hotel-regimen-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white">
                    ${regimenOptionsHtml}
                </select>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <span>Habitación</span>
                    <div class="relative group inline-block">
                        <svg class="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-help transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] leading-normal font-semibold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 text-center normal-case tracking-normal">
                            Tipo de habitación cotizada (ej. Estándar, Vista al Mar, Suite).
                            <div class="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>
                    </div>
                </label>
                <input type="text" class="hotel-habitacion-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Estándar Vista Mar" value="${habitacionVal}" onblur="formatHabitacionInput(this)">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Costo</label>
                <div class="relative flex items-center">
                    <span class="absolute left-3 text-xs font-bold text-slate-400 pointer-events-none">USD</span>
                    <input type="number" class="hotel-costo-val w-full border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 text-sm font-semibold text-right focus:outline-none focus:border-brand-primary transition-all bg-white" min="0" step="0.01" required value="${costVal}" placeholder="0.00" oninput="updateRealTimeSummary()">
                </div>
            </div>
        </div>
        
        <div class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción</label>
            <div class="relative flex flex-col w-full">
                <textarea class="hotel-descripcion-val border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-brand-primary transition-all bg-white h-[80px] pr-28 resize-y w-full" required placeholder="Ej. Frente al mar..." style="line-height: 1.3;">${data ? (data.hotel_descripcion || data.descripcion || '') : ''}</textarea>
                <button type="button" class="btn-ia-optimize absolute bottom-1.5 right-1.5 text-[9px] px-2 py-1 bg-gradient-to-r from-brand-primary to-brand-accent text-white font-bold rounded-lg hover:shadow-sm active:scale-95 transition-all" onclick="optimizeDescription(this)">
                    Mejorar con IA
                </button>
            </div>
        </div>
        
        <div class="flex flex-col gap-2 w-full">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Imagen del Complejo</label>
            <div class="grid grid-cols-1 gap-4 w-full">
                <!-- Foto 1 -->
                <div class="dropzone relative overflow-hidden border-2 border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-4 bg-white flex flex-col items-center justify-center min-h-[110px] cursor-pointer transition-all duration-300 group w-full" id="dropzone-${cardId}-1" tabindex="0" onclick="triggerFileInput('file-${cardId}-1')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6 text-slate-400 group-hover:text-brand-primary mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    <span class="text-xs text-slate-500 font-semibold text-center leading-tight">Seleccionar imagen<br><span class="text-[10px] text-brand-primary/80">Ctrl+V para pegar</span></span>
                    <input type="file" id="file-${cardId}-1" accept="image/*" class="hidden" onchange="handleImageUpload(this, 'preview-${cardId}-1', 'data-${cardId}-1')">
                    <img id="preview-${cardId}-1" class="dropzone-preview absolute inset-0 w-full h-full object-cover rounded-xl" style="display: none;" alt="">
                    <input type="hidden" id="data-${cardId}-1" class="hotel-imagen-val-1">
                </div>
            </div>
        </div>
    `;

    container.appendChild(card);
    updateRemoveButtons();

    // Add Drag and Drop listeners to all new dropzones
    card.querySelectorAll('.dropzone').forEach(dz => {
        setupSingleDropzone(dz);
    });

    // Populate previews if data has images
    if (data) {
        const img1 = data.imagen1 || data.imagen;
        if (img1) {
            const previewEl = document.getElementById(`preview-${cardId}-1`);
            if (previewEl) {
                previewEl.src = img1;
                previewEl.style.display = 'block';
            }
            const dataEl = document.getElementById(`data-${cardId}-1`);
            if (dataEl) dataEl.value = img1;
            const dz1 = document.getElementById(`dropzone-${cardId}-1`);
            if (dz1) {
                const spanEl = dz1.querySelector('span');
                if (spanEl) spanEl.style.display = 'none';
                const svgEl = dz1.querySelector('svg');
                if (svgEl) svgEl.style.display = 'none';
            }
        }
    }

    // Bind helper to the cost input of this new card
    const costInput = card.querySelector('.hotel-costo-val');
    if (costInput) {
        bindInputHelper(costInput);
    }

    updateRealTimeSummary();
    updateHotelBadges();
}
window.addHotelCard = addHotelCard;

function removeHotelCard(cardId) {
    const card = document.getElementById(cardId);
    card.remove();
    updateRemoveButtons();
    updateRealTimeSummary();
    updateHotelBadges();
}
window.removeHotelCard = removeHotelCard;

function updateRemoveButtons() {
    const cards = document.getElementById('hotels-container').querySelectorAll('.hotel-option-card');
    cards.forEach(card => {
        const btn = card.querySelector('.remove-hotel-btn');
        if (cards.length === 1) {
            btn.classList.add('hidden');
            btn.classList.remove('block');
        } else {
            btn.classList.add('block');
            btn.classList.remove('hidden');
        }
    });
}

function triggerFileInput(id) {
    document.getElementById(id).click();
}
window.triggerFileInput = triggerFileInput;

// Client-side image resizing and compression
function handleImageUpload(fileInput, previewId, hiddenInputId) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            // Resize logic to maximum 800x600 for optimal Slides uploads
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

            // Draw image preserving transparency if PNG
            const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
            const mimeType = isPng ? 'image/png' : 'image/jpeg';

            ctx.drawImage(img, 0, 0, width, height);

            // Output compressed Base64 string
            const dataUrl = canvas.toDataURL(mimeType, isPng ? 0.85 : 0.75);

            // Set values
            const previewEl = document.getElementById(previewId);
            previewEl.src = dataUrl;
            previewEl.style.display = 'block';

            // Hide label text & icon
            const labelText = fileInput.parentElement.querySelector('span');
            if (labelText) labelText.style.display = 'none';
            const svgIcon = fileInput.parentElement.querySelector('svg');
            if (svgIcon) svgIcon.style.display = 'none';

            document.getElementById(hiddenInputId).value = dataUrl;
            saveDetailedQuoteFormState();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}
window.handleImageUpload = handleImageUpload;

// Drag & Drop Setup
function setupDragAndDrop() {
    document.querySelectorAll('.dropzone').forEach(dz => {
        setupSingleDropzone(dz);
    });
}

function setupSingleDropzone(dz) {
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
        const files = dt.files;
        const fileInput = dz.querySelector('input[type="file"]');

        if (files.length > 0) {
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

// Global paste listener on document
document.addEventListener('paste', e => {
    if (hoveredDropzone) {
        const files = e.clipboardData.files;
        if (files && files.length > 0) {
            e.preventDefault();
            const fileInput = hoveredDropzone.querySelector('input[type="file"]');
            if (fileInput) {
                fileInput.files = files;
                fileInput.dispatchEvent(new Event('change'));
            }
        }
    }
});

// Validation rules: Date checks
function validateDates() {
    const flightIda = getDatePickerValue('fecha_vuelo_ida');
    const flightVuelta = getDatePickerValue('fecha_vuelo_vuelta');

    if (flightIda && flightVuelta) {
        if (new Date(flightVuelta) < new Date(flightIda)) {
            showAlert('warning', 'La fecha de retorno no puede ser anterior a la fecha de ida.');
            return false;
        }
    }
    return true;
}
window.validateDates = validateDates;

function updateBaseLabel() {
    const count = parseInt(document.getElementById('cantidad_pasajeros').value) || 1;
    let base = "Single";
    if (count === 2) base = "Doble";
    else if (count === 3) base = "Triple";
    else if (count === 4) base = "Cuádruple";
    else if (count > 4) base = "Grupal";

    const resultsLabel = document.getElementById('res-basis-label');
    if (resultsLabel) resultsLabel.innerText = `Base ${base}`;
}
window.updateBaseLabel = updateBaseLabel;

function checkIfFormHasData() {
    if (isReadOnlyMode) {
        return false;
    }
    const pax = document.getElementById('nombre_pax')?.value || '';
    const dest = document.getElementById('destino')?.value || '';
    const flights = document.getElementById('monto_vuelos')?.value || '';
    const transfers = document.getElementById('monto_traslados')?.value || '';
    const dateIda = document.getElementById('fecha_vuelo_ida')?.value || '';
    const dateVuelta = document.getElementById('fecha_vuelo_vuelta')?.value || '';

    if (pax.trim() !== '' || dest.trim() !== '' || flights.trim() !== '' || transfers.trim() !== '' || dateIda.trim() !== '' || dateVuelta.trim() !== '') {
        return true;
    }

    const hotelCards = document.querySelectorAll('.hotel-option-card');
    for (let card of hotelCards) {
        const hName = card.querySelector('.hotel-nombre-val')?.value || '';
        const hCost = card.querySelector('.hotel-costo-val')?.value || '';
        const hDesc = card.querySelector('.hotel-descripcion-val')?.value || '';
        if (hName.trim() !== '' || hCost.trim() !== '' || hDesc.trim() !== '') {
            return true;
        }
    }

    return false;
}

// Real-time Cost Calculation and Sidebar Updates
function updateRealTimeSummary() {
    const cantPax = parseInt(document.getElementById('cantidad_pasajeros').value) || 1;
    const flightsCost = parseFloat(document.getElementById('monto_vuelos').value) || 0;
    const flightsFee = parseFloat(document.getElementById('fee_aereo_monto').value) || 0;
    const transfersCost = parseFloat(document.getElementById('monto_traslados').value) || 0;

    // Toggle "Limpiar Formulario" button visibility with smooth transitions
    const clearBtn = document.getElementById('btn-clear-form');
    if (clearBtn) {
        if (checkIfFormHasData()) {
            clearBtn.classList.remove('opacity-0', 'max-h-0', 'pointer-events-none', 'mt-0');
            clearBtn.classList.add('opacity-100', 'max-h-[100px]', 'pointer-events-auto', 'mt-2');
        } else {
            clearBtn.classList.remove('opacity-100', 'max-h-[100px]', 'pointer-events-auto', 'mt-2');
            clearBtn.classList.add('opacity-0', 'max-h-0', 'pointer-events-none', 'mt-0');
        }
    }

    const container = document.getElementById('realtime-breakdown-container');
    if (!container) return;

    const hotelCards = document.querySelectorAll('.hotel-option-card');
    if (hotelCards.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400 text-xs font-semibold">
                No hay hoteles agregados aún.
            </div>
        `;
        return;
    }

    const aereosTotal = flightsCost + flightsFee;

    // We will build a single comparative table
    let columnsHtml = '';
    let hotelNamesHtml = '';
    let flightsHtml = '';
    let feeHtml = '';
    let hotelCostsHtml = '';
    let transfersHtml = '';
    let adminFeesHtml = '';
    let roundingHtml = '';
    let totalsHtml = '';
    let perPersonHtml = '';

    const allHotelCards = Array.from(document.querySelectorAll('.hotel-option-card'));

    // Find which hotel is marked as recommended via radio button
    let recommendedIdx = 0;
    allHotelCards.forEach((card, idx) => {
        const radio = card.querySelector('.hotel-recommended-radio');
        if (radio && radio.checked) recommendedIdx = idx;
    });

    // Reorder: recommended first
    const orderedCards = [
        allHotelCards[recommendedIdx],
        ...allHotelCards.filter((_, idx) => idx !== recommendedIdx)
    ];

    orderedCards.forEach((card, idx) => {
        const hotelName = card.querySelector('.hotel-nombre-val').value.trim() || `Opción ${idx + 1}`;
        const hotelCost = parseFloat(card.querySelector('.hotel-costo-val').value) || 0;

        const adminFee = (hotelCost + transfersCost) * 0.05;
        const total = aereosTotal + hotelCost + transfersCost + adminFee;
        const perPerson = total / cantPax;

        const aplicarRedondeo = document.getElementById('aplicar_redondeo') ? document.getElementById('aplicar_redondeo').checked : true;
        const roundedPerPerson = aplicarRedondeo ? (Math.ceil(perPerson / 10) * 10) : perPerson;
        const roundedTotal = aplicarRedondeo ? (roundedPerPerson * cantPax) : total;
        const totalRoundingAdded = roundedTotal - total;

        const isRecomendado = idx === 0;  // first in ordered list is always the recommended
        const columnHeader = isRecomendado ? 'Recomendado' : `Opción ${idx + 1}`;

        columnsHtml += `
            <th class="py-2 px-2 text-right text-[9px] uppercase tracking-wider ${isRecomendado ? 'text-brand-primary font-extrabold' : 'text-slate-400 font-bold'} min-w-[80px]">${columnHeader}</th>
        `;

        hotelNamesHtml += `
            <th class="py-1.5 px-2 text-right text-[10px] font-bold text-slate-800 truncate max-w-[100px]" title="${hotelName}">${hotelName}</th>
        `;

        flightsHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${formatPriceES(flightsCost)}</td>
        `;

        feeHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">${flightsFee > 0 ? 'USD ' + formatPriceES(flightsFee) : '<span class="text-slate-300">—</span>'}</td>
        `;

        hotelCostsHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${formatPriceES(hotelCost)}</td>
        `;

        transfersHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${formatPriceES(transfersCost)}</td>
        `;

        adminFeesHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${formatPriceES(adminFee)}</td>
        `;

        roundingHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${formatPriceES(totalRoundingAdded)}</td>
        `;

        totalsHtml += `
            <td class="py-2.5 px-2 text-right text-xs ${isRecomendado ? 'text-brand-primary' : 'text-slate-800'} font-extrabold">USD ${formatPriceES(roundedTotal)}</td>
        `;

        perPersonHtml += `
            <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">USD ${formatPriceES(roundedPerPerson)}</td>
        `;
    });

    container.innerHTML = `
        <div class="w-full">
            <table class="w-full text-left border-collapse text-[10px] font-medium">
                <thead>
                    <tr class="border-b border-slate-200 text-slate-500 font-bold">
                        <th class="py-2 pr-2 text-[9px] uppercase tracking-wider text-slate-400 w-[95px]">Concepto</th>
                        ${columnsHtml}
                    </tr>
                    <tr class="border-b border-slate-100 text-slate-700">
                        <th class="py-1.5 pr-2 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Hotel</th>
                        ${hotelNamesHtml}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/avion.svg" class="w-3.5 h-3.5 icon-slate" alt="Vuelos">
                            <span class="truncate">Vuelos</span>
                        </td>
                        ${flightsHtml}
                    </tr>
                    <tr class="${flightsFee > 0 ? '' : 'opacity-40'}">
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/gastos.svg" class="w-3.5 h-3.5 icon-slate" alt="Fee Aéreo">
                            <span class="truncate">Fee Aéreo</span>
                        </td>
                        ${feeHtml}
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/cama.svg" class="w-3.5 h-3.5 icon-slate" alt="Alojamiento">
                            <span class="truncate">Alojamiento</span>
                        </td>
                        ${hotelCostsHtml}
                    </tr>
                    ${transfersCost > 0 ? `
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/traslados.svg" class="w-3.5 h-3.5 icon-slate" alt="Traslados">
                            <span class="truncate">Traslados</span>
                        </td>
                        ${transfersHtml}
                    </tr>
                    ` : ''}
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/gastos.svg" class="w-3.5 h-3.5 icon-slate" alt="Gastos Admin">
                            <span class="truncate">Gastos Admin (5%)</span>
                        </td>
                        ${adminFeesHtml}
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <img src="/assets/iconos/dinero.svg" class="w-3.5 h-3.5 icon-slate" alt="Redondeo">
                            <span class="truncate">Redondeo</span>
                        </td>
                        ${roundingHtml}
                    </tr>
                    <tr class="bg-slate-50/50 font-bold border-t border-slate-200">
                        <td class="py-2.5 pr-2 text-[10px] text-slate-800 uppercase tracking-wider flex items-center gap-1">
                            <img src="/assets/iconos/dinero.svg" class="w-3.5 h-3.5 icon-dark" alt="Total">
                            <span>Total</span>
                        </td>
                        ${totalsHtml}
                    </tr>
                    <tr class="bg-brand-primary/5 font-bold border-t border-brand-primary/10">
                        <td class="py-2.5 pr-2 text-[9px] text-brand-primary uppercase tracking-widest flex items-center gap-1">
                            <img src="/assets/iconos/persona.svg" class="w-3.5 h-3.5 icon-brand" alt="Por Pax">
                            <span class="truncate">Por Pax (${cantPax})</span>
                        </td>
                        ${perPersonHtml}
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    saveDetailedQuoteFormState();
}
window.updateRealTimeSummary = updateRealTimeSummary;

function scrollToPreview() {
    const resultsPanel = document.getElementById('results-panel');
    if (resultsPanel) {
        resultsPanel.scrollIntoView({ behavior: 'smooth' });
    }
}
window.scrollToPreview = scrollToPreview;

let currentPdfBlob = null;
let currentPdfFileName = '';

async function generatePDFPreview(e, isViewingSavedQuote = false) {
    if (e) e.preventDefault();
    if (!validateDates()) return;

    const imgIda = document.getElementById('data-vuelo-ida').value;
    const imgVuelta = document.getElementById('data-vuelo-vuelta').value;
    if (!imgIda || !imgVuelta) {
        showAlert('warning', 'Debe adjuntar una captura/foto obligatoria para cada tramo de vuelo (Ida y Vuelta).');
        return;
    }

    const paxNameForLoading = document.getElementById('nombre_pax').value || 'Pasajero';

    const formTab = document.getElementById('cotizacion-tab');
    if (formTab) {
        formTab.classList.add('hidden');
    }

    if (isViewingSavedQuote) {
        window.showLoader(`Cargando cotización para ${paxNameForLoading}`);
    } else {
        window.showLoader(`Creando la cotización para ${paxNameForLoading}`);
    }

    let payload = _buildPayload();

    // Auto-save to Supabase first before generating PDF preview
    // ONLY if the form is NOT in read-only mode (which means it has been edited or is a new quote)
    if (!isReadOnlyMode) {
        try {
            window.showLoader(`Guardando en la base de datos...`);
            const saveRes = await authenticatedFetch('/api/cotizaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (saveRes.ok) {
                const savedQuote = await saveRes.json();
                currentQuoteId = savedQuote.id;
                payload.id = currentQuoteId; // Include the generated ID in subsequent PDF payload
                updateEditingIndicator();
                console.log("Auto-save to Supabase completed successfully. ID:", currentQuoteId);
            } else {
                console.warn("Auto-save to Supabase returned error status. Proceeding with preview.");
            }
        } catch (saveErr) {
            console.warn("Auto-save to Supabase failed (persistence disabled or network error):", saveErr);
        }
    } else {
        console.log("Form is in Read-only mode. Skipping auto-save to Supabase.");
    }

    if (isViewingSavedQuote) {
        window.showLoader(`Cargando cotización para ${paxNameForLoading}`);
    } else {
        window.showLoader(`Generando cotización para ${paxNameForLoading}...`);
    }

    try {
        const res = await authenticatedFetch('/api/cotizar-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al generar el PDF');
        }

        const blob = await res.blob();
        currentPdfBlob = blob;

        window.hideLoader();

        // Update PDF iframe preview source
        const url = window.URL.createObjectURL(blob);
        currentPdfUrl = url;
        const iframe = document.getElementById('pdf-preview-iframe');
        if (iframe) {
            iframe.src = url;
        }

        // Build filename for future download
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const fecha = `${dd}-${mm}-${yyyy}`;
        const hora = `${hh}-${min}-${ss}`;
        const paxName = (document.getElementById('nombre_pax').value || 'Pasajero').replace(/[\/\\]/g, '-');
        const destName = (document.getElementById('destino').value || 'Destino').replace(/[\/\\]/g, '-');
        currentPdfFileName = `Cotización para ${paxName} - ${destName} - ${fecha}_${hora}.pdf`;

        // Calculate dynamic total price for results display (from payload)
        const cantPax = payload.cantidad_pasajeros || 1;
        const flightsCost = payload.monto_vuelos || 0;
        const flightsFee = payload.fee_aereo || 0;
        const transfersCost = payload.monto_traslados || 0;
        const aereosTotal = flightsCost + flightsFee;

        const primaryHotel = payload.hoteles[0];
        const hotelCost = primaryHotel ? primaryHotel.costo : 0;
        const adminFee = (hotelCost + transfersCost) * 0.05;
        const total = aereosTotal + hotelCost + transfersCost + adminFee;
        const perPerson = total / cantPax;
        const aplicarRedondeo = document.getElementById('aplicar_redondeo') ? document.getElementById('aplicar_redondeo').checked : true;
        const roundedPerPerson = aplicarRedondeo ? (Math.ceil(perPerson / 10) * 10) : perPerson;
        const roundedTotal = aplicarRedondeo ? (roundedPerPerson * cantPax) : total;

        const elTotal = document.getElementById('res-total-price');
        if (elTotal) elTotal.innerText = `USD ${formatPriceES(roundedTotal)}`;
        const elPax = document.getElementById('res-pax-price');
        if (elPax) elPax.innerText = `USD ${formatPriceES(roundedPerPerson)} / Pax`;
        updateBaseLabel();

        window.lastGeneratedPdfUrl = url;
        window.lastGeneratedQuote = {
            id: currentQuoteId,
            nombre_pax: payload.nombre_pax,
            destino: payload.destino,
            agente_nombre: payload.agente_nombre || window.loggedInUser,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        window.currentPdfBlob = blob;
        window.currentPdfUrl = url;
        window.currentPdfFileName = currentPdfFileName;

        sessionStorage.removeItem('detailedQuoteFormState');
        navigateTo('/ver-cotizacion?id=' + currentQuoteId);
    } catch (err) {
        window.hideLoader();
        const formTab = document.getElementById('cotizacion-tab');
        if (formTab) {
            formTab.classList.remove('hidden');
        }
        showAlert('warning', 'Error al generar el PDF: ' + err.message);
    }
}
window.generatePDFPreview = generatePDFPreview;

function downloadPDFBlob() {
    const blob = window.currentPdfBlob;
    const filename = window.currentPdfFileName;
    if (!blob) {
        showAlert('warning', 'No hay ningún PDF generado para descargar.');
        return;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Cotizacion.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showAlert('success', '✔ PDF descargado con éxito.');
}
window.downloadPDFBlob = downloadPDFBlob;

function openPDFInNewTab() {
    const url = window.currentPdfUrl;
    if (url) {
        window.open(url, '_blank');
    } else {
        showAlert('warning', 'No hay ningún PDF generado para abrir.');
    }
}
window.openPDFInNewTab = openPDFInNewTab;


// Build payload from form (shared between Slides and PDF)
function _buildPayload() {
    const imgIda = document.getElementById('data-vuelo-ida').value;
    const imgVuelta = document.getElementById('data-vuelo-vuelta').value;
    const aplicarRedondeo = document.getElementById('aplicar_redondeo') ? document.getElementById('aplicar_redondeo').checked : true;

    const payload = {
        nombre_pax: document.getElementById('nombre_pax').value,
        destino: document.getElementById('destino').value,
        cantidad_pasajeros: parseInt(document.getElementById('cantidad_pasajeros').value),
        fecha_salida: formatDatePickerDate(getDatePickerValue('fecha_vuelo_ida')),
        origen: document.getElementById('origen').value,
        agente_nombre: window.loggedInUser || 'Uriel',
        fecha_vuelo_ida: formatDatePickerDate(getDatePickerValue('fecha_vuelo_ida')),
        fecha_vuelo_vuelta: formatDatePickerDate(getDatePickerValue('fecha_vuelo_vuelta')),
        validez_cotizacion: formatDatePickerDate(getDatePickerValue('validez_cotizacion')),
        img_vuelo_ida: imgIda,
        img_vuelo_vuelta: imgVuelta,
        monto_vuelos: parseFloat(document.getElementById('monto_vuelos').value),
        fee_aereo: parseFloat(document.getElementById('fee_aereo_monto').value),
        monto_traslados: parseFloat(document.getElementById('monto_traslados').value),
        gastos_iva: 0.0,
        equipaje: selectedBaggage,
        redondear: aplicarRedondeo,
        hoteles: []
    };

    if (currentQuoteId) {
        payload.id = currentQuoteId;
    }

    const hotelCards = Array.from(document.querySelectorAll('.hotel-option-card'));

    // Find the recommended (starred) hotel index
    let recommendedIdx = 0;
    hotelCards.forEach((card, idx) => {
        const radio = card.querySelector('.hotel-recommended-radio');
        if (radio && radio.checked) {
            recommendedIdx = idx;
        }
    });

    // Reorder: recommended first, then the rest in original order
    const orderedCards = [
        hotelCards[recommendedIdx],
        ...hotelCards.filter((_, idx) => idx !== recommendedIdx)
    ];

    orderedCards.forEach(card => {
        payload.hoteles.push({
            nombre: card.querySelector('.hotel-nombre-val').value,
            estrellas: card.querySelector('.hotel-estrellas-val').value,
            regimen: card.querySelector('.hotel-regimen-val').value,
            habitacion: formatHabitacionValue(card.querySelector('.hotel-habitacion-val').value),
            costo: parseFloat(card.querySelector('.hotel-costo-val').value),
            descripcion: card.querySelector('.hotel-descripcion-val').value,
            imagen1: card.querySelector('.hotel-imagen-val-1').value,
            imagen2: "",
            imagen3: "",
            redondear: aplicarRedondeo
        });
    });

    return payload;
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

function formatDatePickerDate(val) {
    if (!val) return "";
    val = val.trim();
    if (val.includes('/')) {
        return val;
    }
    if (val.includes('-')) {
        const parts = val.split('-');
        if (parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            return `${parts[0]}/${parts[1]}/${parts[2]}`;
        }
    }
    return val;
}

// Excel upload handler
async function handleExcelImport(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    window.showLoader('Analizando archivo Excel / CSV...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await authenticatedFetch('/api/importar-excel', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al importar archivo');
        }

        const quotes = await res.json();
        importedQuotes = quotes;
        window.hideLoader();

        // Populate results table
        const tbody = document.getElementById('import-table-body');
        tbody.innerHTML = '';

        quotes.forEach((q, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-100 hover:bg-slate-50/50';
            tr.innerHTML = `
                <td class="p-3 font-semibold">${q.nombre_pax}</td>
                <td class="p-3">${q.destino}</td>
                <td class="p-3">${q.fecha_salida}</td>
                <td class="p-3">USD ${formatPriceES(q.monto_vuelos)}</td>
                <td class="p-3">USD ${formatPriceES(q.monto_alojamiento)}</td>
                <td class="p-3 font-semibold text-brand-primary">USD ${formatPriceES(q.costo_total)}</td>
                <td class="p-3">USD ${formatPriceES(q.precio_persona)}</td>
                <td class="p-3">
                    <button class="px-3 py-1 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all" onclick="loadImportedQuoteIntoForm(${idx})">Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('import-results-panel').classList.remove('hidden');
        document.getElementById('import-results-panel').classList.add('block');
    } catch (err) {
        window.hideLoader();
        alert('Error: ' + err.message);
    }
}
window.handleExcelImport = handleExcelImport;

function loadImportedQuoteIntoForm(idx) {
    const q = importedQuotes[idx];
    if (!q) return;
    switchTab('cotizacion-tab');

    // Fill general fields
    document.getElementById('nombre_pax').value = q.nombre_pax;
    document.getElementById('destino').value = q.destino;
    document.getElementById('cantidad_pasajeros').value = q.cantidad_pasajeros;
    document.getElementById('origen').value = q.origen;

    // Format date DD/MM/YYYY to YYYY-MM-DD for picker
    const setDateSafe = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        const pickerVal = formatToPicker(val);
        if (el._flatpickr) {
            el._flatpickr.setDate(pickerVal);
        } else {
            el.value = pickerVal;
        }
    };
    setDateSafe('fecha_salida', q.fecha_salida);
    setDateSafe('fecha_vuelo_ida', q.fecha_vuelo_ida || q.fecha_salida);
    setDateSafe('fecha_vuelo_vuelta', q.fecha_vuelo_vuelta);
    setDateSafe('validez_cotizacion', q.validez_cotizacion || '');

    // Pricing
    document.getElementById('monto_vuelos').value = q.monto_vuelos;
    document.getElementById('monto_traslados').value = q.monto_traslados;

    // Determine fee
    document.getElementById('fee_aereo_tipo').value = 'fixed';
    document.getElementById('fee_aereo_monto').value = q.fee_aereo || (q.monto_vuelos * (q.fee_aereo_percent || 10.0) / 100.0);
    toggleFeeType();

    // Clear dynamic hotels and load this one
    document.getElementById('hotels-container').innerHTML = '';
    addHotelCard(q);

    showAlert('success', `Datos de ${q.nombre_pax} cargados en el formulario de edición.`);
    updateRealTimeSummary();
}
window.loadImportedQuoteIntoForm = loadImportedQuoteIntoForm;

function formatToPicker(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }
    return dateStr;
}

// AI Description Optimizer Frontend API Caller
async function optimizeDescription(btn) {
    const wrapper = btn.parentElement;
    const textarea = wrapper.querySelector('.hotel-descripcion-val');
    const originalText = textarea.value.trim();
    if (!originalText) {
        alert("Por favor, escribe una descripción básica primero para que la IA la optimice.");
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
        const res = await authenticatedFetch('/api/optimizar-descripcion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion: originalText })
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al optimizar');
        }

        const data = await res.json();
        textarea.value = data.descripcion_optimizada;
        saveDetailedQuoteFormState();
    } catch (err) {
        alert("Error al optimizar la descripción: " + err.message);
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1.0';
        btn.innerHTML = originalBtnContent;
    }
}
window.optimizeDescription = optimizeDescription;


function confirmNewQuote() {
    showCustomConfirm({
        title: '¿Limpiar formulario?',
        desc: 'Se borrarán todos los datos cargados en el formulario actual para iniciar una nueva cotización. Esta acción no se puede deshacer.',
        btnText: 'Sí, Limpiar',
        callback: () => {
            currentQuoteId = null;
            enableFormEditing(true); // Habilitar formulario para la nueva cotización
            resetForm();
            switchTab('cotizacion-tab');
            showAlert('success', 'Formulario reiniciado. Listo para crear una nueva cotización.');
        },
        cancelCallback: () => {
            switchTab('cotizacion-tab');
            showAlert('info', 'Permaneces en el formulario actual con los datos ingresados.');
        }
    });
}
window.confirmNewQuote = confirmNewQuote;



function resetForm() {
    sessionStorage.removeItem('detailedQuoteFormState');
    // Clear general details
    document.getElementById('nombre_pax').value = '';
    document.getElementById('destino').value = '';
    document.getElementById('cantidad_pasajeros').value = '';
    const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
    if (aplicarRedondeoEl) aplicarRedondeoEl.checked = false;

    const clearDateSafe = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el._flatpickr) {
            el._flatpickr.clear();
        } else {
            el.value = '';
        }
    };
    clearDateSafe('fecha_salida');
    clearDateSafe('fecha_vuelo_ida');
    clearDateSafe('fecha_vuelo_vuelta');
    clearDateSafe('validez_cotizacion');

    // Reset flight dropzones
    const resetDropzone = (dropzoneId, previewId, dataId) => {
        const dataEl = document.getElementById(dataId);
        if (dataEl) dataEl.value = '';

        const preview = document.getElementById(previewId);
        if (preview) {
            preview.src = '';
            preview.style.display = 'none';
        }

        const dz = document.getElementById(dropzoneId);
        if (dz) {
            const span = dz.querySelector('span');
            if (span) span.style.display = 'block';
            const svg = dz.querySelector('svg');
            if (svg) svg.style.display = 'block';
        }
    };

    resetDropzone('dropzone-vuelo-ida', 'preview-vuelo-ida', 'data-vuelo-ida');
    resetDropzone('dropzone-vuelo-vuelta', 'preview-vuelo-vuelta', 'data-vuelo-vuelta');

    // Clear flights costs
    document.getElementById('monto_vuelos').value = '';
    document.getElementById('fee_aereo_monto').value = '';
    document.getElementById('monto_traslados').value = '';

    // Clear and reset hotels
    const container = document.getElementById('hotels-container');
    if (container) {
        container.innerHTML = '';
    }
    hotelCount = 0;
    addHotelCard();

    // Hide results
    const results = document.getElementById('results-panel');
    if (results) {
        results.classList.add('hidden');
        results.classList.remove('block');
    }
    const btnScroll = document.getElementById('btn-scroll-to-preview');
    if (btnScroll) {
        btnScroll.style.display = 'none';
    }

    // Reset baggage selection
    setBaggageSelection([]);

    // Update summary
    updateRealTimeSummary();

    // Switch to tab
    switchTab('cotizacion-tab');
}
window.resetForm = resetForm;

// V3 Functional Additions

let selectedBaggage = [];

function updateBaggageUI(type, isActive) {
    const btn = document.getElementById(`btn-bag-${type}`);
    if (!btn) return;

    const span = btn.querySelector('span');
    const iconContainer = btn.querySelector('.icon-container');
    const checkDot = btn.querySelector('.check-dot');
    const img = btn.querySelector('img');

    if (isActive) {
        btn.classList.remove('border-slate-200/80', 'bg-white/40', 'hover:bg-white/60');
        btn.classList.add('border-emerald-500/30', 'bg-emerald-500/5', 'hover:bg-emerald-500/10', 'active');

        if (span) {
            span.classList.remove('text-slate-600');
            span.classList.add('text-emerald-700');
        }
        if (iconContainer) {
            iconContainer.classList.remove('bg-slate-100/80', 'text-slate-400');
            iconContainer.classList.add('bg-emerald-500/10', 'text-emerald-600');
        }
        if (checkDot) {
            checkDot.classList.remove('hidden');
        }
        if (img) {
            img.style.filter = 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(130deg) brightness(95%) contrast(92%)';
            img.classList.remove('opacity-60');
            img.classList.add('opacity-100');
        }
    } else {
        btn.classList.remove('border-emerald-500/30', 'bg-emerald-500/5', 'hover:bg-emerald-500/10', 'active');
        btn.classList.add('border-slate-200/80', 'bg-white/40', 'hover:bg-white/60');

        if (span) {
            span.classList.remove('text-emerald-700');
            span.classList.add('text-slate-600');
        }
        if (iconContainer) {
            iconContainer.classList.remove('bg-emerald-500/10', 'text-emerald-600');
            iconContainer.classList.add('bg-slate-100/80', 'text-slate-400');
        }
        if (checkDot) {
            checkDot.classList.add('hidden');
        }
        if (img) {
            img.style.filter = '';
            img.classList.remove('opacity-100');
            img.classList.add('opacity-60');
        }
    }
}
window.updateBaggageUI = updateBaggageUI;

function toggleBaggage(type) {
    const btn = document.getElementById(`btn-bag-${type}`);
    if (!btn) return;

    const idx = selectedBaggage.indexOf(type);
    let isActive = false;
    if (idx > -1) {
        selectedBaggage.splice(idx, 1);
    } else {
        selectedBaggage.push(type);
        isActive = true;
    }

    updateBaggageUI(type, isActive);

    document.getElementById('equipaje_seleccionado').value = JSON.stringify(selectedBaggage);
    updateRealTimeSummary();
}
window.toggleBaggage = toggleBaggage;

function setBaggageSelection(arr) {
    selectedBaggage = [];
    ['mano', 'carry', 'valija'].forEach(type => {
        updateBaggageUI(type, false);
    });

    if (Array.isArray(arr)) {
        arr.forEach(type => {
            selectedBaggage.push(type);
            updateBaggageUI(type, true);
        });
    }
    document.getElementById('equipaje_seleccionado').value = JSON.stringify(selectedBaggage);
}
window.setBaggageSelection = setBaggageSelection;

function setupSidebarResizer() {
    const resizer = document.getElementById('layout-resizer');
    const sidebar = document.getElementById('sidebar-container');
    if (!resizer || !sidebar) return;

    // Load initial width from localStorage if exists
    try {
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            sidebarWidth = parseInt(savedWidth);
            const isCollapsed = sidebar.classList.contains('w-0') || sidebar.style.width === '0px';
            if (!isCollapsed) {
                sidebar.style.width = `${sidebarWidth}px`;
                sidebar.style.minWidth = `${sidebarWidth}px`;
                sidebar.style.maxWidth = `${sidebarWidth}px`;
            }
        }
    } catch (e) {
        console.warn('localStorage is not accessible:', e);
    }

    resizer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Left click only
        e.preventDefault(); // Prevent text selection/drag behaviors

        isDraggingSidebar = true;
        document.body.classList.add('is-resizing');
        resizer.classList.add('is-dragging');

        const startWidth = sidebar.getBoundingClientRect().width;
        const startX = e.clientX;

        function onMouseMove(moveEvent) {
            if (!isDraggingSidebar) return;
            const deltaX = moveEvent.clientX - startX;
            // Moving left (negative deltaX) increases width of right-positioned sidebar
            let newWidth = startWidth - deltaX;

            const minW = 280;
            const maxW = 600;
            if (newWidth < minW) newWidth = minW;
            if (newWidth > maxW) newWidth = maxW;

            sidebarWidth = newWidth;
            sidebar.style.width = `${newWidth}px`;
            sidebar.style.minWidth = `${newWidth}px`;
            sidebar.style.maxWidth = `${newWidth}px`;
        }

        function onMouseUp() {
            isDraggingSidebar = false;
            document.body.classList.remove('is-resizing');
            resizer.classList.remove('is-dragging');

            try {
                localStorage.setItem('sidebarWidth', sidebarWidth);
            } catch (e) {
                console.warn('localStorage is not accessible:', e);
            }

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}
window.setupSidebarResizer = setupSidebarResizer;

async function handlePDFEditImport(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    window.showLoader('Extrayendo metadatos del PDF...');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await authenticatedFetch('/api/extraer-pdf', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Error al extraer los datos del PDF.');
        }

        const data = await response.json();
        if (!data) throw new Error("No se encontraron metadatos en el PDF.");

        // Set quote ID if it exists in metadata
        currentQuoteId = data.id || null;
        updateEditingIndicator();

        // Populating basic data
        document.getElementById('nombre_pax').value = data.nombre_pax || '';
        document.getElementById('destino').value = data.destino || '';
        document.getElementById('cantidad_pasajeros').value = data.cantidad_pasajeros || 1;
        document.getElementById('origen').value = data.origen || 'Córdoba';
        const agentEl = document.getElementById('agente_nombre');
        if (agentEl) agentEl.value = data.agente_nombre || 'Uriel';
        const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
        if (aplicarRedondeoEl) {
            aplicarRedondeoEl.checked = typeof data.redondear !== 'undefined' ? data.redondear : true;
        }

        const formatToPicker = (val) => {
            if (!val) return '';
            if (val.includes('-')) return val; // already YYYY-MM-DD
            if (val.includes('/')) {
                const parts = val.split('/');
                return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
            }
            return val;
        };

        // Update Flatpickr date fields
        const flightIdaStr = formatToPicker(data.fecha_vuelo_ida);
        document.getElementById('fecha_vuelo_ida')._flatpickr.setDate(flightIdaStr);
        if (flightIdaStr && document.getElementById('fecha_vuelo_vuelta')._flatpickr) {
            document.getElementById('fecha_vuelo_vuelta')._flatpickr.set('minDate', flightIdaStr);
        }
        document.getElementById('fecha_vuelo_vuelta')._flatpickr.setDate(formatToPicker(data.fecha_vuelo_vuelta));
        if (document.getElementById('validez_cotizacion') && document.getElementById('validez_cotizacion')._flatpickr) {
            document.getElementById('validez_cotizacion')._flatpickr.setDate(formatToPicker(data.validez_cotizacion || ''));
        }

        // Costs
        document.getElementById('monto_vuelos').value = data.monto_vuelos || '';
        document.getElementById('fee_aereo_monto').value = data.fee_aereo || '';
        document.getElementById('monto_traslados').value = data.monto_traslados || '';

        if (data.fee_aereo) {
            document.getElementById('fee_aereo_tipo').value = 'fixed';
        } else {
            document.getElementById('fee_aereo_tipo').value = 'auto';
        }
        toggleFeeType();

        // Baggage selection
        setBaggageSelection(data.equipaje || []);

        // Flight Images
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

        populateImage('preview-vuelo-ida', 'data-vuelo-ida', 'dropzone-vuelo-ida', data.img_vuelo_ida);
        populateImage('preview-vuelo-vuelta', 'data-vuelo-vuelta', 'dropzone-vuelo-vuelta', data.img_vuelo_vuelta);

        // Hotels
        const hotelsContainer = document.getElementById('hotels-container');
        hotelsContainer.innerHTML = ''; // Clear existing hotels
        hotelCount = 0; // Reset counter

        const hotels = data.hoteles || [];
        isRestoringStateDetailed = true;
        if (hotels.length === 0) {
            addHotelCard();
        } else {
            hotels.forEach(h => {
                addHotelCard(h);
            });
        }
        isRestoringStateDetailed = false;

        // Scroll & feedback
        updateRealTimeSummary();
        switchTab('cotizacion-tab');
        showAlert('success', 'Cotización importada con éxito del PDF.');

    } catch (e) {
        console.error(e);
        showAlert('error', e.message || 'Error al importar la cotización.');
    } finally {
        window.hideLoader();
        inputEl.value = ''; // Reset file input
    }
}
window.handlePDFEditImport = handlePDFEditImport;

async function fillTestData() {
    // 1. Reset form
    resetForm();

    // 2. Populate general fields
    document.getElementById('nombre_pax').value = 'Cotización de prueba';
    document.getElementById('destino').value = 'Prueba';
    document.getElementById('cantidad_pasajeros').value = 2;
    document.getElementById('origen').value = 'Córdoba';
    const agentEl = document.getElementById('agente_nombre');
    if (agentEl) agentEl.value = 'Uriel';
    const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
    if (aplicarRedondeoEl) aplicarRedondeoEl.checked = true;

    // Calculate sample dates
    const today = new Date();

    // Departure date = today + 30 days
    const departureDate = new Date(today);
    departureDate.setDate(today.getDate() + 30);

    // Return date = today + 37 days
    const returnDate = new Date(today);
    returnDate.setDate(today.getDate() + 37);

    // Validity date = today + 5 days
    const validityDate = new Date(today);
    validityDate.setDate(today.getDate() + 5);

    // Format helper to YYYY-MM-DD
    const toYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const r = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${r}`;
    };

    // Set dates in Flatpickr instances
    const depDateStr = toYMD(departureDate);
    document.getElementById('fecha_vuelo_ida')._flatpickr.setDate(depDateStr);
    if (depDateStr && document.getElementById('fecha_vuelo_vuelta')._flatpickr) {
        document.getElementById('fecha_vuelo_vuelta')._flatpickr.set('minDate', depDateStr);
    }
    document.getElementById('fecha_vuelo_vuelta')._flatpickr.setDate(toYMD(returnDate));
    document.getElementById('validez_cotizacion')._flatpickr.setDate(toYMD(validityDate));

    // 3. Set flight costs & fees
    document.getElementById('monto_vuelos').value = '1250.00';
    document.getElementById('fee_aereo_tipo').value = 'auto';
    document.getElementById('monto_traslados').value = '150.00';
    toggleFeeType(); // Trigger auto calculation

    // 4. Select baggage
    setBaggageSelection(['mano', 'carry']);

    // 5. Fetch mock base64 images from assets/test
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
            console.error("Error loading test image:", url, err);
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // Fallback
        }
    };

    // Fetch images in parallel
    const [imgIdaB64, imgVueltaB64, hotel1B64, hotel2B64] = await Promise.all([
        getBase64FromUrl('/assets/test/tramo-ida.png'),
        getBase64FromUrl('/assets/test/tramo-vuelta.png'),
        getBase64FromUrl('/assets/test/hotel-test-1.jpg'),
        getBase64FromUrl('/assets/test/hotel-test-2.avif')
    ]);

    const setMockFlightImage = (previewId, dataId, dropzoneId, b64) => {
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

    // 6. Clear and load mock hotels
    const hotelsContainer = document.getElementById('hotels-container');
    hotelsContainer.innerHTML = '';
    hotelCount = 0;

    // Add Hotel 1 (Nuestra recomendación)
    addHotelCard({
        nombre: 'Lopesan Costa Bávaro',
        estrellas: '5',
        habitacion: 'Junior Suite Tropical',
        regimen: 'Todo Incluido',
        costo: 2450.00,
        descripcion: 'Espectacular resort de 5 estrellas con infinitas piscinas frente a la playa de arena blanca, múltiples restaurantes gourmet y actividades todo el día.',
        imagen1: hotel1B64
    });

    // Add Hotel 2
    addHotelCard({
        nombre: 'Barceló Bávaro Palace',
        estrellas: '4',
        habitacion: 'Superior Room',
        regimen: 'Todo Incluido',
        costo: 2100.00,
        descripcion: 'Resort ideal con campo de golf, parque acuático, spa de primer nivel y acceso directo a una de las 10 mejores playas del mundo.',
        imagen1: hotel2B64
    });

    // 7. Update base label & real-time summary
    updateBaseLabel();
    updateRealTimeSummary();

    showAlert('success', '✔ Datos de prueba cargados correctamente con fotos de prueba.');
}
window.fillTestData = fillTestData;

// ── CRUD Functions for Supabase ──

let allSavedQuickQuotes = [];
let savedQuotesActiveTab = 'detalladas';

async function loadSavedQuotesList() {
    const wrapper = document.getElementById('db-quotes-table-wrapper');
    const tbody = document.getElementById('db-quotes-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('quote-search-input');
    if (searchInput) searchInput.value = '';

    updateTabButtonsUI();

    // 1. Fade out the table wrapper
    if (wrapper) {
        wrapper.classList.add('tab-transition-hidden');
    }

    // 2. Wait 200ms for the fade-out to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // 3. Set the loading spinner inside the table
    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="p-8 text-center text-slate-400">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-slow animate-spin inline mr-2 text-brand-primary"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                Cargando base de datos...
            </td>
        </tr>
    `;

    // 4. Fade back in to show the spinner smoothly
    if (wrapper) {
        wrapper.offsetHeight; // Force reflow
        wrapper.classList.remove('tab-transition-hidden');
    }

    try {
        // Fetch detailed and quick budgets in parallel
        const [resQuotes, resQuick] = await Promise.all([
            authenticatedFetch('/api/cotizaciones'),
            authenticatedFetch('/api/presupuestos')
        ]);

        if (!resQuotes.ok) throw new Error("Error al obtener las cotizaciones detalladas.");
        if (!resQuick.ok) throw new Error("Error al obtener los presupuestos rápidos.");

        allSavedQuotes = await resQuotes.json();
        allSavedQuickQuotes = await resQuick.json();

        // 5. Once loaded, fade out again before swapping the rows
        if (wrapper) {
            wrapper.classList.add('tab-transition-hidden');
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        // Render the actual data
        renderActiveTabTable();

        // 6. Fade back in with the fresh data!
        if (wrapper) {
            wrapper.offsetHeight; // Force reflow
            wrapper.classList.remove('tab-transition-hidden');
        }
    } catch (err) {
        if (wrapper) {
            wrapper.classList.add('tab-transition-hidden');
        }
        await new Promise(resolve => setTimeout(resolve, 200));

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="p-8 text-center text-rose-500 font-bold">
                    Error al cargar los datos: ${err.message}
                </td>
            </tr>
        `;

        if (wrapper) {
            wrapper.offsetHeight;
            wrapper.classList.remove('tab-transition-hidden');
        }
    }
}

function updateTabButtonsUI() {
    const tabDetalladas = document.getElementById('tab-detalladas');
    const tabRapidos = document.getElementById('tab-rapidos');
    const searchInput = document.getElementById('quote-search-input');
    if (!tabDetalladas || !tabRapidos) return;

    if (savedQuotesActiveTab === 'detalladas') {
        tabDetalladas.className = "px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-t-2xl border-t border-x border-slate-200 bg-white text-slate-800 -mb-[1px] relative z-20 cursor-pointer flex items-center gap-2 transition-all duration-200 ease-in-out";
        tabRapidos.className = "px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-t-2xl border-t border-x border-transparent bg-slate-100/50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 -mb-[1px] relative z-10 cursor-pointer flex items-center gap-2 transition-all duration-200 ease-in-out";
        if (searchInput) searchInput.placeholder = "Buscar por pasajero o destino...";
    } else {
        tabDetalladas.className = "px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-t-2xl border-t border-x border-transparent bg-slate-100/50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 -mb-[1px] relative z-10 cursor-pointer flex items-center gap-2 transition-all duration-200 ease-in-out";
        tabRapidos.className = "px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-t-2xl border-t border-x border-slate-200 bg-white text-slate-800 -mb-[1px] relative z-20 cursor-pointer flex items-center gap-2 transition-all duration-200 ease-in-out";
        if (searchInput) searchInput.placeholder = "Buscar por pasajero...";
    }
}

function switchSavedQuotesTab(tabName) {
    if (savedQuotesActiveTab === tabName) return;

    const wrapper = document.getElementById('db-quotes-table-wrapper');
    if (wrapper) {
        wrapper.classList.add('tab-transition-hidden');
    }

    setTimeout(() => {
        savedQuotesActiveTab = tabName;

        // Clear search bar
        const searchInput = document.getElementById('quote-search-input');
        if (searchInput) searchInput.value = '';

        updateTabButtonsUI();
        renderActiveTabTable();

        if (wrapper) {
            // Force reflow
            wrapper.offsetHeight;
            wrapper.classList.remove('tab-transition-hidden');
        }
    }, 200);
}
window.switchSavedQuotesTab = switchSavedQuotesTab;

function renderActiveTabTable(customFilteredList = null) {
    const thead = document.getElementById('db-quotes-table-header');
    const tbody = document.getElementById('db-quotes-table-body');
    if (!thead || !tbody) return;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (savedQuotesActiveTab === 'detalladas') {
        // Detailed headers (no text for delete column header)
        thead.innerHTML = `
            <tr class="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th class="p-3 hidden sm:table-cell">Fecha Creado</th>
                <th class="p-3">Pasajero</th>
                <th class="p-3">Destino</th>
                <th class="p-3 hidden md:table-cell">Agente</th>
                <th class="p-3 hidden sm:table-cell">Fecha Salida</th>
                <th class="p-3 text-right">Costo Total</th>
                <th class="w-12 p-3"></th>
            </tr>
        `;

        const list = customFilteredList || allSavedQuotes;
        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400 font-semibold">
                        No se encontraron cotizaciones detalladas.
                    </td>
                </tr>
            `;
            return;
        }

        const displayList = list.slice(0, 10);
        displayList.forEach(q => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-100 hover:bg-rose-50/40 transition-colors duration-150 cursor-pointer';
            tr.setAttribute('onclick', `navigateTo('/ver-cotizacion?id=${q.id}')`);

            let fechaSalidaFormatted = q.fecha_salida || '';
            if (fechaSalidaFormatted.includes('-')) {
                const parts = fechaSalidaFormatted.split('-');
                if (parts.length === 3) fechaSalidaFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            const totalUSD = q.costo_total || 0;
            const fechaCreadoFormatted = formatCreatedAt(q.created_at);

            const currentUser = (window.loggedInUser || '').toLowerCase();
            const quoteOwner = (q.agente_nombre || '').toLowerCase();
            const isOwner = currentUser && quoteOwner && (currentUser === quoteOwner);

            const deleteButtonHtml = isOwner ? `
                <button type="button" 
                        class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                        onclick="event.stopPropagation(); deleteSavedQuote('${q.id}')"
                        title="Eliminar Cotización">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            ` : `<span class="text-slate-300 select-none">-</span>`;

            tr.innerHTML = `
                <td class="p-3 font-semibold text-slate-500 hidden sm:table-cell">${fechaCreadoFormatted}</td>
                <td class="p-3 font-semibold text-slate-800">${q.nombre_pax || 'Sin Nombre'}</td>
                <td class="p-3">${q.destino || 'Sin Destino'}</td>
                <td class="p-3 hidden md:table-cell">${q.agente_nombre || '-'}</td>
                <td class="p-3 hidden sm:table-cell">${fechaSalidaFormatted}</td>
                <td class="p-3 text-right font-semibold text-brand-primary">USD ${formatPriceES(totalUSD)}</td>
                <td class="p-3 flex justify-center">
                    ${deleteButtonHtml}
                </td>
            `;
            tbody.appendChild(tr);
        });

    } else {
        // Quick Budgets headers (no text for delete column header)
        thead.innerHTML = `
            <tr class="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th class="p-3 hidden sm:table-cell">Fecha Creado</th>
                <th class="p-3">Pasajero</th>
                <th class="p-3 hidden md:table-cell">Agente</th>
                <th class="p-3 text-right">Costo Total</th>
                <th class="w-12 p-3"></th>
            </tr>
        `;

        const list = customFilteredList || allSavedQuickQuotes;
        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-slate-400 font-semibold">
                        No se encontraron presupuestos rápidos.
                    </td>
                </tr>
            `;
            return;
        }

        const displayList = list.slice(0, 10);
        displayList.forEach(q => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-100 hover:bg-rose-50/40 transition-colors duration-150 cursor-pointer';
            tr.setAttribute('onclick', `window.loadQuickBudgetIntoForm('${q.id}')`);

            const totalUSD = q.total_cotizacion || 0;
            const fechaCreadoFormatted = formatCreatedAt(q.created_at);

            const currentUser = (window.loggedInUser || '').toLowerCase();
            const quoteOwner = (q.agente_id || '').toLowerCase();
            const isOwner = currentUser && quoteOwner && (currentUser === quoteOwner);

            const deleteButtonHtml = isOwner ? `
                <button type="button" 
                        class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
                        onclick="event.stopPropagation(); deleteSavedQuickQuote('${q.id}')"
                        title="Eliminar Presupuesto">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            ` : `<span class="text-slate-300 select-none">-</span>`;

            tr.innerHTML = `
                <td class="p-3 font-semibold text-slate-500 hidden sm:table-cell">${fechaCreadoFormatted}</td>
                <td class="p-3 font-semibold text-slate-800">${q.pasajero_nombre || 'Sin Nombre'}</td>
                <td class="p-3 hidden md:table-cell">${q.agente_id || '-'}</td>
                <td class="p-3 text-right font-semibold text-brand-primary">USD ${formatPriceES(totalUSD)}</td>
                <td class="p-3 flex justify-center">
                    ${deleteButtonHtml}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}
window.renderActiveTabTable = renderActiveTabTable;

function filterSavedQuotes() {
    const query = document.getElementById('quote-search-input').value.toLowerCase().trim();

    if (savedQuotesActiveTab === 'detalladas') {
        if (!query) {
            renderActiveTabTable(allSavedQuotes);
            return;
        }
        const filtered = allSavedQuotes.filter(q => {
            const name = (q.nombre_pax || '').toLowerCase();
            const dest = (q.destino || '').toLowerCase();
            return name.includes(query) || dest.includes(query);
        });
        renderActiveTabTable(filtered);
    } else {
        if (!query) {
            renderActiveTabTable(allSavedQuickQuotes);
            return;
        }
        const filtered = allSavedQuickQuotes.filter(q => {
            const name = (q.pasajero_nombre || '').toLowerCase();
            return name.includes(query);
        });
        renderActiveTabTable(filtered);
    }
}

async function deleteSavedQuickQuote(quoteId) {
    showCustomConfirm({
        title: '¿Eliminar cotización rápida?',
        desc: 'Esta acción borrará el registro de Supabase de forma definitiva. No se puede deshacer.',
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            try {
                const res = await authenticatedFetch(`/api/presupuestos/${quoteId}`, {
                    method: 'DELETE'
                });
                if (!res.ok) throw new Error("No se pudo eliminar la cotización rápida.");
                showAlert('success', 'Cotización rápida eliminada con éxito.');
                loadSavedQuotesList();
            } catch (e) {
                showAlert('warning', 'Error al eliminar: ' + e.message);
            }
        }
    });
}
window.deleteSavedQuickQuote = deleteSavedQuickQuote;

function formatCreatedAt(isoStr) {
    if (!isoStr) return '-';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '-';

        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');

        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();

        const targetYear = d.getFullYear();
        const targetMonth = d.getMonth();
        const targetDay = d.getDate();

        if (todayYear === targetYear && todayMonth === targetMonth && todayDay === targetDay) {
            return `Hoy, ${hh}:${min}`;
        }

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (yesterday.getFullYear() === targetYear && yesterday.getMonth() === targetMonth && yesterday.getDate() === targetDay) {
            return `Ayer, ${hh}:${min}`;
        }

        const dd = String(targetDay).padStart(2, '0');
        const mm = String(targetMonth + 1).padStart(2, '0');
        const yyyy = targetYear;
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch (e) {
        return '-';
    }
}

window.loadSavedQuotesList = loadSavedQuotesList;
window.filterSavedQuotes = filterSavedQuotes;

let isReadOnlyMode = false;

function enableFormEditing(enabled) {
    isReadOnlyMode = !enabled;
    const form = document.getElementById('quote-form');
    if (!form) return;

    // Deshabilitar todos los inputs, textareas y selectores
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(el => {
        el.disabled = !enabled;
    });

    // Deshabilitar botones de equipaje
    const bagButtons = form.querySelectorAll('.baggage-opt-btn');
    bagButtons.forEach(btn => {
        if (enabled) {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        } else {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
        }
    });

    // Deshabilitar flatpickrs
    const dateInputs = ['fecha_vuelo_ida', 'fecha_vuelo_vuelta', 'validez_cotizacion'];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el && el._flatpickr) {
            el._flatpickr.input.disabled = !enabled;
            if (el._flatpickr.altInput) {
                el._flatpickr.altInput.disabled = !enabled;
            }
        }
    });

    // Deshabilitar dropzones de imágenes
    const dropzones = form.querySelectorAll('.dropzone');
    dropzones.forEach(dz => {
        if (enabled) {
            dz.style.pointerEvents = 'auto';
            dz.style.opacity = '1';
        } else {
            dz.style.pointerEvents = 'none';
            dz.style.opacity = '0.7';
        }
    });

    // Deshabilitar botones de añadir/remover hotel
    const actionButtons = form.querySelectorAll('.add-hotel-btn, .btn-remove-hotel, .btn-optimize-desc');
    actionButtons.forEach(btn => {
        if (enabled) {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
            btn.disabled = false;
        } else {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
            btn.disabled = true;
        }
    });

    // El botón de Generar Cotización permanece habilitado para poder generarla directamente sin editar
    const submitBtn = document.getElementById('btn-generar-preview');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.pointerEvents = 'auto';
    }

    // Actualizar indicador de edición
    updateEditingIndicator();

    // Actualizar el resumen en tiempo real y la visibilidad de los controles
    updateRealTimeSummary();
}
window.enableFormEditing = enableFormEditing;

async function loadSavedQuoteIntoForm(quoteId, forceEditMode = false) {
    const quoteForm = document.getElementById('quote-form');
    if (!quoteForm) {
        window.pendingEditQuoteId = quoteId;
        window.pendingEditQuoteEditable = forceEditMode;
        navigateTo('/cotizacion-completa');
        return;
    }

    const cachedQuote = allSavedQuotes.find(item => item.id === quoteId);
    const passengerName = cachedQuote ? cachedQuote.nombre_pax : 'Pasajero';

    window.showLoader(`Cargando cotización para ${passengerName}`);

    try {
        const res = await authenticatedFetch(`/api/cotizaciones/${quoteId}`);
        if (!res.ok) throw new Error("No se pudo cargar la cotización solicitada.");
        const q = await res.json();

        switchTab('cotizacion-tab');

        // Fill basic data fields
        document.getElementById('nombre_pax').value = q.nombre_pax || '';
        document.getElementById('destino').value = q.destino || '';
        document.getElementById('cantidad_pasajeros').value = q.cantidad_pasajeros || 1;
        document.getElementById('origen').value = q.origen || 'Córdoba';
        const agentEl = document.getElementById('agente_nombre');
        if (agentEl) agentEl.value = q.agente_nombre || 'Uriel';
        const aplicarRedondeoEl = document.getElementById('aplicar_redondeo');
        if (aplicarRedondeoEl) {
            aplicarRedondeoEl.checked = (q.hoteles && q.hoteles[0] && typeof q.hoteles[0].redondear !== 'undefined') ? q.hoteles[0].redondear : (q.redondear !== undefined ? q.redondear : false);
        }

        const formatToPicker = (val) => {
            if (!val) return '';
            if (val.includes('-')) return val; // YYYY-MM-DD
            if (val.includes('/')) {
                const parts = val.split('/');
                return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
            }
            return val;
        };

        // Set dates
        const dateIda = formatToPicker(q.fecha_vuelo_ida);
        document.getElementById('fecha_vuelo_ida')._flatpickr.setDate(dateIda);
        if (dateIda && document.getElementById('fecha_vuelo_vuelta')._flatpickr) {
            document.getElementById('fecha_vuelo_vuelta')._flatpickr.set('minDate', dateIda);
        }
        document.getElementById('fecha_vuelo_vuelta')._flatpickr.setDate(formatToPicker(q.fecha_vuelo_vuelta));
        if (document.getElementById('validez_cotizacion') && document.getElementById('validez_cotizacion')._flatpickr) {
            document.getElementById('validez_cotizacion')._flatpickr.setDate(formatToPicker(q.validez_cotizacion || ''));
        }

        // Costs
        document.getElementById('monto_vuelos').value = q.monto_vuelos || '';
        document.getElementById('fee_aereo_monto').value = q.fee_aereo || '';
        document.getElementById('monto_traslados').value = q.monto_traslados || '';

        if (q.fee_aereo) {
            document.getElementById('fee_aereo_tipo').value = 'fixed';
        } else {
            document.getElementById('fee_aereo_tipo').value = 'auto';
        }
        toggleFeeType();

        // Baggage selection
        setBaggageSelection(q.equipaje || []);

        // Flight Images
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

        // Hotels
        const hotelsContainer = document.getElementById('hotels-container');
        hotelsContainer.innerHTML = ''; // Clear existing hotels
        hotelCount = 0; // Reset counter

        const hotels = q.hoteles || [];
        isRestoringStateDetailed = true;
        if (hotels.length === 0) {
            addHotelCard();
        } else {
            hotels.forEach(h => {
                addHotelCard(h);
            });
        }
        isRestoringStateDetailed = false;

        // Update edit state and read-only / editing modes
        currentQuoteId = q.id;
        window.currentQuoteOwner = q.agente_nombre;

        if (forceEditMode) {
            enableFormEditing(true);
            isReadOnlyMode = false;
            updateRealTimeSummary();
            window.hideLoader();
        } else {
            enableFormEditing(false);
            isReadOnlyMode = true;
            updateRealTimeSummary();
            const exactPassengerName = q.nombre_pax || 'Pasajero';
            window.showLoader(`Cargando cotización para ${exactPassengerName}`);
            await generatePDFPreview(null, true);
        }

    } catch (err) {
        window.hideLoader();
        showAlert('warning', 'Error al cargar la cotización: ' + err.message);
    }
}
window.loadSavedQuoteIntoForm = loadSavedQuoteIntoForm;

async function deleteSavedQuote(quoteId) {
    showCustomConfirm({
        title: '¿Eliminar cotización permanentemente?',
        desc: 'Esta acción borrará el registro de Supabase de forma definitiva. No se puede deshacer.',
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            try {
                const res = await authenticatedFetch(`/api/cotizaciones/${quoteId}`, {
                    method: 'DELETE'
                });

                if (!res.ok) throw new Error("Error al eliminar la cotización de la base de datos.");

                showAlert('success', '✔ Cotización eliminada con éxito.');

                // If current quote is being edited, reset the form
                if (currentQuoteId == quoteId) {
                    cancelEditingQuote();
                }
                loadSavedQuotesList();
            } catch (err) {
                showAlert('warning', 'Error al eliminar la cotización: ' + err.message);
            }
        }
    });
}
window.deleteSavedQuote = deleteSavedQuote;

function duplicateCurrentQuote() {
    if (!currentQuoteId) return;
    currentQuoteId = null;
    window.currentQuoteOwner = null;
    enableFormEditing(true); // Permitir edición
    updateEditingIndicator();
    showAlert('success', 'La cotización se ha duplicado en el formulario. Al presionar "Generar Cotización" se creará un nuevo registro.');
}
window.duplicateCurrentQuote = duplicateCurrentQuote;

function cancelEditingQuote() {
    currentQuoteId = null;
    window.currentQuoteOwner = null;
    enableFormEditing(true); // Habilitar formulario
    resetForm();
    showAlert('success', 'Formulario reiniciado. Modo de edición cancelado.');
}
window.cancelEditingQuote = cancelEditingQuote;

function closeSavedQuoteView() {
    currentQuoteId = null;
    window.currentQuoteOwner = null;
    enableFormEditing(true); // Habilitar formulario
    resetForm();
    navigateTo('/editar');
}
window.closeSavedQuoteView = closeSavedQuoteView;
window.saveConfig = saveConfig;

function confirmEditQuote() {
    const currentUser = (window.loggedInUser || '').toLowerCase();
    const quoteOwner = (window.currentQuoteOwner || '').toLowerCase();
    if (currentUser && quoteOwner && currentUser !== quoteOwner) {
        showAlert('warning', 'No puedes editar una cotización creada por otro agente. Usa "Duplicar como Nueva".');
        return;
    }

    showCustomConfirm({
        title: '¿Habilitar edición de cotización?',
        desc: 'Vas a modificar una cotización existente. Al presionar "Generar Cotización" se actualizará este registro (ID #' + currentQuoteId + ') en Supabase de forma permanente.',
        btnText: 'Sí, Habilitar Edición',
        confirmColorClass: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
        callback: () => {
            enableFormEditing(true);
            showAlert('success', 'Edición habilitada. Los cambios que realices se guardarán al generar la cotización.');
        }
    });
}
window.confirmEditQuote = confirmEditQuote;

function updateEditingIndicator() {
    const indicator = document.getElementById('editing-indicator');
    const indicatorText = document.getElementById('editing-indicator-text');
    const actionsContainer = document.getElementById('editing-indicator-actions');
    if (!indicator || !indicatorText || !actionsContainer) return;

    if (currentQuoteId) {
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');

        const currentUser = (window.loggedInUser || '').toLowerCase();
        const quoteOwner = (window.currentQuoteOwner || '').toLowerCase();
        const isOwner = currentUser && quoteOwner && (currentUser === quoteOwner);

        if (isReadOnlyMode) {
            indicatorText.innerHTML = `<span class="flex items-center gap-1.5"><svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> Visualizando cotización guardada (ID #${currentQuoteId})</span>`;

            const editBtnHtml = isOwner ? `
                <button type="button" onclick="confirmEditQuote()" class="px-3 py-1 bg-brand-primary hover:bg-brand-primary/95 text-white rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider shadow-sm shadow-brand-primary/20">Editar Cotización</button>
            ` : '';

            actionsContainer.innerHTML = `
                ${editBtnHtml}
                <button type="button" onclick="duplicateCurrentQuote()" class="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Duplicar como Nueva</button>
                <button type="button" onclick="closeSavedQuoteView()" class="px-3 py-1 bg-white hover:bg-amber-100 text-slate-800 border border-slate-200 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Cerrar</button>
            `;
        } else {
            indicatorText.innerHTML = `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Editando cotización guardada (ID #${currentQuoteId})</span>`;

            actionsContainer.innerHTML = `
                <button type="button" onclick="duplicateCurrentQuote()" class="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Duplicar como Nueva</button>
                <button type="button" onclick="closeSavedQuoteView()" class="px-3 py-1 bg-white hover:bg-amber-100 text-slate-800 border border-slate-200 rounded-lg font-bold transition-all cursor-pointer text-[10px] uppercase tracking-wider">Cancelar Edición</button>
            `;
        }
    } else {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
    }
}
window.updateEditingIndicator = updateEditingIndicator;

// ── Autenticación de Usuarios y Control de Sesión ────────────────────────────

export function initCotizar() {
    const isFromBridge = !!window.quickQuoteBridge;
    if (typeof flatpickr !== "undefined" && flatpickr.l10ns && flatpickr.l10ns.es) {
        flatpickr.localize(flatpickr.l10ns.es);
    }

    flatpickr("#fecha_vuelo_ida", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true",
        onChange: function (selectedDates, dateStr, instance) {
            const returnPicker = document.getElementById("fecha_vuelo_vuelta")?._flatpickr;
            if (returnPicker) {
                if (selectedDates[0]) {
                    returnPicker.set("minDate", selectedDates[0]);
                } else {
                    returnPicker.set("minDate", null);
                }
            }
            validateDates();
            saveDetailedQuoteFormState();
        }
    });

    flatpickr("#fecha_vuelo_vuelta", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true",
        onOpen: function (selectedDates, dateStr, instance) {
            const departureVal = getDatePickerValue("fecha_vuelo_ida");
            if (departureVal && !instance.selectedDates.length) {
                instance.jumpToDate(departureVal);
            }
        },
        onChange: function (selectedDates, dateStr, instance) {
            saveDetailedQuoteFormState();
        }
    });

    flatpickr("#validez_cotizacion", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: "true",
        onChange: function (selectedDates, dateStr, instance) {
            saveDetailedQuoteFormState();
        }
    });

    // Keyboard Shortcut Ctrl + Alt + 9 to fill test data
    if (window._fillTestDataShortcutListener) {
        document.removeEventListener('keydown', window._fillTestDataShortcutListener);
    }
    window._fillTestDataShortcutListener = (e) => {
        if (e.ctrlKey && e.altKey && e.key === '9') {
            if (window.location.pathname !== '/cotizacion-completa') return;
            e.preventDefault();
            if (typeof fillTestData === 'function') {
                fillTestData();
            }
        }
    };
    document.addEventListener('keydown', window._fillTestDataShortcutListener);

    setupDragAndDrop();
    setupSidebarResizer();
    toggleFeeType();

    // Prevent Enter key from submitting form unless focused on a textarea or submit button
    const quoteForm = document.getElementById("quote-form");
    if (quoteForm) {
        quoteForm.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const target = e.target;
                const isTextarea = target.tagName === "TEXTAREA";
                const isButtonSubmit = target.tagName === "BUTTON" && target.type !== "button";
                const isInputSubmit = target.tagName === "INPUT" && target.type === "submit";

                if (!isTextarea && !isButtonSubmit && !isInputSubmit) {
                    e.preventDefault();
                }
            }
        });
        quoteForm.addEventListener("input", () => saveDetailedQuoteFormState());
        quoteForm.addEventListener("change", () => saveDetailedQuoteFormState());
    }

    const inputs = ["monto_vuelos", "fee_aereo_monto", "monto_traslados", "cantidad_pasajeros", "nombre_pax", "destino"];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateRealTimeSummary);
    });

    setupCostInputHelpers();
    loadConfig();

    const hotelsContainer = document.getElementById("hotels-container");
    if (hotelsContainer && hotelsContainer.children.length === 0) {
        addHotelCard();
    }

    if (window.quickQuoteBridge) {
        const bridge = window.quickQuoteBridge;
        document.getElementById("nombre_pax").value = bridge.passengerName;
        document.getElementById("cantidad_pasajeros").value = bridge.paxCount;

        let flightsMonto = 0;
        let flightsFee = 0;
        bridge.vuelos.forEach(v => {
            flightsMonto += v.monto;
            flightsFee += v.fee;
        });
        document.getElementById("monto_vuelos").value = flightsMonto || "";
        document.getElementById("fee_aereo_monto").value = flightsFee || "";
        if (flightsFee > 0) {
            document.getElementById("fee_aereo_tipo").value = "fixed";
        }

        // Set transfers total
        const trasladosTotal = bridge.trasladosTotal || 0;
        document.getElementById("monto_traslados").value = trasladosTotal > 0 ? trasladosTotal.toFixed(2) : "";

        // Pre-fill destination and dates if available
        if (bridge.destino) {
            const destinoEl = document.getElementById("destino");
            if (destinoEl) destinoEl.value = bridge.destino;
        }
        if (bridge.fechaSalida) {
            const idaEl = document.getElementById("fecha_vuelo_ida");
            if (idaEl && idaEl._flatpickr) {
                idaEl._flatpickr.setDate(bridge.fechaSalida);
            }
        }
        if (bridge.fechaRegreso) {
            const vueltaEl = document.getElementById("fecha_vuelo_vuelta");
            if (vueltaEl && vueltaEl._flatpickr) {
                vueltaEl._flatpickr.setDate(bridge.fechaRegreso);
            }
        }

        // Load only real accommodation entries (no transfers, no metadata)
        if (hotelsContainer) hotelsContainer.innerHTML = "";
        const realHoteles = (bridge.hoteles || []).filter(h => h.nombre !== "METADATA_PRESUPUESTO_RAPIDO");
        if (realHoteles.length > 0) {
            realHoteles.forEach(h => {
                addHotelCard({
                    nombre: h.nombre,
                    costo: h.costo
                });
            });
        } else {
            // No accommodation entries: add one empty card
            addHotelCard();
        }

        window.quickQuoteBridge = null;
        updateRealTimeSummary();
    }

    if (window.pendingEditQuoteId) {
        const quoteId = window.pendingEditQuoteId;
        const forceEdit = !!window.pendingEditQuoteEditable;
        window.pendingEditQuoteId = null;
        window.pendingEditQuoteEditable = null;
        loadSavedQuoteIntoForm(quoteId, forceEdit);
    } else if (sessionStorage.getItem('detailedQuoteFormState')) {
        restoreDetailedQuoteFormState();
    } else if (!isFromBridge) {
        // Fresh quote creation: clean any leftovers and enable editing
        currentQuoteId = null;
        enableFormEditing(true);
        resetForm();
    }
}

export function initSavedQuotes() {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'rapidos') {
        savedQuotesActiveTab = 'rapidos';
    } else {
        savedQuotesActiveTab = 'detalladas';
    }
    loadSavedQuotesList();
}

export function initConfig() {
    loadConfig();
}

export async function initVerCotizacion() {
    const params = new URLSearchParams(window.location.search);
    const quoteId = params.get('id');
    if (!quoteId) {
        navigateTo('/editar');
        return;
    }

    window.showLoader("Cargando cotización...");

    try {
        let quote = null;
        let pdfUrl = null;

        // If it was just generated and we have it in memory, use it
        if (window.lastGeneratedQuote && String(window.lastGeneratedQuote.id) === String(quoteId)) {
            quote = window.lastGeneratedQuote;
            pdfUrl = window.lastGeneratedPdfUrl;
        } else {
            // Fetch from database
            const res = await authenticatedFetch(`/api/cotizaciones/${quoteId}`);
            if (!res.ok) throw new Error("No se pudo cargar la cotización.");
            quote = await res.json();

            // Generate the PDF
            const pdfRes = await authenticatedFetch('/api/cotizar-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quote)
            });
            if (!pdfRes.ok) throw new Error("No se pudo generar el PDF de la cotización.");
            const blob = await pdfRes.blob();
            pdfUrl = URL.createObjectURL(blob);

            // Save in window variables for current pdf operations (download, open tab)
            window.currentPdfBlob = blob;
            window.currentPdfUrl = pdfUrl;

            // Reconstruct filename
            const now = new Date(quote.updated_at || quote.created_at || new Date());
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yyyy = now.getFullYear();
            const hh = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const fecha = `${dd}-${mm}-${yyyy}`;
            const hora = `${hh}-${min}-${ss}`;
            const paxName = (quote.nombre_pax || 'Pasajero').replace(/[\/\\]/g, '-');
            const destName = (quote.destino || 'Destino').replace(/[\/\\]/g, '-');
            window.currentPdfFileName = `Cotización para ${paxName} - ${destName} - ${fecha}_${hora}.pdf`;
        }

        // Cache quote id and owner
        currentQuoteId = quote.id;
        window.currentQuoteOwner = quote.agente_nombre;

        // Update document title dynamically for detailed quote preview
        const appName = (window.agencyConfig && window.agencyConfig.nombre_agencia) || 'One Trip';
        document.title = `Detalle de Cotización #${quoteId} | ${appName}`;

        // Populate left column PDF viewer
        const iframe = document.getElementById('ver-pdf-iframe');
        if (iframe) {
            iframe.src = pdfUrl + '#zoom=75';
        }

        // Populate right column details
        document.getElementById('ver-pax-name').textContent = quote.nombre_pax || 'Sin Nombre';
        document.getElementById('ver-destino').textContent = quote.destino || 'Sin Destino';

        const formatAgent = (name) => {
            if (!name) return '-';
            return name.charAt(0).toUpperCase() + name.slice(1);
        };
        document.getElementById('ver-agente').textContent = formatAgent(quote.agente_nombre);

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            try {
                const date = new Date(dateStr);
                return date.toLocaleString('es-AR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return dateStr;
            }
        };

        document.getElementById('ver-created-at').textContent = formatDate(quote.created_at);
        document.getElementById('ver-updated-at').textContent = formatDate(quote.updated_at || quote.created_at);

        // Control the visibility of the Edit button based on current user ownership
        const currentUser = (window.loggedInUser || '').toLowerCase();
        const quoteOwner = (quote.agente_nombre || '').toLowerCase();
        const isOwner = currentUser && quoteOwner && (currentUser === quoteOwner);
        const editBtn = document.getElementById('btn-edit-quote-view');
        if (editBtn) {
            if (isOwner) {
                editBtn.classList.remove('hidden');
            } else {
                editBtn.classList.add('hidden');
            }
        }

        window.hideLoader();
    } catch (e) {
        window.hideLoader();
        showAlert('danger', "Error al cargar la cotización: " + e.message);
    }
}
window.initVerCotizacion = initVerCotizacion;

export function editQuoteFromView() {
    if (!currentQuoteId) return;
    window.pendingEditQuoteId = currentQuoteId;
    window.pendingEditQuoteEditable = true;
    navigateTo('/cotizacion-completa');
}
window.editQuoteFromView = editQuoteFromView;
