-- 002_profile_franchise_rbac.sql
-- Migración para soporte de Configuración de Perfil, Tag Color y RBAC de Franquicias

-- 1. Asegurar la adición de roles de Franquicia al tipo ENUM user_role si existe
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DUENO_FRANQUICIA';
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN_SUCURSAL';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Extensión de columnas en public.perfiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='apellido') THEN
        ALTER TABLE public.perfiles ADD COLUMN apellido TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='telefono') THEN
        ALTER TABLE public.perfiles ADD COLUMN telefono TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='estado') THEN
        ALTER TABLE public.perfiles ADD COLUMN estado TEXT DEFAULT 'Activo';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='color_tag') THEN
        ALTER TABLE public.perfiles ADD COLUMN color_tag TEXT DEFAULT '#3b82f6';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='tag_color') THEN
        ALTER TABLE public.perfiles ADD COLUMN tag_color TEXT DEFAULT '#3b82f6';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='perfiles' AND column_name='franchise_id') THEN
        ALTER TABLE public.perfiles ADD COLUMN franchise_id UUID REFERENCES public.sucursales(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Synchronize franchise_id with sucursal_id and tag_color with color_tag for existing records
UPDATE public.perfiles SET franchise_id = sucursal_id WHERE franchise_id IS NULL AND sucursal_id IS NOT NULL;
UPDATE public.perfiles SET color_tag = coalesce(color_tag, tag_color, '#3b82f6');
UPDATE public.perfiles SET tag_color = coalesce(tag_color, color_tag, '#3b82f6');

-- 3. Actualización de Trigger para nuevos registros de auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfiles (id, nombre, apellido, username, email, contrasena, telefono, rol, sucursal_id, franchise_id, tag_color, color_tag, estado)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', 'Nuevo Agente'),
    new.raw_user_meta_data->>'apellido',
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'contrasena',
    new.raw_user_meta_data->>'telefono',
    coalesce(new.raw_user_meta_data->>'rol', 'AGENTE_SUCURSAL'),
    CASE 
      WHEN new.raw_user_meta_data->>'sucursal_id' IS NOT NULL 
      THEN (new.raw_user_meta_data->>'sucursal_id')::uuid 
      WHEN new.raw_user_meta_data->>'franchise_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'franchise_id')::uuid
      ELSE NULL 
    END,
    CASE 
      WHEN new.raw_user_meta_data->>'franchise_id' IS NOT NULL 
      THEN (new.raw_user_meta_data->>'franchise_id')::uuid 
      WHEN new.raw_user_meta_data->>'sucursal_id' IS NOT NULL
      THEN (new.raw_user_meta_data->>'sucursal_id')::uuid
      ELSE NULL 
    END,
    coalesce(new.raw_user_meta_data->>'color_tag', new.raw_user_meta_data->>'tag_color', '#3b82f6'),
    coalesce(new.raw_user_meta_data->>'color_tag', new.raw_user_meta_data->>'tag_color', '#3b82f6'),
    coalesce(new.raw_user_meta_data->>'estado', 'Activo')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql;
