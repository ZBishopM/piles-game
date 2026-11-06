// Lo que llega como script clásico antes del cliente: i18n.js, agapornis-ui (vendored) y
// qr-scanner. Solo se declara; el código está en esos archivos.

/** Texto del idioma activo (i18n.js); {x} se sustituye con `vars`. */
declare function t(key: string, vars?: Record<string, unknown>): string;
/** Escapa para meter en innerHTML (i18n.js). */
declare function esc(s: unknown): string;
declare const PilesI18n: {
    t: typeof t;
    has(key: string): boolean;
    apply(root?: ParentNode): void;
    setLang(lang: string): void;
    esc: typeof esc;
    LANGS: string[];
    HTML_LANG: Record<string, string>;
    readonly lang: string;
    dict(): Record<string, unknown>;
};

// ponytail: las librerías vendored van sin tipos (any); tiparlas si se tocan a menudo.
declare const agToast: any;
declare const agDial: any;
declare const agRank: any;
declare const agRankFx: any;
declare const QrScanner: any;

interface Window {
    t: typeof t;
    esc: typeof esc;
    PilesI18n: typeof PilesI18n;
    agToast: any;
    /** Textos de la pastilla del dial (agapornis-ui/dial.js los lee). */
    agText?: { up: string; down: string };
    onBeforeLangChange?: () => void;
    webkitAudioContext?: typeof AudioContext;
    /** Acceso a los módulos para las pruebas y la consola (juego/index.ts). */
    juego: unknown;
    mesa: unknown;
    partida: unknown;
}
