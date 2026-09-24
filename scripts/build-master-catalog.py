#!/usr/bin/env python3
"""Build the Studio master catalog from the approved Drive audit. Not a store publish."""
import json
import os
import re
from collections import defaultdict

ROOT = "/workspace"
OUT = os.path.join(ROOT, "src/data/master-catalog.json")

TOKEN = {
    "biscuit": "Biscuit", "trueblue": "True Blue", "black": "Black", "charcoal": "Charcoal",
    "gold": "Gold", "vegasgold": "Vegas Gold", "white": "White", "heathergrey": "Heather Grey",
    "red": "Red", "yellow": "Yellow", "blueteal": "Blue Teal", "birch": "Birch", "navy": "Navy",
    "brown": "Brown", "khaki": "Khaki", "caramel": "Caramel", "cardinal": "Cardinal",
    "columbiablue": "Columbia Blue", "kelly": "Kelly", "neonblue": "Neon Blue",
    "neongreen": "Neon Green", "neonorange": "Neon Orange", "neonpink": "Neon Pink",
    "neonyellow": "Neon Yellow", "orange": "Orange", "royal": "Royal", "lightgrey": "Light Grey",
    "cyan": "Cyan", "darkgreen": "Dark Green", "grey": "Grey", "ambergold": "Amber Gold",
    "armyolive": "Army Olive", "darkorange": "Dark Orange", "maroon": "Maroon",
    "minkbeige": "Mink Beige", "cream": "Cream", "coffee": "Coffee",
    "chocolatechip": "Chocolate Chip", "gunmetal": "Gunmetal", "purple": "Purple",
    "quarry": "Quarry", "loden": "Loden", "hotpink": "Hot Pink", "pink": "Pink",
    "smokeblue": "Smoke Blue", "aluminum": "Aluminum", "lightblue": "Light Blue",
    "burgundy": "Burgundy", "tan": "Tan", "green": "Green", "blue": "Blue",
}


def pretty_key(key: str) -> str:
    keys = sorted(TOKEN, key=len, reverse=True)
    s = key
    out = []
    while s:
        hit = next((t for t in keys if s == t or s.startswith(t + "_")), None)
        if not hit:
            chunk = s.split("_", 1)[0]
            out.append(chunk)
            s = s[len(chunk) + 1 :] if "_" in s else ""
        else:
            out.append(TOKEN[hit])
            s = s[len(hit) + 1 :] if len(s) > len(hit) else ""
    return "/".join(out)


def slash_hyphen(name: str) -> str:
    name = name.replace(" - ", "-").replace(".png", "")
    return name.replace("-", "/")


def photo(drive_id: str | None):
    if not drive_id:
        return None
    return {"driveId": drive_id}


# --- 112 numbered white-background set ---
ids_112 = {}
for path in [
    "/tmp/112_ids.json",
]:
    if os.path.exists(path):
        ids_112.update(json.load(open(path)))

for path in [
    "/workspace/artifacts/.tmp/mcp-results/google_drive_list_folder-1790184266750-2f32eace.json",
    "/workspace/artifacts/.tmp/mcp-results/google_drive_list_folder-1790184348535-df3f24a9.json",
    "/workspace/artifacts/.tmp/mcp-results/google_drive_list_folder-1790184411865-ce980cf6.json",
    "/workspace/artifacts/.tmp/mcp-results/google_drive_list_folder-1790181950776-e4efbe63.json",
]:
    if not os.path.exists(path):
        continue
    data = json.load(open(path))
    for item in data.get("items") or []:
        name = item.get("name") or ""
        if name.startswith("112_") and name.endswith(".png"):
            ids_112[name] = item["id"]

EXTRA_112 = {
    "112_white_columbiablue_yellow_3.png": "1gbDTBR9zPyh5l0EFPeA0DYBjKYDCOSVj",
    "112_white_dark_green_1.png": "1lBIoRyQYDZeQeKbFfrbMRGgd0VTnveKK",
    "112_white_darkgreen_2.png": "1Hyq8EQpi5arT7XZCvmUggtPNRpxArDqy",
    "112_white_darkgreen_3.png": "130vFbRSKz6g9WCteWyQdgB8LA_oB-N5o",
    "112_white_navy_1.png": "1cNxInzDHcLxvC_JF6wAQ-7JiMqC4hHxQ",
    "112_white_navy_2.png": "1_6osYwXYE_ATw51sa_4GYTAvVNPcw3ie",
    "112_white_navy_3.png": "1JOcbcCrQ-dybE5GiEoKjTal2FQW9I15V",
    "112_white_red_1.png": "1dFP-3V_P0errozB5fOg1Le3nOvJrPOGR",
    "112_white_red_2.png": "1t0IGyjcP6EiXKuQi1nIkUnMGW6XlFkLF",
    "112_white_red_3.png": "1HfYfMugg-XG5CBk8Qh9gWnXUCHTUfvyz",
    "112_white_royal_1.png": "1jhYcc6sqhHVKQL-D--MWU_l0Bcvlcds7",
    "112_white_royal_2.png": "1RkFQbwaRg-QgKKZWSww8kvyT1C6aQukK",
    "112_white_royal_3.png": "179M3C7WMC7yD_0mRCOyoJj-EdnwYT3IE",
    "112_white_columbia_blueyellow_1.png": "1c5hCYTmNK-8hpUggH3-qulCCOQgzWb8I",
}
ids_112.update(EXTRA_112)

groups = defaultdict(lambda: {"front": None, "side": None, "back": None, "notes": []})
for name, fid in ids_112.items():
    m = re.match(r"112_(.+)_([123])\.png$", name)
    if not m:
        continue
    key, view = m.group(1), m.group(2)
    note = None
    if key == "navy_-orange":
        key = "navy_orange"
        note = "Back file is named 112_navy_-orange_3.png"
    elif key == "white_columbia_blueyellow":
        key = "white_columbiablue_yellow"
        note = "Front file is named 112_white_columbia_blueyellow_1.png"
    elif key == "white_dark_green":
        key = "white_darkgreen"
        note = "Front file is named 112_white_dark_green_1.png"
    slot = {"1": "front", "2": "side", "3": "back"}[view]
    groups[key][slot] = fid
    if note and note not in groups[key]["notes"]:
        groups[key]["notes"].append(note)


def colorway(model, official, richardson, front, side, back, notes=""):
    views = {}
    if front:
        views["front"] = front
    if side:
        views["side"] = side
    if back:
        views["back"] = back
    asset = "complete" if front and side and back else ("partial" if views else "missing")
    slug = re.sub(r"[^a-z0-9]+", "-", official.lower()).strip("-")
    return {
        "id": f"{model}:{slug}",
        "officialName": official,
        "richardsonStatus": richardson,
        "assetStatus": asset,
        "views": views,
        "notes": notes,
    }


colors_112 = []
for key, info in groups.items():
    name = pretty_key(key)
    colors_112.append(
        colorway(
            "112",
            name,
            "unknown",
            info["front"],
            info["side"],
            info["back"],
            "; ".join(info["notes"]),
        )
    )
colors_112.sort(key=lambda c: c["officialName"])

# 112FP folder-named FRONT/SIDE/BACK
FP = {
    "Army Olive Green-Tan": ("13sTz3sZz6Mt3cincoTnb5qz4IiKmo39d", "1NI8ELmgp5DH9yu-4CwxTffaxrxXmQPSb", "18dm6lCf6sF-1KOacj2u4OG0X2HJlVqSY"),
    "Beetle-Quarry": ("1JHut5w5poAanUtWIsi_zT7BuI_Hihk04", "1RgXmKNaOjNjk2-qh8tUcPdwH5kZq9IXl", "1ceabe6TYuGGG03R-W2B4YNcPsNDLBQNw"),
    "Black-White": ("1ctaVSAgMHz2TFPkpchAMr-tAAZjWSjaC", "1y-AGok5Az6pfWZZNMXSShpEGV-Xg9TP7", "1s97ALccBAQNsBE85VfdiSpg6aCYPwvgF"),
    "Black": ("1hxptpyQhYVum5WaJ6k0ZajXmKRhBlunY", "18XL-KruMugnLnLxtubG1Fe7Lnu_amNof", "1GmgAM4PW8oLv1Zh3Fc0dc7daoyAlbr7m"),
    "Blue Teal-Birch-Navy": ("1nlBSavxr1CTzrOtSWzjpTgMMPFokCfvM", "1YIP6YhZGKgMRIsQ14QMdifoaozzExv3p", "1pVxj_gMzN0uSlzhBaBrooduO3l0BJrI3"),
    "Charcoal-Black": ("1D6eHuQOfP8AgKhDXbU6z5hxIBYhC7VP3", "1xS0p6qfbyl67L5W66Zsh9is15PGnztzO", "1yyAmGl1P7smWVjWncSj5bmuYpotX3VZT"),
    "Charcoal-White": ("1iEHU6xgqGgxRPtmQlMlqAIf5w_eCpY2q", "1QMJsBpmTWmHcJ7YguRVRRV5iPSar1BBu", "1b5Pc_PEQglcXP7UTQb87caDmg_2gjfgx"),
    "Chocolate Chip-Birch": ("1xAo_Fh8JRBdU_Y7iMgc2pJNDYQw2cu76", "1n5gXjJ5H6o_eyb9GO6N_Qe4Yl7mcKdxE", "1dYgjOqzSzpU3477QTtrlmKlENEUZK283"),
    "Cobalt Blue-Grey": ("1wBxylj1bUwGQRhfWGddZaszf5b4mbMDF", "1QGl6W1Viwjq0B1mC7tPrxuKIqLGMCbpK", "1FQbqBlgavSRAu7V3Z4UTzHZrPD_yHUzJ"),
    "Heather Grey-Amber Gold": ("1sVcblUbdBYXWIUnHVR4-1wFnoxHH9fzF", "1O3gHNiKJFUtb7ufjMNPJMOa7wqn0yAcf", "1xuB-43MmfImJJkb4S7vW8A52FIETTEbN"),
    "Heather Grey-Birch-Army Olive": ("19THD46ljbn_F_l-jj_LphYVFULFa6loH", "1MONJN3hIXNpU2XINFvvfJG73mdpwIsFb", "1fENRQL60amNZlYzeij1aPPqDEWFRb3CP"),
    "Heather Grey-Black": ("1Geex8Dmz8CheCwXF50O_CynOYHEVmhPK", "15avdxowhWsWYEphfnYMxozmD2OXnwBsQ", "1xtqXF-8Z5_kuZ0snTHAEjAXy54RPU70W"),
    "Khaki-Coffee": ("1ksoX0j-E6ltZW8KsYNiN7bogOyk54rWg", "1eHZYgGcsoYsDSuMovieRkwH4eS1rVRkv", "18zrPTfA7I3-X4ierQ6myCJTVsOe40DnL"),
    "Loden Green-Black": ("1mDHXhwGLfYK1JQVdtU-VXhhAfNk-f6VK", "1CBVzO0evRZi_Dw632krQ2VHoPOTu5x2f", "1twan-5ZupHsSmiJ6GYzxxXDtXvDgHJDl"),
    "Navy-White": ("12Gck6qNN064gLZnno4wFUBYLCKcZtosc", "1gNJE5i4qEQAwqD7CCbwfb27pR-Y9Q75s", "17FbsGAOIM400LxipuzArIIPC-tQM_IES"),
    "Navy": ("1pM3qnZ0fvdyfc22tKEVqs_OV4-u9QXI0", "1KE2JfLzbZm6zv8d8W5ErwRMnMTviDP8b", "1Z_SxkPKI_u0s_ay4efu6Xi9xrvqCXdbU"),
    "Ombre Blue-Navy": ("1DiVHOrAer2ietHl-kZjmEq3kV1ChB6PC", "1ckSKBuY7aIMybG5decJbtp2mxLsqZshL", "1i0q3iWjev3l4Z1R6I-s04x3lSTnuYKOR"),
    "Pale Khaki-Loden Green": ("15Cd5KeOVAjZIr3ZMMDOdrYt_Exp3bayK", "1RRWLNLWdNifdISc_oAoIhrf2qgwB32y6", "1B9ZFeexGqLthQ-yN8fIWeYJ45S7ThNLF"),
    "White": ("1YyNgabtNS9wlNq_yNaJa6IlFGoHj33hf", "1LG3EKQD5-QGJJUovTLzk1hrOX2bSgL3u", "1Jfs3bcLgpFUoDJLkjU16IK2KeOAenFPb"),
}
colors_112fp = []
for raw, (f, s, b) in FP.items():
    official = slash_hyphen(raw)
    status = "legacy" if official == "Blue Teal/Birch/Navy" else "current"
    note = "Not in Richardson's current 18. Kept. Not offered." if status == "legacy" else ""
    if official == "Loden Green/Black":
        note = "Drive name. A current wholesale list shortens this to Loden/Black. Treated as the same color."
    colors_112fp.append(colorway("112FP", official, status, f, s, b, note))
colors_112fp.sort(key=lambda c: c["officialName"])

# 112P named folders
P_FRONT = {
    "Army Camo-Black.png": "1xqNnxQfgKeA401wp0ZIOJykuHGFBm77V",
    "Army Camo-White.png": "1cpNzHhaI-SGR7OM52B8KlnY8gmmbr8JL",
    "Kryptek Highlander - Buck.png": "1IofCne-StCOLwpRQON-sUN2UTbpfHrmf",
    "Kryptek Typhon-Black.png": "1gtrsZZqcmMfeXvsTnK28URRvGBYanB4d",
    "Military Digital Camo-Light Green.png": "1qzO2xNPNxltVepiJch-IGbJvCOyNg96f",
    "Mossy Oak Bottomland-Loden.png": "1Jh8o30GstItU1SCZxXcUVx_cuMiEznka",
    "Mossy Oak Country DNA-Black.png": "1VlKPoyK43z7s3-joThIvY3-Bq7FW8m0a",
    "Realtree Edge-Brown.png": "13pOOFm4DzsGU-YyiZNjgYOQHH-hTxPTG",
    "Realtree Max 7-Buck.png": "1pn-3WWrPJ2B5AHO-b0kzsLmhdwgGD0a2",
    "Realtree Original-Black.png": "162d--ZaYMxlXluLOq7ByrJrnsaffI791",
}
P_SIDE = {
    "Army Camo-Black.png": "1Lca6Dse9MKFWA6kc-21d6Y90Vz5ALP14",
    "Army Camo-White.png": "1yFZ2RnCEYyVOrEJP2ldwiZe_CU2yXMAq",
    "Kryptek Highlander - Buck.png": "1xaGrDBRN2NmujXhD1q8OsgbwzV26_swm",
    "Kryptek Typhon-Black.png": "1ZbTBJVsstL91EWdTCZIdmZMPTJoAoweg",
    "Military Digital Camo-Light Green.png": "1MO7L7os1NJiT__o6TvVgTyDJZpWcw7K_",
    "Mossy Oak Bottomland-Loden.png": "1v2WfwX2bWD0S83GZNSEAobfbaB3KVlZf",
    "Mossy Oak Country DNA-Black.png": "1TD6FgOv6B82u0LXZVRGo0d5lyZ5txfr9",
    "Realtree Edge-Brown.png": "1THNL3x11SQzUvJqcUyivMSB8g8u0TZOq",
    "Realtree Max 7-Buck.png": "1ulVVab14F_NZUDpboXpKdRQ-vUxOCbd6",
    "Realtree Original-Black.png": "1NLedGEu8SOqsWUYSW1rR8UA3PUc666Np",
}
P_BACK = {
    "Army Camo-Black.png": "1iGXF6GYed2Apmf4lOVw5Fph2nPyfzlNp",
    "Army Camo-White.png": "18i5wx8r_KFLtRLZbz452kCC0-3rLJgSS",
    "Kryptek Highlander - Buck.png": "1TXeHyJX_fO_RnN1cQ59wNBXIICYVxfGW",
    "Kryptek Typhon-Black.png": "1dok9aYyfzBSfiELyKY-HYsVrwQh5fMuc",
    "Military Digital Camo-Light Green.png": "1Z0VMOegSRMGKU_T174H6GgEaU2D052F6",
    "Mossy Oak Bottomland-Loden.png": "1A5beOJo9yrGQRV5GTz7-uGlS_QfDFwcl",
    "Mossy Oak Country DNA-Black.png": "1NzSiNKDmLj56lRYGKTrCDltq5jXSNWjw",
    "Realtree Edge-Brown.png": "10rEQKw9WNyOjiPAUY_FMWKWRaPfB_Fgy",
    "Realtree Max 7-Buck.png": "1iFIkkeetqdbxRA5NUJTPmP3RnaCBpqMd",
    "Realtree Original-Black.png": "135yHmeMUn2hAWbzqPrSuZ4wkwVB8mVVX",
}
colors_112p = []
for raw, fid in P_FRONT.items():
    official = slash_hyphen(raw.replace(".png", ""))
    colors_112p.append(colorway("112P", official, "unknown", fid, P_SIDE[raw], P_BACK[raw], ""))
colors_112p.sort(key=lambda c: c["officialName"])

# 112PFP numbered
pfp_groups = defaultdict(lambda: {"front": None, "side": None, "back": None, "label": ""})
pfp_path = "/workspace/artifacts/.tmp/mcp-results/google_drive_list_folder-1790186299216-104c9f5c.json"
if os.path.exists(pfp_path):
    data = json.load(open(pfp_path))
    for item in data.get("items") or []:
        name = item.get("name") or ""
        m = re.match(r"112PFP_(.+)_([123])\.png$", name)
        if not m:
            continue
        label, view = m.group(1), m.group(2)
        slot = {"1": "front", "2": "side", "3": "back"}[view]
        pfp_groups[label][slot] = item["id"]
        pfp_groups[label]["label"] = label

SUFFIXES = [
    "Light Grey", "Light Green", "Light Brown", "Olive Green", "Blaze Orange",
    "Neon Orange", "Neon Pink", "Neon Yellow", "Black", "White", "Brown", "Loden",
    "Buck", "Charcoal", "Khaki", "Navy",
]


def split_print_name(label: str) -> str:
    label = label.replace(" - ", " ").strip()
    for suf in SUFFIXES:
        if label.endswith(" " + suf):
            return f"{label[: -(len(suf) + 1)]}/{suf}"
    return label.replace(" ", "/")


colors_112pfp = []
for label, info in pfp_groups.items():
    official = split_print_name(label)
    note = ""
    if official == "Mossy Oak Elements Bone/Light Grey":
        note = "May be the same color Richardson lists as Mossy Oak Elements Bonefish/Light Grey. Not split into two."
    colors_112pfp.append(colorway("112PFP", official, "unknown", info["front"], info["side"], info["back"], note))
colors_112pfp.sort(key=lambda c: c["officialName"])

# 256 from the closed folder listing — parsed if a dump exists, else the known set is loaded below
# Embedded from the complete folder list (19 triples).
S256 = """
256_Birch Black_1.png 1xHEVXNhdwS7C7aJfobZVHazpFBC64PzD
256_Birch Black_2.png 1caWtZsw0TrWIP4HHYDIA-fIeSlHeYAK6
256_Birch Black_3.png 1g3-Z4BY1zC7DH-XEebjQxyBkkfSws8hc
256_Biscuit Black_1.png 1oxELVCEsAGL4dUqwt05wFDb6B8OZMk3Y
256_Biscuit Black_2.png 1yGKURxDxg4SlzJOoV6YnS1PVmAGKliZn
256_Biscuit Black_3.png 1FgEpBRxT2hcIWgr4G7SN-QPGkB0lO4Pw
256_Black Black_1.png 12FBoj7cD6tsHbYMR_L3A17a7L9GY2PNi
256_Black Black_2.png 1DXlvpnWJ7eE8oGL1uSFfF5mNvHXmlOnB
256_Black Black_3.png 1yThP18MFd-ObyhNvCN_GJNocumUa3sF7
256_Black White_1.png 1lWcYc3ddFCZ8odNyIWHplWvcT_NmUcb9
256_Black White_2.png 14rj97oPHb9kvYjSVZTXwdidrjG4uRl9H
256_Black White_3.png 1P7xENve40YyA9Dty_C6E9q1JCXZ6yYEW
256_Cardinal White_1.png 1Tn9rf7CNrY7_MK5WVBzps5OrszYLeUPv
256_Cardinal White_2.png 1gHNDUqePYismkkVEd5RFgwuZ5z4UI5Yx
256_Cardinal White_3.png 1Y67eDovNaKM2FyJT5eNdQ1QzRIWFTIdw
256_Charcoal White_1.png 12GrtbHSluuWwLU6p5s96kAEjGcvyRvSA
256_Charcoal White_2.png 1H-PDeoN5OeT_fHIFf8RvdPfkxQ5l58OF
256_Charcoal White_3.png 109TMHaBF04ajcYL8LCyWU5aWIKKE5pKh
256_Dark Mocha Desert_1.png 1dIARqA14mugHFhfiY7scXVAVwO4cuFvL
256_Dark Mocha Desert_2.png 1G3FMaFozeSU-IVp1QvjdWCfqoVD_zHGg
256_Dark Mocha Desert_3.png 1Uz_xkPh0b3kCNkkz8LF8ua-lLwG-v9Eg
256_Dark Orange Black_1.png 1W-SQ0BAeSVjwqxeXDmoZBwXS6FstziVr
256_Dark Orange Black_2.png 1deur9iD9qGiLESlI0flIj1IBOmoGBqsn
256_Dark Orange Black_3.png 13SAf7-Lf7d1PIcqTb41Y7L35xxp8BSGs
256_Dusty Blue White_1.png 1au6rOPdsy_24_WjUOYAlydTLBG91clTx
256_Dusty Blue White_2.png 1P7stfoLg-iSIO57hFbpFzvly5Z7YXmrl
256_Dusty Blue White_3.png 1s8gI1bAsAz8B0Nyn2vS84ZGrajaujH3u
256_Dusty Red White_1.png 1qwhpQ8fjYxsC1YCimWuS5CCbX_SWarth
256_Dusty Red White_2.png 1aZDasGqhmufKlm0O5Tis1FUcfGNr5wbE
256_Dusty Red White_3.png 1psu-MWLC1REJNwm2VSqRO0xOSaZkuXlY
256_Loden Gold_1.png 1AphTJ79u505A_HOFCD3hyhM4Y0VdRUN1
256_Loden Gold_2.png 1qNKBO798lCfXhP7j6WJh3pVvERR9a0IE
256_Loden Gold_3.png 19Yq15zRN4bY9s8SU20XwU2BythrmtTcW
256_Midnight Navy White_1.png 1mHm35w25WgtYjaoYM67aENtM5NYYZxfb
256_Midnight Navy White_2.png 1WMfpigaDYvaIXsHWaBckqpPWyF5sFFeQ
256_Midnight Navy White_3.png 1pbH99vydCPhDA8dsEuvOIpzRS6jklBU6
256_Navy Red_1.png 1ogrC8ZZEJWdfciboJbYVFsw_5PjmK6jd
256_Navy Red_2.png 1Of5elLTzAYCjQBPqtWHxB-FSYiGf2XwO
256_Navy Red_3.png 1X0rxYf_u0SiDn4y180k_rlXm3PIiZMbl
256_Navy White_1.png 1Po_1GGgoT8jXqOzNKiCsZpBRF5NQ6NmN
256_Navy White_2.png 1ce7-ilzLGbtgG2Ac_5mhRdwlgROxtV_Y
256_Navy White_3.png 1HcDIkF2Bql-ImYBqIwdhunrdvxe3y9Ji
256_Pale Peach Maroon_1.png 1oIpA-7UJAHLjEF8b-qoULiAdP1jotFxW
256_Pale Peach Maroon_2.png 1Sj1_nr5EKL18y1V78U0VwHf35pOValgY
256_Pale Peach Maroon_3.png 1ORTi9yzcsuAUL7TKmIkTPNOe8M-XEdz5
256_Red White_1.png 1akj-s8g8tZgcYwvn5kOUhAAN5aM-4lki
256_Red White_2.png 1jppiklNy8qNsgod-eaQFfpSki2MOJrg3
256_Red White_3.png 1lN9U-Pjb-gVBlC66i18fT1khzJqvs7Sh
256_Sage White_1.png 1A8otEChILHvd4qzM1XgWBgJ7UPIptmIX
256_Sage White_2.png 1phQyC647iqvrJVcRfx2F5eKIrfNRedCq
256_Sage White_3.png 1kwjrvkBc8AfIVtNCSK52JJ5jm38lzq7n
256_Sand Dune Loden_1.png 1yPlxpN6cfODQ_iNz8SUmbR6llJx_obzt
256_Sand Dune Loden_2.png 1MFwKtbZ2drId0D-nWK6NvVSoIuZ_Qyzq
256_Sand Dune Loden_3.png 1SQ7Vf6Q_QyQ5URXcbO9Yox3lcZJGlpnm
256_White Black_1.png 1i8flTJk0u8DN7qUZ0TzcXE6AmAtviOM7
256_White Black_2.png 1WWQULwILWw6qJKDoFEtT0wmjdYg5CsLN
256_White Black_3.png 1iw6GYwuJd5uJKw0ceoXvNqXmY01XSt82
""".strip().splitlines()
g256 = defaultdict(lambda: {"front": None, "side": None, "back": None, "label": ""})
for line in S256:
    name, fid = line.rsplit(" ", 1)
    m = re.match(r"256_(.+)_([123])\.png$", name)
    label, view = m.group(1), m.group(2)
    g256[label][{"1": "front", "2": "side", "3": "back"}[view]] = fid
colors_256 = []
for label, info in g256.items():
    colors_256.append(colorway("256", split_print_name(label), "unknown", info["front"], info["side"], info["back"], ""))
colors_256.sort(key=lambda c: c["officialName"])

P256F = {
    "Bark Duck Camo-Brown.png": "1cmapIMXsLTJYo8tGK8r9CYFk6pkJVYDN",
    "Blizzard Duck Camo-White.png": "1z6FNJ497QQkFSaIDLfqxZemMmIkFV40r",
    "Harvest Duck Camo-Light Brown.png": "1iT54LoNVGTU5FsMN58rTTD6Qd7d4d957",
    "Marsh Duck Camo-Olive Green.png": "1mzisc1rWAv87bDpCYSvrjP6I2GL_mlLJ",
    "Mossy Oak Bottomland-Black.png": "1wuziWmId9KzuoWOHSWQbPSG3x-LXXkDc",
    "Realtree Advantage-Khaki.png": "1fSs3Ba6HZBIgg7sTcWAVwfn9oKswvBe_",
    "Saltwater Duck Camo-Charcoal.png": "1CCDVI2NcMLkqLfwD8rLMyt_TtP0sg4WM",
}
P256S = {
    "Bark Duck Camo-Brown.png": "13SW8p_7DZ_LKbp0L4JWcLqFKPgH_ghil",
    "Blizzard Duck Camo-White.png": "1KBo6lR2tNeNGhCiCJ2H39TeVay6P98gg",
    "Harvest Duck Camo-Light Brown.png": "1kTKx-EAsnx8zc3WK4Cfn2FIOELTlhoZL",
    "Marsh Duck Camo-Olive Green.png": "19x12OaNnwpAqXaJEsRjnCGbzlYlvuNN-",
    "Mossy Oak Bottomland-Black.png": "1BlK525sS2UTTJoZyj_ZNMw9rnZWxwpo5",
    "Realtree Advantage-Khaki.png": "1t5fjnbcM1lOy9xhj1H10AHQpJiSTRney",
    "Saltwater Duck Camo-Charcoal.png": "1JDW25M43qYWbFTs59cGAs2-cJPLqUWlz",
}
P256B = {
    "Bark Duck Camo-Brown.png": "1Eg0G4NiA1TJCWtJo661NkUhjvJodCjCi",
    "Blizzard Duck Camo-White.png": "1S0rztnY56ocb_7eVI32mE-EMsBblVNZD",
    "Harvest Duck Camo-Light Brown.png": "1Mu8gxbdRlKt4hD7hJRDJC5EgVTLJnfYt",
    "Marsh Duck Camo-Olive Green.png": "1HKM9Qi_g9-WvGmxd4VCG3geJu8UKAebf",
    "Mossy Oak Bottomland-Black.png": "1mipDvPPLP6CEjiljfLfsBhroZpEEg8nB",
    "Realtree Advantage-Khaki.png": "13schSxLzrIzK9sLv5tfns2afT1_KuyHc",
    "Saltwater Duck Camo-Charcoal.png": "1G_LKb5m0FPWeDoA_v5GPbu0gqjmkt3Hy",
}
colors_256p = []
for raw, fid in P256F.items():
    colors_256p.append(colorway("256P", slash_hyphen(raw.replace(".png", "")), "unknown", fid, P256S[raw], P256B[raw], ""))
colors_256p.sort(key=lambda c: c["officialName"])

FPR = {
    "Black-Charcoal.png": "1zNgMo-51xzUEBIFjihA5-f1tnuoo6FNV",
    "Black-White.png": "14GHlKzdjDaZbgJde9Gp-XgfCidV3DI2g",
    "Caramel-Black.png": "1wrMhAmZlUvKG7DPpGyqIIHFDceKxx2Wt",
    "Charcoal.png": "1g3MAOK8DloOjxrnX10VD0NzlFNI8bzgO",
    "Heather Grey-Black.png": "1ALWtsQBwYtsXUfr8HU1zxnpErJXZt0fH",
    "Heather Grey-White.png": "1OhLC2D9W86EFL2amRrQ0ztugcsgee4Xn",
    "Loden Green-Black.png": "1gcyvAx0pTp26Teo_eCdktbzkDvG3n9r_",
    "Navy-White.png": "1mqXXHSCj5PU19jaisC3ddQbKggZA_sL_",
    "White-Black.png": "114cYScdPn27TAqMonvOuiFX9VVqAAaSK",
    "White-Navy.png": "1O8Q1ZhIlJ-i0H2v95wFM2oNZukY3Q_qh",
}
FPR_CURRENT = {
    "Black/Charcoal", "Black/White", "Caramel/Black", "Heather Grey/Black", "Heather Grey/White",
    "Loden Green/Black", "Navy/White", "White/Black", "White/Navy",
}
colors_fpr = []
for raw, fid in FPR.items():
    official = slash_hyphen(raw.replace(".png", ""))
    status = "current" if official in FPR_CURRENT else "unknown"
    note = "Front only. Side and back folders are empty."
    if official == "Charcoal":
        note += " Not on the 13-name distributor list. Richardson's own page says 14 colors; this one is not confirmed current."
    colors_fpr.append(colorway("112FPR", official, status, fid, None, None, note))
colors_fpr.sort(key=lambda c: c["officialName"])

WORK = [
    ("0514E9DC-BC46-42FC-9C7D-B96BFA7D9383", "1oLiK7gZ9kVnTfpmtRGmWoJCBsCWoGge7"),
    ("1BE8DDBB-2E22-400F-A512-ADA4B12E4BFD", "13FNawEtM9hn7wB8U6_AwIw6Aahais8s-"),
    ("2CF406B1-4A45-4F5C-BE02-C434B9736D00", "1Ck7nH7u4eANtQ0mJMztpbczp-dRYwonE"),
    ("36DDD6F7-51A8-486F-BFE0-853D4C840B34", "1QQvG4CC8nCJIhJQir9QKjiWCxOdV83L5"),
    ("38EA0CEE-2D41-4212-9E44-5D174670BB98", "15ZZIBj4MmhuB5K9PelwaMdG2_fxRvytm"),
    ("42F2EE4B-915C-46A9-849B-4712DE878B62", "1Jb1i7Llo1AFCBnstmQuklhMaPe3QQ0ds"),
    ("44AB38E1-9BD0-4B64-9EEB-4B7A170368AE", "15Jv9_M4Kp4JfQa3vpMy4lTt0U7motZb_"),
    ("55222800-989B-4399-B6E4-4F4390FB3BAD", "1jHEMDEjHxsSkJvlKkl1R_-q0rlB9pMS9"),
    ("590B18B5-9329-495F-B08B-C3484E495952", "1KZnLsm8Cm_ZIpGTF4IwaWkgl4WqLJK0P"),
    ("5E5384D2-6C8E-4376-ABAC-9F62D413D12B", "16gWsFJtliYy7iye6nevjyHGvNIDDbqte"),
    ("75B42B36-684A-49CD-B629-10FBC9C636F9", "16j7OMOKeIPGmlSte6SH5HMgCpmx1x_MN"),
    ("922BDD4D-C29C-4F53-B717-B2DDE5A864C8", "1M6sUrI-5c_dcOrkf8V3ZyZ_gwbWvgOyr"),
    ("9A3C4CD8-5287-4AA2-95C7-7B28CE93001C", "1ll8Y1XJZPa6Ch4dQqz8Ua_EUP8M_IILm"),
    ("9FCFF757-20C6-4E61-9E54-BEAE7E9F6D06", "17noNOTljBU-ZysbiOniA78JPTLZ7Rvr4"),
    ("A7E21A42-2C59-431D-8E6C-E16F897DC8FA", "1FHbIhwxnVET-LgK9NOqPCpbmum13ZUYU"),
    ("B8CF835D-ECF4-4353-BBFE-77BD4407CBDE", "1ZiOOFkxbz9rvG6gWfc1MZ-HcPP8q3kk8"),
    ("C606EBFB-4174-45B9-8B08-FB71BC39236C", "14gFlXoZHOBOObv_kLWXuOPu0pMKX6Sdp"),
    ("CE87D551-A28A-4506-B6BF-04B9E011AC2F", "1KfR6XQ4k7eJBPwHV6RmQtj3xC2TVXhIG"),
    ("E649307B-A1ED-4038-9183-419436E58B30", "1jbUaC4VHkM0jcqwG5HElQBy3svfQ04g8"),
    ("F87F1AAF-2753-46F8-BB6A-F931D6F56ABD", "1MyiEQMLxVKGBIk8xSlyIswIvrrgV4ehe"),
]


def model(mid, code, official, bucket, price, listed, colors, note, hero=None):
    return {
        "id": mid,
        "code": code,
        "officialName": official,
        "bucket": bucket,
        "defaultPrice": price,
        "richardsonListed": listed,
        "suppliedCount": len(colors),
        "note": note,
        "heroDriveId": hero,
        "colorways": colors,
    }


catalog = {
    "version": 1,
    "source": "Catalog Audit v2, approved as master data. Nothing is offered.",
    "angleMap": {
        "scope": "Numbered files in the 112 White Background folder, the 112PFP folder, and the 256 folder.",
        "front": "_1",
        "side": "_2",
        "back": "_3",
        "note": "Verified on one 112, one 112PFP, and one 256 triplet. Folder-named FRONT/SIDE/BACK sets do not use this map.",
    },
    "models": [
        model("112", "112", "Trucker", "ready", 30, 122, colors_112, "104 supplied photo sets. Richardson lists 122. The other 18 were not imported. Richardson status of each supplied color is unknown until you confirm it.", colors_112[0]["views"].get("front") if colors_112 else None),
        model("112FP", "112FP", "Five Panel Trucker", "ready", 35, 18, colors_112fp, "19 supplied sets. 18 match the current color count. Blue Teal/Birch/Navy is legacy and not offered.", colors_112fp[0]["views"].get("front")),
        model("112P", "112P", "Printed Trucker", "ready", 35, 13, colors_112p, "10 complete sets. Richardson lists 13. The other 3 were not imported.", colors_112p[0]["views"].get("front")),
        model("112PFP", "112PFP", "Printed Five Panel Trucker", "ready", 35, 44, colors_112pfp, "36 complete sets. Richardson lists 44. Missing colors were not imported.", colors_112pfp[0]["views"].get("front") if colors_112pfp else None),
        model("256", "256", "Umpqua Gramps Cap", "ready", 35, None, colors_256, "Full official name. Do not shorten to Umpqua or Gramps.", colors_256[0]["views"].get("front")),
        model("256P", "256P", "Printed Umpqua Gramps Cap", "ready", 35, None, colors_256p, "Full official name.", colors_256p[0]["views"].get("front")),
        model("112FPR", "112FPR", "Five Panel Trucker with Rope", "incomplete", 35, 14, colors_fpr, "Fronts only. Not customer-selectable. Richardson lists 14; four named distributor colors and one unnamed current color were not imported.", colors_fpr[0]["views"].get("front")),
        model("112PM", "112PM", "Printed Mesh Trucker", "incomplete", 35, None, [], "Model verified. No supplied product photos in Drive."),
        model("168", "168", "7 Panel Mesh Back", "incomplete", 35, None, [], "Only a general product image, not a color library.", "117s8ZQga2Z4LssJCBBD9uBDzd7gqcgfu"),
        model("168P", "168P", "Printed 7 Panel Mesh Back", "incomplete", 35, None, [], "Model verified. No usable color photos in Drive."),
    ],
    "work": [
        {"id": file_id, "fileName": f"{name}.PNG", "driveId": file_id} for name, file_id in WORK
    ],
}

print("112", len(colors_112), "incomplete", sum(1 for c in colors_112 if c["assetStatus"] != "complete"))
print("112FP", len(colors_112fp))
print("112P", len(colors_112p))
print("112PFP", len(colors_112pfp))
print("256", len(colors_256))
print("256P", len(colors_256p))
print("112FPR", len(colors_fpr))
print("work", len(catalog["work"]))
missing_views = [
    (m["code"], c["officialName"], c["assetStatus"])
    for m in catalog["models"]
    if m["bucket"] == "ready"
    for c in m["colorways"]
    if c["assetStatus"] != "complete"
]
print("ready incomplete", missing_views[:12], "count", len(missing_views))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(catalog, open(OUT, "w"), indent=2)
print("wrote", OUT, os.path.getsize(OUT))
