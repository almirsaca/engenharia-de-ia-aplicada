import type { DataType, PretrainedModelOptions } from "@huggingface/transformers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface TextSplitterConfig {
    chunkSize: number;
    chunkOverlap: number;
}

/**
 * Resolve caminhos a partir da raiz do projeto, e não do diretório de onde a
 * aplicação foi chamada.
 *
 * Com caminhos relativos ao processo, executar de dentro de `src/` — como faz a
 * configuração genérica de debug do VS Code, que usa o diretório do arquivo
 * aberto — quebrava na leitura dos prompts, com `ENOENT src/prompts/...`.
 */
const RAIZ = resolve(import.meta.dirname, "..");
const daRaiz = (caminho: string) => resolve(RAIZ, caminho);

const promptsFiles = {
    answerPrompt: daRaiz("prompts/answerPrompt.json"),
    template: daRaiz("prompts/template.txt"),
};

export interface PdfSource {
    path: string;
    /** Intervalo [primeira, última] de páginas a indexar. Omitido = documento inteiro. */
    pages?: readonly [number, number];
}

export const CONFIG = Object.freeze({
    promptConfig: JSON.parse(readFileSync(promptsFiles.answerPrompt, 'utf-8')),
    templateText: readFileSync(promptsFiles.template, 'utf-8'),
    neo4j: {
        url: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USER!,
        password: process.env.NEO4J_PASSWORD!,
        indexName: "trechos_rag_index",
        searchType: "vector" as const,
        textNodeProperties: ["text"],
        nodeLabel: "TrechoRag",
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
        // Limite de cada tentativa isolada e do passo inteiro. Sem o segundo, o
        // tempo total seria (1 + maxRetries) × timeoutMs.
        timeoutMs: 45_000,
        prazoTotalMs: 60_000,
        temperature: 0.3,
        maxRetries: 2,
        defaultHeaders: {
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
            "X-Title": process.env.OPENROUTER_SITE_NAME,
        }
    },
    pdf: {
        paths: [
            /* { path: daRaiz("docs/ia/tensores.pdf") }, */
            { path: daRaiz("docs/titanic/O Caso Titanic.pdf") },
            { path: daRaiz("docs/titanic/Titanic - A Projeção Do Transatlântico.pdf") },
            { path: daRaiz("docs/titanic/surviving-the-titanic-disaster-economic-natural-andsocial-determinants.pdf") },
            { path: daRaiz("docs/titanic/Titpaper.pdf") },
            // O capítulo "Hitler's Titanic" (p.25-31) trata do naufrágio do Wilhelm
            // Gustloff, não do Titanic. Remova o `pages` para indexar o e-book
            // inteiro e observar o efeito de um distrator no acervo.
            { path: daRaiz("docs/titanic/Titanic-eBook.pdf"), pages: [1, 24] as const },
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
        // Candidatos pedidos ao índice. O índice vetorial do Neo4j é HNSW —
        // vizinhos mais próximos *aproximados* —, e com k pequeno o feixe de
        // busca é estreito demais: medimos trechos legitimamente entre os três
        // mais similares que só aparecem a partir de k=20. Buscar 20 custa o
        // mesmo que buscar 3 (66ms nos dois casos).
        topK: 20,
        // Quantos são de fato exibidos, dos candidatos recuperados.
        topKExibicao: 3,
    },

    // Reordena os candidatos pedindo à LLM que escolha os que respondem à
    // pergunta, antes de entregá-los para a geração da resposta.
    //
    // Desligado por padrão: acrescenta uma chamada de LLM por pergunta, além da
    // que redige a resposta. Ligue para comparar a ordenação por proximidade
    // com uma por relevância — a diferença aparece quando o trecho certo é
    // recuperado, mas não em primeiro lugar.
    reranking: {
        ativo: false,
        limiteTrechoNoPrompt: 300,
    },
});
