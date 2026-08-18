# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class InsurancePool(gl.Contract):
    """
    Parametric Flight Delay Insurance Pool.
    """

    total_deposits: u256
    total_paid: u256
    claim_count: u256

    current_claim_id: str
    claimant: Address
    flight_number: str
    flight_date: str
    delay_threshold_minutes: u256
    status_url: str
    payout_amount: u256
    status: str
    has_resolved: bool
    flight_status: str
    delay_minutes: u256
    resolution_note: str
    is_paid: bool
    has_claim: bool

    def __init__(self):
        self.total_deposits = u256(0)
        self.total_paid = u256(0)
        self.claim_count = u256(0)

        self.current_claim_id = ""
        self.claimant = Address("0x0000000000000000000000000000000000000000")
        self.flight_number = ""
        self.flight_date = ""
        self.delay_threshold_minutes = u256(0)
        self.status_url = ""
        self.payout_amount = u256(0)
        self.status = ""
        self.has_resolved = False
        self.flight_status = ""
        self.delay_minutes = u256(0)
        self.resolution_note = ""
        self.is_paid = False
        self.has_claim = False

    @gl.public.view
    def get_pool_stats(self) -> dict:
        return {
            "total_deposits": int(self.total_deposits),
            "total_paid": int(self.total_paid),
            "claim_count": int(self.claim_count),
            "pool_balance": int(self.total_deposits - self.total_paid),
            "has_claim": self.has_claim,
        }

    @gl.public.view
    def get_claim(self) -> dict:
        if not self.has_claim:
            return {"error": "No claim opened yet"}
        return {
            "claim_id": self.current_claim_id,
            "claimant": str(self.claimant),
            "flight_number": self.flight_number,
            "flight_date": self.flight_date,
            "delay_threshold_minutes": int(self.delay_threshold_minutes),
            "status_url": self.status_url,
            "payout_amount": int(self.payout_amount),
            "status": self.status,
            "has_resolved": self.has_resolved,
            "flight_status": self.flight_status,
            "delay_minutes": int(self.delay_minutes),
            "resolution_note": self.resolution_note,
            "is_paid": self.is_paid,
        }

    @gl.public.write
    def deposit(self) -> dict:
        amount = gl.message.value
        require(amount > u256(0), "Must send GEN")
        self.total_deposits += amount
        return {
            "ok": True,
            "deposited": int(amount),
            "total_deposits": int(self.total_deposits),
        }

    @gl.public.write
    def open_claim(
        self,
        flight_number: str,
        flight_date: str,
        delay_threshold_minutes: int,
        status_url: str,
        payout_amount: int,
    ) -> dict:
        require(payout_amount > 0, "payout_amount must be > 0")
        require(not self.has_claim or self.has_resolved, "Previous claim still open")

        self.claim_count += u256(1)
        self.current_claim_id = str(int(self.claim_count))
        self.claimant = gl.message.sender_address
        self.flight_number = flight_number
        self.flight_date = flight_date
        self.delay_threshold_minutes = u256(delay_threshold_minutes)
        self.status_url = status_url
        self.payout_amount = u256(payout_amount)
        self.status = "open"
        self.has_resolved = False
        self.flight_status = ""
        self.delay_minutes = u256(0)
        self.resolution_note = ""
        self.is_paid = False
        self.has_claim = True

        return {
            "ok": True,
            "claim_id": self.current_claim_id,
            "message": "Claim opened",
        }

    @gl.public.write
    def resolve_claim(self) -> dict:
        require(self.has_claim, "No claim to resolve")
        require(not self.has_resolved, "Claim already resolved")

        threshold = int(self.delay_threshold_minutes)
        flight_number = self.flight_number
        flight_date = self.flight_date
        status_url = self.status_url

        def leader_fn() -> dict:
            page = gl.nondet.web.render(status_url, mode="text")
            prompt = f"""
You are extracting flight status facts for a parametric insurance claim.

Flight number: {flight_number}
Flight date: {flight_date}
Page content:
{page[:12000]}

Extract ONLY these fields. Respond with valid JSON and nothing else:
{{
  "flight_status": "delayed" | "cancelled" | "on_time" | "unknown",
  "delay_minutes": <integer or 0 if unknown/on_time>,
  "note": "<one short sentence of evidence from the page>"
}}

Rules:
- If the flight is cancelled, set flight_status to "cancelled" and delay_minutes to 0.
- If clearly delayed, put the best estimate of delay in minutes.
- If on time or landed on schedule, use "on_time" and 0.
- If you cannot tell, use "unknown" and 0.
- Do not invent numbers that are not supported by the page.
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                raw = json.loads(str(raw).replace("```json", "").replace("```", "").strip())

            status = str(raw.get("flight_status", "unknown")).lower().strip()
            if status not in ("delayed", "cancelled", "on_time", "unknown"):
                status = "unknown"

            try:
                minutes = int(raw.get("delay_minutes", 0))
            except Exception:
                minutes = 0
            if minutes < 0:
                minutes = 0

            note = str(raw.get("note", ""))[:300]
            approved = (status == "cancelled") or (status == "delayed" and minutes >= threshold)

            return {
                "flight_status": status,
                "delay_minutes": minutes,
                "note": note,
                "approved": approved,
            }

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader = leader_result.calldata
            if not isinstance(leader, dict):
                return False

            mine = leader_fn()
            if mine["approved"] != leader.get("approved"):
                return False
            if mine["flight_status"] != leader.get("flight_status"):
                return False
            if abs(int(leader.get("delay_minutes", 0)) - int(mine["delay_minutes"])) > 30:
                return False
            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        self.has_resolved = True
        self.flight_status = str(result["flight_status"])
        self.delay_minutes = u256(int(result["delay_minutes"]))
        self.resolution_note = str(result.get("note", ""))[:300]

        if result["approved"]:
            self.status = "approved"
            available = self.total_deposits - self.total_paid
            if available >= self.payout_amount and not self.is_paid:
                gl.transfer(self.claimant, self.payout_amount)
                self.total_paid += self.payout_amount
                self.is_paid = True
        else:
            self.status = "rejected"

        return {
            "ok": True,
            "claim_id": self.current_claim_id,
            "status": self.status,
            "flight_status": self.flight_status,
            "delay_minutes": int(self.delay_minutes),
            "note": self.resolution_note,
            "is_paid": self.is_paid,
            "pool_balance": int(self.total_deposits - self.total_paid),
        }
