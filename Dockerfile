# ── Etapa 1: Compilar ────────────────────────────────────────────────────────
FROM rust:1.75-slim AS builder

WORKDIR /app

# Instalar dependencias del sistema necesarias para compilar
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copiar manifiestos primero (para cachear dependencias)
COPY server/Cargo.toml server/Cargo.lock ./

# Crear src dummy para que cargo descargue dependencias sin el código real
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copiar el código real y compilar
COPY server/src ./src
# Tocar main.rs para forzar recompilación
RUN touch src/main.rs && cargo build --release

# ── Etapa 2: Imagen final (mínima) ───────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar el binario compilado
COPY --from=builder /app/target/release/piles-server .

# Copiar el frontend (ServeDir lo sirve desde ./client/)
COPY client ./client

EXPOSE 3000

ENV PORT=3000

CMD ["./piles-server"]
