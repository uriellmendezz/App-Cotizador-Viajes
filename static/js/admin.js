// static/js/admin.js

// static/js/admin.js

let agentesCache = [];
let sucursalesCache = [];

export async function initAdmin() {
    const pageContainer = document.getElementById('admin-page-container');
    if (!pageContainer) return;

    // Enforce role check
    if (window.userRole !== 'ADMIN_GLOBAL') {
        window.showAlert('error', 'Acceso denegado. Se requieren permisos de Administrador Global.');
        window.navigateTo('/admin-login');
        return;
    }

    // Bind UI Events
    const formSucursal = document.getElementById('form-sucursal');
    const formAgente = document.getElementById('form-agente');
    const selectRol = document.getElementById('agente-rol');
    const sucursalWrapper = document.getElementById('agente-sucursal-wrapper');
    const logoutBtn = document.getElementById('admin-btn-logout');

    if (formSucursal) {
        formSucursal.addEventListener('submit', handleCreateSucursal);
    }

    if (formAgente) {
        formAgente.addEventListener('submit', handleCreateAgente);
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            window.showCustomConfirm({
                title: '¿Cerrar Sesión?',
                desc: '¿Estás seguro de que deseas cerrar la sesión de administrador?',
                btnText: 'Sí, Cerrar Sesión',
                confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
                callback: () => {
                    window.setSession(null, null);
                    window.navigateTo('/admin-login');
                }
            });
        });
    }

    if (selectRol && sucursalWrapper) {
        selectRol.addEventListener('change', () => {
            if (selectRol.value === 'ADMIN_GLOBAL') {
                sucursalWrapper.classList.add('hidden');
                document.getElementById('agente-sucursal').required = false;
            } else {
                sucursalWrapper.classList.remove('hidden');
                document.getElementById('agente-sucursal').required = true;
            }
        });
    }

    // Tabs Navigation Toggle Logic
    const tabAgentes = document.getElementById('tab-btn-agentes');
    const tabSucursales = document.getElementById('tab-btn-sucursales');
    const contentAgentes = document.getElementById('tab-content-agentes');
    const contentSucursales = document.getElementById('tab-content-sucursales');

    if (tabAgentes && tabSucursales && contentAgentes && contentSucursales) {
        tabAgentes.addEventListener('click', () => {
            // Set Active class for Agentes
            tabAgentes.classList.add('border-brand-primary', 'text-slate-800', 'font-black');
            tabAgentes.classList.remove('border-transparent', 'text-slate-400', 'font-bold');
            tabAgentes.querySelector('svg')?.classList.add('text-brand-primary');

            // Deactivate Sucursales
            tabSucursales.classList.remove('border-brand-primary', 'text-slate-800', 'font-black');
            tabSucursales.classList.add('border-transparent', 'text-slate-400', 'font-bold');
            tabSucursales.querySelector('svg')?.classList.remove('text-brand-primary');

            // Show / Hide content
            contentAgentes.classList.remove('hidden');
            contentSucursales.classList.add('hidden');
        });

        tabSucursales.addEventListener('click', () => {
            // Set Active class for Sucursales
            tabSucursales.classList.add('border-brand-primary', 'text-slate-800', 'font-black');
            tabSucursales.classList.remove('border-transparent', 'text-slate-400', 'font-bold');
            tabSucursales.querySelector('svg')?.classList.add('text-brand-primary');

            // Deactivate Agentes
            tabAgentes.classList.remove('border-brand-primary', 'text-slate-800', 'font-black');
            tabAgentes.classList.add('border-transparent', 'text-slate-400', 'font-bold');
            tabAgentes.querySelector('svg')?.classList.remove('text-brand-primary');

            // Show / Hide content
            contentSucursales.classList.remove('hidden');
            contentAgentes.classList.add('hidden');
        });
    }

    // Load initial data sequentially to build counters
    window.showLoader('Cargando datos de administración...');
    await loadAgentes();
    await loadSucursales();
    window.hideLoader();

    // Reveal page container smoothly
    pageContainer.classList.remove('opacity-0');
    pageContainer.classList.add('opacity-100');
}

// ── DATA FETCHING ────────────────────────────────────────────────────────────

async function loadSucursales() {
    const tableBody = document.getElementById('sucursales-table-body');
    const selectSelect = document.getElementById('agente-sucursal');
    const statCount = document.getElementById('stat-sucursales-count');
    if (!tableBody) return;

    try {
        const res = await window.authenticatedFetch('/api/admin/sucursales');
        if (!res.ok) throw new Error('Error al consultar las sucursales.');

        const data = await res.json();
        sucursalesCache = data;

        // Update Stat count
        if (statCount) statCount.innerText = data.length;

        // Render sucursales in selection dropdown
        if (selectSelect) {
            selectSelect.innerHTML = '<option value="">Seleccione una sucursal...</option>';
            data.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.innerText = s.nombre;
                selectSelect.appendChild(opt);
            });
        }

        // Render sucursales in table body
        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-6 text-center text-xs text-slate-400 font-medium">
                        No hay sucursales registradas.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(s => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-rose-50/10 transition-colors';
            
            const agentCount = agentesCache.filter(a => a.sucursal_id === s.id).length;

            tr.innerHTML = `
                <td class="py-3 pl-2">
                    <span class="font-extrabold text-slate-800">${s.nombre}</span>
                </td>
                <td class="py-3 text-slate-400 font-mono text-[10px] select-all">${s.id}</td>
                <td class="py-3 text-center">
                    <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-md">${agentCount}</span>
                </td>
                <td class="py-3 pr-2 text-right">
                    <button type="button" class="btn-delete-sucursal p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg cursor-pointer transition-colors" data-id="${s.id}" data-name="${s.nombre}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            `;
            
            // Delete button listener
            tr.querySelector('.btn-delete-sucursal').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                confirmDeleteSucursal(id, name);
            });

            tableBody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="py-6 text-center text-xs text-rose-500 font-bold">
                    Error al cargar sucursales.
                </td>
            </tr>
        `;
    }
}

async function loadAgentes() {
    const tableBody = document.getElementById('agentes-table-body');
    const statCount = document.getElementById('stat-agentes-count');
    if (!tableBody) return;

    try {
        const res = await window.authenticatedFetch('/api/admin/agentes');
        if (!res.ok) throw new Error('Error al consultar los agentes.');

        const data = await res.json();
        agentesCache = data;

        // Update Stat count
        if (statCount) statCount.innerText = data.length;

        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-8 text-center text-slate-400 font-medium">
                        No hay agentes registrados en el sistema.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-rose-50/10 transition-colors';
            
            const sucursalNombre = a.sucursal_id ? (a.sucursales ? a.sucursales.nombre : 'Cargando...') : 'Global / Multi-sucursal';
            const roleBadge = a.rol === 'ADMIN_GLOBAL' 
                ? '<span class="px-2 py-0.5 bg-purple-50 text-purple-700 font-extrabold text-[9px] uppercase tracking-wider rounded-md border border-purple-100">Admin Global</span>'
                : '<span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[9px] uppercase tracking-wider rounded-md">Agente</span>';

            const usernameTag = a.username ? `<span class="block text-[10px] text-slate-400 font-bold mt-0.5">@${a.username}</span>` : '';
            const passwordVal = a.contrasena || null;
            const displayVal = passwordVal ? '••••••' : 'No disponible';

            tr.innerHTML = `
                <td class="py-3 pl-4">
                    <span class="font-extrabold text-slate-800">${a.nombre}</span>
                    ${usernameTag}
                </td>
                <td class="py-3 text-slate-500 font-medium">${a.email}</td>
                <td class="py-3 font-mono text-xs select-none">
                    <div class="flex items-center gap-2">
                        <span class="pwd-text" data-password="${passwordVal || ''}">${displayVal}</span>
                        <button type="button" class="btn-toggle-pwd p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Mostrar contraseña">
                            <svg class="w-4 h-4 outline-none pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        </button>
                    </div>
                </td>
                <td class="py-3">${roleBadge}</td>
                <td class="py-3 font-bold text-slate-600 text-xs">${sucursalNombre}</td>
                <td class="py-3 pr-4 text-right">
                    <button type="button" class="btn-delete-agente p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg cursor-pointer transition-colors" data-id="${a.id}" data-name="${a.nombre}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            `;

            // Toggle Password visibility logic
            const btnToggle = tr.querySelector('.btn-toggle-pwd');
            const textSpan = tr.querySelector('.pwd-text');
            if (btnToggle && textSpan) {
                btnToggle.addEventListener('click', () => {
                    const actualPwd = textSpan.getAttribute('data-password');
                    if (!actualPwd) {
                        window.showAlert('info', 'Esta cuenta fue registrada previa al almacenamiento de contraseñas.');
                        return;
                    }
                    const isMasked = textSpan.innerText === '••••••';
                    if (isMasked) {
                        textSpan.innerText = actualPwd;
                        // Eye-off icon
                        btnToggle.innerHTML = `
                            <svg class="w-4 h-4 outline-none pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                        `;
                        btnToggle.title = "Ocultar contraseña";
                    } else {
                        textSpan.innerText = '••••••';
                        // Eye icon
                        btnToggle.innerHTML = `
                            <svg class="w-4 h-4 outline-none pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        `;
                        btnToggle.title = "Mostrar contraseña";
                    }
                });
            }

            // Delete button listener
            tr.querySelector('.btn-delete-agente').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                confirmDeleteAgente(id, name);
            });

            tableBody.appendChild(tr);
        });
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="py-8 text-center text-rose-500 font-bold">
                    Error al cargar los agentes de viaje.
                </td>
            </tr>
        `;
    }
}

// ── EVENT HANDLERS ───────────────────────────────────────────────────────────

async function handleCreateSucursal(e) {
    e.preventDefault();
    const nombreInput = document.getElementById('sucursal-nombre');
    if (!nombreInput) return;

    const nombre = nombreInput.value.trim();
    if (!nombre) return;

    window.showLoader('Registrando sucursal...');
    try {
        const res = await window.authenticatedFetch('/api/admin/sucursales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });

        if (res.ok) {
            window.showAlert('success', `Sucursal "${nombre}" registrada correctamente.`);
            nombreInput.value = '';
            await loadSucursales();
        } else {
            const err = await res.json();
            window.showAlert('error', `Error al registrar sucursal: ${err.detail || 'Error desconocido'}`);
        }
    } catch (err) {
        console.error(err);
        window.showAlert('error', 'Error de red al intentar registrar la sucursal.');
    } finally {
        window.hideLoader();
    }
}

async function handleCreateAgente(e) {
    e.preventDefault();
    const nombre = document.getElementById('agente-nombre').value.trim();
    const username = document.getElementById('agente-username').value.trim();
    const email = document.getElementById('agente-email').value.trim();
    const password = document.getElementById('agente-password').value;
    const rol = document.getElementById('agente-rol').value;
    const sucursalSelect = document.getElementById('agente-sucursal');
    const sucursal_id = rol === 'ADMIN_GLOBAL' ? null : sucursalSelect.value;

    if (!nombre || !username || !email || !password) return;
    if (rol === 'AGENTE_SUCURSAL' && !sucursal_id) {
        window.showAlert('warning', 'Debes asignar una sucursal para este agente.');
        return;
    }

    window.showLoader('Registrando y configurando agente...');
    try {
        const res = await window.authenticatedFetch('/api/admin/agentes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, username, email, password, rol, sucursal_id })
        });

        if (res.ok) {
            window.showAlert('success', `Agente "${nombre}" creado y enrolado con éxito.`);
            document.getElementById('form-agente').reset();
            // Trigger role toggle to restore sucursal selection visibility
            document.getElementById('agente-sucursal-wrapper').classList.remove('hidden');
            await loadAgentes();
        } else {
            const err = await res.json();
            window.showAlert('error', `Error al registrar agente: ${err.detail || 'Error desconocido'}`);
        }
    } catch (err) {
        console.error(err);
        window.showAlert('error', 'Error de red al registrar el agente de viajes.');
    } finally {
        window.hideLoader();
    }
}

// ── CONFIRMATIONS & DELETIONS ────────────────────────────────────────────────

function confirmDeleteSucursal(id, name) {
    window.showCustomConfirm({
        title: '¿Eliminar Sucursal?',
        desc: `¿Estás seguro de que deseas eliminar la sucursal "${name}"? Se desasociará de los agentes asignados a ella.`,
        btnText: 'Sí, Eliminar',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            window.showLoader('Eliminando sucursal...');
            try {
                const res = await window.authenticatedFetch(`/api/admin/sucursales/${id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    window.showAlert('success', 'Sucursal eliminada correctamente.');
                    await Promise.all([loadSucursales(), loadAgentes()]);
                } else {
                    const err = await res.json();
                    window.showAlert('error', `Error al eliminar sucursal: ${err.detail}`);
                }
            } catch (err) {
                console.error(err);
                window.showAlert('error', 'Error de comunicación con el servidor.');
            } finally {
                window.hideLoader();
            }
        }
    });
}

function confirmDeleteAgente(id, name) {
    window.showCustomConfirm({
        title: '¿Eliminar Agente?',
        desc: `¿Estás seguro de que deseas eliminar al agente de viajes "${name}"? Perderá acceso completo al sistema inmediatamente.`,
        btnText: 'Sí, Eliminar Agente',
        confirmColorClass: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20',
        callback: async () => {
            window.showLoader('Eliminando agente del sistema...');
            try {
                const res = await window.authenticatedFetch(`/api/admin/agentes/${id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    window.showAlert('success', 'Agente eliminado correctamente del sistema.');
                    await loadAgentes();
                } else {
                    const err = await res.json();
                    window.showAlert('error', `Error al eliminar agente: ${err.detail}`);
                }
            } catch (err) {
                console.error(err);
                window.showAlert('error', 'Error de comunicación con el servidor.');
            } finally {
                window.hideLoader();
            }
        }
    });
}
