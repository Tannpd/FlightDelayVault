# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

class UserError(Exception):
    pass

def to_address(addr):
    if isinstance(addr, Address):
        return addr
    return Address(addr)

# ZERO Address constant for address validation
ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")

# ---------------------------------------------------------------------------
# Authoritative Flight Tracking Sources (Third-party, NOT airline-controlled)
# ---------------------------------------------------------------------------
# Only accepted from authenticated canonical third-party flight tracking databases.
# Project-hosted, self-reported, or mock URLs are strictly excluded.
AUTHORIZED_TRACKING_DOMAINS = [
    "https://flightaware.com/",
    "https://www.flightaware.com/",
    "https://flightradar24.com/",
    "https://www.flightradar24.com/",
]

# Only accepted from authenticated canonical time authority APIs.
# Project-hosted Vercel URLs, GitHub raw, and localhost are strictly excluded.
AUTHORIZED_TIME_DOMAINS = [
    "https://worldtimeapi.org/",
    "https://timeapi.io/",
]

# ---------------------------------------------------------------------------
# EU261 Regulation: Contract-Level Compensation Math (NOT trusted from AI)
# 1 GEN = 1 € for this protocol
# ---------------------------------------------------------------------------
EU261_TIER_SHORT        = 250   # ≤ 1,500 km  →  €250
EU261_TIER_MEDIUM       = 400   # 1,500–3,500 km  →  €400
EU261_TIER_LONG         = 600   # > 3,500 km  →  €600
EU261_MIN_DELAY_HOURS   = 3     # Minimum qualifying delay to trigger compensation
EU261_DELAY_TOLERANCE   = 1     # Validator/Leader delay_hours tolerance (±1 hour)
MAX_EARTH_DISTANCE_KM   = 20000 # Maximum realistic global flight distance (half earth circumference)


def _eu261_compensation_units(distance_km: int) -> int:
    """
    Contract-level EU261 distance-tier calculation.
    Returns compensation in GEN units (not wei). NOT derived from AI verdict.
    """
    if distance_km <= 1500:
        return EU261_TIER_SHORT
    elif distance_km <= 3500:
        return EU261_TIER_MEDIUM
    else:
        return EU261_TIER_LONG


class Contract(gl.Contract):
    """
    FlightDelayVault — GenLayer Intelligent Contract Primitive

    Autonomous EU261 / US DOT flight delay compensation escrow.
    Airlines / insurers lock EU261 compensation funds per passenger.
    When a qualifying delay (≥ 3h) is confirmed by independent AI Validators
    scraping authoritative tracking sources (FlightAware, Flightradar24),
    compensation is automatically released to the passenger wallet.

    Key Safeguards:
    - Tracking evidence bound to authoritative third-party domains (not airline-controlled).
    - Departure date binding + AI freshness rule: only data for the registered flight date counts.
    - Zero-address & self-escrow protection: passenger cannot be 0x0 or insurer self-address.
    - Realistic distance bounds: 1km <= distance_km <= 20,000km.
    - Clean flight number hygiene: alphanumeric IATA/ICAO code, max 10 chars.
    - Full collateral guard: deposit must be >= full EU261 compensation for flight distance.
    - Compensation amount computed by contract EU261 math from flight_distance_km — NOT from AI.
    - Validator semantic content check: delay_hours must agree within ±1 hour tolerance.
    - Anti-double-claim: one claim per (flight_number + departure_date + passenger) tuple.
    - Deadline recovery: insurer reclaims funds if passenger files no claim before deadline.
    """
    claims_count:              bigint
    claim_passenger:           TreeMap[str, Address]
    claim_insurer:             TreeMap[str, Address]
    claim_fund:                TreeMap[str, bigint]
    claim_status:              TreeMap[str, str]
    claim_flight_number:       TreeMap[str, str]      # immutable after funding
    claim_departure_date:      TreeMap[str, str]      # YYYY-MM-DD, immutable
    claim_flight_distance_km:  TreeMap[str, bigint]   # immutable; drives EU261 math
    claim_tracking_url:        TreeMap[str, str]      # submitted at claim time
    claim_delay_hours:         TreeMap[str, bigint]
    claim_compensation_amount: TreeMap[str, bigint]   # in GEN wei, set by contract math
    claim_reasoning:           TreeMap[str, str]
    claim_deadline:            TreeMap[str, bigint]   # Unix timestamp: passenger claim deadline
    used_claims:               TreeMap[str, bool]     # anti-double-claim registry

    def __init__(self):
        self.claims_count = bigint(0)

    @gl.public.write.payable
    def fund_compensation_claim(
        self,
        passenger: Address,
        flight_number: str,
        departure_date: str,
        flight_distance_km: int,
        claim_deadline_ts: int,
    ) -> bigint:
        """
        Insurer / airline locks EU261 compensation funds into the vault for a specific
        passenger + flight. All flight identity fields are immutable after funding.
        Returns the new claim ID.
        """
        if gl.message.value <= 0:
            raise UserError("Compensation fund deposit must be greater than zero.")

        # SAFEGUARD A: Zero-address and Self-Escrow Protection
        passenger_addr = to_address(passenger)
        insurer_addr   = to_address(gl.message.sender_address)

        if str(passenger_addr) == str(ZERO_ADDRESS):
            raise UserError("Passenger address cannot be the zero address (0x0000...0000).")

        if str(passenger_addr) == str(insurer_addr):
            raise UserError("Insurer cannot create a compensation escrow for their own wallet address.")

        # SAFEGUARD B: Flight Number Hygiene (IATA/ICAO format: e.g. VN302, EK384, BA117)
        flight_number_clean = flight_number.strip().upper()
        if len(flight_number_clean) < 2 or len(flight_number_clean) > 10:
            raise UserError("Flight number must be between 2 and 10 characters long.")

        if not flight_number_clean.isalnum():
            raise UserError("Flight number must only contain alphanumeric characters (letters and digits).")

        departure_date_clean = departure_date.strip()
        # Validate YYYY-MM-DD format & valid date ranges
        try:
            parts = departure_date_clean.split('-')
            if len(parts) != 3 or len(parts[0]) != 4 or len(parts[1]) != 2 or len(parts[2]) != 2:
                raise ValueError()
            yr, mo, dy = int(parts[0]), int(parts[1]), int(parts[2])
            if not (2025 <= yr <= 2035 and 1 <= mo <= 12 and 1 <= dy <= 31):
                raise ValueError()
        except Exception:
            raise UserError("Departure date must be a valid date in YYYY-MM-DD format (e.g. 2026-08-01).")

        # SAFEGUARD C: Realistic Global Flight Distance Bounds
        if flight_distance_km <= 0 or flight_distance_km > MAX_EARTH_DISTANCE_KM:
            raise UserError(f"Flight distance must be between 1 and {MAX_EARTH_DISTANCE_KM} kilometres.")

        # SAFEGUARD D: Collateral Guard — Deposit must cover full EU261 statutory liability
        required_units = _eu261_compensation_units(flight_distance_km)
        required_wei   = bigint(required_units) * bigint(10 ** 18)
        if bigint(gl.message.value) < required_wei:
            raise UserError(
                f"Insufficient funding deposit. A flight distance of {flight_distance_km}km "
                f"requires at least {required_units} GEN deposit to cover full EU261 statutory liability."
            )

        # SAFEGUARD E: Claim deadline must be a valid future Unix timestamp (after year 2025)
        if claim_deadline_ts < 1735689600:  # 2025-01-01 00:00:00 UTC
            raise UserError("Claim deadline must be a valid future Unix timestamp.")

        # Anti-double-claim: one vault per (flight + date + passenger)
        anti_dup_key = f"{flight_number_clean}_{departure_date_clean}_{str(passenger_addr)}"
        if self.used_claims.get(anti_dup_key, False):
            raise UserError(
                "A compensation claim for this flight number, departure date, "
                "and passenger already exists. Each flight-passenger pair can "
                "only have one claim."
            )

        current_id = self.claims_count
        cid_str    = str(current_id)

        self.claim_passenger[cid_str]           = passenger_addr
        self.claim_insurer[cid_str]             = insurer_addr
        self.claim_fund[cid_str]                = bigint(gl.message.value)
        self.claim_status[cid_str]              = "FUNDED"
        self.claim_flight_number[cid_str]       = flight_number_clean
        self.claim_departure_date[cid_str]      = departure_date_clean
        self.claim_flight_distance_km[cid_str]  = bigint(flight_distance_km)
        self.claim_tracking_url[cid_str]        = ""
        self.claim_delay_hours[cid_str]         = bigint(0)
        self.claim_compensation_amount[cid_str] = bigint(0)
        self.claim_reasoning[cid_str]           = "Claim funded. Awaiting passenger delay evidence submission."
        self.claim_deadline[cid_str]            = bigint(claim_deadline_ts)

        # Register anti-double-claim key
        self.used_claims[anti_dup_key] = True

        self.claims_count = current_id + bigint(1)
        return current_id

    @gl.public.write
    def file_delay_claim(self, claim_id: int, tracking_evidence_url: str) -> None:
        """
        Passenger files delay claim with official flight tracking URL evidence.
        GenLayer AI Validators independently scrape authoritative tracking sources,
        verify delay hours, and confirm EU261 eligibility.
        Compensation is computed by contract EU261 math — NOT by the AI verdict.
        """
        cid_str = str(claim_id)
        if claim_id < 0 or bigint(claim_id) >= self.claims_count:
            raise UserError("Claim record does not exist.")

        status = self.claim_status.get(cid_str, "FUNDED")
        if status not in ("FUNDED", "FAILED"):
            raise UserError("Claim is not in an eligible state for delay filing.")

        url_clean = tracking_evidence_url.strip()
        url_lower = url_clean.lower()
        if not (url_lower.startswith("http://") or url_lower.startswith("https://")):
            raise UserError("Tracking evidence URL must start with http:// or https://")

        # Evidence MUST come from authoritative third-party sources — not airline-self-reported
        if not any(url_lower.startswith(d.lower()) for d in AUTHORIZED_TRACKING_DOMAINS):
            raise UserError(
                "Tracking evidence URL must originate from an authoritative, independent "
                "flight tracking source (e.g. flightaware.com, flightradar24.com). "
                "Airline-hosted or self-reported URLs are not accepted."
            )

        passenger_addr = to_address(self.claim_passenger.get(cid_str, ZERO_ADDRESS))
        sender         = to_address(gl.message.sender_address)
        if str(sender) != str(passenger_addr):
            raise UserError("Only the registered passenger can file a delay claim.")

        flight_number  = self.claim_flight_number.get(cid_str, "")
        departure_date = self.claim_departure_date.get(cid_str, "")
        distance_km    = int(self.claim_flight_distance_km.get(cid_str, bigint(0)))
        insurer_addr   = to_address(self.claim_insurer.get(cid_str, ZERO_ADDRESS))
        deposit_amount = self.claim_fund.get(cid_str, bigint(0))

        self.claim_tracking_url[cid_str] = url_clean
        self.claim_reasoning[cid_str]    = "AI Flight Delay Validators are independently scraping tracking data..."

        # -----------------------------------------------------------------------
        # Leader Execution Function
        # -----------------------------------------------------------------------
        def leader_fn() -> str:
            try:
                raw = gl.nondet.web.render(url_clean)
                tracking_text = raw.decode('utf-8', errors='ignore').strip() if isinstance(raw, bytes) else str(raw).strip()
            except Exception as e:
                return json.dumps({
                    "error": f"TRACKING_FETCH_FAILED: {str(e)}",
                    "is_delayed": False, "delay_hours": 0,
                    "reasoning": f"Could not scrape flight tracking data from {url_clean}."
                })

            if len(tracking_text) < 15:
                return json.dumps({
                    "error": "EMPTY_TRACKING_RESPONSE",
                    "is_delayed": False, "delay_hours": 0,
                    "reasoning": "Flight tracking page returned empty or insufficient content."
                })

            prompt = f"""You are an expert EU261 / US DOT Flight Delay Auditor verifying compensation eligibility for an autonomous escrow contract.

FLIGHT IDENTITY (IMMUTABLE — BOUND AT REGISTRATION. DO NOT SUBSTITUTE):
- Flight Number:    {flight_number}
- Departure Date:   {departure_date}
- Registered Distance: {distance_km} km

STEP 1 — VERIFY LEGALLY MATERIAL FLIGHT FACTS (do this before checking delay):
A. FLIGHT EXISTS: Confirm that flight {flight_number} on {departure_date} is explicitly present in the tracking data. If NOT found, set flight_verified = false and is_delayed = false immediately.
B. ROUTE DISTANCE CONSISTENCY: Based on the origin and destination airports found in the tracking data, estimate the great-circle distance. Verify it is plausibly consistent with the registered distance of {distance_km} km (allow ±30% margin). If grossly inconsistent, set is_delayed = false.
C. PASSENGER FACTS: Note any passenger or booking reference data visible in the tracking source if present.

FRESHNESS RULE (CRITICAL — ENFORCE STRICTLY):
- You MUST ONLY analyze delay data for flight {flight_number} on departure date {departure_date}.
- Data for ANY other date, ANY other flight number, or historical patterns MUST be ignored entirely.
- If the tracking page does not clearly reference {flight_number} departing on {departure_date}, you MUST set is_delayed = false.
- Do NOT infer or extrapolate. Only use explicitly stated times from the tracking data.

FLIGHT TRACKING DATA (from authenticated canonical source — flightaware.com or flightradar24.com):
\"\"\"
{tracking_text[:2500]}
\"\"\"

STEP 2 — DELAY AUDIT INSTRUCTIONS (only if flight_verified = true):
1. Find the SCHEDULED departure time and the ACTUAL departure/arrival time for {flight_number} on {departure_date}.
2. Calculate total delay in whole hours (integer, round DOWN).
3. A cancelled flight counts as delay_hours = 3 (minimum qualifying).
4. If total delay >= 3 hours → set is_delayed = true.
5. If total delay < 3 hours OR departure/date data not found → set is_delayed = false.
6. Provide concise audit reasoning citing the exact scheduled and actual times found.

WARNING: Do NOT set is_delayed = true unless you found explicit timestamp data for {flight_number} on {departure_date}. When in doubt, fail safely: is_delayed = false.

Respond ONLY with valid raw JSON. No markdown, no code blocks:
{{
    "flight_verified": true | false,
    "is_delayed": true | false,
    "delay_hours": <int, 0 if not delayed or < 3h>,
    "reasoning": "<concise string citing flight existence check, route distance check, and exact timestamps found>"
}}"""

            try:
                res_raw = gl.nondet.exec_prompt(prompt)
                res_str = res_raw.decode('utf-8', errors='ignore').strip() if isinstance(res_raw, bytes) else str(res_raw).strip()
            except Exception as e:
                return json.dumps({
                    "error": f"LLM_FAILED: {str(e)}",
                    "is_delayed": False, "delay_hours": 0,
                    "reasoning": "LLM flight delay auditor failed to execute."
                })

            cleaned = res_str.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                inner = []
                for line in lines[1:]:
                    if line.strip() == "```": break
                    inner.append(line)
                cleaned = "\n".join(inner).strip()

            try:
                parsed          = json.loads(cleaned)
                flight_verified = parsed.get("flight_verified")
                is_delayed      = parsed.get("is_delayed")

                # STRICT BOOLEAN VALIDATION — reject string coercion
                if not isinstance(flight_verified, bool):
                    return json.dumps({
                        "error": "FLIGHT_NOT_VERIFIED",
                        "is_delayed": False, "delay_hours": 0,
                        "reasoning": "AI could not verify flight existence in canonical tracking data. Failing closed."
                    })

                if not isinstance(is_delayed, bool):
                    return json.dumps({
                        "error": "INVALID_BOOLEAN_TYPE",
                        "is_delayed": False, "delay_hours": 0,
                        "reasoning": "AI returned non-boolean is_delayed. Failing closed to protect escrow."
                    })

                # LEGALLY MATERIAL FACT GATE: flight must be verified to exist in canonical data
                if not flight_verified:
                    return json.dumps({
                        "error": "FLIGHT_NOT_FOUND_IN_CANONICAL_DATA",
                        "is_delayed": False, "delay_hours": 0,
                        "reasoning": "Flight could not be verified in authenticated canonical tracking data. Payout blocked."
                    })

                delay_hours = int(parsed.get("delay_hours", 0))
                reasoning   = str(parsed.get("reasoning", "")).strip()
                if delay_hours < 0: delay_hours = 0

                # CONTRACT-LEVEL OVERRIDE: delay_hours < 3 → never eligible regardless of AI verdict
                if delay_hours < EU261_MIN_DELAY_HOURS:
                    is_delayed = False

                return json.dumps({
                    "flight_verified": flight_verified,
                    "is_delayed": is_delayed,
                    "delay_hours": delay_hours,
                    "reasoning": reasoning[:500]
                })
            except Exception as e:
                return json.dumps({
                    "error": f"JSON_PARSE_FAILED: {str(e)}",
                    "is_delayed": False, "delay_hours": 0,
                    "reasoning": "Could not parse AI output. Raw data preserved."
                })

        # -----------------------------------------------------------------------
        # Validator Execution Function — Independent re-scrape + semantic check
        # -----------------------------------------------------------------------
        def validator_fn(leader_result: str) -> bool:
            try:
                l_str = leader_result.decode('utf-8', errors='ignore') if isinstance(leader_result, bytes) else str(leader_result)
                l_s   = l_str.find('{')
                l_e   = l_str.rfind('}')
                if l_s == -1 or l_e == -1: return False
                leader_json = json.loads(l_str[l_s:l_e+1])
            except Exception:
                return False

            if "error" in leader_json: return False

            leader_delayed = leader_json.get("is_delayed")
            if not isinstance(leader_delayed, bool): return False

            leader_hours = leader_json.get("delay_hours")
            if not isinstance(leader_hours, int): return False

            # Validator independently re-scrapes the same authoritative source
            try:
                raw = gl.nondet.web.render(url_clean)
                tracking_text = raw.decode('utf-8', errors='ignore').strip() if isinstance(raw, bytes) else str(raw).strip()
            except Exception:
                return False

            if len(tracking_text) < 15: return False

            prompt = f"""You are an expert EU261 / US DOT Flight Delay Auditor providing independent validation for an autonomous escrow contract.

FLIGHT IDENTITY (IMMUTABLE — DO NOT SUBSTITUTE):
- Flight Number:    {flight_number}
- Departure Date:   {departure_date}
- Registered Distance: {distance_km} km

STEP 1 — VERIFY LEGALLY MATERIAL FLIGHT FACTS:
A. FLIGHT EXISTS: Confirm that flight {flight_number} on {departure_date} is explicitly present in the tracking data. If NOT found, set flight_verified = false and is_delayed = false.
B. ROUTE DISTANCE CONSISTENCY: Verify that the origin-destination distance in the tracking data is plausibly consistent with the registered {distance_km} km (±30% margin). If grossly inconsistent, set is_delayed = false.

FRESHNESS RULE: ONLY analyze flight {flight_number} on {departure_date}. Ignore all other data.

FLIGHT TRACKING DATA (from authenticated canonical source — flightaware.com or flightradar24.com):
\"\"\"
{tracking_text[:2500]}
\"\"\"

STEP 2 — DELAY AUDIT (only if flight_verified = true):
1. Find SCHEDULED and ACTUAL departure times.
2. Calculate delay in whole hours (round DOWN).
3. Cancelled flight = delay_hours = 3.
4. Delay >= 3h → is_delayed = true. Otherwise false.

Respond ONLY with valid raw JSON:
{{
    "flight_verified": true | false,
    "is_delayed": true | false,
    "delay_hours": <int>,
    "reasoning": "<string citing flight existence check, route consistency, and timestamps>"
}}"""

            try:
                val_raw = gl.nondet.exec_prompt(prompt)
                val_str = val_raw.decode('utf-8', errors='ignore').strip() if isinstance(val_raw, bytes) else str(val_raw).strip()
            except Exception:
                return False

            cleaned_val = val_str.strip()
            if cleaned_val.startswith("```"):
                lines = cleaned_val.split("\n")
                inner = []
                for line in lines[1:]:
                    if line.strip() == "```": break
                    inner.append(line)
                cleaned_val = "\n".join(inner).strip()

            try:
                val_json = json.loads(cleaned_val)
            except Exception:
                return False

            if "error" in val_json: return False

            # Validator must also confirm flight existence in canonical data
            val_verified = val_json.get("flight_verified")
            if not isinstance(val_verified, bool): return False
            if not val_verified: return False

            val_delayed = val_json.get("is_delayed")
            if not isinstance(val_delayed, bool): return False

            val_hours = val_json.get("delay_hours")
            if not isinstance(val_hours, int): return False

            # SEMANTIC CONTENT EQUIVALENCE CHECK:
            # 1. Both must confirm flight_verified = true
            # 2. Both must agree on whether the flight is delayed (verdict match)
            # 3. Delay hours must be within ±1 hour tolerance (real-world data variation)
            verdict_match    = (leader_delayed == val_delayed)
            hours_within_tol = abs(leader_hours - val_hours) <= EU261_DELAY_TOLERANCE

            return verdict_match and hours_within_tol

        # Execute GenLayer AI consensus
        final_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        try:
            if isinstance(final_raw, bytes):
                cons_str = final_raw.decode('utf-8', errors='ignore')
            else:
                cons_str = str(final_raw)
            c_s = cons_str.find('{')
            c_e = cons_str.rfind('}')
            if c_s == -1 or c_e == -1: raise ValueError("No JSON found in consensus result")
            res_json = json.loads(cons_str[c_s:c_e+1])
        except Exception:
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = "Consensus returned unparseable result. Funds preserved for retry."
            return

        if "error" in res_json:
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = f"Audit failed: {res_json.get('error')}. {res_json.get('reasoning', '')}"
            return

        is_delayed = res_json.get("is_delayed", False)
        if not isinstance(is_delayed, bool):
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = "Settlement received non-boolean verdict. Funds preserved."
            return

        delay_hours = int(res_json.get("delay_hours", 0))
        reasoning   = str(res_json.get("reasoning", "Audit complete."))

        # CONTRACT-LEVEL FINAL SAFETY OVERRIDE (belt-and-suspenders)
        if delay_hours < EU261_MIN_DELAY_HOURS:
            is_delayed = False

        self.claim_delay_hours[cid_str] = bigint(delay_hours)
        self.claim_reasoning[cid_str]   = reasoning[:500]

        if is_delayed:
            # CONTRACT-LEVEL EU261 MATH — compensation derived from flight_distance_km ONLY
            comp_units = _eu261_compensation_units(distance_km)   # e.g. 250, 400, or 600
            comp_wei   = bigint(comp_units) * bigint(10 ** 18)    # convert to GEN wei (1 GEN = 1 €)
            # Cap at actual deposited fund
            actual_comp = comp_wei if comp_wei <= deposit_amount else deposit_amount
            remainder   = deposit_amount - actual_comp

            self.claim_compensation_amount[cid_str] = actual_comp
            self.claim_fund[cid_str]                = bigint(0)
            self.claim_status[cid_str]              = "COMPENSATED"

            gl.get_contract_at(passenger_addr).emit_transfer(value=actual_comp)
            if remainder > bigint(0):
                gl.get_contract_at(insurer_addr).emit_transfer(value=remainder)
        else:
            # No qualifying delay — release 100% deposit back to insurer
            self.claim_compensation_amount[cid_str] = bigint(0)
            self.claim_fund[cid_str]                = bigint(0)
            self.claim_status[cid_str]              = "REJECTED"
            gl.get_contract_at(insurer_addr).emit_transfer(value=deposit_amount)

    @gl.public.write
    def expire_and_release(self, claim_id: int, time_source_url: str) -> None:
        """
        Deadline-Based Recovery Path.
        Allows the insurer to reclaim locked funds if the passenger files no claim
        before the agreed deadline. Uses AI consensus over an authoritative time source
        to verify that the current timestamp exceeds the claim deadline.
        Prevents funds from being locked permanently due to passenger inaction.
        """
        cid_str = str(claim_id)
        if claim_id < 0 or bigint(claim_id) >= self.claims_count:
            raise UserError("Claim record does not exist.")

        status = self.claim_status.get(cid_str, "FUNDED")
        if status not in ("FUNDED", "FAILED"):
            raise UserError("Claim is not in an eligible state for deadline expiry settlement.")

        insurer_addr = to_address(self.claim_insurer.get(cid_str, ZERO_ADDRESS))
        sender       = to_address(gl.message.sender_address)
        if str(sender) != str(insurer_addr):
            raise UserError("Only the insurer can trigger deadline-based expiry settlement.")

        deadline_ts = int(self.claim_deadline.get(cid_str, bigint(0)))
        if deadline_ts == 0:
            raise UserError("No deadline is configured for this claim.")

        amount = self.claim_fund.get(cid_str, bigint(0))
        if amount <= bigint(0):
            raise UserError("Claim vault has no funds remaining.")

        url_clean = time_source_url.strip()
        url_lower = url_clean.lower()
        if not any(url_lower.startswith(d.lower()) for d in AUTHORIZED_TIME_DOMAINS):
            raise UserError(
                "Time source URL must originate from an authoritative time service "
                "(e.g. worldtimeapi.org, timeapi.io)."
            )

        def leader_fn() -> str:
            try:
                raw = gl.nondet.web.render(url_clean)
                time_text = raw.decode('utf-8', errors='ignore').strip() if isinstance(raw, bytes) else str(raw).strip()
            except Exception as e:
                return json.dumps({"error": f"TIME_FETCH_FAILED: {str(e)}", "deadline_passed": False})

            if len(time_text) < 10:
                return json.dumps({"error": "EMPTY_TIME_RESPONSE", "deadline_passed": False})

            prompt = f"""Extract the current Unix timestamp from the time source content.
Compare it to the escrow deadline of {deadline_ts}.

Time Source Content:
\"\"\"
{time_text[:500]}
\"\"\"

Set "deadline_passed" = true ONLY if current Unix timestamp > {deadline_ts}. Otherwise false.

Return ONLY raw JSON:
{{
  "current_unix_timestamp": <int>,
  "deadline_passed": true | false,
  "reasoning": "<1 sentence>"
}}"""

            try:
                res_raw = gl.nondet.exec_prompt(prompt)
                res_str = res_raw.decode('utf-8', errors='ignore').strip() if isinstance(res_raw, bytes) else str(res_raw).strip()
            except Exception as e:
                return json.dumps({"error": f"LLM_FAILED: {str(e)}", "deadline_passed": False})

            cleaned = res_str.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                inner = []
                for line in lines[1:]:
                    if line.strip() == "```": break
                    inner.append(line)
                cleaned = "\n".join(inner).strip()

            try:
                parsed = json.loads(cleaned)
                passed = parsed.get("deadline_passed")
                if not isinstance(passed, bool):
                    return json.dumps({"error": "INVALID_BOOLEAN", "deadline_passed": False})
                return json.dumps({
                    "deadline_passed": passed,
                    "current_unix_timestamp": int(parsed.get("current_unix_timestamp", 0)),
                    "reasoning": str(parsed.get("reasoning", ""))[:300]
                })
            except Exception as e:
                return json.dumps({"error": f"JSON_PARSE_FAILED: {str(e)}", "deadline_passed": False})

        def validator_fn(leader_result: str) -> bool:
            try:
                l_str = leader_result.decode('utf-8', errors='ignore') if isinstance(leader_result, bytes) else str(leader_result)
                l_s   = l_str.find('{')
                l_e   = l_str.rfind('}')
                if l_s == -1 or l_e == -1: return False
                leader_json = json.loads(l_str[l_s:l_e+1])
            except Exception:
                return False

            if "error" in leader_json: return False
            leader_passed = leader_json.get("deadline_passed")
            if not isinstance(leader_passed, bool): return False

            # Independent validator fetch
            try:
                raw = gl.nondet.web.render(url_clean)
                time_text = raw.decode('utf-8', errors='ignore').strip() if isinstance(raw, bytes) else str(raw).strip()
            except Exception:
                return False

            if len(time_text) < 10: return False

            prompt = f"""Extract current Unix timestamp and check if > {deadline_ts}.
Time Source: \"\"\"{time_text[:500]}\"\"\"
Return ONLY raw JSON: {{"deadline_passed": true | false}}"""

            try:
                val_raw = gl.nondet.exec_prompt(prompt)
                val_str = val_raw.decode('utf-8', errors='ignore').strip() if isinstance(val_raw, bytes) else str(val_raw).strip()
            except Exception:
                return False

            cleaned_val = val_str.strip()
            if cleaned_val.startswith("```"):
                lines = cleaned_val.split("\n")
                inner = []
                for line in lines[1:]:
                    if line.strip() == "```": break
                    inner.append(line)
                cleaned_val = "\n".join(inner).strip()

            try:
                val_json = json.loads(cleaned_val)
                val_passed = val_json.get("deadline_passed")
                if not isinstance(val_passed, bool): return False
                return leader_passed == val_passed
            except Exception:
                return False

        final_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        try:
            if isinstance(final_raw, bytes):
                cons_str = final_raw.decode('utf-8', errors='ignore')
            else:
                cons_str = str(final_raw)
            c_s = cons_str.find('{')
            c_e = cons_str.rfind('}')
            if c_s == -1 or c_e == -1: raise ValueError("No JSON")
            result = json.loads(cons_str[c_s:c_e+1])
        except Exception:
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = "Deadline verification consensus returned unparseable result."
            return

        if "error" in result:
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = f"Deadline check failed: {result.get('error')}"
            return

        deadline_passed = result.get("deadline_passed", False)
        if not isinstance(deadline_passed, bool):
            self.claim_status[cid_str]    = "FAILED"
            self.claim_reasoning[cid_str] = "Deadline verification returned non-boolean. Funds preserved."
            return

        if not deadline_passed:
            raise UserError(
                "Claim deadline has not yet passed. Funds remain locked until the deadline expires."
            )

        # Deadline confirmed passed by consensus — release funds to insurer
        self.claim_fund[cid_str]      = bigint(0)
        self.claim_status[cid_str]    = "EXPIRED_RELEASED"
        self.claim_reasoning[cid_str] = (
            "Claim deadline passed with no passenger action. "
            "Compensation funds returned to insurer per vault agreement."
        )
        gl.get_contract_at(insurer_addr).emit_transfer(value=amount)

    @gl.public.view
    def get_claim(self, claim_id: int) -> str:
        """Returns full JSON details of a flight delay compensation claim."""
        cid_str = str(claim_id)
        if claim_id < 0 or bigint(claim_id) >= self.claims_count:
            raise UserError("Claim record does not exist.")

        return json.dumps({
            "id":                  claim_id,
            "passenger":           str(self.claim_passenger.get(cid_str, ZERO_ADDRESS)),
            "insurer":             str(self.claim_insurer.get(cid_str, ZERO_ADDRESS)),
            "fund":                int(self.claim_fund.get(cid_str, bigint(0))),
            "status":              self.claim_status.get(cid_str, "FUNDED"),
            "flight_number":       self.claim_flight_number.get(cid_str, ""),
            "departure_date":      self.claim_departure_date.get(cid_str, ""),
            "flight_distance_km":  int(self.claim_flight_distance_km.get(cid_str, bigint(0))),
            "tracking_url":        self.claim_tracking_url.get(cid_str, ""),
            "delay_hours":         int(self.claim_delay_hours.get(cid_str, bigint(0))),
            "compensation_amount": int(self.claim_compensation_amount.get(cid_str, bigint(0))),
            "reasoning":           self.claim_reasoning.get(cid_str, ""),
            "deadline":            int(self.claim_deadline.get(cid_str, bigint(0))),
        })

    @gl.public.view
    def get_claims_count(self) -> int:
        """Returns the total number of registered flight delay compensation claims."""
        return int(self.claims_count)
