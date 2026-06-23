/**
 * PipocaAI — lógica do frontend (JavaScript puro, sem frameworks).
 *
 * Fluxo:
 *   1. Carrega o perfil do usuário ativo (GET /api/profile) e mostra o embedding.
 *   2. Carrega a vitrine (GET /api/movies?userId=...) e renderiza os cards.
 *   3. Like/Dislike → POST /api/interactions → recarrega perfil + vitrine.
 */

const DIMENSIONS = ['Ação', 'Drama', 'Ficção Científica'];

// Usuário ativo (resolvido pela API; evita id fixo no frontend).
let activeUser = null;

// ---------- Helpers de API ----------
async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

const api = {
  getProfile: () => fetchJson('/api/profile'),
  getMovies: (userId) => fetchJson(`/api/movies?userId=${userId}`),
  interact: (userId, movieId, action) =>
    fetchJson('/api/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, movieId, action }),
    }),
};

// ---------- Renderização do perfil / vetor ----------
function renderProfile(profile) {
  const [acao = 0, drama = 0, scifi = 0] = profile.user_embedding || [];

  document.getElementById('user-name').textContent = `👤 ${profile.user_name}`;
  document.getElementById('vector-raw').textContent =
    `[${acao.toFixed(2)}, ${drama.toFixed(2)}, ${scifi.toFixed(2)}]`;

  const setDim = (key, value) => {
    document.getElementById(`val-${key}`).textContent = value.toFixed(2);
    // Os valores ficam em [0, 1]; convertemos direto para largura percentual.
    document.getElementById(`bar-${key}`).style.width = `${Math.min(100, value * 100)}%`;
  };
  setDim('acao', acao);
  setDim('drama', drama);
  setDim('scifi', scifi);
}

// ---------- Renderização da vitrine ----------
function renderMovies(movies) {
  const grid = document.getElementById('grid');
  const status = document.getElementById('status');
  grid.innerHTML = '';

  if (!movies.length) {
    status.textContent = 'Nenhum filme encontrado. Rode o seed (npm run seed).';
    return;
  }
  status.textContent = '';

  movies.forEach((movie) => {
    const percent = Math.round((movie.affinity ?? 0) * 100);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${movie.title}</h3>
      <div class="genres">
        ${movie.genres.map((g) => `<span class="chip">${g}</span>`).join('')}
      </div>
      <div class="affinity">
        <div class="affinity-top">
          <span>Afinidade</span>
          <span class="affinity-val">${percent}%</span>
        </div>
        <div class="bar"><span style="width:${percent}%"></span></div>
      </div>
      <div class="actions">
        <button class="btn-like" data-action="like">👍 Curtir</button>
        <button class="btn-dislike" data-action="dislike">👎 Descurtir</button>
      </div>
    `;

    card.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => handleInteraction(movie, btn.dataset.action));
    });

    grid.appendChild(card);
  });
}

// ---------- Interação ----------
async function handleInteraction(movie, action) {
  // Desabilita os botões enquanto processa para evitar cliques duplos.
  const buttons = document.querySelectorAll('.actions button');
  buttons.forEach((b) => (b.disabled = true));

  try {
    await api.interact(activeUser.id, movie.id, action);
    showToast(`${action === 'like' ? '👍' : '👎'} "${movie.title}" — perfil atualizado`);
    // Recarrega perfil (vetor mudou) e vitrine (reordenada).
    await refresh();
  } catch (err) {
    showToast(`Erro: ${err.message}`);
    buttons.forEach((b) => (b.disabled = false));
  }
}

// ---------- Toast ----------
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ---------- Orquestração ----------
async function refresh() {
  const profile = await api.getProfile();
  activeUser = profile;
  renderProfile(profile);

  const movies = await api.getMovies(profile.id);
  renderMovies(movies);
}

async function init() {
  try {
    await refresh();
  } catch (err) {
    document.getElementById('user-name').textContent = 'Falha ao carregar';
    document.getElementById('status').textContent =
      `Erro ao conectar à API: ${err.message}. O servidor está no ar? (npm start)`;
  }
}

init();
