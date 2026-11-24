-- ============================================================
-- A MINIATURA DA FOTO
--
-- Roda uma vez, no SQL Editor. Acrescenta uma coluna à
-- analise_foto; não mexe em mais nada e não apaga dado nenhum.
--
-- POR QUE ELA EXISTE: a grade da aba Análise desenha a foto a
-- 287px. Mandar a original de 800x1067 para isso custa 97 KB por
-- foto — 82 MB para abrir um dia de 862 fotos, e de novo a cada
-- reabertura. A 320px são 13 KB: 11 MB o dia. A original continua
-- no bucket e só é baixada quando se clica para ampliar, que é
-- quando a costura do recorte precisa ser vista.
--
-- Medido nas 862 fotos de 19/11/2026. Em 24/11 o Egress do plano
-- gratuito estava em 4,20 de 5 GB ANTES de qualquer foto subir, e
-- estourar o Egress derruba o site inteiro, não só esta aba.
-- ============================================================

ALTER TABLE analise_foto ADD COLUMN IF NOT EXISTS caminho_min TEXT;

COMMENT ON COLUMN analise_foto.caminho_min IS
  'Caminho da miniatura de 320px no bucket (min/<mesmo caminho>). '
  'NULL quando não foi gerada — a tela cai na original sozinha.';


-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------
-- A coluna está lá?
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'analise_foto' AND column_name = 'caminho_min';

-- Depois de subir as fotos: quantas têm miniatura?
-- SELECT count(*) AS fotos, count(caminho_min) AS com_miniatura FROM analise_foto;


-- ------------------------------------------------------------
-- DESFAZER
-- ------------------------------------------------------------
-- ALTER TABLE analise_foto DROP COLUMN IF EXISTS caminho_min;
-- (a tela volta a usar a original sozinha; os arquivos min/ ficam
--  no bucket e saem com o --apagar do SUBIR_FOTOS)
