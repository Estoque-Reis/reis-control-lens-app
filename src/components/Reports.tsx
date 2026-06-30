import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  FileSpreadsheet, 
  BarChart3, 
  TrendingUp,
  AlertCircle,
  Loader2,
  ArrowLeftRight,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  Building2,
  FileDown,
  DollarSign,
  Layers,
  Inbox,
  Layers2,
  ChevronRight,
  PieChart as LucidePieChart,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend as ChartLegend, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { cn, formatCurrency, formatRefraction, formatCylinder } from '@/src/lib/utils';

// Types for raw inputs
interface Branch {
  id: string;
  name: string;
  code: string;
  status?: string;
}

interface Sku {
  id: string;
  family_id: string;
  sku_code: string;
  spherical: number;
  cylindrical: number;
}

interface Family {
  id: string;
  manufacturer: string;
  line: string;
  material: string;
  index: string;
  treatment: string;
  cost_price: number;
  min_stock_per_sku: number;
}

interface InventoryItem {
  id: string;
  branch_id: string;
  sku_id: string;
  quantity: number;
  updated_at?: any;
}

interface MovementItem {
  id: string;
  branch_id: string;
  sku_id: string;
  type: string;
  quantity: number;
  reason: string;
  created_at?: any;
  user_id?: string;
}

type ReportType = 
  | 'inventory_current' 
  | 'inventory_consolidated' 
  | 'low_stock' 
  | 'out_of_stock' 
  | 'movements' 
  | 'financial_valuation'
  | 'replenishment';

// Translate movement types
export const translateMovType = (type: string) => {
  switch (type) {
    case 'entry': return { label: 'Entrada 🟢', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    case 'exit': return { label: 'Saída 🔴', color: 'bg-rose-50 text-rose-700 border-rose-100' };
    case 'writeoff': return { label: 'Baixa ⚠️', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'transfer_out': return { label: 'Despacho Transferência ➡️', color: 'bg-blue-50 text-blue-700 border-blue-100' };
    case 'transfer_in': return { label: 'Efetivado Transferência ⬅️', color: 'bg-teal-50 text-teal-700 border-teal-100' };
    default: return { label: type, color: 'bg-slate-50 text-slate-700 border-slate-100' };
  }
};

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [rawInventory, setRawInventory] = useState<InventoryItem[]>([]);
  const [rawMovements, setRawMovements] = useState<MovementItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);

  // Filtering criteria
  const [selectedReportId, setSelectedReportId] = useState<ReportType>('inventory_current');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chartsVisible, setChartsVisible] = useState<boolean>(true);

  const reportTypes = [
    { 
      id: 'inventory_current' as ReportType, 
      title: 'Estoque Atual por Filial', 
      desc: 'Lista consolidada de todos os produtos físicos disponíveis em cada loja em tempo real.',
      icon: BarChart3,
      color: 'bg-teal-500 text-teal-600 border-teal-100 bg-teal-50/50'
    },
    { 
      id: 'inventory_consolidated' as ReportType, 
      title: 'Estoque Consolidado da Rede', 
      desc: 'Visualização agrupada por SKU com a soma total de itens em toda a rede de lojas.',
      icon: Layers,
      color: 'bg-blue-500 text-blue-600 border-blue-100 bg-blue-50/50'
    },
    { 
      id: 'low_stock' as ReportType, 
      title: 'Itens Abaixo do Mínimo', 
      desc: 'Alerta crítico de reposição de itens cujo estoque atingiu valores abaixo do mínimo exigido.',
      icon: AlertCircle,
      color: 'bg-amber-500 text-amber-600 border-amber-100 bg-amber-50/50'
    },
    { 
      id: 'out_of_stock' as ReportType, 
      title: 'Itens Sem Estoque', 
      desc: 'Lista de produtos sem nenhuma unidade remanescente para identificação de rupturas.',
      icon: Inbox,
      color: 'bg-rose-500 text-rose-600 border-rose-100 bg-rose-50/50'
    },
    { 
      id: 'movements' as ReportType, 
      title: 'Movimentações do Período', 
      desc: 'Rastreamento completo do fluxo de entradas, saídas, baixas e transferências lançadas.',
      icon: TrendingUp,
      color: 'bg-emerald-500 text-emerald-600 border-emerald-100 bg-emerald-50/50'
    },
    { 
      id: 'financial_valuation' as ReportType, 
      title: 'Valor Financeiro do Estoque', 
      desc: 'Cálculo monetário do capital investido em mercadorias a preço de custo do fabricante.',
      icon: DollarSign,
      color: 'bg-indigo-500 text-indigo-600 border-indigo-100 bg-indigo-50/50'
    },
    { 
      id: 'replenishment' as ReportType, 
      title: 'Plano de Ressuprimento Cruzado', 
      desc: 'Sugestão automática de transferências inteligentes de filiais com excedente para atender canais com estoque baixo.',
      icon: ArrowLeftRight,
      color: 'bg-emerald-500 text-emerald-600 border-emerald-100 bg-emerald-50/50'
    }
  ];

  // Load and cache datasets
  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [invSnap, movSnap, branchesList, familiesList, skusList] = await Promise.all([
        getDocs(collection(db, 'inventory')),
        getDocs(collection(db, 'movements')),
        getCachedBranches(forceRefresh),
        getCachedFamilies(forceRefresh),
        getCachedSkus(forceRefresh)
      ]);

      const filteredBranches = branchesList.filter(b => b.status === "active" && b.id !== "outra" && b.id !== "outras" && b.code !== "outra");
      const activeBranchIds = filteredBranches.map(b => b.id);

      setRawInventory((invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem))).filter(item => activeBranchIds.includes(item.branch_id)));
      setRawMovements((movSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))).filter(item => activeBranchIds.includes(item.branch_id)) as any);
      setBranches(filteredBranches);
      setFamilies(familiesList);
      setSkus(skusList);
    } catch (err) {
      console.error("Erro ao carregar dados dos relatórios:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const parseFirestoreDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val.seconds) return new Date(val.seconds * 1000);
    if (typeof val === 'string' || typeof val === 'number') return new Date(val);
    return null;
  };

  const isDateInRange = (date: Date | null, start: string, end: string) => {
    if (!date) return !start && !end;
    if (start) {
      const startDateUTC = new Date(start + 'T00:00:00');
      if (date < startDateUTC) return false;
    }
    if (end) {
      const endDateUTC = new Date(end + 'T23:59:59');
      if (date > endDateUTC) return false;
    }
    return true;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Memoized maps for rapid lookup
  const skusMap = React.useMemo(() => new Map<string, Sku>(skus.map(s => [s.id, s])), [skus]);
  const familiesMap = React.useMemo(() => new Map<string, Family>(families.map(f => [f.id, f])), [families]);
  const branchesMap = React.useMemo(() => new Map<string, Branch>(branches.map(b => [b.id, b])), [branches]);

  // Compute processed records for current selection
  const computedDataAll = React.useMemo(() => {
    if (loading) return [];

    switch (selectedReportId) {
      case 'inventory_current': {
        const result: any[] = [];
        for (const item of rawInventory) {
          // Branch filter
          if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) continue;

          const sku = skusMap.get(item.sku_id);
          const branch = branchesMap.get(item.branch_id);
          if (!sku || !branch) continue;

          if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

          const family = familiesMap.get(sku.family_id);
          const updateDate = parseFirestoreDate(item.updated_at);

          // Date filter
          if (!isDateInRange(updateDate, startDate, endDate)) continue;

          result.push({
            id: item.id,
            branch_id: item.branch_id,
            branch_name: branch.name,
            sku_id: item.sku_id,
            sku_code: sku.sku_code,
            manufacturer: family?.manufacturer || 'N/A',
            line: family?.line || 'N/A',
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            quantity: item.quantity,
            updated_at: updateDate,
            formatted_date: formatDate(updateDate),
          });
        }
        return result;
      }

      case 'inventory_consolidated': {
        // Group inventory by SKU
        const skuGroups: Record<string, { sku_id: string; total_quantity: number; branch_counts: Set<string>; last_updated: Date | null }> = {};
        
        for (const item of rawInventory) {
          // If filtering by branch, only include that branch's contribution
          if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) continue;

          const sku = skusMap.get(item.sku_id);
          if (!sku) continue;
          if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

          const updateDate = parseFirestoreDate(item.updated_at);
          if (!isDateInRange(updateDate, startDate, endDate)) continue;

          if (!skuGroups[item.sku_id]) {
            skuGroups[item.sku_id] = {
              sku_id: item.sku_id,
              total_quantity: 0,
              branch_counts: new Set(),
              last_updated: null
            };
          }

          skuGroups[item.sku_id].total_quantity += item.quantity || 0;
          if (item.quantity > 0) {
            skuGroups[item.sku_id].branch_counts.add(item.branch_id);
          }

          if (updateDate) {
            if (!skuGroups[item.sku_id].last_updated || updateDate > skuGroups[item.sku_id].last_updated!) {
              skuGroups[item.sku_id].last_updated = updateDate;
            }
          }
        }

        const result: any[] = [];
        for (const key of Object.keys(skuGroups)) {
          const group = skuGroups[key];
          const sku = skusMap.get(group.sku_id);
          if (!sku) continue;

          const family = familiesMap.get(sku.family_id);
          const branchesListNames = Array.from(group.branch_counts)
            .map(bId => branchesMap.get(bId)?.name || bId)
            .join(', ');

          result.push({
            id: group.sku_id,
            sku_code: sku.sku_code,
            manufacturer: family?.manufacturer || 'N/A',
            line: family?.line || 'N/A',
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            total_quantity: group.total_quantity,
            branches_count: group.branch_counts.size,
            branches_stocked: branchesListNames || 'Nenhum',
            updated_at: group.last_updated,
            formatted_date: formatDate(group.last_updated),
          });
        }
        return result;
      }

      case 'low_stock': {
        const result: any[] = [];
        for (const item of rawInventory) {
          if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) continue;

          const sku = skusMap.get(item.sku_id);
          const branch = branchesMap.get(item.branch_id);
          if (!sku || !branch) continue;

          if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

          const family = familiesMap.get(sku.family_id);
          const minStock = family?.min_stock_per_sku || 0;

          // Only alert when stock goes below minimum
          if (item.quantity >= minStock) continue;

          const updateDate = parseFirestoreDate(item.updated_at);
          if (!isDateInRange(updateDate, startDate, endDate)) continue;

          result.push({
            id: item.id,
            branch_id: item.branch_id,
            branch_name: branch.name,
            sku_code: sku.sku_code,
            manufacturer: family?.manufacturer || 'N/A',
            line: family?.line || 'N/A',
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            quantity: item.quantity,
            min_stock: minStock,
            deficit: minStock - item.quantity,
            updated_at: updateDate,
            formatted_date: formatDate(updateDate),
          });
        }
        return result;
      }

      case 'out_of_stock': {
        // Find SKUs with exactly 0 stock or are entirely missing in selected branch(es)
        const result: any[] = [];
        const activeBranches = selectedBranchId === 'all' 
          ? branches 
          : branches.filter(b => b.id === selectedBranchId);

        // Map existing inventories for fast lookup
        const invMap = new Map<string, InventoryItem>();
        for (const item of rawInventory) {
          invMap.set(`${item.branch_id}_${item.sku_id}`, item);
        }

        for (const branch of activeBranches) {
          for (const sku of skus) {
            if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

            const item = invMap.get(`${branch.id}_${sku.id}`);
            const qty = item ? item.quantity : 0;

            if (qty === 0) {
              const updateDate = item ? parseFirestoreDate(item.updated_at) : null;
              if (!isDateInRange(updateDate, startDate, endDate)) continue;

              const family = familiesMap.get(sku.family_id);

              result.push({
                id: `${branch.id}_${sku.id}`,
                branch_name: branch.name,
                sku_code: sku.sku_code,
                manufacturer: family?.manufacturer || 'N/A',
                line: family?.line || 'N/A',
                spherical: sku.spherical,
                cylindrical: sku.cylindrical,
                quantity: 0,
                updated_at: updateDate,
                formatted_date: formatDate(updateDate),
              });
            }
          }
        }
        return result;
      }

      case 'movements': {
        const result: any[] = [];
        for (const movement of rawMovements) {
          if (selectedBranchId !== 'all' && movement.branch_id !== selectedBranchId) continue;

          const createdDate = parseFirestoreDate(movement.created_at);
          if (!isDateInRange(createdDate, startDate, endDate)) continue;

          const sku = skusMap.get(movement.sku_id);
          const branch = branchesMap.get(movement.branch_id);
          if (!sku || !branch) continue;

          if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

          const family = familiesMap.get(sku.family_id);

          result.push({
            id: movement.id,
            branch_name: branch.name,
            sku_code: sku.sku_code,
            manufacturer: family?.manufacturer || 'N/A',
            line: family?.line || 'N/A',
            type: movement.type,
            quantity: movement.quantity,
            reason: movement.reason || 'N/A',
            user_id: movement.user_id || 'N/A',
            created_at: createdDate,
            formatted_date: formatDate(createdDate)
          });
        }
        // Ordered newest first by default
        return result.sort((a, b) => {
          const tA = a.created_at?.getTime() || 0;
          const tB = b.created_at?.getTime() || 0;
          return tB - tA;
        });
      }

      case 'financial_valuation': {
        const result: any[] = [];
        for (const item of rawInventory) {
          if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) continue;

          const sku = skusMap.get(item.sku_id);
          const branch = branchesMap.get(item.branch_id);
          if (!sku || !branch) continue;

          if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

          const family = familiesMap.get(sku.family_id);
          const updateDate = parseFirestoreDate(item.updated_at);

          if (!isDateInRange(updateDate, startDate, endDate)) continue;

          const unitCost = family?.cost_price || 0;
          const totalValuation = item.quantity * unitCost;

          result.push({
            id: item.id,
            branch_id: item.branch_id,
            branch_name: branch.name,
            sku_code: sku.sku_code,
            manufacturer: family?.manufacturer || 'N/A',
            line: family?.line || 'N/A',
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            quantity: item.quantity,
            unit_cost: unitCost,
            total_valuation: totalValuation,
            updated_at: updateDate,
            formatted_date: formatDate(updateDate),
          });
        }
        return result;
      }

      case 'replenishment': {
        const result: any[] = [];
        
        // Map current inventory for rapid lookup of [branchId_skuId] -> quantity
        const invMap = new Map<string, number>();
        const invUpdateMap = new Map<string, any>();
        for (const item of rawInventory) {
          invMap.set(`${item.branch_id}_${item.sku_id}`, item.quantity || 0);
          if (item.updated_at) {
            invUpdateMap.set(`${item.branch_id}_${item.sku_id}`, item.updated_at);
          }
        }

        const activeBranches = selectedBranchId === 'all' 
          ? branches 
          : branches.filter(b => b.id === selectedBranchId);

        // For each active branch, analyze each SKU to check if replenishment is needed
        for (const branch of activeBranches) {
          for (const sku of skus) {
            if (selectedFamilyId !== 'all' && sku.family_id !== selectedFamilyId) continue;

            const currentQty = invMap.get(`${branch.id}_${sku.id}`) || 0;
            const family = familiesMap.get(sku.family_id);
            const minStock = family?.min_stock_per_sku || 0;

            if (currentQty < minStock) {
              const deficit = minStock - currentQty;
              const rawUpdate = invUpdateMap.get(`${branch.id}_${sku.id}`);
              const updateDate = rawUpdate ? parseFirestoreDate(rawUpdate) : null;
              
              if (!isDateInRange(updateDate, startDate, endDate)) continue;

              // Find where else this SKU is available
              const potentialDonors: any[] = [];
              for (const otherBranch of branches) {
                if (otherBranch.id === branch.id) continue;
                const otherQty = invMap.get(`${otherBranch.id}_${sku.id}`) || 0;
                if (otherQty > 0) {
                  const otherFamily = familiesMap.get(sku.family_id);
                  const otherMinStock = otherFamily?.min_stock_per_sku || 0;
                  const surplus = otherQty - otherMinStock;

                  potentialDonors.push({
                    branch_id: otherBranch.id,
                    branch_name: otherBranch.name,
                    quantity: otherQty,
                    min_stock: otherMinStock,
                    surplus: surplus,
                    is_surplus_donor: surplus > 0
                  });
                }
              }

              // Sort potential donors: surplus donors first, highest surplus / quantity first
              potentialDonors.sort((a, b) => {
                if (a.is_surplus_donor && !b.is_surplus_donor) return -1;
                if (!a.is_surplus_donor && b.is_surplus_donor) return 1;
                if (a.is_surplus_donor && b.is_surplus_donor) {
                  return b.surplus - a.surplus;
                }
                return b.quantity - a.quantity;
              });

              // Create detailed suggestion
              let recommendation = 'Nenhum doador disponível na rede';
              if (potentialDonors.length > 0) {
                const best = potentialDonors[0];
                if (best.is_surplus_donor) {
                  const toTake = Math.min(deficit, best.surplus);
                  recommendation = `Pegar ${toTake} un. de "${best.branch_name}" (possui excedente saudável de S=${best.surplus} un)`;
                } else {
                  const toTake = Math.min(deficit, best.quantity);
                  recommendation = `Pegar ${toTake} un. de "${best.branch_name}" (alerta: reduzirá do mínimo da filial doadora)`;
                }
              }

              result.push({
                id: `replenish_${branch.id}_${sku.id}`,
                branch_id: branch.id,
                branch_name: branch.name,
                sku_id: sku.id,
                sku_code: sku.sku_code,
                manufacturer: family?.manufacturer || 'N/A',
                line: family?.line || 'N/A',
                spherical: sku.spherical,
                cylindrical: sku.cylindrical,
                quantity: currentQty,
                min_stock: minStock,
                deficit: deficit,
                donors: potentialDonors,
                best_recommendation: recommendation,
                updated_at: updateDate,
                formatted_date: formatDate(updateDate)
              });
            }
          }
        }

        // Sort by deficit descending so most critical is first
        return result.sort((a, b) => b.deficit - a.deficit);
      }

      default:
        return [];
    }
  }, [loading, selectedReportId, selectedBranchId, selectedFamilyId, startDate, endDate, rawInventory, rawMovements, skusMap, familiesMap, branchesMap, skus]);

  // Dynamic filter by text query inside computed selection
  const filteredPreviewData = React.useMemo(() => {
    const s = searchQuery.toLowerCase().trim();
    if (!s) return computedDataAll;

    return computedDataAll.filter(row => {
      return (
        String(row.sku_code || '').toLowerCase().includes(s) ||
        String(row.manufacturer || '').toLowerCase().includes(s) ||
        String(row.line || '').toLowerCase().includes(s) ||
        String(row.branch_name || '').toLowerCase().includes(s) ||
        String(row.reason || '').toLowerCase().includes(s) ||
        String(row.type || '').toLowerCase().includes(s)
      );
    });
  }, [computedDataAll, searchQuery]);

  // Compute replenishment grouped by family for high level insights
  const replenishmentByFamily = React.useMemo(() => {
    if (selectedReportId !== 'replenishment' || loading) return [];

    // Map current inventory for rapid lookup of [branchId_skuId] -> quantity
    const invMap = new Map<string, number>();
    for (const item of rawInventory) {
      invMap.set(`${item.branch_id}_${item.sku_id}`, item.quantity || 0);
    }

    const activeBranches = selectedBranchId === 'all' 
      ? branches 
      : branches.filter(b => b.id === selectedBranchId);

    const groups: Record<string, {
      familyId: string;
      manufacturer: string;
      line: string;
      treatment: string;
      defectItemsCount: number;
      totalDeficitQty: number;
      itemsWithDonors: number;
      itemsWithoutDonors: number;
    }> = {};

    // For each active branch, analyze each SKU to check if replenishment is needed
    for (const branch of activeBranches) {
      for (const sku of skus) {
        const currentQty = invMap.get(`${branch.id}_${sku.id}`) || 0;
        const family = familiesMap.get(sku.family_id);
        const minStock = family?.min_stock_per_sku || 0;

        if (currentQty < minStock) {
          const deficit = minStock - currentQty;
          
          // Find if there are potential donors
          let donorsCount = 0;
          for (const otherBranch of branches) {
            if (otherBranch.id === branch.id) continue;
            const otherQty = invMap.get(`${otherBranch.id}_${sku.id}`) || 0;
            if (otherQty > 0) {
              donorsCount++;
            }
          }

          const fId = sku.family_id;
          if (!groups[fId]) {
            groups[fId] = {
              familyId: fId,
              manufacturer: family?.manufacturer || 'N/A',
              line: family?.line || 'N/A',
              treatment: family?.treatment || 'Sem tratamento',
              defectItemsCount: 0,
              totalDeficitQty: 0,
              itemsWithDonors: 0,
              itemsWithoutDonors: 0
            };
          }

          groups[fId].defectItemsCount += 1;
          groups[fId].totalDeficitQty += deficit;
          if (donorsCount > 0) {
            groups[fId].itemsWithDonors += 1;
          } else {
            groups[fId].itemsWithoutDonors += 1;
          }
        }
      }
    }

    return Object.values(groups).sort((a, b) => b.totalDeficitQty - a.totalDeficitQty);
  }, [loading, selectedReportId, selectedBranchId, rawInventory, branches, skus, familiesMap]);

  // Compute stats based on the ACTIVE dataset (after text query)
  const stats = React.useMemo(() => {
    const totalLines = filteredPreviewData.length;
    let totalQuantity = 0;
    let totalValue = 0;
    let totalDeficit = 0;

    for (const item of filteredPreviewData) {
      totalQuantity += item.quantity || item.total_quantity || 0;
      if (item.total_valuation) {
        totalValue += item.total_valuation;
      }
      if (item.deficit) {
        totalDeficit += item.deficit;
      }
    }

    return {
      totalLines,
      totalQuantity,
      totalValue,
      totalDeficit
    };
  }, [filteredPreviewData]);

  // Group data for Charts dynamically based on active selectedReportId
  const chartData = React.useMemo(() => {
    if (filteredPreviewData.length === 0) return { series1: [], series2: [] };

    const series1Map = new Map<string, number>();
    const series2Map = new Map<string, number>();

    switch (selectedReportId) {
      case 'inventory_current':
        filteredPreviewData.forEach(row => {
          series1Map.set(row.branch_name, (series1Map.get(row.branch_name) || 0) + (row.quantity || 0));
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + (row.quantity || 0));
        });
        break;

      case 'inventory_consolidated':
        // Top 10 SKUs
        const sortedSkus = [...filteredPreviewData]
          .sort((a, b) => (b.total_quantity || 0) - (a.total_quantity || 0))
          .slice(0, 10);
        sortedSkus.forEach(row => {
          series1Map.set(row.sku_code, row.total_quantity || 0);
        });
        // Consolidado por Fabricante
        filteredPreviewData.forEach(row => {
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + (row.total_quantity || 0));
        });
        break;

      case 'low_stock':
        filteredPreviewData.forEach(row => {
          series1Map.set(row.branch_name, (series1Map.get(row.branch_name) || 0) + (row.deficit || 0));
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + (row.deficit || 0));
        });
        break;

      case 'out_of_stock':
        filteredPreviewData.forEach(row => {
          series1Map.set(row.branch_name, (series1Map.get(row.branch_name) || 0) + 1);
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + 1);
        });
        break;

      case 'movements':
        filteredPreviewData.forEach(row => {
          const typeLabel = translateMovType(row.type).label.split(' ')[0]; // E.g., "Entrada", "Saída"
          series1Map.set(typeLabel, (series1Map.get(typeLabel) || 0) + (row.quantity || 0));
          series2Map.set(row.branch_name, (series2Map.get(row.branch_name) || 0) + (row.quantity || 0));
        });
        break;

      case 'financial_valuation':
        filteredPreviewData.forEach(row => {
          series1Map.set(row.branch_name, (series1Map.get(row.branch_name) || 0) + (row.total_valuation || 0));
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + (row.total_valuation || 0));
        });
        break;

      case 'replenishment':
        filteredPreviewData.forEach(row => {
          series1Map.set(row.branch_name, (series1Map.get(row.branch_name) || 0) + (row.deficit || 0));
          series2Map.set(row.manufacturer, (series2Map.get(row.manufacturer) || 0) + (row.deficit || 0));
        });
        break;
    }

    const series1 = Array.from(series1Map.entries()).map(([name, value]) => ({ name, value }));
    const series2 = Array.from(series2Map.entries()).map(([name, value]) => ({ name, value }));

    return { series1, series2 };
  }, [filteredPreviewData, selectedReportId]);

  const getExportFilename = () => {
    const activeType = reportTypes.find(r => r.id === selectedReportId);
    const label = activeType ? activeType.title.toLowerCase().replace(/ /g, '_') : 'relatorio';
    const cleanDateStr = new Date().toISOString().split('T')[0];
    return `${label}_${cleanDateStr}`;
  };

  // EXPORT 1: EXCEL
  const exportToExcel = () => {
    if (filteredPreviewData.length === 0) {
      alert("Nenhum dado disponível para exportação com os filtros vigentes.");
      return;
    }

    let rows: any[] = [];
    const activeType = reportTypes.find(r => r.id === selectedReportId)?.title || 'Relatório';

    if (selectedReportId === 'inventory_current') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'SKU': r.sku_code,
        'Esférico (SPH)': formatRefraction(r.spherical),
        'Cilíndrico (CYL)': formatCylinder(r.cylindrical),
        'Estoque Atual': r.quantity,
        'Última Atualização': r.formatted_date
      }));
    } else if (selectedReportId === 'inventory_consolidated') {
      rows = filteredPreviewData.map(r => ({
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esférico (SPH)': formatRefraction(r.spherical),
        'Cilíndrico (CYL)': formatCylinder(r.cylindrical),
        'Estoque Consolidado': r.total_quantity,
        'Lojas Atendidas': r.branches_count,
        'Filiais com Estoque': r.branches_stocked
      }));
    } else if (selectedReportId === 'low_stock') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esférico (SPH)': formatRefraction(r.spherical),
        'Cilíndrico (CYL)': formatCylinder(r.cylindrical),
        'Estoque Atual': r.quantity,
        'Estoque Mínimo': r.min_stock,
        'Déficit': r.deficit
      }));
    } else if (selectedReportId === 'out_of_stock') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esférico (SPH)': formatRefraction(r.spherical),
        'Cilíndrico (CYL)': formatCylinder(r.cylindrical),
        'Estoque': r.quantity,
        'Última Modificação': r.formatted_date
      }));
    } else if (selectedReportId === 'movements') {
      rows = filteredPreviewData.map(r => ({
        'Data e Hora': r.formatted_date,
        'Filial': r.branch_name,
        'Tipo': translateMovType(r.type).label,
        'Quantidade': r.quantity,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Motivo / Observação': r.reason
      }));
    } else if (selectedReportId === 'financial_valuation') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Quantidade': r.quantity,
        'Preço de Custo (Un)': formatCurrency(r.unit_cost),
        'Valor Total do Estoque': formatCurrency(r.total_valuation),
        'Última Atualização': r.formatted_date
      }));
    } else if (selectedReportId === 'replenishment') {
      rows = filteredPreviewData.map(r => ({
        'Filial Solicitante': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esférico (SPH)': formatRefraction(r.spherical),
        'Cilíndrico (CYL)': formatCylinder(r.cylindrical),
        'Estoque Atual': r.quantity,
        'Estoque Mínimo': r.min_stock,
        'Déficit (Reposição)': r.deficit,
        'Sugestão de Ressuprimento': r.best_recommendation,
        'Doadores Disponíveis (Estoque | Excedente)': r.donors?.length > 0
          ? r.donors.map((d: any) => `${d.branch_name} (Estoque: ${d.quantity}, Excedente: ${d.surplus})`).join(' | ')
          : 'Nenhum'
      }));
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeType.substring(0, 30));
    XLSX.writeFile(wb, `${getExportFilename()}.xlsx`);
  };

  // EXPORT 2: CSV
  const exportToCSV = () => {
    if (filteredPreviewData.length === 0) {
      alert("Nenhum dado disponível para exportação com os filtros vigentes.");
      return;
    }

    let rows: any[] = [];

    if (selectedReportId === 'inventory_current') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'SKU': r.sku_code,
        'Esferico': formatRefraction(r.spherical),
        'Cilindrico': formatCylinder(r.cylindrical),
        'Estoque_Atual': r.quantity,
        'Ultima_Atualizacao': r.formatted_date
      }));
    } else if (selectedReportId === 'inventory_consolidated') {
      rows = filteredPreviewData.map(r => ({
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esferico': formatRefraction(r.spherical),
        'Cilindrico': formatCylinder(r.cylindrical),
        'Estoque_Consolidado': r.total_quantity,
        'Lojas_Atendidas_Contagem': r.branches_count,
        'Filiais_Com_Estoque': r.branches_stocked
      }));
    } else if (selectedReportId === 'low_stock') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esferico': formatRefraction(r.spherical),
        'Cilindrico': formatCylinder(r.cylindrical),
        'Estoque_Atual': r.quantity,
        'Estoque_Minimo': r.min_stock,
        'Deficit': r.deficit
      }));
    } else if (selectedReportId === 'out_of_stock') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esferico': formatRefraction(r.spherical),
        'Cilindrico': formatCylinder(r.cylindrical),
        'Estoque': r.quantity,
        'Ultima_Modificacao': r.formatted_date
      }));
    } else if (selectedReportId === 'movements') {
      rows = filteredPreviewData.map(r => ({
        'Data_Hora': r.formatted_date,
        'Filial': r.branch_name,
        'Tipo': translateMovType(r.type).label,
        'Quantidade': r.quantity,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Motivo_Observacao': r.reason
      }));
    } else if (selectedReportId === 'financial_valuation') {
      rows = filteredPreviewData.map(r => ({
        'Filial': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Quantidade': r.quantity,
        'Custo_Unitario': formatCurrency(r.unit_cost),
        'Valor_Total_Estoque': formatCurrency(r.total_valuation),
        'Ultima_Atualizacao': r.formatted_date
      }));
    } else if (selectedReportId === 'replenishment') {
      rows = filteredPreviewData.map(r => ({
        'Filial_Solicitante': r.branch_name,
        'SKU': r.sku_code,
        'Fabricante': r.manufacturer,
        'Linha': r.line,
        'Esferico': formatRefraction(r.spherical),
        'Cilindrico': formatCylinder(r.cylindrical),
        'Estoque_Atual': r.quantity,
        'Estoque_Minimo': r.min_stock,
        'Deficit': r.deficit,
        'Sugestao_Ressuprimento': r.best_recommendation,
        'Doadores_Em_Rede': r.donors?.length > 0
          ? r.donors.map((d: any) => `${d.branch_name}(Estoque:${d.quantity})`).join('|')
          : 'Nenhum'
      }));
    }

    const headers = Object.keys(rows[0] || {});
    // Direct Portuguese Excel friendly formatting with ";" separator & BOM
    const csvRows = [
      headers.join(';'),
      ...rows.map(row => 
        headers.map(header => {
          const val = row[header];
          if (val === null || val === undefined) return '';
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(';')
      )
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${getExportFilename()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // EXPORT 3: PREMIUM A4 PDF
  const exportToPDF = () => {
    if (filteredPreviewData.length === 0) {
      alert("Nenhum dado disponível para exportação com os filtros vigentes.");
      return;
    }

    const docPDF = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const activeReport = reportTypes.find(r => r.id === selectedReportId);
    const title = activeReport ? activeReport.title : 'Relatório';

    // Header styling
    docPDF.setFont('helvetica', 'bold');
    docPDF.setFontSize(20);
    docPDF.setTextColor(15, 118, 110); // Brand teal
    docPDF.text("REIS CONTROLE LENS 👓", 14, 15);

    docPDF.setFontSize(12);
    docPDF.setTextColor(51, 65, 85); // Slate slate-700
    docPDF.text(`Relatório Avançado: ${title}`, 14, 21);

    // Meta filters
    docPDF.setFont('helvetica', 'normal');
    docPDF.setFontSize(9);
    docPDF.setTextColor(100, 116, 139); // Slate-400
    const branchLabel = selectedBranchId === 'all' ? 'Todas' : (branchesMap.get(selectedBranchId)?.name || 'Específica');
    const periodLabel = (startDate || endDate) 
      ? `Filtrado de ${startDate ? formatDate(new Date(startDate + 'T00:00:00'))?.split(' ')[0] : 'Início'} até ${endDate ? formatDate(new Date(endDate + 'T23:59:59'))?.split(' ')[0] : 'Fim'}`
      : 'Todos os registros';
    docPDF.text(`Filial Selecionada: ${branchLabel}  |  Período: ${periodLabel}`, 14, 27);
    docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 32);

    let head: string[][] = [];
    let body: any[][] = [];

    if (selectedReportId === 'inventory_current') {
      head = [['Filial', 'Fabricante', 'Modelo / Linha', 'SKU', 'Esf (SPH)', 'Cil (CYL)', 'Qtd Físico', 'Atualizado em']];
      body = filteredPreviewData.map(r => [
        r.branch_name,
        r.manufacturer,
        r.line,
        r.sku_code,
        formatRefraction(r.spherical),
        formatCylinder(r.cylindrical),
        String(r.quantity),
        r.formatted_date
      ]);
    } else if (selectedReportId === 'inventory_consolidated') {
      head = [['Código SKU', 'Fabricante', 'Modelo / Linha', 'Esf (SPH)', 'Cil (CYL)', 'Estoque Consolidado', 'Lojas', 'Filiais com Estoque']];
      body = filteredPreviewData.map(r => [
        r.sku_code,
        r.manufacturer,
        r.line,
        formatRefraction(r.spherical),
        formatCylinder(r.cylindrical),
        String(r.total_quantity),
        String(r.branches_count),
        r.branches_stocked
      ]);
    } else if (selectedReportId === 'low_stock') {
      head = [['Filial', 'Código SKU', 'Fabricante', 'Modelo / Linha', 'Atual', 'Mínimo', 'Déficit (Reposição)']];
      body = filteredPreviewData.map(r => [
        r.branch_name,
        r.sku_code,
        r.manufacturer,
        r.line,
        String(r.quantity),
        String(r.min_stock),
        String(r.deficit)
      ]);
    } else if (selectedReportId === 'out_of_stock') {
      head = [['Filial', 'Código SKU', 'Fabricante', 'Modelo / Linha', 'Esf (SPH)', 'Cil (CYL)', 'Estoque', 'Última Modificação']];
      body = filteredPreviewData.map(r => [
        r.branch_name,
        r.sku_code,
        r.manufacturer,
        r.line,
        formatRefraction(r.spherical),
        formatCylinder(r.cylindrical),
        '0',
        r.formatted_date
      ]);
    } else if (selectedReportId === 'movements') {
      head = [['Data e Hora', 'Filial', 'Operação', 'Qtd', 'SKU', 'Fabricante', 'Linha', 'Motivo']];
      body = filteredPreviewData.map(r => [
        r.formatted_date,
        r.branch_name,
        translateMovType(r.type).label,
        String(r.quantity),
        r.sku_code,
        r.manufacturer,
        r.line,
        r.reason
      ]);
    } else if (selectedReportId === 'financial_valuation') {
      head = [['Filial', 'Código SKU', 'Fabricante', 'Modelo / Linha', 'Esf (SPH)', 'Cil (CYL)', 'Quantidade', 'Custo Un.', 'Total em Estoque']];
      body = filteredPreviewData.map(r => [
        r.branch_name,
        r.sku_code,
        r.manufacturer,
        r.line,
        formatRefraction(r.spherical),
        formatCylinder(r.cylindrical),
        String(r.quantity),
        formatCurrency(r.unit_cost),
        formatCurrency(r.total_valuation)
      ]);
    } else if (selectedReportId === 'replenishment') {
      head = [['Filial Recetora', 'SKU', 'Fabricante', 'Linha', 'Esf', 'Cil', 'Estoque', 'Mín', 'Déficit', 'Sugestão de Ressuprimento']];
      body = filteredPreviewData.map(r => [
        r.branch_name,
        r.sku_code,
        r.manufacturer,
        r.line,
        formatRefraction(r.spherical),
        formatCylinder(r.cylindrical),
        String(r.quantity),
        String(r.min_stock),
        String(r.deficit),
        r.best_recommendation
      ]);
    }

    // Embed AutoTable with high premium theme colors
    autoTable(docPDF, {
      startY: 37,
      head: head,
      body: body,
      theme: 'striped',
      headStyles: {
        fillColor: [13, 148, 136], // primary-600 (teal)
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [51, 65, 85]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // slate-50
      },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        // Footer: Page indicators
        const str = `Página ${data.pageNumber}`;
        docPDF.setFontSize(8);
        docPDF.setTextColor(148, 163, 184); // slate-400
        docPDF.text(str, docPDF.internal.pageSize.width - 25, docPDF.internal.pageSize.height - 10);
        docPDF.text("Reis Controle Lens Inteligente - Módulo de Relatórios Consolidados", 14, docPDF.internal.pageSize.height - 10);
      }
    });

    docPDF.save(`${getExportFilename()}.pdf`);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            Relatórios e Auditoria Avançada 📊
          </h1>
          <p className="text-slate-400 mt-1 font-semibold text-sm">
            Gere, analise e exporte informações essenciais de estoque, finanças e movimentações de sua rede de óticas.
          </p>
        </div>
        <button 
          onClick={() => loadData(true)} 
          disabled={loading}
          className="self-start md:self-center inline-flex items-center space-x-2 px-4.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200 hover:border-slate-300 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={cn("text-slate-500", loading && "animate-spin")} />
          <span>Sincronizar Banco</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-100 shadow-xs">
          <Loader2 size={40} className="text-brand-teal animate-spin mb-4" />
          <h3 className="text-slate-700 font-extrabold text-base">Processando relatórios...</h3>
          <p className="text-slate-400 text-xs mt-1">Carregando grades de todas as filiais.</p>
        </div>
      ) : (
        <>
          {/* Universal Filters Controller Card */}
          <div className={cn(
            "bg-white rounded-3xl p-6 shadow-xs border border-slate-100 grid grid-cols-1 gap-5",
            selectedReportId === 'replenishment' ? "md:grid-cols-5" : "md:grid-cols-4"
          )}>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Building2 size={13} className="text-slate-400" />
                Filial Selecionada
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-xs font-bold transition-all cursor-pointer"
              >
                <option value="all">🌐 Todas as Filiais (Rede Consolidada)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>🏪 {b.name} ({b.code})</option>
                ))}
              </select>
            </div>

            {selectedReportId === 'replenishment' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Layers2 size={13} className="text-slate-400" />
                  Família de Lentes
                </label>
                <select
                  value={selectedFamilyId}
                  onChange={(e) => setSelectedFamilyId(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-xs font-bold transition-all cursor-pointer"
                >
                  <option value="all">📦 Todas as Famílias (Sem Filtro)</option>
                  {families.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.manufacturer} - {f.line} ({f.treatment || 'Sem tratamento'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                Data Inicial
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-xs font-bold transition-all cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                Data Final
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-xs font-bold transition-all cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Search size={13} className="text-slate-400" />
                Busca Rápida na Prévia
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ex: Hoya, SKU-102, Miyosmart..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-teal placeholder-slate-400/80"
                />
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Report Choice Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {reportTypes.map((report) => {
              const Icon = report.icon;
              const isSelected = selectedReportId === report.id;
              return (
                <button
                  key={report.id}
                  onClick={() => {
                    setSelectedReportId(report.id);
                  }}
                  className={cn(
                    "relative p-6 text-left rounded-3xl border transition-all cursor-pointer flex flex-col justify-between h-48",
                    isSelected 
                      ? "bg-white border-brand-teal ring-2 ring-teal-500/10 shadow-md" 
                      : "bg-white border-slate-200/60 hover:border-slate-300 hover:shadow-xs"
                  )}
                >
                  <div className="flex items-start justify-between w-full">
                    <div className={cn("p-3.5 rounded-2xl border shrink-0", report.color)}>
                      <Icon size={22} />
                    </div>
                    {isSelected && (
                      <span className="text-[9px] font-black tracking-widest text-brand-teal bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 uppercase animate-pulse">
                        Visível
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight leading-tight mb-1">{report.title}</h3>
                    <p className="text-[11px] text-slate-400 leading-normal line-clamp-2 font-medium">{report.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Interactive Preview Panel */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="p-1 px-2.5 text-[9px] font-black uppercase tracking-widest bg-brand-teal text-white rounded">
                    Pré-visualização Interativa
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    Abaixo você vê exatamente o que será exportado
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-800 mt-1">
                  {reportTypes.find(r => r.id === selectedReportId)?.title}
                </h2>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 self-start sm:self-center">
                <button
                  onClick={() => setChartsVisible(!chartsVisible)}
                  className={cn(
                    "inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all border font-bold text-xs cursor-pointer shadow-sm",
                    chartsVisible 
                      ? "bg-teal-50 border-teal-200 text-brand-teal" 
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  )}
                  title="Alternar exibição de gráficos e painel de análise computacional"
                >
                  {chartsVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{chartsVisible ? 'Ocultar Gráficos' : 'Exibir Gráficos'}</span>
                </button>

                <button
                  onClick={exportToPDF}
                  disabled={filteredPreviewData.length === 0}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-50 hover:bg-red-50 text-slate-700 hover:text-red-650 font-bold text-xs rounded-xl transition-all border border-slate-200 hover:border-red-100 disabled:opacity-40 disabled:hover:text-slate-700 disabled:hover:bg-slate-50 cursor-pointer"
                >
                  <FileDown size={14} className="text-red-500" />
                  <span>PDF de Alta Qualidade</span>
                </button>

                <button
                  onClick={exportToExcel}
                  disabled={filteredPreviewData.length === 0}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-xs rounded-xl transition-all border border-slate-200 hover:border-emerald-100 disabled:opacity-40 disabled:hover:text-slate-700 disabled:hover:bg-slate-50 cursor-pointer"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  <span>Excel Corporativo</span>
                </button>

                <button
                  onClick={exportToCSV}
                  disabled={filteredPreviewData.length === 0}
                  className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-650 font-bold text-xs rounded-xl transition-all border border-slate-200 hover:border-blue-100 disabled:opacity-40 disabled:hover:text-slate-700 disabled:hover:bg-slate-50 cursor-pointer"
                >
                  <FileText size={14} className="text-blue-500" />
                  <span>Planilha CSV (Separador Semicólon)</span>
                </button>
              </div>
            </div>

            {/* Smart Micro KPI Cards Block */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mb-1">Registros Listados</span>
                <span className="text-xl font-extrabold text-slate-800">{stats.totalLines}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Linhas encontradas</span>
              </div>

              {(selectedReportId === 'inventory_current' || selectedReportId === 'inventory_consolidated' || selectedReportId === 'low_stock' || selectedReportId === 'financial_valuation') && (
                <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mb-1">Grade Física (Total Lentes)</span>
                  <span className="text-xl font-extrabold text-slate-800">{stats.totalQuantity} un</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Total de unidades</span>
                </div>
              )}

              {selectedReportId === 'low_stock' && (
                <div className="p-4 bg-amber-50/30 rounded-2xl border border-amber-100">
                  <span className="text-[9px] font-black text-amber-600 block uppercase tracking-widest mb-1">Déficit de Reposição</span>
                  <span className="text-xl font-extrabold text-amber-700">{stats.totalDeficit} un</span>
                  <span className="text-[10px] text-amber-500 block mt-0.5 font-medium">Para atingir estoque mínimo</span>
                </div>
              )}

              {selectedReportId === 'financial_valuation' && (
                <>
                  <div className="p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100">
                    <span className="text-[9px] font-black text-emerald-600 block uppercase tracking-widest mb-1">Capital Total Investido</span>
                    <span className="text-xl font-extrabold text-emerald-700">{formatCurrency(stats.totalValue)}</span>
                    <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">Preço de custo</span>
                  </div>
                  <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 block uppercase tracking-widest mb-1">Custo Médio da Unidade</span>
                    <span className="text-xl font-extrabold text-slate-800">
                      {stats.totalQuantity > 0 ? formatCurrency(stats.totalValue / stats.totalQuantity) : 'R$ 0,00'}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Total valor / unidades</span>
                  </div>
                </>
              )}

              {selectedReportId === 'movements' && (
                <div className="p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100">
                  <span className="text-[9px] font-black text-emerald-600 block uppercase tracking-widest mb-1">Volume de Lances</span>
                  <span className="text-xl font-extrabold text-emerald-700">
                    {filteredPreviewData.reduce((acc, curr) => acc + (curr.quantity || 0), 0)} un
                  </span>
                  <span className="text-[10px] text-emerald-600 block mt-0.5 font-medium">Total em circulação</span>
                </div>
              )}

              {selectedReportId === 'out_of_stock' && (
                <div className="p-4 bg-rose-50/30 rounded-2xl border border-rose-100">
                  <span className="text-[9px] font-black text-rose-600 block uppercase tracking-widest mb-1">Alertas de Ruptura</span>
                  <span className="text-xl font-extrabold text-rose-700">{filteredPreviewData.length} itens</span>
                  <span className="text-[10px] text-rose-500 block mt-0.5 font-medium">Produtos com saldo zerado</span>
                </div>
              )}
            </div>

            {/* Visual Charts Dashboard Section */}
            <div className={cn("space-y-6", (!chartsVisible || filteredPreviewData.length === 0) && "hidden")}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Primary Analytic Chart */}
                <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                      {selectedReportId === 'inventory_current' ? "Estoque por Filial" :
                       selectedReportId === 'inventory_consolidated' ? "Top 10 SKUs por Estoque" :
                       selectedReportId === 'low_stock' ? "Déficit por Filial" :
                       selectedReportId === 'out_of_stock' ? "Rupturas por Filial" :
                       selectedReportId === 'movements' ? "Balanço das Movimentações por Tipo" :
                       selectedReportId === 'financial_valuation' ? "Investimento Total por Filial" :
                       selectedReportId === 'replenishment' ? "Déficit de Reposição Cruzada por Filial" : ""}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mb-4">
                      {selectedReportId === 'inventory_current' ? "Quantidade de lentes físicas em estoque nas filiais." :
                       selectedReportId === 'inventory_consolidated' ? "Códigos de SKU com maiores volumes somados na rede." :
                       selectedReportId === 'low_stock' ? "Quantidades que faltam para atingir estoque mínimo de segurança." :
                       selectedReportId === 'out_of_stock' ? "Casos de estoque zerado agrupados por loja." :
                       selectedReportId === 'movements' ? "Distribuição de movimentações (Entradas, Saídas, Baixas, etc)." :
                       selectedReportId === 'financial_valuation' ? "Divisão financeira do valor total imobilizado do estoque." :
                       selectedReportId === 'replenishment' ? "Déficit acumulado total que necessita de assistência de ressuprimento cruzado." : ""}
                    </p>
                  </div>
                  <div key={`primary_chart_container_${selectedReportId}_${chartData.series1.length}`} className="h-64 w-full">
                    <ResponsiveContainer key={`primary_chart_${selectedReportId}_${chartData.series1.length}`} width="100%" height="100%" debounce={50}>
                      <BarChart data={chartData.series1} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} />
                        <YAxis 
                          stroke="#94a3b8" 
                          fontSize={9} 
                          fontWeight="bold" 
                          tickLine={false}
                          tickFormatter={(value) => selectedReportId === 'financial_valuation' ? `R$${value >= 1000 ? (value/1000).toFixed(0)+'k' : value}` : value}
                        />
                        <ChartTooltip 
                          isAnimationActive={false}
                          formatter={(value: any) => [
                            selectedReportId === 'financial_valuation' ? formatCurrency(Number(value)) : `${value} un`, 
                            selectedReportId === 'movements' ? "Peças" : "Estoque"
                          ]}
                          contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                          {chartData.series1.map((entry, index) => {
                            const COLORS = ['#0d9488', '#0891b2', '#2563eb', '#4f46e5', '#d97706', '#e11d48', '#059669', '#8b5cf6'];
                            return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Secondary Analytic Chart */}
                <div className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                      {selectedReportId === 'movements' ? "Volume Real Movimentado por Filial" : 
                       selectedReportId === 'replenishment' ? "Déficit de Reposição por Fabricante" : "Distribuição por Fabricante"}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mb-4">
                      {selectedReportId === 'movements' ? "Quantidades líquidas movimentadas em cada ponto de venda." : 
                       selectedReportId === 'replenishment' ? "Análise do déficit acumulado agrupado por marca de fabricante." : "Análise analítica de concentração estratégica de fornecedores de lente."}
                    </p>
                  </div>
                  <div key={`secondary_chart_container_${selectedReportId}_${chartData.series2.length}`} className="h-64 w-full flex items-center justify-center">
                    <div className={cn("text-xs text-slate-400 font-bold", chartData.series2.length > 0 && "hidden")}>
                        Sem dados suficientes para gerar gráfico secundário.
                    </div>
                    <div className={cn("w-full h-full", chartData.series2.length === 0 && "hidden")}>
                      <ResponsiveContainer key={`secondary_chart_${selectedReportId}_${chartData.series2.length}`} width="100%" height="100%" debounce={50}>
                        <PieChart>
                          <Pie
                            data={chartData.series2}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            isAnimationActive={false}
                          >
                            {chartData.series2.map((entry, index) => {
                              const COLORS = ['#4f46e5', '#3b82f6', '#0d9488', '#059669', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
                              return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                            })}
                          </Pie>
                          <ChartTooltip 
                            isAnimationActive={false}
                            formatter={(value: any) => [
                              selectedReportId === 'financial_valuation' ? formatCurrency(Number(value)) : `${value} un`, 
                              "Share"
                            ]}
                            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                          />
                          <ChartLegend 
                            iconSize={8}
                            iconType="circle"
                            layout="horizontal"
                            verticalAlign="bottom"
                            align="center"
                            wrapperStyle={{ fontSize: '9px', fontWeight: 'bold', color: '#64748b' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-b border-slate-100 pb-2" />
            </div>

            {/* Family Replenishment Overview Cards */}
            {selectedReportId === 'replenishment' && replenishmentByFamily.length > 0 && (
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Layers size={14} className="text-teal-600" />
                      Ressuprimento Cruzado Detalhado por Família
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Resumo consolidado de necessidades por família de lentes. Clique em um card para isolar ou limpar filtros abaixo.
                    </p>
                  </div>
                  {selectedFamilyId !== 'all' && (
                    <button
                      onClick={() => setSelectedFamilyId('all')}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-teal-600 border border-teal-200 hover:border-teal-300 font-bold text-[10px] rounded-lg transition-all cursor-pointer shadow-xs"
                    >
                      <span>Mostrar Todas as Famílias</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {replenishmentByFamily.map((group) => {
                    const isCurrent = selectedFamilyId === group.familyId;
                    return (
                      <div
                        key={`rep_fam_${group.familyId}`}
                        onClick={() => setSelectedFamilyId(isCurrent ? 'all' : group.familyId)}
                        className={cn(
                          "p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 relative overflow-hidden group select-none",
                          isCurrent
                            ? "bg-teal-50/60 border-teal-300 shadow-sm ring-1 ring-teal-300"
                            : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs hover:bg-slate-50/20"
                        )}
                      >
                        {isCurrent && (
                          <div className="absolute top-0 right-0 bg-teal-500 text-white text-[8px] font-black tracking-widest px-2 py-0.5 rounded-bl-lg uppercase">
                            Ativo
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                              {group.manufacturer}
                            </span>
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.2 rounded">
                              {group.treatment}
                            </span>
                          </div>
                          <h4 className="text-xs font-black text-slate-800 tracking-tight leading-snug mt-1 group-hover:text-teal-600 transition-colors">
                            {group.line}
                          </h4>
                        </div>

                        <div className="border-t border-dashed border-slate-100 pt-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Necessidade</span>
                            <span className={cn(
                              "text-sm font-extrabold",
                              isCurrent ? "text-teal-600" : "text-slate-800"
                            )}>
                              {group.totalDeficitQty} un
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">SKUs afetados</span>
                            <span className="text-xs font-extrabold text-slate-600">
                              {group.defectItemsCount} SKUs
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded-md border",
                            group.itemsWithDonors > 0
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                              : "bg-slate-100 border-slate-200 text-slate-400"
                          )}>
                            {group.itemsWithDonors} un c/ doador
                          </span>
                          {group.itemsWithoutDonors > 0 && (
                            <span className="text-[9px] bg-amber-50 border border-amber-100 text-amber-600 font-bold px-1.5 py-0.5 rounded-md">
                              {group.itemsWithoutDonors} un s/ doador
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview Data Grid table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-150">
              {filteredPreviewData.length === 0 ? (
                <div className="text-center py-20 bg-slate-50/40">
                  <CheckCircle2 size={40} className="text-brand-teal/70 mx-auto mb-3" />
                  <h3 className="text-sm font-extrabold text-slate-700">Nenhum dado encontrado</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Não existem registros correspondentes a esses critérios de filtragem de filial, datas ou termo de busca.
                  </p>
                </div>
              ) : (
                <table key={selectedReportId} className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr key={`header_${selectedReportId}`} className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {selectedReportId === 'inventory_current' && (
                        <>
                          <th className="py-3 px-4">Filial</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Esf (SPH)</th>
                          <th className="py-3 px-4">Cil (CYL)</th>
                          <th className="py-3 px-4 text-center">Qtd Atual</th>
                          <th className="py-3 px-4 text-right">Última Modificação</th>
                        </>
                      )}
                      {selectedReportId === 'inventory_consolidated' && (
                        <>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4">Esf (SPH)</th>
                          <th className="py-3 px-4">Cil (CYL)</th>
                          <th className="py-3 px-4 text-center">Total em Rede</th>
                          <th className="py-3 px-4 text-center">Num Lojas</th>
                          <th className="py-3 px-4 text-right">Filiais Abastecidas</th>
                        </>
                      )}
                      {selectedReportId === 'low_stock' && (
                        <>
                          <th className="py-3 px-4">Filial</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4 text-center">Estoque Atual</th>
                          <th className="py-3 px-4 text-center">Estoque Mínimo</th>
                          <th className="py-3 px-4 text-right text-rose-600">Qtd Faltante (Déficit)</th>
                        </>
                      )}
                      {selectedReportId === 'out_of_stock' && (
                        <>
                          <th className="py-3 px-4">Filial</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4">Esf (SPH)</th>
                          <th className="py-3 px-4">Cil (CYL)</th>
                          <th className="py-3 px-4 text-center">Estoque</th>
                          <th className="py-3 px-4 text-right">Última Modificação</th>
                        </>
                      )}
                      {selectedReportId === 'movements' && (
                        <>
                          <th className="py-3 px-4">Data e Hora</th>
                          <th className="py-3 px-4">Filial</th>
                          <th className="py-3 px-4">Tipo</th>
                          <th className="py-3 px-4 text-center">Qtd</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4 text-right">Motivo / Operador</th>
                        </>
                      )}
                      {selectedReportId === 'financial_valuation' && (
                        <>
                          <th className="py-3 px-4">Filial</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4">Modelo / Linha</th>
                          <th className="py-3 px-4 text-center">Qtd</th>
                          <th className="py-3 px-4 text-right">Custo Un. (Fabricante)</th>
                          <th className="py-3 px-4 text-right">Total Financeiro</th>
                          <th className="py-3 px-4 text-right">Última Atualização</th>
                        </>
                      )}
                      {selectedReportId === 'replenishment' && (
                        <>
                          <th className="py-3 px-4">Filial Recetora</th>
                          <th className="py-3 px-4">SKU</th>
                          <th className="py-3 px-4">Fabricante</th>
                          <th className="py-3 px-4 text-center">Esf / Cil</th>
                          <th className="py-3 px-4 text-center">Físico / Mín</th>
                          <th className="py-3 px-4 text-center text-rose-600 font-bold">Déficit</th>
                          <th className="py-3 px-4 text-left">Sugestão de Ressuprimento Cruzado</th>
                          <th className="py-3 px-4 text-right">Outros Doadores em Potencial</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-600 font-medium">
                    {filteredPreviewData.map((row, index) => (
                      <tr key={`${selectedReportId}_${row.id || index}`} className="hover:bg-slate-50/50 transition-all font-semibold">
                        {selectedReportId === 'inventory_current' && (
                          <>
                            <td className="py-3 px-4">{row.branch_name}</td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.manufacturer}</td>
                            <td className="py-3 px-4">{row.line}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-slate-100 text-[10px] text-slate-700 rounded px-1.5 py-0.5 border border-slate-200">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4">{formatRefraction(row.spherical)}</td>
                            <td className="py-3 px-4">{formatCylinder(row.cylindrical)}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded font-black",
                                row.quantity === 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-850"
                              )}>
                                {row.quantity}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-400 text-[11px]">{row.formatted_date}</td>
                          </>
                        )}

                        {selectedReportId === 'inventory_consolidated' && (
                          <>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-slate-100 text-[10px] text-slate-700 rounded px-1.5 py-0.5 border border-slate-200">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.manufacturer}</td>
                            <td className="py-3 px-4">{row.line}</td>
                            <td className="py-3 px-4">{formatRefraction(row.spherical)}</td>
                            <td className="py-3 px-4">{formatCylinder(row.cylindrical)}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="bg-blue-50 text-blue-700 font-extrabold px-2.5 py-1 rounded border border-blue-100">
                                {row.total_quantity} un
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold">{row.branches_count}</td>
                            <td className="py-3 px-4 text-right text-slate-400 truncate max-w-xs">{row.branches_stocked}</td>
                          </>
                        )}

                        {selectedReportId === 'low_stock' && (
                          <>
                            <td className="py-3 px-4">{row.branch_name}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-slate-100 text-[10px] text-slate-700 rounded px-1.5 py-0.5 border border-slate-200">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.manufacturer}</td>
                            <td className="py-3 px-4">{row.line}</td>
                            <td className="py-3 px-4 text-center font-black text-rose-600 bg-rose-50/50">{row.quantity}</td>
                            <td className="py-3 px-4 text-center font-bold text-slate-500">{row.min_stock}</td>
                            <td className="py-3 px-4 text-right font-black text-rose-700">-{row.deficit} un</td>
                          </>
                        )}

                        {selectedReportId === 'out_of_stock' && (
                          <>
                            <td className="py-3 px-4">{row.branch_name}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-rose-50 text-[10px] text-rose-700 rounded px-1.5 py-0.5 border border-rose-100 font-bold">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.manufacturer}</td>
                            <td className="py-3 px-4">{row.line}</td>
                            <td className="py-3 px-4">{formatRefraction(row.spherical)}</td>
                            <td className="py-3 px-4">{formatCylinder(row.cylindrical)}</td>
                            <td className="py-3 px-4 text-center">
                              <span className="px-2 py-0.5 rounded font-black text-slate-300 bg-slate-100">
                                ZERADO
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-400 text-[11px]">{row.formatted_date}</td>
                          </>
                        )}

                        {selectedReportId === 'movements' && (
                          <>
                            <td className="py-3 px-4 text-[11px] text-slate-400">{row.formatted_date}</td>
                            <td className="py-3 px-4">{row.branch_name}</td>
                            <td className="py-3 px-4">
                              <span className={cn(
                                "px-2.5 py-0.5 rounded border text-[10px] font-bold inline-block",
                                translateMovType(row.type).color
                              )}>
                                {translateMovType(row.type).label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-black text-slate-800">{row.quantity}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-slate-100 text-[10px] text-slate-700 rounded px-1.5 py-0.5 border border-slate-250 font-bold">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-750">{row.manufacturer}</td>
                            <td className="py-3 px-4 text-slate-500">{row.line}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex flex-col">
                                <span className="text-slate-700 truncate max-w-xxs" title={row.reason}>{row.reason}</span>
                                {row.user_id && <span className="text-[9px] text-slate-400 italic">ID: {row.user_id.substring(0, 8)}...</span>}
                              </div>
                            </td>
                          </>
                        )}

                        {selectedReportId === 'financial_valuation' && (
                          <>
                            <td className="py-3 px-4">{row.branch_name}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-slate-100 text-[10px] text-slate-700 rounded px-1.5 py-0.5 border border-slate-200">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.manufacturer}</td>
                            <td className="py-3 px-4">{row.line}</td>
                            <td className="py-3 px-4 text-center font-bold">{row.quantity}</td>
                            <td className="py-3 px-4 text-right text-slate-500 font-mono font-bold">{formatCurrency(row.unit_cost)}</td>
                            <td className="py-3 px-4 text-right text-brand-teal font-mono font-black">{formatCurrency(row.total_valuation)}</td>
                            <td className="py-3 px-4 text-right text-slate-400 text-[11px]">{row.formatted_date}</td>
                          </>
                        )}

                        {selectedReportId === 'replenishment' && (
                          <>
                            <td className="py-3 px-4 font-bold text-slate-800">{row.branch_name}</td>
                            <td className="py-3 px-4">
                              <span className="font-mono bg-amber-50 text-[10px] text-amber-700 rounded px-1.5 py-0.5 border border-amber-200 font-extrabold">
                                {row.sku_code}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col">
                                <span className="font-extrabold text-slate-800 text-xs">{row.manufacturer}</span>
                                <span className="text-[10px] text-slate-400 font-medium">{row.line}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold">
                              {formatRefraction(row.spherical)} / {formatCylinder(row.cylindrical)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200">
                                {row.quantity} / {row.min_stock}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="text-rose-700 font-black bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full inline-block animate-pulse">
                                -{row.deficit}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-left">
                              <span className={cn(
                                "inline-block text-[11px] font-bold px-2 py-1 rounded border",
                                row.donors?.length > 0
                                  ? "bg-teal-50 text-teal-800 border-teal-200"
                                  : "bg-rose-50/55 text-rose-700 border-rose-100"
                              )}>
                                🔄 {row.best_recommendation}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex flex-wrap gap-1 justify-end max-w-xs ml-auto">
                                {row.donors && row.donors.length > 0 ? (
                                  row.donors.map((d: any) => (
                                    <span 
                                      key={d.branch_id} 
                                      className={cn(
                                        "inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border leading-tight",
                                        d.is_surplus_donor 
                                          ? "bg-teal-50 text-teal-800 border-teal-200 font-extrabold" 
                                          : "bg-slate-50 text-slate-400 border-slate-200 font-medium"
                                      )}
                                      title={`Quantidade: ${d.quantity} | Mínimo: ${d.min_stock} | Excedente: ${d.surplus}`}
                                    >
                                      {d.branch_name}: <b className="ml-1 text-[11px]">{d.quantity}</b>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-300 italic text-[11px]">Nenhum doador na rede</span>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Advisory section */}
      <div className="bg-slate-50 border border-slate-150 p-6 rounded-3xl relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-sm font-black text-slate-800 mb-1">Dica de Exportação Corporativa 💡</h3>
          <p className="text-xs text-slate-500 leading-normal font-medium max-w-4xl">
            As planilhas geradas em <strong>Excel</strong> e <strong>CSV</strong> são formatadas seguindo o padrão nacional com codificação UTF-8 e delimitador de ponto e vírgula, prontas para importar em ERPs ou softwares de contabilidade. 
            O relatório de <strong>PDF de Alta Qualidade</strong> foi estruturado especificamente em folha de orientação paisagem (A4) para assegurar o correto espaçamento de colunas sem perda de dados na dobra física de impressão.
          </p>
        </div>
      </div>
    </div>
  );
}
