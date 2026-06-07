# 📂 Laboratórios e Práticas do Módulo

Este diretório contém os exercícios práticos, anotações de aula e projetos de aplicação desenvolvidos durante este módulo específico da pós-graduação.

---

## 📝 Resumo do Aprendizado

Neste módulo, os principais conceitos abordados foram:
* [Conceito Chave 1 - ex: Funcionamento de LLMs e Tokenização]
* [Conceito Chave 2 - ex: Engenharia de Prompts na prática]
* [Conceito Chave 3 - ex: Integração com APIs e embeddings]

---

## 🛠️ Estrutura de Projetos e Laboratórios


| Projeto / Lab | Descrição | Tecnologias Utilizadas | Status |
| :--- | :--- | :--- | :---: |
| **`/lab-01-primeira-ia/`** | Criação de uma IA simples rodando direto na Web. | JavaScript, Web ML | 🚀 Concluído |
| **`/lab-02-prompt-eng/`** | Testes de consistência de prompts e redução de alucinação. | OpenAI API, Python | 🔄 Em Progresso |
| **`/projeto-modulo/`** | Aplicação prática integrando IA ao back-end. | Node.js, TypeScript | ⏳ Planejado |

---

## 🚀 Como Executar os Laboratórios Deste Módulo

Para rodar os códigos presentes nesta pasta localmente, siga os passos abaixo:

### 1. Pré-requisitos
Certifique-se de ter instalado em sua máquina:
* Node.js (versão XX ou superior) ou Python (versão 3.x)
* Gerenciador de pacotes (NPM / Pip)

### 2. Configuração de Variáveis de Ambiente
Muitos laboratórios utilizam chaves de API. Crie um arquivo `.env` na raiz do laboratório que deseja rodar (baseado no arquivo `.env.example`) e adicione suas credenciais:
```env
OPENAI_API_KEY=seu_token_aqui
ANTHROPIC_API_KEY=seu_token_aqui
```
*(⚠️ Nunca envie suas chaves reais para o GitHub! O arquivo `.env` já deve estar listado no seu `.gitignore`)*

### 3. Instalação e Execução
Entre na pasta do laboratório específico através do terminal e execute:

```bash
# Navegar até o laboratório
cd lab-01-primeira-ia

# Instalar as dependências
npm install  # ou: pip install -r requirements.txt

# Iniciar o projeto
npm start    # ou: python main.py
```

---

## 📌 Links e Referências Úteis
* [Link para a Documentação Oficial da API Utilizada]
* [Artigo ou leitura complementar recomendada pelo professor]
