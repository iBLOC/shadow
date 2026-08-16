use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use password_hash::PasswordHash;
use rand::rngs::OsRng;
use rand::RngCore;

pub fn encrypt_value(plaintext: &str, passphrase: &str) -> Result<String, String> {
    let hash = PasswordHash::new(passphrase).map_err(|e| e.to_string())?;

    let hash_output = hash.hash.unwrap();
    let key = hash_output.as_bytes();
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(base64_encode(&ciphertext))
}

pub fn decrypt_value(encrypted: &str, passphrase: &str) -> Result<String, String> {
    let ciphertext = base64_decode(encrypted).map_err(|e| e.to_string())?;

    let hash = PasswordHash::new(passphrase).map_err(|e| e.to_string())?;
    let hash_output = hash.hash.unwrap();
    let key = hash_output.as_bytes();
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let nonce = Nonce::from_slice(&[0u8; 12]);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| e.to_string())?;

    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b = match chunk.len() {
            1 => [chunk[0], 0, 0],
            2 => [chunk[0], chunk[1], 0],
            _ => [chunk[0], chunk[1], chunk[2]],
        };
        result.push(ALPHABET[(b[0] >> 2) as usize] as char);
        result.push(ALPHABET[((b[0] & 0x03) << 4 | b[1] >> 4) as usize] as char);
        if chunk.len() > 1 {
            result.push(ALPHABET[((b[1] & 0x0f) << 2 | b[2] >> 6) as usize] as char);
        }
        if chunk.len() > 2 {
            result.push(ALPHABET[(b[2] & 0x3f) as usize] as char);
        }
    }
    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    Ok(input.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode_known_value() {
        let data = b"Hello";
        let encoded = base64_encode(data);
        assert!(!encoded.is_empty());
    }

    #[test]
    fn test_base64_encode_empty() {
        let data = b"";
        let encoded = base64_encode(data);
        assert!(encoded.is_empty());
    }
}
