import neo4j, { type Driver } from "neo4j-driver";

export interface Analise {
    titulo: string;
    cypher: string;
}

export const ANALISES: readonly Analise[] = [
    {
        // Vem primeiro de propósito: deixa visível que só parte do acervo tem
        // desfecho, o que explica o filtro por conjunto nas demais consultas.
        titulo: "Conjuntos de treino e teste",
        cypher: `
        MATCH (p:Passageiro)
        RETURN p.conjunto AS conjunto,
               count(p) AS passageiros,
               sum(CASE WHEN p.sobreviveu IS NULL THEN 1 ELSE 0 END) AS semDesfecho,
               CASE WHEN p.conjunto = 'treino'
                    THEN 'desfecho conhecido'
                    ELSE 'a prever — o Kaggle não publica o gabarito' END AS observacao
        ORDER BY conjunto DESC`,
    },
    {
        titulo: "Sobrevivência por classe",
        cypher: `
        MATCH (p:Passageiro)-[:VIAJOU_NA]->(c:Classe)
        WHERE p.conjunto = 'treino'
        RETURN c.numero AS num, c.descricao AS classe,
               count(p) AS total,
               sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) AS sobreviveram,
               round(100.0 * sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) / count(p), 1) AS taxa
        ORDER BY num`,
    },
    {
        titulo: "Sobrevivência por sexo",
        cypher: `
        MATCH (p:Passageiro)
        WHERE p.conjunto = 'treino'
        RETURN p.sexo AS sexo,
               count(p) AS total,
               sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) AS sobreviveram,
               round(100.0 * sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) / count(p), 1) AS taxa
        ORDER BY taxa DESC`,
    },
    {
        titulo: "Sobrevivência por sexo e classe",
        cypher: `
        MATCH (p:Passageiro)-[:VIAJOU_NA]->(c:Classe)
        WHERE p.conjunto = 'treino'
        RETURN c.numero AS num, c.descricao AS classe, p.sexo AS sexo,
               count(p) AS total,
               sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) AS sobreviveram,
               round(100.0 * sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) / count(p), 1) AS taxa
        ORDER BY num, sexo`,
    },
    {
        titulo: "Sobrevivência por porto de embarque",
        cypher: `
        MATCH (p:Passageiro)-[:EMBARCOU_EM]->(porto:Porto)
        WHERE p.conjunto = 'treino'
        RETURN porto.nome AS porto,
               count(p) AS total,
               sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) AS sobreviveram,
               round(100.0 * sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) / count(p), 1) AS taxa
        ORDER BY total DESC`,
    },
    {
        titulo: "Idade e tarifa médias, por desfecho",
        cypher: `
        MATCH (p:Passageiro)
        WHERE p.conjunto = 'treino'
        RETURN CASE WHEN p.sobreviveu THEN 'sobreviveu' ELSE 'morreu' END AS desfecho,
               count(p) AS total,
               round(avg(p.idade), 1) AS idadeMedia,
               round(avg(p.tarifa), 2) AS tarifaMedia
        ORDER BY desfecho`,
    },
    {
        titulo: "Crianças (menos de 12 anos) por classe",
        cypher: `
        MATCH (p:Passageiro)-[:VIAJOU_NA]->(c:Classe)
        WHERE p.conjunto = 'treino' AND p.idade IS NOT NULL AND p.idade < 12
        RETURN c.numero AS num, c.descricao AS classe,
               count(p) AS criancas,
               sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) AS sobreviveram,
               round(100.0 * sum(CASE WHEN p.sobreviveu THEN 1 ELSE 0 END) / count(p), 1) AS taxa
        ORDER BY num`,
    },
    {
        titulo: "Maiores grupos viajando com o mesmo bilhete",
        cypher: `
        MATCH (p:Passageiro)-[:COMPROU]->(b:Bilhete)
        WHERE p.conjunto = 'treino'
        WITH b, collect(p) AS grupo
        WHERE size(grupo) >= 4
        RETURN b.codigo AS bilhete,
               size(grupo) AS pessoas,
               size([x IN grupo WHERE x.sobreviveu]) AS sobreviveram,
               [x IN grupo | x.nome][0..3] AS exemplos
        ORDER BY pessoas DESC LIMIT 5`,
    },
];

// Converte tipos do driver (Integer, Float, arrays) para valores JS legíveis.
export function paraValor(v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (neo4j.isInt(v)) return v.toNumber();
    if (Array.isArray(v)) return v.map(paraValor);
    return v;
}

export async function executar(driver: Driver, cypher: string, params: Record<string, unknown> = {}) {
    const { records } = await driver.executeQuery(cypher, params);
    return records.map(r => Object.fromEntries(r.keys.map(k => [k, paraValor(r.get(k as string))])));
}

export function imprimirTabela(linhas: Record<string, unknown>[]): void {
    if (linhas.length === 0) { console.log("   (sem resultados)"); return; }

    const colunas = Object.keys(linhas[0]!);
    const texto = (v: unknown) => Array.isArray(v) ? v.join("; ") : v === null ? "—" : String(v);
    const largura = colunas.map(c => Math.max(c.length, ...linhas.map(l => texto(l[c]).length)));

    const linhaSep = "   " + largura.map(w => "─".repeat(w)).join("──");
    console.log("   " + colunas.map((c, i) => c.padEnd(largura[i]!)).join("  "));
    console.log(linhaSep);
    for (const l of linhas) {
        console.log("   " + colunas.map((c, i) => texto(l[c]).padEnd(largura[i]!)).join("  "));
    }
}

export async function rodarAnalises(driver: Driver): Promise<void> {
    for (const { titulo, cypher } of ANALISES) {
        console.log(`\n📊 ${titulo}`);
        imprimirTabela(await executar(driver, cypher));
    }
}
