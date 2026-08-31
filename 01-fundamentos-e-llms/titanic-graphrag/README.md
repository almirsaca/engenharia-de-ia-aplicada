# Titanic GraphRAG — recuperação híbrida

Aplicação de linha de comando que responde perguntas sobre o Titanic escolhendo entre **duas formas de recuperação**, conforme o tipo da pergunta:

```text
                      ┌─ "Por que o navio afundou?"
Pergunta ─→ roteador ─┤     → busca vetorial nos PDFs (nós :Chunk)
                      └─ "Quantas mulheres da 3ª classe sobreviveram?"
                            → Cypher no grafo de passageiros (nós :Passageiro)
```

O ponto do laboratório é mostrar que **nem toda pergunta se responde com embeddings**. Contagens, médias e taxas exigem agregação sobre dados estruturados; busca vetorial devolve os `k` trechos mais parecidos, nunca um `COUNT`.

## Relação com o laboratório de embeddings

Os dois laboratórios usam **a mesma instância do Neo4j**, com rótulos diferentes:

| Rótulo | Origem | Usado para |
| --- | --- | --- |
| `:Chunk` | [embeddings-neo4j](../embeddings-neo4j/) — PDFs sobre o Titanic | busca vetorial |
| `:Passageiro`, `:Classe`, `:Porto`, `:Bilhete` | este laboratório — dataset do Kaggle | agregação Cypher |

Por isso o `docker-compose.yml` fica no outro projeto: aqui reaproveitamos o mesmo banco. Para a busca vetorial funcionar, os PDFs precisam ter sido indexados antes.

## Pré-requisitos

- Node.js `22.13.1` ou compatível com `--experimental-strip-types`.
- Neo4j em execução — subir pelo laboratório vizinho:

```powershell
cd ../embeddings-neo4j
npm run infra:up
npm start      # indexa os PDFs; necessário para a rota de documentos
```

## Instalação

```powershell
cd 01-fundamentos-e-llms/titanic-graphrag
npm install
```

> O `.npmrc` do projeto define `legacy-peer-deps=true`. O `@langchain/community` declara dezenas de peer dependencies opcionais para integrações que não usamos, e duas delas (`typeorm` e `better-sqlite3`) exigem versões incompatíveis entre si. Sem essa configuração, o `npm install` falha com `ERESOLVE`.

## Variáveis de ambiente

Crie um `.env` nesta pasta:

```dotenv
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2

# Opcional: habilita o roteamento e a resposta gerada
OPENROUTER_API_KEY=
NLP_MODEL='google/gemma-3-27b-it:free'
```

Sem `OPENROUTER_API_KEY` — ou com uma chave recusada — a aplicação entra em **modo sem LLM**: o comando `analises` e a busca vetorial continuam funcionando, apenas sem roteamento automático e sem resposta redigida.

## Os dados

`data/titanic.csv` traz as 891 linhas do conjunto de treino da competição [Titanic no Kaggle](https://www.kaggle.com/competitions/titanic), com as 12 colunas originais. O arquivo veio de um espelho público, porque o download direto pelo Kaggle exige autenticação e aceite das regras da competição.

O dicionário de dados completo está documentado em [Kaggle Titanic](../embeddings-neo4j/docs/Kaggle%20Titanic.md).

## Execução

```powershell
npm run load    # carrega o CSV no grafo (idempotente; opcional)
npm start       # carrega se necessário e abre o prompt
```

No prompt:

| Entrada | Efeito |
| --- | --- |
| uma pergunta | roteia para o grafo ou para os documentos |
| `analises` | roda as sete consultas Cypher prontas |
| `sair` ou `Ctrl+D` | encerra |

## O modelo do grafo

```text
(:Passageiro {passageiroId, nome, sexo, idade, tarifa, cabine,
              sobreviveu, irmaosConjuges, paisFilhos})
    -[:VIAJOU_NA]->   (:Classe {numero, descricao})
    -[:EMBARCOU_EM]-> (:Porto {codigo, nome})
    -[:COMPROU]->     (:Bilhete {codigo})
```

Carga: 891 `:Passageiro`, 681 `:Bilhete`, 3 `:Classe`, 3 `:Porto`. Há 889 relacionamentos `:EMBARCOU_EM` porque dois passageiros não têm porto informado no dataset original.

A carga usa `MERGE` por `passageiroId` e é idempotente — rodar duas vezes não duplica nada.

Modelar `Bilhete` como nó, em vez de propriedade, permite encontrar grupos que viajavam juntos:

```cypher
MATCH (p:Passageiro)-[:COMPROU]->(b:Bilhete)
WITH b, collect(p) AS grupo WHERE size(grupo) >= 4
RETURN b.codigo, size(grupo) AS pessoas,
       size([x IN grupo WHERE x.sobreviveu]) AS sobreviveram
ORDER BY pessoas DESC LIMIT 5
```

## Algumas análises prontas

`npm start` → `analises` executa sete consultas. Duas delas:

```text
📊 Sobrevivência por sexo e classe
   num  classe    sexo    total  sobreviveram  taxa
   ────────────────────────────────────────────────
   1    Primeira  female  94     91            96.8
   1    Primeira  male    122    45            36.9
   2    Segunda   female  76     70            92.1
   2    Segunda   male    108    17            15.7
   3    Terceira  female  144    72            50
   3    Terceira  male    347    47            13.5

📊 Maiores grupos viajando com o mesmo bilhete
   bilhete   pessoas  sobreviveram
   ──────────────────────────────
   CA. 2343  7        0
   1601      7        5
   347082    7        0
```

O primeiro quadro é o resultado que dá sentido à competição do Kaggle: sexo e classe, combinados, praticamente determinam o desfecho — de 96,8% a 13,5%. O segundo mostra a família Sage (bilhete `CA. 2343`), que perdeu todos os sete membros presentes no conjunto de treino.

## Geração de Cypher pela LLM

Para perguntas sobre os passageiros, a LLM recebe o esquema do grafo (`GRAPH_SCHEMA`, em `src/config.ts`) e escreve a consulta. Essa técnica é conhecida como *text2cypher*.

**A consulta gerada nunca é executada sem validação.** `validarCypher` rejeita a consulta se ela contiver `CREATE`, `MERGE`, `SET`, `DELETE`, `DROP`, `CALL`, `LOAD CSV` ou similares, e exige que comece por `MATCH`, `WITH`, `UNWIND` ou `RETURN`:

```typescript
const PROIBIDOS = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\s+CSV|CALL|FOREACH|USING\s+PERIODIC)\b/i;
```

Instruir a LLM a gerar apenas leitura é necessário, mas não é garantia: o prompt pode ser contornado por uma pergunta maliciosa. A validação em código é o que de fato protege o banco. Em produção, o certo é ir além e usar um **usuário do Neo4j com permissão somente de leitura** — defesa que não depende de expressão regular.

## Estrutura

```text
titanic-graphrag/
├── data/titanic.csv      # 891 passageiros (espelho do conjunto de treino)
├── src/
│   ├── config.ts         # Configuração e esquema do grafo para a LLM
│   ├── loadGraph.ts      # Parser CSV e carga no Neo4j
│   ├── analises.ts       # Consultas Cypher prontas e formatação de tabela
│   ├── router.ts         # Classificação, text2cypher e geração da resposta
│   └── index.ts          # CLI
├── .npmrc                # legacy-peer-deps (ver Instalação)
├── package.json
└── tsconfig.json
```

## Problemas comuns

### `O OpenRouter recusou a chave (401)`

A chave em `OPENROUTER_API_KEY` é inválida ou foi revogada. Gere outra em <https://openrouter.ai/keys>. A aplicação segue em modo sem LLM até o fim da sessão.

### A busca vetorial não encontra nada

Os nós `:Chunk` são criados pelo outro laboratório. Rode `npm start` em `../embeddings-neo4j` ao menos uma vez.

### `ERESOLVE` no `npm install`

Confirme que o `.npmrc` desta pasta existe e contém `legacy-peer-deps=true`.
