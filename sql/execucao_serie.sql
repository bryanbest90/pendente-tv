-- ============================================================
-- v_execucao_serie — o que SAIU da carteira, por dia
--
-- Irmã da v_entrada_serie: mesma forma (dia, unidade, família),
-- para o gráfico poder somar entradas e saídas com os MESMOS
-- filtros de unidade e família.
--
-- Duas decisões aqui mudam o número que aparece na tela, e as duas
-- saíram de medição em 01 a 15/10/2026, não de palpite:
--
-- 1) SÓ 'Fechada' SAIU DA CARTEIRA.
--    A tabela execucao também guarda passagens com status
--    Despachada, Reprogramável e Planejada. Pelo mapa_desfecho
--    essas são PERMANECE: a equipe passou, a OS continua lá.
--    Contá-las como saída seria dar baixa no que não saiu.
--
-- 2) A UNIDADE É O PAR (numero_os, tss), NÃO A LINHA.
--    Em 15 dias, 716 pares aparecem em mais de um dia e 425 deles
--    têm os DOIS vereditos: a equipe passou, marcou "CONTINUA —
--    SERVIÇO NÃO CONCLUÍDO", e depois alguém executou.
--
--      contando LINHA:  3.158 executados, 2.287 não — 42,0% não
--      contando PAR:    3.158 executados, 1.383 não — 30,5% não
--
--    São 904 serviços de diferença, quase um terço do total de não
--    executados. A primeira conta põe na tela a passagem frustrada
--    de uma equipe como se fosse um serviço perdido — e ele não foi
--    perdido, foi executado depois. A régua do projeto já era essa
--    (CLAUDE.md, "a unidade do negócio é o par (numero_os, tss)").
--
--    Desempate: EXECUÇÃO VENCE. Quem foi executado alguma vez conta
--    como executado, no dia em que foi — é a mesma regra que o
--    mapa_desfecho usa para a OS que duas equipes tocaram no mesmo
--    dia (ver sql/desfecho.sql).
-- ============================================================

CREATE OR REPLACE VIEW v_execucao_serie AS
WITH veredito AS (
  SELECT DISTINCT ON (numero_os, tss)
         numero_os, tss, dia, executado, atc, familia
    FROM execucao
   WHERE status_os = 'Fechada'
     AND executado IS NOT NULL
     AND atc IS NOT NULL
   -- executado DESC: execução vence a passagem não concluída
   -- dia DESC: entre execuções, vale a última
   ORDER BY numero_os, tss, executado DESC, dia DESC
)
SELECT dia,
       CASE atc WHEN 923 THEN 'Interlagos'
                WHEN 929 THEN 'Grajau'
                WHEN 299 THEN 'Embu-Guacu' END        AS unidade,
       familia,
       count(*) FILTER (WHERE executado)::int         AS executados,
       count(*) FILTER (WHERE NOT executado)::int     AS nao_executados
  FROM veredito
 WHERE familia IS NOT NULL
 GROUP BY 1, 2, 3;

ALTER VIEW v_execucao_serie SET (security_invoker = on);
GRANT SELECT ON v_execucao_serie TO anon, authenticated;

-- Conferência rápida depois de aplicar — tem que bater com o bloco
-- de números do comentário acima:
--
--   SELECT dia, sum(executados) ex, sum(nao_executados) ne
--     FROM v_execucao_serie
--    WHERE dia BETWEEN '2026-10-01' AND '2026-10-15'
--    GROUP BY 1 ORDER BY 1;
--
--   total esperado no período: 3.158 executados, 1.383 não.
