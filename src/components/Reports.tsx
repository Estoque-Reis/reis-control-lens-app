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
  Loader2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function Reports() {
  const [loading, setLoading] = useState(false);

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

  const handleGenerateReport = async (type: string, format: 'pdf' | 'excel') => {
    setLoading(true);
    try {
      let data = await fetchFullInventoryData();
      let title = reportTypes.find(r => r.id === type)?.title || 'Relatório';

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
              <div>
                <h3 className="text-lg font-bold text-slate-800">{report.title}</h3>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{report.desc}</p>
              </div>
            </div>

            <div className="mt-8 flex items-center space-x-3">
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
          </motion.div>
        ))}
      </div>

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
