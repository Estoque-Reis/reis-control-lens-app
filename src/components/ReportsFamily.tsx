import React, { useState, useEffect, useMemo } from 'react';
import { 
  Library, 
  Download, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  SlidersHorizontal, 
  MapPin, 
  Layers, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  Eye, 
  EyeOff,
  Percent, 
  Grid3X3,
  List,
  Info,
  Loader2
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
  Cell 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { formatCurrency, formatRefraction, formatCylinder, cn } from '@/src/lib/utils';
import { LensFamily, LensSku, Branch } from '@/src/types';

export default function ReportsFamily() {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [families, setFamilies] = useState<LensFamily[]>([]);
  const [skus, setSkus] = useState<LensSku[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  
  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Detail Views state
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [detailViewMode, setDetailViewMode] = useState<'grid' | 'list'>('grid');
  const [hideZeroStockSkus, setHideZeroStockSkus] = useState<boolean>(false);
  const [chartsVisible, setChartsVisible] = useState<boolean>(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [branchesData, familiesData, skusData, invSnap] = await Promise.all([
        getCachedBranches(),
        getCachedFamilies(),
        getCachedSkus(),
        getDocs(collection(db, 'inventory'))
      ]);

      setBranches(branchesData);
      setFamilies(familiesData);
      setSkus(skusData);
      setInventory(invSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Erro ao carregar dados estratificados:", err);
    } finally {
      setLoading(false);
    }
  };

  // Build lookups and structured data
  const stratifiedData = useMemo(() => {
    if (loading) return [];

    // Create mappings
    const skusByFamily: Record<string, LensSku[]> = {};
    skus.forEach(sku => {
      if (!skusByFamily[sku.family_id]) {
        skusByFamily[sku.family_id] = [];
      }
      skusByFamily[sku.family_id].push(sku);
    });

    // Stock mapping: stockMap[skuId][branchId] = qty
    const stockMap: Record<string, Record<string, number>> = {};
    inventory.forEach(invItem => {
      if (!stockMap[invItem.sku_id]) {
        stockMap[invItem.sku_id] = {};
      }
      stockMap[invItem.sku_id][invItem.branch_id] = invItem.quantity || 0;
    });

    return families.map(family => {
      const familySkus = skusByFamily[family.id] || [];
      const cost_price = family.cost_price || 0;
      const minStockObj = family.min_stock_per_sku || 0;

      let totalStockQty = 0;
      let totalStockValue = 0;
      let skusCount = familySkus.length;
      let skusAtWarning = 0; // Below minimum or zero quantity
      let skusInRupture = 0; // strictly 0 quantity

      // Sku-detailed info compiled for the UI
      const detailedSkus = familySkus.map(sku => {
        let skuBranchQty = 0;
        let skuBranchesDetails: Record<string, number> = {};

        if (selectedBranchId === 'all') {
          // Sum up across all active branches
          branches.forEach(b => {
            if (b.status !== 'inactive') {
              const qty = stockMap[sku.id]?.[b.id] || 0;
              skuBranchQty += qty;
              skuBranchesDetails[b.id] = qty;
            }
          });
        } else {
          skuBranchQty = stockMap[sku.id]?.[selectedBranchId] || 0;
          skuBranchesDetails[selectedBranchId] = skuBranchQty;
        }

        const isBelowMin = skuBranchQty < minStockObj;
        const isRuptured = skuBranchQty === 0;

        if (isRuptured) {
          skusInRupture++;
        } else if (isBelowMin) {
          skusAtWarning++;
        }

        return {
          ...sku,
          quantity: skuBranchQty,
          branchesDetail: skuBranchesDetails,
          isBelowMin,
          isRuptured,
          minStock: minStockObj,
          totalValue: skuBranchQty * cost_price
        };
      });

      // Total quantity inside this family matching branch configuration
      totalStockQty = detailedSkus.reduce((sum, s) => sum + s.quantity, 0);
      totalStockValue = totalStockQty * cost_price;

      // Filter matches
      const detailsMatchSearch = detailedSkus.some(s => s.sku_code.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSearch = 
        family.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        family.line.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (family.treatment || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (family.material || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        detailsMatchSearch;

      return {
        ...family,
        skus: detailedSkus,
        totalQty: totalStockQty,
        totalValue: totalStockValue,
        skusCount,
        skusAtWarning,
        skusInRupture,
        matchesSearch
      };
    }).filter(f => f.matchesSearch);
  }, [loading, families, skus, inventory, branches, selectedBranchId, searchTerm]);

  // Overall KPIs based on search and filters
  const kpis = useMemo(() => {
    let totalQty = 0;
    let totalValue = 0;
    let totalFamilies = stratifiedData.length;
    let totalRuptures = 0;
    let totalWarnings = 0;

    stratifiedData.forEach(family => {
      totalQty += family.totalQty;
      totalValue += family.totalValue;
      totalRuptures += family.skusInRupture;
      totalWarnings += family.skusAtWarning;
    });

    return {
      totalQty,
      totalValue,
      totalFamilies,
      totalRuptures,
      totalWarnings
    };
  }, [stratifiedData]);

  // Computed data for Family-level audit charts
  const chartData = useMemo(() => {
    if (stratifiedData.length === 0) return { qtyByManufacturer: [], valueByManufacturer: [] };

    const qtyMap = new Map<string, number>();
    const valueMap = new Map<string, number>();

    stratifiedData.forEach(f => {
      qtyMap.set(f.manufacturer, (qtyMap.get(f.manufacturer) || 0) + f.totalQty);
      valueMap.set(f.manufacturer, (valueMap.get(f.manufacturer) || 0) + f.totalValue);
    });

    const qtyByManufacturer = Array.from(qtyMap.entries()).map(([name, value]) => ({ name, value }));
    const valueByManufacturer = Array.from(valueMap.entries()).map(([name, value]) => ({ name, value }));

    return { qtyByManufacturer, valueByManufacturer };
  }, [stratifiedData]);

  // Export Consolidated Report of Families to PDF
  const handleExportConsolidatedPDF = () => {
    const docPDF = new jsPDF();
    const branchName = selectedBranchId === 'all' 
      ? 'Todas as Filiais' 
      : branches.find(b => b.id === selectedBranchId)?.name || 'Filial Selecionada';

    docPDF.setFontSize(16);
    docPDF.setTextColor(30, 41, 59); // slate-800
    docPDF.text(`Relatório de Estoque de Lentes por Família`, 14, 15);
    docPDF.setFontSize(10);
    docPDF.text(`Filial Filtrada: ${branchName}`, 14, 21);
    docPDF.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 26);

    const head = [[
      'Fabricante / Linha', 
      'Características (Índice, Tratamento, Material)', 
      'P. Custo', 
      'Mín/SKU', 
      'Qtd Total', 
      'Valor total', 
      'Itens Críticos (Abaixo Mín / Ruptura)'
    ]];

    const body = stratifiedData.map(f => [
      `${f.manufacturer} - ${f.line}`,
      `ID: ${f.index || 'N/A'} • ${f.treatment || 'Sem Tratamento'} • ${f.material || 'N/A'}`,
      formatCurrency(f.cost_price),
      f.min_stock_per_sku,
      `${f.totalQty} un`,
      formatCurrency(f.totalValue),
      `${f.skusAtWarning} Atenção / ${f.skusInRupture} Ruptura`
    ]);

    autoTable(docPDF, { 
      startY: 32, 
      head, 
      body,
      theme: 'striped',
      headStyles: { fillColor: [8, 145, 178] }, // brand-cyan style
      styles: { fontSize: 8 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        6: { textColor: [225, 29, 72], fontStyle: 'bold' } // rose-600
      }
    });

    docPDF.save(`estoque_lentes_por_familia_${branchName.toLowerCase().replace(/ /g, '_')}.pdf`);
  };

  // Export Consolidated Report to Excel
  const handleExportConsolidatedExcel = () => {
    const branchName = selectedBranchId === 'all' 
      ? 'Todas_as_Filiais' 
      : branches.find(b => b.id === selectedBranchId)?.name || 'Filial_Selecionada';

    // Sheet 1: Consolidated Summary
    const summaryRows = stratifiedData.map(f => ({
      'Fabricante': f.manufacturer,
      'Linha': f.line,
      'Índice de Refração': f.index || '',
      'Tratamento': f.treatment || 'Sem Tratamento',
      'Cor': f.color || '',
      'Material': f.material || '',
      'Preço de Custo (R$)': f.cost_price,
      'Qtd Mínima por SKU': f.min_stock_per_sku,
      'Total de Peças em Estoque': f.totalQty,
      'Valor de Estoque (R$)': f.totalValue,
      'SKUs em Estado de Alerta (Abaixo Mín)': f.skusAtWarning,
      'SKUs em Ruptura (Zerados)': f.skusInRupture,
    }));

    // Sheet 2: Flat SKU Detailing
    const detailRows: any[] = [];
    stratifiedData.forEach(family => {
      family.skus.forEach(s => {
        detailRows.push({
          'Fabricante': family.manufacturer,
          'Linha': family.line,
          'Tratamento': family.treatment || 'Sem Tratamento',
          'Características': `ID: ${family.index || ''} • Mat: ${family.material || ''} • Cor: ${family.color || ''}`,
          'Preço de Custo (R$)': family.cost_price,
          'SKU Código': s.sku_code,
          'Grau Esférico': s.spherical,
          'Grau Cilíndrico': s.cylindrical,
          'Quantidade em Estoque': s.quantity,
          'Mínimo Configurado': family.min_stock_per_sku,
          'Situação': s.quantity === 0 
            ? 'Ruptura (Zerado)' 
            : s.quantity < family.min_stock_per_sku 
              ? 'Abaixo do Mínimo' 
              : 'Em Conformidade',
          'Valor de Estoque (R$)': s.totalValue
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    const wsDetails = XLSX.utils.json_to_sheet(detailRows);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo por Família');
    XLSX.utils.book_append_sheet(wb, wsDetails, 'Detalhamento de SKUs');

    XLSX.writeFile(wb, `estoque_lentes_por_familia_${branchName.toLowerCase()}.xlsx`);
  };

  // Generate dynamic ophthalmic grid/diopters matrices for the family details view
  const renderOphthalmicGrid = (family: any) => {
    const familySkus: any[] = family.skus.filter((sku: any) => {
      if (hideZeroStockSkus) {
        return sku.quantity > 0;
      }
      return true;
    });

    if (familySkus.length === 0) {
      return (
        <div className="text-center py-8 text-slate-400 text-xs font-semibold">
          Nenhuma lente com estoque cadastrado nesta família para os filtros aplicados.
        </div>
      );
    }

    // Extract unique Spheres & Cylinders
    const spheres = Array.from(new Set(familySkus.map(s => Number(s.spherical)))).sort((a, b) => b - a);
    const cylinders = Array.from(new Set(familySkus.map(s => Number(s.cylindrical)))).sort((a, b) => a - b);

    // Create lookup map of spherical-cylindrical pairs
    const gridMap: Record<string, any> = {};
    familySkus.forEach(s => {
      const key = `${Number(s.spherical).toFixed(2)}_${Number(s.cylindrical).toFixed(2)}`;
      gridMap[key] = s;
    });

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Info size={14} className="text-brand-cyan" />
            <span>Grade Oftálmica: Cruzamento de Grau Esférico (Linhas) × Cilindro (Colunas)</span>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input 
              type="checkbox"
              checked={hideZeroStockSkus}
              onChange={(e) => setHideZeroStockSkus(e.target.checked)}
              className="rounded border-slate-300 text-brand-teal focus:ring-brand-teal text-xs w-3.5 h-3.5"
            />
            <span className="text-[11px] font-bold text-slate-600">Ocultar sem estoque</span>
          </label>
        </div>

        <div className="overflow-x-auto max-w-full rounded-2xl border border-slate-100">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="py-2.5 px-3 border-r border-slate-100 font-extrabold text-slate-500">ESF \ CIL</th>
                {cylinders.map(cil => (
                  <th key={cil} className="py-2.5 px-3 border-r border-slate-100 min-w-[70px]">
                    {formatCylinder(cil)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {spheres.map(esf => (
                <tr key={esf} className="hover:bg-slate-50/50 text-xs">
                  <td className="py-2.5 px-3 font-mono font-black text-slate-700 bg-slate-50 border-r border-slate-100 text-left">
                    {formatRefraction(esf)}
                  </td>
                  {cylinders.map(cil => {
                    const key = `${esf.toFixed(2)}_${cil.toFixed(2)}`;
                    const sku = gridMap[key];
                    const qty = sku ? sku.quantity : 0;
                    const isBelowMin = sku && sku.isBelowMin;
                    const isRuptured = sku && sku.isRuptured;

                    if (!sku) {
                      return (
                        <td key={cil} className="py-2.5 px-3 text-slate-200 border-r border-slate-100 font-mono">
                          -
                        </td>
                      );
                    }

                    return (
                      <td 
                        key={cil} 
                        className={cn(
                          "py-2.5 px-3 border-r border-slate-100 font-bold transition-all relative group",
                          isRuptured 
                            ? "bg-rose-50 text-rose-500 hover:bg-rose-100" 
                            : isBelowMin 
                              ? "bg-amber-50 text-amber-600 hover:bg-amber-100" 
                              : "bg-emerald-50/40 text-emerald-700 hover:bg-emerald-100/40"
                        )}
                        title={`SKU: ${sku.sku_code}\nQuantidade: ${qty}\nMínimo: ${family.min_stock_per_sku}`}
                      >
                        <span className="text-xs">{qty}</span>
                        {isBelowMin && (
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm" />
                        )}
                        {isRuptured && (
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render a clean flat list of SKUs for the details view
  const renderDetailedSkusList = (family: any) => {
    const detailedSkus = family.skus.filter((sku: any) => {
      if (hideZeroStockSkus) return sku.quantity > 0;
      return true;
    });

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
          <span className="text-xs font-bold text-slate-500">Graduações Cadastradas nesta Família</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox"
              checked={hideZeroStockSkus}
              onChange={(e) => setHideZeroStockSkus(e.target.checked)}
              className="rounded border-slate-300 text-brand-teal focus:ring-brand-teal text-xs w-3.5 h-3.5"
            />
            <span className="text-[11px] font-bold text-slate-600">Ocultar sem estoque</span>
          </label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="py-3 px-4">Código SKU</th>
                <th className="py-3 px-4">Grau Esférico</th>
                <th className="py-3 px-4">Grau Cilíndrico</th>
                <th className="py-3 px-4">Configuração</th>
                <th className="py-3 px-4">Disponível</th>
                <th className="py-3 px-4">Situação</th>
                <th className="py-3 px-4 text-right">Valor em Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {detailedSkus.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">Nenhum SKU encontrado com estoque neste filtro.</td>
                </tr>
              ) : (
                detailedSkus.map((sku: any) => (
                  <tr key={sku.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.0 py-0.5 rounded">
                        {sku.sku_code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">{formatRefraction(sku.spherical)}</td>
                    <td className="py-3 px-4 font-bold text-slate-700">{formatCylinder(sku.cylindrical)}</td>
                    <td className="py-3 px-4 text-slate-400">Mín: {family.min_stock_per_sku} un</td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        "font-extrabold",
                        sku.quantity === 0 ? "text-red-500" : sku.quantity < family.min_stock_per_sku ? "text-amber-500" : "text-emerald-600"
                      )}>
                        {sku.quantity} un
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {sku.quantity === 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-100 text-red-600 uppercase">Ruptura</span>
                      ) : sku.quantity < family.min_stock_per_sku ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-600 uppercase">Abaixo do Mínimo</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-600 uppercase">Conforme</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-800">{formatCurrency(sku.totalValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center">
          <Loader2 className="animate-spin text-brand-teal h-10 w-10 mb-4" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Estratificando estoque por família...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Estoque por Família de Lente</h1>
          <p className="text-slate-400 mt-1">Estratificação consolidada e grade oftálmica completa por fabricante e linha.</p>
        </div>

        {/* Global Export actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setChartsVisible(!chartsVisible)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border shadow-sm cursor-pointer",
              chartsVisible 
                ? "bg-teal-50 border-teal-200 text-brand-teal" 
                : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
            )}
            title="Alternar exibição de gráficos de auditoria"
          >
            {chartsVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{chartsVisible ? 'Ocultar Gráficos' : 'Exibir Gráficos'}</span>
          </button>

          <button 
            onClick={handleExportConsolidatedPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-100 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Download size={14} /> PDF Geral
          </button>
          
          <button 
            onClick={handleExportConsolidatedExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-emerald-100 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <FileSpreadsheet size={14} /> EXCEL Completo
          </button>
        </div>
      </div>

      {/* KPI Dashboard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-cyan-100/50 text-brand-cyan rounded-xl">
            <Layers size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Famílias sob análise</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{kpis.totalFamilies}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100/50 text-blue-600 rounded-xl">
            <Package size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Peças em Estoque</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{kpis.totalQty} un</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-100/50 text-emerald-600 rounded-xl">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Investimento Total</span>
            <span className="text-xl font-black text-slate-800 block mt-0.5">{formatCurrency(kpis.totalValue)}</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-rose-100/50 text-rose-600 rounded-xl">
            <AlertTriangle size={22} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pontos de Reposição</span>
            <span className="text-sm font-black text-slate-800 block mt-1">
              <strong className="text-red-500 font-extrabold">{kpis.totalRuptures}</strong> em Ruptura / <strong className="text-amber-500">{kpis.totalWarnings}</strong> Críticos
            </span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4 justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por fabricante, tratamento, película..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold leading-5 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:bg-white transition-all placeholder-slate-400"
          />
        </div>

        {/* Branch Select */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          <div className="text-slate-400 shrink-0">
            <MapPin size={16} />
          </div>
          <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Filtrar Loja:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all min-w-[180px]"
          >
            <option value="all">Todas as Filiais</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Visual Charts Dashboard Section */}
      {chartsVisible && stratifiedData.length > 0 && (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Chart 1: Peças por Fabricante */}
              <div className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                    Distribuição de Estoque por Fabricante
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mb-4">
                    Estoque total acumulado de lentes agrupados por fabricante/fornecedor.
                  </p>
                </div>
                <div key={`fam_qty_chart_container_${chartData.qtyByManufacturer.length}`} className="h-64 w-full">
                  <ResponsiveContainer key={`fam_qty_chart_${chartData.qtyByManufacturer.length}`} width="100%" height="100%">
                    <BarChart data={chartData.qtyByManufacturer} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} fontWeight="bold" tickLine={false} />
                      <ChartTooltip 
                        isAnimationActive={false}
                        formatter={(value: any) => [`${value} un`, "Total"]}
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="value" fill="#0891b2" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {chartData.qtyByManufacturer.map((entry, index) => {
                          const COLORS = ['#0891b2', '#0d9488', '#2563eb', '#4f46e5', '#d97706', '#e11d48', '#059669', '#8b5cf6'];
                          return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Investimento por Fabricante */}
              <div className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">
                    Investimento Financeiro por Fabricante
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium mb-4">
                    Valor total de custo imobilizado por fornecedor de lentes.
                  </p>
                </div>
                <div key={`fam_val_chart_container_${chartData.valueByManufacturer.length}`} className="h-64 w-full flex items-center justify-center">
                  {chartData.valueByManufacturer.length === 0 ? (
                    <div className="text-xs text-slate-400 font-bold">Sem dados suficientes para gerar gráfico financeiro.</div>
                  ) : (
                    <ResponsiveContainer key={`fam_val_chart_${chartData.valueByManufacturer.length}`} width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.valueByManufacturer}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {chartData.valueByManufacturer.map((entry, index) => {
                            const COLORS = ['#4f46e5', '#3b82f6', '#0d9488', '#059669', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6'];
                            return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                          })}
                        </Pie>
                        <ChartTooltip 
                          isAnimationActive={false}
                          formatter={(value: any) => [formatCurrency(Number(value)), "Investimento"]}
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
                  )}
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Families stratification list */}
      <div className="space-y-4">
        {stratifiedData.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-3" />
            <h4 className="text-slate-700 font-bold text-sm">Nenhuma família encontrada</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Tente ajustar seus termos de busca ou filtros de filiais.</p>
          </div>
        ) : (
          stratifiedData.map(family => {
            const isExpanded = expandedFamilyId === family.id;
            const healthPercentage = family.skusCount > 0 
              ? Math.round(((family.skusCount - (family.skusAtWarning + family.skusInRupture)) / family.skusCount) * 100)
              : 100;

            return (
              <div 
                key={family.id} 
                className={cn(
                  "bg-white rounded-3xl border shadow-sm overflow-hidden transition-all",
                  isExpanded ? "border-brand-teal ring-1 ring-brand-teal" : "border-slate-100 hover:border-slate-200"
                )}
              >
                {/* Family collapsed state container */}
                <div 
                  onClick={() => setExpandedFamilyId(isExpanded ? null : family.id)}
                  className="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 cursor-pointer select-none text-left"
                >
                  <div className="flex items-start space-x-4 min-w-0 flex-1">
                    <div className="p-4 rounded-2xl bg-cyan-50/50 text-brand-cyan shrink-0 mt-0.5">
                      <Library size={24} />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-lg font-black text-slate-800">{family.manufacturer}</strong>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm font-semibold text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-100">
                          {family.line}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-bold mt-1.5 uppercase tracking-wider">
                        <span>Índice: <strong className="text-slate-600">{family.index || 'N/A'}</strong></span>
                        <span>•</span>
                        <span>Tratamento: <strong className="text-slate-600">{family.treatment || 'Sem'}</strong></span>
                        <span>•</span>
                        <span>Material: <strong className="text-slate-600">{family.material || 'N/A'}</strong></span>
                        <span>•</span>
                        <span>Cor: <strong className="text-slate-600">{family.color || 'Incolor'}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Operational stats block */}
                  <div className="flex flex-wrap items-center gap-6 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 w-full lg:w-auto">
                    <div className="text-left w-[120px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Estoque Total</span>
                      <span className="text-base font-black text-slate-700 block mt-0.5">
                        {family.totalQty} un
                      </span>
                    </div>

                    <div className="text-left w-[140px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Investimento</span>
                      <span className="text-base font-black text-slate-700 block mt-0.5">
                        {formatCurrency(family.totalValue)}
                      </span>
                    </div>

                    <div className="text-left w-[150px]">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Nível de Saúde</span>
                        <span className={cn(
                          "text-[10px] font-black",
                          healthPercentage >= 90 ? "text-emerald-500" : healthPercentage >= 60 ? "text-amber-500" : "text-rose-500"
                        )}>
                          {healthPercentage}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div 
                          className={cn(
                            "h-1.5 rounded-full transition-all",
                            healthPercentage >= 90 ? "bg-emerald-500" : healthPercentage >= 60 ? "bg-amber-500" : "bg-rose-500"
                          )} 
                          style={{ width: `${healthPercentage}%` }} 
                        />
                      </div>
                    </div>

                    <button className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors shrink-0">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {/* Expanded state contents with high fidelity grade views */}
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="border-t border-slate-150 p-6 bg-slate-50/20"
                  >
                    <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-3">
                      <div className="flex items-center gap-1.5 self-start">
                        <span className="text-xs font-bold text-slate-500">Visualizar Detalhes como:</span>
                        <div className="bg-slate-100 p-0.5 rounded-lg flex">
                          <button
                            onClick={() => setDetailViewMode('grid')}
                            className={cn(
                              "p-1.5 rounded transition-all cursor-pointer",
                              detailViewMode === 'grid' ? "bg-white text-brand-teal shadow-xs font-bold" : "text-slate-400 hover:text-slate-600"
                            )}
                            title="Visualizar Grade Oftálmica"
                          >
                            <Grid3X3 size={15} />
                          </button>
                          <button
                            onClick={() => setDetailViewMode('list')}
                            className={cn(
                              "p-1.5 rounded transition-all cursor-pointer",
                              detailViewMode === 'list' ? "bg-white text-brand-teal shadow-xs font-bold" : "text-slate-400 hover:text-slate-600"
                            )}
                            title="Visualizar Lista de SKUs"
                          >
                            <List size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <span className="text-xs font-bold text-slate-400 bg-white/80 px-2.5 py-1.5 border border-slate-200/50 rounded-xl">
                          Preço de Custo SKU: <strong>{formatCurrency(family.cost_price)}</strong>
                        </span>
                        
                        <span className="text-xs font-bold text-slate-400 bg-white/80 px-2.5 py-1.5 border border-slate-200/50 rounded-xl">
                          Estoque Mínimo SKU: <strong>{family.min_stock_per_sku} un</strong>
                        </span>
                      </div>
                    </div>

                    {detailViewMode === 'grid' ? renderOphthalmicGrid(family) : renderDetailedSkusList(family)}
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
