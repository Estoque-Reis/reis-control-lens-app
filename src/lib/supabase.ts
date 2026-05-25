import { createClient } from '@supabase/supabase-js';

// Get values from Vite's env system
// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// @ts-ignore
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if credentials are valid
const isConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));

// A super-robust mock that returns empty data instead of crashing
const buildMockChain = () => {
  const result = { data: [], error: null, count: 0, status: 200, statusText: 'OK' };
  
  const chain: any = {
    then: (onfulfilled?: any) => Promise.resolve(onfulfilled ? onfulfilled(result) : result),
    catch: (onrejected?: any) => Promise.resolve(onrejected ? onrejected(null) : null),
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    gt: () => chain,
    lt: () => chain,
    gte: () => chain,
    lte: () => chain,
    like: () => chain,
    ilike: () => chain,
    is: () => chain,
    in: () => chain,
    contains: () => chain,
    containedBy: () => chain,
    range: () => chain,
    match: () => chain,
    filter: () => chain,
    not: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    range_: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    csv: () => chain,
    abortSignal: () => chain,
    throwOnError: () => chain,
    url: new URL('http://localhost'),
    headers: {},
    method: 'GET',
    body: null,
    on: () => chain,
    subscribe: () => ({ unsubscribe: () => {} }),
  };

  return chain;
};

const mockClient = {
  auth: {
    onAuthStateChange: () => ({ 
      data: { subscription: { unsubscribe: () => {} } },
      error: null 
    }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Configuração do Supabase ausente.' } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Configuração do Supabase ausente.' } }),
    signOut: async () => ({ error: null }),
  },
  from: () => buildMockChain(),
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {}
  })
} as any;

if (!isConfigured) {
  console.warn('Reis Controle Lens: Operando em modo de demonstração.');
}

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : mockClient;
