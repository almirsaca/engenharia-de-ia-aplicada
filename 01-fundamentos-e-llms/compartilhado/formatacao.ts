/**
 * Formatação de trechos para exibição no terminal, compartilhada pelos
 * laboratórios embeddings-neo4j e titanic-graphrag.
 *
 * Módulo sem dependências de propósito: os dois projetos têm `node_modules`
 * separados, então nada aqui pode importar de fora da biblioteca padrão.
 */

/** Passe como limite para imprimir o trecho inteiro, sem cortar. */
export const SEM_LIMITE = -1;

/**
 * Colapsa o espaçamento do trecho e corta no limite informado.
 *
 * As reticências só aparecem quando houve corte de fato — um trecho menor que
 * o limite sai como está.
 */
export function formatarTrecho(conteudo: string, limite: number = 200): string {
    const limpo = conteudo.replace(/\s+/g, " ").trim();

    if (limite === SEM_LIMITE || limpo.length <= limite) return limpo;

    return `${limpo.slice(0, limite)}...`;
}

/** Barra de dez blocos com o percentual, para a similaridade de cosseno (0 a 1). */
export function formatarScore(score: number): string {
    const blocos = Math.min(10, Math.max(0, Math.round(score * 10)));
    const barra = "█".repeat(blocos) + "░".repeat(10 - blocos);
    return `${barra} ${(score * 100).toFixed(1)}% de similaridade`;
}
