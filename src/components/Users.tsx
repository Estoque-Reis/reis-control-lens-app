import React, { useState, useEffect } from 'react';
import { db, getCachedBranches } from '@/src/lib/firebase';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Users, Shield, MapPin, Mail, MoreHorizontal, UserPlus, X, Edit2, Trash2 } from 'lucide-react';
import { Profile, Branch } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';

export default function UsersList() {
  const { profile: currentUserProfile } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    role: 'visitante' as 'admin' | 'consultor' | 'visitante',
    branch_id: '',
    status: 'active' as 'active' | 'inactive'
  });

  const isAdmin = currentUserProfile?.role === 'admin';

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const branchesData = await getCachedBranches();
      setBranches(branchesData as Branch[]);
    } catch (err) {
      console.error("Error fetching branches:", err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const [profileSnapshot, branchesList] = await Promise.all([
        getDocs(collection(db, 'profiles')),
        getCachedBranches()
      ]);
      const profiles = profileSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const branchesMap: Record<string, any> = {};
      branchesList.forEach(b => {
        branchesMap[b.id] = b;
      });

      const joinedData = profiles.map((p: any) => ({
        ...p,
        branch: p.branch_id ? branchesMap[p.branch_id] || null : null
      }));

      setUsers(joinedData);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user: any | null = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        full_name: user.full_name || '',
        email: user.email || '',
        role: user.role || 'visitante',
        branch_id: user.branch_id || '',
        status: user.status || 'active'
      });
    } else {
      setEditingUser(null);
      setFormData({
        full_name: '',
        email: '',
        role: 'visitante',
        branch_id: '',
        status: 'active'
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.email || !formData.full_name) {
      alert("Nome e e-mail são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      const isMaster = formData.email.toLowerCase().trim() === 'paulo_ricardo_reis@hotmail.com';
      const finalRole = isMaster ? 'admin' : formData.role;
      const savedData = {
        ...formData,
        email: formData.email.toLowerCase().trim(),
        role: finalRole as 'admin' | 'consultor' | 'visitante'
      };

      if (editingUser) {
        await updateDoc(doc(db, 'profiles', editingUser.id), {
          ...savedData,
          updated_at: new Date().toISOString()
        });
        alert("Usuário atualizado com sucesso!");
      } else {
        // Warning: this doesn't create a Firebase Auth user
        // But it allows pre-creating profiles
        const id = formData.email.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, '_');
        await setDoc(doc(db, 'profiles', id), {
          ...savedData,
          created_at: new Date().toISOString()
        });
        alert("Perfil criado! O usuário deve se cadastrar com este e-mail.");
      }
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      alert("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (id === currentUserProfile?.id) {
      alert("Você não pode excluir seu próprio perfil.");
      return;
    }
    if (!confirm("Deseja realmente excluir este perfil de acesso?")) return;

    setLoading(true);
    try {
      await deleteDoc(doc(db, 'profiles', id));
      alert("Perfil excluído.");
      fetchUsers();
    } catch (err: any) {
      alert("Erro ao excluir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Equipe e Acessos</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie os usuários e suas permissões no sistema.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-800 transition-all shadow-md shadow-teal-900/10"
          >
            <UserPlus size={18} className="mr-2" /> Novo Usuário
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Usuário</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Perfil</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Filial Vinculada</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-8 bg-white"></td>
                </tr>
              ))
            ) : users.map((user) => (
              <tr key={user.id} className="group hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-brand-teal mr-3">
                      {user.full_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{user.full_name || 'Usuário Sem Nome'}</span>
                      <span className="text-xs text-slate-400 flex items-center">
                        <Mail size={12} className="mr-1" /> {user.email || 'Sem e-mail'}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center text-sm font-medium text-slate-600">
                    <Shield size={14} className="mr-2 text-brand-teal" />
                    <span>
                      {user.role === 'admin' ? 'Administrador' : user.role === 'consultor' ? 'Consultor' : 'Visitante'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center text-sm text-slate-500">
                    <MapPin size={14} className="mr-2 text-slate-300" />
                    {user.branch?.name || 'Não vinculado'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    user.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {user.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {isAdmin && (
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => handleOpenModal(user)}
                        className="p-2 text-slate-400 hover:text-brand-teal hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div 
            key="users-modal-overlay"
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
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                </h3>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Nome Completo</label>
                  <input 
                    type="text" 
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="Nome do colaborador"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">E-mail</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                    placeholder="email@exemplo.com"
                    disabled={!!editingUser}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Perfil de Acesso</label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value as 'admin' | 'consultor' | 'visitante'})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                  >
                    <option value="visitante">Visitante (Acesso Pendente)</option>
                    <option value="consultor">Consultor (Consulta de Estoque)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Filial Associada</label>
                  <select 
                    value={formData.branch_id}
                    onChange={(e) => setFormData({...formData, branch_id: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                  >
                    <option value="">Nenhuma (Acesso Global)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1 italic">* Usuários sem filial associada podem ver o estoque global (Administradores).</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal text-sm"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
