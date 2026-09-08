//! parcelguard-authz — the address-change permission decision, executed inside
//! a Terminal 3 TEE.
//!
//! See `wit/world.wit` for what this does and does not prove. In short: the
//! enclave decides, the node records the call tamper-evidently, and the
//! enclave never sees ParcelGuard's database — so it rules on the facts it is
//! handed, and ownership stays the application's job.

#![warn(clippy::style, missing_debug_implementations)]
#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

extern crate alloc;

use alloc::string::String;
use serde::{Deserialize, Serialize};

// Only the wasm build reaches the host bindings, so these are unused on the
// host target where the policy tests run.
#[cfg(target_arch = "wasm32")]
use alloc::{format, string::ToString, vec::Vec};

pub const CONTRACT_VERSION: &str = "0.1.0";

wit_bindgen::generate!({
    world: "parcelguard-authz",
    path: "wit",
    additional_derives: [serde::Deserialize, serde::Serialize],
    generate_all,
});

/// The only order state whose delivery address may still change. Mirrors
/// `requireEditableOrder` in apps/api/src/services/policyService.ts — the two
/// are deliberately the same rule in two places, because the enclave decides
/// and the application still has to refuse before it ever gets here.
const EDITABLE_STATUS: &str = "processing";

#[derive(Debug, Deserialize)]
struct Request {
    order_id: String,
    order_status: String,
    #[serde(default)]
    from_address_ref: String,
    #[serde(default)]
    to_address_ref: String,
    #[serde(default)]
    proposal_id: String,
}

#[derive(Debug, Serialize)]
struct Response {
    decision: &'static str,
    reason_code: &'static str,
    order_id: String,
    proposal_id: String,
    /// Hex of the 20-byte tenant CompactDid the contract ran under.
    tenant_did: String,
    /// Interned id assigned to this contract at registration.
    contract_id: u32,
    /// Store sequence number — the node's audit/replay correlation key.
    seq_no: u64,
    /// Cluster-pinned time, not wall clock.
    decided_at: u64,
    /// Hex of the calling session DID; None on direct `/api/dev/exec` calls.
    calling_did: Option<String>,
}

/// The whole decision, as a pure function so it is testable on the host
/// without an enclave. Returns `(decision, reason_code)`.
fn decide(req: &Request) -> (&'static str, &'static str) {
    if req.to_address_ref.is_empty() {
        return ("denied", "INVALID_REQUEST");
    }
    if req.order_status != EDITABLE_STATUS {
        return ("denied", "ORDER_NOT_EDITABLE");
    }
    if req.from_address_ref == req.to_address_ref {
        return ("denied", "ADDRESS_UNCHANGED");
    }
    ("allowed", "ADDRESS_CHANGE_AUTHORIZED")
}

#[cfg(target_arch = "wasm32")]
fn authorize(input: &[u8]) -> Result<Vec<u8>, String> {
    use host::interfaces::logging;
    use host::tenant::tenant_context as ctx;

    let req: Request =
        serde_json::from_slice(input).map_err(|e| format!("invalid request JSON: {e}"))?;

    let (decision, reason_code) = decide(&req);

    // A denial is a decision, not a fault: it returns Ok so the node records
    // it in the activity ledger as `outcome: success` with a denied payload,
    // rather than as an error that never reached a decision.
    let _ = logging::info(&format!(
        "authorize-address-change {} -> {decision}/{reason_code}",
        req.order_id
    ));

    let response = Response {
        decision,
        reason_code,
        order_id: req.order_id,
        proposal_id: req.proposal_id,
        tenant_did: hex::encode(ctx::tenant_did()),
        contract_id: ctx::contract_id(),
        seq_no: ctx::seq_no(),
        decided_at: ctx::cluster_timestamp_secs(),
        calling_did: ctx::calling_user_did().map(hex::encode),
    };

    serde_json::to_vec(&response).map_err(|e| format!("failed to encode response: {e}"))
}

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::parcelguard_authz::contracts::Guest for Component {
    fn authorize_address_change(
        req: exports::z::parcelguard_authz::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req
            .input
            .ok_or_else(|| "authorize-address-change: missing input".to_string())?;
        authorize(&input)
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::*;

    fn req(status: &str, from: &str, to: &str) -> Request {
        Request {
            order_id: "ORD-1002".into(),
            order_status: status.into(),
            from_address_ref: from.into(),
            to_address_ref: to.into(),
            proposal_id: "prop_test".into(),
        }
    }

    #[test]
    fn allows_a_real_move_on_a_processing_order() {
        assert_eq!(
            decide(&req("processing", "addr_home", "addr_office")),
            ("allowed", "ADDRESS_CHANGE_AUTHORIZED")
        );
    }

    #[test]
    fn refuses_every_status_but_processing() {
        for status in ["shipped", "delivered"] {
            assert_eq!(
                decide(&req(status, "addr_home", "addr_office")),
                ("denied", "ORDER_NOT_EDITABLE"),
                "{status} must not be editable"
            );
        }
    }

    #[test]
    fn refuses_a_move_that_changes_nothing() {
        assert_eq!(
            decide(&req("processing", "addr_home", "addr_home")),
            ("denied", "ADDRESS_UNCHANGED")
        );
    }

    #[test]
    fn refuses_a_missing_target() {
        assert_eq!(
            decide(&req("processing", "addr_home", "")),
            ("denied", "INVALID_REQUEST")
        );
    }

    #[test]
    fn an_unknown_status_is_not_editable() {
        // Fail closed: a status the enclave does not recognise is refused,
        // never waved through.
        assert_eq!(
            decide(&req("cancelled", "addr_home", "addr_office")),
            ("denied", "ORDER_NOT_EDITABLE")
        );
    }
}
