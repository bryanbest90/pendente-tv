-- ============================================================
-- CONSERTAR A FAMÍLIA TROCADA NAS ENTRADAS
--
-- Rode no SQL Editor do Supabase, depois de sql/pendente_conferencia.sql
-- (ele é quem cria a tabela tss_familia, que é a régua usada aqui).
--
-- O QUE ACONTECEU
-- Alguns relatórios do GEOCALL de 06 e 07/10/2026 vieram com o serviço
-- certo na família errada. "VAZAMENTO DE ÁGUA COM INFILTRAÇÃO" chegou
-- como RAMAL DE ÁGUA; "SUPRIMIR LIG AGUA DEMOLIÇÃO/UNIFICAÇÃO" chegou
-- como OUTROS SERVIÇOS DE ESGOTO. Como a coluna Entradas agrupa por
-- família, o número apareceu na linha errada da tabela.
--
-- São 42 linhas na os_entrada — pouco, mas erra o número de duas
-- famílias ao mesmo tempo: some de uma e sobra na outra.
--
-- POR QUE CORRIGIR E NÃO APAGAR
-- A OS é real e foi mesmo solicitada naquele dia. O que veio errado foi
-- só o rótulo. Apagar perderia uma entrada verdadeira; corrigir põe ela
-- na linha certa.
--
-- A RÉGUA É O HISTÓRICO, NÃO EU
-- Só mexe onde a tss_familia tem opinião FIRME (o serviço apareceu 20
-- vezes ou mais sempre na mesma família). Serviço raro fica como está:
-- com pouca evidência, o certo é não mexer.
-- ============================================================


-- ---------- 1. Veja antes de corrigir ----------
-- SELECT e.tss, e.familia AS veio_como, t.familia AS deveria_ser, count(*)
--   FROM os_entrada e
--   JOIN tss_familia t ON t.tss = e.tss AND t.firme
--  WHERE e.familia IS DISTINCT FROM t.familia
--  GROUP BY 1,2,3 ORDER BY 4 DESC;


-- ---------- 2. Corrija ----------
UPDATE os_entrada e
   SET familia = t.familia
  FROM tss_familia t
 WHERE t.tss = e.tss
   AND t.firme
   AND e.familia IS DISTINCT FROM t.familia;


-- ---------- 3. As de verificação saem da conta ----------
-- "VERIFICAR HIDROMETRO TELEMEDIDO", "VERIFICAR SERVIÇO SOLICITADO" e
-- as irmãs são vistoria — e vistoria não é carteira. Elas chegaram
-- marcadas como VAZAMENTO DE ÁGUA e por isso passaram pelo filtro de
-- família.
--
-- O site já deixou de contar essas, pelo NOME do serviço. Aqui é só
-- para a tabela não guardar o que ninguém vai usar.
--
-- ESSE DIA CHEGOU, em 18/11/2026: "VERIFICAR SERVIÇO EM GARANTIA OP"
-- passou a ser serviço nosso. Por isso o DELETE abaixo ganhou uma
-- exceção — sem ela, rodar este arquivo de novo apagaria as entradas
-- do serviço que hoje é carteira, e a coluna Entradas zeraria para
-- ele sem ninguém entender por quê.
--
-- A lista tem de ser a mesma da TSS_LIBERADAS do `src/App.jsx` e da
-- do `robo-geocall/index.js`. São três lugares porque são três
-- caminhos de dado; ao liberar outro serviço, mexa nos três.
DELETE FROM os_entrada
 WHERE tss ILIKE 'VERIFICAR %'
   AND upper(btrim(tss)) <> 'VERIFICAR SERVIÇO EM GARANTIA OP';


-- ---------- Conferência ----------
-- Tem que dar zero:
--   SELECT count(*) FROM os_entrada e JOIN tss_familia t
--     ON t.tss = e.tss AND t.firme WHERE e.familia IS DISTINCT FROM t.familia;
--
--   SELECT count(*) FROM os_entrada WHERE tss ILIKE 'VERIFICAR %'
--     AND upper(btrim(tss)) <> 'VERIFICAR SERVIÇO EM GARANTIA OP';
--
-- A de garantia NÃO tem de dar zero: ela é carteira desde 18/11/2026.
--
-- E a coluna Entradas se corrige sozinha no próximo carregamento.


-- ============================================================
-- ISTO É LIMPEZA, NÃO É CONSERTO
--
-- O que impede de acontecer de novo é a conferência do relatório, no
-- sql/pendente_conferencia.sql + o robô novo. Conferi: a subida de
-- 07/10 às 12:02, que trouxe a maior parte dessas linhas, TERIA SIDO
-- RECUSADA por ela — 42 serviços com família trocada entre 54 com
-- histórico firme, e 85% do arquivo com serviço nunca visto.
--
-- Enquanto o robô novo não estiver instalado na máquina, isso volta a
-- acontecer no próximo relatório torto.
-- ============================================================
