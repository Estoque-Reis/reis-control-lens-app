import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Minus,
  X,
  ArrowRightLeft, 
  ArrowUpCircle, 
  ArrowDownCircle,
  MoreVertical,
  History,
  Package,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { db, auth, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { collection, getDocs, query, where, doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/src/hooks/useAuth';
import { LensSku, InventoryItem, Branch, LensFamily } from '@/src/types';
import { cn, formatRefraction, generateSkuCode } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Inventory() {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [families, setFamilies] = useState<LensFamily[]>([]);
  
  // Refraction Search State
  const [esfSign, setEsfSign] = useState<'+' | '-'>('+');
  const [refSearch, setRefSearch] = useState({ esf: '', cil: '' });
  const [appliedRefSearch, setAppliedRefSearch] = useState({ esf: '', cil: '', esfSign: '+' });
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const handleApplyFilter = () => {
    let formattedEsf = refSearch.esf.trim();
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
      if (num > 2.0) num = 2.0;
      num = Math.round(num * 4) / 4;
      formattedEsf = num.toFixed(2).replace('.', ',');
    }

    let formattedCil = refSearch.cil.trim();
    if (formattedCil) {
      if (formattedCil.startsWith('-') || formattedCil.startsWith('+')) {
        formattedCil = formattedCil.substring(1).trim();
      }
      let num = parseFloat(formattedCil.replace(',', '.')) || 0;
      num = Math.abs(num); // cylindrical magnitude is positive in input but visualized as negative
      if (num > 2.0) num = 2.0;
      num = Math.round(num * 4) / 4;
      formattedCil = num.toFixed(2).replace('.', ',');
    }

    setEsfSign(currentEsfSign);
    setRefSearch({ esf: formattedEsf, cil: formattedCil });
    setAppliedRefSearch({
      esf: formattedEsf,
      cil: formattedCil,
      esfSign: currentEsfSign
    });
    setIsFilterActive(!!formattedEsf || !!formattedCil);
  };

  const handleClearFilter = () => {
    setRefSearch({ esf: '', cil: '' });
    setEsfSign('+');
    setAppliedRefSearch({ esf: '', cil: '', esfSign: '+' });
    setIsFilterActive(false);
  };

  const maskValue = (value: string) => {
    // Retorna apenas dígitos, limite 3
    let digits = value.replace(/\D/g, '').slice(0, 3);
    
    if (digits.length === 0) return '';
    // Lógica para dioptrias: 
    // 1 dígito -> X,00
    // 2 dígitos -> 0,XY (mais comum para 25, 50, 75 dioptrias)
    // 3 dígitos -> X,YZ
    if (digits.length === 1) return `${digits},00`;
    if (digits.length === 2) {
      // Se começou com 0, mantém 0,X0. Se não, trata como centesimal 0,XY
      return `0,${digits}`;
    }
    return `${digits[0]},${digits[1]}${digits[2]}`;
  };

  const stepRefraction = (field: 'esf' | 'cil', direction: 'up' | 'down') => {
    const prevValStr = refSearch[field] || '0,00';
    let val = parseFloat(prevValStr.replace(',', '.')) || 0;
    
    // Para ESF, considera o sinal do estado
    if (field === 'esf' && esfSign === '-') val = -val;
    // CIL é sempre negativo visualmente, então o valor interno é tratado como negativo
    if (field === 'cil') val = -val;

    const step = 0.25;
    let newVal = direction === 'up' ? val + step : val - step;

    if (field === 'esf') {
      // Limite ESF: +2.00 a -2.00
      if (newVal > 2) newVal = 2;
      if (newVal < -2) newVal = -2;

      if (newVal < 0) setEsfSign('-');
      else setEsfSign('+');
      setRefSearch(prev => ({ ...prev, esf: Math.abs(newVal).toFixed(2).replace('.', ',') }));
    } else {
      // Limite CIL: 0.00 a -2.00
      if (newVal > 0) newVal = 0;
      if (newVal < -2) newVal = -2;

      setRefSearch(prev => ({ ...prev, cil: Math.abs(newVal).toFixed(2).replace('.', ',') }));
    }
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
    setRefSearch(prev => ({ ...prev, esf: formatted }));
  };

  const handleEsfBlur = () => {
    let esfVal = refSearch.esf.trim();
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
    if (num > 2.0) num = 2.0;
    
    num = Math.round(num * 4) / 4;
    setRefSearch(prev => ({ ...prev, esf: num.toFixed(2).replace('.', ',') }));
  };

  const handleCilChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatInputWithAutoComma(e.target.value);
    setRefSearch(prev => ({ ...prev, cil: formatted }));
  };

  const handleCilBlur = () => {
    let cilVal = refSearch.cil.trim();
    if (!cilVal) return;
    
    if (cilVal.startsWith('-') || cilVal.startsWith('+')) {
      cilVal = cilVal.substring(1);
    }
    
    let num = parseFloat(cilVal.replace(',', '.')) || 0;
    
    if (num > 2.0) num = 2.0;
    if (num < 0) num = 0;
    
    num = Math.round(num * 4) / 4;
    setRefSearch(prev => ({ ...prev, cil: num.toFixed(2).replace('.', ',') }));
  };

  // Dioptre Scales for Grid
  const esfScale = Array.from({ length: 17 }, (_, i) => (2 - i * 0.25).toFixed(2));
  const cilScale = Array.from({ length: 9 }, (_, i) => (-i * 0.25).toFixed(2));

  // Modal states
  const [showModal, setShowModal] = useState<'entry' | 'exit' | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);

  const [showNewSkuModal, setShowNewSkuModal] = useState(false);
  const [newSkuId, setNewSkuId] = useState('');
  const [newBranchId, setNewBranchId] = useState('');
  const [newQty, setNewQty] = useState('0');
  const [allSkus, setAllSkus] = useState<any[]>([]);

  const fetchAllSkus = async () => {
    const skus = await getCachedSkus();
    setAllSkus(skus);
  };

  const handleCreateInventory = async () => {
    if (!newSkuId || !newBranchId) return;
    setMovementLoading(true);
    try {
      const invId = `${newBranchId}_${newSkuId}`;
      const invRef = doc(db, 'inventory', invId);
      
      await setDoc(invRef, {
        branch_id: newBranchId,
        sku_id: newSkuId,
        quantity: parseInt(newQty),
        updated_at: serverTimestamp()
      });

      alert('Item adicionado ao estoque!');
      setShowNewSkuModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao adicionar item.');
    } finally {
      setMovementLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchFamilies();
    fetchAllSkus();
  }, []);

  const fetchFamilies = async () => {
    const snap = await getDocs(collection(db, 'lensFamilies'));
    setFamilies(snap.docs.map(d => ({ id: d.id, ...d.data() } as LensFamily)));
  };

  const handleMovement = async () => {
    if (!selectedItem || !qty || parseInt(qty) <= 0) return;
    
    setMovementLoading(true);
    const amount = parseInt(qty);
    const finalQty = showModal === 'entry' ? amount : -amount;
    const path = `inventory/${selectedItem.id}`;

    try {
      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, 'inventory', selectedItem.id);
        const invDoc = await transaction.get(invRef);
        
        let currentQty = 0;
        if (invDoc.exists()) {
          currentQty = invDoc.data().quantity || 0;
        }

        const newQty = currentQty + finalQty;
        if (newQty < 0) throw new Error("Estoque insuficiente!");

        // Update inventory (creates document if doesn't exist yet via set with merge)
        transaction.set(invRef, {
          branch_id: selectedItem.branch_id,
          sku_id: selectedItem.sku_id,
          quantity: newQty,
          updated_at: serverTimestamp()
        }, { merge: true });

        // Create movement log
        const movRef = doc(collection(db, 'movements'));
        transaction.set(movRef, {
          branch_id: selectedItem.branch_id,
          sku_id: selectedItem.sku_id,
          type: showModal === 'entry' ? 'entry' : 'exit',
          quantity: amount,
          reason: reason || (showModal === 'entry' ? 'Entrada manual' : 'Saída manual'),
          user_id: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      });

      alert('Operação realizada com sucesso!');
      setShowModal(null);
      setQty('1');
      setReason('');
      fetchData();
    } catch (err: any) {
      console.error("Erro no movimento:", err);
      alert("Erro: " + err.message);
    } finally {
      setMovementLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedBranch, profile]);

  const fetchBranches = async () => {
    try {
      const branchesData = await getCachedBranches();
      setBranches(branchesData as Branch[]);
    } catch (err) {
      console.error("Error fetching branches:", err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const currentBranchId = selectedBranch || profile?.branch_id;
      if (!selectedBranch && profile?.branch_id) {
        setSelectedBranch(profile.branch_id);
      }

      // 1. Fetch Inventory for the branch
      let invQuery = collection(db, 'inventory');
      let q = query(invQuery);
      if (currentBranchId) {
        q = query(invQuery, where('branch_id', '==', currentBranchId));
      }

      // Fetch inventory concurrently with static SKUs/Families from local memory cache
      const [invSnapshot, skus, families] = await Promise.all([
        getDocs(q),
        getCachedSkus(),
        getCachedFamilies()
      ]);

      const invData = invSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      if (invData.length === 0) {
        setItems([]);
        return;
      }

      // Map SKUs and Families in-memory for O(1) joins
      const skusMap: Record<string, any> = {};
      skus.forEach(s => {
        skusMap[s.id] = s;
      });

      const familiesMap: Record<string, any> = {};
      families.forEach(f => {
        familiesMap[f.id] = f;
      });

      // 4. Join data
      const joinedData = invData.map((item: any) => {
        const sku = skusMap[item.sku_id];
        const family = sku ? familiesMap[sku.family_id] : null;
        return {
          ...item,
          sku: sku ? { ...sku, family } : null
        };
      }).filter(item => item.sku !== null); // Only show items that have actual SKU data

      setItems(joinedData);
    } catch (err) {
      console.error("Error fetching inventory:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => {
    const sku = item?.sku;
    if (!sku) return false;
    
    const skuCode = sku.sku_code || '';
    const manufacturer = sku.family?.manufacturer || '';
    
    // Normalize both strings to match either dots or commas (e.g., -1.75 matches -1,75)
    const normalizedSkuCode = skuCode.toLowerCase().replace(/,/g, '.');
    const normalizedSearchQuery = searchQuery.toLowerCase().replace(/,/g, '.');
    
    const matchSearch = normalizedSkuCode.includes(normalizedSearchQuery) ||
                       manufacturer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchFamily = !selectedFamily || sku.family_id === selectedFamily;

    // Dioptre filtering logic based on applied search
    const cleanEsfSearch = appliedRefSearch.esf.replace(',', '.').trim();
    const magnitudeEsf = cleanEsfSearch.replace(/^[+-]/, '').trim();
    const parsedEsf = parseFloat(magnitudeEsf) || 0;
    const esfSearch = (appliedRefSearch.esfSign === '-' || cleanEsfSearch.startsWith('-')) ? -parsedEsf : parsedEsf;
    
    const cleanCilSearch = appliedRefSearch.cil.replace(',', '.').trim();
    const magnitudeCil = cleanCilSearch.replace(/^[+-]/, '').trim();
    const parsedCil = parseFloat(magnitudeCil) || 0;
    const cilSearch = -Math.abs(parsedCil);

    let itemSpherical = 0;
    if (sku.spherical !== undefined && sku.spherical !== null) {
      if (typeof sku.spherical === 'number') {
        itemSpherical = sku.spherical;
      } else {
        itemSpherical = parseFloat(String(sku.spherical).replace(',', '.').trim()) || 0;
      }
    }

    let itemCylindrical = 0;
    if (sku.cylindrical !== undefined && sku.cylindrical !== null) {
      if (typeof sku.cylindrical === 'number') {
        itemCylindrical = sku.cylindrical;
      } else {
        itemCylindrical = parseFloat(String(sku.cylindrical).replace(',', '.').trim()) || 0;
      }
    }

    const matchEsf = !appliedRefSearch.esf || Math.abs(itemSpherical - esfSearch) < 0.01;
    const matchCil = !appliedRefSearch.cil || Math.abs(itemCylindrical - cilSearch) < 0.01;

    return matchSearch && matchEsf && matchCil && matchFamily;
  });

  const displayedItems = React.useMemo(() => {
    // If no dioptre filter (quick filter) is active, just return filteredItems
    if (!appliedRefSearch.esf && !appliedRefSearch.cil) {
      return filteredItems;
    }

    // Otherwise, we are querying dioptre. Let's make sure all families are represented
    const cleanEsfSearch = appliedRefSearch.esf.replace(',', '.').trim();
    const magnitudeEsf = cleanEsfSearch.replace(/^[+-]/, '').trim();
    const parsedEsf = parseFloat(magnitudeEsf) || 0;
    const esfSearch = (appliedRefSearch.esfSign === '-' || cleanEsfSearch.startsWith('-')) ? -parsedEsf : parsedEsf;
    
    const cleanCilSearch = appliedRefSearch.cil.replace(',', '.').trim();
    const magnitudeCil = cleanCilSearch.replace(/^[+-]/, '').trim();
    const parsedCil = parseFloat(magnitudeCil) || 0;
    const cilSearch = -Math.abs(parsedCil);

    // Filter families that match the family selection (if any) and search query
    const targetFamilies = families.filter(f => {
      const matchFamily = !selectedFamily || f.id === selectedFamily;
      const matchSearch = !searchQuery || 
        f.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.line.toLowerCase().includes(searchQuery.toLowerCase());
      return matchFamily && matchSearch;
    });

    return targetFamilies.map(f => {
      // Find if we have an existing item for this family and dioptre
      const existing = filteredItems.find(item => 
        item.sku?.family_id === f.id &&
        Math.abs((item.sku?.spherical || 0) - esfSearch) < 0.01 &&
        Math.abs((item.sku?.cylindrical || 0) - cilSearch) < 0.01
      );

      if (existing) {
        return existing;
      }

      // If no existing mapping, generate a virtual placeholder
      const branchId = selectedBranch || profile?.branch_id || 'global';
      const skuCode = generateSkuCode(f.line, esfSearch, cilSearch);
      return {
        id: `virtual_${f.id}_${esfSearch}_${cilSearch}`,
        branch_id: branchId,
        sku_id: `virtual_sku_${f.id}`,
        quantity: 0,
        sku: {
          id: `virtual_sku_${f.id}`,
          family_id: f.id,
          sku_code: skuCode,
          spherical: esfSearch,
          cylindrical: cilSearch,
          family: f
        },
        isVirtual: true,
        updated_at: new Date().toISOString()
      };
    });
  }, [filteredItems, families, appliedRefSearch, selectedFamily, searchQuery, selectedBranch, profile]);

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Controle de Estoque</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie a disponibilidade de lentes em tempo real.</p>
        </div>
        
        {isAdmin && (
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                fetchAllSkus();
                setShowNewSkuModal(true);
              }}
              className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors"
            >
              <Plus size={18} className="mr-2" /> Nova Entrada
            </button>
            <button className="flex items-center px-4 py-2 bg-amber-50 text-amber-600 rounded-lg text-sm font-semibold hover:bg-amber-100 transition-colors">
              <ArrowRightLeft size={18} className="mr-2" /> Transferência
            </button>
          </div>
        )}
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
        {/* Branch Selector */}
        <div className="md:col-span-6 lg:col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Filial</label>
          <select 
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-teal transition-all text-slate-700 font-medium"
          >
            <option value="">Todas as Filiais</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Family Selector */}
        <div className="md:col-span-6 lg:col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Família de Lentes</label>
          <select 
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-teal transition-all text-slate-700 font-medium"
          >
            <option value="">Todas as Famílias</option>
            {families.map(f => <option key={f.id} value={f.id}>{f.manufacturer} - {f.line}</option>)}
          </select>
        </div>

        {/* Refraction Search */}
        <div className="md:col-span-12 lg:col-span-8">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Consulta por Refração (Filtro Rápido)</label>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* ESF (Spherical) Input Card */}
            <div className="flex-1 flex bg-white border-2 border-slate-300 rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-brand-teal/15 focus-within:border-brand-teal transition-all h-14 shadow-sm min-w-0">
              <div className="bg-brand-teal text-white w-10 px-0.5 h-full flex items-center justify-center font-black text-xs uppercase select-none shrink-0 antialiased">
                ESF
              </div>
              <button 
                onClick={() => setEsfSign(prev => prev === '+' ? '-' : '+')}
                className={cn(
                  "w-9 h-full flex items-center justify-center text-xl font-black border-r border-slate-100 hover:bg-slate-50 active:bg-slate-100 transition-colors shrink-0 cursor-pointer",
                  esfSign === '+' ? "text-emerald-600 animate-pulse" : "text-rose-600 animate-pulse"
                )}
                title="Alternar Sinal (Sinal de ESF)"
              >
                {esfSign}
              </button>
              <input 
                type="text" 
                value={refSearch.esf}
                onChange={handleEsfChange}
                onBlur={handleEsfBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApplyFilter();
                  }
                }}
                onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                className="flex-1 min-w-[70px] h-full text-center text-base sm:text-lg font-black text-slate-800 placeholder-slate-400 bg-slate-50/70 hover:bg-slate-100/30 focus:bg-white focus:text-slate-900 border-none outline-none focus:outline-none focus:ring-0 focus:border-none px-1 transition-all overflow-hidden py-0 leading-none"
                placeholder="0,00"
              />
              <div className="flex items-center h-full shrink-0 pr-1 border-l border-slate-100 bg-slate-50/70">
                {refSearch.esf && (
                  <button 
                    onClick={() => {
                      setRefSearch(prev => ({ ...prev, esf: '' }));
                      setAppliedRefSearch(prev => ({ ...prev, esf: '' }));
                      setIsFilterActive(!!refSearch.cil);
                    }}
                    className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all border-none outline-none focus:ring-0 cursor-pointer mr-1"
                    title="Limpar"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="flex flex-col justify-center h-full w-6 animate-none shrink-0">
                  <button 
                    onClick={() => stepRefraction('esf', 'up')} 
                    className="flex-grow flex items-center justify-center hover:bg-slate-200/50 text-slate-600 hover:text-brand-teal active:scale-95 transition-all h-1/2 cursor-pointer"
                    title="Aumentar (+0.25)"
                  >
                    <ChevronUp size={14} strokeWidth={3} />
                  </button>
                  <button 
                    onClick={() => stepRefraction('esf', 'down')} 
                    className="flex-grow flex items-center justify-center hover:bg-slate-200/50 text-slate-600 hover:text-brand-teal active:scale-95 transition-all h-1/2 border-t border-slate-200/20 cursor-pointer"
                    title="Diminuir (-0.25)"
                  >
                    <ChevronDown size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            {/* CIL (Cylindrical) Input Card */}
            <div className="flex-1 flex bg-white border-2 border-slate-300 rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-brand-teal/15 focus-within:border-brand-teal transition-all h-14 shadow-sm min-w-0">
              <div className="bg-brand-teal text-white w-10 px-0.5 h-full flex items-center justify-center font-black text-xs uppercase select-none shrink-0 antialiased">
                CIL
              </div>
              <div 
                className="w-9 h-full flex items-center justify-center text-xl font-black border-r border-slate-100 text-rose-600 select-none shrink-0 bg-rose-50/10"
                title="Sinal Negativo Padrão"
              >
                -
              </div>
              <input 
                type="text" 
                value={refSearch.cil}
                onChange={handleCilChange}
                onBlur={handleCilBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleApplyFilter();
                  }
                }}
                onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overflowX: 'hidden', overflowY: 'hidden' }}
                className="flex-1 min-w-[70px] h-full text-center text-base sm:text-lg font-black text-slate-800 placeholder-slate-400 bg-slate-50/70 hover:bg-slate-100/30 focus:bg-white focus:text-slate-900 border-none outline-none focus:outline-none focus:ring-0 focus:border-none px-1 transition-all overflow-hidden py-0 leading-none"
                placeholder="0,00"
              />
              <div className="flex items-center h-full shrink-0 pr-1 border-l border-slate-100 bg-slate-50/70">
                {refSearch.cil && (
                  <button 
                    onClick={() => {
                      setRefSearch(prev => ({ ...prev, cil: '' }));
                      setAppliedRefSearch(prev => ({ ...prev, cil: '' }));
                      setIsFilterActive(!!refSearch.esf);
                    }}
                    className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all border-none outline-none focus:ring-0 cursor-pointer mr-1"
                    title="Limpar"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="flex flex-col justify-center h-full w-6 animate-none shrink-0">
                  <button 
                    onClick={() => stepRefraction('cil', 'up')} 
                    className="flex-grow flex items-center justify-center hover:bg-slate-200/50 text-slate-600 hover:text-brand-teal active:scale-95 transition-all h-1/2 cursor-pointer"
                    title="Aumentar (+0.25)"
                  >
                    <ChevronUp size={14} strokeWidth={3} />
                  </button>
                  <button 
                    onClick={() => stepRefraction('cil', 'down')} 
                    className="flex-grow flex items-center justify-center hover:bg-slate-200/50 text-slate-600 hover:text-brand-teal active:scale-95 transition-all h-1/2 border-t border-slate-200/20 cursor-pointer"
                    title="Diminuir (-0.25)"
                  >
                    <ChevronDown size={14} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>

            <button 
              onClick={handleApplyFilter}
              className="bg-brand-teal hover:bg-teal-700 hover:brightness-110 active:scale-95 text-white px-6 h-14 rounded-xl text-sm font-bold shadow-md shadow-brand-teal/15 flex items-center justify-center sm:w-auto w-full gap-2 cursor-pointer transition-all"
            >
              <Filter size={16} />
              Filtrar
            </button>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-slate-400 px-1 font-semibold">
            <span>ESF: de +2,00 a -2,00</span>
            <span>CIL: de 0,00 a -2,00</span>
          </div>
        </div>

        {/* View Mode Choice */}
        <div className="md:col-span-12 lg:col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Visualização</label>
          <div className="flex p-1 bg-slate-50 rounded-lg h-14 items-center">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "flex-1 h-full py-1.5 text-xs font-bold rounded-lg flex items-center justify-center transition-all cursor-pointer",
                viewMode === 'list' ? "bg-white shadow-sm text-brand-teal font-extrabold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Lista
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "flex-1 h-full py-1.5 text-xs font-bold rounded-lg flex items-center justify-center transition-all cursor-pointer",
                viewMode === 'grid' ? "bg-white shadow-sm text-brand-teal font-extrabold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Grade
            </button>
          </div>
        </div>
      </div>

      {/* Results Header Section */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2.5">
          <Package size={18} className="text-slate-400 font-bold" />
          <span className="text-sm font-bold text-slate-700">
            {displayedItems.length === 1 ? '1 resultado encontrado' : `${displayedItems.length} resultados encontrados`}
          </span>
          {isFilterActive && (
            <span className="px-2.5 py-0.5 text-[10px] font-black bg-teal-50 text-teal-700 border border-teal-100 rounded-full flex items-center gap-1.5">
              Filtro: ESF {appliedRefSearch.esfSign}{appliedRefSearch.esf || '0,00'} • CIL -{appliedRefSearch.cil || '0,00'}
              <button onClick={handleClearFilter} className="hover:text-rose-600 transition-colors cursor-pointer p-0.5 hover:bg-rose-50 rounded" title="Limpar Filtro">
                <X size={10} strokeWidth={3} />
              </button>
            </span>
          )}
        </div>
        
        {isFilterActive && (
          <button 
            onClick={handleClearFilter}
            className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer hover:underline"
          >
            <X size={14} /> Limpar Todos os Filtros
          </button>
        )}
      </div>
            {/* Inventory Table */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">SKU / Produto</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Grade (ESF/CIL)</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Quantidade</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Última Att</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={6} className="px-6 py-8 bg-white"></td>
                    </tr>
                  ))
                ) : displayedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 flex flex-col items-center">
                      <Package size={48} className="mb-4 opacity-20" />
                      <p>Nenhum item encontrado no estoque.</p>
                    </td>
                  </tr>
                ) : (
                  displayedItems.map((item) => {
                    if (!item) return null;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800">{item.sku?.sku_code}</span>
                          <span className="text-xs text-slate-400">{item.sku?.family?.manufacturer} • {item.sku?.family?.line}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <span className="inline-block px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                            {formatRefraction(item.sku?.spherical)}
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="inline-block px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                            {formatRefraction(item.sku?.cylindrical)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-sm font-bold",
                          item.quantity <= (item.sku?.family?.min_stock_per_sku || 0) ? "text-red-500" : "text-slate-700"
                        )}>
                          {item.quantity} unid.
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.quantity <= (item.sku?.family?.min_stock_per_sku || 0) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 uppercase">
                            Crítico
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-600 uppercase">
                            Ok
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400">
                          {item.updated_at ? new Date(item.updated_at).toLocaleDateString('pt-BR') : '---'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowModal('entry');
                                }}
                                className="p-2 text-slate-400 hover:text-brand-teal transition-colors rounded-lg bg-slate-100 hover:bg-emerald-50" 
                                title="Entrada"
                              >
                                <Plus size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowModal('exit');
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg bg-slate-100 hover:bg-red-50" 
                                title="Saída"
                              >
                                <Minus size={16} />
                              </button>
                            </>
                          )}
                          <button className="p-2 text-slate-400 hover:text-brand-teal transition-colors rounded-lg bg-slate-100 hover:bg-emerald-50" title="Histórico">
                            <History size={16} />
                          </button>
                          {isAdmin && (
                            <>
                              <button className="p-2 text-slate-400 hover:text-amber-600 transition-colors rounded-lg bg-slate-100 hover:bg-amber-50" title="Transferir">
                                <ArrowRightLeft size={16} />
                              </button>
                              <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg bg-slate-100">
                                <MoreVertical size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto p-6">
            <div className="min-w-fit">
              <div className="grid grid-cols-[80px_repeat(9,minmax(60px,1fr))] gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {/* Header Row */}
                <div className="bg-slate-50 p-3 text-[10px] font-bold text-slate-400 uppercase text-center flex items-center justify-center">
                  ESF \ CIL
                </div>
                {cilScale.map(cil => (
                  <div key={cil} className="bg-slate-50 p-3 text-[10px] font-bold text-slate-600 text-center">
                    {formatRefraction(parseFloat(cil))}
                  </div>
                ))}

                {/* Data Rows */}
                {esfScale.map(esf => (
                  <React.Fragment key={esf}>
                    <div className="bg-slate-50 p-3 text-[10px] font-bold text-slate-600 text-center flex items-center justify-center">
                      {formatRefraction(parseFloat(esf))}
                    </div>
                    {cilScale.map(cil => {
                      const matchingItems = filteredItems.filter(i => 
                        Math.abs(Number(i.sku?.spherical) - parseFloat(esf)) < 0.01 && 
                        Math.abs(Number(i.sku?.cylindrical) - parseFloat(cil)) < 0.01
                      );
                      const totalQty = matchingItems.reduce((acc, i) => acc + i.quantity, 0);
                      const minStock = matchingItems[0]?.sku?.family?.min_stock_per_sku || 0;

                      return (
                        <div 
                          key={`${esf}_${cil}`} 
                          className={cn(
                            "bg-white p-3 text-sm font-bold text-center relative transition-colors group cursor-pointer hover:bg-slate-50",
                            totalQty === 0 ? "text-slate-200" : (totalQty <= minStock ? "text-red-500" : "text-brand-teal")
                          )}
                          onClick={() => {
                            // Set the filters matching this cell's dioptre values
                            const numericEsf = parseFloat(esf);
                            const newEsfSign = numericEsf < 0 ? '-' : '+';
                            const rawEsf = Math.abs(numericEsf).toFixed(2).replace('.', ',');
                            const rawCil = Math.abs(parseFloat(cil)).toFixed(2).replace('.', ',');
                            
                            setEsfSign(newEsfSign);
                            setRefSearch({ esf: rawEsf, cil: rawCil });
                            
                            setAppliedRefSearch({
                              esf: rawEsf,
                              cil: rawCil,
                              esfSign: newEsfSign
                            });
                            setIsFilterActive(true);
                            setViewMode('list');
                          }}
                        >
                          {totalQty > 0 ? totalQty : '—'}
                          {matchingItems.length > 1 && (
                            <span className="absolute top-1 right-1 text-[8px] bg-slate-100 text-slate-400 px-1 rounded-full">
                              +{matchingItems.length - 1}
                            </span>
                          )}
                          {isAdmin && (
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-brand-teal/5 pointer-events-none"></div>
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
      {/* New Product Modal */}
      <AnimatePresence>
        {showNewSkuModal && (
          <motion.div 
            key="new-sku-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Adicionar Lente ao Estoque</h3>
                <button onClick={() => setShowNewSkuModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Filial</label>
                  <select 
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700"
                  >
                    <option value="">Selecione a Filial</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">SKU da Lente</label>
                  <select 
                    value={newSkuId}
                    onChange={(e) => setNewSkuId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700"
                  >
                    <option value="">Selecione o SKU</option>
                    {allSkus.map(s => <option key={s.id} value={s.id}>{s.sku_code}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Quantidade Inicial</label>
                  <input 
                    type="number"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700"
                  />
                </div>
              </div>

              <div className="mt-8 flex space-x-3">
                <button 
                  onClick={() => setShowNewSkuModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleCreateInventory}
                  disabled={movementLoading}
                  className="flex-1 px-6 py-3 bg-brand-teal text-white rounded-xl font-bold text-sm shadow-lg shadow-teal-900/10 disabled:opacity-50"
                >
                  {movementLoading ? 'Salvando...' : 'Adicionar ao Estoque'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Movement Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div 
            key="movement-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                  {showModal === 'entry' ? 'Registrar Entrada' : 'Registrar Saída'}
                </h3>
                <button onClick={() => setShowModal(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 trasition-colors">
                  <X size={20} />
                </button>
              </div>

              {selectedItem && (
                <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Item Selecionado</p>
                  <p className="text-sm font-bold text-slate-700">{selectedItem.sku?.sku_code}</p>
                  <p className="text-xs text-slate-500">{selectedItem.sku?.family?.manufacturer} - {selectedItem.sku?.family?.line}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quantidade</label>
                  <input 
                    type="number" 
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Motivo / Observação</label>
                  <textarea 
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal h-24 resize-none"
                    placeholder="Ex: Nota fiscal, Venda, Ajuste..."
                  />
                </div>
              </div>

              <div className="mt-8 flex space-x-3">
                <button 
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleMovement}
                  disabled={movementLoading}
                  className={`flex-1 px-6 py-3 text-white rounded-xl font-bold text-sm transition-all shadow-lg ${
                    showModal === 'entry' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-red-500 hover:bg-red-600 shadow-red-500/20'
                  } disabled:opacity-50`}
                >
                  {movementLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
