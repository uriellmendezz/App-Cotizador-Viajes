-- 005_exportar_cotizaciones.sql
-- Función de apoyo para la exportación a CSV.
--
-- Motivo: la columna `hoteles` guarda las fotos en base64, por lo que la tabla
-- `cotizaciones` pesa cientos de MB. Traer `select *` para exportar es inviable
-- (supera el timeout y transfiere toda la base). Esta función descarta las
-- imágenes del lado del servidor y devuelve solo los datos del CSV: el mismo
-- conjunto baja de ~438 MB a ~230 KB.
--
-- Se declara su propio statement_timeout porque descomprimir el JSONB de todas
-- las cotizaciones tarda más que el límite por defecto del rol.

CREATE OR REPLACE FUNCTION public.exportar_cotizaciones(suc uuid DEFAULT NULL)
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMPTZ,
    agente_nombre TEXT,
    nombre_pax TEXT,
    destino TEXT,
    origen TEXT,
    cantidad_pasajeros INTEGER,
    fecha_salida DATE,
    fecha_vuelo_ida DATE,
    fecha_vuelo_vuelta DATE,
    validez_cotizacion DATE,
    noches_alojamiento TEXT,
    base_habitacion TEXT,
    tipo_traslado TEXT,
    monto_vuelos NUMERIC,
    fee_aereo NUMERIC,
    operador_vuelos TEXT,
    monto_traslados NUMERIC,
    operador_traslados TEXT,
    gastos_iva NUMERIC,
    costo_total NUMERIC,
    precio_persona NUMERIC,
    hoteles JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '180s'
AS $$
    SELECT
        c.id,
        c.created_at,
        c.agente_nombre,
        c.nombre_pax,
        c.destino,
        c.origen,
        c.cantidad_pasajeros,
        c.fecha_salida,
        c.fecha_vuelo_ida,
        c.fecha_vuelo_vuelta,
        c.validez_cotizacion,
        c.noches_alojamiento,
        c.base_habitacion,
        c.tipo_traslado,
        c.monto_vuelos,
        c.fee_aereo,
        c.operador_vuelos,
        c.monto_traslados,
        c.operador_traslados,
        c.gastos_iva,
        c.costo_total,
        c.precio_persona,
        -- Mismo arreglo de hoteles pero sin las imágenes en base64
        -- (img_vuelo_3 vive en el pseudo-hotel METADATA_COTIZACION)
        COALESCE((
            SELECT jsonb_agg(h - 'imagen1' - 'imagen2' - 'imagen3' - 'imagen' - 'img_vuelo_3' ORDER BY orden)
            FROM jsonb_array_elements(COALESCE(c.hoteles, '[]'::jsonb)) WITH ORDINALITY AS t(h, orden)
        ), '[]'::jsonb) AS hoteles
    FROM public.cotizaciones c
    WHERE (suc IS NULL OR c.sucursal_id = suc)
      AND COALESCE(c.base_habitacion, '') <> 'PRESUPUESTO_RAPIDO'
    ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.exportar_cotizaciones(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.exportar_cotizaciones(uuid) IS
    'Cotizaciones completas sin las imágenes base64, para la exportación a CSV de Configuración.';
