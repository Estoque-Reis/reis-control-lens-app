import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { cn } from '@/src/lib/utils';
import { Eye, EyeOff, Database, Smartphone, Monitor } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | React.ReactNode | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const ALLOWED_EMAIL = 'paulo_ricardo_reis@hotmail.com';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    const emailId = normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_');

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const firebaseUser = userCredential.user;
        
        if (firebaseUser) {
          const path = `profiles/${firebaseUser.uid}`;
          
          // Look up pre-registered profile
          let preProfileData: any = {};
          let preDocExists = false;
          if (emailId) {
            try {
              const preDoc = await getDoc(doc(db, 'profiles', emailId));
              if (preDoc.exists()) {
                preProfileData = preDoc.data();
                preDocExists = true;
              }
            } catch (err) {
              console.warn('Could not read pre-existing profile during register:', err);
            }
          }

          const isMaster = normalizedEmail === ALLOWED_EMAIL.toLowerCase();
          const finalRole = isMaster ? 'admin' : (preProfileData.role || 'visitante');

          try {
            await setDoc(doc(db, 'profiles', firebaseUser.uid), {
              full_name: preProfileData.full_name || email.split('@')[0],
              email: normalizedEmail,
              role: finalRole,
              status: preProfileData.status || 'active',
              branch_id: preProfileData.branch_id || '',
              created_at: preProfileData.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

            // Clean up pre-registered profile if it exists to avoid duplications
            if (preDocExists) {
              try {
                // Delete the email-based document, as we have merged it into the active UID document
                const { deleteDoc } = await import('firebase/firestore');
                await deleteDoc(doc(db, 'profiles', emailId));
              } catch (delErr) {
                console.warn('Silent warning: Could not delete pre-profile during signup:', delErr);
              }
            }
          } catch (writeErr) {
            handleFirestoreError(writeErr, OperationType.WRITE, path);
          }
          setError('Conta criada com sucesso! Você já pode entrar.');
          setIsSignUp(false);
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const firebaseUser = userCredential.user;
        
        if (firebaseUser) {
          const docRef = doc(db, 'profiles', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          const isMasterUser = firebaseUser.email?.toLowerCase() === ALLOWED_EMAIL.toLowerCase() || normalizedEmail === ALLOWED_EMAIL.toLowerCase();
          
          // Look up pre-registered profile
          let preProfileData: any = {};
          let preDocExists = false;
          if (emailId) {
            try {
              const preDoc = await getDoc(doc(db, 'profiles', emailId));
              if (preDoc.exists()) {
                preProfileData = preDoc.data();
                preDocExists = true;
              }
            } catch (err) {
              console.warn('Could not check first-time profile on login:', err);
            }
          }

          // Auto-migrate or initialize profile if not already configured in actual UID path or is master user
          if (!docSnap.exists() || isMasterUser || preDocExists) {
            const finalRole = isMasterUser ? 'admin' : (preProfileData.role || docSnap.data()?.role || 'visitante');

            try {
              await setDoc(docRef, {
                full_name: preProfileData.full_name || docSnap.data()?.full_name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
                email: firebaseUser.email?.toLowerCase() ?? normalizedEmail,
                role: finalRole,
                status: preProfileData.status || docSnap.data()?.status || 'active',
                branch_id: preProfileData.branch_id || docSnap.data()?.branch_id || '',
                updated_at: new Date().toISOString(),
                ...(docSnap.exists() ? {} : { created_at: preProfileData.created_at || new Date().toISOString() })
              }, { merge: true });

              // Clean up pre-registered profile if it exists to avoid duplications
              if (preDocExists) {
                try {
                  const { deleteDoc } = await import('firebase/firestore');
                  await deleteDoc(doc(db, 'profiles', emailId));
                } catch (delErr) {
                  console.warn('Silent warning: Could not delete pre-profile during login:', delErr);
                }
              }
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.WRITE, `profiles/${firebaseUser.uid}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O login por E-mail/Senha está desativado. Ative "Email/Password" no console do Firebase.');
      } else if (err.code === 'auth/invalid-credential') {
        setError(
          <div className="flex flex-col gap-1.5">
            <span>E-mail ou senha incorretos, ou o usuário ainda não foi cadastrado no sistema.</span>
            <span className="text-[11px] font-medium text-emerald-600 block mt-0.5">
              💡 Caso este seja o seu primeiro acesso, clique em <strong className="underline">"Cadastre-se"</strong> logo abaixo para criar sua conta.
            </span>
          </div>
        );
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está cadastrado.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter no mínimo 6 caracteres.');
      } else if (err.code === 'auth/network-request-failed') {
        const isIframe = window.self !== window.top;
        setError(
          <div className="flex flex-col gap-2">
            <span>Erro de conexão detectado. Verifique se o navegador está bloqueando a comunicação com o Firebase (comum devido a bloqueadores de anúncios ou cookies de terceiros em Iframes).</span>
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
              Recarregar página
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
              O controle de estoque mais inteligente e integrado para sua rede de óticas.
              Fácil de usar, refinado e focado na operação das suas filiais.
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
              {isSignUp ? 'Comece a gerenciar seu estoque hoje' : 'Bem-vindo ao Reis Control Lens'}
            </p>
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
                (typeof error === 'string' && (error.includes('sucesso') || error.includes('criada')))
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

            <div className="text-center mt-4">
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

          <div className="mt-8 pt-6 border-t border-slate-100">
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

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-[10px] text-slate-400">
              © {new Date().getFullYear()} Reis Controle Lens. Todos os direitos reservados.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
