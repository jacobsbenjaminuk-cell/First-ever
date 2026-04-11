"""
UK Government Contracts Monitor
Searches multiple UK government APIs for observability, monitoring, and IT contracts.

Sources:
  1. Contracts Finder API  — lower-value contracts, keyword search
  2. Find a Tender API     — high-value contracts (>£140k), all procurement stages
  3. Dept Spending CSVs   — actual transactions >£25k from gov departments (optional)

Usage:
    python contracts_monitor.py                   # search all sources, last 90 days
    python contracts_monitor.py --days 30         # search last 30 days
    python contracts_monitor.py --open-only       # only contracts open to bid
    python contracts_monitor.py --source cf       # Contracts Finder only
    python contracts_monitor.py --source fat      # Find a Tender only
    python contracts_monitor.py --source all      # all sources (default)
"""

import requests
import json
import csv
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# ─────────────────────────────────────────────
# CONFIGURE YOUR SEARCH KEYWORDS HERE
# ─────────────────────────────────────────────
KEYWORD_GROUPS = {
    "Datadog": ["Datadog"],
    "Dynatrace": ["Dynatrace"],
    "Splunk": ["Splunk"],
    "New Relic": ["New Relic", "NewRelic"],
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

# Flat list for client-side filtering (used by Find a Tender)
ALL_KEYWORDS = [kw.lower() for kws in KEYWORD_GROUPS.values() for kw in kws]

# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────
CF_API   = "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json"
FAT_API  = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"

RESULTS_PER_KEYWORD = 100
FAT_PAGE_SIZE       = 100       # Find a Tender max per page
FAT_MAX_PAGES       = 20        # cap at 2000 notices to keep runtime sensible

SEEN_FILE   = "seen_contracts.json"
OUTPUT_HTML = "contracts_report.html"
OUTPUT_CSV  = "contracts_report.csv"


# ══════════════════════════════════════════════
#  SOURCE 1 — CONTRACTS FINDER
# ══════════════════════════════════════════════

def cf_search_keyword(keyword: str, published_from: str, open_only: bool) -> list[dict]:
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
            CF_API,
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("notices", data.get("results", []))
    except Exception as e:
        print(f"    [CF] Warning: '{keyword}' failed — {e}")
        return []


def cf_extract(notice: dict, keyword: str, group: str) -> dict:
    def g(*keys, default=""):
        obj = notice
        for k in keys:
            obj = obj.get(k, {}) if isinstance(obj, dict) else {}
        return obj if obj not in ({}, None) else default

    title       = g("title") or g("tender", "title") or ""
    notice_id   = g("id") or g("noticeId") or ""
    status      = g("noticeStatus") or g("status") or g("tender", "status") or ""
    org         = g("organisationName") or g("buyer", "name") or ""
    value_low   = g("valueLow") or ""
    value_high  = g("valueHigh") or ""
    deadline    = g("deadlineDate") or g("tender", "tenderPeriod", "endDate") or ""
    published   = g("publishedDate") or g("date") or ""
    awarded_to  = g("awardedSupplier", "name") or ""
    awarded_val = g("awardedValue") or ""
    description = g("description") or g("tender", "description") or ""
    url = f"https://www.contractsfinder.service.gov.uk/Notice/{notice_id}" if notice_id else ""

    return _row(title, notice_id, status, org, value_low, value_high,
                awarded_to, awarded_val, deadline, published, description,
                url, keyword, group, "Contracts Finder")


# ══════════════════════════════════════════════
#  SOURCE 2 — FIND A TENDER (OCDS)
# ══════════════════════════════════════════════

def fat_fetch_all(updated_from: str, open_only: bool) -> list[dict]:
    """
    Pull recent OCDS release packages from Find a Tender.
    No keyword filter — we apply keyword matching client-side.
    Requires no API key.
    """
    stages = ["tender"] if open_only else []  # empty = all stages
    params = {
        "updatedFrom": updated_from,
        "limit": FAT_PAGE_SIZE,
    }
    if stages:
        params["stages"] = ",".join(stages)

    all_releases = []
    cursor = None
    page = 0

    while page < FAT_MAX_PAGES:
        if cursor:
            params["cursor"] = cursor
        try:
            resp = requests.get(FAT_API, params=params, timeout=20)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"    [FAT] Page {page+1} failed — {e}")
            break

        releases = data.get("releases", [])
        all_releases.extend(releases)

        cursor = data.get("links", {}).get("next")
        if not cursor or not releases:
            break
        page += 1

    return all_releases


def fat_keyword_match(release: dict) -> tuple[str, str]:
    """Return (matched_keyword, group) if any keyword matches, else ('','')."""
    # Build a searchable text blob from the release
    tender   = release.get("tender", {})
    title    = (tender.get("title") or "").lower()
    desc     = (tender.get("description") or "").lower()
    text     = title + " " + desc

    for group, keywords in KEYWORD_GROUPS.items():
        for kw in keywords:
            if kw.lower() in text:
                return kw, group
    return "", ""


def fat_extract(release: dict, keyword: str, group: str) -> dict:
    tender  = release.get("tender", {})
    buyer   = release.get("buyer", {})
    awards  = release.get("awards", [{}])
    award   = awards[0] if awards else {}

    title       = tender.get("title") or ""
    notice_id   = release.get("id") or ""
    status      = tender.get("status") or ""
    org         = buyer.get("name") or ""
    value_low   = tender.get("minValue", {}).get("amount") or ""
    value_high  = tender.get("value", {}).get("amount") or ""
    deadline    = tender.get("tenderPeriod", {}).get("endDate") or ""
    published   = release.get("date") or ""
    awarded_to  = ""
    awarded_val = ""
    description = tender.get("description") or ""

    # Extract award info
    if award:
        suppliers = award.get("suppliers", [{}])
        awarded_to  = suppliers[0].get("name") or "" if suppliers else ""
        awarded_val = award.get("value", {}).get("amount") or ""

    # Build URL from OCID or notice ID
    ocid = release.get("ocid") or ""
    if ocid:
        # OCID format: ocds-h6vhtk-XXXXXX → notice ref
        url = f"https://www.find-tender.service.gov.uk/Search/Results?q={ocid}"
    else:
        url = ""

    return _row(title, notice_id, status, org, value_low, value_high,
                awarded_to, awarded_val, deadline, published, description,
                url, keyword, group, "Find a Tender")


# ══════════════════════════════════════════════
#  SHARED HELPERS
# ══════════════════════════════════════════════

def _fmt_value(v) -> str:
    try:
        return f"£{float(v):,.0f}"
    except (TypeError, ValueError):
        return str(v) if v else ""


def _row(title, nid, status, org, val_lo, val_hi, awarded_to, awarded_val,
         deadline, published, description, url, keyword, group, source) -> dict:
    return {
        "id":            nid,
        "title":         title,
        "status":        status.capitalize() if status else "",
        "organisation":  org,
        "value_low":     _fmt_value(val_lo),
        "value_high":    _fmt_value(val_hi),
        "awarded_to":    awarded_to,
        "awarded_value": _fmt_value(awarded_val),
        "deadline":      (deadline or "")[:10],
        "published":     (published or "")[:10],
        "description":   (description[:300] + "…") if len(description) > 300 else description,
        "url":           url,
        "keyword":       keyword,
        "group":         group,
        "source":        source,
        "is_new":        False,
    }


def load_seen() -> set:
    if Path(SEEN_FILE).exists():
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()


def save_seen(ids: set):
    with open(SEEN_FILE, "w") as f:
        json.dump(list(ids), f)


# ══════════════════════════════════════════════
#  ORCHESTRATION
# ══════════════════════════════════════════════

def run_search(days: int, open_only: bool, source: str) -> list[dict]:
    since_cf  = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00")
    since_fat = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    seen_ids = load_seen()
    all_results: dict[str, dict] = {}
    new_ids: set[str] = set()

    # ── Contracts Finder ──────────────────────
    if source in ("cf", "all"):
        total = sum(len(v) for v in KEYWORD_GROUPS.values())
        done  = 0
        print(f"\n[Contracts Finder] Searching {total} keywords...")
        for group, keywords in KEYWORD_GROUPS.items():
            for kw in keywords:
                done += 1
                print(f"  [{done}/{total}] {kw!r}")
                for raw in cf_search_keyword(kw, since_cf, open_only):
                    row = cf_extract(raw, kw, group)
                    _upsert(row, all_results, seen_ids, new_ids)

    # ── Find a Tender ─────────────────────────
    if source in ("fat", "all"):
        print(f"\n[Find a Tender] Fetching recent high-value notices...")
        releases = fat_fetch_all(since_fat, open_only)
        print(f"  Fetched {len(releases)} notices — filtering by keyword...")
        matched = 0
        for rel in releases:
            kw, group = fat_keyword_match(rel)
            if kw:
                row = fat_extract(rel, kw, group)
                _upsert(row, all_results, seen_ids, new_ids)
                matched += 1
        print(f"  {matched} keyword matches found")

    save_seen(seen_ids | new_ids)

    return sorted(
        all_results.values(),
        key=lambda r: (not r["is_new"], r["published"], r["title"]),
    )


def _upsert(row, all_results, seen_ids, new_ids):
    key = row["id"] or row["title"]
    if not key:
        return
    if key not in all_results:
        all_results[key] = row
        if key not in seen_ids:
            row["is_new"] = True
            new_ids.add(key)


# ══════════════════════════════════════════════
#  OUTPUT
# ══════════════════════════════════════════════

def write_csv(results: list[dict]):
    fields = ["title", "status", "source", "organisation", "value_low", "value_high",
              "awarded_to", "awarded_value", "deadline", "published",
              "group", "keyword", "url", "description"]
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fieldnames=fields, extrasaction="ignore").writerows(
            [dict(zip(fields, fields))] + results   # header trick
        )
    # Proper header
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(results)
    print(f"CSV saved:  {OUTPUT_CSV}")


def status_colour(status: str) -> str:
    s = status.lower()
    if "active" in s or "open" in s:   return "#22c55e"
    if "award" in s:                    return "#3b82f6"
    if "plan" in s:                     return "#f59e0b"
    return "#94a3b8"


SOURCE_COLOURS = {
    "Contracts Finder": "#6366f1",
    "Find a Tender":    "#0ea5e9",
}

GROUP_COLOURS = {
    "Datadog":                   "#6366f1",
    "Dynatrace":                 "#f97316",
    "Splunk":                    "#10b981",
    "New Relic":                 "#06b6d4",
    "Observability & APM":       "#8b5cf6",
    "IT Monitoring":             "#ec4899",
    "SIEM & Security Monitoring":"#ef4444",
}


def badge(text, colour):
    return (f'<span style="background:{colour};color:#fff;padding:2px 8px;'
            f'border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap">'
            f'{text}</span>')


def write_html(results: list[dict], days: int, open_only: bool, source: str):
    now       = datetime.now().strftime("%d %B %Y %H:%M")
    new_count = sum(1 for r in results if r.get("is_new"))
    open_ct   = sum(1 for r in results if "active" in r["status"].lower())
    award_ct  = sum(1 for r in results if "award" in r["status"].lower())
    fat_ct    = sum(1 for r in results if r["source"] == "Find a Tender")
    cf_ct     = sum(1 for r in results if r["source"] == "Contracts Finder")

    rows_html = ""
    for r in results:
        new_m  = (' <span style="background:#fbbf24;color:#000;padding:1px 6px;'
                  'border-radius:8px;font-size:10px;font-weight:700">NEW</span>'
                  if r.get("is_new") else "")
        sc     = status_colour(r["status"])
        gc     = GROUP_COLOURS.get(r["group"], "#64748b")
        src_c  = SOURCE_COLOURS.get(r["source"], "#64748b")
        value  = r["value_high"] or r["value_low"] or r["awarded_value"] or "—"
        supp   = r["awarded_to"] or "—"
        dl     = r["deadline"] or "—"
        t_link = (f'<a href="{r["url"]}" target="_blank" '
                  f'style="color:#1d4ed8;text-decoration:none">{r["title"]}</a>'
                  if r["url"] else r["title"])
        desc   = (f'<div style="font-size:12px;color:#64748b;margin-top:4px">'
                  f'{r["description"]}</div>' if r["description"] else "")

        rows_html += f"""
        <tr>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top">
            <div style="font-weight:600;font-size:14px">{t_link}{new_m}</div>
            <div style="font-size:12px;color:#475569;margin-top:3px">{r['organisation']}</div>
            {desc}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;text-align:center;white-space:nowrap;vertical-align:top">
            {badge(r['status'] or '?', sc)}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;white-space:nowrap;vertical-align:top">{value}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top">{supp}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;white-space:nowrap;vertical-align:top">{dl}</td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:top">
            {badge(r['group'], gc)}
          </td>
          <td style="padding:12px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;vertical-align:top">
            {badge(r['source'], src_c)}
          </td>
        </tr>"""

    no_results = ('<tr><td colspan="7" style="padding:40px;text-align:center;color:#64748b">'
                  'No contracts found. Try increasing --days or broadening keywords.</td></tr>'
                  if not results else "")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UK Gov Contracts Monitor — {now}</title>
<style>
  body  {{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f8fafc;color:#1e293b }}
  .hdr  {{ background:linear-gradient(135deg,#1e3a5f,#1d4ed8);color:#fff;padding:32px 40px }}
  .hdr h1 {{ margin:0 0 8px;font-size:24px }}
  .hdr p  {{ margin:0;opacity:.8;font-size:14px }}
  .stats  {{ display:flex;gap:20px;padding:24px 40px;flex-wrap:wrap }}
  .stat   {{ background:#fff;border-radius:10px;padding:16px 24px;box-shadow:0 1px 3px rgba(0,0,0,.1);min-width:130px }}
  .stat .num {{ font-size:30px;font-weight:700;color:#1d4ed8 }}
  .stat .lbl {{ font-size:13px;color:#64748b }}
  .sources {{ margin:0 40px 20px;display:flex;gap:16px;flex-wrap:wrap }}
  .src-card {{ background:#fff;border-radius:8px;padding:14px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:13px;border-left:4px solid #1d4ed8 }}
  .src-card strong {{ display:block;font-size:15px;margin-bottom:4px }}
  .tw {{ margin:0 40px 40px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:auto }}
  table {{ width:100%;border-collapse:collapse;font-size:13px }}
  thead {{ background:#f1f5f9 }}
  th {{ padding:12px 10px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap }}
  tr:hover td {{ background:#f8fafc }}
  .footer {{ text-align:center;padding:20px;color:#94a3b8;font-size:12px }}
</style>
</head>
<body>
<div class="hdr">
  <h1>UK Government Contracts Monitor</h1>
  <p>Observability · IT Monitoring · Datadog · Dynatrace · Splunk · New Relic &nbsp;|&nbsp;
     {now} &nbsp;|&nbsp; Last {days} days{"  · Open only" if open_only else ""}</p>
</div>

<div class="stats">
  <div class="stat"><div class="num">{len(results)}</div><div class="lbl">Total contracts</div></div>
  <div class="stat"><div class="num" style="color:#f59e0b">{new_count}</div><div class="lbl">New this run</div></div>
  <div class="stat"><div class="num" style="color:#22c55e">{open_ct}</div><div class="lbl">Open to bid</div></div>
  <div class="stat"><div class="num" style="color:#3b82f6">{award_ct}</div><div class="lbl">Awarded</div></div>
  <div class="stat"><div class="num" style="color:#6366f1">{cf_ct}</div><div class="lbl">Contracts Finder</div></div>
  <div class="stat"><div class="num" style="color:#0ea5e9">{fat_ct}</div><div class="lbl">Find a Tender</div></div>
</div>

<div class="sources">
  <div class="src-card" style="border-color:#6366f1">
    <strong>Contracts Finder API</strong>
    Lower-value contracts · Keyword search · No auth required<br>
    <a href="https://www.contractsfinder.service.gov.uk" target="_blank">contractsfinder.service.gov.uk</a>
  </div>
  <div class="src-card" style="border-color:#0ea5e9">
    <strong>Find a Tender API (OCDS)</strong>
    High-value contracts >£140k · Procurement Act 2023 · No auth required<br>
    <a href="https://www.find-tender.service.gov.uk" target="_blank">find-tender.service.gov.uk</a>
  </div>
</div>

<div class="tw">
  <table>
    <thead>
      <tr>
        <th>Contract / Buyer</th>
        <th>Status</th>
        <th>Value</th>
        <th>Awarded to</th>
        <th>Deadline</th>
        <th>Category</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody>{rows_html or no_results}</tbody>
  </table>
</div>
<div class="footer">
  Sources: UK Government Contracts Finder &amp; Find a Tender APIs &nbsp;·&nbsp;
  Data under <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/" target="_blank">Open Government Licence</a>
</div>
</body>
</html>"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"HTML saved: {OUTPUT_HTML}")


# ══════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Search UK government APIs for monitoring/observability contracts"
    )
    parser.add_argument("--days",      type=int, default=90,
                        help="Days back to search (default: 90)")
    parser.add_argument("--open-only", action="store_true",
                        help="Only return open/active contracts")
    parser.add_argument("--source",    choices=["cf", "fat", "all"], default="all",
                        help="cf=Contracts Finder, fat=Find a Tender, all=both (default)")
    args = parser.parse_args()

    source_label = {
        "cf":  "Contracts Finder only",
        "fat": "Find a Tender only",
        "all": "Contracts Finder + Find a Tender",
    }[args.source]

    print(f"\nUK Gov Contracts Monitor")
    print(f"{'─'*45}")
    print(f"Sources:  {source_label}")
    print(f"Period:   last {args.days} days")
    print(f"Filter:   {'open only' if args.open_only else 'all statuses'}")

    results = run_search(args.days, args.open_only, args.source)

    new_count = sum(1 for r in results if r.get("is_new"))
    print(f"\nTotal found: {len(results)}  ({new_count} new since last run)")

    write_csv(results)
    write_html(results, args.days, args.open_only, args.source)

    print(f"\nDone — open {OUTPUT_HTML} in your browser.")

    if results:
        print("\nTop results:")
        for r in results[:8]:
            marker  = " [NEW]" if r.get("is_new") else ""
            value   = r["value_high"] or r["value_low"] or r["awarded_value"] or ""
            val_str = f"  {value}" if value else ""
            src     = f"[{r['source']}]"
            print(f"  • {r['title'][:65]}{marker}")
            print(f"    {r['organisation']} | {r['status']}{val_str} | {src}")


if __name__ == "__main__":
    main()
