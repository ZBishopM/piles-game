# Rehace mesa.js: la escena (de diseno/menu-mesa/mesa.html) + la interfaz conectada (ui.part.js).
#   nu client/mesa/juntar.nu
let d = $env.FILE_PWD
let proto = (open --raw ($d | path join "../../diseno/menu-mesa/mesa.html" | path expand))
let ini = ($proto | str index-of "// ── La partida de fondo")
let fin = ($proto | str index-of "// Menús: cada opción es una carta.")
let escena = ($proto | str substring $ini..($fin - 1) | str replace "'__BRAZO__'" "'/mesa/brazos.webp'" | str replace "'__SIL__'" "'/mesa/siluetas.webp'")
let a = ($proto | str index-of "const DIC = {")
let b = ($proto | str index-of "\n};" --range $a..)
let extra = (open --raw $"($d)/dic-extra.txt")
let dic = ($proto | str substring ($a + 12)..$b) + $extra + "}"
let ui = (open --raw $"($d)/ui.part.js" | str replace "const DIC = __DIC__;" $"const DIC = ($dic);")
let cabeza = "// El menú en la mesa (diseno/menu-mesa/README.md). Generado por juntar.nu: se edita ui.part.js\n// (la interfaz) o diseno/menu-mesa/mesa.html (la escena), no este archivo.\n'use strict';\n(() => {\n"
$cabeza + $escena + $ui + "\n})();\n" | save -f $"($d)/mesa.js"
print (ls $"($d)/mesa.js" | get 0.size)
