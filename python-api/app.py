from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import urllib.parse
import re
import json

app = Flask(__name__)
CORS(app)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def search_duckduckgo(query):
    """Scrape DuckDuckGo search results — more reliable than Google."""
    results = []
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query + ' trending 2025 2026')}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        for item in soup.select(".result"):
            title_el = item.select_one(".result__a")
            snippet_el = item.select_one(".result__snippet")
            link_el = item.select_one(".result__a")

            title = title_el.get_text(strip=True) if title_el else None
            if not title:
                continue

            # DuckDuckGo wraps links in a redirect
            raw_link = link_el.get("href", "") if link_el else ""
            link = raw_link
            if "uddg=" in raw_link:
                match = re.search(r"uddg=([^&]+)", raw_link)
                if match:
                    link = urllib.parse.unquote(match.group(1))

            snippet = snippet_el.get_text(strip=True) if snippet_el else ""
            source = ""
            if link:
                try:
                    source = urllib.parse.urlparse(link).netloc.replace("www.", "")
                except:
                    pass

            results.append({
                "title": title,
                "price": "",
                "source": source,
                "link": link,
                "image": "",
                "snippet": snippet,
            })
            if len(results) >= 5:
                break
    except Exception as e:
        print(f"DuckDuckGo error: {e}")
    return results


def search_duckduckgo_shopping(query):
    """Try DuckDuckGo for product/shopping results."""
    results = []
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote('buy ' + query + ' best')}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        for item in soup.select(".result"):
            title_el = item.select_one(".result__a")
            snippet_el = item.select_one(".result__snippet")
            link_el = item.select_one(".result__a")

            title = title_el.get_text(strip=True) if title_el else None
            if not title:
                continue

            raw_link = link_el.get("href", "") if link_el else ""
            link = raw_link
            if "uddg=" in raw_link:
                match = re.search(r"uddg=([^&]+)", raw_link)
                if match:
                    link = urllib.parse.unquote(match.group(1))

            snippet = snippet_el.get_text(strip=True) if snippet_el else ""

            # Try to extract price from snippet
            price = ""
            price_match = re.search(r"\$[\d,]+\.?\d*", snippet)
            if price_match:
                price = price_match.group(0)

            source = ""
            if link:
                try:
                    source = urllib.parse.urlparse(link).netloc.replace("www.", "")
                except:
                    pass

            results.append({
                "title": title,
                "price": price,
                "source": source,
                "link": link,
                "image": "",
                "snippet": snippet,
            })
            if len(results) >= 5:
                break
    except Exception as e:
        print(f"DuckDuckGo shopping error: {e}")
    return results


def try_fetch_og_image(url):
    """Try to fetch the Open Graph image from a page."""
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


@app.route("/api/trends/live", methods=["POST"])
def live_trends():
    data = request.get_json()
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "Query is required"}), 400

    # Search both trending and shopping results
    trending = search_duckduckgo(query)
    shopping = search_duckduckgo_shopping(query)

    # Merge and deduplicate
    all_results = []
    seen = set()

    for item in shopping + trending:
        key = item["title"].lower()[:30]
        if key not in seen:
            seen.add(key)
            # Try to get an image from the page
            if not item["image"] and item["link"]:
                item["image"] = try_fetch_og_image(item["link"])
            all_results.append(item)
        if len(all_results) >= 5:
            break

    return jsonify({"results": all_results, "query": query, "count": len(all_results)})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "trend-finder-python"})


if __name__ == "__main__":
    app.run(port=5002, debug=True)
