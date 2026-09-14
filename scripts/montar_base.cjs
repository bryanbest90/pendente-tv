// ============================================================
// montar_base.js — transforma os relatorios EXECUÇÕES do GEOCALL
//                  na biblioteca de endereços do polo
//
//   node scripts/montar_base.cjs ./relatorios
//
// Opcoes:
//   --comparar          so mede qual dos 4 eventos e o melhor, e sai
//   --evento "<nome>"   qual evento usar (padrao: Início da Execução)
//   --raio 60           metros de tolerancia ate a rua (padrao 60)
//   --sem-osm           nao confere contra a malha viaria
//   --rebaixar          baixa a malha viaria inteira de novo
//   --completar         busca so os quadrados que faltaram na malha
//
// Le TODOS os .xlsx da pasta, confere cada ponto contra a malha
// viaria do OpenStreetMap, e escreve:
//
//   src/coordBase.json         nuvem de pontos por rua (para o site)
//   scripts/endereco_coord.csv pronto para importar no Supabase
//
// Precisa do pacote xlsx, que o projeto ja tem. Rode da raiz do
// projeto, nao de dentro de scripts/.
//
// ── POR QUE NUVEM DE PONTOS, E NAO UM PONTO POR RUA ──
//
// Medido em agosto: 32% das ruas aparecem em DOIS OU MAIS lugares
// separados por mais de 800 m. Duas causas diferentes se misturam
// nesse numero:
//
//   rua longa   — Av. Carlos Barbosa Santos tem 6 trechos; e uma
//                 avenida so, comprida. Um ponto no meio dela nao
//                 serve para roteirizar.
//   homonimo    — Rua Gilberto Freyre aparece a 10 km de distancia
//                 de si mesma. Sao duas ruas diferentes.
//
// Distancia sozinha nao separa os dois casos. O que separa e o
// NUMERO: guardando a nuvem inteira e escolhendo o ponto cujo
// numero esta mais perto do pedido, os dois casos se resolvem de
// uma vez.
//
// E por isso que vale continuar coletando numero mesmo quando o
// objetivo e achar a rua: o numero nao e o alvo, e a chave que
// diz QUAL PEDACO da rua.
//
// O bairro nao resolve — testei: dos 725 casos de rua em varios
// lugares, o bairro separou 3. Tres.
//
// ── A CONFERENCIA CONTRA A RUA ──
//
// Uma leitura de GPS sozinha erra de 20 a 50 m, e num quarteirao
// denso isso e a rua de tras. Pior: as vezes a leitura vem de muito
// mais longe, e o ponto cai no meio da quadra, sem rua nenhuma.
//
// Por isso, antes de consolidar, cada ponto e conferido contra a
// malha viaria: existe um trecho com ESSE nome a menos de 60 m? Se
// existe, o ponto e projetado sobre ele — passa a estar na rua. Se
// nao existe, a observacao e descartada: ela nao e desse endereco.
//
// A excecao proposital: rua que nao esta no OpenStreetMap (viela
// nao mapeada) nao tem como ser conferida, entao e mantida como
// veio. E exatamente ai que a biblioteca vale mais que um mapa
// pronto — o mapa nao conhece essas ruas, o historico de execucao
// conhece.
// ============================================================

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const osm = require("./ruas_osm.cjs");

const PASTA = process.argv[2] || "./relatorios";
const RAIZ = process.cwd();

// Qual dos quatro eventos define o ponto do endereco.
//   node scripts/montar_base.cjs ./relatorios --evento "Fim da Execução"
//   node scripts/montar_base.cjs ./relatorios --comparar
//
// Medido em agosto, erro mediano contra o consenso das OUTRAS OS do
// mesmo endereco: Fim 19 m, Inicio 23 m, Chegada 24 m, Admitida 29 m.
// Praticamente empate, e juntar os tres nao melhora (21 m).
//
// Inicio e o padrao por um motivo que o dado nao mede: no mobile ele
// exige foto, e foto tem que ser no local. O Fim pode carregar a
// posicao de onde o aparelho sincronizou. Na pratica os dois so
// discordam em mais de 500 m em 4% das OS; nesses casos o Inicio
// ficou mais perto do consenso em 24 de 40 — inclina para o Inicio,
// mas com 40 casos isso ainda cabe no acaso.
//
// Rode --comparar quando tiver o ano inteiro: com amostra grande, um
// 60/40 desses vira resposta de verdade.
const iEv = process.argv.indexOf("--evento");
const EVENTO = iEv > 0 ? process.argv[iEv + 1] : "Início da Execução";
const COMPARAR = process.argv.includes("--comparar");
// Conferir o ponto contra a malha viaria do OpenStreetMap: a rua da
// coordenada tem que ser a rua da OS. Sem isso, uma leitura de GPS
// no meio da quadra vira "endereco" e manda a equipe para a rua de
// tras. --sem-osm pula (util para rodar offline).
const SEM_OSM = process.argv.includes("--sem-osm");
const iLim = process.argv.indexOf("--raio");
const RAIO = iLim > 0 ? Number(process.argv[iLim + 1]) : 60;   // metros
const TIPOS = ["Admitida", "Chegada ao Local", "Início da Execução", "Fim da Execução"];
const casaTipo = (a, b) => String(a || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
                        === String(b || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Caixa grosseira, so para cortar o absurdo (Ubatuba, Sorocaba).
// O corte fino e por RAIO, calculado a partir dos proprios pontos —
// caixa fixa e chute, e neste caso era um chute que deixava passar
// ponto a 28 km do polo, la no Limao.
const CAIXA = { latMin: -24.3, latMax: -23.2, lonMin: -47.3, lonMax: -46.2 };
const iRaioP = process.argv.indexOf("--raio-polo");
const RAIO_POLO = (iRaioP > 0 ? Number(process.argv[iRaioP + 1]) : 20) * 1000;

// ── normalizacao: tem que ser IDENTICA a do App.jsx ──
function ruaKey(s) {
  let r = String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim().replace(/[.,;: ]+$/, "");
  return r.replace(/^AVENIDA\s+/, "AV ").replace(/^PRACA\s+/, "PCA ").replace(/^PCA\.?\s+/, "PCA ")
    .replace(/^TRAVESSA\s+/, "TV ").replace(/^ALAMEDA\s+/, "AL ")
    .replace(/^ESTRADA\s+/, "ESTR ").replace(/^RODOVIA\s+/, "ROD ");
}
const soNum = s => { const m = String(s ?? "").replace(/\D/g, ""); return m ? parseInt(m, 10) : null; };

// ── leitura ──
const arquivos = fs.readdirSync(PASTA).filter(f => /\.xlsx?$/i.test(f) && !f.startsWith("~$"));
if (!arquivos.length) { console.error(`Nenhum .xlsx em ${PASTA}`); process.exit(1); }
console.log(`${arquivos.length} arquivo(s) em ${PASTA}\n`);

const endPorOS = new Map();   // numero_os -> {rua, num, bairro}
const pontos = [];            // {rua, num, lat, lon}
let lidos = 0, foraDaCaixa = 0, semEndereco = 0;

for (const nome of arquivos) {
  const wb = XLSX.readFile(path.join(PASTA, nome), { cellDates: false });
  const abaExec = wb.SheetNames.find(n => /execu/i.test(n) && !/coorden/i.test(n));
  const abaCoord = wb.SheetNames.find(n => /coorden/i.test(n));
  if (!abaExec || !abaCoord) {
    console.log(`  ⚠ ${nome}: nao achei as abas Execução e Coordenadas — pulando`);
    continue;
  }
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[abaExec], { defval: "" })) {
    const os = String(r["Número OS"] || "").trim();
    const rua = ruaKey(r["Endereço"]);
    if (!os || !rua) continue;
    if (!endPorOS.has(os)) endPorOS.set(os, { rua, num: soNum(r["Número"]), bairro: String(r["Bairro"] || "").trim() });
  }
  let nesse = 0;
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[abaCoord], { defval: "" })) {
    const tipo = String(r["Tipo Atividade"] || "");
    if (!COMPARAR && !casaTipo(tipo, EVENTO)) continue;
    if (COMPARAR && !TIPOS.some(t => casaTipo(tipo, t))) continue;
    const lat = Number(r["Y"]), lon = Number(r["X"]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    lidos++;
    if (lat < CAIXA.latMin || lat > CAIXA.latMax || lon < CAIXA.lonMin || lon > CAIXA.lonMax) { foraDaCaixa++; continue; }
    const os = String(r["Número OS"] || "").trim();
    const e = endPorOS.get(os);
    if (!e) { semEndereco++; continue; }
    pontos.push({ os, tipo, rua: e.rua, num: e.num, lat, lon });
    nesse++;
  }
  console.log(`  ${nome}: ${nesse} pontos`);
}
console.log(`\nlidos ${lidos} | fora do polo ${foraDaCaixa} (${(100 * foraDaCaixa / lidos).toFixed(1)}%) | sem endereco ${semEndereco}`);

const R = 6371000;
const mediana = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

// ── modo --comparar: qual evento descreve melhor o endereco ──
//
// Metodo "deixa-um-de-fora": para cada endereco com 3+ OS, tira uma
// OS e mede a que distancia ela cai do consenso das outras. O evento
// com menor erro e o que mais se repete no mesmo lugar quando
// visitas INDEPENDENTES acontecem — que e exatamente o que se quer
// de uma biblioteca de enderecos.
if (COMPARAR) {
  console.log("\n=== comparacao dos quatro eventos ===");
  console.log("    erro = distancia ate o consenso das OUTRAS OS do mesmo endereco\n");
  for (const t of TIPOS) {
    const porOSt = new Map();
    for (const p of pontos) {
      if (!casaTipo(p.tipo, t)) continue;
      const k = p.os + "|" + p.rua + "|" + (p.num ?? "");
      if (!porOSt.has(k)) porOSt.set(k, { end: p.rua + "|" + (p.num ?? ""), lats: [], lons: [] });
      const g = porOSt.get(k); g.lats.push(p.lat); g.lons.push(p.lon);
    }
    const porEnd = new Map();
    for (const g of porOSt.values()) {
      if (!porEnd.has(g.end)) porEnd.set(g.end, []);
      porEnd.get(g.end).push([mediana(g.lats), mediana(g.lons)]);
    }
    const erros = [];
    for (const lista of porEnd.values()) {
      if (lista.length < 3) continue;
      for (let i = 0; i < lista.length; i++) {
        const resto = lista.filter((_, j) => j !== i);
        const la0 = mediana(resto.map(x => x[0])), lo0 = mediana(resto.map(x => x[1]));
        const p1 = la0 * Math.PI / 180, p2 = lista[i][0] * Math.PI / 180, dl = (lista[i][1] - lo0) * Math.PI / 180;
        const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        erros.push(2 * R * Math.asin(Math.sqrt(h)));
      }
    }
    if (!erros.length) { console.log(`  ${t.padEnd(20)} sem amostra suficiente`); continue; }
    erros.sort((x, y) => x - y);
    const pct = q => erros[Math.floor(erros.length * q)] || 0;
    const bons = erros.filter(d => d <= 50).length, ruins = erros.filter(d => d > 500).length;
    console.log(`  ${t.padEnd(20)} n=${String(erros.length).padStart(6)} | mediana ${Math.round(pct(0.5)).toString().padStart(5)} m`
      + ` | p75 ${Math.round(pct(0.75)).toString().padStart(6)} m | <=50m ${(100 * bons / erros.length).toFixed(0).padStart(2)}%`
      + ` | >500m ${(100 * ruins / erros.length).toFixed(0).padStart(2)}%`);
  }
  console.log(`\nMenor mediana e maior %<=50m = melhor. Rode de novo sem --comparar,`);
  console.log(`usando --evento "<o vencedor>", para gerar a base.\n`);
  process.exit(0);
}

function distM(la1, lo1, la2, lo2) {
  const p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── corte por distancia do centro da operacao ─────────────
//
// O celular as vezes marca o evento longe do servico — de casa, da
// garagem, do posto. Como o endereco vem da OS e a coordenada vem do
// aparelho, isso produz um endereco do polo com coordenada do outro
// lado da cidade, e ele entra como se fosse bom.
//
// Caso real: RUA MARTINHO RODRIGUES, JD GUANHEMBU tinha o nº 10 no
// lugar certo e o nº 12 a 28 km dali, perto do Limao. Como a OS
// pedia justamente o 12, a busca deu casamento EXATO e mandaria a
// equipe para o outro lado de Sao Paulo — com o rotulo de "exato".
//
// O proprio dado separa os dois casos: 99,5% dos pontos estao a ate
// 18 km do centro da operacao, e depois abre um vazio ate os 30 km.
// Cortar em 20 km tira 0,3% e nao encosta na operacao real.
function cortarPorRaio() {
  if (!pontos.length) return;
  const mid = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  const cy = mid(pontos.map(p => p.lat)), cx = mid(pontos.map(p => p.lon));
  const d = pontos.map(p => distM(cy, cx, p.lat, p.lon)).sort((a, b) => a - b);
  const q = f => d[Math.floor(d.length * f)] / 1000;
  const antes = pontos.length;
  const fica = pontos.filter(p => distM(cy, cx, p.lat, p.lon) <= RAIO_POLO);
  console.log(`\ncentro da operacao: ${cy.toFixed(4)}, ${cx.toFixed(4)}`);
  console.log(`  distancia ate o centro: p50 ${q(.5).toFixed(1)} km | p99 ${q(.99).toFixed(1)} km | max ${(d[d.length - 1] / 1000).toFixed(1)} km`);
  console.log(`  fora do raio de ${RAIO_POLO / 1000} km: ${antes - fica.length} (${(100 * (antes - fica.length) / antes).toFixed(2)}%) descartados`);
  pontos.length = 0; pontos.push(...fica);
}

// ── coerencia dentro da rua ───────────────────────────────
//
// Ponto isolado, longe do resto da propria rua, e leitura ruim.
//
// Mas o corte nao pode ser "longe do centro da rua": a Estrada
// Ecoturistica de Parelheiros tem mais de 10 km, e os pontos das
// pontas dela ficam longe do centro sendo perfeitamente corretos.
// Uma primeira versao disto derrubou 26% dos pontos por causa
// exatamente disso.
//
// O que distingue rua comprida de ponto errado nao e a distancia
// ate o centro, e a CONTINUIDADE: numa rua os pontos formam uma
// corrente, cada um perto do vizinho. O ponto errado fica sozinho,
// sem vizinho nenhum por quilometros.
//
// Entao: liga pontos que estao a menos de 600 m um do outro,
// forma grupos, e derruba so o grupo pequeno que ficou a mais de
// 2 km do grupo principal.
function coerenciaPorRua() {
  const porRua = new Map();
  for (const p of pontos) {
    if (!porRua.has(p.rua)) porRua.set(p.rua, []);
    porRua.get(p.rua).push(p);
  }
  const fica = []; let cortados = 0, ruas = 0;
  for (const [, lista] of porRua) {
    if (lista.length < 3) { fica.push(...lista); continue; }
    // grupos por ligacao simples
    const grupo = new Array(lista.length).fill(-1);
    let g = 0;
    for (let i = 0; i < lista.length; i++) {
      if (grupo[i] !== -1) continue;
      const fila = [i]; grupo[i] = g;
      while (fila.length) {
        const a = fila.pop();
        for (let j = 0; j < lista.length; j++) {
          if (grupo[j] !== -1) continue;
          if (distM(lista[a].lat, lista[a].lon, lista[j].lat, lista[j].lon) <= 600) { grupo[j] = g; fila.push(j); }
        }
      }
      g++;
    }
    if (g === 1) { fica.push(...lista); continue; }
    const tam = new Array(g).fill(0);
    grupo.forEach(x => tam[x]++);
    const principal = tam.indexOf(Math.max(...tam));
    const doPrincipal = lista.filter((_, i) => grupo[i] === principal);
    let cortouAqui = 0;
    lista.forEach((p, i) => {
      if (grupo[i] === principal) { fica.push(p); return; }
      // grupo secundario: so cai se for menor E estiver longe
      const perto = doPrincipal.some(q => distM(p.lat, p.lon, q.lat, q.lon) <= 2000);
      if (perto || tam[grupo[i]] >= tam[principal]) fica.push(p);
      else { cortouAqui++; }
    });
    if (cortouAqui) { ruas++; cortados += cortouAqui; }
  }
  console.log(`  coerencia por rua: ${cortados} ponto(s) isolado(s) do resto da propria rua, em ${ruas} rua(s) — descartados`);
  pontos.length = 0; pontos.push(...fica);
}

// ── conferencia contra a malha viaria ─────────────────────
// Tres desfechos por ponto:
//   encostado  achou trecho com o mesmo nome a menos de RAIO m —
//              o ponto e projetado sobre ele e passa a estar na rua
//   descartado a rua existe no OSM mas nenhum trecho dela esta
//              perto — essa observacao nao e desse endereco
//   sem malha  a rua nao existe no OSM (viela nao mapeada) — nao da
//              para conferir, entao mantem como veio. E aqui que a
//              sua biblioteca vale mais que qualquer mapa pronto
async function conferirNaMalha() {
  if (SEM_OSM) { console.log("\n(--sem-osm: conferencia contra a malha viaria pulada)"); return; }
  const lats = pontos.map(p => p.lat), lons = pontos.map(p => p.lon);
  const m = 0.01;   // margem de ~1 km em volta da area de trabalho
  const caixa = { latMin: Math.min(...lats) - m, latMax: Math.max(...lats) + m,
                  lonMin: Math.min(...lons) - m, lonMax: Math.max(...lons) + m };
  console.log(`\nconferindo contra a malha viaria (raio de ${RAIO} m)`);
  console.log(`  area: ${caixa.latMin.toFixed(3)},${caixa.lonMin.toFixed(3)} a ${caixa.latMax.toFixed(3)},${caixa.lonMax.toFixed(3)}`);
  let ind;
  try { ind = await osm.carregar(caixa, process.argv.includes("--rebaixar"), process.argv.includes("--completar")); }
  catch (e) {
    console.log(`  ⚠ ${e.message}`);
    console.log("  seguindo sem a conferencia — a base sai como antes");
    return;
  }
  let encostados = 0, descartados = 0, semMalha = 0, desvios = [];
  const mantidos = [];
  for (const p of pontos) {
    if (!ind.nomes.has(p.rua)) { semMalha++; mantidos.push(p); continue; }
    const q = osm.maisProximoComNome(ind, p.lat, p.lon, p.rua, RAIO);
    if (!q) { descartados++; continue; }
    desvios.push(q.dist);
    p.lat = +q.lat.toFixed(6); p.lon = +q.lon.toFixed(6);
    encostados++; mantidos.push(p);
  }
  desvios.sort((a, b) => a - b);
  const tot = pontos.length;
  console.log(`  encostados na rua: ${encostados} (${(100 * encostados / tot).toFixed(0)}%)` +
              (desvios.length ? ` — deslocamento mediano ${Math.round(desvios[desvios.length >> 1])} m` : ""));
  console.log(`  descartados (a rua existe, o ponto nao estava nela): ${descartados} (${(100 * descartados / tot).toFixed(0)}%)`);
  console.log(`  sem malha (viela nao mapeada, mantido como veio): ${semMalha} (${(100 * semMalha / tot).toFixed(0)}%)`);
  pontos.length = 0; pontos.push(...mantidos);
}

async function principal() {
  // ── consolidacao ──
  // Coordenada = MEDIANA, nunca media: um unico ponto marcado na
  // garagem arrasta a media e nao mexe na mediana.
  //
  // PASSO 1, e o que mais limpa a base: UM PONTO POR OS.
  //
  // A mesma OS gera varios eventos "Fim da Execução" — media de 2,
  // chega a 28. Sao as etapas. E 31% das OS com mais de um evento
  // tem eventos a mais de 500 m um do outro (p90: 31 km): a turma
  // fecha a etapa depois, de outro lugar.
  //
  // Sem este passo a base fica cheia de rua fantasma. Medido: sem
  // ele, 25% das ruas "aparecem em 2+ lugares". Com ele, 1,7%. Os
  // outros 23% nunca existiram — eram OS fechadas de longe.
  const porOS = new Map();
  for (const p of pontos) {
    const k = p.os + "|" + p.rua;
    if (!porOS.has(k)) porOS.set(k, { rua: p.rua, num: p.num, lats: [], lons: [] });
    const g = porOS.get(k); g.lats.push(p.lat); g.lons.push(p.lon);
  }
  const porChave = new Map();
  for (const g of porOS.values()) {
    const k = g.rua + "|" + (g.num ?? "");
    if (!porChave.has(k)) porChave.set(k, { rua: g.rua, num: g.num, lats: [], lons: [] });
    const h = porChave.get(k);
    h.lats.push(mediana(g.lats)); h.lons.push(mediana(g.lons));
  }
  function desvio(lats, lons) {
    if (lats.length < 2) return 0;
    const la0 = mediana(lats), lo0 = mediana(lons);
    const d = lats.map((la, i) => {
      const p1 = la0 * Math.PI / 180, p2 = la * Math.PI / 180, dl = (lons[i] - lo0) * Math.PI / 180;
      const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    });
    return Math.round(mediana(d));
  }

  const base = { fonte: "GEOCALL EXECUÇÕES — evento Fim da Execução", gerado: new Date().toISOString().slice(0, 10), arquivos: arquivos.length, r: {} };
  const csv = ["rua,numero,lat,lon,observacoes,desvio_m"];
  let descartados = 0, nPontos = 0;

  for (const g of porChave.values()) {
    const n = g.lats.length, d = desvio(g.lats, g.lons);
    // Muitas ocorrencias espalhadas por quilometros = endereco
    // administrativo (a OS foi aberta com o endereco de um escritorio
    // e executada em qualquer lugar). Ele se denuncia sozinho.
    if (n >= 5 && d > 500) { descartados++; continue; }
    const lat = +mediana(g.lats).toFixed(6), lon = +mediana(g.lons).toFixed(6);
    if (!base.r[g.rua]) base.r[g.rua] = { p: [] };
    base.r[g.rua].p.push([lat, lon, g.num ?? null, n, d]);
    nPontos++;
    csv.push(`"${g.rua}",${g.num ?? ""},${lat},${lon},${n},${d}`);
  }
  // ordena por numero: o site procura o vizinho mais proximo
  for (const r of Object.values(base.r)) r.p.sort((a, b) => (a[2] ?? 1e9) - (b[2] ?? 1e9));

  const fJson = path.join(RAIZ, "src", "coordBase.json");
  const fCsv = path.join(RAIZ, "scripts", "endereco_coord.csv");
  fs.writeFileSync(fJson, JSON.stringify(base));
  fs.writeFileSync(fCsv, csv.join("\n"), "utf8");

  const ruas = Object.keys(base.r).length;
  console.log(`\nruas: ${ruas} | pontos: ${nPontos} | descartados como administrativo: ${descartados}`);
  console.log(`${fJson}  ${(fs.statSync(fJson).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`${fCsv}  ${(fs.statSync(fCsv).size / 1024 / 1024).toFixed(2)} MB`);
  if (fs.statSync(fJson).size > 1.5e6) {
    console.log(`\n⚠ O JSON passou de 1,5 MB. A partir daqui ele nao deve mais ir dentro do`);
    console.log(`  bundle do site — importe o CSV numa tabela do Supabase e consulte de la.`);
  }

}

cortarPorRaio();
coerenciaPorRua();
conferirNaMalha()
  .then(principal)
  .catch(e => { console.error("erro:", e.message); process.exit(1); });
