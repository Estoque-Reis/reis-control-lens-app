import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Download, 
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  DollarSign,
  AlertCircle,
  Briefcase,
  Store,
  Compass,
  CheckCircle,
  Layers,
  Sparkles,
  Printer,
  FileText
} from 'lucide-react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus, clearCache } from '@/src/lib/firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { Branch, LensFamily, LensSku } from '@/src/types';
import { cn, formatRefraction, formatCurrency } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function PurchaseSuggestions() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [families, setFamilies] = useState<LensFamily[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  // Filters
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Checkout simulation modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderedSuccess, setOrderedSuccess] = useState(false);
  const [restockingSim, setRestockingSim] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [branchesData, familiesData, skusData, inventorySnap] = await Promise.all([
        getCachedBranches(),
        getCachedFamilies(),
        getCachedSkus(),
        getDocs(collection(db, 'inventory'))
      ]);

      const activeBranches = branchesData.filter(b => b.status === 'active');
      setBranches(activeBranches);
      setFamilies(familiesData);
      setSkus(skusData);

      const items = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setInventoryList(items);

      buildSuggestionsList(items, skusData, familiesData, activeBranches);
    } catch (err) {
      console.error('Erro ao calcular sugestões de compra:', err);
    } finally {
      setLoading(false);
    }
  };

  const buildSuggestionsList = (
    inv: any[], 
    allSkus: any[], 
    allFamilies: any[], 
    allBranches: any[]
  ) => {
    const skusMap = new Map<string, any>(allSkus.map(s => [s.id, s]));
    const familiesMap = new Map<string, any>(allFamilies.map(f => [f.id, f]));
    const branchesMap = new Map<string, any>(allBranches.map(b => [b.id, b]));

    // Generate flat database record suggestions
    const calculated: any[] = [];

    inv.forEach(item => {
      const sku = skusMap.get(item.sku_id);
      if (sku) {
        const family = familiesMap.get(sku.family_id);
        const branch = branchesMap.get(item.branch_id);
        const minStock = family ? family.min_stock_per_sku : 0;
        const currentQty = item.quantity || 0;

        // If stock is below min, recommend purchase
        if (currentQty < minStock && minStock > 0) {
          const suggestedQty = minStock - currentQty;
          const costPrice = family ? (family.cost_price || 0) : 0;
          const totalCostPrice = suggestedQty * costPrice;

          calculated.push({
            inventoryId: item.id,
            sku_id: item.sku_id,
            sku_code: sku.sku_code,
            spherical: sku.spherical,
            cylindrical: sku.cylindrical,
            branch_id: item.branch_id,
            branch_name: branch ? branch.name : 'N/A',
            manufacturer: family ? family.manufacturer : 'N/A',
            line: family ? family.line : 'N/A',
            cost_price: costPrice,
            total_cost: totalCostPrice,
            current_qty: currentQty,
            min_stock: minStock,
            suggested_qty: suggestedQty
          });
        }
      }
    });

    setSuggestions(calculated);
  };

  const handleResetFilters = () => {
    setSelectedBranch('');
    setSelectedManufacturer('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleRestockSimulations = async () => {
    setRestockingSim(true);
    try {
      const batch = writeBatch(db);
      
      // Update each inventory item we have in suggestions
      filteredSuggestions.forEach(item => {
        const invRef = doc(db, 'inventory', item.inventoryId);
        // Add suggested qty to inventory to top up to minimum
        batch.update(invRef, {
          quantity: item.min_stock,
          updated_at: new Date().toISOString()
        });
      });

      await batch.commit();
      
      clearCache();
      setOrderedSuccess(true);
      setTimeout(() => {
        setOrderModalOpen(false);
        setOrderedSuccess(false);
        loadData();
      }, 2500);
    } catch (err) {
      console.error('Erro na simulação de pedido de reposição:', err);
      alert('Erro ao processar reposição automática.');
    } finally {
      setRestockingSim(false);
    }
  };

  // Filter computation
  const filteredSuggestions = suggestions.filter(item => {
    if (selectedBranch && item.branch_id !== selectedBranch) {
      return false;
    }
    if (selectedManufacturer && item.manufacturer !== selectedManufacturer) {
      return false;
    }
    if (searchQuery && !item.sku_code.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const manufacturers = Array.from(new Set(families.map(f => f.manufacturer))).filter(Boolean);

  // Pagination math
  const totalItems = filteredSuggestions.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = filteredSuggestions.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages) {
      setCurrentPage(p);
    }
  };

  // KPIs
  const totalSugQty = filteredSuggestions.reduce((sum, item) => sum + item.suggested_qty, 0);
  const totalSugCost = filteredSuggestions.reduce((sum, item) => sum + item.total_cost, 0);
  const criticalSkuCount = filteredSuggestions.length;

  // Grouped suggestions by manufacturer for easy overview
  const mfgGroupHashMap: Record<string, { qty: number; cost: number; items: number }> = {};
  filteredSuggestions.forEach(item => {
    if (!mfgGroupHashMap[item.manufacturer]) {
      mfgGroupHashMap[item.manufacturer] = { qty: 0, cost: 0, items: 0 };
    }
    mfgGroupHashMap[item.manufacturer].qty += item.suggested_qty;
    mfgGroupHashMap[item.manufacturer].cost += item.total_cost;
    mfgGroupHashMap[item.manufacturer].items += 1;
  });

  // Export actions
  const handleExportPDF = () => {
    const docPDF = new jsPDF('p', 'mm', 'a4');
    docPDF.text('Reis Controle Lens - Sugestão de Compra e Reposição', 14, 15);
    docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 23);

    const head = [['SKU', 'Fabricante', 'Filial', 'Estoque', 'Mínimo', 'Sugestão', 'Subtotal']];
    const body = filteredSuggestions.map(i => [
      i.sku_code,
      i.manufacturer,
      i.branch_name,
      i.current_qty,
      i.min_stock,
      i.suggested_qty,
      formatCurrency(i.total_cost)
    ]);

    autoTable(docPDF, { 
      startY: 30, 
      head, 
      body,
      theme: 'striped',
      headStyles: { fillColor: [147, 51, 234] } // Purple
    });

    docPDF.save(`sugestoes_compra_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const exportData = filteredSuggestions.map(i => ({
      'SKU': i.sku_code,
      'Fabricante': i.manufacturer,
      'Linha': i.line,
      'Filial': i.branch_name,
      'Estoque Atual': i.current_qty,
      'Estoque Mínimo': i.min_stock,
      'Qtd Sugerida': i.suggested_qty,
      'Preço de Custo Un.': formatCurrency(i.cost_price),
      'Custo Total Sugerido': formatCurrency(i.total_cost)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sugestões de Compra');
    XLSX.writeFile(wb, `sugestoes_compra_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-8">
      {/* Header and exports */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <ShoppingCart className="text-purple-600" size={32} />
            Sugestões de Compra Inteligente
          </h1>
          <p className="text-slate-400 mt-1">Previsão automática de reposição baseada no estoque mínimo das lentes.</p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button 
            type="button"
            onClick={handleExportPDF}
            className="flex items-center justify-center px-4 py-2.5 bg-white hover:bg-purple-50 text-slate-600 hover:text-purple-600 rounded-xl text-xs font-bold transition-all border border-slate-200 hover:border-purple-200 shadow-sm cursor-pointer"
          >
            <Download size={14} className="mr-2" />
            PDF
          </button>
          
          <button 
            type="button"
            onClick={handleExportExcel}
            className="flex items-center justify-center px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 rounded-xl text-xs font-bold transition-all border border-slate-200 hover:border-emerald-100 shadow-sm cursor-pointer"
          >
            <FileSpreadsheet size={14} className="mr-2" />
            EXCEL
          </button>

          <button 
            type="button"
            onClick={() => setOrderModalOpen(true)}
            disabled={filteredSuggestions.length === 0 || loading}
            className="flex items-center justify-center px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-purple-600/10 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles size={14} className="mr-2 animate-pulse" />
            Gerar Pedido
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">SKUs para Repor</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : criticalSkuCount} itens</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Qtd Sugerida Total</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : totalSugQty} un.</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Custo de Restoque</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">
              {loading ? '...' : formatCurrency(totalSugCost)}
            </h3>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por SKU..." 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-600/10 transition-all outline-none"
          />
        </div>

        {/* Branch */}
        <div>
          <select
            value={selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setCurrentPage(1); }}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-600/10 transition-all outline-none"
          >
            <option value="">Filial (Todas)</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Manufacturer */}
        <div>
          <select
            value={selectedManufacturer}
            onChange={(e) => { setSelectedManufacturer(e.target.value); setCurrentPage(1); }}
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-purple-600/10 transition-all outline-none"
          >
            <option value="">Fabricante (Todos)</option>
            {manufacturers.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleResetFilters}
          className="text-xs font-semibold text-purple-600 hover:text-purple-800 flex items-center justify-center gap-1.5 py-2 hover:bg-purple-50 rounded-xl transition-all cursor-pointer"
        >
          <RotateCcw size={13} />
          Limpar Filtros e Resetar
        </button>
      </div>

      {/* Grid mapping grouped manufacturer overview */}
      {filteredSuggestions.length > 0 && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(mfgGroupHashMap).map(([mfg, stats]) => (
            <div key={mfg} className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-600 tracking-wider bg-purple-50 px-2 py-0.5 rounded-full">
                  Orçamento de Reposição
                </span>
                <h4 className="font-extrabold text-slate-800 text-sm mt-2">{mfg}</h4>
                <p className="text-xs text-slate-400 mt-1">{stats.items} SKUs em ruptura</p>
              </div>
              <div className="mt-4 border-t border-slate-200/50 pt-2 flex justify-between items-end">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Qtd: {stats.qty} un</span>
                <span className="text-xs font-black text-slate-700">{formatCurrency(stats.cost)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table grid view */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-600 border-b-transparent mx-auto"></div>
            <p className="text-slate-400 text-sm font-medium">Analisando índices mínimos de estoque...</p>
          </div>
        ) : filteredSuggestions.length === 0 ? (
          <div className="p-16 text-center">
            <CheckCircle size={44} className="text-emerald-500 mx-auto mb-4" />
            <h4 className="font-extrabold text-slate-700 text-lg">Estoque 100% abastecido!</h4>
            <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Nenhum SKU está abaixo da quantidade mínima configurada nas filiais.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  <th className="pl-6 pr-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Lente / SKU</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Filial</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Dioptrias</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Estoque Atual</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Estoque Mínimo</th>
                  <th className="px-4 py-4 text-xs font-extrabold text-purple-600 uppercase tracking-widest text-center">Reposição Sugerida</th>
                  <th className="pr-6 pl-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Custo Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedList.map((item) => (
                  <tr key={`${item.sku_id}_${item.branch_id}`} className="hover:bg-slate-50/60 transition-colors">
                    {/* INFO */}
                    <td className="pl-6 pr-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm tracking-tight">{item.sku_code}</span>
                        <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-500">{item.manufacturer}</span>
                          <span className="text-slate-300">•</span>
                          <span>{item.line}</span>
                        </div>
                      </div>
                    </td>

                    {/* BRANCH */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center space-x-1.5">
                        <Store size={13} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-600">{item.branch_name}</span>
                      </div>
                    </td>

                    {/* DIOPTRAS */}
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center space-x-1.5 font-mono text-[11px] font-bold">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          E: {formatRefraction(item.spherical)}
                        </span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          C: {formatRefraction(item.cylindrical)}
                        </span>
                      </div>
                    </td>

                    {/* CURRENT STOCK */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                        {item.current_qty} un
                      </span>
                    </td>

                    {/* MIN STOCK */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs font-medium text-slate-500">
                        {item.min_stock} un
                      </span>
                    </td>

                    {/* RECOMMENDED REPLENISHMENT */}
                    <td className="px-4 py-3.5 text-center bg-purple-50/25">
                      <span className="text-xs font-black text-purple-700 bg-purple-100/60 px-3 py-1 rounded-full text-center">
                        + {item.suggested_qty} un.
                      </span>
                    </td>

                    {/* TOTAL ESTIMATED COST */}
                    <td className="pr-6 pl-4 py-3.5 text-right font-bold text-slate-700 text-xs">
                      {formatCurrency(item.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-400 font-bold">
              Mostrando {startIndex + 1} - {Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems} sugestões
            </span>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs text-slate-600 font-semibold disabled:opacity-50 transition-all cursor-pointer"
              >
                <ChevronLeft size={14} className="inline mr-1" /> Anterior
              </button>

              <span className="text-xs font-bold text-slate-500 px-2.5">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs text-slate-600 font-semibold disabled:opacity-50 transition-all cursor-pointer"
              >
                Próximo <ChevronRight size={14} className="inline ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generate order modal simulation list */}
      <AnimatePresence>
        {orderModalOpen && (
          <motion.div 
            key="order-modal-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 overflow-y-auto"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if(!restockingSim) setOrderModalOpen(false); }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 z-10"
              >
                <div className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 mb-4 shadow-sm">
                    <ShoppingCart size={24} />
                  </div>

                  <h3 className="text-lg font-black text-slate-900">
                    Consolidar de Pedido de Compra
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Isso gerará os pedidos de faturamento simulados com os distribuidores oficiais.
                  </p>

                  {orderedSuccess ? (
                    <div className="my-8 py-6 px-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center space-y-2">
                      <CheckCircle size={36} className="text-emerald-500 mx-auto animate-bounce" />
                      <h4 className="font-extrabold text-emerald-800 text-sm">Pedido Realizado & Atualizado!</h4>
                      <p className="text-xs text-emerald-600">O estoque de reposição simulado foi transferido e os níveis de lentes de todas as filiais foram restaurados para o mínimo!</p>
                    </div>
                  ) : (
                    <>
                      {/* Breakdown summary */}
                      <div className="my-6 bg-slate-50 p-4.5 rounded-2xl border border-slate-105/80 text-left space-y-3.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Resumo da Compra</span>
                        
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>SKUs Solicitados</span>
                          <span className="font-bold">{criticalSkuCount} tipos</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>Unidades Totais de Lentes</span>
                          <span className="font-bold">{totalSugQty} unidades</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-800 border-t border-slate-200/50 pt-2.5 font-bold">
                          <span>Valor Total do Pedido</span>
                          <span className="text-purple-600">{formatCurrency(totalSugCost)}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-left bg-purple-50 p-3 rounded-xl flex items-start space-x-2 text-[11px] text-purple-700 leading-normal">
                        <Sparkles size={14} className="shrink-0 mt-0.5" />
                        <p>
                          <strong>Nova Ação Operacional:</strong> Ao clicar no botão "Abastecer Estoque Automático", o sistema atualizará em lote a quantidade de estoque das suas lojas diretamente no banco de dados para simular a compra física.
                        </p>
                      </div>

                      <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <button
                          type="button"
                          onClick={() => setOrderModalOpen(false)}
                          disabled={restockingSim}
                          className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        
                        <button
                          type="button"
                          onClick={handleRestockSimulations}
                          disabled={restockingSim}
                          className="flex-1 flex items-center justify-center px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-purple-600/15 cursor-pointer"
                        >
                          {restockingSim ? 'Abastecendo...' : 'Abastecer Estoque Automático'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
