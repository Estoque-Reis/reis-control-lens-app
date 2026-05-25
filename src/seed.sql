-- Seed Data for Reis Controle Lens

-- 1. Create Branches
INSERT INTO branches (name, code, city, state) VALUES
('Matriz Centro', 'MATRIZ', 'Vila Velha', 'ES'),
('Filial Shopping', 'SHOP', 'Vitória', 'ES'),
('Filial Praia', 'PRAIA', 'Guarapari', 'ES');

-- 2. Create Lens Families
INSERT INTO lens_families (manufacturer, line, index, treatment, color, material, cost_price, min_stock_per_sku) VALUES
('Essilor', 'Crizal Sapphire', '1.50', 'Sapphire HR', 'Incolor', 'Resina', 120.00, 2),
('Hoya', 'Miwaki', '1.60', 'No-Risk', 'Incolor', 'Resina', 85.00, 1),
('Zeiss', 'ClearView', '1.50', 'Duravision Platinum', 'Incolor', 'Resina', 150.00, 1);

-- 3. Trigger initial SKUs generation (Can't easily do it via simple SQL seed if logic is in app, 
-- but we can insert some sample SKUs for the search demo)
INSERT INTO lens_skus (family_id, sku_code, spherical, cylindrical) 
SELECT id, 'SAPPHIRE-ESF+0.00-CIL-0.00', 0.00, 0.00 FROM lens_families WHERE line = 'Crizal Sapphire';

INSERT INTO lens_skus (family_id, sku_code, spherical, cylindrical) 
SELECT id, 'SAPPHIRE-ESF+2.00-CIL-1.00', 2.00, -1.00 FROM lens_families WHERE line = 'Crizal Sapphire';

-- 4. Initial Inventory for testing
INSERT INTO inventory (branch_id, sku_id, quantity)
SELECT b.id, s.id, 5 FROM branches b, lens_skus s WHERE b.code = 'MATRIZ' AND s.sku_code = 'SAPPHIRE-ESF+0.00-CIL-0.00';

INSERT INTO inventory (branch_id, sku_id, quantity)
SELECT b.id, s.id, 1 FROM branches b, lens_skus s WHERE b.code = 'MATRIZ' AND s.sku_code = 'SAPPHIRE-ESF+2.00-CIL-1.00';
