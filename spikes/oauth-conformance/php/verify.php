<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Validation\Constraint\IssuedBy;
use Lcobucci\JWT\Validation\Constraint\PermittedFor;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Constraint\StrictValidAt;
use Lcobucci\Clock\SystemClock;

$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) {
    fwrite(STDERR, "fixture path is required\n");
    exit(2);
}

$fixture = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
$token = (string) ($fixture['token'] ?? '');
$publicKey = (string) ($fixture['public_key'] ?? '');
$expectedIssuer = (string) ($fixture['issuer'] ?? '');
$expectedAudience = (string) ($fixture['audience'] ?? '');
$expectedKid = (string) ($fixture['public_jwk']['kid'] ?? '');

try {
    $config = Configuration::forAsymmetricSigner(
        new Sha256(),
        InMemory::plainText('unused-private-key-for-verifier'),
        InMemory::plainText($publicKey)
    );
    $parsed = $config->parser()->parse($token);
    $headers = $parsed->headers();
    if ($headers->get('alg') !== 'RS256' || $headers->get('typ') !== 'at+jwt' || !is_string($headers->get('kid')) || $headers->get('kid') === '' || !hash_equals($expectedKid, $headers->get('kid'))) {
        throw new RuntimeException('invalid token header profile');
    }
    $config->validator()->assert(
        $parsed,
        new SignedWith(new Sha256(), InMemory::plainText($publicKey)),
        new IssuedBy($expectedIssuer),
        new PermittedFor($expectedAudience),
        new StrictValidAt(SystemClock::fromUTC())
    );
    $decoded = $parsed->claims()->all();
    foreach (['iss', 'aud', 'sub', 'site_id', 'grant_id', 'scope', 'iat', 'nbf', 'exp', 'jti'] as $claim) {
        if (!array_key_exists($claim, $decoded)) {
            throw new RuntimeException("missing claim: {$claim}");
        }
    }
    if (!is_array($decoded['aud']) || count($decoded['aud']) !== 1) {
        throw new RuntimeException('audience must be a single string');
    }
    if ($decoded['iss'] !== $expectedIssuer || $decoded['aud'][0] !== $expectedAudience) {
        throw new RuntimeException('issuer or audience mismatch');
    }
    if (!is_string($decoded['scope']) || $decoded['scope'] === '') {
        throw new RuntimeException('invalid scope');
    }
    $allowedScopes = ['mcp:read', 'mcp:content.write', 'mcp:media.write', 'mcp:taxonomy.write', 'mcp:seo.write'];
    foreach (preg_split('/\\s+/', $decoded['scope']) ?: [] as $scope) {
        if (!in_array($scope, $allowedScopes, true)) {
            throw new RuntimeException('invalid scope');
        }
    }
    foreach (['wp_user_id', 'email', 'roles', 'capabilities', 'content', 'tool_results'] as $forbidden) {
        if (array_key_exists($forbidden, $decoded)) {
            throw new RuntimeException("forbidden claim: {$forbidden}");
        }
    }
    echo "php jose verification passed\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
