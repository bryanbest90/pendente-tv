// ============================================================
// POST /api/ouvidoria   — função da Vercel (roda no servidor)
//
// O botão "Ouvidoria" do site chama aqui com a data e os e-mails.
// Esta função confere que quem pediu é alguém com pode_importar
// (hoje, só o Bryan) e dispara a tarefa agendada "Ouvidorias do
// e-mail → Pendente-TV" pela API de routines da Anthropic.
//
// Por que existe um intermediário: o token que dispara a tarefa
// não pode ir para o navegador — qualquer um que abrisse o site
// veria. Ele fica só aqui, na variável de ambiente da Vercel.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   ROUTINE_FIRE_URL  https://api.anthropic.com/v1/claude_code/routines/trig_.../fire
//   ROUTINE_TOKEN     sk-ant-oat01-...   (gerado em claude.ai/code/routines)
// ============================================================

const SUPABASE_URL = "https://iggnfikqbdgrvfshxhul.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDgwNTIsImV4cCI6MjEwMTI4NDA1Mn0.Wnpzw5NK9b55oLwBiuFKcmx5rgG5F39Ka-fdho2aH9E";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST" });

  // 1. Quem está pedindo? Precisa estar logado e ter pode_importar.
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!tok) return res.status(401).json({ erro: "Entre com sua conta" });
  const perfil = await fetch(SUPABASE_URL + "/rest/v1/perfis?select=email,pode_importar", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + tok },
  }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!perfil?.[0]?.pode_importar) return res.status(403).json({ erro: "Sem permissão" });

  // 2. Só data e e-mail passam. O texto que vai para a tarefa é
  //    montado aqui, nunca copiado do que o navegador mandou.
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const de = String(b.de || ""), ate = String(b.ate || "");
  const remetentes = [...new Set((b.remetentes || []).map(e => String(e).trim().toLowerCase()))];
  if (!DATA.test(de) || !DATA.test(ate) || de > ate) return res.status(400).json({ erro: "Datas inválidas" });
  if (!remetentes.length || remetentes.length > 10 || !remetentes.every(e => EMAIL.test(e)))
    return res.status(400).json({ erro: "E-mails inválidos (1 a 10)" });
  const dias = (Date.parse(ate) - Date.parse(de)) / 864e5;
  if (dias > 62) return res.status(400).json({ erro: "Período máximo: 2 meses" });

  if (!process.env.ROUTINE_FIRE_URL || !process.env.ROUTINE_TOKEN)
    return res.status(500).json({ erro: "Faltam ROUTINE_FIRE_URL e ROUTINE_TOKEN na Vercel" });

  const texto = `PEDIDO MANUAL\nde: ${de}\nate: ${ate}\nremetentes: ${remetentes.join(", ")}\npedido por: ${perfil[0].email}`;
  const r = await fetch(process.env.ROUTINE_FIRE_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.ROUTINE_TOKEN,
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: texto }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ erro: `A tarefa não iniciou (${r.status})`, detalhe: corpo?.error?.message });
  return res.status(200).json({ ok: true, sessao: corpo.claude_code_session_url || null });
}