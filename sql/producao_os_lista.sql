-- ============================================================
-- v_producao_detalhe — RESTAURAR O FILTRO + a lista de OS
--
-- LEIA ISTO ANTES: ESTE ARQUIVO CONSERTA UM ESTRAGO MEU
--
-- Em 23/11/2026 eu recriei esta view copiando a definição do
-- `sql/isap_execucao.sql`. A view VIVA no banco não era aquela: ela
-- tinha um `WHERE executado IS TRUE` que o arquivo do repositório
-- nunca teve. Sem o filtro, a Produção do dia 19/11 pulou de 236 para
-- 514 execuções e de 40 para 51 equipes — passou a contar toda baixa
-- da tabela, inclusive as não executadas e as repetidas da mesma OS.
--
-- A regra que eu quebrei está escrita no CLAUDE.md desde 16/10 e eu a
-- tinha citado ao Bryan na mesma manhã: **antes de recriar qualquer
-- view deste projeto, olhar o que ela REALMENTE é** — `SELECT
-- pg_get_viewdef('v_producao_detalhe'::regclass, true);`. Arquivo no
-- repositório não é prova do que está no banco.
--
-- O filtro foi reencontrado medindo, não lembrando: das seis
-- candidatas testadas em 19/11, só `executado IS TRUE` devolveu
-- exatamente 236. (`IS NOT FALSE` deu o mesmo número nesse dia porque
-- não há `executado` nulo nele; o `IS TRUE` é o que casa com o rótulo
-- da planilha, "execuções confirmadas".)
--
-- A COLUNA NOVA, que era o pedido original
--
-- `os_lista` traz os números por trás de cada contagem. A aba
-- Equipe x TSE diz que o MATHEUS fez 5 de FALTA DE AGUA LOCAL
-- ATENDIDA; para conferir a foto de cada um, é preciso os 5 números.
-- Ela sai da MESMA linha que gerou o 5 — consulta paralela seria
-- regra copiada, e regra copiada diverge.
--
-- CUIDADO AO RODAR
--
-- **Não rode o `sql/isap_execucao.sql`** para mexer nesta view: ele
-- também cria a `v_idg`, com 18 colunas, e apagaria o `no_espelho` da
-- versão viva (a do `isap_espelho.sql`). Este arquivo toca só aqui.
--
-- É uma substituição, não um DROP, então as permissões e o
-- `security_invoker` que a view já tem são preservados — por isso não
-- há GRANT nenhum aqui.
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
 WHERE executado IS TRUE          -- <<< o filtro que eu havia apagado
 GROUP BY 1,2,3,4,5,6;


-- ============================================================
-- CONFERÊNCIA — rode junto, não depois
-- ============================================================

-- A) OS TRÊS NÚMEROS DO DIA 19/11 TÊM DE VOLTAR AO QUE ERAM.
--    Saíram do Excel que o Bryan gerou às 07:39, antes do estrago:
--    236 execuções, 40 equipes, 56 tipos de TSE.
--
-- SELECT sum(qtd)                AS execucoes,   -- 236
--        count(DISTINCT equipe)  AS equipes,     -- 40
--        count(DISTINCT tse)     AS tipos_tse    -- 56
--   FROM v_producao_detalhe
--  WHERE dia = '2026-11-19';

-- B) A LISTA BATE COM A CONTAGEM? Tem de dar zero em todas as linhas.
--
-- SELECT count(*) AS linhas_com_divergencia
--   FROM v_producao_detalhe
--  WHERE os_distintas <> cardinality(os_lista);

-- C) O `executado` NULO MUDA ALGUMA COISA? Se `nulos` for zero, o
--    `IS TRUE` e o `IS NOT FALSE` dão o mesmo em qualquer período e a
--    escolha entre os dois não tem consequência. Se não for, o número
--    de dias antigos depende dessa escolha — e aí vale conferir contra
--    um relatório velho antes de confiar.
--
-- SELECT count(*) FILTER (WHERE executado IS NULL)  AS nulos,
--        count(*) FILTER (WHERE executado IS TRUE)  AS verdadeiros,
--        count(*) FILTER (WHERE executado IS FALSE) AS falsos,
--        count(*)                                   AS total
--   FROM execucao;

-- D) O CASO QUE ORIGINOU A COLUNA, para olhar com os olhos:
--
-- SELECT equipe, tse, qtd, os_distintas, os_lista
--   FROM v_producao_detalhe
--  WHERE dia = '2026-11-19' AND equipe ILIKE '%MATHEUS%'
--  ORDER BY qtd DESC;


-- ============================================================
-- DESFAZER
-- ============================================================
-- Para tirar só a coluna nova e deixar a view como estava ANTES de
-- tudo isto, rode este mesmo arquivo sem a linha do `array_agg`. O
-- `WHERE executado IS TRUE` tem de ficar nos dois casos — ele é a
-- view original, não parte da mudança.
