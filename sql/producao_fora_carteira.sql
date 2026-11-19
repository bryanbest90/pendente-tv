-- ============================================================
-- O QUE FOI EXECUTADO SEM NUNCA TER PASSADO PELA CARTEIRA
-- ============================================================
--
-- POR QUE ISSO EXISTE
--
-- A aba Produção tem duas contas que não batem, e as duas estão
-- certas: o painel de baixo conta PRODUÇÃO (linhas de execução) e o
-- gráfico conta MOVIMENTO DE CARTEIRA (serviço que estava na foto de
-- ontem e não está na de hoje). Em 16/11/2026 deu 332 contra 244, e a
-- diferença é inteira de um grupo só: serviços executados que a
-- carteira nunca viu.
--
-- Eles existem porque a foto é tirada uma vez por dia. Um serviço que
-- abre às 9h e é baixado às 15h nasce e morre entre duas fotos — a
-- equipe trabalhou, mas a carteira nunca soube que ele existiu. Em
-- 01/10/2026 eram 126, 40% das baixas do dia. Quando a conta da
-- carteira foi arrumada, eles ficaram fora do gráfico de propósito,
-- porque não são movimento de carteira, e ficou anotado que mereciam
-- um número próprio. É este.
--
-- A DEFINIÇÃO, E POR QUE NÃO É "DO DIA ANTERIOR"
--
-- "Não estava na foto de ontem" dá 88 em 16/11. "Nunca esteve em foto
-- nenhuma" dá 86. Os dois de diferença são serviços que apareceram em
-- fotos antigas, sumiram e voltaram — esses JÁ passaram pela carteira
-- e não pertencem a este grupo. A view usa a segunda definição, que
-- é a que não muda conforme o dia que você olha.
--
-- O par é (numero_os, tss), como em toda a casa — e a comparação é
-- pelo nome do serviço porque é o que as duas tabelas têm em comum.
--
-- CONFERÊNCIA (as consultas no fim do arquivo)
-- Em 16/11/2026: 332 linhas executadas, 86 delas fora da carteira.
-- (18/11/2026)

-- O `dia_tem_foto` existe porque sem ele esta conta MENTE em dia que o
-- robô não rodou: se não houve foto, nenhum serviço daquele dia está em
-- foto nenhuma, e TODOS pareceriam "fora da carteira". Aconteceu de
-- verdade: em 17 e 18/11/2026 a foto não saiu, e a taxa saltou de ~26%
-- para 71,6% — número falso, e justamente num dia em que o robô estava
-- com problema. A tela conta só os dias com foto e avisa dos outros.
CREATE OR REPLACE VIEW v_producao_fora_carteira AS
SELECT e.dia,
       e.atc,
       COALESCE(NULLIF(btrim(e.equipe), ''), '(sem equipe)') AS equipe,
       e.familia,
       e.numero_os,
       e.tss,
       e.tse,
       EXISTS (SELECT 1 FROM pendente_diario_os f WHERE f.dia = e.dia) AS dia_tem_foto
  FROM execucao e
 WHERE e.executado IS NOT FALSE          -- mesma régua do v_producao_detalhe
   AND NOT EXISTS (
         SELECT 1
           FROM pendente_diario_os d
          WHERE d.numero_os = e.numero_os
            AND btrim(COALESCE(d.tss, '')) = btrim(COALESCE(e.tss, '')));

-- A view enxerga só o que quem pergunta pode ver.
ALTER VIEW v_producao_fora_carteira SET (security_invoker = on);

-- A Produção é restrita, e esta view mostra OS uma a uma. Fica fora da
-- chave anônima do navegador, como o resto da aba.
REVOKE ALL ON v_producao_fora_carteira FROM anon;
GRANT SELECT ON v_producao_fora_carteira TO authenticated;

-- Sem isto o NOT EXISTS varre as 76 mil linhas de foto a cada execução.
CREATE INDEX IF NOT EXISTS pendente_diario_os_os_idx ON pendente_diario_os (numero_os);

-- ============================================================
-- DIAS SEM FOTO — o aviso que a tela mostra
-- ============================================================
-- Um dia sem foto não é um dia sem carteira: é um dia em que o robô
-- não chegou a tirar o retrato. Quem olha a tela precisa saber disso,
-- senão lê um número inflado como se fosse produção boa.
CREATE OR REPLACE VIEW v_dias_sem_foto AS
SELECT d::date AS dia
  FROM generate_series(
         (SELECT min(dia) FROM pendente_diario_os),
         current_date - 1,
         interval '1 day') AS d
 WHERE NOT EXISTS (SELECT 1 FROM pendente_diario_os f WHERE f.dia = d::date);

ALTER VIEW v_dias_sem_foto SET (security_invoker = on);
REVOKE ALL ON v_dias_sem_foto FROM anon;
GRANT SELECT ON v_dias_sem_foto TO authenticated;

-- ============================================================
-- CONFERÊNCIA — rode e compare com a tela
-- ============================================================
-- 1) o dia que a gente discutiu: tem de dar 332 e 86
SELECT 'executadas em 16/11'            AS conferir,
       count(*)::text                   AS valor
  FROM execucao WHERE dia = '2026-11-16' AND executado IS NOT FALSE
UNION ALL
SELECT 'destas, fora da carteira',
       count(*)::text
  FROM v_producao_fora_carteira WHERE dia = '2026-11-16';

-- 2) a lista, para conferir no GEOCALL uma por uma
SELECT numero_os, tss, tse, equipe, familia
  FROM v_producao_fora_carteira
 WHERE dia = '2026-11-16'
 ORDER BY familia, numero_os
 LIMIT 20;

-- 3) a prova de uma: pegue um numero_os da lista acima e veja que ele
--    não aparece em foto NENHUMA (tem de voltar zero linhas)
-- SELECT dia, tss FROM pendente_diario_os WHERE numero_os = '<cole aqui>';

-- 4) peso do grupo nos últimos dias — para ver se 86 é um dia típico
SELECT e.dia,
       count(*)                                            AS executadas,
       count(*) FILTER (WHERE f.numero_os IS NOT NULL)     AS fora_da_carteira,
       round(100.0 * count(*) FILTER (WHERE f.numero_os IS NOT NULL) / count(*), 1) AS pct
  FROM execucao e
  LEFT JOIN v_producao_fora_carteira f
         ON f.dia = e.dia AND f.numero_os = e.numero_os
        AND btrim(COALESCE(f.tss,'')) = btrim(COALESCE(e.tss,''))
 WHERE e.executado IS NOT FALSE
   AND e.dia >= current_date - 14
 GROUP BY 1 ORDER BY 1 DESC;

-- ============================================================
-- PARA DESFAZER
-- ============================================================
--   DROP VIEW IF EXISTS v_producao_fora_carteira;
-- O cartão some da tela sozinho: ele só aparece se a view responder.
-- O índice pode ficar, não atrapalha nada.
