"""Generate docs/10-api-reference.md from the live FastAPI app (method, path, access, summary).

Usage (from backend/, venv active):  python -m scripts.export_api_reference
The access level is read from each route's actual dependencies, so the table can't drift.
"""

from pathlib import Path

from fastapi.routing import APIRoute

from app.main import API_PREFIX, create_app
from tests.conftest import make_settings  # noqa: F401  (sets safe env vars for app creation)

OUTPUT = Path(__file__).resolve().parents[2] / "docs" / "10-api-reference.md"


def access_level(route: APIRoute) -> str:
    found: list[str] = []

    def walk(dependant):
        for dep in dependant.dependencies:
            name = getattr(dep.call, "__name__", "")
            if name == "checker" and dep.call.__closure__:
                roles = next(
                    (
                        c.cell_contents
                        for c in dep.call.__closure__
                        if isinstance(c.cell_contents, tuple)
                    ),
                    (),
                )
                found.append(" / ".join(r.value for r in roles))
            elif name == "get_current_user":
                found.append("any signed-in user")
            elif name == "get_optional_user":
                found.append("public (personalised if signed in)")
            elif name == "require_same_site":
                found.append("refresh cookie + same-site headers")
            walk(dep)

    walk(route.dependant)
    for preferred in found:
        if preferred not in ("any signed-in user",):
            return preferred
    return found[0] if found else "public"


def iter_api_routes(app):
    """Yield (APIRoute, full path). Newer FastAPI keeps included routers as wrappers that expose
    the router they include as `original_router`; older versions flatten routes directly."""
    for item in app.routes:
        if isinstance(item, APIRoute) and item.path.startswith(API_PREFIX):
            yield item, item.path
        router = getattr(item, "original_router", None)
        if router is not None:
            for route in router.routes:
                if isinstance(route, APIRoute):
                    yield route, API_PREFIX + route.path


def main() -> None:
    app = create_app()
    rows = []
    for route, path in iter_api_routes(app):
        first_paragraph = (
            (route.endpoint.__doc__ or route.name.replace("_", " ")).strip().split("\n\n")[0]
        )
        doc = " ".join(first_paragraph.split())  # collapse indentation from multi-line docstrings
        tag = route.tags[0] if route.tags else "other"
        for method in sorted(route.methods - {"HEAD"}):
            rows.append((tag, path, method, access_level(route), doc))

    lines = [
        "# 10 — API Reference (generated)",
        "",
        "Generated from the running application by `python -m scripts.export_api_reference` — do not edit by hand.",
        "Interactive documentation with request/response schemas: `/api/docs` on any running API.",
        "Error format, pagination and money conventions: see [05-api-spec.md](05-api-spec.md).",
        "",
    ]
    for tag in sorted({r[0] for r in rows}):
        lines += [
            f"## {tag.title()}",
            "",
            "| Method | Path | Access | Purpose |",
            "|---|---|---|---|",
        ]
        for _, path, method, access, doc in sorted(r for r in rows if r[0] == tag):
            lines.append(f"| {method} | `{path}` | {access} | {doc} |")
        lines.append("")
    OUTPUT.write_text("\n".join(lines))
    print(f"Wrote {len(rows)} endpoints to {OUTPUT}")


if __name__ == "__main__":
    main()
