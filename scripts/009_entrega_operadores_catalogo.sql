-- 009_entrega_operadores_catalogo.sql
-- 1. Entrega inicial que exige cada operador al financiar un paquete en cuotas
--    (Configuración > Comisiones de Operadores). Porcentaje sobre el precio final por persona.
-- 2. Listado liviano del Catálogo de Hoteles: `total_fotos` se calcula en la base para que el
--    listado no tenga que traer todas las fotos (base64) solo para contarlas.
-- 3. Índice para filtrar el catálogo por destino.

ALTER TABLE public.comisiones_operadores
    ADD COLUMN IF NOT EXISTS pct_entrega NUMERIC DEFAULT 0 CHECK (pct_entrega BETWEEN 0 AND 100);

COMMENT ON COLUMN public.comisiones_operadores.pct_paquete IS 'Gastos de gestión que cobra el operador sobre un paquete entero (%)';
COMMENT ON COLUMN public.comisiones_operadores.pct_entrega IS 'Entrega inicial que exige el operador al pagar un paquete en cuotas (% del precio final)';

ALTER TABLE public.hoteles_catalogo
    ADD COLUMN IF NOT EXISTS total_fotos INTEGER
    GENERATED ALWAYS AS (jsonb_array_length(COALESCE(fotos, '[]'::jsonb))) STORED;

CREATE INDEX IF NOT EXISTS idx_hoteles_catalogo_destino ON public.hoteles_catalogo (sucursal_id, destino);
