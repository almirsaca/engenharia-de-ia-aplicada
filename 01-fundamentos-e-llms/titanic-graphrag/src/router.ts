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
        timeout: CONFIG.openRouter.timeoutMs,
        configuration: {
            baseURL: CONFIG.openRouter.baseURL,
            defaultHeaders: CONFIG.openRouter.defaultHeaders,
        },
    });
}

async function perguntar(llm: ChatOpenAI, prompt: string): Promise<string> {
    // O sinal cobre o passo inteiro e aborta a requisição de verdade, incluindo
    // as retentativas internas do SDK — o `timeout` do cliente limita apenas
    // cada tentativa isolada.
    const resposta = await llm.invoke(prompt, {
        signal: AbortSignal.timeout(CONFIG.openRouter.prazoTotalMs),
    });
    const texto = String(resposta.content ?? "").trim();

    // Modelos de raciocínio gastam tokens "pensando" e devolvem content vazio
    // quando esgotam o orçamento antes de concluir. Sem esta checagem, o vazio
    // seguiria adiante e viraria uma rota errada ou um Cypher inválido.
    if (!texto) {
        const motivo = resposta.response_metadata?.finish_reason ?? "desconhecido";
        throw new Error(
            `A LLM devolveu conteúdo vazio (finish_reason: ${motivo}). ` +
            "Modelos de raciocínio precisam de orçamento de tokens suficiente para concluir.",
        );
    }
    return texto;
}

const PROMPT_ROTA = `Classifique a pergunta do usuário sobre o Titanic em UMA palavra:

"grafo"       — se depende de dados tabulares dos 891 passageiros: contagens,
                médias, taxas de sobrevivência, filtros por classe, sexo, idade,
                tarifa, cabine ou porto de embarque.
"documentos"  — se é sobre história, causas, narrativa, decisões, o naufrágio em
                si, ou qualquer coisa que se responde com texto corrido.

Responda apenas com a palavra, sem pontuação nem explicação.

Pergunta: {pergunta}`;

export async function classificar(llm: ChatOpenAI, pergunta: string): Promise<{ rota: Rota; bruto: string }> {
    const bruto = await perguntar(llm, PROMPT_ROTA.replace("{pergunta}", pergunta));

    // Compara com a última palavra, não com o texto inteiro: modelos de
    // raciocínio às vezes explicam antes de concluir, e uma frase como
    // "não é grafo, são documentos" contém as duas palavras.
    const limpo = bruto.toLowerCase().replace(/[^a-zá-ú\s]/g, " ").trim();
    const ultima = limpo.split(/\s+/).filter(p => p === "grafo" || p === "documentos").at(-1);

    // Na dúvida, cai para os documentos: uma busca vetorial inútil é mais
    // barata que um Cypher inventado sobre dados que não existem.
    return { rota: ultima === "grafo" ? "grafo" : "documentos", bruto };
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

export async function gerarCypher(llm: ChatOpenAI, pergunta: string): Promise<{ cypher: string; bruto: string }> {
    const bruto = await perguntar(
        llm,
        PROMPT_CYPHER.replace("{schema}", GRAPH_SCHEMA).replace("{pergunta}", pergunta),
    );
    // Modelos costumam devolver a consulta dentro de uma cerca ```cypher.
    return { cypher: bruto.replace(/```(?:cypher)?/gi, "").trim(), bruto };
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
escolher uma. Seja conciso.

{idioma}

CONTEXTO:
{contexto}

PERGUNTA: {pergunta}`;

/**
 * O acervo é bilíngue e a recuperação não filtra por idioma, então o contexto
 * pode chegar em inglês mesmo com a pergunta em português. A instrução fixa a
 * língua da resposta independentemente da língua das fontes.
 */
export async function responder(
    llm: ChatOpenAI,
    pergunta: string,
    contexto: string,
    instrucaoIdioma: string,
): Promise<string> {
    return perguntar(
        llm,
        PROMPT_RESPOSTA
            .replace("{idioma}", instrucaoIdioma)
            .replace("{contexto}", contexto)
            .replace("{pergunta}", pergunta),
    );
}
