import type { DataType, PretrainedModelOptions } from "@huggingface/transformers";
import { SEM_LIMITE } from "../../compartilhado/formatacao.ts";

export const CONFIG = Object.freeze({
    neo4j: {
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
    },

    csv: {
        path: "./data/titanic.csv",
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
        maxRetries: 2,
        // O SDK da OpenAI usa 10 minutos por padrão. Com maxRetries: 2, uma
        // requisição estagnada prenderia o terminal por até meia hora. As etapas
        // medidas levam de 5 a 19 segundos, então 90 s é folga suficiente.
        timeoutMs: 90_000,
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
            "X-Title": process.env.OPENROUTER_SITE_NAME,
        },
    },

    similarity: {
        topK: 3,
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
      sobreviveu: boolean, irmaosConjuges: int, paisFilhos: int
  })
  (:Classe {numero: int, descricao: string})        // 1=Primeira, 2=Segunda, 3=Terceira
  (:Porto {codigo: string, nome: string})           // C=Cherbourg, Q=Queenstown, S=Southampton
  (:Bilhete {codigo: string})

Relacionamentos:
  (:Passageiro)-[:VIAJOU_NA]->(:Classe)
  (:Passageiro)-[:EMBARCOU_EM]->(:Porto)
  (:Passageiro)-[:COMPROU]->(:Bilhete)

Observações:
  - 'sobreviveu' é booleano; use WHERE p.sobreviveu = true para sobreviventes.
  - 'idade' é null para 177 dos 891 passageiros; filtre com IS NOT NULL ao calcular médias.
  - 'cabine' é null para a maioria dos passageiros.
  - Passageiros que compraram o mesmo Bilhete costumam ser famílias ou grupos.
`.trim();
