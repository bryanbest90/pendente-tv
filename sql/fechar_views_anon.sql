-- ============================================================
-- FECHAR AS VIEWS QUE A CHAVE DO SITE NÃO PRECISA LER
--
-- Roda no SQL Editor. Não apaga dado nenhum: só tira permissão.
--
-- POR QUE
--
-- As tabelas deste banco estão todas protegidas por RLS — conferido
-- em 25/11/2026, 32 de 32, com políticas. As VIEWS não: view não tem
-- RLS, ela roda com os direitos de quem a criou. Quem tiver a chave
-- pública do site (e ela vai dentro do JavaScript, qualquer um lê no
-- navegador) alcança o conteúdo delas inteiro.
--
-- A v_idg já foi fechada neste dia, porque a aba IDG é só do Bryan e
-- a trava estava só na v_idg_seguro — a v_idg ao lado era a porta
-- aberta. Estas são as outras.
--
-- COMO A LISTA FOI MONTADA
--
-- Cruzei o que o site busca (e com qual chave) com o que os robôs
-- buscam. Destas 11, nenhuma é lida pelo site com a chave anônima
-- nem por robô nenhum.
--
-- FICAM ABERTAS, DE PROPÓSITO:
--   v_entrada_serie, v_os_entrada, v_pendente_mapa
--     o site lê com a chave anônima, antes do login
--   v_execucao_final
--     o robo-execucoes lê, e ele usa a chave anônima
--
-- Essas quatro só podem fechar quando os robôs passarem para a
-- chave secreta e as telas públicas forem revistas. É outro
-- trabalho, e maior.
-- ============================================================

-- ---------- 1. CONFIRA ANTES ----------
-- O que a chave anônima consegue LER hoje. Guarde o resultado: é com
-- ele que se compara depois.
--
-- SELECT c.relname AS view, has_table_privilege('anon', c.oid, 'SELECT') AS anon_le
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'v'
--    AND has_table_privilege('anon', c.oid, 'SELECT')
--  ORDER BY 1;


-- ---------- 2. FECHA ----------
REVOKE ALL ON v_baixa_familia      FROM anon;
REVOKE ALL ON v_casamento_execucao FROM anon;
REVOKE ALL ON v_causas_nao_mapeadas FROM anon;
REVOKE ALL ON v_desfecho_dia       FROM anon;
REVOKE ALL ON v_dias_pendente      FROM anon;
REVOKE ALL ON v_entrada_dia        FROM anon;
REVOKE ALL ON v_execucao_equipe    FROM anon;
REVOKE ALL ON v_familias_diario    FROM anon;
REVOKE ALL ON v_isap_execucao      FROM anon;
REVOKE ALL ON v_passagem_equipe    FROM anon;
REVOKE ALL ON v_producao_equipe    FROM anon;


-- ---------- 3. CONFIRA DEPOIS ----------
-- Tem de sobrar só estas quatro:
--   v_entrada_serie, v_execucao_final, v_os_entrada, v_pendente_mapa
--
-- SELECT c.relname AS ainda_aberta
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'v'
--    AND has_table_privilege('anon', c.oid, 'SELECT')
--  ORDER BY 1;
--
-- E o site tem de continuar funcionando: abra a Pendente, a Carteira,
-- o Mapa e a Produção. Faltando dado em alguma, foi fechada uma que
-- ela usava — o DESFAZER abaixo devolve na hora.


-- ---------- DESFAZER ----------
-- GRANT SELECT ON v_baixa_familia, v_casamento_execucao,
--   v_causas_nao_mapeadas, v_desfecho_dia, v_dias_pendente,
--   v_entrada_dia, v_execucao_equipe, v_familias_diario,
--   v_isap_execucao, v_passagem_equipe, v_producao_equipe TO anon;
