// ============================================================
// ruas_osm.cjs — malha viaria da regiao, do OpenStreetMap
//
// Faz duas coisas, e as duas respondem a mesma pergunta do Bryan:
// "nao tem como o programa ler a coordenada e conferir se a rua da
//  OS e a rua da coordenada?"
//
//   VALIDAR — o ponto observado esta a menos de X metros de um
//             trecho de rua com ESSE nome? Se nao esta, a
//             observacao nao pertence aquele endereco e e
//             descartada antes de entrar na biblioteca.
//
//   ENCOSTAR — o ponto que passou na validacao e projetado
//             perpendicularmente sobre o trecho. Deixa de estar no
//             meio da quadra e passa a estar SOBRE a rua.
//
// Roda no PC do Bryan, que tem internet. Baixa uma vez e guarda em
// scripts/ruas_osm.json; nas proximas execucoes le do arquivo.
//
// Uso direto (opcional — o montar_base chama sozinho):
//   node scripts/ruas_osm.cjs            baixa usando a caixa padrao
//   node scripts/ruas_osm.cjs --forcar   baixa de novo por cima
// ============================================================

const fs = require("fs");
const path = require("path");

const ARQ = path.join(__dirname, "ruas_osm.json");
const R = 6371000;

// Espelhos do Overpass. SO OS GLOBAIS.
//
// overpass.osm.ch estava aqui e foi removido: e um espelho regional
// da Suica, nao tem dados do Brasil. Quando a vez calhava nele, ele
// respondia 200 com lista VAZIA e sem erro — nem timeout, nem
// remark, nada. Um servidor que simplesmente nao tem a regiao.
// Resultado: 19 dos 64 quadrados voltaram zerados e passaram por
// bons, e o "sem malha" saltou de 20% para 68%.
const ESPELHOS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function ruaKey(s) {
  let r = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim().replace(/[.,;: ]+$/, "");
  return r.replace(/^AVENIDA\s+/, "AV ").replace(/^PRACA\s+/, "PCA ").replace(/^PCA\.?\s+/, "PCA ")
    .replace(/^TRAVESSA\s+/, "TV ").replace(/^ALAMEDA\s+/, "AL ")
    .replace(/^ESTRADA\s+/, "ESTR ").replace(/^RODOVIA\s+/, "ROD ");
}

// ── baixar ────────────────────────────────────────────────
//
// Tres coisas que a primeira versao errou, e que os espelhos
// devolveram na cara:
//
//   HTTP 406 — o Overpass recusa cliente sem User-Agent. O fetch do
//              Node manda "undici" e leva porta na cara. Precisa
//              dizer quem e voce e um contato.
//   HTTP 429 — pedido grande demais / rapido demais num espelho
//              publico. Pedir 40 x 34 km de uma vez e abusar.
//   vazio    — o espelho respondeu erro em HTML e a gente engoliu.
//
// Por isso agora: cabecalho educado, a area quebrada em quadrados
// de ~5 km, pausa entre eles, e nova tentativa com espera crescente
// quando leva 429. Demora alguns minutos, mas roda UMA vez.
//
// O progresso e salvo a cada quadrado: se cair no meio, rodar de
// novo continua de onde parou em vez de comecar tudo outra vez.

const UA = "pendente-tv/1.0 (uso interno Consorcio Global Interlagos; contato: bmdeodato@gmail.com)";
const PASSO = 0.05;          // ~5,5 km de lado
const PAUSA = 2500;          // ms entre quadrados — nao apanhar de 429
const PARCIAL = path.join(__dirname, "ruas_osm.parcial.json");

const dorme = ms => new Promise(r => setTimeout(r, ms));

async function pedirQuadrado(s, w, n, e, tentativa = 0) {
  const q = `[out:json][timeout:120];way["highway"]["name"](${s},${w},${n},${e});out geom;`;
  const url = ESPELHOS[tentativa % ESPELHOS.length];
  // Alterna POST e GET: alguns espelhos recusam um e aceitam o
  // outro, e o 406 da primeira tentativa foi exatamente esse tipo de
  // implicancia de servidor.
  const usaGet = tentativa % 2 === 1;
  try {
    const res = usaGet
      ? await fetch(url + "?data=" + encodeURIComponent(q),
          { headers: { "User-Agent": UA, "Accept": "application/json" } })
      : await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
            "Accept": "application/json",
          },
          body: "data=" + encodeURIComponent(q),
        });
    if (res.status === 429 || res.status === 504) {
      if (tentativa >= 5) throw new Error("espelhos ocupados demais (429)");
      const espera = 5000 * (tentativa + 1);
      process.stdout.write(` ${res.status}, esperando ${espera / 1000}s...`);
      await dorme(espera);
      return pedirQuadrado(s, w, n, e, tentativa + 1);
    }
    if (!res.ok) {
      if (tentativa >= 5) throw new Error(`HTTP ${res.status}`);
      await dorme(2000);
      return pedirQuadrado(s, w, n, e, tentativa + 1);
    }
    const txt = await res.text();
    if (!txt.trim().startsWith("{")) {            // veio HTML de erro
      if (tentativa >= 5) throw new Error("resposta nao e JSON");
      await dorme(3000);
      return pedirQuadrado(s, w, n, e, tentativa + 1);
    }
    const j = JSON.parse(txt);
    // O Overpass responde 200 com o erro DENTRO do JSON, em "remark".
    // Sem olhar isso, um quadrado que estourou o tempo volta com zero
    // trechos e passa por sucesso — foi o que aconteceu na primeira
    // carga: 11 quadrados vazios, entre eles um cercado por vizinhos
    // com 2 mil e 3 mil trechos.
    if (j.remark && /error|timed out|exceeded/i.test(j.remark)) {
      if (tentativa >= 5) throw new Error("Overpass: " + j.remark.slice(0, 60));
      const espera = 4000 * (tentativa + 1);
      process.stdout.write(` erro do servidor, esperando ${espera / 1000}s...`);
      await dorme(espera);
      return pedirQuadrado(s, w, n, e, tentativa + 1);
    }
    const els = j.elements || [];
    // Lista vazia e SUSPEITA, nao resposta. Quadrado de cidade sem
    // nenhuma rua com nome praticamente nao existe por aqui; o que
    // existe e espelho que nao tem a regiao ou que desistiu em
    // silencio. Entao confirma num segundo espelho antes de aceitar.
    if (!els.length && tentativa < 2) {
      await dorme(2000);
      return pedirQuadrado(s, w, n, e, tentativa + 1);
    }
    return els;
  } catch (err) {
    if (tentativa >= 5) throw err;
    await dorme(3000);
    return pedirQuadrado(s, w, n, e, tentativa + 1);
  }
}

async function baixar(caixa) {
  const porId = new Map();
  let feitos = new Set();
  if (fs.existsSync(PARCIAL)) {
    const pa = JSON.parse(fs.readFileSync(PARCIAL, "utf8"));
    for (const el of pa.elements) porId.set(el.id, el);
    feitos = new Set(pa.feitos);
    console.log(`  retomando: ${feitos.size} quadrado(s) ja baixados, ${porId.size} trechos`);
  }
  const quadrados = [];
  for (let la = Math.floor(caixa.latMin / PASSO) * PASSO; la < caixa.latMax; la += PASSO)
    for (let lo = Math.floor(caixa.lonMin / PASSO) * PASSO; lo < caixa.lonMax; lo += PASSO)
      quadrados.push([+la.toFixed(4), +lo.toFixed(4)]);
  console.log(`  area dividida em ${quadrados.length} quadrados de ~${(PASSO * 111).toFixed(0)} km`);

  let i = 0;
  for (const [la, lo] of quadrados) {
    i++;
    const chave = `${la},${lo}`;
    if (feitos.has(chave)) continue;
    process.stdout.write(`  [${String(i).padStart(3)}/${quadrados.length}] ${chave}`);
    try {
      const els = await pedirQuadrado(la, lo, +(la + PASSO).toFixed(4), +(lo + PASSO).toFixed(4));
      for (const el of els) porId.set(el.id, el);
      feitos.add(chave);
      console.log(` ${els.length} trechos (total ${porId.size})`);
    } catch (e) {
      console.log(` FALHOU: ${e.message}`);
    }
    fs.writeFileSync(PARCIAL, JSON.stringify({ feitos: [...feitos], elements: [...porId.values()] }));
    await dorme(PAUSA);
  }
  if (!porId.size) throw new Error("nenhum quadrado voltou com dado — tente de novo daqui a pouco");
  const faltaram = quadrados.length - feitos.size;
  if (faltaram) console.log(`  ⚠ ${faltaram} quadrado(s) nao vieram. Rodar de novo continua de onde parou.`);
  return { feitos: [...feitos], elements: [...porId.values()] };
}

// ── indice espacial simples ───────────────────────────────
// Uma grade de ~0,005 grau (~500 m). Para achar os trechos perto de
// um ponto basta olhar as 9 celulas ao redor, em vez de varrer as
// dezenas de milhares de ruas da regiao.
const CEL = 0.005;
const chaveCel = (la, lo) => `${Math.floor(la / CEL)}|${Math.floor(lo / CEL)}`;

function montarIndice(osm) {
  const grade = new Map();
  const nomes = new Set();
  let nSeg = 0;
  for (const w of osm.elements || []) {
    const nome = ruaKey(w.tags && w.tags.name);
    if (!nome || !w.geometry || w.geometry.length < 2) continue;
    nomes.add(nome);
    for (let i = 0; i < w.geometry.length - 1; i++) {
      const a = w.geometry[i], b = w.geometry[i + 1];
      const seg = { nome, ax: a.lat, ay: a.lon, bx: b.lat, by: b.lon };
      nSeg++;
      // o segmento entra em todas as celulas que ele toca nas pontas
      for (const [la, lo] of [[a.lat, a.lon], [b.lat, b.lon]]) {
        const k = chaveCel(la, lo);
        if (!grade.has(k)) grade.set(k, []);
        if (!grade.get(k).includes(seg)) grade.get(k).push(seg);
      }
    }
  }
  return { grade, nomes, nSeg };
}

// ── projecao do ponto sobre o segmento ────────────────────
// Em escala de quarteirao da para tratar lat/lon como plano, desde
// que a longitude seja encolhida pelo cosseno da latitude — senao um
// grau de longitude "vale" mais do que vale de verdade e a projecao
// sai torta.
function projetar(la, lo, s) {
  const k = Math.cos(la * Math.PI / 180);
  const px = la, py = lo * k;
  const ax = s.ax, ay = s.ay * k, bx = s.bx, by = s.by * k;
  const dx = bx - ax, dy = by - ay;
  const den = dx * dx + dy * dy;
  let t = den === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / den;
  t = Math.max(0, Math.min(1, t));          // fica dentro do trecho
  const qx = ax + dx * t, qy = ay + dy * t;
  const dist = Math.hypot(px - qx, py - qy) * (Math.PI / 180) * R;
  return { lat: qx, lon: qy / k, dist };
}

// ── o que o montar_base usa ───────────────────────────────
function maisProximoComNome(indice, la, lo, nome, limite) {
  let melhor = null;
  const ci = Math.floor(la / CEL), cj = Math.floor(lo / CEL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const lista = indice.grade.get(`${ci + i}|${cj + j}`);
    if (!lista) continue;
    for (const s of lista) {
      if (s.nome !== nome) continue;
      const p = projetar(la, lo, s);
      if (p.dist <= limite && (!melhor || p.dist < melhor.dist)) melhor = p;
    }
  }
  return melhor;
}

function quadradosDe(caixa) {
  const q = [];
  for (let la = Math.floor(caixa.latMin / PASSO) * PASSO; la < caixa.latMax; la += PASSO)
    for (let lo = Math.floor(caixa.lonMin / PASSO) * PASSO; lo < caixa.lonMax; lo += PASSO)
      q.push(`${+la.toFixed(4)},${+lo.toFixed(4)}`);
  return q;
}

async function carregar(caixa, forcar, completar) {
  if (!forcar && fs.existsSync(ARQ)) {
    const osm = JSON.parse(fs.readFileSync(ARQ, "utf8"));
    let feitos = new Set(osm.feitos || []);
    // Arquivo da versao anterior, sem a lista de quadrados: deduz
    // quais tem dado olhando onde a geometria cai. Quadrado sem
    // nenhum ponto dentro e quadrado que nunca veio — e evita ter
    // que rebaixar os 64 de novo por causa de 11.
    if (!osm.feitos) {
      const cel = v => +(Math.floor(v / PASSO) * PASSO).toFixed(4);
      const comDado = new Set();
      for (const w of osm.elements || [])
        for (const g of w.geometry || []) comDado.add(`${cel(g.lat)},${cel(g.lon)}`);
      feitos = new Set(quadradosDe(caixa).filter(k => comDado.has(k)));
    }
    const faltam = quadradosDe(caixa).filter(k => !feitos.has(k));
    if (faltam.length) {
      console.log(`  ⚠ a malha guardada esta INCOMPLETA: ${faltam.length} quadrado(s) nunca vieram.`);
      if (!completar) {
        console.log(`    As ruas dessa area contam como "sem malha" e passam sem conferencia.`);
        console.log(`    Rode com --completar para buscar so o que falta.`);
      } else {
        console.log(`    Buscando os ${faltam.length} que faltam...`);
        const porId = new Map();
        for (const el of osm.elements) porId.set(el.id, el);
        let i = 0;
        for (const k of faltam) {
          i++;
          const [la, lo] = k.split(",").map(Number);
          process.stdout.write(`  [${i}/${faltam.length}] ${k}`);
          try {
            const els = await pedirQuadrado(la, lo, +(la + PASSO).toFixed(4), +(lo + PASSO).toFixed(4));
            for (const el of els) porId.set(el.id, el);
            feitos.add(k);
            console.log(` ${els.length} trechos (total ${porId.size})`);
          } catch (e) { console.log(` FALHOU: ${e.message}`); }
          await dorme(PAUSA);
        }
        const novo = { feitos: [...feitos], elements: [...porId.values()] };
        fs.writeFileSync(ARQ, JSON.stringify(novo));
        const ind2 = montarIndice(novo);
        console.log(`  malha viaria: ${ind2.nomes.size} ruas, ${ind2.nSeg} trechos`);
        return ind2;
      }
    }
    const ind = montarIndice(osm);
    console.log(`  malha viaria: ${ind.nomes.size} ruas, ${ind.nSeg} trechos (de ${path.basename(ARQ)})`);
    return ind;
  }
  console.log("  malha viaria ainda nao baixada — buscando no OpenStreetMap");
  let osm = await baixar(caixa);
  // Nunca substituir um arquivo bom por um pior: se ja existia
  // malha, o novo e a UNIAO dos dois. Uma carga com espelhos
  // sobrecarregados nao pode apagar o que ja tinha vindo.
  if (fs.existsSync(ARQ)) {
    try {
      const velho = JSON.parse(fs.readFileSync(ARQ, "utf8"));
      const porId = new Map();
      for (const el of velho.elements || []) porId.set(el.id, el);
      const antes = porId.size;
      for (const el of osm.elements) porId.set(el.id, el);
      if (porId.size > osm.elements.length)
        console.log(`  juntando com a malha anterior: ${antes} + novos = ${porId.size} trechos`);
      osm = { feitos: [...new Set([...(velho.feitos || []), ...osm.feitos])],
              elements: [...porId.values()] };
    } catch {}
  }
  fs.writeFileSync(ARQ, JSON.stringify(osm));
  try { if (fs.existsSync(PARCIAL)) fs.unlinkSync(PARCIAL); } catch {}
  console.log(`  guardado em ${ARQ} (${(fs.statSync(ARQ).size / 1024 / 1024).toFixed(1)} MB) — nao precisa baixar de novo`);
  const ind = montarIndice(osm);
  console.log(`  malha viaria: ${ind.nomes.size} ruas, ${ind.nSeg} trechos`);
  return ind;
}

module.exports = { carregar, maisProximoComNome, projetar, ruaKey };

// rodando direto: so baixa
if (require.main === module) {
  carregar({ latMin: -24.05, latMax: -23.45, lonMin: -46.95, lonMax: -46.45 },
           process.argv.includes("--forcar"), process.argv.includes("--completar"))
    .then(() => console.log("pronto"))
    .catch(e => { console.error("erro:", e.message); process.exit(1); });
}
