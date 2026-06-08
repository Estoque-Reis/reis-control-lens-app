import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  MapPin, 
  Users, 
  ArrowLeftRight, 
  Library, 
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  ChevronRight,
  FileText,
  Share2,
  Smartphone,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { auth } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (route: any) => void;
}

export default function Layout({ children, currentRoute, onNavigate }: LayoutProps) {
  const { profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  React.useEffect(() => {
    const tourCompleted = localStorage.getItem('controle_lens_tour_completed');
    if (!tourCompleted) {
      setTourOpen(true);
    }
  }, []);

  const tourSteps = [
    {
      title: "Boas-vindas ao Reis Controle Lens! 👓",
      message: "Vamos fazer um tour rápido de 1 minuto para que você domine a gestão inteligente do estoque de suas lentes com precisão de laboratório.",
      route: "dashboard"
    },
    {
      title: "Estoque por Filial (Grade Real) 🏪",
      message: "Aqui em 'Estoque por Filial' você consulta o estoque instantâneo em formato matricial (Esférico por Cilíndrico), idêntico às grades de renomados laboratórios de lentes. Você pode exportar dados em PDF ou Excel corporativos com um clique!",
      route: "branch_inventory"
    },
    {
      title: "Transferências Seguras entre Filiais 🔄",
      message: "Se precisar remanejar lentes para outra filial, use esta tela. O estoque de origem reduz e o de destino aumenta em uma única transação segura, com logs auditados.",
      route: "transfers"
    },
    {
      title: "Famílias de Lentes (Catálogo) 🇯🇵",
      message: "Aqui cadastramos os modelos de lentes e suas especificações (gama, índice de refração, material, tratamentos especiais e premium). A partir da família, você gera a grade completa de dioptrias em lote com um clique!",
      route: "families"
    }
  ];

  const handleNextTourStep = () => {
    if (tourStep < tourSteps.length - 1) {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      onNavigate(tourSteps[nextStep].route);
    } else {
      handleCompleteTour();
    }
  };

  const handlePrevTourStep = () => {
    if (tourStep > 0) {
      const prevStep = tourStep - 1;
      setTourStep(prevStep);
      onNavigate(tourSteps[prevStep].route);
    }
  };

  const handleCompleteTour = () => {
    localStorage.setItem('controle_lens_tour_completed', 'true');
    setTourOpen(false);
    setTourStep(0);
    onNavigate('dashboard');
  };

  const getPublicShareUrl = () => {
    const origin = window.location.origin;
    // Certifica-se de apontar para a URL pública (ais-pre-...) em vez da URL privada do desenvolvedor (ais-dev-...)
    // Isso evita o erro 403 Proibido para os consultores que tentam acessar o site.
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const handleCopyLink = () => {
    const originUrl = getPublicShareUrl();
    navigator.clipboard.writeText(originUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Controle Lens',
          text: 'Acesse o estoque de lentes do Reis Controle Lens em tempo real pelo seu smartphone.',
          url: getPublicShareUrl()
        });
      } catch (err) {
        console.log('Share canceled or failed', err);
      }
    }
  };

  interface SubMenuItem {
    id: string;
    label: string;
    roles: string[];
  }

  interface MenuItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ size: number; className?: string }>;
    roles: string[];
    subItems?: SubMenuItem[];
  }

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin'] },
    { 
      id: 'inventory_group', 
      label: 'Estoque', 
      icon: Package, 
      roles: ['admin', 'consultor'],
      subItems: [
        { id: 'inventory', label: 'Estoque Geral', roles: ['admin'] },
        { id: 'branch_inventory', label: 'Estoque por Filial', roles: ['admin', 'consultor'] },
        { id: 'purchase_suggestions', label: 'Sugestão de Compra', roles: ['admin'] }
      ]
    },
    { id: 'transfers', label: 'Transferências', icon: ArrowLeftRight, roles: ['admin'] },
    { id: 'families', label: 'Famílias de Lentes', icon: Library, roles: ['admin'] },
    { id: 'branches', label: 'Filiais', icon: MapPin, roles: ['admin'] },
    { id: 'users', label: 'Usuários', icon: Users, roles: ['admin'] },
    { 
      id: 'reports', 
      label: 'Relatórios', 
      icon: FileText, 
      roles: ['admin'],
      subItems: [
        { id: 'reports', label: 'Exportações Gerais', roles: ['admin'] },
        { id: 'reports_family', label: 'Estoque por Família', roles: ['admin'] }
      ]
    },
  ];

  const filteredMenu = menuItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const getRouteTitle = (route: string) => {
    switch (route) {
      case 'dashboard': return 'Início / Dashboard';
      case 'inventory': return 'Estoque Geral';
      case 'branch_inventory': return 'Estoque por Filial';
      case 'purchase_suggestions': return 'Sugestões de Compra';
      case 'transfers': return 'Transferências de Lentes';
      case 'families': return 'Famílias de Lentes';
      case 'branches': return 'Filiais Ativas';
      case 'users': return 'Controle de Usuários';
      case 'reports': return 'Relatórios e Exportações';
      case 'reports_family': return 'Estoque Tratado por Família';
      default: return route;
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 80 }}
        className="bg-brand-cyan text-white border-r border-cyan-800 flex flex-col z-50 sticky top-0 h-screen overflow-hidden"
      >
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between border-b border-cyan-800/50">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="bg-emerald-500 p-2 rounded-lg shrink-0">
               <Package size={20} className="text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-bold tracking-tight truncate">Controle Lens</span>
            )}
          </div>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-cyan-800 rounded-md transition-colors"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Sidebar Content */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredMenu.map((item) => {
            const Icon = item.icon;
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isActive = currentRoute === item.id || (item.subItems?.some(s => s.id === currentRoute) ?? false);
            
            const allowedSubItems = item.subItems?.filter(sub => profile && sub.roles.includes(profile.role)) || [];

            return (
              <div key={item.id} className="space-y-1">
                <button
                  onClick={() => {
                    if (hasSubItems && allowedSubItems.length > 0) {
                      // Navigate to the first allowed subItem
                      onNavigate(allowedSubItems[0].id);
                    } else {
                      onNavigate(item.id);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center p-3 rounded-xl transition-all duration-200 group relative cursor-pointer",
                    isActive 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "text-cyan-100 hover:bg-cyan-800/50 hover:text-white"
                  )}
                >
                  <Icon size={22} className={cn(isActive ? "text-white" : "text-cyan-300 group-hover:text-white")} />
                  {sidebarOpen && (
                    <span className="ml-3 font-medium text-sm whitespace-nowrap">{item.label}</span>
                  )}
                  {!sidebarOpen && isActive && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute left-0 w-1 h-6 bg-emerald-400 rounded-r-lg"
                    />
                  )}
                </button>

                {/* Indented submenus for open sidebar */}
                {sidebarOpen && hasSubItems && allowedSubItems.length > 0 && (
                  <div className="pl-6 space-y-1 mt-1">
                    {allowedSubItems.map((sub) => {
                      const isSubActive = currentRoute === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onNavigate(sub.id)}
                          className={cn(
                            "w-full flex items-center px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer text-left",
                            isSubActive
                              ? "text-emerald-400 bg-cyan-900/60 font-black border-l-2 border-emerald-400 pl-3.5"
                              : "text-cyan-200 hover:text-white hover:bg-cyan-850/40 pl-4"
                          )}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-cyan-800/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center p-3 text-cyan-200 hover:text-white hover:bg-red-500/10 rounded-xl transition-all group"
          >
            <LogOut size={22} className="group-hover:text-red-400" />
            {sidebarOpen && (
              <span className="ml-3 font-medium text-sm">Sair</span>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40 bg-white/80 backdrop-blur-md">
          <div className="flex items-center space-x-4 flex-1">
            <h2 className="text-xl font-bold text-slate-800 capitalize hidden md:block">
              {getRouteTitle(currentRoute)}
            </h2>
            <div className="relative group max-w-md w-full ml-8">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Busca rápida por SKU ou refração..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-full text-sm focus:ring-2 focus:ring-brand-teal focus:bg-white transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <button 
              onClick={() => {
                setTourStep(0);
                onNavigate('dashboard');
                setTourOpen(true);
              }}
              className="flex items-center space-x-2 px-3.5 py-2 bg-cyan-50 text-brand-teal hover:bg-cyan-100/80 rounded-xl text-xs font-semibold hover:text-teal-800 transition-all cursor-pointer border border-cyan-100 shadow-sm whitespace-nowrap"
              title="Iniciar Tour Guiado explicativo"
            >
              <HelpCircle size={15} className="text-brand-teal" />
              <span>Tour Guiado</span>
            </button>

            <button 
              onClick={() => setShareModalOpen(true)}
              className="flex items-center space-x-2 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 rounded-xl text-xs font-bold transition-all cursor-pointer border border-emerald-100 shadow-sm whitespace-nowrap"
              title="Compartilhar acesso com consultores para celular"
            >
              <Smartphone size={15} className="text-emerald-600 animate-bounce" />
              <span>Acesso Celular / Copiar Link</span>
            </button>

            <button className="relative p-2 text-slate-400 hover:text-brand-teal transition-colors">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            
            <div className="flex items-center space-x-3 pl-6 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-slate-800 leading-none">
                  {profile?.full_name || profile?.email?.split('@')[0] || 'Usuário'}
                </p>
                <p className="text-xs text-slate-400 mt-1 capitalize">{profile?.role || 'Visitante'}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-brand-teal ring-2 ring-emerald-50 ring-offset-2">
                {profile?.full_name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || '?'}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8">
          <motion.div
            key={currentRoute}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </div>

        {/* Footer */}
        <footer className="mt-auto py-8 px-8 border-t border-slate-200 text-center flex justify-between items-center text-slate-400">
          <p className="text-xs">© {new Date().getFullYear()} Reis Controle Lens - v1.0.0</p>
          <p className="text-xs font-medium text-slate-300">By Paulo Reis</p>
        </footer>

        {/* Share Shortcut Modal */}
        <AnimatePresence>
          {shareModalOpen && (
            <div key="share-modal-container-root" className="fixed inset-0 z-50 overflow-y-auto">
              {/* Overlay */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShareModalOpen(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
              />

              {/* Modal Container */}
              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ type: "spring", duration: 0.4 }}
                  className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 z-10"
                >
                  {/* Close button */}
                  <button 
                    onClick={() => setShareModalOpen(false)}
                    className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>

                  <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4 ring-1 ring-emerald-100">
                      <Smartphone size={24} className="animate-pulse" />
                    </div>

                    <h3 className="text-lg font-black text-slate-900 leading-6">
                      Acesso Rápido para Celular
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Compartilhe com seus consultores ou escaneie o código abaixo para abrir o sistema em qualquer smartphone em tempo real!
                    </p>

                    {/* QR Code Container */}
                    <div className="mt-6 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100/80 relative">
                      <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-200/40">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(getPublicShareUrl())}`} 
                          alt="QR Code de Acesso" 
                          className="w-40 h-40"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex items-center space-x-1.5 mt-3 text-xs text-slate-500 bg-white/75 px-3 py-1 rounded-full border border-slate-100 shadow-sm font-semibold">
                        <QrCode size={13} className="text-emerald-500" />
                        <span>Aponte a câmera do celular de qualquer consultor</span>
                      </div>
                    </div>

                    {/* Copiar Link Direct Input */}
                    <div className="mt-5 space-y-2">
                      <label className="block text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Copiar link de atalho
                      </label>
                      <div className="flex items-center space-x-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={getPublicShareUrl()}
                          className="flex-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 outline-none focus:ring-0"
                        />
                        <button
                          onClick={handleCopyLink}
                          className={cn(
                            "flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer font-semibold shadow-sm border shrink-0",
                            copied 
                              ? "bg-emerald-500 text-white border-emerald-500" 
                              : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                          )}
                          title="Copiar Link"
                        >
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                      
                      {/* Web Share API (if supported) */}
                      {typeof navigator !== 'undefined' && (navigator as any).share && (
                        <button
                          onClick={handleNativeShare}
                          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-brand-cyan hover:bg-cyan-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-900/10 cursor-pointer"
                        >
                          <Share2 size={13} />
                          <span>Compartilhar via WhatsApp ou Apps</span>
                        </button>
                      )}
                    </div>

                    {/* Smartphone Install Guide */}
                    <div className="mt-6 border-t border-slate-100 pt-5 text-left">
                      <h4 className="text-xs font-bold text-slate-800 flex items-center mb-3">
                        <span className="w-1.5 h-3 bg-emerald-500 rounded-full mr-2"></span>
                        Como instalar como aplicativo no celular:
                      </h4>
                      <div className="space-y-4 text-[11px] text-slate-500 leading-relaxed font-medium">
                        <div className="flex items-start">
                          <span className="flex items-center justify-center bg-emerald-50 text-emerald-700 font-extrabold rounded-full w-4 h-4 mr-2 text-[10px] shrink-0 mt-0.5">1</span>
                          <p>
                            Abra o link ou escaneie o QR Code usando o <strong>Safari (iPhone)</strong> ou o <strong>Google Chrome (Android)</strong>.
                          </p>
                        </div>
                        <div className="flex items-start">
                          <span className="flex items-center justify-center bg-emerald-50 text-emerald-700 font-extrabold rounded-full w-4 h-4 mr-2 text-[10px] shrink-0 mt-0.5">2</span>
                          <p>
                            No iPhone, clique em <strong>Compartilhar <Share2 size={10} className="inline m-0.5" /></strong>. No Android, toque nos <strong>3 pontinhos</strong> do canto superior direito.
                          </p>
                        </div>
                        <div className="flex items-start">
                          <span className="flex items-center justify-center bg-emerald-50 text-emerald-700 font-extrabold rounded-full w-4 h-4 mr-2 text-[10px] shrink-0 mt-0.5">3</span>
                          <p>
                            Selecione <strong>"Adicionar à Tela de Início"</strong> ou <strong>"Instalar Aplicativo"</strong>. Ele aparecerá na sua tela de apps como um aplicativo nativo rápido!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                      <button
                        onClick={() => setShareModalOpen(false)}
                        className="w-full sm:w-auto px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Onboarding Tour Modal */}
        <AnimatePresence>
          {tourOpen && (
            <div key="tour-modal-container-root" className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCompleteTour}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              />

              <div className="flex min-h-full items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 30 }}
                  transition={{ type: "spring", duration: 0.5 }}
                  className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-8 shadow-2xl border border-slate-100 z-[101]"
                >
                  <button 
                    onClick={handleCompleteTour}
                    className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>

                  <div className="text-center sm:text-left">
                    <div className="mx-auto sm:mx-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-brand-teal mb-5 ring-4 ring-cyan-50">
                      <HelpCircle size={28} className="animate-pulse" />
                    </div>

                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest bg-cyan-100 text-brand-teal px-2 py-0.5 rounded">
                        Guia Explicativo
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        Passo {tourStep + 1} de {tourSteps.length}
                      </span>
                    </div>

                    <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                      {tourSteps[tourStep].title}
                    </h3>
                    
                    <p className="mt-3.5 text-sm text-slate-500 leading-relaxed font-semibold">
                      {tourSteps[tourStep].message}
                    </p>

                    {/* Progress Dots */}
                    <div className="mt-6 flex justify-center sm:justify-start space-x-1.5">
                      {tourSteps.map((_, idx) => (
                        <div 
                          key={idx}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            idx === tourStep ? "bg-brand-teal w-6" : "bg-slate-200 w-1.5"
                          )}
                        />
                      ))}
                    </div>

                    <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between gap-3">
                      <button
                        onClick={handleCompleteTour}
                        className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        Pular Tour
                      </button>

                      <div className="flex gap-2">
                        {tourStep > 0 && (
                          <button
                            onClick={handlePrevTourStep}
                            className="px-4 py-2 bg-slate-150 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            Anterior
                          </button>
                        )}
                        <button
                          onClick={handleNextTourStep}
                          className="px-5 py-2.5 bg-brand-teal text-white hover:bg-teal-700 text-xs font-bold rounded-xl shadow-lg shadow-teal-900/15 transition-all cursor-pointer"
                        >
                          {tourStep === tourSteps.length - 1 ? 'Finalizar' : 'Próximo'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
