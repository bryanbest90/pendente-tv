/* ══════════════════════════════════════════════════════════
   O QUE É ESTAR FORA DO PRAZO

   Uma função só, e é por isso que ela tem arquivo próprio: a tela e a
   planilha precisam das DUAS responderem igual. Em 27/11/2026 eu ia
   escrever esta regra de novo dentro do relatorioCarteira.js — e aí
   seriam duas, que concordam até o dia em que uma mudar. É o mesmo
   motivo de o prazo do contrato ser aplicado reescrevendo o `Tempo
   Residual` da linha em vez de criar um campo paralelo: regra copiada
   é regra que diverge.

   O SINAL É O MENOS. O `Tempo Residual` é o que falta até o veredito
   virar — "2d,4h,10m" ainda dá tempo, "-22h,20m" já estourou. O valor
   que a tela usa é o do CONTRATO, reescrito sobre a linha pelo
   `aplicarPrazoIsap`; o do GEOCALL fica em `Tempo Residual GEOCALL`.

   Vazio devolve null, e isso não é "no prazo": é serviço sem prazo
   nenhum (não está na régua do ISAP e o GEOCALL também não disse).
   Quem conta precisa saber a diferença.
   ══════════════════════════════════════════════════════════ */

export function tempo(val){
  const s = String(val).trim();
  return !s ? null : s.startsWith("-") ? "fora" : "prazo";
}

/* O mesmo veredito, escrito para quem vai ler numa planilha, onde não
   há verde nem vermelho para olhar. */
export function prazoPorExtenso(val){
  const t = tempo(val);
  return t === "fora" ? "Fora do prazo" : t === "prazo" ? "Dentro do prazo" : "";
}
