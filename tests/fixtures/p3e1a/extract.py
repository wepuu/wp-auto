"""Bounded extraction of the frozen public test ZIP; never production data."""
import hashlib
import pathlib
import re
import stat
import sys
import zipfile

EXPECTED = 'f59406eaa07c8d6d8518ef5d5d71cd496a7952fa781b263d7bc306ec5fd3d960'


def extract(archive, destination):
    raw = pathlib.Path(archive).read_bytes()
    if len(raw) > 2 * 1024 * 1024 or hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('artifact_invalid')
    root = pathlib.Path(destination).resolve(strict=True)
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        if len(entries) > 2000 or sum(e.file_size for e in entries) > 20 * 1024 * 1024:
            raise ValueError('archive_bounds')
        validate_entries(entries, root)
        # No files are written until every entry has passed validation.
        for entry in entries:
            target = root.joinpath(*entry.filename.rstrip('/').split('/'))
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(entry) as incoming, target.open('xb') as outgoing:
                    outgoing.write(incoming.read())


def validate_entries(entries, root):
    names = set()
    for entry in entries:
        name = entry.filename
        parts = name.rstrip('/').split('/')
        kind = stat.S_IFMT(entry.external_attr >> 16)
        if (not name.startswith('wepuu-auto-connector/') or '\\' in name
                or ':' in name or any(p in ('', '.', '..') for p in parts)
                or name in names or kind not in (0, stat.S_IFREG, stat.S_IFDIR)
                or re.search(r'[\x00-\x1f]', name)):
            raise ValueError('archive_entry_invalid')
        names.add(name)
        target = root.joinpath(*parts)
        if not target.resolve().is_relative_to(root):
            raise ValueError('archive_path_invalid')


if __name__ == '__main__':
    try:
        extract(sys.argv[1], sys.argv[2])
    except Exception:
        print('FIXTURE_EXTRACTION_FAILED', file=sys.stderr)
        sys.exit(1)
