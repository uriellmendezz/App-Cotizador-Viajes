let isQuickFeeLocked = true;
let currentQuickQuoteId = null;
let isRestoringState = false;
let isQuickReadOnlyMode = false;

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
        const monto = tr.querySelector('.quick-row-monto')?.value || '';
        rows.push({ tipo, label, monto });
    });

    window.savedQuickQuoteState = {
        currentQuickQuoteId,
        isQuickFeeLocked,
        passengerName: passengerInput.value,
        paxCount: document.getElementById('rapido-pax-count')?.value || 2,
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

    const paxCountInput = document.getElementById('rapido-pax-count');
    if (paxCountInput) paxCountInput.value = window.savedQuickQuoteState.paxCount;

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

    const monedaInput = document.getElementById('rapido-moneda');
    if (monedaInput && window.savedQuickQuoteState.moneda) {
        monedaInput.value = window.savedQuickQuoteState.moneda;
    }

    window.savedQuickQuoteState.rows.forEach(r => {
        addQuickBudgetRow({ 
            tipo: r.tipo, 
            label: r.label, 
            monto: r.monto, 
            isDefault: (r.tipo === 'fee-aereo' || r.tipo === 'admin') 
        });
    });

    isRestoringState = false;
    updateQuickCurrencyLabels();
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
    'iva': 6
};

function updateResetButtonVisibility() {
    const btnReset = document.getElementById('btn-reset-quick-budget');
    if (!btnReset) return;

    const passengerInput = document.getElementById('rapido-pasajero');
    const paxCountInput = document.getElementById('rapido-pax-count');
    const destInput = document.getElementById('rapido-destino');
    const depPickerInput = document.getElementById('rapido-fecha-salida');
    const retPickerInput = document.getElementById('rapido-fecha-regreso');

    const hasPassenger = passengerInput && passengerInput.value.trim() !== '';
    const hasCustomPaxCount = paxCountInput && paxCountInput.value !== '2' && paxCountInput.value !== '';
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

    const isDirty = hasPassenger || hasCustomPaxCount || hasDestino || hasFechaSalida || hasFechaRegreso || hasCustomRowsCount || hasAnyMonto || hasCustomLabels;

    if (isDirty) {
        btnReset.classList.remove('hidden');
        btnReset.classList.add('flex');
    } else {
        btnReset.classList.remove('flex');
        btnReset.classList.add('hidden');
    }
}

export function initCotizacionRapida() {
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
                    const destInput = document.getElementById('rapido-destino');
                    if (destInput) destInput.value = '';
                    const depPickerInput = document.getElementById('rapido-fecha-salida');
                    if (depPickerInput && depPickerInput._flatpickr) depPickerInput._flatpickr.clear();
                    const retPickerInput = document.getElementById('rapido-fecha-regreso');
                    if (retPickerInput && retPickerInput._flatpickr) retPickerInput._flatpickr.clear();
                    loadDefaultQuickQuoteRows();
                    calculateQuickQuote();
                    saveQuickQuoteFormState();
                }
            });
        };
    }

    // Watch text inputs
    const inputsToWatch = ['rapido-pasajero', 'rapido-destino'];
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => saveQuickQuoteFormState());
        }
    });

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

function loadDefaultQuickQuoteRows() {
    currentQuickQuoteId = null;
    window.currentQuickQuoteOwner = null;
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Clear title and passengers meta fields
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
    
    addQuickBudgetRow({ tipo: 'vuelo', isDefault: true });
    addQuickBudgetRow({ tipo: 'fee-aereo', isDefault: true });
    addQuickBudgetRow({ tipo: 'hotel', isDefault: true, label: 'Hotel' });
    addQuickBudgetRow({ tipo: 'traslado', isDefault: true });
    addQuickBudgetRow({ tipo: 'admin', isDefault: true });
    
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
    const labelVal = data && data.label ? data.label : conceptTypes[selectedTipo].label;
    const montoVal = (data && data.monto !== undefined) ? data.monto : '';
    const isDefault = data && data.isDefault;
    const isUndeletable = (selectedTipo === 'fee-aereo' || selectedTipo === 'admin');
    const isLabelReadOnly = isUndeletable ? 'readonly' : '';
    const labelTitle = isUndeletable ? '' : 'title="Haz clic para renombrar este concepto"';
    const cursorClass = isUndeletable ? 'cursor-default pointer-events-none' : 'cursor-text';
    
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
    }

    let labelCellHtml = '';
    if (isUndeletable) {
        labelCellHtml = `
            <span class="text-sm font-semibold text-slate-700 bg-transparent py-1 pl-2 select-none">${labelVal}</span>
            ${helpIconHtml}
            <input type="hidden" class="quick-row-label" value="${labelVal}">
        `;
    } else {
        labelCellHtml = `
            <input type="text" class="quick-row-label text-sm font-semibold text-slate-700 border-none bg-transparent focus:ring-0 focus:outline-none m-0 w-full ${cursorClass}" value="${labelVal}" ${labelTitle} style="border: none !important; background: transparent !important; outline: none !important; box-shadow: none !important; padding: 4px 8px !important; margin: 0 !important;" autocomplete="off">
        `;
    }

    tr.innerHTML = `
        <td class="py-3.5 font-bold text-slate-700 flex items-center gap-1.5 pl-3 bg-white">
            <span class="quick-row-icon flex items-center justify-center">${conceptTypes[selectedTipo].icon}</span>
            ${labelCellHtml}
            <input type="hidden" class="quick-row-tipo" value="${selectedTipo}">
        </td>
        <td class="py-3.5 text-right relative">
            <div class="flex items-center justify-end max-w-[180px] ml-auto">
                <span class="quick-fee-unlock-container absolute right-full top-1/2 -translate-y-1/2 mr-2 flex items-center ${selectedTipo === 'fee-aereo' ? 'block' : 'hidden'}">
                    <button type="button" class="quick-row-fee-unlock flex items-center justify-center text-slate-400 hover:text-brand-primary bg-slate-100 hover:bg-slate-200 transition-all duration-300 p-1.5 cursor-pointer rounded-full" title="Activar/Desactivar edición manual">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </button>
                </span>
                <div class="relative flex items-center justify-end w-full">
                    <span class="absolute left-2.5 text-[10px] font-extrabold text-slate-400 pointer-events-none quick-currency-label">${currency}</span>
                    <input type="number" step="0.01" min="0" class="quick-row-monto border border-slate-200 rounded-xl pl-9 pr-2.5 py-1.5 text-right w-full text-sm font-semibold focus:outline-none focus:border-brand-primary" placeholder="0.00" value="${montoVal}">
                </div>
            </div>
        </td>
        <td class="quick-row-pax py-3.5 text-right font-semibold text-slate-500 pr-3">${currency} 0,00</td>
        <td class="py-3.5 text-center">
            <button type="button" class="btn-delete-row text-rose-500 hover:text-rose-700 focus:outline-none cursor-pointer p-1 ${isUndeletable ? 'invisible pointer-events-none' : ''}">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
    updateQuickCurrencyLabels();
    
    // Bind dynamic row elements events
    const montoInput = tr.querySelector('.quick-row-monto');
    if (montoInput) {
        montoInput.addEventListener('input', () => {
            calculateQuickQuote();
            saveQuickQuoteFormState();
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
    
    rows.forEach(row => tbody.appendChild(row));
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
            sum += parseFloat(tr.querySelector('.quick-row-monto')?.value) || 0;
        }
    });
    return sum;
}

function getQuickHotelsAndTrasladosSum() {
    let sum = 0;
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        if (tipo === 'hotel' || tipo === 'traslado') {
            sum += parseFloat(tr.querySelector('.quick-row-monto')?.value) || 0;
        }
    });
    return sum;
}

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
            montoInput.value = (flightsSum * 0.10).toFixed(2);
        } else if (tipo === 'admin' && montoInput) {
            montoInput.value = adminVal.toFixed(2);
        }
    });
    
    let totalAereo = 0;
    let totalTerrestreNeto = 0;
    let totalAdminFee = 0;
    
    document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
        const tipo = tr.querySelector('.quick-row-tipo')?.value || '';
        const monto = parseFloat(tr.querySelector('.quick-row-monto')?.value) || 0;
        
        if (tipo === 'vuelo') {
            totalAereo += monto;
        } else if (tipo === 'fee-aereo') {
            totalAereo += monto;
        } else if (tipo === 'hotel' || tipo === 'traslado') {
            totalTerrestreNeto += monto;
        } else if (tipo === 'admin') {
            totalAdminFee += monto;
        }
        
        const paxCell = tr.querySelector('.quick-row-pax');
        if (paxCell) {
            paxCell.innerText = `${currency} ${window.formatPriceES(monto / paxCount)}`;
        }
    });
    
    const totalFinal = totalAereo + totalTerrestreNeto + totalAdminFee;
    
    const elTotalFinal = document.getElementById('rapido-total-final');
    if (elTotalFinal) elTotalFinal.innerText = `${currency} ${window.formatPriceES(totalFinal)}`;
    
    const elTotalPax = document.getElementById('rapido-total-pax');
    if (elTotalPax) elTotalPax.innerText = `${currency} ${window.formatPriceES(totalFinal / paxCount)}`;

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
        const monto = parseFloat(tr.querySelector('.quick-row-monto')?.value) || 0;
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
        const monto = parseFloat(tr.querySelector('.quick-row-monto')?.value) || 0;
        
        if (tipo === 'vuelo') {
            totalAereo += monto;
            vuelos.push({ nombre: label, monto: monto, fee: 0 });
        } else if (tipo === 'fee-aereo') {
            totalAereo += monto;
            if (vuelos.length > 0) {
                vuelos[0].fee += monto;
            } else {
                vuelos.push({ nombre: "Fee Aéreo", monto: 0, fee: monto });
            }
        } else if (tipo === 'hotel') {
            totalTerrestreNeto += monto;
            hoteles.push({ nombre: label, costo: monto });
        } else if (tipo === 'traslado') {
            totalTerrestreNeto += monto;
            traslados.push({ nombre: label, costo: monto });
        }
    });
    
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
            destino: destino,
            fecha_salida: fechaSalida,
            fecha_regreso: fechaRegreso,
            moneda: document.getElementById('rapido-moneda')?.value || 'USD'
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
                trasladosTotal, // suma total de traslados
                destino,
                fechaSalida,
                fechaRegreso,
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
        tr.className = 'border-b border-slate-100 hover:bg-rose-50/30 transition-colors duration-150 cursor-pointer';
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
            <button type="button" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" onclick="deleteQuickBudget('${q.id}', event)">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        ` : `<span class="text-slate-300 select-none">-</span>`;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-slate-500">${dateFormatted}</td>
            <td class="p-3 font-semibold text-slate-800">${q.pasajero_nombre || 'Sin Nombre'}</td>
            <td class="p-3 text-center">${q.cantidad_pasajeros || 1}</td>
            <td class="p-3">${q.agente_id || '-'}</td>
            <td class="p-3 text-right font-semibold text-brand-primary">USD ${window.formatPriceES(totalUSD)}</td>
            <td class="p-3 text-center">
                ${deleteButtonHtml}
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
        if (!res.ok) throw new Error("No se pudo eliminar la cotización rápida.");
        
        window.showAlert('success', 'Cotización rápida eliminada correctamente.');
        loadQuickBudgetsList();
    } catch (err) {
        window.showAlert('warning', 'Error: ' + err.message);
    }
}

async function loadQuickBudgetIntoForm(quoteId) {
    const isFormPage = !!document.getElementById('quick-budget-body');
    if (!isFormPage) {
        window.pendingEditQuickBudgetId = quoteId;
        navigateTo('/cotizacion-rapida');
        return;
    }
    
    window.showLoader("Cargando cotización rápida...");
    const signal = window.getAbortSignal(true);
    
    try {
        const res = await window.authenticatedFetch(`/api/presupuestos/${quoteId}`, { signal });
        if (!res.ok) throw new Error("No se pudo cargar la cotización rápida.");
        const q = await res.json();
        currentQuickQuoteId = q.id;
        window.currentQuickQuoteOwner = q.agente_id;
        
        document.getElementById('rapido-pasajero').value = q.pasajero_nombre || '';
        document.getElementById('rapido-pax-count').value = q.cantidad_pasajeros || 2;
        
        // Reset optional inputs first
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
                addQuickBudgetRow({ tipo: 'vuelo', label: v.nombre, monto: v.monto });
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
                    if (destInput) destInput.value = h.destino || '';
                    if (h.fecha_salida && depPickerInput && depPickerInput._flatpickr) {
                        depPickerInput._flatpickr.setDate(h.fecha_salida);
                    }
                    if (h.fecha_regreso && retPickerInput && retPickerInput._flatpickr) {
                        retPickerInput._flatpickr.setDate(h.fecha_regreso);
                    }
                    const currency = h.moneda || 'USD';
                    const monedaSelect = document.getElementById('rapido-moneda');
                    if (monedaSelect) {
                        monedaSelect.value = currency;
                    }
                    return;
                }
                const tipo = h.nombre.toLowerCase().includes('traslado') ? 'traslado' : 'hotel';
                addQuickBudgetRow({ tipo: tipo, label: h.nombre, monto: h.costo });
            });
        }
        updateQuickCurrencyLabels();
        
        // Add Admin row
        addQuickBudgetRow({ tipo: 'admin' });
        
        // Sync locks on all rows
        document.querySelectorAll('#quick-budget-body tr.quick-row').forEach(tr => {
            syncQuickRowEditableState(tr);
        });
        
        calculateQuickQuote();
        updateSaveButtonState();
        enableQuickFormEditing(false);
        
    } catch (err) {
        if (err.name === 'AbortError') return;
        window.showAlert('warning', 'Error al cargar: ' + err.message);
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

    passengerInput.value = 'Familia Rodriguez';
    paxCountInput.value = 4;

    const destInput = document.getElementById('rapido-destino');
    if (destInput) destInput.value = 'Punta Cana';

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
    addQuickBudgetRow({ tipo: 'hotel', label: 'Riu Palace Aruba', monto: 3200.00 });
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
                if (tipo === 'admin') {
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
        if (enabled) {
            btnSaveAndGo.classList.remove('hidden');
        } else {
            btnSaveAndGo.classList.add('hidden');
        }
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
