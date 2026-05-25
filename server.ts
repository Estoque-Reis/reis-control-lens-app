import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`Iniciando servidor em modo ${process.env.NODE_ENV || 'development'}...`);

  // Rota de saúde para o Cloud Run e diagnósticos
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
      cwd: process.cwd()
    });
  });

  // Integração com Vite em desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Middleware do Vite montado (Desenvolvimento)');
    } catch (e) {
      console.error('Erro ao carregar o Vite:', e);
      // Fallback para estático se o vite falhar
      const distPath = path.resolve('dist');
      app.use(express.static(distPath));
    }
  } else {
    // Produção: serve arquivos estáticos da pasta dist
    const distPath = path.resolve('dist');
    console.log(`Servindo arquivos estáticos de: ${distPath}`);
    
    // Check if dist exists
    import('fs').then(fs => {
      if (!fs.existsSync(distPath)) {
        console.error('AVISO: Diretério dist não encontrado! Verifique se npm run build foi executado.');
      }
    }).catch(() => {});

    app.use(express.static(distPath));
    
    // Fallback para SPA: envia index.html para todas as requisições não encontradas
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error(`Erro ao enviar index.html:`, err);
          res.status(404).send('Página não encontrada no servidor. O build pode ter falhado ou os arquivos foram removidos.');
        }
      });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor ouvindo em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Erro fatal na inicialização do servidor:', err);
  process.exit(1);
});
