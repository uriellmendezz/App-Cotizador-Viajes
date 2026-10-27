// operadores.js - Operadores mayoristas y sus comisiones
// Lo usan: Configuración (ajuste de porcentajes) y Paquetes Promocionales (cálculo de comisión).

export const OPERADORES = [
    { id: 'ola', nombre: 'Ola', logo: '/assets/logo_ola.png' },
    { id: 'delfos', nombre: 'Delfos', logo: '/assets/logo_delfos.webp' },
    // El ?v= fuerza a los navegadores a bajar de nuevo el logo cuando cambia el archivo (los assets se cachean un día)
    { id: '360', nombre: '360 Tour Operator', logo: '/assets/logo_360viajes.png?v=2' }
];

// Los logos tienen proporciones distintas: con la misma altura y ancho automático los tres se ven del mismo tamaño
export const LOGO_OPERADOR_CLASS = 'h-14 w-auto object-contain';

export const getOperador = (id) => OPERADORES.find(o => o.id === id) || null;

// Tipos de servicio sobre los que cada operador paga comisión
export const TIPOS_COMISION = [
    { campo: 'pct_terrestre', label: 'Servicios terrestres' },
    { campo: 'pct_aereo', label: 'Servicios aéreos' },
    { campo: 'pct_paquete', label: 'Paquetes enteros' }
];

// { ola: { pct_terrestre, pct_aereo, pct_paquete }, ... } — 0% para lo que no se configuró
export async function fetchComisiones() {
    const res = await window.authenticatedFetch('/api/comisiones');
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudieron cargar las comisiones.');
    }
    const rows = await res.json();
    const map = {};
    OPERADORES.forEach(o => { map[o.id] = { pct_terrestre: 0, pct_aereo: 0, pct_paquete: 0 }; });
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
