import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Package, 
  AlertTriangle, 
  DollarSign, 
  ArrowLeftRight,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { formatCurrency, cn } from '@/src/lib/utils';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Branch, LensFamily, LensSku, InventoryItem } from '@/src/types';

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalSkus: 0,
    criticalItems: 0,
    totalValue: 0,
    pendingTransfers: 0,
    recentEntryCount: 0,
    recentExitCount: 0
  });

  const [loading, setLoading] = useState(true);
  const [branchStockData, setBranchStockData] = useState<any[]>([]);
  const [materialData, setMaterialData] = useState<any[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  
  const isAdmin = profile?.role === 'admin';
  const COLORS = ['#0F766E', '#164E63', '#10B981', '#3B82F6', '#F59E0B', '#EF4444'];

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Fetch all required collections
      const [branchesSnap, familiesSnap, skusSnap, inventorySnap, transfersSnap, movementsSnap] = await Promise.all([
        getDocs(collection(db, 'branches')),
        getDocs(collection(db, 'lensFamilies')),
        getDocs(collection(db, 'lensSkus')),
        getDocs(collection(db, 'inventory')),
        getDocs(query(collection(db, 'transfers'), where('status', '==', 'pending'))),
        getDocs(query(collection(db, 'movements'))) // Fetching movements for recent stats
      ]);

      const branches = branchesSnap.docs.reduce((acc, doc) => ({ ...acc, [doc.id]: doc.data() }), {} as Record<string, any>);
      const families = familiesSnap.docs.reduce((acc, doc) => ({ ...acc, [doc.id]: { id: doc.id, ...doc.data() } }), {} as Record<string, any>);
      const skus = skusSnap.docs.reduce((acc, doc) => ({ ...acc, [doc.id]: { id: doc.id, ...doc.data() } }), {} as Record<string, any>);
      const inventory = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const pendingTransfersCount = transfersSnap.size;

      // 2. Movement Analytics
      const movements = movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
        .sort((a, b) => {
          const dateA = a.created_at?.toMillis?.() || new Date(a.created_at).getTime() || 0;
          const dateB = b.created_at?.toMillis?.() || new Date(b.created_at).getTime() || 0;
          return dateB - dateA;
        });

      const recentEntryCount = movements.filter(m => m.type === 'entry').length;
      const recentExitCount = movements.filter(m => m.type === 'exit').length;

      // 3. Current Stock Calculations
      let totalValue = 0;
      let criticalCount = 0;
      const branchTotals: Record<string, number> = {};
      const materialTotals: Record<string, number> = {};
      const alerts: any[] = [];

      inventory.forEach(item => {
        const sku = skus[item.sku_id];
        const family = sku ? families[sku.family_id] : null;
        const branch = branches[item.branch_id];

        if (sku && family) {
          // Total Value
          totalValue += (item.quantity * (family.cost_price || 0));

          // Critical Items
          if (item.quantity <= (family.min_stock_per_sku || 0)) {
            criticalCount++;
            if (alerts.length < 5) {
              alerts.push({
                product: `${family.manufacturer} ${family.line} ${sku.sku_code}`,
                branch: branch?.name || 'Desconhecida',
                qty: item.quantity,
                min: family.min_stock_per_sku
              });
            }
          }

          // Branch Stock Totals
          const branchName = branch?.name || 'Outras';
          branchTotals[branchName] = (branchTotals[branchName] || 0) + item.quantity;

          // Material Distribution
          const materialName = family.material || 'N/A';
          materialTotals[materialName] = (materialTotals[materialName] || 0) + item.quantity;
        }
      });

      // 4. Format Chart Data
      const formattedBranchData = Object.entries(branchTotals).map(([name, stock]) => ({ name, stock }));
      const formattedMaterialData = Object.entries(materialTotals).map(([name, value]) => ({ name, value }));

      setStats({
        totalSkus: skusSnap.size,
        criticalItems: criticalCount,
        totalValue,
        pendingTransfers: pendingTransfersCount,
        recentEntryCount,
        recentExitCount
      });
      setBranchStockData(formattedBranchData);
      setMaterialData(formattedMaterialData);
      setCriticalAlerts(alerts);
      setRecentMovements(movements.slice(0, 10).map(m => ({
        ...m,
        sku: skus[m.sku_id],
        branch: branches[m.branch_id]
      })));

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, trend }: any) => (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between"
    >
      <div>
        <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      </div>
      <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
        <Icon size={24} className={color.replace('bg-', 'text-')} />
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-teal"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Visão Geral</h1>
          <p className="text-slate-400 mt-1">Dados reais consolidados de toda a sua rede.</p>
        </div>
      </div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-2 grid grid-cols-2 gap-6">
          <StatCard 
            title="Entradas (Total)" 
            value={stats.recentEntryCount} 
            icon={TrendingUp} 
            color="bg-emerald-500" 
          />
          <StatCard 
            title="Saídas (Total)" 
            value={stats.recentExitCount} 
            icon={TrendingDown} 
            color="bg-red-500" 
          />
        </div>
        <StatCard 
          title="Itens Críticos" 
          value={stats.criticalItems} 
          icon={AlertTriangle} 
          color="bg-amber-500" 
        />
        {isAdmin ? (
          <StatCard 
            title="Valor Total" 
            value={formatCurrency(stats.totalValue)} 
            icon={DollarSign} 
            color="bg-blue-500" 
          />
        ) : (
          <StatCard 
            title="Transf. Pendentes" 
            value={stats.pendingTransfers} 
            icon={ArrowLeftRight} 
            color="bg-blue-500" 
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Stock Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-800">Estoque por Filial</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchStockData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="stock" radius={[6, 6, 0, 0]} barSize={40}>
                  {branchStockData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories Distribution */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-8">Material</h3>
          <div className="h-[250px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={materialData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {materialData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {materialData.map((item, index) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full mr-2" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                  <span className="text-xs text-slate-500">{item.name}</span>
                </div>
                <span className="text-xs font-bold text-slate-700">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Movements */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Movimentações Recentes</h3>
            <button className="text-xs font-bold text-brand-teal hover:underline flex items-center">
              Ver tudo <ChevronRight size={14} className="ml-1" />
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {recentMovements.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p>Nenhuma movimentação registrada.</p>
              </div>
            ) : (
              recentMovements.map((mov) => (
                <div key={mov.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white",
                      mov.type === 'entry' ? "bg-emerald-500" : "bg-red-500"
                    )}>
                      {mov.type === 'entry' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{mov.sku?.sku_code || 'SKU Desconhecido'}</p>
                      <p className="text-[10px] text-slate-400">
                        {mov.branch?.name} • {mov.reason}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold",
                      mov.type === 'entry' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {mov.type === 'entry' ? '+' : '-'}{mov.quantity}
                    </p>
                    <p className="text-[9px] text-slate-300">
                      {mov.created_at 
                        ? (mov.created_at.toDate 
                            ? mov.created_at.toDate().toLocaleString('pt-BR') 
                            : (mov.created_at.seconds 
                                ? new Date(mov.created_at.seconds * 1000).toLocaleString('pt-BR') 
                                : new Date(mov.created_at).toLocaleString('pt-BR'))) 
                        : '---'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Alerts */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-800">Alertas de Estoque</h3>
            <span className="text-xs font-bold text-red-500 uppercase">Crítico</span>
          </div>
          <div className="divide-y divide-slate-50">
            {criticalAlerts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p>Nenhum alerta crítico.</p>
              </div>
            ) : (
              criticalAlerts.map((alert, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{alert.product}</p>
                      <p className="text-[10px] text-slate-400">{alert.branch} • Est: <span className="text-red-500">{alert.qty}</span> / Mín: {alert.min}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
