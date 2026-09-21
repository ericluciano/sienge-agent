import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sugerirApropriacao, montarPayloadTitulo, resumoTitulo, encontrarDuplicados, nomeArquivoNota, registrarTools } from '../mcp/tools.js';

const regras = {
  regras: [
    { nome: 'Fornecedor fixo', quando: { documentos: ['11.222.333/0001-81'] }, apropriar: { centro_custo_id: 5, plano_financeiro_id: '2010105' } },
    { nome: 'Combustível', quando: { palavras: ['posto', 'combustivel'] }, apropriar: { centro_custo_id: 1, plano_financeiro_id: '2010101' } },
    { nome: 'Alimentação', quando: { palavras: ['restaurante', 'padaria'] }, apropriar: { centro_custo_id: 2, plano_financeiro_id: '2010102' } },
  ],
};

test('sugerirApropriacao: aprendizado > regra por documento > regra por palavra > nada', () => {
  const aprendizado = { fornecedores: { '11222333000181': { centro_custo_id: 9, plano_financeiro_id: '2010109', vezes: 3, atualizado_em: '2026-09-01T00:00:00Z' } } };

  const a = sugerirApropriacao({ documento: '11.222.333/0001-81', fornecedor: 'Auto Posto' }, { regras, aprendizado });
  assert.equal(a.origem, 'aprendizado');
  assert.equal(a.apropriacao.centro_custo_id, 9);
  assert.match(a.motivo, /3x/);

  const b = sugerirApropriacao({ documento: '11.222.333/0001-81', fornecedor: 'Auto Posto' }, { regras, aprendizado: { fornecedores: {} } });
  assert.equal(b.origem, 'regra');
  assert.equal(b.regra, 'Fornecedor fixo');
  assert.equal(b.apropriacao.centro_custo_id, 5);

  const c = sugerirApropriacao({ documento: '529.982.247-25', fornecedor: 'AUTO POSTO IPIRANGA' }, { regras, aprendizado: {} });
  assert.equal(c.regra, 'Combustível');
  assert.equal(c.confianca, 'media');

  const d = sugerirApropriacao({ fornecedor: 'Xpto Comércio', itens: ['pão francês', 'café'], descricao: 'compra na padaria' }, { regras });
  assert.equal(d.regra, 'Alimentação');

  const e = sugerirApropriacao({ fornecedor: 'Xpto Comércio' }, { regras, aprendizado: {} });
  assert.equal(e.origem, null);
  assert.equal(e.apropriacao, null);

  const f = sugerirApropriacao({}, {});
  assert.equal(f.origem, null);
});

test('montarPayloadTitulo: defaults do .env, datas e percentuais', () => {
  const cfg = { empresaPadrao: 3, documentoPadrao: 'NF', indexadorPadrao: 1 };
  const payload = montarPayloadTitulo({
    credor_id: 77,
    numero_documento: ' 123456 ',
    data_emissao: '21/09/2026',
    valor_total: '152,30',
    observacao: 'Gasolina, cartão',
    apropriacoes: [{ centro_custo_id: 10, plano_financeiro_id: '2.01.01.01' }],
  }, cfg);
  assert.equal(payload.debtorId, 3);
  assert.equal(payload.creditorId, 77);
  assert.equal(payload.documentIdentificationId, 'NF');
  assert.equal(payload.documentNumber, '123456');
  assert.equal(payload.issueDate, '2026-09-21');
  assert.equal(payload.dueDate, '2026-09-21');
  assert.equal(payload.billDate, '2026-09-21');
  assert.equal(payload.baseDate, '2026-09-21');
  assert.equal(payload.totalInvoiceAmount, 152.3);
  assert.equal(payload.discount, 0);
  assert.equal(payload.installmentsNumber, 1);
  assert.equal(payload.indexId, 1);
  assert.deepEqual(payload.budgetCategories, [{ costCenterId: 10, paymentCategoriesId: '2010101', percentage: 100 }]);
  assert.match(payload.notes, /^Gasolina, cartão \| Lançado pelo Sienge Agent em \d{2}\/\d{2}\/\d{4}$/);
  assert.equal(payload.departmentsCost, undefined);

  const dividido = montarPayloadTitulo({
    empresa_id: 4, credor_id: 1, documento: 'CF', numero_documento: '1', data_emissao: '2026-09-01', data_vencimento: '10/10/2026', data_competencia: '30/09/2026',
    valor_total: 1000, desconto: '50', parcelas: 2, indexador_id: 2,
    apropriacoes: [{ centro_custo_id: 1, plano_financeiro_id: '1', percentual: 60 }, { centro_custo_id: 2, plano_financeiro_id: '1', percentual: 40 }],
    departamentos: [{ departamento_id: 7 }],
  }, {});
  assert.equal(dividido.debtorId, 4);
  assert.equal(dividido.dueDate, '2026-10-10');
  assert.equal(dividido.billDate, '2026-09-30');
  assert.equal(dividido.discount, 50);
  assert.equal(dividido.installmentsNumber, 2);
  assert.deepEqual(dividido.departmentsCost, [{ departmentId: 7, percentage: 100 }]);
});

test('montarPayloadTitulo: erros claros para o que falta', () => {
  const base = { credor_id: 1, numero_documento: '1', data_emissao: '2026-09-21', valor_total: 10, apropriacoes: [{ centro_custo_id: 1, plano_financeiro_id: '1' }] };
  assert.throws(() => montarPayloadTitulo(base, {}), /empresa_id/);
  assert.throws(() => montarPayloadTitulo({ ...base, empresa_id: 1 }, {}), /indexador_id/);
  const cfg = { empresaPadrao: 1, indexadorPadrao: 1 };
  assert.throws(() => montarPayloadTitulo({ ...base, credor_id: null }, cfg), /credor_id/);
  assert.throws(() => montarPayloadTitulo({ ...base, numero_documento: '' }, cfg), /numero_documento/);
  assert.throws(() => montarPayloadTitulo({ ...base, valor_total: 0 }, cfg), /maior que zero/);
  assert.throws(() => montarPayloadTitulo({ ...base, desconto: 11 }, cfg), /desconto/);
  assert.throws(() => montarPayloadTitulo({ ...base, apropriacoes: [] }, cfg), /ao menos uma apropriação/);
  assert.throws(() => montarPayloadTitulo({ ...base, apropriacoes: [{ centro_custo_id: 1, plano_financeiro_id: '1', percentual: 50 }] }, cfg), /somam 50%/);
  assert.throws(() => montarPayloadTitulo({ ...base, data_emissao: '31/02/2026' }, cfg), /inválida/);
});

test('resumoTitulo é legível e mostra nomes quando disponíveis', () => {
  const payload = montarPayloadTitulo({ credor_id: 77, numero_documento: '1', data_emissao: '2026-09-21', valor_total: '1.500,00', apropriacoes: [{ centro_custo_id: 10, plano_financeiro_id: '2010101' }] }, { empresaPadrao: 3, indexadorPadrao: 1 });
  const texto = resumoTitulo(payload, { empresa_nome: 'Construtora X', credor_nome: 'Posto Y', credor_documento: '11222333000181', centros: { 10: 'Obra Z' }, planos: { 2010101: 'Combustível' } });
  assert.match(texto, /Construtora X \(3\)/);
  assert.match(texto, /Posto Y \(77\) — 11\.222\.333\/0001-81/);
  assert.match(texto, /R\$\s?1\.500,00/);
  assert.match(texto, /Obra Z \(10\) · plano Combustível \(2010101\) · 100%/);
});

test('encontrarDuplicados casa credor + número (normalizado) e marca valor igual', () => {
  const existentes = [
    { id: 1, creditorId: 5, documentNumber: ' 123 ', totalInvoiceAmount: 152.3, issueDate: '2026-09-20', status: 'S' },
    { id: 2, creditorId: 5, documentNumber: '124', totalInvoiceAmount: 152.3 },
    { id: 3, creditorId: 6, documentNumber: '123', totalInvoiceAmount: 152.3 },
  ];
  const d = encontrarDuplicados(existentes, { credorId: 5, numeroDocumento: '123', valor: 152.3 });
  assert.equal(d.length, 1);
  assert.equal(d[0].titulo_id, 1);
  assert.equal(d[0].valor_igual, true);
  assert.equal(encontrarDuplicados([], { credorId: 5, numeroDocumento: '123' }).length, 0);
});

test('nomeArquivoNota gera nome seguro', () => {
  assert.equal(nomeArquivoNota({ tituloId: 42, fornecedor: 'Auto Posto Ipiranga Ltda.', extensao: '.jpg' }), '42-auto-posto-ipiranga-ltda.jpg');
  assert.equal(nomeArquivoNota({ fornecedor: '', extensao: '.png' }), 'sem-titulo-nota.png');
});

test('registrarTools: registra as 16 ferramentas e o fluxo de criar_titulo respeita confirmação e duplicidade', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sienge-tools-'));
  fs.writeFileSync(path.join(raiz, '.env'), 'SIENGE_SUBDOMINIO=x\nSIENGE_USUARIO_API=x-u\nSIENGE_SENHA_API=s\nSIENGE_EMPRESA_PADRAO=1\nSIENGE_INDEXADOR_PADRAO=1\n');
  const tools = new Map();
  const servidorFake = { registerTool: (nome, meta, handler) => tools.set(nome, { meta, handler }) };
  const chamadas = [];
  const clienteFake = {
    requisicoes: 0,
    async titulos(q) { chamadas.push(['titulos', q]); return { total: 1, results: [{ id: 99, creditorId: 7, documentNumber: '555', totalInvoiceAmount: 10, issueDate: '2026-09-01' }] }; },
    async criarTitulo(p) { chamadas.push(['criar', p]); return { id: 100, status: 201 }; },
    async empresas() { return [{ id: 1, name: 'Empresa' }]; },
  };
  registrarTools(servidorFake, { raiz, env: {}, criarCliente: () => clienteFake });
  assert.equal(tools.size, 16);
  assert.ok(tools.has('criar_titulo') && tools.has('buscar_credor') && tools.has('arquivar_nota'));

  const criar = tools.get('criar_titulo').handler;
  const base = { credor_id: 7, numero_documento: '555', data_emissao: '2026-09-21', valor_total: 10, apropriacoes: [{ centro_custo_id: 1, plano_financeiro_id: '1' }] };

  const pendente = JSON.parse((await criar(base)).content[0].text);
  assert.equal(pendente.pendente_confirmacao, true);
  assert.equal(chamadas.length, 0);

  const duplicado = JSON.parse((await criar({ ...base, confirmado: true })).content[0].text);
  assert.equal(duplicado.duplicidade, true);
  assert.equal(duplicado.titulos_existentes[0].titulo_id, 99);
  assert.equal(chamadas.filter((c) => c[0] === 'criar').length, 0);

  const criado = JSON.parse((await criar({ ...base, confirmado: true, ignorar_duplicidade: true })).content[0].text);
  assert.equal(criado.criado, true);
  assert.equal(criado.titulo_id, 100);

  const status = JSON.parse((await tools.get('sienge_status').handler({})).content[0].text);
  assert.equal(status.conexao, 'ok');
  assert.equal(status.empresa_padrao.id, 1);

  const semConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'sienge-tools-vazio-'));
  const tools2 = new Map();
  registrarTools({ registerTool: (n, m, h) => tools2.set(n, h) }, { raiz: semConfig, env: {} });
  const st = JSON.parse((await tools2.get('sienge_status')({})).content[0].text);
  assert.equal(st.configurado, false);
  const erro = await tools2.get('listar_empresas')({});
  assert.equal(erro.isError, true);
  assert.match(erro.content[0].text, /setup/);
});
