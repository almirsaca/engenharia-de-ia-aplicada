# Melhorias planejadas — estratégias de recuperação

Itens ainda não implementados nos laboratórios [embeddings-neo4j](../) e [titanic-graphrag](../../titanic-graphrag/). A fundamentação teórica de cada um está no [tutorial de estratégias de recuperação](./Tutorial%20-%20Estrategias%20de%20Recuperacao.pdf).

## Situação atual

| Tipo de recuperação | Pergunta típica | Estado |
| --- | --- | --- |
| Busca vetorial | *"Por que o navio afundou?"* | ✅ implementado |
| Agregação (Cypher) | *"Quantas mulheres da 3ª classe sobreviveram?"* | ✅ implementado |
| Travessia de grafo | *"Quem viajava com a família Sage?"* | ⚠️ dados existem, não exposto |
| Busca lexical (BM25) | *"O que dizem sobre o Carpathia?"* | ❌ |
| Busca híbrida | ambos os casos acima | ❌ |
| MMR (diversidade) | evitar três trechos quase idênticos | ❌ |
| Reranking | reordenar os candidatos | ❌ |
| Small-to-big | precisão na busca, contexto na resposta | ❌ |
| Self-query | filtros extraídos da pergunta | ❌ |
| HyDE | perguntas curtas ou vagas | ❌ |
| Multi-vetor (ColBERT) | precisão máxima | ❌ |

---

## 1. Busca híbrida (vetorial + BM25)

**Prioridade: alta. Esforço: mínimo.**

Hoje uma pergunta sobre `"Carpathia"`, `"White Star Line"` ou `"CA. 2343"` depende de sorte semântica: nomes próprios e códigos não têm significado que o embedding capture. A busca lexical resolve exatamente isso, e a híbrida funde os dois rankings.

O `Neo4jVectorStore` já suporta. Em `src/config.ts`:

```typescript
searchType: "vector" as const,   // trocar por "hybrid"
```

Com `"hybrid"`, o driver cria um índice full-text além do vetorial e combina os resultados. É preciso conferir se o índice de palavras-chave é criado com o nome esperado (`keywordIndexName`) e se a fusão dos rankings atende — a implementação do driver é simples e pode não usar *Reciprocal Rank Fusion*.

**Como medir:** montar dez perguntas com nomes próprios e códigos, comparar a posição do trecho correto com `"vector"` e com `"hybrid"`.

## 2. Travessia de grafo exposta ao usuário

**Prioridade: alta. Esforço: baixo.**

O grafo já tem `:Bilhete` como nó, o que permite descobrir grupos que viajavam juntos — mas nenhuma rota do `titanic-graphrag` explora relacionamentos; o *text2cypher* tende a gerar agregações.

```cypher
MATCH (p:Passageiro {nome: $nome})-[:COMPROU]->(:Bilhete)<-[:COMPROU]-(companheiro)
RETURN companheiro.nome, companheiro.sobreviveu
```

Bastaria acrescentar exemplos de travessia ao `GRAPH_SCHEMA` para orientar o modelo, e uma análise pronta em `analises.ts`.

## 3. Reranking

**Prioridade: alta. Esforço: médio.**

Já documentado no [Fluxo RAG](./Fluxo%20RAG.md) com um caso real: para *"O Titanic foi avisado sobre icebergs?"*, um trecho sobre o valor do seguro pago às vítimas pontuou 87,1% — praticamente empatado com o trecho correto — sem responder nada.

Recuperar 20 candidatos e reordenar com um *cross-encoder*, ficando com os 3 melhores. Modelos como `Xenova/ms-marco-MiniLM-L-6-v2` rodam localmente pelo Transformers.js, sem custo de API.

**Como medir:** a posição do trecho correto antes e depois, nas perguntas onde hoje ele não é o primeiro.

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

1. **Busca híbrida** — uma palavra no config, ganho imediato e mensurável.
2. **Travessia de grafo** — aproveita estrutura que já existe e está ociosa.
3. **Reranking** — corrige um problema já demonstrado com dados reais.
4. **Tool calling** — remove a limitação de rota única.
5. O restante, conforme o interesse de estudo.
