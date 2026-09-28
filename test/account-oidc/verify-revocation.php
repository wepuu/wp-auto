<?php
/** Verify only the opaque local deny marker; never print stored state. */

use WPAuto\Connector\OAuth\RevocationStateRepository;

$grant = getenv( 'WEPUU_FIXTURE_GRANT_ID' );
if ( ! is_string( $grant ) || '' === $grant ) {
	throw new RuntimeException( 'fixture_grant_missing' );
}
if ( ! ( new RevocationStateRepository() )->denies_grant( $grant ) ) {
	throw new RuntimeException( 'revocation_not_applied' );
}
echo "CONNECTOR_GRANT_DENIED=True\n";
