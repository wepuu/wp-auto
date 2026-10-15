import pathlib
import stat
import tempfile
import unittest
import zipfile
from extract import extract, validate_entries


class ExtractionTests(unittest.TestCase):
    def test_unsafe_entries(self):
        with tempfile.TemporaryDirectory(prefix='wepuu-p3e1a-validation-') as folder:
            root = pathlib.Path(folder).resolve()
            for name in ['../outside', '/absolute', 'C:/outside',
                         'wepuu-auto-connector/../outside', 'wepuu-auto-connector/a\\b',
                         'wepuu-auto-connector/a:stream', 'wepuu-auto-connector/a//b']:
                with self.assertRaises(ValueError):
                    entry = zipfile.ZipInfo(name)
                    entry.filename = name  # ZipInfo's constructor normalizes backslashes on Windows.
                    validate_entries([entry], root)
            symlink = zipfile.ZipInfo('wepuu-auto-connector/link')
            symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
            with self.assertRaises(ValueError):
                validate_entries([symlink], root)
            regular = zipfile.ZipInfo('wepuu-auto-connector/file.php')
            with self.assertRaises(ValueError):
                validate_entries([regular, regular], root)
            validate_entries([regular], root)
            self.assertEqual(list(root.iterdir()), [])

    def test_bad_hash_writes_nothing(self):
        with tempfile.TemporaryDirectory(prefix='wepuu-p3e1a-validation-') as folder:
            root = pathlib.Path(folder)
            bad = root / 'bad.zip'
            bad.write_bytes(b'not-the-fixed-artifact')
            target = root / 'output'
            target.mkdir()
            with self.assertRaises(ValueError):
                extract(bad, target)
            self.assertEqual(list(target.iterdir()), [])

    def test_original_archive_extracts_unchanged(self):
        with tempfile.TemporaryDirectory(prefix='wepuu-p3e1a-validation-') as folder:
            root = pathlib.Path(folder)
            extract(pathlib.Path(__file__).with_name('wepuu-auto-connector.zip'), root)
            self.assertTrue((root / 'wepuu-auto-connector/vendor/autoload.php').is_file())
            self.assertTrue((root / 'wepuu-auto-connector/src/Pairing/SiteProofSigner.php').is_file())


if __name__ == '__main__':
    unittest.main()
