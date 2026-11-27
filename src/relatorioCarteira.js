/* ══════════════════════════════════════════════════════════
   PLANILHA DA CARTEIRA — os serviços abertos de uma família

   POR QUE ELA EXISTE
   Os modais de prazo mostram a lista na tela e param aí. Quem é
   questionado sobre o número precisa MANDAR a lista — para a Sabesp,
   para o gerente, para a equipe que vai à rua. É a mesma razão da
   planilha de Entradas: número que ninguém consegue conferir não
   sustenta discussão. *(Bryan, 27/11/2026)*

   ELA NÃO RECALCULA NADA. Recebe as MESMAS linhas que o modal está
   exibindo, já filtradas e já ordenadas por quem está vencendo
   primeiro. Refazer a conta aqui daria dois números para defender em
   vez de um — e o prazo deste projeto tem regra própria (o do
   CONTRATO, não o do GEOCALL), que mora no App.jsx e não deve ser
   reescrita em lugar nenhum.

   A COLUNA "PRAZO DO GEOCALL" vai junto de propósito. O `Tempo
   Residual` que a tela mostra é o do contrato, reescrito em cima da
   linha; o do GEOCALL fica ao lado para conferência, que é
   exatamente para isso que ele foi guardado.

   O exceljs (~940 KB) entra por import() dinâmico, só quando alguém
   clica. O estilo vem do planilhaEstilo.js.
   ══════════════════════════════════════════════════════════ */

import {TINTA, AZUL, VERDE, VERMELHO, borda1, montarCabecalho, vestirCorpo} from "./planilhaEstilo.js";
/* O veredito do prazo vem do MESMO lugar que a tela usa. Escrever
   "começa com menos" aqui seria uma segunda regra, que concorda até
   o dia em que uma das duas mudar. */
import {prazoPorExtenso} from "./prazo.js";

const texto = (v) => String(v ?? "").trim();

function enderecoCheio(r){
  const n = texto(r["Número"]);
  const c = texto(r["Complemento"]);
  return texto(r["Endereço"]) + (n ? ", " + n : "") + (c ? " - " + c : "");
}

/**
 * @param rows        as linhas do modal, como ele as está exibindo
 * @param familia     a família da linha clicada
 * @param tssName     o nome do grupo de TSS, quando o clique veio de um
 * @param tipo        "prazo" | "fora" | "total"
 * @param unidadeLabel a unidade da lateral, por extenso
 * @param usuario     quem gerou — a planilha costuma virar anexo
 */
export async function gerarPlanilhaCarteira({rows, familia, tssName, tipo, unidadeLabel, usuario}){
  const {default:ExcelJS} = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pendente-TV";
  wb.created = new Date();

  const dados = [...(rows||[])];
  const rotulo = tipo==="prazo" ? "Dentro do prazo"
               : tipo==="fora"  ? "Fora do prazo"
               : "Carteira aberta";
  const nFora   = dados.filter(r=>prazoPorExtenso(r["Tempo Residual"])==="Fora do prazo").length;
  const nDentro = dados.filter(r=>prazoPorExtenso(r["Tempo Residual"])==="Dentro do prazo").length;

  /* ─────────────── 1. Resumo ─────────────── */
  const rs = wb.addWorksheet("Resumo", {properties:{tabColor:{argb:AZUL}}});
  rs.columns = [{width:34},{width:34},{width:16}];

  const titulo = rs.getCell("A1");
  titulo.value = "CARTEIRA — serviços abertos";
  titulo.font = {bold:true, size:16, color:{argb:TINTA}, name:"Calibri"};
  rs.getRow(1).height = 26;

  const par = (linha, rotuloCel, valor, cor) => {
    const a = rs.getCell("A"+linha), b = rs.getCell("B"+linha);
    a.value = rotuloCel; a.font = {bold:true, size:11, name:"Calibri", color:{argb:TINTA}};
    b.value = valor;     b.font = {size:11, name:"Calibri", ...(cor?{bold:true,color:{argb:cor}}:{})};
    a.alignment = b.alignment = {vertical:"middle"};
  };
  par(3, "Família",            texto(familia) || "(todas)");
  par(4, "Serviço (TSS)",      texto(tssName) || "todas as TSS da família");
  par(5, "Recorte",            rotulo);
  par(6, "Unidade",            texto(unidadeLabel));
  par(7, "Gerado em",          new Date().toLocaleString("pt-BR"));
  if(usuario) par(8, "Gerado por", texto(usuario));

  par(10, "Serviços na lista",  dados.length);
  par(11, "Dentro do prazo",    nDentro, VERDE);
  par(12, "Fora do prazo",      nFora,   VERMELHO);

  const nota = rs.getCell("A14");
  nota.value = "O prazo é o do CONTRATO, medido a partir da Data de Competência — não o prazo que o "
             + "GEOCALL mostra. O do GEOCALL vai na última coluna da aba Serviços, para conferência.";
  nota.font = {size:10, italic:true, name:"Calibri", color:{argb:"FF64748B"}};
  nota.alignment = {wrapText:true, vertical:"top"};
  rs.mergeCells("A14:C16");

  /* ─────────────── 2. Serviços ─────────────── */
  const col = [
    {key:"os",        header:"OS",                width:16},
    {key:"tss",       header:"Serviço (TSS)",     width:42},
    {key:"familia",   header:"Família",           width:28},
    {key:"situacao",  header:"Prazo",             width:16, align:"center"},
    {key:"residual",  header:"Tempo Residual",    width:18, align:"center"},
    {key:"competencia",header:"Data de Competência", width:20, align:"center"},
    {key:"sf",        header:"SF",                width:10, align:"center"},
    {key:"endereco",  header:"Endereço",          width:46},
    {key:"bairro",    header:"Bairro",            width:24},
    {key:"municipio", header:"Município",         width:18},
    {key:"atc",       header:"ATC",               width:9,  align:"center"},
    {key:"status",    header:"Status da OS",      width:18},
    {key:"geocall",   header:"Prazo do GEOCALL",  width:20, align:"center"},
  ];
  const ws = wb.addWorksheet("Serviços", {properties:{tabColor:{argb:AZUL}}});
  montarCabecalho(ws, col);
  dados.forEach(r=>ws.addRow({
    os: texto(r["Número OS"]),
    tss: texto(r["TSS"]),
    familia: texto(r["Família"]),
    situacao: prazoPorExtenso(r["Tempo Residual"]),
    residual: texto(r["Tempo Residual"]),
    competencia: texto(r["Data de Competência"]),
    sf: texto(r["SF"]),
    endereco: enderecoCheio(r),
    bairro: texto(r["Bairro"]),
    municipio: texto(r["Município"]),
    atc: texto(r["ATC"]),
    status: texto(r["Status da OS"]),
    geocall: texto(r["Tempo Residual GEOCALL"]),
  }));
  vestirCorpo(ws, col, 2, ws.rowCount);

  /* A coluna do prazo pintada, porque é por ela que se lê a planilha.
     Vem DEPOIS do vestirCorpo, que escreve a listra em toda linha
     par — pintar antes seria pintar para a listra cobrir. */
  const iSit = col.findIndex(c=>c.key==="situacao") + 1;
  for(let r=2; r<=ws.rowCount; r++){
    const cell = ws.getRow(r).getCell(iSit);
    if(cell.value==="Fora do prazo")   cell.font = {size:10, name:"Calibri", bold:true, color:{argb:VERMELHO}};
    if(cell.value==="Dentro do prazo") cell.font = {size:10, name:"Calibri", color:{argb:VERDE}};
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
