import React, { useState, useEffect } from 'react';
import { db, auth, getCachedBranches, getCachedFamilies, getCachedSkus } from '@/src/lib/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  setDoc,
  updateDoc,
  runTransaction, 
  serverTimestamp, 
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  ArrowLeftRight, 
  Plus, 
  History, 
  ArrowRight, 
  Search, 
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  X,
  Building2,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { LensSku, InventoryItem, Branch, LensFamily } from '@/src/types';
import { cn, formatCurrency } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Transfers() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allSkus, setAllSkus] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  
  // New Transfer Modal
  const [showModal, setShowModal] = useState(false);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    fetchBranches();
    fetchAllSkus();
    fetchTransfers();
  }, []);

  const fetchBranches = async () => {
    try {
      const branchesData = await getCachedBranches();
      // Keep sort order if there's a code or fallback
      const sorted = [...branchesData].sort((a,b) => String(a.code || '').localeCompare(String(b.code || '')));
      setBranches(sorted as Branch[]);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllSkus = async () => {
    try {
      const [skus, families] = await Promise.all([
        getCachedSkus(),
        getCachedFamilies()
      ]);
      
      const familiesMap = new Map<string, any>(families.map(f => [f.id, f]));
      const joinedSkus = skus.map(sku => ({
        ...sku,
        family: familiesMap.get(sku.family_id) || null
      }));
      setAllSkus(joinedSkus);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const [snapshot, branchesList, skus] = await Promise.all([
        getDocs(query(collection(db, 'transfers'), orderBy('created_at', 'desc'), limit(50))),
        getCachedBranches(),
        getCachedSkus()
      ]);

      const branchesMap = new Map<string, any>(branchesList.map(b => [b.id, b]));
      const skusMap = new Map<string, any>(skus.map(s => [s.id, s]));

      const data = snapshot.docs.map(docSnap => {
        const trans = docSnap.data();
        const fromBranch = branchesMap.get(trans.from_branch_id);
        const toBranch = branchesMap.get(trans.to_branch_id);
        const sku = skusMap.get(trans.sku_id);

        return {
          id: docSnap.id,
          ...trans,
          from_branch: fromBranch ? { name: fromBranch.name } : { name: 'N/A' },
          to_branch: toBranch ? { name: toBranch.name } : { name: 'N/A' },
          sku_code: sku ? sku.sku_code : 'N/A'
        };
      });

      setTransfers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromBranchId || !toBranchId || !selectedSkuId || !quantity) {
      alert("Preencha todos os campos.");
      return;
    }
    if (fromBranchId === toBranchId) {
      alert("A filial de origem e destino devem ser diferentes.");
      return;
    }

    const fromBranch = branches.find(b => b.id === fromBranchId);
    const toBranch = branches.find(b => b.id === toBranchId);

    if (!fromBranch || fromBranch.status !== 'active' || fromBranch.id === 'outra' || fromBranch.id === 'outras' || fromBranch.code === 'outra' ||
        !toBranch || toBranch.status !== 'active' || toBranch.id === 'outra' || toBranch.id === 'outras' || toBranch.code === 'outra') {
      alert("Transferência permitida apenas entre filiais cadastradas e ativas.");
      return;
    }

    setTransferLoading(true);
    const amount = parseInt(quantity);
    if (isNaN(amount) || amount <= 0) {
      alert("Quantidade inválida.");
      setTransferLoading(false);
      return;
    }

    try {
      const transferRef = doc(collection(db, 'transfers'));
      await setDoc(transferRef, {
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
        sku_id: selectedSkuId,
        quantity: amount,
        reason: reason || 'Transferência interna',
        user_id: auth.currentUser?.uid,
        status: 'pending',
        created_at: serverTimestamp()
      });

      alert("Solicitação de transferência enviada para aprovação!");
      setShowModal(false);
      fetchTransfers();
    } catch (err: any) {
      console.error(err);
      alert("Erro ao solicitar transferência: " + err.message);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleApprove = async (transfer: any) => {
    if (!isAdmin) return;
    if (!confirm("Confirmar a saída e entrada de estoque desta transferência?")) return;

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const qtyVal = Math.floor(Math.abs(Number(transfer.quantity)));
        if (isNaN(qtyVal) || qtyVal <= 0) {
          throw new Error("A quantidade de transferência é inválida.");
        }

        const fromInvId = `${transfer.from_branch_id}_${transfer.sku_id}`;
        const toInvId = `${transfer.to_branch_id}_${transfer.sku_id}`;
        
        const fromInvRef = doc(db, 'inventory', fromInvId);
        const toInvRef = doc(db, 'inventory', toInvId);
        const transferRef = doc(db, 'transfers', transfer.id);
        
        const fromSnap = await transaction.get(fromInvRef);
        const toSnap = await transaction.get(toInvRef);

        let currentFromQty = 0;
        if (fromSnap.exists()) {
          const rawQty = fromSnap.data().quantity;
          currentFromQty = typeof rawQty === 'number' ? rawQty : (parseInt(String(rawQty || 0), 10) || 0);
          if (isNaN(currentFromQty) || currentFromQty < 0) {
            currentFromQty = 0;
          }
        }

        if (currentFromQty < qtyVal) {
          throw new Error("Estoque insuficiente na filial de origem.");
        }

        let currentToQty = 0;
        if (toSnap.exists()) {
          const rawQty = toSnap.data().quantity;
          currentToQty = typeof rawQty === 'number' ? rawQty : (parseInt(String(rawQty || 0), 10) || 0);
          if (isNaN(currentToQty) || currentToQty < 0) {
            currentToQty = 0;
          }
        }

        // Subtract from Origin
        transaction.update(fromInvRef, {
          quantity: currentFromQty - qtyVal,
          updated_at: serverTimestamp()
        });

        // Add to Destination
        transaction.set(toInvRef, {
          branch_id: transfer.to_branch_id,
          sku_id: transfer.sku_id,
          quantity: currentToQty + qtyVal,
          updated_at: serverTimestamp(),
          created_at: toSnap.exists() ? (toSnap.data().created_at || serverTimestamp()) : serverTimestamp()
        }, { merge: true });

        // Find branch names for nice audit descriptions
        const fromBranch = branches.find(b => b.id === transfer.from_branch_id);
        const toBranch = branches.find(b => b.id === transfer.to_branch_id);

        // Register transfer_out movement for origin branch
        const movOutRef = doc(collection(db, 'movements'));
        transaction.set(movOutRef, {
          branch_id: transfer.from_branch_id,
          sku_id: transfer.sku_id,
          type: 'transfer_out',
          quantity: qtyVal,
          reason: `Transferência para ${toBranch?.name || transfer.to_branch_id} (${transfer.reason || 'Sem observações'})`,
          user_id: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });

        // Register transfer_in movement for destination branch
        const movInRef = doc(collection(db, 'movements'));
        transaction.set(movInRef, {
          branch_id: transfer.to_branch_id,
          sku_id: transfer.sku_id,
          type: 'transfer_in',
          quantity: qtyVal,
          reason: `Recebido de ${fromBranch?.name || transfer.from_branch_id} (${transfer.reason || 'Sem observações'})`,
          user_id: auth.currentUser?.uid,
          created_at: serverTimestamp()
        });

        // Update transfer status
        transaction.update(transferRef, {
          status: 'completed',
          approved_by: auth.currentUser?.uid,
          updated_at: serverTimestamp()
        });
      });

      alert("Transferência aprovada e estoque atualizado!");
      fetchTransfers();
    } catch (err: any) {
      console.error(err);
      alert("Erro ao aprovar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (transfer: any) => {
    if (!isAdmin) return;
    if (!confirm("Deseja realmente rejeitar esta solicitação?")) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'transfers', transfer.id), {
        status: 'rejected',
        rejected_by: auth.currentUser?.uid,
        updated_at: serverTimestamp()
      });
      alert("Solicitação rejeitada.");
      fetchTransfers();
    } catch (err: any) {
      console.error(err);
      alert("Erro ao rejeitar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Transferências de Estoque</h1>
          <p className="text-sm text-slate-400 mt-1">Mova lentes entre filiais com rastreabilidade total.</p>
        </div>
        
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-800 transition-all shadow-md shadow-teal-900/10"
        >
          <Plus size={18} className="mr-2" /> Nova Transferência
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <History size={18} className="text-brand-teal" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Histórico de Movimentações</h2>
          </div>
        </div>

        <div className="overflow-x-auto text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-left">
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Data</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Origem</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]"><ArrowRight size={14} className="mx-auto" /></th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Destino</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Lente</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px] text-center">Quant.</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-[10px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transfers.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400">
                        {item.created_at?.toDate ? item.created_at.toDate().toLocaleDateString() : 'Recente'}
                      </span>
                      <span className="text-[9px] text-slate-300">
                        {item.created_at?.toDate ? item.created_at.toDate().toLocaleTimeString() : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mr-3 shrink-0">
                        <Building2 size={14} />
                      </div>
                      <span className="font-bold text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">{item.from_branch?.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <ArrowRight size={14} className="text-slate-300 mx-auto" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3 shrink-0">
                        <Building2 size={14} />
                      </div>
                      <span className="font-bold text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">{item.to_branch?.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs text-slate-600">{item.sku_code}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-slate-800">{item.quantity}</span>
                  </td>
                  <td className="px-6 py-4">
                    {item.status === 'pending' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600 uppercase">
                        <Clock size={10} className="mr-1" /> Pendente
                      </span>
                    ) : item.status === 'completed' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-600 uppercase">
                        <CheckCircle2 size={10} className="mr-1" /> Aprovado
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 uppercase">
                        <X size={10} className="mr-1" /> Rejeitado
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isAdmin && item.status === 'pending' && (
                      <div className="flex justify-end space-x-2">
                        <button 
                          onClick={() => handleApprove(item)}
                          className="p-1 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Aprovar"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleReject(item)}
                          className="p-1 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Rejeitar"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Nenhuma transferência encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div 
            key="transfers-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-2xl shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">Nova Transferência</h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Lente</label>
                  <select 
                    value={selectedSkuId}
                    onChange={(e) => setSelectedSkuId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">Selecione a Lente</option>
                    {allSkus.map(sku => (
                      <option key={sku.id} value={sku.id}>
                        {sku.sku_code} ({sku.family?.manufacturer} - {sku.family?.line})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Filial de Origem</label>
                  <select 
                    value={fromBranchId}
                    onChange={(e) => setFromBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">Selecione a Origem</option>
                    {branches.filter(b => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra').map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Filial de Destino</label>
                  <select 
                    value={toBranchId}
                    onChange={(e) => setToBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                  >
                    <option value="">Selecione o Destino</option>
                    {branches.filter(b => b.status === 'active' && b.id !== 'outra' && b.id !== 'outras' && b.code !== 'outra').map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade</label>
                  <input 
                    type="number" 
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    min="1"
                  />
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo</label>
                  <input 
                    type="text" 
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal"
                    placeholder="Ex: Reposição, Venda..."
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 self-center uppercase tracking-widest mr-1">Sugestões:</span>
                    {["Reposição de Giro", "Venda de OS Urgente", "Empréstimo", "Consolidar Estoque"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setReason(m)}
                        className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer",
                          reason === m 
                            ? "bg-brand-teal text-white border-brand-teal animate-none" 
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
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleTransfer}
                  disabled={transferLoading}
                  className="flex-1 px-6 py-3 bg-brand-teal text-white rounded-xl font-bold text-sm hover:bg-teal-800 transition-all shadow-lg shadow-teal-900/10 disabled:opacity-50"
                >
                  {transferLoading ? 'Processando...' : 'Confirmar Transferência'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
