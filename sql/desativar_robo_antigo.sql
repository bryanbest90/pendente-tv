-- ============================================================
-- DESATIVAR A LIMPEZA DO ROBÔ ANTIGO DE EXECUTADOS
--
-- Rode no SQL Editor DEPOIS de tirar o robô antigo do orquestrador.
--
-- POR QUE
-- Os dois robôs gravam na mesma tabela de formas incompatíveis:
--
--   robo-executados (antigo)  limpar_execucao(ini,fim) APAGA a faixa
--                             inteira e regrava com as 12 colunas
--                             antigas. Some cod_tss, status_os,
--                             cod_resultado, executado, pde, familia e
--                             data_inicio_execucao — e somem também
--                             todas as linhas de NÃO executado, que o
--                             relatório dele nem traz.
--
--   robo-execucoes (novo)     upsert por (numero_os,tss,dia) e só
--                             depois tira do período o que a rodada
--                             não trouxe.
--
-- Com os dois ligados, toda rodada do antigo derruba a última semana
-- do IDG. Foi o que aconteceu de 08 a 13/10/2026: aqueles dias ficaram
-- com status_os nulo, a v_execucao_final exige 'Fechada', e a aba
-- simplesmente parou no dia 07.
--
-- Tirar do orquestrador resolve enquanto ninguém clicar no .bat. Esta
-- trava resolve de vez: se o robô antigo rodar — por engano, por um
-- atalho velho, por outro PC — ele FALHA em vez de apagar em silêncio.
-- Erro barulhento é melhor que perda silenciosa.
-- ============================================================

DO $$
DECLARE f RECORD;
BEGIN
  -- derruba todas as assinaturas de limpar_execucao, quaisquer que sejam
  FOR f IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'limpar_execucao'
       AND n.nspname = 'public'
  LOOP
    EXECUTE 'DROP FUNCTION ' || f.assinatura;
    RAISE NOTICE 'removida: %', f.assinatura;
  END LOOP;
END $$;

-- No lugar dela, uma que explica o que fazer. A assinatura é a mesma
-- que o robô antigo chama, então ele recebe o recado em vez de um 404.
CREATE FUNCTION limpar_execucao(p_ini DATE, p_fim DATE)
RETURNS INT LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'limpar_execucao foi desativada em 14/10/2026. O robô antigo de executados apaga a faixa inteira e regrava sem as colunas do IDG (status_os, cod_resultado, executado, cod_tss), derrubando a aba. Use o robo-execucoes, que grava por upsert e chama limpar_execucao_antiga.';
END $$;

REVOKE ALL ON FUNCTION limpar_execucao(DATE, DATE) FROM anon, authenticated;


-- ---------- Conferência ----------
-- Tem de dar erro, e o erro é a mensagem acima:
--   SELECT limpar_execucao('2026-10-01','2026-10-07');
--
-- E a do robô novo tem de continuar existindo:
--   SELECT proname FROM pg_proc WHERE proname LIKE 'limpar_execucao%';
--   -> limpar_execucao, limpar_execucao_antiga
-- ============================================================
