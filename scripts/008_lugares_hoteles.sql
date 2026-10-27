-- 008_lugares_hoteles.sql
-- Destinos normalizados (`lugares`) y hoteles identificados (`hoteles`).
--
-- `lugares`: cada destino resuelto con la API de OpenStreetMap (Nominatim), con su
--   nombre en español, país y región. `alias` guarda las búsquedas ya resueltas
--   ("punta cana", "pta cana"...) para no volver a consultar la API.
-- `hoteles`: un hotel por lugar, identificado por su nombre normalizado. Así
--   "Hotel Lopesan" y "Lopesan Resort" en el mismo destino son el mismo hotel.
--   `alias` guarda las variantes de nombre con las que se cargó.
-- `hoteles_catalogo.hotel_id`: cada ficha del catálogo de una sucursal apunta al
--   hotel identificado. Las fotos y descripciones siguen siendo de cada sucursal.
--
-- Ambas tablas son compartidas entre sucursales: un destino o un hotel es el mismo
-- para toda la agencia. Mismo esquema de permisos que el resto de las tablas,
-- porque el backend se conecta con la clave `anon` y controla el acceso en la API.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lugares (destinos normalizados)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lugares (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,                     -- Ej. "Punta Cana"
    region TEXT DEFAULT '',                   -- Ej. "La Altagracia"
    pais TEXT DEFAULT '',                     -- Ej. "República Dominicana"
    codigo_pais TEXT DEFAULT '',              -- ISO 3166-1 alfa-2, ej. "DO"
    tipo TEXT DEFAULT 'otro',                 -- ciudad | region | pais | otro
    latitud DOUBLE PRECISION,
    longitud DOUBLE PRECISION,
    osm_ref TEXT UNIQUE,                      -- "relation/59470" (NULL si no se encontró en la API)
    fuente TEXT DEFAULT 'nominatim',          -- nominatim | manual (no existe en la API) | pendiente (la API falló)
    alias TEXT[] DEFAULT '{}',                -- Búsquedas normalizadas que resuelven a este lugar
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lugares_alias ON public.lugares USING GIN (alias);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Hoteles (identidad única de cada hotel por lugar)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hoteles (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,                     -- Nombre estándar que se muestra
    nombre_normalizado TEXT NOT NULL,         -- Clave de comparación, ej. "lopesan"
    lugar_id BIGINT REFERENCES public.lugares(id) ON DELETE SET NULL,
    alias TEXT[] DEFAULT '{}',                -- Variantes con las que se cargó el nombre
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Un mismo nombre normalizado no puede repetirse en un lugar
CREATE UNIQUE INDEX IF NOT EXISTS uq_hoteles_lugar_nombre
    ON public.hoteles (COALESCE(lugar_id, 0), nombre_normalizado);
CREATE INDEX IF NOT EXISTS idx_hoteles_lugar ON public.hoteles (lugar_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vínculo del catálogo de cada sucursal con el hotel identificado
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hoteles_catalogo
    ADD COLUMN IF NOT EXISTS hotel_id BIGINT REFERENCES public.hoteles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hoteles_catalogo_hotel ON public.hoteles_catalogo (hotel_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Permisos y RLS (mismo patrón que public.hoteles_catalogo)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lugares TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hoteles TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.lugares_id_seq TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hoteles_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.lugares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoteles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['lugares', 'hoteles'] LOOP
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
