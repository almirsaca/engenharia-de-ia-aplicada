/**
 * Indicador de progresso para operações demoradas no terminal.
 *
 * Redesenha uma única linha com `\r`, mostrando etapa atual, barra e tempo
 * decorrido. Como o número de etapas é conhecido, a barra é determinada — não
 * é um spinner genérico fingindo saber quanto falta.
 *
 * Fora de um terminal interativo (saída redirecionada, CI, testes) fica em
 * silêncio, para não encher o log de sequências de escape.
 */

const QUADROS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVALO_MS = 80;
const LARGURA_BARRA = 10;

export class Progresso {
    private total: number;
    private concluidas = 0;
    private rotulo = "";
    private quadro = 0;
    private inicio = Date.now();
    private timer: NodeJS.Timeout | null = null;
    private readonly ativo: boolean;

    constructor(total: number, ativo: boolean = Boolean(process.stdout.isTTY)) {
        this.total = Math.max(1, total);
        this.ativo = ativo;
    }

    /** Avança para a próxima etapa e passa a exibir o rótulo informado. */
    etapa(rotulo: string): void {
        this.rotulo = rotulo;
        if (!this.ativo) return;

        if (!this.timer) {
            this.inicio = Date.now();
            // unref evita que o timer segure o processo caso algo escape do finally.
            this.timer = setInterval(() => this.desenhar(), INTERVALO_MS);
            this.timer.unref();
        }
        this.desenhar();
    }

    /** Corrige o total quando o caminho percorrido define quantas etapas faltam. */
    ajustarTotal(total: number): void {
        this.total = Math.max(this.concluidas + 1, total);
    }

    /** Marca a etapa corrente como concluída. */
    completar(): void {
        this.concluidas = Math.min(this.total, this.concluidas + 1);
        if (this.ativo) this.desenhar();
    }

    /**
     * Apaga a linha da barra sem parar o timer, para que a saída seguinte não
     * se misture a ela. A barra reaparece uma linha abaixo no próximo quadro.
     */
    limpar(): void {
        if (this.ativo) process.stdout.write("\r\x1b[K");
    }

    /** Imprime uma linha com segurança enquanto a barra está ativa. */
    log(mensagem: string): void {
        this.limpar();
        console.log(mensagem);
    }

    /** Encerra o indicador e limpa a linha. Idempotente. */
    encerrar(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.ativo) process.stdout.write("\r\x1b[K");
    }

    /** Segundos decorridos desde a primeira etapa. */
    get segundos(): number {
        return (Date.now() - this.inicio) / 1000;
    }

    private desenhar(): void {
        const cheios = Math.round((this.concluidas / this.total) * LARGURA_BARRA);
        const barra = "█".repeat(cheios) + "░".repeat(LARGURA_BARRA - cheios);
        const giro = QUADROS[this.quadro = (this.quadro + 1) % QUADROS.length];
        const passo = Math.min(this.concluidas + 1, this.total);

        process.stdout.write(
            `\r\x1b[K   ${giro} [${barra}] ${passo}/${this.total} ${this.rotulo}… ${this.segundos.toFixed(1)}s`,
        );
    }
}

/** Executa `fn` exibindo uma etapa do progresso, garantindo o avanço mesmo em erro. */
export async function comEtapa<T>(p: Progresso, rotulo: string, fn: () => Promise<T>): Promise<T> {
    p.etapa(rotulo);
    try {
        return await fn();
    } finally {
        p.completar();
    }
}
