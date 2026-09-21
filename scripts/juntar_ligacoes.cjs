// ============================================================
// Junta o cadastro de ligacoes da Sabesp na biblioteca de
// coordenadas.
//
//   node scripts/montar_base.cjs ./relatorios     (como sempre)
//   node scripts/juntar_ligacoes.cjs              <- NOVO passo
//   node scripts/subir_coordenadas.cjs            (como sempre)
//
// De onde vem scripts/enderecos_ligacao.csv:
//   gerado fora daqui, a partir do pacote SignosMobile da Sabesp
//   (rede_re_ligacao). Cada linha e UM endereco — rua no formato
//   do GEOCALL + numero — com a posicao da ligacao (o cavalete da
//   casa). NAO tem RGI, hidrometro nem nada do cliente: so rua,
//   numero, coordenada e o tubo da rede mais proximo.
//
// Por que a ligacao ganha da execucao quando os dois existem:
//   medido em agosto/2026, o numero da casa da ligacao bate com o
//   da OS em 97% dos casos, e a distancia entre as duas posicoes
//   tem mediana de 20 m — mas o GPS de "Fim da Execucao" tem 10%
//   dos pontos a mais de 2,7 km, porque a turma as vezes fecha a
//   OS ja em outro lugar. A ligacao nao se mexe.
//
// O ponto de ligacao entra marcado: p[5] = "L", e p[7] = setor (SF).
//
// RUA HOMONIMA: a regiao tem 8 "RUA QUATRO", e o numero 72 existe em
// tres delas. Nome + numero nao decide. O que decide e o SETOR: a
// coluna SF da OS e o setor da ligacao batem em 99,8% das OS de 13
// meses. Por isso cada ponto de ligacao carrega o setor, e o site
// procura por rua + numero + SF. Um mesmo numero pode aparecer mais
// de uma vez na rua — uma por setor — e isso e intencional.
//
// Os pontos de execucao (do montar_base) NAO sao sobrescritos: eles
// nao sabem o setor, e trocar "o ponto do numero 72" por uma das tres
// ligacoes seria escolher no escuro. O site prefere a ligacao do
// setor certo e so usa a execucao quando nao ha ligacao.
//
// --com-rede  acrescenta p[6] = [material, diametro, decada] do tubo
//             mais proximo (ate 40 m). Fica DESLIGADO por padrao: a
//             coord_rua e lida sem login, e material/idade da rede
//             e cadastro da Sabesp. Endereco -> coordenada e o que o
//             Google ja mostra; o tubo embaixo da casa, nao.
//
// Precisa rodar DEPOIS do montar_base, toda vez: o montar_base
// reescreve o coordBase.json do zero e apagaria a juncao.
// ============================================================

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ARQ_BASE = path.join(RAIZ, "src", "coordBase.json");
const ARQ_LIG = path.join(RAIZ, "scripts", "enderecos_ligacao.csv");
const COM_REDE = process.argv.includes("--com-rede");

for (const f of [ARQ_BASE, ARQ_LIG]) {
  if (!fs.existsSync(f)) { console.error(`Nao achei ${f}`); process.exit(1); }
}
let base;
try { base = JSON.parse(fs.readFileSync(ARQ_BASE, "utf8")); }
catch (e) { console.error(`${ARQ_BASE} nao e um JSON valido — rode o montar_base de novo.`); process.exit(1); }
if (!base.r) { console.error(`${ARQ_BASE} sem a chave "r" — rode o montar_base de novo.`); process.exit(1); }
if (base.ligacoes) {
  console.error("Este coordBase.json JA recebeu as ligacoes. Rode o montar_base antes para nao juntar duas vezes.");
  process.exit(1);
}

// CSV simples: so a rua pode vir entre aspas
function campos(linha) {
  const out = []; let cur = "", q = false;
  for (const ch of linha) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}

const R = 6371000;
function distM(la1, lo1, la2, lo2) {
  const p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const linhas = fs.readFileSync(ARQ_LIG, "utf8").split(/\r?\n/).filter(Boolean);
const cab = campos(linhas.shift());
const col = n => { const i = cab.indexOf(n); if (i < 0) { console.error(`CSV sem a coluna ${n}`); process.exit(1); } return i; };
const iR = col("rua"), iN = col("numero"), iLa = col("lat"), iLo = col("lon"), iSf = col("sf"),
      iM = col("rede_material"), iD = col("rede_diametro"), iDe = col("rede_decada");

let novos = 0, comExec = 0, ruasNovas = 0;
for (const l of linhas) {
  const c = campos(l);
  const rua = c[iR], num = parseInt(c[iN], 10), lat = +c[iLa], lon = +c[iLo], sf = parseInt(c[iSf], 10);
  if (!rua || !Number.isFinite(num) || !Number.isFinite(lat) || !Number.isFinite(sf)) continue;
  const rede = COM_REDE && c[iM] ? [c[iM], c[iD] ? +c[iD] : null, c[iDe] ? +c[iDe] : null] : null;
  if (!base.r[rua]) { base.r[rua] = { p: [] }; ruasNovas++; }
  const p = base.r[rua].p;
  if (p.some(x => x[2] === num && x[5] !== "L")) comExec++;
  p.push([lat, lon, num, 0, 0, "L", rede, sf]);
  novos++;
}
for (const r of Object.values(base.r)) r.p.sort((a, b) => (a[2] ?? 1e9) - (b[2] ?? 1e9));
base.ligacoes = { arquivo: "enderecos_ligacao.csv", juntado: new Date().toISOString().slice(0, 10), pontos: novos };

fs.writeFileSync(ARQ_BASE, JSON.stringify(base));
const total = Object.values(base.r).reduce((a, r) => a + r.p.length, 0);
console.log(`pontos de ligacao juntados: ${novos} (${comExec} em numeros que ja tinham ponto de execucao)`);
console.log(`ruas novas: ${ruasNovas} | total agora: ${Object.keys(base.r).length} ruas, ${total} enderecos`);
console.log(`${ARQ_BASE}  ${(fs.statSync(ARQ_BASE).size / 1024 / 1024).toFixed(2)} MB`);
console.log(`\nAgora: node scripts/subir_coordenadas.cjs`);