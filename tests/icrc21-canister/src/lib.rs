use candid::{CandidType, Decode, Nat};
use serde::Deserialize;

#[derive(CandidType, Deserialize)]
struct ConsentMessageMetadata {
    language: String,
    utc_offset_minutes: Option<i16>,
}

#[derive(CandidType, Deserialize)]
enum DeviceSpec {
    GenericDisplay,
    FieldsDisplay,
}

#[derive(CandidType, Deserialize)]
struct ConsentMessageSpec {
    metadata: ConsentMessageMetadata,
    device_spec: Option<DeviceSpec>,
}

#[derive(CandidType, Deserialize)]
struct ConsentMessageRequest {
    arg: Vec<u8>,
    method: String,
    user_preferences: ConsentMessageSpec,
}

#[derive(CandidType)]
struct ConsentInfo {
    metadata: ConsentMessageMetadata,
    consent_message: ConsentMessage,
}

#[derive(CandidType)]
struct TextValue {
    content: String,
}

#[derive(CandidType)]
struct TokenAmount {
    decimals: u8,
    amount: u64,
    symbol: String,
}

#[derive(CandidType)]
struct TimestampSeconds {
    amount: u64,
}

#[derive(CandidType)]
struct DurationSeconds {
    amount: u64,
}

#[derive(CandidType)]
enum Value {
    Text(TextValue),
    TokenAmount(TokenAmount),
    TimestampSeconds(TimestampSeconds),
    DurationSeconds(DurationSeconds),
}

#[derive(CandidType)]
struct FieldsDisplayMessage {
    intent: String,
    fields: Vec<(String, Value)>,
}

#[derive(CandidType)]
enum ConsentMessage {
    GenericDisplayMessage(String),
    FieldsDisplayMessage(FieldsDisplayMessage),
}

#[derive(CandidType)]
struct ErrorInfo {
    description: String,
}

#[derive(CandidType)]
enum ConsentMessageResponse {
    Ok(ConsentInfo),
    Err(ConsentError),
}

#[derive(CandidType)]
enum ConsentError {
    GenericError {
        description: String,
        error_code: Nat,
    },
    InsufficientPayment(ErrorInfo),
    UnsupportedCanisterCall(ErrorInfo),
    ConsentMessageUnavailable(ErrorInfo),
}

#[ic_cdk::update]
fn icrc21_canister_call_consent_message(req: ConsentMessageRequest) -> ConsentMessageResponse {
    match req.method.as_str() {
        "internal_method" => {
            return ConsentMessageResponse::Err(ConsentError::ConsentMessageUnavailable(
                ErrorInfo {
                    description: "This is an internal method not intended for end-users"
                        .to_string(),
                },
            ));
        }
        "paid_method" => {
            return ConsentMessageResponse::Err(ConsentError::InsufficientPayment(ErrorInfo {
                description: "Payment is required to produce a consent message".to_string(),
            }));
        }
        "broken_method" => {
            return ConsentMessageResponse::Err(ConsentError::GenericError {
                error_code: Nat::from(42u64),
                description: "Something went wrong".to_string(),
            });
        }
        "swap" => {}
        _ => {
            return ConsentMessageResponse::Err(ConsentError::UnsupportedCanisterCall(
                ErrorInfo {
                    description: format!(
                        "Consent message not supported for method '{}'",
                        req.method
                    ),
                },
            ));
        }
    }

    let (from, to, amount) = match Decode!(&req.arg, String, String, u64) {
        Ok(args) => args,
        Err(e) => {
            return ConsentMessageResponse::Err(ConsentError::UnsupportedCanisterCall(ErrorInfo {
                description: format!("Failed to decode swap args: {}", e),
            }));
        }
    };

    let metadata = ConsentMessageMetadata {
        language: req.user_preferences.metadata.language,
        utc_offset_minutes: None,
    };

    let consent_message = match req.user_preferences.device_spec {
        Some(DeviceSpec::GenericDisplay) => ConsentMessage::GenericDisplayMessage(format!(
            "Swap {} {} for {}",
            amount, from, to
        )),
        _ => ConsentMessage::FieldsDisplayMessage(FieldsDisplayMessage {
            intent: "Swap tokens".to_string(),
            fields: vec![
                (
                    "From".to_string(),
                    Value::Text(TextValue {
                        content: from.clone(),
                    }),
                ),
                (
                    "To".to_string(),
                    Value::Text(TextValue {
                        content: to,
                    }),
                ),
                (
                    "Amount".to_string(),
                    Value::TokenAmount(TokenAmount {
                        decimals: 8,
                        amount,
                        symbol: from,
                    }),
                ),
                (
                    "Created At".to_string(),
                    Value::TimestampSeconds(TimestampSeconds {
                        amount: ic_cdk::api::time() / 1_000_000_000,
                    }),
                ),
                (
                    "Expires In".to_string(),
                    Value::DurationSeconds(DurationSeconds { amount: 600 }),
                ),
            ],
        }),
    };

    ConsentMessageResponse::Ok(ConsentInfo {
        metadata,
        consent_message,
    })
}

#[ic_cdk::update]
fn swap(from: String, to: String, amount: u64) -> String {
    // This condition is to test what happens when this call traps.
    if amount > 1_000_000_000 {
        ic_cdk::trap("Amount exceeds maximum allowed value");
    }

    format!("Swapped {} {} for {}", amount, from, to)
}

#[derive(CandidType)]
struct SupportedStandard {
    name: String,
    url: String,
}

#[ic_cdk::query]
fn icrc10_supported_standards() -> Vec<SupportedStandard> {
    vec![SupportedStandard {
        name: "ICRC-21".to_string(),
        url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-21/ICRC-21.md".to_string(),
    }]
}
