/**
 * Catálogo de mensagens e escolha de idioma.
 *
 * O idioma afeta apenas a **saída**: o rótulo da interface e a língua em que a
 * LLM redige a resposta. A recuperação continua percorrendo todo o acervo, em
 * português e em inglês — o modelo de embeddings é multilíngue, e restringir a
 * busca por idioma jogaria fora metade das fontes.
 */

export type Idioma = "pt" | "en";

export interface Mensagens {
    nome: string;
    /** Instrução acrescentada ao prompt da LLM para fixar a língua da resposta. */
    instrucaoResposta: string;

    titulo: string;
    grafoCarregado: (n: number) => string;
    grafoVazio: string;
    modelo: (m: string) => string;
    chave: (fp: string) => string;
    log: (arq: string) => string;
    semChave: string;
    instrucoes: string;
    prompt: string;

    rotaGrafo: string;
    rotaDocumentos: string;
    rotaPrefixo: string;
    cypherGerado: string;
    similaridade: string;
    pagina: string;
    semContexto: string;
    modoSemLlm: string;
    dicaAnalises: string;
    encerrando: string;

    etapaClassificando: string;
    etapaCypher: string;
    etapaConsultando: string;
    etapaBuscando: string;
    etapaRedigindo: string;

    chaveRecusada: (msg: string) => string;
    prazoExcedido: (s: number) => string;
    registrado: (id: string) => string;
}

const PT: Mensagens = {
    nome: "Português",
    instrucaoResposta:
        "Responda em português do Brasil, mesmo que os trechos estejam em inglês.",

    titulo: "🚢 RAG híbrido sobre o Titanic — grafo de passageiros + documentos",
    grafoCarregado: n => `✅ Grafo carregado: ${n} passageiros`,
    grafoVazio: "Grafo vazio. Carregando o dataset...",
    modelo: m => `🤖 Modelo para roteamento e resposta: ${m}`,
    chave: fp => `🔑 Chave OpenRouter: ${fp}`,
    log: arq => `📝 Log das interações: ${arq}  (ver com: npm run log -- <id>)`,
    semChave: "⚠️  OPENROUTER_API_KEY ausente — modo sem LLM.",
    instrucoes: "Digite uma pergunta, 'analises' para as consultas prontas, 'idioma' para trocar, ou 'sair'.",
    prompt: "❓ Pergunta: ",

    rotaGrafo: "GRAFO (Cypher)",
    rotaDocumentos: "DOCUMENTOS (busca vetorial)",
    rotaPrefixo: "🧭 Rota",
    cypherGerado: "🔍 Cypher gerado",
    similaridade: "de similaridade",
    pagina: "página",
    semContexto: "⚠️  Nenhum contexto encontrado.",
    modoSemLlm: "🧭 Modo sem LLM: busca vetorial nos documentos.",
    dicaAnalises: "   (para perguntas sobre os passageiros, use o comando 'analises')",
    encerrando: "👋 Encerrando...",

    etapaClassificando: "classificando a pergunta",
    etapaCypher: "gerando a consulta Cypher",
    etapaConsultando: "consultando o grafo",
    etapaBuscando: "buscando nos documentos",
    etapaRedigindo: "redigindo a resposta",

    chaveRecusada: msg => `❌ O OpenRouter recusou a chave: ${msg}`,
    prazoExcedido: s => `   A etapa passou de ${s}s e foi abortada.`,
    registrado: id => `   Interação registrada como ${id} — veja com: npm run log -- ${id}`,
};

const EN: Mensagens = {
    nome: "English",
    instrucaoResposta:
        "Answer in English, even when the excerpts are in Portuguese.",

    titulo: "🚢 Hybrid RAG on the Titanic — passenger graph + documents",
    grafoCarregado: n => `✅ Graph loaded: ${n} passengers`,
    grafoVazio: "Empty graph. Loading the dataset...",
    modelo: m => `🤖 Model for routing and answering: ${m}`,
    chave: fp => `🔑 OpenRouter key: ${fp}`,
    log: arq => `📝 Interaction log: ${arq}  (view with: npm run log -- <id>)`,
    semChave: "⚠️  OPENROUTER_API_KEY missing — running without an LLM.",
    instrucoes: "Type a question, 'analises' for the ready-made queries, 'idioma' to switch language, or 'sair' to quit.",
    prompt: "❓ Question: ",

    rotaGrafo: "GRAPH (Cypher)",
    rotaDocumentos: "DOCUMENTS (vector search)",
    rotaPrefixo: "🧭 Route",
    cypherGerado: "🔍 Generated Cypher",
    similaridade: "similarity",
    pagina: "page",
    semContexto: "⚠️  No context found.",
    modoSemLlm: "🧭 No-LLM mode: vector search over the documents.",
    dicaAnalises: "   (for passenger questions, use the 'analises' command)",
    encerrando: "👋 Shutting down...",

    etapaClassificando: "classifying the question",
    etapaCypher: "generating the Cypher query",
    etapaConsultando: "querying the graph",
    etapaBuscando: "searching the documents",
    etapaRedigindo: "composing the answer",

    chaveRecusada: msg => `❌ OpenRouter rejected the key: ${msg}`,
    prazoExcedido: s => `   The step exceeded ${s}s and was aborted.`,
    registrado: id => `   Interaction logged as ${id} — view with: npm run log -- ${id}`,
};

export const CATALOGO: Record<Idioma, Mensagens> = { pt: PT, en: EN };

/** Menu inicial, bilíngue por definição: o idioma ainda não foi escolhido. */
export const MENU_IDIOMA = [
    "🌐 Idioma / Language",
    "   1) Português",
    "   2) English",
].join("\n");

/** Interpreta a escolha do menu. Entrada vazia ou inválida mantém o padrão. */
export function interpretarIdioma(entrada: string, padrao: Idioma = "pt"): Idioma {
    const v = entrada.trim().toLowerCase();
    if (v === "2" || v.startsWith("en") || v.startsWith("ing")) return "en";
    if (v === "1" || v.startsWith("pt") || v.startsWith("por")) return "pt";
    return padrao;
}
