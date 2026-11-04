# Junta mesa.html con lo que lleva incrustado y deja mesa.final.html (un solo archivo, sin red salvo el QR).
#   nu diseno/menu-mesa/construir.nu
let d = $env.FILE_PWD
let a = ($d | path join "../../client/agapornis-ui" | path expand)
let css = (open --raw $"($a)/dial.css") + "\n" + (open --raw $"($a)/rank.css")
let js = (open --raw $"($a)/dial.js") + "\n" + (open --raw $"($a)/rank.js")
let sil = "data:image/webp;base64," + (open --raw $"($d)/siluetas.webp" | encode base64)
let bra = "data:image/webp;base64," + (open --raw $"($d)/brazos.webp" | encode base64)
(open --raw $"($d)/mesa.html"
    | str replace "__AGA_CSS__" $css | str replace "__AGA_JS__" $js
    | str replace "__SIL__" $sil | str replace "__BRAZO__" $bra
    | save -f $"($d)/mesa.final.html")
print (ls $"($d)/mesa.final.html" | get 0.size)
