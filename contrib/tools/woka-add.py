#!/usr/bin/env python3
"""Import a Woka into the persistent production catalog without restarting Play."""
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import struct
import sys
import tarfile
import unicodedata
import urllib.parse
import urllib.request
import uuid
import zlib

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("deploy-production.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
DIRECTORY = deploy.CUSTOM_WOKA_DIRECTORY
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]{0,79}")
FILE_PATTERN = re.compile(r"[a-f0-9]{64}\.png")


def validate_png(content):
    deploy.require(len(content) <= 2 * 1024 * 1024 and content.startswith(b"\x89PNG\r\n\x1a\n"),
                   "Un PNG de moins de 2 Mo est requis.")
    offset, chunks, image = 8, [], b""
    header = None
    while offset + 12 <= len(content):
        size = struct.unpack_from(">I", content, offset)[0]
        kind = content[offset + 4:offset + 8]
        end = offset + 8 + size
        deploy.require(end + 4 <= len(content), "PNG tronqué.")
        value = content[offset + 8:end]
        deploy.require(zlib.crc32(kind + value) == struct.unpack_from(">I", content, end)[0], "PNG corrompu (CRC).")
        chunks.append(kind)
        if kind == b"IHDR":
            deploy.require(header is None and len(value) == 13, "En-tête PNG invalide.")
            header = struct.unpack(">IIBBBBB", value)
        if kind == b"IDAT":
            image += value
        offset = end + 4
        if kind == b"IEND":
            break
    deploy.require(header is not None and chunks[0] == b"IHDR" and chunks[-1] == b"IEND"
                   and offset == len(content) and image, "Structure PNG invalide.")
    width, height, depth, color, compression, filtering, interlace = header
    deploy.require((width, height) == (96, 128), "Grille attendue : 96 × 128 pixels (3 × 4 cases de 32 pixels).")
    deploy.require(color in (3, 4, 6) and (color != 3 or b"tRNS" in chunks), "Le PNG doit gérer la transparence.")
    deploy.require(compression == filtering == interlace == 0 and depth in (1, 2, 4, 8, 16)
                   and (color == 3 and depth <= 8 or color in (4, 6) and depth in (8, 16)),
                   "Utiliser un PNG standard non entrelacé, avec transparence.")
    channels = {3: 1, 4: 2, 6: 4}[color]
    row = (width * channels * depth + 7) // 8
    expected = height * (row + 1)
    try:
        decoder = zlib.decompressobj()
        pixels = decoder.decompress(image, expected + 1)
    except zlib.error:
        raise deploy.DeploymentError("Données PNG invalides.") from None
    deploy.require(len(pixels) == expected and decoder.eof and not decoder.unused_data
                   and all(pixels[y * (row + 1)] <= 4 for y in range(height)), "Données PNG invalides.")


def slug(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return "custom-" + re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")[:65]


def validate_catalog(catalog):
    deploy.require(isinstance(catalog, dict) and catalog.get("version") == 1
                   and isinstance(catalog.get("wokas"), list) and len(catalog["wokas"]) <= 1000,
                   "Catalogue personnalisé invalide.")
    ids = set()
    for entry in catalog["wokas"]:
        deploy.require(isinstance(entry, dict) and isinstance(entry.get("id"), str)
                       and ID_PATTERN.fullmatch(entry["id"]) and entry["id"] not in ids
                       and isinstance(entry.get("name"), str) and 1 <= len(entry["name"].strip()) <= 80
                       and isinstance(entry.get("filename"), str) and FILE_PATTERN.fullmatch(entry["filename"]),
                       "Entrée invalide ou identifiant en double dans le catalogue.")
        ids.add(entry["id"])
    return catalog


def updated_catalog(catalog, entry, replace=False):
    result = json.loads(json.dumps(validate_catalog(catalog)))
    existing = next((x for x in result["wokas"] if x["id"] == entry["id"]), None)
    if existing:
        deploy.require(replace or existing == entry,
                       "Cet identifiant existe déjà. Utiliser --replace pour modifier ce Woka.")
        result["wokas"][result["wokas"].index(existing)] = entry
    else:
        result["wokas"].append(entry)
    return validate_catalog(result)


def unpack_output(raw):
    result, offset = bytearray(), 0
    while offset < len(raw):
        deploy.require(offset + 8 <= len(raw), "Réponse Docker tronquée.")
        size = struct.unpack_from(">I", raw, offset + 4)[0]
        deploy.require(offset + 8 + size <= len(raw), "Réponse Docker tronquée.")
        result.extend(raw[offset + 8:offset + 8 + size])
        offset += 8 + size
    return result.decode()


def execute(api, container, script, *args):
    job = api.docker(f"/containers/{container}/exec", method="POST", payload={
        "AttachStdout": True, "AttachStderr": True, "Tty": False, "User": "0",
        "Cmd": ["node", "-e", script, *args]})
    raw = api.docker(f"/exec/{job['Id']}/start", method="POST", payload={"Detach": False, "Tty": False}, raw=True)
    status = api.docker(f"/exec/{job['Id']}/json")
    deploy.require(status["ExitCode"] == 0, "Opération distante refusée (verrou déjà pris ou fichier inaccessible).")
    return unpack_output(raw)


def archive_files(files):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w") as archive:
        for name, content in files.items():
            deploy.require('/' not in name and name not in ('.', '..'), "Nom de fichier invalide.")
            item = tarfile.TarInfo(name)
            item.size, item.mode, item.uid, item.gid = len(content), 0o644, 1000, 1000
            archive.addfile(item, io.BytesIO(content))
    return out.getvalue()


def import_woka(api, args, state):
    content = args.file.expanduser().read_bytes()
    validate_png(content)
    name = args.name.strip()
    identifier = args.id or slug(name)
    deploy.require(1 <= len(name) <= 80 and ID_PATTERN.fullmatch(identifier), "Nom ou identifiant invalide.")
    entry = {"id": identifier, "name": name, "filename": hashlib.sha256(content).hexdigest() + ".png"}
    api.discover()
    before = api.inspect()
    play = before["play"]
    deploy.require(any(m["Destination"] == DIRECTORY and m["Type"] == "volume"
                       and m.get("Name") == deploy.CUSTOM_WOKA_VOLUME and m["RW"] for m in play.get("Mounts", [])),
                   "Volume Woka absent. Installer le mécanisme avec prod:deploy -- --enable-custom-wokas.")
    container = play["Id"]
    # The lock lives on the server so imports from two machines cannot overwrite one another.
    execute(api, container, "require('fs').mkdirSync(process.argv[1])", DIRECTORY + "/.import-lock")
    temp_name = ".catalog-" + uuid.uuid4().hex + ".json"
    published = False
    try:
        raw = execute(api, container,
            "const f=require('fs'); const p=process.argv[1]; "
            "process.stdout.write(f.existsSync(p)?f.readFileSync(p,'utf8'):JSON.stringify({version:1,wokas:[]}))",
            DIRECTORY + "/catalog.json")
        catalog = validate_catalog(json.loads(raw))
        # Avoid shadowing a built-in body/hair/clothing layer or silently replacing a built-in Woka.
        builtins = json.loads(execute(api, container,
            "process.stdout.write(require('fs').readFileSync('/usr/src/play/src/pusher/data/woka.json','utf8'))"))
        for part, data in builtins.items():
            collision = any(t['id'] == identifier for c in data['collections'] for t in c['textures'])
            deploy.require(not collision or part == 'woka' and args.replace,
                           "Identifiant déjà utilisé dans le catalogue intégré ; choisir un autre --id "
                           "ou --replace pour remplacer un personnage complet.")
        new_catalog = updated_catalog(catalog, entry, args.replace)
        timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
        backup = deploy.private_dir(state / "woka-imports" / timestamp)
        deploy.save(backup / "catalog-before.json", catalog)
        deploy.save(backup / "catalog-after.json", new_catalog)
        # Keep an exact binary local copy without weakening private backup permissions.
        with deploy.os.fdopen(deploy.os.open(backup / entry['filename'],
                              deploy.os.O_WRONLY | deploy.os.O_CREAT | deploy.os.O_EXCL, 0o600), 'wb') as output:
            output.write(content)
        encoded = (json.dumps(new_catalog, ensure_ascii=False, indent=2) + "\n").encode()
        api.docker(f"/containers/{container}/archive?" + urllib.parse.urlencode({"path": DIRECTORY}),
                   method="PUT", raw_body=archive_files({entry['filename']: content, temp_name: encoded}),
                   headers={"Content-Type": "application/x-tar"}, raw=True)
        # Confirm the public file before making the catalog entry visible.
        with urllib.request.urlopen(deploy.APP + "/custom-wokas/" + entry['filename'], timeout=30) as response:
            deploy.require(response.status == 200 and response.read() == content, "Le PNG public ne correspond pas au fichier importé.")
        execute(api, container, "require('fs').renameSync(process.argv[1],process.argv[2])",
                DIRECTORY + "/" + temp_name, DIRECTORY + "/catalog.json")
        published = True
        actual = execute(api, container, "process.stdout.write(require('fs').readFileSync(process.argv[1],'utf8'))",
                         DIRECTORY + "/catalog.json")
        deploy.require(json.loads(actual) == new_catalog, "Catalogue distant différent du catalogue prévu.")
        details = json.loads(execute(api, container,
            "require('tsx/cjs'); const {localWokaService}=require('./src/pusher/services/LocalWokaService.ts'); "
            "localWokaService.fetchWokaDetails([process.argv[1]]).then(x=>process.stdout.write(JSON.stringify(x)))"
            ".catch(()=>process.exit(1))", identifier))
        deploy.require(details == [{"id": identifier, "url": "/custom-wokas/" + entry['filename']}],
                       "Le service Play n'a pas validé le nouveau personnage.")
        after = api.inspect()
        deploy.verify_settings(before, after, {s: c["Image"] for s, c in before.items()})
        deploy.require(all(after[s]['Id'] == c['Id'] and after[s]['RestartCount'] == c['RestartCount']
                           for s, c in before.items()), "Un conteneur a changé pendant l'import.")
        deploy.save(backup / "status.json", {"state": "complete", "woka": entry, "container": container})
        deploy.say(f"Woka « {name} » ajouté ({identifier}). Aucun redémarrage. Rouvrir le sélecteur ou recharger la page.")
        deploy.say(f"Sauvegarde privée : {backup}")
    except (Exception, KeyboardInterrupt):
        if published:
            api.docker(f"/containers/{container}/archive?" + urllib.parse.urlencode({"path": DIRECTORY}),
                       method="PUT", raw_body=archive_files({temp_name: (json.dumps(catalog) + "\n").encode()}),
                       headers={"Content-Type": "application/x-tar"}, raw=True)
            execute(api, container, "require('fs').renameSync(process.argv[1],process.argv[2])",
                    DIRECTORY + "/" + temp_name, DIRECTORY + "/catalog.json")
            deploy.say("Import non validé : catalogue précédent restauré.")
        raise
    finally:
        execute(api, container,
                "const f=require('fs'); f.rmSync(process.argv[1],{force:true}); f.rmdirSync(process.argv[2])",
                DIRECTORY + "/" + temp_name, DIRECTORY + "/.import-lock")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--name", required=True, help="Nom affiché dans le sélecteur")
    parser.add_argument("--id", help="Identifiant stable ; déduit du nom sinon")
    parser.add_argument("--replace", action="store_true", help="Mettre à jour un personnage existant en conservant son identifiant")
    args = parser.parse_args()
    deploy.os.umask(0o077)
    state = deploy.private_dir(deploy.STATE)
    with (state / ".deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise deploy.DeploymentError("Un déploiement ou un import est déjà en cours sur cette machine.") from None
        import_woka(deploy.Portainer(Path.home() / ".config/portainer.env"), args, state)


if __name__ == "__main__":
    try:
        main()
    except deploy.DeploymentError as error:
        print(f"Erreur : {error}", file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, zlib.error):
        print("Erreur : fichier local ou réponse distante invalide. Aucun secret affiché.", file=sys.stderr)
        sys.exit(1)
