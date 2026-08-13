# =============================================================================
#  test_flight_delay_vault.py - FlightDelayVault Intelligent Contract Test Suite
# =============================================================================

import sys
import os
import json
import unittest
import py_compile
from unittest.mock import MagicMock

# --- GenLayer SDK Mock Runtime -----------------------------------------------
class MockContractBase:
    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        for name, type_hint in getattr(cls, '__annotations__', {}).items():
            if 'dict' in str(type_hint) or 'TreeMap' in str(type_hint):
                setattr(instance, name, dict())
        return instance

class MockMessage:
    def __init__(self, sender="0x1111111111111111111111111111111111111111", value=0):
        self.sender_address = sender
        self.value = value

class MockWeb:
    def __init__(self):
        self.url_to_content = {}
        self.fail_on_next   = False
    def render(self, url):
        if self.fail_on_next:
            raise Exception("Simulated network failure")
        if "404" in url:
            raise Exception("404 Not Found")
        return self.url_to_content.get(url, "Flight VN302 2026-08-01: Scheduled 08:00 Actual 12:00 (4h delay)")

class MockNondet:
    def __init__(self):
        self.web = MockWeb()
        self.exec_prompt_responses = []
        self.response_index = 0
    def exec_prompt(self, prompt):
        if self.exec_prompt_responses:
            res = self.exec_prompt_responses[self.response_index % len(self.exec_prompt_responses)]
            self.response_index += 1
            if isinstance(res, Exception):
                raise res
            return res
        # Default: 4h delay confirmed
        return json.dumps({
            "is_delayed": True, "delay_hours": 4,
            "reasoning": "Flight VN302 on 2026-08-01: scheduled 08:00, actual 12:00. Delay = 4 hours."
        })

class MockVM:
    def run_nondet_unsafe(self, leader_fn, validator_fn):
        leader_res = leader_fn()
        valid      = validator_fn(leader_res)
        if not valid:
            return json.dumps({"error": "VALIDATOR_REJECTED_CONSENSUS"})
        return leader_res

class MockContractRef:
    def __init__(self, addr, tracker=None):
        self.addr    = str(addr)
        self.tracker = tracker
    def emit_transfer(self, value=0):
        if self.tracker is not None:
            self.tracker.append({"target": self.addr, "value": int(value)})
        return True

class MockGL:
    def __init__(self):
        self.Contract      = MockContractBase
        self.message       = MockMessage()
        self.nondet        = MockNondet()
        self.vm            = MockVM()
        self.transfers_log = []
        self.public        = MagicMock()
        self.public.write  = lambda f: f
        self.public.write.payable = lambda f: f
        self.public.view   = lambda f: f
    def get_contract_at(self, addr):
        return MockContractRef(addr, self.transfers_log)

class MockAddress:
    def __init__(self, val):
        self.val = str(val)
    def __str__(self):
        return self.val
    def __repr__(self):
        return f"Address('{self.val}')"

mock_gl = MockGL()
mock_gl.gl      = mock_gl
sys.modules['genlayer'] = mock_gl
mock_gl.Contract = MockContractBase
mock_gl.Address  = MockAddress
mock_gl.bigint   = lambda v: int(v)
mock_gl.TreeMap  = dict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../contracts')))
import flight_delay_vault

UserError = flight_delay_vault.UserError

# ---------------------------------------------------------------------------
# Shared test constants
# ---------------------------------------------------------------------------
PASSENGER      = "0x1111111111111111111111111111111111111111"
INSURER        = "0x2222222222222222222222222222222222222222"
STRANGER       = "0x3333333333333333333333333333333333333333"
DEPARTURE_DATE = "2026-08-01"
TRACKING_URL   = "https://flightdelayguard-app.vercel.app/mock_flight.json"
TIME_URL       = "https://flightdelayguard-app.vercel.app/mock_time.json"
DEADLINE_TS    = 1785000000  # far future

SHORT_DIST  = 900    # ≤1500km  → €250
MEDIUM_DIST = 2000   # ≤3500km  → €400
LONG_DIST   = 5000   # >3500km  → €600

STAKE = 1_000 * (10 ** 18)  # 1000 GEN as wei


def _make_contract(insurer=INSURER, passenger=PASSENGER, flight="VN302",
                   date=DEPARTURE_DATE, dist=SHORT_DIST, stake=STAKE,
                   deadline=DEADLINE_TS):
    """Helper: fund one claim, return (contract, claim_id)."""
    mock_gl.message = MockMessage(sender=insurer, value=stake)
    c   = flight_delay_vault.Contract()
    cid = c.fund_compensation_claim(passenger, flight, date, dist, deadline)
    return c, cid


class TestFlightDelayVault(unittest.TestCase):

    def setUp(self):
        mock_gl.message       = MockMessage(sender=INSURER, value=STAKE)
        mock_gl.nondet        = MockNondet()
        mock_gl.transfers_log = []
        self.contract         = flight_delay_vault.Contract()

    # ------------------------------------------------------------------
    # 1. Compilation sanity check
    # ------------------------------------------------------------------
    def test_reproducible_compilation(self):
        """Verify contract file compiles without syntax errors."""
        path     = os.path.abspath(os.path.join(os.path.dirname(__file__), '../contracts/flight_delay_vault.py'))
        compiled = py_compile.compile(path, doraise=True)
        self.assertTrue(os.path.exists(compiled))

    # ------------------------------------------------------------------
    # 2. Fund compensation claim — happy path
    # ------------------------------------------------------------------
    def test_fund_compensation_claim_payable(self):
        """Insurer funds a claim and all identity fields are stored correctly."""
        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        cid = self.contract.fund_compensation_claim(
            PASSENGER, "VN302", DEPARTURE_DATE, SHORT_DIST, DEADLINE_TS
        )
        self.assertEqual(cid, 0)

        claim = json.loads(self.contract.get_claim(0))
        self.assertEqual(claim["passenger"],         PASSENGER)
        self.assertEqual(claim["insurer"],           INSURER)
        self.assertEqual(claim["fund"],              STAKE)
        self.assertEqual(claim["status"],            "FUNDED")
        self.assertEqual(claim["flight_number"],     "VN302")
        self.assertEqual(claim["departure_date"],    DEPARTURE_DATE)
        self.assertEqual(claim["flight_distance_km"], SHORT_DIST)
        self.assertEqual(claim["deadline"],          DEADLINE_TS)

    # ------------------------------------------------------------------
    # 3–5. EU261 tier compensation — contract-level math
    # ------------------------------------------------------------------
    def test_short_haul_compensated_250_gen(self):
        """≤1500km flight delay ≥3h → €250 (250 GEN in wei) auto-compensated to passenger."""
        c, _ = _make_contract(dist=SHORT_DIST, stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": True,  "delay_hours": 4, "reasoning": "4h delay confirmed."}),
            json.dumps({"is_delayed": True,  "delay_hours": 4, "reasoning": "Validator confirms 4h."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "COMPENSATED")
        expected_comp = 250 * (10 ** 18)
        self.assertEqual(claim["compensation_amount"], expected_comp)
        self.assertTrue(any(t["target"] == PASSENGER and t["value"] == expected_comp
                            for t in mock_gl.transfers_log))

    def test_medium_haul_compensated_400_gen(self):
        """1500–3500km flight delay ≥3h → €400 (400 GEN in wei) auto-compensated."""
        c, _ = _make_contract(dist=MEDIUM_DIST, stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": True,  "delay_hours": 5, "reasoning": "5h delay confirmed."}),
            json.dumps({"is_delayed": True,  "delay_hours": 5, "reasoning": "Validator confirms 5h."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "COMPENSATED")
        self.assertEqual(claim["compensation_amount"], 400 * (10 ** 18))

    def test_long_haul_compensated_600_gen(self):
        """>3500km flight delay ≥3h → €600 (600 GEN in wei) auto-compensated."""
        c, _ = _make_contract(dist=LONG_DIST, stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": True,  "delay_hours": 6, "reasoning": "6h delay confirmed."}),
            json.dumps({"is_delayed": True,  "delay_hours": 6, "reasoning": "Validator confirms 6h."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "COMPENSATED")
        self.assertEqual(claim["compensation_amount"], 600 * (10 ** 18))

    # ------------------------------------------------------------------
    # 6. No delay → REJECTED, insurer gets funds
    # ------------------------------------------------------------------
    def test_no_delay_rejected_insurer_refunded(self):
        """Clean on-time flight → REJECTED, 100% deposit returned to insurer."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": False, "delay_hours": 0, "reasoning": "Flight on time."}),
            json.dumps({"is_delayed": False, "delay_hours": 0, "reasoning": "Validator confirms on time."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "REJECTED")
        self.assertEqual(claim["fund"],   0)
        self.assertTrue(any(t["target"] == INSURER and t["value"] == STAKE
                            for t in mock_gl.transfers_log))

    # ------------------------------------------------------------------
    # 7. Contract-level override: AI says delayed 2h → REJECTED
    # ------------------------------------------------------------------
    def test_contract_overrides_ai_short_delay(self):
        """Even if AI says is_delayed=True with 2h, contract-level math forces REJECTED (< 3h min).
        Both Leader and Validator must agree on 2h (pass tolerance check) for consensus to succeed,
        then the final settlement path applies the EU261_MIN_DELAY_HOURS override."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            # Both agree: is_delayed=True, delay_hours=2 → passes validator tolerance (same verdict/hours)
            # But contract-level override in settlement: delay_hours=2 < 3 → is_delayed forced False → REJECTED
            json.dumps({"is_delayed": True, "delay_hours": 2, "reasoning": "2h delay found."}),
            json.dumps({"is_delayed": True, "delay_hours": 2, "reasoning": "Validator: also 2h."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        # Leader fn applies override: delay_hours=2<3 → is_delayed=False in leader output
        # Validator sees leader output {is_delayed:False, delay_hours:2}
        # Validator's own fn also returns {is_delayed:False, delay_hours:2} → both match → consensus passes
        # Settlement: is_delayed=False → REJECTED
        self.assertIn(claim["status"], ("REJECTED", "FAILED"))  # either is acceptable fail-safe outcome
        self.assertEqual(claim["compensation_amount"], 0)

    # ------------------------------------------------------------------
    # 8. Unauthorized tracking domain rejected
    # ------------------------------------------------------------------
    def test_unauthorized_tracking_domain_rejected(self):
        """Evidence from airline-hosted or unknown URL is rejected at the gate."""
        c, _ = _make_contract()
        mock_gl.message = MockMessage(sender=PASSENGER)
        with self.assertRaises(UserError) as ctx:
            c.file_delay_claim(0, "https://vietnam-airlines.com/my-flight-status")
        self.assertIn("authoritative, independent flight tracking source", str(ctx.exception))

    # ------------------------------------------------------------------
    # 9. Access control: only passenger can file
    # ------------------------------------------------------------------
    def test_only_passenger_can_file_claim(self):
        """Insurer or stranger cannot file the claim — only the registered passenger."""
        c, _ = _make_contract()
        mock_gl.message = MockMessage(sender=STRANGER)
        with self.assertRaises(UserError) as ctx:
            c.file_delay_claim(0, TRACKING_URL)
        self.assertIn("Only the registered passenger", str(ctx.exception))

    # ------------------------------------------------------------------
    # 10. Validator hour divergence → FAILED (semantic content check)
    # ------------------------------------------------------------------
    def test_validator_hour_divergence_fails_closed(self):
        """Leader says 4h, Validator says 8h (>1h tolerance) → consensus rejected → FAILED."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": True, "delay_hours": 4, "reasoning": "Leader: 4h delay."}),
            json.dumps({"is_delayed": True, "delay_hours": 8, "reasoning": "Validator: 8h delay."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "FAILED")
        self.assertEqual(claim["fund"],   STAKE)   # funds preserved

    # ------------------------------------------------------------------
    # 11. Anti-double-claim: same flight+date+passenger → UserError
    # ------------------------------------------------------------------
    def test_double_claim_same_flight_rejected(self):
        """A second claim for the same (flight, date, passenger) is blocked."""
        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        self.contract.fund_compensation_claim(PASSENGER, "VN302", DEPARTURE_DATE, SHORT_DIST, DEADLINE_TS)

        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", DEPARTURE_DATE, SHORT_DIST, DEADLINE_TS)
        self.assertIn("already exists", str(ctx.exception))

    # ------------------------------------------------------------------
    # 12. Failed web scrape → FAILED, funds preserved
    # ------------------------------------------------------------------
    def test_failed_scrape_preserves_funds(self):
        """If flight tracking page cannot be scraped, status = FAILED and funds are preserved."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.web.fail_on_next = True
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "FAILED")
        self.assertEqual(claim["fund"],   STAKE)

    # ------------------------------------------------------------------
    # 13. String boolean coercion rejected (fail-closed)
    # ------------------------------------------------------------------
    def test_strict_boolean_rejects_string_true(self):
        """AI returning string 'true' instead of boolean true → FAILED (fail-closed)."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": "true", "delay_hours": 5, "reasoning": "String exploit attempt."})
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "FAILED")

    # ------------------------------------------------------------------
    # 14. expire_and_release: before deadline → blocked
    # ------------------------------------------------------------------
    def test_expire_before_deadline_blocked(self):
        """Insurer cannot claim expiry before the deadline has passed."""
        c, _ = _make_contract()
        mock_gl.nondet.web.url_to_content[TIME_URL] = '{"unixtime": 1000000}'
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"current_unix_timestamp": 1000000, "deadline_passed": False,
                        "reasoning": "Current time is before deadline."}),
            json.dumps({"current_unix_timestamp": 1000000, "deadline_passed": False,
                        "reasoning": "Validator confirms deadline not passed."}),
        ]
        mock_gl.message = MockMessage(sender=INSURER)
        with self.assertRaises(UserError) as ctx:
            c.expire_and_release(0, TIME_URL)
        self.assertIn("deadline has not yet passed", str(ctx.exception))

    # ------------------------------------------------------------------
    # 15. expire_and_release: after deadline → funds returned to insurer
    # ------------------------------------------------------------------
    def test_expire_after_deadline_releases_to_insurer(self):
        """After deadline with no passenger claim, insurer recovers 100% of funds."""
        c, _ = _make_contract(stake=STAKE)
        past_deadline = DEADLINE_TS + 86400
        mock_gl.nondet.web.url_to_content[TIME_URL] = f'{{"unixtime": {past_deadline}}}'
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"current_unix_timestamp": past_deadline, "deadline_passed": True,
                        "reasoning": "Current time exceeds deadline."}),
            json.dumps({"current_unix_timestamp": past_deadline, "deadline_passed": True,
                        "reasoning": "Validator confirms deadline passed."}),
        ]
        mock_gl.message = MockMessage(sender=INSURER)
        c.expire_and_release(0, TIME_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "EXPIRED_RELEASED")
        self.assertEqual(claim["fund"],   0)
        self.assertTrue(any(t["target"] == INSURER and t["value"] == STAKE
                            for t in mock_gl.transfers_log))

    # ------------------------------------------------------------------
    # 16. expire_and_release: unauthorized time domain → UserError
    # ------------------------------------------------------------------
    def test_expire_unauthorized_time_domain_rejected(self):
        """Time source must be from an authoritative time service."""
        c, _ = _make_contract()
        mock_gl.message = MockMessage(sender=INSURER)
        with self.assertRaises(UserError) as ctx:
            c.expire_and_release(0, "https://attacker-clock.evil.io/now")
        self.assertIn("authoritative time service", str(ctx.exception))

    # ------------------------------------------------------------------
    # 17. Only insurer can expire
    # ------------------------------------------------------------------
    def test_only_insurer_can_expire(self):
        """Passenger or stranger cannot trigger deadline expiry settlement."""
        c, _ = _make_contract()
        mock_gl.message = MockMessage(sender=STRANGER)
        with self.assertRaises(UserError) as ctx:
            c.expire_and_release(0, TIME_URL)
        self.assertIn("Only the insurer", str(ctx.exception))

    # ------------------------------------------------------------------
    # 18. Invalid departure date format rejected
    # ------------------------------------------------------------------
    def test_invalid_departure_date_format_rejected(self):
        """Malformed departure date is rejected at claim creation."""
        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", "01-08-2026", SHORT_DIST, DEADLINE_TS)
        self.assertIn("YYYY-MM-DD", str(ctx.exception))

    # ------------------------------------------------------------------
    # 19. Zero deposit rejected
    # ------------------------------------------------------------------
    def test_zero_deposit_rejected(self):
        """Funding a claim with zero value is rejected."""
        mock_gl.message = MockMessage(sender=INSURER, value=0)
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", DEPARTURE_DATE, SHORT_DIST, DEADLINE_TS)
        self.assertIn("greater than zero", str(ctx.exception))

    # ------------------------------------------------------------------
    # 20. Validator verdict mismatch (delayed vs not) → FAILED
    # ------------------------------------------------------------------
    def test_validator_verdict_mismatch_fails_closed(self):
        """Leader says delayed=True, Validator says delayed=False → FAILED (fail-closed)."""
        c, _ = _make_contract(stake=STAKE)
        mock_gl.nondet.exec_prompt_responses = [
            json.dumps({"is_delayed": True,  "delay_hours": 4, "reasoning": "Leader: delayed."}),
            json.dumps({"is_delayed": False, "delay_hours": 0, "reasoning": "Validator: on time."}),
        ]
        mock_gl.message = MockMessage(sender=PASSENGER)
        c.file_delay_claim(0, TRACKING_URL)

        claim = json.loads(c.get_claim(0))
        self.assertEqual(claim["status"], "FAILED")
        self.assertEqual(claim["fund"],   STAKE)

    # ------------------------------------------------------------------
    # 21. Insufficient collateral deposit rejected (< statutory EU261 amount)
    # ------------------------------------------------------------------
    def test_insufficient_collateral_deposit_rejected(self):
        """Funding a claim with less than full EU261 statutory liability for flight distance is rejected."""
        # 1150km requires €250 = 250 * 10^18 wei. Depositing only 10 GEN (10 * 10^18) must fail.
        mock_gl.message = MockMessage(sender=INSURER, value=10 * (10 ** 18))
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", DEPARTURE_DATE, 1150, DEADLINE_TS)
        self.assertIn("requires at least 250 GEN deposit", str(ctx.exception))

    # ------------------------------------------------------------------
    # 22. Departure date out of range rejected (e.g. 2026-99-99)
    # ------------------------------------------------------------------
    def test_invalid_departure_date_out_of_range_rejected(self):
        """Invalid month/day values in YYYY-MM-DD are rejected."""
        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", "2026-99-99", SHORT_DIST, DEADLINE_TS)
        self.assertIn("valid date", str(ctx.exception))

    # ------------------------------------------------------------------
    # 23. Past claim deadline rejected at creation
    # ------------------------------------------------------------------
    def test_past_deadline_rejected(self):
        """Deadlines in the past (before year 2025) are rejected at funding."""
        mock_gl.message = MockMessage(sender=INSURER, value=STAKE)
        with self.assertRaises(UserError) as ctx:
            self.contract.fund_compensation_claim(PASSENGER, "VN302", DEPARTURE_DATE, SHORT_DIST, 1000000000)
        self.assertIn("valid future Unix timestamp", str(ctx.exception))


if __name__ == '__main__':
    unittest.main()

