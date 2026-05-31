import React, { useState, useEffect } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { Eye, EyeOff, LayoutDashboard, Database, AlertTriangle, Shield, Users as UsersIcon, Smartphone, Monitor, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | React.ReactNode | null>(null);

  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<'consultor' | 'admin'>('consultor');

  const ALLOWED_EMAIL = 'paulo_ricardo_reis@hotmail.com';

  // Check for Redirect Sign-In results on mount
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        setLoading(true);
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          const docRef = doc(db, 'profiles', user.uid);
          const docSnap = await getDoc(docRef);
          const isMasterUser = user.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase();

          if (!docSnap.exists() || isMasterUser) {
            const emailId = user.email ? user.email.replace(/[^a-zA-Z0-9]/g, '_') : '';
            let preProfileData: any = {};
            if (emailId) {
              try {
                const preDoc = await getDoc(doc(db, 'profiles', emailId));
                if (preDoc.exists()) {
                  preProfileData = preDoc.data();
                }
              } catch (err) {
                console.warn('Could not read preprofile on google redirect login:', err);
              }
            }

            const finalRole = isMasterUser ? 'admin' : 'consultor';

            try {
              await setDoc(docRef, {
                full_name: preProfileData.full_name || user.displayName || user.email?.split('@')[0] || 'Usuário',
                email: user.email,
                role: finalRole,
                status: preProfileData.status || 'active',
                branch_id: preProfileData.branch_id || '',
                updated_at: new Date().toISOString(),
                ...(docSnap.exists() ? {} : { created_at: preProfileData.created_at || new Date().toISOString() })
              }, { merge: true });
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.WRITE, `profiles/${user.uid}`);
            }
          }
        }
      } catch (err: any) {
        console.error('Error handling redirect auth:', err);
        if (err.code === 'auth/unauthorized-domain') {
          handleUnauthorizedDomainError();
        } else {
          setError(err.message || 'Erro ao processar login por redirecionamento.');
        }
      } finally {
        setLoading(false);
      }
    };
    handleRedirectResult();
  }, []);

  const handleUnauthorizedDomainError = () => {
    const currentDomain = window.location.hostname;
    setError(
      <div className="flex flex-col gap-2.5 text-left bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 text-amber-800 text-xs leading-relaxed">
        <div className="flex items-center gap-1.5 font-bold">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <span>Domínio não autorizado no Firebase!</span>
        </div>
        <p>
          O Firebase bloqueou este login porque o domínio atual <strong className="underline text-amber-900 font-mono">{currentDomain}</strong> não está na lista de domínios autorizados do Firebase.
        </p>
        <div className="bg-white p-2.5 rounded border border-amber-100 mt-1">
          <p className="font-bold text-amber-950 mb-1">Como resolver no Firebase Console:</p>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-amber-800">
            <li>Acesse o <b>Firebase Console</b> {">"} <b>Authentication</b>.</li>
            <li>Clique na aba <b>Configurações</b> (Settings) {">"} <b>Domínios Autorizados</b>.</li>
            <li>Adicione o domínio: <code className="font-mono bg-slate-50 px-1 rounded text-red-600 font-bold">{currentDomain}</code></li>
          </ol>
        </div>
      </div>
    );
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;
        
        if (firebaseUser) {
          const path = `profiles/${firebaseUser.uid}`;
          // Check if there is a pre-registered profile by the admin
          const emailId = email.replace(/[^a-zA-Z0-9]/g, '_');
          let preProfileData: any = {};
          try {
            const preDoc = await getDoc(doc(db, 'profiles', emailId));
            if (preDoc.exists()) {
              preProfileData = preDoc.data();
            }
          } catch (err) {
            console.warn('Could not read pre-existing profile:', err);
          }

          const isMaster = email.toLowerCase() === ALLOWED_EMAIL.toLowerCase();
          const finalRole = isMaster ? 'admin' : 'consultor';

          try {
            await setDoc(doc(db, 'profiles', firebaseUser.uid), {
              full_name: preProfileData.full_name || email.split('@')[0],
              email: email,
              role: finalRole,
              status: preProfileData.status || 'active',
              branch_id: preProfileData.branch_id || '',
              created_at: preProfileData.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          } catch (writeErr) {
            handleFirestoreError(writeErr, OperationType.WRITE, path);
          }
          setError('Conta criada com sucesso!');
          setIsSignUp(false);
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;
        
        if (firebaseUser) {
          // If profile does not exist at firebaseUser.uid, let's auto-create it or copy pre-existing one
          const docRef = doc(db, 'profiles', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          const isMasterUser = firebaseUser.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase();
          
          if (!docSnap.exists() || isMasterUser) {
            const emailId = firebaseUser.email ? firebaseUser.email.replace(/[^a-zA-Z0-9]/g, '_') : '';
            let preProfileData: any = {};
            if (emailId) {
              try {
                const preDoc = await getDoc(doc(db, 'profiles', emailId));
                if (preDoc.exists()) {
                  preProfileData = preDoc.data();
                }
              } catch (err) {
                console.warn('Could not check first-time profile on login:', err);
              }
            }

            const finalRole = isMasterUser ? 'admin' : 'consultor';

            await setDoc(docRef, {
              full_name: preProfileData.full_name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              email: firebaseUser.email ?? email,
              role: finalRole,
              status: preProfileData.status || 'active',
              branch_id: preProfileData.branch_id || '',
              updated_at: new Date().toISOString(),
              ...(docSnap.exists() ? {} : { created_at: preProfileData.created_at || new Date().toISOString() })
            }, { merge: true });
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O login por E-mail/Senha está desativado. Use o Google ou ative "Email/Password" no console do Firebase.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos ou conta inexistente.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está cadastrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter no mínimo 6 caracteres.');
      } else if (err.code === 'auth/network-request-failed') {
        const isIframe = window.self !== window.top;
        setError(
          <div className="flex flex-col gap-2">
            <span>Erro de conexão detectado. Isso acontece quando o navegador bloqueia a comunicação com o Firebase (comum em Iframe ou com bloqueadores de anúncio).</span>
            {isIframe && (
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold mt-1 hover:bg-emerald-700 transition-colors"
                id="open-new-tab-btn"
              >
                ABRIR EM NOVA ABA (RECOMENDADO)
              </button>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="text-slate-400 hover:text-slate-600 text-[10px] underline"
              id="reload-btn"
            >
              Tentando novamente...
            </button>
          </div>
        );
      } else {
        setError(err.message || 'Erro ao processar autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if profile exists, if not create one
      const docRef = doc(db, 'profiles', user.uid);
      const docSnap = await getDoc(docRef);
      const isMasterUser = user.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase();
      
      if (!docSnap.exists() || isMasterUser) {
        const emailId = user.email ? user.email.replace(/[^a-zA-Z0-9]/g, '_') : '';
        let preProfileData: any = {};
        if (emailId) {
          try {
            const preDoc = await getDoc(doc(db, 'profiles', emailId));
            if (preDoc.exists()) {
              preProfileData = preDoc.data();
            }
          } catch (err) {
            console.warn('Could not read preprofile on google login:', err);
          }
        }

        const finalRole = isMasterUser ? 'admin' : 'consultor';

        try {
          await setDoc(docRef, {
            full_name: preProfileData.full_name || user.displayName || user.email?.split('@')[0] || 'Usuário',
            email: user.email,
            role: finalRole, // Only master or pre-registered can have non-consultant roles
            status: preProfileData.status || 'active',
            branch_id: preProfileData.branch_id || '',
            updated_at: new Date().toISOString(),
            ...(docSnap.exists() ? {} : { created_at: preProfileData.created_at || new Date().toISOString() })
          }, { merge: true });
        } catch (writeErr) {
          handleFirestoreError(writeErr, OperationType.WRITE, `profiles/${user.uid}`);
        }
      }
    } catch (err: any) {
      console.error('Google Auth error:', err);
      if (err.code === 'auth/unauthorized-domain') {
        handleUnauthorizedDomainError();
      } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        setError(
          <div className="flex flex-col gap-2 text-left bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 text-blue-850 text-xs">
            <span className="font-bold flex items-center gap-1"><Info size={14} className="text-blue-500 shrink-0" /> Pop-up de Login Bloqueado</span>
            <span>Os pop-ups de autenticação do Google foram bloqueados pelo navegador (comum em celulares). Clique abaixo para entrar via redirecionamento de aba completa:</span>
            <button 
              type="button"
              onClick={() => signInWithRedirect(auth, googleProvider)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-all text-center mt-1 cursor-pointer"
            >
              Entrar com Google por Redirecionamento
            </button>
          </div>
        );
      } else if (err.code === 'auth/network-request-failed') {
        const isIframe = window.self !== window.top;
        setError(
          <div className="flex flex-col gap-2 text-left">
            <span>Erro de conexão com o Google. Pop-ups são bloqueados em sub-domínios ou Iframes.</span>
            {isIframe && (
              <button 
                onClick={() => window.open(window.location.href, '_blank')}
                className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold mt-1 hover:bg-emerald-700 transition-colors"
                id="google-open-new-tab"
              >
                ABRIR EM NOVA ABA PARA LOGAR
              </button>
            )}
          </div>
        );
      } else {
        setError(err.message || 'Erro ao entrar com Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Visual */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-cyan relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574258495973-f010dfbb5371?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay opacity-40"></div>
        <div className="relative z-10 p-12 flex flex-col justify-between h-full text-white">
          <div>
            <div className="flex items-center space-x-2 mb-8">
              <Database className="w-10 h-10 text-emerald-400" />
              <h1 className="text-3xl font-bold tracking-tighter">Reis Controle Lens</h1>
            </div>
            <p className="text-xl font-light max-w-md">
              O controle de estoque mais inteligente para sua rede de óticas.
              Simples, moderno e essencial.
            </p>
          </div>
          <p className="text-sm opacity-60">By Paulo Reis</p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-10 rounded-2xl shadow-xl border border-slate-100"
        >
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-slate-800">
              {isSignUp ? 'Crie sua conta' : 'Acesse sua conta'}
            </h2>
            <p className="text-slate-500 mt-2">
              {isSignUp ? 'Comece a gerenciar seu estoque hoje' : 'Bem-vindo ao Reis Controle Lens'}
            </p>
          </div>

          <div className="mb-6 flex p-1 bg-slate-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setRole('consultor')}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold transition-all rounded-lg flex items-center justify-center space-x-2",
                role === 'consultor' ? "bg-white text-brand-teal shadow-md" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <UsersIcon size={14} />
              <span>Modo Consultor</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('admin')}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold transition-all rounded-lg flex items-center justify-center space-x-2",
                role === 'admin' ? "bg-white text-brand-teal shadow-md" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Shield size={14} />
              <span>Modo Administrador</span>
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {isSignUp && (
                <p className="mt-2 text-[10px] text-slate-400 italic">
                  A senha deve ter no mínimo 6 caracteres.
                </p>
              )}
            </div>

            {error && (
              <div className={cn(
                "p-3 rounded-lg text-sm border",
                error.includes('sucesso') || error.includes('criada') 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                  : "bg-red-50 text-red-600 border-red-100"
              )}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-teal hover:bg-teal-800 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-teal-900/20 transition-all disabled:opacity-50"
            >
              {loading ? 'Processando...' : isSignUp ? 'Criar Conta' : 'Entrar no Sistema'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-slate-400">Ou continue com</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-3 px-6 rounded-lg transition-all disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/firebase/explore/images/google-logo.svg" alt="Google" className="w-5 h-5" />
              <span>Entrar com Google</span>
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="text-sm text-brand-teal hover:text-teal-800 font-medium transition-colors"
              >
                {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem uma conta? Cadastre-se'}
              </button>
            </div>
          </form>

      <div className="mt-6 pt-5 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 mb-3 font-semibold uppercase tracking-widest text-center">Como Instalar no Dispositivo</p>
        <div className="grid grid-cols-1 gap-2 text-left">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-start gap-2.5">
            <div className="bg-white p-1.5 rounded shadow-sm">
              <Smartphone size={14} className="text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-700 leading-tight">Celular (Android/iPhone)</p>
              <p className="text-[9px] text-slate-500 leading-tight mt-0.5">
                Clique nos 3 pontos (Chrome) ou ícone Compartilhar (Safari) e selecione <b>"Instalar App"</b> ou <b>"Adicionar à Tela de Início"</b>.
              </p>
            </div>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-start gap-2.5">
            <div className="bg-white p-1.5 rounded shadow-sm">
              <Monitor size={14} className="text-brand-teal" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-700 leading-tight">Computador (Windows/Mac)</p>
              <p className="text-[9px] text-slate-500 leading-tight mt-0.5">
                No Chrome ou Edge, clique no ícone de monitor na barra de endereço para <b>Instalar o Aplicativo</b>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <p className="text-[10px] text-slate-400">
          © {new Date().getFullYear()} Reis Controle Lens. Todos os direitos reservados.
        </p>
      </div>
        </motion.div>
      </div>
    </div>
  );
}
