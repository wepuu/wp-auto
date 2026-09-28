<?php
/** Disposable Phase 2.0.4 cross-runtime revocation fixture. */

use WPAuto\Connector\Pairing\ConnectionSettings;
use WPAuto\Connector\Pairing\SiteIdentityRepository;

$tenant = getenv( 'WEPUU_FIXTURE_TENANT_ID' );
$site   = getenv( 'WEPUU_FIXTURE_SITE_ID' );
$kid    = getenv( 'WEPUU_FIXTURE_KMS_KID' );
$pem    = base64_decode( (string) getenv( 'WEPUU_FIXTURE_PUBLIC_PEM_B64' ), true );
if ( ! is_string( $tenant ) || ! is_string( $site ) || ! is_string( $kid ) || false === $pem ) {
	throw new RuntimeException( 'fixture_environment_invalid' );
}
$settings = new ConnectionSettings();
$settings->disconnect();
if ( ! $settings->enable( 'https://platform.example.test', 'https://platform.example.test', $tenant ) ) {
	throw new RuntimeException( 'fixture_enable_failed' );
}
if ( ! $settings->mark_pending() ) {
	throw new RuntimeException( 'fixture_pending_failed' );
}
$identity = ( new SiteIdentityRepository() )->get_or_create();
if ( ! $settings->mark_active( $site, $identity->kid(), $pem, $kid ) ) {
	throw new RuntimeException( 'fixture_activation_failed' );
}
echo "CONNECTOR_REVOCATION_FIXTURE_ACTIVE=True\n";
