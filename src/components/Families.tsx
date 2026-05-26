import React, { useState, useEffect } from 'react';
import { db, clearCache } from '@/src/lib/firebase';
import { collection, getDocs, doc, setDoc, writeBatch, updateDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Play, Grid3X3, Package, X, DollarSign, Search, Check, AlertCircle, Info } from 'lucide-react';
import { LensFamily } from '@/src/types';
import { generateSkuCode, formatCurrency, cn, sanitizeResidualText } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function LensFamilies() {
  const [families, setFamilies] = useState<LensFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<LensFamily | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  // Custom alert and confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);
  
  const [formData, setFormData] = useState({
    manufacturer: '',
    line: '',
    index: '',
    treatment: '',
    material: '',
    cost_price: '0',
    min_stock_per_sku: '5'
  });

  useEffect(() => {
    fetchFamilies();
  }, []);

  const fetchFamilies = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'lensFamilies'));
      const data = snapshot.docs.map(docSnap => {
        const docData = docSnap.data();
        const rawLine = docData.line || '';
        const rawTreatment = docData.treatment || '';
        const rawMaterial = docData.material || '';
        
        const sanitizedLine = sanitizeResidualText(rawLine);
        const sanitizedTreatment = sanitizeResidualText(rawTreatment);
        const sanitizedMaterial = sanitizeResidualText(rawMaterial);
        
        const needsUpdateInDb = 
          rawLine !== sanitizedLine || 
          rawTreatment !== sanitizedTreatment || 
          rawMaterial !== sanitizedMaterial;

        const familyObj = { 
          id: docSnap.id, 
          ...docData, 
          line: sanitizedLine,
          treatment: sanitizedTreatment || null,
          material: sanitizedMaterial || null
        } as LensFamily;

        if (needsUpdateInDb) {
          updateDoc(doc(db, 'lensFamilies', docSnap.id), {
            line: sanitizedLine,
            treatment: sanitizedTreatment || null,
            material: sanitizedMaterial || null,
            updated_at: new Date().toISOString()
          }).then(() => {
            clearCache('lensFamilies');
          }).catch(err => {
            console.error("Error auto-sanitizing family doc in Firestore:", err);
          });
        }

        return familyObj;
      });
      setFamilies(data);
    } catch (err) {
      console.error("Error fetching families:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (family: LensFamily | null = null) => {
    if (family) {
      setEditingFamily(family);
      setFormData({
        manufacturer: family.manufacturer || '',
        line: family.line || '',
        index: family.index || '',
        treatment: family.treatment || '',
        material: family.material || '',
        cost_price: family.cost_price?.toString() || '0',
        min_stock_per_sku: family.min_stock_per_sku?.toString() || '5'
      });
    } else {
      setEditingFamily(null);
      setFormData({
        manufacturer: '',
        line: '',
        index: '',
        treatment: '',
        material: '',
        cost_price: '0',
        min_stock_per_sku: '5'
      });
    }
    setShowModal(true);
  };

  const handleSaveFamily = async () => {
    if (!formData.manufacturer || !formData.line) {
      setAlertModal({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Fabricante e Linha são obrigatórios para o cadastro da família.',
        type: 'error'
      });
      return;
    }

    setSaving(true);
    try {
      const sanitizedLine = sanitizeResidualText(formData.line);
      const sanitizedTreatment = sanitizeResidualText(formData.treatment);
      const sanitizedMaterial = sanitizeResidualText(formData.material);

      const dataToSave = {
        manufacturer: formData.manufacturer,
        line: sanitizedLine,
        index: formData.index,
        treatment: sanitizedTreatment || null,
        material: sanitizedMaterial || null,
        cost_price: parseFloat(formData.cost_price.replace(',', '.')),
        min_stock_per_sku: parseInt(formData.min_stock_per_sku),
        updated_at: new Date().toISOString()
      };

      if (editingFamily) {
        await updateDoc(doc(db, 'lensFamilies', editingFamily.id), dataToSave);
        clearCache('lensFamilies');
        setAlertModal({
          isOpen: true,
          title: 'Sucesso',
          message: 'Família de lente atualizada com sucesso!',
          type: 'success'
        });
      } else {
        const newRef = doc(collection(db, 'lensFamilies'));
        await setDoc(newRef, {
          ...dataToSave,
          created_at: new Date().toISOString()
        });
        clearCache('lensFamilies');
        setAlertModal({
          isOpen: true,
          title: 'Sucesso',
          message: 'Família de lente cadastrada com sucesso!',
          type: 'success'
        });
      }

      setShowModal(false);
      fetchFamilies();
    } catch (err: any) {
      setAlertModal({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: 'Erro ao salvar a família: ' + err.message,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFamily = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Família de Lente',
      message: 'Deseja realmente excluir esta família? Isso NÃO excluirá os SKUs já gerados, mas impedirá novas associações.',
      onConfirm: async () => {
        setConfirmModal(null);
        setLoading(true);
        try {
          await deleteDoc(doc(db, 'lensFamilies', id));
          clearCache('lensFamilies');
          setAlertModal({
            isOpen: true,
            title: 'Excluído',
            message: 'Família excluída com sucesso!',
            type: 'success'
          });
          fetchFamilies();
        } catch (err: any) {
          setAlertModal({
            isOpen: true,
            title: 'Erro ao Excluir',
            message: 'Não foi possível excluir a família: ' + err.message,
            type: 'error'
          });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const filteredFamilies = families.filter(f => 
    f.line.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [generatingGridId, setGeneratingGridId] = useState<string | null>(null);

  const handleGenerateGrid = (family: LensFamily) => {
    setConfirmModal({
      isOpen: true,
      title: 'Gerar Grade Automática',
      message: `Deseja gerar a grade automática para a família ${family.line}? Isso criará os SKUs com ESF de -2.00 a +2.00 e CIL de 0.00 a -2.00 para todas as filiais.`,
      onConfirm: async () => {
        setConfirmModal(null);
        setGeneratingGridId(family.id);
        try {
          // 1. Buscar todas as filiais existentes
          const branchesSnapshot = await getDocs(collection(db, 'branches'));
          const activeBranches = branchesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

          let batch = writeBatch(db);
          let count = 0;
          let totalSkus = 0;
          let totalInv = 0;
          
          // ESF -2.00 to +2.00 incrementing by 0.25 (using integer values to avoid float precision bugs)
          for (let esfVal = -200; esfVal <= 200; esfVal += 25) {
            const esf = esfVal / 100;
            // CIL 0.00 to -2.00 decrementing by 0.25
            for (let cilVal = 0; cilVal >= -200; cilVal -= 25) {
              const cil = cilVal / 100;
              const skuCode = generateSkuCode(family.line, esf, cil);
              const skuId = `${family.id}_${skuCode.replace(/[^a-zA-Z0-9]/g, '_')}`;
              
              const skuRef = doc(db, 'lensSkus', skuId);
              batch.set(skuRef, {
                family_id: family.id,
                sku_code: skuCode,
                spherical: esf,
                cylindrical: cil,
                created_at: new Date().toISOString()
              }, { merge: true });

              count++;
              totalSkus++;
              
              // Para cada SKU, cria entrada zerada na inventory para cada filial
              for (const branch of activeBranches) {
                const invId = `${branch.id}_${skuId}`;
                const invRef = doc(db, 'inventory', invId);
                batch.set(invRef, {
                  branch_id: branch.id,
                  sku_id: skuId,
                  quantity: 0,
                  updated_at: new Date().toISOString()
                }, { merge: true });
                
                count++;
                totalInv++;

                if (count >= 400) {
                  await batch.commit();
                  batch = writeBatch(db);
                  count = 0;
                }
              }
              
              if (count >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
              }
            }
          }

          if (count > 0) {
            await batch.commit();
          }

          clearCache('lensSkus');

          setAlertModal({
            isOpen: true,
            title: 'Grade Gerada com Sucesso!',
            message: `A grade foi inicializada. Foram criados/atualizados ${totalSkus} SKUs de lentes e ${totalInv} posições de estoque associadas às filiais com saldo inicial zero.`,
            type: 'success'
          });
        } catch (err: any) {
          console.error('Erro ao gerar grade:', err);
          setAlertModal({
            isOpen: true,
            title: 'Falha ao Gerar Grade',
            message: 'Ocorreu um erro ao processar a grade automática: ' + err.message,
            type: 'error'
          });
        } finally {
          setGeneratingGridId(null);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Famílias de Lentes</h1>
          <p className="text-sm text-slate-400 mt-1">Cadastre fabricantes e linhas para gerar grades de SKUs.</p>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar família..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-800 transition-all shadow-md shadow-teal-900/10 shrink-0"
          >
            <Plus size={18} className="mr-2" /> Nova Família
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-[200px] bg-white rounded-2xl animate-pulse" />
          ))
        ) : filteredFamilies.length === 0 ? (
          <div className="md:col-span-full h-64 bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
            <Package size={48} className="mb-4 opacity-20" />
            <p>Nenhuma família de lentes encontrada para sua busca.</p>
          </div>
        ) : (
          filteredFamilies.map((family) => (
            <motion.div 
              key={family.id}
              whileHover={{ y: -5 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-emerald-50 text-brand-teal rounded-xl">
                    <Grid3X3 size={24} />
                  </div>
                  <div className="flex space-x-1">
                    <button 
                      onClick={() => handleOpenModal(family)}
                      className="p-2 text-slate-400 hover:text-brand-teal hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Editar Família"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteFamily(family.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-800">{family.line}</h3>
                <p className="text-sm text-slate-500 mb-4">{family.manufacturer} • {family.material}</p>
                <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-400">
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span>Índice:</span>
                    <span className="block text-slate-800 font-bold">{family.index || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg">
                    <span>Tratamento:</span>
                    <span className="block text-slate-800 font-bold truncate">{family.treatment || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                <button 
                  onClick={() => handleGenerateGrid(family)}
                  disabled={generatingGridId === family.id}
                  className={cn(
                    "flex items-center text-xs font-bold px-3 py-2 rounded-lg transition-colors",
                    generatingGridId === family.id 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : "text-brand-teal hover:bg-emerald-50"
                  )}
                >
                  <Play size={14} className={cn("mr-2 fill-current", generatingGridId === family.id && "animate-pulse")} />
                  {generatingGridId === family.id ? 'Gerando...' : 'Gerar Grade'}
                </button>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Custo Unitário</p>
                  <p className="text-xs font-bold text-slate-600 mb-2">{formatCurrency(family.cost_price)}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estoque Mín.</p>
                  <p className="text-sm font-bold text-slate-700">{family.min_stock_per_sku} unid.</p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {editingFamily ? 'Editar Família' : 'Nova Família de Lentes'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Identificação e características técnicas.</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fabricante</label>
                  <input 
                    type="text" 
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({...formData, manufacturer: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: Essilor, Hoya..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Linha / Produto</label>
                  <input 
                    type="text" 
                    value={formData.line}
                    onChange={(e) => setFormData({...formData, line: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: Varilux Comfort, Trio..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Material</label>
                  <input 
                    type="text" 
                    value={formData.material}
                    onChange={(e) => setFormData({...formData, material: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: Resina, Policarbonato..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Índice de Refração</label>
                  <input 
                    type="text" 
                    value={formData.index}
                    onChange={(e) => setFormData({...formData, index: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: 1.50, 1.67..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tratamento</label>
                  <input 
                    type="text" 
                    value={formData.treatment}
                    onChange={(e) => setFormData({...formData, treatment: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: Crizal, No-Glare..."
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Estoque Mín. por SKU</label>
                  <input 
                    type="number" 
                    value={formData.min_stock_per_sku}
                    onChange={(e) => setFormData({...formData, min_stock_per_sku: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    min="0"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custo Unitário (R$)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                    <input 
                      type="text" 
                      value={formData.cost_price}
                      onChange={(e) => setFormData({...formData, cost_price: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 py-3 text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-brand-teal"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex space-x-3">
                <button 
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSaveFamily}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-brand-teal text-white rounded-xl font-bold text-sm hover:bg-teal-800 transition-all shadow-lg shadow-teal-900/10 disabled:opacity-50"
                >
                  {saving ? 'Gravando...' : (editingFamily ? 'Salvar Alterações' : 'Cadastrar Família')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100"
            >
              <div className="flex items-center space-x-3 mb-4 text-amber-500">
                <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                  <Play size={24} className="fill-current" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-950">{confirmModal.title}</h3>
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs sm:text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-3 bg-brand-teal hover:bg-teal-800 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-lg shadow-teal-900/10"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {alertModal && alertModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 text-center"
            >
              <div className={cn(
                "w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 shadow-sm",
                alertModal.type === 'success' ? "bg-emerald-50 text-emerald-600" :
                alertModal.type === 'error' ? "bg-rose-50 text-rose-600" :
                "bg-sky-50 text-sky-600"
              )}>
                {alertModal.type === 'success' ? (
                  <Check size={32} strokeWidth={3} />
                ) : alertModal.type === 'error' ? (
                  <AlertCircle size={32} strokeWidth={3} />
                ) : (
                  <Info size={32} strokeWidth={3} />
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{alertModal.title}</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                {alertModal.message}
              </p>
              <button
                onClick={() => setAlertModal(null)}
                className={cn(
                  "w-full px-4 py-3 rounded-xl font-bold text-sm transition-colors text-white",
                  alertModal.type === 'success' ? "bg-emerald-600 hover:bg-emerald-700" :
                  alertModal.type === 'error' ? "bg-rose-600 hover:bg-rose-700" :
                  "bg-brand-teal hover:bg-teal-800"
                )}
              >
                OK
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
