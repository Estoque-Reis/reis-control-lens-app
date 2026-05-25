-- REIS CONTROLE LENS - SCRIPT DE REDEFINIÇÃO TOTAL (SQL EDITOR)
-- Copie e cole tudo abaixo no seu SQL Editor do Supabase e clique em RUN.

-- 1. Limpeza total para evitar erros de "relação já existe"
DROP VIEW IF EXISTS vw_low_stock CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP TRIGGER IF EXISTS trg_update_stock ON inventory_movements CASCADE;
DROP FUNCTION IF EXISTS update_stock_from_movement CASCADE;
DROP TABLE IF EXISTS inventory_movements CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS lens_skus CASCADE;
DROP TABLE IF EXISTS lens_families CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS branches CASCADE;

-- 2. Filiais
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  city TEXT,
  state TEXT,
  status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Perfis (Extensão do Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  role TEXT CHECK (role IN ('admin', 'consultor')) DEFAULT 'consultor',
  branch_id UUID REFERENCES branches(id),
  status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Famílias de Lentes
CREATE TABLE lens_families (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manufacturer TEXT NOT NULL,
  line TEXT NOT NULL,
  "index" TEXT, -- "index" é palavra reservada, usamos aspas
  treatment TEXT,
  color TEXT,
  material TEXT,
  cost_price DECIMAL(10,2) DEFAULT 0,
  min_stock_per_sku INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SKUs (Grade de Graus)
CREATE TABLE lens_skus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID REFERENCES lens_families(id) ON DELETE CASCADE,
  sku_code TEXT UNIQUE NOT NULL,
  spherical DECIMAL(5,2) NOT NULL,
  cylindrical DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Inventário (Saldo Atual)
CREATE TABLE inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  sku_id UUID REFERENCES lens_skus(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, sku_id)
);

-- 7. Movimentações
CREATE TABLE inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES branches(id),
  sku_id UUID REFERENCES lens_skus(id),
  type TEXT CHECK (type IN ('entry', 'exit', 'transfer_in', 'transfer_out', 'adjustment')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Automação de Saldo de Estoque
CREATE OR REPLACE FUNCTION update_stock_from_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type IN ('entry', 'transfer_in') OR (NEW.type = 'adjustment' AND NEW.quantity > 0) THEN
    INSERT INTO inventory (branch_id, sku_id, quantity)
    VALUES (NEW.branch_id, NEW.sku_id, ABS(NEW.quantity))
    ON CONFLICT (branch_id, sku_id)
    DO UPDATE SET quantity = inventory.quantity + ABS(EXCLUDED.quantity), updated_at = NOW();
  ELSIF NEW.type IN ('exit', 'transfer_out') OR (NEW.type = 'adjustment' AND NEW.quantity < 0) THEN
    UPDATE inventory 
    SET quantity = quantity - ABS(NEW.quantity), updated_at = NOW()
    WHERE branch_id = NEW.branch_id AND sku_id = NEW.sku_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stock
AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION update_stock_from_movement();

-- 9. Automação de Perfis (Cria perfil ao registrar usuário no Auth)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, 'consultor', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 10. View de Alertas (Baixo Estoque)
CREATE OR REPLACE VIEW vw_low_stock AS
SELECT 
  b.name as branch_name,
  f.manufacturer,
  f.line,
  s.sku_code,
  i.quantity,
  f.min_stock_per_sku
FROM inventory i
JOIN branches b ON i.branch_id = b.id
JOIN lens_skus s ON i.sku_id = s.id
JOIN lens_families f ON s.family_id = f.id
WHERE i.quantity < f.min_stock_per_sku;

-- 11. Segurança básica
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública para autenticados" ON branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura pública para autenticados" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura pública para autenticados" ON lens_families FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura pública para autenticados" ON lens_skus FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura pública para autenticados" ON inventory FOR SELECT TO authenticated USING (true);

-- 12. Dados de Exemplo (Opcional - Filial Matriz)
INSERT INTO branches (name, code, city, state) 
VALUES ('Matriz Centro', 'FIL-001', 'São Paulo', 'SP')
ON CONFLICT DO NOTHING;
