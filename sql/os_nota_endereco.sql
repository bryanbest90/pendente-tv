-- ============================================================
-- A NOTA GUARDA O PRÓPRIO ENDEREÇO
--
-- Rode DEPOIS do sql/os_nota.sql.
--
-- Até aqui a nota só tinha OS, TSS e texto; endereço, bairro e
-- prazo vinham do pendente na hora de mostrar. Isso funciona
-- enquanto a OS está no pendente — e para de funcionar exatamente
-- quando ela sai, que é quando a linha aparece sem endereço
-- nenhum e parece defeito.
--
-- A correção é a nota ser autossuficiente: ela guarda o endereço
-- de quando foi escrita. O pendente continua sendo a fonte
-- preferida na tela (é mais fresco); isto aqui é o que sobra
-- quando ele não tem mais a OS.
-- ============================================================

ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS endereco  TEXT;
ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS bairro    TEXT;
ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE os_nota ADD COLUMN IF NOT EXISTS familia   TEXT;


-- ------------------------------------------------------------
-- Preenche as notas que já existem, usando o pendente de agora.
-- Nota de OS que já saiu não tem de onde tirar — essa fica sem, e
-- não há o que fazer: o dado não existe mais em lugar nenhum.
-- ------------------------------------------------------------
UPDATE os_nota n
   SET endereco  = COALESCE(n.endereco,
                     btrim(p.dados->>'Endereço') ||
                     COALESCE(', ' || (p.dados->>'Número'), '')),
       bairro    = COALESCE(n.bairro,    p.dados->>'Bairro'),
       municipio = COALESCE(n.municipio, p.dados->>'Município'),
       familia   = COALESCE(n.familia,   p.dados->>'Família')
  FROM pendente_os p
 WHERE p.dados->>'Número OS' = n.numero_os
   AND n.endereco IS NULL;


-- ------------------------------------------------------------
-- Conferência — quais notas ficaram sem endereço (são as de OS
-- que já saíram do pendente antes desta carga):
--
--   SELECT numero_os, tss, left(nota,40) AS nota
--     FROM os_nota WHERE endereco IS NULL;
--
-- Daqui para a frente nenhuma nota nova nasce assim: o site grava
-- o endereço junto.
-- ------------------------------------------------------------
