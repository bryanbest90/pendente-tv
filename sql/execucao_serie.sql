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

/* O REVOKE NÃO É ENFEITE — SEM ELE A VIEW NASCE ABERTA.

   Em 16/10/2026, logo depois de aplicar a primeira versão deste
   arquivo, a chave anônima do navegador leu a view normalmente. O
   GRANT para authenticated não fecha nada: o Supabase tem DEFAULT
   PRIVILEGES no schema public que já concedem SELECT a anon em todo
   objeto novo. Conceder a um papel não tira de outro.

   É a mesma lição que já está no sql/isap_acesso.sql e no CLAUDE.md
   — esconder a aba na tela não protege uma view que a chave do
   navegador alcança — e eu repeti o erro mesmo com ela escrita. */
REVOKE ALL ON v_execucao_serie FROM anon;
GRANT SELECT ON v_execucao_serie TO authenticated;

-- Conferir que fechou (tem que devolver 0 linhas para anon):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'v_execucao_serie';

-- ATENÇÃO, O BURACO MAIOR CONTINUA ABERTO:
-- a própria tabela `execucao` tem política de RLS liberando SELECT
-- para anon (sql/execucao.sql, linha 147). Fechar esta view impede
-- que alguém leia a série pronta, mas quem tiver a chave do bundle
-- ainda lê a tabela e refaz a conta. Fechar de verdade exige a
-- etapa 2 do sql/producao.sql — criar a v_execucao_publica (só
-- numero_os, tss, dia, que é o que a aba Carteira usa) e tirar o
-- anon da `execucao`. Essa etapa nunca foi rodada: hoje o
-- fetchExecucao do app cai no fallback e lê a tabela direto.


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
