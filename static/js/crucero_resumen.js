// crucero_resumen.js - Cálculo y tabla resumen de la Cotización de Crucero
// Lo usan: el formulario de crucero (resumen en tiempo real) y Ver Cotización.
// El cálculo replica _apply_crucero_totals del backend (app/routers/cotizaciones.py).

const METADATA_NAMES = ['METADATA_COTIZACION', 'METADATA_PRESUPUESTO_RAPIDO'];

const num = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
};

const money = (v) => (window.formatPriceES ? window.formatPriceES(v) : Number(v || 0).toFixed(2));

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Detecta si una cotización guardada es del tipo "crucero". */
export function isCruceroQuote(quote) {
    if (!quote) return false;
    if (String(quote.tipo_cotizacion || '').toLowerCase() === 'crucero') return true;
    return Array.isArray(quote.hoteles) &&
        quote.hoteles.some(h => h && String(h.tipo_cotizacion || '').toLowerCase() === 'crucero');
}

/** El bloque del crucero viaja al nivel raíz o dentro de la entrada METADATA de `hoteles`. */
export function extractCrucero(quote) {
    if (!quote) return {};
    if (quote.crucero && typeof quote.crucero === 'object') return quote.crucero;
    const meta = (quote.hoteles || []).find(h => h && METADATA_NAMES.includes(h.nombre) && h.crucero);
    return meta ? meta.crucero : {};
}

export function cruceroNetCost(crucero) {
    return num(crucero.costo_neto) + num(crucero.costo_tasas) + num(crucero.costo_bebidas);
}

/**
 * Vuelos + fee aéreo + crucero + alojamientos pre/post + traslados,
 * con 5% de gastos administrativos sobre los servicios no aéreos.
 */
export function computeCruceroTotals({ cantPax, flightsCost, flightsFee, crucero, hotelsCost, transfersCost, gastosIva, aplicarRedondeo }) {
    const pax = Math.max(1, parseInt(cantPax) || 1);
    const costoCrucero = cruceroNetCost(crucero || {});
    const terrestre = costoCrucero + num(hotelsCost) + num(transfersCost);
    const adminFee = terrestre * 0.05;
    const total = num(flightsCost) + num(flightsFee) + terrestre + adminFee + num(gastosIva);
    const perPerson = total / pax;
    const roundedPerPerson = aplicarRedondeo ? Math.ceil(perPerson / 10) * 10 : perPerson;
    const roundedTotal = aplicarRedondeo ? roundedPerPerson * pax : total;
    return { pax, costoCrucero, adminFee, total, roundedTotal, roundedPerPerson, rounding: roundedTotal - total };
}

function operatorTag(name) {
    if (window.getOperatorTag) return window.getOperatorTag(name, { compact: true });
    const clean = (name || '').trim();
    if (!clean) return '';
    const lower = clean.toLowerCase();
    let color = 'border-slate-200 bg-slate-50 text-slate-600';
    if (lower === 'delfos') color = 'border-orange-200 bg-orange-50 text-orange-600';
    else if (lower === 'ola') color = 'border-rose-200 bg-rose-50 text-rose-600';
    return `<span class="inline-flex items-center px-1.5 py-0 text-[8px] rounded-full font-bold border ${color} select-none whitespace-nowrap" title="Cotizado con: ${escapeHtml(clean)}">${escapeHtml(clean)}</span>`;
}

function row(icon, label, amount, currency, { operador = '', muted = false } = {}) {
    return `
        <tr class="${muted ? 'opacity-40' : ''}">
            <td class="py-2 pr-2 font-medium text-slate-500 flex items-center gap-1">
                <img src="/assets/iconos/${icon}" class="w-3.5 h-3.5 icon-slate" alt="">
                <span class="truncate" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
                ${operatorTag(operador)}
            </td>
            <td class="py-2 px-2 text-right font-semibold text-slate-700">${amount > 0 || !muted ? `${currency} ${money(amount)}` : '<span class="text-slate-300">-</span>'}</td>
        </tr>`;
}

/**
 * config: { currency, cantPax, flightsCost, flightsFee, operadorVuelos, crucero,
 *           hotelList: [{ etapa, hotelName, hotelCost, operador }], transfersCost,
 *           operadorTraslados, gastosIva, aplicarRedondeo }
 */
export function renderCruceroSummaryHTML(config, container) {
    if (!container) return;
    const { currency = 'USD', crucero = {}, hotelList = [] } = config;
    const flightsCost = num(config.flightsCost);
    const flightsFee = num(config.flightsFee);
    const transfersCost = num(config.transfersCost);
    const gastosIva = num(config.gastosIva);
    const hotelsCost = hotelList.reduce((acc, h) => acc + num(h.hotelCost), 0);

    const t = computeCruceroTotals({
        cantPax: config.cantPax, flightsCost, flightsFee, crucero, hotelsCost, transfersCost, gastosIva,
        aplicarRedondeo: config.aplicarRedondeo
    });

    const barco = crucero.barco ? `Crucero: ${crucero.barco}` : 'Crucero';
    let rows = '';
    if (flightsCost > 0 || flightsFee > 0) {
        rows += row('avion.svg', 'Vuelos', flightsCost, currency, { operador: config.operadorVuelos });
        rows += row('gastos.svg', 'Fee Aereo', flightsFee, currency, { muted: flightsFee <= 0 });
    }
    rows += row('location.svg', barco, num(crucero.costo_neto), currency, { operador: crucero.operador });
    if (num(crucero.costo_tasas) > 0) rows += row('gastos.svg', 'Tasas y propinas', num(crucero.costo_tasas), currency);
    if (num(crucero.costo_bebidas) > 0) rows += row('cafe.svg', 'Paquete de bebidas', num(crucero.costo_bebidas), currency);
    hotelList.forEach(h => {
        const etapa = h.etapa === 'post' ? 'Post' : 'Pre';
        rows += row('cama.svg', `${etapa}: ${h.hotelName || 'Alojamiento'}`, num(h.hotelCost), currency, { operador: h.operador });
    });
    if (transfersCost > 0) rows += row('traslados.svg', 'Traslados', transfersCost, currency, { operador: config.operadorTraslados });
    rows += row('gastos.svg', 'Gastos Admin. (5%)', t.adminFee, currency);
    if (gastosIva > 0) rows += row('gastos.svg', 'Gastos + IVA', gastosIva, currency);
    if (config.aplicarRedondeo) rows += row('dinero.svg', 'Redondeo', t.rounding, currency);

    container.innerHTML = `
        <div class="w-full overflow-x-auto">
            <table class="w-full min-w-max text-left border-collapse text-[10px] font-medium">
                <thead>
                    <tr class="border-b border-slate-200 text-slate-500 font-bold">
                        <th class="py-2 pr-2 text-[9px] uppercase tracking-wider text-slate-400 w-[150px]">Concepto</th>
                        <th class="py-2 px-2 text-right text-[9px] uppercase tracking-wider text-brand-primary font-extrabold min-w-[80px]">Crucero</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                    ${rows}
                    <tr class="bg-slate-50/50 font-bold border-t border-slate-200">
                        <td class="py-2.5 pr-2 text-[10px] text-slate-800 uppercase tracking-wider flex items-center gap-1">
                            <img src="/assets/iconos/dinero.svg" class="w-3.5 h-3.5 icon-dark" alt="Total">
                            <span>Total</span>
                        </td>
                        <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">${currency} ${money(t.roundedTotal)}</td>
                    </tr>
                    <tr class="bg-brand-primary/5 font-bold border-t border-brand-primary/10">
                        <td class="py-2.5 pr-2 text-[9px] text-brand-primary uppercase tracking-widest flex items-center gap-1">
                            <img src="/assets/iconos/persona.svg" class="w-3.5 h-3.5 icon-brand" alt="Por Pax">
                            <span class="truncate">Por Pax (${t.pax})</span>
                        </td>
                        <td class="py-2.5 px-2 text-right text-xs text-brand-primary font-extrabold">${currency} ${money(t.roundedPerPerson)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    return t;
}

/** Arma la tabla resumen a partir de una cotización guardada (Ver Cotización). */
export function renderCruceroSummaryFromQuote(quote, container, currency) {
    const hoteles = (quote.hoteles || []).filter(h => h && !METADATA_NAMES.includes(h.nombre));
    let aplicarRedondeo = true;
    if (typeof quote.redondear !== 'undefined') aplicarRedondeo = quote.redondear;
    return renderCruceroSummaryHTML({
        currency,
        cantPax: quote.cantidad_pasajeros,
        flightsCost: quote.monto_vuelos,
        flightsFee: quote.fee_aereo,
        operadorVuelos: quote.operador_vuelos || '',
        crucero: extractCrucero(quote),
        hotelList: hoteles.map(h => ({
            etapa: h.etapa,
            hotelName: h.nombre,
            hotelCost: h.costo_neto !== undefined ? h.costo_neto : h.costo,
            operador: h.operador || ''
        })),
        transfersCost: quote.monto_traslados,
        operadorTraslados: quote.operador_traslados || '',
        gastosIva: quote.gastos_iva,
        aplicarRedondeo
    }, container);
}

window.isCruceroQuote = isCruceroQuote;
