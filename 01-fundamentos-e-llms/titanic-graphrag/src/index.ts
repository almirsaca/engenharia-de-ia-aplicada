import neo4j from "neo4j-driver";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import type { PretrainedOptions } from "@huggingface/transformers";
import type { Document } from "@langchain/core/documents";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { CONFIG } from "./config.ts";
import { carregarGrafo, contarPassageiros } from "./loadGraph.ts";
import { executar, imprimirTabela, rodarAnalises } from "./analises.ts";
import { classificar, criarLlm, gerarCypher, responder, validarCypher } from "./router.ts";
import { medir, novoRegistro, salvar, ARQUIVO_LOG } from "./log.ts";

const driver = neo4j.driver(
    CONFIG.neo4j.uri,
    neo4j.auth.basic(CONFIG.neo4j.username, CONFIG.neo4j.password),
);

let vectorStore: Neo4jVectorStore | null = null;
let prompt: ReturnType<typeof createInterface> | null = null;

async function buscarNosDocumentos(pergunta: string): Promise<[Document, number][]> {
    if (!vectorStore) {
        const embeddings = new HuggingFaceTransformersEmbeddings({
            model: CONFIG.embedding.modelName,
            pretrainedOptions: CONFIG.embedding.pretrainedOptions as PretrainedOptions,
        });
        vectorStore = await Neo4jVectorStore.fromExistingGraph(embeddings, CONFIG.vector);
    }
    return vectorStore.similaritySearchWithScore(pergunta, CONFIG.similarity.topK);
}

function origemDe(doc: Document): string {
    return `${doc.metadata.fileName ?? "documento"}, página ${doc.metadata.pageNumber ?? "?"}`;
}

function exibirTrechos(resultados: [Document, number][]): void {
    for (const [doc, score] of resultados) {
        console.log(`\n   📄 ${origemDe(doc)} — ${(score * 100).toFixed(1)}% de similaridade`);
        console.log(`      ${doc.pageContent.replace(/\s+/g, " ").trim().slice(0, 300)}...`);
    }
}

function ehErroDeAutenticacao(erro: unknown): boolean {
    const texto = erro instanceof Error ? erro.message : String(erro);
    return /401|authentication|user not found|invalid api key|api key expired/i.test(texto);
}

try {
    console.log("🚢 RAG híbrido sobre o Titanic — grafo de passageiros + documentos\n");

    const jaCarregados = await contarPassageiros(driver);
    if (jaCarregados === 0) {
        console.log("Grafo vazio. Carregando o dataset...");
        await carregarGrafo(driver);
    } else {
        console.log(`✅ Grafo carregado: ${jaCarregados} passageiros`);
    }

    let llm = criarLlm();
    if (llm) {
        console.log(`🤖 Modelo para roteamento e resposta: ${CONFIG.openRouter.model}`);
    } else {
        console.log("⚠️  OPENROUTER_API_KEY ausente — modo sem LLM.");
    }

    console.log(`📝 Log das interações: ${ARQUIVO_LOG}  (ver com: npm run log -- <id>)`);
    console.log("\nDigite uma pergunta, 'analises' para as consultas prontas, ou 'sair'.\n");

    prompt = createInterface({ input, output });
    let entradaFechada = false;
    prompt.on("close", () => { entradaFechada = true });

    while (!entradaFechada) {
        const resposta = await prompt.question("❓ Pergunta: ");
        if (entradaFechada) break;

        const pergunta = resposta.trim();
        if (pergunta.toLowerCase() === "sair") break;
        if (!pergunta) continue;

        if (pergunta.toLowerCase() === "analises") {
            await rodarAnalises(driver);
            console.log();
            continue;
        }

        console.log(`\n${"=".repeat(80)}`);

        const registro = novoRegistro(pergunta, CONFIG.openRouter.model);
        console.log(`🆔 ${registro.id}`);

        if (llm) {
            try {
                const { rota, bruto } = await medir(
                    registro, "classificacao",
                    () => classificar(llm!, pergunta),
                    v => ({ bruto: v.bruto, resultado: v.rota }),
                );
                registro.rota = rota;
                console.log(`🧭 Rota: ${rota === "grafo" ? "GRAFO (Cypher)" : "DOCUMENTOS (busca vetorial)"}`);
                if (bruto.trim().toLowerCase() !== rota) {
                    console.log(`   (a LLM respondeu: ${JSON.stringify(bruto.slice(0, 120))})`);
                }

                let contexto: string;
                if (rota === "grafo") {
                    const { cypher } = await medir(
                        registro, "cypher",
                        () => gerarCypher(llm!, pergunta),
                        v => ({ bruto: v.bruto, resultado: v.cypher }),
                    );
                    validarCypher(cypher);
                    console.log(`\n🔍 Cypher gerado:\n${cypher.split("\n").map(l => "      " + l.trim()).join("\n")}\n`);

                    const linhas = await medir(
                        registro, "consulta",
                        () => executar(driver, cypher),
                        v => ({ resultado: v }),
                    );
                    imprimirTabela(linhas);
                    // Sem dizer de onde vem o resultado, a LLM trata o JSON como
                    // dado solto e responde que o contexto é insuficiente.
                    contexto = [
                        "Resultado de uma consulta ao banco de dados de passageiros do Titanic",
                        "(891 registros do conjunto de treino da competição do Kaggle).",
                        "",
                        `Consulta executada:\n${cypher}`,
                        "",
                        `Resultado:\n${JSON.stringify(linhas)}`,
                    ].join("\n");
                } else {
                    const resultados = await medir(
                        registro, "busca",
                        () => buscarNosDocumentos(pergunta),
                        v => ({ resultado: v.map(([doc, score]) => ({ origem: origemDe(doc), score })) }),
                    );
                    exibirTrechos(resultados);
                    contexto = resultados
                        .map(([doc]) => `[${origemDe(doc)}]\n${doc.pageContent.replace(/\s+/g, " ").trim()}`)
                        .join("\n\n");
                }

                registro.etapas["contexto"] = { ms: 0, resultado: contexto };

                const texto = await medir(
                    registro, "resposta",
                    () => responder(llm!, pergunta, contexto),
                    v => ({ bruto: v }),
                );
                registro.resposta = texto;
                console.log(`\n💬 ${texto}\n`);
                await salvar(registro);
                continue;
            } catch (erro) {
                registro.erro = erro instanceof Error ? erro.message : String(erro);
                await salvar(registro);
                if (ehErroDeAutenticacao(erro)) {
                    console.error(`\n❌ O OpenRouter recusou a chave: ${erro instanceof Error ? erro.message : erro}`);
                    console.error("   Gere uma nova em https://openrouter.ai/keys e atualize a variável");
                    console.error("   de ambiente OpenRouter__ApiKey (ou OPENROUTER_API_KEY no .env).");
                    console.error("   Seguindo em modo sem LLM nesta sessão.\n");
                    llm = null;
                } else {
                    console.error(`\n❌ ${erro instanceof Error ? erro.message : erro}\n`);
                    continue;
                }
            }
        }

        // Modo sem LLM: sem roteamento nem resposta gerada, mas a busca vetorial
        // roda localmente e as análises do grafo continuam disponíveis.
        console.log("🧭 Modo sem LLM: busca vetorial nos documentos.");
        console.log("   (para perguntas sobre os passageiros, use o comando 'analises')");
        registro.rota = "documentos";
        const semLlm = await medir(
            registro, "busca",
            () => buscarNosDocumentos(pergunta),
            v => ({ resultado: v.map(([doc, score]) => ({ origem: origemDe(doc), score })) }),
        );
        exibirTrechos(semLlm);
        await salvar(registro);
        console.log();
    }

    console.log("\n👋 Encerrando...");
} catch (erro) {
    console.error("error", erro);
} finally {
    prompt?.close();
    await vectorStore?.close();
    await driver.close();
}
