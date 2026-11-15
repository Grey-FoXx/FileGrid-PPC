#!/usr/bin/env python3
"""Live 4-category × 3-storage regression; restores the original rules, never resets data.
Creates explicitly synthetic fixtures. Run after scripts/start.sh.
"""
import copy
import json
import uuid
from datetime import datetime, timezone
from smoke_test_import import Client


def main():
    client = Client('https://localhost:8443/api/v1', '.runtime/accounts.properties', '.runtime/tls.crt')
    original = client.request('GET', '/policies')
    version = original['version']
    incident = client.incident(stationId='SYNTHETIC-POLICY-MATRIX')
    rows = []
    old_file = None
    try:
        for target in ('DATABASE', 'S3', 'FTP'):
            rules = copy.deepcopy(original['rules'])
            for rule in rules:
                rule['storage'] = target
            current = client.request('PUT', '/policies', {'expectedVersion': version, 'rules': rules})
            version = current['version']
            # A stale writer must not overwrite another administrator's configuration.
            client.request('PUT', '/policies', {'expectedVersion': version - 1, 'rules': rules}, expected=409)
            client.request('PUT', '/policies', {'expectedVersion': version, 'rules': rules}, user='dispatcher', expected=403)
            identity = 'policy-matrix-' + uuid.uuid4().hex
            reading = json.dumps({'schema_version': 1, 'reading_id': identity, 'meter_id': identity,
                                  'sequence_number': 1, 'measured_at': datetime.now(timezone.utc).isoformat(),
                                  'energy_kwh': 123.45}, indent=2).encode()
            first = client.request('POST', '/meter-readings', reading, user='meter', expected=201)
            replay = client.request('POST', '/meter-readings', reading, user='meter')
            assert replay['duplicate'] and replay['fileId'] == first['fileId']
            client.request('POST', '/meter-readings', reading.replace(b'123.45', b'123.46'), user='meter', expected=409)
            meter_file = client.request('GET', '/files/' + first['fileId'])
            assert meter_file['storage'] == target
            assert client.request('GET', '/files/' + first['fileId'] + '/content', binary=True) == reading
            rows.append(('METER_READING', target))
            cases = (
                ('INCIDENT', b'SYNTHETIC POLICY MATRIX INCIDENT\n', 'admin',
                 {'incidentId': incident['id'], 'attachmentType': 'BINARY', 'sensitivity': 'SENSITIVE'}),
                ('CONNECTION_DOCUMENT', b'SYNTHETIC PRIVATE POLICY MATRIX DOCUMENT\n', 'connection',
                 {'applicationId': identity}),
                # Three parts, including replay of part one, exercise durable multipart assembly.
                ('DRONE_VIDEO', b'SYNTHETIC-VIDEO-' * (1200000), 'admin', {}),
            )
            for category, data, user, context in cases:
                file = client.upload(category, data, user=user, **context)
                assert file['storage'] == target, file
                assert str(file['policyVersion']) == str(version), file
                if category == 'CONNECTION_DOCUMENT':
                    client.request('GET', '/files/' + file['id'] + '/content', user='connection2', expected=403)
                if old_file is None:
                    old_file = file
                rows.append((category, target))
            # Configuration changes never reroute existing data.
            previous = client.request('GET', '/files/' + old_file['id'])
            assert previous['storage'] == old_file['storage']
            assert previous['policyVersion'] == old_file['policyVersion']
            print('PASS meter original bytes/replay/conflict; all four categories -> ' + target, flush=True)
    finally:
        # Optimistic locking protects intervening edits; do not reset to YAML defaults.
        restored = client.request('PUT', '/policies', {'expectedVersion': version, 'rules': original['rules']})
        print('Restored original rules at policy version ' + str(restored['version']), flush=True)
    assert len(rows) == 12
    print('PASS 12/12 category-storage combinations; private access; multipart replay; immutable old routing')


if __name__ == '__main__':
    main()
