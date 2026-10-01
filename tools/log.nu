# El log de pm2 de beta o prod, por SSH y SOLO LECTURA: sin colores y en hora local.
#
#   nu tools/log.nu                         las últimas 200 líneas de beta
#   nu tools/log.nu -b prod -n 500
#   nu tools/log.nu --desde 30min -g "plazo|cerró|cayó"
#
# -g es una expresión regular y se aplica AQUÍ, no en el servidor.
#
# Por qué existe: el log va en UTC, con códigos ANSI y mezclando todas las
# salas; hace falta hora local para casarlo con una grabación y con lo que te
# cuentan ("a las 20:18"). Lo único que se ejecuta en el VPS es `tail`.

const HOST = "bicho@167.233.88.83"

def main [
  --base (-b): string = "beta"   # beta | prod
  --lineas (-n): int = 200
  --grep (-g): string = ""
  --desde: duration              # solo lo más reciente que esto, p. ej. 30min
] {
  let proceso = match $base {
    "beta" => "piles-beta"
    "prod" => "piles-game"
    _ => { error make {msg: $"base desconocida: ($base) (beta | prod)"} }
  }
  let r = (^ssh -o BatchMode=yes -o ConnectTimeout=10 $HOST $"tail -n ($lineas) ~/.pm2/logs/($proceso)-out.log" | complete)
  if $r.exit_code != 0 { error make {msg: $"ssh falló: ($r.stderr)"} }

  let filas = ($r.stdout | ansi strip | lines | each {|l|
    let m = ($l | parse --regex '^(?<ts>\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(?<resto>.*)$')
    if ($m | is-empty) { {t: null, txt: $l} } else {
      let n = ($m.0.resto | parse --regex '^(?<nivel>[A-Z]+)\s+(?<modulo>[\w:]+):\s?(?<msg>.*)$')
      {t: ($m.0.ts | into datetime | date to-timezone local), txt: (if ($n | is-empty) { $m.0.resto } else { $"($n.0.nivel) ($n.0.msg)" })}
    }
  })
  let por_hora = if $desde == null { $filas } else {
    let corte = ((date now) - $desde)
    $filas | where {|f| $f.t == null or $f.t >= $corte }
  }
  let por_texto = if $grep == "" { $por_hora } else { $por_hora | where {|f| $f.txt =~ $grep } }
  $por_texto | each {|f| $"(if $f.t == null { '            ' } else { $f.t | format date '%H:%M:%S%.3f' })  ($f.txt)" } | str join (char nl)
}
