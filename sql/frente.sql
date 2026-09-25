-- ============================================================
-- FRENTE DA TSS CORRIGIDA À MÃO  +  a frente NIVELAMENTO
--
-- Rode no SQL Editor do Supabase, depois de sql/itinerario.sql.
--
-- Duas perguntas diferentes estavam presas numa só:
--   FAMÍLIA — o que a Sabesp manda. Não se mexe: é ela que monta a
--     aba Pendente, e ela tem de continuar batendo com o GEOCALL.
--   FRENTE  — de que equipe é aquele serviço no itinerário. Essa é
--     nossa, e é a que às vezes está errada.
-- NIVELAR POÇO DE INSPEÇÃO/VISITA é família de esgoto e frente de
-- nivelamento, e até agora não havia como dizer as duas coisas.
--
-- A coluna abaixo guarda só a segunda. O site tenta, nesta ordem:
-- sua correção → nome da TSS → medição firme (>= 0,8) → família.
-- ============================================================

ALTER TABLE tss_tipo ADD COLUMN IF NOT EXISTS tipo_manual TEXT;

COMMENT ON COLUMN tss_tipo.tipo_manual IS
  'Frente escolhida a mao no botao Frentes do itinerario. NULL = automatico. Nunca sobrescrita pelo semeador.';

-- ------------------------------------------------------------
-- OPCIONAL — o ponto de partida do NIVELAMENTO.
--
-- Estas são as TSS que as equipes de nivelamento de fato executaram
-- em ago/set (NPV MAZEGA, DENIS DA COSTA PIRES, NILTO LOPES DE
-- ARAUJO e REPOSIÇÃO - VALDEQUE SILVA, 122 execuções). O que começa
-- com NIVELAR o site já resolve sozinho pelo nome; o resto está
-- aqui porque só você sabe se é da turma ou não.
--
-- CONSTRUIR e RECONSTRUIR POÇO ficaram DE FORA de propósito: 8 das
-- 9 execuções foram de OBRAS. LIMPAR POÇO A VÁCUO também: é da
-- Norbrasil. Se discordar, é só desmarcar na tela depois.
--
-- Confira antes, trocando o INSERT por:
--   SELECT tss, tipo, confianca FROM tss_tipo WHERE tss IN (...);
-- ------------------------------------------------------------
INSERT INTO tss_tipo (tss, tipo, confianca, execucoes, tipo_manual) VALUES
  ('NIVELAR POÇO DE INSPEÇÃO/VISITA',        'NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('NIVELAR CAIXA DE PARADA',                'NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('DESCOBRIR POÇO INSPEÇÃO/VISITA',         'NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('CONSERTAR POÇO DE INSPEÇÃO/VISITA',      'NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('COLOCAR TAMPÃO EM POÇO INSPEÇÃO/VISITA', 'NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('TROCAR TAMPÃO DE POÇO DE INSPEÇÃO/VISITA','NIVELAMENTO', 0, 0, 'NIVELAMENTO'),
  ('RECONSTRUIR POÇO DE INSPEÇÃO',           'NIVELAMENTO', 0, 0, 'NIVELAMENTO')
ON CONFLICT (tss) DO UPDATE SET tipo_manual = EXCLUDED.tipo_manual;
-- (o ON CONFLICT toca só a coluna manual: a medição de quem executou
--  continua guardada, para você poder voltar atrás)

-- ---------- As quatro equipes de nivelamento ----------
-- Estavam caindo em OUTROS, e equipe sem frente fica de fora do
-- Sugerir. O nome é o do GEOCALL — se alguma não bater, confira com
--   SELECT nome, tipo, tipos FROM equipe WHERE nome ILIKE '%MAZEGA%';
UPDATE equipe
   SET tipos = ARRAY['NIVELAMENTO'],
       tipo  = 'NIVELAMENTO'
 WHERE nome ILIKE '%NPV%'
    OR nome ILIKE '%DENIS DA COSTA PIRES%'
    OR nome ILIKE '%NILTO LOPES DE ARAUJO%'
    OR nome ILIKE '%VALDEQUE SILVA%';

-- ---------- Conferência ----------
--   SELECT nome, tipo, tipos, os_por_dia, ativa FROM equipe
--    WHERE tipo='NIVELAMENTO' ORDER BY nome;
--
--   SELECT tss, tipo AS medido, tipo_manual FROM tss_tipo
--    WHERE tipo_manual IS NOT NULL ORDER BY tipo_manual, tss;
--
-- Desfazer uma correção (volta ao automático):
--   UPDATE tss_tipo SET tipo_manual=NULL WHERE tss='...';