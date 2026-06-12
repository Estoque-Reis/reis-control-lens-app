import React, { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { auth, db } from '@/src/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import Login from '@/src/components/Login';
import Layout from '@/src/components/layout/Layout';
import Dashboard from '@/src/components/Dashboard';
import Inventory from '@/src/components/Inventory';
import Families from '@/src/components/Families';
import Branches from '@/src/components/Branches';
import UsersList from '@/src/components/Users';
import Reports from '@/src/components/Reports';
import ReportsFamily from '@/src/components/ReportsFamily';
import Transfers from '@/src/components/Transfers';
import BranchInventory from '@/src/components/BranchInventory';
import PurchaseSuggestions from '@/src/components/PurchaseSuggestions';
import { Users as UsersIcon, LogOut, Shield } from 'lucide-react';

// Simple navigation
type AppRoute = 
  | 'dashboard' 
  | 'inventory' 
  | 'branch_inventory' 
  | 'purchase_suggestions' 
  | 'transfers' 
  | 'branches' 
  | 'users' 
  | 'families' 
  | 'reports'
  | 'reports_family'
  | 'pending_access';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('controle_lens_theme') as 'light' | 'dark') || 'light';
  });

  // Sync theme with user profile
  React.useEffect(() => {
    if (profile?.theme && profile.theme !== theme) {
      setTheme(profile.theme);
    }
  }, [profile]);

  // Apply dark class and save locally
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('controle_lens_theme', theme);
  }, [theme]);

  const handleToggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (user) {
      try {
        await updateDoc(doc(db, 'profiles', user.uid), { theme: nextTheme });
      } catch (err) {
        console.error("Failed to persist theme in profile:", err);
      }
    }
  };

  const [prevRole, setPrevRole] = useState<string | null>(null);

  // Set initial route based on roles or handle role changes
  React.useEffect(() => {
    if (!user) {
      setCurrentRoute(null);
      setPrevRole(null);
      return;
    }

    if (profile && profile.role !== prevRole) {
      setPrevRole(profile.role);
      setCurrentRoute(profile.role === 'admin' ? 'dashboard' : 'branch_inventory');
    }
  }, [user, profile, prevRole]);

  // If loading, show splash
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-teal"></div>
          <p className="mt-4 text-slate-400 text-sm font-medium">Carregando Reis Controle Lens...</p>
        </div>
      </div>
    );
  }

  // If no user, show login
  if (!user) {
    return <Login />;
  }

  // If there's a user but no profile yet (and we're not loading), 
  // it might mean the profile creation is sluggish or failed.
  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-emerald-100">
          <div className="w-16 h-16 bg-emerald-50 text-brand-teal rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <UsersIcon size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Finalizando seu perfil...</h2>
          <p className="text-slate-500 text-sm mb-8">Estamos conectando você aos dados da sua filial.</p>
          
          <button 
            onClick={() => auth.signOut()}
            className="flex items-center justify-center mx-auto space-x-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            <span>Sair e tentar novamente</span>
          </button>
        </div>
      </div>
    );
  }

  if (profile.role === 'visitante') {
    return (
      <Layout 
        currentRoute="pending_access" 
        onNavigate={setCurrentRoute}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        profile={profile}
      >
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-10 text-center border border-slate-100 dark:border-slate-800">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-850 dark:text-slate-100 mb-3">Acesso Pendente</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
              Olá, <strong className="text-slate-700 dark:text-slate-200">{profile.full_name || profile.email?.split('@')[0]}</strong>! Seu perfil está ativo com a função de <strong className="text-amber-500 uppercase">VISITANTE</strong>.
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 mb-8 text-left border border-slate-100 dark:border-slate-800">
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                ℹ️ Por questões de segurança, novas contas começam como <strong>visitantes</strong>. Aguarde que o <strong>Administrador do sistema</strong> conceda as permissões necessárias e associe seu perfil à sua filial.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Entre em contato com o administrador Paulo para liberar o acesso.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  // Resolve active route immediately on render to prevent any admin screen flashes
  const activeRoute = currentRoute || (profile.role === 'admin' ? 'dashboard' : 'branch_inventory');

  // Strict route protection for non-admin profiles (can only access branch_inventory)
  const isNonAdmin = profile?.role !== 'admin';
  const effectiveRoute = (isNonAdmin && activeRoute !== 'branch_inventory') 
    ? 'branch_inventory' 
    : activeRoute;

  const renderContent = () => {
    switch (effectiveRoute) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <Inventory />;
      case 'branch_inventory':
        return <BranchInventory />;
      case 'purchase_suggestions':
        return <PurchaseSuggestions />;
      case 'families':
        return <Families />;
      case 'branches':
        return <Branches />;
      case 'users':
        return <UsersList />;
      case 'reports':
        return <Reports />;
      case 'reports_family':
        return <ReportsFamily />;
      case 'transfers':
        return <Transfers />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout 
      currentRoute={effectiveRoute} 
      onNavigate={setCurrentRoute}
      theme={theme}
      onToggleTheme={handleToggleTheme}
      profile={profile}
    >
      {renderContent()}
    </Layout>
  );
}
