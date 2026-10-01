# ¿Se puede desplegar? Lo que corre ahora en un servidor, de /api/estado.
#
#   nu tools/estado.nu [-b beta|prod|local]
#
# Reiniciar el servidor corta las partidas (el estado está en memoria) y borra
# las salas de espera. Sale con código 1 si hay una partida en curso.
# La respuesta es redactada: las salas privadas salen como `privada-N`.

const BASES = {
  local: "http://127.0.0.1:3077"
  beta: "https://beta.piles.danassistantassistant.website"
  prod: "https://piles.danassistantassistant.website"
}

def main [--base (-b): string = "beta"] {
  let url = ($BASES | get -o $base | default $base)
  let r = (http get --full --allow-errors $"($url)/api/estado")
  if $r.status == 404 {
    # Un servidor anterior a /api/estado: lo único que queda es la última grabación.
    let ult = (http get $"($url)/api/recordings?n=1" | first)
    let fin = (http get --raw $"($url)/api/recordings/($ult.file)" | lines | where {|l| $l != "" } | last | from json)
    let cierre = if $fin.t == "end" { $"cerró por ($fin.reason)" } else { "SIN línea `end`: puede estar en curso" }
    print $"($base): sin /api/estado \(servidor antiguo\). Última grabación ($ult.file), sala ($ult.lobby): ($cierre)."
    exit 2
  }
  let e = $r.body
  print $"($base): versión ($e.version), en marcha ($e.uptime_s / 60 | math round) min, conexiones ($e.conexiones), partidas en curso ($e.partidas_en_curso)"
  let con_gente = ($e.salas | where personas > 0)
  if ($con_gente | is-not-empty) {
    $con_gente | select id estado personas bots en_gracia mirones | print
  }
  if $e.partidas_en_curso > 0 {
    print "NO: hay partida en curso; reiniciar la corta."
    let gracia = ($e.salas | where en_gracia > 0 | length)
    if $gracia > 0 { print $"    \(($gracia) sala\(s\) con alguien en gracia de 30 s: volvería si no reinicias\)" }
    exit 1
  }
  let esperando = ($con_gente | length)
  if $esperando > 0 {
    print $"CON CUIDADO: ($esperando) sala\(s\) de espera con gente; reiniciar las borra \(se ven en la tabla\)."
  } else {
    print "SÍ: nadie jugando ni esperando."
  }
}
