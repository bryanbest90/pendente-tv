// ============================================================
// Mesmo semeador do semear_itinerario.py, em Node — para rodar na
// máquina que tem o robô, onde não há Python instalado.
//
//   node scripts/semear_itinerario.cjs           (grava)
//   node scripts/semear_itinerario.cjs --seco    (só mostra)
//
// Rode DEPOIS do sql/itinerario.sql. Pode rodar de novo quando
// quiser: equipe nova aparece, e o que você corrigiu (tipo, líder,
// whatsapp, os_por_dia, ativa) NÃO é sobrescrito.
//
// Mede, nos últimos 60 dias da tabela execucao: que equipes existem,
// de que tipo cada uma é (pelo nome), quantas OS por dia cada uma
// fecha (MEDIANA dos dias trabalhados — média deixaria um dia de 15
// serviços rápidos virar meta) e de que tipo de equipe é cada TSS.
// Equipe sem execução há mais de 20 dias entra como ativa=false.
// ============================================================
const URL_SB = "https://iggnfikqbdgrvfshxhul.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDgwNTIsImV4cCI6MjEwMTI4NDA1Mn0.Wnpzw5NK9b55oLwBiuFKcmx5rgG5F39Ka-fdho2aH9E";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const SECO = process.argv.includes("--seco");
const DIAS = 60, INATIVA_APOS = 20;

const REGRAS = [["MOTO-ME","MOTO"],["CVV","MOTO"],["CCV","MOTO"],["BCA PAV","ASFALTO"],[" ASF","ASFALTO"],
  [" LNA","LIGAÇÃO"],["REPOSIÇÃO","REPOSIÇÃO"],["REPOSICAO","REPOSIÇÃO"],["VAZAMENTO","VAZAMENTO"],
  ["NORBRASIL","DESOBSTRUÇÃO"],["ESGOTO","ESGOTO"],["OBRAS","OBRAS"]];
const tipoDoNome = n => (REGRAS.find(([c]) => (" " + String(n).toUpperCase()).includes(c)) || [,"OUTROS"])[1];
const liderDoNome = n => { const p = String(n).split("-"); return p.length > 1 ? p[p.length-1].trim() : null; };
const mediana = a => { const s = [...a].sort((x,y)=>x-y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };

async function api(metodo, caminho, corpo, extra) {
  if (SECO && metodo !== "GET") return null;
  const r = await fetch(URL_SB + "/rest/v1/" + caminho, {
    method: metodo, headers: { ...H, ...(extra||{}) }, body: corpo ? JSON.stringify(corpo) : undefined });
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t.trim() ? JSON.parse(t) : null;
}
async function todos(caminho, ps = 1000) {
  const out = []; let de = 0;
  for (;;) {
    const lote = await api("GET", caminho, null, { Range: `${de}-${de+ps-1}` }) || [];
    out.push(...lote);
    if (lote.length < ps) return out;
    de += ps;
  }
}

(async () => {
  const hoje = new Date();
  const desde = new Date(hoje.getTime() - DIAS*864e5).toISOString().slice(0,10);
  const ex = await todos(`execucao?select=equipe,tss,dia&dia=gte.${desde}&order=dia.asc`);
  if (!ex.length) { console.error("Sem execucao nesse periodo — rode o robo dos executados antes."); process.exit(1); }

  let atuais;
  try { atuais = new Set((await todos("equipe?select=nome")).map(r => r.nome)); }
  catch (e) { console.error("Nao achei a tabela equipe (rodou o sql/itinerario.sql?)\n" + e.message); process.exit(1); }

  const porEq = new Map();
  for (const x of ex) {
    if (!porEq.has(x.equipe)) porEq.set(x.equipe, new Map());
    const d = porEq.get(x.equipe); d.set(x.dia, (d.get(x.dia)||0) + 1);
  }
  const novas = [];
  for (const [nome, dias] of porEq) {
    if (atuais.has(nome)) continue;
    const ultimo = [...dias.keys()].sort().pop();
    novas.push({ nome, tipo: tipoDoNome(nome), lider: liderDoNome(nome),
      os_por_dia: Math.max(1, Math.round(mediana([...dias.values()]))),
      ativa: (hoje - new Date(ultimo)) / 864e5 <= INATIVA_APOS,
      observacao: `medido em ${dias.size} dias, ultimo ${ultimo}` });
  }

  const porTss = new Map();
  for (const x of ex) {
    if (!porTss.has(x.tss)) porTss.set(x.tss, new Map());
    const c = porTss.get(x.tss), t = tipoDoNome(x.equipe); c.set(t, (c.get(t)||0) + 1);
  }
  const tss = [...porTss].map(([t, c]) => {
    const tot = [...c.values()].reduce((a,b)=>a+b,0);
    const [tipo, q] = [...c].sort((a,b)=>b[1]-a[1])[0];
    return { tss: t, tipo, confianca: +(q/tot).toFixed(3), execucoes: tot };
  });

  for (let i = 0; i < novas.length; i += 200)
    await api("POST", "equipe?on_conflict=nome", novas.slice(i,i+200), { Prefer: "return=minimal,resolution=ignore-duplicates" });
  for (let i = 0; i < tss.length; i += 200)
    await api("POST", "tss_tipo?on_conflict=tss", tss.slice(i,i+200), { Prefer: "return=minimal,resolution=merge-duplicates" });

  const porTipo = {};
  for (const e of novas) porTipo[e.tipo] = (porTipo[e.tipo]||0) + 1;
  console.log(JSON.stringify({ seco: SECO, execucoes: ex.length, equipes_novas: novas.length,
    equipes_ja_cadastradas: atuais.size, servicos_mapeados: tss.length, por_tipo: porTipo }, null, 1));
})();