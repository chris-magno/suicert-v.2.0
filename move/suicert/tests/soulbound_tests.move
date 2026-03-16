/// ============================================================================
/// SUICERT — Complete Move Test Suite
/// Tests every entry function, error path, and business rule.
///
/// Run: sui move test
/// ============================================================================

#[test_only]
module suicert::soulbound_tests {

    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::coin;
    use sui::sui::SUI;
    use suicert::soulbound::{
        Self,
        AdminCap,
        IssuerCap,
        SoulboundCert,
        EventRecord,
        GlobalRegistry,
    };

    // ── Test Addresses ────────────────────────────────────────────────────────
    const ADMIN:   address = @0xAD;
    const ISSUER1: address = @0xA1;
    const ISSUER2: address = @0xA2;
    const USER1:   address = @0xB1;
    const USER2:   address = @0xB2;
    const USER3:   address = @0xB3;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun setup(): Scenario {
        let mut s = ts::begin(ADMIN);
        { soulbound::init_for_testing(ts::ctx(&mut s)); };
        s
    }

    /// Create a shared Clock at timestamp 1_000_000 (seconds).
    fun make_clock(s: &mut Scenario): Clock {
        ts::next_tx(s, ADMIN);
        let mut c = clock::create_for_testing(ts::ctx(s));
        clock::set_for_testing(&mut c, 1_000_000_000); // ms → 1_000_000 seconds
        c
    }

    /// Register ISSUER1 and return the scenario after setup.
    fun setup_with_issuer(s: &mut Scenario, clock: &Clock) {
        ts::next_tx(s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(s);
            let mut reg = ts::take_shared<GlobalRegistry>(s);
            soulbound::register_issuer(
                &admin, &mut reg, clock,
                b"iss_001",
                b"Philippine Blockchain Institute",
                b"contact@pbi.ph",
                94u8,
                ISSUER1,
                ts::ctx(s),
            );
            ts::return_to_sender(s, admin);
            ts::return_shared(reg);
        };
    }

    /// Create an EventRecord (DRAFT) owned by ISSUER1.
    fun setup_event(s: &mut Scenario, clock: &Clock) {
        ts::next_tx(s, ISSUER1);
        {
            let cap    = ts::take_from_sender<IssuerCap>(s);
            let mut reg = ts::take_shared<GlobalRegistry>(s);
            soulbound::create_event(
                &cap, &mut reg, clock,
                b"evt_001",
                b"Intro to Sui Blockchain",
                1_000_000u64,  // start_time
                90u64,         // required_minutes
                0u64,          // max_certs = unlimited
                ts::ctx(s),
            );
            ts::return_to_sender(s, cap);
            ts::return_shared(reg);
        };
    }

    /// Set the shared EventRecord to STATUS_LIVE.
    fun go_live(s: &mut Scenario, clock: &Clock) {
        ts::next_tx(s, ISSUER1);
        {
            let cap = ts::take_from_sender<IssuerCap>(s);
            let mut ev = ts::take_shared<EventRecord>(s);
            soulbound::set_event_status(&cap, &mut ev, clock, soulbound::status_live(), ts::ctx(s));
            ts::return_to_sender(s, cap);
            ts::return_shared(ev);
        };
    }

    /// Mint a cert for `recipient` with 90% attendance.
    fun mint_for(s: &mut Scenario, clock: &Clock, recipient: address) {
        ts::next_tx(s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(s);
            let mut ev  = ts::take_shared<EventRecord>(s);
            let mut reg = ts::take_shared<GlobalRegistry>(s);
            soulbound::mint(
                &admin, &mut ev, &mut reg, clock,
                recipient,
                b"Test User",
                b"iss_001",
                b"ipfs://QmTestHash",
                b"Attended for 81 minutes. All requirements met.",
                81u64,
                90u8,
                ts::ctx(s),
            );
            ts::return_to_sender(s, admin);
            ts::return_shared(ev);
            ts::return_shared(reg);
        };
    }

    // =========================================================================
    // 1. Initialization
    // =========================================================================

    #[test]
    fun test_init_creates_admin_cap_and_registry() {
        let mut s = setup();

        ts::next_tx(&mut s, ADMIN);
        {
            // AdminCap should be in ADMIN's inventory
            let cap = ts::take_from_sender<AdminCap>(&s);
            ts::return_to_sender(&s, cap);

            // GlobalRegistry should be shared
            let reg = ts::take_shared<GlobalRegistry>(&s);
            assert!(soulbound::global_total_certs(&reg) == 0, 0);
            assert!(soulbound::global_total_issuers(&reg) == 0, 1);
            assert!(soulbound::global_total_events(&reg) == 0, 2);
            ts::return_shared(reg);
        };

        ts::end(s);
    }

    // =========================================================================
    // 2. Issuer Registration
    // =========================================================================

    #[test]
    fun test_register_issuer_success() {
        let mut s = setup();
        let clock = make_clock(&mut s);

        setup_with_issuer(&mut s, &clock);

        // ISSUER1 should have the IssuerCap
        ts::next_tx(&mut s, ISSUER1);
        {
            let cap = ts::take_from_sender<IssuerCap>(&s);
            assert!(soulbound::issuer_is_active(&cap), 0);
            assert!(soulbound::issuer_ai_score(&cap) == 94u8, 1);
            ts::return_to_sender(&s, cap);

            // Registry counter incremented
            let reg = ts::take_shared<GlobalRegistry>(&s);
            assert!(soulbound::global_total_issuers(&reg) == 1, 2);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 3. Issuer Deactivation / Reactivation
    // =========================================================================

    #[test]
    fun test_deactivate_and_reactivate_issuer() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);

        // Deactivate
        ts::next_tx(&mut s, ADMIN);
        {
            let admin = ts::take_from_sender<AdminCap>(&s);
            let mut cap = ts::take_from_address<IssuerCap>(&s, ISSUER1);
            soulbound::deactivate_issuer(&admin, &mut cap, &clock, ts::ctx(&mut s));
            assert!(!soulbound::issuer_is_active(&cap), 0);
            ts::return_to_sender(&s, admin);
            ts::return_to_address(ISSUER1, cap);
        };

        // Reactivate
        ts::next_tx(&mut s, ADMIN);
        {
            let admin = ts::take_from_sender<AdminCap>(&s);
            let mut cap = ts::take_from_address<IssuerCap>(&s, ISSUER1);
            soulbound::reactivate_issuer(&admin, &mut cap, ts::ctx(&mut s));
            assert!(soulbound::issuer_is_active(&cap), 1);
            ts::return_to_sender(&s, admin);
            ts::return_to_address(ISSUER1, cap);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EIssuerInactive)]
    fun test_deactivate_already_inactive_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);

        // First deactivation — OK
        ts::next_tx(&mut s, ADMIN);
        {
            let admin = ts::take_from_sender<AdminCap>(&s);
            let mut cap = ts::take_from_address<IssuerCap>(&s, ISSUER1);
            soulbound::deactivate_issuer(&admin, &mut cap, &clock, ts::ctx(&mut s));
            ts::return_to_sender(&s, admin);
            ts::return_to_address(ISSUER1, cap);
        };

        // Second deactivation — must abort EIssuerInactive
        ts::next_tx(&mut s, ADMIN);
        {
            let admin = ts::take_from_sender<AdminCap>(&s);
            let mut cap = ts::take_from_address<IssuerCap>(&s, ISSUER1);
            soulbound::deactivate_issuer(&admin, &mut cap, &clock, ts::ctx(&mut s));
            ts::return_to_sender(&s, admin);
            ts::return_to_address(ISSUER1, cap);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 4. Event Lifecycle
    // =========================================================================

    #[test]
    fun test_create_event_success() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);

        ts::next_tx(&mut s, ISSUER1);
        {
            let ev = ts::take_shared<EventRecord>(&s);
            assert!(soulbound::event_status(&ev) == soulbound::status_draft(), 0);
            assert!(soulbound::event_minted_count(&ev) == 0, 1);
            assert!(soulbound::event_required_minutes(&ev) == 90, 2);
            ts::return_shared(ev);

            let reg = ts::take_shared<GlobalRegistry>(&s);
            assert!(soulbound::global_total_events(&reg) == 1, 3);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    fun test_set_event_status_live_to_ended() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);

        ts::next_tx(&mut s, ISSUER1);
        {
            let ev = ts::take_shared<EventRecord>(&s);
            assert!(soulbound::event_status(&ev) == soulbound::status_live(), 0);
            ts::return_shared(ev);
        };

        // End event
        ts::next_tx(&mut s, ISSUER1);
        {
            let cap = ts::take_from_sender<IssuerCap>(&s);
            let mut ev = ts::take_shared<EventRecord>(&s);
            soulbound::set_event_status(&cap, &mut ev, &clock, soulbound::status_ended(), ts::ctx(&mut s));
            assert!(soulbound::event_status(&ev) == soulbound::status_ended(), 1);
            ts::return_to_sender(&s, cap);
            ts::return_shared(ev);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EIssuerMismatch)]
    fun test_wrong_issuer_cannot_change_event_status() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);

        // Register a second issuer
        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::register_issuer(
                &admin, &mut reg, &clock,
                b"iss_002", b"Fake Org", b"fake@fake.com", 50u8, ISSUER2, ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, admin);
            ts::return_shared(reg);
        };

        // ISSUER2 tries to set ISSUER1's event status — must abort
        ts::next_tx(&mut s, ISSUER2);
        {
            let cap = ts::take_from_sender<IssuerCap>(&s);
            let mut ev = ts::take_shared<EventRecord>(&s);
            soulbound::set_event_status(&cap, &mut ev, &clock, soulbound::status_live(), ts::ctx(&mut s));
            ts::return_to_sender(&s, cap);
            ts::return_shared(ev);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EIssuerInactive)]
    fun test_inactive_issuer_cannot_create_event() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);

        // Deactivate issuer
        ts::next_tx(&mut s, ADMIN);
        {
            let admin = ts::take_from_sender<AdminCap>(&s);
            let mut cap = ts::take_from_address<IssuerCap>(&s, ISSUER1);
            soulbound::deactivate_issuer(&admin, &mut cap, &clock, ts::ctx(&mut s));
            ts::return_to_sender(&s, admin);
            ts::return_to_address(ISSUER1, cap);
        };

        // Inactive issuer tries to create event — must abort
        ts::next_tx(&mut s, ISSUER1);
        {
            let cap = ts::take_from_sender<IssuerCap>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::create_event(
                &cap, &mut reg, &clock,
                b"evt_x", b"Bad Event", 0u64, 60u64, 0u64, ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, cap);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 5. Certificate Minting
    // =========================================================================

    #[test]
    fun test_mint_success() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1);

        // USER1 should hold the cert
        ts::next_tx(&mut s, USER1);
        {
            let cert = ts::take_from_sender<SoulboundCert>(&s);
            assert!(soulbound::is_valid(&cert), 0);
            assert!(soulbound::cert_recipient(&cert) == USER1, 1);
            assert!(soulbound::cert_attendance_pct(&cert) == 90u8, 2);
            assert!(soulbound::cert_attendance_minutes(&cert) == 81, 3);
            assert!(!soulbound::cert_revoked(&cert), 4);
            ts::return_to_sender(&s, cert);
        };

        // Event minted count should be 1
        ts::next_tx(&mut s, ADMIN);
        {
            let ev = ts::take_shared<EventRecord>(&s);
            assert!(soulbound::event_minted_count(&ev) == 1, 5);
            assert!(soulbound::event_has_cert_for(&ev, USER1), 6);
            ts::return_shared(ev);

            let reg = ts::take_shared<GlobalRegistry>(&s);
            assert!(soulbound::global_total_certs(&reg) == 1, 7);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    fun test_mint_multiple_users_same_event() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1);
        mint_for(&mut s, &clock, USER2);
        mint_for(&mut s, &clock, USER3);

        ts::next_tx(&mut s, ADMIN);
        {
            let ev = ts::take_shared<EventRecord>(&s);
            assert!(soulbound::event_minted_count(&ev) == 3, 0);
            assert!(soulbound::event_has_cert_for(&ev, USER1), 1);
            assert!(soulbound::event_has_cert_for(&ev, USER2), 2);
            assert!(soulbound::event_has_cert_for(&ev, USER3), 3);
            ts::return_shared(ev);

            let reg = ts::take_shared<GlobalRegistry>(&s);
            assert!(soulbound::global_total_certs(&reg) == 3, 4);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EEventNotLive)]
    fun test_mint_on_draft_event_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        // Event stays DRAFT — no go_live call

        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut ev  = ts::take_shared<EventRecord>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::mint(
                &admin, &mut ev, &mut reg, &clock,
                USER1, b"User", b"iss_001",
                b"ipfs://x", b"summary", 81u64, 90u8,
                ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, admin);
            ts::return_shared(ev);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EAttendanceInsufficient)]
    fun test_mint_below_attendance_threshold_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);

        // 79% attendance — one below threshold
        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut ev  = ts::take_shared<EventRecord>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::mint(
                &admin, &mut ev, &mut reg, &clock,
                USER1, b"User", b"iss_001",
                b"ipfs://x", b"summary", 71u64, 79u8,
                ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, admin);
            ts::return_shared(ev);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EDuplicateCert)]
    fun test_mint_duplicate_for_same_user_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1); // first mint — OK

        // Second mint for same user — must abort
        mint_for(&mut s, &clock, USER1);

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EEventCapReached)]
    fun test_mint_beyond_max_cap_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);

        // Create event with max_certs = 2
        ts::next_tx(&mut s, ISSUER1);
        {
            let cap    = ts::take_from_sender<IssuerCap>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::create_event(
                &cap, &mut reg, &clock,
                b"evt_cap", b"Capped Event",
                1_000_000u64, 60u64,
                2u64, // max 2 certs
                ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, cap);
            ts::return_shared(reg);
        };

        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1); // 1 of 2 — OK
        mint_for(&mut s, &clock, USER2); // 2 of 2 — OK
        mint_for(&mut s, &clock, USER3); // 3 of 2 — must abort EEventCapReached

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 6. Revocation
    // =========================================================================

    #[test]
    fun test_revoke_certificate() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1);

        // Admin revokes USER1's cert
        ts::next_tx(&mut s, USER1);
        {
            let mut cert = ts::take_from_sender<SoulboundCert>(&s);
            // Admin must sign — switch to ADMIN tx context
            // In test_scenario, we can take objects from any address
            ts::return_to_sender(&s, cert);
        };

        ts::next_tx(&mut s, ADMIN);
        {
            let admin    = ts::take_from_sender<AdminCap>(&s);
            let mut cert = ts::take_from_address<SoulboundCert>(&s, USER1);
            assert!(soulbound::is_valid(&cert), 0); // valid before revoke
            soulbound::revoke(&admin, &mut cert, &clock, ts::ctx(&mut s));
            assert!(!soulbound::is_valid(&cert), 1); // invalid after revoke
            assert!(soulbound::cert_revoked(&cert), 2);
            ts::return_to_sender(&s, admin);
            ts::return_to_address(USER1, cert);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    #[expected_failure(abort_code = suicert::soulbound::EAlreadyRevoked)]
    fun test_double_revoke_fails() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);
        mint_for(&mut s, &clock, USER1);

        // First revoke — OK
        ts::next_tx(&mut s, ADMIN);
        {
            let admin    = ts::take_from_sender<AdminCap>(&s);
            let mut cert = ts::take_from_address<SoulboundCert>(&s, USER1);
            soulbound::revoke(&admin, &mut cert, &clock, ts::ctx(&mut s));
            ts::return_to_sender(&s, admin);
            ts::return_to_address(USER1, cert);
        };

        // Second revoke — must abort EAlreadyRevoked
        ts::next_tx(&mut s, ADMIN);
        {
            let admin    = ts::take_from_sender<AdminCap>(&s);
            let mut cert = ts::take_from_address<SoulboundCert>(&s, USER1);
            soulbound::revoke(&admin, &mut cert, &clock, ts::ctx(&mut s));
            ts::return_to_sender(&s, admin);
            ts::return_to_address(USER1, cert);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 7. Global Config Updates
    // =========================================================================

    #[test]
    fun test_admin_can_update_fees() {
        let mut s = setup();
        let clock = make_clock(&mut s);

        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);

            soulbound::set_cert_fee(&admin, &mut reg, 1_000_000_000u64, ts::ctx(&mut s));
            assert!(soulbound::global_cert_fee(&reg) == 1_000_000_000u64, 0);

            soulbound::set_subscription_fee(&admin, &mut reg, 10_000_000_000u64, ts::ctx(&mut s));
            assert!(soulbound::global_subscription_fee(&reg) == 10_000_000_000u64, 1);

            ts::return_to_sender(&s, admin);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 8. Admin Force-Override Event Status
    // =========================================================================

    #[test]
    fun test_admin_can_cancel_any_event() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);

        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut ev = ts::take_shared<EventRecord>(&s);
            soulbound::admin_set_event_status(
                &admin, &mut ev, &clock,
                soulbound::status_ended(),
                ts::ctx(&mut s),
            );
            assert!(soulbound::event_status(&ev) == soulbound::status_ended(), 0);
            ts::return_to_sender(&s, admin);
            ts::return_shared(ev);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    // =========================================================================
    // 9. Edge Cases
    // =========================================================================

    #[test]
    fun test_exactly_min_attendance_pct_passes() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock);
        go_live(&mut s, &clock);

        // Exactly 80% — boundary condition
        ts::next_tx(&mut s, ADMIN);
        {
            let admin  = ts::take_from_sender<AdminCap>(&s);
            let mut ev  = ts::take_shared<EventRecord>(&s);
            let mut reg = ts::take_shared<GlobalRegistry>(&s);
            soulbound::mint(
                &admin, &mut ev, &mut reg, &clock,
                USER1, b"Boundary User", b"iss_001",
                b"ipfs://boundary", b"Exactly at threshold",
                72u64, // 80% of 90 min
                80u8,  // exactly MIN_ATTENDANCE_PCT
                ts::ctx(&mut s),
            );
            ts::return_to_sender(&s, admin);
            ts::return_shared(ev);
            ts::return_shared(reg);
        };

        ts::next_tx(&mut s, USER1);
        {
            let cert = ts::take_from_sender<SoulboundCert>(&s);
            assert!(soulbound::cert_attendance_pct(&cert) == 80u8, 0);
            assert!(soulbound::is_valid(&cert), 1);
            ts::return_to_sender(&s, cert);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }

    #[test]
    fun test_unlimited_event_can_mint_many() {
        let mut s = setup();
        let clock = make_clock(&mut s);
        setup_with_issuer(&mut s, &clock);
        setup_event(&mut s, &clock); // max_certs = 0 (unlimited)
        go_live(&mut s, &clock);

        // Mint for 3 users without issue
        mint_for(&mut s, &clock, USER1);
        mint_for(&mut s, &clock, USER2);
        mint_for(&mut s, &clock, USER3);

        ts::next_tx(&mut s, ADMIN);
        {
            let ev = ts::take_shared<EventRecord>(&s);
            assert!(soulbound::event_minted_count(&ev) == 3, 0);
            ts::return_shared(ev);
        };

        clock::destroy_for_testing(clock);
        ts::end(s);
    }
}
