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
  Info,
  Package,
  ShieldCheck,
  X
} from 'lucide-react';
import { db, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { Branch, LensFamily, LensSku } from '@/src/types';
import { cn, formatRefraction, formatCylinder, generateSkuCode } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useAuth } from '@/src/hooks/useAuth';

export default function BranchInventory() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
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
  const [selectedSph, setSelectedSph] = useState<string>('');
  const [selectedCyl, setSelectedCyl] = useState<string>('');

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Custom Diopter limits configuration retrieved from Firestore
  const [gridConfig, setGridConfig] = useState({
    esf_min: -6.00,
    esf_max: 6.00,
    esf_step: 0.25,
    cil_min: -2.50,
    cil_max: 0.00,
    cil_step: 0.25
  });

  // Dynamic scale generators using settings state (fallback to +6/-6 if invalid)
  const esfScale = React.useMemo(() => {
    const min = parseFloat(String(gridConfig.esf_min));
    const max = parseFloat(String(gridConfig.esf_max));
    const step = parseFloat(String(gridConfig.esf_step)) || 0.25;
    if (isNaN(min) || isNaN(max) || min >= max) {
      return Array.from({ length: 49 }, (_, i) => (6 - i * 0.25).toFixed(2));
    }
    const len = Math.round((max - min) / step) + 1;
    if (len <= 0 || len > 100) return Array.from({ length: 49 }, (_, i) => (6 - i * 0.25).toFixed(2));
    return Array.from({ length: len }, (_, i) => (max - i * step).toFixed(2));
  }, [gridConfig.esf_min, gridConfig.esf_max, gridConfig.esf_step]);

  const cilScale = React.useMemo(() => {
    const min = parseFloat(String(gridConfig.cil_min));
    const max = parseFloat(String(gridConfig.cil_max));
    const step = parseFloat(String(gridConfig.cil_step)) || 0.25;
    if (isNaN(min) || isNaN(max) || min >= max) {
      return Array.from({ length: 11 }, (_, i) => (-i * 0.25).toFixed(2));
    }
    const len = Math.round((max - min) / step) + 1;
    if (len <= 0 || len > 100) return Array.from({ length: 11 }, (_, i) => (-i * 0.25).toFixed(2));
    return Array.from({ length: len }, (_, i) => (max - i * step).toFixed(2));
  }, [gridConfig.cil_min, gridConfig.cil_max, gridConfig.cil_step]);

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
      const [branchesData, familiesData, skusData, inventorySnap, configSnap] = await Promise.all([
        getCachedBranches(),
        getCachedFamilies(),
        getCachedSkus(),
        getDocs(collection(db, 'inventory')),
        getDoc(doc(db, 'configuracoes', 'grade_limites'))
      ]);

      if (configSnap.exists()) {
        const data = configSnap.data();
        let esf_min = typeof data.esf_min === 'number' ? data.esf_min : -6.00;
        let esf_max = typeof data.esf_max === 'number' ? data.esf_max : 6.00;
        let esf_step = typeof data.esf_step === 'number' ? data.esf_step : 0.25;
        let cil_min = typeof data.cil_min === 'number' ? data.cil_min : -2.50;
        let cil_max = typeof data.cil_max === 'number' ? data.cil_max : 0.00;
        let cil_step = typeof data.cil_step === 'number' ? data.cil_step : 0.25;

        if (esf_min > -6.0) esf_min = -6.0;
        if (esf_max < 6.0) esf_max = 6.0;
        if (cil_min > -2.5) cil_min = -2.5;
        if (cil_max < 0.0) cil_max = 0.0;

        setGridConfig({ esf_min, esf_max, esf_step, cil_min, cil_max, cil_step });
      }

      setBranches(branchesData.filter(b => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra' && !b.name?.toLowerCase().includes('outra')));
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
    setViewMode('list');
    setCurrentPage(1);
  };

  const handleApplyDioptres = () => {
    // Normalizar ESF antes de pesquisar
    let formattedEsf = esfFilter.trim();
    let currentEsfSign = esfSign;
    if (formattedEsf) {
      if (formattedEsf.startsWith('-')) {
        currentEsfSign = '-';
        formattedEsf = formattedEsf.substring(1).trim();
      } else if (formattedEsf.startsWith('+')) {
        currentEsfSign = '+';
        formattedEsf = formattedEsf.substring(1).trim();
      }
      let num = parseFloat(formattedEsf.replace(',', '.')) || 0;
      if (num < 0) {
        currentEsfSign = '-';
        num = Math.abs(num);
      }
      if (num > 6.0) num = 6.0;
      num = Math.round(num * 4) / 4;
      formattedEsf = num.toFixed(2).replace('.', ',');
    }

    // Normalizar CIL antes de pesquisar
    let formattedCil = cilFilter.trim();
    if (formattedCil) {
      if (formattedCil.startsWith('-') || formattedCil.startsWith('+')) {
        formattedCil = formattedCil.substring(1).trim();
      }
      let num = parseFloat(formattedCil.replace(',', '.')) || 0;
      num = Math.abs(num); // cylindrical is always negative visual representation but store holds magnitude
      if (num > 4.0) num = 4.0;
      num = Math.round(num * 4) / 4;
      formattedCil = num.toFixed(2).replace('.', ',');
    }

    setEsfSign(currentEsfSign);
    setEsfFilter(formattedEsf);
    setCilFilter(formattedCil);

    setAppliedEsfFilter(formattedEsf);
    setAppliedCilFilter(formattedCil);
    setAppliedEsfSign(currentEsfSign);
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
      if (newVal > 6) newVal = 6;
      if (newVal < -6) newVal = -6;
      setEsfSign(newVal < 0 ? '-' : '+');
      setEsfFilter(Math.abs(newVal).toFixed(2).replace('.', ','));
    } else {
      if (newVal > 0) newVal = 0;
      if (newVal < -4) newVal = -4;
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
    let value = e.target.value;
    if (value.startsWith('-')) {
      setEsfSign('-');
      value = value.substring(1);
    } else if (value.startsWith('+')) {
      setEsfSign('+');
      value = value.substring(1);
    }
    const formatted = formatInputWithAutoComma(value);
    setEsfFilter(formatted);
    setCurrentPage(1);
  };

  const handleCilChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInputWithAutoComma(e.target.value);
    setCilFilter(formatted);
    setCurrentPage(1);
  };

  const handleEsfBlur = () => {
    let esfVal = esfFilter.trim();
    if (!esfVal) return;
    
    if (esfVal.startsWith('-')) {
      setEsfSign('-');
      esfVal = esfVal.substring(1);
    } else if (esfVal.startsWith('+')) {
      setEsfSign('+');
      esfVal = esfVal.substring(1);
    }
    
    let num = parseFloat(esfVal.replace(',', '.')) || 0;
    
    if (num < 0) {
      setEsfSign('-');
      num = Math.abs(num);
    }
    if (num > 6.0) num = 6.0;
    
    num = Math.round(num * 4) / 4;
    setEsfFilter(num.toFixed(2).replace('.', ','));
  };

  const handleCilBlur = () => {
    let cilVal = cilFilter.trim();
    if (!cilVal) return;
    
    if (cilVal.startsWith('-') || cilVal.startsWith('+')) {
      cilVal = cilVal.substring(1);
    }
    
    let num = parseFloat(cilVal.replace(',', '.')) || 0;
    
    if (num > 4.0) num = 4.0;
    if (num < 0) num = 0;
    
    num = Math.round(num * 4) / 4;
    setCilFilter(num.toFixed(2).replace('.', ','));
  };

  const activeBranchIds = React.useMemo(() => new Set(branches.map(b => b.id)), [branches]);

  const filteredSkusList = skus.map(sku => {
    const family = familiesMap.get(sku.family_id);
    const branchQtys = inventoryMatrix[sku.id] || {};
    const totalQty = Object.entries(branchQtys).reduce((sum: number, [bId, q]) => {
      if (activeBranchIds.has(bId)) {
        return sum + (q as number || 0);
      }
      return sum;
    }, 0);

    // Safely parse spherical and cylindrical to real numbers
    let sphericalNum = 0;
    if (sku.spherical !== undefined && sku.spherical !== null) {
      if (typeof sku.spherical === 'number') {
        sphericalNum = sku.spherical;
      } else {
        sphericalNum = parseFloat(String(sku.spherical).replace(',', '.').trim()) || 0;
      }
    }

    let cylindricalNum = 0;
    if (sku.cylindrical !== undefined && sku.cylindrical !== null) {
      if (typeof sku.cylindrical === 'number') {
        cylindricalNum = sku.cylindrical;
      } else {
        cylindricalNum = parseFloat(String(sku.cylindrical).replace(',', '.').trim()) || 0;
      }
    }

    return {
      ...sku,
      spherical: sphericalNum,
      cylindrical: cylindricalNum,
      family,
      branchQtys,
      totalQty
    };
  }).filter(item => {
    // 1. Search Query (extremely smart lookup for SKUs, manufacturer, line, treatment or dioptres)
    if (searchQuery) {
      const skuCode = String(item?.sku_code || '').toLowerCase().replace(/,/g, '.');
      const manufacturer = String(item?.family?.manufacturer || '').toLowerCase();
      const line = String(item?.family?.line || '').toLowerCase();
      const treatment = String(item?.family?.treatment || '').toLowerCase();
      const query = searchQuery.toLowerCase().replace(/,/g, '.').trim();

      let match = skuCode.includes(query) || manufacturer.includes(query) || line.includes(query) || treatment.includes(query);

      // Check if query is also a dioptre number
      const parsedNum = parseFloat(query.replace(/[+-]/g, '').trim());
      if (!isNaN(parsedNum)) {
        const hasMinus = query.startsWith('-');
        const hasPlus = query.startsWith('+');
        
        const matchSpherical = hasMinus 
          ? (Math.abs(item.spherical - (-parsedNum)) < 0.01)
          : (hasPlus 
              ? (Math.abs(item.spherical - parsedNum) < 0.01)
              : (Math.abs(Math.abs(item.spherical) - parsedNum) < 0.01)
            );

        const matchCylindrical = Math.abs(Math.abs(item.cylindrical) - parsedNum) < 0.01;
        
        if (matchSpherical || matchCylindrical) {
          match = true;
        }
      }

      if (!match) {
        return false;
      }
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
      const cleanEsfFilter = appliedEsfFilter.replace(',', '.').trim();
      const magnitudeEsf = cleanEsfFilter.replace(/^[+-]/, '').trim();
      const parsedEsf = parseFloat(magnitudeEsf) || 0;
      const finalFilterEsf = (appliedEsfSign === '-' || cleanEsfFilter.startsWith('-')) ? -parsedEsf : parsedEsf;
      
      if (Math.abs(item.spherical - finalFilterEsf) > 0.01) {
        return false;
      }
    }

    // 5. Cilíndrico
    if (appliedCilFilter) {
      const cleanCilFilter = appliedCilFilter.replace(',', '.').trim();
      const magnitudeCil = cleanCilFilter.replace(/^[+-]/, '').trim();
      const parsedCil = parseFloat(magnitudeCil) || 0;
      const filterCilVal = -Math.abs(parsedCil); // cylindrical is always negative
      
      if (Math.abs(item.cylindrical - filterCilVal) > 0.01) {
        return false;
      }
    }

    // 6. Only in stock
    if (onlyInStock && item.totalQty <= 0) {
      return false;
    }

    return true;
  });

  const displayedSkusList = React.useMemo(() => {
    // If no dioptre filter (quick filter) is active, just return filteredSkusList
    if (!appliedEsfFilter && !appliedCilFilter) {
      return filteredSkusList;
    }

    // Otherwise, we are querying dioptre. Let's make sure all families are represented
    const cleanEsfFilter = appliedEsfFilter.replace(',', '.').trim();
    const magnitudeEsf = cleanEsfFilter.replace(/^[+-]/, '').trim();
    const parsedEsf = parseFloat(magnitudeEsf) || 0;
    const esfSearch = (appliedEsfSign === '-' || cleanEsfFilter.startsWith('-')) ? -parsedEsf : parsedEsf;
    
    const cleanCilFilter = appliedCilFilter.replace(',', '.').trim();
    const magnitudeCil = cleanCilFilter.replace(/^[+-]/, '').trim();
    const parsedCil = parseFloat(magnitudeCil) || 0;
    const cilSearch = -Math.abs(parsedCil);

    // Filter families that match the selection
    const targetFamilies = families.filter(f => {
      const matchFamily = !selectedLine || f.line === selectedLine;
      const matchManufacturer = !selectedManufacturer || f.manufacturer === selectedManufacturer;
      const matchSearch = !searchQuery || 
        String(f?.manufacturer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(f?.line || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchFamily && matchManufacturer && matchSearch;
    });

    return targetFamilies.map(f => {
      // Find if we have an existing item for this family and dioptre
      const existing = filteredSkusList.find(sku => 
        sku.family_id === f.id &&
        Math.abs((sku.spherical || 0) - esfSearch) < 0.01 &&
        Math.abs((sku.cylindrical || 0) - cilSearch) < 0.01
      );

      if (existing) {
        return existing;
      }

      // If no existing mapping, generate a virtual placeholder
      const branchQtys: Record<string, number> = {};
      branches.forEach(b => {
        branchQtys[b.id] = 0;
      });

      const skuCode = generateSkuCode(f.line, esfSearch, cilSearch);
      return {
        id: `virtual_sku_${f.id}_${esfSearch}_${cilSearch}`,
        family_id: f.id,
        sku_code: skuCode,
        spherical: esfSearch,
        cylindrical: cilSearch,
        family: f,
        branchQtys,
        totalQty: 0,
        isVirtual: true,
        created_at: new Date().toISOString()
      };
    });
  }, [filteredSkusList, families, appliedEsfFilter, appliedCilFilter, appliedEsfSign, selectedLine, selectedManufacturer, searchQuery, branches]);

  // Pagination calculations
  const totalItems = displayedSkusList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSkusList = displayedSkusList.slice(startIndex, startIndex + itemsPerPage);

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
        formatCylinder(item.cylindrical)
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
        'Cilíndrico': formatCylinder(item.cylindrical)
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

  // Render a minimal screen with only search and overall stock sum for non-admins (vendedores / consultores / visitantes)
  if (!isAdmin) {
    // Spherical scale (+6.00 to -6.00)
    const sphericalOptions = [];
    for (let v = 6.00; v >= -6.00; v -= 0.25) {
      const sign = v > 0 ? '+' : '';
      sphericalOptions.push(`${sign}${v.toFixed(2)}`.replace('.', ','));
    }

    // Cylindrical scale (0.00 to -4.00)
    const cylindricalOptions = [];
    for (let v = 0.00; v >= -4.00; v -= 0.25) {
      cylindricalOptions.push(v.toFixed(2).replace('.', ','));
    }

    const selectedSphNum = selectedSph ? parseFloat(selectedSph.replace(',', '.')) : null;
    const selectedCylNum = selectedCyl ? parseFloat(selectedCyl.replace(',', '.')) : null;

    const consultantMatchingSkus = skus.map(sku => {
      const family = familiesMap.get(sku.family_id);
      const branchQtys = inventoryMatrix[sku.id] || {};
      const totalQty = Object.entries(branchQtys).reduce((sum: number, [bId, q]) => {
        if (activeBranchIds.has(bId)) {
          return sum + (q as number || 0);
        }
        return sum;
      }, 0);

      let sphericalNum = 0;
      if (sku.spherical !== undefined && sku.spherical !== null) {
        if (typeof sku.spherical === 'number') {
          sphericalNum = sku.spherical;
        } else {
          sphericalNum = parseFloat(String(sku.spherical).replace(',', '.').trim()) || 0;
        }
      }

      let cylindricalNum = 0;
      if (sku.cylindrical !== undefined && sku.cylindrical !== null) {
        if (typeof sku.cylindrical === 'number') {
          cylindricalNum = sku.cylindrical;
        } else {
          cylindricalNum = parseFloat(String(sku.cylindrical).replace(',', '.').trim()) || 0;
        }
      }

      return {
        ...sku,
        sphericalNum,
        cylindricalNum,
        family,
        branchQtys,
        totalQty
      };
    }).filter(item => {
      if (selectedSphNum !== null) {
        if (Math.abs(item.sphericalNum - selectedSphNum) > 0.01) {
          return false;
        }
      }
      if (selectedCylNum !== null) {
        if (Math.abs(item.cylindricalNum - selectedCylNum) > 0.01) {
          return false;
        }
      }
      
      const matchManufacturer = !selectedManufacturer || item.family?.manufacturer === selectedManufacturer;
      const matchLine = !selectedLine || item.family?.line === selectedLine;

      return matchManufacturer && matchLine;
    });

    const consultantTotalStockSum = consultantMatchingSkus.reduce((sum, item) => sum + item.totalQty, 0);

    return (
      <div className="max-w-3xl mx-auto py-10 px-4 space-y-10">
        {/* Simple elegant title and branding */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2.5">
            <Search className="text-brand-teal" size={32} />
            Consulta de Lentes
          </h1>
          <p className="text-slate-400 text-sm max-w-sm mx-auto font-medium">
            Selecione o grau Esférico e o Cilíndrico abaixo para consultar o estoque integrado.
          </p>
        </div>

        {/* 1 - Campo de Consulta (Esférico e Cilíndrico) */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl shadow-slate-100/50 border border-slate-100 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <SlidersHorizontal className="text-brand-teal" size={18} />
            <span className="font-extrabold text-slate-700 text-sm tracking-wide uppercase">Grau de Refração</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Esférico Field */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-450 uppercase tracking-widest">
                Esférico (ESFÉRICO)
              </label>
              <div className="relative">
                <select 
                  value={selectedSph}
                  onChange={(e) => setSelectedSph(e.target.value)}
                  className="w-full text-lg font-extrabold text-slate-750 bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 focus:bg-white focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="">Selecione o Esférico...</option>
                  {sphericalOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-450">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Cilíndrico Field */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-450 uppercase tracking-widest">
                Cilíndrico (CILINDRO)
              </label>
              <div className="relative">
                <select 
                  value={selectedCyl}
                  onChange={(e) => setSelectedCyl(e.target.value)}
                  className="w-full text-lg font-extrabold text-slate-750 bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 focus:bg-white focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal transition-all outline-none appearance-none cursor-pointer"
                >
                  <option value="">Selecione o Cilíndrico...</option>
                  {cylindricalOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-450">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Optional brand/line pickers separated visually as advanced filters */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Filtros Opcionais de Fabricação</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Manufacturer */}
              <div>
                <select
                  value={selectedManufacturer}
                  onChange={(e) => { setSelectedManufacturer(e.target.value); setSelectedLine(''); }}
                  className="w-full text-xs font-bold text-slate-600 bg-slate-50/70 border border-slate-200 rounded-xl py-2.5 px-3 focus:bg-white transition-all outline-none cursor-pointer"
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
                  onChange={(e) => setSelectedLine(e.target.value)}
                  className="w-full text-xs font-bold text-slate-600 bg-slate-50/70 border border-slate-200 rounded-xl py-2.5 px-3 focus:bg-white transition-all outline-none cursor-pointer"
                >
                  <option value="">Linha da Lente (Todas)</option>
                  {lines.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {(selectedSph || selectedCyl || selectedManufacturer || selectedLine) && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  setSelectedSph('');
                  setSelectedCyl('');
                  setSelectedManufacturer('');
                  setSelectedLine('');
                }}
                className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <X size={14} />
                Limpar Consulta
              </button>
            </div>
          )}
        </div>

        {/* 2 - Resultado Geral da Somatória do Estoque das Filiais: "ESTOQUE GERAL" */}
        <div className="bg-gradient-to-br from-brand-cyan to-slate-900 text-white rounded-3xl shadow-2xl p-8 text-center space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
          
          <h2 className="text-xs uppercase tracking-widest text-cyan-200/90 font-black">
            ESTOQUE GERAL
          </h2>

          <div className="relative inline-block">
            {loading ? (
              <div className="h-20 flex items-center justify-center">
                <span className="animate-pulse text-lg text-cyan-150 font-bold">Verificando estoque...</span>
              </div>
            ) : (!selectedSph || !selectedCyl) ? (
              <div className="py-2 text-cyan-200/70 font-semibold text-sm tracking-wide max-w-sm mx-auto">
                Selecione os dioptros Esférico e Cilíndrico acima para exibir a somatória das filiais.
              </div>
            ) : (
              <div className="space-y-1">
                <span className="text-7xl font-black tracking-tighter block font-mono">
                  {consultantTotalStockSum}
                </span>
                <span className="text-xs font-extrabold text-cyan-200 uppercase tracking-widest block">
                  unidades em estoque
                </span>
              </div>
            )}
          </div>

          {selectedSph && selectedCyl && !loading && (
            <div className="text-xs text-cyan-200/60 font-semibold bg-white/5 py-1.5 px-3.5 rounded-full inline-block">
              Grau do filtro: SPH <span className="text-white font-bold">{selectedSph}</span> • CYL <span className="text-white font-bold">-{selectedCyl.replace('-', '')}</span>
            </div>
          )}
        </div>

        {/* Dynamic items found details listed (without individual branch quantities) */}
        {selectedSph && selectedCyl && !loading && consultantMatchingSkus.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-slate-150/80 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-450 uppercase tracking-widest border-b border-slate-100 pb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-brand-teal" />
              Especificação das Lentes Disponíveis
            </h3>
            <div className="bg-slate-50 border border-slate-150/50 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {consultantMatchingSkus.map(item => (
                <div key={item.id} className="p-3.5 flex justify-between items-center text-xs">
                  <div>
                    <h4 className="font-black text-slate-755">{item.sku_code}</h4>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {item.family?.manufacturer} • {item.family?.line} • {item.family?.treatment || 'Sem tratamento'}
                    </p>
                  </div>
                  <span className="font-black text-slate-700 bg-white shadow-xs border border-slate-150 py-1 px-3.5 rounded-full">
                    {item.totalQty} un.
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

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
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={esfFilter}
                  onChange={handleEsfChange}
                  onBlur={handleEsfBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDioptres(); }}
                  onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                  placeholder="0,00"
                  className="w-14 text-center bg-transparent border-none outline-none font-bold text-slate-700 text-xs px-0 overflow-hidden py-0 leading-none"
                />
              </div>
            </div>

            {/* Cilíndrico */}
            <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/60 shadow-sm">
              <span className="text-xs font-bold text-slate-500 px-1">CIL *</span>
              <span className="text-xs font-black px-1.5 py-1 bg-red-100 text-red-600 rounded-lg">-</span>

              <div className="flex items-center space-x-1">
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={cilFilter}
                  onChange={handleCilChange}
                  onBlur={handleCilBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyDioptres(); }}
                  onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                  placeholder="0,00"
                  className="w-14 text-center bg-transparent border-none outline-none font-bold text-slate-700 text-xs px-0 overflow-hidden py-0 leading-none"
                />
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

      {/* Results Header Section */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Package size={18} className="text-slate-400 font-bold" />
          <span className="text-sm font-bold text-slate-700">
            {displayedSkusList.length === 1 ? '1 resultado encontrado' : `${displayedSkusList.length} resultados encontrados`}
          </span>
          {(appliedEsfFilter || appliedCilFilter) && (
            <span className="px-2.5 py-0.5 text-[10px] font-black bg-teal-50 text-teal-700 border border-teal-100 rounded-full flex items-center gap-1.5 font-sans">
              Filtro: {appliedEsfFilter ? `ESF ${appliedEsfSign}${appliedEsfFilter}` : ''}
              {appliedEsfFilter && appliedCilFilter ? ' • ' : ''}
              {appliedCilFilter ? `CIL -${appliedCilFilter}` : ''}
              <button onClick={handleClearDioptres} className="hover:text-rose-600 transition-colors cursor-pointer p-0.5 hover:bg-rose-50 rounded" title="Limpar Filtro">
                <X size={10} strokeWidth={3} />
              </button>
            </span>
          )}
        </div>
        
        {/* Toggle Visualização */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Visualização:</span>
          <div className="flex p-0.5 bg-slate-100 rounded-lg items-center h-8 w-36">
            <button 
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                "flex-1 h-full text-[11px] font-bold rounded-md flex items-center justify-center transition-all cursor-pointer border-none outline-none focus:ring-0",
                viewMode === 'list' ? "bg-white shadow-xs text-brand-teal font-extrabold" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Lista
            </button>
            <button 
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex-1 h-full text-[11px] font-bold rounded-md flex items-center justify-center transition-all cursor-pointer border-none outline-none focus:ring-0",
                viewMode === 'grid' ? "bg-white shadow-xs text-brand-teal font-extrabold" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Grade
            </button>
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
        ) : displayedSkusList.length === 0 ? (
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
            {viewMode === 'list' ? (
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
                          {formatCylinder(item.cylindrical)}
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
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto p-6">
                  <div className="min-w-fit">
                    <div 
                      className="grid gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden"
                      style={{
                        gridTemplateColumns: `90px repeat(${cilScale.length}, minmax(110px, 1fr))`
                      }}
                    >
                    {/* Header Row */}
                    <div className="bg-slate-50 p-4 text-[10px] font-extrabold text-slate-500 uppercase text-center flex items-center justify-center">
                      ESF \ CIL
                    </div>
                    {cilScale.map(cil => (
                      <div key={cil} className="bg-slate-50 p-4 text-[10px] font-extrabold text-slate-600 text-center flex items-center justify-center">
                        {formatCylinder(parseFloat(cil))}
                      </div>
                    ))}

                    {/* Data Rows */}
                    {esfScale.map(esf => (
                      <React.Fragment key={esf}>
                        <div className="bg-slate-50 p-4 text-[10px] font-extrabold text-slate-600 text-center flex items-center justify-center font-mono">
                          {formatRefraction(parseFloat(esf))}
                        </div>
                        {cilScale.map(cil => {
                          const matchingItems = filteredSkusList.filter(i => 
                            Math.abs(Number(i.spherical) - parseFloat(esf)) < 0.01 && 
                            Math.abs(Number(i.cylindrical) - parseFloat(cil)) < 0.01
                          );
                          const totalQty = matchingItems.reduce((acc, i) => acc + i.totalQty, 0);

                          return (
                            <div 
                              key={`${esf}_${cil}`} 
                              className={cn(
                                "bg-white p-3 text-center relative transition-colors group flex flex-col items-center justify-center min-h-[85px] w-full cursor-pointer hover:bg-slate-50",
                                totalQty === 0 ? "text-slate-200" : "text-brand-teal"
                              )}
                              onClick={() => {
                                // Set the filters matching this cell's dioptre values
                                const numericEsf = parseFloat(esf);
                                const newEsfSign = numericEsf < 0 ? '-' : '+';
                                const rawEsf = Math.abs(numericEsf).toFixed(2).replace('.', ',');
                                const rawCil = Math.abs(parseFloat(cil)).toFixed(2).replace('.', ',');
                                
                                setEsfSign(newEsfSign);
                                setEsfFilter(rawEsf);
                                setCilFilter(rawCil);
                                
                                setAppliedEsfFilter(rawEsf);
                                setAppliedCilFilter(rawCil);
                                setAppliedEsfSign(newEsfSign);
                                
                                // Switch to list view to inspect the items
                                setViewMode('list');
                                setCurrentPage(1);
                              }}
                            >
                              {totalQty > 0 ? (
                                <div className="flex flex-col items-center justify-center space-y-1 w-full">
                                  <span className="text-xs font-black text-brand-teal">{totalQty} un</span>
                                  <div className="w-full flex flex-col gap-0.5 text-[8px] font-bold text-slate-500 bg-slate-50 border border-slate-100 p-1.5 rounded-md">
                                    {branches.map(b => {
                                      const branchQty = matchingItems.reduce((sum, item) => sum + (item.branchQtys[b.id] || 0), 0);
                                      return (
                                        <div key={b.id} className="flex justify-between items-center px-0.5">
                                          <span className="text-slate-400 uppercase text-[7px] truncate max-w-[50px]" title={b.name}>{b.name.split(' ')[0]}</span>
                                          <span className={cn(branchQty > 0 ? "text-orange-500 font-black" : "text-slate-300 font-medium")}>{branchQty}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-200 font-bold text-xs">—</span>
                              )}
                            </div>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {/* PAGINATION PANEL */}
        {!loading && viewMode === 'list' && totalPages > 1 && (
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
