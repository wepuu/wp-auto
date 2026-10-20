<?php
require __DIR__ . '/e2e-grant-projection.php';
define('ARRAY_A', 'ARRAY_A');
final class SyntheticDatabase {
    public string $options='fixture_options'; public string $users='fixture_users';
    public string $last_error=''; public array $rows=[]; public int $userCount=1;
    public bool $failRead=false; public array $queries=[];
    public function esc_like($s) { return addcslashes($s, '_%\\'); }
    public function prepare($q, $v) { $this->queries[]=$q; return [$q,$v]; }
    public function get_results($q,$format) { if ($this->failRead) {$this->last_error='SECRET_SENTINEL';return null;} return $this->rows; }
    public function get_var($q) { return $this->userCount; }
}
$cases=0;
try {
    $record=['version'=>'1','grant_id'=>'grant_SYNTHETIC','user_id'=>7,'site_id'=>'site_SYNTHETIC','client_id'=>'wepuu-e2e-codex',
      'scopes'=>['mcp:read'],'resource'=>'https://site.example.test/wp-json/wp-auto/mcp','site_key_kid'=>'site_fixture_key','created_at'=>100];
    $db=new SyntheticDatabase();$c=['site_id'=>$record['site_id'],'resource'=>$record['resource']];$i=['kid'=>$record['site_key_kid']];
    if(wepuu_e2e_read_mappings($db,$c,$i)!==[]){throw new RuntimeException();}$cases++;
    $set=static function($v)use($db){$db->rows=[['option_name'=>'wp_auto_connector_grant_'.hash('sha256','grant_SYNTHETIC'),'option_value'=>serialize($v)]];};
    $set($record);$good=wepuu_e2e_read_mappings($db,$c,$i);
    foreach(['optionNameMatches','siteMatches','identityMatches','clientMatches','resourceMatches','scopesMatch','userExists'] as $k){if($good[0][$k]!==true){throw new RuntimeException();}}$cases++;
    foreach(['site_id'=>'wrong','site_key_kid'=>'wrong','client_id'=>'wrong','resource'=>'https://other.example.test/mcp','scopes'=>['mcp:content.write']] as $k=>$v){
        $set(array_replace($record,[$k=>$v]));$out=wepuu_e2e_read_mappings($db,$c,$i);if(!in_array(false,$out[0],true)){throw new RuntimeException();}$cases++;
    }
    foreach(['version'=>null,'grant_id'=>"bad'",'user_id'=>0,'created_at'=>'100'] as $k=>$v){
        $set(array_replace($record,[$k=>$v]));$threw=false;try{wepuu_e2e_read_mappings($db,$c,$i);}catch(Throwable){$threw=true;}if(!$threw){throw new RuntimeException();}$cases++;
    }
    $set($record);$db->userCount=0;if(wepuu_e2e_read_mappings($db,$c,$i)[0]['userExists']!==false){throw new RuntimeException();}$cases++;
    $db->rows[]=$db->rows[0];if(count(wepuu_e2e_read_mappings($db,$c,$i))!==2){throw new RuntimeException();}$cases++;
    $db->failRead=true;$threw=false;try{wepuu_e2e_read_mappings($db,$c,$i);}catch(Throwable){$threw=true;}if(!$threw){throw new RuntimeException();}$cases++;
    foreach($db->queries as $q){if(preg_match('/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP)\b/i',$q)){throw new RuntimeException();}}
    if(str_contains(json_encode($good),'grant_SYNTHETIC')||str_contains(json_encode($good),'SECRET_SENTINEL')){throw new RuntimeException();}$cases++;
    echo json_encode(['status'=>'SYNTHETIC_PHP_PROJECTION_PASS','passed'=>true,'cases'=>$cases,'php'=>PHP_VERSION,'noWordpressBootstrapped'=>true]),PHP_EOL;
}catch(Throwable){echo '{"status":"SYNTHETIC_PHP_PROJECTION_NOT_CONFIRMED","passed":false,"rawErrorSuppressed":true}',PHP_EOL;exit(1);}
