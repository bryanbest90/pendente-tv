/* ══════════════════════════════════════════════════════════
   RELATÓRIO DE PRODUÇÃO EM EXCEL

   Por que um arquivo separado: o App.jsx já tem 6 mil linhas, e isto
   aqui é uma ilha — não usa React, não toca em estado, recebe números
   prontos e devolve um Blob. Separado, dá para mexer no layout do
   relatório sem abrir o arquivo da tela.

   POR QUE EXCELJS E NÃO O XLSX QUE O PROJETO JÁ USA
   O xlsx (SheetJS) na versão aberta não escreve formatação: ele grava
   valor e fórmula, e ignora cor, fonte, borda e largura de coluna. Dá
   para gerar a planilha, mas ela sai exatamente com a cara de um CSV
   aberto no Excel — que é justamente o que não se quer aqui. Estilo é
   recurso da versão paga.

   O exceljs escreve estilo, congela painel, põe filtro, formata número
   e configura impressão. O preço é o tamanho: ~940 KB. Por isso ele
   entra com import() DINÂMICO, dentro da função — só é baixado quando
   alguém clica em "Excel". Quem nunca exporta não paga nada por ele, e
   o bundle da tela não engordou.

   O xlsx continua onde está: ele lê o pendente na importação, e para
   LER ele é melhor (menor e mais rápido). Cada um no que serve.
   ══════════════════════════════════════════════════════════ */

/* Paleta clara, não a da tela. O dashboard é escuro porque vive numa
   TV na parede; o relatório vive em anexo de e-mail e em papel, onde
   fundo escuro queima tinta e fica ilegível impresso. As cores de
   destaque são as mesmas do site, só que sobre branco. */
const TINTA   = "FF0F172A";   // cabeçalho
const FAIXA   = "FFF8FAFC";   // listra da linha par
const BORDA   = "FFE2E8F0";
const AZUL    = "FF3B82F6";
const ROXO    = "FF8B5CF6";   // equipes, como no site
const VERDE   = "FF10B981";
const CINZA   = "FF64748B";
const TITULO  = "FF1E293B";

const borda1 = {
  top:   {style:"thin",color:{argb:BORDA}},
  left:  {style:"thin",color:{argb:BORDA}},
  bottom:{style:"thin",color:{argb:BORDA}},
  right: {style:"thin",color:{argb:BORDA}},
};

const DIA_SEMANA = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];

function dataBR(iso){
  if(!iso) return "";
  const [a,m,d] = String(iso).slice(0,10).split("-");
  return `${d}/${m}/${a}`;
}
/* Date local, não UTC: new Date("2026-10-04") nasce meia-noite UTC e,
   no fuso de São Paulo, volta um dia. O relatório diria sábado onde o
   site diz domingo. */
function diaDaSemana(iso){
  const [a,m,d] = String(iso).slice(0,10).split("-").map(Number);
  return DIA_SEMANA[new Date(a, m-1, d).getDay()];
}

/* Cabeçalho de tabela: faixa escura, texto branco, painel congelado e
   filtro. Sempre na linha 1 para o congelamento e o autofiltro caírem
   no lugar certo em todas as abas. */
function montarCabecalho(ws, colunas){
  ws.columns = colunas.map(c=>({key:c.key, width:c.width}));
  const h = ws.getRow(1);
  colunas.forEach((c,i)=>{
    const cell = h.getCell(i+1);
    cell.value = c.header;
    cell.font = {bold:true, size:11, color:{argb:"FFFFFFFF"}, name:"Calibri"};
    cell.fill = {type:"pattern", pattern:"solid", fgColor:{argb:TINTA}};
    cell.alignment = {vertical:"middle", horizontal:c.align||"left"};
    cell.border = borda1;
  });
  h.height = 24;
  ws.views = [{state:"frozen", ySplit:1}];
}

/* Filtro sobre a tabela INTEIRA, chamado depois das linhas entrarem.
   Preso só ao cabeçalho, como estava, o Excel abre com a setinha mas
   não filtra nada — parece quebrado. */
function aplicarFiltro(ws, nCols, ultimaLinha){
  if(ultimaLinha < 2) return;
  ws.autoFilter = {from:{row:1,column:1}, to:{row:ultimaLinha,column:nCols}};
}

/* Listra + borda + formato. Feito aqui, numa passada só, em vez de a
   cada addRow: assim o estilo da tabela mora num lugar e não espalhado
   por quatro abas. */
function vestirCorpo(ws, colunas, primeiraLinha, ultimaLinha){
  for(let r=primeiraLinha; r<=ultimaLinha; r++){
    const row = ws.getRow(r);
    row.height = 18;
    colunas.forEach((c,i)=>{
      const cell = row.getCell(i+1);
      cell.border = borda1;
      cell.alignment = {vertical:"middle", horizontal:c.align||"left"};
      cell.font = {size:11, name:"Calibri", color:{argb:c.cor||TITULO}, bold:!!c.negrito};
      if(c.formato) cell.numFmt = c.formato;
      if((r-primeiraLinha)%2===1)
        cell.fill = {type:"pattern", pattern:"solid", fgColor:{argb:FAIXA}};
    });
  }
}

function linhaTotal(ws, colunas, valores){
  const row = ws.addRow(valores);
  row.height = 22;
  colunas.forEach((c,i)=>{
    const cell = row.getCell(i+1);
    cell.font = {bold:true, size:11, name:"Calibri", color:{argb:TINTA}};
    cell.alignment = {vertical:"middle", horizontal:c.align||"left"};
    cell.border = {...borda1, top:{style:"medium", color:{argb:TINTA}}};
    if(c.formato) cell.numFmt = c.formato;
  });
  return row;
}

/* Barra dentro da célula, igual à do site. É formatação condicional do
   próprio Excel (dataBar): continua funcionando se ele reordenar ou
   filtrar, coisa que uma barra desenhada com caractere não faria. */
function barraNaColuna(ws, ref, corArgb){
  ws.addConditionalFormatting({
    ref,
    rules:[{
      type:"dataBar",
      cfvo:[{type:"num",value:0},{type:"max"}],
      color:{argb:corArgb},
      showValue:true,
      gradient:false,
    }],
  });
}

function configurarImpressao(ws, paisagem){
  ws.pageSetup = {
    paperSize:9,                     // A4
    orientation: paisagem?"landscape":"portrait",
    fitToPage:true, fitToWidth:1, fitToHeight:0,
    margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.2,footer:0.2},
  };
  ws.headerFooter = {oddFooter:"&L&\"Calibri\"&9&K64748B Pendente-TV&C&9Página &P de &N"};
  ws.pageSetup.printTitlesRow = "1:1";   // cabeçalho repete em toda folha
}

/**
 * Monta o relatório e devolve um Blob pronto para download.
 *
 * Recebe `ag` já agregado pela tela, de propósito: o que sai no Excel é
 * exatamente o que está na tela, pelos mesmos filtros, sem uma segunda
 * conta que pudesse discordar da primeira.
 */
export async function gerarRelatorioProducao({ag, modo, ini, fim, unidadeLabel, usuario}){
  const {default:ExcelJS} = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pendente-TV";
  wb.created = new Date();

  const rotulo = modo==="tss" ? "TSS" : "TSE";
  const descModo = modo==="tss" ? "TSS — serviço solicitado na abertura da OS"
                                : "TSE — serviço que a equipe executou";

  /* Os tipos saem das equipes, e não de ag.tipos, porque aquele campo
     obedece à equipe selecionada na tela. O relatório é do período
     inteiro: seleção de uma equipe não pode encolher o arquivo sem que
     ninguém perceba depois, com ele já no e-mail de alguém. */
  const tiposGerais = new Map();
  ag.equipes.forEach(e=>e.tipos.forEach((q,tp)=>tiposGerais.set(tp,(tiposGerais.get(tp)||0)+q)));
  const listaTipos = [...tiposGerais.entries()]
    .map(([tipo,qtd])=>({tipo,qtd}))
    .sort((a,b)=>b.qtd-a.qtd||a.tipo.localeCompare(b.tipo));

  const nDias = ag.dias.length;
  const total = ag.total;
  const pct = q => total>0 ? q/total : 0;

  /* ─────────────── 1. Resumo ─────────────── */
  const rs = wb.addWorksheet("Resumo", {properties:{tabColor:{argb:AZUL}}});
  rs.columns = [{width:26},{width:22},{width:22},{width:22},{width:20}];

  rs.mergeCells("A1:E1");
  const t1 = rs.getCell("A1");
  t1.value = "PRODUÇÃO POR EQUIPES";
  t1.font = {bold:true, size:18, color:{argb:"FFFFFFFF"}, name:"Calibri"};
  t1.fill = {type:"pattern", pattern:"solid", fgColor:{argb:TINTA}};
  t1.alignment = {vertical:"middle", horizontal:"left", indent:1};
  rs.getRow(1).height = 38;

  rs.mergeCells("A2:E2");
  const t2 = rs.getCell("A2");
  t2.value = `${dataBR(ini)} a ${dataBR(fim)}  ·  ${unidadeLabel}  ·  ${rotulo}`;
  t2.font = {size:11, color:{argb:"FFFFFFFF"}, name:"Calibri"};
  t2.fill = {type:"pattern", pattern:"solid", fgColor:{argb:AZUL}};
  t2.alignment = {vertical:"middle", horizontal:"left", indent:1};
  rs.getRow(2).height = 22;

  // KPIs — rótulo em cima, número embaixo, uma coluna cada
  const kpis = [
    ["Execuções",            total,                              VERDE],
    ["Equipes",              ag.equipes.length,                  ROXO],
    [`Tipos de ${rotulo}`,   listaTipos.length,                  AZUL],
    ["Média por dia",        nDias?Math.round(total/nDias):0,    "FFF59E0B"],
    ["Dias com execução",    nDias,                              CINZA],
  ];
  kpis.forEach(([rot,,cor],i)=>{
    const c = rs.getRow(4).getCell(i+1);
    c.value = rot.toUpperCase();
    c.font = {bold:true, size:9, color:{argb:CINZA}, name:"Calibri"};
    c.alignment = {horizontal:"center"};
  });
  kpis.forEach(([,val,cor],i)=>{
    const c = rs.getRow(5).getCell(i+1);
    c.value = val;
    c.numFmt = "#,##0";
    c.font = {bold:true, size:24, color:{argb:cor}, name:"Calibri"};
    c.alignment = {horizontal:"center", vertical:"middle"};
    c.border = {bottom:{style:"medium", color:{argb:cor}}};
  });
  rs.getRow(4).height = 16;
  rs.getRow(5).height = 34;

  const ficha = [
    ["Período",        `${dataBR(ini)} a ${dataBR(fim)}`],
    ["Unidade",        unidadeLabel],
    ["Tipo de serviço", descModo],
    ["Gerado em",      new Date().toLocaleString("pt-BR")],
    ["Gerado por",     usuario||"—"],
  ];
  ficha.forEach(([k,v],i)=>{
    const r = rs.getRow(7+i);
    r.getCell(1).value = k;
    r.getCell(1).font = {bold:true, size:10, color:{argb:CINZA}, name:"Calibri"};
    rs.mergeCells(7+i, 2, 7+i, 5);
    r.getCell(2).value = v;
    r.getCell(2).font = {size:10, color:{argb:TITULO}, name:"Calibri"};
    r.height = 17;
  });

  rs.mergeCells("A13:E15");
  const nota = rs.getCell("A13");
  nota.value = "Contagem de execuções confirmadas (Relatório de Dados Operacionais), não de OS distintas: "
             + "uma OS que gera duas etapas conta duas vezes, que é como a equipe é medida. "
             + "TSS é o serviço solicitado na abertura da OS; TSE é o que foi executado. "
             + "Eles divergem na maioria das linhas.";
  nota.font = {size:9.5, color:{argb:CINZA}, name:"Calibri", italic:true};
  nota.alignment = {wrapText:true, vertical:"top"};
  configurarImpressao(rs, false);

  /* ─────────────── 2. Equipes ─────────────── */
  const colEq = [
    {header:"Equipe",      key:"equipe", width:42},
    {header:"Execuções",   key:"qtd",    width:16, align:"right",  formato:"#,##0", negrito:true},
    {header:"% do total",  key:"pct",    width:12, align:"center", formato:"0.0%"},
    {header:`Tipos de ${rotulo}`, key:"n", width:14, align:"center", formato:"#,##0", cor:CINZA},
  ];
  const we = wb.addWorksheet("Equipes", {properties:{tabColor:{argb:ROXO}}});
  montarCabecalho(we, colEq);
  ag.equipes.forEach(e=>we.addRow({equipe:e.equipe, qtd:e.total, pct:pct(e.total), n:e.tipos.size}));
  vestirCorpo(we, colEq, 2, we.rowCount);
  aplicarFiltro(we, colEq.length, we.rowCount);
  if(ag.equipes.length) barraNaColuna(we, `B2:B${we.rowCount}`, ROXO);
  linhaTotal(we, colEq, {equipe:"TOTAL", qtd:total, pct:total?1:0, n:listaTipos.length});
  configurarImpressao(we, false);

  /* ─────────────── 3. Serviços ─────────────── */
  const colTp = [
    {header:rotulo,       key:"tipo", width:52},
    {header:"Execuções",  key:"qtd",  width:16, align:"right",  formato:"#,##0", negrito:true},
    {header:"% do total", key:"pct",  width:12, align:"center", formato:"0.0%"},
  ];
  const wt = wb.addWorksheet(rotulo, {properties:{tabColor:{argb:AZUL}}});
  montarCabecalho(wt, colTp);
  listaTipos.forEach(t=>wt.addRow({tipo:t.tipo, qtd:t.qtd, pct:pct(t.qtd)}));
  vestirCorpo(wt, colTp, 2, wt.rowCount);
  aplicarFiltro(wt, colTp.length, wt.rowCount);
  if(listaTipos.length) barraNaColuna(wt, `B2:B${wt.rowCount}`, AZUL);
  linhaTotal(wt, colTp, {tipo:"TOTAL", qtd:total, pct:total?1:0});
  configurarImpressao(wt, false);

  /* ─────────────── 4. Equipe × Serviço ─────────────── */
  /* O detalhe. É o que o CSV trazia, e continua aqui porque é com esta
     aba que se faz tabela dinâmica — por isso ela vai crua, uma linha
     por par, sem subtotal no meio que atrapalharia o agrupamento. */
  const colDet = [
    {header:"Equipe",          key:"equipe", width:42},
    {header:rotulo,            key:"tipo",   width:52},
    {header:"Execuções",       key:"qtd",    width:13, align:"center", formato:"#,##0", negrito:true},
    {header:"% da equipe",     key:"pct",    width:13, align:"center", formato:"0.0%", cor:CINZA},
  ];
  const wd = wb.addWorksheet(`Equipe x ${rotulo}`, {properties:{tabColor:{argb:VERDE}}});
  montarCabecalho(wd, colDet);
  ag.equipes.forEach(e=>{
    [...e.tipos.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
      .forEach(([tp,q])=>wd.addRow({equipe:e.equipe, tipo:tp, qtd:q, pct:e.total?q/e.total:0}));
  });
  vestirCorpo(wd, colDet, 2, wd.rowCount);
  aplicarFiltro(wd, colDet.length, wd.rowCount);
  configurarImpressao(wd, true);

  /* ─────────────── 5. Por dia ─────────────── */
  const colDia = [
    {header:"Data",         key:"data", width:14, align:"center"},
    {header:"Dia",          key:"sem",  width:14, cor:CINZA},
    {header:"Execuções",    key:"qtd",  width:16, align:"right",  formato:"#,##0", negrito:true},
    {header:"% do total",   key:"pct",  width:12, align:"center", formato:"0.0%"},
  ];
  const wdia = wb.addWorksheet("Por dia", {properties:{tabColor:{argb:"FFF59E0B"}}});
  montarCabecalho(wdia, colDia);
  ag.dias.forEach(d=>wdia.addRow({data:dataBR(d.dia), sem:diaDaSemana(d.dia), qtd:d.qtd, pct:pct(d.qtd)}));
  vestirCorpo(wdia, colDia, 2, wdia.rowCount);
  aplicarFiltro(wdia, colDia.length, wdia.rowCount);
  if(nDias) barraNaColuna(wdia, `C2:C${wdia.rowCount}`, "FFF59E0B");
  linhaTotal(wdia, colDia, {data:"TOTAL", sem:`${nDias} dias`, qtd:total, pct:total?1:0});
  configurarImpressao(wdia, false);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
