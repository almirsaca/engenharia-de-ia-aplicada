📋 Fluxo de Prompts para o Claude

## Prompt 1: Infraestrutura e Banco de Dados (Task 3.1)

Claude, vamos iniciar um projeto utilizando estritamente a metodologia Spec-Driven Development (SDD). 
Utilize o arquivo arquivo completo de especificação técnica (SPEC.md).

Com base exclusivamente na "Task 3.1: Infraestrutura e Banco de Dados", execute as seguintes tarefas:
1. Crie o arquivo `docker-compose.yml` configurando o PostgreSQL estável com suporte à extensão pgvector.
2. Crie o arquivo de inicialização SQL `init.sql` com os comandos necessários para ativar a extensão pgvector e criar as tabelas `movies` e `user_profiles` exatamente com as estruturas e tipos de dados definidos na seção 2.1 (Design).
3. Forneça o comando de terminal para rodar esse ambiente e criar o banco localmente.

Não gere nenhum código referente ao backend ou à inteligência artificial ainda. Foque apenas na infraestrutura.

## Prompt 2: Configuração do Backend e Conexão (Task 3.2)Quando enviar: Após você rodar o Docker com sucesso e o banco estar de pé.

Ótimo trabalho na infraestrutura. O banco de dados PostgreSQL com pgvector já está rodando.
Seguindo o plano do nosso SPEC.md, vamos executar a "Task 3.2: Configuração do Backend".

Por favor, gere:
1. O arquivo `package.json` inicial com as dependências necessárias para rodar o projeto (Express, driver pg, dotenv, e o TensorFlow.js para Node.js: `@tensorflow/tfjs-node`).
2. A estrutura básica de pastas sugerida para o projeto.
3. O código de um arquivo de configuração de banco de dados (ex: `db.js` ou `database.ts`) que gerencie o Pool de conexões com o Postgres via variáveis de ambiente.
4. Um arquivo `server.js` básico que inicialize o Express e teste a conexão com o banco de dados no momento do boot da aplicação.

## Prompt 3: Script de Carga Inicial / Seed (Task 3.3)Quando enviar: Assim que você testar o servidor Node e ele conectar no banco sem erros.

Perfeito, o servidor backend conectou com sucesso ao banco de dados.
Seguindo a ordem natural, vamos executar a "Task 3.3: Carga de Dados Inicial (Seed)".

Preciso que você crie um script utilitário isolado (ex: `seed.js`) que faça o seguinte:
1. Limpe as tabelas caso já existam dados.
2. Popule a tabela `movies` com 5 filmes fictícios representativos. Cada um deve conter títulos, gêneros textuais e um vetor manual de 3 dimensões (Ex: Ação puro: [1.0, 0.0, 0.0], Drama puro: [0.0, 1.0, 0.0], Ficção Científica pura: [0.0, 0.0, 1.0], ou mistos como [0.7, 0.0, 0.7]).
3. Popule a tabela `user_profiles` com um usuário inicial de testes chamado "Usuário Piloto", cujo embedding inicial seja estritamente zerado: [0.0, 0.0, 0.0].

Me explique também como executar esse script de seed usando o Node.js.

## Prompt 4: Rotas da API e Lógica da IA (Task 3.4)Quando enviar: Após rodar o seed e verificar (via DBeaver ou terminal) que as tabelas possuem os dados.

Excelente. Os dados de teste foram inseridos com sucesso no banco de dados.
Agora vamos finalizar a primeira fase com a "Task 3.4: Motor de Recomendação e Rotas".

Implemente no nosso backend Express as rotas seguindo os contratos da seção 2.2 do SPEC.md:

1. Rota `GET /api/movies?userId={id}`:
   - Deve buscar o embedding do usuário solicitado.
   - Deve usar uma query SQL com o operador do pgvector para similaridade de cosseno <=> para trazer os filmes ordenados pela maior afinidade (menor distância de cosseno). Retorne os filmes e a pontuação calculada.

2. Rota `POST /api/interactions`:
   - Deve receber o userId, movieId e action ('like' ou 'dislike').
   - Deve atualizar o array correspondente no perfil do usuário no banco.
   - Deve aplicar uma função matemática/lógica com TensorFlow.js para recalcular o vetor do usuário: se for 'like', o vetor do usuário deve caminhar na direção do vetor do filme; se for 'dislike', deve se afastar. Salve o novo embedding gerado de volta no banco.

Escreva o código dessas rotas de forma limpa e modular.

📋 Passo 2: Envie o Prompt de Validação para o Claude

## Prompt 5: Validação do Motor de Recomendação (Etapa 5 - Validate)

Com base na "Task 4.1: Teste de Fluxo de Recomendação", crie um script utilitário de teste em Node.js (ex: `test-recommendation.js`) para validar o comportamento fim a fim do nosso motor. 

O script deve realizar requisições automáticas (usando `fetch` ou `axios`) para a nossa API simulando o seguinte cenário:
1. Listar vitrine inicial: Faz um GET para o "Usuário Piloto" (com vetor inicial zerado) e exibe a ordem dos filmes retornados.
2. Dar "Like" em um filme: Faz um POST simulando que o usuário deu "like" no filme que possui o embedding focado em Ação.
3. Verificar evolução do perfil: O script deve consultar o banco (ou retornar na rota) para exibir o novo embedding atualizado do usuário.
4. Validar nova recomendação: Faz um novo GET para a vitrine e valida se a ordem dos filmes mudou, trazendo títulos de Ação para o topo devido à similaridade de cosseno.

Forneça o código do script e me explique como executá-lo no terminal.

📋 Passo 2: Envie o Prompt do Frontend para o Claude

## Prompt 6: Claude, atualizei o nosso `SPEC.md` com a seção do Frontend. Como este projeto é para fins de estudo, o objetivo é ver o comportamento dos dados e dos vetores de forma bem clara na tela.

Com base na "Task 5.1" e "Task 5.2", crie os arquivos da nossa interface:
1. `public/index.html`: Contendo a estrutura da página, o painel para exibir o vetor atual do usuário e o container para a vitrine. Inclua um CSS embutido ou separado que seja limpo, moderno e organizado em formato de grade (grid) para os filmes.
2. `public/app.js`: Com a lógica em JavaScript puro que busca os filmes na API, renderiza as porcentagens de afinidade de cada um e gerencia os cliques de "Like/Dislike", atualizando a tela logo em seguida.
3. Modifique o nosso arquivo principal `server.js` do Express para servir esses arquivos estáticos da pasta `public` (utilizando `express.static`).

Me explique como organizar esses arquivos nas pastas e como abrir o sistema no navegador para testar.
