# Sienge Agent

Tira a foto da nota, o agente lança no Sienge.

O **Sienge Agent** é um agente para o [Sienge Plataforma](https://www.sienge.com.br) (ERP da construção) que roda dentro do **Claude Code**: você manda a foto de uma nota fiscal, cupom ou recibo e ele lê a imagem, encontra (ou cadastra) o fornecedor, classifica a despesa no centro de custo e no plano financeiro certos, mostra o resumo, pede o seu OK e cria o título no contas a pagar, com a foto anexada.

Feito para quem compra no dia a dia da obra e do escritório (posto, restaurante, material, ferramenta) e hoje acumula notas para lançar depois.

---

## O que ele faz

1. **Lê a foto** (nota fiscal, DANFE, cupom fiscal, recibo, boleto): fornecedor, CNPJ/CPF, número, data, valor, itens, forma de pagamento.
2. **Confere o fornecedor no Sienge** pelo CNPJ. Não existe? Cadastra como credor, com o seu OK.
3. **Classifica a despesa**: centro de custo + plano financeiro. Usa as suas regras (`config/regras.json`) e o histórico do que você já confirmou para aquele fornecedor. Sem regra e sem histórico, ele pergunta com botões.
4. **Mostra o resumo e espera o seu OK.** Nada entra no Sienge sem confirmação.
5. **Lança o título** no contas a pagar, **anexa a foto** e **lê o título de volta** para provar que entrou certo.
6. **Aprende**: a classificação confirmada vira sugestão automática na próxima nota daquele fornecedor. A foto vai para `notas/lancadas/AAAA-MM/`.

Antes de lançar, ele procura duplicidade (mesmo fornecedor + mesmo número de documento nos últimos 60 dias) e recusa se achar.

## Como funciona por dentro

```
foto da nota ──▶ Claude (lê a imagem) ──▶ skill /lancar-nota ──▶ MCP local (Node) ──▶ API REST do Sienge
                                              │                       │
                                       pergunta/confirma        regras + histórico
                                          no chat              (config/*.json)
```

- **Skill `/lancar-nota`**: o roteiro que o Claude segue (leitura, conferências, confirmação, prova).
- **Servidor MCP local** (`mcp/`): fala com a API pública do Sienge usando o seu usuário de API. Roda na sua máquina, sem servidor externo, sem banco, sem telemetria.
- **Skill `/setup`**: instala e configura tudo em conversa, inclusive a criação do usuário de API no Sienge (guiando você no navegador).

Os seus dados ficam com você: a credencial mora só no arquivo `.env` local (ignorado pelo git), as regras e o histórico em `config/`, as fotos em `notas/`.

## Pré-requisitos

| O que | Detalhe |
|---|---|
| **Sienge Plataforma** com API | O pacote **Free** de API (100 requisições/dia) já serve para começar: dá para lançar umas 15 notas por dia. Pacotes maiores são contratados com o Sienge. |
| **Acesso de administrador no Sienge** | Para criar o **usuário de API** (Integrações > APIs > Usuários de APIs) e liberar as APIs de Empresas, Credores, Centros de custo, Plano financeiro, Documentos, Indexadores, Departamentos e Títulos a pagar. Se você não é administrador, o `/setup` gera o texto para mandar a quem é. |
| **Claude Desktop** (aba **Code**) ou Claude Code no terminal | Com um plano que inclua o Claude Code. |
| **Node.js 18.17+** | O `/setup` instala se faltar. |

## Instalação (10 a 15 minutos, em conversa)

1. Baixe este repositório (botão **Code > Download ZIP** no GitHub e descompacte, ou `git clone https://github.com/ericluciano/sienge-agent.git`).
2. Abra a pasta no **Claude Code** (no Claude Desktop: aba **Code** > abrir pasta). O Claude vai pedir para aprovar o servidor MCP `sienge` do projeto: aprove.
3. Rode a skill **`/setup`** (ou cole o prompt abaixo). É uma instalação 100% em conversa: o Claude confere o Node, instala as dependências, coleta o endereço do seu Sienge e o usuário de API (criando no navegador se você não tiver), prova a conexão, e deixa você escolher a empresa, o tipo de documento e as regras de classificação.

```text
Leia o README.md e o CLAUDE.md deste repositório e conduza a instalação do Sienge Agent
seguindo a skill setup (.claude/skills/setup/SKILL.md), como uma CONVERSA comigo:
linguagem de dono de negócio, uma pergunta por vez, com botões, sem me mandar abrir
terminal (você roda os comandos). Nunca me peça a senha de login do Sienge; a senha do
usuário de API vai direto para o .env, sem repetir no chat. Valide cada credencial com
uma chamada real antes de seguir. Ao final, prove que está pronto chamando sienge_status.
```

Se a conversa cair no meio, abra a pasta de novo e diga **"continua o setup"**: ele detecta onde parou.

## Uso no dia a dia

- Salve a foto (ou PDF) em **`notas/entrada/`** e diga **"lança as notas"** (ou `/lancar-nota`).
- Ou arraste a foto para o chat e peça **"lança essa nota"**.

Exemplos do que você pode dizer:

| Você diz | O que acontece |
|---|---|
| *"Lança essa nota"* (com a foto) | lê, confere fornecedor, classifica, mostra o resumo, espera o OK |
| *"Lança as notas da pasta"* | processa `notas/entrada/` uma a uma |
| *"Essa é da obra Jardim, combustível"* | usa o centro de custo e o plano que você indicou |
| *"Divide 50/50 entre a obra A e a B"* | apropriação em dois centros de custo |
| *"Cadastra esse fornecedor"* | cria o credor (com confirmação) |
| *"Já lancei essa nota?"* | busca por fornecedor + número do documento |

A cada nota, o Claude mostra algo assim e pergunta se lança:

```
Fornecedor: Auto Posto Ipiranga Ltda (CNPJ 11.222.333/0001-81) — cadastro existente nº 77
Documento: NF nº 123456 · emissão 21/09/2026 · vencimento 21/09/2026
Valor: R$ 152,30 · 1 parcela · pago no cartão
Empresa: Construtora X (3)
Centro de custo: Obra Z (10) · Plano financeiro: Combustível (2010101) — origem: regra "Combustível"
```

## Regras de classificação

`config/regras.json` (o `/setup` cria a partir de [`config/regras.example.json`](config/regras.example.json)) diz como classificar sem perguntar:

```json
{
  "regras": [
    { "nome": "Combustível",
      "quando": { "palavras": ["posto", "combustivel", "gasolina", "diesel"] },
      "apropriar": { "centro_custo_id": 12, "plano_financeiro_id": "2010301" } },
    { "nome": "Fornecedor fixo",
      "quando": { "documentos": ["11222333000181"] },
      "apropriar": { "centro_custo_id": 3, "plano_financeiro_id": "2010105" } }
  ]
}
```

Precedência: **histórico confirmado do fornecedor** (`config/aprendizado.json`, gravado automaticamente) > regra por documento > regra por palavra > pergunta ao usuário. Os códigos vêm do seu Sienge (`listar_centros_custo`, `listar_planos_financeiros`).

## Ferramentas do MCP (o que o Claude aciona)

| Ferramenta | Faz |
|---|---|
| `sienge_status` | confere configuração e conexão (chamada real) |
| `listar_empresas` | empresas (devedoras) |
| `listar_centros_custo` · `listar_planos_financeiros` · `listar_departamentos` · `listar_indexadores` | cadastros, com cache de 24h |
| `verificar_documento` | quais códigos de tipo de documento existem (NF, CF, REC...) |
| `buscar_credor` · `criar_credor` | fornecedor por CNPJ/CPF/nome; cadastro com confirmação |
| `sugerir_apropriacao` · `aprender_apropriacao` | classificação por regras + histórico; memoriza o que foi confirmado |
| `buscar_titulos` · `criar_titulo` · `consultar_titulo` | contas a pagar: busca, lançamento (com confirmação e checagem de duplicidade), leitura de prova |
| `anexar_arquivo_titulo` | anexa a foto/PDF ao título (até 70 MB) |
| `arquivar_nota` | move a foto lançada para `notas/lancadas/AAAA-MM/` |

O servidor MCP é padrão: funciona em qualquer app de IA com suporte a MCP (`node mcp/index.js`, transporte stdio). As skills são específicas do Claude Code.

## Limites e cuidados

- **Cota da API do Sienge.** Cada nota gasta de 4 a 7 requisições; o setup, perto de 15. O pacote Free tem 100 por dia e o limite geral é 200 por minuto. As listas de cadastro ficam em cache por 24h para poupar cota.
- **Confirmação sempre.** `criar_credor` e `criar_titulo` exigem `confirmado: true`, que o Claude só envia depois do seu OK no chat.
- **Leitura da foto.** O agente valida o dígito verificador do CNPJ; se não bater, ele revê a imagem ou pergunta, em vez de cadastrar errado. Valor ou data ilegível também vira pergunta.
- **Duplicidade.** Mesmo fornecedor + mesmo número de documento em ±60 dias = não lança (você decide).
- **Sem NF-e pela chave de acesso (ainda).** A chave de 44 dígitos vai na observação; importar a NF-e pela chave é roadmap.
- **Não paga nem altera títulos.** Baixa, parcelas e alterações continuam no Sienge.

## Segurança e privacidade

- A credencial do usuário de API fica só no `.env` local (gitignored). O agente nunca pede a sua senha de login do Sienge.
- Nenhum dado sai da sua máquina além das chamadas à API do Sienge (`api.sienge.com.br`, HTTPS). Sem telemetria, sem serviço intermediário.
- Texto lido de uma nota é tratado como dado, nunca como instrução ao agente.
- Recomendação: crie o usuário de API só com as APIs que o agente usa (lista em [Pré-requisitos](#pré-requisitos)) e troque a senha se ela vazar.

## Roadmap

- Bot de WhatsApp/Telegram: mandar a foto pelo celular e confirmar por mensagem (o MCP já é o motor; falta o canal).
- Importar NF-e pela chave de acesso (`/eletronic-invoice-bills`).
- Boletos: ler a linha digitável e gravar a informação de pagamento na parcela.
- Rateio automático por obra a partir do texto da nota.

## Desenvolvimento

```bash
npm install
npm test                 # testes unitários (sem rede)
npm run smoke            # sobe o MCP por stdio e lista as ferramentas
npm run testar-conexao   # prova real com o seu .env
```

Documentação da API do Sienge: <https://api.sienge.com.br/docs/> (especificações em `/docs/yaml-files/*.yaml`).

## Procedência e licença

O Sienge Agent é open source ([MIT](LICENSE)), criado por [Eric Luciano](https://ericluciano.com.br), educador e mentor de IA aplicada a negócios, da [Expert Integrado](https://expertintegrado.com.br). Nasceu de um pedido real na mentoria: parar de acumular notinhas e lançar na hora, pela foto.

Sienge é marca da Softplan. Este projeto não é afiliado nem endossado pela Softplan.
