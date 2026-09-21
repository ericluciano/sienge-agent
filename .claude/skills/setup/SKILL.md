---
name: setup
description: "Instala e configura o Sienge Agent em CONVERSA: confere o Node, instala as dependências, coleta o subdomínio e o usuário de API do Sienge (guiando a criação no navegador, se o usuário não tiver), prova a conexão com uma chamada real, escolhe empresa, tipo de documento e indexador padrão e monta as regras iniciais de centro de custo. Use no primeiro uso, logo depois de baixar o repositório, ou pra refazer só uma etapa (trocar a senha da API, mudar a empresa padrão, revisar regras)."
argument-hint: "(sem argumentos — conduz o setup interativo)"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion, mcp__sienge__*
---

Conduz a instalação completa do Sienge Agent como uma CONVERSA com o dono do negócio. Ao final, ele manda a foto de uma nota e o agente lança no Sienge.

## Como conduzir a conversa (leia antes de executar qualquer coisa)

1. **Linguagem de dono, sempre.** Nada de "variável de ambiente", "stdio", "token". Fale "endereço do seu Sienge", "usuário de integração", "senha da integração". Nome técnico só se ele escolher a rota manual, e aí com o passo a passo exato de onde clicar.
2. **Uma pergunta por vez**, sempre dizendo a consequência da escolha. Pergunta de decisão = AskUserQuestion com botões. Nunca duas decisões na mesma pergunta.
3. **Login é sempre do usuário.** Nunca peça a senha de login do Sienge nem código de verificação no chat. Na rota de navegador, abra a página e espere ele entrar.
4. **A senha do usuário de API vai direto pro `.env`.** Se você a ler na tela (rota de navegador), grave e diga só "guardei a senha da integração". Se ele colar no chat (rota manual), grave e nunca repita o valor em nenhuma resposta. `.env` é ignorado pelo git: não sai da máquina.
5. **Prova real antes de seguir.** Credencial só é aceita depois de uma chamada real na API (`npm run testar-conexao`). Falhou = corrige agora, não acumula pro fim.
6. **Cota dita antes.** Cada consulta ao Sienge gasta 1 requisição da cota diária do pacote de API dele (o pacote Free tem 100 por dia; pacotes pagos, milhares). O setup gasta em torno de 15. Diga isso na abertura.
7. **Retomada.** O `.env` é o registro de progresso. Se a conversa cair, ao reabrir a pasta detecte o que já existe e diga "a gente parou em X, sigo de lá". Avise isso na abertura.
8. **Nunca declare pronto sem prova** (etapa 9): a prova é `sienge_status` respondendo `conexao: ok` com a empresa padrão resolvida, não "instalei".
9. **Sem emoji, sem hype.** Direto e acolhedor.
10. **O agente roda os comandos.** Nunca mande o usuário abrir terminal. Tudo que tem comando, você executa pelo Bash e narra o resultado.

### Abertura (fala de referência)

> "Vou deixar o Sienge Agent pronto conversando com você do começo ao fim. O caminho: (1) preparo as ferramentas aqui na sua máquina, (2) conectamos o agente ao seu Sienge com um usuário de integração, (3) provamos que está falando com o Sienge, (4) você escolhe os padrões dos lançamentos: qual empresa, qual tipo de documento e como classificar as despesas do dia a dia. Leva uns 10 a 15 minutos. O que você precisa ter em mãos: o endereço do seu Sienge e um acesso de administrador (ou alguém que seja, pra criar o usuário de integração). Cada consulta que eu faço ao Sienge gasta uma requisição da sua cota diária de API; o setup usa perto de 15. Se a conversa cair no meio, abra esta pasta de novo e diga 'continua o setup' que eu sei onde paramos. Vamos?"

---

## Etapa 0 — Detectar o estado (antes de qualquer escrita)

1. `Glob` em `.env`, `node_modules/@modelcontextprotocol`, `config/regras.json`, `config/aprendizado.json` na raiz do repositório.
2. `.env` existe? `Read` e veja o que está preenchido (só os NOMES das chaves; não comente valores).
   - Tudo preenchido e o usuário disse "continua" ou "reconfigura X": vá direto à etapa pedida.
   - Parcial: diga "a gente parou em <etapa>" e siga de lá.
   - Não existe: setup do zero, a partir da Etapa 1.
3. Se o usuário pediu só uma etapa ("troca a senha", "muda a empresa padrão", "revisa as regras"), rode só ela + a Etapa 9 (prova).

## Etapa 1 — Ferramentas (silenciosa; não vira pergunta)

Fala: *"Vou preparar minhas ferramentas aqui na sua máquina: só o Node, um programa padrão que roda o agente. Nada mais muda no seu computador."*

1. `node --version` pelo Bash. Precisa ser 18.17 ou mais novo.
   - Faltou ou é antigo: instale conforme o sistema e narre em uma linha.
     - Windows: `winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements`
     - macOS: `brew install node` (sem Homebrew: baixar o instalador LTS em <https://nodejs.org>)
     - Linux (Debian/Ubuntu): `sudo apt-get install -y nodejs npm` ou o instalador de <https://nodejs.org>
   - Depois de instalar, o Claude precisa ser fechado e aberto pra enxergar o Node. Diga: *"instalei; fecha e abre o Claude nesta pasta e me diz 'continua o setup'"*. Não siga sem o `node --version` responder.
2. `npm install --no-audit --no-fund` na raiz do repositório (Bash, com timeout de 3 minutos). Confira que `node_modules/@modelcontextprotocol` existe.
3. Crie as pastas de trabalho: `notas/entrada` (onde ele salva as fotos) e `notas/lancadas` (pra onde vão depois). Bash: `mkdir -p notas/entrada notas/lancadas`.

## Etapa 2 — Acesso ao Sienge

### 2.1 Subdomínio

Pergunte (texto, não precisa de botão):

> "Qual é o endereço que você usa pra entrar no Sienge? Algo como `minhaempresa.sienge.com.br`."

Extraia o que vem antes de `.sienge.com.br` (minúsculas). Se ele mandar só um nome, aceite. Anote como `SIENGE_SUBDOMINIO`.

### 2.2 Usuário de API — triagem (AskUserQuestion)

> "O agente entra no Sienge por um **usuário de integração** (usuário de API), separado do seu login. Como estamos?"
> - **Já tenho o usuário e a senha** — você me passa e eu gravo.
> - **Não tenho, quero criar agora** — precisa de acesso de administrador no Sienge; eu te guio ou faço com você olhando.
> - **Não sou administrador** — eu preparo o texto pra você mandar pra quem é.

Ramificação:

- **Já tenho:** peça o nome de acesso (começa com `<subdominio>-`) e a senha. Grave (2.4). Não repita a senha.
- **Não sou administrador:** entregue este texto pronto (em bloco de código, pra ele copiar) e encerre a etapa até ele voltar com os dados:

```text
Oi! Preciso de um usuário de API do Sienge pra ligar um agente que lança as notas de despesa no contas a pagar.
No Sienge, logado como administrador: canto superior direito > Integrações > menu APIs > Usuários de APIs > Novo Usuário de API.
Descrição: Sienge Agent · E-mail: <meu e-mail> · Nome de acesso: o Sienge sugere começando com o nosso domínio · Senha: sem validade.
Ao salvar, o Sienge mostra a senha UMA vez só: me manda o nome de acesso e essa senha por um canal seguro.
Depois, no mesmo menu, libera pra esse usuário as APIs: Empresas, Credores, Centros de custo, Plano financeiro, Documentos, Indexadores, Departamentos e Títulos a pagar (contas a pagar, com anexos).
Se a empresa nunca usou API, antes disso: menu principal > APIs e Conectores > Aceitar e Concordar > Iniciar sua Jornada > Finalizar (ativa o pacote gratuito).
```

- **Criar agora:** vá para 2.3.

### 2.3 Criar o usuário de API (rota de navegador)

Pergunte a rota (AskUserQuestion), oferecendo só o que EXISTE nesta sessão (confira antes se há ferramenta de navegador disponível, como o navegador integrado ou o Claude in Chrome):

> "Essa etapa é no navegador, dentro do seu Sienge. Como prefere?"
> - **Eu faço com você olhando** — abro o seu Sienge, você entra com o seu login e eu clico o resto. Você acompanha cada passo.
> - **Me guia passo a passo** — eu dito onde clicar e você faz.

Passo a passo (é o mesmo nas duas rotas; na rota guiada, dite um passo por vez e espere o "feito"):

1. Abrir `https://<subdominio>.sienge.com.br` e entrar com o login **do usuário** (nunca peça a senha dele).
2. Canto superior direito → **Integrações**.
3. Menu lateral → **APIs** → **Usuários de APIs** → botão azul **Novo Usuário de API**.
4. Preencher: **Descrição** = `Sienge Agent`; **E-mail de acesso** = o e-mail dele; **Nome de acesso** = o Sienge exige que comece com o domínio da base + hífen (ex.: `<subdominio>-agente`); **validade da senha** = sem expiração (se ele preferir com validade, anote a data pra lembrar de renovar).
5. **Salvar**. O Sienge mostra a senha gerada **uma única vez** e ela não pode ser recuperada, só trocada por outra. Na rota "eu faço", leia a senha da tela e grave direto no `.env` (2.4) sem ecoar. Na rota guiada, peça que ele cole a senha no chat; grave e não repita.
6. Ainda em Integrações → APIs → Usuários de APIs: abrir o usuário criado e **liberar os recursos** (as APIs que ele pode usar). Marque: **Empresas**, **Credores**, **Centros de custo**, **Plano financeiro**, **Documentos**, **Indexadores**, **Departamentos** e **Títulos a pagar / Contas a pagar** (incluindo anexos). Se a tela mostrar pacotes ou nomes um pouco diferentes, procure por esses termos; o que faltar aparece depois como "sem acesso a este recurso" no teste e a gente volta aqui.
7. Se a empresa nunca ativou API: menu principal (canto superior esquerdo) → **APIs e Conectores** → ler e clicar **Aceitar e Concordar** → **Iniciar sua Jornada** → avançar os módulos → **Finalizar**. Isso libera o pacote gratuito (100 requisições por dia). Pacotes maiores são contratados com o Sienge.

Referência oficial: <https://ajuda.sienge.com.br/support/solutions/articles/153000200929-como-criar-usu%C3%A1rios-de-api-> e <https://api.sienge.com.br/docs/>.

### 2.4 Gravar o `.env`

`Read` o `.env.example`, monte o conteúdo com `SIENGE_SUBDOMINIO`, `SIENGE_USUARIO_API` e `SIENGE_SENHA_API` e grave com `Write` em `.env` na raiz do repositório (se já existir, `Edit` só as linhas que mudam). Deixe `SIENGE_DOCUMENTO_PADRAO=NF` por enquanto; as demais chaves vêm nas etapas 4 a 7.

Fala: *"Guardei os dados da integração num arquivo local que fica só nesta máquina."*

## Etapa 3 — Prova de conexão

Bash: `npm run testar-conexao` na raiz. Interprete:

- **Conectou** e listou empresas: siga.
- **401** (usuário ou senha recusados): confira o nome de acesso (tem o prefixo do subdomínio?) e a senha. Refaça 2.2/2.4. Se a senha foi perdida, é preciso gerar outra no Sienge (o Sienge não recupera a antiga).
- **403** (sem acesso ao recurso): faltou liberar a API "Empresas" pro usuário (2.3, passo 6).
- **404 / não consegui falar com a API**: subdomínio errado ou sem internet. Confira o endereço com ele.
- **429**: cota do dia esgotada ou 200 por minuto. Espere e tente de novo; se persistir, o pacote precisa de upgrade.

Não passe da Etapa 3 sem "Conectado".

## Etapa 4 — Empresa padrão

Chame `listar_empresas` (MCP). Se a ferramenta `sienge_status`/`listar_empresas` não aparecer na sessão (o servidor MCP subiu antes do `.env` existir), diga: *"fecha e abre o Claude nesta pasta e me diz 'continua o setup'"* — e retome daqui. Alternativa sem reabrir: `node scripts/testar-conexao.mjs` já mostra as empresas; use essa lista.

- 1 empresa: defina sem perguntar e avise.
- 2 a 4 empresas: AskUserQuestion com os nomes ("Em qual empresa entram as despesas do dia a dia por padrão? Dá pra trocar por nota depois").
- 5 ou mais: liste numeradas no chat e peça o número.

Grave `SIENGE_EMPRESA_PADRAO=<id>` no `.env`.

## Etapa 5 — Tipo de documento padrão

Chame `verificar_documento` (padrão testa NF, NFE, NFS, NFSE, CF, CUP, REC, BOL; são até 8 requisições). Mostre os que existem, com nome, e pergunte (AskUserQuestion, até 4 opções):

> "Quando você lança uma nota de compra do dia a dia no Sienge, qual tipo de documento usa?"

Se nenhum código comum existir: pergunte qual código ele usa (está no Sienge em Financeiro > Contas a pagar > cadastro de documentos, ou o financeiro dele sabe) e teste com `verificar_documento` até bater. Grave `SIENGE_DOCUMENTO_PADRAO=<código>`.

## Etapa 6 — Indexador padrão

Chame `listar_indexadores`. Se veio `sugerido` (normalmente "Real"), confirme em uma linha: *"Os títulos ficam em Real, certo?"*. Se não houver sugestão, AskUserQuestion com os nomes. Grave `SIENGE_INDEXADOR_PADRAO=<id>`.

## Etapa 7 — Regras de classificação (opcional, mas vale os 3 minutos)

Explique: *"Toda nota precisa de um centro de custo (obra, administrativo...) e de um plano financeiro (combustível, alimentação...). Eu aprendo com cada nota que você confirma. Se quiser, já deixo regras prontas pros gastos mais comuns."*

AskUserQuestion:
> - **Configurar agora** — você me diz os 3 a 5 tipos de gasto mais comuns e eu ligo cada um ao centro de custo e ao plano certos.
> - **Aprender no uso** — a cada nota confirmada eu memorizo o fornecedor; começa sem regra.

Se "configurar agora":
1. `listar_centros_custo` e `listar_planos_financeiros` (1 requisição cada; depois fica em cache por 24h).
2. Pergunte os tipos de gasto (texto livre: "combustível, almoço da equipe, material de construção, ferramentas").
3. Para cada tipo, proponha o plano financeiro cujo nome mais parece (mostre nome + código) e pergunte o centro de custo padrão (ou "pergunta na hora" se varia por obra). Confirme tudo numa tabela única antes de gravar.
4. `Read` `config/regras.example.json`, monte `config/regras.json` com as regras confirmadas (palavras em minúsculas, sem acento) e grave com `Write`. Regra que "pergunta na hora" simplesmente não entra: sem regra, o agente pergunta.
5. Se ele indicou um plano financeiro "genérico" para o que não casar em regra, grave `SIENGE_PLANO_FINANCEIRO_PADRAO=<código>`.

Se "aprender no uso": não crie `config/regras.json`; diga que `config/aprendizado.json` nasce na primeira nota.

## Etapa 8 — Como mandar as notas

Explique, em 3 linhas:
- Salvar a foto (ou PDF) em `notas/entrada/` e dizer "lança as notas" (ou `/lancar-nota`); ou arrastar a foto pro chat e pedir "lança essa nota".
- O agente mostra o resumo e só lança depois do OK dele.
- Nota lançada vai para `notas/lancadas/AAAA-MM/`, com o número do título no nome do arquivo.

## Etapa 9 — Prova final e cartão de encerramento

1. Chame `sienge_status` (MCP). Esperado: `configurado: true`, `conexao: ok`, `empresa_padrao` com nome, `pendencias: []`. Se a ferramenta não aparecer, reabrir o Claude nesta pasta e chamar de novo; sem isso não há prova.
2. Mostre o cartão:

> **Sienge Agent pronto.**
> - Sienge: `<subdominio>` · empresa padrão: `<nome>` · documento: `<código>` · indexador: `<nome>`
> - Regras: `<n>` configuradas (ou "aprendendo no uso")
> - Fotos: salve em `notas/entrada/` e diga "lança as notas"; ou arraste a foto no chat.
> - Cota: cada nota gasta de 4 a 7 requisições da API; no pacote Free (100/dia) dá pra lançar umas 15 notas por dia com folga.
>
> O Sienge Agent é open source, criado por Eric Luciano (Expert Integrado). Dúvidas e melhorias: <https://github.com/ericluciano/sienge-agent>.

3. Ofereça a primeira nota agora: *"Quer testar com uma nota de verdade? Manda a foto."* Se ele mandar, invoque a skill `lancar-nota`.
