// comparador.js - Recotización y comparación de cotizaciones
//
// Convierte cualquier cotización (PDF estándar, multidestino, solo vuelos, crucero
// o rápida) en un "modelo" con los mismos conceptos de la tabla resumen, para:
//  · Recotizar: la tabla resumen en tiempo real muestra el valor anterior vs. el nuevo
//    y resalta en verde el más barato de cada par.
//  · Comparar cotizaciones (/comparar): dos o más cotizaciones lado a lado.
//
// Las fórmulas replican las de la tabla resumen (cotizar.js, cotizacion_rapida.js y
// crucero_resumen.js): 5% de gastos administrativos sobre los servicios terrestres y
// redondeo opcional del precio por persona al múltiplo de 10 superior.

import { isCruceroQuote, extractCrucero, cruceroNetCost } from './crucero_resumen.js';

const METADATA_NAMES = ['METADATA_COTIZACION', 'METADATA_PRESUPUESTO_RAPIDO'];

// Conceptos en el orden en que se muestran. `optional`: la fila solo aparece si algún valor es > 0
export const CONCEPTOS = [
    { key: 'vuelos', label: 'Vuelos', icon: 'avion.svg' },
    { key: 'fee', label: 'Fee Aéreo', icon: 'gastos.svg', optional: true },
    { key: 'crucero', label: 'Crucero', icon: 'cama.svg', optional: true },
    { key: 'alojamiento', label: 'Alojamiento', icon: 'cama.svg' },
    { key: 'traslados', label: 'Traslados', icon: 'traslados.svg', optional: true },
    { key: 'admin', label: 'Gastos Admin (5%)', icon: 'gastos.svg' },
    { key: 'iva', label: 'Gastos + IVA', icon: 'gastos.svg', optional: true },
    { key: 'redondeo', label: 'Redondeo', icon: 'dinero.svg', optional: true },
    { key: 'total', label: 'Total', icon: 'dinero.svg', strong: true },
    { key: 'porPax', label: 'Por Pax', icon: 'persona.svg', strong: true, brand: true }
];

const TIPO_LABELS = {
    estandar: 'Cotización',
    multidestino: 'Multidestino',
    vuelos: 'Solo vuelos',
    grupal: 'Grupal',
    crucero: 'Crucero',
    rapida: 'Presupuesto'
};

const num = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
};

const round2 = (n) => Math.round(num(n) * 100) / 100;

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const money = (currency, val) => `${currency} ${window.formatPriceES ? window.formatPriceES(val) : num(val).toFixed(2)}`;

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(String(dateStr).includes(' ') && !String(dateStr).includes('T') ? String(dateStr).replace(' ', 'T') : dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Montos de una opción con la fórmula de la tabla resumen. */
export function computePrices({ vuelos = 0, fee = 0, alojamiento = 0, traslados = 0, crucero = 0, iva = 0, cantPax = 1, redondear = false }) {
    const pax = Math.max(1, parseInt(cantPax, 10) || 1);
    const terrestre = num(alojamiento) + num(traslados) + num(crucero);
    const admin = terrestre * 0.05;
    const total = num(vuelos) + num(fee) + terrestre + admin + num(iva);
    const perPerson = total / pax;
    const porPax = redondear ? Math.ceil(perPerson / 10) * 10 : perPerson;
    const totalFinal = redondear ? porPax * pax : total;
    return {
        vuelos: round2(vuelos),
        fee: round2(fee),
        crucero: round2(crucero),
        alojamiento: round2(alojamiento),
        traslados: round2(traslados),
        admin: round2(admin),
        iva: round2(iva),
        redondeo: round2(totalFinal - total),
        total: round2(totalFinal),
        porPax: round2(porPax)
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// GRUPAL / FAMILY PLAN
// ──────────────────────────────────────────────────────────────────────────────

const BASE_LABELS = { 1: 'Single', 2: 'Doble', 3: 'Triple', 4: 'Cuádruple', 5: 'Quíntuple', 6: 'Séxtuple' };

export function baseLabel(pax) {
    const n = parseInt(pax, 10) || 0;
    return BASE_LABELS[n] || `${n} personas`;
}

/** Detecta si una cotización es grupal (vuelos del grupo + alojamiento por base). */
export function isGrupalQuote(quote) {
    if (!quote) return false;
    if (String(quote.tipo_cotizacion || '').toLowerCase() === 'grupal') return true;
    return Array.isArray(quote.hoteles) &&
        quote.hoteles.some(h => h && String(h.tipo_cotizacion || '').toLowerCase() === 'grupal');
}

/**
 * Precio de una base de habitación: los vuelos, el fee, los traslados y el IVA se
 * cargan para todo el grupo y se prorratean por persona; el alojamiento es el costo
 * de la habitación para esa base. Misma fórmula que _apply_grupal_totals (backend).
 */
export function computeBasePrices({ pax, alojamiento = 0, grupoPax = 1, vuelos = 0, fee = 0, traslados = 0, iva = 0, redondear = false }) {
    const grupo = Math.max(1, parseInt(grupoPax, 10) || 1);
    const n = Math.max(1, parseInt(pax, 10) || 1);
    return computePrices({
        vuelos: num(vuelos) / grupo * n,
        fee: num(fee) / grupo * n,
        traslados: num(traslados) / grupo * n,
        iva: num(iva) / grupo * n,
        alojamiento,
        cantPax: n,
        redondear
    });
}

/** Bases guardadas de un hotel grupal, con el costo neto de la habitación. */
export function hotelBases(h) {
    return (Array.isArray(h?.bases) ? h.bases : [])
        .map(b => ({ pax: parseInt(b.pax, 10) || 0, costo: num(b.costo_neto !== undefined ? b.costo_neto : b.costo) }))
        .filter(b => b.pax > 0)
        .sort((a, b) => a.pax - b.pax);
}

// ──────────────────────────────────────────────────────────────────────────────
// MODELOS
// ──────────────────────────────────────────────────────────────────────────────

function metaOf(quote) {
    return (quote.hoteles || []).find(h => h && METADATA_NAMES.includes(h.nombre)) || {};
}

function realHotelsOf(quote) {
    return (quote.hoteles || []).filter(h => h && !METADATA_NAMES.includes(h.nombre));
}

export function isQuickQuote(quote) {
    return !!quote && (quote.base_habitacion === 'PRESUPUESTO_RAPIDO' ||
        (quote.pasajero_nombre !== undefined && quote.total_cotizacion !== undefined));
}

function readRedondeo(quote, fallback = true) {
    if (typeof quote.redondear !== 'undefined') return !!quote.redondear;
    const meta = metaOf(quote);
    if (typeof meta.redondear !== 'undefined') return !!meta.redondear;
    const first = (quote.hoteles || [])[0];
    if (first && typeof first.redondear !== 'undefined') return !!first.redondear;
    return fallback;
}

function baseInfo(quote, tipo) {
    const meta = metaOf(quote);
    const fallbackCurrency = (quote.hoteles || []).find(h => h && h.moneda)?.moneda;
    return {
        id: quote.id ?? null,
        tipo,
        tipoLabel: TIPO_LABELS[tipo] || '',
        nombre: quote.nombre_pax || quote.pasajero_nombre || 'Sin nombre',
        destino: quote.destino || meta.destino || '',
        fecha: quote.updated_at || quote.created_at || '',
        currency: quote.moneda || meta.moneda || fallbackCurrency || 'USD',
        cantPax: Math.max(1, parseInt(quote.cantidad_pasajeros || quote.cant_pax, 10) || 1)
    };
}

// Costo neto de un hotel guardado (el backend reemplaza `costo` por el total del paquete)
function netHotelCost(h, quote, flightsTotal, transfersCost) {
    if (h.costo_neto !== undefined && h.costo_neto !== null && !isNaN(h.costo_neto) && Number(h.costo_neto) > 0) {
        return num(h.costo_neto);
    }
    if (h.costo_original !== undefined && h.costo_original !== null && !isNaN(h.costo_original)) {
        return num(h.costo_original);
    }
    const raw = num(h.costo);
    if (quote.costo_total && Math.abs(raw - num(quote.costo_total)) < 1) {
        return Math.max(0, (raw - flightsTotal) / 1.05 - transfersCost);
    }
    return raw;
}

function quickQuoteModel(quote) {
    const info = baseInfo(quote, 'rapida');
    const meta = metaOf(quote);
    let vuelos = 0, fee = 0, alojamiento = 0, traslados = 0;
    (quote.vuelos || []).forEach(v => { vuelos += num(v.monto); fee += num(v.fee); });
    const hoteles = realHotelsOf(quote);
    const nombres = [];
    hoteles.forEach(h => {
        if (String(h.nombre || '').toLowerCase().includes('traslado')) {
            traslados += num(h.costo);
        } else {
            alojamiento += num(h.costo);
            if (h.nombre) nombres.push(h.nombre);
        }
    });
    return {
        ...info,
        columns: [{
            name: nombres.join(' + ') || 'Cotización',
            values: computePrices({ vuelos, fee, alojamiento, traslados, cantPax: info.cantPax, redondear: !!meta.redondear })
        }]
    };
}

/** Modelo de una cotización guardada (o del payload de un formulario). */
export function buildQuoteModel(quote) {
    if (!quote) return null;
    if (isQuickQuote(quote)) return quickQuoteModel(quote);

    const flightsCost = num(quote.monto_vuelos);
    const flightsFee = num(quote.fee_aereo !== undefined ? quote.fee_aereo : quote.fee_aereo_monto);
    const transfersCost = num(quote.monto_traslados);
    const iva = num(quote.gastos_iva);
    const redondear = readRedondeo(quote);
    const hoteles = realHotelsOf(quote);

    if (isCruceroQuote(quote)) {
        const info = baseInfo(quote, 'crucero');
        const crucero = extractCrucero(quote);
        const alojamiento = hoteles.reduce((acc, h) => acc + num(h.costo_neto !== undefined ? h.costo_neto : h.costo), 0);
        return {
            ...info,
            columns: [{
                name: crucero.barco || 'Crucero',
                values: computePrices({
                    vuelos: flightsCost, fee: flightsFee, crucero: cruceroNetCost(crucero || {}),
                    alojamiento, traslados: transfersCost, iva, cantPax: info.cantPax, redondear
                })
            }]
        };
    }

    const meta = metaOf(quote);
    const tipoRaw = String(quote.tipo_cotizacion || meta.tipo_cotizacion || '').toLowerCase();
    const esSoloVuelos = tipoRaw === 'solo_vuelos' || hoteles.some(h => String(h.tipo_cotizacion || '').toLowerCase() === 'solo_vuelos');
    const esMulti = tipoRaw === 'multidestino' || hoteles.some(h => h.tipo_cotizacion === 'multidestino' || h.destino);

    if (esSoloVuelos) {
        const info = baseInfo(quote, 'vuelos');
        return {
            ...info,
            columns: [{
                name: 'Servicios aéreos',
                values: computePrices({ vuelos: flightsCost, fee: flightsFee, iva, cantPax: info.cantPax, redondear })
            }]
        };
    }

    const flightsTotal = flightsCost + flightsFee;

    if (isGrupalQuote(quote)) {
        const info = baseInfo(quote, 'grupal');
        const columns = [];
        hoteles.forEach((h, idx) => {
            hotelBases(h).forEach(b => columns.push({
                name: `${h.nombre || `Opción ${idx + 1}`} · ${baseLabel(b.pax)}`,
                values: computeBasePrices({
                    pax: b.pax, alojamiento: b.costo, grupoPax: info.cantPax,
                    vuelos: flightsCost, fee: flightsFee, traslados: transfersCost, iva, redondear
                })
            }));
        });
        return { ...info, columns };
    }

    if (esMulti) {
        const info = baseInfo(quote, 'multidestino');
        const alojamiento = hoteles.reduce((acc, h) => acc + netHotelCost(h, quote, flightsTotal, transfersCost), 0);
        const paradas = hoteles.map(h => h.destino).filter(Boolean);
        return {
            ...info,
            columns: [{
                name: paradas.length ? paradas.join(' → ') : `${hoteles.length} paradas`,
                values: computePrices({ vuelos: flightsCost, fee: flightsFee, alojamiento, traslados: transfersCost, iva, cantPax: info.cantPax, redondear })
            }]
        };
    }

    const info = baseInfo(quote, 'estandar');
    let recommendedIdx = hoteles.findIndex(h => h.recomendado || h.hotel_recomendado);
    if (recommendedIdx === -1) recommendedIdx = 0;
    const ordered = hoteles.length
        ? [hoteles[recommendedIdx], ...hoteles.filter((_, idx) => idx !== recommendedIdx)]
        : [{ nombre: 'Sin alojamiento', costo: 0 }];

    return {
        ...info,
        columns: ordered.map((h, idx) => ({
            name: h.nombre || h.hotel_nombre || `Opción ${idx + 1}`,
            values: computePrices({
                vuelos: flightsCost, fee: flightsFee,
                alojamiento: netHotelCost(h, quote, flightsTotal, transfersCost),
                traslados: transfersCost, iva, cantPax: info.cantPax, redondear
            })
        }))
    };
}

/**
 * Modelo a partir de los datos con los que se dibuja la tabla resumen en tiempo real.
 * tipo: 'estandar' (una columna por hotel), 'multidestino' (suma de paradas) o 'vuelos'.
 */
export function modelFromSummaryConfig(config, tipo = 'estandar') {
    const { currency = 'USD', cantPax = 1, flightsCost = 0, flightsFee = 0, transfersCost = 0, aplicarRedondeo = false, hotelList = [] } = config;
    const base = { id: null, tipo, tipoLabel: TIPO_LABELS[tipo], nombre: 'Nueva cotización', currency, cantPax: Math.max(1, parseInt(cantPax, 10) || 1) };
    const common = { vuelos: flightsCost, fee: flightsFee, cantPax: base.cantPax, redondear: aplicarRedondeo };

    if (tipo === 'vuelos') {
        return { ...base, columns: [{ name: 'Servicios aéreos', values: computePrices(common) }] };
    }
    if (tipo === 'grupal') {
        const columns = [];
        hotelList.forEach((h, idx) => {
            (h.bases || []).forEach(b => columns.push({
                name: `${h.hotelName || `Opción ${idx + 1}`} · ${baseLabel(b.pax)}`,
                values: computeBasePrices({
                    pax: b.pax, alojamiento: b.costo, grupoPax: base.cantPax,
                    vuelos: flightsCost, fee: flightsFee, traslados: transfersCost, redondear: aplicarRedondeo
                })
            }));
        });
        return { ...base, columns };
    }
    if (tipo === 'multidestino') {
        const alojamiento = hotelList.reduce((acc, h) => acc + num(h.hotelCost), 0);
        const paradas = hotelList.map(h => h.destino).filter(Boolean);
        return {
            ...base,
            columns: [{
                name: paradas.length ? paradas.join(' → ') : `${hotelList.length} paradas`,
                values: computePrices({ ...common, alojamiento, traslados: transfersCost })
            }]
        };
    }
    return {
        ...base,
        columns: hotelList.map((h, idx) => ({
            name: h.hotelName || `Opción ${idx + 1}`,
            values: computePrices({ ...common, alojamiento: h.hotelCost, traslados: transfersCost })
        }))
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// CARGA DE COTIZACIONES GUARDADAS
// ──────────────────────────────────────────────────────────────────────────────

/** kind: 'completa' (/api/cotizaciones) o 'rapida' (/api/presupuestos). */
export async function fetchQuote(id, kind = 'completa', options = {}) {
    const url = kind === 'rapida' ? `/api/presupuestos/${encodeURIComponent(id)}` : `/api/cotizaciones/${encodeURIComponent(id)}`;
    const res = await window.authenticatedFetch(url, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo cargar la cotización.');
    }
    return res.json();
}

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO DE LA RECOTIZACIÓN (por pestaña)
// ──────────────────────────────────────────────────────────────────────────────

const BASELINE_KEY = 'recotizacionBaseline';

function baselineKey() {
    return typeof window.tabStorageKey === 'function' ? window.tabStorageKey(BASELINE_KEY) : BASELINE_KEY;
}

export function getRecotizacionBaseline() {
    try {
        const raw = sessionStorage.getItem(baselineKey());
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

export function setRecotizacionBaseline(model) {
    try { sessionStorage.setItem(baselineKey(), JSON.stringify(model)); } catch (e) {}
}

export function clearRecotizacionBaseline() {
    try { sessionStorage.removeItem(baselineKey()); } catch (e) {}
}

window.getRecotizacionBaseline = getRecotizacionBaseline;
window.clearRecotizacionBaseline = clearRecotizacionBaseline;

/**
 * Abre la recotización en una pestaña nueva, así la cotización anterior queda
 * abierta en la pestaña actual para consultarla.
 */
export function openRecotizacion(id, kind = 'completa') {
    if (!id) return;
    const path = kind === 'rapida'
        ? `/cotizacion-rapida?recotizar=${encodeURIComponent(id)}`
        : `/cotizacion-completa?recotizar=${encodeURIComponent(id)}`;
    if (typeof window.openInAppTab === 'function') window.openInAppTab(path);
    else window.navigateTo(path);
}
window.openRecotizacion = openRecotizacion;

// ──────────────────────────────────────────────────────────────────────────────
// TABLA RESUMEN DE RECOTIZACIÓN (anterior vs. nueva)
// ──────────────────────────────────────────────────────────────────────────────

function visibleConceptos(models) {
    return CONCEPTOS.filter(c => !c.optional || models.some(m =>
        (m?.columns || []).some(col => num(col.values?.[c.key]) > 0)));
}

function iconImg(concepto, cls = 'icon-slate') {
    return `<img src="/assets/iconos/${concepto.icon}" class="w-3.5 h-3.5 ${cls}" alt="">`;
}

/**
 * Dibuja la tabla resumen comparando la cotización original (baseline) con la
 * que se está cargando. En cada celda: arriba el monto nuevo, abajo el anterior;
 * en verde el más barato de los dos.
 */
export function renderRecotizacionSummary(baseline, current, container, { exitHandler = 'exitRecotizacion()' } = {}) {
    if (!container || !baseline || !current) return;
    const currency = current.currency;
    const oldCurrency = baseline.currency;
    const sameCurrency = currency === oldCurrency;
    const conceptos = visibleConceptos([baseline, current]);
    const columnCount = Math.max(current.columns.length, baseline.columns.length, 1);

    // Diferencia del total de la opción principal (primera columna)
    const newTotal = current.columns[0]?.values.total;
    const oldTotal = baseline.columns[0]?.values.total;
    let diffChip = '';
    if (sameCurrency && newTotal !== undefined && oldTotal !== undefined) {
        const diff = round2(newTotal - oldTotal);
        if (Math.abs(diff) < 0.01) {
            diffChip = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">Mismo total</span>';
        } else if (diff < 0) {
            diffChip = `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider whitespace-nowrap" title="Diferencia del total de la opción principal">Baja ${money(currency, -diff)}</span>`;
        } else {
            diffChip = `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black uppercase tracking-wider whitespace-nowrap" title="Diferencia del total de la opción principal">Sube ${money(currency, diff)}</span>`;
        }
    }

    const notes = [];
    if (!sameCurrency) notes.push(`La cotización anterior está en ${escapeHtml(oldCurrency)}: los montos no se resaltan porque no son comparables.`);
    if (baseline.cantPax !== current.cantPax) notes.push(`Antes eran ${baseline.cantPax} pasajeros y ahora ${current.cantPax}.`);
    if (baseline.columns.length !== current.columns.length && baseline.tipo === current.tipo) {
        notes.push('Las opciones se comparan en orden (la recomendada primero).');
    }

    const cell = (concepto, newVal, oldVal) => {
        const hasNew = newVal !== undefined;
        const hasOld = oldVal !== undefined;
        let newCls = '';
        let oldCls = '';
        if (sameCurrency && hasNew && hasOld && Math.abs(newVal - oldVal) >= 0.01) {
            if (newVal < oldVal) newCls = 'recot-cheaper';
            else oldCls = 'recot-cheaper';
        }
        const strong = concepto.strong ? 'text-xs font-extrabold' : 'font-semibold';
        const tone = concepto.brand ? 'text-brand-primary' : 'text-slate-800';
        return `
            <td class="py-1.5 px-2 text-right align-top">
                <div class="flex flex-col items-end gap-0.5 leading-tight">
                    <span class="${strong} ${tone} whitespace-nowrap ${newCls}">${hasNew ? money(currency, newVal) : '<span class="text-slate-300">—</span>'}</span>
                    <span class="text-[9px] font-semibold text-slate-400 whitespace-nowrap ${oldCls}">${hasOld ? `antes ${money(oldCurrency, oldVal)}` : 'antes —'}</span>
                </div>
            </td>`;
    };

    let headerCols = '';
    let nameCols = '';
    for (let i = 0; i < columnCount; i++) {
        const cur = current.columns[i];
        const old = baseline.columns[i];
        const title = current.tipo === 'estandar' ? (i === 0 ? 'Recomendado' : `Opción ${i + 1}`) : (current.tipoLabel || 'Total');
        headerCols += `<th class="py-2 px-2 text-right text-[9px] uppercase tracking-wider ${i === 0 ? 'text-brand-primary font-extrabold' : 'text-slate-400 font-bold'} min-w-[96px]">${title}</th>`;
        const curName = cur?.name || '—';
        const oldName = old?.name || '';
        const renamed = oldName && oldName !== curName;
        nameCols += `
            <th class="py-1.5 px-2 text-right text-[10px] font-bold text-slate-800 max-w-[130px]">
                <div class="truncate" title="${escapeHtml(curName)}">${escapeHtml(curName)}</div>
                ${renamed ? `<div class="truncate text-[9px] font-semibold text-slate-400" title="Antes: ${escapeHtml(oldName)}">antes: ${escapeHtml(oldName)}</div>` : ''}
            </th>`;
    }

    const rows = conceptos.map(concepto => {
        let cells = '';
        for (let i = 0; i < columnCount; i++) {
            cells += cell(concepto, current.columns[i]?.values[concepto.key], baseline.columns[i]?.values[concepto.key]);
        }
        const label = concepto.key === 'porPax' ? (current.tipo === 'grupal' ? 'Por Persona' : `Por Pax (${current.cantPax})`) : concepto.label;
        const rowCls = concepto.key === 'total'
            ? 'bg-slate-50/50 border-t border-slate-200'
            : (concepto.key === 'porPax' ? 'bg-brand-primary/5 border-t border-brand-primary/10' : '');
        const labelCls = concepto.strong
            ? `text-[9px] uppercase tracking-wider font-bold ${concepto.brand ? 'text-brand-primary' : 'text-slate-800'}`
            : 'font-medium text-slate-500';
        return `
            <tr class="${rowCls}">
                <td class="py-2 pr-2 ${labelCls}">
                    <span class="flex items-center gap-1">${iconImg(concepto, concepto.brand ? 'icon-brand' : (concepto.strong ? 'icon-dark' : 'icon-slate'))}<span class="truncate">${label}</span></span>
                </td>
                ${cells}
            </tr>`;
    }).join('');

    const fecha = formatDate(baseline.fecha);
    container.innerHTML = `
        <div class="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            <div class="min-w-0 flex-1">
                <div class="text-[9px] font-black uppercase tracking-widest text-amber-700">Recotizando</div>
                <div class="text-[11px] font-bold text-slate-700 truncate" title="${escapeHtml(baseline.nombre)}">
                    ${escapeHtml(baseline.nombre)}${baseline.id ? ` · #${escapeHtml(baseline.id)}` : ''}${fecha ? ` · ${fecha}` : ''}
                </div>
            </div>
            ${diffChip}
            <button type="button" onclick="${exitHandler}" title="Dejar de comparar con la cotización anterior"
                class="shrink-0 p-1 rounded-lg text-amber-700/60 hover:text-amber-800 hover:bg-amber-100 transition-all cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <div class="w-full overflow-x-auto">
            <table class="w-full min-w-max text-left border-collapse text-[10px] font-medium">
                <thead>
                    <tr class="border-b border-slate-200 text-slate-500 font-bold">
                        <th class="py-2 pr-2 text-[9px] uppercase tracking-wider text-slate-400 w-[130px]">Concepto</th>
                        ${headerCols}
                    </tr>
                    <tr class="border-b border-slate-100 text-slate-700">
                        <th class="py-1.5 pr-2 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">${current.tipo === 'multidestino' ? 'Paradas' : 'Hotel'}</th>
                        ${nameCols}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">${rows}</tbody>
            </table>
        </div>
        <p class="mt-2 text-[9px] font-semibold text-slate-400 leading-relaxed">
            Arriba el monto nuevo y abajo el anterior. <span class="recot-cheaper">En verde</span> el más barato de cada par.
            ${notes.map(n => `<br>${n}`).join('')}
        </p>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// TABLA DE COMPARACIÓN (dos o más cotizaciones)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Una columna por opción de cada cotización. En cada concepto se resalta el monto
 * más barato entre las cotizaciones de la misma moneda.
 * onRemove: nombre de la función global para quitar una cotización (recibe el índice).
 */
export function renderComparisonTable(models, container, { onRemove = '' } = {}) {
    if (!container) return;
    const valid = models.filter(Boolean);
    if (valid.length === 0) {
        container.innerHTML = '';
        return;
    }

    const columns = [];
    valid.forEach((model, modelIdx) => {
        model.columns.forEach((col, colIdx) => {
            columns.push({ model, modelIdx, col, colIdx, isFirstOfModel: colIdx === 0, span: model.columns.length });
        });
    });

    const conceptos = visibleConceptos(valid);
    const currencies = [...new Set(valid.map(m => m.currency))];

    // Mínimo de cada concepto por moneda
    const minByKey = {};
    conceptos.forEach(c => {
        minByKey[c.key] = {};
        currencies.forEach(cur => {
            const vals = columns.filter(x => x.model.currency === cur).map(x => x.col.values[c.key]).filter(v => v !== undefined);
            const distinct = new Set(vals.map(v => round2(v)));
            minByKey[c.key][cur] = distinct.size > 1 ? Math.min(...vals) : null;
        });
    });

    // Opción más barata (por persona) para la fila de diferencias
    const minTotalPax = {};
    currencies.forEach(cur => {
        const vals = columns.filter(x => x.model.currency === cur).map(x => x.col.values.porPax).filter(v => v !== undefined);
        minTotalPax[cur] = vals.length ? Math.min(...vals) : null;
    });

    const groupHeader = valid.map((model, modelIdx) => {
        const fecha = formatDate(model.fecha);
        const removeBtn = onRemove ? `
            <button type="button" onclick="${onRemove}(${modelIdx})" title="Quitar de la comparación"
                class="shrink-0 p-0.5 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>` : '';
        return `
            <th colspan="${model.columns.length}" class="py-2.5 px-2 align-top border-l border-slate-200 first:border-l-0">
                <div class="flex items-start justify-end gap-1.5">
                    <div class="min-w-0 text-right">
                        <div class="text-[11px] font-black text-slate-800 truncate max-w-[220px]" title="${escapeHtml(model.nombre)}">${escapeHtml(model.nombre)}</div>
                        <div class="text-[9px] font-semibold text-slate-400 truncate">
                            ${escapeHtml(model.tipoLabel)}${model.id ? ` · #${escapeHtml(model.id)}` : ''}${fecha ? ` · ${fecha}` : ''} · ${model.cantPax} pax · ${escapeHtml(model.currency)}
                        </div>
                    </div>
                    ${removeBtn}
                </div>
            </th>`;
    }).join('');

    const nameHeader = columns.map(x => `
        <th class="py-1.5 px-2 text-right text-[10px] font-bold text-slate-600 max-w-[150px] ${x.isFirstOfModel ? 'border-l border-slate-200' : ''}">
            <div class="truncate" title="${escapeHtml(x.col.name)}">${escapeHtml(x.col.name)}</div>
        </th>`).join('');

    const rows = conceptos.map(concepto => {
        const cells = columns.map(x => {
            const val = x.col.values[concepto.key];
            const min = minByKey[concepto.key][x.model.currency];
            const cheaper = val !== undefined && min !== null && Math.abs(val - min) < 0.01;
            const strong = concepto.strong ? 'text-xs font-extrabold' : 'font-semibold';
            const tone = concepto.brand ? 'text-brand-primary' : 'text-slate-800';
            return `
                <td class="py-2 px-2 text-right whitespace-nowrap ${x.isFirstOfModel ? 'border-l border-slate-200' : ''}">
                    <span class="${strong} ${tone} ${cheaper ? 'recot-cheaper' : ''}">${val !== undefined ? money(x.model.currency, val) : '<span class="text-slate-300">—</span>'}</span>
                </td>`;
        }).join('');
        const rowCls = concepto.key === 'total'
            ? 'bg-slate-50/60 border-t border-slate-200'
            : (concepto.key === 'porPax' ? 'bg-brand-primary/5 border-t border-brand-primary/10' : '');
        const labelCls = concepto.strong
            ? `text-[9px] uppercase tracking-wider font-bold ${concepto.brand ? 'text-brand-primary' : 'text-slate-800'}`
            : 'font-medium text-slate-500';
        return `
            <tr class="${rowCls}">
                <td class="py-2 pr-3 ${labelCls} sticky left-0 bg-white">
                    <span class="flex items-center gap-1">${iconImg(concepto, concepto.brand ? 'icon-brand' : (concepto.strong ? 'icon-dark' : 'icon-slate'))}<span class="truncate">${concepto.label}</span></span>
                </td>
                ${cells}
            </tr>`;
    }).join('');

    const diffRow = columns.map(x => {
        const min = minTotalPax[x.model.currency];
        const val = x.col.values.porPax;
        let content = '<span class="text-slate-300">—</span>';
        if (min !== null && val !== undefined) {
            const diff = round2(val - min);
            content = diff < 0.01
                ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider">Más barata</span>'
                : `<span class="text-[10px] font-bold text-rose-600">+ ${money(x.model.currency, diff)}</span>`;
        }
        return `<td class="py-2 px-2 text-right whitespace-nowrap ${x.isFirstOfModel ? 'border-l border-slate-200' : ''}">${content}</td>`;
    }).join('');

    container.innerHTML = `
        ${currencies.length > 1 ? `
        <div class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            Hay cotizaciones en distintas monedas (${currencies.map(escapeHtml).join(', ')}): se resalta el monto más barato dentro de cada moneda.
        </div>` : ''}
        <div class="w-full overflow-x-auto">
            <table class="w-full min-w-max text-left border-collapse text-[10px] font-medium">
                <thead>
                    <tr class="border-b border-slate-200">
                        <th class="py-2 pr-3 text-[9px] uppercase tracking-wider text-slate-400 w-[140px] sticky left-0 bg-white">Cotización</th>
                        ${groupHeader}
                    </tr>
                    <tr class="border-b border-slate-100">
                        <th class="py-1.5 pr-3 text-[9px] uppercase tracking-wider text-slate-400 font-semibold sticky left-0 bg-white">Opción</th>
                        ${nameHeader}
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                    ${rows}
                    <tr class="border-t border-slate-200">
                        <td class="py-2 pr-3 text-[9px] uppercase tracking-wider font-bold text-slate-500 sticky left-0 bg-white">Dif. por pax</td>
                        ${diffRow}
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="mt-3 text-[10px] font-semibold text-slate-400">
            <span class="recot-cheaper">En verde</span> el monto más barato de cada concepto. "Dif. por pax" indica cuánto más cuesta por persona cada opción respecto de la más barata.
        </p>`;
}
