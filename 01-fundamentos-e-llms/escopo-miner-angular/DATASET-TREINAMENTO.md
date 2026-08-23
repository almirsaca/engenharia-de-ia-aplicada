# Dataset de Treinamento para Dimensionamento do TalkMiner

## Objetivo

O objetivo do modelo e determinar qual poder computacional deve ser disponibilizado para cada cliente do TalkMiner.

Atualmente, os clientes sao classificados nos escopos:

- `P`
- `M`
- `G`
- `GG`

Para melhorar a classificacao, e necessario transformar o historico dos clientes que ja utilizam o TalkMiner em um dataset de capacidade computacional.

O ponto mais importante e que nao basta registrar apenas as configuracoes do cliente. Tambem e necessario registrar quanto recurso computacional ele realmente consumiu e qual desempenho foi observado.

## Dados de Entrada

Para cada cliente, devem ser coletadas informacoes que representem o tamanho e a intensidade de uso do TalkMiner.

Exemplo:

```js
{
  templates: 7,
  listas: 5,
  estrategias: 32,
  colunas: 60,

  registrosProcessados: 500000,
  execucoesPorDia: 12,
  usuariosSimultaneos: 8,
  tamanhoMedioArquivoMb: 20,
  crescimentoMensalPercentual: 10
}
```

Templates, listas, estrategias e colunas podem nao representar totalmente o esforco computacional.

Por exemplo, uma estrategia executada uma vez por semana exige menos recursos do que a mesma estrategia executada varias vezes por hora.

## Metricas Observadas

Tambem devem ser registrados o consumo real e o comportamento do ambiente:

```js
{
  cpuMediaPercentual: 52,
  cpuPicoPercentual: 88,
  memoriaMediaMb: 4096,
  memoriaPicoMb: 7200,
  tempoMedioProcessamentoSegundos: 40,
  tempoP95Segundos: 95,
  falhasPorDia: 1,
  escopoUtilizado: "M"
}
```

O tempo `P95` representa o tempo abaixo do qual 95% das execucoes terminaram. Essa metrica ajuda a identificar lentidoes que podem nao aparecer no tempo medio.

## Definicao da Resposta Correta

O escopo atualmente utilizado pelo cliente nao deve ser considerado automaticamente como o escopo ideal.

Por exemplo, um cliente pode estar utilizando o escopo `M`, mas apresentar CPU constantemente acima de 90%, falhas frequentes ou tempos de processamento elevados. Nesse caso, o escopo ideal pode ser `G`.

Devem ser definidas regras de negocio para determinar o escopo correto:

| Escopo | Caracteristica esperada |
| --- | --- |
| `P` | Cargas pequenas, com CPU e memoria confortaveis |
| `M` | Utilizacao moderada e picos controlados |
| `G` | Cargas altas, grande volume ou alta concorrencia |
| `GG` | Cargas muito altas ou necessidade critica de desempenho |

Um registro final para treinamento poderia ser:

```js
{
  templates: 7,
  listas: 5,
  estrategias: 32,
  colunas: 60,
  registrosProcessados: 500000,
  execucoesPorDia: 12,
  usuariosSimultaneos: 8,
  escopoIdeal: "G"
}
```

O campo `escopoIdeal` deve ser revisado por especialistas que conhecam a operacao, considerando consumo, desempenho, falhas e margem para crescimento.

## Como Conseguir Mais Exemplos

1. Instrumentar o TalkMiner para coletar metricas automaticamente.
2. Consultar historicos de CPU, memoria, execucoes e falhas.
3. Criar um registro por cliente e por periodo, como cliente/mes.
4. Incluir situacoes de pico, nao apenas valores medios.
5. Solicitar que especialistas revisem o escopo ideal.
6. Incluir clientes que tiveram aumento ou reducao de infraestrutura.
7. Registrar o comportamento antes e depois das alteracoes de infraestrutura.

Com 20 clientes e 12 meses de historico, e possivel criar aproximadamente 240 exemplos:

```txt
20 clientes x 12 meses = 240 registros
```

## Abordagem Recomendada

Para dimensionamento de capacidade computacional, uma abordagem mais explicavel e prever primeiro os recursos concretos necessarios:

```txt
CPU necessaria
Memoria necessaria
Tempo de processamento esperado
```

Depois, esses valores podem ser convertidos para os escopos `P`, `M`, `G` ou `GG`.

Essa abordagem tende a ser mais confiavel do que ensinar diretamente que determinado cliente pertence ao escopo `G`, pois permite entender por que o modelo recomendou mais poder computacional.

## Proximos Passos

1. Definir quais metricas estao disponiveis atualmente no TalkMiner.
2. Criar uma tabela ou arquivo para armazenar os registros historicos.
3. Definir criterios objetivos para o `escopoIdeal`.
4. Revisar e corrigir os registros com especialistas da operacao.
5. Separar os dados entre treinamento, validacao e teste.
6. Treinar diferentes modelos e comparar seus resultados.
7. Monitorar as recomendacoes do modelo em producao.

