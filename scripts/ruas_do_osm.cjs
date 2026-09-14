// ============================================================
// Preenche as ruas que a biblioteca nao conhece, usando a malha
// viaria do OpenStreetMap que voce ja baixou.
//
//   node scripts/ruas_do_osm.cjs             so mostra e gera o CSV
//   node scripts/ruas_do_osm.cjs --subir     grava no Supabase
//   node scripts/ruas_do_osm.cjs --raio 25   muda o raio (km)
//
// O QUE ELE FAZ, E O QUE ELE NAO FAZ
//
// A malha tem 25 mil nomes de rua; a biblioteca tem 4,5 mil, que
// sao as ruas onde a turma ja executou alguma coisa. A diferenca
// e quase toda rua comum que simplesmente nunca teve servico.
//
// Para essas, o mapa resolve — mas so quando NAO HA DUVIDA, e a
// duvida aqui tem nome: rua homonima. "Rua Sao Jose" pode existir
// em tres bairros. Entao a regra e:
//
//   o nome aparece em UM traçado so na regiao  ->  cadastra
//   o nome aparece em dois ou mais lugares     ->  NAO cadastra
//
// A segunda lista sai num CSV a parte, para voce resolver a mao —
// e onde o seu conhecimento da regiao vale, e onde nenhum
// automatismo deveria chutar.
//
// A coordenada que sai daqui e o MEIO DA RUA, nunca o numero.
// Serve para mandar a equipe para a rua certa, que e o objetivo.
// Por isso ela entra marcada como origem 'osm' e fica atras de
// tudo que veio de execucao real.
// ============================================================

const fs = require("fs");
const path = require("path");
const osm = require("./ruas_osm.cjs");
const chave = require("./chave.cjs");

const RAIZ = path.resolve(__dirname, "..");
const F_MALHA = path.join(__dirname, "ruas_osm.json");
const F_BASE = path.join(RAIZ, "src", "coordBase.json");
const F_NOVAS = path.join(__dirname, "ruas_do_osm.csv");
const F_DUVIDA = path.join(__dirname, "ruas_homonimas.csv");

const SUBIR = process.argv.includes("--subir");
const i = process.argv.indexOf("--raio");
const RAIO_POLO = (i > 0 ? Number(process.argv[i + 1]) : 20) * 1000;

const CENTRO = [-23.7537, -46.7004];   // medido nos 13 meses de execucao
const LIGA = 600;                      // m — mesma distancia da coerencia por rua
const LOTE = 500;

const R = 6371000;
const distM = (la1, lo1, la2, lo2) => {
  const p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ── entrada ──────────────────────────────────────────────
if (!fs.existsSync(F_MALHA)) {
  console.error(`Nao achei ${F_MALHA}.`);
  console.error("Rode antes: node scripts/montar_base.cjs ./relatorios --completar");
  process.exit(1);
}
if (!fs.existsSync(F_BASE)) {
  console.error(`Nao achei ${F_BASE}. Rode antes: node scripts/montar_base.cjs ./relatorios`);
  process.exit(1);
}
let malha, base;
try { malha = JSON.parse(fs.readFileSync(F_MALHA, "utf8")); }
catch (e) { console.error(`${F_MALHA} nao e um JSON valido (${e.message}).`); process.exit(1); }
try { base = JSON.parse(fs.readFileSync(F_BASE, "utf8")); }
catch (e) { console.error(`${F_BASE} nao e um JSON valido (${e.message}).`); process.exit(1); }
if (!base?.r) { console.error(`${F_BASE} nao e a base de coordenadas (falta a chave "r").`); process.exit(1); }

const jaTem = new Set(Object.keys(base.r));
console.log(`malha:      ${(malha.elements || []).length} trechos`);
console.log(`biblioteca: ${jaTem.size} ruas ja conhecidas\n`);

// ── agrupa os trechos por nome de rua ────────────────────
const porNome = new Map();
let semNome = 0;
for (const w of malha.elements || []) {
  const nome = osm.ruaKey(w.tags && w.tags.name);
  if (!nome) { semNome++; continue; }
  if (!w.geometry || w.geometry.length < 2) continue;
  // Fora do raio de operacao nao interessa: a malha foi baixada
  // numa caixa retangular, que pega canto de cidade vizinha.
  const dentro = w.geometry.some(g => distM(CENTRO[0], CENTRO[1], g.lat, g.lon) <= RAIO_POLO);
  if (!dentro) continue;
  if (!porNome.has(nome)) porNome.set(nome, []);
  porNome.get(nome).push(w.geometry);
}
console.log(`nomes na malha dentro de ${RAIO_POLO / 1000} km: ${porNome.size}` +
            (semNome ? `  (${semNome} trechos sem nome, ignorados)` : ""));

// ── separa traçados do mesmo nome ────────────────────────
//
// Dois trechos com o mesmo nome sao a MESMA rua se estao perto um
// do outro; sao ruas homonimas se estao longe. Comparar todos os
// pontos contra todos nao termina nunca numa malha deste tamanho,
// entao a ligacao e feita por celula: cada trecho marca as celulas
// de ~600 m por onde passa, e trechos que dividem celula (ou
// celula vizinha) sao o mesmo traçado.
const GRAU = LIGA / 111000;   // ~600 m em graus de latitude
function tracados(geos) {
  const pai = geos.map((_, k) => k);
  const achar = x => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
  const unir = (a, b) => { a = achar(a); b = achar(b); if (a !== b) pai[b] = a; };
  const celula = new Map();   // "y,x" -> primeiro trecho que passou ali
  geos.forEach((g, k) => {
    for (const p of g) {
      const cy = Math.floor(p.lat / GRAU), cx = Math.floor(p.lon / (GRAU / Math.cos(p.lat * Math.PI / 180)));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ch = `${cy + dy},${cx + dx}`;
        if (celula.has(ch)) unir(celula.get(ch), k); else if (!dy && !dx) celula.set(ch, k);
      }
    }
  });
  const grupos = new Map();
  geos.forEach((g, k) => {
    const r = achar(k);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(g);
  });
  return [...grupos.values()];
}

// O ponto que representa a rua e o MEIO DO TRECHO MAIS COMPRIDO,
// medido por distancia percorrida. Nao e o centro geometrico: numa
// rua em L ou em curva, o centro cai fora do asfalto, e o objetivo
// aqui e justamente o ponto ficar na rua.
function meioDaRua(geos) {
  let melhor = null, maior = -1;
  for (const g of geos) {
    let ext = 0;
    for (let k = 1; k < g.length; k++) ext += distM(g[k - 1].lat, g[k - 1].lon, g[k].lat, g[k].lon);
    if (ext > maior) { maior = ext; melhor = g; }
  }
  let ext = 0;
  const acum = [0];
  for (let k = 1; k < melhor.length; k++) {
    ext += distM(melhor[k - 1].lat, melhor[k - 1].lon, melhor[k].lat, melhor[k].lon);
    acum.push(ext);
  }
  const meio = ext / 2;
  let k = 1; while (k < acum.length - 1 && acum[k] < meio) k++;
  const a = melhor[k - 1], b = melhor[k];
  const t = acum[k] > acum[k - 1] ? (meio - acum[k - 1]) / (acum[k] - acum[k - 1]) : 0;
  // Extensao total da rua = soma de todos os trechos do traçado,
  // nao so do mais comprido.
  let total = 0;
  for (const g of geos) for (let j = 1; j < g.length; j++) total += distM(g[j - 1].lat, g[j - 1].lon, g[j].lat, g[j].lon);
  return {
    lat: +(a.lat + (b.lat - a.lat) * t).toFixed(6),
    lon: +(a.lon + (b.lon - a.lon) * t).toFixed(6),
    extensao: Math.round(total),
  };
}

// ── decide rua por rua ───────────────────────────────────
const novas = [], duvidosas = [];
for (const [nome, geos] of porNome) {
  if (jaTem.has(nome)) continue;
  const grupos = tracados(geos);
  if (grupos.length === 1) {
    novas.push({ rua: nome, ...meioDaRua(grupos[0]) });
  } else {
    // Homonima: guarda cada lugar, para voce escolher qual e qual.
    duvidosas.push({ nome, lugares: grupos.map(meioDaRua) });
  }
}
novas.sort((a, b) => a.rua.localeCompare(b.rua));
duvidosas.sort((a, b) => a.nome.localeCompare(b.nome));

console.log(`\nruas novas com traçado unico (cadastraveis): ${novas.length}`);
console.log(`ruas homonimas (2+ lugares, ficam para a mao):  ${duvidosas.length}`);
if (novas.length) {
  const ext = novas.map(n => n.extensao).sort((a, b) => a - b);
  console.log(`  extensao: mediana ${ext[ext.length >> 1]} m | menor ${ext[0]} m | maior ${ext[ext.length - 1]} m`);
}

fs.writeFileSync(F_NOVAS,
  ["rua,lat,lon,extensao_m", ...novas.map(n => `"${n.rua}",${n.lat},${n.lon},${n.extensao}`)].join("\n"), "utf8");
fs.writeFileSync(F_DUVIDA,
  ["rua,lugar,lat,lon,extensao_m",
    ...duvidosas.flatMap(d => d.lugares.map((l, k) => `"${d.nome}",${k + 1},${l.lat},${l.lon},${l.extensao}`))].join("\n"), "utf8");
console.log(`\n${F_NOVAS}`);
console.log(`${F_DUVIDA}   <- as que dependem de voce`);

if (!SUBIR) {
  console.log(`\n(nada foi gravado. Confira o CSV e rode de novo com --subir)`);
  process.exit(0);
}

// ── sobe ─────────────────────────────────────────────────
(async () => {
  const { URL, KEY, H } = chave.ler();
  console.log(`\ndestino: ${URL}/rest/v1/coord_manual`);

  // ANTES de gravar: quais ruas voce ja cadastrou a mao.
  //
  // O upsert casa por (rua, numero), e o cadastro manual de rua
  // inteira usa numero = -1 — o mesmo desta carga. Sem esta
  // consulta, rodar este script passaria por cima do que voce
  // garimpou no mapa, e em silencio. Ponto de coordenada tirado
  // de mapa nunca pode ganhar de ponto que uma pessoa marcou.
  const daMao = new Set();
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${URL}/rest/v1/coord_manual?select=rua&numero=eq.-1&origem=eq.mao`, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, Range: `${de}-${de + 999}` },
    });
    if (!r.ok) throw new Error(`conferindo o que ja e seu: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    for (const d of lote) daMao.add(d.rua);
    if (lote.length < 1000) break;
  }

  const linhas = novas.filter(n => !daMao.has(n.rua)).map(n => ({
    rua: n.rua, numero: -1, lat: n.lat, lon: n.lon,
    origem: "osm", extensao_m: n.extensao,
  }));
  const preservadas = novas.length - linhas.length;
  console.log(`  ${daMao.size} rua(s) ja cadastradas a mao` +
              (preservadas ? ` — ${preservadas} delas estao nesta lista e ficam como estao` : ""));
  console.log("");
  if (!linhas.length) { console.log("nada novo para gravar."); return; }
  let enviadas = 0;
  for (let k = 0; k < linhas.length; k += LOTE) {
    const lote = linhas.slice(k, k + LOTE);
    // on_conflict pela chave primaria: rodar de novo nao duplica.
    // E o que voce cadastrou a mao NAO e sobrescrito, porque o
    // filtro abaixo so manda rua que ainda nao existe la.
    const r = await fetch(`${URL}/rest/v1/coord_manual?on_conflict=rua,numero`, {
      method: "POST", headers: H, body: JSON.stringify(lote),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.log("");
      if (/origem/.test(txt))
        throw new Error("a coluna origem nao existe — rode sql/coord_osm.sql no painel do Supabase primeiro");
      if (r.status === 404 || /coord_manual/.test(txt) && /does not exist|not find/i.test(txt))
        throw new Error("a tabela coord_manual nao existe — rode sql/coord_manual.sql primeiro");
      throw new Error(`lote ${k / LOTE + 1}: ${r.status} ${txt}`);
    }
    enviadas += lote.length;
    process.stdout.write(`\r  enviadas ${enviadas}/${linhas.length}`);
  }
  console.log("\n");
  console.log(`no banco agora: ${await chave.contar(URL, KEY, "coord_manual", "origem=eq.osm")} do mapa` +
              ` | ${await chave.contar(URL, KEY, "coord_manual", "origem=eq.mao")} cadastradas a mao`);
})().catch(e => { console.error(`\nerro: ${e.message}`); process.exit(1); });