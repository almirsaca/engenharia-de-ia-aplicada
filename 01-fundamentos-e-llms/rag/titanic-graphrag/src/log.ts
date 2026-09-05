import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export const PASTA_LOG = "./log";
export const ARQUIVO_LOG = `${PASTA_LOG}/interacoes.jsonl`;

export interface Etapa {
    ms: number;
    /** Saída crua da LLM, antes de qualquer tratamento. É onde os erros aparecem. */
    bruto?: string;
    resultado?: unknown;
    erro?: string;
}

export interface Registro {
    id: string;
    momento: string;
    pergunta: string;
    modelo: string | undefined;
    rota?: "grafo" | "documentos";
    etapas: Record<string, Etapa>;
    resposta?: string;
    erro?: string;
    totalMs?: number;
}

// Id curto e fácil de digitar, para o usuário citar a interação ao relatar um
// problema. 6 dígitos hex dão 16 milhões de combinações — suficiente para um
// arquivo de log local.
export function novoId(): string {
    return randomBytes(3).toString("hex");
}

export function novoRegistro(pergunta: string, modelo: string | undefined): Registro {
    return {
        id: novoId(),
        momento: new Date().toISOString(),
        pergunta,
        modelo,
        etapas: {},
    };
}

/** Cronometra uma etapa e registra resultado ou erro, sem engolir a exceção. */
export async function medir<T>(
    registro: Registro,
    nome: string,
    fn: () => Promise<T>,
    detalhes?: (valor: T) => Partial<Etapa>,
): Promise<T> {
    const inicio = Date.now();
    try {
        const valor = await fn();
        registro.etapas[nome] = { ms: Date.now() - inicio, ...detalhes?.(valor) };
        return valor;
    } catch (erro) {
        registro.etapas[nome] = {
            ms: Date.now() - inicio,
            erro: erro instanceof Error ? erro.message : String(erro),
        };
        throw erro;
    }
}

export async function salvar(registro: Registro): Promise<void> {
    registro.totalMs = registro.etapas
        ? Object.values(registro.etapas).reduce((s, e) => s + e.ms, 0)
        : 0;

    await mkdir(PASTA_LOG, { recursive: true });
    await appendFile(ARQUIVO_LOG, JSON.stringify(registro) + "\n", "utf8");
}

export async function lerRegistros(): Promise<Registro[]> {
    try {
        const texto = await readFile(ARQUIVO_LOG, "utf8");
        return texto
            .split("\n")
            .filter(l => l.trim())
            .map(l => JSON.parse(l) as Registro);
    } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw erro;
    }
}
