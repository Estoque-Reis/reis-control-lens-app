import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, getDocs, query, orderBy, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Plus, MapPin, Edit2, Trash2, Globe, Building2, X, Search } from 'lucide-react';
import { Branch } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';

export default function Branches() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    city: '',
    state: 'PE',
    status: 'active' as 'active' | 'inactive'
  });

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'branches'), orderBy('code'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Branch));
      setBranches(data);
    } catch (err) {
      console.error("Error fetching branches:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (branch: Branch | null = null) => {
    if (branch) {
      setEditingBranch(branch);
      setFormData({
        name: branch.name,
        code: branch.code,
        city: branch.city,
        state: branch.state,
        status: branch.status
      });
    } else {
      setEditingBranch(null);
      setFormData({
        name: '',
        code: '',
        city: '',
        state: 'PE',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      alert('Nome e Código são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (editingBranch) {
        await updateDoc(doc(db, 'branches', editingBranch.id), dataToSave);
        alert('Filial atualizada com sucesso!');
      } else {
        // Use code as ID if it doesn't exist, or let Firestore generate one
        const id = formData.code;
        await setDoc(doc(db, 'branches', id), {
          ...dataToSave,
          created_at: new Date().toISOString()
        });
        alert('Filial cadastrada com sucesso!');
      }

      setShowModal(false);
      fetchBranches();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm('Deseja realmente excluir esta filial?')) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'branches', id));
      alert('Filial excluída com sucesso!');
      fetchBranches();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.code.includes(searchTerm)
  );

  const seedBranches = async () => {
    const initialBranches = [
      { name: 'GUS', code: '01', city: 'Garanhuns', state: 'PE', status: 'active' },
      { name: 'GUS', code: '02', city: 'Garanhuns', state: 'PE', status: 'active' },
      { name: 'DNZ GUS', code: '05', city: 'Garanhuns', state: 'PE', status: 'active' },
      { name: 'ARCOVERDE', code: '07', city: 'Arcoverde', state: 'PE', status: 'active' },
      { name: 'BOM CONSELHO', code: '14', city: 'Bom Conselho', state: 'PE', status: 'active' }
    ];

    setLoading(true);
    try {
      // First, try to delete the old code 03 if it exists (migration)
      await deleteDoc(doc(db, 'branches', '03'));

      for (const branch of initialBranches) {
        const id = branch.code; 
        await setDoc(doc(db, 'branches', id), {
          ...branch,
          created_at: new Date().toISOString()
        });
      }
      alert('Filiais atualizadas com sucesso! (Código 03 removido e 05 adicionado)');
      fetchBranches();
    } catch (err) {
      console.error("Error seeding branches:", err);
      alert('Erro ao atualizar filiais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gerenciamento de Filiais</h1>
          <p className="text-sm text-slate-400 mt-1">Cadastre e gerencie os pontos de venda da sua rede.</p>
        </div>
        
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar filial..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          </div>
          {isAdmin && branches.length === 0 && (
            <button 
              onClick={seedBranches}
              className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-all shadow-md shrink-0"
            >
              <Building2 size={18} className="mr-2" /> Seed
            </button>
          )}
          {isAdmin && (
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-800 transition-all shadow-md shadow-teal-900/10 shrink-0"
            >
              <Plus size={18} className="mr-2" /> Nova Filial
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-48 bg-white rounded-2xl animate-pulse" />
          ))
        ) : filteredBranches.length === 0 ? (
          <div className="md:col-span-full h-64 bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400">
            <Building2 size={48} className="mb-4 opacity-20" />
            <p>Nenhuma filial encontrada.</p>
          </div>
        ) : filteredBranches.map((branch) => (
          <motion.div 
            key={branch.id}
            whileHover={{ y: -5 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-cyan-50 text-brand-cyan rounded-xl">
                <Building2 size={24} />
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</span>
                <p className="text-sm font-bold text-brand-teal">{branch.code}</p>
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800">{branch.name}</h3>
            
            <div className="mt-4 flex items-center text-sm text-slate-500">
              <MapPin size={14} className="mr-2 text-slate-300" />
              {branch.city}, {branch.state}
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-slate-50">
              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                branch.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {branch.status === 'active' ? 'Ativa' : 'Inativa'}
              </span>
              {isAdmin && (
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleOpenModal(branch)}
                    className="p-2 text-slate-400 hover:text-brand-teal hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(branch.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingBranch ? 'Editar Filial' : 'Nova Filial'}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Código</label>
                  <input 
                    type="text" 
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: 01, 02..."
                    disabled={!!editingBranch}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Nome da Filial</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Ex: LJ 01 GARANHUNS"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cidade</label>
                    <input 
                      type="text" 
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                      placeholder="Garanhuns"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Estado</label>
                    <input 
                      type="text" 
                      value={formData.state}
                      onChange={(e) => setFormData({...formData, state: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                      placeholder="PE"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                  >
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
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
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-brand-teal text-white rounded-xl font-bold text-sm hover:bg-teal-800 transition-all shadow-lg shadow-teal-900/10 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
