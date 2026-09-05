/**
 * Reordenação de candidatos usando uma LLM como juíza de relevância.
 *
 * A busca vetorial ordena por **proximidade**; isto reordena por **resposta**.
 * É o papel que um cross-encoder cumpriria — delegado à LLM por não haver, hoje,
 * um cross-encoder multilíngue utilizável com Transformers.js.
 *
 * O módulo não importa nada: quem chama passa a função que fala com a LLM. Isso
 * mantém a regra do diretório `compartilhado/` — os dois laboratórios têm
 * `node_modules` separados — e deixa a lógica testável sem rede.
 */

/** Recebe um prompt e devolve o texto da resposta. */
export type PerguntarLlm = (prompt: string) => Promise<string>;

const PROMPT = `Selecione os trechos que melhor respondem à pergunta.

PERGUNTA: {pergunta}

TRECHOS:
{lista}

Devolva apenas os números dos {n} melhores, do mais relevante ao menos,
separados por vírgula. Se nenhum responder, devolva os {n} menos irrelevantes.
Nada além dos números.`;

export interface Reordenacao<T> {
    escolhidos: T[];
    /** Saída crua da LLM. É onde os problemas aparecem — vale registrar em log. */
    bruto: string;
}

export function montarPrompt(
    pergunta: string,
    trechos: readonly string[],
    quantidade: number,
    limiteTrecho: number,
): string {
    const lista = trechos
        .map((t, i) => `[${i + 1}] ${t.replace(/\s+/g, " ").slice(0, limiteTrecho)}`)
        .join("\n\n");

    return PROMPT
        .replace("{pergunta}", pergunta)
        .replace("{lista}", lista)
        .replaceAll("{n}", String(quantidade));
}

/**
 * Extrai os índices escolhidos da resposta da LLM.
 *
 * Aceita qualquer formatação em volta dos números: modelos de raciocínio às
 * vezes explicam antes de concluir. Descarta repetidos e fora da faixa.
 */
export function interpretarEscolha(bruto: string, total: number, quantidade: number): number[] {
    return [...bruto.matchAll(/\d+/g)]
        .map(m => Number(m[0]))
        .filter(n => n >= 1 && n <= total)
        .filter((n, i, todos) => todos.indexOf(n) === i)
        .slice(0, quantidade);
}

export async function reordenar<T>(
    perguntarLlm: PerguntarLlm,
    pergunta: string,
    candidatos: readonly T[],
    textoDe: (c: T) => string,
    quantidade: number,
    limiteTrecho: number,
): Promise<Reordenacao<T>> {
    const bruto = await perguntarLlm(
        montarPrompt(pergunta, candidatos.map(textoDe), quantidade, limiteTrecho),
    );

    const indices = interpretarEscolha(bruto, candidatos.length, quantidade);

    // Sem índices utilizáveis, preserva a ordem da busca vetorial: uma
    // reordenação falha não deve custar a recuperação.
    const escolhidos = indices.length > 0
        ? indices.map(n => candidatos[n - 1]!)
        : [...candidatos].slice(0, quantidade);

    return { escolhidos, bruto };
}
