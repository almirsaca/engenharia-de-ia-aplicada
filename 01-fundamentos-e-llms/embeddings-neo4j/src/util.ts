import type { Document } from "@langchain/core/documents";

type ScoredDocument = [Document<Record<string, any>>, number];

function displayResults(results: ScoredDocument[], maxLength: number): void {
    console.log(`\n📄 Encontrados ${results.length} trechos relevantes:\n`);

    results.forEach(([doc, score], index) => {
        console.log(`   ${index + 1}. ${formatScore(score)}`);
        console.log(`      ${formatContent(doc.pageContent, maxLength)}`);
        console.log(`      📄 ${formatSource(doc.metadata)}`);
        console.log();
    });
}

// O Neo4j devolve similaridade de cosseno já normalizada entre 0 e 1.
function formatScore(score: number): string {
    const blocos = Math.round(score * 10);
    const barra = "█".repeat(blocos) + "░".repeat(10 - blocos);
    return `${barra} ${(score * 100).toFixed(1)}% de similaridade`;
}

function formatSource(metadata: Record<string, any> | undefined): string {
    const nome = metadata?.fileName ?? metadata?.source ?? "origem desconhecida";
    if (!metadata?.pageNumber) return nome;

    const total = metadata.totalPages ? `/${metadata.totalPages}` : "";
    return `${nome} — página ${metadata.pageNumber}${total}`;
}

function formatContent(content: string, maxLength: number = 200): string {
    const cleaned = content.replace(/\s+/g, ' ').trim();
    return maxLength != -1 &&  cleaned.length > maxLength
        ? `${cleaned.substring(0, maxLength)}...`
        : cleaned;
}

export {
    displayResults,
    type ScoredDocument
}
