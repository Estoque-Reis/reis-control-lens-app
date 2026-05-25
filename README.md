# Reis Controle Lens

**By Paulo Reis**

Sistema profissional e moderno de gerenciamento de estoque de lentes oftálmicas para redes de óticas.

## 🚀 Tecnologias

- **Frontend:** React + Vite + Tailwind CSS (v4)
- **Animações:** Framer Motion (motion/react)
- **Ícones:** Lucide React
- **Gráficos:** Recharts
- **Backend:** Supabase (Auth + PostgreSQL)

## 📋 Funcionalidades

- **Autenticação RBAC:** Perfis de Administrador e Consultor.
- **Dashboard:** Indicadores em tempo real, valor total de estoque e alertas críticos.
- **Controle de Filiais:** Gestão de múltiplas lojas.
- **Gerador de Grade:** Criação automática de SKUs baseada em ESF/CIL.
- **Consulta por Refração:** Busca rápida de disponibilidade em toda a rede.
- **Movimentações:** Entradas, saídas e transferências entre filiais.

## 🛠️ Instalação

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente no arquivo `.env`:
   ```env
   VITE_SUPABASE_URL=sua_url_do_supabase
   VITE_SUPABASE_ANON_KEY=sua_chave_anonima
   ```
4. Execute o script SQL contido em `src/supabase-schema.sql` no painel SQL do Supabase.
5. (Opcional) Execute o script `src/seed.sql` para dados demonstrativos.
6. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

## 🔐 Configuração do Supabase

### Autenticação
Ative o provedor **Email/Password** no menu Authentication.

### Perfil de Administrador
Após criar o primeiro usuário, altere o campo `role` na tabela `profiles` para `admin`.

---

Desenvolvido com foco em eficiência operacional e precisão técnica para o setor óptico.
