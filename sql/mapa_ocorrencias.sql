-- ============================================================
-- MAPA DE OCORRÊNCIAS — a coordenada de cada serviço da carteira
-- ============================================================
--
-- A aba Mapa precisa de um par lat/lon por serviço. Fazer isso no
-- navegador exigiria baixar a biblioteca inteira de endereços: 4.865
-- ruas e 239.743 pontos, cerca de 12 MB a cada abertura da página.
-- Aqui a conta roda onde a biblioteca já mora, e o que viaja são as
-- ~620 linhas que o mapa desenha.
--
-- COMO O PONTO É ESCOLHIDO
--
-- A mesma rua existe em vários lugares da região: há cinco "RUA
-- PARANÁ", três "RUA SEIS", duas "VIELA DOIS". Procurar só pelo nome
-- põe a OS a quilômetros do lugar certo — medido: "RUA PARANA, 28" do
-- setor 260 caía 5,6 km fora.
--
-- O desempate é o SETOR. A própria coord_rua guarda o setor de cada
-- ponto, na oitava posição da lista (80,3% dos 239.743 pontos têm o
-- campo preenchido). Então:
--
--   1. entre os pontos daquela rua, ficam os que são do setor da OS;
--   2. se nenhum for, valem todos — é melhor um ponto aproximado
--      que nenhum;
--   3. dentro do que sobrou, vence o número mais próximo do número
--      da OS.
--
-- Conferido em 16/11/2026 na carteira inteira: dos 622 serviços cuja
-- rua existe na biblioteca, 619 (99,5%) acharam ponto do próprio
-- setor, e 584 caem dentro do desenho daquele setor no mapa. Dos 38
-- que caem fora do desenho, a mediana está a 20 metros da divisa e só
-- 5 passam de 150 m — são imprecisão do contorno, não do endereço. As
-- duas exceções de verdade (VIELA ANA ROSA no 174 e RUA AURELIO
-- SCHUNCK KLEIN no 266, a ~4 km) são divergência entre a biblioteca e
-- o desenho do setor, e nelas a biblioteca é a fonte.
--
-- O QUE ESTA VIEW NÃO FAZ
--
-- Não filtra nada: devolve um ponto para cada linha da pendente_os,
-- inclusive as famílias excluídas. Quem decide o que aparece é o
-- familiaTssVisivel() do App.jsx, que já é a regra única da tela.
-- Duas listas de exclusão, uma aqui e outra lá, divergiriam na
-- primeira mudança.
--
-- A chave é o par (numero_os, tss) porque é a unidade do negócio e é
-- o que o app tem em mãos — as linhas da tela não carregam o id.
--
-- (16/11/2026)

create or replace view v_pendente_mapa as
with alvo as (
  select
    o.dados->>'Número OS'                                               as numero_os,
    btrim(o.dados->>'TSS')                                              as tss,
    btrim(o.dados->>'SF')                                               as sf,
    upper(btrim(regexp_replace(o.dados->>'Endereço', '\s+', ' ', 'g'))) as rua,
    case when btrim(o.dados->>'Número') ~ '^[0-9]{1,9}$'
         then (btrim(o.dados->>'Número'))::int else 0 end               as numero
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
  join coord_rua c on c.rua = a.rua
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

-- A view enxerga só o que QUEM PERGUNTA pode ver. Sem isto ela rodaria
-- com os poderes de quem a criou, e seria uma porta lateral para a
-- pendente_os e a coord_rua.
alter view v_pendente_mapa set (security_invoker = on);

-- A carteira com endereço já é pública pela aba Pendente, que lê a
-- pendente_os com a chave anônima. A view não abre nada novo: só
-- poupa o navegador de baixar a biblioteca inteira.
grant select on v_pendente_mapa to anon, authenticated;

-- ============================================================
-- CONFERÊNCIA — rode junto e leia os números
-- ============================================================
-- 1) uma linha por serviço, nenhuma duplicada
--    (o app pagina esta view, e paginar sem ordem única repete e
--     omite linhas — por isso a chave precisa ser única mesmo)
select 'linhas / pares distintos' as conferir,
       count(*)::text || ' / ' || count(distinct (numero_os, tss))::text as valor
from v_pendente_mapa;

-- 2) cobertura: quantos serviços da carteira ganharam ponto
select 'serviços na pendente_os'  as conferir, count(*)::text as valor from pendente_os
union all
select 'com ponto', count(*)::text from v_pendente_mapa
union all
select 'com ponto do próprio setor', count(*) filter (where do_setor)::text from v_pendente_mapa;

-- 3) as ruas que ficaram sem ponto, para quem for completar a
--    biblioteca um dia — em geral avenidas e estradas
select upper(btrim(regexp_replace(o.dados->>'Endereço', '\s+', ' ', 'g'))) as rua_sem_coordenada,
       count(*) as servicos
from pendente_os o
where not exists (
  select 1 from coord_rua c
  where c.rua = upper(btrim(regexp_replace(o.dados->>'Endereço', '\s+', ' ', 'g')))
)
group by 1 order by 2 desc, 1 limit 20;
