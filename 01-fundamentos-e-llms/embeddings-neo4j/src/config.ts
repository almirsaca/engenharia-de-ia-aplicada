import type { DataType, PretrainedModelOptions } from "@huggingface/transformers";

export interface TextSplitterConfig {
    chunkSize: number;
    chunkOverlap: number;
}

export interface PdfSource {
    path: string;
    /** Intervalo [primeira, última] de páginas a indexar. Omitido = documento inteiro. */
    pages?: readonly [number, number];
}

export const CONFIG = Object.freeze({
    neo4j: {
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
        indexName: "trechos_index",
        searchType: "vector" as const,
        textNodeProperties: ["text"],
        nodeLabel: "Trecho",
        // Sem esta query o driver monta um retrievalQuery padrao que concatena
        // o nome da propriedade ao valor, devolvendo "text: <conteudo>".
        // Aqui devolvemos o texto limpo e a metadata sem os campos internos.
        retrievalQuery: `
        RETURN node.text AS text,
               node { .*, embedding: Null, id: Null, text: Null } AS metadata,
               score
        `,
    },
    openRouter: {
        nlpModel: process.env.NLP_MODEL,
        url: "https://openrouter.ai/api/v1",
        // A chave vive na variável de ambiente da máquina `OpenRouter__ApiKey`,
        // fora do .env. O `--env-file` do Node não expande `${VAR}`, então a
        // referência precisa ser feita aqui. OPENROUTER_API_KEY continua
        // aceita como alternativa, para quem preferir defini-la no .env.
        apiKey: process.env.OpenRouter__ApiKey ?? process.env.OPENROUTER_API_KEY,
        temperature: 0.3,
        maxRetries: 2,
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
            "X-Title": process.env.OPENROUTER_SITE_NAME,
        }
    },
    pdf: {
        paths: [
            /* { path: "./docs/ia/tensores.pdf" }, */
            { path: "./docs/titanic/O Caso Titanic.pdf" },
            { path: "./docs/titanic/Titanic - A Projeção Do Transatlântico.pdf" },
            { path: "./docs/titanic/surviving-the-titanic-disaster-economic-natural-andsocial-determinants.pdf" },
            { path: "./docs/titanic/Titpaper.pdf" },
            // O capítulo "Hitler's Titanic" (p.25-31) trata do naufrágio do Wilhelm
            // Gustloff, não do Titanic. Remova o `pages` para indexar o e-book
            // inteiro e observar o efeito de um distrator no acervo.
            { path: "./docs/titanic/Titanic-eBook.pdf", pages: [1, 24] as const },
        ] satisfies PdfSource[],
    },
    textSplitter: {
        chunkSize: 1000,
        chunkOverlap: 200,
    },
    // Reconstitui parágrafos antes de dividir. O texto que sai do PDF tem uma
    // quebra por linha impressa, sem `\n\n`, então o splitter nunca encontra
    // fronteira de parágrafo e corta frases ao meio. Ver src/textNormalizer.ts.
    normalizacao: {
        ativa: true,
    },
    embedding: {
        modelName: process.env.EMBEDDING_MODEL!,
        pretrainedOptions: {
            dtype: "fp32" as DataType, // Options: 'fp32' (best quality), 'fp16' (faster), 'q8', 'q4', 'q4f16' (quantized)
        } satisfies PretrainedModelOptions,
    },
    indexing: {
        // Quantidade de chunks enviados por chamada ao Neo4j.
        batchSize: 50,
    },
    similarity: {
        topK: 3,
    },
});
