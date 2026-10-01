# Lee las grabaciones de piles (las JSONL públicas de /api/recordings).
#
#   nu tools/grab.nu listar   [-b beta] [-n 10]      qué hay en el servidor
#   nu tools/grab.nu bajar    [-b beta] [-n 30]      copia a tools/.cache/<base>/ (se rotan: bájalas pronto)
#   nu tools/grab.nu resumen  <f>                    tipos de línea, mensajes y rechazos
#   nu tools/grab.nu humanos  <f>                    por persona: silencios, ping, caídas
#   nu tools/grab.nu jugadas  <f>                    sin respuesta, ráfagas y DEUDAS FORZADAS con su causa
#   nu tools/grab.nu peleas   <f>                    peleas, ganador, bloqueos y solapes
#   nu tools/grab.nu bots     <f>                    ciclos soltar→coger y cuánto dura lo que sueltan
#   nu tools/grab.nu notas    <f>                    caja negra del cliente, desync y conn
#   nu tools/grab.nu linea    <f> <quien> <desde_ms> <hasta_ms>   todo lo de una persona en una ventana
#
# <f> es una ruta, un nombre de fichero de la API, o `ultima` (la más reciente de la caché).
# -b / --base: local | beta | prod | <url>. Por defecto local.
#
# Las horas salen en tu hora local. Las grabaciones llevan `ms` desde que
# empezó la partida y `w` (reloj de pared) en las líneas de conexión.

const BASES = {
  local: "http://127.0.0.1:3077"
  beta: "https://beta.piles.danassistantassistant.website"
  prod: "https://piles.danassistantassistant.website"
}

def url-de [base: string] { $BASES | get -o $base | default $base }

def cache-de [base: string] {
  $env.FILE_PWD | path join ".cache" ($base | str replace -ar '[^A-Za-z0-9]+' "_")
}

def es-bot [nick: any] { ($nick | default "" | into string | str starts-with "🤖") }

# Ruta local de la grabación: la baja a la caché si hace falta.
def resolver [f: string, base: string] {
  if ($f | path exists) { return $f }
  let cache = (cache-de $base)
  if $f == "ultima" {
    let c = (if ($cache | path exists) { ls $cache | where name =~ '\.jsonl$' | sort-by name | last 1 } else { [] })
    if ($c | is-empty) { error make {msg: $"no hay nada en ($cache): usa `bajar` primero"} }
    return ($c | first | get name)
  }
  let ruta = ($cache | path join $f)
  if not ($ruta | path exists) {
    mkdir $cache
    http get --raw $"(url-de $base)/api/recordings/($f)" | save -f $ruta
  }
  $ruta
}

# { cab, ev, ev_m }: la cabecera, todas las líneas y solo las que llevan mensaje.
def cargar [f: string, base: string] {
  let ruta = (resolver $f $base)
  let todas = (open --raw $ruta | lines | where {|l| $l != "" } | each {|l| try { $l | from json } catch { null } } | compact)
  let ev = ($todas | skip 1)
  { ruta: $ruta, cab: ($todas | first), ev: $ev, ev_m: ($ev | where {|e| ($e.m? | describe) =~ "record" }) }
}

def hora [g: record, ms: int] {
  (($g.cab.started_ms + $ms) * 1_000_000) | into datetime | date to-timezone local | format date '%H:%M:%S'
}

def "main" [] {
  print (open --raw ($env.CURRENT_FILE) | lines | take while {|l| $l | str starts-with "#" } | str join (char nl))
}

def "main listar" [--base (-b): string = "local", -n: int = 10] {
  http get $"(url-de $base)/api/recordings?n=($n)" | each {|r|
    {
      archivo: $r.file
      inicio: ((($r.started_ms) * 1_000_000) | into datetime | date to-timezone local | format date '%m-%d %H:%M:%S')
      dur_s: (($r.dur_ms? | default 0) / 1000 | math round)
      sala: $r.lobby
      jugadores: ($r.players | each {|p| if $p.bot { "🤖" } else { $p.nick } } | str join ", ")
    }
  }
}

def "main bajar" [--base (-b): string = "local", -n: int = 30] {
  let cache = (cache-de $base)
  mkdir $cache
  let lista = (http get $"(url-de $base)/api/recordings?n=($n)")
  mut nuevas = 0
  for r in $lista {
    let ruta = ($cache | path join $r.file)
    if not ($ruta | path exists) {
      http get --raw $"(url-de $base)/api/recordings/($r.file)" | save -f $ruta
      $nuevas += 1
    }
  }
  print $"($lista | length) en el servidor, ($nuevas) nuevas copiadas a ($cache)"
}

def "main resumen" [f: string, --base (-b): string = "local"] {
  let g = (cargar $f $base)
  let ev = $g.ev
  print $"fichero: ($g.ruta)"
  print $"sala ($g.cab.lobby); empezó ((($g.cab.started_ms) * 1_000_000) | into datetime | date to-timezone local | format date '%m-%d %H:%M:%S'); jugadores: ($g.cab.players | each {|p| if $p.bot { '🤖' } else { $p.nick } } | str join ', ')"
  print $"líneas por t: ($ev | get t | uniq -c | each {|r| $'($r.value)=($r.count)' } | str join ' ')"
  let fin = ($ev | where t == "end" | get -o 0)
  print $"duración: (($ev | last | get ms) / 1000 | math round) s; cierre: ($fin | get -o reason | default 'SIN LÍNEA end (¿se cortó el servidor?)')"
  let tipos = ($g.ev_m | get m.type | uniq -c | sort-by count -r)
  print $"mensajes: ($tipos | each {|r| $'($r.value)=($r.count)' } | str join ' ')"
  print "── rechazos, bloqueos y avisos"
  $g.ev_m | where {|e| $e.t == "out" and $e.m.type in ["swap_failed" "error" "stunned" "debt_forced" "player_disconnected" "player_left" "game_cancelled" "sets_resynced"] } | each {|e|
    $"(hora $g $e.ms)  ($e.ms)  -> ($e.to? | default '*')  ($e.m.type)  ($e.m | reject type | to json -r | str substring 0..160)"
  } | str join (char nl) | print
}

def "main humanos" [f: string, --base (-b): string = "local"] {
  let g = (cargar $f $base)
  let ev = $g.ev_m
  print $"fin de la grabación: (($g.ev | last | get ms)) ms"
  for p in ($ev | where t == "in" | get from | uniq | where {|n| not (es-bot $n) }) {
    let mios = ($ev | where {|e| $e.t == "in" and $e.from == $p })
    let pings = ($mios | where {|e| $e.m.type == "ping" })
    let rtts = ($pings | each {|e| $e.m.rtt_ms? | default null } | compact)
    let rtt = if ($rtts | is-empty) { "sin rtt" } else { $"rtt mediana ($rtts | math median) ms, máx ($rtts | math max) ms" }
    print $"── ($p): último mensaje a los ($mios | last | get ms) ms \(($mios | last | get m.type)\); mensajes ($mios | length); pings ($pings | length); ($rtt)"
    # Los pings van cada ~3 s en partida: más de 8 s sin nada es un hueco de verdad.
    let huecos = ($mios | get ms | window 2 | where {|w| ($w.1 - $w.0) > 8000 } | each {|w| $"($w.0)→($w.1) \(($w.1 - $w.0) ms\)" })
    let final = (($g.ev | last | get ms) - ($mios | last | get ms))
    print $"   huecos >8 s: ($huecos | str join ', ')(if $final > 8000 { $'  [calló los últimos ($final) ms de la grabación]' } else { '' })"
    let conn = ($g.ev | where {|e| $e.t == "conn" and $e.player? == $p })
    if ($conn | is-not-empty) {
      print $"   conexión: ($conn | each {|c| $'($c.ms) ($c.kind)(if ($c.motivo? != null) { ':' + $c.motivo } else { '' })' } | str join ', ')"
    }
  }
}

def "main jugadas" [f: string, --base (-b): string = "local", --ventana (-w): int = 2500] {
  let g = (cargar $f $base)
  let ev = $g.ev_m
  let jugadas = ($ev | where {|e| $e.t == "in" and $e.m.type in ["take_card" "drop_card"] and not (es-bot $e.from) })
  print $"jugadas de personas: ($jugadas | length)"

  print "── sin respuesta del servidor"
  $jugadas | each {|j|
    let resp = ($ev | where {|e| $e.ms >= $j.ms and $e.ms <= ($j.ms + $ventana) and $e.t == "out" and (($e.to? == $j.from and $e.m.type in ["swap_success" "swap_failed" "stunned"]) or ($e.to? == null and $e.m.type == "swap_conflict")) })
    {ms: $j.ms, quien: $j.from, tipo: $j.m.type, dato: ($j.m | reject type | to json -r), resp: ($resp | length)}
  } | where resp == 0 | each {|r| $"($r.ms)  ($r.quien)  ($r.tipo) ($r.dato)" } | str join (char nl) | print

  print "── ráfagas (misma jugada, mismo ms)"
  $jugadas | group-by {|j| $"($j.ms)-($j.from)-($j.m.type)" } | transpose k v | where {|r| ($r.v | length) > 1 } | each {|r| $"($r.k) x($r.v | length)" } | str join (char nl) | print

  print "── deudas forzadas (se acabaron los 3 s): causa"
  let notas = ($ev | where {|e| $e.t == "in" and $e.m.type == "client_note" })
  $ev | where {|e| $e.t == "out" and $e.m.type == "debt_forced" } | each {|d|
    let quien = $d.to
    let soltada = ($ev | where {|e| $e.t == "in" and $e.from? == $quien and $e.m.type == "drop_card" and $e.ms <= $d.ms } | last 1)
    let desde = if ($soltada | is-empty) { $d.ms - 3500 } else { $soltada.0.ms }
    let en = {|e| $e.ms > $desde and $e.ms <= $d.ms }
    let intentos = ($ev | where {|e| $e.t == "in" and $e.from? == $quien and $e.m.type == "take_card" and (do $en $e) })
    let rechazos = ($ev | where {|e| $e.t == "out" and $e.to? == $quien and $e.m.type in ["swap_failed" "stunned"] and (do $en $e) })
    let peleas = ($ev | where {|e| $e.t == "out" and $e.m.type == "swap_conflict" and $quien in $e.m.players and (do $en $e) })
    let toques = ($notas | where {|e| $e.from? == $quien and $e.m.kind in ["tap_ignored" "tap_refused"] and (do $en $e) })
    let causa = if ($peleas | is-not-empty) { "pelea perdida o cedida" } else if ($rechazos | is-not-empty) { "su intento fue rechazado" } else if ($intentos | is-not-empty) { "intento sin respuesta (¿carrera del plazo?)" } else { "SIN ningún intento de coger" }
    let extra = if ($toques | is-not-empty) { $"; toques descartados por el cliente: ($toques | each {|t| $t.m.detail.motivo? | default $t.m.kind } | str join ',')" } else { "" }
    $"(hora $g $d.ms)  ($d.ms) ms  ($quien): ($causa) \(intentos ($intentos | length), rechazos ($rechazos | length), peleas ($peleas | length)\)($extra)"
  } | str join (char nl) | print
}

def "main peleas" [f: string, --base (-b): string = "local"] {
  let g = (cargar $f $base)
  let ev = $g.ev_m
  let ini = ($ev | where {|e| $e.t == "out" and $e.m.type == "swap_conflict" })
  let peleas = ($ini | each {|c|
    let res = ($ev | where {|e| $e.t == "out" and $e.m.type == "qte_resolved" and $e.m.card_id == $c.m.card_id and $e.ms >= $c.ms } | first 1)
    {desde: $c.ms, hasta: (if ($res | is-empty) { null } else { $res.0.ms }), carta: $c.m.card_id, jugadores: ($c.m.players | str join " vs "), ganador: (if ($res | is-empty) { "SIN RESOLVER" } else { $res.0.m.winner })}
  })
  print $"peleas: ($peleas | length)"
  $peleas | each {|p| $"(hora $g $p.desde)  ($p.desde)→($p.hasta) ms  carta ($p.carta)  ($p.jugadores)  ganó ($p.ganador)" } | str join (char nl) | print
  let solapes = ($peleas | enumerate | where {|x| $peleas | skip ($x.index + 1) | any {|o| $o.desde < ($x.item.hasta | default 999999999) } } | length)
  print $"solapadas con otra: ($solapes)"
  print "── bloqueos"
  $ev | where {|e| $e.t == "out" and $e.m.type == "stunned" } | each {|e| $"($e.ms)  ($e.to)  ($e.m.ms) ms" } | str join (char nl) | print
}

def "main bots" [f: string, --base (-b): string = "local"] {
  let g = (cargar $f $base)
  let ev = $g.ev_m
  let bots = ($g.cab.players | where bot | get nick)
  let drops = ($ev | where {|e| $e.t == "in" and $e.m.type == "drop_card" } | each {|e| {ms: $e.ms, quien: $e.from} })
  let centros = ($ev | where {|e| $e.t == "out" and $e.to? == null and $e.m.type == "game_update" } | each {|e| {ms: $e.ms, ids: ($e.m.center_cards | get id)} })
  let dur = ($g.ev | last | get ms)

  # Cuánto dura en la mesa lo que sueltan, hasta que alguien lo coge.
  mut dentro = {}
  mut vidas = []
  mut prev = []
  for c in $centros {
    for id in ($c.ids | where {|i| $i not-in $prev }) {
      let d = ($drops | where ms == $c.ms | get -o 0.quien | default "?")
      $dentro = ($dentro | upsert $"($id)" {desde: $c.ms, quien: $d})
    }
    for id in ($prev | where {|i| $i not-in $c.ids }) {
      let k = $"($id)"
      if $k in ($dentro | columns) {
        let x = ($dentro | get $k)
        $vidas = ($vidas | append {quien: $x.quien, ms: ($c.ms - $x.desde)})
        $dentro = ($dentro | reject $k)
      }
    }
    $prev = $c.ids
  }
  for b in $bots {
    let v = ($vidas | where quien == $b | get ms)
    let n = ($drops | where quien == $b | length)
    if ($v | is-empty) { print $"($b): ($n) soltadas, ninguna recogida"; continue }
    let cortas = ($v | where {|x| $x < 1000 } | length)
    print $"($b): ($n) soltadas \(($n * 60000 / ([$dur 1] | math max) | math round) por minuto\); en la mesa hasta que alguien la coge: mediana ($v | math median | math round) ms; menos de 1 s: ($cortas) de ($v | length)"

    # Ciclos soltar→coger: ¿recoge lo mismo que soltó? ¿hace ping-pong?
    let mias = ($ev | where {|e| ($e.from? == $b and $e.t == "in" and $e.m.type in ["drop_card" "take_card"]) or ($e.to? == $b and $e.m.type == "swap_success") })
    mut centro_prev = []
    mut ciclos = []
    mut soltada: any = null
    for e in $mias {
      if $e.t == "out" {
        let ids = ($e.m.center_cards | get id)
        let nueva = ($ids | where {|i| $i not-in $centro_prev })
        let hay_hueco = ($e.m.your_new_set | default [] | any {|c| $c == null })
        if $hay_hueco and ($nueva | length) == 1 {
          $soltada = {ms: $e.ms, id: $nueva.0}
        }
        $centro_prev = $ids
      } else if $e.m.type == "take_card" and $soltada != null {
        $ciclos = ($ciclos | append {solto_ms: $soltada.ms, id_solto: $soltada.id, id_cogio: $e.m.card_id, misma: ($e.m.card_id == $soltada.id)})
        $soltada = null
      }
    }
    let nc = ($ciclos | length)
    let mismas = ($ciclos | where misma | length)
    let pp = ($ciclos | enumerate | where {|x| $ciclos | take $x.index | any {|p| $p.id_solto == $x.item.id_cogio and ($x.item.solto_ms - $p.solto_ms) < 10000 } } | length)
    print $"   ciclos soltar→coger: ($nc); coge la MISMA que soltó: ($mismas); coge algo que soltó él hace <10 s: ($pp); un ciclo cada (($dur / ([$nc 1] | math max)) | math round) ms"
  }
  let prog = ($ev | where {|e| $e.t == "out" and $e.m.type == "game_update" } | last 1)
  if ($prog | is-not-empty) {
    print $"sets completados al final: ($prog.0.m.players_progress | each {|p| $'($p.nickname)=($p.completed_sets)' } | str join ', ')"
  }
}

def "main notas" [f: string, --base (-b): string = "local", --state] {
  let g = (cargar $f $base)
  let notas = ($g.ev_m | where {|e| $e.t == "in" and $e.m.type == "client_note" })
  let estados = ($notas | where {|e| $e.m.kind == "state" } | length)
  print $"notas del cliente: ($notas | length) \(de ellas, `state`: ($estados)\); desync: ($g.ev | where t == 'desync' | length); conn: ($g.ev | where t == 'conn' | length)"
  let notas_vis = if $state { $notas } else { $notas | where {|e| $e.m.kind != "state" } }
  let filas = ($notas_vis | each {|e|
    {ms: $e.ms, que: $"nota ($e.from)", txt: $"($e.m.kind) ($e.m.detail? | default {} | to json -r | str substring 0..200)"}
  } | append ($g.ev | where t == "conn" | each {|c|
    {ms: $c.ms, que: $"conn ($c.player? | default '*')", txt: ($c | reject -o t ms w player | to json -r)}
  }) | append ($g.ev | where t == "desync" | each {|c|
    {ms: $c.ms, que: "DESYNC", txt: ($c | reject -o t ms w | to json -r | str substring 0..300)}
  }) | sort-by ms)
  $filas | each {|r| $"(hora $g $r.ms)  ($r.ms)  ($r.que)  ($r.txt)" } | str join (char nl) | print
}

def "main linea" [f: string, quien: string, desde: int, hasta: int, --base (-b): string = "local"] {
  let g = (cargar $f $base)
  let ruido = ["qte_click" "qte_update" "combo_update" "pong" "ping"]
  $g.ev | where {|e| $e.ms >= $desde and $e.ms <= $hasta } | where {|e|
    if ($e.m? | describe) =~ "record" {
      $e.m.type not-in $ruido and (($e.t == "in" and $e.from? == $quien) or ($e.t == "out" and ($e.to? == $quien or $e.to? == null)))
    } else {
      $e.t in ["conn" "desync"] and ($e.player? == $quien or $e.t == "desync")
    }
  } | each {|e|
    if ($e.m? | describe) =~ "record" {
      let dir = if $e.t == "in" { "<-" } else { $"-> ($e.to? | default '*')" }
      let m = ($e.m | reject type)
      let txt = (if "center_cards" in ($m | columns) { $m | update center_cards { get id | str join ',' } } else { $m }) | to json -r
      $"(hora $g $e.ms)  ($e.ms)  ($dir)  ($e.m.type)  ($txt | str substring 0..160)"
    } else {
      $"(hora $g $e.ms)  ($e.ms)  ($e.t)  ($e | reject -o t ms w | to json -r | str substring 0..200)"
    }
  } | str join (char nl) | print
}
