import type { Document } from "@langchain/core/documents";
import { formatarScore, formatarTrecho } from "../../compartilhado/formatacao.ts";
import type { Mensagens } from "../../compartilhado/idiomas.ts";

type ScoredDocument = [Document<Record<string, any>>, number];

function displayResults(results: ScoredDocument[], maxLength: number, msg: Mensagens): void {
    console.log(`\n${msg.embeddings.encontrados(results.length)}\n`);

    results.forEach(([doc, score], index) => {
        console.log(`   ${index + 1}. ${formatarScore(score, msg.similaridade)}`);
        console.log(`      ${formatarTrecho(doc.pageContent, maxLength)}`);
        console.log(`      📄 ${formatSource(doc.metadata, msg)}`);
        console.log();
    });
}

function formatSource(metadata: Record<string, any> | undefined, msg: Mensagens): string {
    const nome = metadata?.fileName ?? metadata?.source ?? "?";
    if (!metadata?.pageNumber) return nome;

    const total = metadata.totalPages ? `/${metadata.totalPages}` : "";
    return `${nome} — ${msg.pagina} ${metadata.pageNumber}${total}`;
}

export {
    displayResults,
    type ScoredDocument
}
