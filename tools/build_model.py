#!/usr/bin/env python3
"""Pack the Fusion export (fusion-export/) into model/megatree.{json,bin} for the web viewer.

OBJ files from the Fusion script are in each occurrence's *local* frame, not world, so the
occurrence placements are read from the STEP file and applied here. Output coordinates are
three.js world space in metres (Y up): three(x, y, z) = fusion(x, z, -y) / 1000.

Usage: python3 tools/build_model.py
"""
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "fusion-export"
OUT = ROOT / "model"


def parse_step_placements(step_path):
    """Return {occurrence name: 4x4 row-major matrix (mm)} from NAUO transforms in a STEP file."""
    text = step_path.read_text(errors="replace")
    ents = {}
    for m in re.finditer(r"#(\d+)\s*=\s*(.*?);\s*\n(?=#|ENDSEC)", text, re.S):
        ents[int(m.group(1))] = " ".join(m.group(2).split())
    unit = 10.0 if "SI_UNIT(.CENTI.,.METRE.)" in text else 1.0

    def refs(s):
        return [int(x) for x in re.findall(r"#(\d+)", s)]

    def nums(i):
        body = ents[i].split("'", 2)[-1]
        return [float(x) for x in re.search(r"\(\(?([-0-9.E+, ]+)\)", body).group(1).split(",")]

    def placement(i):
        r = refs(ents[i])
        origin = [c * unit for c in nums(r[0])]
        z = nums(r[1]) if len(r) > 1 else [0, 0, 1]
        x = nums(r[2]) if len(r) > 2 else [1, 0, 0]
        y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
        return [
            [x[0], y[0], z[0], origin[0]],
            [x[1], y[1], z[1], origin[1]],
            [x[2], y[2], z[2], origin[2]],
            [0, 0, 0, 1],
        ]

    out = {}
    for s in ents.values():
        if not s.startswith("CONTEXT_DEPENDENT_SHAPE_REPRESENTATION"):
            continue
        rel_id, pds_id = refs(s)[:2]
        nauo_id = refs(ents[pds_id])[-1]
        name = re.search(r"'([^']*)'", ents[nauo_id]).group(1)
        idt = next(x for x in refs(ents[rel_id]) if ents[x].startswith("ITEM_DEFINED_TRANSFORMATION"))
        _, to_ax = refs(ents[idt])
        out[name] = placement(to_ax)
    return out


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


IDENTITY = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


# Parts that animate or light up independently get their own mesh, tagged with a role.
ROLES = [
    (r"Crank_arm|Handle_grip|Crank_shaft", "crank"),
    (r"^Sheave_(Austlift|shim)", "sheave"),
    (r"^Star_pixels", "starPixels"),
    (r"^Section_1$", "pole1"),
    (r"^(Section_2|Coupler_1)$", "pole2"),
    (r"^(Section_3|Coupler_2)$", "pole3"),
    (r"^(Base_plate|Hinge_lug|Leaf-lock_nut_welded)", "basePlate"),
    (r"^Plate_nut_M12", "plateNut:"),          # trailing ':' → one role per part, so each nut can spin
    (r"^(Hinge_pin|Nyloc_M16)", "hingePin"),
    (r"^Leaf-lock_(bolt|washer)", "leafLock"),
]
# Fusion exported nearly everything as satin steel; override where the real finish differs.
COLOR_OVERRIDES = [
    (r"^Star_coro", [0.92, 0.92, 0.9]),
    (r"^Star_pixels", [0.85, 0.85, 0.83]),
    (r"^Star_wiring", [0.15, 0.15, 0.15]),
]


def match_rule(rules, name, default=None):
    return next((v for pat, v in rules if re.search(pat, name)), default)


def squash(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def read_mtl(path):
    colors, cur = {}, None
    if path.exists():
        for line in path.read_text().splitlines():
            parts = line.split()
            if parts[:1] == ["newmtl"]:
                cur = " ".join(parts[1:])
            elif parts[:1] == ["Kd"] and cur:
                colors[cur] = [float(v) for v in parts[1:4]]
    return colors


def read_obj(path):
    vs, vns, tris = [], [], []
    material = None
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            vs.append([float(v) for v in line.split()[1:4]])
        elif line.startswith("vn "):
            vns.append([float(v) for v in line.split()[1:4]])
        elif line.startswith("usemtl "):
            material = line[7:].strip()
        elif line.startswith("f "):
            corners = []
            for tok in line.split()[1:]:
                p = tok.split("/")
                corners.append((int(p[0]) - 1, int(p[2]) - 1 if len(p) > 2 and p[2] else -1))
            for k in range(1, len(corners) - 1):
                tris.append((corners[0], corners[k], corners[k + 1]))
    return vs, vns, tris, material


def transform_point(m, p):
    return [m[r][0] * p[0] + m[r][1] * p[1] + m[r][2] * p[2] + m[r][3] for r in range(3)]


def transform_dir(m, d):
    v = [m[r][0] * d[0] + m[r][1] * d[1] + m[r][2] * d[2] for r in range(3)]
    n = max(1e-12, sum(c * c for c in v) ** 0.5)
    return [c / n for c in v]


def to_three(p):
    return [p[0] / 1000, p[2] / 1000, -p[1] / 1000]


def to_three_dir(d):
    return [d[0], d[2], -d[1]]


def export_joints(joints):
    out = {}
    for j in joints["asBuiltJoints"]:
        if j["type"] not in ("Slider", "Revolute"):
            continue
        entry = {
            "type": j["type"],
            "moving": j["occurrenceOne"].rsplit(":", 1)[0],
            "parent": j["occurrenceTwo"].rsplit(":", 1)[0],
            "origin": to_three(j["origin_mm"]),
            "axis": to_three_dir(j["axis"]),
        }
        if j["type"] == "Slider":
            entry.update(exported=j["value_mm"], limits=j["limits_mm"])
        else:
            entry.update(exported=j["value_deg"], limits=j["limits_deg"])
        out[j["name"]] = entry
    return out


def export_lines(joints):
    sk = joints["sketchLines_world_mm"]

    def seg(s):
        return [to_three(s[:3]), to_three(s[3:])]

    strings, ring = [], []
    for s in sk["Skeleton/Strings @ park + base ring"]:
        (ring if abs(s[2] - s[5]) < 1 else strings).append(seg(s))
    return {
        "strings": strings,
        "baseRing": ring,
        "guys": [seg(s) for s in sk["Cable paths/Guys (Stage 6)"]],
        "cablePark": [seg(s) for s in sk["Cable paths/Cable @ park"]],
        "cableLow": [seg(s) for s in sk["Cable paths/Cable @ low"]],
    }


def main():
    manifest = json.loads((SRC / "manifest.json").read_text())
    joints = json.loads((SRC / "joints.json").read_text())
    placements = parse_step_placements(SRC / "Megatree_v3_full.step")

    # Fusion exports instances of the same component under one file name, so a part used twice
    # (Carriage:1 / Carriage:2) arrives as a single OBJ and is instanced here once per placement.
    sub_occurrences = {}
    for occ in joints["occurrences"]:
        for child in occ.get("children", []):
            base = child.rsplit(":", 1)[0]
            sub_occurrences.setdefault(occ["name"], {}).setdefault(squash(base), []).append(child)

    meshes = {}  # (group, color) -> {pos, nrm, idx, parts}
    parts_out = []

    for group, info in manifest["groups"].items():
        occ_name = info["occurrence"]
        occ_m = placements.get(occ_name, IDENTITY)
        children = sub_occurrences.get(occ_name, {})
        for fname in dict.fromkeys(info["files"]):  # manifest repeats overwritten names
            path = SRC / info["folder"] / fname
            stem = fname[:-4]
            sub_key = next((k for k in children if squash(stem).startswith(k)), None)
            instances = children[sub_key] if sub_key else [None]
            vs, vns, tris, material = read_obj(path)
            colors = read_mtl(path.with_suffix(".mtl"))
            color = match_rule(COLOR_OVERRIDES, stem, colors.get(material, [0.63, 0.63, 0.63]))
            role = match_rule(ROLES, stem)
            if role and role.endswith(':'):
                role += stem
            for inst in instances:
                m = matmul(occ_m, placements[inst]) if inst else occ_m
                key = (group, tuple(round(c, 4) for c in color), role)
                mesh = meshes.setdefault(key, {"pos": [], "nrm": [], "idx": [], "parts": []})
                remap = {}
                start_tri = len(mesh["idx"]) // 3
                lo = [1e9] * 3
                hi = [-1e9] * 3
                for tri in tris:
                    for vi, ni in tri:
                        k = (vi, ni)
                        if k not in remap:
                            p = to_three(transform_point(m, vs[vi]))
                            n = to_three_dir(transform_dir(m, vns[ni])) if ni >= 0 else [0, 1, 0]
                            remap[k] = len(mesh["pos"]) // 3
                            mesh["pos"].extend(p)
                            mesh["nrm"].extend(n)
                            for a in range(3):
                                lo[a] = min(lo[a], p[a])
                                hi[a] = max(hi[a], p[a])
                        mesh["idx"].append(remap[k])
                label = " ".join(stem.replace("__", " / ").replace("_", " ").split())
                if inst and len(instances) > 1:
                    label += f" ({inst.split(':')[-1]})"
                part = {"name": label, "group": group, "min": lo, "max": hi}
                mesh["parts"].append([start_tri, len(mesh["idx"]) // 3, len(parts_out)])
                parts_out.append(part)

    blob = bytearray()
    mesh_out = []
    for (group, color, role), mesh in meshes.items():
        def put(fmt, values):
            off = len(blob)
            blob.extend(struct.pack(f"<{len(values)}{fmt}", *values))
            while len(blob) % 4:
                blob.append(0)
            return off

        n_q = [max(-127, min(127, round(c * 127))) for c in mesh["nrm"]]
        mesh_out.append({
            "group": group,
            "role": role,
            "color": list(color),
            "vertexCount": len(mesh["pos"]) // 3,
            "indexCount": len(mesh["idx"]),
            "position": put("f", mesh["pos"]),
            "normal": put("b", n_q),
            "index": put("I", mesh["idx"]),
            "parts": mesh["parts"],
        })

    OUT.mkdir(exist_ok=True)
    (OUT / "megatree.bin").write_bytes(bytes(blob))
    header = {
        "source": joints.get("source"),
        "note": "Generated by tools/build_model.py from fusion-export/. Do not edit by hand.",
        "meshes": mesh_out,
        "parts": parts_out,
        "joints": export_joints(joints),
        "lines": export_lines(joints),
    }
    (OUT / "megatree.json").write_text(json.dumps(header, separators=(",", ":")))
    print(f"{len(mesh_out)} meshes, {len(parts_out)} parts, {len(blob) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
