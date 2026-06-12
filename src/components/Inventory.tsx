import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Minus,
  MinusCircle,
  X,
  ArrowRightLeft, 
  ArrowUpCircle, 
  ArrowDownCircle,
  MoreVertical,
  History,
  Package,
  ChevronUp,
  ChevronDown,
  Settings,
  SlidersHorizontal
} from 'lucide-react';
import { db, auth, getCachedBranches, getCachedFamilies, getCachedSkus, clearCache } from '@/src/lib/firebase';
import { collection, getDocs, query, where, doc, getDoc, runTransaction, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '@/src/hooks/useAuth';
import { LensSku, InventoryItem, Branch, LensFamily } from '@/src/types';
import { cn, formatRefraction, formatCylinder, generateSkuCode } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

function formatUpdateDate(updatedAt: any): string {
  if (!updatedAt) return '---';
  try {
    // If it has seconds property (like a Firestore Timestamp object)
    if (updatedAt && typeof updatedAt === 'object' && typeof updatedAt.toDate === 'function') {
      return updatedAt.toDate().toLocaleDateString('pt-BR');
    }
    if (updatedAt && typeof updatedAt === 'object' && typeof updatedAt.seconds === 'number') {
      return new Date(updatedAt.seconds * 1000).toLocaleDateString('pt-BR');
    }
    // If it is already a Date object
    if (updatedAt instanceof Date) {
      return updatedAt.toLocaleDateString('pt-BR');
    }
    // Try constructing Date
    const d = new Date(updatedAt);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
  } catch (e) {
    console.error(e);
  }
  return '---';
}

export default function Inventory() {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [isBranchInitialized, setIsBranchInitialized] = useState(false);
  const [movementBranchId, setMovementBranchId] = useState('');
  const [families, setFamilies] = useState<LensFamily[]>([]);

  useEffect(() => {
    if (profile?.branch_id && !selectedBranch && !isBranchInitialized) {
      setSelectedBranch(profile.branch_id);
      setIsBranchInitialized(true);
    }
  }, [profile, isBranchInitialized, selectedBranch]);
  
  // Refraction Search State
  const [esfSign, setEsfSign] = useState<'+' | '-'>('+');
  const [refSearch, setRefSearch] = useState({ esf: '', cil: '' });
  const [appliedRefSearch, setAppliedRefSearch] = useState({ esf: '', cil: '', esfSign: '+' });
  const [isFilterActive, setIsFilterActive] = useState(false);
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
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({
    esf_min: '-6.00',
    esf_max: '6.00',
    esf_step: '0.25',
    cil_min: '-2.50',
    cil_max: '0.00',
    cil_step: '0.25'
  });
  const [configSaving, setConfigSaving] = useState(false);

  const fetchGridConfig = async () => {
    try {
      const docRef = doc(db, 'configuracoes', 'grade_limites');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        let esf_min = typeof data.esf_min === 'number' ? data.esf_min : -6.00;
        let esf_max = typeof data.esf_max === 'number' ? data.esf_max : 6.00;
        let esf_step = typeof data.esf_step === 'number' ? data.esf_step : 0.25;
        let cil_min = typeof data.cil_min === 'number' ? data.cil_min : -2.50;
        let cil_max = typeof data.cil_max === 'number' ? data.cil_max : 0.00;
        let cil_step = typeof data.cil_step === 'number' ? data.cil_step : 0.25;

        // Auto-upgrade limits to fit at least the requested scope
        let needsUpdate = false;
        if (esf_min > -6.0) { esf_min = -6.0; needsUpdate = true; }
        if (esf_max < 6.0) { esf_max = 6.0; needsUpdate = true; }
        if (cil_min > -2.5) { cil_min = -2.5; needsUpdate = true; }
        if (cil_max < 0.0) { cil_max = 0.0; needsUpdate = true; }

        const conf = { esf_min, esf_max, esf_step, cil_min, cil_max, cil_step };

        if (needsUpdate) {
          try {
            await setDoc(docRef, {
              ...conf,
              updated_at: new Date().toISOString(),
              updated_by: 'system_auto_limit_upgrade'
            }, { merge: true });
          } catch (e) {
            console.warn("Could not write updated limits (permissions / role constraint) - using memory-grade defaults:", e);
          }
        }

        setGridConfig(conf);
        setConfigForm({
          esf_min: conf.esf_min.toFixed(2),
          esf_max: conf.esf_max.toFixed(2),
          esf_step: conf.esf_step.toFixed(2),
          cil_min: conf.cil_min.toFixed(2),
          cil_max: conf.cil_max.toFixed(2),
          cil_step: conf.cil_step.toFixed(2)
        });
      } else {
        const defaultLimits = {
          esf_min: -6.00,
          esf_max: 6.00,
          esf_step: 0.25,
          cil_min: -2.50,
          cil_max: 0.00,
          cil_step: 0.25,
          updated_at: new Date().toISOString(),
          updated_by: 'system_bootstrap'
        };
        try {
          await setDoc(docRef, defaultLimits);
        } catch (e) {
          console.warn("Could not save bootstrapped limits:", e);
        }
        setGridConfig({
          esf_min: -6.00,
          esf_max: 6.00,
          esf_step: 0.25,
          cil_min: -2.50,
          cil_max: 0.00,
          cil_step: 0.25,
        });
        setConfigForm({
          esf_min: '-6.00',
          esf_max: '6.00',
          esf_step: '0.25',
          cil_min: '-2.50',
          cil_max: '0.00',
          cil_step: '0.25'
        });
      }
    } catch (err) {
      console.error("Erro ao carregar configurações de limites do Firestore:", err);
    }
  };

  useEffect(() => {
    fetchGridConfig();
  }, []);

  const applyDirectFilter = (esfValue?: string, esfSignVal?: '+' | '-', cilValue?: string) => {
    setRefSearch(prev => {
      let formattedEsf = esfValue !== undefined ? esfValue.trim() : prev.esf;
      let currentEsfSign = esfSignVal !== undefined ? esfSignVal : esfSign;
      
      if (esfValue !== undefined && formattedEsf) {
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

      let formattedCil = cilValue !== undefined ? cilValue.trim() : prev.cil;
      if (cilValue !== undefined && formattedCil) {
        if (formattedCil.startsWith('-') || formattedCil.startsWith('+')) {
          formattedCil = formattedCil.substring(1).trim();
        }
        let num = parseFloat(formattedCil.replace(',', '.')) || 0;
        num = Math.abs(num); // cylindrical magnitude is positive in input but visualized as negative
        if (num > 4.0) num = 4.0;
        num = Math.round(num * 4) / 4;
        formattedCil = num.toFixed(2).replace('.', ',');
      }

      setAppliedRefSearch({
        esf: formattedEsf,
        cil: formattedCil,
        esfSign: currentEsfSign
      });
      setIsFilterActive(!!formattedEsf || !!formattedCil);
      setEsfSign(currentEsfSign);

      return { esf: formattedEsf, cil: formattedCil };
    });
  };

  const handleApplyFilter = () => {
    setRefSearch(prev => {
      setAppliedRefSearch({
        esf: prev.esf,
        cil: prev.cil,
        esfSign: esfSign
      });
      setIsFilterActive(!!prev.esf || !!prev.cil);
      return prev;
    });
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
      // Limite ESF: +6.00 a -6.00
      if (newVal > 6) newVal = 6;
      if (newVal < -6) newVal = -6;

      if (newVal < 0) setEsfSign('-');
      else setEsfSign('+');
      setRefSearch(prev => ({ ...prev, esf: Math.abs(newVal).toFixed(2).replace('.', ',') }));
    } else {
      // Limite CIL: 0.00 a -4.00
      if (newVal > 0) newVal = 0;
      if (newVal < -4) newVal = -4;

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
    if (num > 6.0) num = 6.0;
    
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
    
    if (num > 4.0) num = 4.0;
    if (num < 0) num = 0;
    
    num = Math.round(num * 4) / 4;
    setRefSearch(prev => ({ ...prev, cil: num.toFixed(2).replace('.', ',') }));
  };

  // Dynamic scale generators using settings state (fallback to +2/-2 if invalid)
  const esfScale = React.useMemo(() => {
    const min = parseFloat(String(gridConfig.esf_min));
    const max = parseFloat(String(gridConfig.esf_max));
    const step = parseFloat(String(gridConfig.esf_step)) || 0.25;
    if (isNaN(min) || isNaN(max) || min >= max) {
      return Array.from({ length: 17 }, (_, i) => (2 - i * 0.25).toFixed(2));
    }
    const len = Math.round((max - min) / step) + 1;
    if (len <= 0 || len > 100) return Array.from({ length: 17 }, (_, i) => (2 - i * 0.25).toFixed(2));
    return Array.from({ length: len }, (_, i) => (max - i * step).toFixed(2));
  }, [gridConfig.esf_min, gridConfig.esf_max, gridConfig.esf_step]);

  const cilScale = React.useMemo(() => {
    const min = parseFloat(String(gridConfig.cil_min));
    const max = parseFloat(String(gridConfig.cil_max));
    const step = parseFloat(String(gridConfig.cil_step)) || 0.25;
    if (isNaN(min) || isNaN(max) || min >= max) {
      return Array.from({ length: 9 }, (_, i) => (-i * 0.25).toFixed(2));
    }
    const len = Math.round((max - min) / step) + 1;
    if (len <= 0 || len > 100) return Array.from({ length: 9 }, (_, i) => (-i * 0.25).toFixed(2));
    return Array.from({ length: len }, (_, i) => (max - i * step).toFixed(2));
  }, [gridConfig.cil_min, gridConfig.cil_max, gridConfig.cil_step]);

  const currentEsfValue = React.useMemo(() => {
    if (!refSearch.esf) return '';
    const cleanEsf = refSearch.esf.replace(',', '.');
    const signed = esfSign === '-' ? `-${cleanEsf.replace(/^[+-]/, '')}` : cleanEsf.replace(/^[+-]/, '');
    const num = parseFloat(signed);
    return isNaN(num) ? '' : num.toFixed(2);
  }, [refSearch.esf, esfSign]);

  const currentCilValue = React.useMemo(() => {
    if (!refSearch.cil) return '';
    const cleanCil = refSearch.cil.replace(',', '.');
    const num = -Math.abs(parseFloat(cleanCil));
    return isNaN(num) ? '' : num.toFixed(2);
  }, [refSearch.cil]);

  // Modal states
  const [showModal, setShowModal] = useState<'entry' | 'exit' | 'writeoff' | null>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);

  const [showNewSkuModal, setShowNewSkuModal] = useState(false);
  const [newSkuModalMode, setNewSkuModalMode] = useState<'entry' | 'writeoff'>('entry');
  const [newSkuId, setNewSkuId] = useState('');
  const [newBranchId, setNewBranchId] = useState('');
  const [newQty, setNewQty] = useState('0');
  const [newReason, setNewReason] = useState('');
  const [allSkus, setAllSkus] = useState<any[]>([]);

  // Form states for manual dioptria addition under "Nova Entrada" button
  const [newEntryMode, setNewEntryMode] = useState<'family_dioptre' | 'sku'>('family_dioptre');
  const [newFamilyId, setNewFamilyId] = useState('');
  const [newEsf, setNewEsf] = useState('');
  const [newCil, setNewCil] = useState('');

  useEffect(() => {
    if (showModal && selectedItem) {
      const bId = selectedItem.branch_id === 'global' ? '' : selectedItem.branch_id;
      setMovementBranchId(bId || selectedBranch || profile?.branch_id || '');
    } else {
      setMovementBranchId('');
    }
  }, [showModal, selectedItem]);

  const fetchAllSkus = async (forceRefresh = false) => {
    const skus = await getCachedSkus(forceRefresh);
    setAllSkus(skus);
  };

  const handleCreateInventory = async () => {
    if (!newBranchId) {
      alert("Por favor, selecione a filial.");
      return;
    }

    const targetBranch = branches.find(b => b.id === newBranchId);
    if (!targetBranch || targetBranch.status !== 'active' || targetBranch.id === 'outra' || targetBranch.id === 'outras' || targetBranch.code === 'outra') {
      alert("Operação permitida apenas para filiais cadastradas e ativas.");
      return;
    }

    const qtyAmount = parseInt(newQty);
    if (isNaN(qtyAmount) || qtyAmount < 0) {
      alert("Por favor, insira uma quantidade válida.");
      return;
    }

    let finalSkuId = '';
    setMovementLoading(true);
    try {
      if (newEntryMode === 'sku') {
        if (!newSkuId) {
          alert("Por favor, selecione o SKU.");
          setMovementLoading(false);
          return;
        }
        
        // Validar limites das dioptrias do SKU contra configurações globais
        const selectedSku = allSkus.find(s => s.id === newSkuId);
        if (selectedSku) {
          const esf = selectedSku.spherical !== undefined ? parseFloat(String(selectedSku.spherical)) : 0;
          const cil = selectedSku.cylindrical !== undefined ? parseFloat(String(selectedSku.cylindrical)) : 0;

          if (esf < gridConfig.esf_min || esf > gridConfig.esf_max) {
            alert(`Erro: A dioptria esférica (ESF: ${esf >= 0 ? '+' : ''}${esf.toFixed(2)}) do SKU está fora dos limites configurados (${gridConfig.esf_min >= 0 ? '+' : ''}${gridConfig.esf_min.toFixed(2)} a ${gridConfig.esf_max >= 0 ? '+' : ''}${gridConfig.esf_max.toFixed(2)}).`);
            setMovementLoading(false);
            return;
          }

          if (cil < gridConfig.cil_min || cil > gridConfig.cil_max) {
            alert(`Erro: A dioptria cilíndrica (CIL: ${cil >= 0 ? '+' : ''}${cil.toFixed(2)}) do SKU está fora dos limites configurados (${gridConfig.cil_min >= 0 ? '+' : ''}${gridConfig.cil_min.toFixed(2)} a ${gridConfig.cil_max >= 0 ? '+' : ''}${gridConfig.cil_max.toFixed(2)}).`);
            setMovementLoading(false);
            return;
          }
        }
        finalSkuId = newSkuId;
      } else {
        if (!newFamilyId || newEsf === '' || newCil === '') {
          alert("Por favor, selecione a família de lentes e as dioptrias (ESF e CIL).");
          setMovementLoading(false);
          return;
        }

        const esf = parseFloat(newEsf);
        const cil = parseFloat(newCil);

        if (esf < gridConfig.esf_min || esf > gridConfig.esf_max) {
          alert(`Erro: A dioptria esférica (ESF: ${esf >= 0 ? '+' : ''}${esf.toFixed(2)}) está fora dos limites configurados (${gridConfig.esf_min >= 0 ? '+' : ''}${gridConfig.esf_min.toFixed(2)} a ${gridConfig.esf_max >= 0 ? '+' : ''}${gridConfig.esf_max.toFixed(2)}).`);
          setMovementLoading(false);
          return;
        }

        if (cil < gridConfig.cil_min || cil > gridConfig.cil_max) {
          alert(`Erro: A dioptria cilíndrica (CIL: ${cil >= 0 ? '+' : ''}${cil.toFixed(2)}) está fora dos limites configurados (${gridConfig.cil_min >= 0 ? '+' : ''}${gridConfig.cil_min.toFixed(2)} a ${gridConfig.cil_max >= 0 ? '+' : ''}${gridConfig.cil_max.toFixed(2)}).`);
          setMovementLoading(false);
          return;
        }

        const family = families.find(f => f.id === newFamilyId);
        if (!family) throw new Error("Família de lentes não encontrada.");

        const skuCode = generateSkuCode(family.line, esf, cil);
        const skuId = `${family.id}_${skuCode.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Create the document of SKU if it doesn't exist
        const skuRef = doc(db, 'lensSkus', skuId);
        await setDoc(skuRef, {
          family_id: family.id,
          sku_code: skuCode,
          spherical: esf,
          cylindrical: cil,
          created_at: new Date().toISOString()
        }, { merge: true });

        finalSkuId = skuId;
      }

      const invId = `${newBranchId}_${finalSkuId}`;
      const invRef = doc(db, 'inventory', invId);
      
      // Use transaction to load current quantity and add/subtract it
      await runTransaction(db, async (transaction) => {
        const invDoc = await transaction.get(invRef);
        let currentQty = 0;
        if (invDoc.exists()) {
          const rawQty = invDoc.data().quantity;
          currentQty = typeof rawQty === 'number' ? rawQty : (parseInt(String(rawQty || 0)) || 0);
        }

        const qtyChange = newSkuModalMode === 'entry' ? qtyAmount : -qtyAmount;
        const nextQty = currentQty + qtyChange;

        if (nextQty < 0) {
          throw new Error("Estoque insuficiente para realizar a baixa desejada!");
        }

        transaction.set(invRef, {
          branch_id: newBranchId,
          sku_id: finalSkuId,
          quantity: nextQty,
          updated_at: serverTimestamp()
        }, { merge: true });

        // Create movement log
        const movRef = doc(collection(db, 'movements'));
        transaction.set(movRef, {
          branch_id: newBranchId,
          sku_id: finalSkuId,
          type: newSkuModalMode === 'entry' ? 'entry' : 'writeoff',
          quantity: qtyAmount,
          reason: newReason || (newSkuModalMode === 'entry' ? 'Nova entrada de lentes' : 'Baixa de estoque (ajuste)'),
          user_id: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      });

      if (newSkuModalMode === 'entry') {
        alert('Item adicionado ao estoque!');
      } else {
        alert('Baixa de estoque realizada com sucesso!');
      }
      setShowNewSkuModal(false);
      // Reset state
      setNewFamilyId('');
      setNewEsf('');
      setNewCil('');
      setNewQty('1');
      setNewReason('');
      setNewEntryMode('family_dioptre');
      clearCache('lensSkus');
      fetchAllSkus(true);
      fetchData(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao processar estoque.');
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
    if (!selectedItem) {
      alert("Nenhum item selecionado.");
      return;
    }

    const amount = parseInt(qty);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor, insira uma quantidade válida maior que 0.");
      return;
    }
    
    // Resolve target branch correctly
    const targetBranchId = movementBranchId || selectedItem.branch_id;

    if (!targetBranchId) {
      alert("Por favor, selecione a filial.");
      return;
    }

    const targetBranch = branches.find(b => b.id === targetBranchId);
    if (!targetBranch || targetBranch.status !== 'active' || targetBranch.id === 'outra' || targetBranch.id === 'outras' || targetBranch.code === 'outra') {
      alert("Operação permitida apenas para filiais cadastradas e ativas.");
      return;
    }

    // Validar limites das dioptrias do SKU selecionado contra configurações globais
    const esf = selectedItem.sku?.spherical !== undefined ? parseFloat(String(selectedItem.sku.spherical)) : 0;
    const cil = selectedItem.sku?.cylindrical !== undefined ? parseFloat(String(selectedItem.sku.cylindrical)) : 0;

    if (esf < gridConfig.esf_min || esf > gridConfig.esf_max) {
      alert(`Erro: A dioptria esférica (ESF: ${esf >= 0 ? '+' : ''}${esf.toFixed(2)}) do item está fora dos limites configurados (${gridConfig.esf_min >= 0 ? '+' : ''}${gridConfig.esf_min.toFixed(2)} a ${gridConfig.esf_max >= 0 ? '+' : ''}${gridConfig.esf_max.toFixed(2)}).`);
      return;
    }

    if (cil < gridConfig.cil_min || cil > gridConfig.cil_max) {
      alert(`Erro: A dioptria cilíndrica (CIL: ${cil >= 0 ? '+' : ''}${cil.toFixed(2)}) do item está fora dos limites configurados (${gridConfig.cil_min >= 0 ? '+' : ''}${gridConfig.cil_min.toFixed(2)} a ${gridConfig.cil_max >= 0 ? '+' : ''}${gridConfig.cil_max.toFixed(2)}).`);
      return;
    }

    setMovementLoading(true);
    const finalQty = showModal === 'entry' ? amount : -amount;

    try {
      let finalSkuId = selectedItem.sku_id;

      // Se o item for virtual e o SKU ID também for virtual, criamos o SKU na hora!
      if (selectedItem.isVirtual && selectedItem.sku_id.startsWith('virtual_sku_')) {
        const family = selectedItem.sku?.family;
        if (!family) throw new Error("Família de lentes não encontrada para o item virtual.");
        
        const esf = selectedItem.sku.spherical;
        const cil = selectedItem.sku.cylindrical;
        
        const skuCode = generateSkuCode(family.line, esf, cil);
        const skuId = `${family.id}_${skuCode.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Criar o documento do SKU primeiro
        const skuRef = doc(db, 'lensSkus', skuId);
        await setDoc(skuRef, {
          family_id: family.id,
          sku_code: skuCode,
          spherical: esf,
          cylindrical: cil,
          created_at: new Date().toISOString()
        }, { merge: true });

        finalSkuId = skuId;
        // Clear lensSku cache
        clearCache('lensSkus');
        fetchAllSkus(true);
      }

      const finalItemId = `${targetBranchId}_${finalSkuId}`;

      await runTransaction(db, async (transaction) => {
        const invRef = doc(db, 'inventory', finalItemId);
        const invDoc = await transaction.get(invRef);
        
        let currentQty = 0;
        if (invDoc.exists()) {
          const rawQty = invDoc.data().quantity;
          currentQty = typeof rawQty === 'number' ? rawQty : (parseInt(String(rawQty || 0)) || 0);
        }

        const newQty = currentQty + finalQty;
        if (newQty < 0) throw new Error("Estoque insuficiente!");

        // Update inventory (creates document if doesn't exist yet via set with merge)
        transaction.set(invRef, {
          branch_id: targetBranchId,
          sku_id: finalSkuId,
          quantity: newQty,
          updated_at: serverTimestamp()
        }, { merge: true });

        // Create movement log
        const movRef = doc(collection(db, 'movements'));
        transaction.set(movRef, {
          branch_id: targetBranchId,
          sku_id: finalSkuId,
          type: showModal === 'entry' ? 'entry' : (showModal === 'writeoff' ? 'writeoff' : 'exit'),
          quantity: amount,
          reason: reason || (showModal === 'entry' ? 'Entrada manual' : (showModal === 'writeoff' ? 'Baixa de estoque' : 'Saída manual')),
          user_id: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });
      });

      alert('Operação realizada com sucesso!');
      setShowModal(null);
      setQty('1');
      setReason('');
      clearCache('lensSkus');
      fetchData(true);
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

  const fetchData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const currentBranchId = selectedBranch;

      // Real-time cleanup of inactive stocks or 'outra' branch stocks
      const bSnap = await getCachedBranches(forceRefresh);
      const activeBranchIds = bSnap
        .filter((b: any) => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra' && !b.name?.toLowerCase().includes('outra'))
        .map((b: any) => b.id);

      const cleanupSkus = await getCachedSkus(forceRefresh);
      const cleanupFamilies = await getCachedFamilies(forceRefresh);

      const cleanupSkusMap: Record<string, any> = {};
      cleanupSkus.forEach(s => { cleanupSkusMap[s.id] = s; });

      const cleanupFamiliesMap: Record<string, any> = {};
      cleanupFamilies.forEach(f => { cleanupFamiliesMap[f.id] = f; });

      const fullInvSnapshot = await getDocs(collection(db, 'inventory'));
      const invalidDocs = fullInvSnapshot.docs.filter(docSnap => {
        const itemData = docSnap.data();
        const bId = itemData.branch_id || '';
        const isOutraOnId = bId === 'outra' || bId === 'outras' || bId === 'outro' || bId === '';
        
        // Check if branch name or code contains "outra"
        const branchObj = bSnap.find((b: any) => b.id === bId);
        const branchNameLower = String(branchObj?.name || '').toLowerCase();
        const branchCodeLower = String(branchObj?.code || '').toLowerCase();
        const isOutraOnDetails = branchNameLower.includes('outra') || branchCodeLower.includes('outra') || branchNameLower.includes('outras');

        const isInactiveOrUnregistered = !activeBranchIds.includes(bId);
        return isOutraOnId || isOutraOnDetails || isInactiveOrUnregistered;
      });

      // Target RESIDUAL VERDE-ESF-5,25-CIL-1,25 on any branch containing "outra" or inactive/legacy
      const residualVerdeTargets = fullInvSnapshot.docs.filter(docSnap => {
        const itemData = docSnap.data();
        const bId = itemData.branch_id || '';
        const skuId = itemData.sku_id || '';
        const sku = cleanupSkusMap[skuId];
        if (!sku) return false;
        
        const family = cleanupFamiliesMap[sku.family_id];
        if (!family) return false;

        const familyName = String(family.line || family.name || '').toUpperCase();
        const isVerdeResidual = familyName.includes('RESIDUAL VERDE') || familyName.includes('VERDE RESIDUAL');

        const esfVal = Math.abs(parseFloat(String(sku.spherical || 0)));
        const cilVal = Math.abs(parseFloat(String(sku.cylindrical || 0)));

        const isTargetRefraction = isVerdeResidual && Math.abs(esfVal - 5.25) < 0.01 && Math.abs(cilVal - 1.25) < 0.01;

        if (isTargetRefraction) {
          const branchObj = bSnap.find((b: any) => b.id === bId);
          const branchNameLower = String(branchObj?.name || '').toLowerCase();
          const branchCodeLower = String(branchObj?.code || '').toLowerCase();
          const isFromOutraBranch = bId === 'outra' || bId === 'outras' || bId === 'outro' ||
                                    branchNameLower.includes('outra') || branchCodeLower.includes('outra') ||
                                    branchNameLower.includes('outras') || !activeBranchIds.includes(bId);
          return isFromOutraBranch;
        }
        return false;
      });

      // Combine documents to delete
      const docsToDelete = [...invalidDocs];
      residualVerdeTargets.forEach(targetDoc => {
        if (!docsToDelete.some(d => d.id === targetDoc.id)) {
          docsToDelete.push(targetDoc);
        }
      });

      if (docsToDelete.length > 0) {
        console.log(`Cleaning up ${docsToDelete.length} invalid/inactive branch/residual stock documents:`, docsToDelete.map(d => d.id));
        for (const badDoc of docsToDelete) {
          try {
            await deleteDoc(doc(db, 'inventory', badDoc.id));
          } catch (deleteErr) {
            console.error("Error deleting stale inventory doc:", deleteErr);
          }
        }
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
        getCachedSkus(forceRefresh),
        getCachedFamilies(forceRefresh)
      ]);

      const invData = invSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(item => activeBranchIds.includes(item.branch_id));

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
    
    const skuCode = String(sku?.sku_code || '');
    const manufacturer = String(sku?.family?.manufacturer || '');
    
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
        String(f?.manufacturer || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(f?.line || '').toLowerCase().includes(searchQuery.toLowerCase());
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

      // If no existing mapping, try to look up a real SKU first
      const realSku = allSkus.find(s => 
        s.family_id === f.id &&
        Math.abs((s.spherical || 0) - esfSearch) < 0.01 &&
        Math.abs((s.cylindrical || 0) - cilSearch) < 0.01
      );

      const branchId = selectedBranch || profile?.branch_id || 'global';
      const actualSkuId = realSku ? realSku.id : `virtual_sku_${f.id}`;
      const actualItemId = realSku ? `${branchId}_${realSku.id}` : `virtual_${f.id}_${esfSearch}_${cilSearch}`;
      const skuCode = realSku ? realSku.sku_code : generateSkuCode(f.line, esfSearch, cilSearch);

      return {
        id: actualItemId,
        branch_id: branchId,
        sku_id: actualSkuId,
        quantity: 0,
        sku: {
          id: actualSkuId,
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
  }, [filteredItems, families, appliedRefSearch, selectedFamily, searchQuery, selectedBranch, profile, allSkus]);

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Estoque Geral</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie a disponibilidade de lentes em tempo real.</p>
        </div>
        
        {isAdmin && (
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                setShowConfigModal(true);
              }}
              className="flex items-center px-4 py-2 bg-teal-50 text-brand-teal rounded-lg text-sm font-semibold hover:bg-teal-100 transition-colors cursor-pointer"
            >
              <SlidersHorizontal size={18} className="mr-2" /> Configurar Grade
            </button>
            <button 
              onClick={() => {
                fetchAllSkus(true);
                setNewSkuModalMode('entry');
                setNewReason('');
                setNewQty('1');
                setNewFamilyId('');
                setNewEsf('');
                setNewCil('');
                setNewEntryMode('family_dioptre');
                setNewBranchId(selectedBranch || profile?.branch_id || '');
                setShowNewSkuModal(true);
              }}
              className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <Plus size={18} className="mr-2" /> Nova Entrada
            </button>
            <button 
              onClick={() => {
                fetchAllSkus(true);
                setNewSkuModalMode('writeoff');
                setNewReason('');
                setNewQty('1');
                setNewFamilyId('');
                setNewEsf('');
                setNewCil('');
                setNewEntryMode('family_dioptre');
                setNewBranchId(selectedBranch || profile?.branch_id || '');
                setShowNewSkuModal(true);
              }}
              className="flex items-center px-4 py-2 bg-amber-50 text-amber-600 rounded-lg text-sm font-semibold hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <MinusCircle size={18} className="mr-2" /> Baixa de Estoque
            </button>
            <button className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors cursor-pointer">
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
            {/* ESF (Spherical) Select Card */}
            <div className="flex-1 flex bg-white border-2 border-slate-300 rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-brand-teal/15 focus-within:border-brand-teal transition-all h-14 shadow-sm min-w-0">
              <div className="bg-brand-teal text-white w-10 px-0.5 h-full flex items-center justify-center font-black text-xs uppercase select-none shrink-0 antialiased">
                ESF
              </div>
              <div className="relative flex-1 h-full min-w-[70px]">
                <select 
                  value={currentEsfValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      applyDirectFilter('', '+', undefined);
                    } else {
                      const parsed = parseFloat(val);
                      const absValStr = Math.abs(parsed).toFixed(2).replace('.', ',');
                      const sign = parsed < 0 ? '-' : '+';
                      applyDirectFilter(absValStr, sign, undefined);
                    }
                  }}
                  className="w-full h-full text-center text-sm sm:text-base font-black text-slate-800 bg-slate-50/70 hover:bg-slate-100/30 focus:bg-white focus:text-slate-900 border-none outline-none focus:outline-none focus:ring-0 focus:border-none px-4 pr-10 transition-all cursor-pointer appearance-none"
                >
                  <option value="" className="font-bold text-slate-500">Todos (ESF)</option>
                  {esfScale.map(esf => (
                    <option key={esf} value={parseFloat(esf).toFixed(2)} className="font-black text-slate-800">
                      {formatRefraction(parseFloat(esf))}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-450">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
              {refSearch.esf && (
                <div className="flex items-center h-full shrink-0 pr-1 border-l border-slate-100 bg-slate-50/70">
                  <button 
                    onClick={() => {
                      applyDirectFilter('', '+', undefined);
                    }}
                    className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all border-none outline-none focus:ring-0 cursor-pointer mr-1"
                    title="Limpar"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* CIL (Cylindrical) Select Card */}
            <div className="flex-1 flex bg-white border-2 border-slate-300 rounded-xl overflow-hidden focus-within:ring-4 focus-within:ring-brand-teal/15 focus-within:border-brand-teal transition-all h-14 shadow-sm min-w-0">
              <div className="bg-brand-teal text-white w-10 px-0.5 h-full flex items-center justify-center font-black text-xs uppercase select-none shrink-0 antialiased">
                CIL
              </div>
              <div className="relative flex-1 h-full min-w-[70px]">
                <select 
                  value={currentCilValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      applyDirectFilter(undefined, undefined, '');
                    } else {
                      const parsed = parseFloat(val);
                      const absValStr = Math.abs(parsed).toFixed(2).replace('.', ',');
                      applyDirectFilter(undefined, undefined, absValStr);
                    }
                  }}
                  className="w-full h-full text-center text-sm sm:text-base font-black text-slate-800 bg-slate-50/70 hover:bg-slate-100/30 focus:bg-white focus:text-slate-900 border-none outline-none focus:outline-none focus:ring-0 focus:border-none px-4 pr-10 transition-all cursor-pointer appearance-none"
                >
                  <option value="" className="font-bold text-slate-500">Todos (CIL)</option>
                  {cilScale.map(cil => (
                    <option key={cil} value={parseFloat(cil).toFixed(2)} className="font-black text-slate-800">
                      {formatCylinder(parseFloat(cil))}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-450">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
              {refSearch.cil && (
                <div className="flex items-center h-full shrink-0 pr-1 border-l border-slate-100 bg-slate-50/70">
                  <button 
                    onClick={() => {
                      applyDirectFilter(undefined, undefined, '');
                    }}
                    className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all border-none outline-none focus:ring-0 cursor-pointer mr-1"
                    title="Limpar"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
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
            <span>ESF: de {gridConfig.esf_max >= 0 ? `+${gridConfig.esf_max.toFixed(2).replace('.', ',')}` : gridConfig.esf_max.toFixed(2).replace('.', ',')} a {gridConfig.esf_min >= 0 ? `+${gridConfig.esf_min.toFixed(2).replace('.', ',')}` : gridConfig.esf_min.toFixed(2).replace('.', ',')}</span>
            <span>CIL: de {gridConfig.cil_max >= 0 ? `+${gridConfig.cil_max.toFixed(2).replace('.', ',')}` : gridConfig.cil_max.toFixed(2).replace('.', ',')} a {gridConfig.cil_min >= 0 ? `+${gridConfig.cil_min.toFixed(2).replace('.', ',')}` : gridConfig.cil_min.toFixed(2).replace('.', ',')}</span>
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
              Filtro: {appliedRefSearch.esf ? `ESF ${appliedRefSearch.esfSign}${appliedRefSearch.esf}` : ''}
              {appliedRefSearch.esf && appliedRefSearch.cil ? ' • ' : ''}
              {appliedRefSearch.cil ? `CIL -${appliedRefSearch.cil}` : ''}
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
                            {formatCylinder(item.sku?.cylindrical)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "text-sm font-bold",
                          item.quantity <= (item.sku?.family?.min_stock_per_sku || 0) ? "text-red-500" : "text-slate-700"
                        )}>
                          {item.quantity} unidades
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
                          {formatUpdateDate(item.updated_at)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedItem(item);
                                  setQty('1');
                                  setReason('');
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
                                  setQty('1');
                                  setReason('');
                                  setShowModal('exit');
                                }}
                                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg bg-slate-100 hover:bg-red-50" 
                                title="Saída"
                              >
                                <Minus size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedItem(item);
                                  setQty('1');
                                  setReason('');
                                  setShowModal('writeoff');
                                }}
                                className="p-2 text-slate-400 hover:text-amber-500 transition-colors rounded-lg bg-slate-100 hover:bg-amber-50" 
                                title="Baixa de Estoque"
                              >
                                <MinusCircle size={16} />
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
              <div 
                className="grid gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden"
                style={{
                  gridTemplateColumns: `80px repeat(${cilScale.length}, minmax(60px, 1fr))`
                }}
              >
                {/* Header Row */}
                <div className="bg-slate-50 p-3 text-[10px] font-bold text-slate-400 uppercase text-center flex items-center justify-center">
                  ESF \ CIL
                </div>
                {cilScale.map(cil => (
                  <div key={cil} className="bg-slate-50 p-3 text-[10px] font-bold text-slate-600 text-center">
                    {formatCylinder(parseFloat(cil))}
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

                      // Resolve target item for stock Entry/Exit (either matching or virtual)
                      const f = selectedFamily ? families.find(fam => fam.id === selectedFamily) : null;
                      let targetItem = matchingItems[0];
                      if (!targetItem && f) {
                        const numericEsf = parseFloat(esf);
                        const numericCil = parseFloat(cil);
                        const realSku = allSkus.find(s => 
                          s.family_id === f.id &&
                          Math.abs((s.spherical || 0) - numericEsf) < 0.01 &&
                          Math.abs((s.cylindrical || 0) - numericCil) < 0.01
                        );
                        const branchId = selectedBranch || profile?.branch_id || 'global';
                        const actualSkuId = realSku ? realSku.id : `virtual_sku_${f.id}`;
                        const actualItemId = realSku ? `${branchId}_${realSku.id}` : `virtual_${f.id}_${numericEsf}_${numericCil}`;
                        const skuCode = realSku ? realSku.sku_code : generateSkuCode(f.line, numericEsf, numericCil);
                        targetItem = {
                          id: actualItemId,
                          branch_id: branchId,
                          sku_id: actualSkuId,
                          quantity: 0,
                          isVirtual: true,
                          sku: {
                            id: actualSkuId,
                            family_id: f.id,
                            sku_code: skuCode,
                            spherical: numericEsf,
                            cylindrical: numericCil,
                            family: f
                          },
                          updated_at: new Date().toISOString()
                        };
                      }

                      return (
                        <div 
                          key={`${esf}_${cil}`} 
                          className={cn(
                            "bg-white p-3 pb-8 text-sm font-bold text-center relative transition-colors group cursor-pointer hover:bg-slate-50 min-h-[64px] flex flex-col justify-start items-center",
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
                          <span className="mt-0.5">{totalQty > 0 ? totalQty : '—'}</span>
                          {matchingItems.length > 1 && (
                            <span className="absolute top-1 right-1 text-[8px] bg-slate-100 text-slate-400 px-1 rounded-full">
                              +{matchingItems.length - 1}
                            </span>
                          )}
                          {isAdmin && targetItem && (
                            <div className="absolute inset-x-0 bottom-1 flex justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 py-0.5 z-10 px-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(targetItem);
                                  setQty('1');
                                  setReason('');
                                  setShowModal('entry');
                                }}
                                className="p-0.5 px-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded bg-emerald-50/70 border border-emerald-100/50 transition-colors flex items-center justify-center text-[10px] font-bold"
                                title="Entrada"
                              >
                                <Plus size={10} className="mr-0.5" /> +
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(targetItem);
                                  setQty('1');
                                  setReason('');
                                  setShowModal('exit');
                                }}
                                className="p-0.5 px-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded bg-red-50/70 border border-red-100/50 transition-colors flex items-center justify-center text-[10px] font-bold"
                                title="Saída"
                              >
                                <Minus size={10} className="mr-0.5" /> -
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(targetItem);
                                  setQty('1');
                                  setReason('');
                                  setShowModal('writeoff');
                                }}
                                className="p-0.5 px-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded bg-amber-50/70 border border-amber-100/50 transition-colors flex items-center justify-center text-[10px] font-bold"
                                title="Baixa"
                              >
                                <MinusCircle size={10} className="mr-0.5 text-amber-600" /> B
                              </button>
                            </div>
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
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                  {newSkuModalMode === 'entry' ? 'Adicionar Lente ao Estoque' : 'Baixa de Estoque (Ajuste)'}
                </h3>
                <button onClick={() => setShowNewSkuModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl mb-5">
                <button
                  type="button"
                  onClick={() => setNewEntryMode('family_dioptre')}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    newEntryMode === 'family_dioptre' ? "bg-white text-brand-teal shadow-xs border border-slate-100" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Definir Dioptria
                </button>
                <button
                  type="button"
                  onClick={() => setNewEntryMode('sku')}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                    newEntryMode === 'sku' ? "bg-white text-brand-teal shadow-xs border border-slate-100" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Selecionar por SKU
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Filial</label>
                  <select 
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all text-sm font-medium"
                  >
                    <option value="">Selecione a Filial</option>
                    {branches.filter(b => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra').map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                {newEntryMode === 'sku' ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">SKU da Lente</label>
                    <select 
                      value={newSkuId}
                      onChange={(e) => setNewSkuId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all text-sm font-semibold"
                    >
                      <option value="">Selecione o SKU</option>
                      {allSkus.map(s => <option key={s.id} value={s.id}>{s.sku_code}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Família de Lentes</label>
                      <select 
                        value={newFamilyId}
                        onChange={(e) => setNewFamilyId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all text-sm font-medium"
                      >
                        <option value="">Selecione a Família</option>
                        {families.map(f => <option key={f.id} value={f.id}>{f.manufacturer} - {f.line}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Esférico (ESF)</label>
                        <select 
                          value={newEsf}
                          onChange={(e) => setNewEsf(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-slate-750 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all text-sm font-black"
                        >
                          <option value="">Selecione ESF</option>
                          {esfScale.map(esf => (
                            <option key={esf} value={parseFloat(esf)}>
                              {formatRefraction(parseFloat(esf))}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Cilíndrico (CIL)</label>
                        <select 
                          value={newCil}
                          onChange={(e) => setNewCil(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-slate-755 focus:outline-none focus:ring-2 focus:ring-brand-teal transition-all text-sm font-black"
                        >
                          <option value="">Selecione CIL</option>
                          {cilScale.map(cil => (
                            <option key={cil} value={parseFloat(cil)}>
                              {formatCylinder(parseFloat(cil))}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">
                    {newSkuModalMode === 'entry' ? 'Quantidade Inicial' : 'Quantidade a Baixar'}
                  </label>
                  <input 
                    type="number"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl px-4 py-3 text-slate-750 font-bold focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">
                    {newSkuModalMode === 'entry' ? 'Identificação / Nota Fiscal / Observação (Opcional)' : 'Motivo da Baixa'}
                  </label>
                  <textarea 
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm font-medium h-20 resize-none mb-2"
                    placeholder={newSkuModalMode === 'entry' ? "Ex: NF-1052, Estoque inicial, Compra regular..." : "Ex: Quebra, Perda, Lente riscada..."}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 self-center uppercase tracking-widest mr-1">Sugestões:</span>
                    {(newSkuModalMode === 'entry' 
                      ? ["Compra (Fábrica)", "Estoque Inicial", "Retorno de OS", "Ajuste de Saldo"] 
                      : ["Venda Balcão (OS)", "Quebra no Corte", "Lente Riscada", "Garantia Hoya", "Ajuste Físico"]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewReason(m)}
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer",
                          newReason === m 
                            ? "bg-brand-teal text-white border-brand-teal" 
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex space-x-3">
                <button 
                  type="button"
                  onClick={() => setShowNewSkuModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleCreateInventory}
                  disabled={movementLoading}
                  className={cn(
                    "flex-1 px-6 py-3 text-white rounded-xl font-bold text-sm shadow-lg transition-all cursor-pointer disabled:opacity-50",
                    newSkuModalMode === 'entry' 
                      ? "bg-brand-teal hover:bg-teal-700 shadow-teal-900/10" 
                      : "bg-amber-500 hover:bg-amber-600 shadow-amber-900/10"
                  )}
                >
                  {movementLoading ? 'Salvando...' : (newSkuModalMode === 'entry' ? 'Adicionar ao Estoque' : 'Efetuar Baixa')}
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
                  {showModal === 'entry' ? 'Registrar Entrada' : (showModal === 'writeoff' ? 'Registrar Baixa de Estoque' : 'Registrar Saída')}
                </h3>
                <button onClick={() => setShowModal(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 trasition-colors">
                  <X size={20} />
                </button>
              </div>

              {selectedItem && (() => {
                const itemBranch = branches.find(b => b.id === (movementBranchId || selectedItem.branch_id));
                return (
                  <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Item Selecionado</p>
                    <p className="text-sm font-bold text-slate-700">{selectedItem.sku?.sku_code}</p>
                    <p className="text-xs text-slate-500">{selectedItem.sku?.family?.manufacturer} - {selectedItem.sku?.family?.line}</p>
                    {itemBranch && (
                      <p className="mt-2 text-xs font-bold text-brand-teal uppercase tracking-wider bg-teal-50 px-2.5 py-1 rounded inline-block">
                        Filial: {itemBranch.name} ({itemBranch.code})
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-4">
                {(!selectedBranch || !selectedItem || !selectedItem.branch_id || selectedItem.branch_id === 'global') && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Filial de Destino</label>
                    <select 
                      value={movementBranchId}
                      onChange={(e) => setMovementBranchId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm font-semibold"
                    >
                      <option value="">Selecione a Filial</option>
                      {branches.filter(b => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra').map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  </div>
                )}

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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    {showModal === 'entry' ? 'Identificação / Nota / Observação' : 'Motivo / Observação'}
                  </label>
                  <textarea 
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal h-24 resize-none mb-2"
                    placeholder={showModal === 'entry' ? "Ex: NF-1250, Estoque Inicial, Compra..." : "Ex: Venda ao cliente, Lente riscada, Quebra..."}
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 self-center uppercase tracking-widest mr-1">Sugestões:</span>
                    {(showModal === 'entry' 
                      ? ["Compra Fábrica", "Retorno de OS", "Lote Inicial", "Ajuste de Saldo"] 
                      : ["Venda Balcão (OS)", "Quebra no Corte", "Lente Riscada", "Garantia Hoya", "Ajuste Físico"]
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setReason(m)}
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer",
                          reason === m 
                            ? "bg-brand-teal text-white border-brand-teal" 
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
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
                    showModal === 'entry' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' 
                      : (showModal === 'writeoff'
                          ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                          : 'bg-red-500 hover:bg-red-600 shadow-red-500/20')
                  } disabled:opacity-50`}
                >
                  {movementLoading ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Grid Configurations Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div key="grid-config-modal-root" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-brand-teal/10 rounded-lg text-brand-teal">
                    <SlidersHorizontal size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Limites da Grade (Dioptrias)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Customize os limites para exibição e consulta automática.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 px-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all border-none focus:outline-none cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setConfigSaving(true);
                try {
                  const esf_min = parseFloat(configForm.esf_min.replace(',', '.'));
                  const esf_max = parseFloat(configForm.esf_max.replace(',', '.'));
                  const esf_step = parseFloat(configForm.esf_step.replace(',', '.'));
                  const cil_min = parseFloat(configForm.cil_min.replace(',', '.'));
                  const cil_max = parseFloat(configForm.cil_max.replace(',', '.'));
                  const cil_step = parseFloat(configForm.cil_step.replace(',', '.'));

                  if (isNaN(esf_min) || isNaN(esf_max) || isNaN(esf_step) || isNaN(cil_min) || isNaN(cil_max) || isNaN(cil_step)) {
                    alert('Por favor, insira valores numéricos válidos.');
                    setConfigSaving(false);
                    return;
                  }

                  if (esf_min >= esf_max) {
                    alert('Limite mínimo de Esférico deve ser menor que o máximo.');
                    setConfigSaving(false);
                    return;
                  }

                  if (cil_min >= cil_max) {
                    alert('Limite mínimo de Cilíndrico deve ser menor que o máximo.');
                    setConfigSaving(false);
                    return;
                  }

                  const newConfig = { esf_min, esf_max, esf_step, cil_min, cil_max, cil_step };
                  await setDoc(doc(db, 'configuracoes', 'grade_limites'), {
                    ...newConfig,
                    updated_at: new Date().toISOString(),
                    updated_by: auth.currentUser?.uid || 'system'
                  });
                  setGridConfig(newConfig);
                  setShowConfigModal(false);
                } catch (err) {
                  console.error('Erro ao salvar limites personalizados:', err);
                  alert('Erro ao salvar as configurações.');
                } finally {
                  setConfigSaving(false);
                }
              }} className="p-6 space-y-5">
                {/* Esférico Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">Refração Esférica (ESF)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Mínimo</label>
                      <input 
                        type="text"
                        value={configForm.esf_min}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, esf_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="-6.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Máximo</label>
                      <input 
                        type="text"
                        value={configForm.esf_max}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, esf_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="6.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Intervalo/Pulo</label>
                      <input 
                        type="text"
                        value={configForm.esf_step}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, esf_step: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="0.25"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Cilíndrico Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1">Refração Cilíndrica (CIL)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Mínimo</label>
                      <input 
                        type="text"
                        value={configForm.cil_min}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, cil_min: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="-4.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Máximo</label>
                      <input 
                        type="text"
                        value={configForm.cil_max}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, cil_max: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Intervalo/Pulo</label>
                      <input 
                        type="text"
                        value={configForm.cil_step}
                        onChange={(e) => setConfigForm(prev => ({ ...prev, cil_step: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none transition-all font-semibold"
                        placeholder="0.25"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex space-x-3 pt-4 border-t border-slate-100 justify-end">
                  <button 
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={configSaving}
                    className="px-5 py-2 bg-brand-teal text-white hover:bg-teal-700 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {configSaving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
