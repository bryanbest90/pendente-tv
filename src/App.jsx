import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

const EXCLUDED = ["VISTORIA","CORTE SUPRESSÃO ADM","FISCALIZAÇÃO","SERV COMPLEMENTAR","ABASTECIMENTO","DESOBSTRUÇÃO"];
const KEEP_COLS = ["Número OS","TSS","Família","Tempo Residual","Endereço","Número","Bairro","Município","Status da OS","ATO"];
const SKEY = "sabesp-data-v3";
const UNITS = [
  { id:"interlagos", label:"Interlagos", ato:32, icon:"🏙️" },
  { id:"embu", label:"Embu-Guaçu", ato:24, icon:"🌿" },
];

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
function persistData(obj){try{localStorage.setItem(SKEY,JSON.stringify(obj));return null;}catch(e){return e.message;}}
function restoreData(){try{const d=localStorage.getItem(SKEY);return d?JSON.parse(d):null;}catch{return null;}}

/* ── Helpers ── */
function slim(row){const o={};KEEP_COLS.forEach(c=>{let v=row[c];if(v==null)v="";else if(typeof v==="object")v=String(v);o[c]=v;});return o;}
function parseFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:"array",cellDates:false,raw:true});resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:"",raw:true}));}catch(err){reject(err);}};reader.onerror=reject;reader.readAsArrayBuffer(file);});}
function tempo(val){const s=String(val).trim();return !s?null:s.startsWith("-")?"fora":"prazo";}
function tempoDays(val){const m=String(val).match(/(-?\d+)d/);return m?parseInt(m[1]):0;}

/* ── Tiny Components ── */
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
function OSModal({rows,familia,tssName,tipo,onClose}){
  const label=tipo==="prazo"?"No Prazo":"Fora do Prazo";const color=tipo==="prazo"?C.green:C.red;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,border:`1px solid ${C.border}`,width:"100%",maxWidth:1400,maxHeight:"80vh",display:"flex",flexDirection:"column",overflow:"hidden",animation:"modalIn 0.2s ease"}}>
      <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div><div style={{fontSize:16,fontWeight:700,color:C.text}}>{familia}</div><div style={{fontSize:13,color:C.textDim,marginTop:2}}>{tssName?tssName+" · ":""}<span style={{color}}>{label}</span> · {rows.length} OS</div></div>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.textDim,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:C.headerBg,position:"sticky",top:0,zIndex:1}}>
            {["Nº OS","TSS","Endereço","Bairro","Município","Tempo Residual","Status"].map(h=>
              <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:C.textDim,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
            )}</tr></thead>
          <tbody>{rows.map((r,i)=>
            <tr key={i} style={{background:i%2?C.cardAlt:"transparent"}} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background=i%2?C.cardAlt:"transparent")}>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontVariantNumeric:"tabular-nums",fontWeight:600,color:C.accent}}>{r["Número OS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r["TSS"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{String(r["Endereço"]).trim()}, {r["Número"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Bairro"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Município"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontWeight:600,color:tempo(r["Tempo Residual"])==="fora"?C.red:C.green}}>{r["Tempo Residual"]}</td>
              <td style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`}}>{r["Status da OS"]}</td>
            </tr>
          )}</tbody>
        </table>
      </div>
    </div>
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
  return <div style={{
    width:collapsed?56:210,minWidth:collapsed?56:210,background:C.sidebar,
    borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",
    transition:"width 0.25s ease,min-width 0.25s ease",overflow:"hidden",flexShrink:0,
  }}>
    <div style={{padding:collapsed?"16px 0":"16px 16px",display:"flex",alignItems:"center",justifyContent:collapsed?"center":"space-between",borderBottom:`1px solid ${C.border}`,minHeight:56}}>
      {!collapsed&&<span style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>Unidades</span>}
      <button onClick={()=>setCollapsed(!collapsed)} style={{background:"transparent",border:"none",color:C.textDim,cursor:"pointer",fontSize:16,padding:4,display:"flex"}}>{collapsed?"▶":"◀"}</button>
    </div>
    <div style={{flex:1,padding:"8px 0"}}>
      {UNITS.map(u=>{
        const active=activeUnit===u.id;
        const counts=unitCounts[u.id]||{total:0,prazo:0,fora:0};
        return <div key={u.id} onClick={()=>setActiveUnit(u.id)}
          style={{
            padding:collapsed?"12px 0":"10px 16px",margin:collapsed?"2px 6px":"2px 8px",borderRadius:10,cursor:"pointer",
            background:active?C.sideActive:"transparent",
            borderLeft:active?`3px solid ${C.accent}`:"3px solid transparent",
            transition:"all 0.15s",display:"flex",alignItems:"center",
            justifyContent:collapsed?"center":"flex-start",gap:10,
          }}
          onMouseEnter={e=>{if(!active)e.currentTarget.style.background=C.sideHover;}}
          onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
          <span style={{fontSize:collapsed?20:17}}>{u.icon}</span>
          {!collapsed&&<div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:active?C.text:C.textMuted,whiteSpace:"nowrap"}}>{u.label}</div>
            <div style={{fontSize:11,color:C.textDim,marginTop:2,display:"flex",gap:8}}>
              <span style={{color:C.green}}>{counts.prazo}</span>
              <span style={{color:C.red}}>{counts.fora}</span>
              <span>({counts.total})</span>
            </div>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}

/* ── Dashboard Content ── */
function Dashboard({rows,excludedTSS,sortBy,onToggleTSS,onToggleAll,onSort,unitLabel}){
  const {familyMap,totalPrazo,totalFora,total}=useMemo(()=>{
    const fm={};let tp=0,tf=0;
    rows.forEach(r=>{const fam=String(r["Família"]||"").trim();if(!fam)return;if(!fm[fam])fm[fam]=[];fm[fam].push(r);
      if(!excludedTSS.has(String(r["TSS"]||"").trim())){const st=tempo(r["Tempo Residual"]);if(st==="prazo")tp++;else if(st==="fora")tf++;}});
    return{familyMap:fm,totalPrazo:tp,totalFora:tf,total:tp+tf};
  },[rows,excludedTSS]);

  const sortedFams=useMemo(()=>{
    return Object.entries(familyMap).map(([name,rs])=>{
      const active=rs.filter(r=>!excludedTSS.has(String(r["TSS"]||"").trim()));
      const p=active.filter(r=>tempo(r["Tempo Residual"])==="prazo").length,f=active.filter(r=>tempo(r["Tempo Residual"])==="fora").length;
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

/* ── Main ── */
export default function App(){
  const [rawRows,setRawRows]=useState(null);
  const [excludedTSS,setExcludedTSS]=useState(new Set());
  const [sortBy,setSortBy]=useState("fora");
  const [fileName,setFileName]=useState("");
  const [loading,setLoading]=useState(false);
  const [phase,setPhase]=useState("booting");
  const [toast,setToast]=useState("");
  const [dragOver,setDragOver]=useState(false);
  const [activeUnit,setActiveUnit]=useState("interlagos");
  const [sideCollapsed,setSideCollapsed]=useState(false);
  const inputRef=useRef();
  const stateRef=useRef({rawRows:null,excludedTSS:new Set(),sortBy:"fora",fileName:"",activeUnit:"interlagos"});

  const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),4000);};

  const saveState=useCallback((rows,excSet,sort,fname,unit)=>{
    const err=persistData({rows,excluded:[...excSet],sortBy:sort,fileName:fname,activeUnit:unit});
    if(err)flash("Erro: "+err);
  },[]);

  useEffect(()=>{
    const data=restoreData();
    if(data){
      if(data.rows?.length>0){setRawRows(data.rows);stateRef.current.rawRows=data.rows;}
      if(data.excluded?.length>0){const s=new Set(data.excluded);setExcludedTSS(s);stateRef.current.excludedTSS=s;}
      if(data.sortBy){setSortBy(data.sortBy);stateRef.current.sortBy=data.sortBy;}
      if(data.fileName){setFileName(data.fileName);stateRef.current.fileName=data.fileName;}
      if(data.activeUnit){setActiveUnit(data.activeUnit);stateRef.current.activeUnit=data.activeUnit;}
      flash("Dados restaurados ✓");
    }
    setPhase("ready");
  },[]);

  const handleFile=useCallback(async(file)=>{
    if(!file)return;setLoading(true);
    try{
      const all=await parseFile(file);
      const filtered=all.filter(r=>!EXCLUDED.includes(String(r["Família"]||"").trim())).map(slim);
      const newExc=new Set();
      setRawRows(filtered);setExcludedTSS(newExc);setFileName(file.name);
      stateRef.current={...stateRef.current,rawRows:filtered,excludedTSS:newExc,fileName:file.name};
      saveState(filtered,newExc,stateRef.current.sortBy,file.name,stateRef.current.activeUnit);
    }catch(e){flash("Erro ao ler: "+e.message);}
    setLoading(false);
  },[saveState]);

  const toggleTSS=useCallback(tss=>{setExcludedTSS(prev=>{const n=new Set(prev);n.has(tss)?n.delete(tss):n.add(tss);stateRef.current.excludedTSS=n;saveState(stateRef.current.rawRows,n,stateRef.current.sortBy,stateRef.current.fileName,stateRef.current.activeUnit);return n;});},[saveState]);
  const toggleAllTSS=useCallback((names,on)=>{setExcludedTSS(prev=>{const n=new Set(prev);names.forEach(nm=>on?n.delete(nm):n.add(nm));stateRef.current.excludedTSS=n;saveState(stateRef.current.rawRows,n,stateRef.current.sortBy,stateRef.current.fileName,stateRef.current.activeUnit);return n;});},[saveState]);
  const doSort=useCallback(key=>{setSortBy(key);stateRef.current.sortBy=key;saveState(stateRef.current.rawRows,stateRef.current.excludedTSS,key,stateRef.current.fileName,stateRef.current.activeUnit);},[saveState]);
  const switchUnit=useCallback(id=>{setActiveUnit(id);stateRef.current.activeUnit=id;saveState(stateRef.current.rawRows,stateRef.current.excludedTSS,stateRef.current.sortBy,stateRef.current.fileName,id);},[saveState]);

  const currentUnit=UNITS.find(u=>u.id===activeUnit)||UNITS[0];
  const filteredRows=useMemo(()=>rawRows?rawRows.filter(r=>Number(r["ATO"])===currentUnit.ato):[], [rawRows,currentUnit]);

  const unitCounts=useMemo(()=>{
    if(!rawRows)return{};
    const out={};
    UNITS.forEach(u=>{
      const ur=rawRows.filter(r=>Number(r["ATO"])===u.ato&&!excludedTSS.has(String(r["TSS"]||"").trim()));
      const p=ur.filter(r=>tempo(r["Tempo Residual"])==="prazo").length;
      const f=ur.filter(r=>tempo(r["Tempo Residual"])==="fora").length;
      out[u.id]={total:p+f,prazo:p,fora:f};
    });
    return out;
  },[rawRows,excludedTSS]);

  const onDrop=useCallback(e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);},[handleFile]);

  if(phase==="booting")return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",color:C.textDim,fontFamily:"'Inter',sans-serif"}}>Carregando…</div>;

  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Inter',-apple-system,sans-serif",display:"flex"}}>
    {rawRows&&<Sidebar activeUnit={activeUnit} setActiveUnit={switchUnit} unitCounts={unitCounts} collapsed={sideCollapsed} setCollapsed={setSideCollapsed}/>}

    <div style={{flex:1,padding:"24px 16px",overflowY:"auto",minHeight:"100vh"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{marginBottom:24,textAlign:"center"}}>
          <h1 style={{fontSize:22,fontWeight:800,margin:0,letterSpacing:-0.5,background:"linear-gradient(135deg,#60a5fa,#3b82f6,#818cf8)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Controle de Prazos — OS Pendentes</h1>
          <p style={{color:C.textDim,margin:"6px 0 0",fontSize:13}}>Análise por família de serviço</p>
        </div>

        {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:2000,padding:"10px 24px",borderRadius:10,fontSize:13,fontWeight:600,maxWidth:"90vw",wordBreak:"break-word",background:toast.includes("Erro")?"rgba(239,68,68,0.15)":"rgba(16,185,129,0.15)",color:toast.includes("Erro")?C.red:C.green,border:`1px solid ${toast.includes("Erro")?C.redBorder:C.greenBorder}`,backdropFilter:"blur(8px)",animation:"fadeIn 0.2s ease"}}>{toast}</div>}

        {!rawRows&&<div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop}
          onClick={()=>inputRef.current?.click()}
          style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:16,padding:"60px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentBg:C.card,transition:"all 0.2s"}}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{fontSize:40,marginBottom:12,opacity:0.7}}>📂</div>
          {loading?<p style={{color:C.accent,fontSize:16,fontWeight:600,margin:0}}>Processando…</p>
            :<><p style={{fontSize:16,fontWeight:600,margin:0}}>Arraste o arquivo .xlsx aqui</p><p style={{fontSize:14,color:C.textDim,margin:"8px 0 0"}}>ou clique para selecionar</p></>}
        </div>}

        {rawRows&&<div style={{animation:"fadeIn 0.35s ease"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`,marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>📄</span>
              <span style={{fontSize:13,color:C.textMuted,fontWeight:600}}>{fileName}</span>
              <span style={{fontSize:12,padding:"2px 10px",borderRadius:8,background:C.accentBg,color:C.accent,border:"1px solid rgba(59,130,246,0.2)",fontWeight:700}}>{currentUnit.icon} {currentUnit.label}</span>
            </div>
            <label style={{fontSize:12,color:C.accent,cursor:"pointer",fontWeight:600,padding:"4px 12px",borderRadius:6,border:"1px solid rgba(59,130,246,0.3)",background:C.accentBg}}>
              Trocar arquivo<input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            </label>
          </div>
          <Dashboard rows={filteredRows} excludedTSS={excludedTSS} sortBy={sortBy} onToggleTSS={toggleTSS} onToggleAll={toggleAllTSS} onSort={doSort} unitLabel={currentUnit.label}/>
        </div>}
      </div>
    </div>

    <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes modalIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}`}</style>
  </div>;
}
