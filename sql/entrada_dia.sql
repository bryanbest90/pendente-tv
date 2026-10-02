-- ============================================================
-- O QUE ENTROU NA CARTEIRA EM CADA DIA
--
-- Rode no SQL Editor do Supabase. Depois de sql/entrada_carteira.sql
-- (que já criou a v_os_entrada e o índice por numero_os).
--
-- A v_os_entrada responde "desde quando esta OS está na carteira".
-- Esta aqui responde outra coisa: "o que apareceu HOJE que não estava
-- ontem". É a coluna Entradas da aba Pendente.
--
-- TRÊS DECISÕES, e cada uma tem um motivo:
--
-- 1. AGRUPA PELO PAR (numero_os, tss), não só pela OS.
--    É o oposto da v_os_entrada, de propósito. Lá a pergunta é sobre
--    a OS, e contar o par faria uma OS parada há meses parecer nova
--    quando ela troca de TSS. Aqui a pergunta é sobre a FAMÍLIA: a
--    reposição que nasceu hoje é trabalho novo que entrou na família
--    reposição, mesmo que a OS seja velha. Contar por OS esconderia
--    exatamente o que a coluna quer mostrar.
--
-- 2. COMPARA COM A FOTO ANTERIOR, não com ontem no calendário.
--    O robô não roda todo dia: em 45 dias de série faltam o 28/09 e
--    os fins de semana. Comparando com "ontem" literal, o dia
--    seguinte a um buraco mostraria zero entrada (não existe foto de
--    ontem para comparar) ou o acúmulo inteiro sem avisar. A view
--    devolve `dias_desde` para a tela poder dizer "são 3 dias".
--
-- 3. A PRIMEIRA FOTO DA SÉRIE conta tudo como entrada.
--    Em 16/08 as 987 linhas aparecem como se tivessem entrado
--    naquele dia. Não é verdade, e ninguém guardou a verdade. A view
--    marca esse dia com dia_anterior IS NULL para a tela avisar em
--    vez de mentir.
-- ============================================================

-- O NOT EXISTS lá embaixo procura (dia anterior, OS, TSS). Sem este
-- índice ele varre as 44 mil linhas uma vez por linha do dia.
CREATE INDEX IF NOT EXISTS pendente_diario_os_dia_os_tss
  ON pendente_diario_os (dia, numero_os, tss);

-- ---------- Os dias que temos foto ----------
-- Pequena (45 linhas) e serve para duas coisas: encher o seletor de
-- data da tela só com dias que existem, e dizer o tamanho do buraco.
CREATE OR REPLACE VIEW v_dias_pendente AS
SELECT dia,
       lag(dia) OVER (ORDER BY dia)                      AS dia_anterior,
       (dia - lag(dia) OVER (ORDER BY dia))::int         AS dias_desde
  FROM (SELECT DISTINCT dia FROM pendente_diario_os) d;

GRANT SELECT ON v_dias_pendente TO anon, authenticated;

-- ---------- O que entrou em cada dia ----------
CREATE OR REPLACE VIEW v_entrada_dia AS
SELECT d.dia,
       d.numero_os,
       d.tss,
       d.familia,
       d.unidade,
       d.fora_prazo,
       d.endereco,
       d.numero_end,
       d.complemento,
       x.dia_anterior,
       x.dias_desde
  FROM pendente_diario_os d
  JOIN v_dias_pendente x ON x.dia = d.dia
 WHERE x.dia_anterior IS NULL          -- primeira foto: tudo é "entrada"
    OR NOT EXISTS (
         SELECT 1
           FROM pendente_diario_os p
          WHERE p.dia       = x.dia_anterior
            AND p.numero_os = d.numero_os
            AND p.tss       = d.tss);

GRANT SELECT ON v_entrada_dia TO anon, authenticated;

-- ---------- Que famílias a série diária enxerga ----------
-- Existe porque as duas listas de exclusão divergiram: o site
-- (EXCLUDED_DISPLAY) esconde 5 famílias e o robô
-- (EXCLUDED_FAMILIES, no robo-geocall/index.js) esconde 6 — ele tem
-- DESOBSTRUÇÃO a mais. Resultado: DESOBSTRUÇÃO aparece na aba
-- Pendente, 22 OS hoje, e nunca entrou na foto diária. A coluna
-- Entradas mostraria 0 para sempre, sem dizer por quê.
--
-- Com esta view a tela sabe a diferença entre "não entrou nada" e
-- "não dá para saber", e marca a segunda com um traço. No dia em que
-- o robô parar de excluir DESOBSTRUÇÃO, ela passa a aparecer aqui
-- sozinha e o traço some — sem precisar mexer no site.
CREATE OR REPLACE VIEW v_familias_diario AS
SELECT DISTINCT familia FROM pendente_diario_os WHERE familia IS NOT NULL;

GRANT SELECT ON v_familias_diario TO anon, authenticated;


-- ---------- Conferência ----------
-- Entradas por dia nas últimas duas semanas (a tela mostra isto):
--   SELECT dia, dias_desde, count(*) AS entradas
--     FROM v_entrada_dia
--    WHERE dia >= current_date - 14
--    GROUP BY 1,2 ORDER BY 1;
--
-- Em 01/10 deu 242, e os dias úteis ficam entre 220 e 270. Fim de
-- semana cai para 70-120. O 29/09 aparece com 353 porque vem depois
-- de três dias sem foto — é o acúmulo, não um pico.
--
-- Por família num dia:
--   SELECT familia, count(*) FROM v_entrada_dia
--    WHERE dia = '2026-10-01' GROUP BY 1 ORDER BY 2 DESC;
--
-- Os dias em que o robô não rodou (dias_desde > 1):
--   SELECT dia, dia_anterior, dias_desde FROM v_dias_pendente
--    WHERE dias_desde > 1 ORDER BY dia;