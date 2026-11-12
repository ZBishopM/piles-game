# La música del juego: editarla en LMMS, probarla, publicarla en beta, promoverla y volver atrás.
#
#   nu tools/musica.nu abrir partida        abre musica/partida.mmp en LMMS (o `menu`)
#   nu tools/musica.nu render               musica/*.mmp → client/musica/*.ogg (para oírla en local)
#   nu tools/musica.nu publicar "qué cambió"   render + versión nueva (musica-vN) + beta
#   nu tools/musica.nu versiones            las versiones publicadas, la más nueva arriba
#   nu tools/musica.nu volver musica-v3     deja la música de esa versión (proyectos y pistas) y la publica en beta
#   nu tools/musica.nu promover             lanza «Promote to production» (lo apruebas tú en GitHub)
#
# Los proyectos de LMMS viven en musica/ y se versionan con las pistas: volver a una versión
# devuelve también sus .mmp, así se puede seguir editando desde ella. Ver musica/README.md.

const LMMS = "C:/Program Files/LMMS/lmms.exe"
const ARCHIVOS = [musica client/musica/menu.ogg client/musica/partida.ogg client/musica/musica.json]

def raiz [] { $env.FILE_PWD | path dirname }
def versiones [] { ^git tag -l "musica-v*" | lines | where $it =~ '^musica-v\d+$' | sort-by { $in | str replace "musica-v" "" | into int } }
def rama [] { ^git branch --show-current | str trim }

def main [] { help main }

# Abre el proyecto en LMMS (menu o partida). Guarda con Ctrl+S; no hace falta exportar nada.
def "main abrir" [cual: string = "partida"] {
    let f = (raiz | path join musica $"($cual).mmp")
    if not ($f | path exists) { error make { msg: $"no existe ($f): usa menu o partida" } }
    ^cmd /c start "" $LMMS $f
}

# musica/*.mmp → client/musica/*.ogg y musica.json. Para oírla: arranca el servidor local y abre el juego.
def "main render" [--intro-compases: int = 4] {
    cd (raiz)
    ^python -I tools/musica.py --intro-compases $intro_compases
}

# Renderiza, guarda una versión nueva (etiqueta musica-vN) y la sube a beta.
def "main publicar" [nota: string, --intro-compases: int = 4, --forzar] {
    cd (raiz)
    # Se mira si cambió algún proyecto, no las pistas: dos renders del mismo .mmp no salen idénticos byte a byte.
    if (not $forzar) and (^git status --porcelain -- musica | str trim | is-empty) {
        print "nada que publicar: no has guardado cambios en musica/*.mmp (con --forzar se publica igual, p. ej. tras cambiar --intro-compases)"; return
    }
    ^python -I tools/musica.py --intro-compases $intro_compases
    ^git add ...$ARCHIVOS
    let n = ((versiones | each { $in | str replace "musica-v" "" | into int } | append 0 | math max) + 1)
    ^git commit -q -m $"musica-v($n): ($nota)" -- ...$ARCHIVOS
    ^git tag $"musica-v($n)"
    ^git push -q origin $"(rama)" $"(rama):beta" $"musica-v($n)"
    print $"publicada musica-v($n) en beta. Cuando acabe el CI: https://beta.piles.agapornis.app"
}

# Las versiones publicadas (la más nueva, arriba) y cuál suena ahora en producción.
def "main versiones" [] {
    cd (raiz)
    ^git fetch -q origin master --tags
    let prod = (versiones | where { (do -i { ^git merge-base --is-ancestor $in origin/master } | complete).exit_code == 0 } | last 1)
    versiones | reverse | each {|v| { version: $v, fecha: (^git log -1 --format=%cs $v | str trim), nota: (^git log -1 --format=%s $v | str replace -r '^musica-v\d+: ' ''), produccion: (if $v in $prod { "← producción" } else { "" }) } }
}

# Deja la música (proyectos .mmp y pistas) como en esa versión y la publica en beta como versión nueva.
def "main volver" [version: string] {
    cd (raiz)
    if $version not-in (versiones) { error make { msg: $"no existe ($version). Mira `nu tools/musica.nu versiones`" } }
    ^git checkout $version -- ...$ARCHIVOS
    ^git add ...$ARCHIVOS
    if (^git diff --cached --name-only | str trim | is-empty) { print $"la música ya es la de ($version)"; return }
    let n = ((versiones | each { $in | str replace "musica-v" "" | into int } | math max) + 1)
    ^git commit -q -m $"musica-v($n): vuelta a ($version)" -- ...$ARCHIVOS
    ^git tag $"musica-v($n)"
    ^git push -q origin $"(rama)" $"(rama):beta" $"musica-v($n)"
    print $"beta vuelve a sonar como ($version) \(ahora es musica-v($n)\). Para producción: nu tools/musica.nu promover"
}

# Lleva a producción lo que hay en beta (música y lo demás). Hay que aprobarlo en GitHub.
def "main promover" [] {
    cd (raiz)
    ^gh workflow run promote.yml
    sleep 5sec
    print $"aprueba aquí: (^gh run list --workflow promote.yml --limit 1 --json url | from json | get 0.url)"
}
