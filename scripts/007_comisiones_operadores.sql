-- 007_comisiones_operadores.sql
-- Comisiones de cada operador mayorista (Configuración > Comisiones de Operadores).
-- Una fila por sucursal y operador, con el porcentaje de comisión por servicios
-- terrestres, servicios aéreos y paquetes enteros. Mismo patrón que `hoteles_catalogo`:
-- aislado por sucursal y con políticas permisivas, porque el backend se conecta con
-- la clave `anon` y aplica el control de acceso en la capa de la API.
--
-- `operador` guarda el identificador fijo del operador ('ola', 'delfos', '360').

CREATE TABLE IF NOT EXISTS public.comisiones_operadores (
    id BIGSERIAL PRIMARY KEY,
    operador TEXT NOT NULL,
    pct_terrestre NUMERIC DEFAULT 0 CHECK (pct_terrestre BETWEEN 0 AND 100),
    pct_aereo NUMERIC DEFAULT 0 CHECK (pct_aereo BETWEEN 0 AND 100),
    pct_paquete NUMERIC DEFAULT 0 CHECK (pct_paquete BETWEEN 0 AND 100),
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
    agente_id UUID,
    agente_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_operadores_sucursal ON public.comisiones_operadores (sucursal_id, operador);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comisiones_operadores TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.comisiones_operadores_id_seq TO anon, authenticated, service_role;

ALTER TABLE public.comisiones_operadores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Permitir lectura publica" ON public.comisiones_operadores;
    DROP POLICY IF EXISTS "Permitir insercion publica" ON public.comisiones_operadores;
    DROP POLICY IF EXISTS "Permitir actualizacion publica" ON public.comisiones_operadores;
    DROP POLICY IF EXISTS "Permitir eliminacion publica" ON public.comisiones_operadores;

    CREATE POLICY "Permitir lectura publica" ON public.comisiones_operadores FOR SELECT USING (true);
    CREATE POLICY "Permitir insercion publica" ON public.comisiones_operadores FOR INSERT WITH CHECK (true);
    CREATE POLICY "Permitir actualizacion publica" ON public.comisiones_operadores FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY "Permitir eliminacion publica" ON public.comisiones_operadores FOR DELETE USING (true);
END $$;
