<?php
/** Disposable Phase 2.0.5 Bearer/JWKS fixture. */

use WPAuto\Connector\Grants\LocalGrantRepository;
use WPAuto\Connector\OAuth\JwksCache;
use WPAuto\Connector\OAuth\RevocationStateRepository;
use WPAuto\Connector\Pairing\ConnectionSettings;
use WPAuto\Connector\Pairing\SiteIdentityRepository;

$encoded = getenv( 'WEPUU_BEARER_PUBLIC_FIXTURE_B64' );
$decoded = is_string( $encoded ) ? base64_decode( $encoded, true ) : false;
$fixture = is_string( $decoded ) ? json_decode( $decoded, true ) : null;
if ( ! is_array( $fixture ) || ! is_array( $fixture['jwks'] ?? null ) || 2 !== count( $fixture['jwks'] ) || ! is_string( $fixture['publicPem'] ?? null ) ) {
	throw new RuntimeException( 'fixture_environment_invalid' );
}

$tenant   = '11111111-2222-4333-8444-555555555555';
$site     = 'site_00000001';
$grant    = 'grant_00000001';
$client   = 'client_00000001';
$resource = 'https://site.example.test/wp-json/wp-auto/mcp';
$settings = new ConnectionSettings();
$settings->disconnect();
if ( ! $settings->enable( 'https://platform.example.test', 'https://platform.example.test', $tenant ) || ! $settings->mark_pending() ) {
	throw new RuntimeException( 'fixture_pairing_failed' );
}
$identity = ( new SiteIdentityRepository() )->get_or_create();
$first_kid = $fixture['jwks'][0]['kid'] ?? null;
if ( ! is_string( $first_kid ) || ! $settings->mark_active( $site, $identity->kid(), $fixture['publicPem'], $first_kid ) ) {
	throw new RuntimeException( 'fixture_activation_failed' );
}

$keys = array();
foreach ( $fixture['jwks'] as $jwk ) {
	if ( ! is_array( $jwk ) || ! is_string( $jwk['kid'] ?? null ) ) {
		throw new RuntimeException( 'fixture_jwks_invalid' );
	}
	$keys[ $jwk['kid'] ] = $jwk;
}
update_option(
	JwksCache::OPTION_NAME,
	array(
		'version'    => '1',
		'issuer'     => 'https://platform.example.test',
		'fetched_at' => time(),
		'keys'       => $keys,
	),
	false
);
delete_option( RevocationStateRepository::OPTION_NAME );
delete_option( LocalGrantRepository::option_name( $grant ) );
$user = get_user_by( 'login', 'wepuu-admin' );
if ( ! $user instanceof WP_User ) {
	throw new RuntimeException( 'fixture_user_missing' );
}
$grants = new LocalGrantRepository();
if ( ! $grants->activate( $grant, $user->ID, $site, $client, array( 'mcp:read' ), $resource, $identity->kid() ) ) {
	throw new RuntimeException( 'fixture_grant_failed' );
}
echo "CONNECTOR_BEARER_FIXTURE_ACTIVE=True\n";
