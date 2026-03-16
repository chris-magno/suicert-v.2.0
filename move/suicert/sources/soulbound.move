/// ============================================================================
/// SUICERT — Soulbound Token (SBT) Smart Contract
/// Author:  Chris Magno Javillonar
/// Version: 2026.1.0
/// Network: Sui Testnet / Mainnet
/// ============================================================================

#[allow(duplicate_alias, unused_const, lint(public_entry), unused_variable)]
module suicert::soulbound {

    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use std::vector;

    // ── Error Codes ───────────────────────────────────────────────────────────
    const EAlreadyRevoked: u64         = 1;
    const EIssuerInactive: u64         = 3;
    const EDuplicateCert: u64          = 4;
    const EEventNotLive: u64           = 5;
    const EAttendanceInsufficient: u64 = 6;
    const EInsufficientPayment: u64    = 7;
    const EEventCapReached: u64        = 8;
    const EIssuerMismatch: u64         = 9;
    const EStringTooLong: u64          = 10;

    // ── Constants ─────────────────────────────────────────────────────────────
    const MIN_ATTENDANCE_PCT: u8      = 80;
    const SUBSCRIPTION_FEE_MIST: u64 = 5_000_000_000;
    const CERT_FEE_MIST: u64         = 500_000_000;
    const MAX_STRING_LEN: u64        = 512;
    const NO_CAP: u64                = 0;

    // ── Event Status Codes ────────────────────────────────────────────────────
    const STATUS_DRAFT: u8     = 0;
    const STATUS_LIVE: u8      = 1;
    const STATUS_ENDED: u8     = 2;
    const STATUS_CANCELLED: u8 = 3;

    // ── Structs ───────────────────────────────────────────────────────────────

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct IssuerCap has key, store {
        id: UID,
        issuer_id: String,
        org_name: String,
        email: String,
        ai_score: u8,
        issued_at: u64,
        active: bool,
    }

    /// Soulbound Certificate — `key` only, NO `store` — non-transferable forever.
    public struct SoulboundCert has key {
        id: UID,
        event_record_id: ID,
        event_id: String,
        recipient: address,
        recipient_name: String,
        issuer_name: String,
        issuer_id: String,
        event_title: String,
        metadata_uri: String,
        issued_at: u64,
        attendance_minutes: u64,
        attendance_pct: u8,
        ai_summary: String,
        revoked: bool,
        supersedes: Option<ID>,
    }

    public struct EventRecord has key {
        id: UID,
        event_id: String,
        issuer_cap_id: ID,
        issuer_name: String,
        title: String,
        start_time: u64,
        required_minutes: u64,
        status: u8,
        minted_count: u64,
        max_certs: u64,
        issued_to: Table<address, ID>,
    }

    public struct GlobalRegistry has key {
        id: UID,
        total_certs_minted: u64,
        total_issuers: u64,
        total_events: u64,
        treasury_balance: u64,
        cert_fee: u64,
        subscription_fee: u64,
    }

    // ── Emitted Events ────────────────────────────────────────────────────────

    public struct CertMinted has copy, drop {
        cert_id: ID,
        event_record_id: ID,
        event_id: String,
        recipient: address,
        recipient_name: String,
        issuer_name: String,
        attendance_pct: u8,
        issued_at: u64,
    }

    public struct CertRevoked has copy, drop {
        cert_id: ID,
        event_id: String,
        recipient: address,
        revoked_by: address,
        revoked_at: u64,
    }

    public struct IssuerRegistered has copy, drop {
        issuer_cap_id: ID,
        issuer_id: String,
        org_name: String,
        ai_score: u8,
        registered_at: u64,
    }

    public struct IssuerDeactivated has copy, drop {
        issuer_cap_id: ID,
        issuer_id: String,
        deactivated_at: u64,
    }

    public struct EventCreated has copy, drop {
        event_record_id: ID,
        event_id: String,
        issuer_id: String,
        title: String,
        required_minutes: u64,
        created_at: u64,
    }

    public struct EventStatusChanged has copy, drop {
        event_record_id: ID,
        event_id: String,
        old_status: u8,
        new_status: u8,
        changed_at: u64,
    }

    public struct SubscriptionPaid has copy, drop {
        issuer_cap_id: ID,
        issuer_id: String,
        amount_mist: u64,
        paid_at: u64,
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
        transfer::share_object(GlobalRegistry {
            id: object::new(ctx),
            total_certs_minted: 0,
            total_issuers: 0,
            total_events: 0,
            treasury_balance: 0,
            cert_fee: CERT_FEE_MIST,
            subscription_fee: SUBSCRIPTION_FEE_MIST,
        });
    }

    // ── Admin: Issuer Management ──────────────────────────────────────────────

    public entry fun register_issuer(
        _admin: &AdminCap,
        registry: &mut GlobalRegistry,
        clock: &Clock,
        issuer_id: vector<u8>,
        org_name: vector<u8>,
        email: vector<u8>,
        ai_score: u8,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        assert_string_len(&issuer_id);
        assert_string_len(&org_name);
        assert_string_len(&email);

        let now = clock::timestamp_ms(clock) / 1000;
        let issuer_cap = IssuerCap {
            id: object::new(ctx),
            issuer_id: string::utf8(issuer_id),
            org_name: string::utf8(org_name),
            email: string::utf8(email),
            ai_score,
            issued_at: now,
            active: true,
        };
        let cap_id = object::id(&issuer_cap);
        event::emit(IssuerRegistered {
            issuer_cap_id: cap_id,
            issuer_id: string::utf8(issuer_id),
            org_name: string::utf8(org_name),
            ai_score,
            registered_at: now,
        });
        registry.total_issuers = registry.total_issuers + 1;
        transfer::transfer(issuer_cap, recipient);
    }

    public entry fun deactivate_issuer(
        _admin: &AdminCap,
        issuer_cap: &mut IssuerCap,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(issuer_cap.active, EIssuerInactive);
        issuer_cap.active = false;
        let now = clock::timestamp_ms(clock) / 1000;
        event::emit(IssuerDeactivated {
            issuer_cap_id: object::id(issuer_cap),
            issuer_id: issuer_cap.issuer_id,
            deactivated_at: now,
        });
    }

    public entry fun reactivate_issuer(
        _admin: &AdminCap,
        issuer_cap: &mut IssuerCap,
        _ctx: &mut TxContext,
    ) {
        issuer_cap.active = true;
    }

    // ── Subscription Payment ──────────────────────────────────────────────────

    public entry fun pay_subscription(
        issuer_cap: &mut IssuerCap,
        registry: &mut GlobalRegistry,
        clock: &Clock,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount >= registry.subscription_fee, EInsufficientPayment);
        let now = clock::timestamp_ms(clock) / 1000;
        registry.treasury_balance = registry.treasury_balance + amount;
        issuer_cap.active = true;
        transfer::public_transfer(payment, tx_context::sender(ctx));
        event::emit(SubscriptionPaid {
            issuer_cap_id: object::id(issuer_cap),
            issuer_id: issuer_cap.issuer_id,
            amount_mist: amount,
            paid_at: now,
        });
    }

    // ── Event Management ──────────────────────────────────────────────────────

    public entry fun create_event(
        issuer_cap: &IssuerCap,
        registry: &mut GlobalRegistry,
        clock: &Clock,
        event_id: vector<u8>,
        title: vector<u8>,
        start_time: u64,
        required_minutes: u64,
        max_certs: u64,
        ctx: &mut TxContext,
    ) {
        assert!(issuer_cap.active, EIssuerInactive);
        assert_string_len(&event_id);
        assert_string_len(&title);

        let now = clock::timestamp_ms(clock) / 1000;
        let event_record = EventRecord {
            id: object::new(ctx),
            event_id: string::utf8(event_id),
            issuer_cap_id: object::id(issuer_cap),
            issuer_name: issuer_cap.org_name,
            title: string::utf8(title),
            start_time,
            required_minutes,
            status: STATUS_DRAFT,
            minted_count: 0,
            max_certs,
            issued_to: table::new(ctx),
        };
        let record_id = object::id(&event_record);
        event::emit(EventCreated {
            event_record_id: record_id,
            event_id: string::utf8(event_id),
            issuer_id: issuer_cap.issuer_id,
            title: string::utf8(title),
            required_minutes,
            created_at: now,
        });
        registry.total_events = registry.total_events + 1;
        transfer::share_object(event_record);
    }

    public entry fun set_event_status(
        issuer_cap: &IssuerCap,
        event_record: &mut EventRecord,
        clock: &Clock,
        new_status: u8,
        _ctx: &mut TxContext,
    ) {
        assert!(issuer_cap.active, EIssuerInactive);
        assert!(object::id(issuer_cap) == event_record.issuer_cap_id, EIssuerMismatch);
        let now = clock::timestamp_ms(clock) / 1000;
        let old = event_record.status;
        event_record.status = new_status;
        event::emit(EventStatusChanged {
            event_record_id: object::id(event_record),
            event_id: event_record.event_id,
            old_status: old,
            new_status,
            changed_at: now,
        });
    }

    public entry fun admin_set_event_status(
        _admin: &AdminCap,
        event_record: &mut EventRecord,
        clock: &Clock,
        new_status: u8,
        _ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock) / 1000;
        let old = event_record.status;
        event_record.status = new_status;
        event::emit(EventStatusChanged {
            event_record_id: object::id(event_record),
            event_id: event_record.event_id,
            old_status: old,
            new_status,
            changed_at: now,
        });
    }

    // ── Mint ──────────────────────────────────────────────────────────────────

    public entry fun mint(
        _admin: &AdminCap,
        event_record: &mut EventRecord,
        registry: &mut GlobalRegistry,
        clock: &Clock,
        recipient: address,
        recipient_name: vector<u8>,
        issuer_id: vector<u8>,
        metadata_uri: vector<u8>,
        ai_summary: vector<u8>,
        attendance_minutes: u64,
        attendance_pct: u8,
        ctx: &mut TxContext,
    ) {
        assert!(event_record.status == STATUS_LIVE, EEventNotLive);
        assert!(attendance_pct >= MIN_ATTENDANCE_PCT, EAttendanceInsufficient);
        assert!(!table::contains(&event_record.issued_to, recipient), EDuplicateCert);
        if (event_record.max_certs != NO_CAP) {
            assert!(event_record.minted_count < event_record.max_certs, EEventCapReached);
        };
        assert_string_len(&metadata_uri);
        assert_string_len(&ai_summary);
        assert_string_len(&recipient_name);

        let now = clock::timestamp_ms(clock) / 1000;
        let cert = SoulboundCert {
            id: object::new(ctx),
            event_record_id: object::id(event_record),
            event_id: event_record.event_id,
            recipient,
            recipient_name: string::utf8(recipient_name),
            issuer_name: event_record.issuer_name,
            issuer_id: string::utf8(issuer_id),
            event_title: event_record.title,
            metadata_uri: string::utf8(metadata_uri),
            issued_at: now,
            attendance_minutes,
            attendance_pct,
            ai_summary: string::utf8(ai_summary),
            revoked: false,
            supersedes: option::none(),
        };
        let cert_id = object::id(&cert);
        table::add(&mut event_record.issued_to, recipient, cert_id);
        event_record.minted_count = event_record.minted_count + 1;
        registry.total_certs_minted = registry.total_certs_minted + 1;
        event::emit(CertMinted {
            cert_id,
            event_record_id: object::id(event_record),
            event_id: event_record.event_id,
            recipient,
            recipient_name: string::utf8(recipient_name),
            issuer_name: event_record.issuer_name,
            attendance_pct,
            issued_at: now,
        });
        transfer::transfer(cert, recipient);
    }

    // ── Revocation ────────────────────────────────────────────────────────────

    public entry fun revoke(
        _admin: &AdminCap,
        cert: &mut SoulboundCert,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!cert.revoked, EAlreadyRevoked);
        cert.revoked = true;
        let now = clock::timestamp_ms(clock) / 1000;
        event::emit(CertRevoked {
            cert_id: object::id(cert),
            event_id: cert.event_id,
            recipient: cert.recipient,
            revoked_by: tx_context::sender(ctx),
            revoked_at: now,
        });
    }

    // ── Config ────────────────────────────────────────────────────────────────

    public entry fun set_cert_fee(
        _admin: &AdminCap,
        registry: &mut GlobalRegistry,
        new_fee: u64,
        _ctx: &mut TxContext,
    ) {
        registry.cert_fee = new_fee;
    }

    public entry fun set_subscription_fee(
        _admin: &AdminCap,
        registry: &mut GlobalRegistry,
        new_fee: u64,
        _ctx: &mut TxContext,
    ) {
        registry.subscription_fee = new_fee;
    }

    // ── View Functions ────────────────────────────────────────────────────────

    public fun is_valid(cert: &SoulboundCert): bool                { !cert.revoked }
    public fun cert_recipient(cert: &SoulboundCert): address        { cert.recipient }
    public fun cert_recipient_name(cert: &SoulboundCert): &String   { &cert.recipient_name }
    public fun cert_event_id(cert: &SoulboundCert): &String         { &cert.event_id }
    public fun cert_event_title(cert: &SoulboundCert): &String      { &cert.event_title }
    public fun cert_issuer_name(cert: &SoulboundCert): &String      { &cert.issuer_name }
    public fun cert_metadata_uri(cert: &SoulboundCert): &String     { &cert.metadata_uri }
    public fun cert_ai_summary(cert: &SoulboundCert): &String       { &cert.ai_summary }
    public fun cert_issued_at(cert: &SoulboundCert): u64            { cert.issued_at }
    public fun cert_attendance_pct(cert: &SoulboundCert): u8        { cert.attendance_pct }
    public fun cert_attendance_minutes(cert: &SoulboundCert): u64   { cert.attendance_minutes }
    public fun cert_revoked(cert: &SoulboundCert): bool             { cert.revoked }

    public fun event_minted_count(r: &EventRecord): u64             { r.minted_count }
    public fun event_status(r: &EventRecord): u8                    { r.status }
    public fun event_title(r: &EventRecord): &String                { &r.title }
    public fun event_required_minutes(r: &EventRecord): u64         { r.required_minutes }
    public fun event_has_cert_for(r: &EventRecord, addr: address): bool {
        table::contains(&r.issued_to, addr)
    }

    public fun global_total_certs(reg: &GlobalRegistry): u64        { reg.total_certs_minted }
    public fun global_total_issuers(reg: &GlobalRegistry): u64      { reg.total_issuers }
    public fun global_total_events(reg: &GlobalRegistry): u64       { reg.total_events }
    public fun global_cert_fee(reg: &GlobalRegistry): u64           { reg.cert_fee }
    public fun global_subscription_fee(reg: &GlobalRegistry): u64   { reg.subscription_fee }

    public fun issuer_is_active(cap: &IssuerCap): bool              { cap.active }
    public fun issuer_ai_score(cap: &IssuerCap): u8                 { cap.ai_score }
    public fun issuer_org_name(cap: &IssuerCap): &String            { &cap.org_name }
    public fun issuer_id(cap: &IssuerCap): &String                  { &cap.issuer_id }

    // ── Internal ──────────────────────────────────────────────────────────────

    fun assert_string_len(s: &vector<u8>) {
        assert!(vector::length(s) <= MAX_STRING_LEN, EStringTooLong);
    }

    // ── Test-only ─────────────────────────────────────────────────────────────

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

    #[test_only] public fun status_live(): u8                  { STATUS_LIVE }
    #[test_only] public fun status_draft(): u8                 { STATUS_DRAFT }
    #[test_only] public fun status_ended(): u8                 { STATUS_ENDED }
    #[test_only] public fun status_cancelled(): u8             { STATUS_CANCELLED }
    #[test_only] public fun min_attendance_pct(): u8           { MIN_ATTENDANCE_PCT }
    #[test_only] public fun err_already_revoked(): u64         { EAlreadyRevoked }
    #[test_only] public fun err_duplicate_cert(): u64          { EDuplicateCert }
    #[test_only] public fun err_event_not_live(): u64          { EEventNotLive }
    #[test_only] public fun err_attendance_insufficient(): u64 { EAttendanceInsufficient }
    #[test_only] public fun err_issuer_inactive(): u64         { EIssuerInactive }
    #[test_only] public fun err_event_cap_reached(): u64       { EEventCapReached }
}
