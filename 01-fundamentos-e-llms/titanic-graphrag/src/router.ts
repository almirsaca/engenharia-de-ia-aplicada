import { ChatOpenAI } from "@langchain/openai";
import { CONFIG, GRAPH_SCHEMA } from "./config.ts";

export type Rota = "grafo" | "documentos";

export function criarLlm(): ChatOpenAI | null {
    if (!CONFIG.openRouter.apiKey) return null;

    return new ChatOpenAI({
        model: CONFIG.openRouter.model,
        apiKey: CONFIG.openRouter.apiKey,
        temperature: CONFIG.openRouter.temperature,
        maxRetries: CONFIG.openRouter.maxRetries,
        configuration: {
            baseURL: CONFIG.openRouter.baseURL,
            defaultHeaders: CONFIG.openRouter.defaultHeaders,
        },
    });
}

async function perguntar(llm: ChatOpenAI, prompt: string): Promise<string> {
    const resposta = await llm.invoke(prompt);
    return String(resposta.content).trim();
}

const PROMPT_ROTA = `Classifique a pergunta do usuário sobre o Titanic em UMA palavra:

"grafo"       — se depende de dados tabulares dos 891 passageiros: contagens,
                médias, taxas de sobrevivência, filtros por classe, sexo, idade,
                tarifa, cabine ou porto de embarque.
"documentos"  — se é sobre história, causas, narrativa, decisões, o naufrágio em
                si, ou qualquer coisa que se responde com texto corrido.

Responda apenas com a palavra, sem pontuação nem explicação.

Pergunta: {pergunta}`;

export async function classificar(llm: ChatOpenAI, pergunta: string): Promise<Rota> {
    const bruto = (await perguntar(llm, PROMPT_ROTA.replace("{pergunta}", pergunta))).toLowerCase();
    // Na dúvida, cai para os documentos: uma busca vetorial inútil é mais
    // barata que um Cypher inventado sobre dados que não existem.
    return bruto.includes("grafo") ? "grafo" : "documentos";
}

const PROMPT_CYPHER = `Você escreve consultas Cypher para o Neo4j.

Esquema do grafo:
{schema}

Regras:
- Devolva SOMENTE a consulta, sem markdown, sem comentários, sem explicação.
- Use apenas leitura: MATCH, WHERE, WITH, RETURN, ORDER BY, LIMIT.
- Nunca use CREATE, MERGE, SET, DELETE, REMOVE, DROP, LOAD CSV ou CALL.
- Dê apelidos legíveis às colunas (AS total, AS taxa, ...).
- Limite a no máximo 25 linhas de resultado.

Pergunta: {pergunta}`;

export async function gerarCypher(llm: ChatOpenAI, pergunta: string): Promise<string> {
    const bruto = await perguntar(
        llm,
        PROMPT_CYPHER.replace("{schema}", GRAPH_SCHEMA).replace("{pergunta}", pergunta),
    );
    // Modelos costumam devolver a consulta dentro de uma cerca ```cypher.
    return bruto.replace(/```(?:cypher)?/gi, "").trim();
}

const PROIBIDOS = /\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\s+CSV|CALL|FOREACH|USING\s+PERIODIC)\b/i;

// A LLM é instruída a gerar apenas leitura, mas instrução não é garantia:
// esta checagem é o que de fato impede uma escrita no banco.
export function validarCypher(cypher: string): void {
    if (!cypher) throw new Error("A LLM não devolveu nenhuma consulta.");

    const proibido = cypher.match(PROIBIDOS);
    if (proibido) throw new Error(`Consulta rejeitada: contém "${proibido[0]}", que não é operação de leitura.`);

    if (!/^\s*(MATCH|WITH|UNWIND|RETURN|PROFILE\s+MATCH|EXPLAIN\s+MATCH)\b/i.test(cypher)) {
        throw new Error("Consulta rejeitada: não começa por MATCH, WITH, UNWIND ou RETURN.");
    }
}

const PROMPT_RESPOSTA = `Você é um assistente especializado no caso Titanic.
Responda à pergunta usando SOMENTE o contexto abaixo.
Se o contexto não contiver a resposta, diga que não encontrou a informação.
Se as fontes divergirem entre si, apresente as versões e suas origens em vez de
escolher uma. Seja conciso e responda em português.

CONTEXTO:
{contexto}

PERGUNTA: {pergunta}`;

export async function responder(llm: ChatOpenAI, pergunta: string, contexto: string): Promise<string> {
    return perguntar(
        llm,
        PROMPT_RESPOSTA.replace("{contexto}", contexto).replace("{pergunta}", pergunta),
    );
}
