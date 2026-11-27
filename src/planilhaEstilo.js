/* ══════════════════════════════════════════════════════════
   O VESTIDO DAS PLANILHAS — cabeçalho, listra, borda, filtro

   POR QUE EXISTE
   Quando nasceu a terceira planilha do site (a da carteira, em
   27/11/2026), estas mesmas quarenta linhas iam virar a terceira
   cópia. Cópia de estilo não quebra conta nenhuma, mas diverge: uma
   planilha com a listra de um tom, outra com a de outro, e ninguém
   lembra qual é a certa. É a mesma razão pela qual a regra do prazo
   mora num lugar só no App.jsx.

   O `relatorioProducao.js` NÃO usa isto, de propósito. Ele tem
   paleta própria (roxo das equipes, verde, barra na célula) e está
   funcionando; trazê-lo para cá seria mexer em planilha que ninguém
   pediu para mexer. Quando ele precisar de manutenção, vem junto.

   Nada aqui conhece o conteúdo das planilhas: recebe colunas e
   devolve células vestidas.
   ══════════════════════════════════════════════════════════ */

export const TINTA  = "FF0F172A";   // fundo do cabeçalho
export const AZUL   = "FF3B82F6";   // aba e títulos
export const AMBAR  = "FFF59E0B";   // destaque de atenção
export const VERDE  = "FF10B981";   // dentro do prazo
export const VERMELHO = "FFEF4444"; // fora do prazo
export const BORDA  = "FFD5DBE5";
export const LISTRA = "FFF6F8FB";   // linha par

export const borda1 = {
  top:   {style:"thin",color:{argb:BORDA}},
  left:  {style:"thin",color:{argb:BORDA}},
  bottom:{style:"thin",color:{argb:BORDA}},
  right: {style:"thin",color:{argb:BORDA}},
};

export function dataBR(iso){
  if(!iso) return "";
  const [a,m,d] = String(iso).slice(0,10).split("-");
  return `${d}/${m}/${a}`;
}

export function montarCabecalho(ws, colunas){
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

export function vestirCorpo(ws, colunas, primeira, ultima){
  for(let r=primeira; r<=ultima; r++){
    const row = ws.getRow(r);
    row.height = 18;
    colunas.forEach((c,i)=>{
      const cell = row.getCell(i+1);
      cell.border = borda1;
      cell.font = {size:10, name:"Calibri"};
      cell.alignment = {vertical:"middle", horizontal:c.align||"left"};
      if(c.numero) cell.numFmt = "#,##0";
      if(r%2===0) cell.fill = {type:"pattern", pattern:"solid", fgColor:{argb:LISTRA}};
    });
  }
  /* Filtro sobre a tabela INTEIRA. Preso só ao cabeçalho, o Excel abre
     com a setinha e não filtra nada — parece quebrado. */
  if(ultima>=2) ws.autoFilter = {from:{row:1,column:1}, to:{row:ultima,column:colunas.length}};
}
