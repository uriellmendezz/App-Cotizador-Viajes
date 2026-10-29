// ──────────────────────────────────────────────────────────────────────────────
// INICIO — PANEL DE GESTIÓN
// Todo se calcula en el cliente a partir de las dos listas que ya existen
// (/api/cotizaciones y /api/presupuestos): no hay endpoints nuevos.
// ──────────────────────────────────────────────────────────────────────────────

// Paisajes del fondo. Para usar fotos propias, reemplazá estas URLs por rutas de /assets.
const DASH_PAISAJES = [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1506929562872-bb421503ef21?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1920&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?q=80&w=1920&auto=format&fit=crop'
];
const DASH_INTERVALO_MS = 10000;
const DASH_DIAS_GRAFICO = 30;
const DASH_DIAS_SALIDAS = 30;
const DASH_FILAS_ACTIVIDAD = 8;

const MS_DIA = 86400000;
const fmtEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtMes = new Intl.DateTimeFormat('es-AR', { month: 'long' });
const fmtMesCorto = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const fmtDiaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtFechaLarga = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

let dashWashTimer = null;
let dashChartObserver = null;

// ── Utilidades ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const capitalizar = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function inicioDelDia(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

/** Fecha de un string ISO ("2026-10-18" o con hora). Las fechas sin hora se toman como locales. */
function parseFecha(valor) {
    if (!valor) return null;
    const str = String(valor).trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00`) : new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function saludoSegunHora(fecha = new Date()) {
    const h = fecha.getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
}

/** "hace 5 min", "hace 3 h", "ayer", "12 oct" */
function tiempoRelativo(fecha) {
    if (!fecha) return '—';
    const diffMin = Math.round((Date.now() - fecha.getTime()) / 60000);
    if (diffMin < 1) return 'recién';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24 && inicioDelDia(fecha).getTime() === inicioDelDia(new Date()).getTime()) return `hace ${diffH} h`;
    const dias = Math.round((inicioDelDia(new Date()) - inicioDelDia(fecha)) / MS_DIA);
    if (dias === 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return `${fecha.getDate()} ${fmtMesCorto.format(fecha).replace('.', '')}`;
}

function enCuantosDias(fecha) {
    const dias = Math.round((inicioDelDia(fecha) - inicioDelDia(new Date())) / MS_DIA);
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    return `en ${dias} días`;
}

/** Montos grandes compactos para los indicadores: 48.230 / 1,2 M */
function montoCompacto(n) {
    if (Math.abs(n) >= 1e6) {
        return `${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
    }
    return fmtEntero.format(Math.round(n));
}

// ── Datos ─────────────────────────────────────────────────────────────────────

/** Lleva cotizaciones completas y rápidas a una misma forma. */
function normalizar(item, tipo) {
    const meta = (item.hoteles || []).find(h => h && h.nombre === 'METADATA_PRESUPUESTO_RAPIDO') || {};
    const esRapida = tipo === 'rapida';
    return {
        id: item.id,
        tipo,
        cliente: (esRapida ? item.pasajero_nombre : item.nombre_pax) || 'Sin nombre',
        destino: (item.destino || meta.destino || '').trim(),
        salida: parseFecha(esRapida ? meta.fecha_salida : (item.fecha_salida || meta.fecha_salida)),
        monto: parseFloat(esRapida ? item.total_cotizacion : item.costo_total) || 0,
        moneda: (esRapida ? meta.moneda : item.moneda) || 'USD',
        creada: parseFecha(item.created_at)
    };
}

async function fetchMisCotizaciones() {
    const [resQuotes, resBudgets] = await Promise.all([
        window.authenticatedFetch('/api/cotizaciones'),
        window.authenticatedFetch('/api/presupuestos')
    ]);
    if (!resQuotes.ok || !resBudgets.ok) throw new Error('No se pudieron obtener las cotizaciones.');

    const [quotes, budgets] = await Promise.all([resQuotes.json(), resBudgets.json()]);

    const currentUser = (window.loggedInUser || '').toLowerCase();
    const currentUserId = (window.userId || '').toLowerCase();
    const isMine = (q) => {
        const name = (q.agente_nombre || q.agente_id || '').toLowerCase();
        const id = (q.agente_id || '').toLowerCase();
        if (currentUser && (name === currentUser || id === currentUser)) return true;
        if (currentUserId && (id === currentUserId || name === currentUserId)) return true;
        return false;
    };

    return [
        ...quotes.filter(isMine).map(q => normalizar(q, 'completa')),
        ...budgets.filter(isMine).map(q => normalizar(q, 'rapida'))
    ].sort((a, b) => (b.creada?.getTime() || 0) - (a.creada?.getTime() || 0));
}

// ── Fondo y vuelo ─────────────────────────────────────────────────────────────

function initDashBackdrop() {
    const stack = document.getElementById('dash-wash-stack');
    if (!stack) return;

    clearInterval(dashWashTimer);
    stack.innerHTML = '';

    const capas = DASH_PAISAJES.map((url, i) => {
        const capa = document.createElement('div');
        capa.className = 'dash-wash' + (i === 0 ? ' active' : '');
        capa.style.backgroundImage = `url('${url}')`;
        stack.appendChild(capa);
        return capa;
    });

    if (capas.length < 2) return;

    let actual = 0;
    dashWashTimer = setInterval(() => {
        // La vista ya no está montada: se corta el intervalo
        if (!document.body.contains(stack)) {
            clearInterval(dashWashTimer);
            return;
        }
        capas[actual].classList.remove('active');
        actual = (actual + 1) % capas.length;
        capas[actual].classList.add('active');
    }, DASH_INTERVALO_MS);
}

// ── Encabezado ────────────────────────────────────────────────────────────────

function resolverAgente() {
    let rawUser = window.loggedInUser || localStorage.getItem('otg_agent_user');
    if (!rawUser || rawUser === 'Agente' || rawUser === 'guest' || rawUser === 'Invitado') {
        const payload = window.decodeTokenPayload ? window.decodeTokenPayload(window.authToken) : null;
        if (payload?.nombre && payload.nombre !== 'Agente') rawUser = payload.nombre;
        else if (payload?.username && payload.username !== 'Agente') rawUser = payload.username;
        else if (payload?.email) rawUser = payload.email.split('@')[0];
    }
    const username = (rawUser && rawUser !== 'guest' && rawUser !== 'Invitado') ? rawUser : 'Agente';
    return capitalizar(username);
}

async function resolverSucursal() {
    if (window.userSucursalNombre) return `One Trip ${window.userSucursalNombre}`;
    if (window.agencyConfig && window.agencyConfig.nombre_agencia) return window.agencyConfig.nombre_agencia;
    try {
        const res = await fetch('/api/config', {
            headers: { 'Authorization': `Bearer ${window.authToken || ''}` }
        });
        if (res.ok) {
            const config = await res.json();
            window.agencyConfig = config;
            if (window.userSucursalNombre) return `One Trip ${window.userSucursalNombre}`;
            if (config.nombre_agencia) return config.nombre_agencia;
        }
    } catch (e) {
        console.error('Error fetching config in initInicio:', e);
    }
    return 'One Trip';
}

function renderEncabezado(agente, sucursal) {
    const ahora = new Date();
    const eyebrow = document.getElementById('dash-eyebrow');
    if (eyebrow) eyebrow.textContent = `${capitalizar(fmtFechaLarga.format(ahora))} · ${sucursal}`;

    const titulo = document.getElementById('welcome-title');
    if (titulo) titulo.textContent = `${saludoSegunHora(ahora)}, ${agente}`;
}

// ── Indicadores ───────────────────────────────────────────────────────────────

const ICONO_SUBE = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M6 9.5v-7M3 5.5l3-3 3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICONO_BAJA = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M6 2.5v7M3 6.5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Diferencia firmada con flecha y texto: nunca depende sólo del color. */
function deltaHtml(actual, anterior, etiqueta) {
    const diff = actual - anterior;
    if (diff === 0) return `<span class="dash-delta flat">Sin cambios</span> ${etiqueta}`;
    const sube = diff > 0;
    return `<span class="dash-delta ${sube ? 'up' : 'down'}">${sube ? ICONO_SUBE : ICONO_BAJA}${sube ? '+' : '−'}${fmtEntero.format(Math.abs(diff))}</span> ${etiqueta}`;
}

function calcularIndicadores(items) {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    // Mismo tramo del mes anterior (del 1 al día de hoy): comparar un mes
    // parcial contra uno completo exageraría la caída.
    const inicioMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const finTramoAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, ahora.getDate(), 23, 59, 59);

    const delMes = items.filter(i => i.creada && i.creada >= inicioMes);
    const tramoAnterior = items.filter(i => i.creada && i.creada >= inicioMesAnt && i.creada <= finTramoAnt);

    // Los montos se suman sólo en USD: mezclar monedas daría un total sin sentido
    const delMesUsd = delMes.filter(i => i.moneda === 'USD');
    const montoMes = delMesUsd.reduce((s, i) => s + i.monto, 0);
    const excluidasArs = delMes.length - delMesUsd.length;

    const hoy = inicioDelDia(ahora);
    const limite = new Date(hoy.getTime() + DASH_DIAS_SALIDAS * MS_DIA);
    const salidas = items.filter(i => i.salida && i.salida >= hoy && i.salida <= limite);

    return {
        mesNombre: fmtMes.format(inicioMesAnt),
        cantidadMes: delMes.length,
        cantidadAnterior: tramoAnterior.length,
        montoMes,
        ticket: delMesUsd.length ? montoMes / delMesUsd.length : 0,
        cantidadUsd: delMesUsd.length,
        excluidasArs,
        salidas
    };
}

function renderIndicadores(k) {
    const cont = document.getElementById('dash-kpis');
    if (!cont) return;

    const notaArs = k.excluidasArs > 0
        ? `Excluye ${k.excluidasArs} en ARS`
        : 'Cotizaciones en USD';

    const filas = [
        {
            label: 'Cotizaciones del mes',
            value: fmtEntero.format(k.cantidadMes),
            foot: deltaHtml(k.cantidadMes, k.cantidadAnterior, `vs. mismo período de ${k.mesNombre}`)
        },
        {
            label: 'Monto cotizado',
            value: `${montoCompacto(k.montoMes)}<span class="dash-kpi-unit">USD</span>`,
            foot: escapeHtml(notaArs)
        },
        {
            label: 'Ticket promedio',
            value: k.cantidadUsd
                ? `${montoCompacto(k.ticket)}<span class="dash-kpi-unit">USD</span>`
                : '—',
            foot: k.cantidadUsd ? `Sobre ${k.cantidadUsd} ${k.cantidadUsd === 1 ? 'cotización' : 'cotizaciones'}` : 'Sin cotizaciones este mes'
        },
        {
            label: 'Salidas próximas',
            value: fmtEntero.format(k.salidas.length),
            foot: `En los próximos ${DASH_DIAS_SALIDAS} días`
        }
    ];

    cont.innerHTML = filas.map(f => `
        <div class="dash-kpi">
            <p class="dash-kpi-label">${f.label}</p>
            <p class="dash-kpi-value">${f.value}</p>
            <p class="dash-kpi-foot">${f.foot}</p>
        </div>`).join('');
}

// ── Gráfico: cotizaciones por día ─────────────────────────────────────────────

/** Tope del eje con números redondos: 4, 5, 10, 20, 25, 50... */
function topeEje(max) {
    if (max <= 4) return 4;
    const paso = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) {
        if (m * paso >= max) return m * paso;
    }
    return 10 * paso;
}

function renderGrafico(items) {
    const cont = document.getElementById('dash-chart');
    if (!cont) return;

    const hoy = inicioDelDia(new Date());
    const dias = Array.from({ length: DASH_DIAS_GRAFICO }, (_, i) => {
        const fecha = new Date(hoy.getTime() - (DASH_DIAS_GRAFICO - 1 - i) * MS_DIA);
        return { fecha, total: 0, rapidas: 0, completas: 0 };
    });
    const indice = new Map(dias.map((d, i) => [d.fecha.getTime(), i]));

    items.forEach(it => {
        if (!it.creada) return;
        const i = indice.get(inicioDelDia(it.creada).getTime());
        if (i === undefined) return;
        dias[i].total++;
        if (it.tipo === 'rapida') dias[i].rapidas++;
        else dias[i].completas++;
    });

    const totalPeriodo = dias.reduce((s, d) => s + d.total, 0);
    const meta = document.getElementById('dash-chart-meta');
    if (meta) meta.textContent = `Últimos ${DASH_DIAS_GRAFICO} días · ${fmtEntero.format(totalPeriodo)} en total`;

    if (totalPeriodo === 0) {
        cont.innerHTML = '<p class="dash-empty">Todavía no hay cotizaciones en los últimos 30 días.</p>';
        cont.style.height = 'auto';
        return;
    }

    const ancho = Math.max(cont.clientWidth, 280);
    const alto = cont.clientHeight || 180;
    const margen = { top: 8, right: 0, bottom: 24, left: 28 };
    const plotW = ancho - margen.left - margen.right;
    const plotH = alto - margen.top - margen.bottom;

    const tope = topeEje(Math.max(...dias.map(d => d.total)));
    const ticks = [0, tope / 2, tope].filter((v, i, a) => Number.isInteger(v) && a.indexOf(v) === i);

    const banda = plotW / dias.length;
    // Barras finas: tope de 18px (el máximo admitido es 24) y siempre 2px de aire entre vecinas
    const barW = Math.max(2, Math.min(18, banda - 2));
    const y = (v) => margen.top + plotH - (v / tope) * plotH;
    const radio = Math.min(4, barW / 2);

    // Barra con punta redondeada arriba y base recta sobre el eje
    const barraPath = (x, h) => {
        if (h <= 0) return '';
        const r = Math.min(radio, h);
        const top = margen.top + plotH - h;
        const base = margen.top + plotH;
        return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${base}Z`;
    };

    const grid = ticks.map(t => `
        <line class="grid-line" x1="${margen.left}" x2="${ancho}" y1="${y(t)}" y2="${y(t)}" />
        <text class="axis-text" x="${margen.left - 8}" y="${y(t)}" dy="0.32em" text-anchor="end">${t}</text>`).join('');

    // Etiquetas del eje X: una por semana, alineadas a la última barra (hoy)
    const etiquetasX = dias.map((d, i) => {
        if ((dias.length - 1 - i) % 7 !== 0) return '';
        const cx = margen.left + i * banda + banda / 2;
        const texto = `${d.fecha.getDate()} ${fmtMesCorto.format(d.fecha).replace('.', '')}`;
        return `<text class="axis-text" x="${cx}" y="${alto - 6}" text-anchor="middle">${texto}</text>`;
    }).join('');

    const barras = dias.map((d, i) => {
        const x = margen.left + i * banda + (banda - barW) / 2;
        const h = (d.total / tope) * plotH;
        return `<path class="bar" data-i="${i}" d="${barraPath(x, h)}" />`;
    }).join('');

    // Zonas de hover: la columna entera, más grande que la barra
    const hits = dias.map((d, i) =>
        `<rect class="hit" data-i="${i}" x="${margen.left + i * banda}" y="${margen.top}" width="${banda}" height="${plotH}" />`
    ).join('');

    cont.innerHTML = `
        <svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}">
            ${grid}
            ${barras}
            ${etiquetasX}
            ${hits}
        </svg>
        <div class="dash-tooltip" role="status"></div>`;

    const svg = cont.querySelector('svg');
    const tooltip = cont.querySelector('.dash-tooltip');
    const barrasEl = cont.querySelectorAll('.bar');

    const mostrar = (i) => {
        const d = dias[i];
        svg.classList.add('is-hovering');
        barrasEl.forEach(b => b.classList.toggle('is-active', Number(b.dataset.i) === i));

        const fecha = capitalizar(fmtDiaSemana.format(d.fecha));
        const detalle = d.total
            ? `${fecha} · ${d.completas} cotizaci${d.completas === 1 ? 'ón' : 'ones'}, ${d.rapidas} presupuesto${d.rapidas === 1 ? '' : 's'}`
            : fecha;
        tooltip.innerHTML = `<strong>${d.total} ${d.total === 1 ? 'cotización' : 'cotizaciones'}</strong><span>${detalle}</span>`;

        // Posición: centrada sobre la columna, acotada al ancho del gráfico
        const escala = cont.clientWidth / ancho;
        const cx = (margen.left + i * banda + banda / 2) * escala;
        const cy = y(d.total) * escala;
        tooltip.style.left = `${cx}px`;
        tooltip.style.top = `${Math.max(cy, 24)}px`;
        tooltip.classList.add('visible');

        const rect = tooltip.getBoundingClientRect();
        const contRect = cont.getBoundingClientRect();
        if (rect.left < contRect.left) tooltip.style.left = `${cx + (contRect.left - rect.left)}px`;
        if (rect.right > contRect.right) tooltip.style.left = `${cx - (rect.right - contRect.right)}px`;
    };

    const ocultar = () => {
        svg.classList.remove('is-hovering');
        barrasEl.forEach(b => b.classList.remove('is-active'));
        tooltip.classList.remove('visible');
    };

    cont.querySelectorAll('.hit').forEach(h => {
        h.addEventListener('mouseenter', () => mostrar(Number(h.dataset.i)));
    });
    svg.addEventListener('mouseleave', ocultar);

    // Resumen accesible del gráfico
    const pico = dias.reduce((a, b) => (b.total > a.total ? b : a));
    cont.setAttribute('aria-label',
        `Cotizaciones por día en los últimos ${DASH_DIAS_GRAFICO} días: ${totalPeriodo} en total, ` +
        `con un máximo de ${pico.total} el ${fmtDiaSemana.format(pico.fecha)}.`);
}

/** Redibuja el gráfico cuando cambia el ancho (sidebar colapsada, ventana, etc.). */
function observarAnchoGrafico(items) {
    const cont = document.getElementById('dash-chart');
    if (!cont || typeof ResizeObserver === 'undefined') return;

    dashChartObserver?.disconnect();
    let anchoPrevio = cont.clientWidth;
    let pendiente = null;

    dashChartObserver = new ResizeObserver(() => {
        if (!document.body.contains(cont)) {
            dashChartObserver.disconnect();
            return;
        }
        if (Math.abs(cont.clientWidth - anchoPrevio) < 4) return;
        anchoPrevio = cont.clientWidth;
        cancelAnimationFrame(pendiente);
        pendiente = requestAnimationFrame(() => renderGrafico(items));
    });
    dashChartObserver.observe(cont);
}

// ── Actividad reciente ────────────────────────────────────────────────────────

function abrirCotizacion(item) {
    if (item.tipo === 'rapida') {
        window.pendingEditQuickBudgetId = item.id;
        window.navigateTo('/cotizacion-rapida');
    } else {
        window.navigateTo('/ver-cotizacion?id=' + item.id);
    }
}

function renderActividad(items) {
    const cont = document.getElementById('dash-activity');
    if (!cont) return;

    const filas = items.slice(0, DASH_FILAS_ACTIVIDAD);
    if (!filas.length) {
        cont.innerHTML = '<p class="dash-empty">Cuando armes tu primera cotización va a aparecer acá.</p>';
        return;
    }

    cont.innerHTML = `
        <table class="dash-table">
            <thead>
                <tr>
                    <th style="width: 34%">Cliente</th>
                    <th style="width: 26%">Destino</th>
                    <th class="col-optional fit">Tipo</th>
                    <th class="col-optional fit">Salida</th>
                    <th class="num fit">Monto</th>
                    <th class="col-optional num fit">Creada</th>
                </tr>
            </thead>
            <tbody>
                ${filas.map((it, i) => `
                    <tr class="dash-row" data-i="${i}" tabindex="0">
                        <td class="cell-client" title="${escapeHtml(it.cliente)}">${escapeHtml(it.cliente)}</td>
                        <td title="${escapeHtml(it.destino)}">${it.destino ? escapeHtml(it.destino) : '<span style="color:var(--ink-3)">—</span>'}</td>
                        <td class="col-optional fit"><span class="dash-type ${it.tipo}">${it.tipo === 'rapida' ? 'Presupuesto' : 'Cotización'}</span></td>
                        <td class="col-optional fit">${it.salida ? `${it.salida.getDate()} ${fmtMesCorto.format(it.salida).replace('.', '')}` : '—'}</td>
                        <td class="num fit" style="color:var(--ink)">${escapeHtml(it.moneda)} ${fmtEntero.format(Math.round(it.monto))}</td>
                        <td class="col-optional num fit">${tiempoRelativo(it.creada)}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;

    cont.querySelectorAll('.dash-row').forEach(tr => {
        const item = filas[Number(tr.dataset.i)];
        tr.addEventListener('click', () => abrirCotizacion(item));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrirCotizacion(item); });
    });
}

// ── Columna lateral ───────────────────────────────────────────────────────────

function renderSalidas(salidas) {
    const cont = document.getElementById('dash-departures');
    if (!cont) return;

    const proximas = [...salidas].sort((a, b) => a.salida - b.salida).slice(0, 5);
    if (!proximas.length) {
        cont.innerHTML = '<p class="dash-empty">No hay salidas en los próximos 30 días.</p>';
        return;
    }

    cont.innerHTML = proximas.map((it, i) => `
        <div class="dash-list-item dash-nav-item" data-i="${i}" tabindex="0" style="margin:0;padding-left:0;padding-right:0">
            <span class="dash-date">
                <span class="dash-date-day">${it.salida.getDate()}</span>
                <span class="dash-date-month">${fmtMesCorto.format(it.salida).replace('.', '')}</span>
            </span>
            <span class="dash-list-main">
                <span class="dash-list-title">${escapeHtml(it.cliente)}</span>
                <span class="dash-list-sub">${it.destino ? escapeHtml(it.destino) : 'Destino sin cargar'}</span>
            </span>
            <span class="dash-list-aside">${enCuantosDias(it.salida)}</span>
        </div>`).join('');

    cont.querySelectorAll('[data-i]').forEach(el => {
        const item = proximas[Number(el.dataset.i)];
        el.addEventListener('click', () => abrirCotizacion(item));
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrirCotizacion(item); });
    });
}

function renderDestinos(items) {
    const cont = document.getElementById('dash-destinations');
    if (!cont) return;

    // Agrupa sin distinguir mayúsculas ni espacios; se muestra la forma más usada
    const grupos = new Map();
    items.forEach(it => {
        if (!it.destino) return;
        const clave = it.destino.toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
        const g = grupos.get(clave) || { nombre: it.destino, cantidad: 0 };
        g.cantidad++;
        grupos.set(clave, g);
    });

    const ranking = [...grupos.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
    if (!ranking.length) {
        cont.innerHTML = '<p class="dash-empty">Cargá el destino en tus cotizaciones para ver el ranking.</p>';
        return;
    }

    const max = ranking[0].cantidad;
    cont.innerHTML = ranking.map((d, i) => `
        <div class="dash-list-item" style="display:block">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:.75rem">
                <span class="dash-list-title">${escapeHtml(d.nombre)}</span>
                <span class="dash-list-aside">${d.cantidad}</span>
            </div>
            <div class="dash-rank-track" aria-hidden="true">
                <div class="dash-rank-fill" style="width:${(d.cantidad / max) * 100}%;animation-delay:${120 + i * 60}ms"></div>
            </div>
        </div>`).join('');
}

// ── Montaje ───────────────────────────────────────────────────────────────────

export async function initInicio() {
    if (!document.getElementById('inicio-page-container')) return;

    initDashBackdrop();

    // El saludo no depende de las cotizaciones: se muestra de inmediato
    const agente = resolverAgente();
    renderEncabezado(agente, window.userSucursalNombre ? `One Trip ${window.userSucursalNombre}` : '');
    resolverSucursal().then(sucursal => renderEncabezado(agente, sucursal));

    try {
        const items = await fetchMisCotizaciones();
        const indicadores = calcularIndicadores(items);
        renderIndicadores(indicadores);
        renderGrafico(items);
        observarAnchoGrafico(items);
        renderActividad(items);
        renderSalidas(indicadores.salidas);
        renderDestinos(items);
    } catch (e) {
        console.error('Error cargando el panel de inicio:', e);
        const aviso = '<p class="dash-empty">No se pudieron cargar los datos. Reintentá en unos segundos.</p>';
        ['dash-activity', 'dash-departures', 'dash-destinations'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = aviso;
        });
        const chart = document.getElementById('dash-chart');
        if (chart) { chart.innerHTML = aviso; chart.style.height = 'auto'; }
        document.querySelectorAll('#dash-kpis .dash-kpi-value').forEach(el => { el.textContent = '—'; });
    }
}

export function initOpciones() {
    // No specific initialization script logic is required for static options links
}
