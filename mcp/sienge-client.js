// Cliente HTTP da API REST pública do Sienge Plataforma.
// Documentação oficial: https://api.sienge.com.br/docs/  (YAMLs em /docs/yaml-files/*.yaml)
// Autenticação: HTTP Basic com usuário de API + senha (Integrações > APIs > Usuários de APIs).
// URL: https://api.sienge.com.br/{subdominio}/public/api/v1/{recurso}

import fs from 'node:fs';
import path from 'node:path';
import { normalizarDocumento, somenteDigitos } from './util.js';

export class SiengeError extends Error {
  constructor(mensagem, { status = 0, detalhe = null, corpo = null, caminho = null } = {}) {
    super(mensagem);
    this.name = 'SiengeError';
    this.status = status;
    this.detalhe = detalhe;
    this.corpo = corpo;
    this.caminho = caminho;
  }
}

/** Traduz o status HTTP + corpo de erro do Sienge para uma mensagem que o usuário entende. */
export function traduzirErro(status, corpo, caminho) {
  const msgApi = corpo?.clientMessage || corpo?.developerMessage || corpo?.message || null;
  const mapa = {
    400: 'O Sienge recusou os dados enviados (validação de regra de negócio).',
    401: 'Usuário ou senha da API recusados pelo Sienge. Confira SIENGE_USUARIO_API e SIENGE_SENHA_API no .env. A senha só aparece uma vez ao criar o usuário; se perdeu, gere uma nova em Integrações > APIs > Usuários de APIs.',
    403: 'Este usuário de API não tem acesso a este recurso. No Sienge, em Integrações > APIs > Usuários de APIs, libere a API correspondente para o usuário.',
    404: 'Recurso não encontrado no Sienge. Confira o subdomínio (SIENGE_SUBDOMINIO) e o código informado.',
    429: 'Limite de requisições atingido: 200 por minuto ou a cota diária do pacote de API contratado (o pacote Free tem 100 por dia). Aguarde e tente de novo.',
    500: 'Erro interno no Sienge. Tente de novo em instantes.',
    502: 'Sienge temporariamente indisponível.',
    503: 'Sienge em manutenção ou indisponível.',
    504: 'O Sienge demorou demais para responder.',
  };
  const base = mapa[status] || `Erro HTTP ${status} na API do Sienge.`;
  const onde = caminho ? ` [${caminho}]` : '';
  return msgApi ? `${base}${onde}\nDetalhe do Sienge: ${msgApi}` : `${base}${onde}`;
}

/** Extrai o id numérico de um header Location (`.../creditors/123`). */
export function extrairIdLocation(location) {
  if (!location) return null;
  const m = String(location).match(/\/(\d+)\/?(?:\?.*)?$/);
  return m ? Number(m[1]) : null;
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
};

const STATUS_TRANSITORIOS = new Set([429, 500, 502, 503, 504]);

export class SiengeClient {
  constructor({ subdominio, usuario, senha, fetchImpl = globalThis.fetch, timeoutMs = 30000, dormir } = {}) {
    if (!subdominio || !usuario || !senha) throw new Error('SiengeClient precisa de subdominio, usuario e senha');
    this.subdominio = subdominio;
    this.usuario = usuario;
    this.senha = senha;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.dormir = dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.requisicoes = 0;
  }

  get baseUrl() {
    return `https://api.sienge.com.br/${this.subdominio}/public/api/v1`;
  }

  get authHeader() {
    return 'Basic ' + Buffer.from(`${this.usuario}:${this.senha}`, 'utf8').toString('base64');
  }

  montarUrl(caminho, query) {
    const url = new URL(this.baseUrl + caminho);
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
      else url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  /**
   * Requisição bruta. Só GET é repetido em erro transitório — POST/PATCH nunca,
   * para não duplicar credor ou título.
   */
  async requisicao(metodo, caminho, { query, body, form, tentativas = 2 } = {}) {
    const url = this.montarUrl(caminho, query);
    const headers = { Authorization: this.authHeader, Accept: 'application/json' };
    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    for (let tentativa = 1; ; tentativa++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let resposta;
      try {
        this.requisicoes++;
        resposta = await this.fetch(url, { method: metodo, headers, body: payload, signal: controller.signal });
      } catch (erro) {
        clearTimeout(timer);
        if (metodo === 'GET' && tentativa <= tentativas) {
          await this.dormir(500 * tentativa);
          continue;
        }
        const motivo = erro?.name === 'AbortError' ? 'tempo esgotado' : erro?.message;
        throw new SiengeError(`Não consegui falar com a API do Sienge (${motivo}). Confira a internet e o subdomínio.`, { caminho });
      }
      clearTimeout(timer);

      const texto = await resposta.text();
      let dados = null;
      if (texto) {
        try {
          dados = JSON.parse(texto);
        } catch {
          dados = { raw: texto };
        }
      }
      if (resposta.ok) {
        return { status: resposta.status, dados, headers: resposta.headers, location: resposta.headers.get('location') };
      }
      if (metodo === 'GET' && STATUS_TRANSITORIOS.has(resposta.status) && tentativa <= tentativas) {
        await this.dormir(1000 * tentativa);
        continue;
      }
      throw new SiengeError(traduzirErro(resposta.status, dados, caminho), {
        status: resposta.status,
        detalhe: dados?.developerMessage ?? null,
        corpo: dados,
        caminho,
      });
    }
  }

  /** Percorre todas as páginas de um recurso paginado (`resultSetMetadata` + `results`). */
  async listarTudo(caminho, query = {}, { limite = 200, maximo = 5000 } = {}) {
    const todos = [];
    let offset = 0;
    for (;;) {
      const { dados } = await this.requisicao('GET', caminho, { query: { ...query, limit: limite, offset } });
      if (Array.isArray(dados)) return dados;
      const pagina = dados?.results ?? [];
      todos.push(...pagina);
      offset += pagina.length;
      const total = dados?.resultSetMetadata?.count;
      if (pagina.length === 0 || pagina.length < limite) break;
      if (Number.isFinite(total) && offset >= total) break;
      if (offset >= maximo) break;
    }
    return todos;
  }

  // ─── Cadastros ─────────────────────────────────────────────────────────────

  empresas() {
    return this.listarTudo('/companies');
  }

  centrosCusto() {
    return this.listarTudo('/cost-centers');
  }

  departamentos() {
    return this.listarTudo('/departments');
  }

  indexadores() {
    return this.listarTudo('/indexers');
  }

  async planosFinanceiros() {
    const { dados } = await this.requisicao('GET', '/payment-categories');
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados?.results)) return dados.results;
    return dados ? [dados] : [];
  }

  /** Tipo de documento por código (ex.: `NF`). Devolve `null` quando não existe. */
  async documento(codigo) {
    try {
      const { dados } = await this.requisicao('GET', `/document-identifications/${encodeURIComponent(String(codigo).trim())}`);
      return dados;
    } catch (erro) {
      if (erro instanceof SiengeError && erro.status === 404) return null;
      throw erro;
    }
  }

  // ─── Credores ──────────────────────────────────────────────────────────────

  async credores({ cnpj, cpf, nome, limite = 50 } = {}) {
    const query = { limit: limite };
    if (cnpj) query.cnpj = [normalizarDocumento(cnpj)];
    if (cpf) query.cpf = somenteDigitos(cpf);
    if (nome) query.creditor = nome;
    const { dados } = await this.requisicao('GET', '/creditors', { query });
    return dados?.results ?? [];
  }

  async credor(id) {
    const { dados } = await this.requisicao('GET', `/creditors/${Number(id)}`);
    return dados;
  }

  /** POST /creditors. O Sienge responde 201 sem corpo; o id vem do Location ou de uma busca pelo documento. */
  async criarCredor(payload) {
    const r = await this.requisicao('POST', '/creditors', { body: payload });
    let id = extrairIdLocation(r.location) ?? r.dados?.id ?? null;
    if (id == null && payload?.registerNumber) {
      const lista = await this.credores(payload.personType === 'F' ? { cpf: payload.registerNumber } : { cnpj: payload.registerNumber });
      id = lista[0]?.id ?? null;
    }
    return { id, status: r.status, location: r.location };
  }

  // ─── Títulos a pagar ───────────────────────────────────────────────────────

  /** GET /bills — `startDate` e `endDate` (emissão) são obrigatórios na API. */
  async titulos(query) {
    const { dados } = await this.requisicao('GET', '/bills', { query: { limit: 50, ...query } });
    return { total: dados?.resultSetMetadata?.count ?? (dados?.results?.length ?? 0), results: dados?.results ?? [] };
  }

  async titulo(id) {
    const { dados } = await this.requisicao('GET', `/bills/${Number(id)}`);
    return dados;
  }

  parcelas(id) {
    return this.listarTudo(`/bills/${Number(id)}/installments`);
  }

  anexos(id) {
    return this.listarTudo(`/bills/${Number(id)}/attachments`);
  }

  /** POST /bills. 201 sem corpo; o id vem do Location ou de uma busca por credor + número do documento. */
  async criarTitulo(payload) {
    const r = await this.requisicao('POST', '/bills', { body: payload });
    let id = extrairIdLocation(r.location) ?? r.dados?.id ?? null;
    if (id == null) {
      const busca = await this.titulos({
        startDate: payload.issueDate,
        endDate: payload.issueDate,
        creditorId: payload.creditorId,
        documentNumber: payload.documentNumber,
        limit: 20,
      });
      const achados = busca.results
        .filter((b) => String(b.documentNumber ?? '').trim() === String(payload.documentNumber).trim())
        .sort((a, b) => Number(b.id) - Number(a.id));
      id = achados[0]?.id ?? null;
    }
    return { id, status: r.status, location: r.location, corpo: r.dados };
  }

  /** POST /bills/{id}/attachments (multipart; limite do Sienge: 70 MB). */
  async anexarArquivo(billId, { caminho, descricao } = {}) {
    if (!caminho || !fs.existsSync(caminho)) throw new Error(`Arquivo não encontrado: ${caminho}`);
    const tamanho = fs.statSync(caminho).size;
    if (tamanho > 70 * 1024 * 1024) throw new Error('Arquivo maior que 70 MB, que é o limite de anexo do Sienge.');
    const nome = path.basename(caminho);
    const tipo = MIME[path.extname(caminho).toLowerCase()] || 'application/octet-stream';
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(caminho)], { type: tipo }), nome);
    const r = await this.requisicao('POST', `/bills/${Number(billId)}/attachments`, {
      query: { description: String(descricao || nome).slice(0, 500) },
      form,
    });
    return { status: r.status, nome, tamanho, tipo };
  }
}
