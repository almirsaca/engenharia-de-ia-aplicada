import type { Document } from "@langchain/core/documents";
import { formatarScore, formatarTrecho } from "../../compartilhado/formatacao.ts";

type ScoredDocument = [Document<Record<string, any>>, number];

function displayResults(results: ScoredDocument[], maxLength: number): void {
    console.log(`\n📄 Encontrados ${results.length} trechos relevantes:\n`);

    results.forEach(([doc, score], index) => {
        console.log(`   ${index + 1}. ${formatarScore(score)}`);
        console.log(`      ${formatarTrecho(doc.pageContent, maxLength)}`);
        console.log(`      📄 ${formatSource(doc.metadata)}`);
        console.log();
    });
}

function formatSource(metadata: Record<string, any> | undefined): string {
    const nome = metadata?.fileName ?? metadata?.source ?? "origem desconhecida";
    if (!metadata?.pageNumber) return nome;

    const total = metadata.totalPages ? `/${metadata.totalPages}` : "";
    return `${nome} — página ${metadata.pageNumber}${total}`;
}

export {
    displayResults,
    type ScoredDocument
}
