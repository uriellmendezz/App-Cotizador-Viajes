let hotelCount = 0;
let agencyConfig = {};
let importedQuotes = [];
let hoveredDropzone = null;

// On window load
window.addEventListener('load', () => {
    loadConfig();
    addHotelCard(); // Add default hotel option card
    setupDragAndDrop();
    
    // Set default dates to today + 7 days - Removed to leave values completely blank on open
    // Initialize flights fee
    toggleFeeType();
    
    // Bind real-time pricing inputs
    document.getElementById('monto_vuelos').addEventListener('input', updateRealTimeSummary);
    document.getElementById('fee_aereo_monto').addEventListener('input', updateRealTimeSummary);
    document.getElementById('monto_traslados').addEventListener('input', updateRealTimeSummary);
    document.getElementById('cantidad_pasajeros').addEventListener('change', updateRealTimeSummary);
    
    // Setup cost input focus/blur helpers
    setupCostInputHelpers();
    
    updateRealTimeSummary();
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
    input.addEventListener('focus', function() {
        setTimeout(() => {
            this.select();
        }, 50);
    });
    
    // Blur event: format to 2 decimals
    input.addEventListener('blur', function() {
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
    
    if (!container || !card || !content || !btn || !arrow) return;
    
    const isCollapsed = container.classList.contains('w-0');
    
    if (isCollapsed) {
        // Expand
        container.classList.remove('w-0', 'lg:w-0', 'overflow-visible');
        container.classList.add('w-full', 'lg:w-[380px]');
        
        card.className = "bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-6 shadow-xl shadow-slate-200/50 lg:shadow-md lg:shadow-slate-100 fixed bottom-4 left-4 right-4 z-50 lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:z-0 max-h-[85vh] overflow-hidden transition-all duration-500 w-[calc(100%-2rem)] lg:w-full";
        
        content.classList.remove('hidden', 'opacity-0');
        content.classList.add('opacity-100');
        
        btn.className = "absolute top-5 right-5 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer z-50 text-slate-500";
        arrow.classList.remove('rotate-180', 'text-white');
        arrow.classList.add('text-slate-500');
    } else {
        // Collapse
        container.classList.remove('w-full', 'lg:w-[380px]');
        container.classList.add('w-0', 'lg:w-0', 'overflow-visible');
        
        card.className = "fixed bottom-4 right-4 lg:absolute lg:top-0 lg:right-0 w-12 h-12 rounded-full p-0 flex items-center justify-center bg-brand-primary text-white border-0 shadow-2xl z-50 transition-all duration-500 max-h-[48px] overflow-hidden cursor-pointer";
        
        content.classList.add('hidden', 'opacity-0');
        content.classList.remove('opacity-100');
        
        btn.className = "absolute inset-0 w-full h-full flex items-center justify-center text-white hover:bg-brand-primary/90 rounded-full cursor-pointer z-50";
        arrow.classList.add('rotate-180', 'text-white');
        arrow.classList.remove('text-slate-500');
    }
}
window.toggleRealTimeBreakdown = toggleRealTimeBreakdown;

function updateHotelBadges() {
    const container = document.getElementById('hotels-container');
    if (!container) return;
    const cards = container.querySelectorAll('.hotel-option-card');
    cards.forEach((card, idx) => {
        // Remove existing badge if any
        const oldBadge = card.querySelector('.recommendation-badge');
        if (oldBadge) oldBadge.remove();
        
        if (idx === 0) {
            // Add badge to the first card
            const badge = document.createElement('div');
            badge.className = 'recommendation-badge absolute -top-3 left-6 px-3 py-1 bg-brand-primary text-white text-[9px] font-extrabold rounded-full uppercase tracking-wider shadow-md z-10';
            badge.innerText = 'NUESTRA RECOMENDACIÓN';
            card.appendChild(badge);
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
    else if (tabId === 'importar-tab') btnIdx = 1;
    else if (tabId === 'config-tab') btnIdx = 2;
    
    btns[btnIdx].classList.add('active', 'bg-gradient-to-r', 'from-brand-primary', 'to-[#ff7f85]', 'text-white', 'shadow-lg', 'shadow-brand-primary/35');
    btns[btnIdx].classList.remove('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-100');
}
window.switchTab = switchTab;

// Show Alerts
function showAlert(type, message, preventScroll = false) {
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
        const res = await fetch('/api/config');
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
        const res = await fetch('/api/config', {
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
    
    if (currentCards.length >= 4) {
        alert("Máximo 4 hoteles permitidos.");
        return;
    }
    
    hotelCount++;
    const cardId = `hotel-card-${hotelCount}`;
    
    const card = document.createElement('div');
    card.className = 'hotel-option-card bg-slate-50/60 border border-slate-200/80 rounded-xl p-5 relative flex flex-col justify-center gap-4 transition-all duration-300 hover:bg-slate-50';
    card.id = cardId;
    
    const starsVal = data ? (data.estrellas || data.hotel_estrellas || "★★★★☆") : "★★★★☆";
    
    card.innerHTML = `
        <button type="button" class="remove-hotel-btn absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all" onclick="removeHotelCard('${cardId}')">Eliminar Opción</button>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre del Hotel</label>
                <input type="text" class="hotel-nombre-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Bahia Principe" value="${data ? (data.hotel_nombre || data.nombre || '') : ''}" oninput="updateRealTimeSummary()">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Categoría (Estrellas)</label>
                <select class="hotel-estrellas-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white">
                    <option value="★★★★★" ${starsVal.includes('5') || starsVal === '★★★★★' ? 'selected' : ''}>5 Estrellas (★★★★★)</option>
                    <option value="★★★★☆" ${starsVal.includes('4') || starsVal === '★★★★☆' ? 'selected' : ''}>4 Estrellas (★★★★☆)</option>
                    <option value="★★★☆☆" ${starsVal.includes('3') || starsVal === '★★★☆☆' ? 'selected' : ''}>3 Estrellas (★★★☆☆)</option>
                    <option value="★★☆☆☆" ${starsVal.includes('2') || starsVal === '★★☆☆☆' ? 'selected' : ''}>2 Estrellas (★★☆☆☆)</option>
                </select>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Régimen Alimenticio</label>
                <input type="text" class="hotel-regimen-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Desayuno" value="${data ? (data.hotel_regimen || data.regimen || '') : ''}">
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo de Habitación</label>
                <input type="text" class="hotel-habitacion-val border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none focus:border-brand-primary transition-all bg-white" required placeholder="Ej. Estándar Vista Mar" value="${data ? (data.hotel_habitacion || data.habitacion || '') : ''}">
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Costo Terrestre Neto</label>
                <div class="relative flex items-center">
                    <span class="absolute left-3 text-xs font-bold text-slate-400 pointer-events-none">USD</span>
                    <input type="number" class="hotel-costo-val w-full border border-slate-200 rounded-xl pl-12 pr-4 py-2.5 text-sm font-semibold text-right focus:outline-none focus:border-brand-primary transition-all bg-white" min="0" step="0.01" required value="${data ? (data.monto_alojamiento || data.costo || '') : ''}" placeholder="0.00" oninput="updateRealTimeSummary()">
                </div>
            </div>
        </div>
        
        <div class="flex flex-col gap-1 w-full">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción Comercial</label>
            <div class="relative flex flex-col w-full">
                <textarea class="hotel-descripcion-val border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-brand-primary transition-all bg-white h-[80px] pr-28 resize w-full" required placeholder="Ej. Frente al mar..." style="line-height: 1.3;">${data ? (data.hotel_descripcion || data.descripcion || '') : ''}</textarea>
                <button type="button" class="btn-ia-optimize absolute bottom-1.5 right-1.5 text-[9px] px-2 py-1 bg-gradient-to-r from-brand-primary to-brand-accent text-white font-bold rounded-lg hover:shadow-sm active:scale-95 transition-all" onclick="optimizeDescription(this)">
                    IA Optimizar
                </button>
            </div>
        </div>
        
        <div class="flex flex-col gap-2">
            <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Imagen del Complejo</label>
            <div class="grid grid-cols-1 max-w-sm gap-4">
                <!-- Foto 1 -->
                <div class="dropzone relative overflow-hidden border-2 border-dashed border-slate-200 hover:border-brand-primary rounded-xl p-3 bg-white flex flex-col items-center justify-center min-h-[90px] cursor-pointer transition-all duration-300 group" id="dropzone-${cardId}-1" tabindex="0" onclick="triggerFileInput('file-${cardId}-1')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5 text-slate-400 group-hover:text-brand-primary mb-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    <span class="text-[9px] text-slate-500 font-semibold text-center leading-tight">Seleccionar imagen<br><span class="text-[8px] text-brand-primary/80">Ctrl+V para pegar</span></span>
                    <input type="file" id="file-${cardId}-1" accept="image/*" class="hidden" onchange="handleImageUpload(this, 'preview-${cardId}-1', 'data-${cardId}-1')">
                    <img id="preview-${cardId}-1" class="dropzone-preview absolute inset-0 w-full h-full object-cover rounded-xl" alt="">
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
    setTimeout(() => {
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
    }, 0);

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
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
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
    const generalDeparture = document.getElementById('fecha_salida').value;
    const flightIda = document.getElementById('fecha_vuelo_ida').value;
    const flightVuelta = document.getElementById('fecha_vuelo_vuelta').value;
    
    if (generalDeparture && flightIda) {
        if (new Date(flightIda) < new Date(generalDeparture)) {
            showAlert('warning', 'La fecha del vuelo de ida no puede ser anterior a la fecha de salida general.');
            return false;
        }
    }
    
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

// Real-time Cost Calculation and Sidebar Updates
function updateRealTimeSummary() {
    const cantPax = parseInt(document.getElementById('cantidad_pasajeros').value) || 1;
    const flightsCost = parseFloat(document.getElementById('monto_vuelos').value) || 0;
    const flightsFee = parseFloat(document.getElementById('fee_aereo_monto').value) || 0;
    const transfersCost = parseFloat(document.getElementById('monto_traslados').value) || 0;
    
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
    let hotelCostsHtml = '';
    let transfersHtml = '';
    let adminFeesHtml = '';
    let totalsHtml = '';
    let perPersonHtml = '';
    
    hotelCards.forEach((card, idx) => {
        const hotelName = card.querySelector('.hotel-nombre-val').value.trim() || `Opción ${idx + 1}`;
        const hotelCost = parseFloat(card.querySelector('.hotel-costo-val').value) || 0;
        
        const adminFee = (hotelCost + transfersCost) * 0.05;
        const total = aereosTotal + hotelCost + transfersCost + adminFee;
        const perPerson = total / cantPax;
        
        const isRecomendado = idx === 0;
        const columnHeader = isRecomendado ? 'Recomendado' : `Opción ${idx + 1}`;
        
        columnsHtml += `
            <th class="py-2 px-2 text-right text-[9px] uppercase tracking-wider ${isRecomendado ? 'text-brand-primary font-extrabold' : 'text-slate-400 font-bold'} min-w-[80px]">${columnHeader}</th>
        `;
        
        hotelNamesHtml += `
            <th class="py-1.5 px-2 text-right text-[10px] font-bold text-slate-800 truncate max-w-[100px]" title="${hotelName}">${hotelName}</th>
        `;
        
        flightsHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${aereosTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        
        hotelCostsHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${hotelCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        
        transfersHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${transfersCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        
        adminFeesHtml += `
            <td class="py-2 px-2 text-right font-semibold text-slate-700">USD ${adminFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        
        totalsHtml += `
            <td class="py-2.5 px-2 text-right text-xs ${isRecomendado ? 'text-brand-primary' : 'text-slate-800'} font-extrabold">USD ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        
        perPersonHtml += `
            <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">USD ${perPerson.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                            <span>✈</span>
                            <span class="truncate">Vuelos${flightsFee > 0 ? ' + Fee' : ''}</span>
                        </td>
                        ${flightsHtml}
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <span>🏨</span>
                            <span class="truncate">Alojamiento</span>
                        </td>
                        ${hotelCostsHtml}
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <span>🚕</span>
                            <span class="truncate">Traslados</span>
                        </td>
                        ${transfersHtml}
                    </tr>
                    <tr>
                        <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                            <span>📄</span>
                            <span class="truncate">Gtos Admin (5%)</span>
                        </td>
                        ${adminFeesHtml}
                    </tr>
                    <tr class="bg-slate-50/50 font-bold border-t border-slate-200">
                        <td class="py-2.5 pr-2 text-[10px] text-slate-800 uppercase tracking-wider flex items-center gap-1">
                            <span>💰</span>
                            <span>Total</span>
                        </td>
                        ${totalsHtml}
                    </tr>
                    <tr class="bg-brand-primary/5 font-bold border-t border-brand-primary/10">
                        <td class="py-2.5 pr-2 text-[9px] text-brand-primary uppercase tracking-widest flex items-center gap-1">
                            <span>👤</span>
                            <span class="truncate">Por Pax (${cantPax})</span>
                        </td>
                        ${perPersonHtml}
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}
window.updateRealTimeSummary = updateRealTimeSummary;

let currentPdfBlob = null;
let currentPdfFileName = '';

async function generatePDFPreview(e) {
    if (e) e.preventDefault();
    if (!validateDates()) return;
    
    const imgIda = document.getElementById('data-vuelo-ida').value;
    const imgVuelta = document.getElementById('data-vuelo-vuelta').value;
    if (!imgIda || !imgVuelta) {
        showAlert('warning', 'Debe adjuntar una captura/foto obligatoria para cada tramo de vuelo (Ida y Vuelta).');
        return;
    }
    
    document.getElementById('loading-overlay').style.display = 'flex';
    const paxNameForLoading = document.getElementById('nombre_pax').value || 'Pasajero';
    document.getElementById('loading-text').innerText = `Creando la cotización para ${paxNameForLoading}`;
    
    const payload = _buildPayload();
    
    try {
        const res = await fetch('/api/cotizar-pdf', {
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
        
        document.getElementById('loading-overlay').style.display = 'none';
        
        // Update PDF iframe preview source
        const url = window.URL.createObjectURL(blob);
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
        
        document.getElementById('res-total-price').innerText = `USD ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('res-pax-price').innerText = `USD ${perPerson.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / Pax`;
        updateBaseLabel();
        
        // Show results panel
        const resultsPanel = document.getElementById('results-panel');
        resultsPanel.classList.remove('hidden');
        resultsPanel.classList.add('block');
        resultsPanel.scrollIntoView({ behavior: 'smooth' });
        
        showAlert('success', '✔ Vista previa de PDF generada correctamente.', true);
    } catch (err) {
        document.getElementById('loading-overlay').style.display = 'none';
        showAlert('warning', 'Error al generar el PDF: ' + err.message);
    }
}
window.generatePDFPreview = generatePDFPreview;

function downloadPDFBlob() {
    if (!currentPdfBlob) {
        showAlert('warning', 'No hay ningún PDF generado para descargar.');
        return;
    }
    const url = window.URL.createObjectURL(currentPdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentPdfFileName || 'Cotizacion.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showAlert('success', '✔ PDF descargado con éxito.');
}
window.downloadPDFBlob = downloadPDFBlob;


// Build payload from form (shared between Slides and PDF)
function _buildPayload() {
    const imgIda = document.getElementById('data-vuelo-ida').value;
    const imgVuelta = document.getElementById('data-vuelo-vuelta').value;
    
    const payload = {
        nombre_pax: document.getElementById('nombre_pax').value,
        destino: document.getElementById('destino').value,
        cantidad_pasajeros: parseInt(document.getElementById('cantidad_pasajeros').value),
        fecha_salida: formatDatePickerDate(document.getElementById('fecha_salida').value),
        origen: document.getElementById('origen').value,
        agente_nombre: document.getElementById('agente_nombre').value,
        fecha_vuelo_ida: formatDatePickerDate(document.getElementById('fecha_vuelo_ida').value),
        fecha_vuelo_vuelta: formatDatePickerDate(document.getElementById('fecha_vuelo_vuelta').value),
        img_vuelo_ida: imgIda,
        img_vuelo_vuelta: imgVuelta,
        monto_vuelos: parseFloat(document.getElementById('monto_vuelos').value),
        fee_aereo: parseFloat(document.getElementById('fee_aereo_monto').value),
        monto_traslados: parseFloat(document.getElementById('monto_traslados').value),
        gastos_iva: 0.0,
        hoteles: []
    };
    
    const hotelCards = document.querySelectorAll('.hotel-option-card');
    hotelCards.forEach(card => {
        payload.hoteles.push({
            nombre: card.querySelector('.hotel-nombre-val').value,
            estrellas: card.querySelector('.hotel-estrellas-val').value,
            regimen: card.querySelector('.hotel-regimen-val').value,
            habitacion: card.querySelector('.hotel-habitacion-val').value,
            costo: parseFloat(card.querySelector('.hotel-costo-val').value),
            descripcion: card.querySelector('.hotel-descripcion-val').value,
            imagen1: card.querySelector('.hotel-imagen-val-1').value,
            imagen2: "",
            imagen3: ""
        });
    });
    
    return payload;
}

function formatDatePickerDate(val) {
    if (!val) return "";
    const parts = val.split('-'); // YYYY-MM-DD
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
}

// Excel upload handler
async function handleExcelImport(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;
    
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-text').innerText = 'Analizando archivo Excel / CSV...';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const res = await fetch('/api/importar-excel', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || 'Error al importar archivo');
        }
        
        const quotes = await res.json();
        importedQuotes = quotes;
        document.getElementById('loading-overlay').style.display = 'none';
        
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
                <td class="p-3">USD ${q.monto_vuelos.toFixed(2)}</td>
                <td class="p-3">USD ${q.monto_alojamiento.toFixed(2)}</td>
                <td class="p-3 font-semibold text-brand-primary">USD ${q.costo_total.toFixed(2)}</td>
                <td class="p-3">USD ${q.precio_persona.toFixed(2)}</td>
                <td class="p-3">
                    <button class="px-3 py-1 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-md font-bold text-[10px] uppercase tracking-wider transition-all" onclick="loadImportedQuoteIntoForm(${idx})">Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        document.getElementById('import-results-panel').classList.remove('hidden');
        document.getElementById('import-results-panel').classList.add('block');
    } catch (err) {
        document.getElementById('loading-overlay').style.display = 'none';
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
    document.getElementById('fecha_salida').value = formatToPicker(q.fecha_salida);
    document.getElementById('fecha_vuelo_ida').value = formatToPicker(q.fecha_vuelo_ida || q.fecha_salida);
    document.getElementById('fecha_vuelo_vuelta').value = formatToPicker(q.fecha_vuelo_vuelta);
    
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
        const res = await fetch('/api/optimizar-descripcion', {
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
    const modal = document.getElementById('confirm-modal');
    const box = document.getElementById('confirm-modal-box');
    if (!modal || !box) return;
    
    // Show modal
    modal.classList.remove('opacity-0', 'pointer-events-none');
    modal.classList.add('opacity-100', 'pointer-events-auto');
    box.classList.remove('scale-90');
    box.classList.add('scale-100');
}
window.confirmNewQuote = confirmNewQuote;

function closeConfirmModal(confirmAction) {
    const modal = document.getElementById('confirm-modal');
    const box = document.getElementById('confirm-modal-box');
    if (!modal || !box) return;
    
    // Hide modal
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    box.classList.add('scale-90');
    box.classList.remove('scale-100');
    
    if (confirmAction) {
        resetForm();
    } else {
        switchTab('cotizacion-tab');
    }
}
window.closeConfirmModal = closeConfirmModal;

function resetForm() {
    // Clear general details
    document.getElementById('nombre_pax').value = '';
    document.getElementById('destino').value = '';
    document.getElementById('cantidad_pasajeros').value = '';
    document.getElementById('fecha_salida').value = '';
    document.getElementById('fecha_vuelo_ida').value = '';
    document.getElementById('fecha_vuelo_vuelta').value = '';
    
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
    
    // Update summary
    updateRealTimeSummary();
    
    // Switch to tab
    switchTab('cotizacion-tab');
}
window.resetForm = resetForm;
