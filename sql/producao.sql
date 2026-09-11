-- ============================================================
-- PRODUÇÃO POR EQUIPES — acesso restrito
--
-- A aba "Produção" mostra, por período: equipe × TSS × quantidade.
-- O dado já existe todo em `execucao` (vem do Relatório de Dados
-- Operacionais, robô das 00:30). Nada novo precisa ser coletado.
--
-- O que este arquivo faz é o CONTROLE DE ACESSO, e ele tem duas
-- etapas separadas de propósito:
--
--   ETAPA 1 (rode agora)  — cria o login e a lista de quem enxerga
--                           a aba. A aba some para quem não está na
--                           lista. Nada mais muda.
--
--   ETAPA 2 (quando quiser) — fecha o buraco de verdade: hoje a
--                           chave anônima que vai no site consegue
--                           LER e ESCREVER em tudo. Enquanto a
--                           etapa 2 não roda, esconder a aba é
--                           cosmético: quem abrir o console do
--                           navegador lê a tabela do mesmo jeito.
--
-- Digo isso claramente porque a etapa 1 sozinha parece resolver e
-- não resolve. Se "só eu posso ver" for pra valer, é a etapa 2.
-- ============================================================


-- ============================================================
--  ETAPA 1 — LOGIN E LISTA DE ACESSO
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 Tabela de perfis
--
-- Um registro por usuário do Supabase Auth. `pode_producao`
-- é o que libera a aba. Para dar acesso a alguém depois, você
-- cria o usuário no painel e marca true aqui — não precisa
-- mexer no site.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfis (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  nome          TEXT,
  pode_producao BOOLEAN NOT NULL DEFAULT false,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

-- Cada um lê só o próprio perfil. Ninguém lê a lista dos outros,
-- nem descobre quem mais tem acesso.
DROP POLICY IF EXISTS perfis_self_read ON perfis;
CREATE POLICY perfis_self_read ON perfis
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Ninguém se promove sozinho: não existe policy de INSERT/UPDATE
-- para `authenticated`. Alterar a lista só pelo painel do Supabase
-- (que roda como service_role e ignora RLS).


-- ------------------------------------------------------------
-- 1.2 Perfil criado junto com o usuário
--
-- Sem isso, todo usuário novo entra sem linha em `perfis` e o
-- site não sabe o que fazer com ele. Entra sempre negado, e você
-- libera marcando true.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO perfis (id, email, pode_producao)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_criar_perfil ON auth.users;
CREATE TRIGGER trg_criar_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION criar_perfil_novo_usuario();

-- Usuários que já existiam antes do trigger:
INSERT INTO perfis (id, email, pode_producao)
SELECT u.id, u.email, false FROM auth.users u
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------
-- 1.3 DEPOIS de criar seu usuário no painel
--     (Authentication -> Users -> Add user, com "Auto Confirm
--      User" marcado — senão ele fica esperando confirmação
--      de e-mail que nunca chega)
--
-- Troque o e-mail e rode:
-- ------------------------------------------------------------
-- UPDATE perfis SET pode_producao = true, nome = 'Bryan'
--  WHERE email = 'bmdeodato@gmail.com';

-- Conferir:
-- SELECT email, nome, pode_producao FROM perfis ORDER BY criado_em;


-- ------------------------------------------------------------
-- 1.4 Views de produção
--
-- A conta é feita no banco, não no navegador: o período de um mês
-- tem ~7 mil linhas, e trazer tudo pro browser só pra somar é
-- desperdício. O site usa a view quando ela existe.
--
-- TSS = serviço que foi PEDIDO.  TSE = serviço que foi FEITO.
-- Eles divergem em ~93% das linhas, então as duas colunas ficam
-- aqui e o site alterna entre elas com um botão. Você pediu TSS;
-- TSE está junto porque, pra medir produção, quase sempre é ele
-- que responde "o que essa equipe fez".
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_producao_detalhe AS
SELECT dia,
       COALESCE(NULLIF(btrim(equipe), ''), '(sem equipe)') AS equipe,
       COALESCE(NULLIF(btrim(tss),    ''), '(sem TSS)')    AS tss,
       COALESCE(NULLIF(btrim(tse),    ''), '(sem TSE)')    AS tse,
       atc,
       municipio,
       count(*)                  AS qtd,
       count(DISTINCT numero_os) AS os_distintas
  FROM execucao
 GROUP BY 1,2,3,4,5,6;

-- Ranking por equipe no período (usada nos cartões e na lista)
CREATE OR REPLACE VIEW v_producao_equipe_dia AS
SELECT dia,
       COALESCE(NULLIF(btrim(equipe), ''), '(sem equipe)') AS equipe,
       count(*)                  AS execucoes,
       count(DISTINCT numero_os) AS os_distintas,
       count(DISTINCT tss)       AS tipos_tss,
       count(DISTINCT tse)       AS tipos_tse
  FROM execucao
 GROUP BY 1,2;

-- As duas views ficam fora do alcance do anon já na etapa 1. Ainda dá
-- para ler a tabela `execucao` crua com a chave anônima (é isso que a
-- etapa 2 fecha), mas a produção mastigada por equipe, não.
REVOKE ALL ON v_producao_detalhe, v_producao_equipe_dia FROM anon;
GRANT SELECT ON v_producao_detalhe, v_producao_equipe_dia TO authenticated;
GRANT SELECT ON perfis TO authenticated;


-- ============================================================
--  ETAPA 2 — FECHAR O ACESSO DE VERDADE
--
--  NÃO RODE ISTO SEM FAZER OS DOIS PASSOS ABAIXO ANTES.
--  Se rodar antes, os robôs param de gravar no mesmo minuto.
-- ============================================================
--
-- Situação de hoje: a chave `anon` está dentro do bundle do site
-- (qualquer visitante lê ela em 10 segundos) e essa mesma chave é
-- a que os três robôs usam para GRAVAR. Ou seja: quem abre o site
-- pode apagar a `execucao`, a `em_rua` e o pendente inteiro. Não é
-- teórico — é um DELETE de uma linha no console.
--
-- A separação correta:
--
--   anon         (vai no navegador)  -> só lê o mínimo, não escreve
--   service_role (fica nos robôs)    -> escreve, nunca sai do seu PC
--   authenticated + perfis           -> lê produção (equipe, TSE)
--
--
-- PASSO A — trocar a chave dos robôs
--
--   Painel do Supabase -> Settings -> API -> Project API keys
--   -> copie a `service_role` (a secreta, não a anon)
--
--   Cole no campo supabase.key dos TRÊS config.json:
--     robo-geocall\config.json
--     robo-executados\config.json
--     robo-resumo-dia\config.json
--
--   Ela já está no .gitignore de cada pasta. Ela roda no seu PC,
--   não em navegador — é exatamente o lugar dela.
--
--   Rode TESTAR_UM.bat nos três e confirme que gravaram.
--
--
-- PASSO B — atualizar o site
--
--   O App.jsx desta versão já procura `v_execucao_publica` antes
--   de `execucao`, então a aba Carteira continua funcionando
--   depois do bloqueio. Publique o site atualizado ANTES de rodar
--   o SQL abaixo.
--
--
-- Só então, descomente daqui pra baixo e rode:
-- ------------------------------------------------------------

-- -- B.1  View mínima para a Carteira: OS, TSS e dia. Sem equipe,
-- --      sem endereço, sem observação. É tudo que a coluna Baixas
-- --      precisa para saber se um par (OS,TSS) foi executado.
-- --      View comum roda com os direitos do dono, então o anon lê
-- --      através dela sem ter direito na tabela.
-- CREATE OR REPLACE VIEW v_execucao_publica AS
--   SELECT numero_os, tss, dia FROM execucao;
-- GRANT SELECT ON v_execucao_publica TO anon, authenticated;
--
-- -- B.2  Fecha a tabela para o anon
-- REVOKE ALL ON execucao FROM anon;
-- DROP POLICY IF EXISTS execucao_read  ON execucao;
-- DROP POLICY IF EXISTS execucao_write ON execucao;
--
-- --      Leitura completa (com equipe e TSE): só quem está na lista
-- CREATE POLICY execucao_read_producao ON execucao
--   FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM perfis p
--                   WHERE p.id = auth.uid() AND p.pode_producao));
--
-- --      Escrita: ninguém por policy. O service_role dos robôs
-- --      ignora RLS, então eles continuam gravando normalmente.
--
-- -- B.3  As views de produção herdam o mesmo bloqueio, porque
-- --      lêem `execucao`. Force security_invoker para que a RLS
-- --      da tabela valha para quem consulta a view.
-- ALTER VIEW v_producao_detalhe    SET (security_invoker = on);
-- ALTER VIEW v_producao_equipe_dia SET (security_invoker = on);
-- GRANT SELECT ON v_producao_detalhe, v_producao_equipe_dia TO authenticated;
--
-- -- B.4  Mesmo tratamento para as outras duas tabelas que hoje
-- --      aceitam escrita anônima.
-- REVOKE INSERT, UPDATE, DELETE ON em_rua      FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_os FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_diario_os FROM anon;
-- REVOKE INSERT, UPDATE, DELETE ON pendente_historico FROM anon;

-- ------------------------------------------------------------
-- Conferência depois da etapa 2 — as duas primeiras têm que
-- falhar/voltar vazio, a terceira tem que funcionar:
--
--   SET ROLE anon;  SELECT count(*) FROM execucao;            -- erro
--   SET ROLE anon;  SELECT count(*) FROM v_execucao_publica;  -- ok
--   RESET ROLE;
-- ------------------------------------------------------------