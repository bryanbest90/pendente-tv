-- ============================================================
-- REGUA DO IDG — quatro servicos que chegaram no ISAP de 13/10
--
-- Rode no SQL Editor depois do sql/isap_regua.sql.
--
-- O arquivo de 09/10 trazia 97 servicos; o de 13/10 trouxe 101. Nenhum
-- prazo mudou entre os dois — conferido um por um.
--
-- Sem eles, esses servicos ficam fora do indice sem avisar: a view
-- v_idg so conta o que casa com a regua. Eram as 4 linhas que a Sabesp
-- tinha e nos nao.
-- ============================================================
INSERT INTO isap_tss (cod_tss, tss, indicador, prazo, tipo_prazo, vezes) VALUES
  (1390, 'REGISTRO DO CAVALETE INVERTIDO', 'ISAPa', 24, 'HS', 1),
  (5920, 'TELEVISIONAR REDE DE ESGOTO', 'ISAPe', 72, 'HS', 1),
  (7550, 'REPOR GUIA', 'ISAPr', 3, 'DC', 1),
  (7610, 'REPOR PAREDE/MURO', 'ISAPr', 3, 'DC', 1)
ON CONFLICT (cod_tss) DO UPDATE
  SET tss=EXCLUDED.tss, indicador=EXCLUDED.indicador, prazo=EXCLUDED.prazo,
      tipo_prazo=EXCLUDED.tipo_prazo, atualizado=now();

UPDATE isap_tss SET tss_busca = upper(unaccent(tss)) WHERE tss_busca IS NULL;

-- Conferencia: tem que dar 101
--   SELECT count(*) FROM isap_tss;
