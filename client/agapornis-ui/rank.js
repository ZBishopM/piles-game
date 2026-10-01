// agapornis-ui · rangos de los diales.
//
//   agRank(valor, { pool, top3 }) → { index, id, name, pool, min, next, progreso, top3 }
//     pool: 'fun' (por defecto) | 'glory'
//     top3: true si es de los 3 mejores del mundo en esa clasificación
//
// La misma escalera de nueve en las dos clasificaciones: ocho por umbral, en
// escalones de 100, y el noveno por posición (el Top 3 lo decide quien guarda
// las puntuaciones, no el valor del dial).
//
//   ≤ 1000 · 1001 · 1100 · 1200 · 1300 · 1400 · 1500 · 1600+ · Top 3
//
// Aquí solo hay datos y aritmética, sin DOM, para poder probarla en Node
// (`node --test test/`). El aspecto está en rank.css, y las partículas y las
// animaciones de ascenso y descenso, en rank-fx.js.
(function (root) {
  // Desde qué valor entra cada rango (el primero no tiene suelo).
  const MINS = [null, 1001, 1100, 1200, 1300, 1400, 1500, 1600];
  const TOP3 = 8;
  // Para dibujar el progreso del primer rango, que no tiene suelo.
  const SUELO = 900;

  const RANKS = {
    glory: [
      ['hierro', 'Hierro oxidado'],
      ['bronce', 'Bronce'],
      ['plata', 'Plata'],
      ['oro', 'Oro'],
      ['platino', 'Platino'],
      ['diamante', 'Diamante'],
      ['master', 'Máster'],
      ['gran-master', 'Gran máster'],
      ['top3', 'Top 3 global'],
    ],
    fun: [
      ['carton', 'Cartón'],
      ['juguete', 'Juguete'],
      ['laton', 'Latón'],
      ['caucho', 'Caucho'],
      ['plastico', 'Plástico'],
      ['gominola', 'Gominola'],
      ['dulce', 'Dulce'],
      ['confeti', 'Confeti'],
      ['payaso', 'Payaso'],
    ],
  };

  function agRank(valor, { pool = 'fun', top3 = false } = {}) {
    const p = RANKS[pool] ? pool : 'fun';
    const v = Math.round(valor);
    let index = 0;
    for (let k = 1; k < MINS.length; k++) if (v >= MINS[k]) index = k;
    if (top3) index = TOP3;

    const min = index === TOP3 ? null : MINS[index];
    const next = index >= TOP3 - 1 ? null : MINS[index + 1];
    // Hacia el siguiente rango; el de arriba del todo (y el Top 3) no tienen siguiente por valor.
    const progreso = next === null ? 1 : Math.min(1, Math.max(0, (v - (min ?? SUELO)) / (next - (min ?? SUELO))));
    const [id, name] = RANKS[p][index];
    return { index, id, name, pool: p, min, next, progreso, top3: index === TOP3 };
  }

  agRank.RANKS = RANKS;
  agRank.MINS = MINS;
  agRank.TOP3 = TOP3;

  root.agRank = agRank;
  if (typeof module !== 'undefined' && module.exports) module.exports = { agRank };
})(typeof window !== 'undefined' ? window : globalThis);
