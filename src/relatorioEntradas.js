/* ══════════════════════════════════════════════════════════
   PLANILHA DE ENTRADAS — quem entrou, serviço por serviço

   POR QUE ELA EXISTE
   A aba Pendente mostra quantos serviços nasceram no dia, e o gráfico
   mostra os dias anteriores. Em 26/11/2026 o Bryan foi questionado se
   esse número é verdadeiro, e não tinha como mostrar. Número que
   ninguém consegue conferir não sustenta discussão — é a mesma regra
   da barra "sumiram" na Produção, que é clicável justamente por isso.

   A planilha não recalcula nada. Ela recebe as MESMAS linhas que a
   tela recebe, da mesma busca (`fetchEntradasDoPeriodo`), e só
   formata. Uma segunda conta aqui poderia discordar da primeira, e aí
   teríamos dois números para defender em vez de um.

   A COLUNA ORIGEM É O CORAÇÃO DISTO
   A os_entrada guarda como cada linha foi datada:
     pendente → a Data Inserção que veio do GEOCALL, exata
     foto     → o primeiro dia em que a OS apareceu no retrato diário
   A segunda é aproximada, e só existe no histórico que o pendente não
   alcança. Esconder isso faria a planilha defender um número fingindo
   precisão que ele não tem em toda linha. Ela sai escrita por extenso
   e contada à parte no resumo.

   Separado do App.jsx pelo mesmo motivo do relatorioProducao.js: isto
   é uma ilha — não usa React, não toca em estado, recebe linhas
   prontas e devolve um Blob. E o exceljs (~940 KB) entra por import()
   dinâmico, só quando alguém clica.
   ══════════════════════════════════════════════════════════ */

/* O estilo (cabeçalho, listra, borda, filtro, data) mora no
   planilhaEstilo.js, partilhado com as outras planilhas da aba
   Pendente — era aqui que ele estava, e a terceira planilha ia virar
   a terceira cópia. */
import {TINTA, AZUL, AMBAR, borda1, dataBR, montarCabecalho, vestirCorpo} from "./planilhaEstilo.js";

/* Exata / Aproximada em vez de pendente / foto. Quem abre a planilha
   não tem como saber o que "foto" quer dizer, e a palavra sozinha
   sugere que há uma fotografia envolvida — não há. */
function origemPorExtenso(o){
  return String(o||"").trim()==="foto" ? "Aproximada" : "Exata";
}

/**
 * @param linhas  as linhas da os_entrada, como a tela recebeu
 * @param ini/fim o período pedido, em ISO
 * @param familiaLabel  "Todas as famílias" ou o nome de uma
 * @param unidadeLabel  a unidade da lateral, por extenso
 * @param usuario       quem gerou — a planilha costuma virar anexo
 */
export async function gerarPlanilhaEntradas({linhas, ini, fim, familiaLabel, unidadeLabel, usuario}){
  const {default:ExcelJS} = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pendente-TV";
  wb.created = new Date();

  const dados = [...(linhas||[])].sort((a,b)=>
    String(a.data_insercao||"").localeCompare(String(b.data_insercao||""))
    || String(a.numero_os||"").localeCompare(String(b.numero_os||""))
    || String(a.tss||"").localeCompare(String(b.tss||"")));

  const aproximadas = dados.filter(l=>String(l.origem||"").trim()==="foto").length;

  /* ─────────────── 1. Resumo ─────────────── */
  const rs = wb.addWorksheet("Resumo", {properties:{tabColor:{argb:AZUL}}});
  rs.columns = [{width:34},{width:30},{width:16},{width:16}];

  const titulo = rs.getCell("A1");
  titulo.value = "ENTRADAS — serviços solicitados";
  titulo.font = {bold:true, size:16, color:{argb:TINTA}, name:"Calibri"};
  rs.mergeCells("A1:D1");
  rs.getRow(1).height = 28;

  const linhasCabeca = [
    ["Período",  ini===fim ? dataBR(ini) : `${dataBR(ini)} a ${dataBR(fim)}`],
    ["Unidade",  unidadeLabel||""],
    ["Família",  familiaLabel||"Todas as famílias"],
    ["Total de serviços", dados.length],
    ["…destes, com data aproximada", aproximadas],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
    ["Gerado por", usuario||""],
  ];
  linhasCabeca.forEach(([r,v],i)=>{
    const row = rs.getRow(3+i);
    row.getCell(1).value = r;
    row.getCell(1).font = {bold:true, size:11, color:{argb:TINTA}, name:"Calibri"};
    row.getCell(2).value = v;
    row.getCell(2).font = {size:11, name:"Calibri"};
    row.height = 20;
  });

  /* O aviso da origem fica no RESUMO, não numa nota de rodapé: esta
     planilha nasce para ser mostrada a quem duvidou do número, e a
     ressalva tem de estar onde a pessoa olha primeiro. */
  const aviso = rs.getCell("A12");
  aviso.value = aproximadas > 0
    ? `Atenção: ${aproximadas} de ${dados.length} linhas têm data APROXIMADA. `
      + "Nessas, a Data Inserção do GEOCALL não existia e usou-se o primeiro dia "
      + "em que a OS apareceu no retrato diário da carteira. A coluna Origem, na "
      + "aba Serviços, diz linha a linha qual é qual."
    : "Todas as linhas têm data EXATA, vinda da Data Inserção do GEOCALL.";
  aviso.font = {size:10, italic:true, color:{argb: aproximadas>0 ? "FF92400E" : TINTA}, name:"Calibri"};
  aviso.alignment = {wrapText:true, vertical:"top"};
  rs.mergeCells("A12:D15");
  if(aproximadas>0){
    rs.getCell("A12").fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFFEF3C7"}};
  }

  /* ─────────────── 2. Por dia e família ─────────────── */
  const colResumo = [
    {key:"dia",     header:"Data",        width:14},
    {key:"familia", header:"Família",     width:34},
    {key:"qtd",     header:"Serviços",    width:12, align:"right", numero:true},
    {key:"aprox",   header:"Aproximadas", width:14, align:"right", numero:true},
  ];
  const wd = wb.addWorksheet("Por dia e família", {properties:{tabColor:{argb:AMBAR}}});
  montarCabecalho(wd, colResumo);

  const porChave = new Map();
  for(const l of dados){
    const k = `${l.data_insercao||""}|${String(l.familia||"(sem família)").trim()}`;
    const o = porChave.get(k) || {dia:l.data_insercao||"", familia:String(l.familia||"(sem família)").trim(), qtd:0, aprox:0};
    o.qtd++;
    if(String(l.origem||"").trim()==="foto") o.aprox++;
    porChave.set(k,o);
  }
  const resumoLinhas = [...porChave.values()].sort((a,b)=>
    a.dia.localeCompare(b.dia) || a.familia.localeCompare(b.familia));
  resumoLinhas.forEach(o=>wd.addRow({dia:dataBR(o.dia), familia:o.familia, qtd:o.qtd, aprox:o.aprox}));
  if(resumoLinhas.length){
    const tot = wd.addRow({dia:"TOTAL", familia:"", qtd:dados.length, aprox:aproximadas});
    tot.font = {bold:true, size:11, name:"Calibri"};
  }
  vestirCorpo(wd, colResumo, 2, wd.rowCount);

  /* ─────────────── 3. Serviços ─────────────── */
  const colServ = [
    {key:"dia",      header:"Data de entrada", width:16},
    {key:"os",       header:"OS",              width:16},
    {key:"tss",      header:"Serviço (TSS)",   width:42},
    {key:"familia",  header:"Família",         width:30},
    {key:"atc",      header:"ATC",             width:9, align:"center"},
    {key:"unidade",  header:"Unidade",         width:16},
    {key:"endereco", header:"Endereço",        width:44},
    {key:"bairro",   header:"Bairro",          width:24},
    {key:"origem",   header:"Origem da data",  width:16, align:"center"},
  ];
  const ws = wb.addWorksheet("Serviços", {properties:{tabColor:{argb:AZUL}}});
  montarCabecalho(ws, colServ);
  dados.forEach(l=>ws.addRow({
    dia: dataBR(l.data_insercao),
    os: String(l.numero_os||""),
    tss: String(l.tss||""),
    familia: String(l.familia||""),
    atc: l.atc ?? "",
    unidade: String(l.unidade||""),
    endereco: String(l.endereco||""),
    bairro: String(l.bairro||""),
    origem: origemPorExtenso(l.origem),
  }));
  vestirCorpo(ws, colServ, 2, ws.rowCount);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
