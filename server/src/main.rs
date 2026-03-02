use axum::{
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

use game::{generate_deck, distribute_cards, get_clothing_name};
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
