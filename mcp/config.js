// Configuração: `.env` na raiz do repositório + arquivos JSON em `config/`.
// Segredos só vivem no `.env` (gitignored). Nada aqui grava credencial em outro lugar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Interpreta o texto de um `.env` (KEY=VALUE, aspas opcionais, `#` comenta, `export` ignorado). */
export function parseEnv(texto) {
  const saida = {};
  for (const linhaBruta of String(texto ?? '').split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const m = linha.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    } else {
      const hash = valor.indexOf(' #');
      if (hash >= 0) valor = valor.slice(0, hash).trim();
    }
    saida[m[1]] = valor;
  }
  return saida;
}

/**
 * Lê `<raiz>/.env` e devolve um objeto de ambiente: o que já existe em `env` prevalece
 * (variável do sistema ganha do arquivo). Não altera `process.env`.
 */
export function carregarEnv(raiz = RAIZ, env = process.env) {
  const arquivo = path.join(raiz, '.env');
  const doArquivo = fs.existsSync(arquivo) ? parseEnv(fs.readFileSync(arquivo, 'utf8')) : {};
  const resultado = { ...doArquivo };
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== '') resultado[k] = v;
  }
  return resultado;
}

const inteiroOuNulo = (v) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : null;
};
const textoOuNulo = (v) => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

/** Monta a configuração a partir de um objeto de ambiente (use `carregarEnv()` antes). */
export function obterConfig(env, raiz = RAIZ) {
  const dirConfig = path.join(raiz, 'config');
  return {
    raiz,
    subdominio: textoOuNulo(env.SIENGE_SUBDOMINIO)?.toLowerCase().replace(/^https?:\/\//, '').split('.')[0] ?? null,
    usuario: textoOuNulo(env.SIENGE_USUARIO_API),
    senha: textoOuNulo(env.SIENGE_SENHA_API),
    empresaPadrao: inteiroOuNulo(env.SIENGE_EMPRESA_PADRAO),
    documentoPadrao: textoOuNulo(env.SIENGE_DOCUMENTO_PADRAO) ?? 'NF',
    indexadorPadrao: inteiroOuNulo(env.SIENGE_INDEXADOR_PADRAO),
    planoPadrao: textoOuNulo(env.SIENGE_PLANO_FINANCEIRO_PADRAO),
    dirConfig,
    arquivoRegras: path.join(dirConfig, 'regras.json'),
    arquivoAprendizado: path.join(dirConfig, 'aprendizado.json'),
    arquivoCache: path.join(dirConfig, 'cache.json'),
    dirNotas: path.join(raiz, 'notas'),
  };
}

/** Recarrega `.env` + config do zero (barato; usado a cada chamada de tool para pegar setup recém-feito). */
export function recarregarConfig(raiz = RAIZ, env = process.env) {
  return obterConfig(carregarEnv(raiz, env), raiz);
}

export function configCompleta(cfg) {
  return Boolean(cfg?.subdominio && cfg?.usuario && cfg?.senha);
}

/** Lista o que falta para a conexão funcionar, em linguagem de usuário. */
export function faltandoNaConfig(cfg) {
  const faltas = [];
  if (!cfg?.subdominio) faltas.push('SIENGE_SUBDOMINIO (o começo do endereço do seu Sienge)');
  if (!cfg?.usuario) faltas.push('SIENGE_USUARIO_API (usuário de API)');
  if (!cfg?.senha) faltas.push('SIENGE_SENHA_API (senha do usuário de API)');
  return faltas;
}

// ─── JSON em config/ ─────────────────────────────────────────────────────────

export function lerJson(arquivo, padrao) {
  try {
    if (!fs.existsSync(arquivo)) return padrao;
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (erro) {
    throw new Error(`Arquivo ${path.basename(arquivo)} inválido (${erro.message}). Corrija o JSON ou apague o arquivo.`);
  }
}

export function escreverJson(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2) + '\n', 'utf8');
}

/**
 * Regras de apropriação escritas pelo usuário (`config/regras.json`).
 * Forma: { versao: 1, regras: [{ nome, quando: { palavras?: [], documentos?: [] }, apropriar: { centro_custo_id, plano_financeiro_id, departamento_id? } }] }
 */
export function carregarRegras(cfg) {
  const dados = lerJson(cfg.arquivoRegras, { versao: 1, regras: [] });
  const regras = Array.isArray(dados?.regras) ? dados.regras : [];
  return { versao: 1, regras: regras.filter((r) => r && typeof r === 'object' && r.apropriar) };
}

/**
 * Aprendizado automático (`config/aprendizado.json`): por documento do fornecedor,
 * a apropriação confirmada da última vez e quantas vezes foi usada.
 */
export function carregarAprendizado(cfg) {
  const dados = lerJson(cfg.arquivoAprendizado, { versao: 1, fornecedores: {} });
  return { versao: 1, fornecedores: dados?.fornecedores && typeof dados.fornecedores === 'object' ? dados.fornecedores : {} };
}

export function registrarAprendizado(cfg, documento, dados) {
  const atual = carregarAprendizado(cfg);
  const anterior = atual.fornecedores[documento];
  const mesmaApropriacao = anterior
    && anterior.centro_custo_id === dados.centro_custo_id
    && anterior.plano_financeiro_id === dados.plano_financeiro_id
    && (anterior.departamento_id ?? null) === (dados.departamento_id ?? null);
  atual.fornecedores[documento] = {
    fornecedor: dados.fornecedor ?? anterior?.fornecedor ?? null,
    centro_custo_id: dados.centro_custo_id,
    plano_financeiro_id: dados.plano_financeiro_id,
    departamento_id: dados.departamento_id ?? null,
    observacao: dados.observacao ?? anterior?.observacao ?? null,
    vezes: mesmaApropriacao ? (anterior.vezes ?? 0) + 1 : 1,
    atualizado_em: new Date().toISOString(),
  };
  escreverJson(cfg.arquivoAprendizado, atual);
  return atual.fornecedores[documento];
}

// ─── Cache de listas (economiza a cota diária da API) ────────────────────────

export function lerCache(cfg, chave, ttlMs) {
  const cache = lerJson(cfg.arquivoCache, {});
  const item = cache?.[chave];
  if (!item?.em || !Array.isArray(item.dados)) return null;
  if (Date.now() - new Date(item.em).getTime() > ttlMs) return null;
  return item.dados;
}

export function gravarCache(cfg, chave, dados) {
  const cache = lerJson(cfg.arquivoCache, {});
  cache[chave] = { em: new Date().toISOString(), dados };
  escreverJson(cfg.arquivoCache, cache);
}
