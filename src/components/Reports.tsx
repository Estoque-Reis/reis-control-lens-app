import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  FileSpreadsheet, 
  BarChart3, 
  PieChart as PieIcon,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  ShoppingCart,
  Loader2,
  ArrowLeftRight,
  Truck,
  RefreshCw,
  Search,
  X,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [simulatorData, setSimulatorData] = useState<any[]>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [filterRupturesOnly, setFilterRupturesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const reportTypes = [
    { 
      id: 'inventory_current', 
      title: 'Estoque Atual por Filial', 
      desc: 'Lista consolidada de todos os produtos disponíveis em cada loja.',
      icon: BarChart3,
      color: 'bg-blue-500'
    },
    { 
      id: 'low_stock', 
      title: 'Itens Abaixo do Mínimo', 
      desc: 'Relatório crítico de reposição para evitar ruptura de estoque.',
      icon: AlertCircle,
      color: 'bg-red-500'
    },
    { 
      id: 'purchase_suggestions', 
      title: 'Sugestões de Compra', 
      desc: 'Sugestões automáticas baseadas em estoque mínimo e giro.',
      icon: ShoppingCart,
      color: 'bg-purple-500'
    },
    { 
      id: 'interbranch_replenishments', 
      title: 'Ressuprimento Inter-Filiais', 
      desc: 'Sugere transferências estratégicas de lojas com estoque excedente para suprir ruptura de outras.',
      icon: ArrowLeftRight,
      color: 'bg-teal-500'
    },
    { 
      id: 'movements', 
      title: 'Movimentações do Período', 
      desc: 'Histórico detalhado de entradas, saídas e transferências.',
      icon: TrendingUp,
      color: 'bg-emerald-500'
    }
  ];

  const fetchFullInventoryData = async () => {
    const [invSnap, skus, families, branches] = await Promise.all([
      getDocs(collection(db, 'inventory')),
      getCachedSkus(),
      getCachedFamilies(),
      getCachedBranches()
    ]);

    const items = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    // Build maps for fast O(1) in-memory lookup
    const skusMap = new Map<string, any>(skus.map(s => [s.id, s]));
    const familiesMap = new Map<string, any>(families.map(f => [f.id, f]));
    const branchesMap = new Map<string, any>(branches.map(b => [b.id, b]));
    
    const data = [];
    for (const item of items) {
      const sku = skusMap.get(item.sku_id);
      if (sku) {
        const family = familiesMap.get(sku.family_id);
        const branch = branchesMap.get(item.branch_id);
        
        data.push({
          sku_code: sku.sku_code,
          manufacturer: family ? family.manufacturer : 'N/A',
          line: family ? family.line : 'N/A',
          quantity: item.quantity,
          min_stock: family ? family.min_stock_per_sku : 0,
          branch: branch ? branch.name : item.branch_id
        });
      }
    }
    return data;
  };

  const fetchInterBranchReplenishmentData = async () => {
    const [invSnap, skus, families, branches] = await Promise.all([
      getDocs(collection(db, 'inventory')),
      getCachedSkus(),
      getCachedFamilies(),
      getCachedBranches()
    ]);

    const items = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    const skusMap = new Map<string, any>(skus.map(s => [s.id, s]));
    const familiesMap = new Map<string, any>(families.map(f => [f.id, f]));
    const branchesMap = new Map<string, any>(branches.map(b => [b.id, b]));

    // Construct Stock Matrix: stockMatrix[sku_id][branch_id] = quantity
    const stockMatrix: Record<string, Record<string, number>> = {};
    for (const item of items) {
      if (!stockMatrix[item.sku_id]) {
        stockMatrix[item.sku_id] = {};
      }
      stockMatrix[item.sku_id][item.branch_id] = item.quantity;
    }

    const suggestions: any[] = [];

    // Loop through each SKU
    for (const sku of skus) {
      const family = familiesMap.get(sku.family_id);
      const minStock = family ? family.min_stock_per_sku : 0;
      if (minStock <= 0) continue;

      const skusWithStock = stockMatrix[sku.id] || {};

      const deficits: { branchId: string; branchName: string; needed: number; originalQty: number }[] = [];
      const surpluses: { branchId: string; branchName: string; available: number; originalQty: number }[] = [];

      for (const branch of branches) {
        if (branch.status === 'inactive') continue;
        const currentQty = skusWithStock[branch.id] || 0;
        const diff = currentQty - minStock;

        if (diff < 0) {
          deficits.push({
            branchId: branch.id,
            branchName: branch.name,
            needed: Math.abs(diff),
            originalQty: currentQty
          });
        } else if (diff > 0) {
          surpluses.push({
            branchId: branch.id,
            branchName: branch.name,
            available: diff,
            originalQty: currentQty
          });
        }
      }

      // Pair them up
      deficits.sort((a, b) => b.needed - a.needed);
      surpluses.sort((a, b) => b.available - a.available);

      let dIdx = 0;
      let sIdx = 0;

      while (dIdx < deficits.length && sIdx < surpluses.length) {
        const d = deficits[dIdx];
        const s = surpluses[sIdx];

        const transferQty = Math.min(d.needed, s.available);
        if (transferQty > 0) {
          suggestions.push({
            sku_id: sku.id,
            sku_code: sku.sku_code,
            manufacturer: family ? family.manufacturer : 'N/A',
            line: family ? family.line : 'N/A',
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            origin_branch_id: s.branchId,
            origin_branch_name: s.branchName,
            origin_stock: s.originalQty,
            destination_branch_id: d.branchId,
            destination_branch_name: d.branchName,
            destination_stock: d.originalQty,
            min_stock: minStock,
            transfer_qty: transferQty,
            is_absolute_rupture: d.originalQty === 0
          });

          d.needed -= transferQty;
          s.available -= transferQty;
        }

        if (d.needed === 0) dIdx++;
        if (s.available === 0) sIdx++;
      }
    }

    return suggestions;
  };

  const handleLoadSimulator = async () => {
    setSimLoading(true);
    try {
      const data = await fetchInterBranchReplenishmentData();
      setSimulatorData(data);
      setShowSimulator(true);
      // Wait a short delay and scroll into view
      setTimeout(() => {
        const element = document.getElementById('interbranch-simulator-panel');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } catch (err) {
      console.error("Erro ao simular ressuprimento:", err);
      alert("Erro ao calcular rota de ressuprimento.");
    } finally {
      setSimLoading(false);
    }
  };

  const handleGenerateReport = async (type: string, format: 'pdf' | 'excel') => {
    setLoading(true);
    try {
      let title = reportTypes.find(r => r.id === type)?.title || 'Relatório';

      if (type === 'interbranch_replenishments') {
        const repData = await fetchInterBranchReplenishmentData();
        if (format === 'pdf') {
          const docPDF = new jsPDF();
          docPDF.text(`Controle de Lentes Reis - ${title}`, 14, 15);
          docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 25);
          
          const head = [['SKU', 'Fabricante', 'Origem (Excedente)', 'Destino (Ruptura)', 'Quantidade Sugerida', 'Status Destino']];
          const body = repData.map(i => [
            i.sku_code,
            `${i.manufacturer} ${i.line}`,
            `${i.origin_branch_name} (Estoque: ${i.origin_stock})`,
            `${i.destination_branch_name} (Estoque: ${i.destination_stock})`,
            i.transfer_qty,
            i.is_absolute_rupture ? 'Ruptura Total (Estoque 0)' : 'Abaixo do Mínimo'
          ]);

          autoTable(docPDF, { startY: 35, head, body });
          docPDF.save(`${title.toLowerCase().replace(/ /g, '_')}.pdf`);
        } else {
          const excelData = repData.map(i => ({
            'SKU': i.sku_code,
            'Fabricante': i.manufacturer,
            'Linha': i.line,
            'Filial Origem': i.origin_branch_name,
            'Estoque Origem': i.origin_stock,
            'Filial Destino': i.destination_branch_name,
            'Estoque Destino': i.destination_stock,
            'Mínimo por Loja': i.min_stock,
            'Quantidade a Transferir': i.transfer_qty,
            'Situação Destino': i.is_absolute_rupture ? 'Ruptura Total (Estoque 0)' : 'Abaixo do Mínimo'
          }));
          const ws = XLSX.utils.json_to_sheet(excelData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, title);
          XLSX.writeFile(wb, `${title.toLowerCase().replace(/ /g, '_')}.xlsx`);
        }
        return;
      }

      let data = await fetchFullInventoryData();

      if (type === 'low_stock' || type === 'purchase_suggestions') {
        data = data.filter(item => item.quantity < item.min_stock);
        if (type === 'purchase_suggestions') {
          data = data.map(item => ({
            ...item,
            suggestion: item.min_stock - item.quantity
          }));
        }
      }

      if (format === 'pdf') {
        const docPDF = new jsPDF();
        docPDF.text(`Controle de Lentes Reis - ${title}`, 14, 15);
        docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 25);
        
        const head = type === 'purchase_suggestions' 
          ? [['SKU', 'Fabricante', 'Filial', 'Estoque', 'Mínimo', 'Sugestão Compra']]
          : [['SKU', 'Fabricante', 'Filial', 'Estoque', 'Mínimo']];
        
        const body = data.map(i => {
          const row = [i.sku_code, i.manufacturer, i.branch, i.quantity, i.min_stock];
          if (type === 'purchase_suggestions') row.push(i.suggestion);
          return row;
        });

        autoTable(docPDF, { startY: 35, head, body });
        docPDF.save(`${title.toLowerCase().replace(/ /g, '_')}.pdf`);
      } else {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, title);
        XLSX.writeFile(wb, `${title.toLowerCase().replace(/ /g, '_')}.xlsx`);
      }
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      alert("Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  const filteredSimData = simulatorData.filter(item => {
    const s = searchQuery.toLowerCase();
    const matchesSearch = 
      String(item?.sku_code || '').toLowerCase().includes(s) ||
      String(item?.origin_branch_name || '').toLowerCase().includes(s) ||
      String(item?.destination_branch_name || '').toLowerCase().includes(s) ||
      String(item?.manufacturer || '').toLowerCase().includes(s) ||
      String(item?.line || '').toLowerCase().includes(s);

    const matchesRupture = !filterRupturesOnly || item.is_absolute_rupture;

    return matchesSearch && matchesRupture;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Relatórios e Exportações</h1>
        <p className="text-slate-400 mt-1">Gere documentos detalhados sobre a operação da sua rede.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportTypes.map((report) => (
          <motion.div 
            key={report.id}
            whileHover={{ y: -5 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between"
          >
            <div className="flex items-start space-x-4">
              <div className={`p-4 rounded-2xl shrink-0 ${report.color} bg-opacity-10 text-${report.color.replace('bg-', '')}`}>
                <report.icon size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-800 truncate">{report.title}</h3>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed line-clamp-2">{report.desc}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-2">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => handleGenerateReport(report.id, 'pdf')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center px-4 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-red-100 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Download size={14} className="mr-2" />} PDF
                </button>
                <button 
                  onClick={() => handleGenerateReport(report.id, 'excel')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center px-4 py-2.5 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded-xl text-xs font-bold transition-all border border-transparent hover:border-emerald-100 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : <FileSpreadsheet size={14} className="mr-2" />} EXCEL
                </button>
              </div>

              {report.id === 'interbranch_replenishments' && (
                <button
                  onClick={() => handleLoadSimulator()}
                  disabled={simLoading}
                  className="mt-1 w-full flex items-center justify-center px-4 py-2.5 bg-brand-teal text-white hover:bg-brand-teal/90 rounded-xl text-xs font-black transition-all border border-transparent shadow-md shadow-brand-teal/10"
                >
                  {simLoading ? <Loader2 size={14} className="animate-spin mr-2" /> : <Truck size={14} className="mr-2" />} SIMULAR NO PAINEL
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Simulator Panel Section */}
      {showSimulator && (
        <motion.div 
          id="interbranch-simulator-panel"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 shadow-md border border-slate-100 space-y-6"
        >
          <div className="flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-teal-50 text-brand-teal rounded-lg">
                  <Truck size={20} />
                </span>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  Simulador de Ressuprimento Inteligente Inter-Filiais
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Sugestões automatizadas de transferência de produtos excedentes para abastecer lojas com estoque abaixo do mínimo ou em ruptura total.
              </p>
            </div>
            <button 
              onClick={() => setShowSimulator(false)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer shrink-0"
              title="Fechar Simulador"
            >
              <X size={20} />
            </button>
          </div>

          {/* KPI Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100/50">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Total de Oportunidades</span>
              <span className="text-2xl font-black text-slate-800 mt-1 block">
                {filteredSimData.length}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Rotas de transferências sugeridas</span>
            </div>
            <div className="bg-emerald-50/10 p-4 rounded-2xl border border-emerald-100/30">
              <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider">Lentes a Transferir</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">
                {filteredSimData.reduce((acc, curr) => acc + curr.transfer_qty, 0)} un
              </span>
              <span className="text-[10px] text-emerald-600/80 block mt-0.5">Giro estratégico de excedentes</span>
            </div>
            <div className="bg-rose-50/40 p-4 rounded-2xl border border-rose-100/30">
              <span className="text-[10px] font-bold text-rose-600 block uppercase tracking-wider">Rupturas Críticas Evitadas</span>
              <span className="text-2xl font-black text-rose-700 mt-1 block">
                {filteredSimData.filter(d => d.is_absolute_rupture).length}
              </span>
              <span className="text-[10px] text-rose-600/80 block mt-0.5">Produtos zerados que receberão abastecimento</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between bg-slate-50/40 p-3 rounded-2xl border border-slate-100/50">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar por SKU ou Filial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition-all"
              />
            </div>

            {/* Ruptures Only Filter */}
            <label className="flex items-center gap-2 cursor-pointer select-none py-1 px-3 bg-white rounded-xl border border-slate-200 hover:border-brand-teal/50 transition-all w-full sm:w-auto">
              <input 
                type="checkbox"
                checked={filterRupturesOnly}
                onChange={(e) => setFilterRupturesOnly(e.target.checked)}
                className="rounded border-slate-300 text-brand-teal focus:ring-brand-teal text-xs w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-600">Apenas Destino em Ruptura Total (Estoque 0)</span>
            </label>
          </div>

          {/* Table */}
          {filteredSimData.length === 0 ? (
            <div className="text-center py-12 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Tudo Balanceado!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Não foram encontradas rotas de ressuprimento correspondentes aos critérios de filtro.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-3 px-4">Lente / SKU</th>
                    <th className="py-3 px-4">Fabricante / Linha</th>
                    <th className="py-3 px-4">Filial de Origem (Excedente)</th>
                    <th className="py-3 px-4 text-center">Transferência</th>
                    <th className="py-3 px-4">Filial de Destino (Necessitada)</th>
                    <th className="py-3 px-4 text-right">Ação Recomendada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSimData.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 transition-all text-xs">
                      <td className="py-4 px-4">
                        <span className="font-mono font-black text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                          {item.sku_code}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-500">
                        {item.manufacturer} • <span className="text-slate-700 text-xs font-bold">{item.line}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{item.origin_branch_name}</span>
                          <span className="text-[10px] text-slate-400">
                            Estoque Atual: <strong className="text-slate-600">{item.origin_stock}</strong> (Mín: {item.min_stock})
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-extrabold px-3 py-1.5 rounded-full border border-emerald-100 shadow-sm">
                          <ArrowLeftRight size={12} />
                          <span>{item.transfer_qty} un</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{item.destination_branch_name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-400">
                              Estoque Atual: <strong className="text-slate-600">{item.destination_stock}</strong> (Mín: {item.min_stock})
                            </span>
                            {item.is_absolute_rupture ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-rose-100 text-rose-600 rounded uppercase tracking-wider animate-pulse">
                                Ruptura Total
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-600 rounded uppercase tracking-wider">
                                Crítico
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="text-[10px] text-slate-400 italic block">
                          Efetuar envio no menu "Transferências"
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      <div className="bg-brand-cyan p-8 rounded-3xl text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-md">
            <h3 className="text-xl font-bold mb-2">Precisa de um relatório personalizado?</h3>
            <p className="text-cyan-100 text-sm">
              Nossa inteligência artificial pode cruzar dados de giro de estoque por região para sugerir compras mais assertivas.
            </p>
          </div>
          <button className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 rounded-full font-bold text-sm transition-all shadow-xl shadow-emerald-500/20">
            Falar com Consultor Reis
          </button>
        </div>
        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/5 rounded-full" />
      </div>
    </div>
  );
}
