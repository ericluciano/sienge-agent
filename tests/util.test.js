import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  somenteDigitos,
  normalizarDocumento,
  validarCPF,
  validarCNPJ,
  identificarDocumento,
  formatarCNPJ,
  formatarCPF,
  normalizarData,
  somarDias,
  formatarDataBR,
  parseValor,
  contemTermo,
  normalizarTexto,
  validarPercentuais,
} from '../mcp/util.js';

test('documentos: normalização e validação de CNPJ numérico e alfanumérico', () => {
  assert.equal(somenteDigitos('11.222.333/0001-81'), '11222333000181');
  assert.equal(normalizarDocumento('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.equal(validarCNPJ('11.222.333/0001-81'), true);
  assert.equal(validarCNPJ('11.222.333/0001-82'), false);
  assert.equal(validarCNPJ('12.ABC.345/01DE-35'), true);
  assert.equal(validarCNPJ('12.ABC.345/01DE-36'), false);
  assert.equal(validarCNPJ('00000000000000'), false);
  assert.equal(validarCNPJ('123'), false);
});

test('documentos: CPF válido e inválido', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('529.982.247-26'), false);
  assert.equal(validarCPF('111.111.111-11'), false);
});

test('identificarDocumento distingue CPF, CNPJ e lixo', () => {
  assert.deepEqual(identificarDocumento('529.982.247-25'), { tipo: 'cpf', valor: '52998224725', valido: true });
  assert.deepEqual(identificarDocumento('11.222.333/0001-81'), { tipo: 'cnpj', valor: '11222333000181', valido: true });
  assert.equal(identificarDocumento('12345').tipo, null);
  assert.equal(formatarCNPJ('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarCPF('52998224725'), '529.982.247-25');
});

test('datas: formatos brasileiros viram ISO e datas impossíveis estouram', () => {
  assert.equal(normalizarData('21/09/2026'), '2026-09-21');
  assert.equal(normalizarData('5/1/26'), '2026-01-05');
  assert.equal(normalizarData('05-01-2026'), '2026-01-05');
  assert.equal(normalizarData('2026-09-21T15:30:00Z'), '2026-09-21');
  assert.equal(normalizarData(new Date(2026, 8, 21)), '2026-09-21');
  assert.throws(() => normalizarData('30/02/2026'), /inválida/);
  assert.throws(() => normalizarData('31/04/2026'), /inválida/);
  assert.throws(() => normalizarData('ontem'), /não reconhecido/);
  assert.throws(() => normalizarData(''), /vazia/);
  assert.equal(somarDias('2026-09-21', -60), '2026-07-23');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(formatarDataBR('2026-09-21'), '21/09/2026');
});

test('valores: notação de nota fiscal brasileira', () => {
  assert.equal(parseValor('1.234,56'), 1234.56);
  assert.equal(parseValor('R$ 12,90'), 12.9);
  assert.equal(parseValor('1234.56'), 1234.56);
  assert.equal(parseValor('1.234.567'), 1234567);
  assert.equal(parseValor('12,9'), 12.9);
  assert.equal(parseValor(' 152,30 '), 152.3);
  assert.equal(parseValor(99.999), 100);
  assert.throws(() => parseValor('abc'), /não reconhecido/);
  assert.throws(() => parseValor(''), /vazio/);
});

test('texto: casamento de termo ignora acento, caixa e casa por prefixo de palavra', () => {
  assert.equal(normalizarTexto('  Combustível   ÓTIMO '), 'combustivel otimo');
  assert.equal(contemTermo('AUTO POSTO IPIRANGA LTDA', 'posto'), true);
  assert.equal(contemTermo('Auto Posto Sol', 'ipiranga'), false);
  assert.equal(contemTermo('Materiais de Construção Silva', 'construcao'), true);
  assert.equal(contemTermo('Supermercado Xpto', 'mercado'), false);
  assert.equal(contemTermo('Mercado Xpto', 'mercado'), true);
  assert.equal(contemTermo('', 'x'), false);
});

test('percentuais: precisam somar 100 e ser positivos', () => {
  assert.equal(validarPercentuais([{ percentual: 60 }, { percentual: 40 }]), true);
  assert.equal(validarPercentuais([{ percentage: 100 }], 'percentage'), true);
  assert.throws(() => validarPercentuais([{ percentual: 60 }, { percentual: 30 }]), /somam 90%/);
  assert.throws(() => validarPercentuais([{ percentual: 0 }]), /inválido/);
  assert.throws(() => validarPercentuais([]), /ao menos uma/);
});
