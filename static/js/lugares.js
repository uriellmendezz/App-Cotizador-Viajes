// lugares.js - Campos de origen, destino y puertos con lugares normalizados.
//
// Se activa en cualquier <input data-lugar>, incluso los que se crean después (paradas del
// multidestino, vistas que se cargan al navegar):
//   - Mientras se escribe, sugiere los lugares que ya están normalizados en la base.
//   - Al salir del campo, el backend lo normaliza con la API de OpenStreetMap
//     ("pta cana" -> "Punta Cana", "cancun" -> "Cancún").
// data-lugar="pais" completa además el país: "Miami" -> "Miami, Estados Unidos".
(function () {
    const MIN_CARACTERES = 2;
    const ESPERA_SUGERENCIAS = 250;

    let dropdown = null;
    let inputActivo = null;
    let sugerencias = [];
    let indiceActivo = -1;
    let timerSugerencias = null;
    let consultaActual = 0;

    function esCampoLugar(el) {
        return el instanceof HTMLInputElement && el.hasAttribute('data-lugar') && !el.disabled && !el.readOnly;
    }

    function escapeHtml(texto) {
        return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function formatear(input, lugar) {
        if (input.dataset.lugar === 'pais' && lugar.pais && lugar.tipo !== 'pais') {
            return `${lugar.nombre}, ${lugar.pais}`;
        }
        return lugar.nombre;
    }

    function detalle(lugar) {
        if (lugar.tipo === 'pais') return 'País';
        return [lugar.region, lugar.pais].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i && v !== lugar.nombre).join(', ');
    }

    // Cambia el valor avisando a los handlers existentes (resumen, guardado del formulario)
    function asignarValor(input, valor) {
        input.value = valor;
        input.dataset.lugarNormalizado = valor;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ── Lista de sugerencias ──

    function obtenerDropdown() {
        if (dropdown) return dropdown;
        dropdown = document.createElement('div');
        dropdown.id = 'lugares-sugerencias';
        dropdown.setAttribute('role', 'listbox');
        dropdown.className = 'hidden fixed z-[6000] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1';
        // mousedown en vez de click: así el campo no pierde el foco antes de elegir
        dropdown.addEventListener('mousedown', (e) => {
            const opcion = e.target.closest('[data-indice]');
            if (!opcion) return;
            e.preventDefault();
            elegir(parseInt(opcion.dataset.indice, 10));
        });
        document.body.appendChild(dropdown);
        return dropdown;
    }

    function posicionar() {
        if (!dropdown || !inputActivo) return;
        const r = inputActivo.getBoundingClientRect();
        dropdown.style.left = `${r.left}px`;
        dropdown.style.top = `${r.bottom + 4}px`;
        dropdown.style.width = `${Math.max(r.width, 240)}px`;
    }

    function mostrar(lista) {
        sugerencias = lista;
        indiceActivo = -1;
        const dd = obtenerDropdown();
        if (!lista.length || !inputActivo) {
            ocultar();
            return;
        }
        dd.innerHTML = lista.map((lugar, i) => `
            <div data-indice="${i}" role="option" class="px-3 py-2 cursor-pointer flex items-center justify-between gap-3 hover:bg-slate-50">
                <span class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(lugar.nombre)}</span>
                <span class="text-[11px] font-medium text-slate-400 truncate">${escapeHtml(detalle(lugar))}</span>
            </div>`).join('');
        posicionar();
        dd.classList.remove('hidden');
    }

    function ocultar() {
        dropdown?.classList.add('hidden');
        sugerencias = [];
        indiceActivo = -1;
    }

    function resaltar(indice) {
        indiceActivo = indice;
        dropdown?.querySelectorAll('[data-indice]').forEach((el, i) => {
            el.classList.toggle('bg-slate-100', i === indice);
        });
    }

    function elegir(indice) {
        const lugar = sugerencias[indice];
        if (!lugar || !inputActivo) return;
        asignarValor(inputActivo, formatear(inputActivo, lugar));
        ocultar();
    }

    async function buscarSugerencias(input) {
        const texto = input.value.trim();
        const consulta = ++consultaActual;
        if (texto.length < MIN_CARACTERES || typeof window.authenticatedFetch !== 'function') {
            ocultar();
            return;
        }
        try {
            const res = await window.authenticatedFetch(`/api/lugares/sugerencias?q=${encodeURIComponent(texto)}`);
            const lista = res.ok ? await res.json() : [];
            // Se descartan las respuestas viejas si el usuario siguió escribiendo
            if (consulta !== consultaActual || input !== inputActivo) return;
            mostrar(Array.isArray(lista) ? lista : []);
        } catch {
            ocultar();
        }
    }

    // ── Normalización al salir del campo ──

    async function normalizar(input) {
        const texto = input.value.trim();
        if (!texto || texto === input.dataset.lugarNormalizado || typeof window.authenticatedFetch !== 'function') return;
        try {
            const res = await window.authenticatedFetch(`/api/lugares/normalizar?q=${encodeURIComponent(texto)}`);
            if (!res.ok) return;
            const lugar = await res.json();
            // Solo si sigue el mismo texto y la API devolvió lo que se quiso escribir
            if (input.value.trim() !== texto) return;
            input.dataset.lugarNormalizado = texto;
            if (!lugar.coincide) return;
            const valor = formatear(input, lugar);
            if (valor !== input.value) {
                asignarValor(input, valor);
                input.classList.add('ring-2', 'ring-emerald-200');
                setTimeout(() => input.classList.remove('ring-2', 'ring-emerald-200'), 1200);
            }
            input.title = lugar.descripcion || '';
        } catch {
            // Sin conexión con la API: queda lo que escribió el usuario
        }
    }

    // ── Eventos (delegados en el documento) ──

    document.addEventListener('focusin', (e) => {
        if (esCampoLugar(e.target)) {
            inputActivo = e.target;
            e.target.setAttribute('autocomplete', 'off');
        }
    });

    document.addEventListener('input', (e) => {
        if (!esCampoLugar(e.target) || !e.isTrusted) return;
        inputActivo = e.target;
        clearTimeout(timerSugerencias);
        timerSugerencias = setTimeout(() => buscarSugerencias(e.target), ESPERA_SUGERENCIAS);
    });

    document.addEventListener('keydown', (e) => {
        if (!esCampoLugar(e.target) || !dropdown || dropdown.classList.contains('hidden')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            resaltar((indiceActivo + 1) % sugerencias.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            resaltar(indiceActivo <= 0 ? sugerencias.length - 1 : indiceActivo - 1);
        } else if (e.key === 'Enter' && indiceActivo >= 0) {
            e.preventDefault();
            elegir(indiceActivo);
        } else if (e.key === 'Escape') {
            // Que no cierre además el modal en el que está el campo
            e.stopPropagation();
            ocultar();
        }
    }, true);

    document.addEventListener('focusout', (e) => {
        if (!esCampoLugar(e.target)) return;
        clearTimeout(timerSugerencias);
        consultaActual++;
        ocultar();
        normalizar(e.target);
        if (inputActivo === e.target) inputActivo = null;
    });

    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
})();
