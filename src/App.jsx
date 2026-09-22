import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";

// ━━━ SUPABASE ━━━
const SUPABASE_URL = "https://iggnfikqbdgrvfshxhul.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDgwNTIsImV4cCI6MjEwMTI4NDA1Mn0.Wnpzw5NK9b55oLwBiuFKcmx5rgG5F39Ka-fdho2aH9E";
const HEADERS = {"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"};

// A sessao do login precisa chegar la no fundo, no modal de OS, e
// so para saber se aparece o lapis de cadastrar coordenada. Passar
// de mao em mao atravessaria dois componentes que nao tem nada a
// ver com isso (Dashboard e FamilyRow), entao vai por contexto.
const SessaoCtx = React.createContext(null);

// DESOBSTRUÇÃO saiu daqui em 15/09/2026: passou a ser acompanhada na
// aba Pendente por causa da prestadora. São três TSS próprias —
// DESOBSTRUIR REDE DE ESGOTO, DESOBSTRUIR RAMAL DE ESGOTO e
// DESOBSTRUIR RETORNO PARA IMOVEL.
/* ━━━ AGRUPAMENTO DE TSS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Duas TSS que sao o mesmo trabalho no mesmo endereco aparecem
   juntas. Na transformacao de ligacao, a casa 1 sai numa TSS e as
   demais na outra: separadas, a tela sugere duas obras onde ha
   uma.
   ───────────────────────────────────────────────────────── */
const TSS_JUNTAS=[
  {nome:"TRANSFORMAÇÃO LIG COM APROV RAMAL",
   membros:["TRANSFORMAÇÃO LIG EXIST COM APROV RAMAL","TRANSFORMAÇÃO LIG NOVA COM APROV RAMAL"]},
  {nome:"TRANSFORMAÇÃO LIG SEM APROV RAMAL",
   membros:["TRANSFORMAÇÃO LIG EXIST SEM APROV RAMAL","TRANSFORMAÇÃO LIG NOVA SEM APROV RAMAL"]},
];
const TSS_PARA_GRUPO={};
TSS_JUNTAS.forEach(g=>g.membros.forEach(m=>{TSS_PARA_GRUPO[m]=g.nome;}));
const grupoDaTss=t=>TSS_PARA_GRUPO[String(t??"").trim()]||String(t??"").trim();

/* ━━━ SUBGRUPOS DENTRO DA FAMILIA ━━━━━━━━━━━━━━━━━━━━━━━
   REPOSIÇÃO tem 45 TSS diferentes, e abrir a familia despejava
   todas de uma vez. Separadas por tipo de material, viram duas
   listas que alguem consegue ler.

   O que nao estiver em nenhum subgrupo cai em "Outros" — nunca
   some. Na base de 13 meses ha 14 TSS de REPOSIÇÃO fora das duas
   listas, entre elas REPOR ASFALTO A FRIO e ATERRAR VALA; sem o
   Outros, essas 91 execucoes teriam desaparecido da tela sem
   ninguem notar.

   CIMENTADO aparece nas duas grafias de proposito: a lista veio
   escrita "CIMENTATO" e o GEOCALL grava "CIMENTADO". Aceitar as
   duas custa uma linha e evita 16 OS caindo em Outros sem motivo
   aparente.
   ───────────────────────────────────────────────────────── */
const SUBGRUPOS={
  "REPOSIÇÃO":[
    {nome:"ASFALTO", tss:[
      "FRESAR E RECAPEAR PAV ASF RETRABALHO","FRESAR E RECAPEAR PAVIMENTO ASFALTICO",
      "FRESAR RECAPEAR PAVIMENTO ASFALTICO INV",
      "REPOR ASFALTO","REPOR ASFALTO INV","REPOR ASFALTO RETRABALHO",
      "REPOR CAPA ASFALTICA","REPOR CAPA ASFALTICA INV","REPOR CAPA ASFALTICA RETRABALHO",
      // sugestao minha, pelo material — mova se discordar
      "REPOR ASFALTO A FRIO","REPOR ASFALTO A FRIO INV","REPOR ASFALTO A FRIO RETRABALHO",
      "REPOR CAPA ASFALTICA ECOLOGICA","REPOR CAPA ASFALTICA ECOLOGICA INV",
    ]},
    {nome:"PISO", tss:[
      "REPOR BLOQUETE","REPOR BLOQUETE INV","REPOR BLOQUETE RETRABALHO",
      "REPOR CONCRETO","REPOR CONCRETO INV","REPOR CONCRETO RETRABALHO",
      "REPOR GUIA","REPOR GUIA INV","REPOR GUIA RETRABALHO",
      "REPOR PASSEIO ADJACENTE CIMENTADO","REPOR PASSEIO ADJACENTE CIMENTADO INV","REPOR PASSEIO ADJACENTE CIMENTADO RETRABALHO",
      "REPOR PASSEIO ADJACENTE ESPECIAL","REPOR PASSEIO ADJACENTE ESPECIAL INV","REPOR PASSEIO ADJACENTE ESPECIAL RETRABALHO",
      "REPOR PASSEIO RETRABALHO",
      "REPOR PISO INTERNO ESPECIAL","REPOR PISO INTERNO ESPECIAL INV","REPOR PISO INTERNO ESPECIAL RETRABALHO",
      "REPOR SARJETA","REPOR SARJETA INV","REPOR SARJETA RETRABALHO",
      "REPOR PASSEIO OPOSTO CIMENTATO","REPOR PASSEIO OPOSTO CIMENTATO INV","REPOR PASSEIO OPOSTO CIMENTATO RETRABALHO",
      "REPOR PASSEIO OPOSTO CIMENTADO","REPOR PASSEIO OPOSTO CIMENTADO INV","REPOR PASSEIO OPOSTO CIMENTADO RETRABALHO",
      "REPOR PASSEIO OPOSTO ESPECIAL","REPOR PASSEIO OPOSTO ESPECIAL INV","REPOR PASSEIO OPOSTO ESPECIAL RETRABALHO",
      // sugestao minha, pelo material — mova se discordar
      "REPOR PISO INTERNO CIMENTADO","REPOR PISO INTERNO CIMENTADO INV",
      "REPOR PARALELO","REPOR PARALELO INV",
    ]},
  ],
};
const SUB_POR_FAMILIA={};
for(const [fam,gs] of Object.entries(SUBGRUPOS)){
  const m={}; gs.forEach(g=>g.tss.forEach(t=>{m[t]=g.nome;}));
  SUB_POR_FAMILIA[fam]={ordem:gs.map(g=>g.nome),de:m};
}

/* ━━━ VISUAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Leitura de instrumento, com a paleta de sempre — nenhum hex
   foi trocado. O que dá o caráter é a forma:

   · cartão que não fecha: dois colchetes de canto em fio de 1px
   · escala de dez traços atrás da barra de proporção — "42%"
     deixa de ser número que se lê e vira posição que se vê
   · rótulo minúsculo, em caixa alta, bem espaçado
   · número em mono, largura de dígito igual, coluna que não dança
   · brilho no próprio número, e só quando ele é o vermelho;
     moldura brilhando em todo bloco é enfeite, e enfeite em tela
     de trabalho vira ruído
   · canto reto e nenhum emoji
   ───────────────────────────────────────────────────────── */
const FONTE_UI  = `Saira,-apple-system,"Segoe UI",sans-serif`;
const FONTE_NUM = `"Azeret Mono",ui-monospace,SFMono-Regular,monospace`;
const numStyle  = {fontFamily:FONTE_NUM,fontVariantNumeric:"tabular-nums",letterSpacing:"-0.04em"};
const RAIO      = 2;

const EXCLUDED_DISPLAY = ["VISTORIA","CORTE SUPRESSÃO ADM","FISCALIZAÇÃO","SERV COMPLEMENTAR","ABASTECIMENTO"];
// Também saíram três TSS de OUTROS SERVIÇOS DE ESGOTO, na mesma
// data e pelo mesmo motivo: TESTE DE CORANTE OP, LAVAR REDE DE
// ESGOTO PREVENTIVA e LIMPAR POÇO INSPEÇÃO/VISITA A VACUO.
const EXCLUDED_TSS = [
  "RETIRAR LACRE NUMERADO","LIGAÇÃO DE ÁGUA - PROG AGUA LEGAL","DESCARGA EM REDE DE ÁGUA",
  "INSTALAR CAIXA D'ÁGUA","INSTALAR CAIXA UMA (PARTE CIVIL)","PREPARAR INSTALAÇÃO PARA CAIXA D'AGUA",
  "RESTABELECER LIGAÇÃO SERVIÇOS ADICIONAIS","LIGAÇÃO DE ESGOTO - PROG AGUA LEGAL",
  "LIGAÇÃO DE ESGOTO - PROG SE LIGA NA REDE","SUPRIMIR LIGAÇÃO DE POÇO",
  "MANUTENÇÃO EM INSTALAÇÕES ESGOTO SABESP","PROLONGAR REDE DE ESGOTO",
  "REMANEJAR REDE DE ESGOTO","HIDRANTE VAZANDO",
];

// A mesma pergunta estava escrita em quatro lugares, com redações
// ligeiramente diferentes. Regra de negócio copiada é regra que
// diverge: basta alguém mexer em uma cópia. Agora é uma só.
function familiaTssVisivel(familia,tss){
  const fam=String(familia||"").trim(), t=String(tss||"").trim();
  if(EXCLUDED_DISPLAY.includes(fam)) return false;
  if(EXCLUDED_TSS.includes(t)) return false;
  return true;
}
const VALID_ATCS = [923, 929, 299];
// A sigla existe para a lateral recolhida: sem emoji, era o unico
// conteudo do item e a barra ficava com caixas em branco.
const UNITS = [
  { id:"geral", label:"Geral", atc:null, sigla:"GE" },
  { id:"interlagos", label:"Interlagos", atc:923, sigla:"IN" },
  { id:"grajau", label:"Grajaú", atc:929, sigla:"GR" },
  { id:"embu", label:"Embu-Guaçu", atc:299, sigla:"EG" },
];
const UNIT_TO_HISTORICO = { geral: null, interlagos: "Interlagos", grajau: "Grajau", embu: "Embu-Guacu" };

const LIGACAO_AGUA_TSS = [
  'INCLUIR LIG DE ÁGUA EM CAV MÚLTIPLO S/V',
  'LIGAÇÃO DE ÁGUA DIMENSIONADA S/V',
  'LIGAÇÃO DE ÁGUA EM CAVALETE MULTIPLO',
  'LIGAÇÃO DE ÁGUA S/V',
  'SUBSTITUIR LIGAÇÃO DE AGUA',
  'TRANSFORMAÇÃO LIG EXIST COM APROV RAMAL',
  'TRANSFORMAÇÃO LIG EXIST SEM APROV RAMAL',
  'TRANSFORMAÇÃO LIG NOVA COM APROV RAMAL',
  'TRANSFORMAÇÃO LIG NOVA SEM APROV RAMAL',
];
// Normaliza acentos para comparação segura (ÁGUA = AGUA, MÚLTIPLO = MULTIPLO)
// Normaliza rótulos vindos dos relatórios da Sabesp antes de comparar.
// Além de acento e caixa, precisa tratar pontuação e espaço: o mesmo
// serviço aparece como "LIGAÇÃO DE ESGOTO S/V" no pendente e
// "LIGAÇÃO DE ESGOTO S/V." no Resumo do Dia. Sem isso a OS some da
// coluna Na Rua (8 de 229 linhas no relatório de 07/09).
const norm = s => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase()
  .replace(/\s+/g," ")
  .trim()
  .replace(/[.,;:\s]+$/,"");
// Chave real de um item de carteira: a OS sozinha NÃO identifica o trabalho.
// Uma mesma OS carrega várias TSS (o serviço original gera etapas novas com
// o mesmo número), e cada par OS+TSS entra e sai da carteira por conta própria.
const osKey = r => String(r.numero_os||"").trim()+"|"+norm(String(r.tss||"").trim());
const LIGACAO_AGUA_TSS_NORM = LIGACAO_AGUA_TSS.map(norm);
const matchTssLigacao = tss => LIGACAO_AGUA_TSS_NORM.includes(norm(tss||""));

// Famílias que compõem cada frente
const VAZAMENTO_FAMILIAS = [
  'OUTROS SERVIÇOS DE ÁGUA',
  'RAMAL DE ÁGUA',
  'REDE DE ÁGUA',
  'VAZAMENTO DE ÁGUA',
];
const CAVALETE_FAMILIAS = [
  'CAVALETE',
  'HIDRÔMETRO',
  'OUTROS SERVIÇOS DE CAVALETE',
  'REATIV/RELIG/RESTAB',
  'SUPRESSÃO A PEDIDO',
];
const ESGOTO_FAMILIAS = [
  'CONSERTO DE ESGOTO',
  'LIGAÇÃO DE ESGOTO',
  'OUTROS SERVIÇOS DE ESGOTO',
  'PI, PV, TL',
];
const REPOSICAO_FAMILIAS = [
  'REPOSIÇÃO',
  'OUTROS SERVIÇOS DE REPOSIÇÃO',
];

const VAZAMENTO_FAMILIAS_NORM = VAZAMENTO_FAMILIAS.map(norm);
const CAVALETE_FAMILIAS_NORM = CAVALETE_FAMILIAS.map(norm);
const ESGOTO_FAMILIAS_NORM = ESGOTO_FAMILIAS.map(norm);
const REPOSICAO_FAMILIAS_NORM = REPOSICAO_FAMILIAS.map(norm);
const matchFamiliaVazamento = fam => VAZAMENTO_FAMILIAS_NORM.includes(norm(fam||""));
const matchFamiliaCavalete = fam => CAVALETE_FAMILIAS_NORM.includes(norm(fam||""));
const matchFamiliaEsgoto = fam => ESGOTO_FAMILIAS_NORM.includes(norm(fam||""));
const matchFamiliaReposicao = fam => REPOSICAO_FAMILIAS_NORM.includes(norm(fam||""));

// Mapa frente → famílias (para familiaBreakdown)
const FRENTE_FAMILIAS = {
  "VAZAMENTO": VAZAMENTO_FAMILIAS,
  "CAVALETE": CAVALETE_FAMILIAS,
  "MANUTENÇÃO ESGOTO": ESGOTO_FAMILIAS,
  "REPOSIÇÃO": REPOSICAO_FAMILIAS,
};

const FRENTES = {
  "VAZAMENTO":       r => matchFamiliaVazamento(r.familia),
  "CAVALETE":        r => matchFamiliaCavalete(r.familia) && !matchTssLigacao(r.tss),
  "MANUTENÇÃO ESGOTO": r => matchFamiliaEsgoto(r.familia),
  "LIGAÇÃO ÁGUA":    r => matchTssLigacao(r.tss),
  "REPOSIÇÃO":       r => matchFamiliaReposicao(r.familia),
};
const FRENTE_ORDER = ["VAZAMENTO","CAVALETE","MANUTENÇÃO ESGOTO","LIGAÇÃO ÁGUA","REPOSIÇÃO"];

// TSS globalmente excluídas — removidas de TODOS os cálculos (pendente + carteira)
const EXCLUDED_TSS_GLOBAL = [
  'LAVAR REDE DE ESGOTO PREVENTIVA',
  'LIMPAR POÇO INSPEÇÃO/VISITA A VACUO',
  'MANUTENÇÃO EM INSTALAÇÕES ESGOTO SABESP',
  'PROLONGAR REDE DE ESGOTO',
  'REMANEJAR REDE DE ESGOTO',
  'HIDRANTE VAZANDO',
];
const EXCLUDED_TSS_GLOBAL_NORM = new Set(EXCLUDED_TSS_GLOBAL.map(norm));
const isGloballyExcludedTss = tss => EXCLUDED_TSS_GLOBAL_NORM.has(norm(tss||""));

const C = {
  bg:"#0a0f1a",card:"#111827",cardAlt:"#0d1321",border:"#1e293b",
  accent:"#3b82f6",accentBg:"rgba(59,130,246,0.06)",
  green:"#10b981",greenBg:"rgba(16,185,129,0.08)",greenBorder:"rgba(16,185,129,0.25)",
  red:"#ef4444",redBg:"rgba(239,68,68,0.08)",redBorder:"rgba(239,68,68,0.25)",
  text:"#f1f5f9",textMuted:"#94a3b8",textDim:"#64748b",
  headerBg:"#0f172a",rowHover:"rgba(59,130,246,0.04)",
  amber:"#f59e0b",amberBg:"rgba(245,158,11,0.08)",
  sidebar:"#0c1222",sideHover:"rgba(59,130,246,0.08)",sideActive:"rgba(59,130,246,0.14)",
};

/* ── Storage ── */
function saveLocal(obj){try{localStorage.setItem("sabesp-filters-v1",JSON.stringify(obj));}catch{}}
function loadLocal(){try{const d=localStorage.getItem("sabesp-filters-v1");return d?JSON.parse(d):null;}catch{return null;}}
function cacheRows(rows,updatedAt){try{localStorage.setItem("sabesp-cache-v2",JSON.stringify({rows,updatedAt}));}catch{}}
function loadCache(){try{const d=localStorage.getItem("sabesp-cache-v2");return d?JSON.parse(d):null;}catch{return null;}}

/* ── Supabase API ── */
async function fetchRows(){
  const metaRes = await fetch(SUPABASE_URL+"/rest/v1/pendente_meta?id=eq.1&select=updated_at,total_rows",{headers:HEADERS});
  const meta = await metaRes.json();
  const updatedAt = meta[0]?.updated_at || null;
  const allRows = [];
  let from = 0, pageSize = 1000;
  while(true){
    const res = await fetch(SUPABASE_URL+"/rest/v1/pendente_os?select=dados&order=id.asc",{headers:{...HEADERS,"Range":from+"-"+(from+pageSize-1)}});
    if(!res.ok && res.status !== 206) throw new Error("Erro "+res.status);
    const data = await res.json();
    if(!data?.length) break;
    data.forEach(r=>allRows.push(r.dados));
    if(data.length < pageSize) break;
    from += pageSize;
  }
  return { rows: allRows, updatedAt };
}
// Pagina de 1000 em 1000 como as demais buscas.
// Sem isso o Supabase devolve so as 1000 primeiras linhas e, como a ordem
// e dia.asc, quem fica de fora sao os dias MAIS RECENTES — o grafico
// simplesmente parava de crescer. Com ~46 linhas por dia, o corte chegou
// em 08/09/2026, quando o historico passou de 24 dias.
async function fetchHistorico(){
  const allRows=[];let from=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+"/rest/v1/pendente_historico?select=dia,unidade,familia,no_prazo,fora_prazo,total&order=dia.asc",
      {headers:{...HEADERS,"Range":from+"-"+(from+ps-1)}});
    if(!res.ok&&res.status!==206) throw new Error("Erro historico "+res.status);
    const data=await res.json();
    if(!data?.length) break;
    allRows.push(...data);
    if(data.length<ps) break;
    from+=ps;
  }
  return allRows;
}
// Busca mapeamento global TSS→família de TODOS os dados históricos (não só D-2/D-1)
async function fetchTssToFamiliaMap(){
  // Busca do dia mais recente disponível para pegar todos os TSS possíveis
  const map={};
  const allRows=[];let from=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+`/rest/v1/pendente_diario_os?select=tss,familia&order=dia.desc&limit=${ps}&offset=${from}`,{headers:{...HEADERS}});
    if(!res.ok) break;
    const data=await res.json();
    if(!data?.length) break;
    data.forEach(r=>{if(r.tss&&r.familia&&!map[norm(r.tss)]) map[norm(r.tss)]=r.familia;});
    // Se já temos bastante diversidade de TSS, paramos (otimização)
    if(Object.keys(map).length>200||data.length<ps) break;
    from+=ps;
  }
  return map;
}
async function fetchDiarioOS(dia){
  const allRows=[];let from=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+`/rest/v1/pendente_diario_os?dia=eq.${dia}&select=numero_os,familia,unidade,tss,fora_prazo,endereco,numero_end,complemento`,{headers:{...HEADERS,"Range":from+"-"+(from+ps-1)}});
    if(!res.ok&&res.status!==206) break;
    const data=await res.json();
    if(!data?.length)break;
    allRows.push(...data);
    if(data.length<ps)break;
    from+=ps;
  }
  return allRows;
}
/* ── Desde quando a OS está na carteira ──────────────────────
   O pendente do GEOCALL é uma foto do agora: não diz há quanto
   tempo a OS está lá. Quem sabe é a nossa própria série diária.

   Não trazemos a série inteira para o navegador — pedimos ao
   banco só as OS que entraram DEPOIS da data escolhida, que é um
   punhado, e o resto se resolve com um Set. Trazer tudo seria
   dezenas de milhares de linhas para responder uma pergunta que
   cabe num filtro do Postgres.
   ───────────────────────────────────────────────────────────── */
async function fetchEntradaDesde(dia){
  const os=[];let from=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+`/rest/v1/v_os_entrada?entrou_em=gte.${dia}&select=numero_os`,
      {headers:{...HEADERS,"Range":from+"-"+(from+ps-1)}});
    if(!res.ok&&res.status!==206){
      const txt=await res.text().catch(()=>"");
      if(res.status===404||/v_os_entrada/.test(txt))
        throw new Error("a view v_os_entrada ainda não existe no banco — rode sql/entrada_carteira.sql");
      throw new Error("HTTP "+res.status);
    }
    const data=await res.json();
    if(!data?.length)break;
    os.push(...data.map(r=>String(r.numero_os??"").replace(/\D/g,"")));
    if(data.length<ps)break;
    from+=ps;
  }
  // Primeiro dia guardado: antes disso a pergunta não tem resposta,
  // e é melhor a tela avisar do que fingir que tem.
  let primeiroDia=null;
  try{
    const r=await fetch(SUPABASE_URL+"/rest/v1/v_os_entrada?select=primeiro_dia_da_serie&limit=1",{headers:{...HEADERS}});
    if(r.ok)primeiroDia=(await r.json())?.[0]?.primeiro_dia_da_serie??null;
  }catch{}
  return{osSet:new Set(os.filter(Boolean)),primeiroDia};
}

// Execuções confirmadas (relatório Dados Operacionais / Registro de Falhas).
// Fonte da verdade do que foi EXECUTADO — o que sai da carteira sem estar
// aqui saiu por outro motivo (cancelamento, erro de base, encerramento).
//
// Duas origens possíveis, na ordem:
//   v_execucao_publica  — só numero_os, tss, dia. É o que a Carteira
//                         precisa, e é o que sobra para o anon depois
//                         da etapa 2 de sql/producao.sql.
//   execucao            — a tabela cheia, enquanto a etapa 2 não roda.
// A ordem importa: sem o fallback, aplicar a etapa 2 quebraria a
// coluna Baixas silenciosamente.
let FONTE_EXEC=null;
async function fetchExecucao(diaIni,diaFim){
  const tentar=async fonte=>{
    const allRows=[];let from=0;const ps=1000;
    while(true){
      const res=await fetch(SUPABASE_URL+`/rest/v1/${fonte}?dia=gte.${diaIni}&dia=lte.${diaFim}&select=numero_os,tss,dia`,{headers:{...HEADERS,"Range":from+"-"+(from+ps-1)}});
      if(!res.ok&&res.status!==206) return null;
      const data=await res.json();
      if(!data?.length)break;
      allRows.push(...data);
      if(data.length<ps)break;
      from+=ps;
    }
    return allRows;
  };
  for(const fonte of (FONTE_EXEC?[FONTE_EXEC]:["v_execucao_publica","execucao"])){
    const r=await tentar(fonte);
    if(r){FONTE_EXEC=fonte;return r;}
  }
  return [];
}

/* ── Auth (Supabase) — só a aba Produção depende disto ── */
const AUTH_STORE="sabesp-auth-v1";
function loadSess(){try{const d=localStorage.getItem(AUTH_STORE);return d?JSON.parse(d):null;}catch{return null;}}
function saveSess(s){try{s?localStorage.setItem(AUTH_STORE,JSON.stringify(s)):localStorage.removeItem(AUTH_STORE);}catch{}}
const authHeaders=tok=>({"apikey":SUPABASE_KEY,"Authorization":"Bearer "+tok,"Content-Type":"application/json"});

async function authLogin(email,senha){
  const res=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=password",
    {method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},
     body:JSON.stringify({email:email.trim(),password:senha})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(j.error_description||j.msg||j.message||"Login inválido");
  return j; // access_token, refresh_token, expires_at, user
}
async function authRefresh(refresh_token){
  const res=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=refresh_token",
    {method:"POST",headers:{"apikey":SUPABASE_KEY,"Content-Type":"application/json"},
     body:JSON.stringify({refresh_token})});
  if(!res.ok) return null;
  return res.json();
}

// O access_token dura 1 hora, e até aqui ele só era renovado quando a
// página carregava. Quem deixa a aba aberta a manhã inteira — que é o
// uso normal desta tela — tentava gravar com token vencido e levava
// "JWT expired", uma mensagem que não diz nem o que fazer. Agora toda
// escrita passa por aqui antes.
let renovando=null;
async function tokenFresco(sess){
  if(!sess?.refresh_token) return sess?.access_token;
  if(sess.expires_at&&sess.expires_at*1000>Date.now()+60000) return sess.access_token;
  // Duas gravações ao mesmo tempo não podem renovar duas vezes: a
  // primeira renovação invalida o refresh_token que a segunda usaria,
  // e a segunda cairia fora sem motivo aparente.
  if(!renovando) renovando=authRefresh(sess.refresh_token).finally(()=>{renovando=null;});
  const novo=await renovando;
  if(!novo?.access_token) throw new Error("Sua sessão expirou. Entre de novo para gravar.");
  sess.access_token=novo.access_token;
  sess.refresh_token=novo.refresh_token;
  sess.expires_at=novo.expires_at;
  saveSess(sess);
  return sess.access_token;
}

// A RLS de `perfis` devolve só a própria linha — daí a lista de quem
// tem acesso não vaza nem para quem está logado.
async function fetchPerfil(tok){
  const res=await fetch(SUPABASE_URL+"/rest/v1/perfis?select=email,nome,pode_producao,pode_importar",{headers:authHeaders(tok)});
  if(!res.ok) return null;
  const j=await res.json().catch(()=>[]);
  return j?.[0]||null;
}
// Detalhe da produção. Usa a view quando existe (soma no banco, não no
// navegador); se ela não existe ainda, lê a tabela e soma aqui.
async function fetchProducao(tok,diaIni,diaFim){
  const H={...authHeaders(tok)};
  const puxar=async(rota,sel)=>{
    const out=[];let from=0;const ps=1000;
    while(true){
      const res=await fetch(SUPABASE_URL+`/rest/v1/${rota}?dia=gte.${diaIni}&dia=lte.${diaFim}&select=${sel}`,{headers:{...H,"Range":from+"-"+(from+ps-1)}});
      if(!res.ok&&res.status!==206){const t=await res.text();throw new Error(res.status+" "+t.slice(0,160));}
      const data=await res.json();
      if(!data?.length)break;
      out.push(...data);
      if(data.length<ps)break;
      from+=ps;
    }
    return out;
  };
  try{
    const v=await puxar("v_producao_detalhe","dia,equipe,tss,tse,atc,qtd,os_distintas");
    return {rows:v,agregado:true};
  }catch(e){
    const t=await puxar("execucao","dia,equipe,tss,tse,atc,numero_os");
    return {rows:t.map(r=>({...r,qtd:1,os_distintas:1})),agregado:false};
  }
}

// H = cabecalhos do login, igual as outras duas importacoes.
async function uploadRows(rows,H){
  const delRes = await fetch(SUPABASE_URL+"/rest/v1/rpc/limpar_pendente",{method:"POST",headers:{...H,"Prefer":"return=minimal"},body:"{}"});
  if(!delRes.ok) throw new Error("Erro ao limpar: "+await delRes.text());
  const bs=500;
  for(let i=0;i<rows.length;i+=bs){
    const batch=rows.slice(i,i+bs).map(r=>({dados:r}));
    const res=await fetch(SUPABASE_URL+"/rest/v1/pendente_os",{method:"POST",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify(batch)});
    if(!res.ok) throw new Error("Erro lote "+(Math.floor(i/bs)+1)+": "+await res.text());
  }
  const now=new Date().toISOString();
  await fetch(SUPABASE_URL+"/rest/v1/pendente_meta?id=eq.1",{method:"PATCH",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify({updated_at:now,total_rows:rows.length})});
  return{count:rows.length,updatedAt:now};
}

/* ── EM RUA API ── */
// H = cabeçalhos com o token de quem está logado. A importação manual deixou
// de usar a chave anônima do bundle: sem isso, esconder o botão seria enfeite —
// a chave continuaria podendo gravar direto pelo console.
async function uploadEmRua(dia, records, H){
  // Limpar dia antes de importar. Sem checar a resposta, um DELETE recusado
  // fazia o INSERT rodar por cima e duplicar o dia inteiro — em_rua não tem
  // chave única que barrasse isso.
  const del=await fetch(SUPABASE_URL+"/rest/v1/rpc/limpar_em_rua",{method:"POST",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify({p_dia:dia})});
  if(!del.ok) throw new Error("Erro ao limpar o dia: "+await del.text());
  const bs=500;
  for(let i=0;i<records.length;i+=bs){
    const batch=records.slice(i,i+bs);
    const res=await fetch(SUPABASE_URL+"/rest/v1/em_rua",{method:"POST",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify(batch)});
    if(!res.ok) throw new Error("Erro lote em_rua "+(Math.floor(i/bs)+1)+": "+await res.text());
  }
  return records.length;
}
async function fetchEmRua(dia){
  const allRows=[];let from=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+`/rest/v1/em_rua?dia=eq.${dia}&select=equipe,lider,numero_os,tss,status_os,resultado,causa_resultado,endereco,bairro,municipio`,{headers:{...HEADERS,"Range":from+"-"+(from+ps-1)}});
    if(!res.ok&&res.status!==206) break;
    const data=await res.json();
    if(!data?.length)break;
    allRows.push(...data);
    if(data.length<ps)break;
    from+=ps;
  }
  return allRows;
}

/* ── Parse relatório de EXECUÇÃO (Dados Operacionais / Registro de Falhas) ──
   Ao contrário do EM RUA, este cobre um PERÍODO, não um dia. O cabeçalho não
   fica numa linha fixa (vem depois de um bloco de filtros), então é localizado
   procurando "Número da OS". */
function parseExecucaoFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"array",cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        // acha a linha de cabecalho
        let hi=-1;
        for(let i=0;i<Math.min(60,raw.length);i++){
          if((raw[i]||[]).some(v=>String(v||"").trim().toUpperCase()==="NÚMERO DA OS"
                              ||String(v||"").trim().toUpperCase()==="NUMERO DA OS")){hi=i;break;}
        }
        if(hi<0){reject(new Error('Cabeçalho não encontrado — a coluna "Número da OS" não existe neste arquivo. Confira se é o relatório Dados Operacionais.'));return;}
        const hdr=raw[hi].map(h=>String(h||"").trim().toUpperCase());
        const col={};
        const find=(...alts)=>{for(const a of alts){const i=hdr.indexOf(a);if(i>=0)return i;}return -1;};
        col.numero_os=find("NÚMERO DA OS","NUMERO DA OS");
        col.tss=find("TSS");
        col.tse=find("TSE");
        col.dexec=find("DATA DE EXECUÇÃO","DATA DE EXECUCAO");
        col.dcomp=find("DATA DE COMPETÊNCIA","DATA DE COMPETENCIA");
        col.equipe=find("EQUIPE");
        col.atc=find("ATC");
        col.ato=find("ATO");
        col.municipio=find("MUNICÍPIO","MUNICIPIO");
        col.bairro=find("BAIRRO");
        col.logradouro=find("LOGRADOURO");
        col.obs=find("OBSERVAÇÕES DE EXECUÇÃO","OBSERVACOES DE EXECUCAO");
        if(col.numero_os<0||col.tss<0||col.dexec<0){
          reject(new Error("Faltam colunas obrigatórias (Número da OS, TSS ou Data de Execução)."));return;
        }
        // "04/09/2026 17:31" ou objeto Date -> {dia, iso}
        const parseDT=v=>{
          if(v instanceof Date&&!isNaN(v)){
            const p=n=>String(n).padStart(2,"0");
            return{dia:`${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())}`,
                   iso:`${v.getFullYear()}-${p(v.getMonth()+1)}-${p(v.getDate())}T${p(v.getHours())}:${p(v.getMinutes())}:00`};
          }
          const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
          if(!m) return null;
          const hh=String(m[4]||"00").padStart(2,"0"), mm=m[5]||"00";
          return{dia:`${m[3]}-${m[2]}-${m[1]}`,iso:`${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:00`};
        };
        const num=v=>{const m=String(v||"").match(/\d+/);return m?parseInt(m[0],10):null;};
        const get=(row,i)=>i>=0?String(row[i]||"").trim():"";

        const seen=new Set();       // dedup por (OS, TSS, dia)
        const records=[];
        let ignoradas=0;
        for(let r=hi+1;r<raw.length;r++){
          const row=raw[r];
          if(!row||!row.length) continue;
          const os=get(row,col.numero_os), tss=get(row,col.tss);
          if(!os||!tss) continue;
          const dx=parseDT(row[col.dexec]);
          if(!dx){ignoradas++;continue;}
          const key=os+"|"+tss+"|"+dx.dia;
          if(seen.has(key)){ignoradas++;continue;}
          seen.add(key);
          const dc=col.dcomp>=0?parseDT(row[col.dcomp]):null;
          records.push({
            numero_os:os, tss, dia:dx.dia,
            tse:get(row,col.tse)||null,
            data_execucao:dx.iso,
            data_competencia:dc?dc.iso:null,
            equipe:get(row,col.equipe)||null,
            atc:num(get(row,col.atc)),
            ato:String(num(get(row,col.ato))??""),
            municipio:get(row,col.municipio)||null,
            bairro:get(row,col.bairro)||null,
            logradouro:get(row,col.logradouro)||null,
            observacao:get(row,col.obs)||null,
          });
        }
        if(!records.length){reject(new Error("Nenhuma execução válida encontrada no arquivo."));return;}
        const dias=records.map(r=>r.dia).sort();
        resolve({records,ini:dias[0],fim:dias[dias.length-1],ignoradas});
      }catch(err){reject(err);}
    };
    reader.onerror=()=>reject(new Error("Erro ao ler o arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

// Reimporta um periodo: limpa a faixa de datas e regrava.
// Assim reimportar o mesmo mes nao duplica nada.
async function uploadExecucao(records,ini,fim,H){
  const del=await fetch(SUPABASE_URL+"/rest/v1/rpc/limpar_execucao",{
    method:"POST",headers:{...H,"Prefer":"return=minimal"},
    body:JSON.stringify({p_ini:ini,p_fim:fim})});
  if(!del.ok) throw new Error("Erro ao limpar período: "+await del.text());
  const bs=500;
  for(let i=0;i<records.length;i+=bs){
    const res=await fetch(SUPABASE_URL+"/rest/v1/execucao",{
      method:"POST",headers:{...H,"Prefer":"return=minimal"},
      body:JSON.stringify(records.slice(i,i+bs))});
    if(!res.ok) throw new Error("Erro lote execução "+(Math.floor(i/bs)+1)+": "+await res.text());
  }
  return records.length;
}

/* ── Parse EM RUA xlsx ── */

function parseEmRuaFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:"array",cellDates:true});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        if(raw.length<4){reject(new Error("Arquivo EM RUA com poucas linhas"));return;}
        // Row 1 (index 1): "Data" | "DD/MM/YYYY" or date object
        let dia=null;
        const dateRow=raw[1];
        for(let c=0;c<dateRow.length;c++){
          const v=dateRow[c];
          if(v instanceof Date){
            dia=v.toISOString().split("T")[0];break;
          }
          const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if(m){dia=`${m[3]}-${m[2]}-${m[1]}`;break;}
        }
        if(!dia){reject(new Error("Data não encontrada na linha 2"));return;}
        // Row 2 (index 2): headers — find column indices
        const hdr=raw[2].map(h=>String(h||"").trim().toUpperCase());
        const colIdx={};
        const mapping={"EQUIPE":0,"LÍDER":1,"LIDER":1,"NÚMERO OS":3,"NUMERO OS":3,"Nº OS":3,"DESCRIÇÃO TSS":4,"DESCRICAO TSS":4,"TSS":4,"MUNICÍPIO":null,"MUNICIPIO":null,"ENDEREÇO":null,"ENDERECO":null,"BAIRRO":null,"STATUS DA OS":null,"RESULTADO":null,"CAUSA RESULTADO":null};
        hdr.forEach((h,i)=>{
          if(h.includes("EQUIPE")&&!("equipe" in colIdx)) colIdx.equipe=i;
          else if(h.includes("LIDER")||h.includes("LÍDER")) colIdx.lider=i;
          else if(h.includes("NÚMERO OS")||h.includes("NUMERO OS")||h==="Nº OS") colIdx.numero_os=i;
          else if(h.includes("DESCRIÇÃO TSS")||h.includes("DESCRICAO TSS")||(h==="TSS"&&!("tss" in colIdx))) colIdx.tss=i;
          else if(h.includes("MUNICÍPIO")||h.includes("MUNICIPIO")) colIdx.municipio=i;
          else if(h.includes("ENDEREÇO")||h.includes("ENDERECO")) colIdx.endereco=i;
          else if(h==="BAIRRO") colIdx.bairro=i;
          else if(h.includes("STATUS DA OS")||h.includes("STATUS OS")) colIdx.status_os=i;
          else if(h==="RESULTADO"&&!("resultado" in colIdx)) colIdx.resultado=i;
          else if(h.includes("CAUSA")) colIdx.causa_resultado=i;
        });
        // Fallback: use fixed positions if not found
        if(!("equipe" in colIdx)) colIdx.equipe=0;
        if(!("lider" in colIdx)) colIdx.lider=1;
        if(!("numero_os" in colIdx)) colIdx.numero_os=3;
        if(!("tss" in colIdx)) colIdx.tss=4;
        // Parse data rows with equipe fill-down
        const records=[];
        let lastEquipe="";
        let lastLider="";
        for(let r=3;r<raw.length;r++){
          const row=raw[r];
          if(!row||row.length===0) continue;
          const eq=String(row[colIdx.equipe]||"").trim();
          const lid=String(row[colIdx.lider!=null?colIdx.lider:1]||"").trim();
          if(eq) lastEquipe=eq;
          if(lid) lastLider=lid;
          const numOS=String(row[colIdx.numero_os]||"").trim();
          const tss=String(row[colIdx.tss]||"").trim();
          if(!numOS&&!tss) continue; // skip empty rows
          records.push({
            dia,
            equipe:lastEquipe,
            lider:lastLider,
            numero_os:numOS,
            tss,
            status_os:colIdx.status_os!=null?String(row[colIdx.status_os]||"").trim():"",
            resultado:colIdx.resultado!=null?String(row[colIdx.resultado]||"").trim():"",
            causa_resultado:colIdx.causa_resultado!=null?String(row[colIdx.causa_resultado]||"").trim():"",
            endereco:colIdx.endereco!=null?String(row[colIdx.endereco]||"").trim():"",
            bairro:colIdx.bairro!=null?String(row[colIdx.bairro]||"").trim():"",
            municipio:colIdx.municipio!=null?String(row[colIdx.municipio]||"").trim():"",
          });
        }
        resolve({dia,records});
      }catch(err){reject(err);}
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ── Helpers ── */
function sanitize(row){const o={};Object.keys(row).forEach(c=>{let v=row[c];if(v==null)v="";else if(typeof v==="object")v=String(v);o[c]=v;});return o;}
function parseFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const buf=e.target.result;
      const attempts=[{type:"array",cellDates:false},{type:"array",cellDates:false,raw:true},{type:"array"},{type:"binary"}];
      for(const opts of attempts){try{
        const input=opts.type==="binary"?Array.from(new Uint8Array(buf)).map(b=>String.fromCharCode(b)).join(""):buf;
        const wb=XLSX.read(input,opts);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
        if(rows.length>0){resolve(rows);return;}
      }catch{}}
      reject(new Error("Não foi possível ler o arquivo."));
    };reader.onerror=reject;reader.readAsArrayBuffer(file);
  });
}
function tempo(val){const s=String(val).trim();return !s?null:s.startsWith("-")?"fora":"prazo";}
function tempoDays(val){const m=String(val).match(/(-?\d+)d/);return m?parseInt(m[1]):0;}
function fmtDate(iso){if(!iso)return"—";try{const d=new Date(iso);return d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch{return iso;}}
function fmtDiaShort(dia){try{const[y,m,d]=dia.split("-");return`${d}/${m}`;}catch{return dia;}}
function fmtDiaFull(dia){try{const[y,m,d]=dia.split("-");return`${d}/${m}/${y}`;}catch{return dia;}}

/* ── Biblioteca de coordenadas ────────────────────────────
   Vem do relatorio EXECUÇÕES do GEOCALL, evento "Fim da
   Execução" — onde a turma estava ao terminar o servico. E a
   unica fonte que resolve rua homonima e viela: a coordenada de
   ABERTURA da OS nao serve, porque servico aberto de forma
   administrativa cai num escritorio da Sabesp.

   13 meses de historico: 4.523 ruas e 47.246 enderecos, so de
   baixas dadas no celular (a coluna Mobile do relatorio) — baixa
   feita no PC marca o canteiro ou a casa de quem digitou.

   Ate 8 meses isso morava num JSON dentro do bundle. Com 13 ele
   passou de 1,5 MB, entao virou a tabela coord_rua no Supabase e
   o navegador pede so as ruas do modal que voce abriu. Uma linha
   por rua, com o array de pontos dentro — assim um modal de 300
   OS pede no maximo 300 linhas, e nao esbarra no limite de 1.000
   do PostgREST no meio de um clique.
   ───────────────────────────────────────────────────────── */
// ruaKey -> {p:[...] automatico, m:[...] cadastrado a mao} | null
const coordCache = new Map();
async function carregarRuas(chaves){
  const faltam=[...new Set(chaves.filter(Boolean))].filter(k=>!coordCache.has(k));
  if(!faltam.length) return;
  // Lotes de 80 para a URL nao passar de ~4 KB: nome de rua com
  // acento e espaco incha ao ser codificado, e servidor nenhum
  // garante URL longa.
  for(let i=0;i<faltam.length;i+=80){
    const lote=faltam.slice(i,i+80);
    // Nome de rua tem parenteses e ponto ("VIELA QUATRO(HERMOGENES
    // F .L .FILHO)"), que o PostgREST le como sintaxe se vierem
    // soltos. Por isso cada valor vai entre aspas.
    const lista=lote.map(k=>'"'+k.replace(/["\\]/g,m=>"\\"+m)+'"').join(",");
    const filtro="rua=in.("+encodeURIComponent(lista)+")";
    try{
      // As duas tabelas no mesmo ida-e-volta. A manual e pequena e
      // quase sempre volta vazia, mas custa o mesmo tempo que a outra
      // quando vai junto.
      const [auto,mao]=await Promise.all([
        fetch(SUPABASE_URL+"/rest/v1/coord_rua?select=rua,p&"+filtro,{headers:HEADERS}),
        fetch(SUPABASE_URL+"/rest/v1/coord_manual?select=rua,numero,lat,lon,criado_em,origem,extensao_m&"+filtro,{headers:HEADERS}),
      ]);
      if(!auto.ok) throw new Error("coord_rua HTTP "+auto.status);
      if(!mao.ok) throw new Error("coord_manual HTTP "+mao.status);
      for(const d of await auto.json()) coordCache.set(d.rua,{p:d.p,m:[]});
      for(const d of await mao.json()){
        if(!coordCache.get(d.rua)) coordCache.set(d.rua,{p:[],m:[]});
        coordCache.get(d.rua).m.push([d.lat,d.lon,d.numero<0?null:d.numero,d.criado_em,d.origem||"mao",d.extensao_m]);
      }
      // Rua que nenhuma das duas devolveu nao esta na base. Grava o
      // vazio para nao perguntar de novo a cada modal aberto.
      for(const k of lote) if(!coordCache.has(k)) coordCache.set(k,null);
    }catch(e){
      // Falha de rede NAO pode virar "endereco sem base" — seria o
      // mesmo erro silencioso dos robos, so que na tela. Deixa fora
      // do cache para tentar de novo no proximo modal.
      console.warn("coord_rua:",e.message||e);
      return;
    }
  }
}
function ruaKey(s){
  let r=String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()
        .replace(/\s+/g," ").trim().replace(/[.,;: ]+$/,"");
  return r.replace(/^AVENIDA\s+/,"AV ").replace(/^PRACA\s+/,"PCA ").replace(/^PCA\.?\s+/,"PCA ")
          .replace(/^TRAVESSA\s+/,"TV ").replace(/^ALAMEDA\s+/,"AL ")
          .replace(/^ESTRADA\s+/,"ESTR ").replace(/^RODOVIA\s+/,"ROD ");
}
const numKey=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/\s+/g," ").trim().replace(/[.,;: ]+$/,"");

// Tres respostas possiveis, nesta ordem:
//   exato  — a turma ja executou nesse numero. Melhor caso.
//   rua    — a rua esta mapeada, o numero nao. Cai no centro da
//            rua; ja resolve "qual das tres Rua Jequirituba".
//   null   — nao esta na base. Quem chama decide o que fazer.
// A rua e uma NUVEM de pontos, nao um ponto. Medido em agosto: 32%
// das ruas aparecem em dois ou mais lugares separados por mais de
// 800 m — parte disso e avenida comprida, parte e rua homonima de
// verdade, e distancia sozinha nao separa os dois casos. Quem separa
// e o numero. Por isso a busca e sempre pelo ponto cujo numero esta
// mais perto do pedido, e o centro da rua e o ultimo recurso.
const distM=(a,b)=>{const R=6371000,p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180;
  const h=Math.sin((p2-p1)/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));};
// Rua homonima: a regiao tem 8 "RUA QUATRO", e o numero 72 existe em
// tres delas. Quem separa e o SF da OS — ele e o setor da ligacao da
// Sabesp em 99,8% das OS. Os pontos de ligacao (p[5]==="L") trazem o
// setor em p[7]; os de execucao nao sabem o setor.
function acharCoord(endereco,numero,sf){
  const ent0=coordCache.get(ruaKey(endereco));
  if(!ent0) return null;
  const alvo=parseInt(String(numero??"").replace(/\D/g,""),10);
  const setor=parseInt(String(sf??"").replace(/\D/g,""),10);
  // 1. ligacao da casa, no setor da OS: o caso comum, e o mais certo
  const ligs=(ent0.p||[]).filter(p=>p[5]==="L");
  if(Number.isFinite(alvo)){
    const noNum=ligs.filter(p=>p[2]===alvo);
    const certo=Number.isFinite(setor)?noNum.filter(p=>p[7]===setor):noNum;
    if(certo.length===1){
      // cadastro a mao continua ganhando: se alguem marcou, e porque o automatico errou
      const mm=(ent0.m||[]).find(p=>p[4]!=="osm"&&p[2]===alvo);
      if(mm) return {lat:mm[0],lon:mm[1],tipo:"manual",quando:mm[3]};
      const c=certo[0];
      return {lat:c[0],lon:c[1],tipo:"exato",ligacao:true,sf:c[7],obs:0,desvio:0};
    }
  }
  // 2. Sem a ligacao exata: se a rua existe em mais de um setor, so vale
  //    a nuvem do setor da OS. Os pontos de execucao ficam de fora — nao
  //    da para saber de qual das ruas homonimas eles sao.
  let ent=ent0;
  const setores=new Set(ligs.map(p=>p[7]));
  if(setores.size>1){
    const doSetor=Number.isFinite(setor)?ligs.filter(p=>p[7]===setor):[];
    ent={...ent0,p:doSetor};
  }
  const cad=ent.m||[];
  const mao=cad.filter(p=>p[4]!=="osm"), doMapa=cad.filter(p=>p[4]==="osm");
  // A ordem aqui e a ordem da confianca, e ela e deliberada:
  //   1. pessoa marcou o numero  — se o automatico acertasse,
  //      ninguem teria ido la marcar
  //   2. execucao real da turma   — GPS de quem esteve no local
  //   3. pessoa marcou a rua      — o caso da viela sem mapa
  //   4. mapa do OpenStreetMap    — da a rua certa, nunca o numero
  if(Number.isFinite(alvo)){
    const mm=mao.find(p=>p[2]===alvo);
    if(mm) return {lat:mm[0],lon:mm[1],tipo:"manual",quando:mm[3]};
  }
  const a=acharAuto(ent,alvo);
  if(a) return a;
  const mr=mao.find(p=>p[2]==null);
  if(mr) return {lat:mr[0],lon:mr[1],tipo:"manual-rua",quando:mr[3]};
  const om=doMapa.find(p=>p[2]==null);
  // A extensao vem junto de proposito. O ponto e o meio da rua, e
  // "o meio" so quer dizer alguma coisa em rua curta: a mediana da
  // regiao e 192 m, mas tem avenida e rodovia de dezenas de km na
  // cauda. Numa dessas, o meio pode estar a quilometros da OS —
  // continua sendo a via certa, e nao serve para mandar equipe.
  // Entao a tela avisa em vez de apresentar como resposta pronta.
  if(om) return {lat:om[0],lon:om[1],tipo:"osm",ext:om[5],longa:om[5]>2000};
  return null;
}
function acharAuto(ent,alvo){
  if(!ent?.p?.length) return null;
  if(Number.isFinite(alvo)){
    let melhor=null,dist=Infinity,abaixo=null,acima=null;
    for(const p of ent.p){
      if(p[2]==null) continue;
      const d=Math.abs(p[2]-alvo);
      if(d<dist){dist=d;melhor=p;}
      if(p[2]<=alvo&&(!abaixo||p[2]>abaixo[2])) abaixo=p;
      if(p[2]>=alvo&&(!acima||p[2]<acima[2])) acima=p;
    }
    if(dist===0) return {lat:melhor[0],lon:melhor[1],tipo:"exato",obs:melhor[3],desvio:melhor[4]};
    // Dois numeros conhecidos cercando o pedido: interpolar entre eles
    // erra menos do que grudar no mais proximo. Com 78% dos pontos vindo
    // de UMA leitura de GPS, o erro de uma leitura sozinha e a rua de
    // tras; a interpolacao pelo menos usa duas.
    // So vale se os dois estiverem no MESMO trecho — interpolar entre
    // dois lugares distantes com o mesmo nome de rua seria pior que o
    // problema que resolve.
    if(abaixo&&acima&&abaixo[2]!==acima[2]&&distM(abaixo,acima)<500){
      const t=(alvo-abaixo[2])/(acima[2]-abaixo[2]);
      return {lat:+(abaixo[0]+(acima[0]-abaixo[0])*t).toFixed(6),
              lon:+(abaixo[1]+(acima[1]-abaixo[1])*t).toFixed(6),
              tipo:"interpolado",entre:[abaixo[2],acima[2]],
              obs:abaixo[3]+acima[3],desvio:Math.max(abaixo[4],acima[4])};
    }
    if(melhor) return {lat:melhor[0],lon:melhor[1],tipo:"vizinho",casas:dist,obs:melhor[3],desvio:melhor[4]};
  }
  // Nenhum numero utilizavel: o ponto mais observado da rua.
  const p=ent.p.reduce((a,b)=>(b[3]>a[3]?b:a));
  return {lat:p[0],lon:p[1],tipo:"rua",obs:p[3],desvio:p[4]};
}
function abrirNoMapa(r){
  const c=acharCoord(r["Endereço"],r["Número"],r["SF"]);
  const url=c
    ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lon}`
    : `https://www.google.com/maps/search/?api=1&query=`+encodeURIComponent(
        [String(r["Endereço"]||"").trim(),r["Número"],r["Bairro"],r["Município"]||"SAO PAULO"]
        .filter(Boolean).join(", "));
  window.open(url,"_blank","noopener,noreferrer");
}

/* ── Observação por serviço ───────────────────────────────
   O que isto resolve não é falta de campo para escrever — é
   informação que hoje mora na cabeça de uma pessoa e sai de
   férias com ela.

   Por isso a nota NÃO fica em balão nem em passar o mouse:
   esses dois só revelam para quem já desconfia que tem algo ali,
   e quem precisa da nota é justamente quem não sabe que ela
   existe. Ela ocupa uma linha inteira embaixo da OS, sempre
   visível, com faixa âmbar na borda.

   A busca é por numero_os, não pelo par com a TSS: quando a OS
   migra de TSS a nota continua aparecendo, dizendo de onde veio.
   ───────────────────────────────────────────────────────── */
// A OS com observacao fica marcada por inteiro — linha e nota
// dentro da mesma moldura ambar. A nota nao e uma coisa ao lado da
// OS, e uma propriedade dela.
// As tags do dia a dia. Para criar uma nova, acrescente aqui: e o
// unico lugar, e o banco de proposito nao limita a lista.
// "data:true" faz o formulario pedir uma data junto.
const TAGS=[
  {id:"OUVIDORIA",     cor:"#f87171"},
  {id:"CONVIAS",       cor:"#60a5fa"},
  {id:"GEOINFRA",      cor:"#a78bfa"},
  {id:"LAJE",          cor:"#e9b949"},
  {id:"AGENDADO",      cor:"#34d399", data:true},
  {id:"CAMINHÃO",      cor:"#2dd4bf"},
  {id:"CARRO PEQUENO", cor:"#94a3b8"},
];
const TAG_POR_ID=Object.fromEntries(TAGS.map(t=>[t.id,t]));
const corDaTag=id=>TAG_POR_ID[id]?.cor||"#94a3b8";
const fmtDia=iso=>{try{const[a,m,d]=String(iso).slice(0,10).split("-");return `${d}/${m}`;}catch{return iso;}};

// Uma etiqueta. "vencido" so existe no AGENDADO: data que ja passou
// quer dizer que a equipe nao foi no dia marcado, e isso e
// justamente o que alguem precisa ver.
function Etiqueta({id,dia,pequena}){
  const cor=corDaTag(id);
  const vencido=id==="AGENDADO"&&dia&&String(dia).slice(0,10)<new Date().toISOString().slice(0,10);
  return <span title={vencido?"O dia agendado já passou":undefined}
    style={{display:"inline-flex",alignItems:"center",gap:5,padding:pequena?"1px 7px":"2px 9px",
      borderRadius:RAIO,fontSize:pequena?10:10.5,fontWeight:700,letterSpacing:"0.06em",
      whiteSpace:"nowrap",color:vencido?C.red:cor,
      background:vencido?C.redBg:"transparent",
      border:`1px solid ${vencido?C.redBorder:cor+"55"}`}}>
    {id}{dia&&<span style={{...numStyle,fontWeight:600,opacity:.95}}>{fmtDia(dia)}</span>}
  </span>;
}

const COR_NOTA="#e9b949";
const FUNDO_NOTA="rgba(233,185,73,0.055)";
// Equivalentes ambar do sideActive/sideHover, que sao azuis.
const FUNDO_NOTA_ATIVO="rgba(233,185,73,0.14)";
const HOVER_NOTA="rgba(233,185,73,0.07)";
const notaCache=new Map();   // numero_os -> [ {tss, nota, autor_nome, atualizado_em} ]
async function carregarNotas(numeros){
  const faltam=[...new Set(numeros.filter(Boolean))].filter(n=>!notaCache.has(n));
  if(!faltam.length) return;
  for(let i=0;i<faltam.length;i+=200){
    const lote=faltam.slice(i,i+200);
    const lista=lote.map(n=>`"${String(n).replace(/["\\]/g,m=>"\\"+m)}"`).join(",");
    try{
      const res=await fetch(SUPABASE_URL+"/rest/v1/os_nota?select=numero_os,tss,nota,autor_nome,autor_email,atualizado_em,endereco,bairro,municipio,familia,tags,agendado_para&numero_os=in.("+encodeURIComponent(lista)+")",{headers:HEADERS});
      if(!res.ok) throw new Error("HTTP "+res.status);
      for(const d of await res.json()){
        if(!notaCache.get(d.numero_os)) notaCache.set(d.numero_os,[]);
        notaCache.get(d.numero_os).push(d);
      }
      for(const n of lote) if(!notaCache.has(n)) notaCache.set(n,[]);
    }catch(e){
      // Falha de rede não pode virar "essa OS não tem observação":
      // seria esconder exatamente o que a nota existe para mostrar.
      console.warn("os_nota:",e.message||e);
      return;
    }
  }
}
// Devolve a nota DESTA OS+TSS, e so dela. A nota e do servico, nao
// da OS: quando a OS migra (o vazamento e resolvido e ela vira
// reposicao), a nota do vazamento fica para tras. Antes ela seguia
// a OS para a TSS nova, e a lista de notas so crescia.
function acharNota(numeroOS,tss){
  const lista=notaCache.get(String(numeroOS??"").trim());
  if(!lista?.length) return null;
  const t=String(tss??"").trim();
  const exata=lista.find(d=>String(d.tss).trim()===t);
  return exata?{...exata,outraTss:null}:null;
}
async function salvarNota(numeroOS,tss,texto,sess,linha,tags,dia){
  // A nota guarda o proprio endereco. Sem isso ela vira uma linha
  // sem endereco no dia em que a OS sai do pendente — e sai, e e
  // justamente quando alguem vai querer entender o que houve.
  const end=linha?[String(linha["Endereço"]||"").trim(),linha["Número"]].filter(x=>x!==""&&x!=null).join(", "):null;
  const corpo={numero_os:String(numeroOS).trim(),tss:String(tss).trim(),nota:texto.trim()||null,
    tags:tags||[],agendado_para:(tags||[]).includes("AGENDADO")?(dia||null):null,
    autor_nome:sess?.perfil?.nome||null,autor_email:sess?.perfil?.email||null,
    endereco:end||null,bairro:linha?.["Bairro"]||null,
    municipio:linha?.["Município"]||null,familia:linha?.["Família"]||null,
    atualizado_em:new Date().toISOString()};
  const manda=async cab=>fetch(SUPABASE_URL+"/rest/v1/os_nota?on_conflict=numero_os,tss",{
    method:"POST",headers:{...cab,"Prefer":"return=minimal,resolution=merge-duplicates"},
    body:JSON.stringify([corpo])});
  // Sem login grava com a chave anonima: quem sabe do impedimento
  // esta no campo e nao tem usuario no sistema.
  if(!sess?.access_token){
    const r=await manda(HEADERS);
    if(!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    notaCache.delete(String(numeroOS).trim());
    return;
  }
  let res=await manda(authHeaders(await tokenFresco(sess)));
  if(res.status===401&&sess?.refresh_token){sess.expires_at=0;res=await manda(authHeaders(await tokenFresco(sess)));}
  if(!res.ok){
    const txt=await res.text();
    if(res.status===401) throw new Error("Sua sessão expirou. Entre de novo para gravar.");
    throw new Error(`${res.status} ${txt}`);
  }
  notaCache.delete(String(numeroOS).trim());
}
async function apagarNota(numeroOS,tss,sess){
  const cab=sess?.access_token?authHeaders(await tokenFresco(sess)):HEADERS;
  const res=await fetch(SUPABASE_URL+`/rest/v1/os_nota?numero_os=eq.${encodeURIComponent(String(numeroOS).trim())}&tss=eq.${encodeURIComponent(String(tss).trim())}`,
    {method:"DELETE",headers:cab});
  if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  notaCache.delete(String(numeroOS).trim());
}

/* ── Padronização da nota ─────────────────────────────────
   Nota é escrita por muita gente diferente, em pressa, às vezes
   pelo celular. Sem padronizar, a mesma informação aparece de
   cinco jeitos e a tabela vira colcha de retalho.

   O que é feito, e é seguro porque é determinístico:
   caixa alta, espaço sobrando removido, espaço antes de vírgula
   e ponto corrigido, pontuação repetida reduzida, ponto final
   garantido, e acento devolvido numa lista fechada de palavras
   do nosso vocabulário.

   O que NÃO é feito, de propósito: correção ortográfica de
   verdade. Corretor automático troca palavra por palavra
   parecida, e numa nota de campo isso muda o significado — "PV"
   viraria "PVC", "SF" viraria "SE". Errar a grafia atrapalha;
   trocar a palavra engana. Por isso a tela mostra exatamente
   como vai ficar gravado, antes de salvar.
   ───────────────────────────────────────────────────────── */
const ACENTOS = {
  NAO:"NÃO",SAO:"SÃO",AGUA:"ÁGUA",POCO:"POÇO",INSPECAO:"INSPEÇÃO",EXECUCAO:"EXECUÇÃO",
  MANUTENCAO:"MANUTENÇÃO",OBSTRUCAO:"OBSTRUÇÃO",DESOBSTRUCAO:"DESOBSTRUÇÃO",
  SUPRESSAO:"SUPRESSÃO",LIGACAO:"LIGAÇÃO",REPOSICAO:"REPOSIÇÃO",PAVIMENTACAO:"PAVIMENTAÇÃO",
  ESCAVACAO:"ESCAVAÇÃO",SITUACAO:"SITUAÇÃO",AUTORIZACAO:"AUTORIZAÇÃO",PROGRAMACAO:"PROGRAMAÇÃO",
  LOCALIZACAO:"LOCALIZAÇÃO",INTERDICAO:"INTERDIÇÃO",LIBERACAO:"LIBERAÇÃO",PERMISSAO:"PERMISSÃO",
  CONCESSIONARIA:"CONCESSIONÁRIA",PROPRIETARIO:"PROPRIETÁRIO",RESPONSAVEL:"RESPONSÁVEL",
  SERVICO:"SERVIÇO",SERVICOS:"SERVIÇOS",ENDERECO:"ENDEREÇO",NUMERO:"NÚMERO",
  VEICULO:"VEÍCULO",CAMINHAO:"CAMINHÃO",MAQUINA:"MÁQUINA",MAQUINARIO:"MAQUINÁRIO",
  NECESSARIO:"NECESSÁRIO",POSSIVEL:"POSSÍVEL",IMPOSSIVEL:"IMPOSSÍVEL",DIFICIL:"DIFÍCIL",
  TRAFEGO:"TRÁFEGO",ONIBUS:"ÔNIBUS",HORARIO:"HORÁRIO",PROXIMO:"PRÓXIMO",PROXIMA:"PRÓXIMA",
  TERCA:"TERÇA",SABADO:"SÁBADO",MES:"MÊS",ATE:"ATÉ",JA:"JÁ",SO:"SÓ",APOS:"APÓS",ALEM:"ALÉM",
  POREM:"PORÉM",TAMBEM:"TAMBÉM",NIVEL:"NÍVEL",CALCADA:"CALÇADA",ARVORE:"ÁRVORE",
  PREDIO:"PRÉDIO",IMOVEL:"IMÓVEL",PROVISORIO:"PROVISÓRIO",PENDENCIA:"PENDÊNCIA",
  HIDROMETRO:"HIDRÔMETRO",VALVULA:"VÁLVULA",TAMPAO:"TAMPÃO",PRESSAO:"PRESSÃO",
  PARALELEPIPEDO:"PARALELEPÍPEDO",TERCEIRO:"TERCEIRO",FERIAS:"FÉRIAS",VOLTARA:"VOLTARÁ",
  SERA:"SERÁ",ESTARA:"ESTARÁ",PRECISARA:"PRECISARÁ",EQUIPE:"EQUIPE",OBRIGATORIO:"OBRIGATÓRIO",
};
function padronizarNota(txt){
  let t=String(txt??"");
  t=t.replace(/\r\n?/g,"\n").split("\n").map(l=>l.trim()).filter(Boolean).join(" ");
  t=t.replace(/\s+/g," ").trim();
  if(!t) return "";
  t=t.toLocaleUpperCase("pt-BR");
  // Acento devolvido so em palavra inteira: "NAO" vira "NÃO",
  // mas "NAOTAL" fica como esta.
  t=t.replace(/[A-ZÀ-Ü]+/g,p=>ACENTOS[p]||p);
  t=t.replace(/\s+([,.;:!?])/g,"$1");      // espaço antes de pontuação
  t=t.replace(/([,;:])(?=\S)/g,"$1 ");     // falta de espaço depois
  t=t.replace(/(\.{3}|[.?!])(?=[A-ZÀ-Ü])/g,"$1 ");  // frase colada na anterior
  t=t.replace(/\.{3,}/g,"...");            // reticências exageradas
  t=t.replace(/([!?])\1+/g,"$1");          // !!! e ???
  t=t.replace(/\s+/g," ").trim();
  if(/[A-Z0-9ÀÜ)\]]$/.test(t)) t+=".";      // ponto final
  return t;
}

// Todas as notas de uma vez, para o menu lateral e o modal de
// Notas. Paginada como as demais buscas: sem isso o Supabase
// devolveria so as 1000 primeiras e as mais antigas sumiriam sem
// aviso, que e o erro que ja nos mordeu no historico.
async function fetchTodasNotas(){
  const todas=[];let de=0;const ps=1000;
  while(true){
    const res=await fetch(SUPABASE_URL+"/rest/v1/os_nota?select=numero_os,tss,nota,autor_nome,autor_email,atualizado_em,endereco,bairro,municipio,familia,tags,agendado_para&order=atualizado_em.desc",
      {headers:{...HEADERS,"Range":de+"-"+(de+ps-1)}});
    if(!res.ok&&res.status!==206) throw new Error("Erro notas "+res.status);
    const d=await res.json();
    if(!d?.length) break;
    for(const x of d) todas.push(x);
    if(d.length<ps) break;
    de+=ps;
  }
  return todas;
}

/* ── Modal de Notas ───────────────────────────────────────
   Todas as observacoes num lugar so: o que esta travado na
   carteira inteira, sem precisar abrir familia por familia.

   A nota vive enquanto o SERVICO (par OS+TSS) esta no pendente.
   Resolvida aquela TSS, a nota sai da lista junto — mesmo que a
   OS continue aberta em outra TSS, como o vazamento que vira
   reposicao. Ninguem precisa arrumar nada.

   O perigo dessa regra e confundir "OS resolvida" com "casamento
   falhou": nos dois casos a nota some do mesmo jeito, e no segundo
   e informacao perdida. Por isso o casamento compara so os DIGITOS
   do numero da OS — espaco sobrando e numero gravado como texto ja
   apareceram aqui, e nenhum dos dois pode decidir se a informacao
   chega em quem le.

   A linha continua na tabela os_nota, com endereco e tudo, caso um
   dia valha montar uma visao de historico.
   ───────────────────────────────────────────────────────── */
function NotasModal({notas,rows,onClose,onEditar,filtroInicial}){
  const [filtro,setFiltro]=useState(filtroInicial||null);   // etiqueta escolhida, ou nenhuma
  // Casa pelos digitos: numero de OS ja apareceu com espaco sobrando
  // e ja veio como numero em vez de texto, e um espaco nao pode
  // decidir se a informacao chega ou nao em quem le.
  const soDigitos=v=>String(v??"").replace(/\D/g,"");
  const porOS=useMemo(()=>{
    const m=new Map();
    for(const r of rows||[]){
      const os=soDigitos(r["Número OS"]);
      if(!os) continue;
      if(!m.has(os)) m.set(os,[]);
      m.get(os).push(r);
    }
    return m;
  },[rows]);
  const lista=useMemo(()=>(notas||[]).map(n=>{
    // So o par exato: nota de TSS que ja saiu do pendente nao aparece,
    // mesmo que a OS continue aberta em outra TSS.
    const cands=porOS.get(soDigitos(n.numero_os))||[];
    const linha=cands.find(r=>String(r["TSS"]||"").trim()===String(n.tss).trim())||null;
    return {n,linha,outraTss:false};
  }).filter(x=>x.linha),[notas,porOS]);
  // Contagem por etiqueta, sobre o que esta na tela. E a resposta
  // para "o que esta travando a carteira" — que o texto livre
  // nunca deu.
  const porTag=useMemo(()=>{
    const m=new Map();
    for(const {n} of lista) for(const t of n.tags||[]) m.set(t,(m.get(t)||0)+1);
    return m;
  },[lista]);
  const visiveis=useMemo(()=>filtro?lista.filter(({n})=>(n.tags||[]).includes(filtro)):lista,[lista,filtro]);

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:RAIO,border:`1px solid ${C.border}`,width:"100%",maxWidth:1100,maxHeight:"82vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:C.text}}>Observações</div>
          <div style={{fontSize:13,color:C.textDim,marginTop:2}}>
            <span style={{color:COR_NOTA,fontWeight:700,...numStyle}}>{visiveis.length}</span> serviço{visiveis.length===1?"":"s"}
            {filtro?<> com a etiqueta <b style={{color:corDaTag(filtro)}}>{filtro}</b></>:" com observação"}
          </div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>
      {porTag.size>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:"11px 20px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <span onClick={()=>setFiltro(null)}
          style={{cursor:"pointer",userSelect:"none",padding:"4px 11px",borderRadius:RAIO,fontSize:11,fontWeight:700,
            letterSpacing:"0.05em",color:filtro?C.textDim:C.text,
            border:`1px solid ${filtro?C.border:C.textDim}`}}>TODAS</span>
        {TAGS.filter(t=>porTag.get(t.id)).map(t=>{const on=filtro===t.id;
          return <span key={t.id} onClick={()=>setFiltro(on?null:t.id)}
            style={{cursor:"pointer",userSelect:"none",padding:"4px 11px",borderRadius:RAIO,fontSize:11,fontWeight:700,
              letterSpacing:"0.05em",display:"inline-flex",gap:6,alignItems:"center",
              color:on?t.cor:C.textDim,border:`1px solid ${on?t.cor:C.border}`,background:on?t.cor+"14":"transparent"}}>
            {t.id}<span style={{...numStyle,color:on?t.cor:C.textDim}}>{porTag.get(t.id)}</span></span>;})}
      </div>}
      <div style={{overflowY:"auto",flex:1,padding:"10px 14px 16px"}}>
        {visiveis.length===0&&<div style={{padding:"28px 6px",textAlign:"center",color:C.textDim,fontSize:13}}>
          Nenhuma observação em OS do pendente de hoje. Abra uma família, clique no + ao lado de uma OS e escreva.
        </div>}
        {visiveis.map(({n,linha,outraTss})=>
            <div key={n.numero_os+"|"+n.tss}
              onClick={()=>onEditar({linha,nota:{...n,outraTss:outraTss?n.tss:null}})}
              style={{display:"flex",flexDirection:"column",gap:4,padding:"10px 12px",marginBottom:6,cursor:"pointer",
                background:FUNDO_NOTA,borderLeft:`3px solid ${COR_NOTA}`}}>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"baseline",fontSize:12.5}}>
                <span style={{color:C.accent,fontWeight:600,...numStyle}}>{n.numero_os}</span>
                <span style={{color:C.textMuted}}>{n.tss}</span>
                {(()=>{
                  // O pendente e mais fresco, entao vem primeiro; o que
                  // a nota guardou e a reserva de quando a OS ja saiu.
                  const e=linha?[String(linha["Endereço"]||"").trim(),linha["Número"]].filter(x=>x!==""&&x!=null).join(", "):n.endereco;
                  const b=linha?linha["Bairro"]:n.bairro;
                  return e?<span style={{color:C.textDim}}>· {e}{b?" — "+b:""}</span>:null;
                })()}
                <span style={{color:tempo(linha["Tempo Residual"])==="fora"?C.red:C.green,fontWeight:600}}>{linha["Tempo Residual"]}</span>
                {outraTss&&<span style={{color:C.amber,fontSize:11}}>a OS está hoje como {String(linha["TSS"]||"").trim()}</span>}
              </div>
              <div style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"center"}}>
                {(n.tags||[]).map(t=><Etiqueta key={t} id={t} dia={t==="AGENDADO"?n.agendado_para:null}/>)}
                {n.nota&&<span style={{fontSize:13,color:C.text,lineHeight:1.45,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{n.nota}</span>}
                <span style={{fontSize:11,color:C.textDim}}>| {n.autor_nome||n.autor_email||"autor não registrado"} · {fmtDate(n.atualizado_em)}</span>
              </div>
            </div>)}
      </div>
    </div>
  </div>;
}

/* ── Rodar a leitura de ouvidorias sob pedido ─────────────
   Só aparece para quem tem pode_importar (o Bryan). Escolhe o
   período e os e-mails; o site chama /api/ouvidoria (função da
   Vercel, que guarda o token) e ela dispara a tarefa que lê esses
   e-mails e marca OUVIDORIA nas OS que estão no pendente.
   Os remetentes ficam guardados neste navegador para a próxima vez.
   ───────────────────────────────────────────────────────── */
const OUV_REMETENTES_PADRAO=["amichael@sabesp.com.br","snmsilva@sabesp.com.br"];
const diaISO=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
function OuvidoriaRodarModal({sess,onClose}){
  const hoje=diaISO(new Date());
  const [de,setDe]=useState(diaISO(new Date(Date.now()-864e5)));
  const [ate,setAte]=useState(hoje);
  const [lista,setLista]=useState(()=>{try{const v=JSON.parse(localStorage.getItem("ouv-remetentes")||"null");return Array.isArray(v)&&v.length?v:OUV_REMETENTES_PADRAO;}catch{return OUV_REMETENTES_PADRAO;}});
  const [novo,setNovo]=useState("");
  const [estado,setEstado]=useState(null);   // {tipo:"ok"|"erro"|"indo", msg, link}
  const emailOk=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const guardar=l=>{setLista(l);try{localStorage.setItem("ouv-remetentes",JSON.stringify(l));}catch{}};
  const add=()=>{const e=novo.trim().toLowerCase();if(!emailOk(e))return;if(!lista.includes(e))guardar([...lista,e]);setNovo("");};
  const rodar=async()=>{
    setEstado({tipo:"indo",msg:"Disparando…"});
    try{
      const res=await fetch("/api/ouvidoria",{method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+await tokenFresco(sess)},
        body:JSON.stringify({de,ate,remetentes:lista})});
      const j=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.erro||("HTTP "+res.status));
      setEstado({tipo:"ok",msg:"Rodando. Leva alguns minutos; as etiquetas aparecem ao clicar em ↻ Atualizar.",link:j.sessao});
    }catch(e){setEstado({tipo:"erro",msg:String(e.message||e)});}
  };
  const campo={padding:"7px 10px",borderRadius:RAIO,border:`1px solid ${C.border}`,background:C.cardAlt,color:C.text,fontSize:13,fontFamily:"inherit",colorScheme:"dark"};
  const pode=lista.length>0&&de&&ate&&de<=ate&&estado?.tipo!=="indo";
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,width:"100%",maxWidth:480,padding:20,display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>Ler ouvidorias do e-mail</div>
        <div style={{fontSize:12.5,color:C.textDim,marginTop:4,lineHeight:1.5}}>Procura as OS nos e-mails desses remetentes, no período escolhido, e marca <Etiqueta id="OUVIDORIA" pequena/> nas que estão no pendente.</div>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",fontSize:12.5,color:C.textMuted}}>
        De <input type="date" value={de} max={ate} onChange={e=>setDe(e.target.value)} style={campo}/>
        até <input type="date" value={ate} min={de} max={hoje} onChange={e=>setAte(e.target.value)} style={campo}/>
      </div>
      <div>
        <div style={{fontSize:11.5,color:C.textDim,marginBottom:7}}>E-mails de quem</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {lista.map(e=><span key={e} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:RAIO,border:`1px solid ${C.border}`,fontSize:12,color:C.text}}>
            {e}<span onClick={()=>guardar(lista.filter(x=>x!==e))} title="Tirar" style={{cursor:"pointer",color:C.textDim}}>✕</span></span>)}
        </div>
        <div style={{display:"flex",gap:6,marginTop:8}}>
          <input value={novo} onChange={e=>setNovo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add();}} placeholder="acrescentar e-mail" style={{...campo,flex:1,minWidth:0}}/>
          <button onClick={add} disabled={!emailOk(novo.trim())} style={{...campo,cursor:"pointer",color:C.accent}}>+</button>
        </div>
      </div>
      {estado&&<div style={{fontSize:12.5,lineHeight:1.5,color:estado.tipo==="erro"?C.red:estado.tipo==="ok"?C.green:C.textMuted}}>
        {estado.msg}{estado.link&&<> <a href={estado.link} target="_blank" rel="noreferrer" style={{color:C.accent}}>ver execução</a></>}</div>}
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <button onClick={onClose} style={{fontSize:12.5,padding:"7px 14px",borderRadius:RAIO,border:`1px solid ${C.border}`,background:"transparent",color:C.textMuted,cursor:"pointer"}}>Fechar</button>
        <button onClick={rodar} disabled={!pode} style={{fontSize:12.5,fontWeight:700,padding:"7px 16px",borderRadius:RAIO,cursor:pode?"pointer":"default",
          border:`1px solid ${corDaTag("OUVIDORIA")}`,background:corDaTag("OUVIDORIA")+"1a",color:corDaTag("OUVIDORIA"),opacity:pode?1:0.5}}>Rodar</button>
      </div>
    </div>
  </div>;
}

function NotaModal({linha,nota,sess,onClose,onSalvou}){
  const os=String(linha["Número OS"]||"").trim();
  const tss=String(linha["TSS"]||"").trim();
  const [txt,setTxt]=useState(nota?.nota||"");
  const [tags,setTags]=useState(nota?.tags||[]);
  const [dia,setDia]=useState(nota?.agendado_para?String(nota.agendado_para).slice(0,10):"");
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState("");
  const marcar=id=>setTags(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id]);
  const precisaData=tags.includes("AGENDADO")&&!dia;
  const vazia=!txt.trim()&&tags.length===0;
  const gravar=async(apagar)=>{
    setSalvando(true);setErro("");
    try{
      if(apagar) await apagarNota(os,nota.outraTss||tss,sess);
      else await salvarNota(os,tss,padronizarNota(txt),sess,linha,tags,dia);
      onSalvou();
    }catch(e){setErro(String(e.message||e));setSalvando(false);}
  };
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,width:"100%",maxWidth:540,padding:20,display:"flex",flexDirection:"column",gap:13}}>
      <div>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>{nota?"Editar observação":"Adicionar observação"}</div>
        <div style={{fontSize:12.5,color:C.textMuted,marginTop:4}}>OS {os} · {tss}</div>
        <div style={{fontSize:12.5,color:C.textDim,marginTop:2}}>{String(linha["Endereço"]||"").trim()}, {linha["Número"]}{linha["Bairro"]?" — "+linha["Bairro"]:""}</div>
      </div>
      <div style={{fontSize:12,color:C.textDim,lineHeight:1.55,background:C.cardAlt,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`}}>
        Escreva o que a próxima pessoa precisa saber para não perder viagem.
        Ex.: <i>precisa de laje pronta antes de nivelar o PV — obra do cliente</i>.
      </div>
      <div>
        <div style={{fontSize:11.5,color:C.textDim,marginBottom:7}}>Etiquetas — o que classifica esta OS</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {TAGS.map(t=>{const on=tags.includes(t.id);
            return <span key={t.id} onClick={()=>marcar(t.id)}
              style={{cursor:"pointer",userSelect:"none",padding:"5px 11px",borderRadius:RAIO,
                fontSize:11.5,fontWeight:700,letterSpacing:"0.05em",transition:"all 0.12s",
                color:on?t.cor:C.textDim,border:`1px solid ${on?t.cor:C.border}`,
                background:on?t.cor+"14":"transparent"}}>{t.id}</span>;})}
        </div>
        {tags.includes("AGENDADO")&&<div style={{marginTop:9,display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:C.textMuted}}>Agendado para</span>
          <input type="date" value={dia} onChange={e=>setDia(e.target.value)}
            style={{padding:"7px 10px",borderRadius:RAIO,border:`1px solid ${precisaData?C.redBorder:C.border}`,
              background:C.cardAlt,color:C.text,fontSize:13,fontFamily:"inherit",colorScheme:"dark"}}/>
          {precisaData&&<span style={{fontSize:11.5,color:C.red}}>AGENDADO sem data não diz nada — escolha o dia</span>}
        </div>}
      </div>
      <textarea value={txt} onChange={e=>setTxt(e.target.value)} rows={3}
        placeholder="Detalhe que a etiqueta não cobre: com quem falar, o que falta…"
        style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,
          background:C.cardAlt,color:C.text,fontSize:13.5,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
      {nota&&<div style={{fontSize:11.5,color:C.textDim}}>
        Última alteração por {nota.autor_nome||nota.autor_email||"alguém"} em {fmtDate(nota.atualizado_em)}
      </div>}
      {erro&&<div style={{fontSize:12,color:C.red,background:C.redBg,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.redBorder}`,wordBreak:"break-word"}}>{erro}</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center"}}>
        {nota&&<button onClick={()=>gravar(true)} disabled={salvando}
          style={{marginRight:"auto",padding:"9px 14px",borderRadius:8,border:`1px solid ${C.redBorder}`,background:"transparent",color:C.red,fontSize:12.5,cursor:"pointer"}}>Apagar</button>}
        <button onClick={onClose} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        {(()=>{const ok=!vazia&&!precisaData&&!salvando;
          return <button onClick={()=>gravar(false)} disabled={!ok}
            style={{padding:"9px 18px",borderRadius:RAIO,border:"none",fontSize:13,fontWeight:700,
              background:ok?C.accent:C.border,color:ok?"#0b1220":C.textDim,
              cursor:ok?"pointer":"default"}}>{salvando?"Salvando...":"Salvar"}</button>;})()}
      </div>
    </div>
  </div>;
}

/* ── Cadastro manual de coordenada ────────────────────────
   Para a viela que o Google nao acha e para a rua que nunca
   teve baixa no celular. O que entra aqui vai para a tabela
   coord_manual, que a carga automatica nunca sobrescreve.
   ───────────────────────────────────────────────────────── */

// Aceita o que o Google Maps entrega de verdade, em qualquer das
// formas: o "-23.749291, -46.703112" do botao direito, a URL da
// barra de enderecos (@lat,lon,17z), e o link de compartilhar
// (!3d...!4d...). Nao adianta exigir um formato so — na pratica
// se cola o que estiver na mao.
function lerCoord(txt){
  const s=String(txt||"").trim();
  // !3d!4d antes de @: numa URL de lugar, o @ e o centro do mapa
  // e o !3d!4d e o ponto em si. Podem diferir uns 50 m.
  const m=s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
       || s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
       || s.match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
       || s.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if(!m) return null;
  return {lat:+m[1],lon:+m[2]};
}
// Mesma caixa do CHECK da tabela. Conferir aqui tambem e de
// proposito: o banco recusaria, mas com uma mensagem de constraint
// que nao ajuda ninguem.
const REGIAO={latMin:-24.2,latMax:-23.3,lonMin:-47.2,lonMax:-46.2};
const CENTRO=[-23.7537,-46.7004];   // centro da operacao, medido nos 13 meses
function conferirCoord(c){
  if(!c) return "Nao consegui ler uma coordenada nesse texto. Cole algo como -23.749291, -46.703112";
  const dentro=v=>v.lat>=REGIAO.latMin&&v.lat<=REGIAO.latMax&&v.lon>=REGIAO.lonMin&&v.lon<=REGIAO.lonMax;
  if(dentro(c)) return null;
  // O erro mais comum de todos: latitude e longitude trocadas.
  if(dentro({lat:c.lon,lon:c.lat})) return "trocado";
  return `Essa coordenada cai fora da regiao de trabalho (${c.lat}, ${c.lon}). Confira se copiou do lugar certo.`;
}
async function salvarCoordManual(reg,sess){
  const manda=tok=>fetch(SUPABASE_URL+"/rest/v1/coord_manual?on_conflict=rua,numero",{
    method:"POST",
    headers:{...authHeaders(tok),"Prefer":"return=minimal,resolution=merge-duplicates"},
    body:JSON.stringify([reg]),
  });
  let res=await manda(await tokenFresco(sess));
  // Cinto e suspensorio: se ainda assim vier 401 (relogio do PC
  // adiantado, token revogado no painel), força a renovacao e tenta
  // uma vez. Perder o cadastro por causa disso seria perder o
  // trabalho de garimpar a coordenada no mapa.
  if(res.status===401&&sess?.refresh_token){
    sess.expires_at=0;
    res=await manda(await tokenFresco(sess));
  }
  if(!res.ok){
    const txt=await res.text();
    if(res.status===401) throw new Error("Sua sessão expirou. Entre de novo para gravar.");
    if(res.status===403) throw new Error("Seu usuário não tem permissão para cadastrar coordenada.");
    throw new Error(`${res.status} ${txt}`);
  }
  coordCache.delete(reg.rua);   // forca reler na proxima consulta
}

function CoordModal({linha,sess,onClose,onSalvou}){
  const endereco=String(linha["Endereço"]||"").trim();
  const numTxt=String(linha["Número"]??"").trim();
  const num=parseInt(numTxt.replace(/\D/g,""),10);
  const temNum=Number.isFinite(num);
  const [txt,setTxt]=useState("");
  const [soRua,setSoRua]=useState(!temNum);
  const [erro,setErro]=useState("");
  const [salvando,setSalvando]=useState(false);
  const lido=lerCoord(txt);
  const problema=txt?conferirCoord(lido):null;
  const trocado=problema==="trocado";
  const valido=lido&&!problema;
  const dist=valido?Math.round(distM(CENTRO,[lido.lat,lido.lon])/100)/10:null;

  const buscar=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(
    [endereco,numTxt,linha["Bairro"],linha["Município"]||"SAO PAULO"].filter(Boolean).join(", ")),
    "_blank","noopener,noreferrer");

  const salvar=async()=>{
    const c=trocado?{lat:lido.lon,lon:lido.lat}:lido;
    setSalvando(true); setErro("");
    try{
      await salvarCoordManual({
        rua:ruaKey(endereco),
        numero:soRua?-1:num,
        lat:+c.lat.toFixed(6), lon:+c.lon.toFixed(6),
        endereco_original:endereco+(temNum?", "+num:""),
        bairro:linha["Bairro"]||null,
      },sess);
      onSalvou();
    }catch(e){ setErro(String(e.message||e)); setSalvando(false); }
  };

  const campo={width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,
    background:C.cardAlt,color:C.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"};
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,width:"100%",maxWidth:520,padding:20,display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <div style={{fontSize:15,fontWeight:700,color:C.text}}>Cadastrar coordenada</div>
        <div style={{fontSize:13,color:C.textMuted,marginTop:4}}>{endereco}{temNum?", "+num:""}{linha["Bairro"]?" — "+linha["Bairro"]:""}</div>
      </div>

      <div style={{fontSize:12,color:C.textDim,lineHeight:1.6,background:C.cardAlt,padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`}}>
        1. Abra o mapa e ache o lugar certo<br/>
        2. Clique com o <b>botão direito</b> em cima do ponto<br/>
        3. O primeiro item do menu são as coordenadas — clicar nele copia<br/>
        4. Cole aqui embaixo
      </div>

      <button onClick={buscar} style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${C.accent}`,background:"transparent",color:C.accent,fontSize:13,fontWeight:600,cursor:"pointer"}}>
        🗺️ Abrir no Google Maps
      </button>

      <div>
        <input autoFocus value={txt} onChange={e=>setTxt(e.target.value)} placeholder="-23.749291, -46.703112" style={campo}/>
        {txt&&!valido&&!trocado&&<div style={{fontSize:12,color:C.red,marginTop:6}}>{problema}</div>}
        {trocado&&<div style={{fontSize:12,color:C.amber,marginTop:6}}>
          Latitude e longitude parecem trocadas — vou gravar como {lido.lon.toFixed(6)}, {lido.lat.toFixed(6)}.
        </div>}
        {valido&&<div style={{fontSize:12,color:C.green,marginTop:6}}>
          {lido.lat.toFixed(6)}, {lido.lon.toFixed(6)} · a {dist} km do centro da operação
        </div>}
      </div>

      {temNum&&<label style={{display:"flex",alignItems:"center",gap:9,fontSize:13,color:C.textMuted,cursor:"pointer"}}>
        <Check checked={soRua} onChange={()=>setSoRua(v=>!v)}/>
        Vale para a rua inteira, não só o nº {num}
      </label>}

      {erro&&<div style={{fontSize:12,color:C.red,background:C.redBg,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.redBorder}`,wordBreak:"break-word"}}>{erro}</div>}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,fontSize:13,cursor:"pointer"}}>Cancelar</button>
        <button onClick={salvar} disabled={(!valido&&!trocado)||salvando}
          style={{padding:"9px 18px",borderRadius:8,border:"none",fontSize:13,fontWeight:700,
            background:(valido||trocado)&&!salvando?C.accent:C.border,
            color:(valido||trocado)&&!salvando?"#0b1220":C.textDim,
            cursor:(valido||trocado)&&!salvando?"pointer":"default"}}>
          {salvando?"Salvando...":"Salvar"}
        </button>
      </div>
    </div>
  </div>;
}

/* ── Pill / Bar / SummaryCard / Check ── */
function Pill({value,color,bg,border,onClick,clickable}){
  return <span onClick={onClick} style={{...numStyle,textShadow:color===C.red?`0 0 14px ${C.red}55`:undefined,display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:46,padding:"5px 14px",borderRadius:RAIO,fontSize:15,fontWeight:600,color,background:bg,border:`1px solid ${border}`,cursor:clickable?"pointer":"default",transition:"transform 0.1s,box-shadow 0.15s"}}
    onMouseEnter={e=>{if(clickable){e.currentTarget.style.transform="scale(1.08)";e.currentTarget.style.boxShadow=`0 0 12px ${color}33`;}}}
    onMouseLeave={e=>{if(clickable){e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="none";}}}>{value}</span>;
}
function Bar({prazo,fora,total}){if(!total)return null;const pP=(prazo/total)*100,pF=(fora/total)*100;
  // No painel a barra ganha escala atrás: dez traços de 10%, como
  // instrumento marca. Sem ela "42%" é um número que se lê; com
  // ela, é uma posição que se vê. E as cores ficam chapadas, que o
  // gradiente borra justamente a divisa entre os dois pedaços.
  return <div style={{display:"flex",alignItems:"center",gap:10,width:"100%"}}>
    <div style={{flex:1,position:"relative"}}>
      <div style={{height:7,borderRadius:1,background:C.cardAlt,overflow:"hidden",display:"flex"}}>
        <div style={{width:`${pP}%`,background:C.green,transition:"width 0.5s"}}/>
        <div style={{width:`${pF}%`,background:C.red,transition:"width 0.5s",boxShadow:`0 0 10px ${C.red}66`}}/>
      </div>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",opacity:.5,
        backgroundImage:`repeating-linear-gradient(90deg,${C.border} 0 1px,transparent 1px 10%)`}}/>
    </div>
    <span style={{fontSize:12,color:pF>=50?C.red:C.textDim,minWidth:36,textAlign:"right",...numStyle}}>{pF.toFixed(0)}%</span></div>;
}
function SummaryCard({label,value,color,icon,onClick}){
  // No painel o cartão não fecha: só dois colchetes de canto em fio
  // de 1px. E o brilho sai do próprio número, e só do vermelho —
  // moldura brilhando em todo bloco é enfeite, e enfeite em tela de
  // trabalho vira ruído.
  const alerta=color===C.red;
  return <div onClick={onClick} style={{flex:1,minWidth:120,background:C.card,
    borderRadius:RAIO,padding:"14px 16px",border:`1px solid ${C.border}`,
    display:"flex",flexDirection:"column",gap:2,cursor:onClick?"pointer":"default",
    position:"relative",overflow:"hidden"}}>
    <><span style={{position:"absolute",top:0,left:0,width:11,height:1,background:color,opacity:.8}}/>
              <span style={{position:"absolute",top:0,left:0,width:1,height:11,background:color,opacity:.8}}/>
              <span style={{position:"absolute",bottom:0,right:0,width:11,height:1,background:C.border}}/>
              <span style={{position:"absolute",bottom:0,right:0,width:1,height:11,background:C.border}}/></>
    <span style={{fontSize:9.5,color:C.textDim,letterSpacing:"0.2em",textTransform:"uppercase"}}>{label}</span>
    <div style={{display:"flex",alignItems:"baseline",gap:6}}>
      <span style={{fontSize:30,fontWeight:500,color,...numStyle,
        textShadow:alerta?`0 0 18px ${C.red}55`:undefined}}>{value.toLocaleString("pt-BR")}</span>
      </div>
  </div>;
}
function Check({checked,onChange}){
  return <div onClick={e=>{e.stopPropagation();onChange();}} style={{width:16,height:16,borderRadius:4,flexShrink:0,cursor:"pointer",border:checked?`2px solid ${C.accent}`:"2px solid #475569",background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
    {checked&&<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>;
}

/* ── OS Modal ── */
function OSModal({rows,familia,tssName,tipo,onClose}){
  // "busca" vem do campo de pesquisa da lateral: a OS pode ter linhas
  // no prazo e fora, entao o cabecalho nao afirma nenhum dos dois.
  const label=tipo==="prazo"?"No Prazo":tipo==="fora"?"Fora do Prazo":"Busca por OS";
  const color=tipo==="prazo"?C.green:tipo==="fora"?C.red:C.accent;
  const [modalSort,setModalSort]=useState({col:null,asc:true});
  const cols=[
    {key:"os",label:"Nº OS",get:r=>r["Número OS"]},{key:"tss",label:"TSS",get:r=>r["TSS"]},{key:"sf",label:"SF",get:r=>r["SF"]},
    {key:"end",label:"Endereço",get:r=>String(r["Endereço"]).trim()+", "+r["Número"]+(r["Complemento"]?" - "+String(r["Complemento"]).trim():"")},
    {key:"bairro",label:"Bairro",get:r=>r["Bairro"]},{key:"mun",label:"Município",get:r=>r["Município"]},
    {key:"tempo",label:"Tempo Residual",get:r=>r["Tempo Residual"],sort:r=>tempoDays(r["Tempo Residual"])},{key:"status",label:"Status",get:r=>r["Status da OS"]},
  ];
  const sorted=useMemo(()=>{if(!modalSort.col)return rows;const def=cols.find(c=>c.key===modalSort.col);if(!def)return rows;const fn=def.sort||def.get;
    return[...rows].sort((a,b)=>{let va=fn(a),vb=fn(b);if(typeof va==="string")va=va.toLowerCase();if(typeof vb==="string")vb=vb.toLowerCase();const cmp=va<vb?-1:va>vb?1:0;return modalSort.asc?cmp:-cmp;});},[rows,modalSort]);
  const toggleSort=(key)=>setModalSort(prev=>prev.col===key?{col:key,asc:!prev.asc}:{col:key,asc:true});
  // Rua com rede de gas da Comgas. So marca — nao reordena nem filtra nada.
  const gasPorLinha=useMemo(()=>sorted.map(r=>
    matchGasStreet(String(r["Endereço"]||"").trim())
  ),[sorted]);
  const totalGas=gasPorLinha.filter(Boolean).length;
  // Teste do mapa: so na familia de vazamento, para medir a cobertura
  // da base num universo pequeno antes de valer para tudo.
  const ehVazamento=matchFamiliaVazamento(familia);
  // A base agora esta no Supabase, entao pedir as ruas deste modal
  // antes de calcular. coordVer so existe para recalcular o memo
  // quando a resposta chega.
  const [coordVer,setCoordVer]=useState(0);
  const [coordCarregando,setCoordCarregando]=useState(false);
  useEffect(()=>{
    if(!ehVazamento) return;
    let vivo=true; setCoordCarregando(true);
    carregarRuas(sorted.map(r=>ruaKey(r["Endereço"])))
      .finally(()=>{if(vivo){setCoordCarregando(false);setCoordVer(v=>v+1);}});
    return()=>{vivo=false;};
  },[sorted,ehVazamento]);
  const coordPorLinha=useMemo(()=>ehVazamento
    ? sorted.map(r=>acharCoord(r["Endereço"],r["Número"],r["SF"]))
    : [],[sorted,ehVazamento,coordVer]);
  const nExato=coordPorLinha.filter(c=>c?.tipo==="exato").length;
  const nInterp=coordPorLinha.filter(c=>c?.tipo==="interpolado").length;
  const nAprox=coordPorLinha.filter(c=>c?.tipo==="vizinho"||c?.tipo==="rua").length;
  // Observações: valem para TODOS os serviços, não só vazamento.
  const sess=React.useContext(SessaoCtx);
  const [notaVer,setNotaVer]=useState(0);
  const [editando,setEditando]=useState(null);   // {linha, nota}
  useEffect(()=>{
    let vivo=true;
    carregarNotas(sorted.map(r=>String(r["Número OS"]||"").trim()))
      .finally(()=>{if(vivo)setNotaVer(v=>v+1);});
    return()=>{vivo=false;};
  },[sorted]);
  // A atualização automática reescreve o cache e avisa; o modal aberto
  // redesenha com as etiquetas novas sem precisar fechar e abrir.
  useEffect(()=>{const f=()=>setNotaVer(v=>v+1);window.addEventListener("notas-mudaram",f);
    return()=>window.removeEventListener("notas-mudaram",f);},[]);
  const notaPorLinha=useMemo(()=>sorted.map(r=>acharNota(r["Número OS"],r["TSS"])),[sorted,notaVer]);
  const nNotas=notaPorLinha.filter(Boolean).length;
  const nMao=coordPorLinha.filter(c=>c?.tipo==="manual"||c?.tipo==="manual-rua").length;
  const nMapa=coordPorLinha.filter(c=>c?.tipo==="osm"&&!c.longa).length;
  const nLonga=coordPorLinha.filter(c=>c?.tipo==="osm"&&c.longa).length;
  // Cadastro manual de coordenada: so para quem importa. A TV roda
  // sem login e nem ve o lapis. (sess ja foi lido acima, para as
  // observacoes.)
  const podeCadastrar=ehVazamento&&!!sess?.perfil?.pode_importar;
  const [cadastrando,setCadastrando]=useState(null);   // a linha aberta no formulario
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:"100%",maxWidth:1400,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontSize:16,fontWeight:700,color:C.text}}>{familia}</div><div style={{fontSize:13,color:C.textDim,marginTop:2}}>{tssName?tssName+" · ":""}<span style={{color}}>{label}</span> · {rows.length} OS
          {totalGas>0&&<span style={{marginLeft:8,fontSize:12,color:C.amber,fontWeight:700,padding:"2px 9px",borderRadius:6,border:"1px solid rgba(245,158,11,0.4)",background:C.amberBg}}>🔥 {totalGas} com rede de gás</span>}
          {nNotas>0&&<span title="Serviços com observação registrada por alguém da equipe"
            style={{marginLeft:8,fontSize:12,color:"#e9b949",fontWeight:700,padding:"2px 9px",borderRadius:6,border:"1px solid rgba(233,185,73,0.35)",background:"rgba(233,185,73,0.08)"}}>
            📝 {nNotas} com observação</span>}
          {ehVazamento&&<span title="Clique no endereço para abrir no Google Maps. Verde: a turma já executou nesse número. Âmbar: só a rua está mapeada, abre no meio dela. Cinza: fora da base, abre uma busca por texto."
            style={{marginLeft:8,fontSize:12,fontWeight:700,padding:"2px 9px",borderRadius:6,border:`1px solid ${C.border}`,background:C.cardAlt,color:C.textMuted,cursor:"help"}}>
            {coordCarregando?<span style={{color:C.textDim}}>📍 consultando a biblioteca…</span>
             :<>📍 <span style={{color:C.green}}>{nExato} exatos</span> · <span style={{color:"#38bdf8"}}>{nInterp} interpolados</span> · <span style={{color:C.amber}}>{nAprox} aproximados</span>
               {nMao>0&&<> · <span style={{color:"#a78bfa"}}>{nMao} à mão</span></>}
               {nMapa>0&&<> · <span style={{color:"#2dd4bf"}}>{nMapa} do mapa</span></>}
               {nLonga>0&&<> · <span style={{color:C.amber}}>{nLonga} em via longa</span></>}
               · <span style={{color:C.textDim}}>{rows.length-nExato-nInterp-nAprox-nMao-nMapa-nLonga} sem base</span></>}
          </span>}
        </div></div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
            <th title="Observação do serviço" style={{padding:"10px 6px 10px 12px",width:30,borderBottom:`1px solid ${C.border}`}}/>
            {cols.map(col=><th key={col.key} onClick={()=>toggleSort(col.key)} style={{padding:"10px 12px",textAlign:"left",fontSize:9.5,fontWeight:500,color:modalSort.col===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:"0.18em",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"}}>{col.label}{modalSort.col===col.key?(modalSort.asc?" ↑":" ↓"):""}</th>)}
          </tr></thead>
          <tbody>{sorted.map((r,i)=>{
            const nt=notaPorLinha[i];
            return <React.Fragment key={i}>
            <tr style={{background:nt?FUNDO_NOTA:(i%2?C.cardAlt:"transparent")}}
              onMouseEnter={e=>{if(!nt)e.currentTarget.style.background=C.rowHover;}}
              onMouseLeave={e=>{if(!nt)e.currentTarget.style.background=i%2?C.cardAlt:"transparent";}}>
              {/* Botao da observacao. Sempre presente, nunca escondido
                  atras de hover: quem precisa da nota e quem nao sabe
                  que ela existe. */}
              <td style={{padding:"8px 6px 8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,verticalAlign:"top",
                ...(nt?{boxShadow:`inset 3px 0 0 ${COR_NOTA}`}:{})}}>
                {nt
                  ? <span onClick={e=>{e.stopPropagation();setEditando({linha:r,nota:nt});}} title="Editar a observação"
                      style={{cursor:"pointer",fontSize:13,userSelect:"none"}}>📝</span>
                  : <span onClick={e=>{e.stopPropagation();setEditando({linha:r,nota:null});}} title="Adicionar uma observação"
                      style={{cursor:"pointer",userSelect:"none",display:"inline-flex",alignItems:"center",
                        justifyContent:"center",width:20,height:20,borderRadius:6,fontSize:14,lineHeight:1,
                        color:C.accent,border:`1px solid ${C.border}`,background:C.cardAlt,transition:"all 0.12s"}}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.accentBg;e.currentTarget.style.borderColor="rgba(59,130,246,0.45)";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=C.cardAlt;e.currentTarget.style.borderColor=C.border;}}>+</span>}
              </td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,fontVariantNumeric:"tabular-nums",fontWeight:600,color:C.accent}}>{r["Número OS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r["TSS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,fontWeight:600,color:C.textMuted}}>{r["SF"]}</td>
              <td title={gasPorLinha[i]?"Rua com rede de gás Comgás: "+gasPorLinha[i]:undefined}
                style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,whiteSpace:"nowrap",
                  ...(gasPorLinha[i]?{color:C.amber,fontWeight:700,background:C.amberBg,boxShadow:"inset 3px 0 0 "+C.amber}:{})}}>
                {gasPorLinha[i]&&<span style={{marginRight:6}}>🔥</span>}
                {ehVazamento?(()=>{const c=coordPorLinha[i];
                  const manual=c?.tipo==="manual"||c?.tipo==="manual-rua";
                  const doMapa=c?.tipo==="osm";
                  const cor=manual?"#a78bfa":doMapa?(c.longa?C.amber:"#2dd4bf"):c?.tipo==="exato"?C.green:c?.tipo==="interpolado"?"#38bdf8":c?C.amber:C.textDim;
                  const quando=c?.quando?new Date(c.quando).toLocaleDateString("pt-BR"):"";
                  const kmTxt=c?.ext?(c.ext>=1000?(c.ext/1000).toFixed(1)+" km":c.ext+" m"):"";
                  const dica=doMapa&&c.longa?`ATENÇÃO — via de ${kmTxt}. Do mapa do OpenStreetMap: a via é esta, mas o ponto é o MEIO dela e pode estar longe da OS. Confira antes de mandar equipe, ou cadastre o ponto certo no ✏️.`
                            :doMapa?`Tirada do mapa do OpenStreetMap — o nome aparece em um só lugar na região, então a rua é esta (${kmTxt}). Abre no meio dela, sem o número.`
                            :c?.tipo==="manual"?`Cadastrada à mão neste número${quando?" em "+quando:""}`
                            :c?.tipo==="manual-rua"?`Rua cadastrada à mão${quando?" em "+quando:""} — abre no ponto marcado, o número não foi informado`
                            :c?.ligacao?`Coordenada exata — ligação da Sabesp neste número, setor ${c.sf}`
                            :c?.tipo==="exato"?`Coordenada exata — ${c.obs} execução${c.obs>1?"ões":""} neste número, dispersão ${c.desvio} m`
                            :c?.tipo==="interpolado"?`Número não mapeado — posição calculada entre os nº ${c.entre[0]} e ${c.entre[1]}, que já foram executados`
                            :c?.tipo==="vizinho"?`Número não mapeado — abre no vizinho conhecido mais próximo, ${c.casas} número${c.casas>1?"s":""} de distância`
                            :c?.tipo==="rua"?`Número não mapeado e a rua não tem número na base — abre no meio dela (${c.obs} execuções, dispersão ${c.desvio} m)`
                            :"Fora da base — abre uma busca por texto no Google Maps";
                  return <>
                    <span onClick={e=>{e.stopPropagation();abrirNoMapa(r);}} title={dica}
                      style={{cursor:"pointer",textDecoration:"underline",textDecorationStyle:c?.tipo==="exato"||manual?"solid":"dotted",textDecorationColor:cor,textUnderlineOffset:3}}>
                      <span style={{color:cor,marginRight:4}}>{manual?"📌":doMapa?(c.longa?"⚠️":"🗺️"):c?"📍":"🔍"}</span>
                      {String(r["Endereço"]).trim()}, {r["Número"]}{r["Complemento"]?" - "+String(r["Complemento"]).trim():""}
                    </span>
                    {podeCadastrar&&<span onClick={e=>{e.stopPropagation();setCadastrando(r);}}
                      title={c?"Corrigir esta coordenada à mão":"Cadastrar a coordenada desta rua à mão"}
                      style={{cursor:"pointer",marginLeft:7,fontSize:11,opacity:c?0.35:0.85,userSelect:"none"}}
                      onMouseEnter={e=>(e.currentTarget.style.opacity=1)}
                      onMouseLeave={e=>(e.currentTarget.style.opacity=c?0.35:0.85)}>✏️</span>}
                  </>;})()
                 :<>{String(r["Endereço"]).trim()}, {r["Número"]}{r["Complemento"]?" - "+String(r["Complemento"]).trim():""}</>}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`}}>{r["Bairro"]}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`}}>{r["Município"]}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`,fontWeight:600,color:tempo(r["Tempo Residual"])==="fora"?C.red:C.green}}>{r["Tempo Residual"]}</td>
              <td style={{padding:"8px 12px",borderBottom:nt?"none":`1px solid ${C.border}`}}>{r["Status da OS"]}</td>
            </tr>
            {/* A nota ocupa uma linha inteira, com faixa ambar na borda.
                Ela nao some nem encolhe: e o unico jeito de alcancar
                quem abriu a tela sem saber que havia algo a saber. */}
            {nt&&<tr style={{background:FUNDO_NOTA}}>
              <td colSpan={cols.length+1} onClick={()=>setEditando({linha:r,nota:nt})}
                style={{padding:"0 12px 8px 12px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",
                  boxShadow:`inset 3px 0 0 ${COR_NOTA}`}}>
                {/* Nota costuma ser curta. Autor e data vao na mesma
                    linha, depois de uma barra, para o bloco nao ficar
                    mais alto que a propria OS. */}
                <div style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"center",paddingLeft:2}}>
                  {(nt.tags||[]).map(t=><Etiqueta key={t} id={t} dia={t==="AGENDADO"?nt.agendado_para:null} pequena/>)}
                  {nt.nota&&<span style={{fontSize:13,color:C.text,lineHeight:1.45,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{nt.nota}</span>}
                  <span style={{fontSize:11,color:C.textDim}}>
                    | {nt.autor_nome||nt.autor_email||"autor não registrado"} · {fmtDate(nt.atualizado_em)}
                    {nt.outraTss&&<span style={{color:C.amber}}> · registrada em {nt.outraTss}</span>}
                  </span>
                </div>
              </td>
            </tr>}
            </React.Fragment>;})}</tbody>
        </table>
      </div>
    </div>
    {cadastrando&&<CoordModal linha={cadastrando} sess={sess}
      onClose={()=>setCadastrando(null)}
      onSalvou={()=>{
        setCadastrando(null);
        // A rua saiu do cache ao salvar; recarrega e repinta a tabela.
        carregarRuas(sorted.map(r=>ruaKey(r["Endereço"]))).then(()=>setCoordVer(v=>v+1));
      }}/>}
    {editando&&<NotaModal linha={editando.linha} nota={editando.nota} sess={sess}
      onClose={()=>setEditando(null)}
      onSalvou={()=>{
        setEditando(null);
        // A OS saiu do cache ao gravar; recarrega e repinta a tabela.
        carregarNotas(sorted.map(r=>String(r["Número OS"]||"").trim())).then(()=>setNotaVer(v=>v+1));
      }}/>}
  </div>;
}

/* ── Diff Modal (comparação dia a dia) ── */
function DiffModal({historico,dia,prevDia,activeUnit,familyFilter,onClose}){
  const unidadeFilter = UNIT_TO_HISTORICO[activeUnit];
  const diffColor = (v) => v < 0 ? C.green : v > 0 ? C.red : C.textDim;
  const diffText = (v) => v > 0 ? "+"+v : String(v);

  const diffData = useMemo(()=>{
    const agrupar = (d) => {
      const m = {};
      historico.forEach(r => {
        if (r.dia !== d) return;
        if (unidadeFilter !== null && r.unidade !== unidadeFilter) return;
        if (familyFilter.size > 0 && !familyFilter.has(r.familia)) return;
        if (!m[r.familia]) m[r.familia] = { no_prazo:0, fora_prazo:0, total:0 };
        m[r.familia].no_prazo += r.no_prazo;
        m[r.familia].fora_prazo += r.fora_prazo;
        m[r.familia].total += r.total;
      });
      return m;
    };
    const atual = agrupar(dia);
    const anterior = prevDia ? agrupar(prevDia) : {};
    const allFams = new Set([...Object.keys(atual), ...Object.keys(anterior)]);
    const rows = [];
    allFams.forEach(fam => {
      const a = anterior[fam] || { total:0, no_prazo:0, fora_prazo:0 };
      const b = atual[fam] || { total:0, no_prazo:0, fora_prazo:0 };
      rows.push({ familia:fam, anterior:a.total, atual:b.total, diff:b.total-a.total,
        antFora:a.fora_prazo, atualFora:b.fora_prazo, diffFora:b.fora_prazo-a.fora_prazo });
    });
    rows.sort((a,b) => a.diff - b.diff);
    return rows;
  },[historico,dia,prevDia,unidadeFilter,familyFilter]);

  const totais = useMemo(()=> diffData.reduce((acc,r) => ({
    anterior:acc.anterior+r.anterior, atual:acc.atual+r.atual, diff:acc.diff+r.diff,
    antFora:acc.antFora+r.antFora, atualFora:acc.atualFora+r.atualFora, diffFora:acc.diffFora+r.diffFora,
  }),{anterior:0,atual:0,diff:0,antFora:0,atualFora:0,diffFora:0}),[diffData]);

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:"100%",maxWidth:900,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:C.text}}>Variação da Carteira</div>
          <div style={{fontSize:13,color:C.textDim,marginTop:2}}>
            {prevDia ? fmtDiaFull(prevDia)+" → "+fmtDiaFull(dia) : fmtDiaFull(dia)+" (sem dia anterior)"}
            {" · "}<span style={{color:diffColor(totais.diff),fontWeight:700}}>{diffText(totais.diff)} OS</span>
          </div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>
      <div style={{padding:"12px 20px",display:"flex",gap:16,borderBottom:`1px solid ${C.border}`,background:C.cardAlt}}>
        <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5}}>Total</div><div style={{fontSize:22,fontWeight:800,color:diffColor(totais.diff)}}>{diffText(totais.diff)}</div></div>
        <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5}}>Fora do Prazo</div><div style={{fontSize:22,fontWeight:800,color:diffColor(totais.diffFora)}}>{diffText(totais.diffFora)}</div></div>
        <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5}}>Reduziram</div><div style={{fontSize:22,fontWeight:800,color:C.green}}>{diffData.filter(r=>r.diff<0).length}</div></div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
            <th style={thStyle}>Família</th>
            <th style={{...thStyle,textAlign:"center"}}>{prevDia?fmtDiaShort(prevDia):"—"}</th>
            <th style={{...thStyle,textAlign:"center"}}>{fmtDiaShort(dia)}</th>
            <th style={{...thStyle,textAlign:"center"}}>Diferença</th>
            <th style={{...thStyle,textAlign:"center"}}>Fora Prazo</th>
          </tr></thead>
          <tbody>
            {diffData.map((r,i)=>(
              <tr key={r.familia} style={{background:i%2?C.cardAlt:"transparent"}} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
                <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:600}}>{r.familia}</td>
                <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums",color:C.textMuted}}>{r.anterior}</td>
                <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums",fontWeight:600}}>{r.atual}</td>
                <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums",fontWeight:700,color:diffColor(r.diff)}}>
                  {r.diff!==0?<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:6,background:r.diff<0?C.greenBg:C.redBg,border:`1px solid ${r.diff<0?C.greenBorder:C.redBorder}`}}>{r.diff<0?"↓":"↑"} {diffText(r.diff)}</span>:<span style={{color:C.textDim}}>—</span>}
                </td>
                <td style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>
                  {r.diffFora!==0?<span style={{fontWeight:600,color:diffColor(r.diffFora)}}>{diffText(r.diffFora)}</span>:<span style={{color:C.textDim}}>—</span>}
                </td>
              </tr>))}
            <tr style={{background:C.headerBg,fontWeight:800}}>
              <td style={{padding:"12px 14px",borderTop:`2px solid ${C.accent}`}}>TOTAL</td>
              <td style={{padding:"12px 14px",borderTop:`2px solid ${C.accent}`,textAlign:"center",fontVariantNumeric:"tabular-nums",color:C.textMuted}}>{totais.anterior}</td>
              <td style={{padding:"12px 14px",borderTop:`2px solid ${C.accent}`,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{totais.atual}</td>
              <td style={{padding:"12px 14px",borderTop:`2px solid ${C.accent}`,textAlign:"center",fontVariantNumeric:"tabular-nums",color:diffColor(totais.diff)}}>
                <span style={{padding:"3px 12px",borderRadius:6,background:totais.diff<0?C.greenBg:totais.diff>0?C.redBg:"transparent",border:`1px solid ${totais.diff<0?C.greenBorder:totais.diff>0?C.redBorder:C.border}`}}>{totais.diff<0?"↓":"↑"} {diffText(totais.diff)}</span>
              </td>
              <td style={{padding:"12px 14px",borderTop:`2px solid ${C.accent}`,textAlign:"center",fontVariantNumeric:"tabular-nums",color:diffColor(totais.diffFora)}}>{diffText(totais.diffFora)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}
const thStyle = {padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"};

/* ── Family Dropdown (multi-select) ── */
function FamilyDropdown({allFamilies,selected,onChange}){
  const [open,setOpen]=useState(false);
  const ref=useRef();
  const allSelected = selected.size===0;
  const label = allSelected ? "Todas as famílias" : selected.size===1 ? [...selected][0] : selected.size+" famílias";

  useEffect(()=>{
    const close=(e)=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);
  },[]);

  const toggle=(fam)=>{
    const n=new Set(selected);
    if(n.has(fam)) n.delete(fam); else n.add(fam);
    if(n.size===allFamilies.length) onChange(new Set());
    else onChange(n);
  };
  const selectAll=()=>onChange(new Set());

  return <div ref={ref} style={{position:"relative"}}>
    <div onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.cardAlt,cursor:"pointer",fontSize:12,color:allSelected?C.textDim:C.accent,fontWeight:600,whiteSpace:"nowrap",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis"}}>
      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
      <span style={{fontSize:8,color:C.textDim}}>{open?"▲":"▼"}</span>
    </div>
    {open&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",zIndex:100,minWidth:260,maxHeight:300,overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
      <div onClick={selectAll} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:700,color:allSelected?C.accent:C.textMuted,borderBottom:`1px solid ${C.border}`}}
        onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
        <Check checked={allSelected} onChange={selectAll}/> Todas
      </div>
      {allFamilies.map(fam=>{
        const on = selected.size===0 || selected.has(fam);
        return <div key={fam} onClick={()=>toggle(fam)} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",cursor:"pointer",fontSize:12,color:on?C.text:C.textDim,opacity:on?1:0.5}}
          onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
          <Check checked={on} onChange={()=>toggle(fam)}/> {fam}
        </div>;
      })}
    </div>}
  </div>;
}

/* ── Historico Chart com filtros ── */
function CustomTooltip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",fontSize:12,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
    <div style={{fontWeight:700,color:C.text,marginBottom:6}}>{label}</div>
    {payload.map((p,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"2px 0"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}/><span style={{color:C.textMuted}}>{p.name}:</span>
      <span style={{fontWeight:700,color:p.color,fontVariantNumeric:"tabular-nums"}}>{p.value.toLocaleString("pt-BR")}</span>
    </div>))}
    <div style={{fontSize:10,color:C.textDim,marginTop:4,borderTop:`1px solid ${C.border}`,paddingTop:4}}>Clique para ver variação</div>
  </div>;
}

const dateInputStyle = {padding:"4px 8px",borderRadius:6,fontSize:12,fontWeight:600,border:`1px solid ${C.border}`,background:C.cardAlt,color:C.text,cursor:"pointer",colorScheme:"dark"};

/* ── Modal de OS que saíram do pendente ── */
function OSExitModal({diaA,diaB,activeUnit,familyFilter,onClose}){
  const [loading,setLoading]=useState(true);
  const [osExited,setOsExited]=useState([]);
  const [sortCol,setSortCol]=useState("familia");
  const [sortAsc,setSortAsc]=useState(true);
  const unidadeFilter = UNIT_TO_HISTORICO[activeUnit];

  useEffect(()=>{
    (async()=>{
      try{
        const [osA,osB] = await Promise.all([fetchDiarioOS(diaA),fetchDiarioOS(diaB)]);
        const setB = new Set(osB.map(osKey));   // mesma chave (OS,TSS) usada na carteira
        let exited = osA.filter(r=>!setB.has(osKey(r))&&!isGloballyExcludedTss(r.tss));
        // Aplicar filtros
        if(unidadeFilter) exited=exited.filter(r=>r.unidade===unidadeFilter);
        if(familyFilter.size>0) exited=exited.filter(r=>familyFilter.has(r.familia));
        setOsExited(exited);
      }catch(e){console.error(e);}
      setLoading(false);
    })();
  },[diaA,diaB,unidadeFilter,familyFilter]);

  const sorted = useMemo(()=>{
    return [...osExited].sort((a,b)=>{
      let va=a[sortCol]||"",vb=b[sortCol]||"";
      if(typeof va==="string"){va=va.toLowerCase();vb=vb.toLowerCase();}
      const cmp=va<vb?-1:va>vb?1:0;
      return sortAsc?cmp:-cmp;
    });
  },[osExited,sortCol,sortAsc]);

  const byFamilia = useMemo(()=>{
    const m={};osExited.forEach(r=>{if(!m[r.familia])m[r.familia]=0;m[r.familia]++;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[osExited]);

  const toggleSort=(col)=>setSortCol(prev=>prev===col?(setSortAsc(!sortAsc),col):(setSortAsc(true),col));

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:"100%",maxWidth:1000,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:C.text}}>OS que saíram do pendente</div>
          <div style={{fontSize:13,color:C.textDim,marginTop:2}}>
            {fmtDiaFull(diaA)} → {fmtDiaFull(diaB)} · <span style={{color:C.green,fontWeight:700}}>{osExited.length} OS resolvidas</span>
          </div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>

      {loading?<div style={{padding:40,textAlign:"center",color:C.textDim}}>Carregando...</div>:<>
        {/* Resumo por família */}
        {byFamilia.length>0&&<div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:C.cardAlt}}>
          <div style={{display:"flex",gap:12,marginBottom:8}}>
            <span style={{fontSize:12,color:C.green,fontWeight:700}}>No prazo: {osExited.filter(r=>!r.fora_prazo).length}</span>
            <span style={{fontSize:12,color:C.red,fontWeight:700}}>Fora do prazo: {osExited.filter(r=>r.fora_prazo).length}</span>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {byFamilia.map(([fam,count])=>(
              <span key={fam} style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:C.greenBg,color:C.green,border:`1px solid ${C.greenBorder}`,fontWeight:600}}>
                {fam}: {count}
              </span>
            ))}
          </div>
        </div>}

        {osExited.length===0?<div style={{padding:40,textAlign:"center",color:C.textDim}}>
          {`Nenhuma OS saiu do pendente entre ${fmtDiaFull(diaA)} e ${fmtDiaFull(diaB)}`}
          {familyFilter.size>0?" (com os filtros selecionados)":""}
        </div>:
        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
              {[{key:"numero_os",label:"Nº OS"},{key:"familia",label:"Família"},{key:"tss",label:"TSS"},{key:"endereco",label:"Endereço"},{key:"unidade",label:"Unidade"},{key:"fora_prazo",label:"Prazo"}].map(col=>
                <th key={col.key} onClick={()=>toggleSort(col.key)} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:sortCol===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none"}}>{col.label}{sortCol===col.key?(sortAsc?" ↑":" ↓"):""}</th>
              )}
            </tr></thead>
            <tbody>{sorted.map((r,i)=>{
              const rowColor = r.fora_prazo ? C.red : C.green;
              const rowBg = r.fora_prazo ? C.redBg : C.greenBg;
              return <tr key={r.numero_os} style={{background:i%2?C.cardAlt:"transparent",borderLeft:`3px solid ${rowColor}`}} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:600,color:C.accent,fontVariantNumeric:"tabular-nums"}}>{r.numero_os}</td>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontWeight:600}}>{r.familia}</td>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.tss}</td>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,whiteSpace:"nowrap"}}>{r.endereco}{r.numero_end?", "+r.numero_end:""}{r.complemento?" - "+r.complemento:""}</td>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.textMuted}}>{r.unidade}</td>
                <td style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,fontWeight:700,color:rowColor,background:rowBg,border:`1px solid ${r.fora_prazo?C.redBorder:C.greenBorder}`}}>{r.fora_prazo?"Fora":"OK"}</span>
                </td>
              </tr>;}
            )}</tbody>
          </table>
        </div>}
      </>}
    </div>
  </div>;
}

function HistoricoChart({historico,activeUnit}){
  const [showChart,setShowChart]=useState(true);
  const [diffModal,setDiffModal]=useState(null);
  const [exitModal,setExitModal]=useState(null);
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [familyFilter,setFamilyFilter]=useState(new Set());
  const unidadeFilter = UNIT_TO_HISTORICO[activeUnit];

  const allFamilies = useMemo(()=>{
    if(!historico?.length) return [];
    const s = new Set();
    historico.forEach(r=>{
      if(unidadeFilter!==null && r.unidade!==unidadeFilter) return;
      s.add(r.familia);
    });
    return [...s].sort();
  },[historico,unidadeFilter]);

  useEffect(()=>{
    if(familyFilter.size>0){
      const valid = new Set([...familyFilter].filter(f=>allFamilies.includes(f)));
      if(valid.size!==familyFilter.size) setFamilyFilter(valid);
    }
  },[allFamilies]);

  const chartData = useMemo(()=>{
    if(!historico?.length)return[];
    const byDay={};
    historico.forEach(r=>{
      if(unidadeFilter!==null && r.unidade!==unidadeFilter) return;
      if(familyFilter.size>0 && !familyFilter.has(r.familia)) return;
      if(!byDay[r.dia]) byDay[r.dia]={dia:r.dia,no_prazo:0,fora_prazo:0,total:0};
      byDay[r.dia].no_prazo += r.no_prazo;
      byDay[r.dia].fora_prazo += r.fora_prazo;
      byDay[r.dia].total += r.total;
    });
    let data = Object.values(byDay).sort((a,b)=>a.dia.localeCompare(b.dia));
    if(dateFrom) data = data.filter(d => d.dia >= dateFrom);
    if(dateTo) data = data.filter(d => d.dia <= dateTo);
    return data.map(d=>({...d,label:fmtDiaShort(d.dia)}));
  },[historico,unidadeFilter,familyFilter,dateFrom,dateTo]);

  const handleChartClick = useCallback((e)=>{
    if(!e?.activePayload?.length) return;
    const clicked = e.activePayload[0].payload;
    const idx = chartData.findIndex(d=>d.dia===clicked.dia);
    const prevDia = idx > 0 ? chartData[idx-1].dia : null;
    setDiffModal({dia:clicked.dia, prevDia});
  },[chartData]);

  if(!historico?.length) return null;

  const primeiro = chartData[0];
  const ultimo = chartData[chartData.length-1];
  const varTotal = primeiro&&ultimo ? ultimo.total-primeiro.total : 0;
  const varFora = primeiro&&ultimo ? ultimo.fora_prazo-primeiro.fora_prazo : 0;

  return <div style={{background:C.card,borderRadius:RAIO,border:`1px solid ${C.border}`,marginBottom:16,overflow:"hidden"}}>
    <div onClick={()=>setShowChart(!showChart)} style={{padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",borderBottom:showChart?`1px solid ${C.border}`:"none"}}
      onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:10,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:showChart?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
        <span style={{fontSize:13,fontWeight:700,color:C.text}}>Evolução da Carteira</span>
        <span style={{fontSize:11,color:C.textDim}}>({chartData.length} dias)</span>
      </div>
      {chartData.length>=2&&<div style={{display:"flex",gap:12,fontSize:12}}>
        <span style={{color:varTotal>0?C.red:varTotal<0?C.green:C.textDim,fontWeight:600}}>{varTotal>0?"+":""}{varTotal} OS</span>
        <span style={{color:varFora>0?C.red:varFora<0?C.green:C.textDim,fontWeight:600}}>{varFora>0?"+":""}{varFora} fora</span>
      </div>}
    </div>

    {showChart&&<div style={{padding:"12px 16px 8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.textDim,fontWeight:600}}>De:</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={dateInputStyle}/>
          <span style={{fontSize:11,color:C.textDim,fontWeight:600}}>Até:</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={dateInputStyle}/>
          {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",border:`1px solid ${C.border}`,background:"transparent",color:C.textDim}}>Limpar</button>}
        </div>
        <div style={{width:1,height:20,background:C.border}}/>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.textDim,fontWeight:600}}>Família:</span>
          <FamilyDropdown allFamilies={allFamilies} selected={familyFilter} onChange={setFamilyFilter}/>
        </div>
      </div>

      {chartData.length>0 ? <>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{top:5,right:10,left:0,bottom:5}} onClick={handleChartClick} style={{cursor:"pointer"}}>
            <defs>
              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.15}/><stop offset="95%" stopColor={C.accent} stopOpacity={0}/></linearGradient>
              <linearGradient id="gradPrazo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.15}/><stop offset="95%" stopColor={C.green} stopOpacity={0}/></linearGradient>
              <linearGradient id="gradFora" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.red} stopOpacity={0.15}/><stop offset="95%" stopColor={C.red} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
            <XAxis dataKey="label" tick={{fill:C.textDim,fontSize:11}} tickLine={false} axisLine={{stroke:C.border}}/>
            <YAxis tick={{fill:C.textDim,fontSize:11}} tickLine={false} axisLine={false} width={45}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Area type="monotone" dataKey="total" name="Total" stroke={C.accent} fill="url(#gradTotal)" strokeWidth={2} dot={chartData.length<=31} activeDot={{r:6,stroke:C.accent,strokeWidth:2,fill:C.card}}/>
            <Area type="monotone" dataKey="no_prazo" name="No Prazo" stroke={C.green} fill="url(#gradPrazo)" strokeWidth={2} dot={chartData.length<=31} activeDot={{r:5,stroke:C.green,strokeWidth:2,fill:C.card}}/>
            <Area type="monotone" dataKey="fora_prazo" name="Fora do Prazo" stroke={C.red} fill="url(#gradFora)" strokeWidth={2} dot={chartData.length<=31} activeDot={{r:5,stroke:C.red,strokeWidth:2,fill:C.card}}/>
          </AreaChart>
        </ResponsiveContainer>
        <div style={{display:"flex",justifyContent:"center",gap:20,padding:"4px 0 2px"}}>
          {[{label:"Total",color:C.accent},{label:"No Prazo",color:C.green},{label:"Fora do Prazo",color:C.red}].map(l=>
            <div key={l.label} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.textMuted}}>
              <span style={{width:10,height:3,borderRadius:2,background:l.color}}/>{l.label}
            </div>
          )}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:12,padding:"6px 0 4px"}}>
          <span style={{fontSize:10,color:C.textDim}}>Clique em um ponto para ver a variação por família</span>
          {chartData.length>=2&&<button onClick={()=>{
            const dA=chartData[0].dia, dB=chartData[chartData.length-1].dia;
            setExitModal({diaA:dA,diaB:dB});
          }} style={{fontSize:11,color:C.green,fontWeight:600,cursor:"pointer",padding:"3px 12px",borderRadius:6,border:`1px solid ${C.greenBorder}`,background:C.greenBg}}>
            OS que saíram do pendente
          </button>}
        </div>
      </> : <div style={{padding:"40px 20px",textAlign:"center",color:C.textDim,fontSize:13}}>Sem dados para o período selecionado</div>}
    </div>}

    {diffModal&&<DiffModal historico={historico} dia={diffModal.dia} prevDia={diffModal.prevDia} activeUnit={activeUnit} familyFilter={familyFilter} onClose={()=>setDiffModal(null)}/>}
    {exitModal&&<OSExitModal diaA={exitModal.diaA} diaB={exitModal.diaB} activeUnit={activeUnit} familyFilter={familyFilter} onClose={()=>setExitModal(null)}/>}
  </div>;
}
/* ── Family Row ── */
function FamilyRow({fam,rows,excludedTSS,onToggleTSS,onToggleAll,idx}){
  const [expanded,setExpanded]=useState(false);const [modal,setModal]=useState(null);
  const [subAberto,setSubAberto]=useState(()=>new Set());
  const activeRows=rows.filter(r=>!excludedTSS.has(String(r["TSS"]||"").trim()));
  // Os grupos guardam os MEMBROS, nao so o nome: o filtro de TSS e
  // o modal continuam trabalhando com a TSS crua do GEOCALL, que e
  // o que existe na linha. O agrupamento e so de apresentacao.
  const tssGroups=useMemo(()=>{
    const m={};
    rows.forEach(r=>{
      const crua=String(r["TSS"]||"").trim();
      const nome=grupoDaTss(crua);
      if(!m[nome])m[nome]={all:[],prazo:[],fora:[],membros:new Set()};
      m[nome].membros.add(crua);
      m[nome].all.push(r);
      const st=tempo(r["Tempo Residual"]);if(st)m[nome][st].push(r);
    });
    return Object.entries(m).sort(([a],[b])=>a.localeCompare(b))
      .map(([name,d])=>({name,...d,membros:[...d.membros]}));
  },[rows]);
  const prazo=activeRows.filter(r=>tempo(r["Tempo Residual"])==="prazo").length;
  const fora=activeRows.filter(r=>tempo(r["Tempo Residual"])==="fora").length;
  const total=prazo+fora;
  const allNames=tssGroups.flatMap(t=>t.membros);
  const allOff=allNames.every(n=>excludedTSS.has(n));const someOff=allNames.some(n=>excludedTSS.has(n));const filterActive=someOff&&!allOff;
  const openModal=(tipo,tssName,membros)=>{let f=activeRows;
    if(membros)f=f.filter(r=>membros.includes(String(r["TSS"]).trim()));
    f=f.filter(r=>tempo(r["Tempo Residual"])===tipo).sort((a,b)=>tempoDays(a["Tempo Residual"])-tempoDays(b["Tempo Residual"]));
    if(f.length>0)setModal({rows:f,tipo,tssName});};
  // Familia com subgrupos abre nos subitens, nao nas 45 TSS.
  // "Outros" recolhe o que nao esta em lista nenhuma — nunca some.
  const sub=SUB_POR_FAMILIA[String(fam||"").trim().toUpperCase()];
  const blocos=useMemo(()=>{
    if(!sub) return null;
    const porSub={};
    for(const g of tssGroups){
      const nome=sub.de[g.name]||"Outros";
      (porSub[nome]||(porSub[nome]=[])).push(g);
    }
    return [...sub.ordem,"Outros"].filter(n=>porSub[n]?.length).map(n=>{
      const gs=porSub[n];
      const membros=gs.flatMap(g=>g.membros);
      const ligados=gs.filter(g=>!g.membros.every(m=>excludedTSS.has(m)));
      return {nome:n,grupos:gs,membros,
        all:gs.reduce((a,g)=>a+g.all.length,0),
        prazo:ligados.reduce((a,g)=>a+g.prazo.length,0),
        fora:ligados.reduce((a,g)=>a+g.fora.length,0)};
    });
  },[sub,tssGroups,excludedTSS]);
  // Some so a familia que nao tem dado nenhum de prazo. Antes a regra
  // era "total===0", e total conta so as TSS marcadas: bastava clicar
  // "Nenhum" e recolher para a familia sumir — sem a linha, nao havia
  // onde clicar "Todos", e como o filtro fica salvo no navegador, ela
  // continuava sumida a cada visita.
  const semDado=rows.every(r=>!tempo(r["Tempo Residual"]));
  if(semDado&&!expanded)return null;
  return <>
    <tr style={{background:idx%2===0?"transparent":C.cardAlt,cursor:"pointer",opacity:allOff&&!expanded?0.5:1}} onClick={()=>setExpanded(!expanded)} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=idx%2===0?"transparent":C.cardAlt)}>
      <td style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}><div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:10,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
        <span style={{fontSize:14,fontWeight:700}}>{fam}</span>
        {allOff&&<span title="Todas as TSS desta família estão desmarcadas. Abra e clique em Todos para voltar."
          style={{fontSize:10,padding:"1px 7px",borderRadius:8,background:"rgba(148,163,184,0.1)",color:C.textDim,border:`1px solid ${C.border}`,fontWeight:700}}>tudo desmarcado</span>}
        {filterActive&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:8,background:C.amberBg,color:C.amber,border:"1px solid rgba(245,158,11,0.25)",fontWeight:700}}>filtrado</span>}
      </div></td>
      <td style={{padding:"12px 16px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}><Pill value={prazo} color={C.green} bg={C.greenBg} border={C.greenBorder} clickable={prazo>0} onClick={e=>{e.stopPropagation();if(prazo>0)openModal("prazo");}}/></td>
      <td style={{padding:"12px 16px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}><Pill value={fora} color={C.red} bg={C.redBg} border={C.redBorder} clickable={fora>0} onClick={e=>{e.stopPropagation();if(fora>0)openModal("fora");}}/></td>
      <td style={{padding:"12px 16px",textAlign:"center",fontSize:14,fontWeight:600,color:C.textMuted,borderBottom:`1px solid ${C.border}`}}>{total}</td>
      <td style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,minWidth:150}}><Bar prazo={prazo} fora={fora} total={total}/></td>
    </tr>
    {expanded&&<tr><td colSpan={5} style={{padding:0,background:"rgba(15,23,42,0.5)",borderBottom:`1px solid ${C.border}`}}>
      <div style={{padding:"10px 16px 14px 40px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:12,color:C.textDim,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Filtro de TSS</span>
          <button onClick={e=>{e.stopPropagation();onToggleAll(allNames,true);}} style={btnTiny}>Todos</button>
          <button onClick={e=>{e.stopPropagation();onToggleAll(allNames,false);}} style={btnTiny}>Nenhum</button>
        </div>
        {(()=>{
          const linhaTss=t=>{
            const on=!t.membros.every(m=>excludedTSS.has(m));
            const tP=on?t.prazo.length:0,tF=on?t.fora.length:0;
            return <div key={t.name} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 6px",borderRadius:RAIO,opacity:on?1:0.45,transition:"opacity 0.15s"}}
              onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.02)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
              <Check checked={on} onChange={()=>onToggleAll(t.membros,!on)}/>
              <span title={t.membros.length>1?"Reúne: "+t.membros.join(" · "):undefined}
                style={{fontSize:13,color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {t.name}{t.membros.length>1&&<span style={{color:C.textDim,fontSize:11,marginLeft:7}}>EXIST + NOVA</span>}
              </span>
              <span style={{fontSize:12,color:C.textDim,marginRight:4,...numStyle}}>{t.all.length}</span>
              <Pill value={tP} color={C.green} bg={C.greenBg} border={C.greenBorder} clickable={on&&tP>0} onClick={e=>{e.stopPropagation();if(on&&tP>0)openModal("prazo",t.name,t.membros);}}/>
              <Pill value={tF} color={C.red} bg={C.redBg} border={C.redBorder} clickable={on&&tF>0} onClick={e=>{e.stopPropagation();if(on&&tF>0)openModal("fora",t.name,t.membros);}}/>
            </div>;
          };
          if(!blocos) return tssGroups.map(linhaTss);
          return blocos.map(b=>{
            const aberto=subAberto.has(b.nome);
            const on=!b.membros.every(m=>excludedTSS.has(m));
            return <div key={b.nome} style={{marginBottom:4}}>
              <div onClick={()=>setSubAberto(s=>{const n=new Set(s);n.has(b.nome)?n.delete(b.nome):n.add(b.nome);return n;})}
                style={{display:"flex",alignItems:"center",gap:10,padding:"7px 6px",borderRadius:RAIO,cursor:"pointer",
                  background:aberto?"rgba(255,255,255,0.03)":"transparent",opacity:on?1:0.45}}
                onMouseEnter={e=>{if(!aberto)e.currentTarget.style.background="rgba(255,255,255,0.02)";}}
                onMouseLeave={e=>{if(!aberto)e.currentTarget.style.background="transparent";}}>
                <span style={{fontSize:10,color:C.textDim,width:10,display:"inline-block",transform:aberto?"rotate(90deg)":"none",transition:"transform 0.15s"}}>▶</span>
                <Check checked={on} onChange={()=>onToggleAll(b.membros,!on)}/>
                <span style={{fontSize:13,fontWeight:600,color:C.text,flex:1,minWidth:0}}>
                  {b.nome}<span style={{color:C.textDim,fontWeight:400,fontSize:11,marginLeft:8}}>{b.grupos.length} TSS</span>
                </span>
                <span style={{fontSize:12,color:C.textDim,marginRight:4,...numStyle}}>{b.all}</span>
                <Pill value={on?b.prazo:0} color={C.green} bg={C.greenBg} border={C.greenBorder} clickable={on&&b.prazo>0} onClick={e=>{e.stopPropagation();if(on&&b.prazo>0)openModal("prazo",b.nome,b.membros);}}/>
                <Pill value={on?b.fora:0} color={C.red} bg={C.redBg} border={C.redBorder} clickable={on&&b.fora>0} onClick={e=>{e.stopPropagation();if(on&&b.fora>0)openModal("fora",b.nome,b.membros);}}/>
              </div>
              {aberto&&<div style={{paddingLeft:26,borderLeft:`1px solid ${C.border}`,marginLeft:5}}>
                {b.grupos.map(linhaTss)}
              </div>}
            </div>;
          });
        })()}
      </div>
    </td></tr>}
    {modal&&<OSModal rows={modal.rows} familia={fam} tssName={modal.tssName} tipo={modal.tipo} onClose={()=>setModal(null)}/>}
  </>;
}
const btnTiny={padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,cursor:"pointer"};

/* ── Sidebar ── */
function Sidebar({activeUnit,setActiveUnit,unitCounts,collapsed,setCollapsed,nNotas,onNotas,tagsNotas,onBuscarOS}){
  const [busca,setBusca]=useState("");
  const [avisoBusca,setAvisoBusca]=useState("");
  const buscar=()=>{
    const q=busca.replace(/\D/g,"");
    if(!q){setAvisoBusca("Digite o número da OS");return;}
    const aviso=onBuscarOS(q);          // null = achou e abriu o modal
    setAvisoBusca(aviso||"");
  };
  return <div style={{width:collapsed?56:210,minWidth:collapsed?56:210,background:C.sidebar,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",transition:"width 0.25s ease,min-width 0.25s ease",overflow:"hidden",flexShrink:0}}>
    <div style={{padding:collapsed?"16px 0":"16px 16px",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"space-between",borderBottom:`1px solid ${C.border}`,minHeight:56}}>
      {!collapsed&&<span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>Unidades</span>}
      <button onClick={()=>setCollapsed(!collapsed)} style={{background:"transparent",border:"none",color:C.textDim,cursor:"pointer",fontSize:16,padding:4,display:"flex"}}>{collapsed?"▶":"◀"}</button>
    </div>
    <div style={{padding:"8px 0"}}>
      {UNITS.map(u=>{const active=activeUnit===u.id;const counts=unitCounts[u.id]||{total:0,prazo:0,fora:0};
        return <div key={u.id} onClick={()=>setActiveUnit(u.id)} style={{padding:collapsed?"12px 0":"10px 16px",margin:collapsed?"2px 6px":"2px 8px",borderRadius:RAIO,cursor:"pointer",background:active?C.sideActive:"transparent",borderLeft:`2px solid ${active?C.accent:"transparent"}`,transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"flex-start",gap:10}}
          onMouseEnter={e=>{if(!active)e.currentTarget.style.background=C.sideHover;}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
          {collapsed&&<span style={{fontSize:12,fontWeight:600,color:active?C.accent:C.textDim,...numStyle}}>{u.sigla}</span>}
          {!collapsed&&<div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:active?C.text:C.textMuted,whiteSpace:"nowrap"}}>{u.label}</div>
            <div style={{fontSize:11,color:C.textDim,marginTop:2,display:"flex",gap:8}}>
              <span style={{color:C.green,...numStyle}}>{counts.prazo}</span><span style={{color:C.red,...numStyle}}>{counts.fora}</span><span style={numStyle}>({counts.total})</span>
            </div>
          </div>}
        </div>;})}
    </div>
    {/* Notas tem exatamente a mesma forma de uma unidade — mesmo
        recuo, mesmo canto, mesma faixa na borda, mesmo fundo de
        selecionado. So a cor muda: ambar no lugar do azul, porque
        nao e uma unidade, e uma visao que atravessa todas.
        O traco em cima e do agrupador, nao do item, para o item
        manter o formato dos vizinhos. */}
    <div style={{borderTop:`1px solid ${C.border}`,marginTop:6,paddingTop:8}}>
      <div onClick={()=>onNotas(null)} title="Todos os serviços com observação"
        style={{padding:collapsed?"12px 0":"10px 16px",margin:collapsed?"2px 6px":"2px 8px",
          borderRadius:RAIO,cursor:"pointer",
          background:nNotas>0?FUNDO_NOTA_ATIVO:"transparent",
          borderLeft:`2px solid ${nNotas>0?COR_NOTA:"transparent"}`,
          transition:"all 0.15s",display:"flex",alignItems:"center",
          justifyContent:collapsed?"center":"flex-start",gap:10,
          ...(nNotas>0?{animation:"gasPulse 2s infinite"}:{})}}
        onMouseEnter={e=>{if(!nNotas)e.currentTarget.style.background=HOVER_NOTA;}}
        onMouseLeave={e=>{if(!nNotas)e.currentTarget.style.background="transparent";}}>
        {collapsed
          ? <span style={{fontSize:12,fontWeight:600,color:nNotas>0?COR_NOTA:C.textDim,...numStyle}}>{nNotas>0?nNotas:"NT"}</span>
          : <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:nNotas>0?C.text:C.textMuted,whiteSpace:"nowrap"}}>Notas</div>
              <div style={{fontSize:11,color:C.textDim,marginTop:2,display:"flex",gap:8}}>
                <span style={{color:nNotas>0?COR_NOTA:C.textDim,...numStyle}}>{nNotas}</span>
                <span>com observação</span>
              </div>
            </div>}
      </div>
      {/* As etiquetas ficam subordinadas ao item Notas: recuadas,
          menores e sem faixa na borda. Sao um recorte do mesmo
          conteudo, nao itens de mesmo nivel. */}
      {!collapsed&&tagsNotas?.length>0&&<div style={{padding:"2px 8px 6px 8px",display:"flex",flexDirection:"column",gap:1}}>
        {tagsNotas.map(t=>
          <div key={t.id} onClick={()=>onNotas(t.id)} title={`Ver só as OS com a etiqueta ${t.id}`}
            style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px 4px 16px",borderRadius:RAIO,
              cursor:"pointer",transition:"background 0.12s"}}
            onMouseEnter={e=>(e.currentTarget.style.background=C.sideHover)}
            onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
            <span style={{width:6,height:6,borderRadius:"50%",background:t.cor,flexShrink:0}}/>
            <span style={{fontSize:11.5,color:C.textMuted,flex:1,minWidth:0,overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.id}</span>
            <span style={{fontSize:11,color:t.cor,...numStyle}}>{t.n}</span>
          </div>)}
      </div>}
    </div>
    {/* Busca de OS: mesmo agrupador com traco em cima. Recolhida, a
        lateral mostra so a lupa — clicar nela abre a lateral com o
        cursor ja no campo. */}
    <div style={{borderTop:`1px solid ${C.border}`,marginTop:6,padding:collapsed?"10px 0":"10px 12px 6px"}}>
      {collapsed
        ? <div onClick={()=>{setCollapsed(false);setTimeout(()=>document.getElementById("busca-os")?.focus(),300);}}
            title="Buscar OS" style={{textAlign:"center",cursor:"pointer",fontSize:14,color:C.textDim,padding:"4px 0"}}>🔍</div>
        : <>
            <div style={{fontSize:10,color:C.textDim,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6,paddingLeft:4}}>Buscar OS</div>
            <div style={{display:"flex",gap:4}}>
              <input id="busca-os" value={busca} inputMode="numeric" placeholder="Nº da OS"
                onChange={e=>{setBusca(e.target.value);if(avisoBusca)setAvisoBusca("");}}
                onKeyDown={e=>{if(e.key==="Enter")buscar();}}
                style={{flex:1,minWidth:0,fontSize:12,padding:"6px 8px",borderRadius:RAIO,border:`1px solid ${C.border}`,
                  background:C.card,color:C.text,outline:"none",...numStyle}}/>
              <button onClick={buscar} title="Buscar"
                style={{fontSize:12,padding:"0 9px",borderRadius:RAIO,border:"1px solid rgba(59,130,246,0.3)",
                  background:C.accentBg,color:C.accent,cursor:"pointer"}}>↵</button>
            </div>
            {avisoBusca&&<div style={{fontSize:11,color:C.amber,marginTop:6,paddingLeft:4,lineHeight:1.35}}>{avisoBusca}</div>}
          </>}
    </div>
    <div style={{flex:1}}/>
  </div>;
}

/* ── Dashboard ── */
function Dashboard({rows,excludedTSS,sortBy,onToggleTSS,onToggleAll,onSort,unitLabel,historico,activeUnit}){
  const {familyMap,totalPrazo,totalFora,total}=useMemo(()=>{
    const fm={};let tp=0,tf=0;
    rows.forEach(r=>{const fam=String(r["Família"]||"").trim();if(!fam)return;if(!fm[fam])fm[fam]=[];fm[fam].push(r);
      if(!excludedTSS.has(String(r["TSS"]||"").trim())){const st=tempo(r["Tempo Residual"]);if(st==="prazo")tp++;else if(st==="fora")tf++;}});
    return{familyMap:fm,totalPrazo:tp,totalFora:tf,total:tp+tf};
  },[rows,excludedTSS]);
  const sortedFams=useMemo(()=>{
    return Object.entries(familyMap).map(([name,rs])=>{const active=rs.filter(r=>!excludedTSS.has(String(r["TSS"]||"").trim()));const p=active.filter(r=>tempo(r["Tempo Residual"])==="prazo").length,f=active.filter(r=>tempo(r["Tempo Residual"])==="fora").length;
      return{name,rows:rs,prazo:p,fora:f,total:p+f,pctFora:(p+f)>0?f/(p+f):0};
    }).sort((a,b)=>{if(sortBy==="fora")return b.fora-a.fora;if(sortBy==="prazo")return b.prazo-a.prazo;if(sortBy==="name")return a.name.localeCompare(b.name);if(sortBy==="pct")return b.pctFora-a.pctFora;return b.total-a.total;});
  },[familyMap,excludedTSS,sortBy]);
  return <>
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <SummaryCard label="Total" value={total} color={C.accent} icon="📋"/>
      <SummaryCard label="No prazo" value={totalPrazo} color={C.green} icon="✅"/>
      <SummaryCard label="Fora do prazo" value={totalFora} color={C.red} icon="⚠️"/>
    </div>
    <div style={{background:C.card,borderRadius:RAIO,padding:"12px 18px",marginBottom:16,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:C.textDim}}>Distribuição — {unitLabel}</span>
        <span style={{fontSize:12,color:C.red,fontWeight:700}}>{total>0?((totalFora/total)*100).toFixed(1):0}% fora</span>
      </div>
      <Bar prazo={totalPrazo} fora={totalFora} total={total}/>
    </div>
    {historico&&historico.length>0&&<HistoricoChart historico={historico} activeUnit={activeUnit}/>}
    <div style={{fontSize:12,color:C.textDim,marginBottom:10,padding:"0 4px",display:"flex",gap:16,flexWrap:"wrap"}}>
      <span>Clique na família para filtrar TSS</span>
      <span>Clique nos números para ver as OS</span>
    </div>
    <div style={{background:C.card,borderRadius:RAIO,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
          <thead><tr style={{background:C.headerBg}}>
            {[{key:"name",label:"Família"},{key:"prazo",label:"No Prazo"},{key:"fora",label:"Fora do Prazo"},{key:"total",label:"Total"},{key:"pct",label:"Proporção"}].map(col=>
              <th key={col.key} onClick={()=>onSort(col.key)} style={{padding:"12px 16px",textAlign:col.key==="name"?"left":"center",fontSize:9.5,fontWeight:500,color:sortBy===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:"0.2em",cursor:"pointer",userSelect:"none",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{col.label}{sortBy===col.key?" ↓":""}</th>
            )}
          </tr></thead>
          <tbody>{sortedFams.map((f,i)=><FamilyRow key={f.name} fam={f.name} rows={f.rows} excludedTSS={excludedTSS} onToggleTSS={onToggleTSS} onToggleAll={onToggleAll} idx={i}/>)}</tbody>
        </table>
      </div>
    </div>
  </>;
}

/* ── Ruas com rede de gás (Comgás) ── */
const GAS_STREETS_RAW = [
  "ALEXANDRE DE GUSMAO","FERREIRA VIANA","PTOLOMEU","LAGRANGE","SETE DE JULHO",
  "AV GUARAPIRANGA","AUGUSTO FERREIRA DE MORAIS","NORA NEY","JOSE RAFAELI","AIMORES",
  "TAPUIAS","MORAIS NAVARRO","SERVIA","NOSSA SENHORA DO SOCORRO","MARCÍLIO DIAS",
  "AV DE PINEDO","AV ATLANTICA","EUCLYDES DA CUNHA","ANTÔNIO FRANCISCO FRANCA",
  "RODRIGUES DAS NEVES","AMARO LUZ","AV DO RIO BONITO","DR BRASILIO MACHADO NETO",
  "OLIVIA GUEDES PENTEADO","AV DANTON JOBIM","AV DR LUIS ARROBA MARTINS",
  "OLAVIO VERGILIO DOS SANTOS","WALDEMAR GOMES LINGOANOTI","MANOEL SOARES SEBASTIAO",
  "JOAO DE PAULO FRANCO","ENG JOSE SALLES","ANGELO BADA","ANGELO SANTI",
  "AV JOAO PAULO DA SILVA","AV INTERLAGOS","MANUEL DE TEFFE","PEDRO SANTALUCIA",
  "AV FELICIANO CORREIA","PLINIO SCHMIDT","AV JAIR RIBEIRO DA SILVA","ARMANDO VIEIRA",
  "AV GREGORIO BEZERRA","AV MATIAS BECK","AV LOURENÇO CABREIRA","MANUEL CALDEIRA",
  "AV PRESIDENTE JOAO GOULART","IZABEL KLEIN ZETTLER","AV PROFESSOR PAPINI",
  "MARTINÓPOLIS","NOSSA SENHORA DO OUTEIRO","PÇA BATISTA BOTELHO",
  "AV SENADOR TEOTÔNIO VILELA","ANTÔNIO LE VOCI","MANUEL MENDES",
  "PROFESSOR ROLDAO DE BARROS","JOAQUIM RODRIGUES DE MORAES","DOMINGOS TARROSO",
  "AV DO ARVOREIRO","ARCHOTE DO PERU","MAMONEIRA","DONA BELMIRA MARIN",
  "AV GRANDE SÃO PAULO","AV PIETRO NARDINI","QUESADA","AV PREFEITO PAULO LAURO",
  "GIUSEPPE TARTINI","RUBEM SOUTO DE ARAÚJO","RUBEN DARIO","PERIPERI",
  "SANTA TERESINHA","AMARO LEITE",
];
const GAS_EXCLUDED_FAMILIES = ["OUTROS SERVIÇOS DE CAVALETE","REPOSIÇÃO","OUTROS SERVIÇOS DE REPOSIÇÃO","HIDRÔMETRO","CAVALETE"];

// Padroniza o tipo do logradouro antes de comparar. O pendente escreve
// "AVENIDA GUARAPIRANGA" e a lista de gas tem "AV GUARAPIRANGA"; como o
// casamento e por trecho contido, as 20 avenidas e 1 praca da lista (30%
// dela) nunca disparavam alerta. Abreviar dos dois lados resolve sem
// perder a desambiguacao entre rua e avenida de mesmo nome.
function normalizar(str){
  return (str||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()
    .replace(/^AVENIDA\s+/,"AV ")
    .replace(/^PRACA\s+/,"PCA ")
    .replace(/^PCA\.?\s+/,"PCA ")
    .replace(/^TRAVESSA\s+/,"TV ")
    .replace(/^ALAMEDA\s+/,"AL ")
    .replace(/^ESTRADA\s+/,"ESTR ")
    .replace(/^RODOVIA\s+/,"ROD ");
}
function loadIgnoredGas(){try{const d=localStorage.getItem("gas-ignored-v1");return d?new Set(JSON.parse(d)):new Set();}catch{return new Set();}}
function saveIgnoredGas(s){try{localStorage.setItem("gas-ignored-v1",JSON.stringify([...s]));}catch{}}

function matchGasStreet(endereco){
  const norm = normalizar(endereco);
  for(const street of GAS_STREETS_RAW){
    const ns = normalizar(street);
    if(norm.includes(ns) || ns.includes(norm)) return street;
  }
  return null;
}

function useGasAlerts(rows){
  const [ignored,setIgnored]=useState(()=>loadIgnoredGas());
  const alerts = useMemo(()=>{
    if(!rows) return [];
    const result = [];
    const seen = new Set();
    rows.forEach(r=>{
      const numOS = String(r["Número OS"]||"").trim();
      if(!numOS || ignored.has(numOS) || seen.has(numOS)) return;
      const familia = String(r["Família"]||"").trim();
      const tss = String(r["TSS"]||"").trim();
      // Aplicar mesmos filtros do dashboard
      if(!familiaTssVisivel(familia,tss)) return;
      if(GAS_EXCLUDED_FAMILIES.includes(familia)) return;
      const atc = Number(r["ATC"]);
      if(!VALID_ATCS.includes(atc)) return;
      const endereco = String(r["Endereço"]||"").trim();
      const matched = matchGasStreet(endereco);
      if(matched){
        seen.add(numOS);
        const numero = String(r["Número"]||"").trim();
        const comp = String(r["Complemento"]||"").trim();
        const fullAddr = endereco + (numero?", "+numero:"") + (comp?" - "+comp:"");
        result.push({
          numOS, endereco, numero, fullAddr, matched,
          familia,
          tss: String(r["TSS"]||"").trim(),
          bairro: String(r["Bairro"]||"").trim(),
          searchAddr: endereco + (numero?" "+numero:""),
        });
      }
    });
    return result;
  },[rows,ignored]);

  const doIgnore = (numOS)=>{
    const n = new Set(ignored);
    n.add(numOS);
    setIgnored(n);
    saveIgnoredGas(n);
  };

  return { alerts, ignored, doIgnore };
}

function openComgas(addr){
  const w = window.open("https://onetouch.comgas.com.br","_blank");
  // Tenta preencher o campo de busca após o site carregar
  const tryFill = () => {
    try {
      const input = w.document.querySelector('#query');
      if(input){
        input.value = addr;
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        input.focus();
      } else {
        setTimeout(tryFill, 500);
      }
    } catch(e) {
      // Cross-origin: copia pro clipboard como fallback
      navigator.clipboard.writeText(addr).catch(()=>{});
    }
  };
  setTimeout(tryFill, 2000);
}

function GasAlertModal({alerts,onIgnore,onClose}){
  const [sortCol,setSortCol]=useState("matched");
  const [sortAsc,setSortAsc]=useState(true);
  const toggleSort=(col)=>{if(sortCol===col)setSortAsc(!sortAsc);else{setSortCol(col);setSortAsc(true);}};

  const sorted = useMemo(()=>{
    return [...alerts].sort((a,b)=>{
      let va=a[sortCol]||"",vb=b[sortCol]||"";
      if(typeof va==="string"){va=va.toLowerCase();vb=vb.toLowerCase();}
      const cmp=va<vb?-1:va>vb?1:0;
      return sortAsc?cmp:-cmp;
    });
  },[alerts,sortCol,sortAsc]);

  const byStreet = useMemo(()=>{
    const m={};alerts.forEach(a=>{if(!m[a.matched])m[a.matched]=0;m[a.matched]++;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  },[alerts]);

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid rgba(245,158,11,0.3)`,width:"100%",maxWidth:1100,maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>🔥</span>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.amber}}>Rede de Gás — Alerta Comgás</div>
            <div style={{fontSize:12,color:C.textDim,marginTop:2}}>{alerts.length} OS em ruas com tubulação de gás</div>
          </div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>

      {/* Resumo por rua */}
      <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:6,flexWrap:"wrap",background:C.cardAlt}}>
        {byStreet.map(([street,count])=>(
          <span key={street} style={{fontSize:10,padding:"3px 8px",borderRadius:6,background:C.amberBg,color:C.amber,border:"1px solid rgba(245,158,11,0.25)",fontWeight:600}}>
            {street}: {count}
          </span>
        ))}
      </div>

      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
            {[{key:"numOS",label:"Nº OS"},{key:"matched",label:"Rua com Gás"},{key:"familia",label:"Família"},{key:"tss",label:"TSS"},{key:"fullAddr",label:"Endereço"}].map(col=>
              <th key={col.key} onClick={()=>toggleSort(col.key)} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:sortCol===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none"}}>{col.label}{sortCol===col.key?(sortAsc?" ↑":" ↓"):""}</th>
            )}
            <th style={{padding:"10px 12px",textAlign:"center",fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>Ações</th>
          </tr></thead>
          <tbody>{sorted.map((a,i)=>(
            <tr key={a.numOS} style={{background:i%2?C.cardAlt:"transparent",borderLeft:`3px solid ${C.amber}`}} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:600,color:C.accent,fontVariantNumeric:"tabular-nums"}}>{a.numOS}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:C.amberBg,color:C.amber,border:"1px solid rgba(245,158,11,0.25)",fontWeight:600}}>{a.matched}</span>
              </td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:600}}>{a.familia}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.tss}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,whiteSpace:"nowrap"}}>{a.fullAddr}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,textAlign:"center",whiteSpace:"nowrap"}}>
                <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                  <button onClick={()=>openComgas(a.searchAddr)}
                    style={{fontSize:10,color:"#fff",fontWeight:600,padding:"4px 10px",borderRadius:6,background:"linear-gradient(135deg,#f59e0b,#d97706)",border:"none",cursor:"pointer"}}>
                    🔥 Comgás
                  </button>
                  <button onClick={()=>onIgnore(a.numOS)}
                    style={{fontSize:10,color:C.textDim,fontWeight:600,padding:"4px 8px",borderRadius:6,background:"transparent",border:`1px solid ${C.border}`,cursor:"pointer"}}>
                    Ignorar
                  </button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  </div>;
}

/* ── Carteira View ── */
function CarteiraView({rawRows,sess}){
  // Os robôs cobrem EM RUA (08:30) e Execução (00:30) todo dia. Os botões
  // continuam existindo como reserva, mas só para quem tem pode_importar —
  // e a gravação usa o token do login, não a chave anônima do bundle.
  const podeImportar=!!sess?.perfil?.pode_importar;
  const today=new Date();
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const daysAgo=(n)=>{const d=new Date(today);d.setDate(d.getDate()-n);return fmt(d);};

  const [diaD1,setDiaD1]=useState(daysAgo(1));
  const [diaD2,setDiaD2]=useState(daysAgo(2));
  const [diaD3,setDiaD3]=useState(daysAgo(3));
  const [emRuaData,setEmRuaData]=useState([]);
  const [osD1,setOsD1]=useState([]);
  const [osD2,setOsD2]=useState([]);
  const [osD3,setOsD3]=useState([]);
  const [execSet,setExecSet]=useState(new Set()); // "OS|TSS|dia" das execucoes confirmadas
  const [globalTssMap,setGlobalTssMap]=useState({}); // TSS→família de todo histórico
  const [loadingCarteira,setLoadingCarteira]=useState(true);
  const [uploadingEmRua,setUploadingEmRua]=useState(false);
  const [uploadingExec,setUploadingExec]=useState(false);
  const [execInfo,setExecInfo]=useState(null); // {n, ini, fim}
  const [emRuaToast,setEmRuaToast]=useState("");
  const [expandedFrente,setExpandedFrente]=useState(null);
  const [expandedFamilia,setExpandedFamilia]=useState(null);
  const [excludedCarteira,setExcludedCarteira]=useState(new Set());
  const [equipeModal,setEquipeModal]=useState(null); // {frente, equipes:[]}
  const [showAllEquipesModal,setShowAllEquipesModal]=useState(false);
  const [naRuaModal,setNaRuaModal]=useState(null); // {label, rows:[{numero_os,tss,endereco,bairro,equipe}]}
  const emRuaInputRef=useRef();
  const execInputRef=useRef();

  const toggleExcluded=useCallback((name)=>{
    const key=norm(name);
    setExcludedCarteira(prev=>{
      const next=new Set(prev);
      if(next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  },[]);

  const flashEmRua=(msg)=>{setEmRuaToast(msg);setTimeout(()=>setEmRuaToast(""),4000);};

  // Load data
  useEffect(()=>{
    (async()=>{
      setLoadingCarteira(true);
      try{
        const [d3,d2,d1,er,tssMap,exe]=await Promise.all([
          fetchDiarioOS(diaD3),
          fetchDiarioOS(diaD2),
          fetchDiarioOS(diaD1),
          fetchEmRua(fmt(today)),  // EM RUA é sempre do dia atual
          fetchTssToFamiliaMap(),
          fetchExecucao(diaD3,fmt(today)),
        ]);
        // Regra do casamento, medida sobre 20 dias de histórico: o robô puxa o
        // pendente no FIM do dia, então o par OS+TSS que está no snapshot de D e
        // some no de D+1 foi executado em D+1. A janela [D, D+1] cobre os poucos
        // casos de virada (era 202 contra 4 a favor de D+1 em 16/08, e assim
        // em todos os 20 dias medidos).
        setExecSet(new Set(exe.map(r=>osKey(r)+"|"+r.dia)));
        // Filtrar TSS globalmente excluídas de todos os conjuntos
        setOsD3(d3.filter(r=>!isGloballyExcludedTss(r.tss)));
        setOsD2(d2.filter(r=>!isGloballyExcludedTss(r.tss)));
        setOsD1(d1.filter(r=>!isGloballyExcludedTss(r.tss)));
        setEmRuaData(er.filter(r=>!isGloballyExcludedTss(r.tss)));
        setGlobalTssMap(tssMap);
      }catch(e){console.error("Erro carteira:",e);flashEmRua("Erro ao carregar dados: "+e.message);}
      setLoadingCarteira(false);
    })();
  },[diaD1,diaD2,diaD3]);

  // Handle EM RUA file import
  const handleEmRuaFile=useCallback(async(file)=>{
    if(!file)return;
    setUploadingEmRua(true);
    try{
      flashEmRua("Processando EM RUA...");
      const{dia,records}=await parseEmRuaFile(file);
      flashEmRua(`Enviando ${records.length} registros (${fmtDiaFull(dia)})...`);
      const count=await uploadEmRua(dia,records,authHeaders(await tokenFresco(sess)));
      flashEmRua(`EM RUA importado ✓ (${count} registros, dia ${fmtDiaFull(dia)})`);
      // Reload em_rua do dia importado
      const er=await fetchEmRua(dia);
      setEmRuaData(er.filter(r=>!isGloballyExcludedTss(r.tss)));
    }catch(e){flashEmRua("Erro: "+e.message);}
    setUploadingEmRua(false);
  },[diaD1,sess]);

  // Importar relatório de execução (cobre um período inteiro)
  const handleExecFile=useCallback(async(file)=>{
    if(!file)return;
    setUploadingExec(true);
    try{
      flashEmRua("Lendo relatório de execução...");
      const{records,ini,fim,ignoradas}=await parseExecucaoFile(file);
      flashEmRua(`Enviando ${records.length} execuções (${fmtDiaFull(ini)} a ${fmtDiaFull(fim)})...`);
      await uploadExecucao(records,ini,fim,authHeaders(await tokenFresco(sess)));
      flashEmRua(`Execuções importadas ✓ ${records.length} registros${ignoradas?`, ${ignoradas} ignoradas`:""}`);
      const exe=await fetchExecucao(diaD3,fmt(today));
      setExecSet(new Set(exe.map(r=>osKey(r)+"|"+r.dia)));
      setExecInfo({n:records.length,ini,fim});
    }catch(e){flashEmRua("Erro: "+e.message);}
    setUploadingExec(false);
  },[diaD3,sess]);

  // Converter rawRows (pendente_os, campos do Excel) para formato normalizado (D-0)
  const osD0=useMemo(()=>{
    if(!rawRows) return [];
    return rawRows.filter(r=>{
      const tss=String(r["TSS"]||"").trim();
      const fam=String(r["Família"]||"").trim();
      if(!familiaTssVisivel(fam,tss)) return false;
      if(isGloballyExcludedTss(tss)) return false;
      const atc=Number(r["ATC"]);
      if(!VALID_ATCS.includes(atc)) return false;
      return true;
    }).map(r=>({
      numero_os:String(r["Número OS"]||"").trim(),
      familia:String(r["Família"]||"").trim(),
      tss:String(r["TSS"]||"").trim(),
    }));
  },[rawRows]);

  // Compute carteira data by frente/TSS
  const carteiraData=useMemo(()=>{
    // Mapa TSS→família: usa globalTssMap (todo histórico) + complementa com D-3/D-2/D-1
    const globalTssToFamilia={...globalTssMap};
    [...osD3,...osD2,...osD1].forEach(r=>{
      if(r.tss&&r.familia) globalTssToFamilia[norm(r.tss)]=r.familia;
    });

    // Divide um conjunto de baixas em executadas x nao executadas.
    // "saiu" = par OS+TSS presente no dia anterior e ausente no seguinte.
    // Se existe execucao confirmada na janela [diaAnt, diaSeg] -> executada.
    // Senao -> encerrada sem execucao (cancelamento, erro de base, etc).
    const splitBaixas=(saiuRows,diaAnt,diaSeg)=>{
      let ex=0;
      const rowsEx=[],rowsNao=[];
      saiuRows.forEach(r=>{
        const k=osKey(r);
        const hit=execSet.has(k+"|"+diaSeg)||execSet.has(k+"|"+diaAnt);
        if(hit){ex++;rowsEx.push(r);}else rowsNao.push(r);
      });
      return{baixas:saiuRows.length,executadas:ex,naoExecutadas:saiuRows.length-ex,rowsEx,rowsNao};
    };

    // PASSO 1: Atribuição exclusiva de equipes — cada equipe pertence a UMA frente
    // Critério: frente com mais OS da equipe; empate → frente com menos equipes no total
    const equipeOsCountByFrente={}; // {equipe: {frente: count}}
    FRENTE_ORDER.forEach(frenteName=>{
      const matchFn=FRENTES[frenteName];
      const frenteFamilias=FRENTE_FAMILIAS[frenteName];
      emRuaData.forEach(r=>{
        const eq=r.equipe;
        if(!eq) return;
        const mappedFamilia=globalTssToFamilia[norm(r.tss||"")]||"";
        if(!matchFn({familia:mappedFamilia,tss:r.tss||"",numero_os:r.numero_os})) return;
        // Não aplicar exclusões aqui — a atribuição é baseada em dados brutos
        if(!equipeOsCountByFrente[eq]) equipeOsCountByFrente[eq]={};
        equipeOsCountByFrente[eq][frenteName]=(equipeOsCountByFrente[eq][frenteName]||0)+1;
      });
    });
    // Contar total de equipes por frente (antes de desempatar) para tiebreaker
    const equipesTotalByFrente={};
    FRENTE_ORDER.forEach(f=>{equipesTotalByFrente[f]=0;});
    Object.keys(equipeOsCountByFrente).forEach(eq=>{
      const counts=equipeOsCountByFrente[eq];
      Object.keys(counts).forEach(f=>{equipesTotalByFrente[f]++;});
    });
    // Atribuir cada equipe à frente com mais OS; empate → frente com menos equipes totais
    const equipeToFrente={}; // {equipe: frenteName}
    Object.entries(equipeOsCountByFrente).forEach(([eq,counts])=>{
      const frentes=Object.entries(counts).sort((a,b)=>{
        if(b[1]!==a[1]) return b[1]-a[1]; // mais OS primeiro
        return (equipesTotalByFrente[a[0]]||0)-(equipesTotalByFrente[b[0]]||0); // menos equipes totais primeiro
      });
      equipeToFrente[eq]=frentes[0][0];
    });

    // PASSO 2: Computar métricas por frente
    return FRENTE_ORDER.map(frenteName=>{
      const matchFn=FRENTES[frenteName];
      const frenteFamilias=FRENTE_FAMILIAS[frenteName];

      // Função para checar se uma OS está excluída
      const isOsExcluded=r=>{
        if(frenteFamilias&&excludedCarteira.has(norm(r.familia||""))) return true;
        if(excludedCarteira.has(norm(r.tss||""))) return true;
        return false;
      };

      // FULL OS sets (para breakdowns com números completos)
      const osD3Frente=osD3.filter(matchFn);
      const osD2Frente=osD2.filter(matchFn);
      const osD1Frente=osD1.filter(matchFn);

      // Coletar numero_os excluídos em QUALQUER dia — se a OS tem família/TSS excluído
      // em D-3, D-2 OU D-1, remove de TODOS os conjuntos para não distorcer novas/executadas
      const excludedOsNumbers=new Set();
      [...osD3Frente,...osD2Frente,...osD1Frente].forEach(r=>{
        if(isOsExcluded(r)) excludedOsNumbers.add(r.numero_os);
      });
      // FILTERED OS sets (excluindo famílias/TSS ocultos) para métricas da frente
      const osD3Filtered=osD3Frente.filter(r=>!excludedOsNumbers.has(osKey(r)));
      const osD2Filtered=osD2Frente.filter(r=>!excludedOsNumbers.has(osKey(r)));
      const osD1Filtered=osD1Frente.filter(r=>!excludedOsNumbers.has(osKey(r)));
      const carteiraD3Count=osD3Filtered.length;
      const setD3Frente=new Set(osD3Filtered.map(osKey));
      const carteiraD2Count=osD2Filtered.length;
      const setD2Frente=new Set(osD2Filtered.map(osKey));
      const setD1Frente=new Set(osD1Filtered.map(osKey));
      // Novas/Exec D-3→D-2
      const novasD3=osD2Filtered.filter(r=>!setD3Frente.has(osKey(r))).length;
      const bxD3=splitBaixas(osD3Filtered.filter(r=>!setD2Frente.has(osKey(r))),diaD3,diaD2);
      const execD3=bxD3.baixas;
      // Novas/Exec D-2→D-1
      const novas=osD1Filtered.filter(r=>!setD2Frente.has(osKey(r))).length;
      const bxD2=splitBaixas(osD2Filtered.filter(r=>!setD1Frente.has(osKey(r))),diaD2,diaD1);
      const executadas=bxD2.baixas;
      const carteiraD1Count=osD1Filtered.length;

      // D-0 (pendente atual — mesmos dados da aba Pendentes)
      const osD0Frente=osD0.filter(matchFn);
      const osD0Filtered=osD0Frente.filter(r=>!excludedOsNumbers.has(osKey(r))&&!isOsExcluded(r));
      const carteiraD0Count=osD0Filtered.length;
      const setD0Frente=new Set(osD0Filtered.map(osKey));

      // EM RUA FILTERED (para métricas da frente)
      const emRuaFrente=emRuaData.filter(r=>{
        const mappedFamilia=globalTssToFamilia[norm(r.tss||"")]||"";
        if(!matchFn({familia:mappedFamilia,tss:r.tss||"",numero_os:r.numero_os})) return false;
        if(frenteFamilias&&excludedCarteira.has(norm(mappedFamilia))) return false;
        if(excludedCarteira.has(norm(r.tss||""))) return false;
        return true;
      });
      // Equipes: apenas as atribuídas exclusivamente a ESTA frente
      const equipesSet=new Set(emRuaFrente.map(r=>r.equipe).filter(eq=>eq&&equipeToFrente[eq]===frenteName));
      const equipes=equipesSet.size;
      const equipesNomes=[...equipesSet].sort();
      const osEmCampo=emRuaFrente.length;
      // Separar EM RUA: OS que estão na Cart. D-0 vs extras
      const naRuaRows=emRuaFrente.filter(r=>setD0Frente.has(osKey(r)));
      const naRuaCarteira=naRuaRows.length;
      const naRuaExtras=osEmCampo-naRuaCarteira;
      const pctEmCampo=carteiraD0Count>0?((naRuaCarteira/carteiraD0Count)*100):0;

      // TSS breakdown (for ligação água) — usa dados FULL, marca excluídos
      let tssBreakdown=null;
      if(frenteName==="LIGAÇÃO ÁGUA"){
        tssBreakdown=LIGACAO_AGUA_TSS.map(tssName=>{
          const tssNorm=norm(tssName);
          const excluded=excludedCarteira.has(tssNorm);
          const d3Tss=osD3.filter(r=>norm(r.tss)===tssNorm);
          const d2Tss=osD2.filter(r=>norm(r.tss)===tssNorm);
          const d1Tss=osD1.filter(r=>norm(r.tss)===tssNorm);
          const d3Count=d3Tss.length;
          const d2Count=d2Tss.length;
          const d1Count=d1Tss.length;
          const setD3Tss=new Set(d3Tss.map(osKey));
          const setD2Tss=new Set(d2Tss.map(osKey));
          const setD1Tss=new Set(d1Tss.map(osKey));
          const tssNovasD3=d2Tss.filter(r=>!setD3Tss.has(osKey(r))).length;
          const tBx3=splitBaixas(d3Tss.filter(r=>!setD2Tss.has(osKey(r))),diaD3,diaD2);
          const tssExecD3=tBx3.baixas;
          const tssNovas=d1Tss.filter(r=>!setD2Tss.has(osKey(r))).length;
          const tBx2=splitBaixas(d2Tss.filter(r=>!setD1Tss.has(osKey(r))),diaD2,diaD1);
          const tssExec=tBx2.baixas;
          const d0Tss=osD0.filter(r=>norm(r.tss)===tssNorm);
          const d0Count=d0Tss.length;
          const setD0Tss=new Set(d0Tss.map(osKey));
          const tssEmRua=emRuaData.filter(r=>norm(r.tss)===tssNorm);
          const tssEquipes=new Set(tssEmRua.map(r=>r.equipe).filter(Boolean)).size;
          const tssOsCampo=tssEmRua.length;
          const tssNaRuaRows=tssEmRua.filter(r=>setD0Tss.has(osKey(r)));
          const tssNaRuaCart=tssNaRuaRows.length;
          const tssNaRuaExtras=tssOsCampo-tssNaRuaCart;
          const tssPct=d0Count>0?((tssNaRuaCart/d0Count)*100):0;
          return{tss:tssName,excluded,bx3:tBx3,bx2:tBx2,carteiraD3:d3Count,novasD3:tssNovasD3,execD3:tssExecD3,carteiraD2:d2Count,novas:tssNovas,executadas:tssExec,carteiraD1:d1Count,carteiraD0:d0Count,equipes:tssEquipes,osCampo:tssOsCampo,naRuaCarteira:tssNaRuaCart,naRuaRows:tssNaRuaRows,naRuaExtras:tssNaRuaExtras,pctCampo:tssPct};
        }).filter(t=>t.carteiraD3>0||t.carteiraD2>0||t.carteiraD1>0||t.osCampo>0);
      }

      // Família breakdown com TSS aninhado (para frentes com famílias definidas) — usa dados FULL
      let familiaBreakdown=null;
      if(frenteFamilias){
        const tssToFamilia={};
        [...osD3Frente,...osD2Frente,...osD1Frente].forEach(r=>{
          if(r.tss&&r.familia) tssToFamilia[norm(r.tss)]=norm(r.familia);
        });

        familiaBreakdown=frenteFamilias.map(famName=>{
          const famNorm=norm(famName);
          const famExcluded=excludedCarteira.has(famNorm);
          const d3Fam=osD3.filter(r=>norm(r.familia)===famNorm);
          const d2Fam=osD2.filter(r=>norm(r.familia)===famNorm);
          const d1Fam=osD1.filter(r=>norm(r.familia)===famNorm);
          const d3Count=d3Fam.length;
          const d2Count=d2Fam.length;
          const d1Count=d1Fam.length;
          const setD3Fam=new Set(d3Fam.map(osKey));
          const setD2Fam=new Set(d2Fam.map(osKey));
          const setD1Fam=new Set(d1Fam.map(osKey));
          const famNovasD3=d2Fam.filter(r=>!setD3Fam.has(osKey(r))).length;
          const fBx3=splitBaixas(d3Fam.filter(r=>!setD2Fam.has(osKey(r))),diaD3,diaD2);
          const famExecD3=fBx3.baixas;
          const famNovas=d1Fam.filter(r=>!setD2Fam.has(osKey(r))).length;
          const fBx2=splitBaixas(d2Fam.filter(r=>!setD1Fam.has(osKey(r))),diaD2,diaD1);
          const famExec=fBx2.baixas;
          const d0Fam=osD0.filter(r=>norm(r.familia)===famNorm);
          const d0Count=d0Fam.length;
          const setD0Fam=new Set(d0Fam.map(osKey));
          const emRuaFam=emRuaData.filter(r=>{
            const tFam=tssToFamilia[norm(r.tss||"")];
            return tFam===famNorm;
          });
          const famEquipes=new Set(emRuaFam.map(r=>r.equipe).filter(Boolean)).size;
          const famOsCampo=emRuaFam.length;
          const famNaRuaRows=emRuaFam.filter(r=>setD0Fam.has(osKey(r)));
          const famNaRuaCart=famNaRuaRows.length;
          const famNaRuaExtras=famOsCampo-famNaRuaCart;
          const famPct=d0Count>0?((famNaRuaCart/d0Count)*100):0;

          // TSS dentro desta família
          const tssSet=new Set();
          [...d3Fam,...d2Fam,...d1Fam,...emRuaFam].forEach(r=>{if(r.tss)tssSet.add(norm(r.tss));});
          const tssNames=[...tssSet].sort();
          const famTssBreakdown=tssNames.map(tssNorm=>{
            const tssExcluded=famExcluded||excludedCarteira.has(tssNorm);
            const d3Tss=d3Fam.filter(r=>norm(r.tss)===tssNorm);
            const d2Tss=d2Fam.filter(r=>norm(r.tss)===tssNorm);
            const d1Tss=d1Fam.filter(r=>norm(r.tss)===tssNorm);
            const td3=d3Tss.length;
            const td2=d2Tss.length;
            const td1=d1Tss.length;
            const sD3=new Set(d3Tss.map(osKey));
            const sD2=new Set(d2Tss.map(osKey));
            const sD1=new Set(d1Tss.map(osKey));
            const tNovasD3=d2Tss.filter(r=>!sD3.has(osKey(r))).length;
            const nBx3=splitBaixas(d3Tss.filter(r=>!sD2.has(osKey(r))),diaD3,diaD2);
            const tExecD3=nBx3.baixas;
            const tNovas=d1Tss.filter(r=>!sD2.has(osKey(r))).length;
            const nBx2=splitBaixas(d2Tss.filter(r=>!sD1.has(osKey(r))),diaD2,diaD1);
            const tExec=nBx2.baixas;
            const td0Tss=d0Fam.filter(r=>norm(r.tss)===tssNorm);
            const td0=td0Tss.length;
            const sD0=new Set(td0Tss.map(osKey));
            const tEmRua=emRuaFam.filter(r=>norm(r.tss||"")===tssNorm);
            const tEquipes=new Set(tEmRua.map(r=>r.equipe).filter(Boolean)).size;
            const tOsCampo=tEmRua.length;
            const tNaRuaRows=tEmRua.filter(r=>sD0.has(osKey(r)));
            const tNaRuaCart=tNaRuaRows.length;
            const tNaRuaExtras=tOsCampo-tNaRuaCart;
            const tPct=td0>0?((tNaRuaCart/td0)*100):0;
            const origRec=[...d2Fam,...d1Fam,...emRuaFam].find(r=>norm(r.tss)===tssNorm);
            const tssLabel=origRec?origRec.tss:tssNorm;
            return{tss:tssLabel,excluded:tssExcluded,bx3:nBx3,bx2:nBx2,carteiraD3:td3,novasD3:tNovasD3,execD3:tExecD3,carteiraD2:td2,novas:tNovas,executadas:tExec,carteiraD1:td1,carteiraD0:td0,equipes:tEquipes,osCampo:tOsCampo,naRuaCarteira:tNaRuaCart,naRuaRows:tNaRuaRows,naRuaExtras:tNaRuaExtras,pctCampo:tPct};
          }).filter(t=>t.carteiraD3>0||t.carteiraD2>0||t.carteiraD1>0||t.osCampo>0);

          return{familia:famName,excluded:famExcluded,bx3:fBx3,bx2:fBx2,carteiraD3:d3Count,novasD3:famNovasD3,execD3:famExecD3,carteiraD2:d2Count,novas:famNovas,executadas:famExec,carteiraD1:d1Count,carteiraD0:d0Count,equipes:famEquipes,osCampo:famOsCampo,naRuaCarteira:famNaRuaCart,naRuaRows:famNaRuaRows,naRuaExtras:famNaRuaExtras,pctCampo:famPct,tssBreakdown:famTssBreakdown};
        }).filter(f=>f.carteiraD3>0||f.carteiraD2>0||f.carteiraD1>0||f.osCampo>0);
      }

      return{frente:frenteName,bx3:bxD3,bx2:bxD2,carteiraD3:carteiraD3Count,novasD3,execD3,carteiraD2:carteiraD2Count,novas,executadas,carteiraD1:carteiraD1Count,carteiraD0:carteiraD0Count,equipes,equipesNomes,osCampo:osEmCampo,naRuaCarteira,naRuaRows,naRuaExtras,pctCampo:pctEmCampo,tssBreakdown,familiaBreakdown};
    });
  },[osD3,osD2,osD1,osD0,emRuaData,excludedCarteira,globalTssMap,execSet,diaD3,diaD2,diaD1]);

  // Totals
  const totals=useMemo(()=>carteiraData.reduce((acc,r)=>({
    carteiraD3:acc.carteiraD3+r.carteiraD3,novasD3:acc.novasD3+r.novasD3,execD3:acc.execD3+r.execD3,
    ex3:acc.ex3+(r.bx3?.executadas||0),ne3:acc.ne3+(r.bx3?.naoExecutadas||0),
    ex2:acc.ex2+(r.bx2?.executadas||0),ne2:acc.ne2+(r.bx2?.naoExecutadas||0),
    carteiraD2:acc.carteiraD2+r.carteiraD2,novas:acc.novas+r.novas,executadas:acc.executadas+r.executadas,
    carteiraD1:acc.carteiraD1+r.carteiraD1,carteiraD0:acc.carteiraD0+r.carteiraD0,equipes:acc.equipes+r.equipes,
    osCampo:acc.osCampo+r.osCampo,naRuaCarteira:acc.naRuaCarteira+r.naRuaCarteira,naRuaExtras:acc.naRuaExtras+r.naRuaExtras,
  }),{carteiraD3:0,novasD3:0,execD3:0,ex3:0,ne3:0,ex2:0,ne2:0,carteiraD2:0,novas:0,executadas:0,carteiraD1:0,carteiraD0:0,equipes:0,osCampo:0,naRuaCarteira:0,naRuaExtras:0}),[carteiraData]);
  const totalPct=totals.carteiraD0>0?((totals.naRuaCarteira/totals.carteiraD0)*100):0;

  // Celula dividida "executadas / nao executadas" da coluna Baixas.
  // O total continua sendo o que fecha a conta da carteira; o split so
  // diz quanto daquilo teve execucao confirmada no relatorio.
  const Baixa=({bx,fs=12,onOpen})=>{
    if(!bx||!bx.baixas) return <span style={{color:C.textDim}}>0</span>;
    return <span onClick={onOpen?e=>{e.stopPropagation();onOpen();}:undefined}
      style={{cursor:onOpen?"pointer":"default",fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
      <span style={{color:C.green,fontWeight:700,fontSize:fs}}>{bx.executadas}</span>
      <span style={{color:C.textDim,fontSize:fs-2,margin:"0 2px"}}>/</span>
      <span style={{color:bx.naoExecutadas>0?C.red:C.textDim,fontWeight:600,fontSize:fs-1}}>{bx.naoExecutadas}</span>
    </span>;
  };

  const cellStyle={padding:"8px 4px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums",fontSize:12};
  const hdrCell={padding:"6px 3px",textAlign:"center",fontSize:9,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:0.3,borderBottom:`2px solid rgba(100,116,139,0.4)`,whiteSpace:"nowrap"};
  // Divisores espessos entre grupos de colunas
  const colDiv="2px solid rgba(100,116,139,0.4)";
  // Tints sutis por grupo (dark theme friendly)
  const grpD3={bg:"rgba(148,163,184,0.04)",hdr:"rgba(148,163,184,0.10)"};
  const grpMov1={bg:"rgba(220,80,80,0.04)",hdr:"rgba(220,80,80,0.10)"}; // D-3→D-2
  const grpMov2={bg:"rgba(245,158,11,0.04)",hdr:"rgba(245,158,11,0.10)"}; // D-2→D-1
  const grpCampo={bg:"rgba(16,185,129,0.04)",hdr:"rgba(16,185,129,0.10)"};

  return <div style={{animation:"fadeIn 0.35s ease"}}>
    {/* Toast */}
    {emRuaToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"10px 24px",borderRadius:10,fontSize:13,fontWeight:600,maxWidth:"90vw",wordBreak:"break-word",background:emRuaToast.includes("Erro")?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)",color:emRuaToast.includes("Erro")?C.red:C.green,border:`1px solid ${emRuaToast.includes("Erro")?C.redBorder:C.greenBorder}`,backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease"}}>{emRuaToast}</div>}

    {/* Header com seleção de datas e importação */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:C.textDim,fontWeight:600}}>D-3:</span>
        <input type="date" value={diaD3} onChange={e=>setDiaD3(e.target.value)} style={dateInputStyle}/>
        <span style={{fontSize:12,color:C.textDim,fontWeight:600}}>D-2:</span>
        <input type="date" value={diaD2} onChange={e=>setDiaD2(e.target.value)} style={dateInputStyle}/>
        <span style={{fontSize:12,color:C.textDim,fontWeight:600}}>D-1:</span>
        <input type="date" value={diaD1} onChange={e=>setDiaD1(e.target.value)} style={dateInputStyle}/>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:11,color:C.textDim}}>Execuções: {execSet.size>0?<span style={{color:C.green,fontWeight:600}}>{execSet.size}</span>:<span style={{color:C.amber}}>não importado</span>}</span>
        <span style={{fontSize:11,color:C.textDim}}>EM RUA: {emRuaData.length>0?<span style={{color:C.green,fontWeight:600}}>{emRuaData.length} OS</span>:<span style={{color:C.amber}}>não importado</span>}</span>
        {podeImportar&&<><input ref={emRuaInputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{handleEmRuaFile(e.target.files[0]);e.target.value="";}}/>
        <button onClick={()=>emRuaInputRef.current?.click()} disabled={uploadingEmRua}
          style={{fontSize:12,color:"#fff",fontWeight:600,padding:"6px 16px",borderRadius:8,background:uploadingEmRua?"#475569":"linear-gradient(135deg,#3b82f6,#6366f1)",border:"none",cursor:uploadingEmRua?"wait":"pointer",display:"flex",alignItems:"center",gap:6}}>
          {uploadingEmRua?"Importando...":"📥 Importar EM RUA"}
        </button>
        <input ref={execInputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{handleExecFile(e.target.files[0]);e.target.value="";}}/>
        <button onClick={()=>execInputRef.current?.click()} disabled={uploadingExec}
          title="Relatório Dados Operacionais — pode cobrir um mês inteiro; reimportar o mesmo período substitui, não duplica"
          style={{fontSize:12,color:"#fff",fontWeight:600,padding:"6px 16px",borderRadius:8,background:uploadingExec?"#475569":"linear-gradient(135deg,#10b981,#059669)",border:"none",cursor:uploadingExec?"wait":"pointer",display:"flex",alignItems:"center",gap:6}}>
          {uploadingExec?"Importando...":"✅ Importar Execução"}
        </button></>}
      </div>
    </div>

    {/* Summary cards */}
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <SummaryCard label={`Cart. ${fmtDiaShort(diaD3)}`} value={totals.carteiraD3} color={C.accent} icon="📋"/>
      <SummaryCard label={`Cart. ${fmtDiaShort(diaD2)}`} value={totals.carteiraD2} color={C.accent} icon="📊"/>
      <SummaryCard label={`Cart. ${fmtDiaShort(diaD1)}`} value={totals.carteiraD1} color={C.accent} icon="📈"/>
      <SummaryCard label="Cart. Atual" value={totals.carteiraD0} color="#6366f1" icon="📌"/>
    </div>
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <SummaryCard label="Equipes" value={totals.equipes} color="#8b5cf6" icon="👷" onClick={()=>setShowAllEquipesModal(true)}/>
      <SummaryCard label="Na Rua" value={totals.naRuaCarteira} color={C.green} icon="🚧" onClick={()=>{const allRows=carteiraData.flatMap(r=>r.naRuaRows||[]);if(allRows.length>0)setNaRuaModal({label:"TOTAL",rows:allRows});}}/>
      <div style={{flex:1,minWidth:120,background:C.card,borderRadius:14,padding:"16px 18px",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:4}}>
        <span style={{fontSize:11,color:C.textDim,letterSpacing:0.5,textTransform:"uppercase"}}>% em Campo</span>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:28,fontWeight:800,color:totalPct>=70?C.green:totalPct>=40?C.amber:C.red,fontVariantNumeric:"tabular-nums"}}>{totalPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>

    {/* Equipe Modal */}
    {equipeModal&&<div onClick={()=>setEquipeModal(null)} style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.15s ease"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:"24px 28px",minWidth:280,maxWidth:420,maxHeight:"70vh",display:"flex",flexDirection:"column",gap:12,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Equipes — {equipeModal.frente}</h3>
          <button onClick={()=>setEquipeModal(null)} style={{background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {equipeModal.equipes.length===0?<p style={{color:C.textDim,fontSize:13,margin:0}}>Nenhuma equipe em campo</p>:
          equipeModal.equipes.map((eq,i)=><div key={i} style={{padding:"8px 12px",borderRadius:8,background:i%2?"rgba(15,23,42,0.4)":"transparent",fontSize:13,fontWeight:500,color:C.text}}>{eq}</div>)}
        </div>
        <div style={{fontSize:11,color:C.textDim,textAlign:"right"}}>{equipeModal.equipes.length} equipe{equipeModal.equipes.length!==1?"s":""}</div>
      </div>
    </div>}

    {/* Modal Todas as Equipes (por frente) */}
    {showAllEquipesModal&&<div onClick={()=>setShowAllEquipesModal(false)} style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.15s ease"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:"24px 28px",minWidth:340,maxWidth:520,maxHeight:"80vh",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Todas as Equipes ({totals.equipes})</h3>
          <button onClick={()=>setShowAllEquipesModal(false)} style={{background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {carteiraData.filter(r=>r.equipesNomes&&r.equipesNomes.length>0).map(r=>
            <div key={r.frente} style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#8b5cf6",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${C.border}`}}>{r.frente} ({r.equipesNomes.length})</div>
              {r.equipesNomes.map((eq,i)=>
                <div key={i} style={{padding:"6px 12px",fontSize:13,color:C.text,background:i%2?"rgba(15,23,42,0.4)":"transparent",borderRadius:6}}>{eq}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>}

    {/* Modal Na Rua (OS em campo) */}
    {naRuaModal&&<div onClick={()=>setNaRuaModal(null)} style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.15s ease"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:"24px 28px",minWidth:360,maxWidth:"90vw",width:700,maxHeight:"80vh",display:"flex",flexDirection:"column",gap:12,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Na Rua — {naRuaModal.label} <span style={{fontSize:13,fontWeight:400,color:C.textDim}}>({naRuaModal.rows.length} OS)</span></h3>
          <button onClick={()=>setNaRuaModal(null)} style={{background:"none",border:"none",color:C.textDim,fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:C.headerBg}}>
              <th style={{padding:"8px 10px",textAlign:"left",color:C.textDim,fontWeight:700,fontSize:10,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>Nº OS</th>
              <th style={{padding:"8px 10px",textAlign:"left",color:C.textDim,fontWeight:700,fontSize:10,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>TSS</th>
              <th style={{padding:"8px 10px",textAlign:"left",color:C.textDim,fontWeight:700,fontSize:10,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>Endereço</th>
              <th style={{padding:"8px 10px",textAlign:"left",color:C.textDim,fontWeight:700,fontSize:10,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>Equipe</th>
            </tr></thead>
            <tbody>{naRuaModal.rows.map((r,i)=><tr key={i} style={{background:i%2?"rgba(15,23,42,0.4)":"transparent"}}>
              <td style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,color:C.text,fontWeight:600,whiteSpace:"nowrap"}}>{r.numero_os}</td>
              <td style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,fontSize:11}}>{r.tss||"—"}</td>
              <td style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,color:C.textMuted,fontSize:11}}>{[r.endereco,r.bairro].filter(Boolean).join(", ")||"—"}</td>
              <td style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,color:"#8b5cf6",fontWeight:600,fontSize:11,whiteSpace:"nowrap"}}>{r.equipe||"—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>}

    {loadingCarteira?<div style={{padding:40,textAlign:"center",color:C.textDim}}>Carregando dados da carteira...</div>:
    <div style={{background:C.card,borderRadius:RAIO,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div>
        <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
          <colgroup>
            <col style={{width:"16%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"5.5%"}}/>
            <col style={{width:"5.5%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"5.5%"}}/>
            <col style={{width:"5.5%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"8%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"7%"}}/>
            <col style={{width:"7%"}}/>
          </colgroup>
          <thead><tr style={{background:C.headerBg}}>
            <th style={{...hdrCell,textAlign:"left",paddingLeft:10,borderRight:colDiv}}>Frente / TSS</th>
            <th style={{...hdrCell,background:grpD3.hdr,borderRight:colDiv}}>Cart. {fmtDiaShort(diaD3)}</th>
            <th style={{...hdrCell,background:grpMov1.hdr}}>Novas</th>
            <th style={{...hdrCell,background:grpMov1.hdr}}>Baixas<br/><span style={{fontSize:7,opacity:.75,letterSpacing:0}}>exec / não</span></th>
            <th style={{...hdrCell,background:grpMov1.hdr,borderRight:colDiv}}>Cart. {fmtDiaShort(diaD2)}</th>
            <th style={{...hdrCell,background:grpMov2.hdr}}>Novas</th>
            <th style={{...hdrCell,background:grpMov2.hdr}}>Baixas<br/><span style={{fontSize:7,opacity:.75,letterSpacing:0}}>exec / não</span></th>
            <th style={{...hdrCell,background:grpMov2.hdr,borderRight:colDiv}}>Cart. {fmtDiaShort(diaD1)}</th>
            <th style={{...hdrCell,background:"rgba(99,102,241,0.10)",borderRight:colDiv}}>Cart. Atual</th>
            <th style={{...hdrCell,background:grpCampo.hdr}}>Equipes</th>
            <th style={{...hdrCell,background:grpCampo.hdr}}>Na Rua</th>
            <th style={{...hdrCell,background:grpCampo.hdr}}>% Campo</th>
          </tr></thead>
          <tbody>
            {carteiraData.map((row,i)=>{
              const hasFamilias=!!row.familiaBreakdown;
              const hasTssOnly=!!row.tssBreakdown&&!hasFamilias;
              const hasChildren=hasFamilias||hasTssOnly;
              const expanded=expandedFrente===row.frente;
              return <React.Fragment key={row.frente}>
                <tr style={{background:i%2?C.cardAlt:"transparent",cursor:hasChildren?"pointer":"default"}}
                  onClick={()=>{if(hasChildren){setExpandedFrente(expanded?null:row.frente);if(expanded)setExpandedFamilia(null);}}}
                  onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
                  <td style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,borderRight:colDiv,fontWeight:700,fontSize:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {hasChildren&&<span style={{fontSize:10,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>}
                      {row.frente}
                    </div>
                  </td>
                  <td style={{...cellStyle,background:grpD3.bg,borderRight:colDiv}}>{row.carteiraD3}</td>
                  <td style={{...cellStyle,background:grpMov1.bg,color:row.novasD3>0?C.amber:C.textDim,fontWeight:row.novasD3>0?700:400}}>{row.novasD3>0?"+"+row.novasD3:"0"}</td>
                  <td style={{...cellStyle,background:grpMov1.bg}}><Baixa bx={row.bx3}/></td>
                  <td style={{...cellStyle,background:grpMov1.bg,fontWeight:700,borderRight:colDiv}}>{row.carteiraD2}</td>
                  <td style={{...cellStyle,background:grpMov2.bg,color:row.novas>0?C.amber:C.textDim,fontWeight:row.novas>0?700:400}}>{row.novas>0?"+"+row.novas:"0"}</td>
                  <td style={{...cellStyle,background:grpMov2.bg}}><Baixa bx={row.bx2}/></td>
                  <td style={{...cellStyle,background:grpMov2.bg,fontWeight:700,borderRight:colDiv}}>{row.carteiraD1}</td>
                  <td style={{...cellStyle,background:"rgba(99,102,241,0.04)",fontWeight:700,color:"#6366f1",borderRight:colDiv}}>{row.carteiraD0}</td>
                  <td onClick={e=>{e.stopPropagation();if(row.equipesNomes&&row.equipesNomes.length>0)setEquipeModal({frente:row.frente,equipes:row.equipesNomes});}}
                    style={{...cellStyle,background:grpCampo.bg,color:"#8b5cf6",fontWeight:600,cursor:row.equipes>0?"pointer":"default",textDecoration:row.equipes>0?"underline":"none",textUnderlineOffset:3}}>{row.equipes||"—"}</td>
                  <td onClick={e=>{e.stopPropagation();if(row.naRuaRows&&row.naRuaRows.length>0)setNaRuaModal({label:row.frente,rows:row.naRuaRows});}}
                    style={{...cellStyle,background:grpCampo.bg,color:C.green,fontWeight:600,cursor:row.naRuaCarteira>0?"pointer":"default",textDecoration:row.naRuaCarteira>0?"underline":"none",textUnderlineOffset:3}}>{row.naRuaCarteira||"—"}</td>
                  <td style={{...cellStyle,background:grpCampo.bg}}>
                    <span style={{padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700,
                      color:row.pctCampo>=70?C.green:row.pctCampo>=40?C.amber:C.red,
                      background:row.pctCampo>=70?C.greenBg:row.pctCampo>=40?C.amberBg:C.redBg,
                      border:`1px solid ${row.pctCampo>=70?C.greenBorder:row.pctCampo>=40?"rgba(245,158,11,0.25)":C.redBorder}`
                    }}>{row.pctCampo.toFixed(1)}%</span>
                  </td>
                </tr>
                {/* LIGAÇÃO ÁGUA: sub-rows por TSS (nível 2) */}
                {expanded&&hasTssOnly&&row.tssBreakdown.map((t,j)=>
                  <tr key={t.tss} style={{background:"rgba(15,23,42,0.5)",opacity:t.excluded?0.4:1}}>
                    <td onClick={e=>{e.stopPropagation();toggleExcluded(t.tss);}}
                      style={{padding:"8px 16px 8px 44px",borderBottom:`1px solid ${C.border}`,borderRight:colDiv,fontSize:12,color:C.textMuted,cursor:"pointer",textDecoration:t.excluded?"line-through":"none",userSelect:"none"}}
                      title={t.excluded?"Clique para incluir":"Clique para excluir"}>{t.tss}</td>
                    <td style={{...cellStyle,fontSize:11,color:C.textMuted,background:grpD3.bg,borderRight:colDiv}}>{t.carteiraD3}</td>
                    <td style={{...cellStyle,fontSize:11,color:t.novasD3>0?C.amber:C.textDim,background:grpMov1.bg}}>{t.novasD3>0?"+"+t.novasD3:"0"}</td>
                    <td style={{...cellStyle,fontSize:11,background:grpMov1.bg}}><Baixa bx={t.bx3} fs={10}/></td>
                    <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov1.bg,borderRight:colDiv}}>{t.carteiraD2}</td>
                    <td style={{...cellStyle,fontSize:11,color:t.novas>0?C.amber:C.textDim,background:grpMov2.bg}}>{t.novas>0?"+"+t.novas:"0"}</td>
                    <td style={{...cellStyle,fontSize:11,background:grpMov2.bg}}><Baixa bx={t.bx2} fs={10}/></td>
                    <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov2.bg,borderRight:colDiv}}>{t.carteiraD1}</td>
                    <td style={{...cellStyle,fontSize:11,fontWeight:600,color:"#6366f1",background:"rgba(99,102,241,0.04)",borderRight:colDiv}}>{t.carteiraD0}</td>
                    <td style={{...cellStyle,fontSize:11,color:"#8b5cf6",background:grpCampo.bg}}>{t.equipes||"—"}</td>
                    <td onClick={e=>{e.stopPropagation();if(t.naRuaRows&&t.naRuaRows.length>0)setNaRuaModal({label:t.tss,rows:t.naRuaRows});}}
                      style={{...cellStyle,fontSize:11,color:C.green,background:grpCampo.bg,cursor:t.naRuaCarteira>0?"pointer":"default",textDecoration:t.naRuaCarteira>0?"underline":"none",textUnderlineOffset:3}}>{t.naRuaCarteira||"—"}</td>
                    <td style={{...cellStyle,fontSize:11,background:grpCampo.bg}}>
                      <span style={{padding:"2px 6px",borderRadius:5,fontSize:10,fontWeight:600,
                        color:t.pctCampo>=70?C.green:t.pctCampo>=40?C.amber:C.red,
                        background:t.pctCampo>=70?C.greenBg:t.pctCampo>=40?C.amberBg:C.redBg,
                      }}>{t.pctCampo.toFixed(1)}%</span>
                    </td>
                  </tr>
                )}
                {/* Frentes com famílias: sub-rows por Família (nível 2) com TSS aninhado (nível 3) */}
                {expanded&&hasFamilias&&row.familiaBreakdown.map((fam,fi)=>{
                  const famExpanded=expandedFamilia===fam.familia;
                  const hasTss=fam.tssBreakdown&&fam.tssBreakdown.length>0;
                  return <React.Fragment key={fam.familia}>
                    <tr style={{background:"rgba(15,23,42,0.5)",cursor:hasTss?"pointer":"default",opacity:fam.excluded?0.4:1}}
                      onClick={e=>{e.stopPropagation();if(hasTss)setExpandedFamilia(famExpanded?null:fam.familia);}}
                      onMouseEnter={e=>(e.currentTarget.style.background="rgba(30,41,59,0.7)")} onMouseLeave={e=>(e.currentTarget.style.background="rgba(15,23,42,0.5)")}>
                      <td style={{padding:"8px 16px 8px 36px",borderBottom:`1px solid ${C.border}`,borderRight:colDiv,fontSize:13,fontWeight:600,color:C.text}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {hasTss&&<span style={{fontSize:9,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:famExpanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>}
                          <span onClick={e=>{e.stopPropagation();toggleExcluded(fam.familia);}}
                            style={{cursor:"pointer",textDecoration:fam.excluded?"line-through":"none",userSelect:"none"}}
                            title={fam.excluded?"Clique para incluir":"Clique para excluir"}>{fam.familia}</span>
                        </div>
                      </td>
                      <td style={{...cellStyle,fontSize:11,background:grpD3.bg,borderRight:colDiv}}>{fam.carteiraD3}</td>
                      <td style={{...cellStyle,fontSize:11,color:fam.novasD3>0?C.amber:C.textDim,background:grpMov1.bg}}>{fam.novasD3>0?"+"+fam.novasD3:"0"}</td>
                      <td style={{...cellStyle,fontSize:11,background:grpMov1.bg}}><Baixa bx={fam.bx3} fs={10}/></td>
                      <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov1.bg,borderRight:colDiv}}>{fam.carteiraD2}</td>
                      <td style={{...cellStyle,fontSize:11,color:fam.novas>0?C.amber:C.textDim,background:grpMov2.bg}}>{fam.novas>0?"+"+fam.novas:"0"}</td>
                      <td style={{...cellStyle,fontSize:11,background:grpMov2.bg}}><Baixa bx={fam.bx2} fs={10}/></td>
                      <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov2.bg,borderRight:colDiv}}>{fam.carteiraD1}</td>
                      <td style={{...cellStyle,fontSize:11,fontWeight:600,color:"#6366f1",background:"rgba(99,102,241,0.04)",borderRight:colDiv}}>{fam.carteiraD0}</td>
                      <td style={{...cellStyle,fontSize:12,color:"#8b5cf6",background:grpCampo.bg}}>{fam.equipes||"—"}</td>
                      <td onClick={e=>{e.stopPropagation();if(fam.naRuaRows&&fam.naRuaRows.length>0)setNaRuaModal({label:fam.familia,rows:fam.naRuaRows});}}
                        style={{...cellStyle,fontSize:12,color:C.green,background:grpCampo.bg,cursor:fam.naRuaCarteira>0?"pointer":"default",textDecoration:fam.naRuaCarteira>0?"underline":"none",textUnderlineOffset:3}}>{fam.naRuaCarteira||"—"}</td>
                      <td style={{...cellStyle,fontSize:12,background:grpCampo.bg}}>
                        <span style={{padding:"2px 8px",borderRadius:5,fontSize:11,fontWeight:600,
                          color:fam.pctCampo>=70?C.green:fam.pctCampo>=40?C.amber:C.red,
                          background:fam.pctCampo>=70?C.greenBg:fam.pctCampo>=40?C.amberBg:C.redBg,
                        }}>{fam.pctCampo.toFixed(1)}%</span>
                      </td>
                    </tr>
                    {/* Nível 3: TSS dentro da família */}
                    {famExpanded&&fam.tssBreakdown&&fam.tssBreakdown.map(t=>
                      <tr key={t.tss} style={{background:"rgba(10,15,30,0.6)",opacity:t.excluded?0.4:1}}>
                        <td onClick={e=>{e.stopPropagation();toggleExcluded(t.tss);}}
                          style={{padding:"6px 16px 6px 64px",borderBottom:`1px solid ${C.border}`,borderRight:colDiv,fontSize:11,color:C.textDim,cursor:"pointer",textDecoration:t.excluded?"line-through":"none",userSelect:"none"}}
                          title={t.excluded?"Clique para incluir":"Clique para excluir"}>{t.tss}</td>
                        <td style={{...cellStyle,fontSize:11,color:C.textDim,background:grpD3.bg,borderRight:colDiv}}>{t.carteiraD3}</td>
                        <td style={{...cellStyle,fontSize:11,color:t.novasD3>0?C.amber:C.textDim,background:grpMov1.bg}}>{t.novasD3>0?"+"+t.novasD3:"0"}</td>
                        <td style={{...cellStyle,fontSize:11,background:grpMov1.bg}}><Baixa bx={t.bx3} fs={10}/></td>
                        <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov1.bg,borderRight:colDiv}}>{t.carteiraD2}</td>
                        <td style={{...cellStyle,fontSize:11,color:t.novas>0?C.amber:C.textDim,background:grpMov2.bg}}>{t.novas>0?"+"+t.novas:"0"}</td>
                        <td style={{...cellStyle,fontSize:11,background:grpMov2.bg}}><Baixa bx={t.bx2} fs={10}/></td>
                        <td style={{...cellStyle,fontSize:11,fontWeight:600,background:grpMov2.bg,borderRight:colDiv}}>{t.carteiraD1}</td>
                        <td style={{...cellStyle,fontSize:11,fontWeight:600,color:"#6366f1",background:"rgba(99,102,241,0.04)",borderRight:colDiv}}>{t.carteiraD0}</td>
                        <td style={{...cellStyle,fontSize:11,color:"#8b5cf6",background:grpCampo.bg}}>{t.equipes||"—"}</td>
                        <td onClick={e=>{e.stopPropagation();if(t.naRuaRows&&t.naRuaRows.length>0)setNaRuaModal({label:t.tss,rows:t.naRuaRows});}}
                          style={{...cellStyle,fontSize:11,color:C.green,background:grpCampo.bg,cursor:t.naRuaCarteira>0?"pointer":"default",textDecoration:t.naRuaCarteira>0?"underline":"none",textUnderlineOffset:3}}>{t.naRuaCarteira||"—"}</td>
                        <td style={{...cellStyle,fontSize:11,background:grpCampo.bg}}>
                          <span style={{padding:"2px 6px",borderRadius:4,fontSize:10,fontWeight:600,
                            color:t.pctCampo>=70?C.green:t.pctCampo>=40?C.amber:C.red,
                            background:t.pctCampo>=70?C.greenBg:t.pctCampo>=40?C.amberBg:C.redBg,
                          }}>{t.pctCampo.toFixed(1)}%</span>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>;
                })}
              </React.Fragment>;
            })}
            {/* Total row */}
            <tr style={{background:C.headerBg,fontWeight:800}}>
              <td style={{padding:"14px 16px",borderTop:`2px solid ${C.accent}`,borderRight:colDiv,fontSize:14}}>TOTAL</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,background:grpD3.bg,borderRight:colDiv}}>{totals.carteiraD3}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.amber,background:grpMov1.bg}}>{totals.novasD3>0?"+"+totals.novasD3:"0"}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,background:grpMov1.bg}}><Baixa bx={{baixas:totals.execD3,executadas:totals.ex3,naoExecutadas:totals.ne3}} fs={13}/></td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,background:grpMov1.bg,borderRight:colDiv}}>{totals.carteiraD2}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.amber,background:grpMov2.bg}}>{totals.novas>0?"+"+totals.novas:"0"}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,background:grpMov2.bg}}><Baixa bx={{baixas:totals.executadas,executadas:totals.ex2,naoExecutadas:totals.ne2}} fs={13}/></td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,background:grpMov2.bg,borderRight:colDiv}}>{totals.carteiraD1}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:"#6366f1",background:"rgba(99,102,241,0.04)",borderRight:colDiv}}>{totals.carteiraD0}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:"#8b5cf6",background:grpCampo.bg}}>{totals.equipes}</td>
              <td onClick={()=>{const allRows=carteiraData.flatMap(r=>r.naRuaRows||[]);if(allRows.length>0)setNaRuaModal({label:"TOTAL",rows:allRows});}}
                style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.green,background:grpCampo.bg,cursor:totals.naRuaCarteira>0?"pointer":"default",textDecoration:totals.naRuaCarteira>0?"underline":"none",textUnderlineOffset:3}}>{totals.naRuaCarteira}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,background:grpCampo.bg}}>
                <span style={{padding:"3px 12px",borderRadius:6,fontSize:13,fontWeight:800,
                  color:totalPct>=70?C.green:totalPct>=40?C.amber:C.red,
                  background:totalPct>=70?C.greenBg:totalPct>=40?C.amberBg:C.redBg,
                  border:`1px solid ${totalPct>=70?C.greenBorder:totalPct>=40?"rgba(245,158,11,0.25)":C.redBorder}`
                }}>{totalPct.toFixed(1)}%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>}
  </div>;
}

/* ── Main ── */
/* ══════════════════════════════════════════════════════════
   PRODUÇÃO POR EQUIPES — aba restrita
   Fonte: tabela `execucao` (Relatório de Dados Operacionais,
   robô das 00:30). Nenhuma coleta nova.
   ══════════════════════════════════════════════════════════ */

const fmtISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const diasAtras=n=>{const d=new Date();d.setDate(d.getDate()-n);return fmtISO(d);};

function LoginModal({onClose,onOk}){
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [busy,setBusy]=useState(false);

  const entrar=async()=>{
    if(busy)return;
    setErro("");setBusy(true);
    try{
      const s=await authLogin(email,senha);
      const perfil=await fetchPerfil(s.access_token);
      if(!perfil) throw new Error("Usuário sem linha em `perfis`. Rode a etapa 1 de sql/producao.sql.");
      // Duas permissões independentes: ver a Produção e importar arquivos.
      // O gerente tem a primeira sem a segunda.
      if(!perfil.pode_producao&&!perfil.pode_importar)
        throw new Error("Este usuário existe, mas não está liberado para nada ainda.");
      onOk({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,perfil});
    }catch(e){setErro(e.message);}
    setBusy(false);
  };

  const inp={width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:8,fontSize:13,
    border:`1px solid ${C.border}`,background:C.cardAlt,color:C.text,outline:"none"};

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(2,6,16,0.75)",backdropFilter:"blur(4px)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{width:340,maxWidth:"100%",background:C.card,borderRadius:16,border:`1px solid ${C.border}`,padding:24,animation:"modalIn 0.2s ease"}}>
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{fontSize:28,marginBottom:6}}>🔒</div>
        <h3 style={{margin:0,fontSize:16,fontWeight:800}}>Produção por Equipes</h3>
        <p style={{margin:"6px 0 0",fontSize:12,color:C.textDim}}>Área restrita — entre com sua conta</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input style={inp} type="email" placeholder="e-mail" value={email} autoFocus
          onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()}/>
        <input style={inp} type="password" placeholder="senha" value={senha}
          onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()}/>
        {erro&&<div style={{fontSize:12,color:C.red,background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:8,padding:"8px 10px",lineHeight:1.4}}>{erro}</div>}
        <button onClick={entrar} disabled={busy||!email||!senha}
          style={{padding:"10px 0",borderRadius:8,fontSize:13,fontWeight:700,cursor:busy?"wait":"pointer",border:"1px solid rgba(59,130,246,0.4)",
            background:busy?C.border:C.accentBg,color:busy?C.textDim:C.accent,opacity:(!email||!senha)?0.5:1}}>
          {busy?"Entrando…":"Entrar"}
        </button>
        <button onClick={onClose} style={{padding:"6px 0",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"none",background:"transparent",color:C.textDim}}>cancelar</button>
      </div>
    </div>
  </div>;
}

function BarraProp({valor,max,cor}){
  const pct=max>0?(valor/max)*100:0;
  return <div style={{height:6,borderRadius:3,background:C.border,overflow:"hidden",width:"100%"}}>
    <div style={{width:`${pct}%`,height:"100%",background:cor,transition:"width 0.35s"}}/>
  </div>;
}

function ProducaoView({sess,onLogout}){
  const primeiroDoMes=()=>{const d=new Date();return fmtISO(new Date(d.getFullYear(),d.getMonth(),1));};
  const [ini,setIni]=useState(primeiroDoMes());
  const [fim,setFim]=useState(fmtISO(new Date()));
  // TSE por padrão: é o serviço que a equipe efetivamente executou, que é o
  // que responde "o que essa equipe fez". O TSS (solicitado) fica no botão.
  const [modo,setModo]=useState("tse");      // tss = pedido | tse = executado
  const [unidade,setUnidade]=useState("geral");
  const [equipeSel,setEquipeSel]=useState(null);
  const [busca,setBusca]=useState("");
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState("");

  useEffect(()=>{let vivo=true;
    (async()=>{
      setLoading(true);setErro("");
      try{
        const d=await fetchProducao(sess.access_token,ini,fim);
        if(vivo){setData(d);setEquipeSel(null);}
      }catch(e){
        if(vivo){setErro(String(e.message||e));setData(null);}
      }
      if(vivo)setLoading(false);
    })();
    return()=>{vivo=false;};
  },[sess.access_token,ini,fim]);

  const atcAlvo=UNITS.find(u=>u.id===unidade)?.atc??null;

  const ag=useMemo(()=>{
    if(!data)return null;
    const campo=modo==="tss"?"tss":"tse";
    const linhas=data.rows.filter(r=>atcAlvo===null?true:Number(r.atc)===atcAlvo);

    const equipes=new Map();  // equipe -> {total, tipos:Map}
    const dias=new Map();
    let total=0;
    linhas.forEach(r=>{
      const eq=String(r.equipe||"").trim()||"(sem equipe)";
      const tp=String(r[campo]||"").trim()||(modo==="tss"?"(sem TSS)":"(sem TSE)");
      const q=Number(r.qtd)||1;
      total+=q;
      if(!equipes.has(eq))equipes.set(eq,{equipe:eq,total:0,tipos:new Map()});
      const e=equipes.get(eq);
      e.total+=q;
      e.tipos.set(tp,(e.tipos.get(tp)||0)+q);
      dias.set(r.dia,(dias.get(r.dia)||0)+q);
    });

    const listaEquipes=[...equipes.values()].sort((a,b)=>b.total-a.total||a.equipe.localeCompare(b.equipe));

    // tipos do recorte atual (equipe selecionada ou todas)
    const tiposMap=new Map();
    const fonte=equipeSel?listaEquipes.filter(e=>e.equipe===equipeSel):listaEquipes;
    fonte.forEach(e=>e.tipos.forEach((q,tp)=>tiposMap.set(tp,(tiposMap.get(tp)||0)+q)));
    const listaTipos=[...tiposMap.entries()].map(([tipo,qtd])=>({tipo,qtd}))
      .sort((a,b)=>b.qtd-a.qtd||a.tipo.localeCompare(b.tipo));

    const listaDias=[...dias.entries()].map(([dia,qtd])=>({dia,qtd})).sort((a,b)=>a.dia.localeCompare(b.dia));

    return {
      total,
      equipes:listaEquipes,
      tipos:listaTipos,
      dias:listaDias,
      totalRecorte:listaTipos.reduce((s,t)=>s+t.qtd,0),
      nTiposGeral:new Set(listaEquipes.flatMap(e=>[...e.tipos.keys()])).size,
    };
  },[data,modo,atcAlvo,equipeSel]);

  const equipesFiltradas=useMemo(()=>{
    if(!ag)return[];
    const b=norm(busca);
    return b?ag.equipes.filter(e=>norm(e.equipe).includes(b)):ag.equipes;
  },[ag,busca]);

  const tiposFiltrados=useMemo(()=>{
    if(!ag)return[];
    const b=norm(busca);
    return (b&&!equipeSel)?ag.tipos.filter(t=>norm(t.tipo).includes(b)):ag.tipos;
  },[ag,busca,equipeSel]);

  const baixarCSV=()=>{
    if(!ag)return;
    const campo=modo==="tss"?"TSS":"TSE";
    const linhas=[["Equipe",campo,"Quantidade"]];
    ag.equipes.forEach(e=>[...e.tipos.entries()].sort((a,b)=>b[1]-a[1])
      .forEach(([tp,q])=>linhas.push([e.equipe,tp,q])));
    const csv="﻿"+linhas.map(l=>l.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(";")).join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download=`producao_${campo.toLowerCase()}_${ini}_a_${fim}.csv`;
    a.click();URL.revokeObjectURL(a.href);
  };

  const presets=[
    {rot:"Hoje",     ini:fmtISO(new Date()),fim:fmtISO(new Date())},
    {rot:"7 dias",   ini:diasAtras(6),      fim:fmtISO(new Date())},
    {rot:"30 dias",  ini:diasAtras(29),     fim:fmtISO(new Date())},
    {rot:"Mês atual",ini:fmtISO(new Date(new Date().getFullYear(),new Date().getMonth(),1)),fim:fmtISO(new Date())},
  ];
  const ativoPreset=p=>p.ini===ini&&p.fim===fim;

  const btn=(on)=>({padding:"5px 12px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",
    border:on?"1px solid rgba(59,130,246,0.4)":`1px solid ${C.border}`,
    background:on?C.accentBg:"transparent",color:on?C.accent:C.textMuted,transition:"all 0.15s"});

  const maxEq=ag?.equipes[0]?.total||0;
  const maxTp=tiposFiltrados[0]?.qtd||0;
  const nDias=ag?.dias.length||0;
  const rotuloTipo=modo==="tss"?"TSS":"TSE";

  return <div style={{animation:"fadeIn 0.35s ease"}}>

    {/* barra superior */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",
      padding:"10px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:12,padding:"2px 10px",borderRadius:8,background:"rgba(139,92,246,0.1)",color:"#8b5cf6",border:"1px solid rgba(139,92,246,0.25)",fontWeight:700}}>🔒 restrito</span>
        <span style={{fontSize:12,color:C.textDim}}>{sess.perfil?.nome||sess.perfil?.email}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={baixarCSV} style={{...btn(false),color:C.green,border:`1px solid ${C.greenBorder}`}}>⬇ CSV</button>
        <button onClick={onLogout} style={btn(false)}>Sair</button>
      </div>
    </div>

    {/* filtros */}
    <div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"12px 16px",marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,fontWeight:700,minWidth:56}}>Período</span>
        {presets.map(p=><button key={p.rot} onClick={()=>{setIni(p.ini);setFim(p.fim);}} style={btn(ativoPreset(p))}>{p.rot}</button>)}
        <span style={{width:1,height:18,background:C.border,margin:"0 2px"}}/>
        <input type="date" value={ini} max={fim} onChange={e=>setIni(e.target.value)} style={dateInputStyle}/>
        <span style={{color:C.textDim,fontSize:12}}>até</span>
        <input type="date" value={fim} min={ini} onChange={e=>setFim(e.target.value)} style={dateInputStyle}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,fontWeight:700,minWidth:56}}>Serviço</span>
        <button onClick={()=>setModo("tss")} style={btn(modo==="tss")} title="TSS — serviço que foi solicitado na abertura da OS">TSS · solicitado</button>
        <button onClick={()=>setModo("tse")} style={btn(modo==="tse")} title="TSE — serviço que a equipe efetivamente executou">TSE · executado</button>
        <span style={{width:1,height:18,background:C.border,margin:"0 2px"}}/>
        {UNITS.map(u=><button key={u.id} onClick={()=>setUnidade(u.id)} style={btn(unidade===u.id)}>{u.icon} {u.label}</button>)}
      </div>
    </div>

    {erro&&<div style={{background:C.redBg,border:`1px solid ${C.redBorder}`,borderRadius:10,padding:"12px 16px",marginBottom:14,fontSize:12,color:C.red,lineHeight:1.5}}>
      Não consegui ler a produção: {erro}
      <div style={{color:C.textMuted,marginTop:6}}>Se a mensagem fala em permissão, falta rodar a etapa 1 de <code>sql/producao.sql</code> ou marcar <code>pode_producao = true</code> no seu perfil.</div>
    </div>}

    {loading&&<div style={{textAlign:"center",padding:"40px 0",color:C.textDim,fontSize:13}}>Carregando produção…</div>}

    {!loading&&ag&&<>
      {/* cartões */}
      <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <SummaryCard label="Execuções"        value={ag.total}                                   color={C.green}  icon="✅"/>
        <SummaryCard label="Equipes"          value={ag.equipes.length}                          color="#8b5cf6"  icon="👷"/>
        <SummaryCard label={`Tipos de ${rotuloTipo}`} value={ag.nTiposGeral}                     color={C.accent} icon="🔧"/>
        <SummaryCard label="Média por dia"    value={nDias?Math.round(ag.total/nDias):0}          color={C.amber}  icon="📅"/>
      </div>

      {ag.total===0&&<div style={{background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"40px 20px",textAlign:"center",color:C.textDim,fontSize:13}}>
        Nenhuma execução nesse período{unidade!=="geral"?" para esta unidade":""}.
      </div>}

      {ag.total>0&&<>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder={`buscar equipe ou ${rotuloTipo}…`}
          style={{width:"100%",boxSizing:"border-box",padding:"9px 14px",borderRadius:10,fontSize:13,marginBottom:14,
            border:`1px solid ${C.border}`,background:C.card,color:C.text,outline:"none"}}/>

        <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>

          {/* equipes */}
          <div style={{flex:"1 1 320px",minWidth:300,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,fontWeight:800,color:C.text}}>Equipes ({equipesFiltradas.length})</span>
              {equipeSel&&<button onClick={()=>setEquipeSel(null)} style={{...btn(false),padding:"3px 10px",fontSize:11}}>limpar seleção</button>}
            </div>
            <div style={{maxHeight:520,overflowY:"auto"}}>
              {equipesFiltradas.map((e,i)=>{
                const on=equipeSel===e.equipe;
                return <div key={e.equipe} onClick={()=>setEquipeSel(on?null:e.equipe)}
                  style={{padding:"9px 16px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,
                    background:on?C.accentBg:(i%2?"rgba(15,23,42,0.35)":"transparent"),
                    borderLeft:on?`3px solid ${C.accent}`:"3px solid transparent",transition:"background 0.12s"}}
                  onMouseEnter={ev=>{if(!on)ev.currentTarget.style.background=C.rowHover;}}
                  onMouseLeave={ev=>{if(!on)ev.currentTarget.style.background=i%2?"rgba(15,23,42,0.35)":"transparent";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:5}}>
                    <span style={{fontSize:12,fontWeight:600,color:on?C.accent:"#8b5cf6",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.equipe}</span>
                    <span style={{fontSize:13,fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{e.total.toLocaleString("pt-BR")}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <BarraProp valor={e.total} max={maxEq} cor="linear-gradient(90deg,#8b5cf6,#a78bfa)"/>
                    <span style={{fontSize:10,color:C.textDim,minWidth:56,textAlign:"right",whiteSpace:"nowrap"}}>{e.tipos.size} {rotuloTipo}</span>
                  </div>
                </div>;
              })}
              {equipesFiltradas.length===0&&<div style={{padding:"24px 16px",textAlign:"center",color:C.textDim,fontSize:12}}>nenhuma equipe com esse nome</div>}
            </div>
          </div>

          {/* tipos de serviço */}
          <div style={{flex:"1 1 380px",minWidth:320,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:12,fontWeight:800,color:C.text}}>
                {equipeSel?<>{rotuloTipo} de <span style={{color:"#8b5cf6"}}>{equipeSel}</span></>:`${rotuloTipo} — todas as equipes`}
              </div>
              <div style={{fontSize:11,color:C.textDim,marginTop:2}}>
                {ag.totalRecorte.toLocaleString("pt-BR")} execuções · {tiposFiltrados.length} tipos
              </div>
            </div>
            <div style={{maxHeight:520,overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <tbody>
                  {tiposFiltrados.map((t,i)=>
                    <tr key={t.tipo} style={{background:i%2?"rgba(15,23,42,0.35)":"transparent"}}>
                      <td style={{padding:"8px 16px",fontSize:12,color:C.text,borderBottom:`1px solid ${C.border}`,lineHeight:1.35}}>
                        {t.tipo}
                        <div style={{marginTop:5,display:"flex",alignItems:"center",gap:8}}>
                          <BarraProp valor={t.qtd} max={maxTp} cor={`linear-gradient(90deg,${C.accent},#60a5fa)`}/>
                          <span style={{fontSize:10,color:C.textDim,minWidth:38,textAlign:"right"}}>
                            {ag.totalRecorte?((t.qtd/ag.totalRecorte)*100).toFixed(1):0}%
                          </span>
                        </div>
                      </td>
                      <td style={{padding:"8px 16px",fontSize:14,fontWeight:800,color:C.green,textAlign:"right",verticalAlign:"top",
                        borderBottom:`1px solid ${C.border}`,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{t.qtd.toLocaleString("pt-BR")}</td>
                    </tr>)}
                  {tiposFiltrados.length===0&&<tr><td style={{padding:"24px 16px",textAlign:"center",color:C.textDim,fontSize:12}}>nada aqui</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* por dia */}
        {ag.dias.length>1&&<div style={{marginTop:14,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,padding:"12px 16px"}}>
          <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:10}}>Execuções por dia</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:80}}>
            {ag.dias.map(d=>{
              const mx=Math.max(...ag.dias.map(x=>x.qtd))||1;
              return <div key={d.dia} title={`${fmtDiaFull(d.dia)} — ${d.qtd} execuções`}
                style={{flex:1,minWidth:4,height:`${Math.max((d.qtd/mx)*100,2)}%`,borderRadius:"3px 3px 0 0",
                  background:`linear-gradient(180deg,${C.accent},rgba(59,130,246,0.25))`,cursor:"default"}}/>;
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:C.textDim}}>
            <span>{fmtDiaShort(ag.dias[0].dia)}</span><span>{fmtDiaShort(ag.dias[ag.dias.length-1].dia)}</span>
          </div>
        </div>}

        <div style={{marginTop:12,fontSize:11,color:C.textDim,lineHeight:1.6}}>
          Contagem de execuções confirmadas (Relatório de Dados Operacionais), não de OS distintas —
          uma OS que gera duas etapas conta duas vezes, que é como a equipe é medida.
          {" "}<strong style={{color:C.textMuted}}>TSS</strong> é o serviço solicitado na abertura;
          {" "}<strong style={{color:C.textMuted}}>TSE</strong> é o que foi feito. Eles divergem na maioria das linhas.
        </div>
      </>}
    </>}
  </div>;
}

export default function App(){
  const [rawRows,setRawRows]=useState(null);
  const [excludedTSS,setExcludedTSS]=useState(new Set());
  const [sortBy,setSortBy]=useState("fora");
  const [updatedAt,setUpdatedAt]=useState(null);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [toast,setToast]=useState("");
  const [dragOver,setDragOver]=useState(false);
  const [activeUnit,setActiveUnit]=useState("geral");
  const [sideCollapsed,setSideCollapsed]=useState(false);
  const [historico,setHistorico]=useState(null);
  const [showGasModal,setShowGasModal]=useState(false);
  const [notas,setNotas]=useState([]);
  const [showNotas,setShowNotas]=useState(false);
  const [showOuvRodar,setShowOuvRodar]=useState(false);
  const [filtroNota,setFiltroNota]=useState(null);
  const [notaAberta,setNotaAberta]=useState(null);   // edicao vinda do modal de Notas
  const [buscaModal,setBuscaModal]=useState(null);   // {rows,familia} da OS pesquisada
  const [activeTab,setActiveTab]=useState("pendente");
  const [desde,setDesde]=useState("");        // "a carteira desta data para frente" (AAAA-MM-DD)
  const [entrada,setEntrada]=useState(null);  // {osSet,primeiroDia} das OS que entraram a partir de `desde`
  const [buscandoDesde,setBuscandoDesde]=useState(false);
  const [sess,setSess]=useState(null);          // sessão do Supabase Auth (só a aba Produção usa)
  const [showLogin,setShowLogin]=useState(false);
  const inputRef=useRef();

  // Retoma a sessão salva. O access_token dura 1h; se venceu, renova pelo
  // refresh_token — senão o usuário teria que logar de novo a cada hora.
  useEffect(()=>{(async()=>{
    const s=loadSess();
    if(!s?.refresh_token)return;
    let tok=s.access_token;
    if(!s.expires_at||s.expires_at*1000<Date.now()+60000){
      const novo=await authRefresh(s.refresh_token);
      if(!novo?.access_token){saveSess(null);return;}
      tok=novo.access_token;
      s.access_token=novo.access_token;s.refresh_token=novo.refresh_token;s.expires_at=novo.expires_at;
    }
    const perfil=await fetchPerfil(tok);
    if(!perfil?.pode_producao&&!perfil?.pode_importar){saveSess(null);return;}
    const atual={...s,perfil};
    saveSess(atual);setSess(atual);
  })();},[]);

  const entrar=useCallback(s=>{saveSess(s);setSess(s);setShowLogin(false);
    if(s.perfil?.pode_producao)setActiveTab("producao");
    flash("Bem-vindo, "+(s.perfil?.nome||s.perfil?.email));},[]);
  const sair=useCallback(()=>{saveSess(null);setSess(null);setActiveTab("pendente");flash("Sessão encerrada");},[]);

  const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),4000);};
  const saveFilters=useCallback((excSet,sort,unit)=>{saveLocal({excluded:[...excSet],sortBy:sort,activeUnit:unit});},[]);

  useEffect(()=>{(async()=>{
    const local=loadLocal();
    if(local){if(local.excluded?.length>0)setExcludedTSS(new Set(local.excluded));if(local.sortBy)setSortBy(local.sortBy);if(local.activeUnit)setActiveUnit(local.activeUnit);}
    let loaded=false;
    try{const data=await fetchRows();if(data.rows?.length>0){setRawRows(data.rows);setUpdatedAt(data.updatedAt);cacheRows(data.rows,data.updatedAt);loaded=true;}}catch(e){flash("Erro Supabase: "+e.message);}
    if(!loaded){const cached=loadCache();if(cached?.rows?.length>0){setRawRows(cached.rows);setUpdatedAt(cached.updatedAt);flash("Usando dados em cache");}}
    try{const hist=await fetchHistorico();if(hist?.length>0)setHistorico(hist);}catch(e){console.warn("Historico indisponivel:",e.message);}
    // Nota indisponivel nao derruba a tela, mas tambem nao pode
    // passar por "nenhuma nota": o menu some e ninguem desconfia.
    try{setNotas(await fetchTodasNotas());}catch(e){console.warn("Notas indisponiveis:",e.message);}
    setLoading(false);
  })();},[]);

  const handleFile=useCallback(async(file)=>{
    if(!file)return;
    if(!sess?.perfil?.pode_importar){flash("Erro: importar o pendente exige login com permissão");return;}
    setUploading(true);
    try{flash("Processando arquivo...");const all=await parseFile(file);
      const filtered=all.map(sanitize).filter(r=>VALID_ATCS.includes(Number(r["ATC"]))&&!EXCLUDED_TSS.includes(String(r["TSS"]||"").trim()));
      setRawRows(filtered);setExcludedTSS(new Set());const now=new Date().toISOString();setUpdatedAt(now);
      cacheRows(filtered,now);saveFilters(new Set(),sortBy,activeUnit);
      flash("Enviando "+filtered.length+" OS...");const result=await uploadRows(filtered,authHeaders(await tokenFresco(sess)));
      setUpdatedAt(result.updatedAt);cacheRows(filtered,result.updatedAt);flash("Pendente atualizado ✓ ("+result.count+" OS)");
    }catch(e){flash("Erro: "+e.message);}setUploading(false);
  },[saveFilters,sortBy,activeUnit,sess]);

  const toggleTSS=useCallback(tss=>{setExcludedTSS(prev=>{const n=new Set(prev);n.has(tss)?n.delete(tss):n.add(tss);saveFilters(n,sortBy,activeUnit);return n;});},[saveFilters,sortBy,activeUnit]);
  const toggleAllTSS=useCallback((names,on)=>{setExcludedTSS(prev=>{const n=new Set(prev);names.forEach(nm=>on?n.delete(nm):n.add(nm));saveFilters(n,sortBy,activeUnit);return n;});},[saveFilters,sortBy,activeUnit]);
  const doSort=useCallback(key=>{setSortBy(key);saveFilters(excludedTSS,key,activeUnit);},[saveFilters,excludedTSS,activeUnit]);
  const switchUnit=useCallback(id=>{setActiveUnit(id);saveFilters(excludedTSS,sortBy,id);},[saveFilters,excludedTSS,sortBy]);

  const refresh=useCallback(async()=>{
    try{flash("Atualizando...");const data=await fetchRows();
      if(data.rows?.length>0){setRawRows(data.rows);setUpdatedAt(data.updatedAt);cacheRows(data.rows,data.updatedAt);flash("Dados atualizados ✓ ("+data.rows.length+" OS)");}
      else flash("Servidor vazio — dados locais mantidos");
    }catch(e){flash("Erro: "+e.message+" — dados locais mantidos");}
    try{const hist=await fetchHistorico();if(hist?.length>0)setHistorico(hist);}catch{}
  },[]);

  // Atualização sozinha. A cada minuto pergunta ao banco duas coisas
  // pequenas: quando o pendente foi gravado pela última vez e como
  // estão as notas (quantas + a mais recente). Só baixa tudo de novo se
  // algo mudou — são 2 requisições minúsculas por minuto, não 1000 OS.
  // Com a aba escondida não pergunta nada; ao voltar, confere na hora.
  // O robô grava o pendente_meta só DEPOIS de subir todas as OS, então
  // nunca se pega um pendente pela metade.
  const vigia=useRef({pend:null,notas:null});
  useEffect(()=>{
    let vivo=true,rodando=false;
    const conferir=async()=>{
      if(!vivo||rodando||document.hidden)return;
      rodando=true;
      try{
        const [m,n]=await Promise.all([
          fetch(SUPABASE_URL+"/rest/v1/pendente_meta?id=eq.1&select=updated_at",{headers:HEADERS}).then(r=>r.ok?r.json():null),
          fetch(SUPABASE_URL+"/rest/v1/os_nota?select=atualizado_em&order=atualizado_em.desc&limit=1",
            {headers:{...HEADERS,"Prefer":"count=exact"}}).then(async r=>r.ok?`${r.headers.get("content-range")}|${(await r.json())[0]?.atualizado_em||""}`:null),
        ]);
        const pend=m?.[0]?.updated_at||null;
        const v=vigia.current;
        if(pend&&v.pend&&pend!==v.pend){
          const data=await fetchRows();
          if(vivo&&data.rows?.length>0){setRawRows(data.rows);setUpdatedAt(data.updatedAt);cacheRows(data.rows,data.updatedAt);
            flash("Pendente atualizado ✓ ("+data.rows.length+" OS)");
            try{const hist=await fetchHistorico();if(vivo&&hist?.length>0)setHistorico(hist);}catch{}}
        }
        if(n&&v.notas&&n!==v.notas){
          const todas=await fetchTodasNotas();
          if(vivo){
            // Reescreve o cache sem esvaziar: um modal aberto continua com
            // as notas na tela, agora ja atualizadas.
            const porOS=new Map();for(const d of todas){const k=String(d.numero_os).trim();if(!porOS.has(k))porOS.set(k,[]);porOS.get(k).push(d);}
            for(const k of [...notaCache.keys()]) notaCache.set(k,porOS.get(k)||[]);
            setNotas(todas);
            window.dispatchEvent(new Event("notas-mudaram"));}
        }
        if(pend)v.pend=pend;
        if(n)v.notas=n;
      }catch(e){console.warn("Atualização automática:",e.message||e);}
      finally{rodando=false;}
    };
    conferir();
    const t=setInterval(conferir,60000);
    const aoVoltar=()=>{if(!document.hidden)conferir();};
    document.addEventListener("visibilitychange",aoVoltar);
    return()=>{vivo=false;clearInterval(t);document.removeEventListener("visibilitychange",aoVoltar);};
  },[]);

  // Busca no banco quem entrou a partir da data. Roda quando a data
  // muda; data vazia limpa o filtro sem ir ao servidor.
  useEffect(()=>{
    if(!desde){setEntrada(null);return;}
    let vivo=true;setBuscandoDesde(true);
    (async()=>{
      try{const e=await fetchEntradaDesde(desde);if(vivo)setEntrada(e);}
      catch(err){if(vivo){setEntrada(null);setDesde("");flash("Erro no filtro por data: "+err.message);}}
      finally{if(vivo)setBuscandoDesde(false);}
    })();
    return()=>{vivo=false;};
  },[desde]);

  const currentUnit=UNITS.find(u=>u.id===activeUnit)||UNITS[0];
  const filteredRows=useMemo(()=>{
    if(!rawRows)return[];
    const dig=v=>String(v??"").replace(/\D/g,"");
    return rawRows.filter(r=>(currentUnit.atc===null?VALID_ATCS.includes(Number(r["ATC"])):Number(r["ATC"])===currentUnit.atc)
      &&familiaTssVisivel(r["Família"],r["TSS"])
      &&(!entrada||entrada.osSet.has(dig(r["Número OS"]))));
  },[rawRows,currentUnit,entrada]);
  const unitCounts=useMemo(()=>{
    if(!rawRows)return{};const out={};
    // O filtro de data vale aqui tambem: lateral dizendo 174 e lista
    // abrindo com 40 e pior do que nao ter contagem nenhuma.
    const dig=v=>String(v??"").replace(/\D/g,"");
    UNITS.forEach(u=>{const ur=rawRows.filter(r=>(u.atc===null?VALID_ATCS.includes(Number(r["ATC"])):Number(r["ATC"])===u.atc)&&familiaTssVisivel(r["Família"],r["TSS"])&&!excludedTSS.has(String(r["TSS"]||"").trim())&&(!entrada||entrada.osSet.has(dig(r["Número OS"]))));
      const p=ur.filter(r=>tempo(r["Tempo Residual"])==="prazo").length;const f=ur.filter(r=>tempo(r["Tempo Residual"])==="fora").length;out[u.id]={total:p+f,prazo:p,fora:f};});
    return out;
  },[rawRows,excludedTSS,entrada]);

  // Uma conta so, usada pela lateral E pelo modal. Se cada um
  // filtrasse por conta propria, o menu diria 8 e a lista abriria
  // com 6 — e contagem que nao bate com a lista e pior que
  // contagem nenhuma. Casa pelos digitos, pelo mesmo motivo do
  // modal: espaco sobrando nao pode esconder informacao.
  const notasDoPendente=useMemo(()=>{
    if(!rawRows?.length) return [];
    const digitos=v=>String(v??"").replace(/\D/g,"");
    // Pelo par OS+TSS, nao so pela OS: resolvida a TSS da nota, ela
    // sai da lista e das etiquetas, ainda que a OS siga em outra TSS.
    const par=(os,tss)=>digitos(os)+"§"+String(tss??"").trim();
    const noPendente=new Set(rawRows.map(r=>par(r["Número OS"],r["TSS"])));
    return notas.filter(n=>noPendente.has(par(n.numero_os,n.tss)));
  },[notas,rawRows]);

  // Etiquetas da lateral: so as que tem alguma OS hoje, na ordem
  // em que TAGS as declara — ordem fixa e mais facil de decorar do
  // que ordem por quantidade, que muda todo dia.
  const tagsNotas=useMemo(()=>{
    const conta=new Map();
    for(const n of notasDoPendente) for(const t of n.tags||[]) conta.set(t,(conta.get(t)||0)+1);
    return TAGS.filter(t=>conta.get(t.id)).map(t=>({id:t.id,cor:t.cor,n:conta.get(t.id)}));
  },[notasDoPendente]);

  // Busca de OS. Procura no pendente INTEIRO, nao so na unidade ou na
  // data escolhida: quem digita um numero quer achar a OS, e "nao
  // encontrada" por causa de um filtro esquecido seria resposta errada.
  // Devolve null quando abre o modal, ou o aviso para mostrar.
  const buscarOS=useCallback(q=>{
    if(!rawRows?.length) return "Pendente ainda carregando";
    const dig=v=>String(v??"").replace(/\D/g,"");
    const validas=rawRows.filter(r=>VALID_ATCS.includes(Number(r["ATC"])));
    let achou=validas.filter(r=>dig(r["Número OS"])===q);
    // Sem o numero exato, aceita parte dele (os ultimos digitos,
    // que e como se fala a OS no dia a dia) — so com 5+ digitos,
    // senao qualquer "12" devolve meia carteira.
    if(!achou.length&&q.length>=5) achou=validas.filter(r=>dig(r["Número OS"]).includes(q));
    if(!achou.length&&q.length<5) return "Digite o número completo, ou pelo menos os 5 últimos dígitos";
    if(!achou.length) return "OS não está no pendente — pode já ter sido baixada";
    const visiveis=achou.filter(r=>familiaTssVisivel(r["Família"],r["TSS"]));
    if(!visiveis.length) return `Está no pendente, mas em ${String(achou[0]["Família"]).trim()}, que o painel não mostra`;
    const nOS=new Set(visiveis.map(r=>dig(r["Número OS"]))).size;
    if(nOS>10) return `${nOS} OS terminam com esses dígitos — digite mais números`;
    const fams=[...new Set(visiveis.map(r=>String(r["Família"]||"").trim()))];
    setBuscaModal({rows:visiveis,familia:fams.length===1?fams[0]:fams.join(" · ")});
    return null;
  },[rawRows]);

  const onDrop=useCallback(e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);},[handleFile]);

  // Gas alerts (usa rawRows sem filtro de unidade)
  const gas = useGasAlerts(rawRows);

  if(loading)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.textDim,fontFamily:"'Inter',sans-serif",flexDirection:"column",gap:12}}>
    <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <span>Carregando dados do Supabase…</span><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;

  return <SessaoCtx.Provider value={sess}><div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:FONTE_UI,display:"flex"}}>
    {rawRows&&<Sidebar activeUnit={activeUnit} setActiveUnit={switchUnit} unitCounts={unitCounts} collapsed={sideCollapsed} setCollapsed={setSideCollapsed} nNotas={notasDoPendente.length} onNotas={t=>{setFiltroNota(t);setShowNotas(true);}} tagsNotas={tagsNotas} onBuscarOS={buscarOS}/>}
    <div style={{flex:1,padding:"24px 16px",overflowY:"auto",minHeight:"100vh"}}>
      <div style={{maxWidth:activeTab==="producao"?1180:960,margin:"0 auto"}}>
        <div style={{marginBottom:24,textAlign:"center"}}>
          <h1 style={{fontSize:17,fontWeight:500,margin:0,letterSpacing:"0.2em",textTransform:"uppercase",color:C.text,fontFamily:FONTE_NUM}}>
            {activeTab==="pendente"?"Controle de Prazos — OS Pendentes":activeTab==="carteira"?"Acompanhamento de Carteira":"Produção por Equipes"}
          </h1>
          <p style={{color:C.textDim,margin:"6px 0 0",fontSize:13}}>
            {activeTab==="pendente"?"Análise por família de serviço":activeTab==="carteira"?"Carteira diária por frente de serviço":"Execuções confirmadas por equipe e tipo de serviço"}
          </p>
          {/* Tabs */}
          <div style={{display:"flex",justifyContent:"center",gap:4,marginTop:14}}>
            {[{id:"pendente",label:"Pendente",icon:"📋"},{id:"carteira",label:"Carteira",icon:"📊"},
              ...(sess?.perfil?.pode_producao?[{id:"producao",label:"Produção",icon:"👷"}]:[])].map(tab=>
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{padding:"8px 24px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:activeTab===tab.id?`1px solid rgba(59,130,246,0.4)`:`1px solid ${C.border}`,
                  background:activeTab===tab.id?C.accentBg:"transparent",color:activeTab===tab.id?C.accent:C.textMuted,transition:"all 0.15s",display:"flex",alignItems:"center",gap:6}}
                onMouseEnter={e=>{if(activeTab!==tab.id)e.currentTarget.style.background=C.rowHover;}}
                onMouseLeave={e=>{if(activeTab!==tab.id)e.currentTarget.style.background="transparent";}}>
                {tab.label}
              </button>
            )}
            {!sess&&<button onClick={()=>setShowLogin(true)} title="Área restrita"
              style={{padding:"8px 12px",borderRadius:8,fontSize:12,cursor:"pointer",border:`1px solid ${C.border}`,
                background:"transparent",color:C.textDim,opacity:0.45,transition:"opacity 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.opacity=1;}}
              onMouseLeave={e=>{e.currentTarget.style.opacity=0.45;}}>🔒</button>}
          </div>
        </div>
        {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"10px 24px",borderRadius:10,fontSize:13,fontWeight:600,maxWidth:"90vw",wordBreak:"break-word",background:toast.includes("Erro")?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)",color:toast.includes("Erro")?C.red:C.green,border:`1px solid ${toast.includes("Erro")?C.redBorder:C.greenBorder}`,backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease"}}>{toast}</div>}
        {activeTab==="carteira"&&<CarteiraView rawRows={rawRows} sess={sess}/>}
        {activeTab==="producao"&&sess?.perfil?.pode_producao&&<ProducaoView sess={sess} onLogout={sair}/>}
        {showLogin&&<LoginModal onClose={()=>setShowLogin(false)} onOk={entrar}/>}
        {activeTab==="pendente"&&!rawRows&&(sess?.perfil?.pode_importar
          ?<div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
            onClick={()=>inputRef.current?.click()} style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:16,padding:"60px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentBg:C.card,transition:"all 0.2s"}}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            <div style={{fontSize:40,marginBottom:12,opacity:0.7}}>📂</div>
            <p style={{fontSize:16,fontWeight:600,margin:0}}>Nenhum pendente no servidor</p>
            <p style={{fontSize:14,color:C.textDim,margin:"8px 0 0"}}>Importe o primeiro arquivo .xlsx</p>
          </div>
          :<div style={{border:`1px solid ${C.border}`,borderRadius:16,padding:"60px 20px",textAlign:"center",background:C.card}}>
            <div style={{fontSize:40,marginBottom:12,opacity:0.5}}>⏳</div>
            <p style={{fontSize:16,fontWeight:600,margin:0}}>Nenhum pendente no servidor</p>
            <p style={{fontSize:14,color:C.textDim,margin:"8px 0 0"}}>O robô atualiza de hora em hora. Se demorar, entre com sua conta para importar manualmente.</p>
          </div>)}
        {activeTab==="pendente"&&rawRows&&<div style={{animation:"fadeIn 0.35s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:12,padding:"2px 10px",borderRadius:8,background:C.accentBg,color:C.accent,border:"1px solid rgba(59,130,246,0.2)",fontWeight:700}}>{currentUnit.label}</span>
              <span style={{fontSize:12,color:C.textDim}}>Atualizado: {fmtDate(updatedAt)}</span>
              {/* Carteira a partir de uma data — só o que ENTROU dessa data em diante */}
              <span style={{width:1,height:14,background:C.border}}/>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.textDim}}>
                Entrou a partir de
                <input type="date" value={desde} max={new Date().toISOString().slice(0,10)}
                  onChange={e=>setDesde(e.target.value)}
                  style={{fontSize:12,fontFamily:FONTE_UI,color:desde?C.accent:C.textDim,background:desde?C.accentBg:"transparent",
                    border:`1px solid ${desde?"rgba(59,130,246,0.35)":C.border}`,borderRadius:RAIO,padding:"3px 8px",colorScheme:"dark"}}/>
              </label>
              {buscandoDesde&&<span style={{fontSize:11,color:C.textDim}}>buscando…</span>}
              {desde&&!buscandoDesde&&entrada&&<>
                <span style={{...numStyle,fontSize:11,color:C.accent,background:C.accentBg,border:"1px solid rgba(59,130,246,0.25)",
                  borderRadius:RAIO,padding:"2px 8px",fontWeight:700}}>
                  {filteredRows.length} de {rawRows.length} OS
                </span>
                <button onClick={()=>setDesde("")} title="Limpar o filtro de data"
                  style={{fontSize:11,color:C.textDim,cursor:"pointer",background:"transparent",border:"none",padding:"2px 4px"}}>✕ limpar</button>
                {entrada.primeiroDia&&desde<entrada.primeiroDia&&
                  <span title={`A série de fotos diárias começa em ${fmtDiaShort(entrada.primeiroDia)}. Antes disso ninguém guardou a data de entrada, então tudo que já estava na carteira nesse dia aparece como se tivesse entrado nele.`}
                    style={{fontSize:11,color:C.amber,background:C.amberBg,border:"1px solid rgba(245,158,11,0.3)",borderRadius:RAIO,padding:"2px 8px",fontWeight:600}}>
                    ⚠ só sabemos desde {fmtDiaShort(entrada.primeiroDia)}
                  </span>}
              </>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {gas.alerts.length>0&&<button onClick={()=>setShowGasModal(true)}
                style={{fontSize:12,color:C.amber,cursor:"pointer",fontWeight:700,padding:"4px 14px",borderRadius:6,border:"1px solid rgba(245,158,11,0.4)",background:C.amberBg,display:"flex",alignItems:"center",gap:6,animation:"gasPulse 2s infinite"}}>
                🔥 Gás ({gas.alerts.length})
              </button>}
              {sess?.perfil?.pode_importar&&<button onClick={()=>setShowOuvRodar(true)} title="Ler ouvidorias do e-mail e marcar a etiqueta"
                style={{fontSize:12,color:corDaTag("OUVIDORIA"),cursor:"pointer",fontWeight:600,padding:"4px 12px",borderRadius:6,border:`1px solid ${corDaTag("OUVIDORIA")}55`,background:"transparent"}}>Ouvidoria</button>}
              <button onClick={refresh} style={{fontSize:12,color:C.accent,cursor:"pointer",fontWeight:600,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(59,130,246,0.3)",background:C.accentBg}}>↻ Atualizar</button>
            </div>
          </div>
          <Dashboard rows={filteredRows} excludedTSS={excludedTSS} sortBy={sortBy} onToggleTSS={toggleTSS} onToggleAll={toggleAllTSS} onSort={doSort} unitLabel={currentUnit.label} historico={historico} activeUnit={activeUnit}/>
        </div>}
        {activeTab==="pendente"&&showGasModal&&gas.alerts.length>0&&<GasAlertModal alerts={gas.alerts} onIgnore={gas.doIgnore} onClose={()=>setShowGasModal(false)}/>}
        {buscaModal&&<OSModal rows={buscaModal.rows} familia={buscaModal.familia} tipo="busca" onClose={()=>setBuscaModal(null)}/>}
        {showNotas&&<NotasModal notas={notasDoPendente} rows={rawRows} filtroInicial={filtroNota} onClose={()=>setShowNotas(false)}
          onEditar={x=>setNotaAberta(x)}/>}
        {showOuvRodar&&sess?.perfil?.pode_importar&&<OuvidoriaRodarModal sess={sess} onClose={()=>setShowOuvRodar(false)}/>}
        {notaAberta&&<NotaModal linha={notaAberta.linha} nota={notaAberta.nota} sess={sess}
          onClose={()=>setNotaAberta(null)}
          onSalvou={async()=>{
            setNotaAberta(null);
            try{setNotas(await fetchTodasNotas());}catch(e){console.warn("Notas:",e.message);}
          }}/>}
        <div style={{textAlign:"center",padding:"32px 16px 16px",color:C.textDim,fontSize:11,letterSpacing:0.3,opacity:0.6}}>Desenvolvido por Bryan Mendes Deodato, todos os direitos reservados</div>
      </div>
    </div>
    <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes modalIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}@keyframes gasPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.3)}50%{box-shadow:0 0 12px 4px rgba(245,158,11,0.15)}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`}</style>
  </div></SessaoCtx.Provider>;
}