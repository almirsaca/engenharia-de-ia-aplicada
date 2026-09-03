# Embeddings com Neo4j — o caso Titanic

Aplicação de linha de comando que transforma o conteúdo de PDFs sobre o Titanic em embeddings, armazena os vetores no Neo4j e permite fazer buscas semânticas por meio de perguntas digitadas no terminal.

O acervo reúne cinco documentos: uma **Análise Preliminar de Riscos** que usa o naufrágio como estudo de caso de gestão de projetos, um trabalho sobre a história do transatlântico, dois artigos acadêmicos sobre os determinantes da sobrevivência e um e-book em inglês. Por serem dois idiomas, o projeto usa um modelo de embeddings multilíngue.

## Como funciona

```text
PDFs → extração de páginas → divisão em chunks → embeddings → Neo4j
                                                              ↑
Pergunta do usuário → embedding da pergunta → busca vetorial ─┘
```

O fluxo da aplicação é:

1. Carregar todos os PDFs definidos em `CONFIG.pdf.paths`.
2. Dividir o texto em chunks com sobreposição, preservando arquivo e página de origem.
3. Gerar embeddings localmente com um modelo do Hugging Face.
4. Apagar os nós `Trecho` existentes no Neo4j.
5. Gravar os novos documentos e seus vetores, em lotes.
6. Abrir um prompt interativo para buscas por similaridade, exibindo o score de cada resultado.

> **Atenção:** sempre que a aplicação é iniciada, ela remove todos os nós com o label configurado em `CONFIG.neo4j.nodeLabel` antes de indexar novamente os documentos.

Para entender o papel de cada etapa dentro de um sistema RAG completo, consulte [Fluxo RAG](./docs/Fluxo%20RAG.md). Outros documentos disponíveis:

| Documento | Conteúdo |
| --- | --- |
| [Fluxo RAG](./docs/Fluxo%20RAG.md) | O fluxo completo aplicado ao caso Titanic |
| [Tutorial — Estratégias de Recuperação](./docs/Tutorial%20-%20Estrategias%20de%20Recuperacao.pdf) | Guia em PDF: lexical, híbrida, MMR, reranking, small-to-big, self-query, HyDE e ColBERT |
| [Melhorias planejadas](./docs/Melhorias%20planejadas.md) | O que falta implementar, com prioridade e esforço |
| [Kaggle Titanic](./docs/Kaggle%20Titanic.md) | Referência do dataset de passageiros |

## Tecnologias

- Node.js 22 e TypeScript executado diretamente pelo Node.
- LangChain para carregamento, divisão e busca dos documentos.
- Hugging Face Transformers para geração dos embeddings.
- Neo4j 5 Community como banco de dados e vector store.
- Docker Compose para executar o Neo4j localmente.

## Pré-requisitos

- Node.js `22.13.1` ou uma versão compatível com `--experimental-strip-types`.
- npm.
- Docker Desktop em execução.

Confira as versões instaladas:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## Instalação

Entre na pasta do projeto e instale as dependências:

```powershell
cd 01-fundamentos-e-llms/embeddings-neo4j
npm ci
```

## Variáveis de ambiente

Crie um arquivo `.env` na raiz de `embeddings-neo4j`:

```dotenv
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
```

As credenciais do exemplo correspondem ao `NEO4J_AUTH` definido no `docker-compose.yml`. Altere as duas configurações em conjunto se desejar usar outra senha.

O `config.ts` também possui configurações reservadas para uma futura integração com OpenRouter. Elas não são necessárias para o fluxo atual de busca vetorial:

```dotenv
OPENROUTER_SITE_URL=
OPENROUTER_SITE_NAME=
NLP_MODEL=
```

A chave do OpenRouter não fica no `.env`: é lida da variável de ambiente da máquina `OpenRouter__ApiKey`. Como o `--env-file` do Node não expande `${VAR}`, a referência é feita no próprio `config.ts`, que aceita `OPENROUTER_API_KEY` como alternativa. O laboratório [titanic-graphrag](../titanic-graphrag/) documenta o procedimento em detalhe.

O arquivo `.env` está ignorado pelo Git e não deve ser versionado.

### Sobre o modelo de embeddings

`paraphrase-multilingual-MiniLM-L12-v2` gera vetores de **384 dimensões**, o mesmo tamanho do `all-MiniLM-L6-v2` usado originalmente — trocar entre os dois não exige recriar o índice do Neo4j.

A escolha do modelo multilíngue não é cosmética. Comparando a pergunta *"Por que o navio afundou?"* com um trecho relevante e uma frase irrelevante (uma receita culinária):

| Modelo | Trecho relevante | Trecho irrelevante | Separação |
| --- | ---: | ---: | ---: |
| `all-MiniLM-L6-v2` | 0,476 | 0,503 | **−0,027** |
| `paraphrase-multilingual-MiniLM-L12-v2` | 0,427 | 0,024 | **+0,404** |

O modelo apenas inglês classificava a receita como mais próxima da pergunta do que o trecho correto. O modelo multilíngue também alinha os dois idiomas: perguntas em português recuperam trechos em inglês do e-book.

Ao trocar de modelo, lembre-se de que os vetores já gravados ficam incompatíveis. Como a aplicação apaga e reindexa a cada execução, isso se resolve sozinho — salvo se o novo modelo tiver número diferente de dimensões, caso em que o índice `trechos_index` precisa ser removido antes.

## Configuração dos documentos

Os PDFs processados são definidos em `src/config.ts`:

```typescript
pdf: {
    paths: [
        { path: "./docs/titanic/O Caso Titanic.pdf" },
        { path: "./docs/titanic/Titanic - A Projeção Do Transatlântico.pdf" },
        { path: "./docs/titanic/surviving-the-titanic-disaster-economic-natural-andsocial-determinants.pdf" },
        { path: "./docs/titanic/Titpaper.pdf" },
        { path: "./docs/titanic/Titanic-eBook.pdf", pages: [1, 24] as const },
    ],
},
```

Para adicionar ou remover documentos, altere o array `CONFIG.pdf.paths`. Os caminhos são relativos à pasta `embeddings-neo4j`. O campo `pages` é opcional: quando omitido, o PDF é indexado por completo.

### O distrator do e-book

O `Titanic-eBook.pdf` tem 31 páginas, mas as páginas 25 a 31 formam o capítulo *"Hitler's Titanic"*, sobre o naufrágio do **Wilhelm Gustloff** — outro navio, outro desastre. O próprio e-book anuncia esses artigos como um apêndice.

Por padrão o laboratório indexa apenas as páginas 1 a 24, descartando os trechos do capítulo do Gustloff. As 24 páginas restantes do e-book seguem indexadas, incluindo o capítulo sobre inversão térmica como causa do desastre.

Remova o `pages` dessa entrada para indexar o e-book inteiro e observar um modo de falha clássico de RAG. Com o capítulo incluído, a pergunta *"Quantas pessoas morreram no naufrágio?"* retorna, em primeiro lugar e com 86,9% de similaridade:

```text
...we are left with a death toll of about 9,500, making the sinking the
largest maritime disaster in history...
```

São as vítimas do Gustloff, não do Titanic. Uma resposta fluente, confiante e do navio errado — a demonstração de por que um sistema RAG precisa de filtros por metadados e de citação de fonte.

As principais opções disponíveis no mesmo arquivo são:

| Opção | Padrão | Finalidade |
| --- | ---: | --- |
| `pdf.paths[].pages` | — | Intervalo de páginas a indexar. Omitido = documento inteiro. |
| `normalizacao.ativa` | `true` | Reconstitui parágrafos antes de dividir. |
| `textSplitter.chunkSize` | `1000` | Tamanho máximo aproximado de cada trecho. |
| `textSplitter.chunkOverlap` | `200` | Sobreposição entre trechos consecutivos. |
| `indexing.batchSize` | `50` | Trechos enviados por chamada ao Neo4j. |
| `similarity.topK` | `3` | Quantidade de resultados retornados por pergunta. |
| `neo4j.indexName` | `trechos_index` | Nome do índice vetorial no Neo4j. |
| `neo4j.nodeLabel` | `Trecho` | Label usado para os documentos indexados. |
| `neo4j.retrievalQuery` | — | Cypher que devolve texto, metadados e score de cada resultado. |

### Normalização do texto antes de dividir

O `RecursiveCharacterTextSplitter` tenta separadores em ordem — `["\n\n", "\n", " ", ""]` — preferindo cortar em fronteira de parágrafo. Ele só corta no meio de uma frase quando o pedaço ainda excede o `chunkSize`; o último separador é `""`, capaz de partir uma palavra ao meio.

O problema é que **o texto extraído de PDF não tem parágrafos**. Nas 97 páginas deste acervo, nenhuma contém `\n\n`: o `pdf-parse` devolve uma quebra por linha *impressa*, porque o formato PDF guarda posições de texto, não estrutura. Sem o primeiro separador, o splitter agrupa linhas soltas até completar 1000 caracteres, ignorando frases.

`src/textNormalizer.ts` reconstrói a estrutura antes da divisão:

- junta linhas que não terminam em pontuação final — são a mesma frase, quebrada pela diagramação;
- reúne palavras hifenizadas pela quebra de linha (`trans-` + `atlântico`);
- remove numeração de página isolada (`12`, `13 / 19`);
- remove cabeçalhos e rodapés, detectados por se repetirem em pelo menos 60% das páginas do documento;
- colapsa o espaçamento múltiplo do texto justificado;
- insere `\n\n` no fim de cada frase completa, dando ao splitter a fronteira que ele procura.

O efeito medido sobre os cinco PDFs:

| Métrica | Sem normalizar | Normalizado |
| --- | ---: | ---: |
| Trechos que terminam em pontuação | 28% | **80%** |
| Trechos que começam com maiúscula | 30% | **82%** |
| Total de trechos | 323 | 317 |

Trechos mais limpos também pontuam melhor. A pergunta *"Havia botes salva-vidas suficientes?"* recuperava um trecho que começava com `"acabara de passar."` a 83,5%; depois da normalização, o mesmo conteúdo começa na frase correta e pontua **86,1%** — sem o texto irrelevante no início, o vetor representa melhor o assunto.

Para desligar e comparar, use `CONFIG.normalizacao.ativa`.

### Por que existe um `retrievalQuery`

Sem essa consulta, o `Neo4jVectorStore` monta uma query padrão que concatena o **nome da propriedade** ao valor, devolvendo `text: <conteúdo>` em cada resultado. A query explícita retorna o texto limpo e remove o vetor de embedding dos metadados.

### Metadados gravados

Cada chunk carrega, além do texto e do vetor:

```json
{
  "source": "./docs/titanic/O Caso Titanic.pdf",
  "fileName": "O Caso Titanic.pdf",
  "pageNumber": 2,
  "totalPages": 2
}
```

Os metadados são achatados porque o Neo4j só aceita valores primitivos nas propriedades de um nó — a estrutura aninhada do `PDFLoader` (`loc.pageNumber`) não pode ser gravada como está.

## Execução

Inicie o Neo4j:

```powershell
npm run infra:up
```

Depois, inicie a aplicação:

```powershell
npm start
```

Na primeira execução, o modelo de embeddings precisa ser baixado e a inicialização demora mais.

Após os documentos serem indexados, digite perguntas no terminal:

```text
❓ Pergunta: Havia botes salva-vidas suficientes?

📄 Encontrados 3 trechos relevantes:

   1. ████████░░ 83.5% de similaridade
      ...Apesar de todos os avisos o Titanic não reduziu a velocidade, mantendo-se
      a 21.5 nós. Os número de botes salva-vidas era insuficiente, uma vez que o
      Titanic era capaz de acomodar 1.178 pessoas, ou seja, 53% das pessoas abordo...
      📄 O Caso Titanic.pdf — página 2/2

❓ Pergunta: sair
```

Digite `sair` — ou pressione `Ctrl+D` — para encerrar o prompt e fechar a conexão com o Neo4j.

### Como ler o percentual

O Neo4j não devolve o cosseno cru: ele normaliza para `(1 + cos) / 2`, de modo que o valor caiba entre 0 e 1. A consequência é que **a escala não começa no zero**:

| Exibido | Cosseno real | Significado |
| ---: | ---: | --- |
| 100% | 1,00 | textos idênticos em sentido |
| 87% | 0,73 | forte relação |
| 77% | 0,54 | relação moderada |
| **50%** | **0,00** | **vetores ortogonais — nenhuma relação** |
| 0% | −1,00 | sentidos opostos |

Um resultado com "60% de similaridade" corresponde a um cosseno de apenas 0,20. Percentuais abaixo de uns 70% costumam indicar que o acervo não tem a resposta.

### Por que sempre voltam três resultados

A busca vetorial devolve os `k` vizinhos mais próximos, **sempre**. Não existe o conceito de "não encontrei": mesmo uma pergunta fora do assunto recebe os três trechos menos distantes.

Medindo cinco perguntas respondíveis contra cinco sem resposta no acervo, os melhores scores foram:

| Perguntas | Faixa do melhor score |
| --- | --- |
| respondíveis | 73,7% a 89,6% |
| sem resposta no acervo | 58,1% a 77,1% |

As faixas **se sobrepõem**. *"Tinha pinga e cachaça?"* pontuou 77,1%, acima de *"quem era o capitão?"*, que pontuou 73,7% e é legítima. Nenhum limiar fixo separa as duas situações, porque a similaridade mede **assunto**, não **respondibilidade**: perguntar sobre bebidas a bordo é topicamente pertinente ao Titanic, ainda que nenhum documento trate disso.

A defesa que funciona não está na recuperação, e sim na geração: o prompt instrui a LLM a responder apenas com o contexto e a admitir quando ele não basta. É o que o laboratório [titanic-graphrag](../titanic-graphrag/) faz — e funciona, como se vê na resposta a essa mesma pergunta sobre cachaça. Reranking com *cross-encoder* seria o passo seguinte; ver o [tutorial de estratégias de recuperação](./docs/Tutorial%20-%20Estrategias%20de%20Recuperacao.pdf).

O Neo4j Browser fica disponível em [http://localhost:7474](http://localhost:7474). A conexão Bolt utilizada pela aplicação está disponível na porta `7687`.

## Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm start` | Processa os PDFs e abre a busca interativa. |
| `npm run dev` | Executa em modo watch e reinicia após mudanças no código. |
| `npm run debug` | Inicia pausado e aguarda o depurador na porta `9229`. |
| `npm run infra:up` | Cria e inicia o container do Neo4j. |
| `npm run infra:down` | Encerra o Neo4j e remove o container. |

O Neo4j utiliza bind mounts nas pastas `neo4j/data`, `neo4j/logs`, `neo4j/plugins` e `import`. Portanto, os dados locais podem permanecer nessas pastas depois de `npm run infra:down`.

## Depuração

O repositório possui configurações prontas para VS Code e Cursor. Abra `Pratica` ou `01-fundamentos-e-llms` como raiz do editor, pressione `Ctrl+Shift+D` e escolha **Embeddings Neo4j: aplicação**.

Consulte [DEBUG.md](./DEBUG.md) para instruções detalhadas e solução de problemas.

## Estrutura do projeto

```text
embeddings-neo4j/
├── docs/
│   ├── titanic/             # PDFs utilizados como fonte
│   ├── ia/                  # Material de apoio (não indexado por padrão)
│   ├── Fluxo RAG.md         # O fluxo RAG completo, aplicado ao caso Titanic
│   ├── Melhorias planejadas.md          # Backlog de estratégias de recuperação
│   ├── Tutorial - Estrategias de Recuperacao.pdf   # Guia (fonte: tutorial-recuperacao.html)
│   └── Kaggle Titanic.md    # Referência do dataset de passageiros (não indexado)
├── src/
│   ├── config.ts            # Configurações da aplicação
│   ├── textNormalizer.ts    # Reconstrução de parágrafos do texto do PDF
│   ├── index.ts             # Inicialização e prompt interativo
│   └── util.ts              # Formatação dos resultados
├── documentProcessor.ts     # Carregamento e divisão dos PDFs
├── docker-compose.yml       # Infraestrutura local do Neo4j
├── DEBUG.md                 # Guia de depuração
├── package.json             # Dependências e scripts
└── tsconfig.json            # Configuração do TypeScript
```

## Problemas comuns

### Falha ao conectar à API do Docker

Se aparecer `failed to connect to the docker API`, abra o Docker Desktop, aguarde a inicialização e execute novamente `npm run infra:up`.

### Falha ao conectar ao Neo4j

Confira o estado do container:

```powershell
docker compose ps
docker compose logs neo4j
```

Verifique também se `NEO4J_URI`, `NEO4J_USER` e `NEO4J_PASSWORD` correspondem à configuração do Docker Compose.

### Dimensões do índice não conferem

A mensagem `the provided embedding function and vector index dimensions do not match` indica que o `EMBEDDING_MODEL` gera vetores de tamanho diferente do índice já existente. Remova o índice no Neo4j Browser e execute a aplicação novamente:

```cypher
DROP INDEX trechos_index
```

### Extensão `.ts` desconhecida

Execute a aplicação pelos scripts npm ou pela configuração de debug do projeto. O comando precisa incluir `--experimental-strip-types`, já configurado em `npm start`, `npm run dev` e no `launch.json`.

### Breakpoint não é atingido

Não escolha o depurador genérico **Node.js**. Use **Embeddings Neo4j: aplicação**, conforme descrito no [guia de depuração](./DEBUG.md).
