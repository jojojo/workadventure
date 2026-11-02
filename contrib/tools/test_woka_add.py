"""Offline import tests; no production, Docker or registry access."""
import importlib.util
import io
import json
from pathlib import Path
import struct
import tarfile
import unittest
import zlib
import copy
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('woka', Path(__file__).with_name('woka-add.py'))
woka = importlib.util.module_from_spec(spec)
spec.loader.exec_module(woka)


def png(width=96, height=128):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\0' + b'\0' * width * 4) * height)) + chunk(b'IEND', b''))


class WokaImportTests(unittest.TestCase):
    def test_accepts_correct_png_and_real_johan_asset(self):
        woka.validate_png(png())
        woka.validate_png((woka.deploy.ROOT / 'play/public/resources/characters/pipoya/bonhomme-chauve-barbe-lunettes-v2.png').read_bytes())

    def test_refuses_wrong_grid_truncation_corruption_and_fake_png(self):
        for image in (png(128, 96), png()[:-5], png()[:40] + b'bad-data', b'not a png'):
            with self.subTest(image=image[:20]), self.assertRaises(woka.deploy.DeploymentError):
                woka.validate_png(image)

    def test_catalog_addition_does_not_mutate_previous_catalog(self):
        old = {'version': 1, 'wokas': []}
        entry = {'id': 'custom-alice', 'name': 'Alice', 'filename': 'a' * 64 + '.png'}
        self.assertEqual(woka.updated_catalog(old, entry)['wokas'], [entry])
        self.assertEqual(old['wokas'], [])

    def test_companion_addition_and_replacement_preserve_wokas_and_legacy_catalog(self):
        avatar = {'id': 'eoloa-johan', 'name': 'Johan', 'filename': 'a' * 64 + '.png'}
        old = {'version': 1, 'wokas': [avatar]}
        pet = {'id': 'custom-companion-felix', 'name': 'Félix', 'filename': 'b' * 64 + '.png', 'behavior': 'cat'}
        new = woka.updated_catalog(old, pet, kind='companion')
        self.assertEqual(new, {**old, 'companions': [pet]})
        self.assertNotIn('companions', old)
        replacement = {**pet, 'filename': 'c' * 64 + '.png'}
        with self.assertRaises(woka.deploy.DeploymentError):
            woka.updated_catalog(new, replacement, kind='companion')
        self.assertEqual(woka.updated_catalog(new, replacement, True, 'companion')['wokas'], [avatar])
        self.assertEqual(woka.updated_catalog(new, replacement, True, 'companion')['companions'], [replacement])

    def test_rejects_cross_type_ids_and_unknown_companion_behaviors(self):
        entry = {'id': 'custom-alice', 'name': 'Alice', 'filename': 'a' * 64 + '.png'}
        old = {'version': 1, 'wokas': [entry]}
        with self.assertRaises(woka.deploy.DeploymentError):
            woka.updated_catalog(old, entry, True, 'companion')
        for companion in ({**entry, 'behavior': 'unknown'}, entry):
            with self.assertRaises(woka.deploy.DeploymentError):
                woka.validate_catalog({**old, 'companions': [companion]})

    def test_builtin_ids_cannot_move_between_wokas_layers_and_companions(self):
        builtins = {'wokas': {'woka': {'collections': [{'textures': [{'id': 'male1'}]}]},
                              'hair': {'collections': [{'textures': [{'id': 'hair1'}]}]}},
                    'companions': [{'textures': [{'id': 'dog1'}]}]}
        woka.validate_builtin_identifier(builtins, 'dog1', 'companion', True)
        woka.validate_builtin_identifier(builtins, 'male1', 'woka', True)
        for identifier, kind in [('hair1', 'woka'), ('hair1', 'companion'), ('male1', 'companion'), ('dog1', 'woka')]:
            with self.subTest(identifier=identifier, kind=kind), self.assertRaises(woka.deploy.DeploymentError):
                woka.validate_builtin_identifier(builtins, identifier, kind, True)

    def test_replacement_requires_explicit_flag_and_preserves_other_wokas(self):
        one = {'id': 'custom-alice', 'name': 'Alice', 'filename': 'a' * 64 + '.png'}
        two = {**one, 'id': 'custom-bob', 'name': 'Bob'}
        old = {'version': 1, 'wokas': [one, two]}
        changed = {**one, 'filename': 'b' * 64 + '.png'}
        with self.assertRaises(woka.deploy.DeploymentError):
            woka.updated_catalog(old, changed)
        self.assertEqual(woka.updated_catalog(old, changed, True)['wokas'], [changed, two])
        self.assertEqual(woka.updated_catalog(old, one), old)

    def test_rejects_unsafe_filenames_duplicate_ids_and_invalid_names(self):
        one = {'id': 'custom-alice', 'name': 'Alice', 'filename': 'a' * 64 + '.png'}
        for entries in ([one, one], [{**one, 'filename': '../secret'}], [{**one, 'id': '../secret'}], [{**one, 'name': ''}]):
            with self.subTest(entries=entries), self.assertRaises(woka.deploy.DeploymentError):
                woka.validate_catalog({'version': 1, 'wokas': entries})

    def test_generates_safe_stable_ids_with_accents_and_spaces(self):
        self.assertEqual(woka.slug('Élodie Dupont'), 'custom-elodie-dupont')
        self.assertEqual(woka.slug('Élodie Dupont', 'companion'), 'custom-companion-elodie-dupont')

    def test_archive_cannot_write_outside_volume_and_has_readable_permissions(self):
        raw = woka.archive_files({'catalog.json': b'{}', 'a' * 64 + '.png': png()})
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            self.assertEqual(archive.getnames(), ['catalog.json', 'a' * 64 + '.png'])
            self.assertEqual(archive.getmembers()[0].mode, 0o644)
        with self.assertRaises(woka.deploy.DeploymentError):
            woka.archive_files({'../outside': b'bad'})

    def test_decodes_docker_framing_without_exposing_header_bytes(self):
        data = json.dumps({'version': 1, 'wokas': []}).encode()
        raw = b'\1\0\0\0' + struct.pack('>I', len(data)) + data
        self.assertEqual(json.loads(woka.unpack_output(raw))['version'], 1)
        with self.assertRaises(woka.deploy.DeploymentError):
            woka.unpack_output(raw[:-1])

    def test_import_publishes_catalog_after_image_verification_without_restart(self):
        self.check_import(public_ok=True)

    def test_failed_public_image_verification_never_publishes_catalog_and_releases_lock(self):
        self.check_import(public_ok=False)

    def test_failed_runtime_validation_restores_the_previous_catalog(self):
        self.check_import(public_ok=True, runtime_ok=False)

    def test_companion_import_verifies_the_companion_service_without_restart(self):
        self.check_import(public_ok=True, kind='companion')

    def test_failed_companion_validation_restores_the_previous_catalog(self):
        self.check_import(public_ok=True, runtime_ok=False, kind='companion')

    def check_import(self, public_ok, runtime_ok=True, kind='woka'):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary)
            source = state / 'sprite.png'
            image = png()
            source.write_bytes(image)
            entry = {'id': woka.slug('Alice', kind), 'name': 'Alice',
                     'filename': woka.hashlib.sha256(image).hexdigest() + '.png'}
            catalog = {'version': 1, 'wokas': []}
            expected = {'version': 1, 'wokas': [entry]}
            if kind == 'companion':
                entry['behavior'] = 'cat'
                catalog['wokas'] = [{'id': 'eoloa-johan', 'name': 'Johan', 'filename': 'b' * 64 + '.png'}]
                expected = {**catalog, 'companions': [entry]}
            before = {'play': {
                'Id': 'same-container', 'Image': 'sha256:same', 'RestartCount': 0,
                'Config': {'Image': 'play:tag', 'Env': ['OPTIONAL', 'SECRET=private']},
                'HostConfig': {'Binds': ['volume:/data:rw']},
                'Mounts': [{'Type': 'volume', 'Name': woka.deploy.CUSTOM_WOKA_VOLUME,
                            'Source': '/docker/volume', 'Destination': woka.DIRECTORY, 'RW': True}]}}
            api = Mock()
            api.inspect.side_effect = [before, copy.deepcopy(before)]
            response = Mock()
            response.status, response.read.return_value = (200 if public_ok else 500), image
            context = Mock()
            context.__enter__ = Mock(return_value=response)
            context.__exit__ = Mock(return_value=False)
            results = ['', json.dumps(catalog), '{}']
            if public_ok:
                details = [{'id': entry['id'], 'url': '/custom-wokas/' + entry['filename']}] if runtime_ok else []
                if kind == 'companion' and runtime_ok:
                    details = details[0]
                results += ['', json.dumps(expected), json.dumps(details)]
                if not runtime_ok:
                    results += ['']  # Atomic restoration of the old catalog.
            results += ['']  # Lock cleanup.
            with patch.object(woka, 'execute', side_effect=results) as execute, \
                    patch.object(woka.urllib.request, 'urlopen', return_value=context), \
                    patch.object(woka.deploy, 'say'):
                args = SimpleNamespace(file=source, name='Alice', id=None, replace=False, type=kind,
                                       behavior='cat' if kind == 'companion' else None)
                if public_ok and runtime_ok:
                    woka.import_woka(api, args, state)
                else:
                    with self.assertRaises(woka.deploy.DeploymentError):
                        woka.import_woka(api, args, state)
                scripts = [call.args[2] for call in execute.call_args_list]
                self.assertEqual(any('renameSync' in script for script in scripts), public_ok)
                self.assertIn('rmdirSync', scripts[-1])
                if public_ok:
                    self.assertTrue(any(('fetchCompanionDetails' if kind == 'companion' else 'fetchWokaDetails')
                                        in script for script in scripts))
            api.update.assert_not_called()
            with tarfile.open(fileobj=io.BytesIO(api.docker.call_args.kwargs['raw_body'])) as archive:
                if public_ok and not runtime_ok:
                    self.assertEqual(json.load(archive.extractfile(archive.getmembers()[0])), catalog)
                else:
                    self.assertEqual(archive.extractfile(entry['filename']).read(), image)
            for path in (state / 'woka-imports').glob('*/*'):
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
