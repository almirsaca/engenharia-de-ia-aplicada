import neo4j, { type Driver } from "neo4j-driver";
import { readFile } from "node:fs/promises";
import { CONFIG } from "./config.ts";

export interface LinhaCsv {
    [coluna: string]: string;
}

// Parser CSV mínimo no formato RFC 4180: campos entre aspas podem conter
// vírgulas e aspas escapadas (""), como nos nomes ("Braund, Mr. Owen Harris").
export function parseCsv(texto: string): LinhaCsv[] {
    const linhas: string[][] = [];
    let campo = "";
    let linha: string[] = [];
    let entreAspas = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];

        if (entreAspas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') entreAspas = false;
            else campo += c;
            continue;
        }

        if (c === '"') entreAspas = true;
        else if (c === ",") { linha.push(campo); campo = ""; }
        else if (c === "\n") { linha.push(campo); linhas.push(linha); campo = ""; linha = []; }
        else if (c !== "\r") campo += c;
    }
    if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha); }

    const cabecalho = linhas.shift();
    if (!cabecalho) return [];

    return linhas
        .filter(l => l.length === cabecalho.length)
        .map(l => Object.fromEntries(cabecalho.map((coluna, i) => [coluna, l[i] ?? ""])));
}

const CONSTRAINTS = [
    "CREATE CONSTRAINT passageiro_id IF NOT EXISTS FOR (p:Passageiro) REQUIRE p.passageiroId IS UNIQUE",
    "CREATE CONSTRAINT classe_numero IF NOT EXISTS FOR (c:Classe) REQUIRE c.numero IS UNIQUE",
    "CREATE CONSTRAINT porto_codigo IF NOT EXISTS FOR (p:Porto) REQUIRE p.codigo IS UNIQUE",
    "CREATE CONSTRAINT bilhete_codigo IF NOT EXISTS FOR (b:Bilhete) REQUIRE b.codigo IS UNIQUE",
];

const CARGA = `
UNWIND $linhas AS linha
MERGE (c:Classe {numero: toInteger(linha.Pclass)})
  ON CREATE SET c.descricao = CASE toInteger(linha.Pclass)
      WHEN 1 THEN 'Primeira' WHEN 2 THEN 'Segunda' ELSE 'Terceira' END

MERGE (b:Bilhete {codigo: linha.Ticket})

MERGE (p:Passageiro {passageiroId: toInteger(linha.PassengerId)})
SET p.nome           = linha.Name,
    p.sexo           = linha.Sex,
    p.idade          = CASE WHEN linha.Age = '' THEN null ELSE toFloat(linha.Age) END,
    p.tarifa         = CASE WHEN linha.Fare = '' THEN null ELSE toFloat(linha.Fare) END,
    p.cabine         = CASE WHEN linha.Cabin = '' THEN null ELSE linha.Cabin END,
    // Fica null no conjunto de teste: o desfecho é o que a competição pede
    // para prever, e inventá-lo contaminaria toda estatística de sobrevivência.
    p.sobreviveu     = CASE WHEN $temDesfecho THEN linha.Survived = '1' ELSE null END,
    p.conjunto       = $conjunto,
    p.irmaosConjuges = toInteger(linha.SibSp),
    p.paisFilhos     = toInteger(linha.Parch)

MERGE (p)-[:VIAJOU_NA]->(c)
MERGE (p)-[:COMPROU]->(b)

FOREACH (_ IN CASE WHEN linha.Embarked <> '' THEN [1] ELSE [] END |
    MERGE (porto:Porto {codigo: linha.Embarked})
      ON CREATE SET porto.nome = CASE linha.Embarked
          WHEN 'C' THEN 'Cherbourg' WHEN 'Q' THEN 'Queenstown'
          WHEN 'S' THEN 'Southampton' ELSE linha.Embarked END
    MERGE (p)-[:EMBARCOU_EM]->(porto)
)
`;

export async function contarPassageiros(driver: Driver): Promise<number> {
    const r = await driver.executeQuery("MATCH (p:Passageiro) RETURN count(p) AS total");
    return r.records[0]?.get("total").toNumber() ?? 0;
}

export async function carregarGrafo(driver: Driver): Promise<number> {
    for (const constraint of CONSTRAINTS) await driver.executeQuery(constraint);

    const conjuntos = [
        { nome: "treino", caminho: CONFIG.csv.treino, temDesfecho: true },
        { nome: "teste", caminho: CONFIG.csv.teste, temDesfecho: false },
    ] as const;

    for (const { nome, caminho, temDesfecho } of conjuntos) {
        const linhas = parseCsv(await readFile(caminho, "utf8"));
        console.log(`📄 ${linhas.length} passageiros de ${nome} lidos de ${caminho}` +
            (temDesfecho ? "" : "  (sem desfecho conhecido)"));

        // MERGE por passageiroId torna a carga idempotente: rodar duas vezes não duplica.
        await driver.executeQuery(CARGA, { linhas, conjunto: nome, temDesfecho });
    }

    const total = await contarPassageiros(driver);
    console.log(`✅ Grafo carregado: ${total} nós :Passageiro`);
    return total;
}

// Executado apenas quando este arquivo é o ponto de entrada (`npm run load`).
if (import.meta.filename === process.argv[1]) {
    const driver = neo4j.driver(
        CONFIG.neo4j.uri,
        neo4j.auth.basic(CONFIG.neo4j.username, CONFIG.neo4j.password),
    );
    try {
        await carregarGrafo(driver);
    } finally {
        await driver.close();
    }
}
