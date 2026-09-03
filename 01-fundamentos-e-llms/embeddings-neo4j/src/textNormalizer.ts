/**
 * Reconstitui parágrafos a partir do texto achatado que sai de um PDF.
 *
 * O `pdf-parse` devolve uma quebra de linha por linha *impressa*, não por
 * ideia. Sem tratamento, o `RecursiveCharacterTextSplitter` nunca encontra o
 * separador `"\n\n"` e acaba agrupando linhas soltas até completar o
 * `chunkSize`, cortando frases ao meio.
 */

/** Uma linha que termina aqui encerra a ideia; caso contrário, ela continua na próxima. */
const FIM_DE_FRASE = /[.!?:;][")'\]]?$/;

/** Numeração de página isolada: "12", "13 / 19", "- 4 -", "Página 7". */
const NUMERO_DE_PAGINA = /^(?:p[áa]g(?:ina)?\.?\s*)?[-–—\s]*\d{1,4}(?:\s*[/|de]{1,2}\s*\d{1,4})?[-–—\s]*$/i;

export interface OpcoesNormalizacao {
    /** Fração das páginas em que uma linha precisa aparecer para ser tratada como cabeçalho ou rodapé. */
    limiteRepeticao: number;
    /** Documentos com menos páginas que isto não têm cabeçalho detectado — a amostra seria pequena demais. */
    minimoPaginas: number;
}

export const PADRAO: OpcoesNormalizacao = {
    limiteRepeticao: 0.6,
    minimoPaginas: 4,
};

/**
 * Linhas curtas que se repetem na maioria das páginas são cabeçalho, rodapé ou
 * marca d'água — ruído que entraria nos embeddings sem acrescentar sentido.
 */
export function detectarRepetidas(
    paginas: readonly string[],
    opcoes: OpcoesNormalizacao = PADRAO,
): Set<string> {
    if (paginas.length < opcoes.minimoPaginas) return new Set();

    const ocorrencias = new Map<string, number>();
    for (const pagina of paginas) {
        const linhasUnicas = new Set(
            pagina.split("\n").map(l => l.trim()).filter(l => l.length > 0 && l.length <= 200),
        );
        for (const linha of linhasUnicas) {
            ocorrencias.set(linha, (ocorrencias.get(linha) ?? 0) + 1);
        }
    }

    const minimo = Math.ceil(paginas.length * opcoes.limiteRepeticao);
    return new Set(
        [...ocorrencias].filter(([, n]) => n >= minimo).map(([linha]) => linha),
    );
}

/** Aplica a normalização a uma página, já conhecidas as linhas repetidas do documento. */
export function normalizarPagina(texto: string, repetidas: Set<string> = new Set()): string {
    const linhas = texto
        .replace(/\r/g, "")
        .split("\n")
        // Texto justificado chega com espaços múltiplos entre as palavras.
        .map(l => l.replace(/[ \t ]+/g, " ").trim())
        .filter(l => l.length > 0 && !repetidas.has(l) && !NUMERO_DE_PAGINA.test(l));

    const partes: string[] = [];
    let paragrafo = "";

    for (const linha of linhas) {
        if (!paragrafo) {
            paragrafo = linha;
        } else if (/\p{Ll}-$/u.test(paragrafo) && /^\p{Ll}/u.test(linha)) {
            // Palavra hifenizada pela quebra de linha: "trans-\natlântico".
            paragrafo = paragrafo.slice(0, -1) + linha;
        } else {
            paragrafo += " " + linha;
        }

        if (FIM_DE_FRASE.test(paragrafo)) {
            partes.push(paragrafo);
            paragrafo = "";
        }
    }
    if (paragrafo) partes.push(paragrafo);

    // A quebra dupla é o separador que o splitter procura primeiro.
    return partes.join("\n\n");
}

/** Normaliza todas as páginas de um documento, compartilhando a detecção de repetidas. */
export function normalizarDocumento(paginas: readonly string[]): string[] {
    const repetidas = detectarRepetidas(paginas);
    return paginas.map(p => normalizarPagina(p, repetidas));
}
