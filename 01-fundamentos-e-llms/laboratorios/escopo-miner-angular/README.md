# Escopo Miner Angular

Projeto **didático** de **Web Machine Learning**: uma aplicação Angular 18 que treina e executa uma rede neural **diretamente no navegador**, usando [TensorFlow.js](https://www.tensorflow.org/js).

O objetivo é classificar clientes do *TalkMiner* em escopos de capacidade computacional — `P`, `M`, `G` ou `GG` — a partir de quatro características: **templates, listas, estratégias e colunas**.

> ℹ️ Este repositório é um laboratório de aprendizado. O foco não é a precisão do modelo em produção, e sim **entender, na prática, o ciclo completo de uma IA**: dados → treino → validação → inferência. Veja [DATASET-TREINAMENTO.md](./DATASET-TREINAMENTO.md) para a discussão de como seria uma versão real.

---

## 🎯 O que esta aula cobre

### Fundamentos de Web Machine Learning

#### Inteligência Artificial, Machine Learning e Deep Learning
São conceitos aninhados, um dentro do outro:

- **Inteligência Artificial (IA)** — o campo mais amplo: qualquer técnica que faça uma máquina simular comportamento "inteligente" (inclusive regras `if/else`).
- **Machine Learning (ML)** — subconjunto da IA em que o sistema **aprende padrões a partir de dados**, em vez de seguir regras escritas à mão.
- **Deep Learning (DL)** — subconjunto do ML que usa **redes neurais com várias camadas** para aprender representações complexas automaticamente.

```
┌─────────────────────────────────────────────┐
│ Inteligência Artificial                     │
│   ┌───────────────────────────────────────┐ │
│   │ Machine Learning                      │ │
│   │   ┌─────────────────────────────────┐ │ │
│   │   │ Deep Learning (redes neurais)   │ │ │
│   │   └─────────────────────────────────┘ │ │
│   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

Este projeto usa **Deep Learning**: uma rede neural pequena, mas que aprende a partir de exemplos.

#### Tensores: a base dos modelos
Um **tensor** é um array multidimensional — a estrutura que carrega *todos* os dados dentro de um modelo (entradas, pesos e saídas). Eles são a base porque permitem que as operações matemáticas do treino rodem de forma paralela e eficiente (GPU/CPU).

| Dimensão | Nome | Exemplo no projeto |
|---|---|---|
| 0D | escalar | uma probabilidade (`0.87`) |
| 1D | vetor | a entrada normalizada `[0.5, 0.3, 0.1, 0.4]` |
| 2D | matriz | o lote de exemplos de treino (`tf.tensor2d`) |

No código, a entrada do usuário vira um tensor 2D antes da inferência:
```ts
const entrada = tf.tensor2d([this.valoresNormalizados]);
const predicao = this.model.predict(entrada) as tf.Tensor;
```

> 💡 **Por que GPU/CPU?** As operações com tensores são basicamente muitas multiplicações de matrizes **independentes entre si** — perfeitas para rodar em paralelo. A **GPU** (placa de vídeo) tem milhares de núcleos simples e executa essas contas todas de uma vez, enquanto a **CPU** tem poucos núcleos e trabalha mais em sequência. Por isso a GPU pode treinar modelos muito mais rápido. O TensorFlow.js escolhe automaticamente o melhor *backend*: `webgl` (usa a GPU via WebGL) quando disponível, ou `cpu` como alternativa — é o que a linha `await tf.ready()` prepara antes do treino. Como o modelo aqui é minúsculo, a diferença é imperceptível; em modelos reais ela é decisiva.

#### Redes neurais e como aprendem
Uma rede neural é formada por **camadas de neurônios** conectados por **pesos**. Ela aprende ajustando esses pesos para reduzir o **erro (loss)** entre o que previu e a resposta correta, repetindo o processo muitas vezes (**épocas**) através do algoritmo de *backpropagation* + um *otimizador*.

A rede deste projeto ([`app.component.ts`](./src/app/app.component.ts)):
```ts
const model = tf.sequential();
model.add(tf.layers.dense({ inputShape: [4], units: 16, activation: 'relu' }));   // camada oculta
model.add(tf.layers.dense({ units: 4, activation: 'softmax' }));                   // camada de saída
model.compile({
  optimizer: tf.train.adam(0.03),       // como ajustar os pesos
  loss: 'categoricalCrossentropy',      // como medir o erro (classificação)
  metrics: ['accuracy']
});
```
- **`inputShape: [4]`** → 4 características de entrada.
- **camada oculta (16, relu)** → onde os padrões são aprendidos.
- **saída (4, softmax)** → 4 classes (P/M/G/GG); `softmax` transforma as saídas em **probabilidades que somam 100%**.

---

### Criando sua primeira IA do zero

O coração do projeto é o **ciclo completo de Machine Learning**, todo no navegador:

```
   DADOS  ──►  TREINO  ──►  VALIDAÇÃO  ──►  INFERÊNCIA
```

#### 1. Dados
Os exemplos de treino e seus rótulos (one-hot encoding):
```ts
// Entradas: cada escopo de referência, normalizado entre 0 e 1
readonly escopos = [
  { nome: 'P',  templates: 2,  listas: 1,  estrategias: 4,   colunas: 40 },
  { nome: 'M',  templates: 4,  listas: 4,  estrategias: 12,  colunas: 60 },
  { nome: 'G',  templates: 8,  listas: 8,  estrategias: 32,  colunas: 90 },
  { nome: 'GG', templates: 16, listas: 15, estrategias: 150, colunas: 120 }
];

// Saídas esperadas (one-hot na ordem P, M, G, GG)
const saidas = tf.tensor2d([
  [1, 0, 0, 0],  // P
  [0, 1, 0, 0],  // M
  [0, 0, 1, 0],  // G
  [0, 0, 0, 1]   // GG
]);
```

**Normalização Min-Max** coloca todas as features na mesma escala (0 a 1), evitando que "colunas" (valores grandes) domine "listas" (valores pequenos):
```ts
// (valor - mínimo) / (máximo - mínimo)
const normalizado = (escopo[chave] - minimo) / (maximo - minimo);
```

#### 2. Treino
A rede ajusta seus pesos ao longo de 500 épocas (`model.fit`):
```ts
await model.fit(entradas, saidas, { epochs: 500, shuffle: true, verbose: 0 });
```
Acontece uma única vez, no `ngOnInit` — enquanto isso, a interface mostra *"Treinando modelo"*.

#### 3. Validação
Conceitualmente, é a etapa em que verificamos se o modelo acerta. Neste laboratório a validação é **visual e interativa**: os botões de exemplo (`P`, `M`, `G`, `GG`) reenviam um caso conhecido e você confere se o escopo previsto bate com o esperado.

> ⚠️ Limitação didática: como o modelo é treinado apenas com os 4 exemplos de referência (treino = teste), ele **memoriza** em vez de generalizar. Em um cenário real seriam usados muito mais dados, separados em treino / validação / teste — exatamente o que o [DATASET-TREINAMENTO.md](./DATASET-TREINAMENTO.md) propõe.

#### 4. Inferência
Quando o usuário preenche o formulário e clica em **Determinar escopo**, os dados são normalizados, viram um tensor e passam pela rede, que devolve as probabilidades de cada escopo:
```ts
const valoresPredicao = Array.from(await predicao.data());
this.probabilidades = valoresPredicao
  .map((valor, index) => ({ nome: this.escopos[index].nome, valor }))
  .sort((a, b) => b.valor - a.valor);
this.resultado = this.probabilidades[0].nome;  // escopo mais provável
```

---

## 🗂️ Estrutura relevante

| Arquivo | Papel |
|---|---|
| [`src/app/app.component.ts`](./src/app/app.component.ts) | Dados, criação/treino do modelo, normalização e inferência |
| [`src/app/app.component.html`](./src/app/app.component.html) | Formulário, exemplos e painel de probabilidades |
| [`DATASET-TREINAMENTO.md`](./DATASET-TREINAMENTO.md) | Discussão de como seria um dataset real para o problema |

---

## 🚀 Como executar

Pré-requisitos: **Node.js** e **Angular CLI** (`npm install -g @angular/cli`).

```bash
npm install      # instala as dependências (inclui @tensorflow/tfjs)
npm start        # ou: ng serve
```

Acesse `http://localhost:4200/`. Ao abrir, aguarde a mensagem **"Modelo pronto"** (o treino roda no navegador) e então teste com os botões de exemplo ou com seus próprios valores.

### Outros comandos
```bash
npm run build    # build de produção em dist/
npm test         # testes unitários (Karma + Jasmine)
```

---

## 🧰 Stack

- **Angular 18** (standalone components + Reactive Forms)
- **TensorFlow.js 4** (treino e inferência no navegador)
- **TypeScript 5**

---

## 📚 Próximos passos de estudo

- Variar hiperparâmetros (épocas, *learning rate*, nº de neurônios) e observar o efeito.
- Adicionar features de **intensidade de uso** (execuções/dia, usuários simultâneos) — ver [DATASET-TREINAMENTO.md](./DATASET-TREINAMENTO.md).
- Separar dados em treino / validação / teste e medir a acurácia de verdade.
- Extrair a lógica de ML para um *service* dedicado, desacoplando do componente.
