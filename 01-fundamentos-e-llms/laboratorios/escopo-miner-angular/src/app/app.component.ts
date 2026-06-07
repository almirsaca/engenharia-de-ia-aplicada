import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import * as tf from '@tensorflow/tfjs';

type CampoEscopo = 'templates' | 'listas' | 'estrategias' | 'colunas';
type NomeEscopo = 'P' | 'M' | 'G' | 'GG';

interface EscopoMiner {
  nome: NomeEscopo;
  templates: number;
  listas: number;
  estrategias: number;
  colunas: number;
}

interface Probabilidade {
  nome: NomeEscopo;
  valor: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  readonly escopos: EscopoMiner[] = [
    { nome: 'P', templates: 2, listas: 1, estrategias: 4, colunas: 40 },
    { nome: 'M', templates: 4, listas: 4, estrategias: 12, colunas: 60 },
    { nome: 'G', templates: 8, listas: 8, estrategias: 32, colunas: 90 },
    { nome: 'GG', templates: 16, listas: 15, estrategias: 150, colunas: 120 }
  ];

  readonly campos: { chave: CampoEscopo; rotulo: string; dica: string }[] = [
    { chave: 'templates', rotulo: 'Templates', dica: 'Quantidade de templates' },
    { chave: 'listas', rotulo: 'Listas', dica: 'Quantidade de listas' },
    { chave: 'estrategias', rotulo: 'Estrategias', dica: 'Quantidade de estrategias' },
    { chave: 'colunas', rotulo: 'Colunas', dica: 'Quantidade total de colunas' }
  ];

  readonly formulario = this.formBuilder.nonNullable.group({
    templates: [4, [Validators.required, Validators.min(0)]],
    listas: [4, [Validators.required, Validators.min(0)]],
    estrategias: [12, [Validators.required, Validators.min(0)]],
    colunas: [60, [Validators.required, Validators.min(0)]]
  });

  carregando = true;
  classificando = false;
  resultado?: NomeEscopo;
  probabilidades: Probabilidade[] = [];
  valoresNormalizados: number[] = [];

  private model?: tf.Sequential;

  async ngOnInit(): Promise<void> {
    await tf.ready();
    this.model = await this.treinarModelo();
    this.carregando = false;
  }

  async classificar(): Promise<void> {
    if (this.formulario.invalid || !this.model) {
      this.formulario.markAllAsTouched();
      return;
    }

    this.classificando = true;
    const valores = this.formulario.getRawValue();
    this.valoresNormalizados = this.normalizarEscopo(valores);

    const entrada = tf.tensor2d([this.valoresNormalizados]);
    const predicao = this.model.predict(entrada) as tf.Tensor;
    const valoresPredicao = Array.from(await predicao.data());

    entrada.dispose();
    predicao.dispose();

    this.probabilidades = valoresPredicao
      .map((valor, index) => ({ nome: this.escopos[index].nome, valor }))
      .sort((a, b) => b.valor - a.valor);
    this.resultado = this.probabilidades[0].nome;
    this.classificando = false;
  }

  usarExemplo(escopo: EscopoMiner): void {
    this.formulario.setValue({
      templates: escopo.templates,
      listas: escopo.listas,
      estrategias: escopo.estrategias,
      colunas: escopo.colunas
    });
    void this.classificar();
  }

  porcentagem(valor: number): string {
    return `${(valor * 100).toFixed(1)}%`;
  }

  private async treinarModelo(): Promise<tf.Sequential> {
    // Cada escopo e uma entrada de treino; a saida usa one-hot encoding na ordem P, M, G e GG.
    const entradas = tf.tensor2d(this.escopos.map((escopo) => this.normalizarEscopo(escopo)));
    const saidas = tf.tensor2d([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ]);

    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [4], units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 4, activation: 'softmax' }));
    model.compile({
      optimizer: tf.train.adam(0.03),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    await model.fit(entradas, saidas, {
      epochs: 500,
      shuffle: true,
      verbose: 0
    });

    entradas.dispose();
    saidas.dispose();
    return model;
  }

  private normalizarEscopo(escopo: Pick<EscopoMiner, CampoEscopo>): number[] {
    return this.campos.map(({ chave }) => {
      const minimo = this.escopos[0][chave];
      const maximo = this.escopos[this.escopos.length - 1][chave];
      // Formula Min-Max: (valor - valor_min) / (valor_max - valor_min).
      const normalizado = (escopo[chave] - minimo) / (maximo - minimo);
      return Math.min(1, Math.max(0, normalizado));
    });
  }
}
