// ============================================================
// Sobe o src/coordBase.json para a tabela coord_rua do Supabase.
//
//   node scripts/subir_coordenadas.cjs
//   node scripts/subir_coordenadas.cjs --limpar   apaga o que
//        estiver la antes de subir (use quando uma rua sumiu da
//        base e voce quer que suma do banco tambem)
//
// A chave sai de scripts/config.json — o mesmo formato dos robos:
//
//   {
//     "supabase": {
//       "url": "https://iggnfikqbdgrvfshxhul.supabase.co",
//       "key": "<service_role, a secreta>"
//     }
//   }
//
// Tem que ser a service_role, nao a anon: a tabela nao tem policy
// de escrita nenhuma, de proposito. A service_role ignora RLS.
// Ela roda aqui no seu PC e nunca vai para o navegador nem para o
// git (config.json esta no .gitignore).
//
// Tambem aceita por variavel de ambiente, se preferir:
//   set SUPABASE_URL=...  &  set SUPABASE_KEY=...
//
// E idempotente: manda com upsert pela chave `rua`, entao rodar
// duas vezes da no mesmo. Se cair no meio, rodar de novo termina.
// ============================================================

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ARQ = path.join(RAIZ, "src", "coordBase.json");
const LIMPAR = process.argv.includes("--limpar");
const LOTE = 500;

// ── chave ────────────────────────────────────────────────
let URL = process.env.SUPABASE_URL || "";
let KEY = process.env.SUPABASE_KEY || "";
const fCfg = path.join(__dirname, "config.json");
if ((!URL || !KEY) && fs.existsSync(fCfg)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(fCfg, "utf8"));
    URL = URL || cfg.supabase?.url || "";
    KEY = KEY || cfg.supabase?.key || "";
  } catch (e) {
    console.error(`config.json existe mas nao e um JSON valido: ${e.message}`);
    process.exit(1);
  }
}
if (!URL || !KEY) {
  console.error("Falta a url e a chave do Supabase.");
  console.error(`Crie ${fCfg} com:`);
  console.error(`  {"supabase":{"url":"https://SEU-PROJETO.supabase.co","key":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTcwODA1MiwiZXhwIjoyMTAxMjg0MDUyfQ.ZQyfNn1JxiPkUe-vwmUYL5ebKhsjTjOGnadO49mpY4c"}}`);
  process.exit(1);
}
URL = URL.replace(/\/+$/, "");

// ── a chave, conferida antes de sair mandando ─────────────
//
// O erro que o Supabase devolve para chave errada e sempre o
// mesmo 401 "Invalid API key", nao importa o motivo: chave
// truncada, quebrada em duas linhas no copiar-e-colar, chave de
// OUTRO projeto, ou o "JWT Secret" no lugar da service_role.
// Como ele nao diferencia, quem diferencia e aqui.

// Copiar do painel costuma trazer quebra de linha e espaco junto.
// Um JWT nao tem espaco nenhum, entao tirar todos e seguro — e
// resolve o motivo mais comum de 401.
const KEY_BRUTA = KEY;
KEY = KEY.replace(/\s+/g, "");
if (KEY !== KEY_BRUTA) console.log("  (a chave tinha espaco/quebra de linha; limpei antes de usar)");

const refDaUrl = (URL.match(/^https?:\/\/([^.]+)\./) || [])[1] || "";
const erroChave = (...linhas) => {
  console.error(linhas[0]);
  for (const l of linhas.slice(1)) console.error("  " + l);
  console.error("  Painel do Supabase -> Settings -> API Keys -> service_role (a secreta).");
  process.exit(1);
};

if (/^sb_publishable_/.test(KEY)) {
  erroChave("A chave e a publishable (a publica). Aqui precisa ser a secreta.");
} else if (!/^sb_secret_/.test(KEY)) {
  // Formato JWT (projetos mais antigos, que e o caso deste).
  const partes = KEY.split(".");
  let carga = null;
  if (partes.length === 3) {
    try { carga = JSON.parse(Buffer.from(partes[1], "base64").toString()); } catch { /* segue */ }
  }
  if (!carga) {
    erroChave(
      "A chave nao esta num formato que o Supabase aceite.",
      `Veio com ${KEY.length} caractere(s) e ${partes.length} parte(s) separadas por ponto;`,
      "a service_role e um JWT: tres partes, comeca com eyJ e tem ~220 caracteres.",
      'Se voce copiou o campo "JWT Secret", nao e esse — e o que fica logo abaixo.');
  }
  if (carga.role !== "service_role") {
    erroChave(`A chave e a "${carga.role}". Aqui precisa ser a service_role.`,
      "A anon nao consegue gravar: a tabela coord_rua nao tem policy de escrita, de proposito.");
  }
  if (carga.ref && refDaUrl && carga.ref !== refDaUrl) {
    erroChave("A chave e de OUTRO projeto do Supabase.",
      `url aponta para: ${refDaUrl}`,
      `chave pertence a: ${carga.ref}`);
  }
  if (carga.exp && carga.exp * 1000 < Date.now()) {
    erroChave("A chave expirou.", `venceu em ${new Date(carga.exp * 1000).toLocaleDateString("pt-BR")}.`);
  }
}

// ── dados ────────────────────────────────────────────────
if (!fs.existsSync(ARQ)) {
  console.error(`Nao achei ${ARQ}. Rode antes: node scripts/montar_base.cjs ./relatorios`);
  process.exit(1);
}
// Nao basta o arquivo existir: ele pode ter sido sobrescrito por
// outra coisa com o mesmo nome. Sem esta conferencia o erro sai
// como um stack de JSON.parse, que nao diz o que aconteceu.
let base;
try {
  base = JSON.parse(fs.readFileSync(ARQ, "utf8"));
} catch (e) {
  console.error(`${ARQ} existe mas nao e um JSON valido.`);
  console.error(`  (${e.message})`);
  console.error(`  Provavelmente foi sobrescrito por outro arquivo. Regere com:`);
  console.error(`    node scripts/montar_base.cjs ./relatorios`);
  process.exit(1);
}
if (!base || typeof base.r !== "object" || !base.r) {
  console.error(`${ARQ} e um JSON valido, mas nao e a base de coordenadas`);
  console.error(`  (falta a chave "r" com as ruas). Regere com:`);
  console.error(`    node scripts/montar_base.cjs ./relatorios`);
  process.exit(1);
}
const agora = new Date().toISOString();
const linhas = Object.entries(base.r || {}).map(([rua, ent]) => ({
  rua, p: ent.p, pontos: ent.p.length, atualizado_em: agora,
}));
if (!linhas.length) { console.error("coordBase.json nao tem rua nenhuma."); process.exit(1); }

const enderecos = linhas.reduce((a, l) => a + l.pontos, 0);
console.log(`${ARQ}`);
console.log(`  ${linhas.length} ruas | ${enderecos} enderecos | gerado em ${base.gerado || "?"}`);
console.log(`  destino: ${URL}/rest/v1/coord_rua\n`);

const H = {
  apikey: KEY,
  Authorization: "Bearer " + KEY,
  "Content-Type": "application/json",
  Prefer: "return=minimal,resolution=merge-duplicates",
};

async function principal() {
  if (LIMPAR) {
    process.stdout.write("apagando o que estava la... ");
    const r = await fetch(`${URL}/rest/v1/coord_rua?rua=not.is.null`, { method: "DELETE", headers: H });
    if (!r.ok) { console.log("FALHOU"); throw new Error(`${r.status} ${await r.text()}`); }
    console.log("ok");
  }

  let enviadas = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const r = await fetch(`${URL}/rest/v1/coord_rua?on_conflict=rua`, {
      method: "POST", headers: H, body: JSON.stringify(lote),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.log("");
      // Este e o erro que voce mais provavelmente vai ver: a tabela
      // ainda nao existe porque o sql/coordenadas.sql nao rodou.
      if (r.status === 404 || /coord_rua/.test(txt) && /does not exist|not find/i.test(txt))
        throw new Error("a tabela coord_rua nao existe — rode sql/coordenadas.sql no painel do Supabase primeiro");
      throw new Error(`lote ${i / LOTE + 1}: ${r.status} ${txt}`);
    }
    enviadas += lote.length;
    process.stdout.write(`\r  enviadas ${enviadas}/${linhas.length} ruas`);
  }
  console.log("\n");

  // Confere contando no banco, nao no que eu mandei. Se o numero
  // bater, subiu mesmo; se nao bater, alguma coisa recusou calada.
  const r = await fetch(`${URL}/rest/v1/coord_rua?select=rua`, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "count=exact", Range: "0-0" },
  });
  const total = (r.headers.get("content-range") || "").split("/")[1];
  console.log(`no banco agora: ${total} ruas`);
  if (total && +total !== linhas.length && !LIMPAR)
    console.log(`  (${+total - linhas.length} a mais que o arquivo — sao ruas de cargas antigas.\n   Rode com --limpar se quiser deixar so o que esta no arquivo de hoje.)`);
}

principal().catch(e => { console.error(`\nerro: ${e.message}`); process.exit(1); });