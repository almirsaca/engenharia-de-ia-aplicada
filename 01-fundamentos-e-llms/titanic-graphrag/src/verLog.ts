import { lerRegistros, type Registro } from "./log.ts";

function bloco(rotulo: string, valor: unknown, recuo = "   "): void {
    if (valor === undefined || valor === null || valor === "") return;
    const texto = typeof valor === "string" ? valor : JSON.stringify(valor, null, 2);
    console.log(`${recuo}${rotulo}:`);
    for (const linha of texto.split("\n")) console.log(`${recuo}   ${linha}`);
}

function imprimir(r: Registro): void {
    console.log("=".repeat(80));
    console.log(`🆔 ${r.id}   ${r.momento}`);
    console.log(`🤖 ${r.modelo ?? "(sem modelo)"}   ⏱️  ${((r.totalMs ?? 0) / 1000).toFixed(1)}s`);
    console.log(`🧭 rota: ${r.rota ?? "(não decidida)"}`);
    console.log(`\n❓ ${r.pergunta}\n`);

    for (const [nome, etapa] of Object.entries(r.etapas)) {
        console.log(`── ${nome}  (${(etapa.ms / 1000).toFixed(1)}s)`);
        if (etapa.erro) bloco("ERRO", etapa.erro);
        // `bruto` é a saída da LLM sem tratamento — onde o problema costuma estar.
        if (etapa.bruto !== undefined) bloco("bruto da LLM", etapa.bruto);
        if (etapa.resultado !== undefined) bloco("resultado", etapa.resultado);
        console.log();
    }

    if (r.erro) console.log(`❌ erro: ${r.erro}\n`);
    if (r.resposta) console.log(`💬 resposta final:\n   ${r.resposta.split("\n").join("\n   ")}\n`);
}

const registros = await lerRegistros();
if (registros.length === 0) {
    console.log("Nenhuma interação registrada ainda.");
} else {
    const alvo = process.argv[2];

    if (!alvo) {
        console.log(`${registros.length} interações registradas:\n`);
        for (const r of registros.slice(-20)) {
            const marca = r.erro ? "❌" : "✅";
            console.log(`  ${marca} ${r.id}  ${r.momento.slice(0, 19).replace("T", " ")}  ` +
                `${(r.rota ?? "?").padEnd(10)}  ${r.pergunta.slice(0, 50)}`);
        }
        console.log("\nDetalhe de uma delas:  npm run log -- <id>");
        console.log("Todas em detalhe:      npm run log -- --tudo");
    } else if (alvo === "--tudo") {
        registros.forEach(imprimir);
    } else {
        const achados = registros.filter(r => r.id === alvo);
        if (achados.length === 0) console.log(`Nenhuma interação com id "${alvo}".`);
        else achados.forEach(imprimir);
    }
}
