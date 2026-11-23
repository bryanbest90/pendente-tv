-- ============================================================
-- A LISTA DE OS DENTRO DA PRODUÇÃO
--
-- POR QUE
--
-- A aba Equipe x TSE do Excel diz que o MATHEUS fez 5 serviços de
-- FALTA DE AGUA LOCAL ATENDIDA. Para conferir a foto de cada um, o
-- Bryan precisa dos 5 números. A `v_producao_detalhe` entrega só a
-- contagem (`count(*)`), então os números não chegavam ao arquivo.
--
-- A SOLUÇÃO, E POR QUE ELA É ASSIM
--
-- Acrescenta `os_lista` À PRÓPRIA VIEW, em vez de criar uma consulta
-- separada que buscasse as OS por conta própria. As 5 OS listadas
-- passam a sair da MESMA linha que produziu o número 5 — não tem como
-- uma dizer 5 e a outra listar 4. Consulta paralela é regra copiada, e
-- regra copiada é regra que diverge.
--
-- CUIDADO AO RODAR
--
-- A `v_producao_detalhe` nasce no `sql/isap_execucao.sql`. **Não rode
-- aquele arquivo** para aplicar esta mudança: ele também cria a
-- `v_idg`, com 18 colunas, e apagaria o `no_espelho` da versão viva
-- (a do `isap_espelho.sql`). É a armadilha que já está no CLAUDE.md.
-- Este arquivo toca só na view da produção.
--
-- A coluna nova entra NO FIM da lista, que é a única posição que o
-- `CREATE OR REPLACE VIEW` aceita — mexer na ordem dá erro 42P16.
-- Como é uma substituição, e não um DROP, as permissões e o
-- `security_invoker` que a view já tem são preservados: não há GRANT
-- nenhum aqui de propósito.
-- (23/11/2026)
-- ============================================================

CREATE OR REPLACE VIEW v_producao_detalhe AS
SELECT dia,
       COALESCE(NULLIF(btrim(equipe), ''), '(sem equipe)') AS equipe,
       COALESCE(NULLIF(btrim(tss),    ''), '(sem TSS)')    AS tss,
       COALESCE(NULLIF(btrim(tse),    ''), '(sem TSE)')    AS tse,
       atc,
       municipio,
       count(*)                  AS qtd,
       count(DISTINCT numero_os) AS os_distintas,
       -- Os números por trás do `qtd`. DISTINCT porque a mesma OS pode
       -- ter duas etapas no mesmo serviço; ordenado para o Excel sair
       -- sempre na mesma sequência.
       array_agg(DISTINCT numero_os ORDER BY numero_os) AS os_lista
  FROM execucao
 GROUP BY 1,2,3,4,5,6;


-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- A) A LISTA BATE COM A CONTAGEM? `os_distintas` e o tamanho da lista
--    têm de ser iguais em TODAS as linhas. Diferente de zero aqui
--    significa que uma das duas está errada.
--
-- SELECT count(*) AS linhas_com_divergencia
--   FROM v_producao_detalhe
--  WHERE os_distintas <> cardinality(os_lista);

-- B) O CASO DO BRYAN, para olhar com os olhos:
--
-- SELECT dia, equipe, tse, qtd, os_distintas, os_lista
--   FROM v_producao_detalhe
--  WHERE dia = '2026-11-19'
--    AND equipe ILIKE '%MATHEUS%'
--  ORDER BY qtd DESC;

-- C) A MESMA OS EM ETAPAS DIFERENTES — é o que ele descreveu: a OS
--    aparece em mais de uma linha, uma por etapa, mantendo o número.
--
-- SELECT numero_os, count(*) AS etapas, array_agg(DISTINCT tse) AS servicos
--   FROM execucao
--  WHERE dia = '2026-11-19'
--  GROUP BY 1 HAVING count(*) > 1
--  ORDER BY 2 DESC LIMIT 10;


-- ============================================================
-- DESFAZER
-- ============================================================
-- Volta a view ao que era, sem a coluna. O site continua funcionando:
-- ele pede `os_lista` junto com o resto e, se a coluna não existir, a
-- busca falha e a Produção cai no caminho reserva, que lê a `execucao`
-- direto. A aba nova do Excel some, as outras ficam.
--
-- Para reverter de verdade, rode este mesmo arquivo com a linha do
-- `array_agg` removida — nunca o isap_execucao.sql inteiro.
