import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";

// ━━━ SUPABASE ━━━
const SUPABASE_URL = "https://iggnfikqbdgrvfshxhul.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZ25maWtxYmRncnZmc2h4aHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDgwNTIsImV4cCI6MjEwMTI4NDA1Mn0.Wnpzw5NK9b55oLwBiuFKcmx5rgG5F39Ka-fdho2aH9E";
const HEADERS = {"apikey":SUPABASE_KEY,"Authorization":"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"};

const EXCLUDED_DISPLAY = ["VISTORIA","CORTE SUPRESSÃO ADM","FISCALIZAÇÃO","SERV COMPLEMENTAR","ABASTECIMENTO","DESOBSTRUÇÃO"];
const EXCLUDED_TSS = [
  "RETIRAR LACRE NUMERADO","LIGAÇÃO DE ÁGUA - PROG AGUA LEGAL","DESCARGA EM REDE DE ÁGUA",
  "INSTALAR CAIXA D'ÁGUA","INSTALAR CAIXA UMA (PARTE CIVIL)","PREPARAR INSTALAÇÃO PARA CAIXA D'AGUA",
  "RESTABELECER LIGAÇÃO SERVIÇOS ADICIONAIS","LIGAÇÃO DE ESGOTO - PROG AGUA LEGAL",
  "LIGAÇÃO DE ESGOTO - PROG SE LIGA NA REDE","TESTE DE CORANTE OP","SUPRIMIR LIGAÇÃO DE POÇO",
];
const VALID_ATCS = [923, 929, 299];
const UNITS = [
  { id:"geral", label:"Geral", atc:null, icon:"📊" },
  { id:"interlagos", label:"Interlagos", atc:923, icon:"🏙️" },
  { id:"grajau", label:"Grajaú", atc:929, icon:"🌊" },
  { id:"embu", label:"Embu-Guaçu", atc:299, icon:"🌿" },
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
const FRENTES = {
  "VAZAMENTO":       r => (r.familia||"").toUpperCase().includes("VAZAMENTO"),
  "CAVALETE":        r => (r.familia||"").toUpperCase().includes("CAVALETE") && !LIGACAO_AGUA_TSS.map(t=>t.toUpperCase()).includes((r.tss||"").toUpperCase()),
  "MANUTENÇÃO ESGOTO": r => (r.familia||"").toUpperCase().includes("ESGOTO"),
  "LIGAÇÃO ÁGUA":    r => LIGACAO_AGUA_TSS.map(t=>t.toUpperCase()).includes((r.tss||"").toUpperCase()),
};
const FRENTE_ORDER = ["VAZAMENTO","CAVALETE","MANUTENÇÃO ESGOTO","LIGAÇÃO ÁGUA"];

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
async function fetchHistorico(){
  const res = await fetch(SUPABASE_URL+"/rest/v1/pendente_historico?select=dia,unidade,familia,no_prazo,fora_prazo,total&order=dia.asc",{headers:HEADERS});
  if(!res.ok) throw new Error("Erro historico "+res.status);
  return await res.json();
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
async function uploadRows(rows){
  const delRes = await fetch(SUPABASE_URL+"/rest/v1/rpc/limpar_pendente",{method:"POST",headers:{...HEADERS,"Prefer":"return=minimal"},body:"{}"});
  if(!delRes.ok) throw new Error("Erro ao limpar: "+await delRes.text());
  const bs=500;
  for(let i=0;i<rows.length;i+=bs){
    const batch=rows.slice(i,i+bs).map(r=>({dados:r}));
    const res=await fetch(SUPABASE_URL+"/rest/v1/pendente_os",{method:"POST",headers:{...HEADERS,"Prefer":"return=minimal"},body:JSON.stringify(batch)});
    if(!res.ok) throw new Error("Erro lote "+(Math.floor(i/bs)+1)+": "+await res.text());
  }
  const now=new Date().toISOString();
  await fetch(SUPABASE_URL+"/rest/v1/pendente_meta?id=eq.1",{method:"PATCH",headers:{...HEADERS,"Prefer":"return=minimal"},body:JSON.stringify({updated_at:now,total_rows:rows.length})});
  return{count:rows.length,updatedAt:now};
}

/* ── EM RUA API ── */
async function uploadEmRua(dia, records){
  // Limpar dia antes de importar
  await fetch(SUPABASE_URL+"/rest/v1/rpc/limpar_em_rua",{method:"POST",headers:{...HEADERS,"Prefer":"return=minimal"},body:JSON.stringify({p_dia:dia})});
  const bs=500;
  for(let i=0;i<records.length;i+=bs){
    const batch=records.slice(i,i+bs);
    const res=await fetch(SUPABASE_URL+"/rest/v1/em_rua",{method:"POST",headers:{...HEADERS,"Prefer":"return=minimal"},body:JSON.stringify(batch)});
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

/* ── Pill / Bar / SummaryCard / Check ── */
function Pill({value,color,bg,border,onClick,clickable}){
  return <span onClick={onClick} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:46,padding:"5px 14px",borderRadius:8,fontSize:15,fontWeight:700,fontVariantNumeric:"tabular-nums",color,background:bg,border:`1px solid ${border}`,cursor:clickable?"pointer":"default",transition:"transform 0.1s,box-shadow 0.15s"}}
    onMouseEnter={e=>{if(clickable){e.currentTarget.style.transform="scale(1.08)";e.currentTarget.style.boxShadow=`0 0 12px ${color}33`;}}}
    onMouseLeave={e=>{if(clickable){e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="none";}}}>{value}</span>;
}
function Bar({prazo,fora,total}){if(!total)return null;const pP=(prazo/total)*100,pF=(fora/total)*100;
  return <div style={{display:"flex",alignItems:"center",gap:10,width:"100%"}}><div style={{flex:1,height:8,borderRadius:4,background:C.border,overflow:"hidden",display:"flex"}}><div style={{width:`${pP}%`,background:`linear-gradient(90deg,${C.green},#34d399)`,transition:"width 0.5s"}}/><div style={{width:`${pF}%`,background:`linear-gradient(90deg,#f87171,${C.red})`,transition:"width 0.5s"}}/></div><span style={{fontSize:12,color:C.textDim,minWidth:36,textAlign:"right"}}>{pF.toFixed(0)}%</span></div>;
}
function SummaryCard({label,value,color,icon}){
  return <div style={{flex:1,minWidth:120,background:C.card,borderRadius:14,padding:"16px 18px",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:4}}>
    <span style={{fontSize:11,color:C.textDim,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</span>
    <div style={{display:"flex",alignItems:"baseline",gap:6}}><span style={{fontSize:28,fontWeight:800,color,fontVariantNumeric:"tabular-nums"}}>{value.toLocaleString("pt-BR")}</span><span style={{fontSize:15}}>{icon}</span></div>
  </div>;
}
function Check({checked,onChange}){
  return <div onClick={e=>{e.stopPropagation();onChange();}} style={{width:16,height:16,borderRadius:4,flexShrink:0,cursor:"pointer",border:checked?`2px solid ${C.accent}`:"2px solid #475569",background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.12s"}}>
    {checked&&<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div>;
}

/* ── OS Modal ── */
function OSModal({rows,familia,tssName,tipo,onClose}){
  const label=tipo==="prazo"?"No Prazo":"Fora do Prazo";const color=tipo==="prazo"?C.green:C.red;
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
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:"100%",maxWidth:1400,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontSize:16,fontWeight:700,color:C.text}}>{familia}</div><div style={{fontSize:13,color:C.textDim,marginTop:2}}>{tssName?tssName+" · ":""}<span style={{color}}>{label}</span> · {rows.length} OS</div></div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
            {cols.map(col=><th key={col.key} onClick={()=>toggleSort(col.key)} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:modalSort.col===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",cursor:"pointer",userSelect:"none"}}>{col.label}{modalSort.col===col.key?(modalSort.asc?" ↑":" ↓"):""}</th>)}
          </tr></thead>
          <tbody>{sorted.map((r,i)=>
            <tr key={i} style={{background:i%2?C.cardAlt:"transparent"}} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontVariantNumeric:"tabular-nums",fontWeight:600,color:C.accent}}>{r["Número OS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r["TSS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:600,color:C.textMuted}}>{r["SF"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{String(r["Endereço"]).trim()}, {r["Número"]}{r["Complemento"]?" - "+String(r["Complemento"]).trim():""}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Bairro"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Município"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:600,color:tempo(r["Tempo Residual"])==="fora"?C.red:C.green}}>{r["Tempo Residual"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Status da OS"]}</td>
            </tr>)}</tbody>
        </table>
      </div>
    </div>
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
        const setB = new Set(osB.map(r=>r.numero_os));
        let exited = osA.filter(r=>!setB.has(r.numero_os));
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

  return <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:16,overflow:"hidden"}}>
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
  const activeRows=rows.filter(r=>!excludedTSS.has(String(r["TSS"]||"").trim()));
  const tssGroups=useMemo(()=>{const m={};rows.forEach(r=>{const tss=String(r["TSS"]||"").trim();if(!m[tss])m[tss]={all:[],prazo:[],fora:[]};m[tss].all.push(r);const st=tempo(r["Tempo Residual"]);if(st)m[tss][st].push(r);});return Object.entries(m).sort(([a],[b])=>a.localeCompare(b)).map(([name,d])=>({name,...d}));},[rows]);
  const prazo=activeRows.filter(r=>tempo(r["Tempo Residual"])==="prazo").length;
  const fora=activeRows.filter(r=>tempo(r["Tempo Residual"])==="fora").length;
  const total=prazo+fora;const allNames=tssGroups.map(t=>t.name);
  const allOff=allNames.every(n=>excludedTSS.has(n));const someOff=allNames.some(n=>excludedTSS.has(n));const filterActive=someOff&&!allOff;
  const openModal=(tipo,tssName)=>{let f=activeRows;if(tssName)f=f.filter(r=>String(r["TSS"]).trim()===tssName);f=f.filter(r=>tempo(r["Tempo Residual"])===tipo).sort((a,b)=>tempoDays(a["Tempo Residual"])-tempoDays(b["Tempo Residual"]));if(f.length>0)setModal({rows:f,tipo,tssName});};
  if(total===0&&!expanded)return null;
  return <>
    <tr style={{background:idx%2===0?"transparent":C.cardAlt,cursor:"pointer"}} onClick={()=>setExpanded(!expanded)} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=idx%2===0?"transparent":C.cardAlt)}>
      <td style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}><div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:10,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
        <span style={{fontSize:14,fontWeight:700}}>{fam}</span>
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
        {tssGroups.map(t=>{const on=!excludedTSS.has(t.name);const tP=on?t.prazo.length:0,tF=on?t.fora.length:0;
          return <div key={t.name} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 6px",borderRadius:6,opacity:on?1:0.45,transition:"opacity 0.15s"}}
            onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.02)")} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
            <Check checked={on} onChange={()=>onToggleTSS(t.name)}/>
            <span style={{fontSize:13,color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
            <span style={{fontSize:12,color:C.textDim,marginRight:4}}>{t.all.length}</span>
            <Pill value={tP} color={C.green} bg={C.greenBg} border={C.greenBorder} clickable={on&&tP>0} onClick={e=>{e.stopPropagation();if(on&&tP>0)openModal("prazo",t.name);}}/>
            <Pill value={tF} color={C.red} bg={C.redBg} border={C.redBorder} clickable={on&&tF>0} onClick={e=>{e.stopPropagation();if(on&&tF>0)openModal("fora",t.name);}}/>
          </div>;})}
      </div>
    </td></tr>}
    {modal&&<OSModal rows={modal.rows} familia={fam} tssName={modal.tssName} tipo={modal.tipo} onClose={()=>setModal(null)}/>}
  </>;
}
const btnTiny={padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:600,border:`1px solid ${C.border}`,background:"transparent",color:C.textDim,cursor:"pointer"};

/* ── Sidebar ── */
function Sidebar({activeUnit,setActiveUnit,unitCounts,collapsed,setCollapsed}){
  return <div style={{width:collapsed?56:210,minWidth:collapsed?56:210,background:C.sidebar,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",transition:"width 0.25s ease,min-width 0.25s ease",overflow:"hidden",flexShrink:0}}>
    <div style={{padding:collapsed?"16px 0":"16px 16px",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"space-between",borderBottom:`1px solid ${C.border}`,minHeight:56}}>
      {!collapsed&&<span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>Unidades</span>}
      <button onClick={()=>setCollapsed(!collapsed)} style={{background:"transparent",border:"none",color:C.textDim,cursor:"pointer",fontSize:16,padding:4,display:"flex"}}>{collapsed?"▶":"◀"}</button>
    </div>
    <div style={{flex:1,padding:"8px 0"}}>
      {UNITS.map(u=>{const active=activeUnit===u.id;const counts=unitCounts[u.id]||{total:0,prazo:0,fora:0};
        return <div key={u.id} onClick={()=>setActiveUnit(u.id)} style={{padding:collapsed?"12px 0":"10px 16px",margin:collapsed?"2px 6px":"2px 8px",borderRadius:10,cursor:"pointer",background:active?C.sideActive:"transparent",borderLeft:active?`3px solid ${C.accent}`:"3px solid transparent",transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"flex-start",gap:10}}
          onMouseEnter={e=>{if(!active)e.currentTarget.style.background=C.sideHover;}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
          <span style={{fontSize:collapsed?20:17}}>{u.icon}</span>
          {!collapsed&&<div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:active?C.text:C.textMuted,whiteSpace:"nowrap"}}>{u.label}</div>
            <div style={{fontSize:11,color:C.textDim,marginTop:2,display:"flex",gap:8}}>
              <span style={{color:C.green}}>{counts.prazo}</span><span style={{color:C.red}}>{counts.fora}</span><span>({counts.total})</span>
            </div>
          </div>}
        </div>;})}
    </div>
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
    <div style={{background:C.card,borderRadius:10,padding:"12px 18px",marginBottom:16,border:`1px solid ${C.border}`}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:C.textDim}}>Distribuição — {unitLabel}</span>
        <span style={{fontSize:12,color:C.red,fontWeight:700}}>{total>0?((totalFora/total)*100).toFixed(1):0}% fora</span>
      </div>
      <Bar prazo={totalPrazo} fora={totalFora} total={total}/>
    </div>
    {historico&&historico.length>0&&<HistoricoChart historico={historico} activeUnit={activeUnit}/>}
    <div style={{fontSize:12,color:C.textDim,marginBottom:10,padding:"0 4px",display:"flex",gap:16,flexWrap:"wrap"}}>
      <span>▶ Clique na família para filtrar TSS</span>
      <span>🔢 Clique nos números para ver as OS</span>
    </div>
    <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
          <thead><tr style={{background:C.headerBg}}>
            {[{key:"name",label:"Família"},{key:"prazo",label:"No Prazo"},{key:"fora",label:"Fora do Prazo"},{key:"total",label:"Total"},{key:"pct",label:"Proporção"}].map(col=>
              <th key={col.key} onClick={()=>onSort(col.key)} style={{padding:"12px 16px",textAlign:col.key==="name"?"left":"center",fontSize:11,fontWeight:700,color:sortBy===col.key?C.accent:C.textDim,textTransform:"uppercase",letterSpacing:0.8,cursor:"pointer",userSelect:"none",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{col.label}{sortBy===col.key?" ↓":""}</th>
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

function normalizar(str){return(str||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();}
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
      if(EXCLUDED_DISPLAY.includes(familia)) return;
      if(EXCLUDED_TSS.includes(tss)) return;
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
function CarteiraView(){
  const today=new Date();
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const daysAgo=(n)=>{const d=new Date(today);d.setDate(d.getDate()-n);return fmt(d);};

  const [diaD1,setDiaD1]=useState(daysAgo(1));
  const [diaD2,setDiaD2]=useState(daysAgo(2));
  const [emRuaData,setEmRuaData]=useState([]);
  const [osD1,setOsD1]=useState([]);
  const [osD2,setOsD2]=useState([]);
  const [loadingCarteira,setLoadingCarteira]=useState(true);
  const [uploadingEmRua,setUploadingEmRua]=useState(false);
  const [emRuaToast,setEmRuaToast]=useState("");
  const [expandedFrente,setExpandedFrente]=useState(null);
  const emRuaInputRef=useRef();

  const flashEmRua=(msg)=>{setEmRuaToast(msg);setTimeout(()=>setEmRuaToast(""),4000);};

  // Load data
  useEffect(()=>{
    (async()=>{
      setLoadingCarteira(true);
      try{
        const [d2,d1,er]=await Promise.all([
          fetchDiarioOS(diaD2),
          fetchDiarioOS(diaD1),
          fetchEmRua(diaD1),
        ]);
        setOsD2(d2);setOsD1(d1);setEmRuaData(er);
      }catch(e){console.error("Erro carteira:",e);flashEmRua("Erro ao carregar dados: "+e.message);}
      setLoadingCarteira(false);
    })();
  },[diaD1,diaD2]);

  // Handle EM RUA file import
  const handleEmRuaFile=useCallback(async(file)=>{
    if(!file)return;
    setUploadingEmRua(true);
    try{
      flashEmRua("Processando EM RUA...");
      const{dia,records}=await parseEmRuaFile(file);
      flashEmRua(`Enviando ${records.length} registros (${fmtDiaFull(dia)})...`);
      const count=await uploadEmRua(dia,records);
      flashEmRua(`EM RUA importado ✓ (${count} registros, dia ${fmtDiaFull(dia)})`);
      // Reload em_rua for the current D-1
      const er=await fetchEmRua(diaD1);
      setEmRuaData(er);
    }catch(e){flashEmRua("Erro: "+e.message);}
    setUploadingEmRua(false);
  },[diaD1]);

  // Compute carteira data by frente/TSS
  const carteiraData=useMemo(()=>{
    const setD2=new Set(osD2.map(r=>r.numero_os));
    const setD1=new Set(osD1.map(r=>r.numero_os));

    // For each frente, compute metrics
    return FRENTE_ORDER.map(frenteName=>{
      const matchFn=FRENTES[frenteName];
      // Filter OS by frente
      const osD2Frente=osD2.filter(matchFn);
      const osD1Frente=osD1.filter(matchFn);
      const carteiraD2Count=osD2Frente.length;
      // Novas = OS in D-1 that were NOT in D-2
      const novas=osD1Frente.filter(r=>!setD2.has(r.numero_os)).length;
      // Executadas = OS in D-2 that are NOT in D-1
      const executadas=osD2Frente.filter(r=>!setD1.has(r.numero_os)).length;
      const carteiraD1Count=osD1Frente.length;

      // Equipes from em_rua matching this frente's TSS list
      const emRuaFrente=emRuaData.filter(r=>matchFn({familia:"",tss:r.tss||"",numero_os:r.numero_os}));
      const equipesSet=new Set(emRuaFrente.map(r=>r.equipe).filter(Boolean));
      const equipes=equipesSet.size;

      // OS em campo = OS from em_rua that match this frente
      const osEmCampo=emRuaFrente.length;
      const pctEmCampo=carteiraD1Count>0?((osEmCampo/carteiraD1Count)*100):0;

      // TSS breakdown (for ligação água)
      let tssBreakdown=null;
      if(frenteName==="LIGAÇÃO ÁGUA"){
        tssBreakdown=LIGACAO_AGUA_TSS.map(tssName=>{
          const tssUpper=tssName.toUpperCase();
          const d2Count=osD2.filter(r=>(r.tss||"").toUpperCase()===tssUpper).length;
          const d1Count=osD1.filter(r=>(r.tss||"").toUpperCase()===tssUpper).length;
          const tssNovas=osD1.filter(r=>(r.tss||"").toUpperCase()===tssUpper&&!setD2.has(r.numero_os)).length;
          const tssExec=osD2.filter(r=>(r.tss||"").toUpperCase()===tssUpper&&!setD1.has(r.numero_os)).length;
          const tssEmRua=emRuaData.filter(r=>(r.tss||"").toUpperCase()===tssUpper);
          const tssEquipes=new Set(tssEmRua.map(r=>r.equipe).filter(Boolean)).size;
          const tssOsCampo=tssEmRua.length;
          const tssPct=d1Count>0?((tssOsCampo/d1Count)*100):0;
          return{tss:tssName,carteiraD2:d2Count,novas:tssNovas,executadas:tssExec,carteiraD1:d1Count,equipes:tssEquipes,osCampo:tssOsCampo,pctCampo:tssPct};
        }).filter(t=>t.carteiraD2>0||t.carteiraD1>0||t.osCampo>0);
      }

      return{frente:frenteName,carteiraD2:carteiraD2Count,novas,executadas,carteiraD1:carteiraD1Count,equipes,osCampo:osEmCampo,pctCampo:pctEmCampo,tssBreakdown};
    });
  },[osD2,osD1,emRuaData]);

  // Totals
  const totals=useMemo(()=>carteiraData.reduce((acc,r)=>({
    carteiraD2:acc.carteiraD2+r.carteiraD2,novas:acc.novas+r.novas,executadas:acc.executadas+r.executadas,
    carteiraD1:acc.carteiraD1+r.carteiraD1,equipes:acc.equipes+r.equipes,osCampo:acc.osCampo+r.osCampo,
  }),{carteiraD2:0,novas:0,executadas:0,carteiraD1:0,equipes:0,osCampo:0}),[carteiraData]);
  const totalPct=totals.carteiraD1>0?((totals.osCampo/totals.carteiraD1)*100):0;

  const cellStyle={padding:"12px 14px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontVariantNumeric:"tabular-nums",fontSize:14};
  const hdrCell={padding:"10px 14px",textAlign:"center",fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"};

  return <div style={{animation:"fadeIn 0.35s ease"}}>
    {/* Toast */}
    {emRuaToast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"10px 24px",borderRadius:10,fontSize:13,fontWeight:600,maxWidth:"90vw",wordBreak:"break-word",background:emRuaToast.includes("Erro")?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)",color:emRuaToast.includes("Erro")?C.red:C.green,border:`1px solid ${emRuaToast.includes("Erro")?C.redBorder:C.greenBorder}`,backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease"}}>{emRuaToast}</div>}

    {/* Header com seleção de datas e importação */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap",gap:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:C.textDim,fontWeight:600}}>D-2:</span>
        <input type="date" value={diaD2} onChange={e=>setDiaD2(e.target.value)} style={dateInputStyle}/>
        <span style={{fontSize:12,color:C.textDim,fontWeight:600}}>D-1:</span>
        <input type="date" value={diaD1} onChange={e=>setDiaD1(e.target.value)} style={dateInputStyle}/>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:11,color:C.textDim}}>EM RUA: {emRuaData.length>0?<span style={{color:C.green,fontWeight:600}}>{emRuaData.length} OS</span>:<span style={{color:C.amber}}>não importado</span>}</span>
        <input ref={emRuaInputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{handleEmRuaFile(e.target.files[0]);e.target.value="";}}/>
        <button onClick={()=>emRuaInputRef.current?.click()} disabled={uploadingEmRua}
          style={{fontSize:12,color:"#fff",fontWeight:600,padding:"6px 16px",borderRadius:8,background:uploadingEmRua?"#475569":"linear-gradient(135deg,#3b82f6,#6366f1)",border:"none",cursor:uploadingEmRua?"wait":"pointer",display:"flex",alignItems:"center",gap:6}}>
          {uploadingEmRua?"Importando...":"📥 Importar EM RUA"}
        </button>
      </div>
    </div>

    {/* Summary cards */}
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <SummaryCard label={`Carteira ${fmtDiaShort(diaD2)}`} value={totals.carteiraD2} color={C.accent} icon="📋"/>
      <SummaryCard label="OS Novas" value={totals.novas} color={C.amber} icon="🆕"/>
      <SummaryCard label="Executadas" value={totals.executadas} color={C.green} icon="✅"/>
      <SummaryCard label={`Carteira ${fmtDiaShort(diaD1)}`} value={totals.carteiraD1} color={C.accent} icon="📊"/>
    </div>
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <SummaryCard label="Equipes" value={totals.equipes} color="#8b5cf6" icon="👷"/>
      <SummaryCard label="OS em Campo" value={totals.osCampo} color={C.green} icon="🚧"/>
      <div style={{flex:1,minWidth:120,background:C.card,borderRadius:14,padding:"16px 18px",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:4}}>
        <span style={{fontSize:11,color:C.textDim,letterSpacing:0.5,textTransform:"uppercase"}}>% em Campo</span>
        <div style={{display:"flex",alignItems:"baseline",gap:6}}>
          <span style={{fontSize:28,fontWeight:800,color:totalPct>=70?C.green:totalPct>=40?C.amber:C.red,fontVariantNumeric:"tabular-nums"}}>{totalPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>

    {loadingCarteira?<div style={{padding:40,textAlign:"center",color:C.textDim}}>Carregando dados da carteira...</div>:
    <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
          <thead><tr style={{background:C.headerBg}}>
            <th style={{...hdrCell,textAlign:"left",paddingLeft:16}}>Frente / TSS</th>
            <th style={hdrCell}>Cart. {fmtDiaShort(diaD2)}</th>
            <th style={hdrCell}>Novas</th>
            <th style={hdrCell}>Executadas</th>
            <th style={hdrCell}>Cart. {fmtDiaShort(diaD1)}</th>
            <th style={hdrCell}>Equipes</th>
            <th style={hdrCell}>OS Campo</th>
            <th style={hdrCell}>% Campo</th>
          </tr></thead>
          <tbody>
            {carteiraData.map((row,i)=>{
              const isLigAgua=row.frente==="LIGAÇÃO ÁGUA";
              const expanded=expandedFrente===row.frente;
              return <React.Fragment key={row.frente}>
                <tr style={{background:i%2?C.cardAlt:"transparent",cursor:isLigAgua?"pointer":"default"}}
                  onClick={()=>isLigAgua&&setExpandedFrente(expanded?null:row.frente)}
                  onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
                  <td style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontWeight:700,fontSize:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {isLigAgua&&<span style={{fontSize:10,color:C.textDim,transition:"transform 0.15s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>}
                      {row.frente}
                    </div>
                  </td>
                  <td style={cellStyle}>{row.carteiraD2}</td>
                  <td style={{...cellStyle,color:row.novas>0?C.amber:C.textDim,fontWeight:row.novas>0?700:400}}>{row.novas>0?"+"+row.novas:"0"}</td>
                  <td style={{...cellStyle,color:row.executadas>0?C.green:C.textDim,fontWeight:row.executadas>0?700:400}}>{row.executadas>0?"-"+row.executadas:"0"}</td>
                  <td style={{...cellStyle,fontWeight:700}}>{row.carteiraD1}</td>
                  <td style={{...cellStyle,color:"#8b5cf6",fontWeight:600}}>{row.equipes||"—"}</td>
                  <td style={{...cellStyle,color:C.green,fontWeight:600}}>{row.osCampo||"—"}</td>
                  <td style={cellStyle}>
                    <span style={{padding:"3px 10px",borderRadius:6,fontSize:12,fontWeight:700,
                      color:row.pctCampo>=70?C.green:row.pctCampo>=40?C.amber:C.red,
                      background:row.pctCampo>=70?C.greenBg:row.pctCampo>=40?C.amberBg:C.redBg,
                      border:`1px solid ${row.pctCampo>=70?C.greenBorder:row.pctCampo>=40?"rgba(245,158,11,0.25)":C.redBorder}`
                    }}>{row.pctCampo.toFixed(1)}%</span>
                  </td>
                </tr>
                {expanded&&row.tssBreakdown&&row.tssBreakdown.map((t,j)=>
                  <tr key={t.tss} style={{background:"rgba(15,23,42,0.5)"}}>
                    <td style={{padding:"8px 16px 8px 44px",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.textMuted}}>{t.tss}</td>
                    <td style={{...cellStyle,fontSize:12,color:C.textMuted}}>{t.carteiraD2}</td>
                    <td style={{...cellStyle,fontSize:12,color:t.novas>0?C.amber:C.textDim}}>{t.novas>0?"+"+t.novas:"0"}</td>
                    <td style={{...cellStyle,fontSize:12,color:t.executadas>0?C.green:C.textDim}}>{t.executadas>0?"-"+t.executadas:"0"}</td>
                    <td style={{...cellStyle,fontSize:12,fontWeight:600}}>{t.carteiraD1}</td>
                    <td style={{...cellStyle,fontSize:12,color:"#8b5cf6"}}>{t.equipes||"—"}</td>
                    <td style={{...cellStyle,fontSize:12,color:C.green}}>{t.osCampo||"—"}</td>
                    <td style={{...cellStyle,fontSize:12}}>
                      <span style={{padding:"2px 8px",borderRadius:5,fontSize:11,fontWeight:600,
                        color:t.pctCampo>=70?C.green:t.pctCampo>=40?C.amber:C.red,
                        background:t.pctCampo>=70?C.greenBg:t.pctCampo>=40?C.amberBg:C.redBg,
                      }}>{t.pctCampo.toFixed(1)}%</span>
                    </td>
                  </tr>
                )}
              </React.Fragment>;
            })}
            {/* Total row */}
            <tr style={{background:C.headerBg,fontWeight:800}}>
              <td style={{padding:"14px 16px",borderTop:`2px solid ${C.accent}`,fontSize:14}}>TOTAL</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800}}>{totals.carteiraD2}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.amber}}>{totals.novas>0?"+"+totals.novas:"0"}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.green}}>{totals.executadas>0?"-"+totals.executadas:"0"}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800}}>{totals.carteiraD1}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:"#8b5cf6"}}>{totals.equipes}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`,fontWeight:800,color:C.green}}>{totals.osCampo}</td>
              <td style={{...cellStyle,borderTop:`2px solid ${C.accent}`}}>
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
  const [activeTab,setActiveTab]=useState("pendente");
  const inputRef=useRef();

  const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),4000);};
  const saveFilters=useCallback((excSet,sort,unit)=>{saveLocal({excluded:[...excSet],sortBy:sort,activeUnit:unit});},[]);

  useEffect(()=>{(async()=>{
    const local=loadLocal();
    if(local){if(local.excluded?.length>0)setExcludedTSS(new Set(local.excluded));if(local.sortBy)setSortBy(local.sortBy);if(local.activeUnit)setActiveUnit(local.activeUnit);}
    let loaded=false;
    try{const data=await fetchRows();if(data.rows?.length>0){setRawRows(data.rows);setUpdatedAt(data.updatedAt);cacheRows(data.rows,data.updatedAt);loaded=true;}}catch(e){flash("Erro Supabase: "+e.message);}
    if(!loaded){const cached=loadCache();if(cached?.rows?.length>0){setRawRows(cached.rows);setUpdatedAt(cached.updatedAt);flash("Usando dados em cache");}}
    try{const hist=await fetchHistorico();if(hist?.length>0)setHistorico(hist);}catch(e){console.warn("Historico indisponivel:",e.message);}
    setLoading(false);
  })();},[]);

  const handleFile=useCallback(async(file)=>{
    if(!file)return;setUploading(true);
    try{flash("Processando arquivo...");const all=await parseFile(file);
      const filtered=all.map(sanitize).filter(r=>VALID_ATCS.includes(Number(r["ATC"]))&&!EXCLUDED_TSS.includes(String(r["TSS"]||"").trim()));
      setRawRows(filtered);setExcludedTSS(new Set());const now=new Date().toISOString();setUpdatedAt(now);
      cacheRows(filtered,now);saveFilters(new Set(),sortBy,activeUnit);
      flash("Enviando "+filtered.length+" OS...");const result=await uploadRows(filtered);
      setUpdatedAt(result.updatedAt);cacheRows(filtered,result.updatedAt);flash("Pendente atualizado ✓ ("+result.count+" OS)");
    }catch(e){flash("Erro: "+e.message);}setUploading(false);
  },[saveFilters,sortBy,activeUnit]);

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

  const currentUnit=UNITS.find(u=>u.id===activeUnit)||UNITS[0];
  const filteredRows=useMemo(()=>rawRows?rawRows.filter(r=>(currentUnit.atc===null?VALID_ATCS.includes(Number(r["ATC"])):Number(r["ATC"])===currentUnit.atc)&&!EXCLUDED_DISPLAY.includes(String(r["Família"]||"").trim())&&!EXCLUDED_TSS.includes(String(r["TSS"]||"").trim())):[],[rawRows,currentUnit]);
  const unitCounts=useMemo(()=>{
    if(!rawRows)return{};const out={};
    UNITS.forEach(u=>{const ur=rawRows.filter(r=>(u.atc===null?VALID_ATCS.includes(Number(r["ATC"])):Number(r["ATC"])===u.atc)&&!EXCLUDED_DISPLAY.includes(String(r["Família"]||"").trim())&&!EXCLUDED_TSS.includes(String(r["TSS"]||"").trim())&&!excludedTSS.has(String(r["TSS"]||"").trim()));
      const p=ur.filter(r=>tempo(r["Tempo Residual"])==="prazo").length;const f=ur.filter(r=>tempo(r["Tempo Residual"])==="fora").length;out[u.id]={total:p+f,prazo:p,fora:f};});
    return out;
  },[rawRows,excludedTSS]);

  const onDrop=useCallback(e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);},[handleFile]);

  // Gas alerts (usa rawRows sem filtro de unidade)
  const gas = useGasAlerts(rawRows);

  if(loading)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.textDim,fontFamily:"'Inter',sans-serif",flexDirection:"column",gap:12}}>
    <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <span>Carregando dados do Supabase…</span><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;

  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Inter',-apple-system,sans-serif",display:"flex"}}>
    {rawRows&&<Sidebar activeUnit={activeUnit} setActiveUnit={switchUnit} unitCounts={unitCounts} collapsed={sideCollapsed} setCollapsed={setSideCollapsed}/>}
    <div style={{flex:1,padding:"24px 16px",overflowY:"auto",minHeight:"100vh"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{marginBottom:24,textAlign:"center"}}>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:-0.5,background:"linear-gradient(135deg,#60a5fa,#3b82f6,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            {activeTab==="pendente"?"Controle de Prazos — OS Pendentes":"Acompanhamento de Carteira"}
          </h1>
          <p style={{color:C.textDim,margin:"6px 0 0",fontSize:13}}>
            {activeTab==="pendente"?"Análise por família de serviço":"Carteira diária por frente de serviço"}
          </p>
          {/* Tabs */}
          <div style={{display:"flex",justifyContent:"center",gap:4,marginTop:14}}>
            {[{id:"pendente",label:"Pendente",icon:"📋"},{id:"carteira",label:"Carteira",icon:"📊"}].map(tab=>
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{padding:"8px 24px",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",border:activeTab===tab.id?`1px solid rgba(59,130,246,0.4)`:`1px solid ${C.border}`,
                  background:activeTab===tab.id?C.accentBg:"transparent",color:activeTab===tab.id?C.accent:C.textMuted,transition:"all 0.15s",display:"flex",alignItems:"center",gap:6}}
                onMouseEnter={e=>{if(activeTab!==tab.id)e.currentTarget.style.background=C.rowHover;}}
                onMouseLeave={e=>{if(activeTab!==tab.id)e.currentTarget.style.background="transparent";}}>
                {tab.icon} {tab.label}
              </button>
            )}
          </div>
        </div>
        {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"10px 24px",borderRadius:10,fontSize:13,fontWeight:600,maxWidth:"90vw",wordBreak:"break-word",background:toast.includes("Erro")?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)",color:toast.includes("Erro")?C.red:C.green,border:`1px solid ${toast.includes("Erro")?C.redBorder:C.greenBorder}`,backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease"}}>{toast}</div>}
        {activeTab==="carteira"&&<CarteiraView/>}
        {activeTab==="pendente"&&!rawRows&&<div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
          onClick={()=>inputRef.current?.click()} style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:16,padding:"60px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentBg:C.card,transition:"all 0.2s"}}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{fontSize:40,marginBottom:12,opacity:0.7}}>📂</div>
          <p style={{fontSize:16,fontWeight:600,margin:0}}>Nenhum pendente no servidor</p>
          <p style={{fontSize:14,color:C.textDim,margin:"8px 0 0"}}>Importe o primeiro arquivo .xlsx</p>
        </div>}
        {activeTab==="pendente"&&rawRows&&<div style={{animation:"fadeIn 0.35s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:12,padding:"2px 10px",borderRadius:8,background:C.accentBg,color:C.accent,border:"1px solid rgba(59,130,246,0.2)",fontWeight:700}}>{currentUnit.icon} {currentUnit.label}</span>
              <span style={{fontSize:12,color:C.textDim}}>Atualizado: {fmtDate(updatedAt)}</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              {gas.alerts.length>0&&<button onClick={()=>setShowGasModal(true)}
                style={{fontSize:12,color:C.amber,cursor:"pointer",fontWeight:700,padding:"4px 14px",borderRadius:6,border:"1px solid rgba(245,158,11,0.4)",background:C.amberBg,display:"flex",alignItems:"center",gap:6,animation:"gasPulse 2s infinite"}}>
                🔥 Gás ({gas.alerts.length})
              </button>}
              <button onClick={refresh} style={{fontSize:12,color:C.accent,cursor:"pointer",fontWeight:600,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(59,130,246,0.3)",background:C.accentBg}}>↻ Atualizar</button>
            </div>
          </div>
          <Dashboard rows={filteredRows} excludedTSS={excludedTSS} sortBy={sortBy} onToggleTSS={toggleTSS} onToggleAll={toggleAllTSS} onSort={doSort} unitLabel={currentUnit.label} historico={historico} activeUnit={activeUnit}/>
        </div>}
        {activeTab==="pendente"&&showGasModal&&gas.alerts.length>0&&<GasAlertModal alerts={gas.alerts} onIgnore={gas.doIgnore} onClose={()=>setShowGasModal(false)}/>}
        <div style={{textAlign:"center",padding:"32px 16px 16px",color:C.textDim,fontSize:11,letterSpacing:0.3,opacity:0.6}}>Criado por Bryan Mendes Deodato, todos os direitos reservados</div>
      </div>
    </div>
    <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes modalIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}@keyframes gasPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0.3)}50%{box-shadow:0 0 12px 4px rgba(245,158,11,0.15)}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`}</style>
  </div>;
}