import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    const { children } = (this as any).props;

    if (hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-100 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Ops! Algo deu errado.</h2>
            <p className="text-slate-500 text-sm mb-6">
              Ocorreu um erro inesperado na aplicação. Isso pode ser causado por configurações pendentes ou falha na conexão com o banco de dados.
            </p>
            
            <div className="bg-slate-50 p-4 rounded-lg text-left mb-8 overflow-auto max-h-40">
              <p className="text-xs font-mono text-red-600 break-words">
                {this.state.error?.message || 'Erro desconhecido'}
              </p>
            </div>

            <button 
              onClick={() => window.location.reload()}
              className="flex items-center justify-center w-full px-6 py-3 bg-brand-teal text-white rounded-xl font-bold hover:bg-teal-800 transition-all shadow-lg shadow-teal-900/10"
            >
              <RefreshCw size={18} className="mr-2" /> Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
