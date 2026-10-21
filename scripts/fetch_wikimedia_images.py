"""Resolve destination photos on Wikimedia Commons and record their licence + attribution.

Why: destination photos must genuinely show the place, and Commons licences (CC BY / CC BY-SA)
require crediting the author and licence. This script turns a hand-curated mapping into a data
file with image URLs *and* credits, so the UI can always show proper attribution.

Usage (standard library only, any Python 3.10+):
    python3 scripts/fetch_wikimedia_images.py scripts/destination_image_sources.json \
        frontend/src/data/destinationImages.json

Mapping values are either "File:<Commons file name>" or "wp:<English Wikipedia article>" (uses
that article's lead image).
"""

import html
import json
import re
import sys
import urllib.parse
import urllib.request

USER_AGENT = "VistaraStaysPortfolio/0.1 (portfolio project; image attribution script)"
# Wikimedia serves pre-generated thumbnails at standard widths; other widths may be refused.
WIDTHS = [500, 960, 1280, 1920]


def api(host: str, params: dict) -> dict:
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode({"format": "json", **params})
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def resolve_article_images(articles: list[str]) -> dict[str, str]:
    data = api(
        "en.wikipedia.org",
        {
            "action": "query",
            "prop": "pageimages",
            "piprop": "name",
            "redirects": 1,
            "titles": "|".join(articles),
        },
    )
    query = data["query"]
    renamed = {r["from"]: r["to"] for r in query.get("redirects", [])}
    by_title = {p["title"]: p.get("pageimage") for p in query["pages"].values()}
    result = {}
    for article in articles:
        name = by_title.get(renamed.get(article, article))
        if not name:
            raise SystemExit(f"No lead image for Wikipedia article: {article}")
        result[article] = f"File:{name}"
    return result


def thumb_url(url: str, width: int) -> str:
    """https://upload.wikimedia.org/.../thumb/a/ab/X.jpg/960px-X.jpg → same with another width."""
    without_tracking = url.split("?", 1)[0]  # drop utm_* analytics parameters
    return re.sub(r"/\d+px-", f"/{width}px-", without_tracking)


def fetch_file_info(titles: list[str]) -> dict[str, dict]:
    data = api(
        "commons.wikimedia.org",
        {
            "action": "query",
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": 960,
            "titles": "|".join(titles),
        },
    )
    query = data["query"]
    normalized = {n["from"]: n["to"] for n in query.get("normalized", [])}
    pages = {p["title"]: p for p in query["pages"].values()}
    info = {}
    for title in titles:
        page = pages.get(normalized.get(title, title))
        if not page or "imageinfo" not in page:
            raise SystemExit(f"File not found on Commons: {title}")
        ii = page["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        width, height = ii["width"], ii["height"]
        usable = [w for w in WIDTHS if w < width] or [WIDTHS[0]]
        info[title] = {
            "src": thumb_url(ii["thumburl"], max(w for w in usable if w <= 1280)),
            "srcSet": {w: thumb_url(ii["thumburl"], w) for w in usable},
            "width": width,
            "height": height,
            "credit": {
                "author": strip_html(meta.get("Artist", {}).get("value")) or "Unknown",
                "license": strip_html(meta.get("LicenseShortName", {}).get("value")),
                "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
                "sourceUrl": ii["descriptionurl"],
            },
        }
    return info


def main(source_path: str, output_path: str) -> None:
    with open(source_path, encoding="utf-8") as fh:
        sources: dict[str, dict] = json.load(fh)

    articles = [s["image"][3:] for s in sources.values() if s["image"].startswith("wp:")]
    article_files = resolve_article_images(articles) if articles else {}
    files = {
        slug: article_files.get(s["image"][3:], s["image"]) if s["image"].startswith("wp:")
        else s["image"]
        for slug, s in sources.items()
    }

    unique_titles = sorted(set(files.values()))
    info: dict[str, dict] = {}
    for i in range(0, len(unique_titles), 40):  # API accepts up to 50 titles per request
        info |= fetch_file_info(unique_titles[i : i + 40])

    output = {
        slug: {**info[files[slug]], "alt": sources[slug]["alt"]} for slug in sources
    }
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(output, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"Wrote {len(output)} images to {output_path}")
    for slug, item in output.items():
        print(f"  {slug:<22} {item['credit']['license']:<14} {item['credit']['author'][:40]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
