-- SCRIPT SIMPLIFICADO - REIS CONTROLE LENS
-- Execute este script no SQL Editor do Supabase se o anterior der erro.

-- 1. Tabelas Base
CREATE TABLE IF NOT EXISTS branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT,
  state TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'consultor',
  branch_id UUID REFERENCES branches(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lens_families (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  line TEXT NOT NULL,
  "index" TEXT,
  treatment TEXT,
  color TEXT,
  material TEXT,
  cost_price DECIMAL(10,2) DEFAULT 0,
  min_stock_per_sku INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lens_skus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID REFERENCES lens_families(id) ON DELETE CASCADE,
  sku_code TEXT UNIQUE NOT NULL,
  spherical DECIMAL(5,2) NOT NULL,
  cylindrical DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES lens_skus(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, sku_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  sku_id UUID REFERENCES lens_skus(id),
  type TEXT,
  quantity INTEGER NOT NULL,
  reason TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- 3. Políticas Simples
DO $$ BEGIN
  CREATE POLICY "Public select" ON branches FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Public select" ON profiles FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Public select" ON lens_families FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Public select" ON lens_skus FOR SELECT TO authenticated USING (true);
  CREATE POLICY "Public select" ON inventory FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. Inserir Filial Matriz (Caso não exista)
INSERT INTO branches (name, code, city, state) 
VALUES ('Matriz', 'FIL-001', 'Cidade', 'UF')
ON CONFLICT (code) DO NOTHING;

-- 5. TRIGGER PARA CRIAR PERFIL AUTOMATICAMENTE
-- Esta função cria um registro na tabela 'profiles' sempre que um novo usuário se cadastra no Auth do Supabase.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, branch_id)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 
    new.email, 
    'admin', -- Primeiro usuário ganha admin por padrão
    (SELECT id FROM branches LIMIT 1)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove o trigger se ele já existir para não dar erro ao rodar novamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Ativa o trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
