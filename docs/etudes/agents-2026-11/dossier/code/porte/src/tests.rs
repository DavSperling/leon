// Les cas de services/porte/vecteurs.json, rejoués par le service Rust : les mêmes que verify.test.ts et
// hono-gate.test.ts (chapitre 03, section 13). Un verdict qui change ici change aussi en TypeScript, ou l'une des deux
// mises en œuvre a tort. Puis ce que les vecteurs ne mesurent pas : le délai du refus, la limite par adresse IP, le
// cache négatif, la taille du corps, une panne de base.
//
// Le fichier est généré par `pnpm porte:generer` (src/server/webhooks/providers-json.ts) ; Exemple fictif : ses
// secrets, clés, identifiants et corps sont inventés.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::body::{Body, to_bytes};
use axum::http::{Request as HttpRequest, StatusCode};
use serde::Deserialize;
use serde_json::Value;
use tower::ServiceExt;

use crate::depot::{Deposit, PorteStore, StoreError, SubscriptionRow};
use crate::secret::{open_subscription_secret, parse_porte_key};
use crate::verifier::{BodyFormat, VerifyInput, WebhookVerification, verify_webhook};
use crate::{PROVIDERS_JSON, Porte, Providers, ip_key, load_providers, porte_settings, router};

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
#[derive(Default)]
struct FakeStore {
    subscriptions: Vec<StoredSubscription>,
    deposits: StdMutex<Vec<Deposit>>,
    lookups: AtomicUsize,
    broken: bool,
}

impl PorteStore for Arc<FakeStore> {
    async fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> Result<Option<SubscriptionRow>, StoreError> {
        self.lookups.fetch_add(1, Ordering::SeqCst);
        if self.broken {
            return Err(StoreError("PoolTimedOut".into()));
        }
        Ok(self
            .subscriptions
            .iter()
            .find(|row| row.outil == outil && row.id == abonnement)
            .map(|row| SubscriptionRow {
                tenant_id: row.tenant_id.clone(),
                secret: row.stored.clone(),
            }))
    }

    async fn deposit(&self, deposit: &Deposit) -> Result<i32, StoreError> {
        if self.broken {
            return Err(StoreError("PoolTimedOut".into()));
        }
        self.deposits.lock().unwrap().push(deposit.clone());
        Ok(1)
    }
}

fn porte_with(
    env: &BTreeMap<String, String>,
    store: Arc<FakeStore>,
    now: i64,
) -> Arc<Porte<Arc<FakeStore>>> {
    let providers = providers();
    let settings = porte_settings(&providers, |name| env.get(name).cloned()).expect("réglages");
    Arc::new(Porte::new(
        providers,
        settings,
        store,
        Box::new(move || now),
    ))
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

#[test]
fn vecteurs_de_dechiffrement() {
    for case in vectors().decryption {
        let key = parse_porte_key(&case.key).expect("clé de 32 octets");
        let got = open_subscription_secret(&case.stored, &case.aad, &key).ok();
        assert_eq!(got, case.plain, "{}", case.name);
    }
}

#[tokio::test(start_paused = true)]
async fn vecteurs_de_la_porte() {
    let vectors = vectors();
    assert!(!vectors.gate.cases.is_empty());
    for case in &vectors.gate.cases {
        let mut env = vectors.gate.env.clone();
        env.extend(case.env.clone().unwrap_or_default());
        let store = Arc::new(FakeStore {
            subscriptions: vectors.gate.store.subscriptions.clone(),
            ..Default::default()
        });
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
    let store = Arc::new(FakeStore {
        subscriptions: vectors.gate.store.subscriptions.clone(),
        ..Default::default()
    });
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
async fn une_panne_de_base_n_est_pas_un_refus() {
    let (env, _, path, body) = outlook_delivery();
    let store = Arc::new(FakeStore {
        broken: true,
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

#[tokio::test]
async fn le_bilan_de_sante_ne_lit_pas_la_base() {
    let store = Arc::new(FakeStore {
        broken: true,
        ..Default::default()
    });
    let porte = porte_with(&BTreeMap::new(), store, 0);
    let response = router(porte)
        .oneshot(HttpRequest::get("/sante").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&body[..], br#"{"ok":true}"#);
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
// format de la section « verification » (chapitre 15, section 14). Les cas nommés « écart connu » sont ceux où
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
