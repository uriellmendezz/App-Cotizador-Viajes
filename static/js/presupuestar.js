let isQuickFeeLocked = true;

const conceptTypes = {
    'vuelo': {
        label: 'Vuelo',
        icon: `<svg class="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>`
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

export function initPresupuestar() {
    // Bind main events
    const paxCountInput = document.getElementById('rapido-pax-count');
    if (paxCountInput) {
        paxCountInput.addEventListener('input', () => calculateQuickQuote());
    }

    const btnSaveOnly = document.getElementById('btn-save-quick-only');
    if (btnSaveOnly) {
        btnSaveOnly.onclick = () => saveQuickQuote(false);
    }

    const btnSaveAndGo = document.getElementById('btn-save-quick-and-go');
    if (btnSaveAndGo) {
        btnSaveAndGo.onclick = () => saveQuickQuote(true);
    }

    // Add buttons
    const btnAddFlight = document.getElementById('btn-add-flight');
    if (btnAddFlight) {
        btnAddFlight.onclick = () => addQuickBudgetRow({ tipo: 'vuelo', label: 'Vuelo Adicional' });
    }

    const btnAddHotel = document.getElementById('btn-add-hotel');
    if (btnAddHotel) {
        btnAddHotel.onclick = () => addQuickBudgetRow({ tipo: 'hotel', label: 'Alojamiento Adicional' });
    }

    const btnAddTransfer = document.getElementById('btn-add-transfer');
    if (btnAddTransfer) {
        btnAddTransfer.onclick = () => addQuickBudgetRow({ tipo: 'traslado', label: 'Traslado Adicional' });
    }

    loadDefaultQuickQuoteRows();
}

function loadDefaultQuickQuoteRows() {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    addQuickBudgetRow({ tipo: 'vuelo', isDefault: true });
    addQuickBudgetRow({ tipo: 'fee-aereo', isDefault: true });
    addQuickBudgetRow({ tipo: 'hotel', isDefault: true, label: 'Hotel' });
    addQuickBudgetRow({ tipo: 'traslado', isDefault: true });
    addQuickBudgetRow({ tipo: 'admin', isDefault: true });
    addQuickBudgetRow({ tipo: 'iva', isDefault: true });
    
    isQuickFeeLocked = true;
}

function addQuickBudgetRow(data = null) {
    const tbody = document.getElementById('quick-budget-body');
    if (!tbody) return;
    
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/50 transition-colors quick-row border-b border-slate-100';
    
    const selectedTipo = data ? data.tipo : 'hotel';
    const labelVal = data && data.label ? data.label : conceptTypes[selectedTipo].label;
    const montoVal = (data && data.monto !== undefined) ? data.monto : '';
    const isDefault = data && data.isDefault;
    
    tr.innerHTML = `
        <td class="py-3.5 font-bold text-slate-700 flex items-center gap-2 pl-3 bg-slate-50/80">
            <span class="quick-row-icon flex items-center justify-center">${conceptTypes[selectedTipo].icon}</span>
            <span class="text-sm font-semibold text-slate-700">${labelVal}</span>
            <input type="hidden" class="quick-row-tipo" value="${selectedTipo}">
            <input type="hidden" class="quick-row-label" value="${labelVal}">
            <span class="quick-fee-unlock-container flex items-center ${selectedTipo === 'fee-aereo' ? 'block' : 'hidden'}">
                <button type="button" class="quick-row-fee-unlock text-slate-400 hover:text-brand-primary focus:outline-none transition-colors p-1 cursor-pointer" title="Activar/Desactivar edición manual">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </button>
            </span>
        </td>
        <td class="py-3.5 text-right">
            <div class="relative flex items-center justify-end max-w-[180px] ml-auto">
                <span class="absolute left-2.5 text-[10px] font-extrabold text-slate-400 pointer-events-none">USD</span>
                <input type="number" step="0.01" min="0" class="quick-row-monto border border-slate-200 rounded-xl pl-9 pr-2.5 py-1.5 text-right w-full text-sm font-semibold focus:outline-none focus:border-brand-primary" placeholder="0.00" value="${montoVal}">
            </div>
        </td>
        <td class="quick-row-pax py-3.5 text-right font-semibold text-slate-500 pr-3">USD 0,00</td>
        <td class="py-3.5 text-center">
            <button type="button" class="btn-delete-row text-rose-500 hover:text-rose-700 focus:outline-none cursor-pointer p-1 ${isDefault ? 'invisible pointer-events-none' : ''}">
                <svg class="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </td>
    `;
    
    tbody.appendChild(tr);
    
    // Bind dynamic row elements events
    const montoInput = tr.querySelector('.quick-row-monto');
    if (montoInput) {
        montoInput.addEventListener('input', () => calculateQuickQuote());
    }

    const btnDelete = tr.querySelector('.btn-delete-row');
    if (btnDelete) {
        btnDelete.onclick = () => {
            tr.remove();
            calculateQuickQuote();
        };
    }

    const btnUnlock = tr.querySelector('.quick-row-fee-unlock');
    if (btnUnlock) {
        btnUnlock.onclick = () => toggleQuickRowFeeLock();
    }

    syncQuickRowEditableState(tr);
    calculateQuickQuote();
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
                btnUnlock.className = "quick-row-fee-unlock text-slate-400 hover:text-brand-primary focus:outline-none transition-colors p-1 cursor-pointer";
            }
        } else {
            montoInput.readOnly = false;
            montoInput.classList.remove('bg-slate-50', 'text-slate-500', 'cursor-not-allowed');
            montoInput.classList.add('bg-white');
            
            const btnUnlock = tr.querySelector('.quick-row-fee-unlock');
            if (btnUnlock) {
                btnUnlock.className = "quick-row-fee-unlock bg-brand-primary text-white hover:bg-brand-primary/95 focus:outline-none transition-colors p-1 cursor-pointer rounded-full";
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
    let totalIva = 0;
    
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
        } else if (tipo === 'iva') {
            totalIva += monto;
        }
        
        const paxCell = tr.querySelector('.quick-row-pax');
        if (paxCell) {
            paxCell.innerText = `USD ${window.formatPriceES(monto / paxCount)}`;
        }
    });
    
    const totalFinal = totalAereo + totalTerrestreNeto + totalAdminFee + totalIva;
    
    const elTotalFinal = document.getElementById('rapido-total-final');
    if (elTotalFinal) elTotalFinal.innerText = `USD ${window.formatPriceES(totalFinal)}`;
    
    const elTotalPax = document.getElementById('rapido-total-pax');
    if (elTotalPax) elTotalPax.innerText = `USD ${window.formatPriceES(totalFinal / paxCount)}`;
}

async function saveQuickQuote(andRedirect = false) {
    const passengerName = document.getElementById('rapido-pasajero')?.value || '';
    const paxCount = parseInt(document.getElementById('rapido-pax-count')?.value) || 2;
    
    const vuelos = [];
    const hoteles = [];
    let ivaSum = 0;
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
            hoteles.push({ nombre: label, costo: monto });
        } else if (tipo === 'iva') {
            ivaSum += monto;
        }
    });
    
    const adminVal = totalTerrestreNeto * 0.05;
    const totalFinal = totalAereo + totalTerrestreNeto + adminVal + ivaSum;
    
    const payload = {
        pasajero_nombre: passengerName,
        cantidad_pasajeros: paxCount,
        vuelos: vuelos,
        hoteles: hoteles,
        gastos_iva: ivaSum,
        total_cotizacion: totalFinal
    };
    
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    if (overlay) {
        if (loadingText) loadingText.innerText = "Guardando presupuesto rápido...";
        overlay.style.display = 'flex';
        overlay.classList.remove('hidden');
    }
    
    try {
        const res = await window.authenticatedFetch('/api/presupuestos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "Error al guardar");
        }
        
        window.showAlert('success', 'Presupuesto rápido guardado correctamente.');
        
        if (andRedirect) {
            // Keep quote payload in memory to pre-load detailed quote tab
            window.quickQuoteBridge = {
                passengerName,
                paxCount,
                vuelos,
                hoteles,
                ivaSum,
                totalFinal
            };
            window.navigateTo('/cotizar');
        } else {
            document.getElementById('rapido-pasajero').value = '';
            document.getElementById('rapido-pax-count').value = '2';
            loadDefaultQuickQuoteRows();
        }
    } catch (err) {
        window.showAlert('warning', 'Error al procesar: ' + err.message);
    } finally {
        if (overlay) {
            overlay.style.display = 'none';
            overlay.classList.add('hidden');
        }
    }
}
