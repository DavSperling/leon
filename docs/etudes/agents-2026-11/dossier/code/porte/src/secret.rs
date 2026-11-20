// Les secrets d'abonnement (abonnements_webhook.secret, dossier agents 7.2 et 8.3), en lecture seule. Même format
// que src/server/connectors/crypto.ts : v1:<iv>:<tag>:<chiffré>, chaque partie en base64url, AES-256-GCM, IV de
// 12 octets, étiquette de 16. La clé est LEON_PORTE_KEY ; les données associées, `<tenant_id>:<abonnement_id>`, lient
// le secret à sa ligne (src/server/webhooks/crypto.ts, chapitre 03). La porte ne chiffre jamais : seul le worker
// écrit un secret, en abonnant.

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::Engine as _;
use base64::alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};

const VERSION: &str = "v1";
const KEY_BYTES: usize = 32;
const IV_BYTES: usize = 12;
const TAG_BYTES: usize = 16;

// Les deux décodeurs tolèrent le remplissage et les bits de fin, comme Buffer.from(…, 'base64url') et
// Buffer.from(…, 'base64') de Node. Les secrets écrits par encryptSecret n'en ont jamais : c'est une marge.
const BASE64URL: GeneralPurpose = GeneralPurpose::new(
    &alphabet::URL_SAFE,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

// Un message fixe : jamais le secret, ni le chiffré, ni la clé.
#[derive(Debug, PartialEq, Eq)]
pub struct UnreadableSecret;

impl std::fmt::Display for UnreadableSecret {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Secret illisible")
    }
}

impl std::error::Error for UnreadableSecret {}

// LEON_PORTE_KEY : 32 octets en base64 (env.ts le vérifie côté TypeScript). None : absente, vide ou mal formée ; le
// démarrage refuse une valeur mal formée (main.rs), une valeur absente rend 503 aux livraisons d'abonnement.
pub fn parse_porte_key(value: &str) -> Option<[u8; KEY_BYTES]> {
    BASE64.decode(value.trim()).ok()?.try_into().ok()
}

// subscriptionAad de src/server/webhooks/crypto.ts.
pub fn subscription_aad(tenant_id: &str, abonnement_id: &str) -> String {
    format!("{tenant_id}:{abonnement_id}")
}

// openSubscriptionSecret de crypto.ts, sans la clé par défaut : la porte la reçoit toujours en argument.
pub fn open_subscription_secret(
    stored: &str,
    aad: &str,
    key: &[u8; KEY_BYTES],
) -> Result<String, UnreadableSecret> {
    let parts: Vec<&str> = stored.split(':').collect();
    let [version, iv, tag, encrypted] = parts.as_slice() else {
        return Err(UnreadableSecret);
    };
    if *version != VERSION {
        return Err(UnreadableSecret);
    }
    let decode = |part: &str| BASE64URL.decode(part).map_err(|_| UnreadableSecret);
    let (iv, tag, encrypted) = (decode(iv)?, decode(tag)?, decode(encrypted)?);
    if iv.len() != IV_BYTES || tag.len() != TAG_BYTES {
        return Err(UnreadableSecret);
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| UnreadableSecret)?;
    let nonce = Nonce::try_from(iv.as_slice()).map_err(|_| UnreadableSecret)?;
    // aes-gcm attend l'étiquette à la suite du chiffré.
    let mut message = encrypted;
    message.extend_from_slice(&tag);
    let plain = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &message,
                aad: aad.as_bytes(),
            },
        )
        .map_err(|_| UnreadableSecret)?;
    // toString('utf8') de Node remplace un octet invalide au lieu d'échouer.
    Ok(String::from_utf8_lossy(&plain).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_cle_fait_32_octets() {
        assert!(parse_porte_key("CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=").is_some());
        assert!(parse_porte_key("CQkJ").is_none());
        assert!(parse_porte_key("").is_none());
    }

    #[test]
    fn un_format_inconnu_est_illisible() {
        let key = [9u8; 32];
        for stored in [
            "",
            "v2:a:b:c",
            "v1:a:b",
            "v1:AQEBAQEBAQEBAQEB:AAAA:AAAA",
            "v1:!!:x:y:z",
        ] {
            assert_eq!(
                open_subscription_secret(stored, "t:a", &key),
                Err(UnreadableSecret)
            );
        }
    }
}
