import React, { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { auth } from '@/src/lib/firebase';
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
import { Users as UsersIcon, LogOut } from 'lucide-react';

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
  | 'reports_family';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute | null>(null);

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

  // Resolve active route immediately on render to prevent any admin screen flashes
  const activeRoute = currentRoute || (profile.role === 'admin' ? 'dashboard' : 'branch_inventory');

  // Strict route protection for consultor (can only access branch_inventory)
  const isConsultor = profile?.role === 'consultor';
  const effectiveRoute = (isConsultor && activeRoute !== 'branch_inventory') 
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
    <Layout currentRoute={effectiveRoute} onNavigate={setCurrentRoute}>
      {renderContent()}
    </Layout>
  );
}
