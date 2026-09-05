import type { DataType, PretrainedModelOptions } from "@huggingface/transformers";
import { SEM_LIMITE } from "../../compartilhado/formatacao.ts";

export const CONFIG = Object.freeze({
    neo4j: {
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
    },

    csv: {
        // Os dois conjuntos da competição, mantidos separados de propósito.
        // O de teste NÃO tem a coluna Survived: o gabarito é justamente o que a
        // competição pede para prever, e o Kaggle não o publica. Juntar os dois
        // numa coluna só exigiria inventar desfechos — foi o que aconteceu numa
        // tentativa anterior, que acabou usando as previsões do
        // gender_submission.csv como se fossem fatos.
        treino: "./data/titanic-treino.csv",
        teste: "./data/titanic-teste.csv",
    },

    // Busca vetorial sobre os chunks indexados pelo laboratório embeddings-neo4j.
    // Os dois laboratórios compartilham a mesma instância do Neo4j: este grava
    // nós :Passageiro, o outro grava nós :Trecho.
    vector: {
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
        indexName: "trechos_index",
        searchType: "vector" as const,
        textNodeProperties: ["text"],
        nodeLabel: "Trecho",
        retrievalQuery: `
        RETURN node.text AS text,
               node { .*, embedding: Null, id: Null, text: Null } AS metadata,
               score
        `,
    },

    embedding: {
        modelName: process.env.EMBEDDING_MODEL!,
        pretrainedOptions: {
            dtype: "fp32" as DataType,
        } satisfies PretrainedModelOptions,
    },

    openRouter: {
        model: process.env.NLP_MODEL,
        baseURL: "https://openrouter.ai/api/v1",
        // A chave vive na variável de ambiente da máquina `OpenRouter__ApiKey`,
        // fora do .env. O `--env-file` do Node não expande `${VAR}`, então a
        // referência precisa ser feita aqui. OPENROUTER_API_KEY continua
        // aceita como alternativa, para quem preferir defini-la no .env.
        apiKey: process.env.OpenRouter__ApiKey ?? process.env.OPENROUTER_API_KEY,
        // Temperatura zero: geração de Cypher não deve variar entre execuções.
        temperature: 0,
        maxRetries: 1,
        // Limite de cada tentativa isolada. O SDK usa 10 minutos por padrão.
        timeoutMs: 45_000,
        // Limite do passo inteiro, incluindo as retentativas. Sem ele, o tempo
        // total seria (1 + maxRetries) × timeoutMs, e o terminal ficaria preso
        // muito além do que o contador do timeout sugere.
        prazoTotalMs: 60_000,
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
            "X-Title": process.env.OPENROUTER_SITE_NAME,
        },
    },

    similarity: {
        // Candidatos pedidos ao índice HNSW, que é aproximado: com k pequeno o
        // feixe de busca é estreito e perde trechos legitimamente entre os mais
        // similares. Ver a nota equivalente em embeddings-neo4j/src/config.ts.
        topK: 20,
        // Quantos vão para a tela e para o contexto da LLM. Enviar os 20
        // encheria o prompt de ruído e diluiria a resposta.
        topKExibicao: 3,
    },

    exibicao: {
        // Caracteres exibidos por trecho no terminal, antes da resposta da LLM.
        // Troque por um número (300, por exemplo) para encurtar a saída.
        limiteTrecho: SEM_LIMITE,
    },
});

// Descrição do grafo entregue à LLM na geração de Cypher. Mantenha em sincronia
// com loadGraph.ts — é a única fonte de verdade que o modelo enxerga.
export const GRAPH_SCHEMA = `
Nós:
  (:Passageiro {
      passageiroId: int, nome: string, sexo: 'male'|'female',
      idade: float | null, tarifa: float, cabine: string | null,
      sobreviveu: boolean | null, irmaosConjuges: int, paisFilhos: int,
      conjunto: 'treino' | 'teste'
  })
  (:Classe {numero: int, descricao: string})        // 1=Primeira, 2=Segunda, 3=Terceira
  (:Porto {codigo: string, nome: string})           // C=Cherbourg, Q=Queenstown, S=Southampton
  (:Bilhete {codigo: string})

Relacionamentos:
  (:Passageiro)-[:VIAJOU_NA]->(:Classe)
  (:Passageiro)-[:EMBARCOU_EM]->(:Porto)
  (:Passageiro)-[:COMPROU]->(:Bilhete)

Observações:
  - IMPORTANTE: só os 891 passageiros de 'treino' têm desfecho conhecido. Nos
    418 de 'teste', 'sobreviveu' é null, porque a competição do Kaggle não
    publica esse gabarito. Qualquer pergunta sobre sobrevivência — contagens,
    taxas, comparações — DEVE filtrar por p.conjunto = 'treino'. Perguntas
    sobre atributos (nome, classe, idade, porto, bilhete) podem usar os 1309.
  - 'sobreviveu' é booleano ou null; use WHERE p.sobreviveu = true para
    sobreviventes e WHERE p.sobreviveu = false para as vítimas.
  - 'idade' é null para 177 dos 891 passageiros; filtre com IS NOT NULL ao calcular médias.
  - 'cabine' é null para a maioria dos passageiros.
  - Passageiros que compraram o mesmo Bilhete costumam ser famílias ou grupos.
`.trim();
