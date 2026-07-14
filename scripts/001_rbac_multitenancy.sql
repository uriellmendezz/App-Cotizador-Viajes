-- 001_rbac_multitenancy.sql
-- Migración para soporte de Sucursales, Roles (RBAC) y Aislamiento de Cotizaciones (Multi-tenancy)

-- 1. Crear tipo ENUM para Roles si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('ADMIN_GLOBAL', 'AGENTE_SUCURSAL');
    END IF;
END $$;

-- 2. Crear Tabla de Sucursales
CREATE TABLE IF NOT EXISTS public.sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Crear Tabla de Perfiles (Agentes) vinculada a auth.users de Supabase
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    contrasena TEXT,
    rol user_role NOT NULL DEFAULT 'AGENTE_SUCURSAL',
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Restricción: Los AGENTE_SUCURSAL deben tener sucursal_id de forma obligatoria
    CONSTRAINT check_sucursal_for_agente CHECK (
        (rol = 'ADMIN_GLOBAL') OR (sucursal_id IS NOT NULL)
    )
);

-- 4. Modificar Tabla de Cotizaciones para incluir sucursal_id y agente_id
-- NOTA: Se comprueba la existencia de las columnas antes de agregarlas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cotizaciones' AND column_name='sucursal_id') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cotizaciones' AND column_name='agente_id') THEN
        ALTER TABLE public.cotizaciones ADD COLUMN agente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Función y Trigger para autogestionar registros de nuevos usuarios desde auth.users a public.perfiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, username, email, contrasena, rol, sucursal_id)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', 'Nuevo Agente'),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'contrasena',
    coalesce((new.raw_user_meta_data->>'rol')::public.user_role, 'AGENTE_SUCURSAL'::public.user_role),
    CASE 
      WHEN new.raw_user_meta_data->>'sucursal_id' IS NOT NULL 
      THEN (new.raw_user_meta_data->>'sucursal_id')::uuid 
      ELSE NULL 
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Habilitar RLS en las tablas correspondientes
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

-- 7. Definir Políticas de Seguridad (RLS) para Cotizaciones
DROP POLICY IF EXISTS admin_all_policy ON public.cotizaciones;
DROP POLICY IF EXISTS agent_select_policy ON public.cotizaciones;
DROP POLICY IF EXISTS agent_insert_policy ON public.cotizaciones;
DROP POLICY IF EXISTS agent_update_policy ON public.cotizaciones;
DROP POLICY IF EXISTS agent_delete_policy ON public.cotizaciones;

-- ADMIN_GLOBAL tiene control total
CREATE POLICY admin_all_policy ON public.cotizaciones
    FOR ALL TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    );

-- AGENTE_SUCURSAL solo interactúa con cotizaciones de su sucursal_id
CREATE POLICY agent_select_policy ON public.cotizaciones
    FOR SELECT TO authenticated
    USING (
        (
            (auth.jwt() -> 'app_metadata' ->> 'rol') = 'AGENTE_SUCURSAL' OR
            (auth.jwt() -> 'user_metadata' ->> 'rol') = 'AGENTE_SUCURSAL'
        ) AND
        sucursal_id = coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'sucursal_id')::uuid
        )
    );

CREATE POLICY agent_insert_policy ON public.cotizaciones
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            (auth.jwt() -> 'app_metadata' ->> 'rol') = 'AGENTE_SUCURSAL' OR
            (auth.jwt() -> 'user_metadata' ->> 'rol') = 'AGENTE_SUCURSAL'
        ) AND
        sucursal_id = coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'sucursal_id')::uuid
        )
    );

CREATE POLICY agent_update_policy ON public.cotizaciones
    FOR UPDATE TO authenticated
    USING (
        (
            (auth.jwt() -> 'app_metadata' ->> 'rol') = 'AGENTE_SUCURSAL' OR
            (auth.jwt() -> 'user_metadata' ->> 'rol') = 'AGENTE_SUCURSAL'
        ) AND
        sucursal_id = coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'sucursal_id')::uuid
        )
    )
    WITH CHECK (
        (
            (auth.jwt() -> 'app_metadata' ->> 'rol') = 'AGENTE_SUCURSAL' OR
            (auth.jwt() -> 'user_metadata' ->> 'rol') = 'AGENTE_SUCURSAL'
        ) AND
        sucursal_id = coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'sucursal_id')::uuid
        )
    );

CREATE POLICY agent_delete_policy ON public.cotizaciones
    FOR DELETE TO authenticated
    USING (
        (
            (auth.jwt() -> 'app_metadata' ->> 'rol') = 'AGENTE_SUCURSAL' OR
            (auth.jwt() -> 'user_metadata' ->> 'rol') = 'AGENTE_SUCURSAL'
        ) AND
        sucursal_id = coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::uuid,
            (auth.jwt() -> 'user_metadata' ->> 'sucursal_id')::uuid
        )
    );

-- 8. Definir Políticas de Seguridad (RLS) para Perfiles (Sólo ADMIN puede ver/crear todo; el usuario puede ver su propio perfil)
DROP POLICY IF EXISTS admin_profiles_policy ON public.perfiles;
DROP POLICY IF EXISTS user_own_profile_policy ON public.perfiles;

CREATE POLICY admin_profiles_policy ON public.perfiles
    FOR ALL TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    );

CREATE POLICY user_own_profile_policy ON public.perfiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- 9. Definir Políticas de Seguridad (RLS) para Sucursales (Cualquier authenticated puede leer, sólo ADMIN modifica)
DROP POLICY IF EXISTS authenticated_read_sucursales ON public.sucursales;
DROP POLICY IF EXISTS admin_modify_sucursales ON public.sucursales;

CREATE POLICY authenticated_read_sucursales ON public.sucursales
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY admin_modify_sucursales ON public.sucursales
    FOR ALL TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'rol') = 'ADMIN_GLOBAL' OR
        (auth.jwt() -> 'user_metadata' ->> 'rol') = 'ADMIN_GLOBAL'
    );
