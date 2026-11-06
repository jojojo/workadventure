"""Offline deployment safety checks. No Docker, registry or production calls."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
import urllib.error

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("deploy-production.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def container(service="play"):
    return {
        "Id": service + "-container", "Image": "sha256:old", "RestartCount": 0,
        "Config": {"Image": f"registry.example/{service}:old", "Env": ["MATRIX_AUTO_SYNC=false", "SECRET=private"]},
        "State": {"Status": "running", "Health": {"Status": "healthy"}},
        "HostConfig": {"Binds": ["data:/data"], "RestartPolicy": {"Name": "always"}},
        "Mounts": [{"Type": "volume", "Source": "/data", "Destination": "/data", "RW": True}],
    }


class DeploymentSafetyTests(unittest.TestCase):
    def test_presence_setup_preserves_other_services_and_settings(self):
        before = {"play": container()}
        compose = "services:\n  play:\n    image: old\n    environment:\n      - MATRIX_AUTO_SYNC=false\n  back:\n    environment:\n      - KEEP=true\n"
        with tempfile.TemporaryDirectory() as directory:
            secret = Path(directory) / "presence-token"
            secret.write_text("synthetic-test-credential-with-32-characters")
            secret.chmod(0o600)
            changed, expected = deploy.enable_external_presence(compose, before, secret)
            self.assertEqual(changed.replace("      - EXTERNAL_PRESENCE_API_TOKEN=" + secret.read_text() + "\n", ""), compose)
            self.assertNotEqual(expected['play']['Config']['Env'], before['play']['Config']['Env'])
            deploy.verify_settings(expected, copy.deepcopy(expected), {'play': 'sha256:old'})
            with self.assertRaises(deploy.DeploymentError):
                deploy.enable_external_presence(changed, expected, secret)
            secret.chmod(0o644)
            with self.assertRaises(deploy.DeploymentError):
                deploy.enable_external_presence(compose, before, secret)

    def test_custom_woka_setup_adds_only_the_authorized_volume(self):
        before = {"play": container()}
        before["play"]["Mounts"] = []
        before["play"]["HostConfig"]["Binds"] = None
        compose = ("services:\n  play:\n    image: registry.example/play:old\n"
                   "    environment:\n      SECRET: private\nvolumes:\n  existing: {}\nnetworks:\n  default: {}\n")
        changed, expected = deploy.enable_custom_woka_volume(compose, before, "/docker/volumes/wokas/_data")
        self.assertIn("      - eoloa-custom-wokas:/var/lib/workadventure/wokas:rw\n", changed)
        self.assertIn("    name: workadventure_custom-wokas\n", changed)
        self.assertIn("      SECRET: private\n", changed)
        self.assertIn("  existing: {}\nnetworks:\n  default: {}\n", changed)
        self.assertEqual(before['play']['Mounts'], [])
        self.assertEqual(expected['play']['Mounts'][0]['Source'], "/docker/volumes/wokas/_data")
        self.assertIsNone(expected['play']['HostConfig']['Binds'])
        self.assertEqual(expected['play']['HostConfig']['Mounts'], [{
            'Source': 'workadventure_custom-wokas', 'Target': '/var/lib/workadventure/wokas',
            'Type': 'volume', 'VolumeOptions': {}}])
        deploy.verify_settings(expected, copy.deepcopy(expected), {'play': 'sha256:old'})
        with self.assertRaises(deploy.DeploymentError):
            deploy.enable_custom_woka_volume(changed, expected, "/docker/volumes/wokas/_data")

    def test_custom_woka_setup_rejects_existing_mounts_or_ambiguous_compose(self):
        before = {"play": container()}
        with self.assertRaises(deploy.DeploymentError):
            deploy.enable_custom_woka_volume("services:\n  play:\nvolumes:\n", before, "/data")
        before['play']['Mounts'] = []
        for compose in ("services:\n  play:\n", "services:\n  play:\n  play:\nvolumes:\n"):
            with self.assertRaises(deploy.DeploymentError):
                deploy.enable_custom_woka_volume(compose, before, "/data")

    def test_replaces_only_image_lines_preserving_secret_and_comments(self):
        original = ('services:\n  play:\n    image: "registry.example/play:old" # keep\n'
                    '    environment:\n      VALUE: registry.example/play:old\n      PASSWORD: "a$#b"\n')
        result = deploy.replace_images(original, {"play": container()}, {"play": "registry.example/play:new"})
        self.assertEqual(result, original.replace('image: "registry.example/play:old"',
                                                 'image: "registry.example/play:new"'))

    def test_ambiguous_or_interpolated_images_are_not_deployed(self):
        for compose in ("image: ${PLAY_IMAGE}\n", "image: registry.example/play:old\n" * 2):
            with self.subTest(compose=compose), self.assertRaises(deploy.DeploymentError):
                deploy.replace_images(compose, {"play": container()}, {"play": "new"})

    def test_backup_permissions_and_secret_config_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "portainer.env"
            deploy.save(config, 'PORTAINER_URL="https://portainer.example"\nPORTAINER_API_KEY="private#token"\n')
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertEqual(deploy.read_credentials(config), ("https://portainer.example", "private#token"))
            config.chmod(0o644)
            with self.assertRaises(deploy.DeploymentError):
                deploy.read_credentials(config)

    def test_cannot_place_backups_in_repository(self):
        with self.assertRaises(deploy.DeploymentError):
            deploy.private_dir(deploy.ROOT / "deployment-backups")

    def test_rejects_modified_environment_mounts_ports_images_or_service_list(self):
        before = {"play": container()}
        variants = []
        for mutate in (
            lambda x: x["play"]["Config"]["Env"].append("SECRET=changed"),
            lambda x: x["play"]["Mounts"][0].update(RW=False),
            lambda x: x["play"]["HostConfig"].update(PortBindings={"3000/tcp": []}),
            lambda x: x["play"].update(Image="sha256:unexpected"),
            lambda x: x.update(redis=container("redis")),
        ):
            after = copy.deepcopy(before)
            mutate(after)
            variants.append(after)
        for after in variants:
            with self.subTest(after=after), self.assertRaises(deploy.DeploymentError):
                deploy.verify_settings(before, after, {"play": "sha256:old"})

    def test_preserves_unset_empty_and_equals_in_environment_values(self):
        before = {"play": container()}
        before["play"]["Config"]["Env"] += ["OPTIONAL", "EMPTY=", "VALUE=a=b"]
        deploy.verify_settings(before, copy.deepcopy(before), {"play": "sha256:old"})

    def test_rejects_removing_or_assigning_unset_environment_variable(self):
        before = {"play": container()}
        before["play"]["Config"]["Env"].append("OPTIONAL")
        for replacement in (None, "OPTIONAL=", "OPTIONAL=enabled"):
            after = copy.deepcopy(before)
            after["play"]["Config"]["Env"].remove("OPTIONAL")
            if replacement is not None:
                after["play"]["Config"]["Env"].append(replacement)
            with self.subTest(replacement=replacement), self.assertRaises(deploy.DeploymentError):
                deploy.verify_settings(before, after, {"play": "sha256:old"})

    def test_api_errors_do_not_expose_secret_response_or_token(self):
        api = object.__new__(deploy.Portainer)
        api.url, api.key, api.opener = "https://portainer.example", "private-token", Mock()
        api.opener.open.side_effect = urllib.error.HTTPError(
            api.url, 401, "password=private-secret", {}, None)
        with self.assertRaises(deploy.DeploymentError) as raised:
            api.request("/stacks")
        self.assertNotIn("private", str(raised.exception))
        self.assertNotIn("password", str(raised.exception))

    def test_refuses_credential_redirects(self):
        handler = deploy.NoRedirect()
        self.assertIsNone(handler.redirect_request(None, None, 302, "", {}, "https://other.example"))

    def test_rollback_refuses_external_changes_before_update(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory)
            deploy.save(backup / "inspect-before.json", {"play": container()})
            deploy.save(backup / "stack-before.json", {"Id": 19, "EndpointId": 3, "Name": "workadventure", "Env": []})
            deploy.save(backup / "compose-before.yml", "old compose")
            deploy.save(backup / "compose-after.yml", "our compose")
            api = Mock()
            api.discover.return_value = {"Env": []}
            api.compose.return_value = "someone else's compose"
            with self.assertRaises(deploy.DeploymentError):
                deploy.restore(api, backup)
            api.update.assert_not_called()

    def test_stack_updates_disable_global_pull_and_prune(self):
        api = object.__new__(deploy.Portainer)
        api.endpoint, api.stack_id, api.request = 3, 19, Mock()
        api.update("preserved compose", [{"name": "SECRET", "value": "private"}])
        payload = api.request.call_args.kwargs["payload"]
        self.assertFalse(payload["PullImage"])
        self.assertFalse(payload["Prune"])
        self.assertEqual(payload["StackFileContent"], "preserved compose")

    def test_rollback_refuses_changed_old_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory)
            deploy.save(backup / "inspect-before.json", {"play": container()})
            deploy.save(backup / "stack-before.json", {"Id": 19, "EndpointId": 3, "Name": "workadventure", "Env": []})
            deploy.save(backup / "compose-before.yml", "old compose")
            deploy.save(backup / "compose-after.yml", "new compose")
            api = Mock()
            api.discover.return_value = {"Env": []}
            api.compose.return_value = "new compose"
            api.docker.return_value = {"Id": "sha256:overwritten"}
            with self.assertRaises(deploy.DeploymentError):
                deploy.restore(api, backup)
            api.update.assert_not_called()

    def test_existing_published_images_are_never_rebuilt_or_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run, \
                    patch.object(deploy, "image_manifest") as verify:
                deploy.build_and_publish(Path(directory), {"play": "play:tag", "back": "back:tag"}, "commit")
            self.assertEqual(verify.call_count, 2)
            self.assertFalse(any(call.args[0][:3] == ["docker", "buildx", "build"] for call in run.call_args_list))

    def test_deployment_failure_after_stack_update_restores_saved_stack(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            before = {s: container(s) for s in deploy.SERVICES}
            compose = "services:\n" + "".join(
                f"  {s}:\n    image: {x['Config']['Image']}\n" for s, x in before.items())
            api = Mock()
            api.discover.return_value = {"Id": 19, "EndpointId": 3, "Name": "workadventure", "Env": []}
            api.inspect.return_value = before
            api.compose.return_value = compose
            def git_stub(*args):
                return "" if args[0] != "rev-parse" else "123456789abcdef"
            with patch.object(deploy, "git", side_effect=git_stub), \
                    patch.object(deploy, "registry_auth", return_value="private-auth"), \
                    patch.object(deploy, "checks"), patch.object(deploy, "image_manifest"), \
                    patch.object(deploy, "build_and_publish"), \
                    patch.object(deploy, "pull", return_value={s: "sha256:new" for s in before}), \
                    patch.object(deploy, "wait_healthy", side_effect=deploy.DeploymentError("Not healthy")), \
                    patch.object(deploy, "restore") as restore:
                with self.assertRaisesRegex(deploy.DeploymentError, "ancienne version restaurée"):
                    deploy.deploy(api, SimpleNamespace(release="v1.34.5"), state)
            api.update.assert_called_once()
            restore.assert_called_once()
            backup = restore.call_args.args[1]
            self.assertEqual((backup / "compose-before.yml").read_text(), compose)

    def test_health_needs_three_successful_samples_and_keeps_existing_restart_count(self):
        with tempfile.TemporaryDirectory() as directory:
            before = {"play": container()}
            before["play"]["RestartCount"] = 2
            api = Mock()
            api.inspect.return_value = before
            with patch.object(deploy, "endpoints"), patch.object(deploy.time, "sleep"):
                deploy.wait_healthy(api, before, {"play": "sha256:old"}, Path(directory))
            self.assertEqual(api.inspect.call_count, 3)

    def test_registry_manifest_selects_linux_amd64_not_attestation(self):
        index = {"manifests": [
            {"digest": "sha256:arm", "platform": {"os": "linux", "architecture": "arm64"}},
            {"digest": "sha256:amd", "platform": {"os": "linux", "architecture": "amd64"}},
            {"digest": "sha256:attestation", "platform": {"os": "unknown", "architecture": "unknown"}},
        ]}
        with patch.object(deploy, "captured", side_effect=[json.dumps(index), '{"config":{"digest":"sha256:config"}}']) as run:
            self.assertEqual(deploy.image_manifest("registry.example/play:tag")["config"]["digest"], "sha256:config")
            self.assertEqual(run.call_args.args[0][-1], "registry.example/play:tag@sha256:amd")


if __name__ == "__main__":
    unittest.main()
