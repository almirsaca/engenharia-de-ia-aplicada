import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { CONFIG } from "./config.ts";
import { DocumentProcessor } from "../documentProcessor.ts";
import { type PretrainedOptions } from "@huggingface/transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { displayResults } from "./util.ts";
import { SEM_LIMITE, SEPARADOR } from "../../compartilhado/formatacao.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let _neo4jVectorStore = null
let questionPrompt: ReturnType<typeof createInterface> | null = null

async function clearAll(vectorStore: Neo4jVectorStore, nodeLabel: string): Promise<void> {
    console.log("🗑️  Removendo todos os documentos existentes...");
    await vectorStore.query(
        `MATCH (n:\`${nodeLabel}\`) DETACH DELETE n`
    )
    console.log("✅ Documentos removidos com sucesso\n");
}


try {
    console.log("🚀 Inicializando sistema de Embeddings com Neo4j...\n");

    const documentProcessor = new DocumentProcessor(
        CONFIG.pdf.paths,
        CONFIG.textSplitter,
        CONFIG.normalizacao.ativa,
    )
    const documents = await documentProcessor.loadAndSplit()
    const embeddings = new HuggingFaceTransformersEmbeddings({
        model: CONFIG.embedding.modelName,
        pretrainedOptions: CONFIG.embedding.pretrainedOptions as PretrainedOptions
    })
    // const response = await embeddings.embedQuery(
    //     "JavaScript"
    // )
    // const response = await embeddings.embedDocuments([
    //     "JavaScript"
    // ])
    // console.log('response', response)

    _neo4jVectorStore = await Neo4jVectorStore.fromExistingGraph(
        embeddings,
        CONFIG.neo4j
    )

    await clearAll(_neo4jVectorStore, CONFIG.neo4j.nodeLabel)

    const inicio = Date.now()
    const { batchSize } = CONFIG.indexing
    for (let i = 0; i < documents.length; i += batchSize) {
        const lote = documents.slice(i, i + batchSize)
        await _neo4jVectorStore.addDocuments(lote)
        console.log(`✅ Indexados ${i + lote.length}/${documents.length} chunks`);
    }
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    console.log(`\n✅ Base de dados populada em ${segundos}s!\n`);


    // ==================== STEP 2: INTERACTIVE SIMILARITY SEARCH ====================
    console.log("🔍 ETAPA 2: Busca interativa por similaridade");
    console.log("Digite uma pergunta ou 'sair' para encerrar.\n");

    questionPrompt = createInterface({ input, output })

    // Ctrl+D ou entrada redirecionada fecham o stdin; chamar question()
    // depois disso lanca ERR_USE_AFTER_CLOSE.
    let entradaFechada = false
    questionPrompt.on("close", () => { entradaFechada = true })

    while (!entradaFechada) {
        console.log(SEPARADOR)
        const resposta = await questionPrompt.question("❓ Pergunta: ")
        if (entradaFechada) break

        const question = resposta.trim()

        if (question.toLowerCase() === "sair") {
            console.log("\n👋 Encerrando a busca...");
            break
        }

        if (!question) {
            console.log("⚠️  Digite uma pergunta válida.\n");
            continue
        }

        const results = await _neo4jVectorStore.similaritySearchWithScore(
            question,
            CONFIG.similarity.topK
        )
        displayResults(results, SEM_LIMITE)
    }


    // Cleanup
    console.log(`\n${SEPARADOR}`);
    console.log("✅ Processamento concluído com sucesso!\n");

} catch (error) {
    console.error('error', error)
} finally {
    questionPrompt?.close()
    await _neo4jVectorStore?.close();
}
