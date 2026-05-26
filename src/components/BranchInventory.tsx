import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Download, 
  RotateCcw,
  SlidersHorizontal,
  Plus,
  Minus,
  Briefcase,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Branch, LensFamily, LensSku } from '@/src/types';
import { cn, formatRefraction } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function BranchInventory() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [families, setFamilies] = useState<LensFamily[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [inventoryMatrix, setInventoryMatrix] = useState<Record<string, Record<string, number>>>({}); // { sku_id: { branch_id: qty } }
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [selectedLine, setSelectedLine] = useState('');
  const [esfFilter, setEsfFilter] = useState('');
  const [cilFilter, setCilFilter] = useState('');
  const [esfSign, setEsfSign] = useState<'+' | '-'>('+');
  const [onlyInStock, setOnlyInStock] = useState(false);

  // Applied filters for dioptria query
  const [appliedEsfFilter, setAppliedEsfFilter] = useState('');
  const [appliedCilFilter, setAppliedCilFilter] = useState('');
  const [appliedEsfSign, setAppliedEsfSign] = useState<'+' | '-'>('+');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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

      setBranches(branchesData.filter(b => b.status === 'active'));
      setFamilies(familiesData);
      setSkus(skusData);

      // Build inventory mapping: sku_id -> branch_id -> quantity
      const matrix: Record<string, Record<string, number>> = {};
      inventorySnap.docs.forEach(docSnap => {
        const item = docSnap.data();
        const skuId = item.sku_id;
        const branchId = item.branch_id;
        const qty = item.quantity || 0;

        if (skuId && branchId) {
          if (!matrix[skuId]) {
            matrix[skuId] = {};
          }
          matrix[skuId][branchId] = qty;
        }
      });
      setInventoryMatrix(matrix);
    } catch (err) {
      console.error('Erro ao buscar dados do estoque por filial:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedManufacturer('');
    setSelectedLine('');
    setEsfFilter('');
    setCilFilter('');
    setEsfSign('+');
    setAppliedEsfFilter('');
    setAppliedCilFilter('');
    setAppliedEsfSign('+');
    setOnlyInStock(false);
    setCurrentPage(1);
  };

  const handleApplyDioptres = () => {
    setAppliedEsfFilter(esfFilter);
    setAppliedCilFilter(cilFilter);
    setAppliedEsfSign(esfSign);
    setCurrentPage(1);
  };

  const handleClearDioptres = () => {
    setEsfFilter('');
    setCilFilter('');
    setEsfSign('+');
    setAppliedEsfFilter('');
    setAppliedCilFilter('');
    setAppliedEsfSign('+');
    setCurrentPage(1);
  };

  // Get unique list of manufacturers and lines
  const manufacturers = Array.from(new Set(families.map(f => f.manufacturer))).filter(Boolean);
  const lines = Array.from(new Set(families.filter(f => !selectedManufacturer || f.manufacturer === selectedManufacturer).map(f => f.line))).filter(Boolean);

  // Filter items
  const skusMap = new Map<string, any>(skus.map(s => [s.id, s]));
  const familiesMap = new Map<string, LensFamily>(families.map(f => [f.id, f]));

  // Step dioptre simulation helpers
  const stepDioptre = (fld: 'esf' | 'cil', dir: 'up' | 'down') => {
    let currentVal = fld === 'esf' ? esfFilter : cilFilter;
    let numeric = parseFloat(currentVal.replace(',', '.')) || 0;
    
    if (fld === 'esf' && esfSign === '-') {
      numeric = -numeric;
    }
    if (fld === 'cil') {
      numeric = -numeric;
    }

    const step = 0.25;
    let newVal = dir === 'up' ? numeric + step : numeric - step;

    if (fld === 'esf') {
      if (newVal > 2) newVal = 2;
      if (newVal < -2) newVal = -2;
      setEsfSign(newVal < 0 ? '-' : '+');
      setEsfFilter(Math.abs(newVal).toFixed(2).replace('.', ','));
    } else {
      if (newVal > 0) newVal = 0;
      if (newVal < -2) newVal = -2;
      setCilFilter(Math.abs(newVal).toFixed(2).replace('.', ','));
    }
    setCurrentPage(1);
  };

  const formatInputWithAutoComma = (value: string) => {
    let digits = value.replace(/\D/g, '').slice(0, 3);
    if (!digits) return '';
    if (digits.length === 1) return digits;
    if (digits.length === 2) return `${digits[0]},${digits[1]}`;
    return `${digits[0]},${digits[1]}${digits[2]}`;
  };

  const handleEsfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInputWithAutoComma(e.target.value);
    setEsfFilter(formatted);
    setCurrentPage(1);
  };

  const handleCilChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInputWithAutoComma(e.target.value);
    setCilFilter(formatted);
    setCurrentPage(1);
  };

  const filteredSkusList = skus.map(sku => {
    const family = familiesMap.get(sku.family_id);
    const branchQtys = inventoryMatrix[sku.id] || {};
    const totalQty = Object.values(branchQtys).reduce((sum: number, q: any) => sum + (q || 0), 0);

    return {
      ...sku,
      family,
      branchQtys,
      totalQty
    };
  }).filter(item => {
    // 1. Search Query (SKU Code)
    if (searchQuery && !item.sku_code.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // 2. Manufacturer
    if (selectedManufacturer && item.family?.manufacturer !== selectedManufacturer) {
      return false;
    }

    // 3. Line
    if (selectedLine && item.family?.line !== selectedLine) {
      return false;
    }

    // 4. Esférico
    if (appliedEsfFilter) {
      const filterEsfVal = parseFloat(appliedEsfFilter.replace(',', '.')) || 0;
      const finalFilterEsf = appliedEsfSign === '-' ? -filterEsfVal : filterEsfVal;
      if (item.spherical !== finalFilterEsf) {
        return false;
      }
    }

    // 5. Cilíndrico
    if (appliedCilFilter) {
      const filterCilVal = -Math.abs(parseFloat(appliedCilFilter.replace(',', '.')) || 0); // cylindrical is always negative
      if (item.cylindrical !== filterCilVal) {
        return false;
      }
    }

    // 6. Only in stock
    if (onlyInStock && item.totalQty <= 0) {
      return false;
    }

    return true;
  });

  // Pagination calculations
  const totalItems = filteredSkusList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSkusList = filteredSkusList.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages) {
      setCurrentPage(p);
    }
  };

  // Export functions
  const handleExportPDF = () => {
    const docPDF = new jsPDF('l', 'mm', 'a4'); // landscape
    docPDF.text('Reis Controle Lens - Estoque Atual por Filial', 14, 15);
    docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 23);

    const branchHeaders = branches.map(b => b.name);
    const head = [['SKU', 'Fabricante', 'Linha', 'Esf', 'Cil', ...branchHeaders, 'Total']];
    
    const body = filteredSkusList.map(item => {
      const row = [
        item.sku_code,
        item.family?.manufacturer || 'N/A',
        item.family?.line || 'N/A',
        formatRefraction(item.spherical),
        formatRefraction(item.cylindrical)
      ];
      branches.forEach(b => {
        row.push(item.branchQtys[b.id] || 0);
      });
      row.push(item.totalQty);
      return row;
    });

    autoTable(docPDF, { 
      startY: 30, 
      head, 
      body,
      theme: 'grid',
      headStyles: { fillColor: [15, 118, 110] }, // Teal-800
      styles: { fontSize: 8 }
    });

    docPDF.save(`estoque_por_filial_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportExcel = () => {
    const exportData = filteredSkusList.map(item => {
      const row: Record<string, any> = {
        'SKU': item.sku_code,
        'Fabricante': item.family?.manufacturer || 'N/A',
        'Linha': item.family?.line || 'N/A',
        'Esférico': formatRefraction(item.spherical),
        'Cilíndrico': formatRefraction(item.cylindrical)
      };
      branches.forEach(b => {
        row[b.name] = item.branchQtys[b.id] || 0;
      });
      row['Total'] = item.totalQty;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque por Filial');
    XLSX.writeFile(wb, `estoque_por_filial_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Stats calculation
  const totalStockSum = filteredSkusList.reduce((sum, item) => sum + item.totalQty, 0);
  const activeSkusCount = filteredSkusList.filter(item => item.totalQty > 0).length;

  return (
    <div className="space-y-8">
      {/* Header and exports */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
            <Building2 className="text-brand-teal" size={32} />
            Estoque Atual por Filial
          </h1>
          <p className="text-slate-400 mt-1">Visão matriz x filial das lentes em tempo real.</p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button 
            type="button"
            onClick={handleExportPDF}
            className="flex items-center justify-center px-4 py-2.5 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-bold transition-all border border-slate-200 hover:border-red-100 shadow-sm cursor-pointer"
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
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-teal-50 text-brand-teal rounded-2xl">
            <Layers size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estoque Consolidado</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : totalStockSum} un.</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Briefcase size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">SKUs com Estoque</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : activeSkusCount} SKUs</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Filiais Monitoradas</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{loading ? '...' : branches.length} filiais</h3>
          </div>
        </div>
      </div>

      {/* Master Filter Card */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-brand-teal" />
            Filtros Avançados de Busca
          </h3>
          <button 
            onClick={handleResetFilters}
            className="text-xs font-semibold text-slate-500 hover:text-brand-teal flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw size={13} />
            Limpar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Query bar */}
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por SKU..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-brand-teal/20 transition-all outline-none"
            />
          </div>

          {/* Manufacturer */}
          <div>
            <select
              value={selectedManufacturer}
              onChange={(e) => { setSelectedManufacturer(e.target.value); setSelectedLine(''); setCurrentPage(1); }}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-brand-teal/20 transition-all outline-none"
            >
              <option value="">Fabricante (Todos)</option>
              {manufacturers.map(man => (
                <option key={man} value={man}>{man}</option>
              ))}
            </select>
          </div>

          {/* Line */}
          <div>
            <select
              value={selectedLine}
              onChange={(e) => { setSelectedLine(e.target.value); setCurrentPage(1); }}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-brand-teal/20 transition-all outline-none"
            >
              <option value="">Linha (Todas)</option>
              {lines.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Only in stock checkbox */}
          <div className="flex items-center">
            <label className="flex items-center space-x-2.5 cursor-pointer text-sm text-slate-600">
              <input 
                type="checkbox" 
                checked={onlyInStock}
                onChange={(e) => { setOnlyInStock(e.target.checked); setCurrentPage(1); }}
                className="w-4.5 h-4.5 rounded text-emerald-500 focus:ring-0 cursor-pointer border-slate-300"
              />
              <span className="font-semibold select-none">Disponíveis em estoque</span>
            </label>
          </div>
        </div>

        {/* Dioptre filtering segment */}
        <div className="pt-4 border-t border-slate-100 flex flex-col xl:flex-row items-stretch xl:items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dioptrias:</span>
            
            {/* Esférico */}
            <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/60 shadow-sm">
              <span className="text-xs font-bold text-slate-500 px-1">ESF</span>
              
              <button 
                type="button"
                onClick={() => setEsfSign(prev => prev === '+' ? '-' : '+')}
                className={cn(
                  "px-2.5 py-1 text-xs font-black rounded-lg transition-all",
                  esfSign === '+' ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                )}
              >
                {esfSign}
              </button>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => stepDioptre('esf', 'down')}
                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded"
                >
                  <Minus size={12} />
                </button>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={esfFilter}
                  onChange={handleEsfChange}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDioptres(); }}
                  onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                  placeholder="0,00"
                  className="w-14 text-center bg-transparent border-none outline-none font-bold text-slate-700 text-xs px-0 overflow-hidden py-0 leading-none"
                />
                <button
                  type="button"
                  onClick={() => stepDioptre('esf', 'up')}
                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Cilíndrico */}
            <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/60 shadow-sm">
              <span className="text-xs font-bold text-slate-500 px-1">CIL *</span>
              <span className="text-xs font-black px-1.5 py-1 bg-red-100 text-red-600 rounded-lg">-</span>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => stepDioptre('cil', 'down')}
                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded"
                >
                  <Minus size={12} />
                </button>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={cilFilter}
                  onChange={handleCilChange}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDioptres(); }}
                  onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                  placeholder="0,00"
                  className="w-14 text-center bg-transparent border-none outline-none font-bold text-slate-700 text-xs px-0 overflow-hidden py-0 leading-none"
                />
                <button
                  type="button"
                  onClick={() => stepDioptre('cil', 'up')}
                  className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* Botão de Pesquisa de Dioptria */}
            <button
              type="button"
              onClick={handleApplyDioptres}
              className="px-4 py-2 bg-brand-teal text-white hover:bg-brand-teal/90 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 shadow-md shadow-brand-teal/10 active:scale-95 cursor-pointer"
            >
              <Search size={14} />
              <span>Pesquisar Dioptria</span>
            </button>

            {/* Botão de Limpar Dioptria */}
            {(appliedEsfFilter || appliedCilFilter) && (
              <button
                type="button"
                onClick={handleClearDioptres}
                className="px-3 py-2 bg-slate-100 text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer border border-slate-250/20"
              >
                <RotateCcw size={12} />
                <span>Limpar</span>
              </button>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-md flex items-start gap-1">
            <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <p>O filtro de dioptrias faz correspondência exata. Use os botões <Plus size={10} className="inline m-0.5" /> e <Minus size={10} className="inline m-0.5" /> para ajustar os valores e depois clique em <strong className="text-slate-500">Pesquisar Dioptria</strong> ou pressione <strong className="text-slate-500">Enter</strong>.</p>
          </div>
        </div>
      </div>

      {/* Main Table Matrix */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-teal border-b-transparent mx-auto"></div>
            <p className="text-slate-400 text-sm font-medium">Buscando estoques integrados das lojas...</p>
          </div>
        ) : filteredSkusList.length === 0 ? (
          <div className="p-16 text-center">
            <Building2 size={44} className="text-slate-300 mx-auto mb-4" />
            <h4 className="font-extrabold text-slate-700 text-lg">Nenhum estoque correspondente encontrado</h4>
            <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Tente alterar os filtros de busca ou limpar a filtragem ativa.</p>
            <button
              onClick={handleResetFilters}
              className="mt-4 px-6 py-2.5 bg-brand-cyan hover:bg-cyan-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Resetar Filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  <th className="pl-6 pr-4 py-4.5 text-xs font-bold text-slate-400 uppercase tracking-widest">Informações da Lente / SKU</th>
                  <th className="px-4 py-4.5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Esférico</th>
                  <th className="px-4 py-4.5 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Cilíndrico</th>
                  
                  {/* Branch listing */}
                  {branches.map(b => (
                    <th key={b.id} className="px-4 py-4.5 text-xs font-bold text-brand-teal uppercase tracking-widest text-center bg-cyan-50/30">
                      {b.name}
                    </th>
                  ))}

                  <th className="pr-6 pl-4 py-4.5 text-xs font-black text-slate-700 uppercase tracking-widest text-center">Total Geral</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedSkusList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* INFO LENS */}
                    <td className="pl-6 pr-4 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-sm tracking-tight">{item.sku_code}</span>
                        <div className="flex items-center space-x-1.5 mt-1 text-xs text-slate-400">
                          <span className="font-semibold text-slate-500">{item.family?.manufacturer || 'N/A'}</span>
                          <span className="text-slate-300">•</span>
                          <span>{item.family?.line || 'N/A'}</span>
                        </div>
                      </div>
                    </td>

                    {/* SPH */}
                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        "inline-block font-mono text-xs font-bold px-2 py-0.5 rounded-md",
                        item.spherical > 0 ? "bg-emerald-50 text-emerald-700" : item.spherical < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {formatRefraction(item.spherical)}
                      </span>
                    </td>

                    {/* CYL */}
                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        "inline-block font-mono text-xs font-bold px-2 py-0.5 rounded-md",
                        item.cylindrical !== 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                      )}>
                        {formatRefraction(item.cylindrical)}
                      </span>
                    </td>

                    {/* Quantity for each branch */}
                    {branches.map(b => {
                      const qty = item.branchQtys[b.id] || 0;
                      return (
                        <td key={b.id} className={cn("px-4 py-4 text-center bg-cyan-50/10")}>
                          <span className={cn(
                            "inline-block text-xs font-black min-w-8 py-1 rounded-full text-center",
                            qty > 10 
                              ? "bg-teal-50 text-brand-teal" 
                              : qty > 0 
                                ? "bg-amber-50 text-amber-600" 
                                : "text-slate-300 font-semibold"
                          )}>
                            {qty > 0 ? `${qty} un` : '0'}
                          </span>
                        </td>
                      );
                    })}

                    {/* TOTAL */}
                    <td className="pr-6 pl-4 py-4 text-center">
                      <span className={cn(
                        "text-xs font-black px-3 py-1.5 rounded-full inline-block min-w-10 text-center",
                        item.totalQty > 0 
                          ? "bg-brand-cyan text-white shadow-sm" 
                          : "bg-slate-100 text-slate-400"
                      )}>
                        {item.totalQty}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION PANEL */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs text-slate-400 font-bold">
              Mostrando {startIndex + 1} - {Math.min(startIndex + itemsPerPage, totalItems)} de {totalItems} SKUs
            </span>

            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs text-slate-600 font-semibold disabled:opacity-50 transition-all cursor-pointer shadow-xs"
              >
                <ChevronLeft size={14} className="inline mr-1" /> Anterior
              </button>

              <span className="text-xs font-bold text-slate-500 px-2.5">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs text-slate-600 font-semibold disabled:opacity-50 transition-all cursor-pointer shadow-xs"
              >
                Próximo <ChevronRight size={14} className="inline ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
