-- ============================================================
-- v_carteira_foto — o saldo CONTADO DA MESMA FONTE do movimento
--
-- POR QUE ISTO EXISTE
--
-- Em 16/10/2026 o Bryan conferiu o gráfico já com a v_carteira_movimento
-- no ar e achou outro buraco, menor:
--
--   743 − 206 + 238 = 775,  e a tela mostrava 772
--
-- A entrada e a saída estavam certas. Quem não estava era a linha azul.
--
-- Os dois números contam coisas diferentes:
--
--   pendente_historico   conta SERVIÇOS   (01/10: 743)
--   pendente_diario_os   conta OS         (01/10: 730)
--
-- A foto diária guarda UMA LINHA POR OS. Medido em todos os dias
-- testados, o número de linhas é exatamente igual ao número de OS
-- distintas — nunca sobra uma. Quando uma OS carrega dois serviços, o
-- segundo não é gravado.
--
-- No export cru de 16/10: 937 linhas para 917 OS. São 17 OS com mais de
-- um serviço, quase todas de REPOSIÇÃO — uma OS com dois trechos de
-- pavimento para repor.
--
-- O buraco por dia, medido:
--
--   30/09   724 serviços   708 OS   16
--   01/10   743            730      13
--   02/10   772            762      10
--   03/10   769            764       5
--   13/10   899            875      24
--   16/10   801            784      17
--
-- E o erro que aparecia na tela era a VARIAÇÃO do buraco, não ele:
-- 13 − 10 = 3, exatamente os 3 que faltavam na conta de 02/10. Como o
-- buraco varia de 5 a 24 sem padrão, o erro variava junto — foi por
-- isso que ontem pareciam faltar 83 e hoje 3.
--
--
-- O QUE ESTA VIEW FAZ, E O QUE ELA NÃO CONSERTA
--
-- Ela conta o saldo da MESMA foto que a v_carteira_movimento usa. Com
-- isso as três linhas do gráfico passam a falar do mesmo universo e a
-- identidade fecha na tela, exatamente como fecha no banco:
--
--   30/09   602 − 204 + 310 = 708  (foto 708)  ✓
--   01/10   708 − 220 + 242 = 730  (foto 730)  ✓
--   02/10   730 − 206 + 238 = 762  (foto 762)  ✓
--   03/10   762 − 125 + 127 = 764  (foto 764)  ✓
--   04/10   764 −  77 +  66 = 753  (foto 753)  ✓
--   05/10   753 − 297 + 248 = 704  (foto 704)  ✓
--
-- O QUE ELA NÃO CONSERTA: a foto continua perdendo o segundo serviço de
-- uma OS. Isto faz a tela parar de mentir na conta; o conserto de
-- verdade é no robô (robo-geocall), gravando uma linha por par
-- (numero_os, tss) em vez de uma por OS. E ele só vale do dia em que
-- rodar em diante — as linhas que nunca foram gravadas não existem em
-- lugar nenhum para recuperar. Do passado sobrou só o total por
-- família, na pendente_historico.
--
-- O fora do prazo quase não se mexe, porque o que se perde é quase todo
-- dentro do prazo (01/10: 200 e 200; 13/10: 254 e 252).
--
-- Só a aba Produção usa isto. A Pendente continua na
-- pendente_historico, que conta serviços — é o número do contrato, e é
-- o que o pessoal está acostumado a ver.
--
-- Mesma forma da pendente_historico de propósito (dia, unidade,
-- familia, no_prazo, fora_prazo, total): o gráfico troca a fonte e não
-- precisa saber de mais nada.
-- ============================================================

CREATE OR REPLACE VIEW v_carteira_foto AS
SELECT d.dia,
       d.unidade,
       d.familia,
       count(*) FILTER (WHERE d.fora_prazo IS NOT TRUE)::int AS no_prazo,
       count(*) FILTER (WHERE d.fora_prazo IS TRUE)::int     AS fora_prazo,
       count(*)::int                                         AS total
  FROM pendente_diario_os d
 GROUP BY 1, 2, 3;

ALTER VIEW v_carteira_foto SET (security_invoker = on);

/* REVOKE junto, sempre — o Supabase concede SELECT a anon em todo
   objeto novo do schema public por DEFAULT PRIVILEGES, e GRANT para
   authenticated não tira de ninguém. Já esqueci isso duas vezes neste
   projeto. */
REVOKE ALL ON v_carteira_foto FROM anon;
GRANT SELECT ON v_carteira_foto TO authenticated;


-- ============================================================
-- CONFERÊNCIA — a identidade fechando na própria fonte do gráfico:
--
--   WITH c AS (SELECT dia, sum(total) t FROM v_carteira_foto GROUP BY 1),
--        m AS (SELECT dia, sum(entraram) e, sum(sairam) s
--                FROM v_carteira_movimento GROUP BY 1)
--   SELECT m.dia, ant.t AS ontem, m.s AS sairam, m.e AS entraram,
--          ant.t - m.s + m.e AS previsto, hoje.t AS real
--     FROM m
--     JOIN c hoje ON hoje.dia = m.dia
--     JOIN LATERAL (SELECT t FROM c WHERE c.dia < m.dia
--                    ORDER BY c.dia DESC LIMIT 1) ant ON true
--    ORDER BY 1;
--
-- `previsto` tem de ser igual a `real` em TODA linha, sem exceção. Se
-- algum dia não fechar, a foto daquele dia veio pela metade — e aí o
-- problema é o robô, não esta view.
--
-- E o tamanho do que a foto perde, dia a dia:
--
--   SELECT h.dia, sum(h.total) AS servicos, f.os, sum(h.total) - f.os AS perdidos
--     FROM pendente_historico h
--     JOIN (SELECT dia, sum(total) os FROM v_carteira_foto GROUP BY 1) f
--       ON f.dia = h.dia
--    GROUP BY h.dia, f.os ORDER BY h.dia DESC LIMIT 20;
-- ============================================================
