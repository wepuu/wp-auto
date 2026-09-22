<?php
declare(strict_types=1);

function b64url(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

$now = time();
$keypair = sodium_crypto_sign_keypair();
$secret = sodium_crypto_sign_secretkey($keypair);
$public = sodium_crypto_sign_publickey($keypair);
$header = ['alg' => 'EdDSA', 'typ' => 'wepuu-site-proof+jwt', 'kid' => 'php-site-key-0001'];
$payload = [
    'kind' => 'pairing',
    'protocol_version' => '1',
    'iss' => 'site.example.test',
    'platform_issuer' => 'https://auth.example.test',
    'tenant_id' => '11111111-1111-4111-8111-111111111111',
    'pairing_attempt_id' => 'attempt_00000001',
    'resource' => 'https://site.example.test/wp-json/wp-auto/mcp',
    'challenge' => 'challenge_00000000000000000000000',
    'iat' => $now,
    'exp' => $now + 60,
];
$protected = b64url((string) json_encode($header, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
$body = b64url((string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
$signature = sodium_crypto_sign_detached($protected . '.' . $body, $secret);

echo json_encode([
    'proof' => $protected . '.' . $body . '.' . b64url($signature),
    'publicJwk' => [
        'kty' => 'OKP', 'crv' => 'Ed25519', 'x' => b64url($public),
        'kid' => 'php-site-key-0001', 'alg' => 'EdDSA', 'use' => 'sig'
    ]
], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
