<?php
declare(strict_types=1);

// This process never loads wp-load.php, options, a site identity, or a network endpoint.
define('ABSPATH', __DIR__ . '/');
function wp_parse_url(string $url) { return parse_url($url); }

try {
    if (!extension_loaded('sodium')) { throw new RuntimeException('runtime'); }
    $root = $argv[1] . '/wepuu-auto-connector';
    require $root . '/vendor/autoload.php';
    foreach (['CanonicalResource', 'SiteIdentity', 'SiteProofSigner'] as $name) {
        require $root . '/src/Pairing/' . $name . '.php';
    }
    $keypair = sodium_crypto_sign_keypair();
    $identity = new WPAuto\Connector\Pairing\SiteIdentity(
        'synthetic-site-key-0001', sodium_crypto_sign_secretkey($keypair), sodium_crypto_sign_publickey($keypair)
    );
    // Valid synthetic SPKI; exact original bytes, not parsed/re-exported by the signer.
    $publicPem = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n-----END PUBLIC KEY-----\n";
    $request = [
        'tenant_id' => '11111111-1111-4111-8111-111111111111',
        'pairing_attempt_id' => 'attempt_00000001', 'site_id' => 'site_00000001',
        'platform_signing_kid' => 'platform-key-0001',
        'platform_issuer' => 'https://auth.example.test',
        'resource' => 'https://site.example.test/wp-json/wp-auto/mcp',
        'challenge' => str_repeat('c', 43)
    ];
    $results = [];
    foreach ([
        'whole' => '2026-10-15T12:00:00.000000+00:00',
        'microseconds' => '2026-10-15T12:00:00.987654+00:00',
        'timezone' => '2026-10-15T20:00:00.987654+08:00'
    ] as $clock => $time) {
        foreach (['lf' => $publicPem, 'crlf' => str_replace("\n", "\r\n", $publicPem),
                  'no_final_newline' => rtrim($publicPem, "\n")] as $format => $pem) {
            $request['platform_signing_key_pem'] = $pem;
            $proof = (new WPAuto\Connector\Pairing\SiteProofSigner())->sign_pairing(
                $identity, $request, new DateTimeImmutable($time)
            );
            $results[] = ['scenario' => $clock . '_' . $format, 'proof' => $proof,
                'publicJwk' => $identity->public_jwk(), 'pem' => $pem];
        }
    }
    echo json_encode(['php' => PHP_VERSION, 'sodium' => true,
        'jwt' => Composer\InstalledVersions::getPrettyVersion('lcobucci/jwt'),
        'signer_file_matches' => hash_file('sha256', $root . '/src/Pairing/SiteProofSigner.php') ===
            '3e08e1b64e21e8f3d8656c0c1e99ba74e2db69556dfd93b1c8de9868faf21a79',
        'fixtures' => $results], JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    // Do not echo the arbitrary exception, autoloader paths, proof, or key material.
    fwrite(STDERR, "SIGNER_FIXTURE_FAILED\n");
    exit(1);
}
