// L'interprète de WebhookVerification (dossier agents, 8.3), seconde mise en œuvre. La première est
// src/server/webhooks/verify.ts (chapitre 03, section 4) : les deux rendent le même verdict sur chaque cas de
// services/porte/vecteurs.json, et suivent les étapes dans le même ordre (un cas qui cumule deux défauts rend la
// première raison rencontrée). Pur : ni base, ni réseau, ni variable d'environnement. L'heure est un argument, le
// secret arrive en clair. Un refus dit pourquoi, pour le journal et les vecteurs, jamais à l'éditeur.

use std::collections::BTreeMap;

use base64::Engine as _;
use base64::alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use hmac::{Hmac, KeyInit, Mac};
use serde::Deserialize;
use serde_json::Value;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

// Les types de src/server/connectors/types.ts (architecture 8.3), tels que fournisseurs.json les écrit. Un champ
// inconnu fait échouer la lecture, dans chaque mode et dans chaque morceau signé (deny_unknown_fields sur chaque type,
// enums comprises) : un changement du contrat sans changement de `version` se voit au démarrage.

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "from", deny_unknown_fields)]
pub enum WebhookSecret {
    #[serde(rename = "abonnement")]
    Abonnement,
    #[serde(rename = "env")]
    Env { name: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimestampSource {
    Header,
    Body,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimestampUnit {
    S,
    Ms,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebhookTimestamp {
    pub source: TimestampSource,
    pub name: String,
    pub unit: TimestampUnit,
    pub tolerance_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NamedPart {
    Method,
    Uri,
    Timestamp,
    Body,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum SignedPart {
    Named(NamedPart),
    Literal { literal: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Encoding {
    Hex,
    Base64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SecretEncoding {
    Utf8,
    Hex,
    Base64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HmacVerification {
    pub header: String,
    pub encoding: Encoding,
    pub prefix: Option<String>,
    pub signed: Vec<SignedPart>,
    pub separator: String,
    pub timestamp: Option<WebhookTimestamp>,
    pub secret: WebhookSecret,
    pub secret_encoding: Option<SecretEncoding>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "mode", deny_unknown_fields)]
pub enum WebhookVerification {
    #[serde(rename = "hmac-sha256")]
    HmacSha256(HmacVerification),
    #[serde(rename = "hmac-sha1")]
    HmacSha1(HmacVerification),
    #[serde(rename = "standard-webhooks")]
    StandardWebhooks { secret: WebhookSecret },
    #[serde(rename = "jeton", rename_all = "camelCase")]
    Jeton {
        header: Option<String>,
        body_pointer: Option<String>,
        secret: WebhookSecret,
    },
}

impl WebhookVerification {
    pub fn secret(&self) -> &WebhookSecret {
        match self {
            Self::HmacSha256(hmac) | Self::HmacSha1(hmac) => &hmac.secret,
            Self::StandardWebhooks { secret } | Self::Jeton { secret, .. } => secret,
        }
    }

    // La signature couvre-t-elle l'adresse appelée ? Sans LEON_PORTE_URL, la porte ne peut pas la rebâtir.
    pub fn signs_uri(&self) -> bool {
        match self {
            Self::HmacSha256(hmac) | Self::HmacSha1(hmac) => {
                hmac.signed.contains(&SignedPart::Named(NamedPart::Uri))
            }
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum BodyFormat {
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "form-payload")]
    FormPayload,
}

// Les cinq raisons d'un refus (VERDICT_REASONS de verify.ts).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerdictReason {
    Entete,
    Signature,
    Horodatage,
    Secret,
    Format,
}

impl VerdictReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Entete => "entete",
            Self::Signature => "signature",
            Self::Horodatage => "horodatage",
            Self::Secret => "secret",
            Self::Format => "format",
        }
    }
}

pub type Verdict = Result<(), VerdictReason>;

pub struct VerifyInput<'a> {
    pub verification: &'a WebhookVerification,
    pub body_format: BodyFormat,
    pub secret: &'a str, // en clair : déchiffré (abonnement) ou lu dans sa variable (application)
    pub method: &'a str,
    pub uri: &'a str, // l'adresse publique appelée : LEON_PORTE_URL, puis /h/…, puis la chaîne de requête reçue
    pub headers: &'a BTreeMap<String, String>, // noms en minuscules
    pub body: &'a [u8], // le corps brut, jamais re-sérialisé
    pub now_ms: i64,
}

const STANDARD_TOLERANCE_SECONDS: f64 = 300.0;

// base64 standard, remplissage exigé, bits de fin tolérés : Buffer.from(texte, 'base64') de Node les ignore. Sans
// cette tolérance, une signature écrite avec des bits de fin non nuls passerait en TypeScript et pas ici.
const BASE64_LENIENT: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::RequireCanonical),
);

// /^\d{1,16}$/ de verify.ts : des chiffres ASCII seulement.
fn is_digits(text: &str) -> bool {
    (1..=16).contains(&text.len()) && text.bytes().all(|b| b.is_ascii_digit())
}

// /^(?:[0-9a-fA-F]{2})+$/
fn is_hex(text: &str) -> bool {
    !text.is_empty() && text.len().is_multiple_of(2) && text.bytes().all(|b| b.is_ascii_hexdigit())
}

// /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
fn is_base64(text: &str) -> bool {
    let padding = text.bytes().rev().take_while(|&b| b == b'=').count();
    let body = &text.as_bytes()[..text.len() - padding];
    padding <= 2
        && text.len().is_multiple_of(4)
        && body
            .iter()
            .all(|&b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/')
}

// Hexadécimal (majuscules admises) ou base64 standard avec remplissage. None : vide ou illisible.
pub fn decode_bytes(text: &str, encoding: Encoding) -> Option<Vec<u8>> {
    if text.is_empty() {
        return None;
    }
    match encoding {
        Encoding::Hex => is_hex(text).then(|| hex::decode(text).ok()).flatten(),
        Encoding::Base64 => is_base64(text)
            .then(|| BASE64_LENIENT.decode(text).ok())
            .flatten(),
    }
}

// Temps constant pour une même longueur ; la longueur d'une signature n'est pas un secret.
fn same_bytes(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && bool::from(a.ct_eq(b))
}

// Temps constant quelle que soit la longueur : on compare les empreintes des deux textes.
fn same_text(a: &str, b: &str) -> bool {
    let left = Sha256::digest(a.as_bytes());
    let right = Sha256::digest(b.as_bytes());
    bool::from(left.as_slice().ct_eq(right.as_slice()))
}

// Quatre chiffres hexadécimaux à partir de `at` : une unité UTF-16 écrite \uXXXX.
fn hex4(bytes: &[u8], at: usize) -> Option<u16> {
    let digits = std::str::from_utf8(bytes.get(at..at + 4)?).ok()?;
    if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u16::from_str_radix(digits, 16).ok()
}

// JSON.parse garde une moitié de paire UTF-16 seule (« \ud800 ») ; serde_json la refuse. La porte n'en fait que des
// octets UTF-8, où Node écrit U+FFFD à sa place (empreinte d'un jeton, compte passé à Postgres, écho) : la remplacer
// par \ufffd avant de relire donne les mêmes octets. None : rien à remplacer.
fn replace_lone_surrogates(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let (mut out, mut last, mut index, mut in_string) = (String::new(), 0, 0, false);
    while index < bytes.len() {
        match (in_string, bytes[index]) {
            (false, b'"') => in_string = true,
            (true, b'"') => in_string = false,
            (true, b'\\') if bytes.get(index + 1) == Some(&b'u') => {
                let Some(unit) = hex4(bytes, index + 2) else {
                    index += 2;
                    continue;
                };
                let low_follows = bytes.get(index + 6..index + 8) == Some(b"\\u")
                    && hex4(bytes, index + 8).is_some_and(|low| (0xdc00..0xe000).contains(&low));
                if (0xd800..0xdc00).contains(&unit) && low_follows {
                    index += 12; // une paire complète
                    continue;
                }
                if (0xd800..0xe000).contains(&unit) {
                    out.push_str(&text[last..index]);
                    out.push_str("\\ufffd");
                    last = index + 6;
                }
                index += 6;
                continue;
            }
            (true, b'\\') => {
                index += 2;
                continue;
            }
            _ => {}
        }
        index += 1;
    }
    if last == 0 {
        return None;
    }
    out.push_str(&text[last..]);
    Some(out)
}

// JSON.parse, autant que serde_json le permet. Écarts restants (chapitre 15, « Ce que je n'ai pas vérifié ») : un
// nombre hors des f64 (« 1e400 ») et plus de 128 niveaux d'imbrication, que JSON.parse accepte et que serde_json
// refuse. Le verdict devient alors un refus ici.
fn parse_json_like_js(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok().or_else(|| {
        let repaired = replace_lone_surrogates(text)?;
        serde_json::from_str(&repaired).ok()
    })
}

// Le corps lu comme JSON : tel quel, ou le champ `payload` d'un formulaire (Slack). None : illisible.
pub fn parse_body_json(format: BodyFormat, text: &str) -> Option<Value> {
    match format {
        BodyFormat::Json => parse_json_like_js(text),
        BodyFormat::FormPayload => {
            // URLSearchParams retire un « ? » de tête.
            let query = text.strip_prefix('?').unwrap_or(text);
            let payload = form_urlencoded::parse(query.as_bytes())
                .find(|(key, _)| key == "payload")
                .map(|(_, value)| value.into_owned())?;
            parse_json_like_js(&payload)
        }
    }
}

// /^(?:\/(?:[^/~]|~[01])*)+$/ : commence par « / », et chaque « ~ » est suivi de 0 ou de 1.
fn is_pointer(pointer: &str) -> bool {
    let mut chars = pointer.chars().peekable();
    if chars.next() != Some('/') {
        return false;
    }
    while let Some(c) = chars.next() {
        if c == '~' && !matches!(chars.next(), Some('0' | '1')) {
            return false;
        }
    }
    true
}

// /^(?:0|[1-9]\d*)$/
fn is_index(segment: &str) -> bool {
    segment == "0"
        || (segment
            .as_bytes()
            .first()
            .is_some_and(|b| (b'1'..=b'9').contains(b))
            && segment.bytes().all(|b| b.is_ascii_digit()))
}

const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

// Number.isSafeInteger, puis String(n) : un entier entre -(2^53 - 1) et 2^53 - 1, écrit sans exposant.
fn safe_integer(number: &serde_json::Number) -> Option<String> {
    let value = number.as_f64()?;
    if let Some(int) = number.as_i64() {
        return ((int as f64).abs() <= MAX_SAFE_INTEGER).then(|| int.to_string());
    }
    if let Some(int) = number.as_u64() {
        return ((int as f64) <= MAX_SAFE_INTEGER).then(|| int.to_string());
    }
    (value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER)
        .then(|| (value as i64).to_string()) // -0.0 devient « 0 », comme String(-0)
}

// Un pointeur JSON (RFC 6901), avec au plus un segment « * » qui parcourt un tableau non vide. Rend les valeurs en
// texte : une chaîne telle quelle, un entier sûr en chiffres décimaux. None : pointeur mal formé, chemin absent,
// tableau vide, ou une valeur d'un autre type.
pub fn read_pointer(document: &Value, pointer: &str) -> Option<Vec<String>> {
    if !is_pointer(pointer) {
        return None;
    }
    let segments: Vec<String> = pointer[1..]
        .split('/')
        .map(|segment| segment.replace("~1", "/").replace("~0", "~"))
        .collect();
    if segments.iter().filter(|segment| *segment == "*").count() > 1 {
        return None;
    }
    let mut nodes: Vec<&Value> = vec![document];
    for segment in &segments {
        let mut next = Vec::new();
        for node in nodes {
            match node {
                Value::Array(items) if segment == "*" => {
                    if items.is_empty() {
                        return None;
                    }
                    next.extend(items.iter());
                }
                _ if segment == "*" => return None,
                Value::Array(items) => {
                    let index = is_index(segment)
                        .then(|| segment.parse::<usize>().ok())
                        .flatten()?;
                    next.push(items.get(index)?);
                }
                Value::Object(map) => next.push(map.get(segment.as_str())?),
                _ => return None,
            }
        }
        nodes = next;
    }
    let mut values = Vec::with_capacity(nodes.len());
    for value in nodes {
        match value {
            Value::String(text) => values.push(text.clone()),
            Value::Number(number) => values.push(safe_integer(number)?),
            _ => return None,
        }
    }
    (!values.is_empty()).then_some(values)
}

// Les en-têtes qui portent un secret ou une signature : jamais gardés avec une livraison.
pub fn secret_headers(verification: &WebhookVerification) -> Vec<&str> {
    match verification {
        WebhookVerification::StandardWebhooks { .. } => vec!["webhook-signature"],
        WebhookVerification::Jeton { header, .. } => header.iter().map(String::as_str).collect(),
        WebhookVerification::HmacSha256(hmac) | WebhookVerification::HmacSha1(hmac) => {
            vec![hmac.header.as_str()]
        }
    }
}

fn key_of(secret: &str, encoding: Option<SecretEncoding>) -> Option<Vec<u8>> {
    match encoding.unwrap_or(SecretEncoding::Utf8) {
        SecretEncoding::Utf8 => Some(secret.as_bytes().to_vec()),
        SecretEncoding::Hex => decode_bytes(secret, Encoding::Hex),
        SecretEncoding::Base64 => decode_bytes(secret, Encoding::Base64),
    }
}

struct Stamp {
    text: String,
    ms: f64, // en flottant, comme Number() : 16 chiffres en secondes dépassent un i64 une fois en millisecondes
}

fn read_stamp(timestamp: &WebhookTimestamp, input: &VerifyInput) -> Option<Stamp> {
    let text = match timestamp.source {
        TimestampSource::Header => input.headers.get(&timestamp.name).cloned(),
        TimestampSource::Body => {
            let body = String::from_utf8_lossy(input.body);
            let document = parse_body_json(input.body_format, &body)?;
            match read_pointer(&document, &timestamp.name) {
                Some(mut values) if values.len() == 1 => values.pop(),
                _ => None,
            }
        }
    }?;
    if !is_digits(&text) {
        return None;
    }
    let number: f64 = text.parse().ok()?;
    let ms = match timestamp.unit {
        TimestampUnit::S => number * 1000.0,
        TimestampUnit::Ms => number,
    };
    Some(Stamp { text, ms })
}

fn fresh(ms: f64, now_ms: i64, tolerance_seconds: f64) -> bool {
    (now_ms as f64 - ms).abs() <= tolerance_seconds * 1000.0
}

fn signed_bytes(
    parts: &[SignedPart],
    separator: &str,
    input: &VerifyInput,
    stamp: Option<&Stamp>,
) -> Vec<u8> {
    let mut message = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            message.extend_from_slice(separator.as_bytes());
        }
        match part {
            SignedPart::Literal { literal } => message.extend_from_slice(literal.as_bytes()),
            SignedPart::Named(NamedPart::Method) => {
                message.extend_from_slice(input.method.to_uppercase().as_bytes())
            }
            SignedPart::Named(NamedPart::Uri) => message.extend_from_slice(input.uri.as_bytes()),
            SignedPart::Named(NamedPart::Timestamp) => {
                message.extend_from_slice(stamp.map_or("", |s| s.text.as_str()).as_bytes())
            }
            SignedPart::Named(NamedPart::Body) => message.extend_from_slice(input.body),
        }
    }
    message
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac =
        <Hmac<Sha256> as KeyInit>::new_from_slice(key).expect("HMAC accepte toute longueur de clé");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn hmac_sha1(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac =
        <Hmac<Sha1> as KeyInit>::new_from_slice(key).expect("HMAC accepte toute longueur de clé");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn verify_hmac(hmac: &HmacVerification, sha1: bool, input: &VerifyInput) -> Verdict {
    let key = key_of(input.secret, hmac.secret_encoding).ok_or(VerdictReason::Secret)?;
    let mut header = input
        .headers
        .get(&hmac.header)
        .ok_or(VerdictReason::Entete)?
        .as_str();
    if let Some(prefix) = &hmac.prefix {
        header = header
            .strip_prefix(prefix.as_str())
            .ok_or(VerdictReason::Signature)?;
    }
    let given = decode_bytes(header, hmac.encoding).ok_or(VerdictReason::Signature)?;
    let mut stamp = None;
    if let Some(timestamp) = &hmac.timestamp {
        match read_stamp(timestamp, input) {
            Some(read) if fresh(read.ms, input.now_ms, timestamp.tolerance_seconds) => {
                stamp = Some(read)
            }
            _ => return Err(VerdictReason::Horodatage),
        }
    }
    let message = signed_bytes(&hmac.signed, &hmac.separator, input, stamp.as_ref());
    let expected = if sha1 {
        hmac_sha1(&key, &message)
    } else {
        hmac_sha256(&key, &message)
    };
    if same_bytes(&given, &expected) {
        Ok(())
    } else {
        Err(VerdictReason::Signature)
    }
}

fn verify_standard(input: &VerifyInput) -> Verdict {
    let (Some(id), Some(timestamp), Some(signatures)) = (
        input.headers.get("webhook-id"),
        input.headers.get("webhook-timestamp"),
        input.headers.get("webhook-signature"),
    ) else {
        return Err(VerdictReason::Entete);
    };
    let ms = timestamp.parse::<f64>().map(|seconds| seconds * 1000.0);
    if !is_digits(timestamp)
        || !ms.is_ok_and(|ms| fresh(ms, input.now_ms, STANDARD_TOLERANCE_SECONDS))
    {
        return Err(VerdictReason::Horodatage);
    }
    let encoded = input.secret.strip_prefix("whsec_").unwrap_or(input.secret);
    let key = decode_bytes(encoded, Encoding::Base64).ok_or(VerdictReason::Secret)?;
    let mut message = format!("{id}.{timestamp}.").into_bytes();
    message.extend_from_slice(input.body);
    let expected = hmac_sha256(&key, &message);
    for entry in signatures.split(' ') {
        let Some((version, signature)) = entry.split_once(',') else {
            continue;
        };
        if version != "v1" {
            continue;
        }
        if decode_bytes(signature, Encoding::Base64)
            .is_some_and(|given| same_bytes(&given, &expected))
        {
            return Ok(());
        }
    }
    Err(VerdictReason::Signature)
}

fn verify_token(header: Option<&str>, body_pointer: Option<&str>, input: &VerifyInput) -> Verdict {
    if let Some(name) = header {
        let given = input.headers.get(name).ok_or(VerdictReason::Entete)?;
        return if same_text(given, input.secret) {
            Ok(())
        } else {
            Err(VerdictReason::Signature)
        };
    }
    let pointer = body_pointer.ok_or(VerdictReason::Format)?;
    let body = String::from_utf8_lossy(input.body);
    let document = parse_body_json(input.body_format, &body).ok_or(VerdictReason::Format)?;
    let values = read_pointer(&document, pointer).ok_or(VerdictReason::Entete)?;
    // Chaque valeur est comparée : Microsoft regroupe plusieurs notifications, chacune porte son clientState.
    if values.iter().all(|value| same_text(value, input.secret)) {
        Ok(())
    } else {
        Err(VerdictReason::Signature)
    }
}

pub fn verify_webhook(input: &VerifyInput) -> Verdict {
    if input.secret.is_empty() {
        return Err(VerdictReason::Secret);
    }
    match input.verification {
        WebhookVerification::StandardWebhooks { .. } => verify_standard(input),
        WebhookVerification::Jeton {
            header,
            body_pointer,
            ..
        } => verify_token(header.as_deref(), body_pointer.as_deref(), input),
        WebhookVerification::HmacSha256(hmac) => verify_hmac(hmac, false, input),
        WebhookVerification::HmacSha1(hmac) => verify_hmac(hmac, true, input),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn base64_tolere_les_bits_de_fin_comme_node() {
        // « QR== » : Node rend [0x41], comme « QQ== ».
        assert_eq!(decode_bytes("QQ==", Encoding::Base64), Some(vec![0x41]));
        assert_eq!(decode_bytes("QR==", Encoding::Base64), Some(vec![0x41]));
        assert_eq!(decode_bytes("QQ", Encoding::Base64), None); // remplissage exigé
        assert_eq!(decode_bytes("", Encoding::Base64), None);
        assert_eq!(decode_bytes("ABcd", Encoding::Hex), Some(vec![0xab, 0xcd]));
        assert_eq!(decode_bytes("abc", Encoding::Hex), None);
    }

    #[test]
    fn pointeur_avec_etoile_et_entiers_surs() {
        let document = json!({ "value": [{ "a": "x" }, { "a": "y" }], "n": [12345678, 1.0, -0.0, 9007199254740992u64] });
        assert_eq!(
            read_pointer(&document, "/value/*/a"),
            Some(vec!["x".into(), "y".into()])
        );
        assert_eq!(
            read_pointer(&document, "/n/0"),
            Some(vec!["12345678".into()])
        );
        assert_eq!(read_pointer(&document, "/n/1"), Some(vec!["1".into()]));
        assert_eq!(read_pointer(&document, "/n/2"), Some(vec!["0".into()]));
        assert_eq!(read_pointer(&document, "/n/3"), None); // 2^53 : pas un entier sûr
        assert_eq!(read_pointer(&document, "/n/01"), None);
        assert_eq!(read_pointer(&document, "/*/*"), None); // deux étoiles
        assert_eq!(read_pointer(&json!({ "value": [] }), "/value/*/a"), None);
        assert_eq!(
            read_pointer(&json!({ "a/b": { "~": "z" } }), "/a~1b/~0"),
            Some(vec!["z".into()])
        );
        assert_eq!(read_pointer(&document, "value"), None);
        assert_eq!(read_pointer(&document, "/~2"), None);
    }

    #[test]
    fn une_moitie_de_paire_seule_devient_u_fffd_comme_dans_node() {
        let text = r#"{"a":"\ud800","b":"\ud83d\ude00","c":"\\ud800","d":"\udc00x"}"#;
        let expected =
            json!({ "a": "\u{fffd}", "b": "\u{1f600}", "c": "\\ud800", "d": "\u{fffd}x" });
        assert_eq!(parse_body_json(BodyFormat::Json, text), Some(expected));
        // Les écarts qui restent : refusés ici, acceptés par JSON.parse.
        assert_eq!(parse_body_json(BodyFormat::Json, r#"{"n":1e400}"#), None);
        assert_eq!(
            parse_body_json(
                BodyFormat::Json,
                &format!("{}{}", "[".repeat(129), "]".repeat(129))
            ),
            None
        );
    }

    #[test]
    fn chaque_mode_refuse_un_champ_inconnu() {
        let secret = r#""secret":{"from":"env","name":"S"}"#;
        let hmac = format!(
            r#""header":"x-sig","encoding":"hex","signed":["body",{{"literal":"v0"}}],"separator":":",{secret}"#
        );
        for good in [
            format!(r#"{{"mode":"hmac-sha256",{hmac}}}"#),
            format!(r#"{{"mode":"hmac-sha1",{hmac}}}"#),
            format!(r#"{{"mode":"standard-webhooks",{secret}}}"#),
            format!(r#"{{"mode":"jeton","bodyPointer":"/a",{secret}}}"#),
        ] {
            assert!(
                serde_json::from_str::<WebhookVerification>(&good).is_ok(),
                "{good}"
            );
            // Un champ de plus au niveau du mode : refusé, quel que soit le mode.
            let extra = good.replacen('{', r#"{"inconnu":1,"#, 1);
            assert!(
                serde_json::from_str::<WebhookVerification>(&extra).is_err(),
                "{extra}"
            );
        }
        // Un champ de plus dans un morceau signé littéral, ou dans le secret : refusé aussi.
        let literal = format!(r#"{{"mode":"hmac-sha256",{hmac}}}"#)
            .replace(r#"{"literal":"v0"}"#, r#"{"literal":"v0","inconnu":1}"#);
        assert!(serde_json::from_str::<WebhookVerification>(&literal).is_err());
        let in_secret =
            r#"{"mode":"standard-webhooks","secret":{"from":"env","name":"S","inconnu":1}}"#;
        assert!(serde_json::from_str::<WebhookVerification>(in_secret).is_err());
    }

    #[test]
    fn formulaire_payload() {
        let text = "?payload=%7B%22type%22%3A%22url_verification%22%7D&autre=1";
        assert_eq!(
            parse_body_json(BodyFormat::FormPayload, text),
            Some(json!({ "type": "url_verification" }))
        );
        assert_eq!(parse_body_json(BodyFormat::FormPayload, "autre=1"), None);
    }
}
