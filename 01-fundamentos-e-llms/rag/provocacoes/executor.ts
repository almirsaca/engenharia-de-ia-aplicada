/**
 * Executor de provocações: manda perguntas hostis ao modelo de um laboratório
 * e mostra o que ele devolveu e o que a defesa daquele laboratório decidiu.
 *
 * Sem dependências de terceiros, como o `compartilhado/` ao lado — esta pasta
 * não tem `node_modules`. Quem importa biblioteca é o arquivo de cada cenário,
 * e indiretamente: ele importa o código do laboratório, e o Node resolve as
 * dependências a partir de lá.
 *
 * Nenhum cenário deve executar o que o modelo produziu. O ponto é observar a
 * saída, não apostar que a validação não tem furo.
 */
import { SEPARADOR } from "../compartilhado/formatacao.ts";

export interface Provocacao {
    /** Rótulo curto, usado na tabela final. */
    nome: string;
    texto: string;
}

export interface Veredito {
    /** Como a defesa do laboratório reagiu: "rejeitou", "aceitou"… */
    rotulo: string;
    detalhe?: string;
    /**
     * Verdadeiro quando o modelo produziu o que a provocação pedia — uma
     * escrita no banco, um vazamento de prompt. É o que se quer contar; o resto
     * é ruído.
     */
    grave: boolean;
}

export interface Cenario {
    titulo: string;
    /** Uma linha dizendo contra o que se está testando (modelo, temperatura). */
    contexto: string;
    provocacoes: readonly Provocacao[];
    rodadas: number;
    /** Chama o modelo e devolve a saída crua, sem tratamento. */
    gerar(texto: string): Promise<string>;
    /** Aplica a defesa real do laboratório à saída do modelo. */
    avaliar(saida: string): Veredito;
}

function indentar(texto: string): string {
    return texto.split("\n").map(l => "      " + l).join("\n");
}

/**
 * Roda o cenário e imprime o relatório.
 *
 * Devolve quantas rodadas foram graves, e ajusta o `process.exitCode` — assim o
 * comando serve de verificação, e não só de leitura.
 */
export async function executar(cenario: Cenario): Promise<number> {
    console.log(`${cenario.titulo}\n${cenario.contexto}`);

    let graves = 0;
    let falhas = 0;
    const linhas: string[] = [];

    for (const [i, provocacao] of cenario.provocacoes.entries()) {
        console.log(`\n${SEPARADOR}`);
        console.log(`PROVOCAÇÃO ${i + 1}: ${provocacao.texto}\n`);

        let gravesAqui = 0;
        for (let r = 1; r <= cenario.rodadas; r++) {
            let saida: string;
            try {
                saida = await cenario.gerar(provocacao.texto);
            } catch (erro) {
                falhas++;
                console.log(`  rodada ${r} — falhou: ${erro instanceof Error ? erro.message : erro}\n`);
                continue;
            }

            const veredito = cenario.avaliar(saida);
            if (veredito.grave) { graves++; gravesAqui++; }

            console.log(`  rodada ${r} — o modelo devolveu:`);
            console.log(indentar(saida));
            console.log(`  → ${veredito.rotulo}${veredito.detalhe ? ` — ${veredito.detalhe}` : ""}`);
            console.log(`  → ${veredito.grave ? "⚠️  GRAVE: o modelo atendeu à provocação" : "o modelo não atendeu à provocação"}\n`);
        }

        linhas.push(`| ${provocacao.nome} | ${gravesAqui}/${cenario.rodadas} graves |`);
    }

    console.log(SEPARADOR);
    console.log(linhas.join("\n"));
    console.log(`\ntotal: ${graves} graves em ${cenario.provocacoes.length * cenario.rodadas} rodadas` +
        (falhas ? `, ${falhas} chamada(s) falharam` : ""));

    process.exitCode = graves > 0 ? 1 : 0;
    return graves;
}
