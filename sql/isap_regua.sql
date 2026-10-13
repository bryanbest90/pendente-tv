-- ============================================================
-- A RÉGUA DO IDG — qual frente e qual prazo de cada TSS
--
-- Rode no SQL Editor do Supabase. Não depende de nada anterior.
--
-- DE ONDE SAIU
-- Da própria planilha ISAP que a Sabesp manda. Cada linha dela traz
-- COD_TSS, INDICADOR (ISAPa/ISAPe/ISAPr), PRAZO_CONTRATO e TIPO_PRAZO.
-- Isso é a régua deles, não uma estimativa nossa: são os 97 serviços
-- que apareceram no arquivo de 01 a 08/10/2026.
--
-- POR QUE ISSO IMPORTA
-- A análise de 20/09 (ANALISE_prazo_competencia_vs_insercao.md) parou
-- numa frase: "para calcular faltam duas coisas, e uma delas nós não
-- temos em lugar nenhum: a tabela de dias por TSS". É esta tabela.
-- Ela chegou pela planilha do ISAP.
--
-- CUIDADO AO ATUALIZAR
-- Prazo de contrato muda em renegociação. Quando chegar uma planilha
-- nova, vale conferir se algum prazo mudou antes de sobrescrever —
-- um prazo errado move o índice inteiro de uma frente.
-- ============================================================

CREATE TABLE IF NOT EXISTS isap_tss (
  cod_tss     INT  PRIMARY KEY,
  tss         TEXT NOT NULL,
  -- a frente: ISAPa (água), ISAPe (esgoto), ISAPr (reposição)
  indicador   TEXT NOT NULL CHECK (indicador IN ('ISAPa','ISAPe','ISAPr')),
  prazo       NUMERIC NOT NULL,
  -- DC = dias corridos, HS = horas
  tipo_prazo  TEXT NOT NULL CHECK (tipo_prazo IN ('DC','HS')),
  -- quantas vezes apareceu na planilha de origem; serve só para você
  -- saber o peso de cada linha
  vezes       INT,
  atualizado  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO isap_tss (cod_tss, tss, indicador, prazo, tipo_prazo, vezes) VALUES
  (1060, 'FALTA DE AGUA LOCAL', 'ISAPa', 24, 'HS', 117),
  (1120, 'POUCA PRESSAO DE AGUA LOCAL', 'ISAPa', 24, 'HS', 31),
  (1300, 'CAVALETE QUEBRADO', 'ISAPa', 24, 'HS', 18),
  (1310, 'CAVALETE VAZANDO', 'ISAPa', 24, 'HS', 133),
  (1340, 'INSTALAR LACRE DIVERSOS', 'ISAPa', 24, 'HS', 2),
  (1380, 'READEQUAR CAVALETE', 'ISAPa', 5, 'DC', 1),
  (1400, 'REGISTRO DO CAVALETE QUEBRADO', 'ISAPa', 24, 'HS', 63),
  (1410, 'REGISTRO DO CAVALETE VAZANDO', 'ISAPa', 24, 'HS', 65),
  (1420, 'REGULARIZAR CAVALETE', 'ISAPa', 5, 'DC', 7),
  (1480, 'TROCAR CAVALETE POR UMA', 'ISAPa', 10, 'DC', 13),
  (1490, 'TROCAR CAVALETE (KIT)', 'ISAPa', 10, 'DC', 45),
  (2010, 'HIDROMETRO EMBAÇADO', 'ISAPa', 48, 'HS', 27),
  (2030, 'HIDROMETRO INVERTIDO', 'ISAPa', 48, 'HS', 29),
  (2040, 'HIDROMETRO PARADO', 'ISAPa', 48, 'HS', 66),
  (2050, 'HIDROMETRO QUEBRADO', 'ISAPa', 48, 'HS', 61),
  (2070, 'INSTALAR HIDROMETRO DESAPARECIDO/FURTADO', 'ISAPa', 48, 'HS', 30),
  (2530, 'INCLUIR LIG DE AGUA EM CAV MULTIPLO S/V', 'ISAPa', 7, 'DC', 10),
  (2540, 'LIGAÇAO DE AGUA S/V', 'ISAPa', 7, 'DC', 129),
  (2620, 'SUBSTITUIR LIGAÇAO DE AGUA', 'ISAPa', 7, 'DC', 6),
  (2660, 'TRANSFORMAÇAO LIG EXIST COM APROV RAMAL', 'ISAPa', 7, 'DC', 20),
  (2670, 'TRANSFORMAÇAO LIG EXIST SEM APROV RAMAL', 'ISAPa', 7, 'DC', 5),
  (2680, 'TRANSFORMAÇAO LIG NOVA COM APROV RAMAL', 'ISAPa', 7, 'DC', 20),
  (2690, 'TRANSFORMAÇAO LIG NOVA SEM APROV RAMAL', 'ISAPa', 7, 'DC', 5),
  (2830, 'SONDAR RAMAL DE AGUA', 'ISAPa', 24, 'HS', 1),
  (2840, 'TROCAR RAMAL DE AGUA', 'ISAPa', 24, 'HS', 12),
  (2860, 'TROCAR RAMAL DE AGUA PREVENTIVA', 'ISAPa', 96, 'HS', 7),
  (3120, 'NIVELAR CAIXA DE PARADA', 'ISAPa', 7, 'DC', 2),
  (3210, 'SONDAR REDE DE AGUA', 'ISAPa', 24, 'HS', 4),
  (3500, 'ARREBENTADO DE REDE DE AGUA', 'ISAPa', 24, 'HS', 9),
  (3510, 'HIDRANTE VAZANDO', 'ISAPa', 24, 'HS', 2),
  (3520, 'VAZAMENTO DE AGUA COM INFILTRAÇAO', 'ISAPa', 24, 'HS', 20),
  (3530, 'VAZAMENTO DE AGUA EM RAMAL ABANDONADO', 'ISAPa', 24, 'HS', 1),
  (3540, 'VAZAMENTO DE AGUA LEITO PAVIMENTADO', 'ISAPa', 24, 'HS', 87),
  (3550, 'VAZAMENTO DE AGUA LEITO TERRA', 'ISAPa', 24, 'HS', 7),
  (3560, 'VAZAMENTO DE AGUA NA VALVULA', 'ISAPa', 24, 'HS', 1),
  (3600, 'VAZAMENTO DE AGUA NO PASSEIO', 'ISAPa', 24, 'HS', 45),
  (4060, 'SUPRIMIR LIG AGUA ENCERRAMENTO CONTRATO', 'ISAPa', 7, 'DC', 98),
  (4080, 'SUPRIMIR LIG POÇO ENCERRAMENTO CONTRATO', 'ISAPa', 7, 'DC', 1),
  (4140, 'SUPRIMIR LIGAÇAO DE AGUA POR IMOVEL VAGO', 'ISAPa', 7, 'DC', 65),
  (4150, 'SUPRIMIR RAMAL EM SUBST DE LIGAÇAO AGUA', 'ISAPa', 7, 'DC', 1),
  (4505, 'REATIVAR LIGAÇAO DE AGUA S/V', 'ISAPa', 24, 'HS', 141),
  (4530, 'RELIGAR AGUA A PEDIDO DO CLIENTE', 'ISAPa', 24, 'HS', 14),
  (4555, 'RELIGAR AGUA DEB OP', 'ISAPa', 24, 'HS', 17),
  (4630, 'RELIGAR AGUA IMPEDIMENTO DE LEITURA', 'ISAPa', 24, 'HS', 4),
  (4650, 'RELIGAR AGUA MUDANÇA TITULARIDADE', 'ISAPa', 24, 'HS', 62),
  (4675, 'RESTABELECER LIGAÇAO OP', 'ISAPa', 24, 'HS', 3),
  (4755, 'RESTABELECER LIGAÇAO MUDAN TITULARID OP', 'ISAPa', 24, 'HS', 9),
  (5020, 'LIGAÇAO DE ESGOTO ADICIONAL', 'ISAPe', 7, 'DC', 4),
  (5050, 'LIGAÇAO DE ESGOTO S/V', 'ISAPe', 7, 'DC', 9),
  (5060, 'LIGAÇAO DE ESGOTO AVULSA S/V', 'ISAPe', 7, 'DC', 8),
  (5080, 'SUBSTITUIR LIGAÇAO DE ESGOTO', 'ISAPe', 7, 'DC', 1),
  (5300, 'COLOCAR TAMPAO EM POÇO INSPEÇAO/VISITA', 'ISAPe', 24, 'HS', 1),
  (5310, 'CONSERTAR POÇO DE INSPEÇAO/VISITA', 'ISAPe', 96, 'HS', 2),
  (5320, 'CONSTRUIR POÇO DE INSPEÇAO', 'ISAPe', 10, 'DC', 1),
  (5340, 'DESCOBRIR POÇO INSPEÇAO/VISITA', 'ISAPe', 7, 'DC', 5),
  (5370, 'NIVELAR POÇO DE INSPEÇAO/VISITA', 'ISAPe', 7, 'DC', 30),
  (5380, 'NIVELAR TERMINAL DE LIMPEZA', 'ISAPe', 7, 'DC', 1),
  (5390, 'RECONSTRUIR POÇO DE INSPEÇAO', 'ISAPe', 10, 'DC', 3),
  (5400, 'RECONSTRUIR POÇO DE VISITA', 'ISAPe', 10, 'DC', 1),
  (5600, 'CONSERTAR RAMAL DE ESGOTO', 'ISAPe', 48, 'HS', 4),
  (5610, 'DESOBSTRUIR RAMAL DE ESGOTO', 'ISAPe', 24, 'HS', 40),
  (5620, 'DESOBSTRUIR RETORNO PARA IMOVEL', 'ISAPe', 24, 'HS', 64),
  (5670, 'SONDAR RAMAL DE ESGOTO', 'ISAPe', 48, 'HS', 2),
  (5690, 'TROCAR RAMAL DE ESGOTO', 'ISAPe', 48, 'HS', 11),
  (5800, 'CONSERTAR REDE DE ESGOTO', 'ISAPe', 96, 'HS', 2),
  (5810, 'DESOBSTRUIR REDE DE ESGOTO', 'ISAPe', 24, 'HS', 74),
  (5850, 'LAVAR REDE DE ESGOTO PREVENTIVA', 'ISAPe', 48, 'HS', 12),
  (5910, 'SONDAR REDE DE ESGOTO', 'ISAPe', 96, 'HS', 8),
  (7180, 'TROCAR SOLO', 'ISAPr', 24, 'HS', 2),
  (7181, 'TROCAR SOLO INV', 'ISAPr', 24, 'HS', 1),
  (7310, 'REPOR ASFALTO', 'ISAPr', 3, 'DC', 32),
  (7311, 'REPOR ASFALTO RETRABALHO', 'ISAPr', 3, 'DC', 2),
  (7320, 'REPOR ASFALTO A FRIO', 'ISAPr', 24, 'HS', 4),
  (7330, 'REPOR ASFALTO INV', 'ISAPr', 3, 'DC', 14),
  (7340, 'REPOR ASFALTO A FRIO INV', 'ISAPr', 24, 'HS', 5),
  (7380, 'REPOR BLOQUETE INV', 'ISAPr', 3, 'DC', 6),
  (7400, 'REPOR BLOQUETE', 'ISAPr', 3, 'DC', 7),
  (7430, 'REPOR CAPA ASFALTICA', 'ISAPr', 3, 'DC', 22),
  (7431, 'REPOR CAPA ASFALTICA RETRABALHO', 'ISAPr', 3, 'DC', 11),
  (7460, 'REPOR CAPA ASFALTICA INV', 'ISAPr', 3, 'DC', 41),
  (7470, 'REPOR CAPA ASFALTICA ECOLOGICA INV', 'ISAPr', 3, 'DC', 1),
  (7490, 'REPOR CONCRETO', 'ISAPr', 3, 'DC', 7),
  (7491, 'REPOR CONCRETO RETRABALHO', 'ISAPr', 3, 'DC', 2),
  (7540, 'REPOR CONCRETO INV', 'ISAPr', 3, 'DC', 37),
  (7630, 'REPOR GUIA INV', 'ISAPr', 3, 'DC', 1),
  (7640, 'REPOR PASSEIO ADJACENTE CIMENTADO', 'ISAPr', 24, 'HS', 16),
  (7645, 'REPOR PASSEIO ADJACENTE CIMENTADO INV', 'ISAPr', 24, 'HS', 10),
  (7670, 'REPOR PASSEIO ADJACENTE ESPECIAL', 'ISAPr', 7, 'DC', 27),
  (7672, 'REPOR PASSEIO RETRABALHO', 'ISAPr', 12, 'HS', 3),
  (7675, 'REPOR PASSEIO ADJACENTE ESPECIAL INV', 'ISAPr', 7, 'DC', 7),
  (7700, 'REPOR PASSEIO OPOSTO CIMENTADO', 'ISAPr', 24, 'HS', 1),
  (7735, 'REPOR PASSEIO OPOSTO ESPECIAL INV', 'ISAPr', 7, 'DC', 1),
  (7760, 'REPOR PISO INTERNO CIMENTADO', 'ISAPr', 24, 'HS', 3),
  (7765, 'REPOR PISO INTERNO CIMENTADO INV', 'ISAPr', 24, 'HS', 1),
  (7790, 'REPOR PISO INTERNO ESPECIAL', 'ISAPr', 7, 'DC', 18),
  (7795, 'REPOR PISO INTERNO ESPECIAL INV', 'ISAPr', 7, 'DC', 6),
  (7820, 'REPOR SARJETA', 'ISAPr', 3, 'DC', 2)
ON CONFLICT (cod_tss) DO UPDATE
  SET tss=EXCLUDED.tss, indicador=EXCLUDED.indicador, prazo=EXCLUDED.prazo,
      tipo_prazo=EXCLUDED.tipo_prazo, vezes=EXCLUDED.vezes, atualizado=now();


-- ---------- O nome do serviço: dois alfabetos ----------
-- A Sabesp escreve "VAZAMENTO DE AGUA LEITO PAVIMENTADO". O GEOCALL
-- manda para nós "VAZAMENTO DE ÁGUA LEITO PAVIMENTADO". É o mesmo
-- serviço com e sem acento, e um `=` simples não casa os dois.
--
-- A nossa execucao não guarda COD_TSS — só o nome. Então o casamento
-- tem de ser pelo nome sem acento. Esta coluna guarda isso pronto,
-- para não ter unaccent() em todo WHERE.
ALTER TABLE isap_tss ADD COLUMN IF NOT EXISTS tss_busca TEXT;

CREATE EXTENSION IF NOT EXISTS unaccent;
UPDATE isap_tss SET tss_busca = upper(unaccent(tss));
CREATE INDEX IF NOT EXISTS isap_tss_busca ON isap_tss (tss_busca);


ALTER TABLE isap_tss ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isap_tss_read ON isap_tss;
CREATE POLICY isap_tss_read ON isap_tss FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON isap_tss TO anon, authenticated;


-- ============================================================
-- O CÁLCULO
--
-- tempo de atendimento = DATA FIM EXECUÇÃO menos DATA DE COMPETÊNCIA,
-- truncado para baixo na unidade do prazo (dia inteiro se DC, hora
-- inteira se HS). Fora do prazo é tempo > prazo, com > e não >=.
--
-- Conferido contra 1.259 serviços que estão na planilha deles e na
-- nossa execucao: 1.256 vereditos iguais. Os 3 que diferem é porque a
-- DATA FIM EXECUÇÃO que nós temos é outra, não porque a conta é outra.
-- ============================================================
CREATE OR REPLACE VIEW v_isap_execucao AS
SELECT e.numero_os,
       e.tss,
       e.dia,
       e.equipe,
       r.indicador,
       r.prazo,
       r.tipo_prazo,
       e.data_competencia,
       e.data_execucao,
       -- a idade em unidades de prazo, nunca negativa: serviço baixado
       -- antes do acatamento (a "retroativa" deles) conta como zero
       GREATEST(0, floor(
         EXTRACT(EPOCH FROM (e.data_execucao - e.data_competencia))
         / CASE WHEN r.tipo_prazo = 'DC' THEN 86400 ELSE 3600 END
       ))::INT AS tempo_atendimento,
       CASE WHEN GREATEST(0, floor(
              EXTRACT(EPOCH FROM (e.data_execucao - e.data_competencia))
              / CASE WHEN r.tipo_prazo = 'DC' THEN 86400 ELSE 3600 END
            )) > r.prazo
            THEN 'FORA' ELSE 'DENTRO' END AS veredito
  FROM execucao e
  JOIN isap_tss r ON r.tss_busca = upper(unaccent(e.tss))
 WHERE e.data_competencia IS NOT NULL
   AND e.data_execucao   IS NOT NULL;

ALTER VIEW v_isap_execucao SET (security_invoker = on);
GRANT SELECT ON v_isap_execucao TO anon, authenticated;


-- ---------- Conferência ----------
-- A régua entrou com 97 serviços:
--   SELECT indicador, count(*) FROM isap_tss GROUP BY 1 ORDER BY 1;
--
-- O índice de 01 a 08/10/2026 — tem que dar perto de
-- ISAPa 87,3 / ISAPe 84,3 / ISAPr 95,3:
--   SELECT indicador,
--          count(*) FILTER (WHERE veredito='DENTRO') AS dentro,
--          count(*) FILTER (WHERE veredito='FORA')   AS fora,
--          round(100.0*count(*) FILTER (WHERE veredito='DENTRO')/count(*),2) AS pct
--     FROM v_isap_execucao
--    WHERE dia BETWEEN '2026-10-01' AND '2026-10-08'
--    GROUP BY 1 ORDER BY 1;
--
-- Ele NÃO vai dar igual ao da Sabesp, e o motivo está escrito no
-- ANALISE_IDG_ISAP.md: falta no banco 27% do universo — os serviços
-- que a Sabesp encerra sem execução (imóvel fechado, duplicidade,
-- trata-se de outro serviço). Esses contam no IDG e nós não temos.
-- ============================================================
