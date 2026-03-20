"""
Server 2 — Python Flask at localhost:5001
Handles all scraping and extraction:
  - /api/trending?q=        Search Google News RSS, Reddit, Hacker News
  - /api/extract             Fetch article, extract text, send to Gemini Flash for ranked ideas
  - /api/export/csv          Export selected ideas to CSV
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import csv
import io
import os
import json
import xml.etree.ElementTree as ET
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}


# =============================================================================
# SOURCE SCRAPERS
# =============================================================================

def resolve_google_news_url(gnews_url):
    """Resolve a Google News redirect URL to the actual article URL."""
    try:
        # Method 1: Follow GET redirect (some URLs work this way)
        resp = requests.get(gnews_url, headers=HEADERS, timeout=8, allow_redirects=True)
        if resp.url and "news.google.com" not in resp.url:
            return resp.url
        # Method 2: Parse the redirect page for the actual link
        soup = BeautifulSoup(resp.text, "html.parser")
        meta = soup.find("meta", attrs={"http-equiv": "refresh"})
        if meta and meta.get("content"):
            match = re.search(r"url=(.+)", meta["content"], re.IGNORECASE)
            if match:
                return match.group(1).strip()
        # Method 3: Look for a data-url or canonical link
        canonical = soup.find("link", rel="canonical")
        if canonical and canonical.get("href"):
            return canonical["href"]
        for a in soup.select("a[href]"):
            href = a["href"]
            if href.startswith("http") and "news.google.com" not in href and "google.com" not in href:
                return href
    except:
        pass
    return gnews_url


def search_google_news_rss(query):
    results = []
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        root = ET.fromstring(resp.content)
        for item in root.findall(".//item"):
            title = item.findtext("title", "").strip()
            raw_link = item.findtext("link", "").strip()
            pub_date = item.findtext("pubDate", "").strip()
            source_el = item.find("source")
            source = source_el.text.strip() if source_el is not None and source_el.text else ""
            if not title:
                continue

            # Resolve the actual article URL
            link = resolve_google_news_url(raw_link) if "news.google.com" in raw_link else raw_link
            image = fetch_og_image(link)

            results.append({
                "title": title, "link": link,
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
            if not image:
                preview = post.get("preview", {})
                images = preview.get("images", [])
                if images:
                    image = images[0].get("source", {}).get("url", "").replace("&amp;", "&")
            results.append({
                "title": title, "link": link,
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
            image = fetch_og_image(link) if link.startswith("http") else ""
            results.append({
                "title": title, "link": link,
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
# ARTICLE TEXT EXTRACTION + GEMINI AI
# =============================================================================

def fetch_article_text(url):
    """Fetch article HTML and extract clean body text (no nav, sidebar, footer)."""
    try:
        # Google News links redirect — follow them
        if "news.google.com" in url:
            try:
                head = requests.head(url, headers=HEADERS, timeout=8, allow_redirects=True)
                if head.url and head.url != url:
                    url = head.url
            except:
                pass

        resp = requests.get(url, headers=HEADERS, timeout=12, allow_redirects=True)
        if resp.status_code != 200:
            return None, None
        soup = BeautifulSoup(resp.text, "html.parser")

        # Get page title
        title_tag = soup.find("title")
        page_title = title_tag.get_text(strip=True) if title_tag else ""

        # Remove noise elements
        for tag in soup.select("script, style, nav, footer, header, aside, .ad, .sidebar, .related, .comments, form, .cookie, .popup, .modal, iframe, svg"):
            tag.decompose()

        # Try to find the main article body
        article = soup.select_one("article, [role=main], main, .post-content, .article-body, .entry-content, .content-body")
        if article:
            text = article.get_text(separator="\n", strip=True)
        else:
            text = soup.body.get_text(separator="\n", strip=True) if soup.body else ""

        # Clean up: remove excess whitespace, keep meaningful lines
        lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 10]
        clean_text = "\n".join(lines)

        # Limit to ~8000 chars to stay within Gemini context
        if len(clean_text) > 8000:
            clean_text = clean_text[:8000]

        return page_title, clean_text, soup
    except Exception as e:
        print(f"Fetch article error: {e}")
        return None, None, None


def build_extraction_prompt(article_text, article_title, article_url):
    """Build the AI prompt for idea extraction."""
    return f"""You are a trend research assistant. Your job is to read the article below and find the ranked list of products, tools, ideas, or recommendations.

CRITICAL RULES:
1. ONLY extract items from the article's main content — the actual editorial list or review
2. NEVER include: navigation menus, sidebar links, footer links, "Related articles", ads, author bios, or page layout elements
3. Each item must be a specific, named product, tool, service, or concrete idea (e.g. "Sony WF-1000XM5" not "Best Overall" or "Our Pick")
4. If the article ranks items (1st, 2nd, 3rd or "Best", "Runner-up"), preserve that ranking
5. If the article discusses ideas without ranking, order them by how prominently they appear
6. Include a 1-sentence description explaining what makes each item noteworthy, based on the article
7. Return between 3 and 10 items — only include items the article actually discusses

Return ONLY valid JSON with this structure (no markdown, no explanation):
{{
  "title": "{article_title}",
  "url": "{article_url}",
  "items": [
    {{"rank": 1, "name": "Specific product or idea name", "description": "Why the article highlights this item"}},
    {{"rank": 2, "name": "...", "description": "..."}}
  ]
}}

---
ARTICLE TEXT:
{article_text}
"""


def parse_ai_response(raw_text):
    """Parse JSON from AI response, stripping markdown fences if present."""
    raw_text = raw_text.strip()
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)
    return json.loads(raw_text)


def extract_via_gemini(prompt):
    """PRIMARY: Use Gemini Flash AI to extract ideas."""
    if not GEMINI_KEY:
        raise Exception("GEMINI_API_KEY not configured")

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(prompt)
    result = parse_ai_response(response.text)
    print(f"[Extract] Gemini succeeded: {len(result.get('items', []))} items")
    return result


def extract_via_groq(prompt):
    """FALLBACK 1: Use Groq/LLaMA if Gemini is unavailable or rate-limited."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise Exception("GROQ_API_KEY not configured")

    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 2000,
        },
        timeout=30,
    )
    data = resp.json()
    raw = data["choices"][0]["message"]["content"]
    result = parse_ai_response(raw)
    print(f"[Extract] Groq fallback succeeded: {len(result.get('items', []))} items")
    return result


def extract_via_html_patterns(soup, page_title, url):
    """FALLBACK 2 (last resort): Basic HTML pattern matching if all AI fails."""
    print("[Extract] Using HTML pattern fallback")
    items = []
    skip = ("table of", "related", "conclusion", "faq", "sign up", "subscribe",
            "cookie", "privacy", "newsletter", "comments", "advertisement", "share")

    for heading in soup.select("h2, h3"):
        text = heading.get_text(strip=True)
        cleaned = re.sub(r"^\d+[\.\)\-\:]\s*", "", text).strip()
        if 4 < len(cleaned) < 120 and not any(cleaned.lower().startswith(s) for s in skip):
            desc = ""
            for sib in heading.find_next_siblings():
                if sib.name in ("h2", "h3"):
                    break
                if sib.name == "p" and len(sib.get_text(strip=True)) > 20:
                    desc = sib.get_text(strip=True)[:200]
                    break
            if cleaned not in [i["name"] for i in items]:
                items.append({"rank": len(items) + 1, "name": cleaned, "description": desc})
            if len(items) >= 10:
                break

    return {"title": page_title, "url": url, "items": items, "method": "html_fallback"}


def extract_ideas(article_text, article_title, article_url, soup=None):
    """
    Extract ideas using a clear priority chain:
      1. Gemini Flash AI (primary)
      2. Groq/LLaMA AI (fallback if Gemini fails)
      3. HTML pattern matching (last resort if all AI fails)
    """
    prompt = build_extraction_prompt(article_text, article_title, article_url)

    # === PRIMARY: Gemini ===
    try:
        result = extract_via_gemini(prompt)
        if result.get("items"):
            result["method"] = "gemini"
            return result
    except Exception as e:
        print(f"[Extract] Gemini failed: {e}")

    # === FALLBACK 1: Groq ===
    try:
        result = extract_via_groq(prompt)
        if result.get("items"):
            result["method"] = "groq"
            return result
    except Exception as e:
        print(f"[Extract] Groq failed: {e}")

    # === FALLBACK 2: HTML patterns (last resort) ===
    if soup:
        result = extract_via_html_patterns(soup, article_title, article_url)
        if result.get("items"):
            return result

    return {"error": "All extraction methods failed (Gemini, Groq, HTML)", "title": article_title, "url": article_url, "items": []}


# =============================================================================
# CSV EXPORT
# =============================================================================

def build_csv(items):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rank", "Name", "Description", "Source Article", "Article URL"])
    for item in items:
        writer.writerow([
            item.get("rank", ""),
            item.get("name", ""),
            item.get("description", ""),
            item.get("source", ""),
            item.get("articleUrl", ""),
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


def fetch_og_image(url):
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
    """Search Google News RSS, Reddit, Hacker News. Returns top 5."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Query parameter 'q' is required"}), 400

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


@app.route("/api/extract", methods=["GET", "POST"])
def extract():
    """Fetch article, extract text, send to Gemini Flash for ranked ideas."""
    if request.method == "GET":
        url = request.args.get("url", "").strip()
    else:
        data = request.get_json() or {}
        url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required (pass as ?url= or JSON body)"}), 400

    # Step 1: Fetch and clean article text
    page_title, article_text, soup = fetch_article_text(url)
    if not article_text:
        return jsonify({"error": "Could not fetch article content", "url": url}), 422

    # Step 2: Extract ideas — Gemini (primary) → Groq (fallback) → HTML (last resort)
    result = extract_ideas(article_text, page_title or "", url, soup=soup)

    if "error" in result and not result.get("items"):
        return jsonify(result), 500

    return jsonify(result)


@app.route("/api/export/csv", methods=["POST"])
def export_csv():
    """Export selected ideas to CSV file."""
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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "trend-finder-python",
        "version": "3.0",
        "gemini": "configured" if GEMINI_KEY else "missing",
    })


if __name__ == "__main__":
    print(f"Gemini API: {'configured' if GEMINI_KEY else 'NOT SET — add GEMINI_API_KEY to .env'}")
    app.run(port=5001, debug=True)
