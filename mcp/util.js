// Utilitários puros (sem I/O): documentos fiscais, datas, valores e texto.
// Tudo aqui é testado em tests/util.test.js.

/** Mantém só dígitos. */
export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D+/g, '');
}

/**
 * Normaliza CPF/CNPJ removendo máscara. Mantém letras porque o CNPJ passou a
 * aceitar caracteres alfanuméricos nas 12 primeiras posições (Receita Federal, 2026).
 */
export function normalizarDocumento(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Valida CPF (11 dígitos) pelos dígitos verificadores. */
export function validarCPF(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (base, fatorInicial) => {
    let soma = 0;
    let fator = fatorInicial;
    for (const c of base) soma += Number(c) * fator--;
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10]);
}

/**
 * Valida CNPJ (14 posições) pelos dígitos verificadores. Aceita o formato
 * alfanumérico: cada caractere vale (código ASCII - 48), o que para dígitos
 * equivale ao valor numérico — CNPJs antigos validam do mesmo jeito.
 */
export function validarCNPJ(cnpj) {
  const d = normalizarDocumento(cnpj);
  if (d.length !== 14) return false;
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d)) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const valor = (c) => c.charCodeAt(0) - 48;
  const calc = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += valor(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}

/**
 * Identifica o tipo do documento a partir do tamanho e valida.
 * @returns {{tipo: 'cpf'|'cnpj'|null, valor: string, valido: boolean}}
 */
export function identificarDocumento(valor) {
  const doc = normalizarDocumento(valor);
  if (doc.length === 11 && /^\d+$/.test(doc)) return { tipo: 'cpf', valor: doc, valido: validarCPF(doc) };
  if (doc.length === 14) return { tipo: 'cnpj', valor: doc, valido: validarCNPJ(doc) };
  return { tipo: null, valor: doc, valido: false };
}

export function formatarCNPJ(cnpj) {
  const d = normalizarDocumento(cnpj);
  if (d.length !== 14) return String(cnpj ?? '');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatarCPF(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11) return String(cpf ?? '');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarDocumento(valor) {
  const { tipo, valor: doc } = identificarDocumento(valor);
  if (tipo === 'cnpj') return formatarCNPJ(doc);
  if (tipo === 'cpf') return formatarCPF(doc);
  return String(valor ?? '');
}

// ─── Datas ───────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

function dataValida(ano, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Converte datas em formatos comuns no Brasil para ISO `AAAA-MM-DD` (o que a API do Sienge exige).
 * Aceita `DD/MM/AAAA`, `DD/MM/AA`, `DD-MM-AAAA`, `AAAA-MM-DD`, `AAAA-MM-DDTHH:mm…` e objetos Date.
 * Lança erro em data inválida — melhor parar do que lançar um título com data errada.
 */
export function normalizarData(entrada) {
  if (entrada instanceof Date) {
    if (Number.isNaN(entrada.getTime())) throw new Error('Data inválida');
    return `${entrada.getFullYear()}-${pad2(entrada.getMonth() + 1)}-${pad2(entrada.getDate())}`;
  }
  const s = String(entrada ?? '').trim();
  if (!s) throw new Error('Data vazia');

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!dataValida(ano, mes, dia)) throw new Error(`Data inválida: ${s}`);
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = Number(m[3]);
    if (m[3].length === 2) ano += 2000;
    if (!dataValida(ano, mes, dia)) throw new Error(`Data inválida: ${s}`);
    return `${ano}-${pad2(mes)}-${pad2(dia)}`;
  }
  throw new Error(`Formato de data não reconhecido: ${s} (use DD/MM/AAAA ou AAAA-MM-DD)`);
}

/** Data de hoje no fuso local da máquina, em ISO `AAAA-MM-DD`. */
export function hojeISO(agora = new Date()) {
  return normalizarData(agora);
}

/** Soma (ou subtrai) dias a uma data ISO. */
export function somarDias(iso, dias) {
  const [a, m, d] = normalizarData(iso).split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + dias));
  return `${data.getUTCFullYear()}-${pad2(data.getUTCMonth() + 1)}-${pad2(data.getUTCDate())}`;
}

/** Formata ISO como `DD/MM/AAAA` para mostrar ao usuário. */
export function formatarDataBR(iso) {
  const [a, m, d] = normalizarData(iso).split('-');
  return `${d}/${m}/${a}`;
}

// ─── Valores ─────────────────────────────────────────────────────────────────

/**
 * Interpreta valores como aparecem em notas: `1.234,56`, `R$ 12,90`, `1234.56`, `12,9`.
 * Regra: se há vírgula e ponto, o último separador é o decimal; só vírgula = decimal;
 * só ponto = decimal, exceto quando há vários pontos (milhar).
 */
export function parseValor(entrada) {
  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada)) throw new Error('Valor inválido');
    return arredondar2(entrada);
  }
  let s = String(entrada ?? '').trim().replace(/R\$\s*/i, '').replace(/\s+/g, '');
  if (!s) throw new Error('Valor vazio');
  const negativo = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  if (!/^[\d.,]+$/.test(s)) throw new Error(`Valor não reconhecido: ${entrada}`);

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  let normalizado;
  if (temVirgula && temPonto) {
    const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    const decimal = s[ultimo];
    normalizado = s.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
  } else if (temVirgula) {
    normalizado = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  } else if (temPonto) {
    normalizado = s.split('.').length > 2 ? s.split('.').join('') : s;
  } else {
    normalizado = s;
  }
  const n = Number(normalizado);
  if (!Number.isFinite(n)) throw new Error(`Valor não reconhecido: ${entrada}`);
  return arredondar2(negativo ? -n : n);
}

export function arredondar2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function formatarBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
}

// ─── Texto ───────────────────────────────────────────────────────────────────

/** Minúsculas, sem acento, espaços colapsados — base para casar palavras-chave. */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se `termo` aparece em `texto` (ambos normalizados), como palavra ou prefixo de palavra. */
export function contemTermo(texto, termo) {
  const t = normalizarTexto(texto);
  const k = normalizarTexto(termo);
  if (!t || !k) return false;
  const escapado = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapado}`).test(t);
}

// ─── Percentuais ─────────────────────────────────────────────────────────────

/**
 * Garante que as apropriações somam 100% (tolerância de 0,01) e que cada percentual é positivo.
 * Lança erro descritivo quando não.
 */
export function validarPercentuais(itens, campo = 'percentual') {
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('Informe ao menos uma apropriação');
  let soma = 0;
  for (const item of itens) {
    const p = Number(item?.[campo]);
    if (!Number.isFinite(p) || p <= 0) throw new Error(`Percentual inválido em apropriação: ${JSON.stringify(item)}`);
    soma += p;
  }
  if (Math.abs(soma - 100) > 0.01) throw new Error(`As apropriações somam ${arredondar2(soma)}%, precisam somar 100%`);
  return true;
}
