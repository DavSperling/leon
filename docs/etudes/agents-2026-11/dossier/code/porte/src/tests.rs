// Les cas de services/porte/vecteurs.json, rejoués par le service Rust : les mêmes que verify.test.ts et
// hono-gate.test.ts (chapitre 03, section 13). Un verdict qui change ici change aussi en TypeScript, ou l'une des deux
// mises en œuvre a tort. Puis ce que les vecteurs ne mesurent pas : le délai du refus, la limite par adresse IP, les
// caches, la taille et la lecture du corps, une base en panne ou lente, le bilan de santé, ce qui part vers Sentry.
//
// Le fichier est généré par `pnpm porte:generer` (src/server/webhooks/providers-json.ts) ; Exemple fictif : ses
// secrets, clés, identifiants et corps sont inventés.

use std::collections::BTreeMap;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering};
use std::task::{Context, Poll};
use std::time::Duration;

use axum::body::{Body, Bytes, HttpBody, to_bytes};
use axum::http::{Request as HttpRequest, StatusCode};
use axum::response::Response;
use base64::Engine as _;
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;
use tower::ServiceExt;

use crate::depot::{Deposit, PorteStore, StoreError, SubscriptionRow};
use crate::secret::{open_subscription_secret, parse_porte_key};
use crate::verifier::{BodyFormat, VerifyInput, WebhookVerification, verify_webhook};
use crate::{
    Clock, PROVIDERS_JSON, Porte, Providers, SentryThrottle, ip_key, load_providers,
    porte_settings, router, scrub_event,
};

const VECTORS_JSON: &str = include_str!("../vecteurs.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Vectors {
    version: u64,
    #[serde(rename = "generatedBy")]
    _generated_by: String,
    verification: Vec<VerificationCase>,
    decryption: Vec<DecryptionCase>,
    gate: Gate,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VerificationCase {
    name: String,
    verification: WebhookVerification,
    body_format: BodyFormat,
    secret: String,
    method: String,
    uri: String,
    headers: BTreeMap<String, String>,
    body: String,
    now: i64,
    expected: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecryptionCase {
    name: String,
    key: String,
    aad: String,
    stored: String,
    plain: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Gate {
    env: BTreeMap<String, String>,
    store: GateStore,
    cases: Vec<GateCase>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateStore {
    subscriptions: Vec<StoredSubscription>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredSubscription {
    outil: String,
    id: String,
    tenant_id: String,
    stored: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateCase {
    name: String,
    env: Option<BTreeMap<String, String>>,
    request: GateRequest,
    now: i64,
    expected: GateExpected,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GateRequest {
    method: String,
    path: String,
    query: String,
    headers: BTreeMap<String, String>,
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GateExpected {
    status: u16,
    content_type: Option<String>,
    body: String,
    deposits: Vec<Value>,
}

fn vectors() -> Vectors {
    serde_json::from_str(VECTORS_JSON).expect("vecteurs.json illisible")
}

fn providers() -> Providers {
    load_providers(PROVIDERS_JSON).expect("fournisseurs.json illisible")
}

// La fausse base des vecteurs : porte_secret lit store.subscriptions, porte_deposer note ses arguments et rend 1.
// `broken` : chaque appel échoue tout de suite. `delay` : chaque appel attend d'abord (une base lente).
#[derive(Default)]
struct FakeStore {
    subscriptions: StdMutex<Vec<StoredSubscription>>,
    deposits: StdMutex<Vec<Deposit>>,
    lookups: AtomicUsize,
    broken: AtomicBool,
    delay: Duration,
}

impl FakeStore {
    fn with(subscriptions: &[StoredSubscription]) -> Self {
        Self {
            subscriptions: StdMutex::new(subscriptions.to_vec()),
            ..Default::default()
        }
    }

    async fn call(&self) -> Result<(), StoreError> {
        if !self.delay.is_zero() {
            tokio::time::sleep(self.delay).await;
        }
        if self.broken.load(Ordering::SeqCst) {
            return Err(StoreError("PoolTimedOut".into()));
        }
        Ok(())
    }
}

impl PorteStore for Arc<FakeStore> {
    async fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> Result<Option<SubscriptionRow>, StoreError> {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        self.call().await?;
        Ok(self
            .subscriptions
            .lock()
            .unwrap()
            .iter()
            .find(|row| row.outil == outil && row.id == abonnement)
            .map(|row| SubscriptionRow {
                tenant_id: row.tenant_id.clone(),
                secret: row.stored.clone(),
            }))
    }

    async fn deposit(&self, deposit: &Deposit) -> Result<i32, StoreError> {
        self.call().await?;
        self.deposits.lock().unwrap().push(deposit.clone());
        Ok(1)
    }
}

fn porte_with_clock(
    env: &BTreeMap<String, String>,
    store: Arc<FakeStore>,
    clock: Clock,
) -> Arc<Porte<Arc<FakeStore>>> {
    let providers = providers();
    let settings = porte_settings(&providers, |name| env.get(name).cloned()).expect("réglages");
    Arc::new(Porte::new(providers, settings, store, clock))
}

fn porte_with(
    env: &BTreeMap<String, String>,
    store: Arc<FakeStore>,
    now: i64,
) -> Arc<Porte<Arc<FakeStore>>> {
    porte_with_clock(env, store, Box::new(move || now))
}

async fn send(porte: &Arc<Porte<Arc<FakeStore>>>, request: HttpRequest<Body>) -> Response {
    router(porte.clone()).oneshot(request).await.unwrap()
}

async fn body_text(response: Response) -> String {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    String::from_utf8_lossy(&body).into_owned()
}

fn request(
    method: &str,
    path: &str,
    query: &str,
    headers: &BTreeMap<String, String>,
    body: Vec<u8>,
) -> HttpRequest<Body> {
    let uri = if query.is_empty() {
        path.to_string()
    } else {
        format!("{path}?{query}")
    };
    let mut builder = HttpRequest::builder().method(method).uri(uri);
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder.body(Body::from(body)).unwrap()
}

#[test]
fn fournisseurs_est_dans_la_version_connue() {
    let providers = providers();
    assert_eq!(providers.version, 1);
    assert!(providers.tools.contains_key("outlook"));
    assert!(load_providers(&PROVIDERS_JSON.replace("\"version\": 1", "\"version\": 2")).is_err());
    // Un champ inconnu (un mode, une étape de plus) arrête le démarrage : il faut changer le Rust d'abord.
    assert!(
        load_providers(
            &PROVIDERS_JSON.replace("\"lifecycle\": true", "\"lifecycle\": true, \"neuf\": 1")
        )
        .is_err()
    );
    // De même un champ de plus dans la vérification de chaque outil, donc dans chaque mode que le fichier emploie
    // (jeton, hmac-sha256, standard-webhooks).
    let file: Value = serde_json::from_str(PROVIDERS_JSON).unwrap();
    for tool in file["tools"].as_object().unwrap().keys() {
        let mut changed = file.clone();
        changed["tools"][tool]["verification"]["inconnu"] = 1.into();
        assert!(load_providers(&changed.to_string()).is_err(), "{tool}");
    }
}

#[test]
fn vecteurs_de_verification() {
    let vectors = vectors();
    assert_eq!(vectors.version, 1);
    assert!(!vectors.verification.is_empty());
    for case in &vectors.verification {
        let verdict = verify_webhook(&VerifyInput {
            verification: &case.verification,
            body_format: case.body_format,
            secret: &case.secret,
            method: &case.method,
            uri: &case.uri,
            headers: &case.headers,
            body: case.body.as_bytes(),
            now_ms: case.now,
        });
        let got = match verdict {
            Ok(()) => "ok",
            Err(reason) => reason.as_str(),
        };
        assert_eq!(got, case.expected, "{}", case.name);
    }
}

// Les trois parties de `v1:` réécrites dans l'autre alphabet, avec remplissage : Buffer.from(…, 'base64url') de Node
// les lit pareil.
fn in_standard_alphabet(stored: &str) -> String {
    let parts: Vec<String> = stored
        .split(':')
        .enumerate()
        .map(|(index, part)| {
            if index == 0 {
                return part.to_string();
            }
            let mut part = part.replace('-', "+").replace('_', "/");
            while part.len() % 4 != 0 {
                part.push('=');
            }
            part
        })
        .collect();
    parts.join(":")
}

#[test]
fn vecteurs_de_dechiffrement() {
    for case in vectors().decryption {
        let key = parse_porte_key(&case.key).expect("clé de 32 octets");
        let got = open_subscription_secret(&case.stored, &case.aad, &key).ok();
        assert_eq!(got, case.plain, "{}", case.name);
        // La même clé écrite en base64url sans remplissage, le même secret écrit en base64 standard : même résultat.
        let url_key = case.key.replace('+', "-").replace('/', "_");
        let url_key = parse_porte_key(url_key.trim_end_matches('='));
        assert_eq!(url_key, Some(key), "{}", case.name);
        let standard = in_standard_alphabet(&case.stored);
        assert_ne!(standard, case.stored);
        let got = open_subscription_secret(&standard, &case.aad, &key).ok();
        assert_eq!(got, case.plain, "{} (alphabet standard)", case.name);
    }
}

#[tokio::test(start_paused = true)]
async fn vecteurs_de_la_porte() {
    let vectors = vectors();
    assert!(!vectors.gate.cases.is_empty());
    for case in &vectors.gate.cases {
        let mut env = vectors.gate.env.clone();
        env.extend(case.env.clone().unwrap_or_default());
        let store = Arc::new(FakeStore::with(&vectors.gate.store.subscriptions));
        let porte = porte_with(&env, store.clone(), case.now);
        let r = &case.request;
        let response = router(porte)
            .oneshot(request(
                &r.method,
                &r.path,
                &r.query,
                &r.headers,
                r.body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(
            response.status().as_u16(),
            case.expected.status,
            "{}",
            case.name
        );
        if let Some(content_type) = &case.expected.content_type {
            assert_eq!(
                response.headers()["content-type"],
                content_type.as_str(),
                "{}",
                case.name
            );
        }
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(
            String::from_utf8_lossy(&body),
            case.expected.body,
            "{}",
            case.name
        );
        let deposits: Vec<Value> = store
            .deposits
            .lock()
            .unwrap()
            .iter()
            .map(|deposit| serde_json::to_value(deposit).unwrap())
            .collect();
        assert_eq!(deposits, case.expected.deposits, "{}", case.name);
    }
}

fn outlook_delivery() -> (BTreeMap<String, String>, Arc<FakeStore>, String, String) {
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name == "outlook : livraison juste")
        .unwrap();
    let store = Arc::new(FakeStore::with(&vectors.gate.store.subscriptions));
    (
        vectors.gate.env.clone(),
        store,
        case.request.path.clone(),
        case.request.body.clone(),
    )
}

#[tokio::test(start_paused = true)]
async fn le_refus_attend_au_moins_200_ms() {
    let (env, store, _, body) = outlook_delivery();
    let porte = porte_with(&env, store, 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let unknown = "/h/outlook/00000000-0000-4000-8000-000000000000";
    let response = router(porte)
        .oneshot(request(
            "POST",
            unknown,
            "",
            &BTreeMap::new(),
            body.into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(started.elapsed() >= std::time::Duration::from_millis(200));
}

#[tokio::test(start_paused = true)]
async fn le_cache_negatif_evite_une_seconde_lecture() {
    let (env, store, _, body) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let unknown = "/h/outlook/00000000-0000-4000-8000-000000000000";
    for _ in 0..3 {
        let response = router(porte.clone())
            .oneshot(request(
                "POST",
                unknown,
                "",
                &BTreeMap::new(),
                body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    assert_eq!(store.lookups.load(Ordering::SeqCst), 1);
}

#[tokio::test(start_paused = true)]
async fn au_dela_de_la_limite_une_adresse_hors_cache_recoit_503() {
    let (mut env, store, path, body) = outlook_delivery();
    env.insert("LEON_IP_HEADER".into(), "x-real-ip".into());
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let cap = providers().limits.lookup_misses_per_ip;
    // Deux adresses du même /64 comptent ensemble.
    for index in 0..cap {
        let headers = BTreeMap::from([(
            "x-real-ip".to_string(),
            format!("2001:db8:1:2::{:x}", index % 2 + 1),
        )]);
        let unknown = format!("/h/outlook/00000000-0000-4000-8000-{index:012x}");
        let response = router(porte.clone())
            .oneshot(request(
                "POST",
                &unknown,
                "",
                &headers,
                body.clone().into_bytes(),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
    let headers = BTreeMap::from([("x-real-ip".to_string(), "2001:db8:1:2::9".to_string())]);
    // Même un abonnement vivant, hors cache, reçoit 503 : l'éditeur rejouera, la base n'est plus lue.
    let response = router(porte.clone())
        .oneshot(request(
            "POST",
            &path,
            "",
            &headers,
            body.clone().into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(store.lookups.load(Ordering::SeqCst), cap as usize);
    // Une autre adresse IP lit toujours la base.
    let other = BTreeMap::from([("x-real-ip".to_string(), "203.0.113.7".to_string())]);
    let response = router(porte)
        .oneshot(request("POST", &path, "", &other, body.into_bytes()))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
}

#[tokio::test(start_paused = true)]
async fn un_corps_trop_gros_recoit_413() {
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let size = providers().limits.body_max_bytes + 1;
    let response = router(porte)
        .oneshot(request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            vec![b'a'; size],
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn un_corps_trop_gros_recoit_413_avant_l_adresse() {
    // Comme le bodyLimit de hono-gate.ts, qui lit un corps sans content-length avant toute autre étape : même vers un
    // outil inconnu, même pour un écho de validation.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let size = providers().limits.body_max_bytes + 1;
    for (path, query) in [("/h/inconnu", ""), (path.as_str(), "validationToken=x")] {
        let big = request("POST", path, query, &BTreeMap::new(), vec![b'a'; size]);
        assert!(!big.headers().contains_key("content-length"));
        let response = send(&porte, big).await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE, "{path}");
        assert_eq!(
            body_text(response).await,
            r#"{"error":"Request too large"}"#
        );
    }
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

// Un corps qui échoue au milieu de sa lecture : un client qui coupe la connexion.
struct CutBody;

impl HttpBody for CutBody {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        _: &mut Context<'_>,
    ) -> Poll<Option<Result<http_body::Frame<Bytes>, std::io::Error>>> {
        Poll::Ready(Some(Err(std::io::Error::other("connexion coupée"))))
    }
}

#[tokio::test(start_paused = true)]
async fn un_corps_interrompu_recoit_400_et_non_413() {
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let cut = HttpRequest::post(path).body(Body::new(CutBody)).unwrap();
    let response = send(&porte, cut).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn de_l_utf8_invalide_recoit_400() {
    // L'octet nul est dans les vecteurs (cas « octet nul dans le corps ») ; un octet invalide ne peut pas y être.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let invalid = request(
        "POST",
        &path,
        "",
        &BTreeMap::new(),
        vec![b'{', 0xff, 0xfe, b'}'],
    );
    let response = send(&porte, invalid).await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(body_text(response).await, r#"{"error":"Invalid request"}"#);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn l_echo_fait_1_024_caracteres_au_plus() {
    // Le caractère de contrôle est dans les vecteurs ; la longueur, comptée en unités UTF-16 comme en JavaScript.
    let (env, store, path, _) = outlook_delivery();
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let max = providers().limits.echo_max_chars;
    let fits = format!("validationToken={}", "é".repeat(max));
    let response = send(
        &porte,
        request("POST", &path, &fits, &BTreeMap::new(), vec![]),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_text(response).await.chars().count(), max);
    let too_long = format!("validationToken={}", "a".repeat(max + 1));
    let response = send(
        &porte,
        request("POST", &path, &too_long, &BTreeMap::new(), vec![]),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
}

#[tokio::test(start_paused = true)]
async fn le_cache_positif_expire_apres_60_s() {
    // Un abonnement résilié (ou une personne partie) cesse d'être servi au plus 60 s après : porte_secret est relu.
    let (env, store, path, body) = outlook_delivery();
    let now = Arc::new(AtomicI64::new(1_795_165_200_000));
    let clock = now.clone();
    let porte = porte_with_clock(
        &env,
        store.clone(),
        Box::new(move || clock.load(Ordering::SeqCst)),
    );
    let deliver = || {
        request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            body.clone().into_bytes(),
        )
    };
    assert_eq!(send(&porte, deliver()).await.status(), StatusCode::ACCEPTED);
    store.subscriptions.lock().unwrap().clear();
    now.fetch_add(59_000, Ordering::SeqCst);
    assert_eq!(send(&porte, deliver()).await.status(), StatusCode::ACCEPTED);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 1);
    now.fetch_add(2_000, Ordering::SeqCst);
    assert_eq!(
        send(&porte, deliver()).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(store.lookups.load(Ordering::SeqCst), 2);
}

#[tokio::test(start_paused = true)]
async fn un_secret_illisible_est_un_refus_et_non_une_panne() {
    let (env, _, path, body) = outlook_delivery();
    let mut subscriptions = vectors().gate.store.subscriptions;
    for row in &mut subscriptions {
        row.stored = Some("v1:AQEBAQEBAQEBAQEB:AAAA:AAAA".into());
    }
    let store = Arc::new(FakeStore::with(&subscriptions));
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn un_compte_illisible_est_accepte_sans_depot() {
    // Signé par HubSpot, mais sans portalId : rien à ranger. 202, comme la route Hono (chapitre 03, 6.1, étape 9) ;
    // le cas « plusieurs comptes » est dans les vecteurs.
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name.starts_with("hubspot : livraison juste"))
        .unwrap();
    let secret = &vectors.gate.env["LEON_OAUTH_HUBSPOT_SECRET"];
    let body = r#"[{"eventId":1001,"objectId":3001}]"#;
    let stamp = &case.request.headers["x-hubspot-request-timestamp"];
    let mut mac = <Hmac<Sha256> as KeyInit>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(
        format!(
            "POST{}/h/hubspot{body}{stamp}",
            vectors.gate.env["LEON_PORTE_URL"]
        )
        .as_bytes(),
    );
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let mut headers = case.request.headers.clone();
    headers.insert("x-hubspot-signature-v3".into(), signature);
    let store = Arc::new(FakeStore::default());
    let porte = porte_with(&vectors.gate.env, store.clone(), case.now);
    let response = send(
        &porte,
        request("POST", "/h/hubspot", "", &headers, body.into()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn une_base_lente_recoit_503_en_2_s() {
    // Une base qui ne répond plus : 503 au bout de DB_CALL_TIMEOUT, pas au bout du délai de l'éditeur.
    let (env, _, path, body) = outlook_delivery();
    let mut store = FakeStore::with(&vectors().gate.store.subscriptions);
    store.delay = Duration::from_secs(60);
    let porte = porte_with(&env, Arc::new(store), 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(started.elapsed(), Duration::from_secs(2));
}

#[tokio::test(start_paused = true)]
async fn une_requete_ne_dure_jamais_plus_de_3_s() {
    // Deux appels de 1,6 s chacun, sous la limite d'un appel : c'est le délai de la requête qui coupe (porte.delai).
    let (env, _, path, body) = outlook_delivery();
    let mut store = FakeStore::with(&vectors().gate.store.subscriptions);
    store.delay = Duration::from_millis(1_600);
    let store = Arc::new(store);
    let porte = porte_with(&env, store.clone(), 1_795_165_200_000);
    let started = tokio::time::Instant::now();
    let response = send(
        &porte,
        request("POST", &path, "", &BTreeMap::new(), body.into_bytes()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body_text(response).await, r#"{"error":"Unavailable"}"#);
    assert_eq!(started.elapsed(), Duration::from_secs(3));
    assert!(store.deposits.lock().unwrap().is_empty());
}

#[tokio::test(start_paused = true)]
async fn une_panne_de_base_n_est_pas_un_refus() {
    let (env, _, path, body) = outlook_delivery();
    let store = Arc::new(FakeStore {
        broken: AtomicBool::new(true),
        ..Default::default()
    });
    let porte = porte_with(&env, store, 1_795_165_200_000);
    let response = router(porte)
        .oneshot(request(
            "POST",
            &path,
            "",
            &BTreeMap::new(),
            body.into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test(start_paused = true)]
async fn sans_leon_porte_url_une_signature_sur_l_adresse_recoit_503() {
    let vectors = vectors();
    let case = vectors
        .gate
        .cases
        .iter()
        .find(|case| case.name.starts_with("hubspot : livraison juste"))
        .unwrap();
    let mut env = vectors.gate.env.clone();
    env.remove("LEON_PORTE_URL");
    let porte = porte_with(&env, Arc::new(FakeStore::default()), case.now);
    let r = &case.request;
    let response = router(porte)
        .oneshot(request(
            "POST",
            &r.path,
            "",
            &r.headers,
            r.body.clone().into_bytes(),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test(start_paused = true)]
async fn le_bilan_de_sante_attend_la_premiere_lecture_de_la_base() {
    let store = Arc::new(FakeStore {
        broken: AtomicBool::new(true),
        ..Default::default()
    });
    let porte = porte_with(&BTreeMap::new(), store.clone(), 0);
    let sante = || HttpRequest::get("/sante").body(Body::empty()).unwrap();
    // Avant toute lecture réussie : 503. /sante elle-même ne lit jamais la base.
    let response = send(&porte, sante()).await;
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body_text(response).await, r#"{"ok":false}"#);
    assert_eq!(store.lookups.load(Ordering::SeqCst), 0);
    // Base injoignable (mauvais mot de passe, certificat absent…) : une lecture par seconde, /sante reste à 503, et
    // Railway garde l'ancienne version.
    let waiting = tokio::spawn({
        let porte = porte.clone();
        async move { porte.wait_for_base().await }
    });
    tokio::time::sleep(Duration::from_millis(3_500)).await;
    assert!(!porte.is_ready());
    assert_eq!(store.lookups.load(Ordering::SeqCst), 4);
    assert_eq!(
        send(&porte, sante()).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    // La base répond : /sante passe à 200.
    store.broken.store(false, Ordering::SeqCst);
    waiting.await.unwrap();
    let response = send(&porte, sante()).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body_text(response).await, r#"{"ok":true}"#);
    // Puis une panne en régime : /sante reste à 200, sans lire la base. Les livraisons reçoivent 503.
    store.broken.store(true, Ordering::SeqCst);
    let lookups = store.lookups.load(Ordering::SeqCst);
    assert_eq!(send(&porte, sante()).await.status(), StatusCode::OK);
    assert_eq!(store.lookups.load(Ordering::SeqCst), lookups);
}

#[test]
fn sentry_recoit_un_envoi_par_minute_et_par_evenement() {
    let mut throttle = SentryThrottle::new();
    let start = std::time::Instant::now();
    let at = |seconds: u64| start + Duration::from_secs(seconds);
    assert_eq!(throttle.admit("porte.base", at(0)), Some(0));
    for second in 1..60 {
        assert_eq!(throttle.admit("porte.base", at(second)), None);
    }
    // Un autre événement a sa propre fenêtre : une panne de base ne tait pas une clé illisible.
    assert_eq!(throttle.admit("porte.secret_illisible", at(30)), Some(0));
    // La minute passée : un envoi, qui compte les 59 tus.
    assert_eq!(throttle.admit("porte.base", at(60)), Some(59));
    assert_eq!(throttle.admit("porte.base", at(61)), None);
}

#[test]
fn sentry_ne_recoit_aucun_texte_recu() {
    use sentry::protocol::{Event, Exception};
    let body = r#"{"value":[{"clientState":"exemple-fictif"}]}"#;
    // Une panique dont le message citerait le corps : masquée, comme tout ce qui ne vient pas de log_error.
    let mut panic = Event {
        message: Some(format!("byte index 3 is out of bounds of `{body}`")),
        request: Some(Default::default()),
        ..Default::default()
    };
    panic.exception.values.push(Exception {
        ty: "panic".into(),
        value: Some(body.into()),
        ..Default::default()
    });
    panic.extra.insert("corps".into(), body.into());
    let scrubbed = scrub_event(panic);
    assert!(
        !serde_json::to_string(&scrubbed)
            .unwrap()
            .contains("clientState")
    );
    assert_eq!(scrubbed.message.as_deref(), Some("[masqué]"));
    assert!(scrubbed.request.is_none());
    // Un message de log_error (étiquette `event`) : gardé, avec ses seuls identifiants.
    let mut ours = Event {
        message: Some("porte.base: PoolTimedOut".into()),
        ..Default::default()
    };
    ours.tags.insert("event".into(), "porte.base".into());
    ours.extra.insert("outil".into(), "outlook".into());
    ours.extra.insert("corps".into(), body.into());
    let kept = scrub_event(ours);
    assert_eq!(kept.message.as_deref(), Some("porte.base: PoolTimedOut"));
    assert_eq!(kept.extra.keys().collect::<Vec<_>>(), ["outil"]);
}

#[test]
fn cle_d_adresse_ip() {
    // Les cas de hono-gate.test.ts (chapitre 03, 13.3), et ceux qui départagent les deux mises en œuvre.
    assert_eq!(
        ip_key("2001:db8:1:2:aaaa::1").as_deref(),
        Some("2001:db8:1:2::/64")
    );
    assert_eq!(
        ip_key("2001:0DB8:0001:0002:bbbb:cccc:dddd:eeee").as_deref(),
        Some("2001:db8:1:2::/64")
    );
    assert_ne!(ip_key("2001:db8:1:3::1"), ip_key("2001:db8:1:2::1"));
    assert_ne!(ip_key("203.0.113.7"), ip_key("203.0.113.8"));
    assert_eq!(ip_key("::ffff:203.0.113.7").as_deref(), Some("203.0.113.7"));
    assert_eq!(
        ip_key("0:0:0:0:0:ffff:203.0.113.7").as_deref(),
        Some("203.0.113.7")
    );
    assert_eq!(ip_key("fe80::1%eth0").as_deref(), Some("fe80:0:0:0::/64"));
    // Écrite en hexadécimal, une IPv4 dans une IPv6 reste une IPv6 pour ipKey : même choix ici.
    assert_eq!(ip_key("::ffff:cb00:7107").as_deref(), Some("0:0:0:0::/64"));
    assert_eq!(ip_key("pas une adresse"), None);
    assert_eq!(ip_key("01.2.3.4"), None);
}

#[test]
fn les_secrets_d_application_sont_les_seuls_lus() {
    let providers = providers();
    let env = BTreeMap::from([
        ("LEON_OAUTH_HUBSPOT_SECRET".to_string(), "s".to_string()),
        ("LEON_CONNECTORS_KEY".to_string(), "jamais lue".to_string()),
    ]);
    let settings = porte_settings(&providers, |name| env.get(name).cloned()).unwrap();
    assert_eq!(
        settings.app_secrets.keys().collect::<Vec<_>>(),
        ["LEON_OAUTH_HUBSPOT_SECRET"]
    );
    let bad = BTreeMap::from([("LEON_PORTE_KEY".to_string(), "trop court".to_string())]);
    assert!(porte_settings(&providers, |name| bad.get(name).cloned()).is_err());
}

// Essai différentiel, hors CI : des cas tirés autour des vecteurs par un script Node, jugés par verify.ts, dans le
// format de la section « verification » (chapitre 15, section 15.3). Les cas nommés « écart connu » sont ceux où
// serde_json refuse ce que JSON.parse accepte : ils doivent diverger, et seulement eux.
#[derive(Deserialize)]
struct Differential {
    verification: Vec<VerificationCase>,
}

#[test]
#[ignore = "à la main : PORTE_DIFFERENTIEL=<cas.json> cargo test -- --ignored"]
fn differentiel_avec_verify_ts() {
    let path =
        std::env::var("PORTE_DIFFERENTIEL").expect("PORTE_DIFFERENTIEL : le fichier des cas");
    let cases: Differential =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut differ = Vec::new();
    for case in &cases.verification {
        let verdict = verify_webhook(&VerifyInput {
            verification: &case.verification,
            body_format: case.body_format,
            secret: &case.secret,
            method: &case.method,
            uri: &case.uri,
            headers: &case.headers,
            body: case.body.as_bytes(),
            now_ms: case.now,
        });
        let got = verdict.map_or_else(|reason| reason.as_str(), |()| "ok");
        if got != case.expected {
            differ.push(format!(
                "{} : Rust {got}, TypeScript {}",
                case.name, case.expected
            ));
        }
    }
    let unexpected: Vec<&String> = differ
        .iter()
        .filter(|line| !line.starts_with("écart connu"))
        .collect();
    println!(
        "{} cas, {} divergences : {differ:#?}",
        cases.verification.len(),
        differ.len()
    );
    assert!(unexpected.is_empty(), "{unexpected:#?}");
}
