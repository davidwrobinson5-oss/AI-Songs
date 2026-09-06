#!/usr/bin/env python3
import json
import os
import re
import urllib.request

import duckdb

IMPORT_URL = os.environ["PIE_VENUE_IMPORT_URL"]
OIDC = os.environ["PIE_GITHUB_OIDC_TOKEN"]
BBOX = os.environ.get("PIE_IMPORT_BBOX", "").strip()
REGION = os.environ.get("PIE_IMPORT_REGION", "US region").strip()
RELEASE = os.environ.get("OVERTURE_RELEASE", "").strip()

if not BBOX:
    raise SystemExit("PIE_IMPORT_BBOX is required")
west, south, east, north = [float(x) for x in BBOX.split(",")]

if not RELEASE:
    with urllib.request.urlopen("https://stac.overturemaps.org/catalog.json", timeout=30) as response:
        RELEASE = str(json.load(response).get("latest") or "").strip().strip("/")
if not RELEASE:
    raise SystemExit("Could not resolve the latest Overture release")

CATEGORY_TOKEN_RE = re.compile(
    r"(^|_)(music|concert|theater|theatre|performing|nightclub|bar|pub|brewery|casino|resort|hotel|event|convention|conference|banquet|wedding|festival|fairground|fair|church|worship|campground|camping|retreat|racetrack|speedway|boardwalk|amusement|arena|stadium|auditorium|radio|television|broadcast|news|university|college|museum|cultural|community|market|mall|winery|distillery|lounge|club)(_|$)",
    re.I,
)


def post(payload):
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        IMPORT_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {OIDC}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode())


def jload(value, default):
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def first_nonempty(values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def address_parts(addresses):
    items = jload(addresses, [])
    if not isinstance(items, list) or not items:
        return {}, ""
    us = next((item for item in items if isinstance(item, dict) and str(item.get("country") or "").upper() == "US"), None)
    item = us or next((item for item in items if isinstance(item, dict)), {})
    return item, str(item.get("country") or "").upper()


def opportunity_types(category, taxonomy, name):
    hierarchy = taxonomy.get("hierarchy") if isinstance(taxonomy, dict) else []
    alternates = taxonomy.get("alternates") if isinstance(taxonomy, dict) else []
    text = " ".join([category, name, " ".join(hierarchy or []), " ".join(alternates or [])]).lower()
    groups = {
        "live_music": ["music", "concert", "nightclub", "bar", "pub", "brewery", "lounge", "club", "theater", "theatre", "performing", "auditorium", "arena", "stadium"],
        "open_mic_candidate": ["bar", "pub", "brewery", "community", "church", "worship", "lounge"],
        "event_venue": ["event", "convention", "conference", "banquet", "wedding", "hotel", "resort", "arena", "stadium", "auditorium", "theater", "theatre", "museum", "cultural", "community"],
        "casino_resort": ["casino", "resort", "hotel"],
        "faith": ["church", "worship"],
        "camp_retreat": ["campground", "camping", "retreat"],
        "festival_fair": ["festival", "fairground", "fair", "boardwalk", "amusement"],
        "racing": ["racetrack", "speedway"],
        "media": ["radio", "television", "broadcast", "news"],
        "college": ["university", "college"],
        "market_mall": ["market", "mall"],
    }
    labels = [label for label, needles in groups.items() if any(needle in text for needle in needles)]
    return labels or ["performance_opportunity"]


con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;")
con.execute("SET s3_region='us-west-2';")
pattern = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"
regex = r"(^|_)(music|concert|theater|theatre|performing|nightclub|bar|pub|brewery|casino|resort|hotel|event|convention|conference|banquet|wedding|festival|fairground|fair|church|worship|campground|camping|retreat|racetrack|speedway|boardwalk|amusement|arena|stadium|auditorium|radio|television|broadcast|news|university|college|museum|cultural|community|market|mall|winery|distillery|lounge|club)(_|$)"
sql = f"""
SELECT id,
       names.primary AS name,
       confidence,
       basic_category,
       CAST(taxonomy AS JSON) AS taxonomy_json,
       CAST(addresses AS JSON) AS addresses_json,
       CAST(websites AS JSON) AS websites_json,
       CAST(phones AS JSON) AS phones_json,
       CAST(sources AS JSON) AS sources_json,
       ST_X(geometry) AS longitude,
       ST_Y(geometry) AS latitude,
       operating_status
FROM read_parquet('{pattern}', filename=true, hive_partitioning=1)
WHERE bbox.xmin BETWEEN {west} AND {east}
  AND bbox.ymin BETWEEN {south} AND {north}
  AND coalesce(operating_status, 'open') <> 'permanently_closed'
  AND (
       regexp_matches(lower(coalesce(basic_category,'')), '{regex}')
       OR regexp_matches(lower(coalesce(taxonomy.primary,'')), '{regex}')
       OR regexp_matches(lower(CAST(taxonomy AS VARCHAR)), '{regex}')
  )
"""
rows = con.execute(sql).fetchall()
cols = [description[0] for description in con.description]

start = post({"action": "start", "release": RELEASE, "region": REGION, "bbox": BBOX})
run_id = start["runId"]
imported = 0
skipped = 0
try:
    batch = []
    for values in rows:
        row = dict(zip(cols, values))
        name = str(row.get("name") or "").strip()
        if not name:
            skipped += 1
            continue
        taxonomy = jload(row.get("taxonomy_json"), {})
        category = str(row.get("basic_category") or (taxonomy.get("primary") if isinstance(taxonomy, dict) else "") or "").strip()
        if not CATEGORY_TOKEN_RE.search(f"_{category}_") and not CATEGORY_TOKEN_RE.search(f"_{str((taxonomy or {}).get('primary') or '')}_"):
            taxonomy_text = "_" + "_".join((taxonomy or {}).get("hierarchy") or []) + "_" + "_".join((taxonomy or {}).get("alternates") or []) + "_"
            if not CATEGORY_TOKEN_RE.search(taxonomy_text):
                skipped += 1
                continue
        address, country = address_parts(row.get("addresses_json"))
        if country and country != "US":
            skipped += 1
            continue
        websites = jload(row.get("websites_json"), [])
        phones = jload(row.get("phones_json"), [])
        address_text = first_nonempty([address.get("freeform"), address.get("address_line"), address.get("street")]) if isinstance(address, dict) else ""
        locality = first_nonempty([address.get("locality"), address.get("city")]) if isinstance(address, dict) else ""
        region = first_nonempty([address.get("region"), address.get("state")]) if isinstance(address, dict) else ""
        postcode = first_nonempty([address.get("postcode"), address.get("postal_code")]) if isinstance(address, dict) else ""
        batch.append({
            "id": str(row["id"]),
            "name": name,
            "address": address_text,
            "locality": locality,
            "region": region,
            "postcode": postcode,
            "phone": first_nonempty(phones if isinstance(phones, list) else []),
            "website": first_nonempty(websites if isinstance(websites, list) else []),
            "basic_category": category,
            "taxonomy": taxonomy,
            "source_metadata": {"source": "overture", "sources": jload(row.get("sources_json"), [])},
            "confidence": row.get("confidence"),
            "longitude": row.get("longitude"),
            "latitude": row.get("latitude"),
            "operating_status": row.get("operating_status"),
            "opportunity_types": opportunity_types(category, taxonomy, name),
        })
        if len(batch) >= 250:
            result = post({"action": "batch", "runId": run_id, "release": RELEASE, "rows": batch})
            imported += int(result.get("imported", 0))
            skipped += int(result.get("skipped", 0))
            batch = []
    if batch:
        result = post({"action": "batch", "runId": run_id, "release": RELEASE, "rows": batch})
        imported += int(result.get("imported", 0))
        skipped += int(result.get("skipped", 0))
    message = f"Imported {imported}; skipped {skipped}; region {REGION}; bbox {BBOX}"
    post({"action": "finish", "runId": run_id, "status": "completed", "message": message})
    print(json.dumps({"runId": run_id, "release": RELEASE, "region": REGION, "rowsQueried": len(rows), "imported": imported, "skipped": skipped}))
except Exception as error:
    try:
        post({"action": "finish", "runId": run_id, "status": "failed", "message": str(error)[:900]})
    finally:
        raise
