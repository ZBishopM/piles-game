use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};
use tower_http::services::ServeDir;
use tracing_subscriber;

mod bot;
mod game;
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

    // Configurar CORS para permitir conexiones desde el frontend
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Configurar rutas
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/qr/:lobby_code", get(lobby_qr))
        .route("/ws", get(ws_handler))
        // Servir archivos estáticos del frontend desde la carpeta "client/"
        // La carpeta debe estar al lado del binario al ejecutar
        .fallback_service(ServeDir::new("client"))
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
