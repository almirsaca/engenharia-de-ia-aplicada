import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { CONFIG } from "./config.ts";
import { DocumentProcessor } from "../documentProcessor.ts";
import { type PretrainedOptions } from "@huggingface/transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { displayResults } from "./util.ts";
import { SEM_LIMITE, SEPARADOR } from "../../compartilhado/formatacao.ts";
import { CATALOGO, MENU_IDIOMA, interpretarIdioma, type Idioma } from "../../compartilhado/idiomas.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let _neo4jVectorStore = null
let questionPrompt: ReturnType<typeof createInterface> | null = null
let msg = CATALOGO["pt"]

function definirIdioma(novo: Idioma): void {
    msg = CATALOGO[novo]
}

async function clearAll(vectorStore: Neo4jVectorStore, nodeLabel: string): Promise<void> {
    console.log(msg.embeddings.removendo);
    await vectorStore.query(
        `MATCH (n:\`${nodeLabel}\`) DETACH DELETE n`
    )
    console.log(`${msg.embeddings.removidos}\n`);
}


try {
    questionPrompt = createInterface({ input, output })
    let entradaFechada = false
    questionPrompt.on("close", () => { entradaFechada = true })

    // O menu precede a indexação: ela demora dezenas de segundos, e não faria
    // sentido acompanhá-la num idioma para depois escolher outro.
    console.log(MENU_IDIOMA);
    definirIdioma(interpretarIdioma(await questionPrompt.question("   [1] "), "pt"))

    console.log(`\n${msg.embeddings.titulo}\n`);

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
        console.log(msg.embeddings.indexados(i + lote.length, documents.length));
    }
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
    console.log(`\n${msg.embeddings.populada(segundos)}\n`);


    // ==================== STEP 2: INTERACTIVE SIMILARITY SEARCH ====================
    console.log(msg.embeddings.etapaBusca);
    console.log(`${msg.embeddings.instrucoes}\n`);

    while (!entradaFechada) {
        console.log(SEPARADOR)
        const resposta = await questionPrompt.question(msg.prompt)
        if (entradaFechada) break

        const question = resposta.trim()

        if (question.toLowerCase() === "sair") {
            console.log(`\n${msg.embeddings.encerrandoBusca}`);
            break
        }

        if (["idioma", "language"].includes(question.toLowerCase())) {
            console.log(MENU_IDIOMA);
            definirIdioma(interpretarIdioma(await questionPrompt.question("   [1] ")))
            console.log(`\n${msg.embeddings.instrucoes}\n`);
            continue
        }

        if (!question) {
            console.log(`${msg.embeddings.perguntaInvalida}\n`);
            continue
        }

        const results = await _neo4jVectorStore.similaritySearchWithScore(
            question,
            CONFIG.similarity.topK
        )
        displayResults(results, SEM_LIMITE, msg)
    }


    // Cleanup
    console.log(`\n${SEPARADOR}`);
    console.log(`${msg.embeddings.concluido}\n`);

} catch (error) {
    console.error('error', error)
} finally {
    questionPrompt?.close()
    await _neo4jVectorStore?.close();
}
