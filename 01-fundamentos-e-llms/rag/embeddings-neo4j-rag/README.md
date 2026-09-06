# Embeddings com Neo4j — RAG completo

Terceiro laboratório da série. Os dois anteriores param na **recuperação**; este fecha o ciclo do RAG: recupera os trechos e **gera uma resposta** a partir deles.

```text
Pergunta → busca vetorial → [reranking] → LLM redige → resposta + fontes + trechos
```

| Laboratório | Onde para |
| --- | --- |
| [embeddings-neo4j](../embeddings-neo4j/) | exibe os trechos recuperados |
| [titanic-graphrag](../titanic-graphrag/) | roteia entre busca vetorial e Cypher, e responde |
| **este** | busca vetorial e responde, com o prompt em arquivo |

O acervo é o mesmo dos outros: cinco PDFs sobre o Titanic, em português e inglês.

## O que este laboratório acrescenta

**A classe `AI`** (`src/ai.ts`), que encadeia recuperação e geração com `RunnableSequence` do LangChain. Veio do [exemplo 13 do material da aula](../../../../material-aulas/modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag/), com uma única alteração — descrita adiante.

**O prompt fora do código**, em `prompts/` — também do exemplo 13, de autoria de **Erick Wendel**, adaptado do tema original (TensorFlow.js) para o Titanic:

| Arquivo | Conteúdo |
| --- | --- |
| `answerPrompt.json` | papel, tarefa, instruções e restrições |
| `template.txt` | o template com os marcadores `{role}`, `{task}`, `{context}`, `{question}`… |

Editar o comportamento do assistente não exige tocar em código. E **todo campo do JSON chega ao modelo** — os seis que existem:

```
role   task   instructions   constraints.tone   constraints.language   constraints.format
```

O template tem oito marcadores; os outros dois, `{question}` e `{context}`, vêm da execução. O encaixe está em [`ai.ts`](./src/ai.ts#L76-L87), e é literal: cada chave passada ao `invoke` corresponde a um marcador.

> **Divergimos do exemplo da aula aqui.** O `answerPrompt.json` original tem também `metadata`, `examples`, `context_rules` e `constraints.max_length` — quatro blocos que **nenhuma linha de código lê**. Ficavam no arquivo com cara de configuração: quem lesse `"use_only_provided_context": true` ou `"max_length": 500` concluiria que aquilo governa o comportamento, e não governa. Removemos para que o arquivo mostre exatamente o que o modelo recebe, nem mais nem menos.
>
> A consequência prática: um limite de tamanho, para valer, precisa ser uma frase em `instructions` — que é o único bloco em lista livre que de fato viaja no prompt.

## Pré-requisitos

Precisa de **chave da OpenRouter**, diferente do `embeddings-neo4j`, que roda inteiramente local. Sem chave, a geração de resposta falha.

A chave é lida da variável de ambiente `OpenRouter__ApiKey` — ver o [procedimento detalhado](../titanic-graphrag/README.md#a-chave-do-openrouter).

O Neo4j sobe daqui mesmo:

```powershell
npm run infra:up
```

O `docker-compose.yml` vive em [`../`](../docker-compose.yml), ao lado de `compartilhado/`, porque a instância é uma só para os três laboratórios — o `infra:up` de cada um aponta para esse arquivo.

## Instalação e execução

```powershell
cd 01-fundamentos-e-llms/rag/embeddings-neo4j-rag
npm ci
npm start
```

O `npm start` pergunta o idioma, indexa os PDFs e abre o prompt. A indexação leva cerca de 40 segundos.

## Como a saída é organizada

Enquanto processa, uma barra ocupa a linha:

```text
   ⠹ [█████░░░░░] 2/2 redigindo a resposta… 5.4s
```

Nada é impresso antes do fim. Quando termina, sai tudo de uma vez, com a **resposta primeiro**:

```text
💬 Resposta

# Sobre os botes do Titanic
Sim, havia botes — mas em quantidade insuficiente...

📚 Fontes: Titanic - A Projeção.pdf p.14  |  O Caso Titanic.pdf p.2

📄 Encontrados 3 trechos relevantes:
   1. ████████░░ 79.5% de similaridade
      O iceberg fez um corte de 100 metros...
```

A ordem é deliberada: quem só quer a resposta não precisa rolar a tela, e quem quer conferir a procedência encontra os trechos logo abaixo, com o score de cada um.

## A alteração feita na classe `AI`

O `retrieveVectorSearchResults` original faz a própria busca vetorial. Como o `index.ts` já busca — e opcionalmente reordena — antes de chamar, isso significaria **buscar duas vezes** e descartar a reordenação.

A solução foi aceitar um contexto pronto:

```typescript
async answerQuestion(question: string, context?: string)
```

```typescript
if (input.context) {
    this.params.debugLog("↩️  Contexto recebido pronto; busca vetorial dispensada.");
    return input;
}
```

Sem o segundo argumento, o comportamento é exatamente o do material da aula.

O `debugLog` recebe `() => {}` no `index.ts`: a classe imprimiria a pergunta e a resposta no formato dela, e o `index.ts` imprimiria de novo. A formatação fica com quem chama.

## Configuração

Além das opções herdadas do [embeddings-neo4j](../embeddings-neo4j/#configuração-dos-documentos) — PDFs, chunking, normalização, `topK` —, este laboratório tem:

| Opção | Padrão | Finalidade |
| --- | ---: | --- |
| `promptConfig` | `prompts/answerPrompt.json` | papel, tarefa e instruções do assistente |
| `templateText` | `prompts/template.txt` | template do prompt final |
| `openRouter.nlpModel` | `NLP_MODEL` do `.env` | modelo que redige a resposta |
| `openRouter.temperature` | `0.3` | variação permitida na redação |
| `reranking.ativo` | `false` | reordena os candidatos antes de responder |

## Convivência com os outros laboratórios

Os três projetos **compartilham a mesma instância do Neo4j**, cada um com seus rótulos:

| Rótulo | Índice vetorial | Projeto |
| --- | --- | --- |
| `:Trecho` | `trechos_index` | [embeddings-neo4j](../embeddings-neo4j/) |
| `:TrechoRag` | `trechos_rag_index` | **este** |
| `:Passageiro`, `:Classe`, `:Porto`, `:Bilhete` | — | [titanic-graphrag](../titanic-graphrag/) |

Isso importa porque a aplicação **apaga todos os nós do seu rótulo** antes de reindexar. Com rótulos iguais, rodar um projeto destruiria os dados do outro — em silêncio, sem erro nenhum. Foi o que aconteceu uma vez, deixando o vizinho com 250 dos 300 trechos.

A instância, essa sim, é única: o `titanic-graphrag` consulta os nós `:Trecho` que o `embeddings-neo4j` grava, então os três precisam falar com o mesmo banco. Por isso o `docker-compose.yml` foi para `rag/`, e não para dentro de um dos projetos.

Um compose por laboratório seria possível — bastaria o mesmo `name:` de projeto nos três arquivos, e o Compose entenderia que se trata do mesmo container em vez de recusar o `container_name` duplicado. O que pesa contra é a sincronia: trocar a versão do Neo4j viraria três edições, e esquecer uma faria o Compose recriar o container por baixo dos outros dois.

## Estrutura

```text
embeddings-neo4j-rag/
├── prompts/
│   ├── answerPrompt.json   # papel, tarefa, instruções
│   └── template.txt        # template com os marcadores
├── docs/                   # os mesmos cinco PDFs do acervo
├── src/
│   ├── ai.ts               # cadeia recuperação → geração
│   ├── config.ts           # configuração e leitura dos prompts
│   ├── llm.ts              # cliente OpenRouter para o reranking
│   ├── textNormalizer.ts   # reconstrução de parágrafos do PDF
│   ├── util.ts             # exibição dos trechos
│   └── index.ts            # CLI
├── package.json
└── tsconfig.json
```

Os módulos de formatação, progresso, idiomas e reranking ficam em [`../compartilhado/`](../compartilhado/), usados pelos três laboratórios.

## Documentação relacionada

Os fundamentos — chunking, normalização de PDF, escala dos percentuais, índice aproximado, fontes divergentes — estão documentados no laboratório de origem e valem aqui igualmente:

| Documento | Conteúdo |
| --- | --- |
| [README do embeddings-neo4j](../embeddings-neo4j/README.md) | modelo multilíngue, normalização, `topK`, como ler o score |
| [Fluxo RAG](../embeddings-neo4j/docs/Fluxo%20RAG.md) | o fluxo completo, filtros, reranking, fontes divergentes |
| [Tutorial — Estratégias de Recuperação](../embeddings-neo4j/docs/Tutorial%20-%20Estrategias%20de%20Recuperacao.pdf) | BM25, híbrida, MMR, small-to-big, self-query, HyDE, ColBERT |
| [Melhorias planejadas](../embeddings-neo4j/docs/Melhorias%20planejadas.md) | o que falta, com prioridade e esforço |

## Créditos

Parte do **exemplo 13** do material da aula, de **Erick Wendel** — dele vêm a classe `src/ai.ts`, os dois arquivos de `prompts/` e a estrutura do projeto, herdada por sua vez do exemplo 12.

Adaptado por **Almir Martinelli**, no curso de Engenharia de IA Aplicada:

- prompt reescrito do tema original (TensorFlow.js) para o caso Titanic, e reduzido aos campos que o código de fato lê;
- `answerQuestion` passou a aceitar contexto pronto, para não repetir a busca vetorial já feita por quem chama;
- barra de progresso, ordem da saída (resposta antes dos trechos) e linha de fontes com arquivo e página;
- rótulo e índice próprios, para conviver com os outros dois laboratórios no mesmo Neo4j;
- tudo que veio junto do [embeddings-neo4j](../embeddings-neo4j/#créditos): acervo do Titanic, modelo multilíngue, normalização de PDF, lotes, idiomas e reranking.

> Os commits registram co-autoria do Claude Code, usado como par na implementação e na redação da documentação.
