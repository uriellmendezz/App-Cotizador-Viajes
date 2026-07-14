// static/js/admin.js

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

    // Load initial data
    window.showLoader('Cargando datos de administración...');
    await Promise.all([loadSucursales(), loadAgentes()]);
    window.hideLoader();

    // Reveal page container smoothly
    pageContainer.classList.remove('opacity-0');
    pageContainer.classList.add('opacity-100');
}

// ── DATA FETCHING ────────────────────────────────────────────────────────────

let sucursalesCache = [];

async function loadSucursales() {
    const listContainer = document.getElementById('sucursales-list-container');
    const selectSelect = document.getElementById('agente-sucursal');
    const statCount = document.getElementById('stat-sucursales-count');
    if (!listContainer) return;

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

        // Render sucursales in list container
        if (data.length === 0) {
            listContainer.innerHTML = `
                <div class="py-6 text-center text-xs text-slate-400 font-medium">
                    No hay sucursales registradas.
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        data.forEach(s => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-2xl transition-all';
            item.innerHTML = `
                <div>
                    <span class="text-xs font-bold text-slate-800">${s.nombre}</span>
                </div>
                <button type="button" class="btn-delete-sucursal p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg cursor-pointer transition-colors" data-id="${s.id}" data-name="${s.nombre}">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            `;
            
            // Delete button listener
            item.querySelector('.btn-delete-sucursal').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                confirmDeleteSucursal(id, name);
            });

            listContainer.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        listContainer.innerHTML = `
            <div class="py-6 text-center text-xs text-rose-500 font-bold">
                Error al cargar sucursales.
            </div>
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

        // Update Stat count
        if (statCount) statCount.innerText = data.length;

        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-8 text-center text-slate-400 font-medium">
                        No hay agentes registrados en el sistema.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(a => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/50 transition-colors';
            
            const sucursalNombre = a.sucursal_id ? (a.sucursales ? a.sucursales.nombre : 'Cargando...') : 'Global / Multi-sucursal';
            const roleBadge = a.rol === 'ADMIN_GLOBAL' 
                ? '<span class="px-2 py-0.5 bg-purple-50 text-purple-700 font-extrabold text-[9px] uppercase tracking-wider rounded-md border border-purple-100">Admin Global</span>'
                : '<span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[9px] uppercase tracking-wider rounded-md">Agente</span>';

            const usernameTag = a.username ? `<span class="block text-[10px] text-slate-400 font-bold mt-0.5">@${a.username}</span>` : '';
            tr.innerHTML = `
                <td class="py-3.5 pl-4">
                    <span class="font-extrabold text-slate-800">${a.nombre}</span>
                    ${usernameTag}
                </td>
                <td class="py-3.5 text-slate-500 font-medium">${a.email}</td>
                <td class="py-3.5">${roleBadge}</td>
                <td class="py-3.5 font-bold text-slate-600 text-xs">${sucursalNombre}</td>
                <td class="py-3.5 pr-4 text-right">
                    <button type="button" class="btn-delete-agente p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-lg cursor-pointer transition-colors" data-id="${a.id}" data-name="${a.nombre}">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </td>
            `;

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
                <td colspan="5" class="py-8 text-center text-rose-500 font-bold">
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
