# Melhorias planejadas — estratégias de recuperação

Itens ainda não implementados nos laboratórios [embeddings-neo4j](../) e [titanic-graphrag](../../titanic-graphrag/). A fundamentação teórica de cada um está no [tutorial de estratégias de recuperação](./Tutorial%20-%20Estrategias%20de%20Recuperacao.pdf).

## Situação atual

| Tipo de recuperação | Pergunta típica | Estado |
| --- | --- | --- |
| Busca vetorial | *"Por que o navio afundou?"* | ✅ implementado |
| Agregação (Cypher) | *"Quantas mulheres da 3ª classe sobreviveram?"* | ✅ implementado |
| Travessia de grafo | *"Quem viajava com a família Sage?"* | ⚠️ dados existem, não exposto |
| Busca lexical (BM25) | *"O que dizem sobre o Carpathia?"* | ❌ |
| Busca híbrida | ambos os casos acima | ⚠️ testada, piorou o caso medido |
| MMR (diversidade) | evitar três trechos quase idênticos | ❌ |
| Reranking | reordenar os candidatos | ⚠️ via LLM, desligado por padrão |
| Small-to-big | precisão na busca, contexto na resposta | ❌ |
| Self-query | filtros extraídos da pergunta | ❌ |
| HyDE | perguntas curtas ou vagas | ❌ |
| Multi-vetor (ColBERT) | precisão máxima | ❌ |

---

## 1. Busca híbrida (vetorial + BM25)

**Prioridade: média. Esforço: mínimo — mas testada e reprovada no caso medido.**

A hipótese: uma pergunta sobre `"Carpathia"`, `"White Star Line"` ou `"CA. 2343"` depende de sorte semântica, porque nomes próprios e códigos não têm significado que o embedding capture. A busca lexical resolveria isso, e a híbrida fundiria os dois rankings.

Ativar é uma palavra em `src/config.ts`:

```typescript
searchType: "hybrid" as const,   // era "vector"
keywordIndexName: "trechos_keyword",
```

**O teste não confirmou a hipótese.** Para *"qual era a cor do navio?"*, cuja resposta contém literalmente a palavra "cor", a híbrida **piorou**: o trecho certo caiu de #2 para #3. E os scores voltaram com vários resultados em 100% — a fusão do driver normaliza pelo topo, sem *Reciprocal Rank Fusion*, o que descarta a informação de quanto o primeiro se destaca.

Vale reavaliar com perguntas que contenham nomes próprios raros, que era o cenário original da hipótese — mas com uma implementação de RRF própria, não a do driver. O índice full-text criado no teste foi removido.

## 2. Travessia de grafo exposta ao usuário

**Prioridade: alta. Esforço: baixo.**

O grafo já tem `:Bilhete` como nó, o que permite descobrir grupos que viajavam juntos — mas nenhuma rota do `titanic-graphrag` explora relacionamentos; o *text2cypher* tende a gerar agregações.

```cypher
MATCH (p:Passageiro {nome: $nome})-[:COMPROU]->(:Bilhete)<-[:COMPROU]-(companheiro)
RETURN companheiro.nome, companheiro.sobreviveu
```

Bastaria acrescentar exemplos de travessia ao `GRAPH_SCHEMA` para orientar o modelo, e uma análise pronta em `analises.ts`.

## 3. Reranking

**Implementado** no [titanic-graphrag](../../titanic-graphrag/README.md), atrás de `CONFIG.reranking.ativo`, desligado por padrão.

Já documentado no [Fluxo RAG](./Fluxo%20RAG.md) com um caso real: para *"O Titanic foi avisado sobre icebergs?"*, um trecho sobre o valor do seguro pago às vítimas pontuou 87,1% — praticamente empatado com o trecho correto — sem responder nada.

### O cross-encoder não era viável

O plano original era reordenar com um *cross-encoder* local, mais rápido e barato que uma LLM. **Não existe hoje um multilíngue utilizável com Transformers.js.** Cinco modelos testados:

| Modelo | Resultado |
| --- | --- |
| `Xenova/ms-marco-MiniLM-L-6-v2` | carrega, mas é só inglês — **piorou**, derrubando o trecho certo de #2 para #3 |
| `Xenova/mmarco-mMiniLMv2-L12-H384-v1` | não existe |
| `Alibaba-NLP/gte-multilingual-reranker-base` | `Unsupported model type: new` |
| `phatjk/...-msmarco-onnx` | arquivo ONNX ausente |
| `igorktech/...-onnx-fp16` | ONNX fora do caminho padrão |

O primeiro repete, na camada de reranking, o erro já diagnosticado nos embeddings: modelo monolíngue sobre acervo em português degrada em vez de melhorar.

A saída foi usar a **própria LLM como juiz de relevância** — os 20 candidatos vão numerados, ela devolve os 3 melhores. Custa uma chamada a mais, entre 17 e 35 segundos no free tier, e por isso fica desligado por padrão.

**Medido:** em *"qual era a cor do navio?"*, o trecho das chaminés — única menção de cor no acervo — sobe de #2 para #1.

## 4. MMR (Maximal Marginal Relevance)

**Prioridade: média. Esforço: médio.**

Com `chunkOverlap: 200`, trechos vizinhos compartilham texto, e o top-3 pode trazer praticamente o mesmo conteúdo três vezes — desperdiçando o orçamento de contexto.

O MMR escolhe resultados que sejam relevantes **e diferentes entre si**. Atenção: o `Neo4jVectorStore` **não implementa** `maxMarginalRelevanceSearch`; seria preciso recuperar um top-20 e aplicar o algoritmo sobre os vetores manualmente.

## 5. Small-to-big (Parent Document)

**Prioridade: média. Esforço: médio.**

Ataca o dilema do `chunkSize` diretamente: trecho pequeno é encontrado com mais precisão, trecho grande responde melhor. A solução é embedar pequeno e devolver grande.

No grafo isso fica natural — em vez de um artifício, vira estrutura:

```cypher
(:Trecho)-[:PARTE_DE]->(:Pagina)-[:PARTE_DE]->(:Documento)
```

Busca-se pelo `:Trecho` e devolve-se a `:Pagina`. É um bom argumento a favor de usar um banco de grafos como vector store.

## 6. Self-query (filtros extraídos da pergunta)

**Prioridade: média. Esforço: médio.**

A seção de Filtros do [Fluxo RAG](./Fluxo%20RAG.md) descreve filtros por metadados, mas hoje o único filtro real acontece na indexação (o recorte de páginas do e-book). Com self-query, a LLM extrai o filtro da própria pergunta:

> *"O que a análise de riscos diz sobre velocidade?"*
> → `WHERE fileName = 'O Caso Titanic.pdf'` + busca vetorial por "velocidade"

Os metadados necessários (`fileName`, `pageNumber`) já estão gravados em cada nó.

## 7. HyDE (Hypothetical Document Embeddings)

**Prioridade: baixa. Esforço: baixo.**

A LLM redige uma resposta hipotética e **essa resposta** é embeddada, não a pergunta. Funciona porque uma resposta se parece mais com um trecho de documento do que uma pergunta se parece.

Custa uma chamada de LLM a mais por pergunta — com o modelo de raciocínio gratuito atual, isso significa somar 15 segundos à latência.

## 8. Multi-vetor / late interaction (ColBERT)

**Prioridade: baixa. Esforço: alto.**

Vários vetores por documento, comparados token a token, em vez de um vetor único por trecho. Ganho de precisão relevante, com custo de armazenamento uma ordem de grandeza maior. Vale como estudo, não como próximo passo.

## 9. Roteamento por tool calling

**Prioridade: média. Esforço: médio.**

O roteador atual do `titanic-graphrag` **escolhe uma** rota. Uma pergunta como *"a análise de riscos explica por que a terceira classe morreu mais?"* precisa do número (grafo) **e** do texto (documentos), e hoje ele é obrigado a escolher.

Declarar as duas fontes como ferramentas e deixar a LLM decidir quantas chamar resolve, e é o padrão moderno para esse tipo de orquestração.

---

## Ordem sugerida

1. **Travessia de grafo** — aproveita estrutura que já existe e está ociosa.
2. **Tool calling** — remove a limitação de rota única.
3. **Small-to-big** — resolve o dilema do `chunkSize` de vez.
4. **Self-query** — necessário assim que houver permissões ou múltiplos acervos.

Já feitos: **`topK` maior** (corrige a perda de recall do índice aproximado) e **reranking pela LLM** (desligado por padrão).

Descartados por medição: **cross-encoder** (não há multilíngue viável) e **busca híbrida** na implementação do driver (piorou o caso testado).

> Uma lição que atravessa esses itens: as duas correções que pareciam mais óbvias no papel — híbrida e cross-encoder — foram as que falharam ao serem medidas. Nenhuma técnica deste documento vale como recomendação até ser testada **neste acervo, em português**.
5. O restante, conforme o interesse de estudo.
