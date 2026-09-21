#!/usr/bin/env node
// Prova real de conexão com o Sienge, fora do MCP: lê o .env, chama a API e imprime o resultado.
// Uso: npm run testar-conexao   (código de saída 0 = conectou; 1 = faltou configuração ou a API recusou)

import { RAIZ, recarregarConfig, configCompleta, faltandoNaConfig } from '../mcp/config.js';
import { SiengeClient } from '../mcp/sienge-client.js';

const cfg = recarregarConfig(RAIZ, process.env);
if (!configCompleta(cfg)) {
  console.error('Configuração incompleta no .env. Falta: ' + faltandoNaConfig(cfg).join(', '));
  console.error('Rode a skill /setup no Claude Code (ela preenche tudo em conversa).');
  process.exit(1);
}

const cliente = new SiengeClient(cfg);
try {
  const empresas = await cliente.empresas();
  console.log(`Conectado ao Sienge (subdomínio "${cfg.subdominio}", usuário "${cfg.usuario}").`);
  console.log(`Empresas visíveis: ${empresas.length}`);
  for (const e of empresas) console.log(`  ${e.id} — ${e.name}${e.tradeName ? ` (${e.tradeName})` : ''}${Number(e.id) === Number(cfg.empresaPadrao) ? '  <- padrão' : ''}`);
  if (!cfg.empresaPadrao) console.log('Falta definir SIENGE_EMPRESA_PADRAO (o /setup faz isso).');
  if (!cfg.indexadorPadrao) console.log('Falta definir SIENGE_INDEXADOR_PADRAO (o /setup faz isso).');
  process.exit(0);
} catch (erro) {
  console.error('Falhou: ' + erro.message);
  process.exit(1);
}
