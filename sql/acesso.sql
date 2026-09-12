-- ============================================================
-- ACESSO — quem vê a Produção, quem importa arquivo
--
-- Roda DEPOIS da etapa 1 de producao.sql (que você já rodou).
-- Substitui a "ETAPA 2" daquele arquivo, que tinha dois furos:
-- ela fechava as tabelas e deixava abertas as funções de apagar
-- e sete views que entregam a produção por equipe. Aqui está
-- corrigido. Pode ignorar a etapa 2 de producao.sql.
--
-- Duas permissões independentes:
--
--   pode_producao   vê a aba Produção          (você + gerente)
--   pode_importar   vê os botões de importar   (só você)
--
-- Os robôs cobrem EM RUA (08:30) e Execução (00:30) todo dia.
-- Os botões viram reserva para quando um robô falhar, e deixam
-- de estar ao alcance de quem abrir o site.
-- ============================================================


-- ============================================================
--  PARTE 1 — a permissão nova (rode agora, não quebra nada)
-- ============================================================

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pode_importar BOOLEAN NOT NULL DEFAULT false;

-- Você: vê a produção e importa.
UPDATE perfis SET pode_producao = true, pode_importar = true
 WHERE email = 'bmdeodato@gmail.com';

-- Gerente: vê a produção, não importa.
-- Troque o e-mail e rode.
-- UPDATE perfis SET pode_producao = true, pode_importar = false
--  WHERE email = 'email.do.gerente@exemplo.com';

-- Conferir:
SELECT email, nome, pode_producao, pode_importar FROM perfis ORDER BY criado_em;


-- ------------------------------------------------------------
-- 1.2 Deixar o importador gravar com o token do login
--
-- O botão passou a gravar como `authenticated`, não mais com a
-- chave anônima. Sem estas policies, a importação manual daria
-- 403 mesmo para você.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION sou_importador() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.pode_importar);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

DROP POLICY IF EXISTS em_rua_importador ON em_rua;
CREATE POLICY em_rua_importador ON em_rua
  FOR ALL TO authenticated USING (sou_importador()) WITH CHECK (sou_importador());

DROP POLICY IF EXISTS execucao_write ON execucao;
DROP POLICY IF EXISTS execucao_importador ON execucao;
CREATE POLICY execucao_importador ON execucao
  FOR ALL TO authenticated USING (sou_importador()) WITH CHECK (sou_importador());

GRANT EXECUTE ON FUNCTION limpar_em_rua(DATE), limpar_execucao(DATE, DATE) TO authenticated;


-- ============================================================
--  PARTE 2 — fechar o anônimo
--
--  ATENÇÃO À ORDEM. Os três robôs gravam hoje com a chave anon.
--  Se você rodar a parte 2 antes de trocar a chave deles, eles
--  param de gravar na mesma hora e você só descobre no dia
--  seguinte, porque o robô do pendente sai com sucesso mesmo
--  quando falha.
--
--  ANTES de descomentar qualquer coisa abaixo:
--
--    1. Painel do Supabase -> Settings -> API -> copie a chave
--       `service_role` (a secreta, não a anon).
--    2. Cole no campo supabase.key dos TRÊS config.json:
--         robo-geocall\config.json
--         robo-executados\config.json
--         robo-resumo-dia\config.json
--       Ela roda no seu PC, nunca em navegador — é o lugar dela,
--       e já está no .gitignore de cada pasta.
--    3. Rode TESTAR_UM.bat nos três e confirme que gravaram.
--    4. Publique o site com este App.jsx (o fetchExecucao dele já
--       procura v_execucao_publica antes de execucao).
--
--  Só então descomente daqui pra baixo.
-- ============================================================

-- -- ----------------------------------------------------------
-- -- 2.1  As funções de apagar
-- --
-- -- Este é o furo maior do sistema hoje, e o que a etapa 2 antiga
-- -- não fechava. Toda função nova no Postgres nasce com EXECUTE
-- -- para PUBLIC, e SECURITY DEFINER roda com os direitos do dono,
-- -- ignorando o RLS. Ou seja: com a chave que está dentro do
-- -- bundle do site, uma requisição apaga a tabela inteira.
-- --
-- --   POST /rest/v1/rpc/limpar_execucao
-- --   {"p_ini":"1900-01-01","p_fim":"2999-12-31"}
-- --
-- -- O service_role dos robôs ignora RLS e continua chamando.
-- REVOKE EXECUTE ON FUNCTION limpar_em_rua(DATE)         FROM public, anon;
-- REVOKE EXECUTE ON FUNCTION limpar_execucao(DATE, DATE) FROM public, anon;
-- REVOKE EXECUTE ON FUNCTION limpar_pendente()           FROM public, anon;
-- REVOKE EXECUTE ON FUNCTION classificar_dia(DATE)       FROM public, anon;
-- REVOKE EXECUTE ON FUNCTION classificar_tudo()          FROM public, anon;
--
-- -- ----------------------------------------------------------
-- -- 2.2  A execução: leitura só para quem pode ver produção
-- --
-- -- A Carteira precisa de OS + TSS + dia para saber se uma baixa
-- -- foi executada. Não precisa de equipe, endereço nem observação.
-- -- View comum roda com os direitos do dono, então o anon lê por
-- -- ela sem ter direito na tabela.
-- CREATE OR REPLACE VIEW v_execucao_publica AS
--   SELECT numero_os, tss, dia FROM execucao;
-- GRANT SELECT ON v_execucao_publica TO anon, authenticated;
--
-- REVOKE ALL ON execucao FROM anon;
-- DROP POLICY IF EXISTS execucao_read ON execucao;
-- CREATE POLICY execucao_read_producao ON execucao
--   FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM perfis p
--                   WHERE p.id = auth.uid() AND p.pode_producao));
--
-- -- ----------------------------------------------------------
-- -- 2.3  As views esquecidas
-- --
-- -- Sete views leem a execucao e rodam com os direitos do dono.
-- -- Sem isto, a aba fica trancada e a porta dos fundos aberta:
-- -- v_execucao_equipe é, literalmente, dia + equipe + count(*).
-- -- Nenhuma delas alimenta a tela — a Carteira calcula no
-- -- navegador — então revogar não quebra nada.
-- REVOKE ALL ON v_execucao_equipe, v_baixa_familia, v_casamento_execucao,
--               v_passagem_equipe, v_producao_equipe, v_desfecho_dia,
--               v_causas_nao_mapeadas FROM anon, public;
-- ALTER VIEW v_execucao_equipe     SET (security_invoker = on);
-- ALTER VIEW v_baixa_familia       SET (security_invoker = on);
-- ALTER VIEW v_casamento_execucao  SET (security_invoker = on);
-- ALTER VIEW v_producao_detalhe    SET (security_invoker = on);
-- ALTER VIEW v_producao_equipe_dia SET (security_invoker = on);
-- GRANT SELECT ON v_producao_detalhe, v_producao_equipe_dia TO authenticated;
--
-- -- ----------------------------------------------------------
-- -- 2.4  Escrita anônima nas outras tabelas
-- --
-- -- As policies de pendente_diario_os e pendente_historico foram
-- -- criadas sem cláusula TO, o que as torna válidas para PUBLIC —
-- -- inclusive INSERT e UPDATE anônimos. Um DELETE em
-- -- pendente_diario_os apaga o histórico de snapshots, e ele NÃO
-- -- é reconstruível: o GEOCALL só devolve o pendente de agora.
-- REVOKE INSERT, UPDATE, DELETE ON em_rua             FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_os        FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_diario_os FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_historico FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_meta      FROM anon;
--
-- DROP POLICY IF EXISTS em_rua_anon_insert ON em_rua;
-- DROP POLICY IF EXISTS em_rua_anon_delete ON em_rua;


-- ------------------------------------------------------------
-- Conferência depois da parte 2 — as duas primeiras têm que
-- falhar, as duas últimas têm que funcionar:
--
--   SET ROLE anon;  SELECT limpar_em_rua('2020-01-01');      -- erro
--   SET ROLE anon;  SELECT count(*) FROM execucao;           -- erro
--   RESET ROLE;
--   SET ROLE anon;  SELECT count(*) FROM v_execucao_publica; -- ok
--   SET ROLE anon;  SELECT count(*) FROM em_rua;             -- ok (a TV lê)
--   RESET ROLE;
-- ------------------------------------------------------------
