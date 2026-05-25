export type UserRole = 'admin' | 'consultor';
export type UserStatus = 'active' | 'inactive';
export type MovementType = 'entry' | 'exit' | 'transfer_in' | 'transfer_out' | 'adjustment';
export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  branch_id: string | null;
  status: UserStatus;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  status: UserStatus;
  created_at: string;
}

export interface LensFamily {
  id: string;
  manufacturer: string;
  line: string;
  index: string | null;
  treatment: string | null;
  color: string | null;
  material: string | null;
  cost_price: number;
  min_stock_per_sku: number;
  created_at: string;
}

export interface LensSku {
  id: string;
  family_id: string;
  sku_code: string;
  spherical: number;
  cylindrical: number;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  branch_id: string;
  sku_id: string;
  quantity: number;
  updated_at: string;
  // Extended fields for UI
  sku?: LensSku;
  family?: LensFamily;
}

export interface InventoryMovement {
  id: string;
  branch_id: string;
  sku_id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Transfer {
  id: string;
  origin_branch_id: string;
  destination_branch_id: string;
  status: TransferStatus;
  requester_id: string;
  approver_id: string | null;
  created_at: string;
  // Extended
  origin_branch?: Branch;
  destination_branch?: Branch;
  items?: TransferItem[];
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  sku_id: string;
  quantity: number;
  sku?: LensSku;
}
