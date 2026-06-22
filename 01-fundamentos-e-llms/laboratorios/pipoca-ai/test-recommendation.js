/**
 * Task 4.1 - Teste de Fluxo de Recomendação (end-to-end).
 *
 * Valida o motor de recomendação fazendo requisições HTTP reais contra a API:
 *   1. Lista a vitrine inicial do "Usuário Piloto" (vetor zerado [0,0,0]).
 *   2. Dá "like" no filme mais focado em Ação.
 *   3. Mostra o novo embedding do usuário (resposta da rota + confirmação no banco).
 *   4. Lista a vitrine de novo e valida que os títulos de Ação subiram para o topo.
 *
 * Pré-requisito: o servidor precisa estar no ar (npm start) e o Postgres rodando.
 * O script reseta o estado via seed no início, então é determinístico e repetível.
 */

require('dotenv').config();
const { pool } = require('./src/db');
const { runSeed } = require('./src/seed');

const BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const PILOT_NAME = 'Usuário Piloto';
const ACTION_REFERENCE = '[1,0,0]'; // eixo "Ação puro" usado para localizar o filme de Ação

// ---------- Helpers HTTP ----------
async function getShowcase(userId) {
  const res = await fetch(`${BASE_URL}/api/movies?userId=${userId}`);
  if (!res.ok) throw new Error(`GET /api/movies falhou: HTTP ${res.status}`);
  return res.json();
}

async function postInteraction(userId, movieId, action) {
  const res = await fetch(`${BASE_URL}/api/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, movieId, action }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`POST /api/interactions falhou: HTTP ${res.status} - ${JSON.stringify(body)}`);
  return body;
}

// ---------- Helpers de banco (descoberta de IDs e verificação) ----------
function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  return String(value).replace(/^\[|\]$/g, '').split(',').map(Number);
}

async function getPilotUserId() {
  const { rows } = await pool.query(
    'SELECT id FROM user_profiles WHERE user_name = $1 ORDER BY id LIMIT 1',
    [PILOT_NAME]
  );
  if (!rows.length) throw new Error(`Usuário "${PILOT_NAME}" não encontrado. Rode o seed.`);
  return rows[0].id;
}

async function getMostActionMovie() {
  // O operador <=> é a distância de cosseno; o filme mais próximo de [1,0,0] é o de Ação.
  const { rows } = await pool.query(
    `SELECT id, title, embedding FROM movies ORDER BY embedding <=> $1::vector(3) LIMIT 1`,
    [ACTION_REFERENCE]
  );
  if (!rows.length) throw new Error('Nenhum filme encontrado. Rode o seed.');
  return { id: rows[0].id, title: rows[0].title, embedding: parseVector(rows[0].embedding) };
}

async function getUserEmbeddingFromDb(userId) {
  const { rows } = await pool.query('SELECT user_embedding FROM user_profiles WHERE id = $1', [userId]);
  return parseVector(rows[0].user_embedding);
}

// ---------- Apresentação ----------
function printShowcase(label, movies) {
  console.log(`\n${label}`);
  movies.forEach((m, i) => {
    console.log(`  ${i + 1}. [#${m.id}] ${m.title.padEnd(20)} afinidade=${m.affinity}  ${JSON.stringify(m.genres)}`);
  });
}

// ---------- Fluxo principal ----------
async function main() {
  console.log(`Alvo da API: ${BASE_URL}`);

  // Estado determinístico: zera o usuário e repovoa os filmes.
  console.log('\n[setup] Resetando estado via seed...');
  await runSeed();

  const userId = await getPilotUserId();
  const actionMovie = await getMostActionMovie();
  console.log(`[setup] Usuário Piloto = #${userId} | Filme de Ação = #${actionMovie.id} "${actionMovie.title}" ${JSON.stringify(actionMovie.embedding)}`);

  // 1. Vitrine inicial (usuário com vetor [0,0,0]).
  const initial = await getShowcase(userId);
  printShowcase('[1] Vitrine inicial (usuário zerado [0,0,0]):', initial);

  // 2. "Like" no filme de Ação.
  console.log(`\n[2] POST like no filme de Ação #${actionMovie.id} "${actionMovie.title}"...`);
  const interaction = await postInteraction(userId, actionMovie.id, 'like');

  // 3. Evolução do perfil: embedding retornado pela rota + confirmação no banco.
  const dbEmbedding = await getUserEmbeddingFromDb(userId);
  console.log('[3] Embedding atualizado do usuário:');
  console.log(`     via resposta da rota : ${JSON.stringify(interaction.user_embedding)}`);
  console.log(`     confirmado no banco  : ${JSON.stringify(dbEmbedding)}`);

  // 4. Nova vitrine: valida que o filme de Ação subiu ao topo.
  const updated = await getShowcase(userId);
  printShowcase('[4] Vitrine após o like:', updated);

  // ---------- Asserções ----------
  console.log('\n==================== RESULTADO ====================');
  const checks = [];

  const movedToZero = dbEmbedding.some((v) => v !== 0);
  checks.push(['Embedding do usuário deixou de ser [0,0,0]', movedToZero]);

  const topMovie = updated[0];
  checks.push([`Filme de Ação "${actionMovie.title}" está no topo`, topMovie.id === actionMovie.id]);

  const orderChanged = JSON.stringify(initial.map((m) => m.id)) !== JSON.stringify(updated.map((m) => m.id));
  checks.push(['A ordem da vitrine mudou após o like', orderChanged]);

  checks.push(['Afinidade do topo é maior que a do último', topMovie.affinity >= updated[updated.length - 1].affinity]);

  let allPassed = true;
  for (const [desc, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FALHOU'}  ${desc}`);
    if (!ok) allPassed = false;
  }
  console.log('===================================================');
  console.log(allPassed ? '\nTask 4.1: TODOS OS CHECKS PASSARAM ✅' : '\nTask 4.1: HOUVE FALHAS ❌');

  return allPassed;
}

main()
  .then((ok) => {
    process.exitCode = ok ? 0 : 1;
  })
  .catch((err) => {
    console.error('\nTeste falhou com erro:', err.message);
    if (err.cause && err.cause.code === 'ECONNREFUSED') {
      console.error('Dica: o servidor não respondeu. Suba a API com "npm start" antes de rodar o teste.');
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
