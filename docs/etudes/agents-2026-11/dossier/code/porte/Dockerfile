# syntax=docker/dockerfile:1
# La porte des webhooks (dossier agents, chapitre 15). Railway la construit depuis la racine du dépôt, avec
# RAILWAY_DOCKERFILE_PATH=services/porte/Dockerfile (note 02, section 5 : à vérifier dans la documentation de Railway).
# Le contexte n'emporte que services/porte et le certificat RDS (Dockerfile.dockerignore).

# cargo-chef : les dépendances se compilent dans une couche à part, gardée en cache tant que Cargo.lock ne change pas.
FROM rust:1.97.0-slim-bookworm AS chef
RUN cargo install cargo-chef --version 0.1.78 --locked
WORKDIR /app

FROM chef AS planner
COPY services/porte/ ./
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --locked --recipe-path recipe.json
COPY services/porte/ ./
RUN cargo build --release --locked --bin porte

# Ni shell ni gestionnaire de paquets, un utilisateur sans droits. Le binaire ne demande que glibc, libm et libgcc
# (ldd) : rustls et ring, pas d'OpenSSL. Même version de Debian que l'étape de construction (glibc).
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/porte /usr/local/bin/porte
# Même fichier et même chemin que dans l'image de web (README, « En ligne ») : DATABASE_URL_PORTE est la même chaîne
# sur les deux services, sslmode=verify-full&sslrootcert=/app/certs/rds-eu-central-1-bundle.pem.
COPY certs/rds-eu-central-1-bundle.pem /app/certs/rds-eu-central-1-bundle.pem
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/porte"]
