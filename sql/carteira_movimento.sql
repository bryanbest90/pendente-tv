-- ============================================================
-- v_carteira_movimento — a conta que FECHA
--
-- O PROBLEMA QUE ISTO RESOLVE
--
-- O Bryan olhou o gráfico e fez a conta óbvia:
--   carteira(01/10) 743 − saíram 320 + entraram 266 = 689
-- e a carteira de 02/10 mostrava 772. Ele estava certo em estranhar.
--
-- As três linhas vinham de três lugares com universos diferentes:
--   • carteira  = foto diária (pendente_historico)
--   • saíram    = tudo que foi baixado no dia (v_execucao_serie)
--   • entraram  = tudo que foi solicitado no dia (v_entrada_serie)
--
-- Medido em 01/10: das 319 baixas do dia, só 190 eram serviços que
-- estavam na carteira; 126 nasceram e morreram entre duas fotos, sem
-- nunca aparecer. E 30 serviços saíram da carteira sem passar pela
-- barra — cancelados ou com mudança de status.
--
-- Nenhum número estava errado. Eles só não somavam, porque mediam
-- coisas diferentes postas lado a lado.
--
--
-- A SOLUÇÃO: MEDIR O MOVIMENTO, NÃO A PRODUÇÃO
--
-- Esta view compara cada foto com a anterior, par a par
-- (numero_os, tss). Quem está hoje e não estava ontem, entrou. Quem
-- estava ontem e não está hoje, saiu. A identidade
--
--   carteira(ontem) − saíram + entraram = carteira(hoje)
--
-- passa a ser verdadeira POR CONSTRUÇÃO: os três números saem da
-- mesma fonte. Conferido em 15 transições de 26/09 a 15/10 — fecha
-- em todas, sem exceção.
--
-- E as saídas vêm partidas em três, cruzando com a v_execucao_final:
--   executado          a equipe fez
--   nao_executado      foi lá e não deu (improdutiva, erro de base…)
--   outro_motivo       saiu sem baixa: cancelamento, mudança de status
--
--
-- O QUE ESTA VIEW NÃO MOSTRA, E É DE PROPÓSITO
--
-- Os 126 serviços de 01/10 que nasceram e morreram entre duas fotos
-- não aparecem aqui. Eles são PRODUÇÃO — a equipe trabalhou — mas não
-- são MOVIMENTO DE CARTEIRA, porque a carteira nunca os teve. São
-- quase 40% das baixas do dia, e merecem um número próprio: é outra
-- pergunta, para outro lugar da tela.
--
--
-- O BURACO DAS FOTOS QUE FALTAM
--
-- Em 16/08 a 15/10 há 56 fotos para 61 dias: faltam 27 e 28/09,
-- 11 e 12/10, e 14/10. No dia seguinte a um buraco, o movimento cobre
-- dois ou três dias de uma vez. A coluna `dias_cobertos` diz quantos,
-- para a tela poder avisar em vez de fingir que foi tudo num dia.
-- ============================================================

CREATE OR REPLACE VIEW v_carteira_movimento AS
WITH foto AS (
  SELECT DISTINCT dia, numero_os, tss, unidade, familia
    FROM pendente_diario_os
),
dd AS (
  SELECT dia, LAG(dia) OVER (ORDER BY dia) AS ant
    FROM (SELECT DISTINCT dia FROM pendente_diario_os) x
),
/* Para cada par, o dia em que ele apareceu antes e depois. É o que
   permite decidir entrada e saída sem cruzar a foto inteira com ela
   mesma — a janela faz isso numa passada só. */
m AS (
  SELECT f.dia, f.numero_os, f.tss, f.unidade, f.familia,
         LAG(f.dia)  OVER (PARTITION BY f.numero_os, f.tss ORDER BY f.dia) AS ant_par,
         LEAD(f.dia) OVER (PARTITION BY f.numero_os, f.tss ORDER BY f.dia) AS prox_par
    FROM foto f
),
mov AS (
  -- ENTROU: está na foto de hoje, e a aparição anterior dele não é a
  -- foto anterior (ou não existe). IS DISTINCT FROM trata o NULL do
  -- primeiro aparecimento sem precisar de caso à parte.
  SELECT dd.dia, m.unidade, m.familia, m.numero_os, m.tss, 'entrou'::text AS tipo
    FROM dd
    JOIN m ON m.dia = dd.dia
   WHERE dd.ant IS NOT NULL
     AND m.ant_par IS DISTINCT FROM dd.ant

  UNION ALL

  -- SAIU: estava na foto anterior e a próxima aparição dele não é a
  -- de hoje. Repare que a linha é datada com `dd.dia`, o dia em que
  -- se percebeu a saída — é assim que a identidade fecha.
  SELECT dd.dia, m.unidade, m.familia, m.numero_os, m.tss, 'saiu'
    FROM dd
    JOIN m ON m.dia = dd.ant
   WHERE m.prox_par IS DISTINCT FROM dd.dia
)
SELECT v.dia,
       v.unidade,
       v.familia,
       count(*) FILTER (WHERE v.tipo = 'entrou')::int                         AS entraram,
       count(*) FILTER (WHERE v.tipo = 'saiu')::int                           AS sairam,
       count(*) FILTER (WHERE v.tipo = 'saiu' AND x.executado IS TRUE)::int    AS saiu_executado,
       count(*) FILTER (WHERE v.tipo = 'saiu' AND x.executado IS FALSE)::int   AS saiu_nao_executado,
       count(*) FILTER (WHERE v.tipo = 'saiu' AND x.executado IS NULL)::int    AS saiu_outro_motivo
  FROM mov v
  LEFT JOIN LATERAL (
    -- a baixa mais recente até o dia da saída; NULL quer dizer que
    -- não houve baixa nenhuma — saiu por outro motivo
    SELECT e.executado
      FROM v_execucao_final e
     WHERE e.numero_os = v.numero_os
       AND e.tss       = v.tss
       AND e.dia      <= v.dia
     ORDER BY e.dia DESC
     LIMIT 1
  ) x ON v.tipo = 'saiu'
 GROUP BY 1, 2, 3;

ALTER VIEW v_carteira_movimento SET (security_invoker = on);
REVOKE ALL ON v_carteira_movimento FROM anon;
GRANT SELECT ON v_carteira_movimento TO authenticated;


-- Quantos dias cada movimento cobre, para a tela avisar quando
-- faltou foto. Separado porque não depende de unidade nem família.
CREATE OR REPLACE VIEW v_carteira_movimento_dia AS
SELECT dia, (dia - ant) AS dias_cobertos
  FROM (
    SELECT dia, LAG(dia) OVER (ORDER BY dia) AS ant
      FROM (SELECT DISTINCT dia FROM pendente_diario_os) x
  ) y
 WHERE ant IS NOT NULL;

ALTER VIEW v_carteira_movimento_dia SET (security_invoker = on);
REVOKE ALL ON v_carteira_movimento_dia FROM anon;
GRANT SELECT ON v_carteira_movimento_dia TO authenticated;


-- ============================================================
-- CONFERÊNCIA — a lógica foi conferida em Python contra o banco
-- antes de virar SQL. Estes são os números que têm de sair:
--
--   SELECT dia, sum(entraram) ent, sum(sairam) sai,
--          sum(saiu_executado) ex, sum(saiu_nao_executado) ne,
--          sum(saiu_outro_motivo) ou
--     FROM v_carteira_movimento
--    WHERE dia BETWEEN '2026-09-30' AND '2026-10-05'
--    GROUP BY 1 ORDER BY 1;
--
--   dia          ent   sai    ex    ne    ou
--   2026-09-30   310   204   158    43     3
--   2026-10-01   242   220   131    63    26
--   2026-10-02   238   206   138    51    17
--   2026-10-03   127   125    86    35     4
--   2026-10-04    66    77    43    34     0
--   2026-10-05   248   297   204    76    17
--
-- E o teste que importa, a identidade fechando:
--
--   WITH c AS (SELECT dia, sum(total) t FROM pendente_historico GROUP BY 1),
--        m AS (SELECT dia, sum(entraram) e, sum(sairam) s
--                FROM v_carteira_movimento GROUP BY 1)
--   SELECT m.dia, ant.t AS ontem, m.s, m.e,
--          ant.t - m.s + m.e AS previsto, hoje.t AS real
--     FROM m
--     JOIN c hoje ON hoje.dia = m.dia
--     JOIN LATERAL (SELECT t FROM c WHERE c.dia < m.dia ORDER BY c.dia DESC LIMIT 1) ant ON true
--    ORDER BY 1;
--
-- `previsto` tem de ser igual a `real` em TODA linha. Se algum dia
-- não fechar, é porque a foto daquele dia veio pela metade — e aí o
-- problema é o robô, não esta view.
-- ============================================================
