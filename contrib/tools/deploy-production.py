#!/usr/bin/env python3
"""Deploy the Eoloa fork using locally stored Portainer and Docker credentials."""

import argparse
import base64
import copy
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
REGISTRY = "registry.eoloa.eu"
APP = "https://workadventure.eoloa.net"
STATE = Path.home() / ".local/state/workadventure/deployments"
SERVICES = ("play", "back", "map-storage", "uploader")
CUSTOM_WOKA_DIRECTORY = "/var/lib/workadventure/wokas"
CUSTOM_WOKA_VOLUME = "workadventure_custom-wokas"


class DeploymentError(Exception):
    """A safe, user-facing diagnostic; never include response bodies or credentials."""


def require(condition, message):
    if not condition:
        raise DeploymentError(message)


def say(message):
    print(message, flush=True)


def private_dir(path):
    path = path.expanduser().resolve()
    require(not path.is_relative_to(ROOT), "Les sauvegardes doivent rester hors du dépôt.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(path.stat().st_uid == os.getuid(), "Le dossier de sauvegarde appartient à un autre utilisateur.")
    path.chmod(0o700)
    return path


def save(path, value):
    # Backups can contain the stack's secrets. Never use stdout for these values.
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW
    with os.fdopen(os.open(path, flags, 0o600), "w") as out:
        os.fchmod(out.fileno(), 0o600)
        out.write(value if isinstance(value, str) else json.dumps(value, indent=2))


def read_credentials(path):
    require(path.is_file(), f"Renseigner le fichier local {path} (permissions 600).")
    info = path.stat()
    require(stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == os.getuid(),
            f"Le fichier {path} doit vous appartenir et avoir les permissions 600.")
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip().removeprefix("export ")
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        require(bool(separator), "Format invalide dans le fichier Portainer.")
        try:
            parts = shlex.split(value, comments=True)
        except ValueError:
            raise DeploymentError("Valeur mal délimitée dans le fichier Portainer.") from None
        require(len(parts) == 1, "Valeur vide ou mal délimitée dans le fichier Portainer.")
        values[key.strip()] = parts[0]
    require(bool(values.get("PORTAINER_URL") and values.get("PORTAINER_API_KEY")),
            "PORTAINER_URL et PORTAINER_API_KEY sont requis dans le fichier local.")
    url = urllib.parse.urlsplit(values["PORTAINER_URL"])
    require(url.scheme == "https" and bool(url.hostname) and not url.username and not url.password
            and not url.query and not url.fragment, "PORTAINER_URL doit être une URL HTTPS sans identifiants.")
    return values["PORTAINER_URL"].rstrip("/"), values["PORTAINER_API_KEY"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Do not forward the Portainer key or registry auth to a redirected host.
        return None


class Portainer:
    def __init__(self, config):
        self.url, self.key = read_credentials(config)
        self.opener = urllib.request.build_opener(NoRedirect)
        self.endpoint = None
        self.stack_id = None

    def request(self, path, method="GET", payload=None, headers=None, raw=False, timeout=45, raw_body=None):
        body = raw_body if raw_body is not None else json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(self.url + "/api" + path, data=body, method=method,
            headers={"X-API-Key": self.key, "Content-Type": "application/json", **(headers or {})})
        try:
            with self.opener.open(request, timeout=timeout) as response:
                result = response.read()
            return result if raw else json.loads(result) if result else None
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise DeploymentError("Accès Portainer ou registre refusé : vérifier les identifiants locaux.") from None
            raise DeploymentError(f"Échec de l'API Portainer (HTTP {error.code}).") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise DeploymentError("API Portainer inaccessible, délai dépassé ou réponse invalide.") from None

    def discover(self):
        endpoints = [x for x in self.request("/endpoints") if x["Name"] == "local"]
        require(len(endpoints) == 1 and endpoints[0]["Id"] == 3, "Environnement local inattendu (ID attendu : 3).")
        stacks = [x for x in self.request("/stacks") if x["Name"] == "workadventure"]
        require(len(stacks) == 1 and stacks[0]["Id"] == 19 and stacks[0]["EndpointId"] == 3
                and stacks[0]["Type"] == 2, "Stack workadventure inattendue (ID attendu : 19, Compose).")
        self.endpoint, self.stack_id = 3, 19
        return stacks[0]

    def docker(self, path, **kwargs):
        return self.request(f"/endpoints/{self.endpoint}/docker{path}", **kwargs)

    def compose(self):
        return self.request(f"/stacks/{self.stack_id}/file")["StackFileContent"]

    def inspect(self):
        containers = self.docker("/containers/json?all=1")
        return {x["Labels"]["com.docker.compose.service"]:
                self.docker(f"/containers/{x['Id']}/json") for x in containers
                if x.get("Labels", {}).get("com.docker.compose.project") == "workadventure"}

    def update(self, compose, env):
        # Images have already been pulled individually. Do not refresh redis:6 or other unrelated tags.
        return self.request(f"/stacks/{self.stack_id}?endpointId={self.endpoint}", method="PUT",
            payload={"StackFileContent": compose, "Env": env, "Prune": False, "PullImage": False}, timeout=300)


def captured(command, cwd=ROOT, input_text=None):
    try:
        result = subprocess.run(command, cwd=cwd, input=input_text, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        raise DeploymentError(f"Commande indisponible ou délai dépassé : {command[0]}.") from None
    require(result.returncode == 0, f"Échec de {command[0]} ; vérifier son installation ou son authentification.")
    return result.stdout.strip()


def git(*args):
    return captured(["git", *args])


def registry_auth():
    config_dir = Path(os.environ.get("DOCKER_CONFIG", str(Path.home() / ".docker")))
    config = json.loads((config_dir / "config.json").read_text())
    helper = config.get("credHelpers", {}).get(REGISTRY, config.get("credsStore"))
    if helper:
        require(bool(re.fullmatch(r"[A-Za-z0-9_-]+", helper)), "Nom du trousseau Docker invalide.")
        credential = json.loads(captured(["docker-credential-" + helper, "get"], input_text=REGISTRY + "\n"))
        auth = {"identitytoken": credential["Secret"]} if credential["Username"] == "<token>" else {
            "username": credential["Username"], "password": credential["Secret"]}
    else:
        entry = config.get("auths", {}).get(REGISTRY, {})
        require(bool(entry.get("auth") or entry.get("identitytoken")), f"Exécuter docker login {REGISTRY} une fois.")
        if entry.get("identitytoken"):
            auth = {"identitytoken": entry["identitytoken"]}
        else:
            username, password = base64.b64decode(entry["auth"]).decode().split(":", 1)
            auth = {"username": username, "password": password}
    auth["serveraddress"] = REGISTRY
    return base64.urlsafe_b64encode(json.dumps(auth).encode()).decode()


def image_manifest(image):
    manifest = json.loads(captured(["docker", "buildx", "imagetools", "inspect", "--raw", image]))
    if "manifests" in manifest:
        platforms = [x for x in manifest["manifests"] if x.get("platform", {}).get("os") == "linux"
                     and x["platform"].get("architecture") == "amd64"]
        require(len(platforms) == 1, "L'image doit fournir exactement une variante linux/amd64.")
        manifest = json.loads(captured(["docker", "buildx", "imagetools", "inspect", "--raw",
                                        image.split("@")[0] + "@" + platforms[0]["digest"]]))
    return manifest


def replace_images(compose, before, desired):
    # Preserve every byte except image references; never rewrite production YAML with a serializer.
    lines = compose.splitlines(keepends=True)
    for service, new in desired.items():
        old = before[service]["Config"]["Image"]
        pattern = re.compile(r"^(\s*image:\s*)([\"']?)" + re.escape(old) + r"\2(?=\s*(?:#.*)?$)")
        matches = [i for i, line in enumerate(lines) if pattern.search(line)]
        require(len(matches) == 1, f"Référence d'image ambiguë ou interpolée pour {service}.")
        i = matches[0]
        lines[i] = pattern.sub(lambda m: m[1] + m[2] + new + m[2], lines[i], count=1)
    return "".join(lines)


def environment_values(entries):
    # Docker also returns bare names for unset variables; keep these distinct from empty values.
    return {key: value if separator else None
            for key, separator, value in (entry.partition("=") for entry in entries)}


def enable_custom_woka_volume(compose, before, mountpoint):
    require(not before["play"].get("Mounts"), "Installation initiale attendue sans montage Play existant.")
    require(len(re.findall(r"^  play:\s*$", compose, re.M)) == 1
            and len(re.findall(r"^volumes:\s*$", compose, re.M)) == 1,
            "Structure Compose inattendue pour installer le volume Woka.")
    require("eoloa-custom-wokas" not in compose and CUSTOM_WOKA_DIRECTORY not in compose,
            "Le volume Woka est déjà déclaré ou sa configuration est ambiguë.")
    compose = re.sub(r"^(  play:)\s*$", lambda m: m[1] + "\n    volumes:\n"
                     f"      - eoloa-custom-wokas:{CUSTOM_WOKA_DIRECTORY}:rw", compose, count=1, flags=re.M)
    compose = re.sub(r"^(volumes:)\s*$", lambda m: m[1] + "\n  eoloa-custom-wokas:\n"
                     f"    external: true\n    name: {CUSTOM_WOKA_VOLUME}", compose, count=1, flags=re.M)
    expected = copy.deepcopy(before)
    expected["play"]["HostConfig"]["Mounts"] = [{"Source": CUSTOM_WOKA_VOLUME,
        "Target": CUSTOM_WOKA_DIRECTORY, "Type": "volume", "VolumeOptions": {}}]
    expected["play"]["Mounts"] = [{"Type": "volume", "Source": mountpoint,
                                  "Destination": CUSTOM_WOKA_DIRECTORY, "RW": True}]
    return compose, expected


def enable_external_presence(compose, before, token_file):
    info = token_file.stat()
    require(stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == os.getuid()
            and not token_file.resolve().is_relative_to(ROOT),
            "Le jeton de présence doit être un fichier privé 600 hors dépôt.")
    token = token_file.read_text().strip()
    require(bool(re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token)), "Format du jeton de présence invalide.")
    require("EXTERNAL_PRESENCE_API_TOKEN" not in compose
            and "EXTERNAL_PRESENCE_API_TOKEN" not in environment_values(before["play"]["Config"]["Env"]),
            "Le jeton de présence est déjà configuré ; ne pas le remplacer implicitement.")
    blocks = list(re.finditer(r"^  play:\s*\n(?:(?!^  [a-zA-Z0-9_-]+:|^\S).)*", compose, re.M | re.S))
    require(len(blocks) == 1, "Service Play ambigu pour la configuration de présence.")
    block = blocks[0]
    content = block.group()
    environment = re.search(r"^(    environment:[ \t]*\n)([ ]{4,})- ", content, re.M)
    require(len(re.findall(r"^    environment:[ \t]*$", content, re.M)) == 1 and environment is not None,
            "Liste environment Play attendue pour la configuration de présence.")
    # YAML permits an indentless sequence at the same level as the environment key.
    # Match that exact sequence indentation rather than guessing from other service lists.
    insertion = environment.end(1)
    changed = (content[:insertion] + environment[2] + "- EXTERNAL_PRESENCE_API_TOKEN=" + token + "\n"
               + content[insertion:])
    expected = copy.deepcopy(before)
    expected["play"]["Config"]["Env"].append("EXTERNAL_PRESENCE_API_TOKEN=" + token)
    return compose[:block.start()] + changed + compose[block.end():], expected


def validate_compose(compose_file, stack_env, directory):
    log_file = directory / "compose-validation.log"
    save(log_file, "")
    environment = {**os.environ, **{entry["name"]: entry["value"] for entry in stack_env}}
    with log_file.open("a") as log:
        result = subprocess.run(["docker", "compose", "-f", str(compose_file), "config", "--quiet"],
                                cwd=directory, env=environment, stdout=log, stderr=subprocess.STDOUT)
    require(result.returncode == 0, f"Compose invalide ; voir {log_file}.")


def verify_settings(before, after, expected_ids):
    require(set(before) == set(after), "La liste des services a changé.")
    for service, old in before.items():
        new = after[service]
        require(new["Image"] == expected_ids[service], f"Digest d'image inattendu : {service}.")
        for key in ("Binds", "Mounts", "PortBindings", "RestartPolicy", "Memory", "NanoCpus", "NetworkMode"):
            require(new["HostConfig"].get(key) == old["HostConfig"].get(key),
                    f"Paramètre Docker modifié : {service}/{key}.")
        old_mounts = sorted((x["Type"], x["Source"], x["Destination"], x["RW"]) for x in old.get("Mounts", []))
        new_mounts = sorted((x["Type"], x["Source"], x["Destination"], x["RW"]) for x in new.get("Mounts", []))
        require(old_mounts == new_mounts, f"Volumes modifiés : {service}.")
        old_env = environment_values(old["Config"]["Env"])
        new_env = environment_values(new["Config"]["Env"])
        require(all(k in new_env and new_env[k] == v for k, v in old_env.items()
                    if k not in ("NODE_VERSION", "YARN_VERSION")),
                f"Configuration applicative modifiée : {service}.")


def endpoints():
    for path in ("/", "/ping", "/map-storage/ping"):
        try:
            with urllib.request.urlopen(APP + path, timeout=20) as response:
                require(response.status == 200, f"Endpoint indisponible : {path}.")
        except (urllib.error.URLError, TimeoutError, OSError):
            raise DeploymentError(f"Endpoint indisponible : {path}.") from None


def wait_healthy(api, before, expected_ids, directory):
    deadline = time.monotonic() + 240
    consecutive = 0
    while time.monotonic() < deadline:
        try:
            current = api.inspect()
            verify_settings(before, current, expected_ids)
            require(all(x["State"]["Status"] == "running"
                        and x["RestartCount"] == (before[s]["RestartCount"] if x["Id"] == before[s]["Id"] else 0)
                        and x["State"].get("Health", {}).get("Status", "healthy") == "healthy"
                        for s, x in current.items()), "Les services ne sont pas encore sains.")
            endpoints()
            consecutive += 1
            if consecutive == 3:
                save(directory / "inspect-after.json", current)
                return current
        except DeploymentError:
            consecutive = 0
        time.sleep(5)
    raise DeploymentError("Santé, images, configuration ou endpoints non validés après quatre minutes.")


def collect_logs(api, current, directory):
    warnings = []
    for service, item in current.items():
        raw = api.docker(f"/containers/{item['Id']}/logs?stdout=1&stderr=1&tail=500&timestamps=1", raw=True)
        text = raw.decode(errors="replace")
        save(directory / f"{service}-after.log", text)
        require(not re.search(r"uncaughtException|UnhandledPromiseRejection|\bfatal\b", text, re.I),
                f"Erreur fatale dans les logs de {service} ; voir la sauvegarde privée.")
        if "M_INVALID_PARAM" in text:
            warnings.append(f"{service}: avertissement Matrix M_INVALID_PARAM (déjà connu)")
        if "ECONNREFUSED" in text:
            warnings.append(f"{service}: connexion refusée dans les logs, à examiner")
    return warnings


def checks(directory):
    commands = [("play", ["npm", "run", name]) for name in ("typecheck", "svelte-check", "i18n:check")]
    commands += [("back", ["npm", "run", "typecheck"]),
        ("play", ["npm", "test", "--", "--run", "src/front/Chat/Connection/Matrix/tests",
                  "tests/front/ExternalModule/GoogleMeetSession.test.ts",
                  "tests/front/ExternalModule/GoogleMeetPanel.test.ts", "tests/front/ExternalModule/GoogleMeetMedia.test.ts",
                  "tests/pusher/CustomWokas.test.ts", "tests/pusher/ExternalPresenceService.test.ts",
                  "tests/pusher/ExternalModuleToken.test.ts"]),
        ("back", ["npm", "test", "--", "--run", "tests/Space.test.ts"])]
    for index, (package, command) in enumerate(commands):
        say(f"Validation {package} : {' '.join(command)}")
        with (directory / f"validation-{index}.log").open("w") as log:
            result = subprocess.run(command, cwd=ROOT / package, stdout=log, stderr=subprocess.STDOUT)
        require(result.returncode == 0, f"Validation échouée ; voir {directory / f'validation-{index}.log'}.")


def build_and_publish(directory, desired, commit):
    with (directory / "source.tar").open("wb") as archive:
        subprocess.run(["git", "archive", "--format=tar", commit], cwd=ROOT, stdout=archive, check=True)
    for service in ("play", "back"):
        probe = subprocess.run(["docker", "buildx", "imagetools", "inspect", "--raw", desired[service]],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if probe.returncode == 0:
            image_manifest(desired[service])
            say(f"Image {service} déjà publiée : réutilisation du tag existant.")
            continue
        require(bool(re.search(r"not found|manifest unknown|MANIFEST_UNKNOWN", probe.stderr, re.I)),
                "Impossible de vérifier le tag au registre. Vérifier docker login avant de publier.")
        say(f"Construction linux/amd64 et publication de {service}…")
        with (directory / "source.tar").open("rb") as src, (directory / f"{service}-build.log").open("w") as log:
            result = subprocess.run(["docker", "buildx", "build", "--platform", "linux/amd64", "--file",
                f"{service}/Dockerfile", "--tag", desired[service], "--label",
                f"org.opencontainers.image.revision={commit}", "--push", "--metadata-file",
                str(directory / f"{service}-metadata.json"), "-"], cwd=ROOT, stdin=src, stdout=log, stderr=subprocess.STDOUT)
        require(result.returncode == 0, f"Construction/publication échouée ; voir {directory / f'{service}-build.log'}.")
        metadata = json.loads((directory / f"{service}-metadata.json").read_text())
        # Verify the exact published digest as well as the tag, not just BuildKit's success status.
        by_digest = image_manifest(desired[service] + "@" + metadata["containerimage.digest"])
        require(image_manifest(desired[service]) == by_digest, f"Le tag publié a changé : {service}.")


def pull(api, directory, desired, auth):
    ids = {}
    for service, image in desired.items():
        say(f"Téléchargement sur le serveur : {service}…")
        manifest = image_manifest(image)
        raw = api.docker("/images/create?" + urllib.parse.urlencode({"fromImage": image}), method="POST", raw=True,
                         headers={"X-Registry-Auth": auth} if image.startswith(REGISTRY + "/") else {}, timeout=300)
        save(directory / f"{service}-pull.log", raw.decode(errors="replace"))
        events = [json.loads(line) for line in raw.splitlines() if line.strip()]
        require(not any("error" in event for event in events), f"Téléchargement refusé : {service}. Vérifier docker login.")
        inspection = api.docker("/images/" + urllib.parse.quote(image, safe="/@:") + "/json")
        require(inspection["Id"] == manifest["config"]["digest"] and inspection["Architecture"] == "amd64",
                f"L'image du serveur ne correspond pas au registre : {service}.")
        save(directory / f"{service}-server-image.json", inspection)
        ids[service] = inspection["Id"]
    return ids


def restore(api, directory):
    directory = directory.expanduser().resolve()
    require(not directory.is_relative_to(ROOT), "La sauvegarde doit être hors du dépôt.")
    before = json.loads((directory / "inspect-before.json").read_text())
    stack = json.loads((directory / "stack-before.json").read_text())
    require(stack["Id"] == 19 and stack["EndpointId"] == 3 and stack["Name"] == "workadventure",
            "Cette sauvegarde ne concerne pas la stack workadventure attendue.")
    compose = (directory / "compose-before.yml").read_text()
    candidate = (directory / "compose-after.yml").read_text()
    current_stack = api.discover()
    require(current_stack.get("Env", []) == stack.get("Env", []) and api.compose() in (compose, candidate),
            "La stack a été modifiée depuis ce déploiement ; retour arrière automatique refusé.")
    for item in before.values():
        # No registry login needed: require the exact old image to still be cached on the server.
        image = api.docker("/images/" + urllib.parse.quote(item["Config"]["Image"], safe="/@:") + "/json")
        require(image["Id"] == item["Image"], "Une ancienne image manque ou son tag a changé sur le serveur.")
    say("Restauration de la stack sauvegardée…")
    api.update(compose, stack.get("Env", []))
    recovery = private_dir(directory / "rollback")
    wait_healthy(api, before, {s: x["Image"] for s, x in before.items()}, recovery)
    save(directory / "rollback-status.json", {"state": "restored", "time": datetime.datetime.now().astimezone().isoformat()})


def deploy(api, args, state):
    require(not git("status", "--porcelain"), "Committer les changements avant le déploiement (dépôt non propre).")
    commit = git("rev-parse", "HEAD")
    release = args.release or git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0", "HEAD")
    require(bool(re.fullmatch(r"v\d+\.\d+\.\d+", release)), "Release stable attendue, par exemple v1.34.5.")
    git("merge-base", "--is-ancestor", release, commit)
    git("fetch", "origin", "master")
    git("merge-base", "--is-ancestor", commit, "refs/remotes/origin/master")
    auth = registry_auth()
    tag = release + "-" + commit[:9]
    desired = {s: f"{REGISTRY}/workadventure-{s}:{tag}" if s in ("play", "back")
               else f"thecodingmachine/workadventure-{s}:{release}" for s in SERVICES}
    directory = Path(tempfile.mkdtemp(prefix=tag + "-", dir=state))
    say(f"Sauvegarde privée : {directory}")
    stack = api.discover()
    before, compose = api.inspect(), api.compose()
    require(all(s in before for s in SERVICES), "Services attendus absents de la stack.")
    candidate = replace_images(compose, before, desired)
    expected_settings = before
    if getattr(args, "enable_custom_wokas", False):
        # Explicitly requested Woka mount addition. Other settings remain checked.
        volume = api.docker("/volumes/create", method="POST", payload={"Name": CUSTOM_WOKA_VOLUME})
        candidate, expected_settings = enable_custom_woka_volume(candidate, before, volume["Mountpoint"])
    if getattr(args, "external_presence_token_file", None):
        candidate, expected_settings = enable_external_presence(candidate, expected_settings,
                                                               args.external_presence_token_file.expanduser())
    save(directory / "stack-before.json", stack)
    save(directory / "inspect-before.json", before)
    save(directory / "compose-before.yml", compose)
    save(directory / "compose-after.yml", candidate)
    save(directory / "deployment.json", {"commit": commit, "release": release, "images": desired})
    validate_compose(directory / "compose-after.yml", stack.get("Env", []), directory)
    checks(directory)
    require(not git("status", "--porcelain") and git("rev-parse", "HEAD") == commit,
            "Le dépôt a changé pendant la validation ; relancer après vérification.")
    for service in ("map-storage", "uploader"):
        image_manifest(desired[service])
    build_and_publish(directory, desired, commit)
    expected_ids = {s: x["Image"] for s, x in before.items()}
    expected_ids.update(pull(api, directory, desired, auth))
    fresh = api.discover()
    require(api.compose() == compose and fresh.get("Env", []) == stack.get("Env", []),
            "La configuration de production a changé depuis la sauvegarde ; redéploiement annulé.")
    try:
        say("Mise à jour de la stack…")
        api.update(candidate, stack.get("Env", []))
        current = wait_healthy(api, expected_settings, expected_ids, directory)
        warnings = collect_logs(api, current, directory)
        require(api.compose() == candidate, "Configuration effective inattendue après déploiement.")
    except (Exception, KeyboardInterrupt):
        say("Déploiement non validé ; tentative de retour arrière…")
        try:
            restore(api, directory)
        except (Exception, KeyboardInterrupt):
            raise DeploymentError(f"Retour arrière non validé. Examiner la stack et la sauvegarde : {directory}") from None
        raise DeploymentError(f"Déploiement annulé, ancienne version restaurée. Sauvegarde : {directory}") from None
    save(directory / "status.json", {"state": "complete", "commit": commit, "images": desired, "warnings": warnings})
    for warning in warnings:
        say("Avertissement : " + warning)
    say(f"Production mise à jour : {tag}. Services, images, paramètres et endpoints validés.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path.home() / ".config/portainer.env")
    parser.add_argument("--state-dir", type=Path, default=STATE)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check", help="Vérifier les accès et la production sans la modifier")
    deploy_parser = commands.add_parser("deploy", help="Valider et déployer le commit HEAD déjà poussé")
    deploy_parser.add_argument("--release", help="Release officielle fusionnée ; déduite des tags sinon")
    deploy_parser.add_argument("--enable-custom-wokas", action="store_true",
                               help="Installer le volume persistant pour les Woka personnalisés (une fois)")
    deploy_parser.add_argument("--external-presence-token-file", type=Path,
                               help="Configurer le secret privé 600 du module présence (une fois)")
    commands.add_parser("rollback", help="Restaurer une sauvegarde créée par ce script").add_argument("backup", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    state = private_dir(args.state_dir)
    with (state / ".deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeploymentError("Un autre déploiement utilise déjà ce dossier d'état.") from None
        api = Portainer(args.config.expanduser())
        if args.command == "check":
            api.discover()
            current = api.inspect()
            require(all(s in current for s in SERVICES), "Services attendus absents de la stack.")
            registry_auth()
            image_manifest(current["play"]["Config"]["Image"])
            captured(["docker", "info", "--format", "{{.Architecture}}"])
            endpoints()
            say("Accès Portainer, trousseau Docker, registre, moteur Docker et endpoints : OK. Aucun déploiement effectué.")
        elif args.command == "rollback":
            restore(api, args.backup)
            say("Ancienne version restaurée et contrôlée.")
        else:
            deploy(api, args, state)


if __name__ == "__main__":
    try:
        main()
    except DeploymentError as error:
        print(f"Erreur : {error}", file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print("Erreur locale ou réponse inattendue. Vérifier les prérequis et la sauvegarde privée.", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Opération interrompue.", file=sys.stderr)
        sys.exit(130)
