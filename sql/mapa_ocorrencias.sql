-- ============================================================
-- MAPA DE OCORRÊNCIAS — a coordenada de cada serviço da carteira
-- ============================================================
--
-- ESTE É O ÚNICO ARQUIVO QUE CRIA A v_pendente_mapa. Se um dia
-- aparecer um segundo, vale quem rodou por último e ninguém sabe
-- qual — já aconteceu com a v_idg, está anotado no CLAUDE.md.
--
-- A aba Mapa precisa de um par lat/lon por serviço. Fazer isso no
-- navegador exigiria baixar a biblioteca inteira de endereços: 4.865
-- ruas e 239.743 pontos, cerca de 12 MB a cada abertura da página.
-- Aqui a conta roda onde a biblioteca já mora, e o que viaja são as
-- ~750 linhas que o mapa desenha.
--
-- COMO O PONTO É ESCOLHIDO
--
--   1. a rua é casada pelo MIOLO do nome (ver abaixo);
--   2. entre os pontos dela, ficam os que são do setor da OS;
--   3. se nenhum for, valem todos — ponto aproximado é melhor que
--      nenhum;
--   4. dentro do que sobrou, vence o número mais próximo.
--
-- O desempate pelo setor existe porque a mesma rua se repete na
-- região: há cinco "RUA PARANÁ", três "RUA SEIS". Sem ele, "RUA
-- PARANA, 28" do setor 260 caía 5,6 km fora. A própria coord_rua
-- guarda o setor de cada ponto, na oitava posição da lista (80,3%
-- dos 239.743 pontos têm o campo).
--
-- POR QUE PELO MIOLO E NÃO PELO NOME INTEIRO
--
-- A primeira versão casava a rua pelo nome inteiro, e 132 dos 665
-- serviços da tela ficavam sem ponto. Eu disse que era buraco na
-- biblioteca — que avenida grande tem poucas ligações e por isso não
-- estaria lá. Estava errado. A biblioteca tem as avenidas; o que não
-- batia era o rótulo:
--
--     pendente:   AVENIDA PAULO GUILGUER REIMBERG
--     coord_rua:  AV PAULO GUILGUER REIMBERG
--
-- Era um `=` entre dois jeitos de escrever a mesma coisa. 126 dos
-- 132 eram isso; outros 6 eram ESTR/ESTRADA, AL/ALAMEDA e um caso em
-- que o GEOCALL chama de ESTRADA o que a biblioteca chama de TV.
--
-- A junção é pelo MIOLO da rua: sem acento, sem
-- pontuação, e sem a palavra do tipo (AVENIDA, AV, RUA, TRAVESSA…).
-- "AVENIDA DA REPRESA" e "AV DA REPRESA" viram os dois "DA REPRESA".
--
-- Tirar o tipo junta 345 pares de ruas que só diferem nele — VIELA
-- CANARIOS e RUA CANARIOS, por exemplo. Isso é de propósito e não
-- faz mal, porque quem desempata continua sendo o SETOR: dos 122
-- serviços que passam a ter ponto, 121 acharam ponto do próprio
-- setor. Só 1 teve de se contentar com a rua inteira.
--
-- MEDIDO na carteira de 17/11/2026, nos 665 serviços da tela:
--
--                               antes      depois
--   com ponto no mapa           533 (80%)  655 (98,5%)
--   dentro do desenho do setor  93,2%      89,9%
--
-- A segunda linha cai e isso é esperado, não defeito: o que entrou
-- foram avenidas, que são longas e correm na divisa de dois setores.
-- Dos 122 novos, a mediana da distância para fora do desenho é ZERO
-- e só um passa de 300 m (ESTRADA DO CARVOEIRO, setor 295).
--
-- SOBRAM 10 SERVIÇOS em 7 ruas que a biblioteca realmente não tem:
-- TRAVESSA CUBA (3), RUA DUARTE JOSE FAVA (2), RUA NINIVE, TRAVESSA
-- ARRUDA, TRAVESSA FLORES, RUA AGOSTINO STEFFANI e VIELA CANTO DO
-- SABIA. Dois deles cheiram a erro de digitação ("AGOSTINO" para
-- "AGOSTINHO STEFFANI", que existe). NÃO fiz casamento por
-- semelhança: adivinhar rua a partir de um nome parecido põe o
-- serviço na quadra errada, e pino errado é pior que pino nenhum.
-- (17/11/2026)

-- ── o miolo da rua ──────────────────────────────────────────
-- IMMUTABLE para poder virar índice; sem acento por translate, para
-- não depender da extensão unaccent.
create or replace function rua_miolo(t text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(
           btrim(regexp_replace(
             translate(upper(coalesce(t, '')),
                       'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                       'AAAAAEEEEIIIIOOOOOUUUUCN'),
             '[^A-Z0-9]+', ' ', 'g')),
           '^(AVENIDA|AV|ALAMEDA|AL|ESTRADA|ESTR|EST|TRAVESSA|TRAV|TV|RODOVIA|ROD|PRACA|PCA|PC|LARGO|LGO|VIELA|VLA|PASSAGEM|PSG|RUA|R|VILA|VL|JARDIM|JD|PARQUE|PQ|ACESSO|MARGINAL|BECO|LADEIRA|CAMINHO)\s+',
           '');
$$;

-- sem isto a junção varre as 4.865 ruas a cada abertura do mapa
create index if not exists coord_rua_miolo_idx on coord_rua (rua_miolo(rua));

create or replace view v_pendente_mapa as
with alvo as (
  select
    o.dados->>'Número OS'                            as numero_os,
    btrim(o.dados->>'TSS')                           as tss,
    btrim(o.dados->>'SF')                            as sf,
    rua_miolo(o.dados->>'Endereço')                  as rua,
    case when btrim(o.dados->>'Número') ~ '^[0-9]{1,9}$'
         then (btrim(o.dados->>'Número'))::int else 0 end as numero
  from pendente_os o
),
candidato as (
  select
    a.numero_os,
    a.tss,
    a.numero,
    (e->>0)::float8 as la,
    (e->>1)::float8 as lo,
    case when e->>2 ~ '^-?[0-9]{1,9}$' then (e->>2)::int else 0 end as numero_ponto,
    (jsonb_array_length(e) >= 8 and btrim(coalesce(e->>7, '')) = a.sf) as do_setor
  from alvo a
  join coord_rua c on rua_miolo(c.rua) = a.rua
  cross join lateral jsonb_array_elements(c.p) as e
  where a.rua <> ''
)
select distinct on (numero_os, tss)
  numero_os,
  tss,
  round(la::numeric, 6) as la,
  round(lo::numeric, 6) as lo,
  do_setor
from candidato
order by numero_os, tss, do_setor desc, abs(numero_ponto - numero), la, lo;

alter view v_pendente_mapa set (security_invoker = on);
grant select on v_pendente_mapa to anon, authenticated;

-- ============================================================
-- CONFERÊNCIA — leia os números
-- ============================================================
-- 1) uma linha por serviço, nenhuma duplicada
select 'linhas / pares distintos' as conferir,
       count(*)::text || ' / ' || count(distinct (numero_os, tss))::text as valor
from v_pendente_mapa;

-- 2) cobertura: tem de subir de 620 para ~742 (a view não filtra
--    família, então conta mais que os 655 da tela)
select 'serviços na pendente_os'      as conferir, count(*)::text as valor from pendente_os
union all
select 'com ponto',                   count(*)::text from v_pendente_mapa
union all
select 'com ponto do próprio setor',  count(*) filter (where do_setor)::text from v_pendente_mapa;

-- 3) o que ainda não tem rua na biblioteca, pelo miolo
select o.dados->>'Endereço' as rua_sem_coordenada, count(*) as servicos
from pendente_os o
where not exists (
  select 1 from coord_rua c where rua_miolo(c.rua) = rua_miolo(o.dados->>'Endereço')
)
group by 1 order by 2 desc, 1;
