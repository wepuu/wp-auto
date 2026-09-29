<?php
/**
 * Permit the disposable platform hostname to resolve to the isolated Docker
 * network while retaining WordPress safe-HTTP checks for every other host.
 */

add_filter(
	'http_request_host_is_external',
	static function ( $external, $host, $url ) {
		if ( 'platform.example.test' !== strtolower( (string) $host ) ) {
			return $external;
		}
		$parts = wp_parse_url( (string) $url );
		if (
			! is_array( $parts )
			|| 'https' !== ( $parts['scheme'] ?? null )
			|| 'platform.example.test' !== strtolower( (string) ( $parts['host'] ?? '' ) )
			|| isset( $parts['user'] )
			|| isset( $parts['pass'] )
			|| isset( $parts['fragment'] )
			|| ( isset( $parts['port'] ) && 443 !== $parts['port'] )
		) {
			return $external;
		}
		return true;
	},
	10,
	3
);
