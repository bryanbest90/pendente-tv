-- ============================================================
-- A ABA IDG FICA SÓ PARA QUEM VOCÊ LIBERAR
--
-- Rode no SQL Editor depois do sql/isap_espelho.sql.
--
-- POR QUE UMA PERMISSÃO PRÓPRIA, E NÃO A DA PRODUÇÃO
-- A aba nasceu pendurada no `pode_producao`, que hoje a equipe toda tem.
-- Mas o IDG não é produção: é o número pelo qual o contrato é medido, e
-- enquanto a regra do espelho não estiver confirmada com a Sabesp, ele
-- ainda pode mudar. Número de contrato circulando antes de estar fechado
-- vira boato, e boato não se recolhe.
--
-- Por isso vai em coluna própria. Liberar depois é um UPDATE; voltar
-- atrás, outro. Mesmo desenho do `pode_cadastro`.
-- ============================================================

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pode_idg BOOLEAN NOT NULL DEFAULT false;

-- Você. Troque o e-mail se for outro.
UPDATE perfis SET pode_idg = true WHERE email = 'bmdeodato@gmail.com';


-- ---------- As views do IDG passam a exigir isso ----------
-- Esconder a aba no site não protege nada: a view continuaria legível
-- por qualquer um logado, pela chave do navegador. A trava tem de estar
-- no banco — é o mesmo raciocínio do Cadastro.
--
-- security_invoker = off faz a view rodar com os direitos de quem a
-- criou, e a checagem de perfil acontece dentro dela. Assim a `execucao`
-- continua fechada e só o IDG é liberado para quem tem a marca.
CREATE OR REPLACE VIEW v_idg_seguro AS
  SELECT * FROM v_idg
   WHERE EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.pode_idg);

ALTER VIEW v_idg_seguro SET (security_invoker = off);
REVOKE ALL ON v_idg_seguro FROM anon;
GRANT SELECT ON v_idg_seguro TO authenticated;

-- A régua não é segredo: é a lista de serviços e prazos do contrato,
-- a mesma que a Sabesp manda. Continua legível.


-- ---------- Conferência ----------
-- Quem enxerga a aba:
--   SELECT email, nome, pode_idg FROM perfis WHERE pode_idg;
--
-- Para liberar mais alguém depois:
--   UPDATE perfis SET pode_idg = true WHERE email = 'fulano@empresa';
--
-- Para tirar:
--   UPDATE perfis SET pode_idg = false WHERE email = 'fulano@empresa';
--
-- Teste de que a trava é real, e não só a aba sumindo da tela:
-- entre com um usuário SEM pode_idg e rode
--   SELECT count(*) FROM v_idg_seguro;
-- Tem que voltar 0, não erro — a view existe, mas não devolve linha.
-- ============================================================
