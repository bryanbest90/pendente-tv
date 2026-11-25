-- ============================================================
-- QUEM ADMINISTRA A ANÁLISE
--
-- Roda uma vez, no SQL Editor. Acrescenta uma permissão e duas
-- regras; não apaga nada.
--
-- O QUE ELA DÁ: apagar um pedido pela tela, e ver quem pediu.
--
-- POR QUE NO BANCO E NÃO SÓ NA TELA: esconder o botão não impede
-- ninguém de chamar o banco direto com a chave do navegador. É a
-- mesma razão da aba IDG, que é protegida pela v_idg_seguro e não
-- por estar escondida. (Bryan, 13/10/2026)
--
-- O QUE ELA *NÃO* FAZ, e é importante dizer: o nome de quem pediu
-- fica numa coluna comum da analise_pedido. A tela só mostra para
-- quem administra, mas quem souber consultar a tabela lê. Para ser
-- segredo de verdade teria de sair da tabela e virar uma view
-- separada — dá para fazer, é só pedir.
-- ============================================================

-- ---------- 1. a permissão ----------
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS analise_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN perfis.analise_admin IS
  'Pode apagar pedidos da aba Análise e ver quem pediu cada um.';

CREATE OR REPLACE FUNCTION eh_analise_admin() RETURNS BOOLEAN
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT analise_admin FROM perfis WHERE id = auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION eh_analise_admin() FROM anon;
GRANT EXECUTE ON FUNCTION eh_analise_admin() TO authenticated;


-- ---------- 2. quem pediu ----------
-- Guardado no momento do pedido. Sai do perfil de quem clicou, e não
-- de uma busca pelo uuid depois: o perfil pode mudar de nome, e o que
-- interessa é quem pediu naquele dia.
ALTER TABLE analise_pedido ADD COLUMN IF NOT EXISTS pedido_por_nome TEXT;


-- ---------- 3. apagar ----------
DROP POLICY IF EXISTS analise_pedido_apagar ON analise_pedido;
CREATE POLICY analise_pedido_apagar ON analise_pedido
  FOR DELETE TO authenticated USING (eh_analise_admin());

-- As fotos no bucket são apagadas pela própria tela, junto com o
-- pedido. Sem esta regra as linhas sumiriam e os arquivos ficariam
-- órfãos, ocupando espaço que ninguém mais sabe de quem é.
DROP POLICY IF EXISTS analise_fotos_apagar ON storage.objects;
CREATE POLICY analise_fotos_apagar ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'analise-fotos' AND eh_analise_admin());


-- ---------- 4. a chave anônima não alcança nada disso ----------
-- O DEFAULT PRIVILEGES do Supabase dá acesso ao anon sozinho, então
-- o REVOKE vem DEPOIS de qualquer GRANT.
REVOKE ALL ON analise_pedido FROM anon;


-- ---------- 5. quem é o administrador ----------
-- Tire o -- da linha e rode.
-- UPDATE perfis SET analise_admin = true WHERE email = 'bmdeodato@gmail.com';


-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- A) Tem de aparecer só o Bryan.
-- SELECT email, nome, analise_admin FROM perfis WHERE analise_admin;

-- B) As duas regras novas existem?
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE policyname IN ('analise_pedido_apagar','analise_fotos_apagar');

-- C) A chave anônima não escreve nem apaga: tem de vir VAZIO.
-- SELECT privilege_type FROM information_schema.role_table_grants
--  WHERE grantee='anon' AND table_name='analise_pedido';


-- ============================================================
-- DESFAZER
-- ============================================================
-- DROP POLICY IF EXISTS analise_pedido_apagar ON analise_pedido;
-- DROP POLICY IF EXISTS analise_fotos_apagar ON storage.objects;
-- DROP FUNCTION IF EXISTS eh_analise_admin();
-- ALTER TABLE perfis DROP COLUMN IF EXISTS analise_admin;
-- ALTER TABLE analise_pedido DROP COLUMN IF EXISTS pedido_por_nome;
