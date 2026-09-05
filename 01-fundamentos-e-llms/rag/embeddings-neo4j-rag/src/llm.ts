import { ChatOpenAI } from "@langchain/openai";
import { CONFIG } from "./config.ts";

/**
 * Cliente de LLM, usado apenas pelo reranking opcional.
 *
 * Este laboratório funciona **sem nenhuma chave de API** — a indexação e a busca
 * vetorial são inteiramente locais. A LLM entra só quando
 * `CONFIG.reranking.ativo` é ligado, para comparar a ordenação por proximidade
 * com uma ordenação por relevância.
 *
 * Devolve `null` sem chave, para que a ausência degrade em vez de quebrar.
 */
export function criarLlm(): ChatOpenAI | null {
    if (!CONFIG.openRouter.apiKey) return null;

    return new ChatOpenAI({
        model: CONFIG.openRouter.nlpModel,
        apiKey: CONFIG.openRouter.apiKey,
        temperature: CONFIG.openRouter.temperature,
        maxRetries: CONFIG.openRouter.maxRetries,
        timeout: CONFIG.openRouter.timeoutMs,
        configuration: {
            baseURL: CONFIG.openRouter.url,
            defaultHeaders: CONFIG.openRouter.defaultHeaders,
        },
    });
}

export async function perguntar(llm: ChatOpenAI, prompt: string): Promise<string> {
    // O sinal cobre o passo inteiro e aborta a requisição de verdade, incluindo
    // as retentativas internas do SDK, que reiniciam o `timeout` do cliente.
    const resposta = await llm.invoke(prompt, {
        signal: AbortSignal.timeout(CONFIG.openRouter.prazoTotalMs),
    });
    const texto = String(resposta.content ?? "").trim();

    // Modelos de raciocínio devolvem content vazio quando esgotam o orçamento
    // de tokens antes de concluir. Sem esta checagem, o vazio seguiria adiante.
    if (!texto) {
        const motivo = resposta.response_metadata?.finish_reason ?? "desconhecido";
        throw new Error(`A LLM devolveu conteúdo vazio (finish_reason: ${motivo}).`);
    }
    return texto;
}
