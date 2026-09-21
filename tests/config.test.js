import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseEnv,
  carregarEnv,
  obterConfig,
  configCompleta,
  faltandoNaConfig,
  carregarRegras,
  carregarAprendizado,
  registrarAprendizado,
  lerCache,
  gravarCache,
} from '../mcp/config.js';

function raizTemporaria() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sienge-agent-'));
}

test('parseEnv: aspas, comentários e export', () => {
  const env = parseEnv([
    '# comentário',
    'SIENGE_SUBDOMINIO=minhaempresa',
    'SIENGE_USUARIO_API="minhaempresa-agente"',
    "SIENGE_SENHA_API='s3nh@ com espaço'",
    'export SIENGE_EMPRESA_PADRAO=3 # empresa principal',
    'LINHA_INVALIDA',
    '',
  ].join('\n'));
  assert.deepEqual(env, {
    SIENGE_SUBDOMINIO: 'minhaempresa',
    SIENGE_USUARIO_API: 'minhaempresa-agente',
    SIENGE_SENHA_API: 's3nh@ com espaço',
    SIENGE_EMPRESA_PADRAO: '3',
  });
});

test('carregarEnv: variável do sistema vence o arquivo; sem arquivo não quebra', () => {
  const raiz = raizTemporaria();
  fs.writeFileSync(path.join(raiz, '.env'), 'SIENGE_SUBDOMINIO=doarquivo\nSIENGE_SENHA_API=x\n');
  const env = carregarEnv(raiz, { SIENGE_SUBDOMINIO: 'dosistema', VAZIA: '' });
  assert.equal(env.SIENGE_SUBDOMINIO, 'dosistema');
  assert.equal(env.SIENGE_SENHA_API, 'x');
  assert.equal(env.VAZIA, undefined);
  assert.deepEqual(carregarEnv(raizTemporaria(), {}), {});
});

test('obterConfig: normaliza subdomínio e converte inteiros', () => {
  const cfg = obterConfig({
    SIENGE_SUBDOMINIO: 'https://MinhaEmpresa.sienge.com.br',
    SIENGE_USUARIO_API: 'minhaempresa-agente',
    SIENGE_SENHA_API: 'abc',
    SIENGE_EMPRESA_PADRAO: '7',
    SIENGE_INDEXADOR_PADRAO: 'nada',
  }, '/tmp/x');
  assert.equal(cfg.subdominio, 'minhaempresa');
  assert.equal(cfg.empresaPadrao, 7);
  assert.equal(cfg.indexadorPadrao, null);
  assert.equal(cfg.documentoPadrao, 'NF');
  assert.equal(configCompleta(cfg), true);
  const incompleta = obterConfig({ SIENGE_SUBDOMINIO: 'x' }, '/tmp/x');
  assert.equal(configCompleta(incompleta), false);
  assert.equal(faltandoNaConfig(incompleta).length, 2);
});

test('regras e aprendizado: leitura tolerante e contagem de vezes', () => {
  const raiz = raizTemporaria();
  const cfg = obterConfig({}, raiz);
  assert.deepEqual(carregarRegras(cfg), { versao: 1, regras: [] });
  assert.deepEqual(carregarAprendizado(cfg), { versao: 1, fornecedores: {} });

  fs.mkdirSync(cfg.dirConfig, { recursive: true });
  fs.writeFileSync(cfg.arquivoRegras, JSON.stringify({ regras: [{ nome: 'ok', quando: {}, apropriar: { centro_custo_id: 1 } }, { nome: 'quebrada' }, null] }));
  assert.equal(carregarRegras(cfg).regras.length, 1);

  const a1 = registrarAprendizado(cfg, '11222333000181', { fornecedor: 'Posto', centro_custo_id: 1, plano_financeiro_id: '2010101' });
  assert.equal(a1.vezes, 1);
  const a2 = registrarAprendizado(cfg, '11222333000181', { centro_custo_id: 1, plano_financeiro_id: '2010101' });
  assert.equal(a2.vezes, 2);
  assert.equal(a2.fornecedor, 'Posto');
  const a3 = registrarAprendizado(cfg, '11222333000181', { centro_custo_id: 2, plano_financeiro_id: '2010101' });
  assert.equal(a3.vezes, 1);
  assert.equal(carregarAprendizado(cfg).fornecedores['11222333000181'].centro_custo_id, 2);

  fs.writeFileSync(cfg.arquivoRegras, '{ isso não é json');
  assert.throws(() => carregarRegras(cfg), /regras.json inválido/);
});

test('cache: respeita TTL', () => {
  const raiz = raizTemporaria();
  const cfg = obterConfig({}, raiz);
  assert.equal(lerCache(cfg, 'x', 1000), null);
  gravarCache(cfg, 'x', [{ id: 1 }]);
  assert.deepEqual(lerCache(cfg, 'x', 60_000), [{ id: 1 }]);
  assert.equal(lerCache(cfg, 'x', -1), null);
});
