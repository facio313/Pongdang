"""Opt-in, at most two paid Responses attempts using the real tool loop."""

import argparse
import asyncio
import json


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true", help="Authorize up to two paid model attempts"
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Use the local operator budget bucket; requires --live and loopback DB",
    )
    args = parser.parse_args(argv)
    if args.local and not args.live:
        parser.error("--local requires explicit --live")
    if not args.live:
        print("Live smoke skipped. Use --live explicitly to authorize paid calls.")
        return 0
    try:
        return asyncio.run(run(local=args.local))
    except Exception:
        print(json.dumps({"status": "failed", "reason": "live_smoke_unavailable"}))
        return 1


async def run(*, local=False):
    from app.ai import budget
    from app.ai.chat import ChatRequest, converse
    from app.ai.provider import ResponsesProvider
    from app.ai.tools import ToolError, ToolSession
    from app.config import Settings

    class SmokeSession(ToolSession):
        def schemas(self):
            return [
                tool for tool in super().schemas() if tool["name"] == "capabilities"
            ]

        async def execute(self, name, arguments):
            if name != "capabilities":
                raise ToolError("smoke_tool_not_allowed")
            return await super().execute(name, arguments)

    settings = Settings().model_copy(
        update={"ai_max_model_calls": 2, "ai_max_tool_calls": 1}
    )
    if local and not budget.operator_local_database(settings):
        print(json.dumps({"status": "failed", "reason": "ai_operator_local_required"}))
        return 1

    class OperatorAccounting:
        """CLI-only accounting; does not issue or authenticate an SSO principal."""

        @staticmethod
        def acquire_request(settings, _unused_subject):
            return budget.acquire_operator_request(settings)

        reserve_attempt = staticmethod(budget.reserve_attempt)
        record_usage = staticmethod(budget.record_usage)
        release_request = staticmethod(budget.release_request)

    provider = ResponsesProvider(settings)
    try:
        result = await converse(
            settings,
            ChatRequest(
                message=(
                    "사용할 수 있는 기능을 capabilities 도구로 확인하고 설명해 줘. "
                    "수집 상태 조회는 생략해 줘."
                )
            ),
            "operator-live-smoke",
            provider,
            session_factory=SmokeSession,
            budget_api=OperatorAccounting if local else budget,
        )
    finally:
        await provider.aclose()
    passed = (
        result.provider == "openai"
        and "capabilities" in result.features
        and bool(result.facts)
    )
    print(
        json.dumps(
            {
                "status": "passed" if passed else "failed",
                "request_id": result.request_id,
                "provider": result.provider,
                "features": result.features,
                "reason_codes": result.reason_codes,
            },
            ensure_ascii=False,
        )
    )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
