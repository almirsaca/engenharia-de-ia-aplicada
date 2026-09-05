import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { CONFIG } from "./config.ts";
import { DocumentProcessor } from "../documentProcessor.ts";
import { type PretrainedOptions } from "@huggingface/transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { displayResults } from "./util.ts";
import { SEM_LIMITE, SEPARADOR } from "../../compartilhado/formatacao.ts";
import { CATALOGO, MENU_IDIOMA, interpretarIdioma, type Idioma } from "../../compartilhado/idiomas.ts";
import { reordenar } from "../../compartilhado/reranking.ts";
import { Progresso, comEtapa } from "../../compartilhado/progresso.ts";
import { criarLlm, perguntar } from "./llm.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ChatOpenAI } from "@langchain/openai";
import { AI } from "./ai.ts";
import type { Document } from "@langchain/core/documents";

let _neo4jVectorStore = null
let questionPrompt: ReturnType<typeof createInterface> | null = null
let msg = CATALOGO["pt"]

function definirIdioma(novo: Idioma): void {
    msg = CATALOGO[novo]
}

/** Arquivo e página de cada trecho que embasou a resposta, sem repetir páginas. */
function fontesDe(resultados: [Document, number][]): string {
    const unicas = new Set(
        resultados.map(([doc]) =>
            `${doc.metadata.fileName ?? "?"} p.${doc.metadata.pageNumber ?? "?"}`),
    )
    return [...unicas].join("  |  ")
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

    // Só existe com o reranking ligado. Nulo mantém o laboratório inteiramente
    // local, que é o seu propósito: indexar e buscar sem nenhuma chave de API.
    const llm = CONFIG.reranking.ativo ? criarLlm() : null
    if (CONFIG.reranking.ativo && !llm) console.log(msg.semChave)

    const documentProcessor = new DocumentProcessor(
        CONFIG.pdf.paths,
        CONFIG.textSplitter,
        CONFIG.normalizacao.ativa,
        msg,
    )
    const documents = await documentProcessor.loadAndSplit()
    const embeddings = new HuggingFaceTransformersEmbeddings({
        model: CONFIG.embedding.modelName,
        pretrainedOptions: CONFIG.embedding.pretrainedOptions as PretrainedOptions
    })

    const nlpModel = new ChatOpenAI({
        temperature: CONFIG.openRouter.temperature,
        maxRetries: CONFIG.openRouter.maxRetries,
        modelName: CONFIG.openRouter.nlpModel,
        openAIApiKey: CONFIG.openRouter.apiKey,
        configuration: {
            baseURL: CONFIG.openRouter.url,
            defaultHeaders: CONFIG.openRouter.defaultHeaders
        }

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

    // Criado uma vez, fora do laço: só guarda configuração, não estado por
    // pergunta. Instanciar a cada pergunta desperdiçaria trabalho.
    const ai = new AI({
        nlpModel,
        debugLog: () => { },   // a impressão fica com o index.ts, no formato do laboratório
        vectorStore: _neo4jVectorStore,
        promptConfig: CONFIG.promptConfig,
        templateText: CONFIG.templateText,
        topK: CONFIG.similarity.topK,
    })

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

        // Nada é impresso enquanto processa: a barra ocupa a linha e a saída
        // sai inteira e na ordem certa no final — resposta primeiro, trechos
        // depois, para quem só quer a resposta não precisar rolar a tela.
        const progresso = new Progresso(llm ? 3 : 2)
        let results: [Document, number][]
        let result: Awaited<ReturnType<typeof ai.answerQuestion>>

        try {
            // Recupera muitos candidatos e exibe poucos: o ganho está em dar ao
            // índice aproximado um feixe de busca mais largo, não em mostrar mais.
            const candidatos: [Document, number][] = await comEtapa(
                progresso, msg.etapaBuscando,
                () => _neo4jVectorStore!.similaritySearchWithScore(question, CONFIG.similarity.topK))

            results = llm
                ? (await comEtapa(progresso, msg.etapaReordenando, () => reordenar(
                    p => perguntar(llm!, p), question, candidatos,
                    ([doc]) => doc.pageContent,
                    CONFIG.similarity.topKExibicao,
                    CONFIG.reranking.limiteTrechoNoPrompt,
                ))).escolhidos
                : candidatos.slice(0, CONFIG.similarity.topKExibicao)

            // Entrega o contexto já recuperado e reordenado. Sem isso a classe
            // AI faria a própria busca vetorial: trabalho repetido, e a
            // reordenação acima seria descartada.
            const contexto = results
                .map(([doc]) => doc.pageContent)
                .join("\n\n---\n\n")

            result = await comEtapa(progresso, msg.etapaRedigindo, () =>
                ai.answerQuestion(question, contexto))
        } catch (erro) {
            progresso.encerrar()
            console.error(`\n❌ ${erro instanceof Error ? erro.message : erro}\n`)
            continue
        } finally {
            progresso.encerrar()
        }

        if (result.error) {
            console.log(`\n❌ ${result.error}\n`)
            continue
        }

        console.log(`\n💬 ${msg.embeddings.resposta}\n`)
        console.log(result.answer)
        console.log(`\n📚 ${msg.embeddings.fontes}: ${fontesDe(results)}`)

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
