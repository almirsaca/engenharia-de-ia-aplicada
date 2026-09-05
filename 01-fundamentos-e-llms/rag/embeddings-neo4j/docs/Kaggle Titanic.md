# Kaggle — Titanic: Machine Learning from Disaster

Documento de **referência**, extraído das páginas públicas da competição em 31/08/2026. Não é indexado pela aplicação: não consta em `CONFIG.pdf.paths`, e seu conteúdo trata de uma competição de machine learning, não da história do Titanic. Misturá-lo ao acervo causaria a mesma deriva de assunto descrita em [Fluxo RAG](./Fluxo%20RAG.md).

- Competição: <https://www.kaggle.com/competitions/titanic>
- Dados: <https://www.kaggle.com/competitions/titanic/data>

## A competição

> *"Start here! Predict survival on the Titanic and get familiar with ML basics."*

| Campo | Valor |
| --- | --- |
| Aberta em | 28/09/2012 |
| Prazo | 01/01/2030 |
| Métrica | Acurácia de categorização |
| Prêmio | Conhecimento (sem premiação em dinheiro) |
| Equipes | 9.718 |
| Submissões | 36.443 |
| Submissões por dia | 10 |
| Linhas na solução | 418 |

É a competição introdutória do Kaggle, permanentemente aberta e usada como primeiro contato com classificação supervisionada.

## O desafio

Da página de descrição:

> *"The sinking of the Titanic is one of the most infamous shipwrecks in history. On April 15, 1912, during her maiden voyage, the widely considered 'unsinkable' RMS Titanic sank after colliding with an iceberg. Unfortunately, there weren't enough lifeboats for everyone onboard, resulting in the death of 1502 out of 2224 passengers and crew.*
>
> *While there was some element of luck involved in surviving, it seems some groups of people were more likely to survive than others. In this challenge, we ask you to build a predictive model that answers the question: 'what sorts of people were more likely to survive?' using passenger data (ie name, age, gender, socio-economic class, etc)."*

> **Nota:** o número de 1.502 mortos diverge das três fontes do acervo em PDF. Ver a seção *Quando as fontes discordam* em [Fluxo RAG](./Fluxo%20RAG.md).

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `train.csv` | Conjunto de treino, **com** o desfecho (`Survived`) de cada passageiro — 891 linhas |
| `test.csv` | Conjunto de teste, **sem** o desfecho — 418 linhas |
| `gender_submission.csv` | Exemplo de submissão que supõe que todas as mulheres sobreviveram |

Formato de submissão: CSV com exatamente 418 linhas mais cabeçalho, e apenas duas colunas.

```text
PassengerId,Survived
892,0
893,1
894,0
```

## Dicionário de dados

| Variável | Definição | Chave |
| --- | --- | --- |
| `survival` | Sobrevivência | 0 = Não, 1 = Sim |
| `pclass` | Classe da passagem | 1 = 1ª, 2 = 2ª, 3 = 3ª |
| `sex` | Sexo | |
| `Age` | Idade em anos | |
| `sibsp` | Nº de irmãos / cônjuges a bordo | |
| `parch` | Nº de pais / filhos a bordo | |
| `ticket` | Número da passagem | |
| `fare` | Tarifa paga | |
| `cabin` | Número da cabine | |
| `embarked` | Porto de embarque | C = Cherbourg, Q = Queenstown, S = Southampton |

### Notas sobre as variáveis

- **`pclass`** — funciona como *proxy* de status socioeconômico: 1ª = alto, 2ª = médio, 3ª = baixo.
- **`age`** — fracionária quando menor que 1. Idades estimadas terminam em `.5`.
- **`sibsp`** — irmão inclui meio-irmão e enteado; cônjuge considera marido e esposa (amantes e noivos foram ignorados).
- **`parch`** — pai/mãe e filho(a), incluindo enteados. Crianças que viajaram apenas com babá têm `parch = 0`.

## Como obter os dados

O download pela API do Kaggle exige autenticação — uma requisição anônima retorna `HTTP 401`. É preciso ter conta, aceitar as regras da competição e usar um token de API.

```powershell
# Após criar o token em kaggle.com/settings e salvá-lo em ~/.kaggle/kaggle.json
pip install kaggle
kaggle competitions download -c titanic
```

O conjunto de treino também é amplamente redistribuído fora do Kaggle. O laboratório [titanic-graphrag](../../titanic-graphrag/) usa um espelho público com as mesmas 891 linhas e as mesmas 12 colunas, o que dispensa autenticação.

## Por que estes dados não entram no índice vetorial

O acervo em PDF é texto narrativo, adequado à busca por similaridade. O dataset do Kaggle é **tabular**, e embeddar linhas de passageiros não responde às perguntas que se faria sobre ele.

Uma pergunta como *"quantas mulheres da 3ª classe sobreviveram?"* exige contar e agrupar registros. A busca vetorial devolve os `k` registros mais parecidos com a pergunta — nunca uma agregação. Dado estruturado quer `COUNT` e `GROUP BY`; texto quer similaridade de cosseno.

É por isso que os dados de passageiros viraram um **grafo** no Neo4j, em laboratório separado, consultado por Cypher. Ver [titanic-graphrag](../../titanic-graphrag/).
