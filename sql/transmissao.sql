-- ============================================================
-- A HORA DA DATA INSERÇÃO — e com ela o expurgo de transmissão
--
-- O QUE É O TEMPO DE TRANSMISSÃO (decifrado em 16/10/2026)
--
-- Medido na planilha ISAP de 01 a 15/10, 3.534 linhas:
--
--   TEMPO_TRASMITIR = DATA_CRIA_CONECTA_SERVICOS − DH_ACATAMENTO
--
-- truncado em horas inteiras. **3.534 de 3.534, zero exceção.** As
-- outras cinco combinações de datas da planilha ficaram abaixo de 93%.
--
-- Em português: é quanto tempo a OS levou para viajar do sistema da
-- Sabesp (acatamento) até aparecer no Conecta/GEOCALL, onde a nossa
-- equipe consegue ver. Enquanto ela não chega, ninguém aqui pode
-- executar — e o relógio do prazo já está correndo. Passando de 4
-- horas, a Sabesp reconhece que o atraso não foi nosso e tira o
-- serviço da conta.
--
-- A regra completa, conferida nas mesmas 3.534 linhas:
--
--   TRANSMISSAO = SIM  ⟺  tempo >= 4h  E  o serviço estava FORA
--
--   75 serviços receberam EXPURGO_ATRASO_TRANSMISSAO, todos com
--   PRE_EXPUGOS = FORA_DO_PRAZO e tempo mínimo de 4h.
--   164 tiveram tempo >= 4h e NÃO foram expurgados: 158 porque já
--   estavam DENTRO (o expurgo nunca resgata quem não precisa) e 6
--   porque pegaram outro expurgo antes.
--
-- Distribuição: 88,9% transmitem em menos de uma hora. O problema é
-- a cauda — 6,8% levam 4 horas ou mais.
--
--
-- A DESCOBERTA: A HORA NUNCA SE PERDEU
--
-- O CLAUDE.md dizia que a hora da Data Inserção estava perdida e não
-- dava para reconstruir. Estava errado, e a prova estava no comentário
-- do próprio sql/os_entrada.sql:
--
--   -- "27/08/2026 11:44" -> 2026-08-27
--
-- O export do GEOCALL sempre mandou a hora. Quem a joga fora é a
-- `os_entrada_do_jsonb`, que faz `substring(... from 1 for 10)` e
-- grava numa coluna DATE. O dado cru continua inteiro no
-- `pendente_os.dados`:
--
--   'Data Inserção'       = '27/08/2025 11:44'
--   'Data de Competência' = '27/08/2025 11:42'
--
-- Conferido em 400 linhas: 400 com as duas datas completas, e o tempo
-- de transmissão calculado delas dá 29 casos de 4h+ em 400 (7,2%),
-- contra 6,8% na planilha da Sabesp. Bate.
--
--
-- O QUE ISTO CONSERTA, E O QUE NÃO CONSERTA
--
-- CONSERTA daqui para a frente, e já de saída para as 984 OS que
-- estão na carteira hoje: cada uma delas vai ser executada algum dia,
-- e aí o expurgo vai poder ser calculado.
--
-- NÃO CONSERTA o passado. O `pendente_os` guarda a carteira de AGORA,
-- não o histórico — quem já foi executado não está mais lá, e a hora
-- daquela inserção não existe em lugar nenhum.
--
-- Efeito esperado: hoje o nosso IDG sai cerca de 2 pontos abaixo do
-- da Sabesp, e 75 dos 87 vereditos que divergiram em 01-14/10 eram
-- exatamente este expurgo. O ISAPe, onde ele quase não aparece, já
-- bate exato (83,40% dos dois lados).
-- ============================================================

-- ---------- 1. A coluna ----------
-- Nova coluna em vez de mexer na `data_insercao`: ela está na CHAVE
-- PRIMÁRIA da os_entrada, e trocar o tipo de uma coluna de chave
-- reescreve a tabela e o histórico junto. A DATE continua mandando em
-- tudo que já existe; a nova só acrescenta a hora.
ALTER TABLE os_entrada ADD COLUMN IF NOT EXISTS dh_insercao TIMESTAMP;

COMMENT ON COLUMN os_entrada.dh_insercao IS
  'Data Inserção COM a hora, do export do GEOCALL. NULL nas linhas anteriores a 16/10/2026, quando passamos a guardar. É o DATA_CRIA_CONECTA_SERVICOS da planilha ISAP, e serve para calcular o expurgo de atraso de transmissão.';


-- ---------- 2. A leitura passa a trazer a hora ----------
CREATE OR REPLACE FUNCTION os_entrada_do_jsonb(d JSONB)
RETURNS TABLE (numero_os TEXT, tss TEXT, data_insercao DATE, dh_insercao TIMESTAMP,
               familia TEXT, atc INT, unidade TEXT, endereco TEXT, bairro TEXT) AS $$
  SELECT nullif(trim(d->>'Número OS'),''),
         nullif(trim(d->>'TSS'),''),
         CASE WHEN d->>'Data Inserção' ~ '^\s*\d{2}/\d{2}/\d{4}'
              THEN to_date(substring(trim(d->>'Data Inserção') from 1 for 10),'DD/MM/YYYY')
         END,
         -- a mesma string, agora inteira. O regexp exige a hora: sem
         -- ela fica NULL, e NULL é honesto — é o que diz "aqui eu não
         -- sei", em vez de fingir meia-noite.
         CASE WHEN d->>'Data Inserção' ~ '^\s*\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}'
              THEN to_timestamp(substring(trim(d->>'Data Inserção') from 1 for 16),'DD/MM/YYYY HH24:MI')::TIMESTAMP
         END,
         nullif(trim(d->>'Família'),''),
         nullif(regexp_replace(coalesce(d->>'ATC',''),'\D','','g'),'')::INT,
         CASE nullif(regexp_replace(coalesce(d->>'ATC',''),'\D','','g'),'')::INT
           WHEN 923 THEN 'Interlagos' WHEN 929 THEN 'Grajau' WHEN 299 THEN 'Embu-Guacu' END,
         nullif(trim(concat_ws(', ', nullif(trim(d->>'Endereço'),''), nullif(trim(d->>'Número'),''))),''),
         nullif(trim(d->>'Bairro'),'');
$$ LANGUAGE sql IMMUTABLE;


-- ---------- 3. O gatilho grava a hora ----------
-- O DO UPDATE no conflito é de propósito: as linhas que já existem
-- com dh_insercao NULL ganham a hora na próxima subida do pendente,
-- sem precisar de backfill separado. E o COALESCE garante que uma
-- subida sem hora não apague a hora que já estava lá.
CREATE OR REPLACE FUNCTION os_entrada_registrar() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO os_entrada (numero_os, tss, data_insercao, dh_insercao, familia, atc, unidade, endereco, bairro, origem)
  SELECT e.numero_os, e.tss, e.data_insercao, e.dh_insercao, e.familia, e.atc, e.unidade, e.endereco, e.bairro, 'pendente'
    FROM os_entrada_do_jsonb(NEW.dados) e
   WHERE e.numero_os IS NOT NULL AND e.tss IS NOT NULL AND e.data_insercao IS NOT NULL
  ON CONFLICT (numero_os, tss, data_insercao)
  DO UPDATE SET dh_insercao = COALESCE(EXCLUDED.dh_insercao, os_entrada.dh_insercao);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ---------- 4. Backfill do que está na carteira hoje ----------
UPDATE os_entrada o
   SET dh_insercao = e.dh_insercao
  FROM pendente_os p, os_entrada_do_jsonb(p.dados) e
 WHERE o.numero_os = e.numero_os
   AND o.tss       = e.tss
   AND o.data_insercao = e.data_insercao
   AND o.dh_insercao IS NULL
   AND e.dh_insercao IS NOT NULL;


-- ---------- 5. O tempo de transmissão, por serviço ----------
-- Separado numa view para a conta ficar num lugar só. O IDG consome
-- esta, não repete a subtração.
CREATE OR REPLACE VIEW v_transmissao AS
SELECT o.numero_os,
       o.tss,
       o.dh_insercao,
       x.data_competencia,
       -- truncado em horas inteiras, como a Sabesp faz. Nunca
       -- negativo: inserção anterior ao acatamento é zero, não
       -- crédito de tempo.
       GREATEST(0, floor(EXTRACT(EPOCH FROM (o.dh_insercao - x.data_competencia)) / 3600))::INT AS horas
  FROM os_entrada o
  JOIN LATERAL (
    SELECT e.data_competencia
      FROM execucao e
     WHERE e.numero_os = o.numero_os AND e.tss = o.tss
       AND e.data_competencia IS NOT NULL
     ORDER BY e.dia DESC
     LIMIT 1
  ) x ON true
 WHERE o.dh_insercao IS NOT NULL;

ALTER VIEW v_transmissao SET (security_invoker = on);
REVOKE ALL ON v_transmissao FROM anon;
GRANT SELECT ON v_transmissao TO authenticated;


-- ============================================================
-- CONFERÊNCIA — rodar depois de aplicar
--
--   -- quantas ganharam a hora:
--   SELECT count(*) FILTER (WHERE dh_insercao IS NOT NULL) AS com_hora,
--          count(*) AS total
--     FROM os_entrada;
--   -- esperado: perto de 984 com hora (a carteira de hoje)
--
--   -- a distribuição tem que parecer com a da Sabesp
--   -- (88,9% em 0h, 6,8% em 4h ou mais):
--   SELECT CASE WHEN horas = 0 THEN '0h'
--               WHEN horas < 4 THEN '1-3h'
--               ELSE '4h+' END AS faixa, count(*)
--     FROM v_transmissao GROUP BY 1 ORDER BY 1;
--
-- O PRÓXIMO PASSO, QUE ESTE ARQUIVO NÃO DÁ:
-- ligar a v_transmissao na v_idg, para que FORA com horas >= 4 vire
-- EXPURGO_ATRASO_TRANSMISSAO. Isso muda o número do IDG na tela e
-- fica para uma decisão à parte — o índice é o que o contrato cobra.
-- ============================================================
