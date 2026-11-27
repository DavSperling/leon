// La porte des webhooks de Leon, en Rust (dossier agents, chapitre 15). Seconde mise en œuvre du contrat que tient
// d'abord la route Hono (src/server/webhooks/hono-gate.ts, chapitre 03) : mêmes adresses, mêmes étapes dans le même
// ordre, mêmes limites (fournisseurs.json), mêmes réponses sur chaque cas de vecteurs.json (section « gate »). Ce qui
// diffère hors de ces cas est écrit au chapitre 15, section 9.4.
//
// Elle reçoit une livraison, la vérifie sur le corps brut, la dépose par porte_deposer et répond. Rien d'autre : ni
// pg-boss, ni jeton OAuth, ni LEON_CONNECTORS_KEY, ni lecture de la mémoire (architecture, section 3). Son rôle
// Postgres, leon_porte, n'exécute que porte_secret et porte_deposer. Elle ne reçoit que ses variables (section 9.1 du
// chapitre 15) : sa base, sa clé, son adresse publique, l'en-tête de l'adresse IP et les secrets de signature que
// fournisseurs.json nomme.

mod depot;
mod secret;
mod verifier;

#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::pin::Pin;
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::{Body, HttpBody};
use axum::extract::{Path, RawQuery, Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::Response;
use axum::routing::{get, post};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::time::Instant;
use tracing_subscriber::Layer as _;
use tracing_subscriber::filter::{LevelFilter, Targets};
use tracing_subscriber::layer::SubscriberExt as _;
use tracing_subscriber::util::SubscriberInitExt as _;

use crate::depot::{DB_CALL_TIMEOUT, Deposit, GateState, PorteStore, StoreError};
use crate::secret::{open_subscription_secret, parse_porte_key, subscription_aad};
use crate::verifier::{
    BodyFormat, VerifyInput, WebhookSecret, WebhookVerification, parse_body_json, read_pointer,
    secret_headers, verify_webhook,
};

// fournisseurs.json est compilé dans le binaire : l'image et le fichier ne peuvent pas diverger. Il est relu et
// vérifié au démarrage ; une version inconnue arrête le service.
const PROVIDERS_JSON: &str = include_str!("../fournisseurs.json");
const PORTE_FORMAT_VERSION: u64 = 1;
const PATH_APP: &str = "/h/{outil}";
const PATH_SUBSCRIPTION: &str = "/h/{outil}/{abonnement}";
const PATH_LIFECYCLE: &str = "/h/{outil}/{abonnement}/cycle";
// Au-delà, la requête reçoit 503 (porte.delai) et l'éditeur réessaie. 3 secondes : le plus court délai d'éditeur
// relevé (chapitre 15, section 4). Chaque appel de base a son propre délai, plus court (DB_CALL_TIMEOUT, depot.rs).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
// La lecture qui prouve la base au démarrage : porte_secret sur un outil qui n'existe pas. Elle passe par tout ce
// qu'une livraison demande (adresse, TLS et certificat, mot de passe, droit d'exécuter porte_secret, migration 0083)
// et ne rend aucune ligne.
const PROBE_TOOL: &str = "sante";
const PROBE_SUBSCRIPTION: &str = "00000000-0000-0000-0000-000000000000";
const PROBE_PAUSE: Duration = Duration::from_secs(1);
// Sentry : un envoi par nom d'événement et par fenêtre, au plus.
const SENTRY_WINDOW: Duration = Duration::from_secs(60);

// fournisseurs.json (chapitre 03, 7.1), champ pour champ.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Providers {
    pub version: u64,
    #[allow(dead_code)] // rappel « fichier généré », lu pour que deny_unknown_fields l'accepte
    pub generated_by: String,
    pub paths: Paths,
    pub limits: Limits,
    pub kept_headers: Vec<String>,
    pub tools: BTreeMap<String, ToolSpec>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Paths {
    pub app: String,
    pub abonnement: String,
    pub cycle: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Limits {
    pub body_max_bytes: usize,
    pub headers_max_bytes: usize,
    pub header_value_max_chars: usize,
    pub echo_max_chars: usize,
    pub delivery_id_max_chars: usize,
    pub account_max_chars: usize,
    pub refusal_min_delay_ms: u64,
    pub lookup_misses_per_ip: u32,
    pub lookup_misses_unknown_ip: u32,
    pub lookup_misses_window_seconds: u64,
    pub negative_cache_seconds: u64,
    pub secret_cache_seconds: u64,
    pub cache_max_entries: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Scope {
    App,
    Abonnement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub(crate) enum Handshake {
    #[serde(rename = "echo-validation-token")]
    EchoValidationToken,
    #[serde(rename = "slack-challenge")]
    SlackChallenge,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ToolSpec {
    pub scope: Scope,
    pub body_format: BodyFormat,
    pub account_pointer: Option<String>,
    pub delivery_header: Option<String>,
    pub handshake: Option<Handshake>,
    pub lifecycle: bool,
    pub verification: WebhookVerification,
}

// /^[a-z][a-z0-9_]{1,39}$/ de hono-gate.ts (OUTIL).
fn is_tool_id(text: &str) -> bool {
    let bytes = text.as_bytes();
    (2..=40).contains(&bytes.len())
        && bytes[0].is_ascii_lowercase()
        && bytes
            .iter()
            .all(|&b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

// Le nom d'outil écrit au journal : celui de l'adresse s'il a la forme d'un identifiant, sinon « inconnu ».
fn tool_label(outil: &str) -> &str {
    if is_tool_id(outil) { outil } else { "inconnu" }
}

// Un UUID en minuscules (UUID de hono-gate.ts) : l'adresse d'un abonnement, telle que le worker l'a écrite.
fn is_lower_uuid(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, &b)| match index {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}

pub(crate) fn load_providers(text: &str) -> Result<Providers, String> {
    let providers: Providers = serde_json::from_str(text)
        .map_err(|error| format!("fournisseurs.json illisible : {error}"))?;
    if providers.version != PORTE_FORMAT_VERSION {
        return Err(format!(
            "fournisseurs.json est en version {}, ce binaire lit la version {PORTE_FORMAT_VERSION} : reconstruire la porte",
            providers.version
        ));
    }
    let paths = &providers.paths;
    if (
        paths.app.as_str(),
        paths.abonnement.as_str(),
        paths.cycle.as_str(),
    ) != (PATH_APP, PATH_SUBSCRIPTION, PATH_LIFECYCLE)
    {
        return Err("fournisseurs.json : des adresses que ce binaire ne sert pas".into());
    }
    for (id, tool) in &providers.tools {
        if !is_tool_id(id) {
            return Err(format!(
                "fournisseurs.json : identifiant d'outil mal formé ({id})"
            ));
        }
        if tool.scope == Scope::App && tool.account_pointer.is_none() {
            return Err(format!(
                "fournisseurs.json : {id} est d'application, sans accountPointer"
            ));
        }
    }
    if providers
        .kept_headers
        .iter()
        .any(|name| name.to_lowercase() != *name)
    {
        return Err("fournisseurs.json : un en-tête gardé n'est pas en minuscules".into());
    }
    Ok(providers)
}

// Ce que la porte lit dans son environnement, hors base et port. Une valeur vide vaut absente, comme emptyIsAbsent
// dans src/server/env.ts.
pub(crate) struct PorteSettings {
    pub porte_key: Option<[u8; 32]>,           // LEON_PORTE_KEY
    pub base: Option<String>,                  // LEON_PORTE_URL, sans « / » final
    pub ip_header: Option<String>,             // LEON_IP_HEADER, en minuscules
    pub app_secrets: BTreeMap<String, String>, // les seules variables que fournisseurs.json nomme (from: 'env')
}

pub(crate) fn porte_settings(
    providers: &Providers,
    var: impl Fn(&str) -> Option<String>,
) -> Result<PorteSettings, String> {
    let read = |name: &str| var(name).filter(|value| !value.is_empty());
    let porte_key = match read("LEON_PORTE_KEY") {
        None => None,
        Some(value) => Some(parse_porte_key(&value).ok_or("LEON_PORTE_KEY : 32 octets en base64")?),
    };
    let base = match read("LEON_PORTE_URL") {
        None => None,
        Some(url) if url.starts_with("https://") || url.starts_with("http://") => {
            Some(url.trim_end_matches('/').to_string())
        }
        Some(_) => return Err("LEON_PORTE_URL : une adresse http ou https".into()),
    };
    let ip_header = read("LEON_IP_HEADER").map(|name| name.to_lowercase());
    let mut app_secrets = BTreeMap::new();
    for tool in providers.tools.values() {
        if let WebhookSecret::Env { name } = tool.verification.secret()
            && let Some(value) = read(name)
        {
            app_secrets.insert(name.clone(), value);
        }
    }
    Ok(PorteSettings {
        porte_key,
        base,
        ip_header,
        app_secrets,
    })
}

// La clé d'une adresse IP pour la limite de débit (ipKey de hono-gate.ts). Une IPv4 telle quelle. Une IPv6 réduite à
// son /64 : un client qui tient un /64 en changerait à chaque requête. Une IPv4 écrite en IPv6 (::ffff:a.b.c.d)
// compte comme l'IPv4. None : pas une adresse.
pub(crate) fn ip_key(value: &str) -> Option<String> {
    if value.parse::<Ipv4Addr>().is_ok() {
        return Some(value.to_string());
    }
    // La zone (fe80::1%eth0) est admise par isIP de Node, puis retirée.
    let (address, zone) = match value.split_once('%') {
        Some((address, zone)) => (address, Some(zone)),
        None => (value, None),
    };
    if zone.is_some_and(|zone| {
        zone.is_empty()
            || !zone
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b':'))
    }) {
        return None;
    }
    let ip: Ipv6Addr = address.parse().ok()?;
    let segments = ip.segments();
    let dotted = address.rsplit(':').next().filter(|tail| tail.contains('.'));
    if let Some(dotted) = dotted
        && segments[..5].iter().all(|&group| group == 0)
        && segments[5] == 0xffff
    {
        return Some(dotted.to_string());
    }
    Some(format!(
        "{:x}:{:x}:{:x}:{:x}::/64",
        segments[0], segments[1], segments[2], segments[3]
    ))
}

// String.prototype.trim de JavaScript : ses espaces, pas ceux de Rust (U+0085 n'en est pas un en JavaScript).
fn js_trim(text: &str) -> &str {
    text.trim_matches(|c: char| {
        matches!(
            c,
            '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
                ..='\u{200a}'
                    | '\u{2028}'
                    | '\u{2029}'
                    | '\u{202f}'
                    | '\u{205f}'
                    | '\u{3000}'
                    | '\u{feff}'
        )
    })
}

// La longueur d'un texte comme la compte JavaScript : en unités UTF-16.
fn js_length(text: &str) -> usize {
    text.encode_utf16().count()
}

// Les en-têtes reçus, comme Object.fromEntries(new Headers(…)) : noms en minuscules, valeurs lues octet par octet
// (latin-1), deux en-têtes du même nom joints par « , ».
fn header_map(headers: &HeaderMap) -> BTreeMap<String, String> {
    let mut map: BTreeMap<String, String> = BTreeMap::new();
    for (name, value) in headers {
        let text: String = value.as_bytes().iter().map(|&b| char::from(b)).collect();
        map.entry(name.as_str().to_string())
            .and_modify(|joined| {
                joined.push_str(", ");
                joined.push_str(&text);
            })
            .or_insert(text);
    }
    map
}

// La première valeur d'un paramètre de la chaîne de requête, décodée comme URLSearchParams.
fn query_param(query: Option<&str>, name: &str) -> Option<String> {
    form_urlencoded::parse(query?.as_bytes())
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
}

// L'adresse appelée, telle que l'éditeur l'a signée : LEON_PORTE_URL, le chemin public, la chaîne de requête reçue.
fn public_uri(base: Option<&str>, target: &Target, query: Option<&str>) -> String {
    let mut uri = format!("{}/h/{}", base.unwrap_or(""), target.outil);
    if let Some(abonnement) = &target.abonnement {
        uri.push('/');
        uri.push_str(abonnement);
    }
    if target.cycle {
        uri.push_str("/cycle");
    }
    if let Some(query) = query.filter(|query| !query.is_empty()) {
        uri.push('?');
        uri.push_str(query);
    }
    uri
}

fn json_response(status: StatusCode, body: &'static str) -> Response {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    response
}

fn invalid_request() -> Response {
    json_response(StatusCode::BAD_REQUEST, r#"{"error":"Invalid request"}"#)
}

fn unavailable() -> Response {
    json_response(
        StatusCode::SERVICE_UNAVAILABLE,
        r#"{"error":"Unavailable"}"#,
    )
}

fn accepted() -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = StatusCode::ACCEPTED;
    response
}

// L'écho d'une poignée de main : du texte brut, jamais interprété par un navigateur.
fn echo(token: &str, limits: &Limits) -> Response {
    let control = token.chars().any(|c| (c as u32) < 0x20 || c as u32 == 0x7f);
    if js_length(token) > limits.echo_max_chars || control {
        return invalid_request();
    }
    let mut response = Response::new(Body::from(token.to_string()));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

// Sentry reçoit au plus un envoi par nom d'événement et par minute : une panne de base (une erreur par livraison) ou
// un expéditeur qui insiste ne doivent ni épuiser le quota ni noyer les autres alertes. Le journal, lui, garde chaque
// occurrence. L'envoi suivant dit combien ont été tues entre-temps.
pub(crate) struct SentryThrottle {
    last: BTreeMap<String, (std::time::Instant, u32)>, // dernier envoi, occurrences tues depuis
}

impl SentryThrottle {
    pub(crate) const fn new() -> Self {
        Self {
            last: BTreeMap::new(),
        }
    }

    // Some(n) : envoyer, n occurrences ont été tues depuis le dernier envoi. None : taire celle-ci.
    pub(crate) fn admit(&mut self, event: &str, now: std::time::Instant) -> Option<u32> {
        match self.last.get_mut(event) {
            Some((sent, muted)) if now.duration_since(*sent) < SENTRY_WINDOW => {
                *muted += 1;
                None
            }
            Some((sent, muted)) => {
                let count = *muted;
                (*sent, *muted) = (now, 0);
                Some(count)
            }
            None => {
                self.last.insert(event.to_string(), (now, 0));
                Some(0)
            }
        }
    }
}

static SENTRY_THROTTLE: Mutex<SentryThrottle> = Mutex::new(SentryThrottle::new());

// Le journal : une ligne JSON sur la sortie standard, et Sentry (au plus une fois par minute pour un même événement).
// Comme logError (src/server/log.ts) : le nom de l'événement, des identifiants, un résumé d'erreur sans texte reçu.
// Jamais un en-tête, un corps ou un secret.
pub(crate) fn log_error(event: &str, summary: &str, ids: &[(&str, &str)]) {
    let details: BTreeMap<&str, &str> = ids.iter().copied().collect();
    let details = serde_json::to_string(&details).unwrap_or_default();
    tracing::error!(event, details = %details, error = summary, "[leon]");
    let admitted = SENTRY_THROTTLE
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .admit(event, std::time::Instant::now());
    let Some(muted) = admitted else {
        return;
    };
    let message = match muted {
        0 => format!("{event}: {summary}"),
        n => format!("{event}: {summary} (et {n} autres depuis le dernier envoi, au journal)"),
    };
    sentry::with_scope(
        |scope| {
            scope.set_tag("event", event);
            for (key, value) in ids {
                scope.set_extra(key, (*value).into());
            }
        },
        || sentry::capture_message(&message, sentry::Level::Error),
    );
}

// Ce qui part vers Sentry (before_send), dans l'esprit de scrubEvent (src/server/sentry-scrub.ts) : rien de ce qui
// pourrait citer une donnée reçue. Le message d'un log_error est construit sans texte reçu : il reste, reconnu à son
// étiquette `event`. Tout autre texte (une panique, dont le message peut citer la chaîne qu'on lisait) est masqué. Ni
// requête, ni utilisateur, ni fil d'Ariane ; des extras, seulement les identifiants que log_error pose.
const MASKED: &str = "[masqué]";
const KEPT_EXTRA: [&str; 3] = ["outil", "abonnement", "etape"];

pub(crate) fn scrub_event(
    mut event: sentry::protocol::Event<'static>,
) -> sentry::protocol::Event<'static> {
    if !event.tags.contains_key("event") {
        if event.message.is_some() {
            event.message = Some(MASKED.into());
        }
        event.logentry = None;
        for exception in &mut event.exception.values {
            if exception.value.is_some() {
                exception.value = Some(MASKED.into());
            }
        }
    }
    event.request = None;
    event.user = None;
    event.breadcrumbs = Default::default();
    event
        .extra
        .retain(|key, _| KEPT_EXTRA.contains(&key.as_str()));
    event
}

// Un appel de base borné par DB_CALL_TIMEOUT : au-delà, la même erreur qu'une panne (503, porte.base). Une écriture
// qui aurait abouti malgré tout ne se double pas : l'éditeur réessaie, porte_deposer rend 0, la porte répond 202.
async fn bounded<T>(call: impl Future<Output = Result<T, StoreError>>) -> Result<T, StoreError> {
    tokio::time::timeout(DB_CALL_TIMEOUT, call)
        .await
        .unwrap_or_else(|_| Err(StoreError("Timeout".into())))
}

enum BodyError {
    TooLarge,
    Interrupted,
}

// Le corps, lu jusqu'à `max` octets et compté en le lisant : un corps sans content-length (envoyé par morceaux) est
// borné comme les autres. Au-delà : TooLarge. Une erreur de lecture (le client coupe, un corps tronqué) : Interrupted.
async fn read_body(mut body: Body, max: usize) -> Result<Vec<u8>, BodyError> {
    let mut bytes = Vec::new();
    while let Some(frame) = std::future::poll_fn(|cx| Pin::new(&mut body).poll_frame(cx)).await {
        let frame = frame.map_err(|_| BodyError::Interrupted)?;
        if let Ok(data) = frame.into_data() {
            if bytes.len() + data.len() > max {
                return Err(BodyError::TooLarge);
            }
            bytes.extend_from_slice(&data);
        }
    }
    Ok(bytes)
}

#[derive(Debug, Clone)]
pub(crate) struct Target {
    pub outil: String,
    pub abonnement: Option<String>,
    pub cycle: bool,
}

enum SecretLookup {
    Found(String),
    Refused,
    Unavailable,
}

pub(crate) type Clock = Box<dyn Fn() -> i64 + Send + Sync>;

pub(crate) fn wall_clock_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as i64)
}

pub(crate) struct Porte<S> {
    providers: Providers,
    settings: PorteSettings,
    store: S,
    state: Mutex<GateState>,
    clock: Clock,
    ready: AtomicBool, // la base a répondu au moins une fois depuis le démarrage (wait_for_base)
}

impl<S: PorteStore> Porte<S> {
    pub(crate) fn new(
        providers: Providers,
        settings: PorteSettings,
        store: S,
        clock: Clock,
    ) -> Self {
        let limits = &providers.limits;
        let state = GateState::new(
            limits.secret_cache_seconds,
            limits.negative_cache_seconds,
            limits.lookup_misses_window_seconds,
            limits.cache_max_entries,
        );
        Self {
            providers,
            settings,
            store,
            state: Mutex::new(state),
            clock,
            ready: AtomicBool::new(false),
        }
    }

    pub(crate) fn is_ready(&self) -> bool {
        self.ready.load(Ordering::Relaxed)
    }

    // Au démarrage : lire la base jusqu'à la première lecture réussie, puis le dire à /sante. Une seule fois : une
    // panne de base plus tard ne fait jamais échouer /sante (les livraisons reçoivent 503, l'éditeur réessaie).
    pub(crate) async fn wait_for_base(&self) {
        loop {
            match bounded(self.store.secret(PROBE_TOOL, PROBE_SUBSCRIPTION)).await {
                Ok(_) => {
                    self.ready.store(true, Ordering::Relaxed);
                    tracing::info!(event = "porte.prete", "[leon]");
                    return;
                }
                Err(error) => log_error("porte.base", &error.0, &[("etape", "demarrage")]),
            }
            tokio::time::sleep(PROBE_PAUSE).await;
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, GateState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn spec_for(&self, target: &Target) -> Option<(&str, &ToolSpec)> {
        if !is_tool_id(&target.outil) {
            return None;
        }
        let (id, spec) = self.providers.tools.get_key_value(&target.outil)?;
        let fits = match &target.abonnement {
            None => spec.scope == Scope::App,
            Some(abonnement) => spec.scope == Scope::Abonnement && is_lower_uuid(abonnement),
        };
        if !fits || (target.cycle && !spec.lifecycle) {
            return None;
        }
        Some((id.as_str(), spec))
    }

    // L'adresse IP du client, lue dans le seul en-tête que pose le proxy de confiance, réduite à sa clé.
    fn client_ip(&self, headers: &BTreeMap<String, String>) -> Option<String> {
        let name = self.settings.ip_header.as_ref()?;
        let value = js_trim(headers.get(name)?);
        if value.is_empty() {
            None
        } else {
            ip_key(value)
        }
    }

    // Le refus uniforme : même réponse, et au plus tôt au même délai, quelle qu'en soit la raison.
    async fn refuse(&self, started: Instant) -> Response {
        let delay = Duration::from_millis(self.providers.limits.refusal_min_delay_ms);
        tokio::time::sleep_until(started + delay).await;
        json_response(StatusCode::UNAUTHORIZED, r#"{"error":"Invalid signature"}"#)
    }

    // Au journal seulement, pas dans Sentry : n'importe qui peut envoyer un gros corps à n'importe quelle adresse, avant
    // toute vérification. Un éditeur qui en enverrait se voit dans les lignes porte.reponse (statut 413, par outil).
    fn too_large(&self, outil: &str) -> Response {
        tracing::warn!(
            event = "porte.trop_gros",
            outil = tool_label(outil),
            "[leon]"
        );
        json_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            r#"{"error":"Request too large"}"#,
        )
    }

    async fn secret_for(
        &self,
        outil: &str,
        spec: &ToolSpec,
        abonnement: Option<&str>,
        ip: Option<&str>,
        now_ms: i64,
    ) -> Result<SecretLookup, StoreError> {
        let limits = &self.providers.limits;
        let from = spec.verification.secret();
        if spec.scope == Scope::Abonnement
            && let Some(abonnement) = abonnement
        {
            let key = format!("{outil}:{abonnement}");
            let cached = self.state().secrets.get(&key, now_ms);
            let row = match cached {
                Some(row) => row,
                None => {
                    let source = ip.unwrap_or("inconnue");
                    {
                        let mut state = self.state();
                        if state.unknown.get(&key, now_ms).is_some() {
                            return Ok(SecretLookup::Refused);
                        }
                        let cap = if ip.is_some() {
                            limits.lookup_misses_per_ip
                        } else {
                            limits.lookup_misses_unknown_ip
                        };
                        // Limite atteinte : on ne lit plus la base pour cette source, mais on ne refuse pas non plus. Un
                        // abonnement vivant hors cache doit pouvoir être rejoué par l'éditeur (503), jamais refusé
                        // comme une fausse signature.
                        if state.misses.get(source, now_ms) >= cap {
                            return Ok(SecretLookup::Unavailable);
                        }
                    }
                    let found = bounded(self.store.secret(outil, abonnement)).await?;
                    let mut state = self.state();
                    match found {
                        None => {
                            state.unknown.set(&key, (), now_ms);
                            state.misses.add(source, now_ms);
                            return Ok(SecretLookup::Refused);
                        }
                        Some(row) => {
                            state.secrets.set(&key, row.clone(), now_ms);
                            row
                        }
                    }
                }
            };
            if *from == WebhookSecret::Abonnement {
                let Some(stored) = &row.secret else {
                    log_error(
                        "porte.secret_absent",
                        "Subscription secret missing",
                        &[("outil", outil), ("abonnement", abonnement)],
                    );
                    return Ok(SecretLookup::Refused);
                };
                let Some(key32) = &self.settings.porte_key else {
                    log_error(
                        "porte.cle_absente",
                        "LEON_PORTE_KEY missing",
                        &[("outil", outil)],
                    );
                    return Ok(SecretLookup::Unavailable);
                };
                let aad = subscription_aad(&row.tenant_id, abonnement);
                return Ok(match open_subscription_secret(stored, &aad, key32) {
                    Ok(plain) => SecretLookup::Found(plain),
                    Err(error) => {
                        log_error(
                            "porte.secret_illisible",
                            &error.to_string(),
                            &[("outil", outil), ("abonnement", abonnement)],
                        );
                        SecretLookup::Refused
                    }
                });
            }
        }
        // Une spec d'application signe toujours avec un secret d'application.
        let WebhookSecret::Env { name } = from else {
            return Ok(SecretLookup::Refused);
        };
        Ok(match self.settings.app_secrets.get(name) {
            Some(value) => SecretLookup::Found(value.clone()),
            None => {
                log_error(
                    "porte.secret_appli_absent",
                    "App secret missing",
                    &[("outil", outil)],
                );
                SecretLookup::Unavailable
            }
        })
    }

    // Le compte d'un webhook d'application : une seule valeur. Sinon, l'événement du journal qui dit pourquoi.
    fn account_of(&self, spec: &ToolSpec, corps: &str) -> Result<String, &'static str> {
        let values = spec.account_pointer.as_deref().and_then(|pointer| {
            parse_body_json(spec.body_format, corps)
                .and_then(|document| read_pointer(&document, pointer))
        });
        if let Some(values) = &values
            && values.iter().collect::<BTreeSet<_>>().len() > 1
        {
            return Err("porte.comptes_multiples");
        }
        match values.and_then(|mut values| (!values.is_empty()).then(|| values.swap_remove(0))) {
            Some(compte)
                if !compte.is_empty()
                    && js_length(&compte) <= self.providers.limits.account_max_chars =>
            {
                Ok(compte)
            }
            _ => Err("porte.compte_illisible"),
        }
    }

    // L'en-tête deliveryHeader s'il fait 1 à 200 caractères ASCII visibles, sinon le SHA-256 hexadécimal du corps.
    fn delivery_id(
        &self,
        spec: &ToolSpec,
        headers: &BTreeMap<String, String>,
        bytes: &[u8],
    ) -> String {
        let max = self.providers.limits.delivery_id_max_chars;
        let given = spec
            .delivery_header
            .as_ref()
            .and_then(|name| headers.get(name));
        match given {
            Some(value)
                if (1..=max).contains(&value.len())
                    && value.bytes().all(|b| (0x21..=0x7e).contains(&b)) =>
            {
                value.clone()
            }
            _ => hex::encode(Sha256::digest(bytes)),
        }
    }

    // Les seuls en-têtes gardés : ceux de keptHeaders et deliveryHeader, jamais celui d'une signature ou d'un jeton,
    // 1 024 caractères par valeur ; plus de 8 Kio en tout : aucun.
    fn kept_headers(
        &self,
        spec: &ToolSpec,
        headers: &BTreeMap<String, String>,
    ) -> BTreeMap<String, String> {
        let limits = &self.providers.limits;
        let banned: BTreeSet<&str> = secret_headers(&spec.verification).into_iter().collect();
        let mut wanted: BTreeSet<&str> = self
            .providers
            .kept_headers
            .iter()
            .map(String::as_str)
            .collect();
        if let Some(name) = &spec.delivery_header {
            wanted.insert(name);
        }
        let kept: BTreeMap<String, String> = headers
            .iter()
            .filter(|(name, value)| {
                wanted.contains(name.as_str())
                    && !banned.contains(name.as_str())
                    && js_length(value) <= limits.header_value_max_chars
            })
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect();
        let size = serde_json::to_string(&kept).map_or(usize::MAX, |json| json.len());
        if size <= limits.headers_max_bytes {
            kept
        } else {
            BTreeMap::new()
        }
    }

    // Une requête, bornée dans le temps, puis une ligne de mesure (chapitre 15, section 4) : la même que
    // hono-gate.ts, sans contenu ni identifiant d'abonnement. Elle donne la part de 5xx et le p95 des livraisons.
    async fn handle(&self, target: Target, query: Option<String>, request: Request) -> Response {
        let started = Instant::now();
        let outil = tool_label(&target.outil).to_string();
        let response =
            match tokio::time::timeout(REQUEST_TIMEOUT, self.receive(target, query, request)).await
            {
                Ok(response) => response,
                Err(_) => {
                    log_error("porte.delai", "Request timeout", &[("outil", &outil)]);
                    unavailable()
                }
            };
        let ms = started.elapsed().as_millis() as u64;
        tracing::info!(
            event = "porte.reponse",
            outil,
            statut = response.status().as_u16(),
            ms,
            "[leon]"
        );
        response
    }

    // Le déroulé d'une requête : les étapes de la section 6.1 du chapitre 03, dans le même ordre.
    async fn receive(&self, target: Target, query: Option<String>, request: Request) -> Response {
        let started = Instant::now();
        let now_ms = (self.clock)();
        let limits = &self.providers.limits;
        let (parts, body) = request.into_parts();

        // 1. Le corps, avant tout, comme le bodyLimit de hono-gate.ts : un content-length trop grand est refusé sans rien
        // lire ; sinon le corps est lu et compté (un corps envoyé par morceaux, sans content-length, aussi).
        let declared = parts
            .headers
            .get(header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        if declared.is_some_and(|length| length > limits.body_max_bytes as u64) {
            return self.too_large(&target.outil);
        }
        let bytes = match read_body(body, limits.body_max_bytes).await {
            Ok(bytes) => bytes,
            Err(BodyError::TooLarge) => return self.too_large(&target.outil),
            // Le client a coupé, ou le corps est tronqué : personne n'attend la réponse. Au journal seulement.
            Err(BodyError::Interrupted) => {
                tracing::info!(
                    event = "porte.corps_interrompu",
                    outil = tool_label(&target.outil),
                    "[leon]"
                );
                return invalid_request();
            }
        };

        // 2. L'adresse : outil connu, forme conforme à sa portée, abonnement en UUID minuscule, /cycle si permis.
        let Some((outil, spec)) = self.spec_for(&target) else {
            return self.refuse(started).await;
        };

        // 3. Microsoft Graph vérifie l'adresse pendant la création de l'abonnement : écho, sans lire la base.
        if spec.handshake == Some(Handshake::EchoValidationToken)
            && let Some(token) = query_param(query.as_deref(), "validationToken")
        {
            return echo(&token, limits);
        }

        // 4. De l'UTF-8 valide, sans octet nul : Postgres refuse l'octet nul dans un text.
        let Some(corps) = std::str::from_utf8(&bytes)
            .ok()
            .filter(|text| !text.contains('\0'))
        else {
            return invalid_request();
        };

        // 5. Sans LEON_PORTE_URL, une signature qui couvre l'adresse ne peut pas être vérifiée.
        let base = self.settings.base.as_deref();
        if base.is_none() && spec.verification.signs_uri() {
            return unavailable();
        }

        let headers = header_map(&parts.headers);
        let ip = self.client_ip(&headers);

        // 6. Le secret.
        let secret = match self
            .secret_for(
                outil,
                spec,
                target.abonnement.as_deref(),
                ip.as_deref(),
                now_ms,
            )
            .await
        {
            Ok(SecretLookup::Found(secret)) => secret,
            Ok(SecretLookup::Refused) => return self.refuse(started).await,
            Ok(SecretLookup::Unavailable) => return unavailable(),
            Err(error) => {
                // Une panne de base n'est pas un refus : l'éditeur réessaiera.
                log_error("porte.base", &error.0, &[("outil", outil)]);
                return unavailable();
            }
        };

        // 7. La signature, sur le corps brut.
        let uri = public_uri(base, &target, query.as_deref());
        let verdict = verify_webhook(&VerifyInput {
            verification: &spec.verification,
            body_format: spec.body_format,
            secret: &secret,
            method: parts.method.as_str(),
            uri: &uri,
            headers: &headers,
            body: &bytes,
            now_ms,
        });
        if let Err(reason) = verdict {
            // Au journal seulement (pas dans Sentry : un refus est attendu), jamais dans la réponse.
            tracing::info!(
                event = "porte.refus",
                outil,
                raison = reason.as_str(),
                "[leon]"
            );
            return self.refuse(started).await;
        }

        // 8. Slack : un url_verification signé reçoit son challenge en écho.
        if spec.handshake == Some(Handshake::SlackChallenge)
            && let Some(document) = parse_body_json(spec.body_format, corps)
            && document.get("type").and_then(|value| value.as_str()) == Some("url_verification")
            && let Some(challenge) = document.get("challenge").and_then(|value| value.as_str())
        {
            return echo(challenge, limits);
        }

        // 9. Un webhook d'application : le compte, une seule valeur.
        let mut compte = None;
        if spec.scope == Scope::App {
            match self.account_of(spec, corps) {
                Ok(account) => compte = Some(account),
                Err(event) => {
                    // Signée par l'éditeur, mais impossible à ranger : rien n'est déposé, l'éditeur ne réessaie pas.
                    log_error(event, "Account not found", &[("outil", outil)]);
                    return accepted();
                }
            }
        }

        // 10 à 12. Identifiant de livraison, en-têtes gardés, dépôt.
        let deposit = Deposit {
            outil: outil.to_string(),
            abonnement: target.abonnement.clone(),
            compte,
            genre: if target.cycle { "cycle" } else { "livraison" },
            livraison: self.delivery_id(spec, &headers, &bytes),
            corps: corps.to_string(),
            entetes: self.kept_headers(spec, &headers),
        };
        match bounded(self.store.deposit(&deposit)).await {
            // 0 : déjà reçue, ou personne n'écoute ce compte. Même réponse : l'éditeur ne doit pas réessayer.
            Ok(_) => accepted(),
            Err(error) => {
                log_error("porte.base", &error.0, &[("outil", outil)]);
                unavailable()
            }
        }
    }
}

async fn app_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path(outil): Path<String>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: None,
                cycle: false,
            },
            query,
            request,
        )
        .await
}

async fn subscription_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path((outil, abonnement)): Path<(String, String)>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: Some(abonnement),
                cycle: false,
            },
            query,
            request,
        )
        .await
}

async fn lifecycle_route<S: PorteStore>(
    State(porte): State<Arc<Porte<S>>>,
    Path((outil, abonnement)): Path<(String, String)>,
    RawQuery(query): RawQuery,
    request: Request,
) -> Response {
    porte
        .handle(
            Target {
                outil,
                abonnement: Some(abonnement),
                cycle: true,
            },
            query,
            request,
        )
        .await
}

// Le bilan de santé de Railway (healthcheckPath), qui ne sert qu'au déploiement (chapitre 13, 4.1, à vérifier). 503
// tant que la base n'a jamais répondu : un déploiement dont la base est injoignable ou mal réglée (mot de passe, hôte,
// certificat, migration) échoue, et Railway garde l'ancienne version. 200 ensuite, pour toujours : la route ne lit pas
// la base, et une panne de base en régime ne fait pas redémarrer la porte en boucle.
async fn health<S: PorteStore>(State(porte): State<Arc<Porte<S>>>) -> Response {
    if porte.is_ready() {
        json_response(StatusCode::OK, r#"{"ok":true}"#)
    } else {
        json_response(StatusCode::SERVICE_UNAVAILABLE, r#"{"ok":false}"#)
    }
}

pub(crate) fn router<S: PorteStore>(porte: Arc<Porte<S>>) -> Router {
    Router::new()
        .route(PATH_APP, post(app_route::<S>))
        .route(PATH_SUBSCRIPTION, post(subscription_route::<S>))
        .route(PATH_LIFECYCLE, post(lifecycle_route::<S>))
        .route("/sante", get(health::<S>))
        .with_state(porte)
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.is_empty())
}

// SIGTERM (Railway, à la fin du recouvrement) ou Ctrl-C : on n'accepte plus de connexion, on finit les requêtes en
// cours. Une requête dure au plus REQUEST_TIMEOUT (3 s) : drainingSeconds de 5 suffit.
async fn shutdown_signal() {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
    tracing::info!(event = "porte.arret", "[leon]");
}

async fn run() -> Result<(), String> {
    let providers = load_providers(PROVIDERS_JSON)?;
    let settings = porte_settings(&providers, env_var)?;
    let database_url = env_var("DATABASE_URL_PORTE").ok_or(
        "DATABASE_URL_PORTE manque : l'adresse du rôle leon_porte (chapitre 13, section 10)",
    )?;
    let store =
        depot::connect(&database_url).map_err(|_| "DATABASE_URL_PORTE illisible".to_string())?;
    let port: u16 = match env_var("PORT") {
        Some(port) => port
            .parse()
            .map_err(|_| "PORT : un numéro de port".to_string())?,
        None => 8080,
    };
    let tools = providers
        .tools
        .keys()
        .cloned()
        .collect::<Vec<_>>()
        .join(",");
    let porte = Arc::new(Porte::new(
        providers,
        settings,
        store,
        Box::new(wall_clock_ms),
    ));
    // /sante répond 503 jusqu'à la première lecture réussie de la base ; les livraisons sont servies dès l'écoute.
    tokio::spawn({
        let porte = porte.clone();
        async move { porte.wait_for_base().await }
    });
    // Le réseau de Railway demande d'écouter sur « :: » (note 02, section 5) ; sans IPv6, on se rabat sur IPv4.
    let listener = match tokio::net::TcpListener::bind(SocketAddr::from((
        Ipv6Addr::UNSPECIFIED,
        port,
    )))
    .await
    {
        Ok(listener) => listener,
        Err(_) => tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, port)))
            .await
            .map_err(|_| format!("impossible d'écouter sur le port {port}"))?,
    };
    tracing::info!(event = "porte.demarree", port, outils = %tools, "[leon]");
    axum::serve(listener, router(porte))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|_| "le serveur s'est arrêté sur une erreur".to_string())
}

fn main() -> ExitCode {
    // Le journal : des lignes JSON, celles de la porte seulement. Les bibliothèques n'y écrivent rien : sqlx y mettrait
    // des messages de Postgres (un avis, une erreur de connexion testée), que la règle de logError ne garde jamais.
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_target(false)
                .with_filter(Targets::new().with_target("porte", LevelFilter::INFO)),
        )
        .init();
    // Sentry avant le moteur asynchrone, comme le demande sa documentation. Sans SENTRY_DSN, rien ne part.
    let mut options = sentry::ClientOptions::default();
    options.dsn = env_var("SENTRY_DSN").and_then(|dsn| dsn.parse().ok());
    options.release = env_var("RAILWAY_GIT_COMMIT_SHA").map(Into::into);
    options.environment = env_var("RAILWAY_ENVIRONMENT_NAME").map(Into::into);
    options.send_default_pii = false;
    // Comme sentry.server.config.ts : rien de ce qui pourrait citer une donnée reçue ne part, aucun fil d'Ariane.
    options.max_breadcrumbs = 0;
    options.before_send = Some(Arc::new(|event| Some(scrub_event(event))));
    let _sentry = sentry::init(options);
    sentry::configure_scope(|scope| scope.set_tag("role", "porte"));
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(_) => {
            eprintln!("[leon] porte : impossible de démarrer le moteur asynchrone");
            return ExitCode::FAILURE;
        }
    };
    match runtime.block_on(run()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            tracing::error!(event = "porte.demarrage", error = %message, "[leon]");
            ExitCode::FAILURE
        }
    }
}
