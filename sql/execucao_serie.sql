-- ============================================================
-- v_execucao_serie — o que SAIU da carteira, por dia
--
-- Irmã da v_entrada_serie: mesma forma (dia, unidade, família),
-- para o gráfico somar entradas e saídas com os MESMOS filtros.
--
-- SAI DE CIMA DA v_execucao_final, E ISSO É O PONTO.
--
-- A primeira versão desta view reimplementava aqui a regra da última
-- baixa, com um DISTINCT ON próprio. Funcionava, e ainda assim estava
-- errada de princípio: a regra de qual baixa encerra a OS já existe,
-- já foi conferida contra a planilha da Sabesp (1.796 de 1.796 pares)
-- e mora na v_execucao_final. Regra copiada é regra que diverge — e
-- neste projeto já houve uma análise inteira perdida por eu ter
-- reescrito em outro lugar uma regra que já existia.
--
-- Herdado de lá, sem repetir nada:
--
--   status_os = 'Fechada'         só OS fechada saiu da carteira
--   cod_tss IS NOT NULL           sem o par (OS, TSS) não há serviço
--   data_execucao IS NOT NULL     baixa sem data não encerra
--   cod_resultado fora de         os três que NÃO matam a OS:
--     FJL     FIM DO DIA                       (615 linhas em out/26)
--     901200  CONTINUA - SERVIÇO NÃO CONCLUÍDO (191)
--     902900  IMÓVEL FECHADO, REPROGRAMAR ORDEM (97)
--   DISTINCT ON (numero_os, cod_tss)  uma linha por serviço,
--     data_execucao DESC              a última baixa
--
-- Esses três são exatamente o que o Bryan pediu para ficar de fora:
-- a equipe passou e volta amanhã, a OS continua viva. Somam 903
-- linhas de 01 a 15/10/2026 — e sem eles a conta fica:
--
--   dia            exec    não    saiu    % não
--   2026-10-13      286     95     381    24,9%
--   2026-10-14      292    112     404    27,7%
--   2026-10-15      330    147     477    30,8%
--   TOTAL 01-15   3.158  1.375   4.533    30,3%
--
-- executado IS NOT FALSE, não "= true": as linhas antigas vieram do
-- relatório velho, que só trazia execução, e por isso têm NULL. É a
-- mesma convenção das outras views deste arquivo.
--
-- GRANT só para authenticated: o gráfico vive na aba Produção, que é
-- restrita, e a v_execucao_final também é só de authenticated.
-- ============================================================

CREATE OR REPLACE VIEW v_execucao_serie AS
SELECT f.dia,
       CASE f.atc WHEN 923 THEN 'Interlagos'
                  WHEN 929 THEN 'Grajau'
                  WHEN 299 THEN 'Embu-Guacu' END            AS unidade,
       f.familia,
       count(*) FILTER (WHERE f.executado IS NOT FALSE)::int AS executados,
       count(*) FILTER (WHERE f.executado IS FALSE)::int     AS nao_executados
  FROM v_execucao_final f
 WHERE f.familia IS NOT NULL
   AND f.atc IS NOT NULL
 GROUP BY 1, 2, 3;

ALTER VIEW v_execucao_serie SET (security_invoker = on);
GRANT SELECT ON v_execucao_serie TO authenticated;

-- Conferência depois de aplicar — tem que bater com o bloco acima:
--
--   SELECT sum(executados) AS exec, sum(nao_executados) AS nao
--     FROM v_execucao_serie
--    WHERE dia BETWEEN '2026-10-01' AND '2026-10-15';
--   -- esperado: 3158 | 1375
--
-- E para ver dia a dia:
--
--   SELECT dia, sum(executados) exec, sum(nao_executados) nao
--     FROM v_execucao_serie
--    WHERE dia BETWEEN '2026-10-01' AND '2026-10-15'
--    GROUP BY 1 ORDER BY 1;
