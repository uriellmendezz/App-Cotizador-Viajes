-- 004_operadores.sql
-- Operador con el que se cotizó cada servicio de una cotización.
--
-- Vuelos y traslados son únicos por cotización, así que van como columnas.
-- El operador de cada alojamiento viaja dentro de la columna JSONB `hoteles`
-- (campo `operador` en cada objeto), por lo que no requiere cambio de esquema.

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS operador_vuelos TEXT;
ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS operador_traslados TEXT;

-- Índices para el autocompletado de operadores ya usados en la sucursal
CREATE INDEX IF NOT EXISTS idx_cotizaciones_operador_vuelos
    ON public.cotizaciones (operador_vuelos) WHERE operador_vuelos IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cotizaciones_operador_traslados
    ON public.cotizaciones (operador_traslados) WHERE operador_traslados IS NOT NULL;

COMMENT ON COLUMN public.cotizaciones.operador_vuelos IS 'Operador mayorista con el que se cotizaron los vuelos';
COMMENT ON COLUMN public.cotizaciones.operador_traslados IS 'Operador mayorista con el que se cotizaron los traslados';
