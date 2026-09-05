use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
    Json,
};
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};
use tower_http::services::ServeDir;
use tracing_subscriber;
use serde_json::{json, Value};

mod game;
mod websocket;

use game::{generate_deck, distribute_cards, get_clothing_name, is_valid_lobby_code};
use websocket::{ws_handler, AppState};

#[tokio::main]
async fn main() {
    // Inicializar logger
    tracing_subscriber::fmt::init();

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
        .route("/api/test-deck/:num_players", get(test_deck))
        .route("/api/qr/:lobby_code", get(lobby_qr))
        .route("/ws", get(ws_handler))
        // Servir archivos estáticos del frontend desde la carpeta "client/"
        // La carpeta debe estar al lado del binario al ejecutar
        .fallback_service(ServeDir::new("client"))
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("🎮 Piles! Server iniciado en http://{}", addr);
    tracing::info!("✅ Health check disponible en http://{}/health", addr);
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

async fn test_deck(axum::extract::Path(num_players): axum::extract::Path<u8>) -> Json<Value> {
    if num_players < 2 || num_players > 8 {
        return Json(json!({
            "error": "El número de jugadores debe estar entre 2 y 8"
        }));
    }

    let deck = generate_deck(num_players);
    let (player_sets, center_cards) = distribute_cards(deck.clone(), num_players);

    let center_cards_info: Vec<_> = center_cards.iter().map(|card| {
        json!({
            "id": card.id,
            "clothing_type": card.clothing_type,
            "name": get_clothing_name(card.clothing_type)
        })
    }).collect();

    let player_0_sets: Vec<Vec<_>> = player_sets[0].iter().map(|set| {
        set.iter().map(|card| {
            json!({
                "id": card.id,
                "clothing_type": card.clothing_type,
                "name": get_clothing_name(card.clothing_type)
            })
        }).collect()
    }).collect();

    Json(json!({
        "success": true,
        "num_players": num_players,
        "total_cards": deck.len(),
        "center_cards": center_cards_info,
        "player_0_sets": player_0_sets,
        "message": format!("Mazo generado correctamente para {} jugadores", num_players)
    }))
}
