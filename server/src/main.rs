use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use tracing_subscriber;

mod bot;
mod debug;
mod elo;
mod game;
mod ratings;
mod record;
mod websocket;

use game::is_valid_lobby_code;
use websocket::{ws_handler, AppState};

#[tokio::main]
async fn main() {
    // Logger. Por defecto a `info`: con `fmt::init()` a secas y sin RUST_LOG
    // puesta, todos los `tracing::info!` del servidor quedaban invisibles —
    // quién entra, quién se cae, qué prendas se retiran al abandonar alguien.
    // En el VPS pm2 recoge stdout, así que se veían los `println!` y ninguna
    // de las trazas, justo las que hacen falta para entender un incidente.
    // RUST_LOG sigue mandando si está puesta.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    // Leer puerto del entorno (útil para Fly.io, Railway, etc.)
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .expect("PORT debe ser un número válido");

    // Crear estado compartido de la aplicación
    let app_state = AppState::new();
    // Recoge las grabaciones de partidas que se quedaron a medias.
    app_state.spawn_recording_sweeper();

    // Configurar CORS para permitir conexiones desde el frontend
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Configurar rutas
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/qr/:lobby_code", get(lobby_qr))
        // Grabaciones. Bajo `/api/` porque es lo único que nginx reenvía al
        // servidor tanto en beta como en producción; los estáticos salen de
        // disco. Y NO por `ServeDir`: el directorio queda fuera de `client/`
        // a propósito, porque un fichero ahí dentro sería la mano de todos los
        // jugadores servida a internet.
        .route("/api/recordings", get(list_recordings))
        // Resumen redactado de lo que hay en marcha (ver `debug::estado_json`).
        .route("/api/estado", get(estado))
        .route("/api/recordings/:file", get(get_recording))
        // Elo. Bajo `/api/` por lo mismo que las grabaciones.
        .route("/api/elo/:key", get(get_elo))
        .route("/api/elo/link", axum::routing::post(link_elo))
        .route("/ws", get(ws_handler))
        // Servir archivos estáticos del frontend desde la carpeta "client/"
        // La carpeta debe estar al lado del binario al ejecutar
        .fallback_service(ServeDir::new("client"))
        // Sin Cache-Control el navegador guardaba lobby.html por su cuenta y,
        // tras un despliegue, seguía jugando con la versión vieja (visto en
        // beta el 2026-09-28: los avisos nuevos "no funcionaban"). no-cache =
        // preguntar siempre; si nada cambió, ServeDir contesta 304 y no se
        // vuelve a descargar nada.
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-cache"),
        ))
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("🎮 Piles! Server iniciado en http://{}", addr);
    tracing::info!("🔌 WebSocket disponible en ws://{}:{}/ws", addr.ip(), port);
    tracing::info!("🌐 Frontend disponible en http://{}/lobby.html", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind to address");

    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}

async fn health_check() -> &'static str {
    "OK"
}

#[derive(serde::Deserialize)]
struct ListQuery {
    n: Option<usize>,
}

/// Las grabaciones más nuevas. Por defecto las 10 de siempre —lo que ve quien
/// usa el visor—; con `?n=` se piden más (hasta lo que se guarda en disco), que
/// es lo que usan las herramientas de depuración.
async fn list_recordings(State(state): State<AppState>, Query(q): Query<ListQuery>) -> Response {
    let n = q.n.unwrap_or(record::LISTED).clamp(1, record::LISTED_MAX);
    let lista = record::list(state.rec.dir(), n);
    (
        [(header::CACHE_CONTROL, "no-store")],
        axum::Json(lista),
    ).into_response()
}

/// Qué hay en marcha: versión, conexiones, salas y partidas en curso. Redactado
/// para ser público; ver `debug::estado_json`.
async fn estado(State(state): State<AppState>) -> Response {
    let salas = state.lobby_manager.all_lobbies().await;
    let conexiones = state.connections.read().await.len();
    let vistos = state.last_seen.lock().map(|v| v.clone()).unwrap_or_default();
    // El commit lo pone CI al compilar (`GITHUB_SHA`); en local, "dev".
    let version = option_env!("GITHUB_SHA").map_or("dev", |s| &s[..s.len().min(7)]);
    let j = debug::estado_json(&salas, conexiones, state.started.elapsed().as_secs(), version, &vistos);
    ([(header::CACHE_CONTROL, "no-store")], axum::Json(j)).into_response()
}

/// Una grabación entera, tal cual está en disco.
async fn get_recording(State(state): State<AppState>, Path(file): Path<String>) -> Response {
    // Se valida el nombre, no se limpia: limpiar es como se cuelan los `..`.
    if !record::valid_name(&file) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match std::fs::read_to_string(state.rec.dir().join(&file)) {
        Ok(texto) => (
            [
                (header::CONTENT_TYPE, "application/x-ndjson; charset=utf-8"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            texto,
        ).into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// El Elo de una clave. 404 si nunca ha jugado.
async fn get_elo(State(state): State<AppState>, Path(key): Path<String>) -> Response {
    if !ratings::valid_key(&key) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match state.ratings.get(&key) {
        Some(rec) => {
            // Con la posición en cada clasificación: el dial necesita saber si
            // es del Top 3 para enseñarlo.
            let (fun, glory) = state.ratings.top3_flags(&key);
            let mut j = serde_json::to_value(rec).unwrap_or_default();
            if let Some(o) = j.as_object_mut() {
                o.insert("top3".into(), serde_json::json!({ "fun": fun, "glory": glory }));
            }
            ([(header::CACHE_CONTROL, "no-store")], axum::Json(j)).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(serde::Deserialize)]
struct LinkRequest {
    anon: String,
    account: String,
    /// `"anon"`: el del navegador pasa a la cuenta. `"account"`: se queda el
    /// de la cuenta. En los dos casos el anónimo se borra.
    keep: String,
}

/// Vincula el Elo de un navegador con una cuenta. Devuelve el de la cuenta
/// tal y como queda (o `null` si ninguno había jugado).
async fn link_elo(State(state): State<AppState>, axum::Json(req): axum::Json<LinkRequest>) -> Response {
    let keep_anon = match req.keep.as_str() {
        "anon" => true,
        "account" => false,
        _ => return (StatusCode::BAD_REQUEST, "keep: anon | account").into_response(),
    };
    match state.ratings.link(&req.anon, &req.account, keep_anon) {
        Ok(rec) => axum::Json(rec).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e).into_response(),
    }
}

/// SVG con el QR de un lobby. Codifica el enlace de invitación completo,
/// así que la cámara nativa del teléfono basta para entrar — no hace falta
/// escanear desde dentro de la app.
///
/// El SVG lo genera el servidor entero; lo único variable es un código ya
/// validado contra el alfabeto que lo genera, que no contiene `< > & " '`.
/// Aun así el cliente lo carga con `<img>`, donde el navegador nunca ejecuta
/// scripts incrustados, y la respuesta va con cabeceras que lo refuerzan.
async fn lobby_qr(
    State(state): State<AppState>,
    Path(lobby_code): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !is_valid_lobby_code(&lobby_code) {
        return StatusCode::NOT_FOUND.into_response();
    }
    // Mismo 404 que un código mal formado: así el endpoint no delata qué
    // códigos existen.
    if state.lobby_manager.get_lobby(&lobby_code).await.is_none() {
        return StatusCode::NOT_FOUND.into_response();
    }

    let host = match headers.get(header::HOST).and_then(|h| h.to_str().ok()) {
        Some(h) => h,
        None => return StatusCode::BAD_REQUEST.into_response(),
    };
    // nginx aquí no reenvía X-Forwarded-Proto (solo Host y X-Real-IP), así
    // que en producción manda el valor por defecto: https. En local no hay
    // TLS, y un QR con https://localhost no serviría para nada.
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|h| h.to_str().ok())
        .unwrap_or_else(|| {
            if host.starts_with("localhost") || host.starts_with("127.0.0.1") {
                "http"
            } else {
                "https"
            }
        });
    let join_url = format!("{scheme}://{host}/lobby.html?join={lobby_code}");

    let qr = match fast_qr::QRBuilder::new(join_url).build() {
        Ok(qr) => qr,
        Err(err) => {
            tracing::error!("no se pudo generar el QR de {lobby_code}: {err}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let svg = fast_qr::convert::svg::SvgBuilder::default().to_str(&qr);

    (
        [
            (header::CONTENT_TYPE, "image/svg+xml; charset=utf-8"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
            (header::CONTENT_SECURITY_POLICY, "default-src 'none'"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        svg,
    )
        .into_response()
}
