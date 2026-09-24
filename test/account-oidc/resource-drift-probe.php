<?php

use WPAuto\Connector\Grants\LocalGrantRepository;
use WPAuto\Connector\Pairing\CanonicalResource;
use WPAuto\Connector\Pairing\ConnectionSettings;

$settings   = new ConnectionSettings();
$connection = $settings->load();
$repository = new LocalGrantRepository();
$like       = $GLOBALS['wpdb']->esc_like( LocalGrantRepository::OPTION_PREFIX ) . '%';
$names      = $GLOBALS['wpdb']->get_col(
	$GLOBALS['wpdb']->prepare(
		"SELECT option_name FROM {$GLOBALS['wpdb']->options} WHERE option_name LIKE %s ORDER BY option_name ASC",
		$like
	)
);
$active     = 0;

foreach ( $names as $name ) {
	$record = get_option( $name, null );
	if ( is_array( $record ) && isset( $record['grant_id'] ) && null !== $repository->find_active( $record['grant_id'], $settings ) ) {
		++$active;
	}
}

$current_resource = null;
try {
	$current_resource = CanonicalResource::current();
} catch ( Throwable ) {
	// The stable boolean below records an invalid current resource without detail.
}

echo 'CONNECTION_STATUS=' . ( is_array( $connection ) ? $connection['status'] : 'absent' ) . PHP_EOL;
echo 'GRANT_ROWS=' . count( $names ) . PHP_EOL;
echo 'ACTIVE_LOCAL_GRANTS=' . $active . PHP_EOL;
echo 'STORED_RESOURCE_IS_CURRENT=' . ( is_array( $connection ) && is_string( $current_resource ) && hash_equals( $connection['resource'], $current_resource ) ? 'True' : 'False' ) . PHP_EOL;
