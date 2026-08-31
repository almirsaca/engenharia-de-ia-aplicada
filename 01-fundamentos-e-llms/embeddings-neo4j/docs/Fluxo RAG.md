# Fluxo RAG — o caso Titanic

Este documento explica o fluxo RAG (*Retrieval-Augmented Generation*) usando o acervo deste laboratório: três PDFs sobre o Titanic, entre eles uma **Análise Preliminar de Riscos** que trata o naufrágio como estudo de caso de gestão de projetos.

O fluxo completo é:

```text
Pergunta do usuário
        ↓
Transforma a pergunta em embedding
        ↓
Busca por similaridade no banco vetorial
        ↓
Seleciona os trechos mais relevantes
        ↓
Monta o prompt: instruções + trechos + pergunta
        ↓
Envia o prompt à LLM
        ↓
Valida e devolve a resposta ao usuário
```

> **Onde este laboratório para.** A aplicação implementa a indexação e a recuperação — as duas primeiras etapas. Ela **não chama uma LLM**: exibe os trechos recuperados diretamente no terminal. A geração da resposta é o passo que falta, e as configurações do OpenRouter em `src/config.ts` já estão preparadas para ele.

## Exemplo real

As saídas abaixo foram produzidas pela aplicação deste laboratório, sem edição.

### Pergunta

> Havia botes salva-vidas suficientes?

### Trechos recuperados

```text
[83.5%] O Caso Titanic.pdf p.2
  ...Apesar de todos os avisos o Titanic não reduziu a velocidade, mantendo-se
  a 21.5 nós. Os número de botes salva-vidas era insuficiente, uma vez que o
  Titanic era capaz de acomodar 1.178 pessoas, ou seja, 53% das pessoas abordo...

[81.2%] Titanic - A Projeção Do Transatlântico.pdf p.7
  ...Marconi, com grande potência, situada no convés das embarcações a bombordo,
  após os aposentos dos oficiais...
```

### Prompt que seria enviado à LLM

```text
Você é um assistente especializado no caso Titanic.
Responda somente com base no contexto fornecido.
Se o contexto não contiver a resposta, informe que não encontrou
essa informação nos documentos.
Cite o arquivo e a página de cada afirmação.

CONTEXTO:
[O Caso Titanic.pdf, página 2]
O número de botes salva-vidas era insuficiente, uma vez que o Titanic era
capaz de acomodar 1.178 pessoas, ou seja, 53% das pessoas a bordo.

PERGUNTA:
Havia botes salva-vidas suficientes?
```

### Resposta esperada

> Não. Os botes comportavam 1.178 pessoas, cerca de 53% das que estavam a bordo (*O Caso Titanic.pdf*, página 2).

## O que compõe o RAG

O **RAG não é somente o banco vetorial**. Ele é todo o mecanismo que recupera conhecimento e o fornece à LLM. Uma implementação tem duas partes.

### 1. Indexação

Executada quando os documentos são cadastrados ou atualizados:

| Etapa | Onde acontece aqui |
| --- | --- |
| Extrair o texto dos documentos | `PDFLoader`, em `documentProcessor.ts` |
| Dividir o conteúdo em trechos (*chunks*) | `RecursiveCharacterTextSplitter` |
| Gerar os *embeddings* dos trechos | `HuggingFaceTransformersEmbeddings` |
| Armazenar vetores e metadados | `Neo4jVectorStore.addDocuments` |

Neste acervo, 45 páginas de PDF viram **135 chunks**, indexados em cerca de 13 segundos.

### 2. Consulta

Executada para cada pergunta do usuário:

- Gerar o *embedding* da pergunta.
- Recuperar os trechos mais relevantes (`similaritySearchWithScore`).
- Montar o prompt com instruções, contexto e pergunta.
- Enviar o prompt à LLM.
- Validar e devolver a resposta ao usuário.

As três primeiras etapas existem no laboratório; as duas últimas, não.

## O idioma importa

A escolha do modelo de embeddings decide a qualidade da busca. Os documentos deste acervo estão em português e inglês, e um modelo treinado só em inglês falha de forma silenciosa.

Comparando a pergunta *"Por que o navio afundou?"* com dois trechos — um relevante e uma frase de receita culinária:

| Modelo | Trecho relevante | Trecho irrelevante | Separação |
| --- | ---: | ---: | ---: |
| `all-MiniLM-L6-v2` | 0,476 | 0,503 | **−0,027** |
| `paraphrase-multilingual-MiniLM-L12-v2` | 0,427 | 0,024 | **+0,404** |

O modelo apenas inglês considerou a receita **mais parecida** com a pergunta do que o trecho sobre o naufrágio. Separação negativa significa recuperação funcionando ao contrário.

Por isso o laboratório usa o modelo multilíngue, que ainda alinha os dois idiomas no mesmo espaço vetorial: uma pergunta em português recupera corretamente trechos em inglês do `Titanic-eBook.pdf`.

## Recomendações para produção

Um serviço RAG de verdade também deve:

- Evitar que a LLM invente respostas quando os trechos forem insuficientes.
- Guardar a origem de cada trecho para apresentar referências.
- Aplicar filtros de empresa, usuário e permissão durante a busca.
- Registrar métricas como relevância, latência, custo e trechos encontrados.
- Proteger-se contra instruções maliciosas presentes na pergunta ou nos documentos.

## Filtros, reranking e pedaços de análise de risco

Esses três recursos melhoram a qualidade e a segurança da recuperação:

```text
Pergunta do usuário
        ↓
Filtros de acesso e metadados
        ↓
Busca no banco vetorial
        ↓
Reranking dos resultados
        ↓
Seleção dos trechos finais
        ↓
Trechos + instruções + pergunta formam o prompt
        ↓
LLM gera a resposta
        ↓
Validação e resposta ao usuário
```

### Filtros

Os filtros restringem **quais documentos podem participar da busca**, usando os metadados gravados junto aos vetores. Cada chunk deste laboratório carrega:

```json
{
  "source": "./docs/titanic/O Caso Titanic.pdf",
  "fileName": "O Caso Titanic.pdf",
  "pageNumber": 2,
  "totalPages": 2
}
```

Com esses campos já é possível restringir a busca a um documento específico — por exemplo, responder perguntas sobre gestão de riscos usando apenas a Análise Preliminar de Riscos, sem misturar a narrativa histórica do e-book.

#### Um filtro que este laboratório aplica de verdade

O `Titanic-eBook.pdf` traz, nas páginas 25 a 31, um capítulo sobre o naufrágio do **Wilhelm Gustloff** — outro navio. Sem filtro algum, esse conteúdo entra no acervo e a pergunta *"Quantas pessoas morreram no naufrágio?"* devolve, em primeiro lugar e com 86,9% de similaridade, as **9.500 vítimas do Gustloff**.

A resposta é fluente, confiante e do navio errado. Nenhum sinal do sistema indica o problema: o score é alto, o texto é coerente e o assunto é um desastre marítimo.

O laboratório resolve isso na **indexação**, restringindo o e-book às páginas 1-24 em `CONFIG.pdf.paths`. Com o corte, a mesma pergunta passa a recuperar o trecho correto:

```text
[79.3%] O Caso Titanic.pdf p.1
  ...Às 02h20min do dia seguinte o Titanic afunda com 1.522 pessoas mortas...
```

Duas lições ficam desse experimento:

1. **Similaridade alta não é sinônimo de resposta certa.** O trecho errado pontuou 86,9%; o certo, 79,3%. Sem citação de fonte, um usuário não teria como perceber a troca.
2. **Filtrar na indexação é mais barato que filtrar na consulta** — mas só funciona quando o recorte é fixo. Quando depende do usuário (permissões, empresa, versão), o filtro precisa acontecer na busca, sobre os metadados.

Num SaaS multiempresa, os metadados incluiriam `empresa_id`, `status`, `versao` e `permissao`. O filtro por `empresa_id` ou `tenant_id` é o mais importante: funciona como controle de isolamento entre clientes, além de melhorar a relevância.

> **Atenção:** o Neo4j só armazena valores primitivos nas propriedades de um nó. Metadados aninhados precisam ser achatados antes da gravação — é o que `documentProcessor.ts` faz com `loc.pageNumber`.

### Reranking

A busca vetorial encontra trechos semanticamente próximos, mas sua ordenação inicial nem sempre coloca os melhores primeiro. O **reranking** reavalia os candidatos com um modelo mais preciso e os reordena.

Este acervo dá um exemplo concreto. Para a pergunta *"O Titanic foi avisado sobre icebergs?"*, a busca vetorial devolveu:

```text
[88.0%] O Caso Titanic.pdf p.2                       ← relevante
[87.1%] Titanic - A Projeção Do Transatlântico.pdf p.15
```

O segundo trecho, com 87,1% de similaridade — praticamente empatado com o primeiro —, fala do **valor do seguro pago às vítimas**. Não responde nada sobre avisos de iceberg. Ele pontuou alto por compartilhar vocabulário e assunto geral com a pergunta, não por conter a resposta.

É exatamente esse tipo de erro que o reranking corrige. Uma configuração comum:

```text
Busca vetorial: recupera 20 candidatos
        ↓
Reranking: reavalia e reordena os 20
        ↓
Seleção final: usa os 3 ou 5 melhores
```

### Pedaços de análise de risco

A Análise Preliminar de Riscos do Titanic descreve uma cadeia de decisões que levou ao desastre. Cada risco só faz sentido junto de sua causa, sua consequência e a medida que teria evitado o problema:

```text
Risco: colisão com iceberg em rota do Atlântico Norte

Fatores de exposição:
1. Velocidade de cruzeiro de 21,5 nós mantida durante a noite.
2. Seis avisos de gelo recebidos em 14/04/1912 e ignorados.
3. Binóculos disponíveis a bordo, mas não entregues aos vigias.
4. Ausência de radar (tecnologia só operacional 23 anos depois).

Consequência:
Distância de parada superior a 1 km àquela velocidade.

Medidas que teriam mitigado:
Reduzir a velocidade após os avisos e equipar o cesto da gávea.
```

#### Cuidado ao dividir

Se cada linha virar um chunk isolado, o RAG pode recuperar apenas:

> Reduzir a velocidade.

Perdem-se as condições que explicam **quando** e **por que** a medida se aplicava. Uma divisão segura preserva a unidade inteira — risco, fatores, consequência e medida no mesmo pedaço.

O mesmo vale para os avisos de gelo: a lista das seis mensagens de 14/04/1912 (*Caronia* às 9h, *Noordam* às 11h40, *Amerika* às 13h45, *Californian* às 19h30, *Mesaba* às 21h40) só responde "o Titanic foi avisado?" se permanecer junta. Fragmentada, cada mensagem vira um fato solto, sem força de evidência.

Cada pedaço também deveria guardar metadados como nome do documento, seção, página, versão e data de atualização.

### Resumo dos conceitos

- **Filtros:** determinam quais documentos e trechos são elegíveis para a busca.
- **Busca vetorial:** encontra candidatos semanticamente semelhantes à pergunta.
- **Reranking:** identifica e reordena os candidatos que respondem melhor.
- **Chunking com contexto:** mantém unidades de sentido completas, para que o trecho recuperado baste para responder com segurança.
