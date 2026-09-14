// ============================================================
// A chave do Supabase, lida e conferida num lugar so.
//
// Usado por subir_coordenadas.cjs e ruas_do_osm.cjs. Fica aqui
// porque o Supabase responde 401 "Invalid API key" para tudo —
// chave truncada, quebrada em duas linhas, de outro projeto,
// vencida, ou o "JWT Secret" no lugar da service_role. Como ele
// nao diferencia, quem diferencia somos nos, e nao faz sentido
// manter duas copias dessa conferencia.
//
// Le de scripts/config.json (mesmo formato dos robos):
//   {"supabase":{"url":"https://SEU.supabase.co","key":"<service_role>"}}
// ou das variaveis SUPABASE_URL / SUPABASE_KEY.
// ============================================================

const fs = require("fs");
const path = require("path");

function ler() {
  let URL = process.env.SUPABASE_URL || "";
  let KEY = process.env.SUPABASE_KEY || "";
  const fCfg = path.join(__dirname, "config.json");
  if ((!URL || !KEY) && fs.existsSync(fCfg)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(fCfg, "utf8"));
      URL = URL || cfg.supabase?.url || "";
      KEY = KEY || cfg.supabase?.key || "";
    } catch (e) {
      erro(`config.json existe mas nao e um JSON valido: ${e.message}`);
    }
  }
  if (!URL || !KEY) {
    console.error("Falta a url e a chave do Supabase.");
    console.error(`Crie ${fCfg} com:`);
    console.error(`  {"supabase":{"url":"https://SEU-PROJETO.supabase.co","key":"<service_role>"}}`);
    process.exit(1);
  }
  URL = URL.replace(/\/+$/, "");

  // Copiar do painel costuma trazer quebra de linha junto. Um JWT
  // nao tem espaco nenhum, entao tirar todos e seguro.
  const bruta = KEY;
  KEY = KEY.replace(/\s+/g, "");
  if (KEY !== bruta) console.log("  (a chave tinha espaco/quebra de linha; limpei antes de usar)");

  const refDaUrl = (URL.match(/^https?:\/\/([^.]+)\./) || [])[1] || "";

  if (/^<.*>$/.test(KEY) || /^(sua|seu|cole|troque|chave|key)/i.test(KEY))
    erro("O config.json ainda esta com o texto de exemplo no lugar da chave.",
      `esta la: ${KEY}`,
      "Troque pela chave de verdade — a service_role comeca com eyJ e tem ~220 caracteres.");

  if (/^sb_publishable_/.test(KEY))
    erro("A chave e a publishable (a publica). Aqui precisa ser a secreta.");

  if (!/^sb_secret_/.test(KEY)) {
    const partes = KEY.split(".");
    let carga = null;
    if (partes.length === 3) {
      try { carga = JSON.parse(Buffer.from(partes[1], "base64").toString()); } catch { /* segue */ }
    }
    if (!carga)
      erro("A chave nao esta num formato que o Supabase aceite.",
        `Veio com ${KEY.length} caractere(s) e ${partes.length} parte(s) separadas por ponto;`,
        "a service_role e um JWT: tres partes, comeca com eyJ e tem ~220 caracteres.",
        'Se voce copiou o campo "JWT Secret", nao e esse — e o que fica logo abaixo.');
    if (carga.role !== "service_role")
      erro(`A chave e a "${carga.role}". Aqui precisa ser a service_role.`,
        "A anon nao consegue gravar: as tabelas de coordenada nao tem policy de escrita, de proposito.");
    if (carga.ref && refDaUrl && carga.ref !== refDaUrl)
      erro("A chave e de OUTRO projeto do Supabase.",
        `url aponta para: ${refDaUrl}`, `chave pertence a: ${carga.ref}`);
    if (carga.exp && carga.exp * 1000 < Date.now())
      erro("A chave expirou.", `venceu em ${new Date(carga.exp * 1000).toLocaleDateString("pt-BR")}.`);
  }

  const H = {
    apikey: KEY, Authorization: "Bearer " + KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal,resolution=merge-duplicates",
  };
  return { URL, KEY, H };
}

function erro(...linhas) {
  console.error(linhas[0]);
  for (const l of linhas.slice(1)) console.error("  " + l);
  console.error("  Painel do Supabase -> Settings -> API Keys -> service_role (a secreta).");
  process.exit(1);
}

// Conta no BANCO, nunca no que foi enviado: se o numero nao bater,
// alguma coisa recusou calada.
async function contar(URL, KEY, tabela, filtro = "") {
  const r = await fetch(`${URL}/rest/v1/${tabela}?select=rua${filtro ? "&" + filtro : ""}`, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "count=exact", Range: "0-0" },
  });
  return (r.headers.get("content-range") || "").split("/")[1];
}

module.exports = { ler, contar };