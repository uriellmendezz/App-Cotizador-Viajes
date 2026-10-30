// operadores.js - Operadores mayoristas, sus gastos de gestión y la entrega que exigen
// Lo usan: Configuración (ajuste de porcentajes) y Paquetes Promocionales (precio final y cuotas).

// El ?v= fuerza a los navegadores a bajar de nuevo el logo cuando cambia el archivo (los assets se cachean un día)
export const OPERADORES = [
    { id: 'ola', nombre: 'Ola', logo: '/assets/logo_ola.png?v=3' },
    { id: 'delfos', nombre: 'Delfos', logo: '/assets/logo_delfos.png?v=3' },
    { id: '360', nombre: '360 Tour Operator', logo: '/assets/logo_360viajes.png?v=3' }
];

// Los logos son cuadrados de 500x500 con el mismo margen transparente: con un tamaño fijo cuadrado los tres se ven parejos
export const LOGO_OPERADOR_CLASS = 'h-24 w-24 object-contain';

export const getOperador = (id) => OPERADORES.find(o => o.id === id) || null;

// Porcentajes de cada operador. Los pct_terrestre/aereo/paquete son los gastos de gestión que
// COBRA el operador (un costo que se suma al precio, no una ganancia de la agencia).
// pct_entrega es la entrega inicial que exige el operador al pagar un paquete en cuotas.
export const TIPOS_COMISION = [
    { campo: 'pct_terrestre', label: 'Gestión servicios terrestres' },
    { campo: 'pct_aereo', label: 'Gestión servicios aéreos' },
    { campo: 'pct_paquete', label: 'Gestión paquetes enteros' },
    { campo: 'pct_entrega', label: 'Entrega inicial en cuotas' }
];

// { ola: { pct_terrestre, pct_aereo, pct_paquete, pct_entrega }, ... } — 0% para lo que no se configuró
export async function fetchComisiones() {
    const res = await window.authenticatedFetch('/api/comisiones');
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudieron cargar las comisiones.');
    }
    const rows = await res.json();
    const map = {};
    OPERADORES.forEach(o => { map[o.id] = { pct_terrestre: 0, pct_aereo: 0, pct_paquete: 0, pct_entrega: 0 }; });
    rows.forEach(r => { if (map[r.operador]) Object.assign(map[r.operador], r); });
    return map;
}

export async function saveComision(operador, cambios) {
    const res = await window.authenticatedFetch(`/api/comisiones/${operador}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo guardar la comisión.');
    }
    return res.json();
}

// 10 -> "10%", 7.5 -> "7,5%"
export function fmtPct(n) {
    const value = Number(n) || 0;
    return `${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
}
