import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SiengeClient, SiengeError, traduzirErro, extrairIdLocation } from '../mcp/sienge-client.js';

function respostaFake(status, corpo, headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    text: async () => (corpo == null ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  };
}

function clienteComFila(respostas, extra = {}) {
  const chamadas = [];
  const fila = [...respostas];
  const cliente = new SiengeClient({
    subdominio: 'minhaempresa',
    usuario: 'minhaempresa-agente',
    senha: 'segredo',
    dormir: async () => {},
    fetchImpl: async (url, opts) => {
      chamadas.push({ url, opts });
      const proxima = fila.shift();
      if (!proxima) throw new Error('fila de respostas vazia');
      if (proxima instanceof Error) throw proxima;
      return proxima;
    },
    ...extra,
  });
  return { cliente, chamadas };
}

test('monta a URL com subdomínio, query e cnpj múltiplo; envia Basic auth', async () => {
  const { cliente, chamadas } = clienteComFila([respostaFake(200, { resultSetMetadata: { count: 1, limit: 50, offset: 0 }, results: [{ id: 9 }] })]);
  const lista = await cliente.credores({ cnpj: '11.222.333/0001-81' });
  assert.deepEqual(lista, [{ id: 9 }]);
  assert.equal(chamadas[0].url, 'https://api.sienge.com.br/minhaempresa/public/api/v1/creditors?limit=50&cnpj=11222333000181');
  assert.equal(chamadas[0].opts.headers.Authorization, 'Basic ' + Buffer.from('minhaempresa-agente:segredo').toString('base64'));
  assert.equal(chamadas[0].opts.method, 'GET');
});

test('listarTudo percorre páginas até o count', async () => {
  const { cliente, chamadas } = clienteComFila([
    respostaFake(200, { resultSetMetadata: { count: 3, limit: 2, offset: 0 }, results: [{ id: 1 }, { id: 2 }] }),
    respostaFake(200, { resultSetMetadata: { count: 3, limit: 2, offset: 2 }, results: [{ id: 3 }] }),
  ]);
  const todos = await cliente.listarTudo('/cost-centers', {}, { limite: 2 });
  assert.deepEqual(todos.map((x) => x.id), [1, 2, 3]);
  assert.equal(chamadas.length, 2);
  assert.match(chamadas[1].url, /offset=2/);
});

test('erros viram SiengeError com mensagem traduzida e detalhe do Sienge', async () => {
  const { cliente } = clienteComFila([respostaFake(401, { status: 401, developerMessage: 'Unauthorized' })]);
  await assert.rejects(() => cliente.empresas(), (erro) => {
    assert.ok(erro instanceof SiengeError);
    assert.equal(erro.status, 401);
    assert.match(erro.message, /Usuário ou senha da API recusados/);
    assert.match(erro.message, /Unauthorized/);
    return true;
  });
  assert.match(traduzirErro(403, null, '/bills'), /libere a API/);
  assert.match(traduzirErro(429, null), /200 por minuto/);
  assert.match(traduzirErro(400, { clientMessage: 'Credor inativo' }), /Credor inativo/);
});

test('GET repete em 503 e depois passa; POST nunca repete', async () => {
  const get = clienteComFila([respostaFake(503, null), respostaFake(200, { results: [{ id: 1 }], resultSetMetadata: { count: 1, limit: 200, offset: 0 } })]);
  assert.deepEqual(await get.cliente.empresas(), [{ id: 1 }]);
  assert.equal(get.chamadas.length, 2);

  const post = clienteComFila([respostaFake(500, { developerMessage: 'boom' }), respostaFake(201, null)]);
  await assert.rejects(() => post.cliente.criarCredor({ name: 'X', personType: 'J', registerNumber: '11222333000181' }), /Erro interno/);
  assert.equal(post.chamadas.length, 1);
});

test('documento inexistente devolve null (404) sem estourar', async () => {
  const { cliente } = clienteComFila([respostaFake(404, { status: 404 })]);
  assert.equal(await cliente.documento('XPTO'), null);
});

test('criarCredor: id pelo Location; sem Location, busca pelo documento', async () => {
  const comLocation = clienteComFila([respostaFake(201, null, { Location: 'https://api.sienge.com.br/minhaempresa/public/api/v1/creditors/777' })]);
  const r1 = await comLocation.cliente.criarCredor({ name: 'Posto', personType: 'J', registerNumber: '11222333000181', typesId: ['FO'] });
  assert.equal(r1.id, 777);
  assert.equal(comLocation.chamadas.length, 1);
  assert.equal(JSON.parse(comLocation.chamadas[0].opts.body).registerNumber, '11222333000181');

  const semLocation = clienteComFila([
    respostaFake(201, null),
    respostaFake(200, { resultSetMetadata: { count: 1, limit: 50, offset: 0 }, results: [{ id: 778 }] }),
  ]);
  const r2 = await semLocation.cliente.criarCredor({ name: 'Posto', personType: 'J', registerNumber: '11222333000181' });
  assert.equal(r2.id, 778);
  assert.match(semLocation.chamadas[1].url, /cnpj=11222333000181/);
});

test('criarTitulo: sem Location, localiza pelo credor + número do documento na data de emissão', async () => {
  const { cliente, chamadas } = clienteComFila([
    respostaFake(201, null),
    respostaFake(200, { resultSetMetadata: { count: 2, limit: 20, offset: 0 }, results: [{ id: 10, documentNumber: '123' }, { id: 12, documentNumber: '123 ' }, { id: 11, documentNumber: '999' }] }),
  ]);
  const r = await cliente.criarTitulo({ creditorId: 5, documentNumber: '123', issueDate: '2026-09-21' });
  assert.equal(r.id, 12);
  assert.match(chamadas[1].url, /startDate=2026-09-21&endDate=2026-09-21&creditorId=5&documentNumber=123/);
});

test('extrairIdLocation aceita URL completa, relativa e com query', () => {
  assert.equal(extrairIdLocation('https://x/y/bills/42'), 42);
  assert.equal(extrairIdLocation('/bills/42/'), 42);
  assert.equal(extrairIdLocation('/bills/42?x=1'), 42);
  assert.equal(extrairIdLocation(null), null);
  assert.equal(extrairIdLocation('/bills/'), null);
});

test('falha de rede vira mensagem amigável', async () => {
  const { cliente } = clienteComFila([new Error('ENOTFOUND'), new Error('ENOTFOUND'), new Error('ENOTFOUND')]);
  await assert.rejects(() => cliente.empresas(), /Não consegui falar com a API do Sienge/);
});
