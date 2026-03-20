from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import csv
import io
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}


# =============================================================================
# STEP 1 — SEARCH SYSTEM: Google News RSS, Reddit, Hacker News
# =============================================================================

def search_google_news_rss(query):
    """Search Google News RSS feed for trending articles."""
    results = []
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        root = ET.fromstring(resp.content)
        for item in root.findall(".//item"):
            title = item.findtext("title", "").strip()
            link = item.findtext("link", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            source_el = item.find("source")
            source = source_el.text.strip() if source_el is not None and source_el.text else ""

            if not title:
                continue

            # Try to get OG image
            image = try_fetch_og_image(link)

            results.append({
                "title": title,
                "link": link,
                "source": source or extract_domain(link),
                "image": image,
                "snippet": f"Published {pub_date}" if pub_date else "",
                "origin": "Google News",
            })
            if len(results) >= 5:
                break
    except Exception as e:
        print(f"Google News RSS error: {e}")
    return results


def search_reddit(query):
    """Search Reddit for trending posts."""
    results = []
    url = f"https://www.reddit.com/search.json?q={urllib.parse.quote(query)}&sort=hot&limit=5&t=month"
    try:
        reddit_headers = {**HEADERS, "Accept": "application/json"}
        resp = requests.get(url, headers=reddit_headers, timeout=10)
        data = resp.json()
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            title = post.get("title", "").strip()
            if not title:
                continue

            permalink = post.get("permalink", "")
            link = f"https://www.reddit.com{permalink}" if permalink else ""
            subreddit = post.get("subreddit_name_prefixed", "")
            score = post.get("score", 0)
            num_comments = post.get("num_comments", 0)
            thumbnail = post.get("thumbnail", "")
            image = thumbnail if thumbnail and thumbnail.startswith("http") else ""

            # Try post image or preview
            if not image:
                preview = post.get("preview", {})
                images = preview.get("images", [])
                if images:
                    image = images[0].get("source", {}).get("url", "").replace("&amp;", "&")

            results.append({
                "title": title,
                "link": link,
                "source": subreddit or "Reddit",
                "image": image,
                "snippet": f"{score:,} upvotes · {num_comments:,} comments",
                "origin": "Reddit",
            })
            if len(results) >= 5:
                break
    except Exception as e:
        print(f"Reddit error: {e}")
    return results


def search_hacker_news(query):
    """Search Hacker News via Algolia API."""
    results = []
    url = f"https://hn.algolia.com/api/v1/search?query={urllib.parse.quote(query)}&tags=story&hitsPerPage=5"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        data = resp.json()
        for hit in data.get("hits", []):
            title = hit.get("title", "").strip()
            if not title:
                continue

            link = hit.get("url", "")
            if not link:
                link = f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}"
            points = hit.get("points", 0)
            num_comments = hit.get("num_comments", 0)

            image = try_fetch_og_image(link) if link.startswith("http") else ""

            results.append({
                "title": title,
                "link": link,
                "source": extract_domain(link) or "Hacker News",
                "image": image,
                "snippet": f"{points:,} points · {num_comments:,} comments on HN",
                "origin": "Hacker News",
            })
            if len(results) >= 5:
                break
    except Exception as e:
        print(f"Hacker News error: {e}")
    return results


# =============================================================================
# STEP 2 — EXTRACT IDEAS: Parse article content for product/idea lists
# =============================================================================

def extract_ideas_from_url(url):
    """Scrape an article and extract product names, ideas, or list items."""
    ideas = []
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
        if resp.status_code != 200:
            print(f"Extract: HTTP {resp.status_code} for {url}")
            return ideas

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noise
        for tag in soup.select("script, style, nav, footer, header, aside, .ad, .sidebar, .related, .comments, form"):
            tag.decompose()

        skip_words = ("table of", "related", "conclusion", "faq", "what is", "how to",
                      "why", "share this", "advertisement", "sponsored", "sign up",
                      "subscribe", "cookie", "privacy", "read more", "see also",
                      "more from", "you may also", "newsletter", "comments")

        def is_valid(text):
            t = text.lower()
            return 4 < len(text) < 120 and not any(t.startswith(s) for s in skip_words)

        # Strategy 1: Headings (h2, h3, h4) — most articles use these for product names
        for heading in soup.select("h2, h3, h4"):
            text = heading.get_text(strip=True)
            cleaned = re.sub(r"^\d+[\.\)\-\:]\s*", "", text).strip()
            if not is_valid(cleaned):
                continue

            # Get description from next paragraph(s)
            desc = ""
            for sib in heading.find_next_siblings():
                if sib.name in ("h2", "h3", "h4"):
                    break
                if sib.name in ("p", "div", "span"):
                    t = sib.get_text(strip=True)
                    if len(t) > 20:
                        desc = t[:250]
                        break

            # Find image nearby — check siblings and parent
            img = ""
            for scope in [heading.parent, heading]:
                if scope:
                    for img_el in (scope.select("img[src]") or []):
                        src = img_el.get("src", "")
                        if src.startswith("http") and "logo" not in src.lower() and "icon" not in src.lower():
                            img = src
                            break
                if img:
                    break

            ideas.append({"name": cleaned, "description": desc, "image": img})

        # Strategy 2: Bold text inside paragraphs (many listicles use <strong>)
        if len(ideas) < 3:
            for bold in soup.select("p strong, p b, li strong, li b"):
                text = bold.get_text(strip=True)
                cleaned = re.sub(r"^\d+[\.\)\-\:]\s*", "", text).strip()
                if is_valid(cleaned) and cleaned not in [i["name"] for i in ideas]:
                    parent_text = bold.parent.get_text(strip=True) if bold.parent else ""
                    desc = parent_text[:250] if parent_text != cleaned else ""
                    ideas.append({"name": cleaned[:100], "description": desc, "image": ""})

        # Strategy 3: List items with substance
        if len(ideas) < 3:
            for li in soup.select("li"):
                text = li.get_text(strip=True)
                cleaned = re.sub(r"^\d+[\.\)\-\:]\s*", "", text).strip()
                if 8 < len(cleaned) < 200 and cleaned[0].isupper():
                    if any(s in cleaned.lower() for s in skip_words):
                        continue
                    name = re.split(r"\s[\-–—]\s|:\s", cleaned)[0].strip()
                    if len(name) > 4 and name not in [i["name"] for i in ideas]:
                        desc = cleaned if cleaned != name else ""
                        ideas.append({"name": name[:100], "description": desc[:250], "image": ""})

        # Strategy 4: Extract from page title if nothing found
        if len(ideas) == 0:
            title = soup.find("title")
            if title:
                ideas.append({
                    "name": title.get_text(strip=True)[:100],
                    "description": "Full article — ideas could not be auto-extracted. Visit the link to read manually.",
                    "image": "",
                })

        # Deduplicate and limit to 10
        seen = set()
        unique = []
        for idea in ideas:
            key = idea["name"].lower()[:30]
            if key not in seen and len(idea["name"]) > 3:
                seen.add(key)
                unique.append(idea)
            if len(unique) >= 10:
                break

        return unique
    except Exception as e:
        print(f"Extract ideas error for {url}: {e}")
        return ideas


# =============================================================================
# STEP 4 — CSV EXPORT
# =============================================================================

def build_csv(items):
    """Build a CSV string from a list of selected ideas."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Description", "Source Article", "Article URL", "Image URL"])
    for item in items:
        writer.writerow([
            item.get("name", ""),
            item.get("description", ""),
            item.get("source", ""),
            item.get("articleUrl", ""),
            item.get("image", ""),
        ])
    return output.getvalue()


# =============================================================================
# HELPERS
# =============================================================================

def extract_domain(url):
    try:
        return urllib.parse.urlparse(url).netloc.replace("www.", "")
    except:
        return ""


def try_fetch_og_image(url):
    """Fetch Open Graph image from a page."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=5, allow_redirects=True)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            og = soup.find("meta", property="og:image")
            if og and og.get("content"):
                img = og["content"]
                if img.startswith("http"):
                    return img
    except:
        pass
    return ""


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.route("/api/trending", methods=["GET"])
def trending():
    """Step 1: Search Google News RSS, Reddit, and Hacker News."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Query parameter 'q' is required"}), 400

    # Search all 3 sources in sequence
    google_results = search_google_news_rss(query)
    reddit_results = search_reddit(query)
    hn_results = search_hacker_news(query)

    # Merge: take top from each source, deduplicate
    all_results = []
    seen = set()
    for item in google_results + reddit_results + hn_results:
        key = item["title"].lower()[:40]
        if key not in seen:
            seen.add(key)
            all_results.append(item)
        if len(all_results) >= 5:
            break

    # If we don't have 5, pad from remaining
    if len(all_results) < 5:
        for item in reddit_results + hn_results + google_results:
            key = item["title"].lower()[:40]
            if key not in seen:
                seen.add(key)
                all_results.append(item)
            if len(all_results) >= 5:
                break

    return jsonify({
        "query": query,
        "count": len(all_results),
        "results": all_results,
        "sources": {
            "google_news": len(google_results),
            "reddit": len(reddit_results),
            "hacker_news": len(hn_results),
        },
    })


@app.route("/api/extract", methods=["POST"])
def extract():
    """Step 2: Extract product/idea lists from an article URL."""
    data = request.get_json()
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL is required"}), 400

    ideas = extract_ideas_from_url(url)
    return jsonify({"url": url, "count": len(ideas), "ideas": ideas})


@app.route("/api/export/csv", methods=["POST"])
def export_csv():
    """Step 4: Export selected ideas to CSV."""
    data = request.get_json()
    items = data.get("items", [])
    if not items:
        return jsonify({"error": "No items to export"}), 400

    csv_content = build_csv(items)
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=trend-ideas.csv"},
    )


# Keep the old endpoint for backwards compatibility
@app.route("/api/trends/live", methods=["POST"])
def live_trends():
    data = request.get_json()
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "Query is required"}), 400

    google_results = search_google_news_rss(query)
    reddit_results = search_reddit(query)
    hn_results = search_hacker_news(query)

    all_results = []
    seen = set()
    for item in google_results + reddit_results + hn_results:
        key = item["title"].lower()[:40]
        if key not in seen:
            seen.add(key)
            all_results.append(item)
        if len(all_results) >= 5:
            break

    return jsonify({"results": all_results, "query": query, "count": len(all_results)})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "trend-finder-python", "version": "2.0"})


if __name__ == "__main__":
    app.run(port=5002, debug=True)
