import httpx

def fetch_page(url, name):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
    }
    try:
        r = httpx.get(url, headers=headers, timeout=15.0)
        print(f"{name} status: {r.status_code}")
        if r.status_code == 200:
            # Let's save a portion of the text or look for code blocks
            with open(f"scratch_{name}.html", "w", encoding="utf-8") as f:
                f.write(r.text)
            print(f"Saved {name} html.")
        else:
            print(r.text[:500])
    except Exception as e:
        print(f"Failed to fetch {name}: {e}")

if __name__ == "__main__":
    fetch_page("https://uiverse.io/andrew-manzyk/young-walrus-64", "mic")
    fetch_page("https://uiverse.io/Gautammsharma/perfect-insect-42", "bg")
