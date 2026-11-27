// Le contrat SQL de la porte (dossier agents 7.4, chapitre 01 section 11) : deux fonctions, accordées au seul rôle
// leon_porte. La porte ne lit et n'écrit aucune table. Et les caches qui évitent de relire la base : un cache positif
// des secrets, un cache négatif des adresses inconnues, un compteur des lectures vides par adresse IP. Mêmes règles
// que hono-gate.ts (chapitre 03, 6.1 et 6.2) : mêmes durées, même borne, même éviction, même fenêtre fixe.

use std::collections::{BTreeMap, HashMap};
use std::future::Future;
use std::str::FromStr;
use std::time::Duration;

use serde::Serialize;
use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::types::Json;
use uuid::Uuid;

// Ce que rend porte_secret : l'organisation de l'abonnement et son secret chiffré (nul : l'outil signe avec un secret
// d'application).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubscriptionRow {
    pub tenant_id: String,
    pub secret: Option<String>,
}

// Les sept arguments de porte_deposer, dans l'ordre. `Serialize` pour les tests, qui les comparent à vecteurs.json.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Deposit {
    pub outil: String,
    pub abonnement: Option<String>,
    pub compte: Option<String>,
    pub genre: &'static str, // 'livraison' ou 'cycle'
    pub livraison: String,
    pub corps: String,
    pub entetes: BTreeMap<String, String>,
}

// Une panne de base : la porte répond 503, l'éditeur réessaie. Le résumé ne garde que des champs de diagnostic
// (comme safeErrorSummary de src/server/log.ts) : jamais un message de Postgres, qui peut citer un paramètre.
#[derive(Debug)]
pub struct StoreError(pub String);

impl From<sqlx::Error> for StoreError {
    fn from(error: sqlx::Error) -> Self {
        let summary = match &error {
            sqlx::Error::Database(db) => {
                let mut parts = vec!["Database".to_string()];
                if let Some(code) = db.code() {
                    parts.push(format!("code={code}"));
                }
                if let Some(constraint) = db.constraint() {
                    parts.push(format!("constraint={constraint}"));
                }
                if let Some(table) = db.table() {
                    parts.push(format!("table={table}"));
                }
                parts.join(" ")
            }
            sqlx::Error::PoolTimedOut => "PoolTimedOut".into(),
            sqlx::Error::PoolClosed => "PoolClosed".into(),
            sqlx::Error::Io(_) => "Io".into(),
            sqlx::Error::Tls(_) => "Tls".into(),
            sqlx::Error::Protocol(_) => "Protocol".into(),
            sqlx::Error::RowNotFound => "RowNotFound".into(),
            sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => "Decode".into(),
            _ => "Other".into(),
        };
        StoreError(summary)
    }
}

// PorteStore de hono-gate.ts. Une implémentation par Postgres, une fausse pour les tests (src/tests.rs).
pub trait PorteStore: Send + Sync + 'static {
    // porte_secret : None pour un abonnement inconnu, d'un autre outil, expiré, résilié, ou d'une personne partie.
    fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> impl Future<Output = Result<Option<SubscriptionRow>, StoreError>> + Send;
    // porte_deposer : les lignes écrites (0 : déjà reçue, ou personne n'écoute ce compte).
    fn deposit(&self, deposit: &Deposit) -> impl Future<Output = Result<i32, StoreError>> + Send;
}

pub struct PgPorteStore {
    pool: PgPool,
}

// Le délai d'un appel de base, attente d'une connexion comprise. Au-delà, la livraison reçoit 503 (porte.base) : sous
// les 3 secondes du plus court délai d'éditeur (chapitre 15, section 4), pas à l'heure où l'éditeur a déjà renoncé.
// main.rs borne chaque appel par tokio::time::timeout ; statement_timeout fait aussi arrêter la requête par Postgres,
// pour qu'une requête abandonnée ici ne continue pas de tenir une connexion là-bas.
pub const DB_CALL_TIMEOUT: Duration = Duration::from_secs(2);
const STATEMENT_TIMEOUT_MS: u64 = 2_000;

// Le pool du service : 5 connexions (chapitre 13, 8.2), sous le rôle leon_porte. Ouvert à la demande : le service
// démarre même si la base tarde ; /sante attend la première lecture réussie (main.rs, wait_for_base). Une livraison
// attend une connexion DB_CALL_TIMEOUT au plus, puis reçoit 503. L'adresse porte sslmode=verify-full et sslrootcert,
// comme DATABASE_URL_PORTE de web.
pub fn connect(database_url: &str) -> Result<PgPorteStore, sqlx::Error> {
    let options = PgConnectOptions::from_str(database_url)?
        .application_name("leon-porte")
        .options([("statement_timeout", STATEMENT_TIMEOUT_MS)]);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .min_connections(0)
        .acquire_timeout(DB_CALL_TIMEOUT)
        .idle_timeout(Some(Duration::from_secs(600)))
        .max_lifetime(Some(Duration::from_secs(1800)))
        .connect_lazy_with(options);
    Ok(PgPorteStore { pool })
}

impl PorteStore for PgPorteStore {
    async fn secret(
        &self,
        outil: &str,
        abonnement: &str,
    ) -> Result<Option<SubscriptionRow>, StoreError> {
        // La porte n'appelle qu'avec un UUID en minuscules, vérifié avant (main.rs, spec_for).
        let Ok(abonnement) = Uuid::parse_str(abonnement) else {
            return Ok(None);
        };
        let row: Option<(Uuid, Option<String>)> =
            sqlx::query_as("select tenant_id, secret from porte_secret($1, $2)")
                .bind(outil)
                .bind(abonnement)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|(tenant_id, secret)| SubscriptionRow {
            tenant_id: tenant_id.to_string(),
            secret,
        }))
    }

    async fn deposit(&self, deposit: &Deposit) -> Result<i32, StoreError> {
        let abonnement = deposit
            .abonnement
            .as_deref()
            .and_then(|id| Uuid::parse_str(id).ok());
        let written: i32 =
            sqlx::query_scalar("select porte_deposer($1, $2, $3, $4, $5, $6, $7::jsonb)")
                .bind(&deposit.outil)
                .bind(abonnement)
                .bind(deposit.compte.as_deref())
                .bind(deposit.genre)
                .bind(&deposit.livraison)
                .bind(&deposit.corps)
                .bind(Json(&deposit.entetes))
                .fetch_one(&self.pool)
                .await?;
        Ok(written)
    }
}

// Une table bornée, à durée de vie (Memo de hono-gate.ts). L'ordre d'insertion décide de l'éviction : la plus
// ancienne part quand la table dépasse sa borne ; réécrire une clé la remet en dernier, comme delete puis set sur une
// Map de JavaScript.
pub struct Memo<T> {
    ttl_ms: i64,
    max_entries: usize,
    entries: HashMap<String, (u64, T, i64)>, // rang d'insertion, valeur, échéance
    order: BTreeMap<u64, String>,
    next_rank: u64,
}

impl<T: Clone> Memo<T> {
    pub fn new(ttl_seconds: u64, max_entries: usize) -> Self {
        Self {
            ttl_ms: ttl_seconds as i64 * 1000,
            max_entries,
            entries: HashMap::new(),
            order: BTreeMap::new(),
            next_rank: 0,
        }
    }

    pub fn get(&mut self, key: &str, now_ms: i64) -> Option<T> {
        let (rank, value, until) = self.entries.get(key)?;
        if *until > now_ms {
            return Some(value.clone());
        }
        let rank = *rank;
        self.entries.remove(key);
        self.order.remove(&rank);
        None
    }

    pub fn set(&mut self, key: &str, value: T, now_ms: i64) {
        let until = now_ms + self.ttl_ms;
        self.insert(key, value, until);
    }

    fn insert(&mut self, key: &str, value: T, until: i64) {
        if let Some((rank, _, _)) = self.entries.remove(key) {
            self.order.remove(&rank);
        }
        let rank = self.next_rank;
        self.next_rank += 1;
        self.entries.insert(key.to_string(), (rank, value, until));
        self.order.insert(rank, key.to_string());
        if self.entries.len() > self.max_entries
            && let Some((_, oldest)) = self.order.pop_first()
        {
            self.entries.remove(&oldest);
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

// Des compteurs à fenêtre fixe (Counters de hono-gate.ts) : la fenêtre s'ouvre au premier compte et ne se prolonge
// pas, même si les comptes continuent. Même borne et même éviction que Memo.
pub struct Counters {
    window_ms: i64,
    memo: Memo<u32>,
}

impl Counters {
    pub fn new(window_seconds: u64, max_entries: usize) -> Self {
        Self {
            window_ms: window_seconds as i64 * 1000,
            memo: Memo::new(window_seconds, max_entries),
        }
    }

    pub fn get(&mut self, key: &str, now_ms: i64) -> u32 {
        self.memo.get(key, now_ms).unwrap_or(0)
    }

    pub fn add(&mut self, key: &str, now_ms: i64) {
        // Dans la fenêtre : on compte sans repousser l'échéance (pas de déplacement dans l'ordre non plus, comme
        // `entry.count += 1` sur la Map).
        if let Some((_, count, until)) = self.memo.entries.get_mut(key)
            && *until > now_ms
        {
            *count += 1;
            return;
        }
        self.memo.insert(key, 1, now_ms + self.window_ms);
    }
}

// L'état de la porte (GateState de hono-gate.ts). En mémoire du processus : juste tant que le service a une seule
// instance ; avec plusieurs, chacune a ses caches et sa limite, ce qui reste sûr (ils ne font qu'éviter des lectures).
pub struct GateState {
    pub secrets: Memo<SubscriptionRow>,
    pub unknown: Memo<()>,
    pub misses: Counters, // par clé d'adresse IP (ip_key) : lectures de porte_secret restées vides
}

impl GateState {
    pub fn new(
        secret_cache_seconds: u64,
        negative_cache_seconds: u64,
        window_seconds: u64,
        max_entries: usize,
    ) -> Self {
        Self {
            secrets: Memo::new(secret_cache_seconds, max_entries),
            unknown: Memo::new(negative_cache_seconds, max_entries),
            misses: Counters::new(window_seconds, max_entries),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memo_expire_et_evince_la_plus_ancienne() {
        let mut memo = Memo::new(60, 2);
        memo.set("a", 1, 0);
        memo.set("b", 2, 0);
        memo.set("a", 3, 1); // a repasse en dernier
        memo.set("c", 4, 2); // b, la plus ancienne, part
        assert_eq!(memo.get("b", 3), None);
        assert_eq!(memo.get("a", 3), Some(3));
        assert_eq!(memo.get("c", 3), Some(4));
        assert_eq!(memo.get("c", 60_002), None); // échue
        assert_eq!(memo.len(), 1);
    }

    #[test]
    fn la_fenetre_ne_se_prolonge_pas() {
        let mut counters = Counters::new(600, 10);
        counters.add("ip", 0);
        counters.add("ip", 599_000);
        assert_eq!(counters.get("ip", 599_999), 2);
        assert_eq!(counters.get("ip", 600_000), 0); // la fenêtre ouverte à 0 est close
        counters.add("ip", 600_000);
        assert_eq!(counters.get("ip", 600_001), 1);
    }

    #[test]
    fn une_erreur_de_base_ne_garde_aucun_message() {
        let error = StoreError::from(sqlx::Error::Protocol("corps cité par erreur".into()));
        assert_eq!(error.0, "Protocol");
    }
}
