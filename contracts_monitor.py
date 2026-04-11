"""
UK Government Contracts Monitor
Searches Contracts Finder API for observability, monitoring, and related IT contracts.
Run this script to get an HTML report + CSV of matching contracts.

Usage:
    python contracts_monitor.py              # search and generate report
    python contracts_monitor.py --days 30    # search last 30 days (default: 90)
    python contracts_monitor.py --open-only  # only show contracts still open to bid
"""

import requests
import json
import csv
import os
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# ─────────────────────────────────────────────
# CONFIGURE YOUR SEARCH KEYWORDS HERE
# Add or remove keywords to match what you care about
# ─────────────────────────────────────────────
KEYWORD_GROUPS = {
    "Datadog": [
        "Datadog",
    ],
    "Dynatrace": [
        "Dynatrace",
    ],
    "Splunk": [
        "Splunk",
    ],
    "New Relic": [
        "New Relic",
        "NewRelic",
    ],
    "Observability & APM": [
        "observability",
        "application performance monitoring",
        "APM tooling",
        "full stack monitoring",
    ],
    "IT Monitoring": [
        "infrastructure monitoring",
        "cloud monitoring",
        "log management",
        "log monitoring",
        "synthetic monitoring",
        "real user monitoring",
        "site reliability",
    ],
    "SIEM & Security Monitoring": [
        "SIEM",
        "security information and event management",
        "security monitoring",
    ],
}

# ─────────────────────────────────────────────
# API SETTINGS — no need to change these
# ─────────────────────────────────────────────
API_URL = "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json"
RESULTS_PER_KEYWORD = 100
SEEN_FILE = "seen_contracts.json"
OUTPUT_HTML = "contracts_report.html"
OUTPUT_CSV = "contracts_report.csv"


def search_keyword(keyword: str, published_from: str, open_only: bool) -> list[dict]:
    """Call the Contracts Finder API for a single keyword."""
    statuses = ["active"] if open_only else ["planning", "active", "awarded", "closed"]
    payload = {
        "searchCriteria": {
            "keyword": keyword,
            "statuses": statuses,
            "publishedFrom": published_from,
        },
        "size": RESULTS_PER_KEYWORD,
    }
    try:
        resp = requests.post(
            API_URL,
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("notices", data.get("results", []))
    except requests.exceptions.RequestException as e:
        print(f"  Warning: request failed for '{keyword}': {e}")
        return []
    except (json.JSONDecodeError, KeyError):
        print(f"  Warning: unexpected response for '{keyword}'")
        return []


def extract_fields(notice: dict, matched_keyword: str, group: str) -> dict:
    """Pull the fields we care about from a raw API notice."""
    # The API can return slightly different shapes — handle both
    def get(*keys, default=""):
        obj = notice
        for k in keys:
            if isinstance(obj, dict):
                obj = obj.get(k, {})
            else:
                return default
        return obj if obj != {} else default

    title       = get("title") or get("tender", "title")
    notice_id   = get("id") or get("noticeId") or ""
    status      = get("noticeStatus") or get("status") or get("tender", "status") or ""
    org         = get("organisationName") or get("buyer", "name") or ""
    value_low   = get("valueLow") or get("tender", "minValue", "amount") or ""
    value_high  = get("valueHigh") or get("tender", "value", "amount") or ""
    deadline    = get("deadlineDate") or get("tender", "tenderPeriod", "endDate") or ""
    published   = get("publishedDate") or get("date") or ""
    awarded_to  = get("awardedSupplier", "name") or get("awards", 0, "suppliers", 0, "name") or ""
    awarded_val = get("awardedValue") or get("awards", 0, "value", "amount") or ""
    description = get("description") or get("tender", "description") or ""
    url = (
        f"https://www.contractsfinder.service.gov.uk/Notice/{notice_id}"
        if notice_id else ""
    )

    # Format value as £ string
    def fmt_value(v):
        try:
            return f"£{float(v):,.0f}"
        except (TypeError, ValueError):
            return str(v) if v else ""

    return {
        "id":           notice_id,
        "title":        title,
        "status":       status.capitalize() if status else "",
        "organisation": org,
        "value_low":    fmt_value(value_low),
        "value_high":   fmt_value(value_high),
        "awarded_to":   awarded_to,
        "awarded_value": fmt_value(awarded_val),
        "deadline":     deadline[:10] if deadline else "",
        "published":    published[:10] if published else "",
        "description":  (description[:300] + "…") if len(description) > 300 else description,
        "url":          url,
        "keyword":      matched_keyword,
        "group":        group,
    }


def load_seen() -> set:
    if Path(SEEN_FILE).exists():
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()


def save_seen(ids: set):
    with open(SEEN_FILE, "w") as f:
        json.dump(list(ids), f)


def run_search(days: int, open_only: bool) -> list[dict]:
    """Search all keyword groups and return deduplicated results."""
    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00")
    seen_ids = load_seen()
    all_results: dict[str, dict] = {}   # keyed by notice id for deduplication
    new_ids: set[str] = set()

    total_keywords = sum(len(v) for v in KEYWORD_GROUPS.values())
    done = 0

    for group, keywords in KEYWORD_GROUPS.items():
        for keyword in keywords:
            done += 1
            print(f"[{done}/{total_keywords}] Searching: {keyword!r}...")
            notices = search_keyword(keyword, since, open_only)
            for raw in notices:
                row = extract_fields(raw, keyword, group)
                nid = row["id"] or row["title"]  # fallback dedup key
                if nid and nid not in all_results:
                    all_results[nid] = row
                    if nid not in seen_ids:
                        row["is_new"] = True
                        new_ids.add(nid)
                    else:
                        row["is_new"] = False

    # Update seen file
    save_seen(seen_ids | new_ids)

    results = sorted(
        all_results.values(),
        key=lambda r: (not r.get("is_new"), r.get("published", ""), r.get("title", "")),
        reverse=False,
    )
    return results


def write_csv(results: list[dict]):
    if not results:
        return
    fields = ["title", "status", "organisation", "value_low", "value_high",
              "awarded_to", "awarded_value", "deadline", "published",
              "group", "keyword", "url", "description"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(results)
    print(f"CSV saved: {OUTPUT_CSV}")


def status_colour(status: str) -> str:
    s = status.lower()
    if "active" in s or "open" in s:
        return "#22c55e"   # green
    if "award" in s:
        return "#3b82f6"   # blue
    if "plan" in s:
        return "#f59e0b"   # amber
    return "#94a3b8"       # grey


def write_html(results: list[dict], days: int, open_only: bool):
    now = datetime.now().strftime("%d %B %Y %H:%M")
    new_count = sum(1 for r in results if r.get("is_new"))

    group_colours = {
        "Datadog":                  "#6366f1",
        "Dynatrace":                "#f97316",
        "Splunk":                   "#10b981",
        "New Relic":                "#06b6d4",
        "Observability & APM":      "#8b5cf6",
        "IT Monitoring":            "#ec4899",
        "SIEM & Security Monitoring": "#ef4444",
    }

    def badge(text, colour):
        return (f'<span style="background:{colour};color:#fff;padding:2px 8px;'
                f'border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap">'
                f'{text}</span>')

    rows_html = ""
    for r in results:
        new_marker = ' <span style="background:#fbbf24;color:#000;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">NEW</span>' if r.get("is_new") else ""
        gc = group_colours.get(r["group"], "#64748b")
        sc = status_colour(r["status"])
        value = r["value_high"] or r["value_low"] or r["awarded_value"] or "—"
        supplier = r["awarded_to"] or "—"
        deadline = r["deadline"] or "—"
        title_link = (f'<a href="{r["url"]}" target="_blank" style="color:#1d4ed8;text-decoration:none">{r["title"]}</a>'
                      if r["url"] else r["title"])
        desc = f'<div style="font-size:12px;color:#64748b;margin-top:4px">{r["description"]}</div>' if r["description"] else ""

        rows_html += f"""
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top">
            <div style="font-weight:600;font-size:14px">{title_link}{new_marker}</div>
            <div style="font-size:12px;color:#475569;margin-top:3px">{r['organisation']}</div>
            {desc}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap;vertical-align:top">
            {badge(r['status'] or '?', sc)}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;white-space:nowrap;vertical-align:top">
            {value}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top">
            {supplier}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;white-space:nowrap;vertical-align:top">
            {deadline}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:top">
            {badge(r['group'], gc)}
          </td>
        </tr>"""

    no_results = ""
    if not results:
        no_results = '<tr><td colspan="6" style="padding:40px;text-align:center;color:#64748b">No contracts found. Try increasing --days or checking your keywords.</td></tr>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UK Gov Contracts Monitor — {now}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin:0; background:#f8fafc; color:#1e293b }}
  .header {{ background:linear-gradient(135deg,#1e3a5f,#1d4ed8); color:#fff; padding:32px 40px }}
  .header h1 {{ margin:0 0 8px; font-size:24px }}
  .header p  {{ margin:0; opacity:0.8; font-size:14px }}
  .stats {{ display:flex; gap:20px; padding:24px 40px; flex-wrap:wrap }}
  .stat {{ background:#fff; border-radius:10px; padding:16px 24px; box-shadow:0 1px 3px rgba(0,0,0,.1); min-width:140px }}
  .stat .num {{ font-size:32px; font-weight:700; color:#1d4ed8 }}
  .stat .lbl {{ font-size:13px; color:#64748b }}
  .table-wrap {{ margin:0 40px 40px; background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.1); overflow:auto }}
  table {{ width:100%; border-collapse:collapse; font-size:13px }}
  thead {{ background:#f1f5f9 }}
  th {{ padding:12px 10px; text-align:left; font-size:12px; color:#64748b;
        text-transform:uppercase; letter-spacing:.05em; white-space:nowrap }}
  tr:hover td {{ background:#f8fafc }}
  .footer {{ text-align:center; padding:20px; color:#94a3b8; font-size:12px }}
</style>
</head>
<body>
<div class="header">
  <h1>UK Government Contracts Monitor</h1>
  <p>Observability · IT Monitoring · Datadog · Dynatrace · Splunk · New Relic &nbsp;|&nbsp;
     Generated {now} &nbsp;|&nbsp; Last {days} days{"  · Open only" if open_only else ""}</p>
</div>
<div class="stats">
  <div class="stat"><div class="num">{len(results)}</div><div class="lbl">Contracts found</div></div>
  <div class="stat"><div class="num" style="color:#f59e0b">{new_count}</div><div class="lbl">New since last run</div></div>
  <div class="stat"><div class="num" style="color:#22c55e">{sum(1 for r in results if 'active' in r['status'].lower())}</div><div class="lbl">Open to bid</div></div>
  <div class="stat"><div class="num" style="color:#3b82f6">{sum(1 for r in results if 'award' in r['status'].lower())}</div><div class="lbl">Awarded</div></div>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Contract / Buyer</th>
        <th>Status</th>
        <th>Value</th>
        <th>Awarded to</th>
        <th>Deadline</th>
        <th>Category</th>
      </tr>
    </thead>
    <tbody>
      {rows_html or no_results}
    </tbody>
  </table>
</div>
<div class="footer">
  Source: UK Government Contracts Finder API &nbsp;·&nbsp;
  <a href="https://www.contractsfinder.service.gov.uk" target="_blank">contractsfinder.service.gov.uk</a>
</div>
</body>
</html>"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML report saved: {OUTPUT_HTML}")


def main():
    parser = argparse.ArgumentParser(description="Search UK Contracts Finder for monitoring/observability contracts")
    parser.add_argument("--days", type=int, default=90,
                        help="How many days back to search (default: 90)")
    parser.add_argument("--open-only", action="store_true",
                        help="Only return contracts currently open to bid")
    args = parser.parse_args()

    print(f"\nUK Gov Contracts Monitor")
    print(f"{'─' * 40}")
    print(f"Searching last {args.days} days{'  (open only)' if args.open_only else ''}\n")

    results = run_search(args.days, args.open_only)

    print(f"\nFound {len(results)} contracts total")
    new_count = sum(1 for r in results if r.get("is_new"))
    if new_count:
        print(f"  → {new_count} NEW since last run")

    write_csv(results)
    write_html(results, args.days, args.open_only)

    print(f"\nDone. Open {OUTPUT_HTML} in your browser to see the report.")

    # Print a quick text summary
    if results:
        print(f"\nTop results:")
        for r in results[:10]:
            marker = " [NEW]" if r.get("is_new") else ""
            value = r["value_high"] or r["value_low"] or r["awarded_value"] or ""
            val_str = f"  {value}" if value else ""
            print(f"  • {r['title'][:70]}{marker}")
            print(f"    {r['organisation']} | {r['status']}{val_str} | {r['group']}")


if __name__ == "__main__":
    main()
