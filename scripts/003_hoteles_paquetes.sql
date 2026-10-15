-- 003_hoteles_paquetes.sql
-- Catálogo de Hoteles (Configuración) y Paquetes Promocionales (Redes Sociales).
-- Ambas tablas se aíslan por sucursal (sucursal_id), igual que `cotizaciones`.
--
-- Nota sobre RLS: el backend de FastAPI se conecta con la clave `anon` y aplica el
-- control de acceso por sucursal en la capa de la API (app/routers/catalogo.py).
-- Por eso estas tablas replican el mismo esquema de políticas permisivas que ya
-- tiene `cotizaciones`; de lo contrario, con RLS activo y sin políticas, los
-- INSERT del backend fallarían en silencio.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de hoteles
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hoteles_catalogo (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    destino TEXT DEFAULT '',
    estrellas INTEGER DEFAULT 4 CHECK (estrellas BETWEEN 1 AND 5),
    regimen TEXT DEFAULT '',
    habitacion TEXT DEFAULT '',
    descripcion TEXT DEFAULT '',
    fotos JSONB DEFAULT '[]'::jsonb,          -- Imágenes en base64 (data URLs)
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hoteles_catalogo_sucursal ON public.hoteles_catalogo (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_hoteles_catalogo_updated ON public.hoteles_catalogo (updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Paquetes promocionales (separados de las cotizaciones de pasajeros)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paquetes_promocionales (
    id BIGSERIAL PRIMARY KEY,
    titulo TEXT NOT NULL,
    destino TEXT DEFAULT '',
    moneda TEXT DEFAULT 'USD',
    precio_persona NUMERIC DEFAULT 0,
    data JSONB DEFAULT '{}'::jsonb,           -- Payload completo del formulario + resumen de cuotas
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paquetes_promocionales_sucursal ON public.paquetes_promocionales (sucursal_id);
CREATE INDEX IF NOT EXISTS idx_paquetes_promocionales_updated ON public.paquetes_promocionales (updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permisos y RLS (mismo patrón que public.cotizaciones)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hoteles_catalogo TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paquetes_promocionales TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hoteles_catalogo_id_seq TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.paquetes_promocionales_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.hoteles_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paquetes_promocionales ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['hoteles_catalogo', 'paquetes_promocionales'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Permitir lectura publica" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Permitir insercion publica" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Permitir actualizacion publica" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Permitir eliminacion publica" ON public.%I', t);

        EXECUTE format('CREATE POLICY "Permitir lectura publica" ON public.%I FOR SELECT USING (true)', t);
        EXECUTE format('CREATE POLICY "Permitir insercion publica" ON public.%I FOR INSERT WITH CHECK (true)', t);
        EXECUTE format('CREATE POLICY "Permitir actualizacion publica" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t);
        EXECUTE format('CREATE POLICY "Permitir eliminacion publica" ON public.%I FOR DELETE USING (true)', t);
    END LOOP;
END $$;
