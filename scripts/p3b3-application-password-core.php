<?php
// One-shot operations through stdin in the existing Site B container; never installed.
ini_set('display_errors', '0');
$p3b3_action = $argv[1] ?? '';
$p3b3_run = $argv[2] ?? '';
if (!in_array($p3b3_action, array('preflight', 'create', 'ambient', 'cleanup'), true)
    || !preg_match('/^[a-f0-9-]{36}$/D', $p3b3_run)) { exit(2); }
$_SERVER['HTTPS'] = 'on';
$_SERVER['HTTP_HOST'] = 'test2.wpauto.cc';
require '/var/www/html/wp-load.php';
// Core default-filters.php uses then unsets global $action during bootstrap.
// Restore our validated inputs only after bootstrap; never route on Core globals.
$action = $p3b3_action;
$run = $p3b3_run;
$login = 'wepuu-p3b3-' . substr(str_replace('-', '', $run), 0, 16);
$name = 'WPAuto P3-B3 ' . $run;
function p3b3_checked($value) { if (is_wp_error($value) || false === $value) { throw new RuntimeException('core.operation_failed'); } return $value; }
try {
    if ($action === 'preflight') {
        if (get_user_by('login', $login)) { throw new RuntimeException('core.identity_conflict'); }
        echo wp_json_encode(array('supported' => wp_is_application_passwords_supported(),
            'subscribers' => count(get_users(array('role' => 'subscriber', 'fields' => 'ID')))));
    } elseif ($action === 'create') {
        if (get_user_by('login', $login) || !wp_is_application_passwords_supported()) { throw new RuntimeException('core.create_conflict'); }
        $id = p3b3_checked(wp_insert_user(array('user_login' => $login, 'user_pass' => wp_generate_password(48, true, true),
            'user_email' => $login . '@example.invalid', 'role' => 'subscriber')));
        p3b3_checked(update_user_meta($id, 'wepuu_p3b3_run', $run));
        $user = get_user_by('id', $id);
        if ($user->roles !== array('subscriber') || !user_can($user, 'read') || user_can($user, 'upload_files')
            || user_can($user, 'edit_posts') || !wp_is_application_passwords_available_for_user($user)) {
            throw new RuntimeException('core.capability_invalid');
        }
        $created = p3b3_checked(WP_Application_Passwords::create_new_application_password($id, array('name' => $name, 'app_id' => $run)));
        // Captured by the test parent in memory, never printed by the orchestrator.
        echo wp_json_encode(array('userId' => $id, 'login' => $login, 'password' => $created[0],
            'uuid' => $created[1]['uuid'], 'subscriber' => true));
    } else {
        $user = get_user_by('login', $login);
        if (!$user) { echo wp_json_encode(array('passwordRevoked' => true, 'userDeleted' => true)); exit; }
        if ($user->roles !== array('subscriber') || get_user_meta($user->ID, 'wepuu_p3b3_run', true) !== $run) {
            throw new RuntimeException('core.identity_conflict');
        }
        if ($action === 'ambient') {
            // New test identity only; no existing browser credential is read.
            wp_set_current_user($user->ID);
            $cookie = wp_generate_auth_cookie($user->ID, time() + 180, 'logged_in');
            $_COOKIE[LOGGED_IN_COOKIE] = $cookie;
            echo wp_json_encode(array('cookie' => LOGGED_IN_COOKIE . '=' . $cookie, 'nonce' => wp_create_nonce('wp_rest')));
        } else {
            foreach (WP_Application_Passwords::get_user_application_passwords($user->ID) as $item) {
                if (($item['app_id'] ?? '') !== $run || ($item['name'] ?? '') !== $name) { throw new RuntimeException('core.unowned_credential'); }
                p3b3_checked(WP_Application_Passwords::delete_application_password($user->ID, $item['uuid']));
            }
            if (WP_Application_Passwords::get_user_application_passwords($user->ID)) { throw new RuntimeException('core.cleanup_failed'); }
            global $wpdb;
            $posts = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_author=%d", $user->ID));
            $comments = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->comments} WHERE user_id=%d", $user->ID));
            $links = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->links} WHERE link_owner=%d", $user->ID));
            if ($posts || $comments || $links) { throw new RuntimeException('core.identity_has_dependencies'); }
            WP_Session_Tokens::get_instance($user->ID)->destroy_all();
            require_once ABSPATH . 'wp-admin/includes/user.php';
            p3b3_checked(wp_delete_user($user->ID));
            if (get_user_by('login', $login)) { throw new RuntimeException('core.cleanup_failed'); }
            echo wp_json_encode(array('passwordRevoked' => true, 'userDeleted' => true));
        }
    }
} catch (Throwable $e) {
    $allowed = array('core.operation_failed', 'core.identity_conflict', 'core.create_conflict',
        'core.capability_invalid', 'core.unowned_credential', 'core.cleanup_failed', 'core.identity_has_dependencies');
    echo wp_json_encode(array('error' => in_array($e->getMessage(), $allowed, true) ? $e->getMessage() : 'core.failed'));
    exit(1);
}
