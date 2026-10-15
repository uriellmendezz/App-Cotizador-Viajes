-- 006_aerolineas.sql
-- Catálogo de Aerolíneas (Configuración). Mismo patrón que `hoteles_catalogo`:
-- aislado por sucursal y con políticas permisivas, porque el backend se conecta
-- con la clave `anon` y aplica el control de acceso en la capa de la API.
--
-- `logo` guarda una imagen en base64 (data URL) o la ruta de uno de los logos
-- incluidos en assets/logos_aerolineas.

CREATE TABLE IF NOT EXISTS public.aerolineas_catalogo (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    codigo TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aerolineas_catalogo_sucursal ON public.aerolineas_catalogo (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_aerolineas_catalogo_updated ON public.aerolineas_catalogo (updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aerolineas_catalogo TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.aerolineas_catalogo_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.aerolineas_catalogo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Permitir lectura publica" ON public.aerolineas_catalogo;
    DROP POLICY IF EXISTS "Permitir insercion publica" ON public.aerolineas_catalogo;
    DROP POLICY IF EXISTS "Permitir actualizacion publica" ON public.aerolineas_catalogo;
    DROP POLICY IF EXISTS "Permitir eliminacion publica" ON public.aerolineas_catalogo;

    CREATE POLICY "Permitir lectura publica" ON public.aerolineas_catalogo FOR SELECT USING (true);
    CREATE POLICY "Permitir insercion publica" ON public.aerolineas_catalogo FOR INSERT WITH CHECK (true);
    CREATE POLICY "Permitir actualizacion publica" ON public.aerolineas_catalogo FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Permitir eliminacion publica" ON public.aerolineas_catalogo FOR DELETE USING (true);
END $$;
