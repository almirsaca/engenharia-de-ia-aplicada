# Depuração do projeto

Este projeto executa os arquivos TypeScript diretamente no Node.js 22. A configuração de debug carrega as variáveis do arquivo `.env` e usa o mesmo ponto de entrada do comando `npm start`: `src/index.ts`.

## Pré-requisitos

- Node.js 22.13.1 ou uma versão compatível com `--experimental-strip-types`.
- Dependências instaladas com `npm install`.
- Docker Desktop em execução.
- Neo4j iniciado antes da aplicação:

```powershell
npm run infra:up
```

## Abrir a raiz de projetos no VS Code ou Cursor

É possível abrir `Pratica` ou `01-fundamentos-e-llms` como raiz do editor. As duas pastas possuem uma configuração `.vscode/launch.json` com os caminhos apropriados. Isso permite manter vários projetos no explorador sem abrir `embeddings-neo4j` isoladamente.

## Depurar o Embeddings Neo4j

1. Abra `embeddings-neo4j/src/index.ts` no explorador do editor.
2. Adicione um breakpoint clicando à esquerda do número da linha.
3. Abra **Executar e Depurar** (`Ctrl+Shift+D`).
4. Escolha **Embeddings Neo4j: aplicação**.
5. Pressione `F5`.

A execução acontece no terminal integrado. Breakpoints no código do projeto funcionam diretamente, sem gerar JavaScript ou arquivos de source map.

## Depurar pelo terminal e anexar o editor

No terminal, execute:

```powershell
npm run debug
```

O processo ficará pausado na primeira linha e aguardará um depurador na porta `9229`. Depois:

1. Abra **Executar e Depurar** no editor.
2. Escolha **Embeddings Neo4j: anexar ao npm run debug**.
3. Pressione `F5`.

Para encerrar, pressione `Shift+F5` no editor ou `Ctrl+C` no terminal.

## Problemas comuns

### Não foi possível conectar ao Docker

Se aparecer `failed to connect to the docker API`, abra o Docker Desktop, aguarde o mecanismo iniciar e rode novamente:

```powershell
npm run infra:up
```

### Não foi possível conectar ao Neo4j

Confira se o container está saudável:

```powershell
docker compose ps
```

O Neo4j Browser deve estar disponível em `http://localhost:7474`, e a conexão Bolt utiliza a porta `7687`.

### A porta 9229 já está em uso

Encerre outra sessão de debug que esteja aberta. No Windows, é possível identificar o processo com:

```powershell
Get-NetTCPConnection -LocalPort 9229 -ErrorAction SilentlyContinue
```

### Breakpoint não é atingido

- Confirme que a pasta aberta no editor é `Pratica` ou `01-fundamentos-e-llms`.
- Inicie pela configuração **Embeddings Neo4j: aplicação**, não pelo botão genérico de execução de arquivo.
- Coloque o breakpoint antes da operação que deseja observar. O programa encerra depois de processar o PDF e consultar o Neo4j.

## Depurar outro arquivo Node.js ou TypeScript

Abra o arquivo que será executado, escolha **Node/TypeScript: arquivo atual** em **Executar e Depurar** e pressione `F5`. Essa opção é adequada para scripts independentes que não exigem argumentos ou diretório de trabalho específicos.

Aplicações que precisam de um comando próprio, servidor web, arquivo `.env` ou infraestrutura devem receber uma configuração nomeada no arquivo `.vscode/launch.json`, seguindo o modelo de **Embeddings Neo4j: aplicação**.

## Comandos úteis

```powershell
npm run infra:up    # inicia o Neo4j
npm run debug       # aguarda o depurador na porta 9229
npm run dev         # executa com reinício automático, sem pausar
npm run infra:down  # encerra o Neo4j
```

> Atenção: o Neo4j é **um só para os três laboratórios**, definido em `rag/docker-compose.yml`. O `infra:down` derruba o banco dos outros dois junto. Os dados ficam em `rag/neo4j/data` e sobrevivem: o comando remove o container, não o disco.
