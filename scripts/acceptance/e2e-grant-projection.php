<?php
/** Acceptance-only reader. No application methods, writes or identity generation. */
function wepuu_e2e_read_mappings($db, array $connection, array $identity): array {
    $rows = $db->get_results($db->prepare(
        "SELECT option_name,option_value FROM {$db->options} WHERE option_name LIKE %s",
        $db->esc_like('wp_auto_connector_grant_') . '%'
    ), ARRAY_A);
    if ($db->last_error || !is_array($rows)) { throw new RuntimeException('MAPPING_READ_FAILED'); }
    $result = [];
    foreach ($rows as $row) {
        $v = @unserialize($row['option_value'], ['allowed_classes' => false]);
        if (!is_array($v) || ($v['version'] ?? null) !== '1' || !is_string($v['grant_id'] ?? null)
            || preg_match('/\A[A-Za-z0-9_-]{8,128}\z/D', $v['grant_id']) !== 1
            || !is_int($v['user_id'] ?? null) || $v['user_id'] < 1
            || !is_int($v['created_at'] ?? null) || $v['created_at'] < 0) {
            throw new RuntimeException('MAPPING_INVALID');
        }
        $exists = $db->get_var($db->prepare("SELECT count(*) FROM {$db->users} WHERE ID=%d", $v['user_id']));
        if ($db->last_error || !is_numeric($exists)) { throw new RuntimeException('USER_READ_FAILED'); }
        $result[] = [
            'grantIdSha256' => hash('sha256', $v['grant_id']),
            'optionNameMatches' => $row['option_name'] === 'wp_auto_connector_grant_' . hash('sha256', $v['grant_id']),
            'siteMatches' => isset($connection['site_id']) && ($v['site_id'] ?? null) === $connection['site_id'],
            'identityMatches' => isset($identity['kid']) && ($v['site_key_kid'] ?? null) === $identity['kid'],
            'clientMatches' => ($v['client_id'] ?? null) === 'wepuu-e2e-codex',
            'resourceMatches' => isset($connection['resource']) && ($v['resource'] ?? null) === $connection['resource'],
            'scopesMatch' => ($v['scopes'] ?? null) === ['mcp:read'],
            'userExists' => (int) $exists === 1,
            'localUserIdSha256' => hash('sha256', (string) $v['user_id'])
        ];
    }
    return $result;
}
